"""Fetch real Tel Aviv historical weather + air-quality for Caspian.

Pulls daily aggregates from Open-Meteo's free historical-archive API
(no key needed) covering Caspian's full data window
2018-02-13 -> 2026-02-07 (~4012 days). Air-quality archive only goes
back to ~2022-07-29; earlier dates are emitted with NaN AQI columns.

Output: backend/data/caspian_weather.csv, one row per date with
columns the export pipeline can plug straight into weather_today /
weather_history (matching the WeatherKey union on the frontend).

Run:  python -m backend.serif_scm.fetch_caspian_weather
      [--start 2018-02-13] [--end 2026-02-07]
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from pathlib import Path

import pandas as pd
import requests


# ── Tel Aviv anchor ────────────────────────────────────────────────

TEL_AVIV_LAT = 32.0853
TEL_AVIV_LON = 34.7818
TIMEZONE = "Asia/Jerusalem"

# Caspian's GPX history span. End date matches today as of 2026-02-07
# in the synthetic dataset.
DEFAULT_START = "2018-02-13"
DEFAULT_END = "2026-02-07"

# Air-quality archive coverage. Anything earlier returns NaN AQI cols.
AQI_ARCHIVE_START = "2022-07-29"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

OUT_PATH = Path("backend/data/caspian_weather.csv")


# ── Heat index (mirror of loads.py:heat_index_c formula) ─────────

def heat_index_c(temp_c: float, humidity_pct: float) -> float:
    """Apparent-temperature approximation. Matches loads.py:heat_index_c
    so the synthetic and real-data paths produce comparable values.
    Only meaningful when temp_c >= ~27. Below that, returns temp_c."""
    if not math.isfinite(temp_c) or not math.isfinite(humidity_pct):
        return float("nan")
    if temp_c < 27.0:
        return temp_c
    excess_rh = max(0.0, humidity_pct - 40.0) / 60.0
    return temp_c + 0.08 * excess_rh * ((temp_c - 27.0) / 13.0)


# ── Fetchers ──────────────────────────────────────────────────────

def fetch_archive_daily(start: str, end: str) -> pd.DataFrame:
    """Daily aggregates from the historical archive."""
    print(f"[weather] fetching daily aggregates {start} -> {end}")
    params = {
        "latitude": TEL_AVIV_LAT,
        "longitude": TEL_AVIV_LON,
        "start_date": start,
        "end_date": end,
        "timezone": TIMEZONE,
        "daily": ",".join([
            "temperature_2m_mean",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "wind_speed_10m_max",
            "sunshine_duration",
            "uv_index_max",
        ]),
    }
    r = requests.get(ARCHIVE_URL, params=params, timeout=90)
    r.raise_for_status()
    data = r.json()["daily"]
    df = pd.DataFrame(data)
    df["date"] = pd.to_datetime(df["time"]).dt.date
    df = df.drop(columns=["time"])
    return df


def fetch_archive_hourly_humidity(start: str, end: str) -> pd.DataFrame:
    """Hourly relative humidity -> daily mean. Open-Meteo doesn't expose
    a daily humidity aggregate, so we pull hourly and average ourselves.
    Two calls split at the half-period to stay under URL/payload limits;
    8 years of hourly is ~70k rows so a single call works in practice
    but we chunk by year to be safe."""
    print(f"[weather] fetching hourly humidity {start} -> {end} (chunked yearly)")
    start_year = int(start.split("-")[0])
    end_year = int(end.split("-")[0])
    chunks: list[pd.DataFrame] = []
    for year in range(start_year, end_year + 1):
        chunk_start = f"{year}-01-01" if year > start_year else start
        chunk_end = f"{year}-12-31" if year < end_year else end
        params = {
            "latitude": TEL_AVIV_LAT,
            "longitude": TEL_AVIV_LON,
            "start_date": chunk_start,
            "end_date": chunk_end,
            "timezone": TIMEZONE,
            "hourly": "relative_humidity_2m",
        }
        r = requests.get(ARCHIVE_URL, params=params, timeout=120)
        r.raise_for_status()
        h = r.json()["hourly"]
        sub = pd.DataFrame({
            "ts": pd.to_datetime(h["time"]),
            "rh": h["relative_humidity_2m"],
        })
        sub["date"] = sub["ts"].dt.date
        daily = sub.groupby("date", as_index=False)["rh"].mean()
        daily.rename(columns={"rh": "humidity_pct"}, inplace=True)
        chunks.append(daily)
        print(f"  {year}: {len(daily)} days")
        time.sleep(0.3)  # polite pause between year requests
    return pd.concat(chunks, ignore_index=True)


def fetch_air_quality(start: str, end: str) -> pd.DataFrame:
    """Hourly AQI / PM2.5 -> daily mean. Archive only covers 2022-07-29+.
    Returns empty DataFrame if start > today's archive coverage."""
    aq_start = max(start, AQI_ARCHIVE_START)
    if aq_start > end:
        print(f"[weather] no AQ coverage in {start} -> {end}")
        return pd.DataFrame(columns=["date", "aqi", "aqi_us", "pm2_5", "pm10"])
    print(f"[weather] fetching air quality {aq_start} -> {end} (chunked yearly)")
    start_year = int(aq_start.split("-")[0])
    end_year = int(end.split("-")[0])
    chunks: list[pd.DataFrame] = []
    for year in range(start_year, end_year + 1):
        chunk_start = f"{year}-01-01" if year > start_year else aq_start
        chunk_end = f"{year}-12-31" if year < end_year else end
        params = {
            "latitude": TEL_AVIV_LAT,
            "longitude": TEL_AVIV_LON,
            "start_date": chunk_start,
            "end_date": chunk_end,
            "timezone": TIMEZONE,
            "hourly": "european_aqi,us_aqi,pm2_5,pm10",
        }
        r = requests.get(AIR_QUALITY_URL, params=params, timeout=120)
        r.raise_for_status()
        h = r.json()["hourly"]
        sub = pd.DataFrame({
            "ts": pd.to_datetime(h["time"]),
            "aqi": h["european_aqi"],
            "aqi_us": h["us_aqi"],
            "pm2_5": h["pm2_5"],
            "pm10": h["pm10"],
        })
        sub["date"] = sub["ts"].dt.date
        daily = sub.groupby("date", as_index=False)[["aqi", "aqi_us", "pm2_5", "pm10"]].mean()
        chunks.append(daily)
        print(f"  {year}: {len(daily)} days")
        time.sleep(0.3)
    return pd.concat(chunks, ignore_index=True)


# ── Main ──────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=DEFAULT_START)
    ap.add_argument("--end", default=DEFAULT_END)
    ap.add_argument("--out", default=str(OUT_PATH))
    args = ap.parse_args()

    daily = fetch_archive_daily(args.start, args.end)
    humidity = fetch_archive_hourly_humidity(args.start, args.end)
    aq = fetch_air_quality(args.start, args.end)

    df = daily.merge(humidity, on="date", how="left")
    df = df.merge(aq, on="date", how="left")

    # Compute heat index from temp + humidity locally.
    df["heat_index_c"] = df.apply(
        lambda r: heat_index_c(r["temperature_2m_mean"], r["humidity_pct"]),
        axis=1,
    )

    # Convert sunshine_duration (seconds) to hours for readability.
    df["sunshine_h"] = df["sunshine_duration"] / 3600.0

    # Order columns to match the frontend WeatherKey union + extras.
    df = df.rename(columns={
        "temperature_2m_mean": "temp_c",
        "temperature_2m_max":  "temp_c_max",
        "temperature_2m_min":  "temp_c_min",
        "uv_index_max":        "uv_index",
        "wind_speed_10m_max":  "wind_kmh",
        "precipitation_sum":   "precipitation_mm",
    })
    cols = [
        "date",
        "temp_c", "temp_c_max", "temp_c_min",
        "humidity_pct", "heat_index_c",
        "uv_index", "sunshine_h",
        "precipitation_mm", "wind_kmh",
        "aqi", "aqi_us", "pm2_5", "pm10",
    ]
    df = df[cols].sort_values("date").reset_index(drop=True)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, float_format="%.3f")

    print(
        f"\n[weather] wrote {len(df)} rows to {out_path}\n"
        f"  span:        {df['date'].min()} -> {df['date'].max()}\n"
        f"  temp range:  {df['temp_c'].min():.1f}°C -> {df['temp_c'].max():.1f}°C\n"
        f"  AQI rows:    {df['aqi'].notna().sum()} / {len(df)} ({100 * df['aqi'].notna().mean():.0f}%)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
