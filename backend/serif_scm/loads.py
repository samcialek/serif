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
