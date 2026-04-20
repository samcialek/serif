"""One-shot patcher: add `regime_activations` + `release_schedule` to every
participant JSON in `output/portal_bayesian/`, and update the manifest with
release-count summary stats.

Regime activations are computed from each participant's current acwr,
ferritin, sleep_debt, and hscrp using `reconcile.compute_regime_activations`
(the same sigmoid that feeds the downstream TS engine).

Usage:
    python -m serif_scm.add_release_schedule
    python -m serif_scm.add_release_schedule --data-dir ./output --out ./output/portal_bayesian
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

import pandas as pd

from .reconcile import compute_regime_activations
from .transform import compute_acwr, compute_sleep_debt
from .scheduler import (
    compute_release_schedule,
    releases_to_dicts,
    release_count_warnings,
    release_count_distribution,
    RELEASE_COUNT_LOWER,
    RELEASE_COUNT_UPPER,
)


def _build_regime_inputs(
    pid: int,
    blood_df: pd.DataFrame,
    lifestyle_df: pd.DataFrame,
    eval_day: int = 100,
) -> dict[str, float]:
    """Extract just the four inputs needed for regime activations."""
    p_blood = blood_df[blood_df["participant_id"] == pid]
    day_n = p_blood[p_blood["draw_day"] == eval_day]
    if len(day_n) == 0:
        day_n = p_blood.iloc[[-1]]
    row = day_n.iloc[0]
    ferritin = float(row["ferritin"]) if "ferritin" in row.index else 0.0
    hscrp = float(row["hscrp"]) if "hscrp" in row.index else 0.0

    p_life = lifestyle_df[lifestyle_df["participant_id"] == pid].sort_values("day")
    daily = pd.DataFrame({"day": range(1, eval_day + 1)})
    daily = daily.merge(p_life[["day", "training_min", "sleep_hrs"]], on="day", how="left")
    daily = daily.ffill().bfill()

    training_loads = daily["training_min"].tolist()
    sleep_series = daily["sleep_hrs"].tolist()
    acwr = compute_acwr(training_loads, eval_day - 1)
    sleep_debt = compute_sleep_debt(sleep_series, eval_day - 1)

    return {
        "acwr": acwr,
        "ferritin": ferritin,
        "sleep_debt": sleep_debt,
        "hscrp": hscrp,
    }


def main():
    ap = argparse.ArgumentParser(description="Add release_schedule to Bayesian portal JSONs")
    ap.add_argument("--data-dir", default="./output")
    ap.add_argument("--out", default="./output/portal_bayesian")
    ap.add_argument("--eval-day", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true",
                    help="Compute and summarize without writing files")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out)

    print(f"[sched] loading CSVs from {data_dir}...")
    blood_df = pd.read_csv(data_dir / "blood_draws.csv")
    lifestyle_df = pd.read_csv(data_dir / "lifestyle_app.csv")

    jsons = sorted(out_dir.glob("participant_*.json"))
    print(f"[sched] found {len(jsons)} participant JSONs")

    t0 = time.time()
    release_counts: list[int] = []
    active_regime_counts: dict[str, int] = {}
    framing_counts: dict[str, int] = {}
    first_release_days: list[int] = []
    participants_with_zero: int = 0

    for i, jpath in enumerate(jsons):
        record = json.loads(jpath.read_text())
        pid = int(record["pid"])

        regime_inputs = _build_regime_inputs(
            pid, blood_df, lifestyle_df, eval_day=args.eval_day,
        )
        regime_activations = compute_regime_activations(regime_inputs)

        for regime, act in regime_activations.items():
            if act >= 0.5:
                active_regime_counts[regime] = active_regime_counts.get(regime, 0) + 1

        protocols = record.get("protocols", [])
        releases = compute_release_schedule(protocols, regime_activations=regime_activations)
        schedule = releases_to_dicts(releases)

        for r in schedule:
            framing_counts[r["framing"]] = framing_counts.get(r["framing"], 0) + 1

        release_counts.append(len(schedule))
        if schedule:
            first_release_days.append(schedule[0]["day"])
        else:
            participants_with_zero += 1

        record["regime_activations"] = regime_activations
        record["release_schedule"] = schedule

        if not args.dry_run:
            jpath.write_text(json.dumps(record, indent=2, default=float))

        if (i + 1) % 200 == 0:
            print(f"  ...{i+1}/{len(jsons)} ({time.time()-t0:.1f}s)")

    elapsed = time.time() - t0
    total_releases = sum(release_counts)
    mean = statistics.mean(release_counts) if release_counts else 0.0

    def pct(xs: list[int], q: float) -> int | None:
        s = sorted(xs)
        return s[min(int(q * len(s)), len(s) - 1)] if s else None

    distribution = release_count_distribution(release_counts)
    warnings = release_count_warnings(
        release_counts, lower=RELEASE_COUNT_LOWER, upper=RELEASE_COUNT_UPPER,
    )

    print(f"\n[sched] processed {len(jsons)} files in {elapsed:.1f}s")
    print(f"[sched] total releases: {total_releases}")
    print(f"[sched] mean releases/participant: {mean:.2f}")
    print(f"[sched] release count distribution (count -> #participants):")
    for k, v in distribution.items():
        print(f"         {k:>3}: {v}")
    print(f"[sched] p10/p50/p90 releases: {pct(release_counts, 0.1)}/"
          f"{pct(release_counts, 0.5)}/{pct(release_counts, 0.9)}")
    print(f"[sched] participants with 0 releases: {participants_with_zero}")
    if first_release_days:
        print(f"[sched] mean first-release day: "
              f"{statistics.mean(first_release_days):.1f} "
              f"(min {min(first_release_days)}, max {max(first_release_days)})")
    print(f"[sched] active-regime counts (activation >= 0.5): {active_regime_counts}")
    print(f"[sched] framing counts: {framing_counts}")

    if warnings:
        print(f"\n[sched] STOP CONDITION WARNINGS:")
        for w in warnings:
            print(f"  - {w}")
    else:
        print(f"\n[sched] no stop-condition warnings fired")

    # ── Manifest update ──
    manifest_path = out_dir / "manifest.json"
    if manifest_path.exists() and not args.dry_run:
        manifest = json.loads(manifest_path.read_text())
        manifest["release_count_mean"] = float(mean)
        manifest["release_count_total"] = int(total_releases)
        manifest["release_count_distribution"] = distribution
        manifest["release_count_p10_p50_p90"] = [
            pct(release_counts, 0.1),
            pct(release_counts, 0.5),
            pct(release_counts, 0.9),
        ]
        manifest["release_count_warnings"] = warnings
        manifest["release_framing_counts"] = framing_counts
        manifest["active_regime_counts"] = active_regime_counts
        manifest_path.write_text(json.dumps(manifest, indent=2, default=float))
        print(f"\n[sched] updated {manifest_path}")
    elif args.dry_run:
        print(f"\n[sched] --dry-run: skipping manifest write")


if __name__ == "__main__":
    main()
