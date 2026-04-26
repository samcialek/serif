"""Stage 5 — replace Caspian's synthetic per-day rows with real data.

Maps real per-day Apple Health / AutoSleep / GPX rows onto the engine's
day-numbered synthetic CSVs (lifestyle_app.csv, wearables_daily.csv) by
anchoring day 1 to 2015-02-13 (persona's declared data start).

Synthetic stays for any day outside real coverage and for any field
that has no real source in the per-day CSVs (e.g., dietary_protein has
no Apple Health equivalent).

Run: python -m backend.serif_scm.integrate_caspian_real
The script is re-runnable; it always reloads from the un-touched
synthetic templates by re-reading the existing CSVs and only patching
participant_id == 1 rows.

Source-of-truth mapping per field (in order of preference; first
non-null wins):
  lifestyle_app.csv (pid=1):
    run_km        <- caspian_workouts_daily.csv
    training_min  <- caspian_workouts_daily.csv
    steps         <- caspian_apple_health_metrics_daily.csv
    sleep_hrs     <- caspian_sleep_daily.csv
    bedtime_hr    <- (no per-day real source today; synthetic stays)
    zone2_min     <- (no per-day real source; synthetic stays)
    protein_g     <- (no per-day real source; synthetic stays)
    energy_kcal   <- caspian_apple_health_metrics_daily.csv (active_energy_kcal)

  wearables_daily.csv (pid=1):
    hrv_daily         <- caspian_sleep_daily.csv (sleepHRV)
    resting_hr        <- caspian_apple_health_metrics_daily.csv (RestingHeartRate; better coverage than sleep CSV's wakingBPM)
    sleep_efficiency  <- caspian_sleep_daily.csv
    sleep_quality     <- caspian_sleep_daily.csv
    deep_sleep        <- caspian_sleep_daily.csv (deep_sleep_min)
    sleep_hrs         <- caspian_sleep_daily.csv
    steps             <- caspian_apple_health_metrics_daily.csv

Blood draws: CDA had no real lab biomarkers (only CGM glucose + Apple
vitals). Caspian's blood_draws.csv rows stay synthetic for now;
caspian_real.py's persona-real values still override at the
portal-export layer for the displayed `outcome_baselines`.
"""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "backend" / "data"
OUT_DIR = REPO_ROOT / "backend" / "output"

# Persona claims data starts 2015-02-13 — day 1 of Caspian's window.
CASPIAN_DAY_ONE = date(2015, 2, 13)
CASPIAN_PID = 1


def date_to_day(d: date) -> int:
    return (d - CASPIAN_DAY_ONE).days + 1


def _load_csv_with_day(name: str) -> pd.DataFrame:
    """Read a CSV from backend/data, parse `date`, and add Caspian's `day`."""
    path = DATA_DIR / name
    if not path.exists():
        return pd.DataFrame(columns=["day"])
    df = pd.read_csv(path, parse_dates=["date"])
    df["date"] = df["date"].dt.date
    df["day"] = df["date"].apply(date_to_day)
    df = df[(df["day"] >= 1) & (df["day"] <= 4013)].copy()
    return df


def load_real_data() -> pd.DataFrame:
    """Build a single per-day DataFrame keyed by Caspian's `day` integer.

    Source priority per field — first non-null wins:

      sleep_hrs / sleep_efficiency / deep_sleep / sleep_quality:
        AutoSleep (richer columns, when in range 2019-12 → 2023-05)
        -> Apple Health native sleep records (post-2023, fills the gap)

      hrv_daily:
        AutoSleep only (Apple Health export needs sub-daily aggregation
        we don't currently do in Stage 3).

      run_km / training_min:
        Apple Health Workouts (run-only / total respectively) — the new
        workouts CSV from extract_caspian_workouts_and_sleep, which
        replaces the GPX-derived CSV that mixed cycling / walking into
        the run column.

      steps / energy_kcal / resting_hr / exercise_minutes:
        Apple Health metrics CSV (Stage 3 quantity-record extraction).
    """
    autosleep = _load_csv_with_day("caspian_sleep_daily.csv")
    aple_sleep = _load_csv_with_day("caspian_apple_health_sleep_daily.csv")
    apple_workouts = _load_csv_with_day("caspian_apple_health_workouts_daily.csv")
    metrics = _load_csv_with_day("caspian_apple_health_metrics_daily.csv")

    # Sleep: combine AutoSleep (primary) with Apple Health native sleep
    # (gap-filler) into one frame keyed by day. AutoSleep wins where both
    # are present.
    sleep_combined: pd.DataFrame = pd.DataFrame({"day": []}).set_index("day")
    if not aple_sleep.empty:
        # Apple Health's sleep_efficiency uses `in_bed_min` as the denom,
        # which is inflated by multi-source overlap (e.g., 61 sessions on
        # 2026-02-07). NOT trusted — we deliberately exclude it and let
        # AutoSleep's calculation win when available; fall back to
        # synthetic for days outside AutoSleep.
        sleep_combined = aple_sleep.set_index("day")[
            ["asleep_min", "deep_min", "rem_min", "in_bed_min"]
        ].rename(
            columns={
                "asleep_min":        "_apple_sleep_min",
                "deep_min":          "_apple_deep_min",
                "rem_min":           "_apple_rem_min",
                "in_bed_min":        "_apple_in_bed_min",
            }
        )
    if not autosleep.empty:
        sleep_combined = sleep_combined.join(
            autosleep.set_index("day")[
                ["sleep_hrs", "sleep_efficiency", "deep_sleep_min", "sleep_quality",
                 "hrv_daily", "sleep_bpm"]
            ].rename(
                columns={
                    "sleep_hrs":        "_as_sleep_hrs",
                    "sleep_efficiency": "_as_sleep_eff",
                    "deep_sleep_min":   "_as_deep_min",
                    "sleep_quality":    "_as_sleep_qual",
                    "hrv_daily":        "_as_hrv",
                    "sleep_bpm":        "_as_sleep_bpm",
                }
            ),
            how="outer",
        )

    # Resolve fields: AutoSleep first, Apple Health second.
    def _coalesce(df: pd.DataFrame, *cols: str) -> pd.Series:
        out = pd.Series(np.nan, index=df.index)
        for c in cols:
            if c in df.columns:
                out = out.where(out.notna(), df[c])
        return out

    real = pd.DataFrame(index=sleep_combined.index)
    if not sleep_combined.empty:
        real["sleep_hrs_real"] = _coalesce(
            sleep_combined,
            "_as_sleep_hrs",
            # _apple_sleep_min is in minutes; divide before coalesce.
        )
        if "_apple_sleep_min" in sleep_combined.columns:
            apple_hrs = sleep_combined["_apple_sleep_min"] / 60.0
            real["sleep_hrs_real"] = real["sleep_hrs_real"].where(
                real["sleep_hrs_real"].notna(), apple_hrs
            )
        # Use AutoSleep efficiency only — Apple Health's calc is broken
        # by overlapping in_bed_min records from multi-source sync.
        real["sleep_efficiency_real"] = _coalesce(sleep_combined, "_as_sleep_eff")
        real["deep_sleep_real"] = _coalesce(
            sleep_combined, "_as_deep_min", "_apple_deep_min"
        )
        real["sleep_quality_real"] = _coalesce(sleep_combined, "_as_sleep_qual")
        real["hrv_daily_real"] = _coalesce(sleep_combined, "_as_hrv")
        real["sleep_bpm_real"] = _coalesce(sleep_combined, "_as_sleep_bpm")

    # Workouts: prefer the run_km / total_min from the Apple Health
    # workouts CSV (run-only). Falls back to the GPX-based CSV only
    # when the Apple Health one is missing — typically because that
    # script hasn't been run.
    if not apple_workouts.empty:
        wo_cols = apple_workouts.set_index("day")[["run_km", "total_min", "total_kcal"]].rename(
            columns={
                "run_km":     "run_km_real",
                "total_min":  "training_min_real",
                "total_kcal": "workout_kcal_real",
            }
        )
        real = real.join(wo_cols, how="outer")
    else:
        gpx = _load_csv_with_day("caspian_workouts_daily.csv")
        if not gpx.empty:
            real = real.join(
                gpx.set_index("day")[["run_km", "training_min"]].rename(
                    columns={"run_km": "run_km_real", "training_min": "training_min_real"}
                ),
                how="outer",
            )

    # Metrics: steps / active energy / resting HR / exercise minutes.
    if not metrics.empty:
        real = real.join(
            metrics.set_index("day")[
                ["steps", "active_energy_kcal", "heart_rate_resting", "exercise_minutes"]
            ].rename(
                columns={
                    "steps": "steps_real",
                    "active_energy_kcal": "energy_kcal_real",
                    "heart_rate_resting": "resting_hr_real",
                    "exercise_minutes": "exercise_min_real",
                }
            ),
            how="outer",
        )

    real.index.name = "day"
    return real.reset_index()


def patch_lifestyle(real: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    path = OUT_DIR / "lifestyle_app.csv"
    df = pd.read_csv(path)
    mask_pid1 = df["participant_id"] == CASPIAN_PID
    pid1 = df[mask_pid1].copy().merge(real, on="day", how="left")

    counts: dict[str, int] = {}
    overrides = [
        ("run_km",       "run_km_real"),
        ("training_min", "training_min_real"),
        ("steps",        "steps_real"),
        ("sleep_hrs",    "sleep_hrs_real"),
        ("energy_kcal",  "energy_kcal_real"),
    ]
    for target, src in overrides:
        if src not in pid1.columns or target not in pid1.columns:
            continue
        real_vals = pid1[src]
        n = real_vals.notna().sum()
        counts[target] = int(n)
        # Replace where we have real data; keep synthetic where NaN.
        pid1[target] = real_vals.where(real_vals.notna(), pid1[target])

    # Drop the merged "_real" columns before writing back.
    pid1 = pid1.drop(columns=[c for c in pid1.columns if c.endswith("_real")])
    df.loc[mask_pid1, pid1.columns] = pid1.values
    return df, counts


def patch_wearables(real: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    path = OUT_DIR / "wearables_daily.csv"
    df = pd.read_csv(path)
    mask_pid1 = df["participant_id"] == CASPIAN_PID
    pid1 = df[mask_pid1].copy().merge(real, on="day", how="left")

    counts: dict[str, int] = {}
    overrides = [
        ("hrv_daily",        "hrv_daily_real"),
        ("sleep_efficiency", "sleep_efficiency_real"),
        ("sleep_quality",    "sleep_quality_real"),
        ("deep_sleep",       "deep_sleep_real"),
        ("sleep_hrs",        "sleep_hrs_real"),
        ("resting_hr",       "resting_hr_real"),
        ("steps",            "steps_real"),
    ]
    for target, src in overrides:
        if src not in pid1.columns or target not in pid1.columns:
            continue
        real_vals = pid1[src]
        n = real_vals.notna().sum()
        counts[target] = int(n)
        pid1[target] = real_vals.where(real_vals.notna(), pid1[target])

    # Drop the merged "_real" columns before writing back so the original
    # CSV schema is preserved.
    pid1 = pid1.drop(columns=[c for c in pid1.columns if c.endswith("_real")])
    # Reorder to match the source CSV exactly.
    pid1 = pid1[df.columns]
    df.loc[mask_pid1, pid1.columns] = pid1.values
    return df, counts


def patch_blood_draws() -> tuple[pd.DataFrame, dict]:
    """Replace participant_1 rows in blood_draws.csv with real lab values
    extracted from PDFs at backend/data/caspian_labs_pdf.csv.

    Schema: blood_draws.csv has one row per (pid, draw_day) with biomarker
    columns. Real labs from PDFs cover 7 actual draw dates from
    2023-11-01 → 2025-11-22, which map to day numbers ~3186-3936 on
    Caspian's day axis. Synthetic Caspian draws (day 1 + day 100) are
    REPLACED entirely with the real series.

    Biomarker columns missing from a given lab draw are left NaN — the
    engine's user-obs OLS handles missing biomarkers gracefully.
    """
    pdf_path = DATA_DIR / "caspian_labs_pdf.csv"
    if not pdf_path.exists():
        return None, {"missing": "caspian_labs_pdf.csv not present"}

    labs = pd.read_csv(pdf_path)
    labs["date_obj"] = pd.to_datetime(labs["date"]).dt.date
    labs["day"] = labs["date_obj"].apply(date_to_day)
    # Pivot so each row is a draw, columns are biomarkers.
    pivot = labs.pivot_table(
        index=["day", "date_obj"],
        columns="biomarker",
        values="value",
        aggfunc="first",  # if a draw has duplicate readings, take the first
    ).reset_index()

    blood_path = OUT_DIR / "blood_draws.csv"
    df = pd.read_csv(blood_path)
    pid1_existing = df[df["participant_id"] == CASPIAN_PID].copy()
    other = df[df["participant_id"] != CASPIAN_PID].copy()

    # Keep the synthetic day=1 + day=100 rows — transform.build_participant_state
    # hard-codes lookups for those draw_days as the baseline + current
    # references the SCM uses for abduction. Removing them breaks the
    # whole pipeline. We ADD the real lab rows on top: the engine still
    # has its synthetic anchors AND gets real per-draw biomarker slopes.
    #
    # If a real lab date COINCIDES with day=1 or day=100, we overlay
    # the real values onto the synthetic anchor (real wins per-cell).
    pid1_template = pid1_existing.iloc[0] if len(pid1_existing) > 0 else None
    if pid1_template is None:
        # Should never happen — every cohort participant has rows.
        return None, {"missing": "pid=1 has no synthetic blood rows"}

    new_rows = []
    overlaid_anchor_days: set[int] = set()
    for _, draw in pivot.iterrows():
        day = int(draw["day"])
        if day in (1, 100) and len(pid1_existing[pid1_existing["draw_day"] == day]) > 0:
            # Overlay onto the existing synthetic anchor row.
            anchor = pid1_existing[pid1_existing["draw_day"] == day].iloc[0].to_dict()
            for col in df.columns:
                if col in draw.index and pd.notna(draw[col]):
                    anchor[col] = draw[col]
            new_rows.append(anchor)
            overlaid_anchor_days.add(day)
            continue

        # Fresh row at the real draw_day.
        row = {col: pd.NA for col in df.columns}
        row["participant_id"] = CASPIAN_PID
        row["cohort"] = pid1_template["cohort"]
        row["age"] = pid1_template["age"]
        row["is_female"] = pid1_template["is_female"]
        row["draw_day"] = day
        for col in df.columns:
            if col in draw.index and pd.notna(draw[col]):
                row[col] = draw[col]
        new_rows.append(row)

    # Carry forward any synthetic anchor rows we didn't overlay.
    for _, anchor in pid1_existing.iterrows():
        if int(anchor["draw_day"]) not in overlaid_anchor_days:
            new_rows.append(anchor.to_dict())

    new_pid1 = pd.DataFrame(new_rows, columns=df.columns)
    out = pd.concat([other, new_pid1], ignore_index=True).sort_values(
        ["participant_id", "draw_day"]
    ).reset_index(drop=True)

    counts = {
        "real_draws_added": int((new_pid1["draw_day"].isin(pivot["day"])).sum()),
        "biomarkers_per_draw_avg": float(
            new_pid1.drop(columns=["participant_id", "cohort", "age", "is_female", "draw_day"])
            .notna().sum(axis=1).mean()
        ),
        "anchor_rows_kept": len(pid1_existing) - len(overlaid_anchor_days),
    }
    return out, counts


def main() -> int:
    print(f"Loading real per-day data...")
    real = load_real_data()
    print(f"  {len(real)} unique day-rows in real data")
    print(f"  day range: {int(real['day'].min())} to {int(real['day'].max())}")

    print()
    print("Patching lifestyle_app.csv...")
    df_life, life_counts = patch_lifestyle(real)
    df_life.to_csv(OUT_DIR / "lifestyle_app.csv", index=False)
    for k, v in life_counts.items():
        print(f"  {k}: {v} real days written")

    print()
    print("Patching wearables_daily.csv...")
    df_wear, wear_counts = patch_wearables(real)
    df_wear.to_csv(OUT_DIR / "wearables_daily.csv", index=False)
    for k, v in wear_counts.items():
        print(f"  {k}: {v} real days written")

    print()
    print("Patching blood_draws.csv...")
    df_blood, blood_counts = patch_blood_draws()
    if df_blood is not None:
        df_blood.to_csv(OUT_DIR / "blood_draws.csv", index=False)
        for k, v in blood_counts.items():
            print(f"  {k}: {v}")
    else:
        for k, v in blood_counts.items():
            print(f"  {k}: {v}")

    # Spot-check a row: Caspian's most recent day (4013).
    print()
    print("Spot-check — Caspian's most recent day (4013):")
    p1_life = df_life[(df_life["participant_id"] == 1) & (df_life["day"] == 4013)]
    p1_wear = df_wear[(df_wear["participant_id"] == 1) & (df_wear["day"] == 4013)]
    if len(p1_life) > 0:
        row = p1_life.iloc[0]
        print(f"  lifestyle: run_km={row.get('run_km')}, training_min={row.get('training_min')}, "
              f"steps={row.get('steps')}, sleep_hrs={row.get('sleep_hrs')}")
    if len(p1_wear) > 0:
        row = p1_wear.iloc[0]
        print(f"  wearables: hrv={row.get('hrv_daily')}, rhr={row.get('resting_hr')}, "
              f"deep_sleep={row.get('deep_sleep')}, sleep_eff={row.get('sleep_efficiency')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
