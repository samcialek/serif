"""Rolling cumulative load metrics.

Loads are derived from raw daily behavior. They surface as confounders
(in user-observation regressions), as moderators (future interaction
terms in the hierarchical model), and as context (Today's context strip
in the portal).

Conventions:
    - Default acute window = 7 days, chronic window = 28 days.
    - Personal baseline for deviations = 28-day rolling mean.
    - At least 14 days of history required before a load stabilises.
    - Sleep debt uses 14-day target-deficit sum (matches
      generator.compute_sleep_debt).

Outputs are plain floats per day; DataFrame helpers at the bottom
augment a per-participant lifestyle frame with load columns so they
can be written to CSV and consumed by the fitting code.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np
import pandas as pd


# ── Single-day scalar metrics (rolling history → one number) ─────────


def acwr(trimp_history: Sequence[float], acute: int = 7, chronic: int = 28) -> float:
    """Acute:Chronic Workload Ratio.

    Classic Gabbett (2016) formulation: mean training load over the last
    `acute` days divided by the mean over the last `chronic` days. 1.0 is
    perfectly matched acute and chronic load; >1.3 is the "danger zone".
    Returns 1.0 when history is too short or chronic load is ~0.
    """
    if len(trimp_history) < chronic:
        return 1.0
    a = float(np.mean(trimp_history[-acute:]))
    c = float(np.mean(trimp_history[-chronic:]))
    if c < 1e-6:
        return 1.0
    return a / c


def ctl(trimp_history: Sequence[float], tau: int = 42) -> float:
    """Chronic Training Load — 42-day exponentially-weighted TRIMP mean.

    Banister impulse-response convention: CTL decays with time constant
    `tau` = 42 days, matching the biomarker-horizon bucket for
    fitness/endurance adaptations.
    """
    if len(trimp_history) == 0:
        return 0.0
    alpha = 1.0 / tau
    s = 0.0
    w = 0.0
    for i, v in enumerate(reversed(trimp_history)):
        decay = (1 - alpha) ** i
        s += decay * float(v)
        w += decay
    return s / w if w > 0 else 0.0


def atl(trimp_history: Sequence[float], tau: int = 7) -> float:
    """Acute Training Load — 7-day exponentially-weighted TRIMP mean."""
    return ctl(trimp_history, tau=tau)


def tsb(trimp_history: Sequence[float]) -> float:
    """Training Stress Balance = CTL - ATL. Negative = fatigued."""
    return ctl(trimp_history) - atl(trimp_history)


def sleep_debt_14d(sleep_history: Sequence[float], target: float = 7.5) -> float:
    """14-day accumulated sleep debt (hours below target)."""
    recent = sleep_history[-14:] if len(sleep_history) >= 14 else sleep_history
    return float(sum(max(0.0, target - float(h)) for h in recent))


def sri_7d(bedtimes: Sequence[float], waketimes: Sequence[float] | None = None) -> float:
    """Sleep Regularity Index over the last 7 days.

    Proxy SRI: 100 × (1 − normalised midsleep SD). Midsleep = bedtime +
    (waketime − bedtime)/2 handling midnight wraparound. If waketimes
    aren't provided, uses bedtime SD as a proxy (lower = more regular).

    Returns 100 when history is too short (assumption: stable baseline).
    """
    bed = list(bedtimes)[-7:]
    if len(bed) < 3:
        return 100.0
    if waketimes is not None:
        wake = list(waketimes)[-7:]
        mids = []
        for b, w in zip(bed, wake):
            b_h = float(b) % 24
            w_h = float(w) % 24
            dur = w_h - b_h if w_h > b_h else (24 - b_h + w_h)
            mids.append((b_h + dur / 2) % 24)
        sigma = float(np.std(mids))
    else:
        # Use bedtime SD directly as the irregularity proxy.
        sigma = float(np.std([float(x) % 24 for x in bed]))
    # Map sigma (hours) to 0-100 score. 0h SD = 100. 3h SD ≈ 0.
    score = max(0.0, 100.0 * (1 - sigma / 3.0))
    return score


def training_monotony(trimp_history: Sequence[float], window: int = 7) -> float:
    """Foster training monotony = mean / SD over the last `window` days.

    Values >2 are associated with overreaching risk; <1.5 is healthy
    variation. Returns 1.0 when history is insufficient or SD is ~0.
    """
    recent = trimp_history[-window:]
    if len(recent) < 3:
        return 1.0
    mean = float(np.mean(recent))
    sd = float(np.std(recent))
    if sd < 1e-3:
        return 1.0 if mean < 1.0 else 10.0  # constant nonzero load → monotony high
    return mean / sd


def training_consistency(
    training_history: Sequence[float], window: int = 90, min_minutes: float = 5.0
) -> float:
    """Fraction of days with any training in the window."""
    recent = training_history[-window:] if len(training_history) >= window else training_history
    if len(recent) == 0:
        return 0.5
    return float(sum(1 for t in recent if t > min_minutes) / len(recent))


# ── Baseline + deviation helpers ────────────────────────────────────


@dataclass(frozen=True)
class BaselineDeviation:
    """A load value against the person's own rolling-mean baseline.

    `z` uses the 28-day SD; use `ratio` (current / baseline) when SD is
    tiny or the quantity is naturally ratiometric (ACWR, monotony).
    """
    value: float
    baseline: float
    sd: float
    z: float
    ratio: float


def personal_deviation(
    series: Sequence[float], window: int = 28
) -> BaselineDeviation:
    """Compare the latest value to a personal rolling window."""
    arr = np.asarray(list(series), dtype=float)
    if len(arr) == 0:
        return BaselineDeviation(0.0, 0.0, 0.0, 0.0, 1.0)
    recent = arr[-window:] if len(arr) > 1 else arr
    value = float(arr[-1])
    baseline = float(np.mean(recent))
    sd = float(np.std(recent))
    z = 0.0 if sd < 1e-6 else (value - baseline) / sd
    ratio = 1.0 if abs(baseline) < 1e-6 else value / baseline
    return BaselineDeviation(value=value, baseline=baseline, sd=sd, z=z, ratio=ratio)


# ── DataFrame augmentation ──────────────────────────────────────────


def augment_lifestyle(df: pd.DataFrame) -> pd.DataFrame:
    """Add load columns to a per-participant lifestyle frame.

    Expects columns `run_km`, `training_min`, `sleep_hrs`, `bedtime_hr`
    plus a monotonically-increasing `day` index. Computes load series
    by walking day-by-day so each row reflects the history available up
    to (but not including) that day's action — a causal-order contract
    for use in the fitting code.
    """
    if "day" not in df.columns:
        raise KeyError("augment_lifestyle requires a 'day' column")

    df = df.sort_values("day").reset_index(drop=True)
    trimp_hist: list[float] = []
    sleep_hist: list[float] = []
    bedtime_hist: list[float] = []
    training_hist: list[float] = []

    acwr_vals: list[float] = []
    ctl_vals: list[float] = []
    atl_vals: list[float] = []
    tsb_vals: list[float] = []
    sleep_debt_vals: list[float] = []
    sri_vals: list[float] = []
    monotony_vals: list[float] = []
    consistency_vals: list[float] = []

    for _, row in df.iterrows():
        # Load at t depends only on history prior to t (causal contract).
        acwr_vals.append(acwr(trimp_hist))
        ctl_vals.append(ctl(trimp_hist))
        atl_vals.append(atl(trimp_hist))
        tsb_vals.append(ctl_vals[-1] - atl_vals[-1])
        sleep_debt_vals.append(sleep_debt_14d(sleep_hist))
        sri_vals.append(sri_7d(bedtime_hist))
        monotony_vals.append(training_monotony(trimp_hist))
        consistency_vals.append(training_consistency(training_hist))

        # Push today's values into the history buffers for tomorrow.
        trimp = float(row.get("training_min", 0) or 0) * 1.78
        trimp_hist.append(trimp)
        sleep_hist.append(float(row.get("sleep_hrs", 0) or 0))
        bedtime_hist.append(float(row.get("bedtime_hr", 23) or 23))
        training_hist.append(float(row.get("training_min", 0) or 0))

    df = df.copy()
    df["acwr"] = acwr_vals
    df["ctl"] = ctl_vals
    df["atl"] = atl_vals
    df["tsb"] = tsb_vals
    df["sleep_debt_14d"] = sleep_debt_vals
    df["sri_7d"] = sri_vals
    df["training_monotony"] = monotony_vals
    df["training_consistency"] = consistency_vals
    return df


def augment_all_lifestyle(life_df: pd.DataFrame) -> pd.DataFrame:
    """Apply augment_lifestyle independently per participant."""
    if "participant_id" not in life_df.columns:
        raise KeyError("augment_all_lifestyle requires 'participant_id'")
    return (
        life_df.groupby("participant_id", group_keys=False)
        .apply(augment_lifestyle)
        .reset_index(drop=True)
    )


# ── Today's loads summary for portal export ────────────────────────


LOAD_COLUMNS: tuple[str, ...] = (
    "acwr", "ctl", "atl", "tsb",
    "sleep_debt_14d", "sri_7d",
    "training_monotony", "training_consistency",
)


def compute_loads_today(life_df_pid: pd.DataFrame) -> dict[str, float]:
    """Most-recent load row for one participant as a plain dict."""
    augmented = augment_lifestyle(life_df_pid)
    if len(augmented) == 0:
        return {c: 0.0 for c in LOAD_COLUMNS}
    last = augmented.iloc[-1]
    return {c: float(last[c]) for c in LOAD_COLUMNS if c in augmented.columns}


def compute_loads_summary(
    life_df_pid: pd.DataFrame,
    window: int = 28,
) -> dict[str, dict[str, float]]:
    """Return {load: {value, baseline, sd, z, ratio}} for every load column.

    Used by the portal export so the UI can render a Context strip
    without re-running augment on the client.
    """
    augmented = augment_lifestyle(life_df_pid)
    out: dict[str, dict[str, float]] = {}
    for col in LOAD_COLUMNS:
        if col not in augmented.columns:
            continue
        dev = personal_deviation(augmented[col].tolist(), window=window)
        out[col] = {
            "value": dev.value,
            "baseline": dev.baseline,
            "sd": dev.sd,
            "z": dev.z,
            "ratio": dev.ratio,
        }
    return out


# ── Weather as a causal confounder ──────────────────────────────────
#
# SYNTHETIC placeholder. Shape and fields are production-ready (a real
# weather API would emit the same keys), but the values come from a
# deterministic sinusoidal model keyed on (cohort, day_of_year), not a
# live data source. Swap the body of `weather_for_day` for a fetcher
# against OpenWeatherMap / Visual Crossing / similar when ready — the
# frontend and downstream causal pipeline don't need to change.
#
# Keyed on cohort because Serif's canonical cohort labels map to
# specific regions (cohort_a = Delhi, cohort_b = Abu Dhabi, cohort_c =
# remote/temperate). Day of year drives the seasonal sinusoid.


WEATHER_COLUMNS: tuple[str, ...] = (
    "temp_c",
    "humidity_pct",
    "uv_index",
    "heat_index_c",
    "aqi",
)


_CITY_PROFILES: dict[str, dict[str, float]] = {
    # Delhi — humid subtropical; hot summers, smog-heavy winters
    "cohort_a": {
        "temp_mean": 25.0,
        "temp_amp": 11.0,
        "humidity_mean": 55.0,
        "humidity_amp": 18.0,
        "uv_peak": 10.0,
        "aqi_mean": 180.0,
        "aqi_winter_bump": 100.0,
    },
    # Abu Dhabi — hot desert; extreme summer, mild winter
    "cohort_b": {
        "temp_mean": 30.0,
        "temp_amp": 13.0,
        "humidity_mean": 50.0,
        "humidity_amp": 15.0,
        "uv_peak": 11.0,
        "aqi_mean": 90.0,
        "aqi_winter_bump": 20.0,
    },
    # Remote / temperate (northern mid-latitude)
    "cohort_c": {
        "temp_mean": 15.0,
        "temp_amp": 12.0,
        "humidity_mean": 62.0,
        "humidity_amp": 12.0,
        "uv_peak": 8.0,
        "aqi_mean": 40.0,
        "aqi_winter_bump": 15.0,
    },
}


def _season_phase(day_of_year: int) -> float:
    """Return a phase in [-1, 1] where +1 is northern-hemisphere summer
    peak (mid-July, day ~196) and -1 is winter trough (mid-January)."""
    import math
    # Peak summer ~ day 196; use cos centered there.
    return math.cos(2.0 * math.pi * ((day_of_year - 196) / 365.25))


def _daily_jitter(cohort: str, day_of_year: int, which: str) -> float:
    """Deterministic small perturbation in [-1, 1] for day-to-day
    variation. Hash-based so the same (cohort, day, which) always
    returns the same value."""
    import hashlib
    key = f"{cohort}:{day_of_year}:{which}".encode("utf-8")
    h = int(hashlib.md5(key).hexdigest()[:8], 16)
    return (h / 0xFFFFFFFF) * 2.0 - 1.0


def _heat_index(temp_c: float, humidity_pct: float) -> float:
    """Simplified heat-index: temp plus a humidity premium that kicks
    in above 27°C. Close enough to Steadman for demo purposes."""
    if temp_c < 27.0:
        return temp_c
    # ~0.08°C bump per % humidity above 40% when hot.
    excess_rh = max(0.0, humidity_pct - 40.0)
    return temp_c + 0.08 * excess_rh * ((temp_c - 27.0) / 13.0)


def weather_for_day(cohort: str, day_of_year: int) -> dict[str, float]:
    """Synthetic daily weather for (cohort, day_of_year).

    Returns: temp_c, humidity_pct, uv_index, heat_index_c, aqi.
    Deterministic — same inputs always yield the same values.
    """
    profile = _CITY_PROFILES.get(cohort) or _CITY_PROFILES["cohort_c"]
    phase = _season_phase(day_of_year)  # +1 summer, -1 winter

    temp_c = profile["temp_mean"] + profile["temp_amp"] * phase
    temp_c += 2.5 * _daily_jitter(cohort, day_of_year, "temp")

    humidity_pct = profile["humidity_mean"] + profile["humidity_amp"] * phase
    humidity_pct += 6.0 * _daily_jitter(cohort, day_of_year, "humid")
    humidity_pct = max(15.0, min(95.0, humidity_pct))

    # UV peaks with the sun; positive phase = higher UV, winter floor ≈ 2.
    uv_index = max(2.0, profile["uv_peak"] * max(0.25, (phase + 1) / 2))
    uv_index += 0.6 * _daily_jitter(cohort, day_of_year, "uv")
    uv_index = max(0.0, uv_index)

    heat_index_c = _heat_index(temp_c, humidity_pct)

    # AQI rises in winter (inversion layers trap pollutants).
    winter_weight = max(0.0, -phase)
    aqi = profile["aqi_mean"] + profile["aqi_winter_bump"] * winter_weight
    aqi += 15.0 * _daily_jitter(cohort, day_of_year, "aqi")
    aqi = max(5.0, aqi)

    return {
        "temp_c":       round(float(temp_c), 1),
        "humidity_pct": round(float(humidity_pct), 0),
        "uv_index":     round(float(uv_index), 1),
        "heat_index_c": round(float(heat_index_c), 1),
        "aqi":          round(float(aqi), 0),
    }


def weather_history(
    cohort: str, today_day_of_year: int, n_days: int = 14,
) -> dict[str, list[float]]:
    """Per-column last-N-days weather series, oldest-first. Last entry
    matches weather_for_day(cohort, today_day_of_year)."""
    cols: dict[str, list[float]] = {c: [] for c in WEATHER_COLUMNS}
    start = today_day_of_year - n_days + 1
    for d in range(start, today_day_of_year + 1):
        # Wrap to 1..365 for negative edge cases.
        doy = ((d - 1) % 365) + 1
        w = weather_for_day(cohort, doy)
        for c in WEATHER_COLUMNS:
            cols[c].append(float(w[c]))
    return cols


# ── Real-data overrides (Caspian / pid=1) ─────────────────────────

# Cached lookup of caspian_weather.csv keyed by ISO date string. Lazy
# loaded; None when the file isn't present (so the synthetic path keeps
# working in dev environments without the CSV).
_CASPIAN_WEATHER_CACHE: dict[str, dict[str, object]] | None = None


def _load_caspian_weather() -> dict[str, dict[str, object]] | None:
    """Load backend/data/caspian_weather.csv into a date-keyed dict.
    Returns None if the file is missing. Cached across calls."""
    global _CASPIAN_WEATHER_CACHE
    if _CASPIAN_WEATHER_CACHE is not None:
        return _CASPIAN_WEATHER_CACHE
    from pathlib import Path
    path = Path(__file__).resolve().parent.parent / "data" / "caspian_weather.csv"
    if not path.exists():
        return None
    df = pd.read_csv(path)
    out: dict[str, dict[str, object]] = {}
    for _, row in df.iterrows():
        out[str(row["date"])] = {
            "location_id":   str(row["location_id"]) if "location_id" in row and pd.notna(row["location_id"]) else None,
            "city":          str(row["city"]) if "city" in row and pd.notna(row["city"]) else None,
            "country":       str(row["country"]) if "country" in row and pd.notna(row["country"]) else None,
            "latitude":      float(row["latitude"]) if "latitude" in row and pd.notna(row["latitude"]) else None,
            "longitude":     float(row["longitude"]) if "longitude" in row and pd.notna(row["longitude"]) else None,
            "timezone":      str(row["timezone"]) if "timezone" in row and pd.notna(row["timezone"]) else None,
            "location_confidence": float(row["location_confidence"]) if "location_confidence" in row and pd.notna(row["location_confidence"]) else None,
            "location_source": str(row["location_source"]) if "location_source" in row and pd.notna(row["location_source"]) else None,
            "temp_c":       float(row["temp_c"]) if pd.notna(row["temp_c"]) else None,
            "humidity_pct": float(row["humidity_pct"]) if pd.notna(row["humidity_pct"]) else None,
            "heat_index_c": float(row["heat_index_c"]) if pd.notna(row["heat_index_c"]) else None,
            "aqi":          float(row["aqi"]) if pd.notna(row["aqi"]) else None,
            "sunshine_h":   float(row["sunshine_h"]) if pd.notna(row["sunshine_h"]) else None,
            "uv_index":     float(row["uv_index"]) if "uv_index" in row and pd.notna(row["uv_index"]) else None,
        }
    _CASPIAN_WEATHER_CACHE = out
    return out


def real_weather_for_date(
    date: "_dt.date | str",
    cohort: str = "cohort_a",
) -> dict[str, float] | None:
    """Location-aware weather for `date` from caspian_weather.csv. Falls
    back to the cohort pattern for missing keys. Returns None if the CSV isn't loaded or the date is
    outside its coverage — caller should fall through to weather_for_day.
    """
    import datetime as _dt
    cache = _load_caspian_weather()
    if cache is None:
        return None
    if isinstance(date, _dt.date):
        date_str = date.isoformat()
    else:
        date_str = str(date)
    real = cache.get(date_str)
    if real is None:
        return None
    # Day-of-year for the cohort fallbacks.
    try:
        d_obj = _dt.date.fromisoformat(date_str)
    except ValueError:
        return None
    doy = d_obj.timetuple().tm_yday
    synth = weather_for_day(cohort, doy)
    return {
        "temp_c":       round(float(real["temp_c"]), 1) if real["temp_c"] is not None else synth["temp_c"],
        "humidity_pct": round(float(real["humidity_pct"]), 0) if real["humidity_pct"] is not None else synth["humidity_pct"],
        "uv_index":     round(float(real["uv_index"]), 1) if real.get("uv_index") is not None else synth["uv_index"],
        "heat_index_c": round(float(real["heat_index_c"]), 1) if real["heat_index_c"] is not None else synth["heat_index_c"],
        "aqi":          round(float(real["aqi"]), 0) if real["aqi"] is not None else synth["aqi"],
    }


def real_weather_location_for_date(date: "_dt.date | str") -> dict[str, object] | None:
    """Location metadata for the same row used by real_weather_for_date."""
    import datetime as _dt
    cache = _load_caspian_weather()
    if cache is None:
        return None
    date_str = date.isoformat() if isinstance(date, _dt.date) else str(date)
    real = cache.get(date_str)
    if real is None:
        return None
    return {
        "location_id": real.get("location_id"),
        "city": real.get("city"),
        "country": real.get("country"),
        "latitude": real.get("latitude"),
        "longitude": real.get("longitude"),
        "timezone": real.get("timezone"),
        "confidence": real.get("location_confidence"),
        "source": real.get("location_source"),
    }


def real_weather_history_for_date(
    end_date: "_dt.date | str",
    cohort: str = "cohort_a",
    n_days: int = 14,
) -> dict[str, list[float]] | None:
    """Last n_days of real weather ending at end_date. Falls back to
    synthetic per-day when the date isn't covered. Returns None when
    the CSV isn't loaded — caller should use weather_history."""
    import datetime as _dt
    cache = _load_caspian_weather()
    if cache is None:
        return None
    if isinstance(end_date, str):
        end_date = _dt.date.fromisoformat(end_date)
    cols: dict[str, list[float]] = {c: [] for c in WEATHER_COLUMNS}
    for offset in range(n_days - 1, -1, -1):
        d = end_date - _dt.timedelta(days=offset)
        w = real_weather_for_date(d, cohort)
        if w is None:
            # Outside the CSV span — fall back to synthetic for that day.
            w = weather_for_day(cohort, d.timetuple().tm_yday)
        for c in WEATHER_COLUMNS:
            cols[c].append(float(w[c]))
    return cols


def compute_loads_history(
    life_df_pid: pd.DataFrame,
    n_days: int = 14,
) -> dict[str, list[float]]:
    """Last `n_days` daily values of each load, oldest-first.

    Used by the Protocols tab to render per-item causal sparklines (#5)
    and drive the yesterday-vs-today diff mode (#4). The last entry of
    each list matches loads_today's value.
    """
    augmented = augment_lifestyle(life_df_pid)
    if len(augmented) == 0:
        return {col: [] for col in LOAD_COLUMNS}
    tail = augmented.tail(n_days)
    out: dict[str, list[float]] = {}
    for col in LOAD_COLUMNS:
        if col not in tail.columns:
            continue
        out[col] = [float(v) for v in tail[col].tolist()]
    return out


def compute_regimes_history(
    life_df_pid: pd.DataFrame,
    blood_df_pid: pd.DataFrame | None,
    n_days: int = 14,
) -> dict[str, list[float]]:
    """Last `n_days` daily regime activations, oldest-first.

    Uses the SAME inputs and helpers as the live regime_activations in
    export_portal_bayesian.main() (transform.compute_acwr with 7/28-day
    windows, transform.compute_sleep_debt with target=8.0h) so that
    history[-1] matches today's regime_activations exactly — no drift
    between the two routes.

    Biomarkers (ferritin, hscrp) change only at blood draws; for days
    between draws we forward-fill from the most recent draw-day ≤ day_t,
    and back-fill from the first-ever draw for pre-first-draw days.
    """
    # Lazy imports so this module stays importable from test fixtures
    # that don't load the full engine.
    from .reconcile import compute_regime_activations
    from .transform import compute_acwr, compute_sleep_debt

    if life_df_pid is None or len(life_df_pid) == 0:
        return {
            "overreaching_state": [],
            "iron_deficiency_state": [],
            "sleep_deprivation_state": [],
            "inflammation_state": [],
        }
    df = life_df_pid.sort_values("day").reset_index(drop=True)
    last_day = int(df["day"].iloc[-1])
    # Build a continuous daily frame so index alignment matches the
    # main() regime computation.
    daily = (
        pd.DataFrame({"day": range(1, last_day + 1)})
        .merge(df[["day", "training_min", "sleep_hrs"]], on="day", how="left")
        .ffill()
        .bfill()
    )
    training = daily["training_min"].tolist()
    sleep = daily["sleep_hrs"].tolist()

    def _biomarker_by_day(col: str) -> dict[int, float]:
        if blood_df_pid is None or len(blood_df_pid) == 0 or col not in blood_df_pid.columns:
            return {}
        rows = blood_df_pid[["draw_day", col]].dropna().sort_values("draw_day")
        return {int(r["draw_day"]): float(r[col]) for _, r in rows.iterrows()}

    ferritin_by_day = _biomarker_by_day("ferritin")
    hscrp_by_day = _biomarker_by_day("hscrp")

    def _lookup(series_by_day: dict[int, float], day: int) -> float:
        if not series_by_day:
            return 0.0
        days = sorted(series_by_day.keys())
        ffilled = [d for d in days if d <= day]
        if ffilled:
            return series_by_day[ffilled[-1]]
        return series_by_day[days[0]]

    first_day = max(1, last_day - n_days + 1)
    history: dict[str, list[float]] = {
        "overreaching_state": [],
        "iron_deficiency_state": [],
        "sleep_deprivation_state": [],
        "inflammation_state": [],
    }
    for day in range(first_day, last_day + 1):
        observed = {
            "acwr":       compute_acwr(training, day - 1),
            "sleep_debt": compute_sleep_debt(sleep, day - 1),
            "ferritin":   _lookup(ferritin_by_day, day),
            "hscrp":      _lookup(hscrp_by_day, day),
        }
        activations = compute_regime_activations(observed)
        for key in history.keys():
            history[key].append(float(activations.get(key, 0.0)))
    return history
