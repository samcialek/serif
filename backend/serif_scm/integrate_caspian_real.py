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


def load_real_data() -> pd.DataFrame:
    """Build a single per-day DataFrame keyed by Caspian's `day` integer."""
    sleep = pd.read_csv(DATA_DIR / "caspian_sleep_daily.csv", parse_dates=["date"])
    workouts = pd.read_csv(DATA_DIR / "caspian_workouts_daily.csv", parse_dates=["date"])
    metrics = pd.read_csv(
        DATA_DIR / "caspian_apple_health_metrics_daily.csv",
        parse_dates=["date"],
    )

    sleep["date"] = sleep["date"].dt.date
    workouts["date"] = workouts["date"].dt.date
    metrics["date"] = metrics["date"].dt.date

    sleep["day"] = sleep["date"].apply(date_to_day)
    workouts["day"] = workouts["date"].apply(date_to_day)
    metrics["day"] = metrics["date"].apply(date_to_day)

    # Drop rows outside Caspian's [1, 4013] day window.
    for df in (sleep, workouts, metrics):
        df.drop(df[(df["day"] < 1) | (df["day"] > 4013)].index, inplace=True)

    # Outer-join on day so we have one row per day with whatever's available.
    # Rename ALL real columns with a `_real` suffix to avoid collision with
    # the synthetic CSV columns at merge time.
    real = (
        sleep.set_index("day")[
            ["sleep_hrs", "sleep_efficiency", "deep_sleep_min", "sleep_quality", "hrv_daily", "sleep_bpm"]
        ]
        .rename(columns={
            "sleep_hrs":        "sleep_hrs_real",
            "sleep_efficiency": "sleep_efficiency_real",
            "deep_sleep_min":   "deep_sleep_real",
            "sleep_quality":    "sleep_quality_real",
            "hrv_daily":        "hrv_daily_real",
            "sleep_bpm":        "sleep_bpm_real",
        })
    )
    real = real.join(
        workouts.set_index("day")[["run_km", "training_min"]].rename(
            columns={"run_km": "run_km_real", "training_min": "training_min_real"}
        ),
        how="outer",
    )
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
