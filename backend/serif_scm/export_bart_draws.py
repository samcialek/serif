"""Orchestrator: fit per-outcome BART surfaces and export posterior draws.

Runs BART on every outcome node in the Serif DAG that has >=2 parents and
enough participants with non-missing joint observations, and writes K
posterior-predictive draws per outcome to `output/bart_draws/{outcome}.npz`.

Outcomes with a single parent are skipped — the existing piecewise-linear
fit (`edgeSummaryRaw.json`) already captures everything a one-parent BART
would add, and the Twin can fall back to that fit with no fidelity loss.

Usage:
    python -m serif_scm.export_bart_draws \\
        --data-dir ./output \\
        --bart-dir ./output/bart_draws \\
        --n-draws 1500 --n-chains 2 --n-tune 500

For debugging / CI, pass `--outcomes hrv_daily` to fit a single outcome
and `--n-draws 200 --n-tune 200` to skip the expensive warm-up.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

from .bart_fit import BartPosteriorDraws, fit_node_bart
from .point_engine import Equation, build_equations, build_equations_by_target
from .transform import build_all_participants


# ── Regime-latent → observable-driver substitution ─────────────────
#
# The current DAG routes several biomarker outcomes through intermediate
# regime latents (e.g., cortisol ← overreaching_state ← acwr, where the
# first arrow is a sigmoid gate). These latents are not observed in the
# cohort data, so a strict parent-set read would drop every row.
#
# BART's whole point on the Twin surface is to learn the regime
# non-linearity *from* the observed driver, without the sigmoid gate.
# So we rewrite regime-state parents to their upstream observable
# driver before fitting. The driver alone carries all the information
# that the {driver → regime-state → outcome} chain ever did.
REGIME_TO_DRIVER: dict[str, str] = {
    "overreaching_state":      "acwr",
    "iron_deficiency_state":   "ferritin",
    "sleep_deprivation_state": "sleep_debt",
    "inflammation_state":      "hscrp",
}


# ── Backdoor confounders per outcome ───────────────────────────────
#
# Mirrors the `edgeType: 'confounds'` entries in
# `src/data/dataValue/mechanismCatalog.ts` (14 edges at time of writing).
# Including these in BART's `parent_names` lets the surface condition on
# the confounder alongside the causal parent, so the do-side evaluation
# at MC time is closer to the causal effect rather than the observational
# conditional expectation.
#
# Motivating example: testosterone has `season` + `vitamin_d` as observed
# confounders. Without them in `parent_names`, BART's `do(acwr=1.5)`
# surface flipped sign versus the piecewise causal estimate because the
# fit was picking up the seasonal co-movement of training load and
# androgen rhythm. With them in `parent_names`, the MC loop holds
# confounders at observed values (they're non-descendants of the
# intervention, so `readParent` falls back to `observedValues` in
# `bartMonteCarlo.ts`) and BART returns the partial effect of acwr
# conditional on season + vitamin_d.
#
# Only `confounds` edges are listed here — `causal` edges already enter
# via the SCM equations and are picked up by `discover_fit_targets`.
CONFOUNDERS_BY_OUTCOME: dict[str, list[str]] = {
    "training_volume":  ["season", "location", "is_weekend"],
    "vitamin_d":        ["season"],
    "testosterone":     ["season", "vitamin_d"],
    "sleep_duration":   ["season", "is_weekend"],
    "sleep_quality":    ["location", "travel_load"],
    "hrv_daily":        ["travel_load"],
    "resting_hr":       ["travel_load"],
    "bedtime":          ["is_weekend"],
    "omega3_index":     ["season"],
}


def add_confounders(
    outcome: str,
    parents: list[str],
    *,
    enabled: bool,
) -> list[str]:
    """Union observable confounders into the parent list for an outcome.

    Order-preserving: existing parents come first (alphabetical from
    `discover_fit_targets`), confounders appended in catalogue order.
    De-duplicates if a confounder is already a DAG-causal parent.
    """
    if not enabled:
        return parents
    confounders = CONFOUNDERS_BY_OUTCOME.get(outcome, [])
    if not confounders:
        return parents
    seen = set(parents)
    combined = list(parents)
    for c in confounders:
        if c not in seen:
            combined.append(c)
            seen.add(c)
    return combined


def substitute_regime_parents(parents: list[str]) -> list[str]:
    """Swap regime-latent parents for their observable drivers. De-dup.

    Order is preserved except for duplicates removed after swap — so the
    stable sort guarantee of `discover_fit_targets` still holds as long
    as callers sort the result, which they do.
    """
    substituted = [REGIME_TO_DRIVER.get(p, p) for p in parents]
    # Preserve first-occurrence order while de-duping
    seen: set[str] = set()
    unique: list[str] = []
    for p in substituted:
        if p not in seen:
            seen.add(p)
            unique.append(p)
    return unique


# ── Flatten participant state to current (post-intervention) values ─


# Node-ID aliases — DAG edge sources use one name, participant state uses
# another. Resolved at the boundary (not in transform.py) to avoid rippling
# into the reconcile/export pipeline.
NODE_ALIASES: dict[str, str] = {
    "training_consistency": "consistency",
}


def build_outcome_values(state: dict) -> dict[str, float]:
    """Current values across blood/behavioural/derived/wearable nodes.

    Unlike `transform.build_observed_values`, which anchors blood to Day 1
    for abduction, this flattener uses `current_blood` (Day 100). BART fits
    the *response* surface y = f(parents) at evaluation time, so both sides
    of the equation come from the same timepoint.

    DAG-name aliases (e.g., `training_consistency` → `consistency`) are
    resolved here so callers can look up by the edge-source ID directly.
    """
    obs: dict[str, float] = {}
    obs.update(state.get("current_blood", {}))
    obs.update(state.get("behavioral_state", {}))
    obs.update(state.get("derived", {}))
    obs.update(state.get("wearable_state", {}))
    for dag_name, state_name in NODE_ALIASES.items():
        if state_name in obs and dag_name not in obs:
            obs[dag_name] = obs[state_name]
    return obs


# ── Outcome / parent discovery ─────────────────────────────────────


def observable_parent_names(participants: list[dict]) -> set[str]:
    """Parent names that appear in at least one participant's observed state.

    DAG edges can reference sources the synthetic generator never emits
    (e.g., `travel_load`, `workout_time` — in feasibility config but not
    the lifestyle CSV). Dropping them at the boundary is safer than
    dropping every row they appear on.
    """
    keys: set[str] = set()
    for state in participants:
        keys.update(build_outcome_values(state).keys())
    return keys


def discover_fit_targets(
    equations: list[Equation],
    *,
    min_parents: int,
    observable: set[str] | None = None,
    include_confounders: bool = True,
) -> dict[str, list[str]]:
    """Map outcome → ordered parent list, filtered to nodes with >=min_parents.

    Parent order is stable (sorted) so that the exported `parent_names` and
    `parent_grid` match what the TS MC loop will expect at read time.

    If `observable` is provided, parent names not in that set are dropped
    with a silent skip — they leave the DAG edge unrepresented in BART,
    and the Twin should fall back to the piecewise-linear fit for that
    edge.

    When `include_confounders=True` (default), observable confounders from
    `CONFOUNDERS_BY_OUTCOME` are unioned into the parent list so BART can
    condition on them. The observability filter still applies — missing
    confounders are dropped silently.
    """
    by_target = build_equations_by_target(equations)
    targets: dict[str, list[str]] = {}
    for outcome, edges in by_target.items():
        raw_parents = sorted({eq.source for eq in edges})
        # Rewrite regime latents -> observable drivers, then re-sort for
        # stable column ordering on export / TS read.
        parents = sorted(substitute_regime_parents(raw_parents))
        # Skip self-loops introduced by the swap (e.g. hscrp ← inflammation_state
        # rewrites to hscrp ← hscrp).
        parents = [p for p in parents if p != outcome]
        # Append observable backdoor confounders if requested.
        parents = add_confounders(outcome, parents, enabled=include_confounders)
        if observable is not None:
            parents = [p for p in parents if p in observable]
        if len(parents) >= min_parents:
            targets[outcome] = parents
    return targets


# ── Assemble (X, y) matrix from participants ───────────────────────


def assemble_matrix(
    participants: list[dict],
    outcome: str,
    parent_names: list[str],
) -> tuple[np.ndarray, np.ndarray, int]:
    """Build (X, y) for one outcome from the cohort, dropping incomplete rows.

    Returns
    -------
    X : ndarray, shape (n_valid, n_parents)
    y : ndarray, shape (n_valid,)
    n_dropped : int
        Number of participants skipped because at least one parent or the
        outcome itself was missing. Reported for provenance.
    """
    rows_x: list[list[float]] = []
    rows_y: list[float] = []
    n_dropped = 0

    for state in participants:
        vals = build_outcome_values(state)
        y_val = vals.get(outcome)
        if y_val is None or not np.isfinite(y_val):
            n_dropped += 1
            continue
        parent_row = [vals.get(p) for p in parent_names]
        if any(v is None or not np.isfinite(v) for v in parent_row):
            n_dropped += 1
            continue
        rows_x.append([float(v) for v in parent_row])
        rows_y.append(float(y_val))

    X = np.asarray(rows_x, dtype=float) if rows_x else np.zeros((0, len(parent_names)))
    y = np.asarray(rows_y, dtype=float)
    return X, y, n_dropped


# ── Main export loop ───────────────────────────────────────────────


def audit_outcomes(
    participants: list[dict],
    equations: list[Equation],
    *,
    min_parents: int = 2,
    outcomes: list[str] | None = None,
    include_confounders: bool = True,
) -> dict[str, dict]:
    """Report (X, y) shapes per outcome without fitting. Cheap sanity check.

    Use before the expensive MCMC sweep to confirm every outcome has
    enough complete rows post regime-latent substitution.
    """
    observable = observable_parent_names(participants)
    targets = discover_fit_targets(
        equations,
        min_parents=min_parents,
        observable=observable,
        include_confounders=include_confounders,
    )
    if outcomes is not None:
        targets = {o: targets[o] for o in outcomes if o in targets}

    report: dict[str, dict] = {}
    print(f"{'outcome':<22s} {'n_valid':>8s} {'n_drop':>7s} {'parents':>8s}  parent_names")
    print("-" * 88)
    for outcome, parent_names in sorted(targets.items()):
        X, y, n_dropped = assemble_matrix(participants, outcome, parent_names)
        n_valid = X.shape[0]
        y_range = (float(y.min()), float(y.max())) if n_valid else (float("nan"), float("nan"))
        report[outcome] = {
            "n_valid": n_valid,
            "n_dropped": n_dropped,
            "parent_names": parent_names,
            "y_min": y_range[0],
            "y_max": y_range[1],
            "y_mean": float(y.mean()) if n_valid else float("nan"),
        }
        print(f"{outcome:<22s} {n_valid:>8d} {n_dropped:>7d} {len(parent_names):>8d}  {parent_names}")
    return report


def export_all_outcomes(
    participants: list[dict],
    equations: list[Equation],
    output_dir: Path,
    *,
    min_parents: int = 2,
    min_participants: int = 50,
    n_draws: int = 1500,
    n_chains: int = 2,
    n_tune: int = 500,
    n_trees: int = 50,
    outcomes: list[str] | None = None,
    seed: int = 42,
    include_confounders: bool = True,
) -> dict[str, dict]:
    """Fit BART per outcome node and write draws. Returns manifest dict."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    observable = observable_parent_names(participants)
    targets = discover_fit_targets(
        equations,
        min_parents=min_parents,
        observable=observable,
        include_confounders=include_confounders,
    )
    if outcomes is not None:
        targets = {o: targets[o] for o in outcomes if o in targets}
        missing = [o for o in outcomes if o not in targets]
        if missing:
            print(f"  WARNING: outcomes without >={min_parents} parents, skipping: {missing}")

    print(f"  Outcomes to fit: {len(targets)} (>= {min_parents} parents)")

    manifest: dict[str, dict] = {}

    for i, (outcome, parent_names) in enumerate(sorted(targets.items()), 1):
        X, y, n_dropped = assemble_matrix(participants, outcome, parent_names)
        n_valid = X.shape[0]
        print(f"\n[{i}/{len(targets)}] {outcome}: n={n_valid} "
              f"(dropped {n_dropped}), {len(parent_names)} parents")

        if n_valid < min_participants:
            print(f"  SKIP -- only {n_valid} valid rows (< {min_participants})")
            manifest[outcome] = {
                "status": "skipped_low_n",
                "n_valid": n_valid,
                "parent_names": parent_names,
            }
            continue

        t0 = time.time()
        try:
            draws = fit_node_bart(
                outcome=outcome,
                X=X,
                y=y,
                parent_names=parent_names,
                n_draws=n_draws,
                n_chains=n_chains,
                n_tune=n_tune,
                n_trees=n_trees,
                seed=seed,
            )
        except Exception as exc:  # noqa: BLE001 — surface fit failures per-outcome
            print(f"  FAILED: {type(exc).__name__}: {exc}")
            manifest[outcome] = {
                "status": "failed",
                "error": f"{type(exc).__name__}: {exc}",
                "n_valid": n_valid,
                "parent_names": parent_names,
            }
            continue

        elapsed = time.time() - t0
        out_path = output_dir / f"{outcome}.npz"
        draws.save_npz(out_path)

        manifest[outcome] = {
            "status": "ok",
            "path": out_path.name,
            "n_valid": n_valid,
            "n_dropped": n_dropped,
            "parent_names": parent_names,
            "n_draws": int(draws.n_draws),
            "n_grid": int(draws.n_grid),
            "data_mean": float(draws.data_mean),
            "elapsed_sec": round(elapsed, 1),
        }
        print(f"  OK -- K={draws.n_draws} draws x G={draws.n_grid} grid "
              f"in {elapsed:.1f}s -> {out_path.name}")

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"\nWrote manifest: {manifest_path}")

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Export BART posterior draws per outcome node")
    parser.add_argument("--data-dir", default="./output",
                        help="Directory with synthetic CSVs (blood_draws, wearables_daily, ...)")
    parser.add_argument("--bart-dir", default="./output/bart_draws",
                        help="Output directory for {outcome}.npz + manifest.json")
    parser.add_argument("--outcomes", nargs="*", default=None,
                        help="Subset of outcome node IDs to fit (default: all eligible)")
    parser.add_argument("--min-parents", type=int, default=2)
    parser.add_argument("--min-participants", type=int, default=50)
    parser.add_argument("--n-draws", type=int, default=1500)
    parser.add_argument("--n-chains", type=int, default=2)
    parser.add_argument("--n-tune", type=int, default=500)
    parser.add_argument("--n-trees", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true",
                        help="Audit (X, y) shapes per outcome; no MCMC.")
    parser.add_argument("--no-confounders", action="store_true",
                        help="Skip backdoor-confounder inclusion "
                             "(observational fit only). Default: include.")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"Error: data directory {data_dir} not found. Run the synthetic generator first.")
        sys.exit(1)

    print("Loading synthetic data...")
    participants = build_all_participants(data_dir)
    print(f"  {len(participants)} participants")

    print("Building SCM equations...")
    equations = build_equations()
    print(f"  {len(equations)} structural equations")

    include_confounders = not args.no_confounders

    if args.dry_run:
        audit_outcomes(
            participants,
            equations,
            min_parents=args.min_parents,
            outcomes=args.outcomes,
            include_confounders=include_confounders,
        )
        return

    export_all_outcomes(
        participants,
        equations,
        output_dir=Path(args.bart_dir),
        min_parents=args.min_parents,
        min_participants=args.min_participants,
        n_draws=args.n_draws,
        n_chains=args.n_chains,
        n_tune=args.n_tune,
        n_trees=args.n_trees,
        outcomes=args.outcomes,
        seed=args.seed,
        include_confounders=include_confounders,
    )


if __name__ == "__main__":
    main()
