"""Extract per-day sleep + HRV data from AutoSleep CSV export.

Reads the raw AutoSleep CSV (multi-night export) and writes a clean per-day
summary at backend/data/caspian_sleep_daily.csv that the engine can consume.

Run:
    python -m backend.serif_scm.extract_caspian_sleep
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


# Resolve repo root from this file: <repo>/backend/serif_scm/extract_caspian_sleep.py
REPO_ROOT = Path(__file__).resolve().parents[2]

INPUT_CSV = (
    REPO_ROOT
    / "Oron Afek - Health Data-20260426T143958Z-3-001"
    / "Oron Afek - Health Data"
    / "AutoSleep-20160111-to-20260207.csv"
)

OUTPUT_CSV = REPO_ROOT / "backend" / "data" / "caspian_sleep_daily.csv"


def parse_hms_to_hours(value: object) -> float:
    """Parse an "HH:MM:SS" duration string into a float number of hours.

    Empty / NaN / malformed inputs return NaN.
    """
    if value is None:
        return np.nan
    if isinstance(value, float) and np.isnan(value):
        return np.nan
    s = str(value).strip()
    if not s:
        return np.nan
    parts = s.split(":")
    if len(parts) != 3:
        return np.nan
    try:
        h, m, sec = (float(p) for p in parts)
    except ValueError:
        return np.nan
    return h + m / 60.0 + sec / 3600.0


def parse_hms_to_minutes(value: object) -> float:
    """Parse an "HH:MM:SS" duration string into a float number of minutes."""
    hours = parse_hms_to_hours(value)
    if np.isnan(hours):
        return np.nan
    return hours * 60.0


def coerce_float(value: object) -> float:
    """Coerce a cell to float, returning NaN on any parse failure."""
    if value is None:
        return np.nan
    if isinstance(value, float) and np.isnan(value):
        return np.nan
    s = str(value).strip().replace(",", "")
    if not s:
        return np.nan
    try:
        return float(s)
    except ValueError:
        return np.nan


def parse_to_date(value: object) -> str:
    """Parse the AutoSleep `toDate` field (e.g. "Tuesday, Dec 10, 2019") to YYYY-MM-DD.

    Returns an empty string if parsing fails.
    """
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    # AutoSleep format examples: "Tuesday, Dec 10, 2019"
    for fmt in ("%A, %b %d, %Y", "%A, %B %d, %Y", "%Y-%m-%d"):
        try:
            return pd.to_datetime(s, format=fmt).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            continue
    # Fallback: let pandas guess
    try:
        return pd.to_datetime(s).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return ""


def extract() -> pd.DataFrame:
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Input CSV not found: {INPUT_CSV}")

    raw = pd.read_csv(INPUT_CSV, dtype=str, keep_default_na=False)

    out = pd.DataFrame()
    out["date"] = raw["toDate"].apply(parse_to_date)

    out["sleep_hrs"] = raw["asleep"].apply(parse_hms_to_hours)
    out["sleep_efficiency"] = raw["efficiency"].apply(coerce_float)
    out["deep_sleep_min"] = raw["deep"].apply(parse_hms_to_minutes)

    # `quality` is an HH:MM:SS duration (time spent in quality sleep). Convert
    # to a 0-100 score as quality_minutes / asleep_minutes * 100, which mirrors
    # the efficiency-style framing the engine expects.
    asleep_min = raw["asleep"].apply(parse_hms_to_minutes)
    quality_min = raw["quality"].apply(parse_hms_to_minutes)
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(
            (asleep_min > 0) & np.isfinite(asleep_min) & np.isfinite(quality_min),
            quality_min / asleep_min * 100.0,
            np.nan,
        )
    # Clip to [0, 100] in case of any rounding edge cases
    out["sleep_quality"] = np.clip(ratio, 0.0, 100.0)

    # Prefer sleepHRV, fall back to hrv
    sleep_hrv = raw["sleepHRV"].apply(coerce_float)
    hrv = raw["hrv"].apply(coerce_float)
    out["hrv_daily"] = sleep_hrv.where(sleep_hrv.notna() & (sleep_hrv > 0), hrv)

    out["resting_hr"] = raw["wakingBPM"].apply(coerce_float)
    out["sleep_bpm"] = raw["sleepBPM"].apply(coerce_float)

    # Drop rows where date failed to parse
    out = out[out["date"] != ""].copy()

    # Drop rows where critical fields (asleep + wakingBPM) are both empty
    critical_missing = out["sleep_hrs"].isna() & out["resting_hr"].isna()
    out = out[~critical_missing].copy()

    # Sort ascending by date and de-dupe (last value wins) in case of repeats
    out = out.sort_values("date").drop_duplicates(subset=["date"], keep="last")
    out = out.reset_index(drop=True)

    return out


def main() -> None:
    df = extract()

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False, na_rep="")

    print(f"Wrote {OUTPUT_CSV} ({len(df)} rows)")
    if len(df):
        print(f"Date range: {df['date'].min()} -> {df['date'].max()}")
    print("\nNon-null counts per column:")
    print(df.notna().sum().to_string())

    print("\nSanity means:")
    for col in ("sleep_hrs", "deep_sleep_min", "hrv_daily", "resting_hr"):
        mean = df[col].mean(skipna=True)
        print(f"  {col}: {mean:.3f}" if pd.notna(mean) else f"  {col}: NaN")


if __name__ == "__main__":
    main()
