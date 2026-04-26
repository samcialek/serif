"""Extract per-day workout volume from Apple Health GPX files.

Streams each GPX file via xml.etree.ElementTree.iterparse, extracting only
<trkpt> elements (lat, lon, time). Computes per-workout distance via haversine
on consecutive trkpts and duration as last-first timestamp. Aggregates by
Israel local date (Asia/Jerusalem).

Run with: python -m backend.serif_scm.extract_caspian_workouts
"""

from __future__ import annotations

import math
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd


GPX_NS = "{http://www.topografix.com/GPX/1/1}"
TRKPT_TAG = f"{GPX_NS}trkpt"
TIME_TAG = f"{GPX_NS}time"

EARTH_R_KM = 6371.0
ISRAEL_TZ = ZoneInfo("Asia/Jerusalem")

WORKOUT_ROUTES_DIR = Path(
    "Oron Afek - Health Data-20260426T143958Z-3-001"
) / "Oron Afek - Health Data" / "export" / "apple_health_export" / "workout-routes"

OUTPUT_CSV = Path("backend/data/caspian_workouts_daily.csv")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two lat/lon points (degrees) in km."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    c = 2.0 * math.asin(min(1.0, math.sqrt(a)))
    return EARTH_R_KM * c


def parse_iso_time(text: str) -> datetime:
    """Parse '2024-09-15T14:23:01Z' (and variants with fractional secs) as UTC."""
    s = text.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def parse_gpx(path: Path) -> tuple[float, float, datetime] | None:
    """Stream-parse a GPX. Return (distance_km, duration_min, first_utc_time) or None.

    None means: failed parse / no trkpts / single trkpt — caller logs as skipped.
    """
    distance_km = 0.0
    n_pts = 0
    first_time: datetime | None = None
    last_time: datetime | None = None
    prev_lat: float | None = None
    prev_lon: float | None = None

    try:
        # iterparse streams; we only retain trkpt elements until their end event.
        # Note: child <time> 'end' fires BEFORE its parent <trkpt> 'end'. We must
        # only clear elements once the trkpt that contains them has been processed.
        for event, elem in ET.iterparse(str(path), events=("end",)):
            if elem.tag != TRKPT_TAG:
                # Don't clear here — children of trkpt must remain accessible
                # until we see the trkpt's own end event.
                continue

            lat_s = elem.get("lat")
            lon_s = elem.get("lon")
            t_elem = elem.find(TIME_TAG)
            if lat_s is None or lon_s is None or t_elem is None or t_elem.text is None:
                elem.clear()
                continue

            try:
                lat = float(lat_s)
                lon = float(lon_s)
                t = parse_iso_time(t_elem.text)
            except (ValueError, TypeError):
                elem.clear()
                continue

            if prev_lat is not None and prev_lon is not None:
                distance_km += haversine_km(prev_lat, prev_lon, lat, lon)

            if first_time is None:
                first_time = t
            last_time = t
            prev_lat = lat
            prev_lon = lon
            n_pts += 1

            # Clear the trkpt (and its now-processed children) to free memory.
            elem.clear()
    except ET.ParseError:
        return None
    except Exception:
        return None

    if n_pts < 2 or first_time is None or last_time is None:
        return None

    duration_min = (last_time - first_time).total_seconds() / 60.0
    if duration_min < 0:
        # Out-of-order timestamps — treat as bad data.
        return None

    return (distance_km, duration_min, first_time)


def main() -> int:
    routes_dir = WORKOUT_ROUTES_DIR
    if not routes_dir.is_dir():
        print(f"ERROR: workout-routes directory not found: {routes_dir}", file=sys.stderr)
        return 1

    gpx_files = sorted(routes_dir.glob("*.gpx"))
    n_total = len(gpx_files)
    if n_total == 0:
        print(f"ERROR: no .gpx files found in {routes_dir}", file=sys.stderr)
        return 1

    print(f"Found {n_total} GPX files in {routes_dir}")

    # Per-day accumulators.
    day_km: dict[str, float] = defaultdict(float)
    day_min: dict[str, float] = defaultdict(float)
    day_count: dict[str, int] = defaultdict(int)

    n_processed = 0
    n_skipped_parse = 0
    n_skipped_thin = 0  # 0 or 1 trkpt
    n_skipped_zero = 0  # parsed but distance==0 and duration==0

    progress_every = max(50, n_total // 20)

    for i, path in enumerate(gpx_files, 1):
        result = parse_gpx(path)
        if result is None:
            # We can't easily distinguish parse-fail vs thin without reparsing;
            # parse_gpx returns None for both. Count both into a combined bucket
            # but we'll keep a single skipped counter with subcategorization
            # by re-checking only on need. For honesty we track them together.
            n_skipped_parse += 1
            if i % progress_every == 0:
                print(f"  [{i}/{n_total}] processed (skipped so far: {n_skipped_parse})")
            continue

        distance_km, duration_min, first_utc = result
        if distance_km == 0.0 and duration_min == 0.0:
            n_skipped_zero += 1
            continue

        local_date = first_utc.astimezone(ISRAEL_TZ).date().isoformat()
        day_km[local_date] += distance_km
        day_min[local_date] += duration_min
        day_count[local_date] += 1
        n_processed += 1

        if i % progress_every == 0:
            print(f"  [{i}/{n_total}] processed (kept: {n_processed}, skipped: {n_skipped_parse + n_skipped_zero})")

    # Build dataframe.
    dates = sorted(day_km.keys())
    rows = []
    for d in dates:
        km = day_km[d]
        mins = day_min[d]
        cnt = day_count[d]
        pace = (mins / km) if km > 0 else float("nan")
        rows.append({
            "date": d,
            "run_km": km,
            "training_min": mins,
            "workout_count": cnt,
            "mean_pace_min_per_km": pace,
        })

    df = pd.DataFrame(rows, columns=["date", "run_km", "training_min", "workout_count", "mean_pace_min_per_km"])

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False, na_rep="")

    # Summary.
    n_skipped = n_skipped_parse + n_skipped_zero
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total GPX files found:        {n_total}")
    print(f"  Processed (kept):           {n_processed}")
    print(f"  Skipped (parse / thin):     {n_skipped_parse}")
    print(f"  Skipped (zero distance+dur):{n_skipped_zero}")
    print(f"  Total skipped:              {n_skipped}")
    print(f"Output rows (unique days):    {len(df)}")
    if len(df) > 0:
        print(f"Date range:                   {df['date'].min()} -> {df['date'].max()}")
        mean_km = df["run_km"].mean()
        total_km = df["run_km"].sum()
        print(f"Mean per-day run_km:          {mean_km:.3f} km")
        print(f"Total km across all workouts: {total_km:.2f} km")
        print()
        top5 = df.sort_values("run_km", ascending=False).head(5)
        print("Top-5 highest-volume days:")
        for _, r in top5.iterrows():
            print(f"  {r['date']}  run_km={r['run_km']:.2f}  workouts={int(r['workout_count'])}")
    print()
    print(f"CSV written to: {OUTPUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
