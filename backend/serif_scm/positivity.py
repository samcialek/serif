"""Positivity check for per-(participant, action) causal insights.

Positivity (aka overlap / common-support) is the precondition that for every
treatment value we care about, the participant actually took that value with
non-zero probability. If someone ran the same distance every day, their
running-volume slope carries no real causal information — any "effect" the
engine attributes is extrapolation beyond support.

This module computes per-participant positivity statistics on the 100-day
action series and maps them to a coarse three-bucket flag ({ok, marginal,
insufficient}) that the export layer uses to suppress or downgrade insights.

Thresholds (chosen to be conservative — prefer false negatives so we don't
silently kill reasonable insights):

    insufficient:  cv < 0.05  AND  range_fraction < 0.2
    marginal:      cv < 0.10  AND  range_fraction < 0.4
    ok:            otherwise

Where `cv = std / |mean - offset|` and `range_fraction = range / |mean - offset|`.
`offset` is 0 for all actions except shifted-clock units (bedtime_hr lives
on a 20-25h scale, so offset=20h anchors the denominator near the actual
behavioural window — see `_DENOMINATOR_OFFSET`). Both cv and range_fraction
must fail for a flag to fire: a series with tiny cv but wide range (e.g.,
heavy-tailed occasional spikes) still gives the engine something to fit.

Action → daily column mapping is explicit because the engine's action
aggregates (running_volume = 30-day sum, training_load = 7-day mean × 1.78,
etc.) collapse the within-person variation the positivity check needs to
see. We go back to the underlying daily column so positivity reflects the
day-to-day variation the causal model actually relies on for identification.
"""

from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd


# ── Thresholds ──────────────────────────────────────────────────────

INSUFFICIENT_CV = 0.05
INSUFFICIENT_RANGE_FRAC = 0.20

MARGINAL_CV = 0.10
MARGINAL_RANGE_FRAC = 0.40

# Per-action denominator offsets applied before cv / range_fraction
# are computed. cv = std / |mean - offset|. Used for shifted-clock
# units where the measurement zero is far from the window being observed:
# bedtime_hr lives on a 20-25h scale so its raw mean (~22.4) inflates
# the cv denominator by ~10×, making even a ±1h swing look like cv≈0.02
# and tripping the 'insufficient' flag for every participant. Anchoring
# at 20h gives a mean-post-offset of ~2.4, cv≈0.18 — which reflects the
# actual behavioural variation the causal fit depends on.
_DENOMINATOR_OFFSET: dict[str, float] = {
    "bedtime": 20.0,  # hours; bedtime_hr observed in [20, 25]
}


# ── Action → daily column mapping ───────────────────────────────────

# Maps engine action names to the raw daily column(s) in lifestyle_app.csv
# whose within-person variation the causal fit depends on. `active_energy` is
# derived from two columns — handled specially below.
_ACTION_TO_DAILY: dict[str, str] = {
    "running_volume": "run_km",
    "training_volume": "training_min",
    "zone2_volume": "zone2_min",
    "steps": "steps",
    "sleep_duration": "sleep_hrs",
    "bedtime": "bedtime_hr",
    "dietary_protein": "protein_g",
    "dietary_energy": "energy_kcal",
    "training_load": "training_min",
}

# Columns we pull from the lifestyle CSV to assemble daily_behavior.
_BEHAVIOR_COLS: tuple[str, ...] = (
    "run_km", "training_min", "zone2_min", "steps",
    "sleep_hrs", "bedtime_hr", "protein_g", "energy_kcal",
)


# ── Daily-series assembly ──────────────────────────────────────────

def build_daily_behavior(life_pid: pd.DataFrame, eval_day: int = 100) -> pd.DataFrame:
    """Forward-/back-fill a participant's sparse lifestyle rows into a
    dense (1..eval_day) daily series. Mirrors transform.py so positivity
    sees exactly the same series the rest of the engine does."""
    base = pd.DataFrame({"day": range(1, eval_day + 1)})
    available = [c for c in _BEHAVIOR_COLS if c in life_pid.columns]
    merged = base.merge(life_pid[["day", *available]], on="day", how="left")
    return merged.ffill().bfill()


def action_daily_series(action: str, daily_behavior: pd.DataFrame) -> np.ndarray | None:
    """Resolve the daily series used for positivity of a given action.
    Returns None for actions with no daily analogue (caller should treat
    as 'ok' — positivity is a no-op for those)."""
    if action == "active_energy":
        if "steps" in daily_behavior.columns and "training_min" in daily_behavior.columns:
            steps = daily_behavior["steps"].to_numpy(dtype=float)
            tmin = daily_behavior["training_min"].to_numpy(dtype=float)
            return steps * 0.04 + tmin * 3.0
        return None
    col = _ACTION_TO_DAILY.get(action)
    if col is None or col not in daily_behavior.columns:
        return None
    return daily_behavior[col].to_numpy(dtype=float)


# ── Metric + flag computation ──────────────────────────────────────

def compute_positivity(series: Iterable[float], action: str | None = None) -> dict:
    """Positivity metrics + flag for a single participant/action series.

    If `action` is in `_DENOMINATOR_OFFSET`, the offset is subtracted from
    the mean before computing cv and range_fraction. This handles shifted-
    clock units (e.g., bedtime_hr on a 20-25h scale) where the raw mean
    inflates the denominator and makes even meaningful variation look
    tiny. The reported `mean` stays in original units.

    Returns a dict suitable for direct JSON export: all floats, all finite
    (NaN/inf replaced with sentinel values so downstream checks never need
    to special-case them).
    """
    arr = np.asarray(list(series), dtype=float)
    arr = arr[np.isfinite(arr)]

    n = int(arr.size)
    if n == 0:
        # No data — treat as insufficient so the insight is suppressed.
        return {
            "n": 0,
            "mean": 0.0,
            "std": 0.0,
            "cv": 0.0,
            "range": 0.0,
            "range_fraction": 0.0,
            "n_distinct": 0,
            "mode_fraction": 1.0,
            "flag": "insufficient",
        }

    mean = float(arr.mean())
    std = float(arr.std(ddof=0))
    vmin = float(arr.min())
    vmax = float(arr.max())
    rng = vmax - vmin

    # cv: std/|mean - offset|. Offset is 0 for all actions except those in
    # _DENOMINATOR_OFFSET (shifted-clock units). With near-zero denominator,
    # declare cv = 0 iff no variation, else a large sentinel so the flag
    # logic (cv < threshold) always reads "high variation".
    offset = _DENOMINATOR_OFFSET.get(action, 0.0) if action else 0.0
    denom = abs(mean - offset)
    if denom < 1e-12:
        cv = 0.0 if std < 1e-12 else 1e6
        range_fraction = 0.0 if rng < 1e-12 else 1e6
    else:
        cv = std / denom
        range_fraction = rng / denom

    # Mode fraction: dominant-value share. Exact float equality is brittle,
    # so we round to the series-scale resolution (1% of std or 1e-6, whichever
    # is larger) before counting. This groups "effectively identical" values
    # without coarsening real variation.
    if std > 0:
        precision = max(std * 0.01, 1e-6)
    else:
        precision = 1e-6
    rounded = np.round(arr / precision).astype(np.int64)
    values, counts = np.unique(rounded, return_counts=True)
    mode_fraction = float(counts.max() / n)
    n_distinct = int(values.size)

    # Flag: both cv/range_fraction metrics must trip for the same severity
    # level. AND (not OR) means heavy-tailed series with a narrow centre
    # still pass — the rare high days are real identification. For actions
    # with _DENOMINATOR_OFFSET, cv and rf are already computed against the
    # rescaled denominator, so the same thresholds apply uniformly.
    if cv < INSUFFICIENT_CV and range_fraction < INSUFFICIENT_RANGE_FRAC:
        flag = "insufficient"
    elif cv < MARGINAL_CV and range_fraction < MARGINAL_RANGE_FRAC:
        flag = "marginal"
    else:
        flag = "ok"

    return {
        "n": n,
        "mean": mean,
        "std": std,
        "cv": cv,
        "range": rng,
        "range_fraction": range_fraction,
        "n_distinct": n_distinct,
        "mode_fraction": mode_fraction,
        "flag": flag,
    }


# ── Batch helper ───────────────────────────────────────────────────

def compute_action_positivity(
    life_pid: pd.DataFrame,
    actions: Iterable[str],
    eval_day: int = 100,
) -> dict[str, dict]:
    """Positivity metrics for every action in `actions`, keyed by action.
    Actions with no daily analogue (unmapped) get flag='ok' with zero
    metrics — they are not subject to positivity gating."""
    daily = build_daily_behavior(life_pid, eval_day=eval_day)
    out: dict[str, dict] = {}
    for action in actions:
        series = action_daily_series(action, daily)
        if series is None:
            out[action] = {
                "n": 0, "mean": 0.0, "std": 0.0, "cv": 0.0,
                "range": 0.0, "range_fraction": 0.0,
                "n_distinct": 0, "mode_fraction": 1.0,
                "flag": "ok",
            }
            continue
        out[action] = compute_positivity(series, action=action)
    return out
