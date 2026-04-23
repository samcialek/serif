"""Population and cohort priors on total (action, outcome) effects.

Architectural note — why totals, not per-edge slopes:

The v1 Bayesian layer (population_priors.py) fit priors on individual edge
slopes (bb, ba, theta) and combined them through the structural DAG. This
produced bimodal posteriors (see output/bayesian_diagnostic.md) because a
single absolute variance floor decoupled each prior from that edge's natural
slope magnitude — units drove contraction, not evidence.

This module fits priors directly on `scaled_effect` for each (action, outcome)
pair, which lives in the outcome's natural units and is what user observations
can actually identify. The structural edges remain the computational layer;
priors live at the input-output gateway of the engine.

Output: `output/total_effect_priors.json` keyed `{cohort}:{action}:{outcome}`
with mean, variance (2x-inflated), raw std, n, and percentiles.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np

from .transform import build_all_participants, build_observed_values
from .point_engine import (
    build_equations, topological_sort, compute_marginal_effects,
    MARGINAL_STEPS,
)
from .synthetic.config import BIOMARKER_PRIORS, WEARABLE_PRIORS
from .intervention_horizons import WEARABLE_HORIZONS, BIOMARKER_HORIZONS


# Short-horizon outcomes: wearable targets with fast taus (3-5 days).
SHORT_HORIZON_OUTCOMES = frozenset(WEARABLE_HORIZONS.keys())
# Long-horizon outcomes: biomarker targets from the horizons registry. Regime
# activation states (overreaching_state, etc.) remain excluded — they're
# internal DAG nodes, not user-facing outcomes, and have no horizon entry.
LONG_HORIZON_OUTCOMES = frozenset(BIOMARKER_HORIZONS.keys())
# Engine-produced but NEVER exported as user-facing outcomes. Regime states
# are aggregate activation signals surfaced via regime_activations, not as
# individual recommendations.
EXCLUDED_OUTCOMES = frozenset({
    "overreaching_state", "iron_deficiency_state",
    "sleep_deprivation_state", "inflammation_state",
})
# Union of everything that IS exported. Used as the filter inside
# _collect_effects and to derive SUPPORTED_PAIRS at export time.
SUPPORTED_OUTCOMES = SHORT_HORIZON_OUTCOMES | LONG_HORIZON_OUTCOMES

# Variance inflation on the empirical pooled scaled_effect distribution.
# Reflects concern that pooled engine output doesn't fully capture the
# individual variation we'll later layer user updates on top of.
VAR_INFLATION = 2.0

# Mean-scaled floor fraction: when the engine's output spread is narrower
# than `MEAN_SCALED_FRAC * |mean|`, use the mean-scaled term as the minimum
# prior SD. This captures "we could be wrong by this much" — a baseline
# uncertainty proportional to the effect magnitude. Only applied under
# floor_mode="mean_scaled"; the absolute mode keeps the pure 2x-inflated
# empirical variance.
MEAN_SCALED_FRAC = 0.4

VarianceFloorMode = str  # "absolute" | "mean_scaled"
DEFAULT_FLOOR_MODE: VarianceFloorMode = "mean_scaled"


@dataclass(frozen=True)
class TotalEffectPrior:
    """Normal prior on scaled_effect for one (cohort, action, outcome)."""
    cohort: str           # "__all__" is the full-population prior
    action: str
    outcome: str
    mean: float
    variance: float       # final variance after floor_mode applied
    raw_std: float        # empirical SD before inflation
    inflated_std: float   # sqrt(variance)
    n: int                # contributing participants
    p10: float
    p50: float
    p90: float
    nominal_step: float   # MARGINAL_STEPS[action]
    floor_mode: str = "absolute"   # "absolute" | "mean_scaled"
    floor_applied: bool = False    # whether the mean-scaled floor dominated
    mean_scaled_std: float = 0.0   # MEAN_SCALED_FRAC * |mean| (for diagnostics)
    # "synthetic" (DAG-fit), "weak_default" (Layer 0, zero-mean fallback for pairs
    # with no DAG path), or "synthetic+literature" (precision-pooled blend).
    provenance: str = "synthetic"


def _collect_effects(participants, equations, topo_order):
    """Run compute_marginal_effects on every participant.

    Returns {pid: {action: {outcome: scaled_effect}}}. Keeps any outcome in
    `SUPPORTED_OUTCOMES` (wearable + biomarker horizons). Regime states and
    other internal DAG nodes are dropped.
    """
    out: dict[int, dict[str, dict[str, float]]] = {}
    for state in participants:
        pid = int(state["pid"])
        observed = build_observed_values(state, use_baseline=False)
        marg = compute_marginal_effects(
            observed, equations=equations, topo_order=topo_order,
        )
        pid_out: dict[str, dict[str, float]] = {}
        for action, eff_dict in marg.items():
            kept: dict[str, float] = {}
            for outcome, ne in eff_dict.items():
                if outcome in EXCLUDED_OUTCOMES:
                    continue
                if outcome not in SUPPORTED_OUTCOMES:
                    continue
                kept[outcome] = float(ne.scaled_effect)
            if kept:
                pid_out[action] = kept
        out[pid] = pid_out
    return out


def supported_pairs_from_priors(
    priors: dict[tuple[str, str, str], "TotalEffectPrior"],
    nonzero_threshold: float = 1e-6,
) -> list[tuple[str, str]]:
    """Derive SUPPORTED_PAIRS from fitted priors.

    An (action, outcome) is supported when the population prior exists
    with |mean| above `nonzero_threshold` — filters out the zero-slope
    edges from engine_lessons #8 as well as DAG paths that cancel to zero.

    Weak-default (Layer 0) priors have mean=0 by construction; they pass
    through regardless of the threshold because user observations are what
    carry them — a missing Layer 0 entry here would drop the pair out of
    the user-OLS pipeline too.
    """
    supported: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for (cohort, action, outcome), p in priors.items():
        if cohort != "__all__":
            continue
        if outcome not in SUPPORTED_OUTCOMES:
            continue
        is_weak_default = getattr(p, "provenance", "synthetic") == "weak_default"
        if not is_weak_default and abs(p.mean) < nonzero_threshold:
            continue
        if (action, outcome) in seen:
            continue
        supported.append((action, outcome))
        seen.add((action, outcome))
    return sorted(supported)


def _fit_prior(
    values: list[float],
    cohort: str,
    action: str,
    outcome: str,
    nominal_step: float,
    floor_mode: VarianceFloorMode = DEFAULT_FLOOR_MODE,
) -> TotalEffectPrior:
    arr = np.asarray(values, dtype=float)
    mean = float(arr.mean())
    raw_var = float(arr.var(ddof=1)) if len(arr) > 1 else 0.0
    raw_std = float(np.sqrt(raw_var))
    inflated_var = raw_var * VAR_INFLATION
    mean_scaled_std = MEAN_SCALED_FRAC * abs(mean)
    mean_scaled_var = mean_scaled_std ** 2

    if floor_mode == "mean_scaled":
        variance = max(inflated_var, mean_scaled_var)
        floor_applied = mean_scaled_var > inflated_var
    else:
        variance = inflated_var
        floor_applied = False

    inflated_std = float(np.sqrt(variance))
    return TotalEffectPrior(
        cohort=cohort, action=action, outcome=outcome,
        mean=mean, variance=variance,
        raw_std=raw_std, inflated_std=inflated_std,
        n=len(arr),
        p10=float(np.quantile(arr, 0.1)),
        p50=float(np.quantile(arr, 0.5)),
        p90=float(np.quantile(arr, 0.9)),
        nominal_step=nominal_step,
        floor_mode=str(floor_mode),
        floor_applied=bool(floor_applied),
        mean_scaled_std=float(mean_scaled_std),
    )


def build_total_effect_priors(
    participants: list[dict],
    floor_mode: VarianceFloorMode = DEFAULT_FLOOR_MODE,
) -> dict[tuple[str, str, str], TotalEffectPrior]:
    """Fit {(cohort, action, outcome) -> Normal prior on scaled_effect}.

    cohort == '__all__' is the full-population prior. Per-cohort priors are
    fit on cohort members only. Pairs with <3 contributors are skipped.

    floor_mode controls prior variance:
      - "absolute":    variance = 2 * empirical_var (v2 behavior)
      - "mean_scaled": variance = max(2 * empirical_var, (0.4 * |mean|)^2)
    """
    if floor_mode not in ("absolute", "mean_scaled"):
        raise ValueError(f"floor_mode must be 'absolute' or 'mean_scaled', got {floor_mode}")

    equations = build_equations()
    topo_order = topological_sort(equations)

    pid_effects = _collect_effects(participants, equations, topo_order)

    # Re-index: (action, outcome) -> {pid: scaled_effect}
    ao_to_vals: dict[tuple[str, str], dict[int, float]] = {}
    for pid, a_dict in pid_effects.items():
        for action, o_dict in a_dict.items():
            for outcome, v in o_dict.items():
                ao_to_vals.setdefault((action, outcome), {})[pid] = v

    pid_cohort = {int(s["pid"]): str(s["cohort"]) for s in participants}
    cohorts = sorted(set(pid_cohort.values()))

    priors: dict[tuple[str, str, str], TotalEffectPrior] = {}
    for (action, outcome), pid_vals in ao_to_vals.items():
        nominal_step = float(MARGINAL_STEPS.get(action, 1.0))
        all_vals = list(pid_vals.values())
        if len(all_vals) < 3:
            continue

        priors[("__all__", action, outcome)] = _fit_prior(
            all_vals, "__all__", action, outcome, nominal_step,
            floor_mode=floor_mode,
        )

        for cohort in cohorts:
            cohort_vals = [v for pid, v in pid_vals.items() if pid_cohort[pid] == cohort]
            if len(cohort_vals) < 3:
                continue
            priors[(cohort, action, outcome)] = _fit_prior(
                cohort_vals, cohort, action, outcome, nominal_step,
                floor_mode=floor_mode,
            )

    return priors


def save_priors(priors: dict, out_path: Path) -> None:
    payload = {
        f"{cohort}:{action}:{outcome}": asdict(p)
        for (cohort, action, outcome), p in priors.items()
    }
    out_path.write_text(json.dumps(payload, indent=2))


def load_priors(in_path: Path) -> dict[tuple[str, str, str], TotalEffectPrior]:
    data = json.loads(in_path.read_text())
    out: dict[tuple[str, str, str], TotalEffectPrior] = {}
    for key, vals in data.items():
        cohort, action, outcome = key.split(":", 2)
        out[(cohort, action, outcome)] = TotalEffectPrior(**vals)
    return out


def main():
    ap = argparse.ArgumentParser(description="Build total-effect Bayesian priors")
    ap.add_argument("--data-dir", default="./output")
    ap.add_argument("--out", default="./output/total_effect_priors.json")
    ap.add_argument("--variance-floor-mode", choices=["absolute", "mean_scaled"],
                    default=DEFAULT_FLOOR_MODE,
                    help=f"Prior-variance floor rule (default: {DEFAULT_FLOOR_MODE})")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    out_path = Path(args.out)

    print(f"[priors] loading participants from {data_dir}...")
    t0 = time.time()
    participants = build_all_participants(data_dir)
    print(f"[priors] {len(participants)} participants loaded in {time.time()-t0:.1f}s")

    t1 = time.time()
    priors = build_total_effect_priors(participants, floor_mode=args.variance_floor_mode)
    print(f"[priors] fitted {len(priors)} priors in {time.time()-t1:.1f}s "
          f"(floor_mode={args.variance_floor_mode})")

    ao_keys = sorted({(a, o) for (_, a, o) in priors.keys()})
    print(f"[priors] {len(ao_keys)} distinct (action, outcome) pairs:")
    n_floored = 0
    for a, o in ao_keys:
        pop = priors.get(("__all__", a, o))
        if pop is None:
            continue
        if pop.floor_applied:
            n_floored += 1
        flag = "*floored*" if pop.floor_applied else ""
        print(
            f"  {a:18s} -> {o:18s}  "
            f"mean={pop.mean:+.4f}  raw_sd={pop.raw_std:.4f}  "
            f"final_sd={pop.inflated_std:.4f}  "
            f"p10/p50/p90={pop.p10:+.3f}/{pop.p50:+.3f}/{pop.p90:+.3f}  "
            f"n={pop.n} {flag}"
        )
    print(f"[priors] mean-scaled floor dominated on {n_floored}/{len(ao_keys)} pop priors")

    save_priors(priors, out_path)
    print(f"[priors] wrote {out_path}")


if __name__ == "__main__":
    main()
