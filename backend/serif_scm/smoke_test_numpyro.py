"""Minimal NumPyro smoke test: wearable sub-DAG, single participant.

Exercises the per-node sigma fix in model.py without any identifiability
landmines (no blood, no regimes, all variables directly observable over
100 days).

Sub-DAG (4 edges, 7 nodes):
    bedtime        -> sleep_quality     (v_max)
    bedtime        -> deep_sleep        (v_max)
    sleep_duration -> hrv_daily         (linear)
    steps          -> sleep_efficiency  (linear)

Reports R-hat, divergences, and posterior means for sigma parameters
so we can sanity-check against measurement-model defaults.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import jax
import jax.numpy as jnp
import numpyro
import numpyro.distributions as dist
import pandas as pd
from numpyro.infer import MCMC, NUTS

from serif_scm.model import serif_scm


# ── Sub-DAG definition ──────────────────────────────────────────────

SUB_DAG_EDGES = [
    # (source, target, curve_type_for_model)
    ("bedtime", "sleep_quality", "piecewise"),
    ("bedtime", "deep_sleep", "piecewise"),
    ("sleep_duration", "hrv_daily", "piecewise"),
    ("steps", "sleep_efficiency", "piecewise"),
]

# Match the TS engine (doseResponse.ts:buildEquationsFromEdges) — drop any
# edge whose population-prior slopes both round to zero. Fitting such an
# edge adds a theta parameter with no likelihood signal, which is the
# R-hat = 2.13 case we saw on steps->sleep_efficiency.
PRUNE_THRESHOLD = 1e-6

# CSV column -> node name (for loading observed data)
LIFESTYLE_COL_TO_NODE = {
    "bedtime_hr": "bedtime",
    "sleep_hrs": "sleep_duration",
}
WEARABLE_COL_TO_NODE = {
    "steps": "steps",
    "sleep_quality": "sleep_quality",
    "deep_sleep": "deep_sleep",
    "hrv_daily": "hrv_daily",
    "sleep_efficiency": "sleep_efficiency",
}


def load_observed(pid: int, backend_dir: Path) -> dict[str, jnp.ndarray]:
    """Load one participant's 100-day wearable + lifestyle series.

    Inner-joins on day — adherence gaps in lifestyle_app drop days.
    """
    w = pd.read_csv(backend_dir / "output" / "wearables_daily.csv")
    l = pd.read_csv(backend_dir / "output" / "lifestyle_app.csv")
    w = w[w.participant_id == pid]
    l = l[l.participant_id == pid]

    # Drop colliding cols from one side before merge so downstream lookup
    # is unambiguous. We keep steps + sleep_hrs from wearable (device-measured).
    l = l.drop(columns=["steps", "sleep_hrs"])
    merged = l.merge(w, on=["participant_id", "day"], how="inner")

    # Drop days where any node used in the sub-DAG is NaN — wearables have
    # ~8% missing sensor days per participant.
    needed_cols = ["bedtime_hr", "sleep_hrs", "steps",
                   "sleep_quality", "deep_sleep", "hrv_daily", "sleep_efficiency"]
    merged = merged.dropna(subset=needed_cols)

    observed: dict[str, jnp.ndarray] = {}
    observed["sleep_duration"] = jnp.asarray(merged["sleep_hrs"].to_numpy(dtype="float32"))
    observed["bedtime"] = jnp.asarray(merged["bedtime_hr"].to_numpy(dtype="float32"))
    for col, node in WEARABLE_COL_TO_NODE.items():
        observed[node] = jnp.asarray(merged[col].to_numpy(dtype="float32"))

    return observed, len(merged)


def load_priors_and_filter(
    backend_dir: Path,
) -> tuple[dict[str, dict], list[tuple[str, str, str]]]:
    """Load population_priors.json, prune zero-slope edges, log what was dropped.

    Returns (priors_by_edge_key, active_edges) where active_edges is a
    filtered copy of SUB_DAG_EDGES. Pruning rule mirrors doseResponse.ts —
    if max(|mean_bb|, |mean_ba|) < PRUNE_THRESHOLD in the population prior,
    the edge carries no causal signal and is dropped from the model.
    """
    with open(backend_dir / "output" / "population_priors.json") as f:
        raw = json.load(f)

    priors: dict[str, dict] = {}
    active: list[tuple[str, str, str]] = []
    pruned: list[tuple[str, str, float]] = []

    for (src, tgt, curve) in SUB_DAG_EDGES:
        v = raw[f"{src}|{tgt}"]
        max_slope = max(abs(float(v["mean_slope_bb"])), abs(float(v["mean_slope_ba"])))
        if max_slope < PRUNE_THRESHOLD:
            pruned.append((src, tgt, max_slope))
            continue
        active.append((src, tgt, curve))
        priors[f"{src}__{tgt}"] = {
            "pop_bb": float(v["mean_slope_bb"]),
            "pop_bb_scale": float(math.sqrt(max(v["var_slope_bb"], 1e-8))),
            "pop_ba": float(v["mean_slope_ba"]),
            "pop_ba_scale": float(math.sqrt(max(v["var_slope_ba"], 1e-8))),
            "pop_theta": float(v["mean_theta"]),
            "pop_theta_scale": float(math.sqrt(max(v["var_theta"], 1e-8))),
            "sigma_p_scale": 1.0,
        }

    if pruned:
        print(f"[smoke] Pruned {len(pruned)} zero-slope edge(s) "
              f"(threshold max(|bb|,|ba|) < {PRUNE_THRESHOLD:.0e}):")
        for src, tgt, s in pruned:
            print(f"  {src:18s} -> {tgt:18s}  max(|bb|,|ba|)={s:.2e}")
    print(f"[smoke] {len(active)} active edge(s) retained")

    return priors, active


def build_parent_edges(active_edges: list[tuple[str, str, str]]) -> dict[str, list[dict]]:
    """Translate active edges -> model's parent_edges shape."""
    parent_edges: dict[str, list[dict]] = {}
    for (src, tgt, curve) in active_edges:
        parent_edges.setdefault(tgt, []).append({
            "source": src,
            "edge_key": f"{src}__{tgt}",
            "curve_type": curve,
        })
    return parent_edges


# Full source-before-target ordering over every node the smoke test might
# touch. topo_order_for_active() filters this to the nodes actually in
# the active sub-DAG after pruning.
_FULL_TOPO = [
    "bedtime", "sleep_duration", "steps",
    "sleep_quality", "deep_sleep", "hrv_daily", "sleep_efficiency",
]


def active_nodes_from_edges(active_edges: list[tuple[str, str, str]]) -> set[str]:
    nodes: set[str] = set()
    for (src, tgt, _) in active_edges:
        nodes.add(src)
        nodes.add(tgt)
    return nodes


def topo_order_for_active(active_nodes: set[str]) -> list[str]:
    return [n for n in _FULL_TOPO if n in active_nodes]


# ── Main ────────────────────────────────────────────────────────────

def main():
    backend_dir = Path(__file__).resolve().parent.parent
    pid = 1

    print(f"[smoke] JAX devices: {jax.devices()}")
    print(f"[smoke] Loading participant {pid} data...")
    observed, n_days = load_observed(pid, backend_dir)
    print(f"[smoke] {n_days} days after inner-join")
    for node, arr in observed.items():
        print(f"  {node:20s} n={len(arr):3d}  mean={float(arr.mean()):10.3f}  std={float(arr.std()):7.3f}")

    print(f"[smoke] Loading population priors for sub-DAG...")
    pop_priors, active_edges = load_priors_and_filter(backend_dir)
    parent_edges = build_parent_edges(active_edges)
    nodes = active_nodes_from_edges(active_edges)
    topo = topo_order_for_active(nodes)

    # Drop observed series for nodes that the pruning removed — they're no
    # longer part of the likelihood.
    observed = {k: v for k, v in observed.items() if k in nodes}

    # Empirical per-node means: used as intercepts + to center parent values.
    # Pre-computed once so they stay fixed across MCMC (not a learnable param).
    data_means = {node: float(arr.mean()) for node, arr in observed.items()}
    print(f"[smoke] data_means (centering constants):")
    for node, m in data_means.items():
        print(f"  {node:20s} {m:10.3f}")

    # Sanity: every observed node is in topo
    for node in observed:
        assert node in topo, f"observed node {node} missing from topo"

    print(f"[smoke] Running MCMC: 1 chain, 500 warmup, 500 samples")
    kernel = NUTS(serif_scm)
    mcmc = MCMC(kernel, num_warmup=500, num_samples=500, num_chains=1, progress_bar=True)
    rng_key = jax.random.PRNGKey(0)
    t0 = time.time()
    mcmc.run(
        rng_key,
        topo_order=topo,
        parent_edges=parent_edges,
        observed_data=observed,
        pop_priors=pop_priors,
        data_means=data_means,
        extra_fields=("diverging",),
    )
    elapsed = time.time() - t0
    print(f"[smoke] MCMC took {elapsed:.1f}s")

    # Full summary
    mcmc.print_summary(exclude_deterministic=False)

    # Extra: pull out diagnostics by hand so we can report succinctly
    samples = mcmc.get_samples(group_by_chain=True)
    extra = mcmc.get_extra_fields()
    divergences = int(extra["diverging"].sum()) if "diverging" in extra else None
    print(f"\n[smoke] divergences: {divergences}")

    # NumPyro's print_summary already shows r_hat — but grab the worst
    print(f"[smoke] done.")


if __name__ == "__main__":
    main()
