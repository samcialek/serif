"""Stream-extract per-day Apple Health workouts + sleep records.

Complements extract_caspian_apple_health.py (which extracts quantity
metrics like steps, HR, energy). This pulls two element kinds the
quantity-metric extractor doesn't touch:

  1. <Workout> elements — per-workout activity type, distance,
     duration, energy. Aggregated by Asia/Jerusalem date and broken
     out by HKWorkoutActivityType (Running / Cycling / Walking / etc.)
     so we can serve clean run-only mileage downstream — fixing the
     GPX extractor's known limitation of mixing all GPS-tracked
     activities into a single run_km column.

  2. <Record type="HKCategoryTypeIdentifierSleepAnalysis" .../> — per-
     stage segments. Aggregated by sleep-end-date (so a session that
     ends Tuesday morning counts as Tuesday's night). Closes the
     AutoSleep gap from 2023-06 onward when AutoSleep stopped logging
     but the watch continued to record native sleep stages.

Streaming-only — never load the 2.5 GB file. iterparse + elem.clear().

Run:
    python -m backend.serif_scm.extract_caspian_workouts_and_sleep
"""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, Optional, Tuple
from xml.etree.ElementTree import iterparse
from zoneinfo import ZoneInfo


REPO_ROOT = Path(__file__).resolve().parents[2]
INPUT_XML = (
    REPO_ROOT
    / "Oron Afek - Health Data-20260426T143958Z-3-001"
    / "Oron Afek - Health Data"
    / "export"
    / "apple_health_export"
    / "export.xml"
)
WORKOUTS_CSV = REPO_ROOT / "backend" / "data" / "caspian_apple_health_workouts_daily.csv"
SLEEP_CSV = REPO_ROOT / "backend" / "data" / "caspian_apple_health_sleep_daily.csv"

LOCAL_TZ = ZoneInfo("Asia/Jerusalem")


# ── Workout activity type buckets ───────────────────────────────────
# Apple Health activity types are very granular ("HKWorkoutActivityTypeMartialArts",
# "HKWorkoutActivityTypePilates", etc.). Bucket the common athletic ones into
# canonical labels the engine cares about; everything else lands under "other".
WORKOUT_BUCKET = {
    "HKWorkoutActivityTypeRunning": "run",
    "HKWorkoutActivityTypeWalking": "walking",
    "HKWorkoutActivityTypeHiking": "walking",
    "HKWorkoutActivityTypeCycling": "cycling",
    "HKWorkoutActivityTypeSwimming": "swim",
    "HKWorkoutActivityTypeRowing": "row",
    "HKWorkoutActivityTypeElliptical": "cardio_other",
    "HKWorkoutActivityTypeStairClimbing": "cardio_other",
    "HKWorkoutActivityTypeTraditionalStrengthTraining": "strength",
    "HKWorkoutActivityTypeFunctionalStrengthTraining": "strength",
    "HKWorkoutActivityTypeCoreTraining": "strength",
    "HKWorkoutActivityTypeYoga": "mobility",
    "HKWorkoutActivityTypeFlexibility": "mobility",
}
WORKOUT_COLUMNS = [
    "date",
    "run_km", "run_min",
    "cycling_km", "cycling_min",
    "walking_km", "walking_min",
    "swim_km", "swim_min",
    "strength_min",
    "cardio_other_min",
    "mobility_min",
    "other_km", "other_min",
    "total_km", "total_min", "total_kcal",
    "workout_count",
]


# ── Sleep stage buckets ─────────────────────────────────────────────
SLEEP_VALUES = {
    "HKCategoryValueSleepAnalysisAsleepCore": "core_min",
    "HKCategoryValueSleepAnalysisAsleepDeep": "deep_min",
    "HKCategoryValueSleepAnalysisAsleepREM": "rem_min",
    "HKCategoryValueSleepAnalysisAsleepUnspecified": "asleep_unspecified_min",
    "HKCategoryValueSleepAnalysisAsleep": "asleep_unspecified_min",
    "HKCategoryValueSleepAnalysisAwake": "awake_min",
    "HKCategoryValueSleepAnalysisInBed": "in_bed_min",
}
SLEEP_COLUMNS = [
    "date",
    "asleep_min",   # sum of core + deep + REM + unspecified
    "deep_min",
    "rem_min",
    "core_min",
    "asleep_unspecified_min",
    "awake_min",
    "in_bed_min",
    "sleep_efficiency",  # asleep / in_bed (only when both present)
    "sessions",  # number of sleep records contributing to this date
]
SLEEP_RECORD_TYPE = "HKCategoryTypeIdentifierSleepAnalysis"


# ── Date helpers ────────────────────────────────────────────────────

def _parse(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S %z")
    except ValueError:
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            return None


def _local_date(dt: datetime) -> date:
    return dt.astimezone(LOCAL_TZ).date()


def _duration_minutes(start: datetime, end: datetime) -> float:
    return max(0.0, (end - start).total_seconds() / 60.0)


# ── Aggregators ─────────────────────────────────────────────────────

class WorkoutAgg:
    __slots__ = (
        "run_km", "run_min", "cycling_km", "cycling_min",
        "walking_km", "walking_min", "swim_km", "swim_min",
        "strength_min", "cardio_other_min", "mobility_min",
        "other_km", "other_min", "total_kcal", "count",
    )

    def __init__(self) -> None:
        for s in self.__slots__:
            setattr(self, s, 0.0 if not s.endswith("count") else 0)

    @property
    def total_km(self) -> float:
        return (self.run_km + self.cycling_km + self.walking_km + self.swim_km + self.other_km)

    @property
    def total_min(self) -> float:
        return (
            self.run_min + self.cycling_min + self.walking_min + self.swim_min
            + self.strength_min + self.cardio_other_min + self.mobility_min + self.other_min
        )


class SleepAgg:
    __slots__ = (
        "core_min", "deep_min", "rem_min", "asleep_unspecified_min",
        "awake_min", "in_bed_min", "sessions",
    )

    def __init__(self) -> None:
        for s in self.__slots__:
            setattr(self, s, 0.0 if s != "sessions" else 0)

    @property
    def asleep_min(self) -> float:
        # Two well-known dirtiness modes in Apple Health sleep records:
        #
        # 1) Modern devices record stage breakdowns (Core/Deep/REM); older
        #    iOS / watchOS records bare AsleepUnspecified for the same
        #    interval. Both arrive in the export. PREFER STAGES when
        #    present — they're the authoritative modern signal — and
        #    ignore the duplicated Unspecified for those days.
        # 2) For unspecified-only days (older data, before stage tracking),
        #    the watch syncing across iCloud-paired devices can record the
        #    same interval many times. We've seen days with 19+ sessions
        #    summing to >30 h — physically impossible. Cap at 720 min
        #    (12 h) — anything above is duplication noise we can't dedupe
        #    cleanly without merging interval-by-interval.
        stages = self.core_min + self.deep_min + self.rem_min
        if stages > 0:
            return stages
        return min(self.asleep_unspecified_min, 720.0)


# ── Streaming parse ─────────────────────────────────────────────────

# Apple Health stores workout distance/energy in <WorkoutStatistics>
# child elements, not on the Workout attribute itself. Read them via
# the parent's children at end-event time.
DISTANCE_TYPES = (
    "HKQuantityTypeIdentifierDistanceWalkingRunning",
    "HKQuantityTypeIdentifierDistanceCycling",
    "HKQuantityTypeIdentifierDistanceSwimming",
)


def _read_workout_distance_km(workout_elem) -> float:
    """Sum WorkoutStatistics distance children, converting unit to km."""
    total = 0.0
    for stat in workout_elem.findall("WorkoutStatistics"):
        if stat.get("type") not in DISTANCE_TYPES:
            continue
        sum_str = stat.get("sum")
        if sum_str is None:
            continue
        try:
            v = float(sum_str)
        except ValueError:
            continue
        unit = stat.get("unit", "km")
        if unit == "km":
            total += v
        elif unit == "mi":
            total += v * 1.609344
        elif unit == "m":
            total += v / 1000.0
        elif unit == "yd":
            total += v * 0.0009144
    return total


def _read_workout_active_kcal(workout_elem) -> float:
    """Sum the ActiveEnergyBurned WorkoutStatistics child(ren)."""
    total = 0.0
    for stat in workout_elem.findall("WorkoutStatistics"):
        if stat.get("type") != "HKQuantityTypeIdentifierActiveEnergyBurned":
            continue
        sum_str = stat.get("sum")
        if sum_str is None:
            continue
        try:
            v = float(sum_str)
        except ValueError:
            continue
        unit = stat.get("unit", "kcal")
        if unit in ("kcal", "Cal"):
            total += v
        elif unit == "kJ":
            total += v / 4.184
    return total


def stream_extract(xml_path: Path) -> Tuple[Dict[date, WorkoutAgg], Dict[date, SleepAgg], Dict[str, int]]:
    workouts: Dict[date, WorkoutAgg] = defaultdict(WorkoutAgg)
    sleep: Dict[date, SleepAgg] = defaultdict(SleepAgg)
    counts: Dict[str, int] = defaultdict(int)

    total = 0
    # Memory-flat invariant: only clear() top-level elements (Record,
    # Workout) — not their children. iterparse fires end events for
    # children BEFORE the parent's end event, so children are still
    # attached to the parent when we see the parent's end event. If we
    # cleared children eagerly, the parent's findall(...) would return
    # nothing on the parent end-event.
    context = iterparse(str(xml_path), events=("end",))
    for _, elem in context:
        tag = elem.tag
        if tag == "Workout":
            counts["workouts_total"] += 1
            total += 1
            atype = elem.get("workoutActivityType", "")
            bucket = WORKOUT_BUCKET.get(atype, "other")
            counts[f"workout_bucket:{bucket}"] += 1

            start = _parse(elem.get("startDate"))
            end = _parse(elem.get("endDate"))
            if start is None:
                elem.clear()
                continue
            d = _local_date(start)

            # Duration: prefer the `duration` attribute on the workout.
            duration_str = elem.get("duration")
            duration_unit = elem.get("durationUnit", "min")
            duration_min: Optional[float] = None
            if duration_str:
                try:
                    v = float(duration_str)
                    if duration_unit == "min":
                        duration_min = v
                    elif duration_unit == "hr":
                        duration_min = v * 60.0
                    elif duration_unit == "s":
                        duration_min = v / 60.0
                except ValueError:
                    pass
            if duration_min is None and end is not None:
                duration_min = _duration_minutes(start, end)
            if duration_min is None:
                duration_min = 0.0

            # Distance + energy come from WorkoutStatistics children.
            distance_km = _read_workout_distance_km(elem)
            energy_kcal = _read_workout_active_kcal(elem)

            agg = workouts[d]
            agg.count += 1
            agg.total_kcal += energy_kcal
            if bucket == "run":
                agg.run_km += distance_km
                agg.run_min += duration_min
            elif bucket == "cycling":
                agg.cycling_km += distance_km
                agg.cycling_min += duration_min
            elif bucket == "walking":
                agg.walking_km += distance_km
                agg.walking_min += duration_min
            elif bucket == "swim":
                agg.swim_km += distance_km
                agg.swim_min += duration_min
            elif bucket == "strength":
                agg.strength_min += duration_min
            elif bucket == "cardio_other":
                agg.cardio_other_min += duration_min
            elif bucket == "mobility":
                agg.mobility_min += duration_min
            else:
                agg.other_km += distance_km
                agg.other_min += duration_min

            # Done with this Workout — now safe to clear it (and its
            # WorkoutStatistics / WorkoutEvent children).
            elem.clear()

        elif tag == "Record":
            rtype = elem.get("type")
            if rtype != SLEEP_RECORD_TYPE:
                elem.clear()
                continue

            counts["sleep_total"] += 1
            total += 1
            start = _parse(elem.get("startDate"))
            end = _parse(elem.get("endDate"))
            if start is None or end is None:
                elem.clear()
                continue

            value = elem.get("value", "")
            stage = SLEEP_VALUES.get(value)
            if stage is None:
                counts[f"sleep_unmapped:{value}"] += 1
                elem.clear()
                continue

            counts[f"sleep_stage:{stage}"] += 1
            duration_min = _duration_minutes(start, end)

            # Assign to the local date the sleep ENDS on. A session that
            # starts at 23:30 Mon and ends at 06:30 Tue counts as Tuesday
            # (matches AutoSleep convention + how a coach reads "last night").
            d = _local_date(end)
            agg = sleep[d]
            agg.sessions += 1
            cur = getattr(agg, stage, 0.0)
            setattr(agg, stage, cur + duration_min)
            elem.clear()

        # Other top-level types (Correlation, ActivitySummary, etc.) and
        # any element we haven't handled: clear so memory stays flat.
        # WorkoutStatistics / WorkoutEvent children inside Workout are
        # NOT cleared here because their end fires before Workout's end
        # — they get cleared by the Workout's elem.clear() above.
        elif tag not in ("WorkoutStatistics", "WorkoutEvent", "MetadataEntry",
                         "FileReference", "WorkoutRoute", "HeartRateVariabilityMetadataList",
                         "InstantaneousBeatsPerMinute"):
            elem.clear()

        if total and total % 200_000 == 0:
            print(
                f"  ...processed {total:>10,} workout+sleep events "
                f"({len(workouts):,} workout days, {len(sleep):,} sleep days)",
                flush=True,
            )

    return workouts, sleep, dict(counts)


# ── CSV writers ─────────────────────────────────────────────────────

def _fnum(x: float, ndigits: int = 3) -> str:
    if x == 0:
        return ""
    return f"{round(x, ndigits)}"


def write_workouts_csv(workouts: Dict[date, WorkoutAgg], path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted(workouts.items(), key=lambda kv: kv[0])
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(WORKOUT_COLUMNS)
        for d, a in rows:
            w.writerow([
                d.isoformat(),
                _fnum(a.run_km), _fnum(a.run_min),
                _fnum(a.cycling_km), _fnum(a.cycling_min),
                _fnum(a.walking_km), _fnum(a.walking_min),
                _fnum(a.swim_km), _fnum(a.swim_min),
                _fnum(a.strength_min),
                _fnum(a.cardio_other_min),
                _fnum(a.mobility_min),
                _fnum(a.other_km), _fnum(a.other_min),
                _fnum(a.total_km), _fnum(a.total_min), _fnum(a.total_kcal),
                a.count,
            ])
    return len(rows)


def write_sleep_csv(sleep: Dict[date, SleepAgg], path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = sorted(sleep.items(), key=lambda kv: kv[0])
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(SLEEP_COLUMNS)
        for d, a in rows:
            asleep = a.asleep_min
            in_bed = a.in_bed_min
            eff = ""
            # AutoSleep-style efficiency: asleep / (asleep + awake) when in_bed
            # is missing or smaller (older devices); else asleep / in_bed.
            denom = max(in_bed, asleep + a.awake_min)
            if denom > 0 and asleep > 0:
                eff = _fnum(min(100.0, 100.0 * asleep / denom), 2)
            w.writerow([
                d.isoformat(),
                _fnum(asleep, 1),
                _fnum(a.deep_min, 1),
                _fnum(a.rem_min, 1),
                _fnum(a.core_min, 1),
                _fnum(a.asleep_unspecified_min, 1),
                _fnum(a.awake_min, 1),
                _fnum(a.in_bed_min, 1),
                eff,
                a.sessions,
            ])
    return len(rows)


# ── Reporting ───────────────────────────────────────────────────────

def report(
    workouts: Dict[date, WorkoutAgg],
    sleep: Dict[date, SleepAgg],
    counts: Dict[str, int],
) -> None:
    print()
    print("=" * 64)
    print("Apple Health workouts + sleep — summary")
    print("=" * 64)

    print(f"Workouts total: {counts.get('workouts_total', 0):,}")
    bucket_keys = sorted(k for k in counts if k.startswith("workout_bucket:"))
    for k in bucket_keys:
        print(f"  {k}: {counts[k]:,}")
    print(f"Workout days: {len(workouts):,}")
    if workouts:
        days_sorted = sorted(workouts.keys())
        print(f"  date range: {days_sorted[0].isoformat()} -> {days_sorted[-1].isoformat()}")
        run_total = sum(a.run_km for a in workouts.values())
        cycling_total = sum(a.cycling_km for a in workouts.values())
        walking_total = sum(a.walking_km for a in workouts.values())
        print(f"  total run km    : {run_total:>10.1f}")
        print(f"  total cycling km: {cycling_total:>10.1f}")
        print(f"  total walking km: {walking_total:>10.1f}")

    print()
    print(f"Sleep records total: {counts.get('sleep_total', 0):,}")
    stage_keys = sorted(k for k in counts if k.startswith("sleep_stage:"))
    for k in stage_keys:
        print(f"  {k}: {counts[k]:,}")
    unmapped = sorted(k for k in counts if k.startswith("sleep_unmapped:"))
    for k in unmapped:
        print(f"  {k}: {counts[k]:,}")
    print(f"Sleep days: {len(sleep):,}")
    if sleep:
        days_sorted = sorted(sleep.keys())
        print(f"  date range: {days_sorted[0].isoformat()} -> {days_sorted[-1].isoformat()}")
        nn_deep = sum(1 for a in sleep.values() if a.deep_min > 0)
        nn_rem = sum(1 for a in sleep.values() if a.rem_min > 0)
        print(f"  days with deep>0 : {nn_deep:,}")
        print(f"  days with REM>0  : {nn_rem:,}")
        asleep_means = [a.asleep_min for a in sleep.values() if a.asleep_min > 0]
        if asleep_means:
            mean_asleep = sum(asleep_means) / len(asleep_means)
            print(f"  mean asleep_min  : {mean_asleep:.1f}  ({mean_asleep/60:.2f} h)")


def main() -> int:
    if not INPUT_XML.exists():
        print(f"ERROR: input XML not found: {INPUT_XML}", file=sys.stderr)
        return 2

    print(f"Streaming parse of: {INPUT_XML}")
    print(f"Local timezone    : Asia/Jerusalem")
    print()

    workouts, sleep, counts = stream_extract(INPUT_XML)
    nw = write_workouts_csv(workouts, WORKOUTS_CSV)
    ns = write_sleep_csv(sleep, SLEEP_CSV)
    report(workouts, sleep, counts)
    print()
    print(f"Wrote: {WORKOUTS_CSV}  ({nw:,} rows)")
    print(f"Wrote: {SLEEP_CSV}  ({ns:,} rows)")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    sys.exit(main())
