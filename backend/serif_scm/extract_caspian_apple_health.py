"""Stream-extract per-day Apple Health metrics for Caspian.

Reads a 2.5 GB Apple Health export.xml without loading into memory, aggregates
to per-day totals/means in Asia/Jerusalem local time, and writes a CSV.

Run via:
    python -m backend.serif_scm.extract_caspian_apple_health
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime, date
from pathlib import Path
from typing import Dict, Optional, Tuple
from xml.etree.ElementTree import iterparse
from zoneinfo import ZoneInfo

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
INPUT_XML = (
    REPO_ROOT
    / "Oron Afek - Health Data-20260426T143958Z-3-001"
    / "Oron Afek - Health Data"
    / "export"
    / "apple_health_export"
    / "export.xml"
)
OUTPUT_CSV = REPO_ROOT / "backend" / "data" / "caspian_apple_health_metrics_daily.csv"

LOCAL_TZ = ZoneInfo("Asia/Jerusalem")

# Record types we care about.
TYPE_STEPS = "HKQuantityTypeIdentifierStepCount"
TYPE_ACTIVE_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned"
TYPE_BODY_MASS = "HKQuantityTypeIdentifierBodyMass"
TYPE_HEART_RATE = "HKQuantityTypeIdentifierHeartRate"
TYPE_RESTING_HR = "HKQuantityTypeIdentifierRestingHeartRate"
TYPE_EXERCISE_MIN = "HKQuantityTypeIdentifierAppleExerciseTime"
TYPE_VO2_MAX = "HKQuantityTypeIdentifierVO2Max"
TYPE_BODY_FAT = "HKQuantityTypeIdentifierBodyFatPercentage"

INTERESTING_TYPES = frozenset(
    {
        TYPE_STEPS,
        TYPE_ACTIVE_ENERGY,
        TYPE_BODY_MASS,
        TYPE_HEART_RATE,
        TYPE_RESTING_HR,
        TYPE_EXERCISE_MIN,
        TYPE_VO2_MAX,
        TYPE_BODY_FAT,
    }
)

# CSV column order.
COLUMNS = [
    "date",
    "steps",
    "active_energy_kcal",
    "body_mass_kg",
    "body_fat_pct",
    "heart_rate_mean",
    "heart_rate_resting",
    "exercise_minutes",
    "vo2_peak",
]


# ---------------------------------------------------------------------------
# Aggregator
# ---------------------------------------------------------------------------


class DayAgg:
    """Per-day running aggregates. __slots__ to keep memory tight across many days."""

    __slots__ = (
        "steps_sum",
        "active_kcal_sum",
        "body_mass_sum",
        "body_mass_n",
        "body_fat_sum",
        "body_fat_n",
        "hr_sum",
        "hr_n",
        "rhr_sum",
        "rhr_n",
        "exercise_min_sum",
        "vo2_sum",
        "vo2_n",
    )

    def __init__(self) -> None:
        self.steps_sum = 0.0
        self.active_kcal_sum = 0.0
        self.body_mass_sum = 0.0
        self.body_mass_n = 0
        self.body_fat_sum = 0.0
        self.body_fat_n = 0
        self.hr_sum = 0.0
        self.hr_n = 0
        self.rhr_sum = 0.0
        self.rhr_n = 0
        self.exercise_min_sum = 0.0
        self.vo2_sum = 0.0
        self.vo2_n = 0


# ---------------------------------------------------------------------------
# Date parsing
# ---------------------------------------------------------------------------


def parse_local_date(start_date_str: str) -> Optional[date]:
    """Convert an Apple Health startDate string to an Asia/Jerusalem date.

    Apple Health uses the format ``"YYYY-MM-DD HH:MM:SS ±HHMM"``.
    """
    if not start_date_str:
        return None
    try:
        # ``%z`` accepts ``+HHMM`` / ``-HHMM`` forms.
        dt = datetime.strptime(start_date_str, "%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        try:
            dt = datetime.fromisoformat(start_date_str)
        except ValueError:
            return None
    return dt.astimezone(LOCAL_TZ).date()


# ---------------------------------------------------------------------------
# Unit conversions
# ---------------------------------------------------------------------------


def to_kcal(value: float, unit: Optional[str]) -> Optional[float]:
    if unit is None:
        return None
    u = unit.strip().lower()
    if u in ("kcal", "cal"):
        return value
    if u == "kj":
        return value / 4.184
    return None


def to_kg(value: float, unit: Optional[str]) -> Optional[float]:
    if unit is None:
        return None
    u = unit.strip().lower()
    if u == "kg":
        return value
    if u == "lb":
        return value * 0.453592
    return None


# ---------------------------------------------------------------------------
# Main streaming parse
# ---------------------------------------------------------------------------


def stream_extract(
    xml_path: Path,
) -> Tuple[Dict[date, DayAgg], int, Dict[str, int]]:
    days: Dict[date, DayAgg] = defaultdict(DayAgg)
    type_counts: Dict[str, int] = defaultdict(int)
    total_records = 0

    # ``iterparse`` with end-of-element clearing is the canonical low-memory
    # approach. We parse only ``Record`` end events and drop them immediately.
    context = iterparse(str(xml_path), events=("end",))

    for event, elem in context:
        # The DTD declares a lot of ELEMENTs but we only want Record nodes.
        if elem.tag != "Record":
            # Still need to clear non-Record elements so memory stays flat.
            elem.clear()
            continue

        total_records += 1
        if total_records % 100_000 == 0:
            print(
                f"  ...processed {total_records:>12,} records "
                f"({len(days):,} unique days so far)",
                flush=True,
            )

        rtype = elem.get("type")
        if rtype not in INTERESTING_TYPES:
            elem.clear()
            continue

        type_counts[rtype] += 1

        start_str = elem.get("startDate")
        d = parse_local_date(start_str)
        if d is None:
            elem.clear()
            continue

        value_str = elem.get("value")
        if value_str is None:
            elem.clear()
            continue
        try:
            value = float(value_str)
        except ValueError:
            elem.clear()
            continue

        unit = elem.get("unit")
        agg = days[d]

        if rtype == TYPE_STEPS:
            agg.steps_sum += value
        elif rtype == TYPE_ACTIVE_ENERGY:
            kcal = to_kcal(value, unit)
            if kcal is not None:
                agg.active_kcal_sum += kcal
        elif rtype == TYPE_BODY_MASS:
            kg = to_kg(value, unit)
            if kg is not None:
                agg.body_mass_sum += kg
                agg.body_mass_n += 1
        elif rtype == TYPE_BODY_FAT:
            # Apple Health emits body fat as a fraction (0–1) with unit "%".
            # Normalise to percent (0–100) so the column reads naturally.
            pct = value * 100.0 if value <= 1.0 else value
            agg.body_fat_sum += pct
            agg.body_fat_n += 1
        elif rtype == TYPE_HEART_RATE:
            agg.hr_sum += value
            agg.hr_n += 1
        elif rtype == TYPE_RESTING_HR:
            agg.rhr_sum += value
            agg.rhr_n += 1
        elif rtype == TYPE_EXERCISE_MIN:
            agg.exercise_min_sum += value
        elif rtype == TYPE_VO2_MAX:
            agg.vo2_sum += value
            agg.vo2_n += 1

        elem.clear()

    return days, total_records, dict(type_counts)


# ---------------------------------------------------------------------------
# CSV writer
# ---------------------------------------------------------------------------


def _fmt_int(x: float) -> str:
    return str(int(round(x)))


def _fmt_float(x: float, ndigits: int = 3) -> str:
    return f"{round(x, ndigits)}"


def write_csv(days: Dict[date, DayAgg], out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sorted_days = sorted(days.items(), key=lambda kv: kv[0])

    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(COLUMNS)
        for d, a in sorted_days:
            steps = _fmt_int(a.steps_sum) if a.steps_sum > 0 else ""
            active = _fmt_float(a.active_kcal_sum, 3) if a.active_kcal_sum > 0 else ""
            body_mass = (
                _fmt_float(a.body_mass_sum / a.body_mass_n, 3)
                if a.body_mass_n > 0
                else ""
            )
            body_fat = (
                _fmt_float(a.body_fat_sum / a.body_fat_n, 3)
                if a.body_fat_n > 0
                else ""
            )
            hr_mean = _fmt_float(a.hr_sum / a.hr_n, 3) if a.hr_n > 0 else ""
            rhr = _fmt_float(a.rhr_sum / a.rhr_n, 3) if a.rhr_n > 0 else ""
            ex_min = (
                _fmt_float(a.exercise_min_sum, 3) if a.exercise_min_sum > 0 else ""
            )
            vo2 = _fmt_float(a.vo2_sum / a.vo2_n, 3) if a.vo2_n > 0 else ""

            writer.writerow(
                [
                    d.isoformat(),
                    steps,
                    active,
                    body_mass,
                    body_fat,
                    hr_mean,
                    rhr,
                    ex_min,
                    vo2,
                ]
            )

    return len(sorted_days)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def report(
    days: Dict[date, DayAgg],
    total_records: int,
    type_counts: Dict[str, int],
    out_rows: int,
    out_path: Path,
) -> None:
    print()
    print("=" * 64)
    print("Apple Health extract — summary")
    print("=" * 64)
    print(f"Total records scanned : {total_records:>14,}")
    print()
    print("Per-record-type counts (interesting types only):")
    # Stable, predictable order.
    for rtype in [
        TYPE_STEPS,
        TYPE_ACTIVE_ENERGY,
        TYPE_BODY_MASS,
        TYPE_BODY_FAT,
        TYPE_HEART_RATE,
        TYPE_RESTING_HR,
        TYPE_EXERCISE_MIN,
        TYPE_VO2_MAX,
    ]:
        n = type_counts.get(rtype, 0)
        print(f"  {rtype}: {n:,}")

    print()
    print(f"Output rows (unique days): {out_rows:,}")
    if days:
        days_sorted = sorted(days.keys())
        print(f"Date range: {days_sorted[0].isoformat()} -> {days_sorted[-1].isoformat()}")

    # Per-column non-null counts.
    nn_steps = sum(1 for a in days.values() if a.steps_sum > 0)
    nn_active = sum(1 for a in days.values() if a.active_kcal_sum > 0)
    nn_bm = sum(1 for a in days.values() if a.body_mass_n > 0)
    nn_bf = sum(1 for a in days.values() if a.body_fat_n > 0)
    nn_hr = sum(1 for a in days.values() if a.hr_n > 0)
    nn_rhr = sum(1 for a in days.values() if a.rhr_n > 0)
    nn_ex = sum(1 for a in days.values() if a.exercise_min_sum > 0)
    nn_vo2 = sum(1 for a in days.values() if a.vo2_n > 0)
    print()
    print("Non-null day counts per column:")
    print(f"  steps              : {nn_steps:,}")
    print(f"  active_energy_kcal : {nn_active:,}")
    print(f"  body_mass_kg       : {nn_bm:,}")
    print(f"  body_fat_pct       : {nn_bf:,}")
    print(f"  heart_rate_mean    : {nn_hr:,}")
    print(f"  heart_rate_resting : {nn_rhr:,}")
    print(f"  exercise_minutes   : {nn_ex:,}")
    print(f"  vo2_peak           : {nn_vo2:,}")

    # Means for sanity.
    def _mean(vals):
        vals = [v for v in vals if v is not None]
        return sum(vals) / len(vals) if vals else float("nan")

    steps_vals = [a.steps_sum for a in days.values() if a.steps_sum > 0]
    rhr_vals = [a.rhr_sum / a.rhr_n for a in days.values() if a.rhr_n > 0]
    bm_vals = [a.body_mass_sum / a.body_mass_n for a in days.values() if a.body_mass_n > 0]
    print()
    print("Means (sanity):")
    print(f"  steps              : {_mean(steps_vals):.2f}")
    print(f"  heart_rate_resting : {_mean(rhr_vals):.2f}")
    print(f"  body_mass_kg       : {_mean(bm_vals):.3f}")

    print()
    print(f"Wrote: {out_path}")
    print("=" * 64)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> int:
    if not INPUT_XML.exists():
        print(f"ERROR: input XML not found: {INPUT_XML}", file=sys.stderr)
        return 2

    print(f"Streaming parse of: {INPUT_XML}")
    print(f"Local timezone    : Asia/Jerusalem")
    print(f"Output CSV        : {OUTPUT_CSV}")
    print()

    days, total_records, type_counts = stream_extract(INPUT_XML)
    out_rows = write_csv(days, OUTPUT_CSV)
    report(days, total_records, type_counts, out_rows, OUTPUT_CSV)
    return 0


if __name__ == "__main__":
    sys.exit(main())
