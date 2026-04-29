"""Fetch New York / Tel Aviv historical weather for Caspian.

Open-Meteo is the source for weather, air quality, and geocoded city
coordinates. The output is one row per date with both weather variables and
the location used for that date.

Default behavior:
  - Build or extend backend/data/caspian_location_days.csv.
  - Use New York as the default location.
  - Seed recurring Tel Aviv blocks so New York remains about 80% of days.
  - Fetch both city archives and join by date-level location.

Replace caspian_location_days.csv later with GPS/calendar-derived locations;
the weather fetcher and downstream portal export do not need to change.

Run:
    python -m backend.serif_scm.fetch_caspian_weather
    python -m backend.serif_scm.fetch_caspian_weather --start 2015-02-13 --end 2026-02-07
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests


@dataclass(frozen=True)
class Location:
    id: str
    city: str
    country: str
    latitude: float
    longitude: float
    timezone: str


LOCATIONS: dict[str, Location] = {
    "new_york": Location(
        id="new_york",
        city="New York",
        country="US",
        latitude=40.71427,
        longitude=-74.00597,
        timezone="America/New_York",
    ),
    "tel_aviv": Location(
        id="tel_aviv",
        city="Tel Aviv",
        country="IL",
        latitude=32.08088,
        longitude=34.78057,
        timezone="Asia/Jerusalem",
    ),
}

DEFAULT_LOCATION_ID = "new_york"

# Full persona data window shown in the Data coverage chart.
DEFAULT_START = "2015-02-13"
DEFAULT_END = "2026-02-07"

# CAMS global air-quality archive begins in late July 2022. Earlier rows keep
# AQI/PM blank; weather variables are still complete through the archive API.
AQI_ARCHIVE_START = "2022-07-29"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

DATA_DIR = Path("backend/data")
OUT_PATH = DATA_DIR / "caspian_weather.csv"
LOCATION_DAYS_PATH = DATA_DIR / "caspian_location_days.csv"

# Recurring annual Tel Aviv visits: 72 days in a non-leap year, so New York is
# about 80.3% of the itinerary. This is deliberately replaceable, not hidden.
TEL_AVIV_BLOCKS: tuple[tuple[int, int, int, int], ...] = (
    (3, 10, 3, 31),
    (6, 10, 6, 24),
    (9, 1, 9, 14),
    (12, 10, 12, 30),
)

WEATHER_COLS = [
    "temp_c",
    "temp_c_max",
    "temp_c_min",
    "humidity_pct",
    "heat_index_c",
    "uv_index",
    "sunshine_h",
    "shortwave_mj_m2",
    "precipitation_mm",
    "wind_kmh",
    "aqi",
    "aqi_us",
    "pm2_5",
    "pm10",
]


def parse_iso(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def date_range(start: date, end: date) -> list[date]:
    days = (end - start).days
    return [start + timedelta(days=i) for i in range(days + 1)]


def heat_index_c(temp_c: float, humidity_pct: float) -> float:
    """Apparent-temperature approximation shared with loads.py."""
    if not math.isfinite(temp_c) or not math.isfinite(humidity_pct):
        return float("nan")
    if temp_c < 27.0:
        return temp_c
    excess_rh = max(0.0, humidity_pct - 40.0) / 60.0
    return temp_c + 0.08 * excess_rh * ((temp_c - 27.0) / 13.0)


def estimated_uv_from_shortwave(shortwave_mj_m2: float) -> float:
    """Fallback when historical UV is not available.

    Open-Meteo's archive returns shortwave radiation consistently back through
    the full window. Dividing daily MJ/m2 by roughly 3.1 yields a conservative
    UV-index scale for daily maximum context.
    """
    if not math.isfinite(shortwave_mj_m2):
        return float("nan")
    return max(0.0, min(11.0, shortwave_mj_m2 / 3.1))


def is_tel_aviv_day(d: date) -> bool:
    for start_month, start_day, end_month, end_day in TEL_AVIV_BLOCKS:
        start = date(d.year, start_month, start_day)
        end = date(d.year, end_month, end_day)
        if start <= d <= end:
            return True
    return False


def default_location_for_date(d: date) -> Location:
    return LOCATIONS["tel_aviv"] if is_tel_aviv_day(d) else LOCATIONS[DEFAULT_LOCATION_ID]


def build_default_location_days(start: str, end: str) -> pd.DataFrame:
    rows = []
    for d in date_range(parse_iso(start), parse_iso(end)):
        loc = default_location_for_date(d)
        rows.append({
            "date": d.isoformat(),
            "location_id": loc.id,
            "city": loc.city,
            "country": loc.country,
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "timezone": loc.timezone,
            "location_confidence": 0.65,
            "location_source": "seeded_itinerary",
        })
    return pd.DataFrame(rows)


def load_or_create_location_days(
    path: Path,
    start: str,
    end: str,
    reset: bool = False,
) -> pd.DataFrame:
    expected = build_default_location_days(start, end)
    if path.exists() and not reset:
        existing = pd.read_csv(path)
        if "date" not in existing.columns or "location_id" not in existing.columns:
            raise ValueError(f"{path} must include date and location_id columns")
        existing["date"] = existing["date"].astype(str)
        existing = existing[(existing["date"] >= start) & (existing["date"] <= end)]
        missing = expected[~expected["date"].isin(set(existing["date"]))]
        df = pd.concat([existing, missing], ignore_index=True)
    else:
        df = expected

    df = df.sort_values("date").drop_duplicates("date", keep="first").reset_index(drop=True)
    for loc_id, loc in LOCATIONS.items():
        mask = df["location_id"] == loc_id
        df.loc[mask, "city"] = df.loc[mask, "city"].fillna(loc.city)
        df.loc[mask, "country"] = df.loc[mask, "country"].fillna(loc.country)
        df.loc[mask, "latitude"] = df.loc[mask, "latitude"].fillna(loc.latitude)
        df.loc[mask, "longitude"] = df.loc[mask, "longitude"].fillna(loc.longitude)
        df.loc[mask, "timezone"] = df.loc[mask, "timezone"].fillna(loc.timezone)
    if "location_confidence" not in df.columns:
        df["location_confidence"] = 0.65
    if "location_source" not in df.columns:
        df["location_source"] = "seeded_itinerary"

    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, float_format="%.5f")
    return df


def request_json(url: str, params: dict, timeout: int = 120) -> dict:
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


def fetch_archive_daily(loc: Location, start: str, end: str) -> pd.DataFrame:
    print(f"[weather] {loc.city}: daily weather {start} -> {end}")
    params = {
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "start_date": start,
        "end_date": end,
        "timezone": loc.timezone,
        "daily": ",".join([
            "temperature_2m_mean",
            "temperature_2m_max",
            "temperature_2m_min",
            "relative_humidity_2m_mean",
            "precipitation_sum",
            "wind_speed_10m_max",
            "sunshine_duration",
            "shortwave_radiation_sum",
            "uv_index_max",
        ]),
    }
    data = request_json(ARCHIVE_URL, params, timeout=120)["daily"]
    df = pd.DataFrame(data)
    df["date"] = pd.to_datetime(df["time"]).dt.date.astype(str)
    df = df.drop(columns=["time"])
    df = df.rename(columns={
        "temperature_2m_mean": "temp_c",
        "temperature_2m_max": "temp_c_max",
        "temperature_2m_min": "temp_c_min",
        "relative_humidity_2m_mean": "humidity_pct",
        "precipitation_sum": "precipitation_mm",
        "wind_speed_10m_max": "wind_kmh",
        "sunshine_duration": "sunshine_duration",
        "shortwave_radiation_sum": "shortwave_mj_m2",
        "uv_index_max": "uv_index_archive",
    })
    return df


def fetch_air_quality(loc: Location, start: str, end: str) -> pd.DataFrame:
    aq_start = max(start, AQI_ARCHIVE_START)
    if aq_start > end:
        return pd.DataFrame(columns=["date", "aqi", "aqi_us", "pm2_5", "pm10", "uv_index_aq"])

    print(f"[weather] {loc.city}: air quality {aq_start} -> {end} (yearly chunks)")
    chunks: list[pd.DataFrame] = []
    for year in range(int(aq_start[:4]), int(end[:4]) + 1):
        chunk_start = f"{year}-01-01" if year > int(aq_start[:4]) else aq_start
        chunk_end = f"{year}-12-31" if year < int(end[:4]) else end
        params = {
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "start_date": chunk_start,
            "end_date": chunk_end,
            "timezone": loc.timezone,
            "hourly": "european_aqi,us_aqi,pm2_5,pm10,uv_index",
        }
        h = request_json(AIR_QUALITY_URL, params, timeout=120)["hourly"]
        sub = pd.DataFrame({
            "ts": pd.to_datetime(h["time"]),
            "aqi": h["european_aqi"],
            "aqi_us": h["us_aqi"],
            "pm2_5": h["pm2_5"],
            "pm10": h["pm10"],
            "uv_index_aq": h["uv_index"],
        })
        sub["date"] = sub["ts"].dt.date.astype(str)
        daily = sub.groupby("date", as_index=False).agg({
            "aqi": "mean",
            "aqi_us": "mean",
            "pm2_5": "mean",
            "pm10": "mean",
            "uv_index_aq": "max",
        })
        chunks.append(daily)
        print(f"  {loc.city} {year}: {len(daily)} days")
        time.sleep(0.25)
    return pd.concat(chunks, ignore_index=True)


def fetch_location_weather(loc: Location, start: str, end: str) -> pd.DataFrame:
    daily = fetch_archive_daily(loc, start, end)
    aq = fetch_air_quality(loc, start, end)
    df = daily.merge(aq, on="date", how="left")

    df["heat_index_c"] = df.apply(
        lambda r: heat_index_c(float(r["temp_c"]), float(r["humidity_pct"])),
        axis=1,
    )
    df["sunshine_h"] = df["sunshine_duration"] / 3600.0
    df["uv_index"] = pd.to_numeric(df["uv_index_aq"], errors="coerce")
    df["uv_index"] = df["uv_index"].combine_first(
        pd.to_numeric(df["uv_index_archive"], errors="coerce"),
    )
    df["uv_index"] = df["uv_index"].combine_first(
        df["shortwave_mj_m2"].apply(lambda v: estimated_uv_from_shortwave(float(v))),
    )
    df["location_id"] = loc.id
    return df[["date", "location_id", *WEATHER_COLS]]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", default=DEFAULT_START)
    ap.add_argument("--end", default=DEFAULT_END)
    ap.add_argument("--out", default=str(OUT_PATH))
    ap.add_argument("--itinerary", default=str(LOCATION_DAYS_PATH))
    ap.add_argument(
        "--reset-itinerary",
        action="store_true",
        help="Rewrite the date-level itinerary from the built-in NY/Tel Aviv schedule.",
    )
    args = ap.parse_args()

    loc_path = Path(args.itinerary)
    location_days = load_or_create_location_days(
        loc_path,
        args.start,
        args.end,
        reset=args.reset_itinerary,
    )
    used_location_ids = sorted(location_days["location_id"].unique())
    unknown = [loc_id for loc_id in used_location_ids if loc_id not in LOCATIONS]
    if unknown:
        raise ValueError(f"Unknown location_id values in {loc_path}: {unknown}")

    weather_frames = [
        fetch_location_weather(LOCATIONS[loc_id], args.start, args.end)
        for loc_id in used_location_ids
    ]
    weather = pd.concat(weather_frames, ignore_index=True)
    df = location_days.merge(weather, on=["date", "location_id"], how="left")

    cols = [
        "date",
        "location_id",
        "city",
        "country",
        "latitude",
        "longitude",
        "timezone",
        "location_confidence",
        "location_source",
        *WEATHER_COLS,
    ]
    df = df[cols].sort_values("date").reset_index(drop=True)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path, index=False, float_format="%.3f")

    counts = df["location_id"].value_counts(normalize=True).sort_index()
    mix = ", ".join(f"{loc_id}={pct * 100:.1f}%" for loc_id, pct in counts.items())
    print(
        f"\n[weather] wrote {len(df)} rows to {out_path}\n"
        f"  itinerary:   {loc_path}\n"
        f"  span:        {df['date'].min()} -> {df['date'].max()}\n"
        f"  location mix:{' ' if mix else ''}{mix}\n"
        f"  temp rows:   {df['temp_c'].notna().sum()} / {len(df)}\n"
        f"  UV rows:     {df['uv_index'].notna().sum()} / {len(df)}\n"
        f"  AQI rows:    {df['aqi'].notna().sum()} / {len(df)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
