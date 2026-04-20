"""End-to-end pipeline: synthetic data -> causal effects -> recommendations.

Usage:
    python -m serif_scm.run_pipeline [--data-dir ./output] [--participants 10] [--validate]

Modes:
    Default:   Generate recommendation reports for N participants
    --validate: Run validation (predicted vs actual Day 100 blood)
    --all:      Run all 1,188 participants (slow)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

from .transform import build_all_participants, build_observed_values
from .point_engine import (
    build_equations, topological_sort,
    compute_counterfactual, compute_marginal_effects,
)
from .reconcile import (
    generate_report, format_report,
    validate_participant, confidence_label, friendly,
)
from .synthetic.config import BIOMARKER_PRIORS


def run_validation(participants: list[dict], equations, topo_order, n: int = 50):
    """Validate engine predictions against actual Day 100 blood draws."""
    print(f"\n{'='*70}")
    print(f"VALIDATION: Engine-predicted vs actual Day 100 blood")
    print(f"Running on {n} participants...")
    print(f"{'='*70}")

    all_results: dict[str, list[dict]] = {}

    for i, p in enumerate(participants[:n]):
        results = validate_participant(p, equations, topo_order)
        for biomarker, vals in results.items():
            if biomarker not in all_results:
                all_results[biomarker] = []
            all_results[biomarker].append(vals)

        if (i + 1) % 10 == 0:
            print(f"  Validated {i+1}/{n}...")

    # Aggregate statistics
    print(f"\n{'Biomarker':<22s} {'N':>4s} {'Mean Actual':>12s} {'Mean Pred':>10s} "
          f"{'RMSE':>8s} {'Dir Acc':>8s} {'Corr':>6s}")
    print(f"{'-'*22} {'-'*4} {'-'*12} {'-'*10} {'-'*8} {'-'*8} {'-'*6}")

    key_markers = ["ferritin", "iron_total", "hemoglobin", "testosterone", "cortisol",
                   "triglycerides", "hdl", "ldl", "hscrp", "glucose", "insulin",
                   "vo2_peak", "rbc", "wbc", "body_fat_pct", "zinc", "magnesium_rbc"]

    summary_rows = []
    for biomarker in key_markers:
        vals = all_results.get(biomarker, [])
        if not vals:
            continue

        actual_deltas = [v["actual_delta"] for v in vals]
        predicted_deltas = [v["predicted_delta"] for v in vals]
        errors = [v["error"] for v in vals]
        dir_matches = [v["direction_match"] for v in vals]

        n_obs = len(vals)
        mean_actual = np.mean(actual_deltas)
        mean_pred = np.mean(predicted_deltas)
        rmse = np.sqrt(np.mean([e**2 for e in errors]))
        dir_acc = np.mean(dir_matches)

        # Correlation
        if np.std(actual_deltas) > 1e-6 and np.std(predicted_deltas) > 1e-6:
            corr = float(np.corrcoef(actual_deltas, predicted_deltas)[0, 1])
        else:
            corr = 0.0

        print(f"{biomarker:<22s} {n_obs:>4d} {mean_actual:>+12.2f} {mean_pred:>+10.2f} "
              f"{rmse:>8.2f} {dir_acc:>7.0%} {corr:>+6.2f}")

        summary_rows.append({
            "biomarker": biomarker, "n": n_obs,
            "mean_actual": mean_actual, "mean_pred": mean_pred,
            "rmse": rmse, "dir_acc": dir_acc, "corr": corr,
        })

    # Overall stats
    all_dir_acc = np.mean([r["dir_acc"] for r in summary_rows])
    all_corr = np.mean([r["corr"] for r in summary_rows])
    print(f"\n  Overall directional accuracy: {all_dir_acc:.0%}")
    print(f"  Overall mean correlation: {all_corr:+.2f}")

    return summary_rows


def run_reports(participants: list[dict], equations, topo_order, n: int = 5):
    """Generate recommendation reports for N participants."""
    print(f"\n{'='*70}")
    print(f"RECOMMENDATION REPORTS")
    print(f"Generating for {n} participants...")
    print(f"{'='*70}")

    for i, p in enumerate(participants[:n]):
        report = generate_report(p, equations, topo_order)
        print(format_report(report))
        print()


def run_summary(participants: list[dict], equations, topo_order, n: int = 100):
    """Population-level summary of what actions matter most."""
    print(f"\n{'='*70}")
    print(f"POPULATION ACTION SUMMARY (n={n})")
    print(f"{'='*70}")

    # Track which actions produce the largest effects per participant
    action_impact: dict[str, list[float]] = {}
    action_outcome_counts: dict[str, dict[str, int]] = {}

    for i, p in enumerate(participants[:n]):
        if (i + 1) % 25 == 0:
            print(f"  Analyzing participant {i+1}/{n}...")

        observed = build_observed_values(p)
        all_marginal = compute_marginal_effects(observed, equations, topo_order)

        for action_node, effects in all_marginal.items():
            if action_node not in action_impact:
                action_impact[action_node] = []
                action_outcome_counts[action_node] = {}

            total_abs_effect = sum(abs(e.scaled_effect) for e in effects.values())
            action_impact[action_node].append(total_abs_effect)

            for target_node in effects:
                action_outcome_counts[action_node][target_node] = (
                    action_outcome_counts[action_node].get(target_node, 0) + 1
                )

    # Report
    print(f"\n{'Action':<25s} {'Mean Impact':>12s} {'Median':>10s} {'Outcomes':>10s}")
    print(f"{'-'*25} {'-'*12} {'-'*10} {'-'*10}")

    sorted_actions = sorted(
        action_impact.items(),
        key=lambda x: np.mean(x[1]),
        reverse=True,
    )

    for action, impacts in sorted_actions:
        n_outcomes = len(action_outcome_counts[action])
        print(f"{friendly(action):<25s} {np.mean(impacts):>12.2f} {np.median(impacts):>10.2f} {n_outcomes:>10d}")

    # Top 3 most commonly affected outcomes per action
    print(f"\nTop outcomes per action:")
    for action, _ in sorted_actions:
        outcomes = sorted(
            action_outcome_counts[action].items(),
            key=lambda x: x[1],
            reverse=True,
        )[:3]
        outcome_str = ", ".join(f"{friendly(o)} ({c}/{n})" for o, c in outcomes)
        print(f"  {friendly(action)}: {outcome_str}")


def main():
    parser = argparse.ArgumentParser(description="Serif SCM pipeline")
    parser.add_argument("--data-dir", default="./output", help="Path to synthetic CSV directory")
    parser.add_argument("--participants", "-n", type=int, default=5, help="Number of participants to process")
    parser.add_argument("--validate", action="store_true", help="Run validation mode")
    parser.add_argument("--summary", action="store_true", help="Run population-level summary")
    parser.add_argument("--all", action="store_true", help="Run all 1,188 participants")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"Error: data directory {data_dir} not found. Run the synthetic generator first.")
        sys.exit(1)

    n = 1188 if args.all else args.participants

    # Load and transform data
    print("Loading synthetic data...")
    participants = build_all_participants(data_dir)
    print(f"Loaded {len(participants)} participants")

    # Build engine
    print("Building SCM equations...")
    equations = build_equations()
    topo_order = topological_sort(equations)
    print(f"  {len(equations)} structural equations")
    print(f"  {len(topo_order)} nodes in topological order")

    if args.validate:
        run_validation(participants, equations, topo_order, n=min(n, len(participants)))
    elif args.summary:
        run_summary(participants, equations, topo_order, n=min(n, len(participants)))
    else:
        run_reports(participants, equations, topo_order, n=min(n, len(participants)))


if __name__ == "__main__":
    main()
