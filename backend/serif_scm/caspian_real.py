"""Caspian's real persona-anchored values.

Backend mirror of `src/data/personas/caspian.ts` — the values declared
there are treated as authoritative. The synthetic generator produces
cohort-realistic random draws for participant_0001 (the engine's stand-
in for Caspian); this module supplies the persona-real overrides that
get applied at export time so the emitted JSON the UI consumes carries
his actual labs / wearable summaries / demographics rather than
cohort-synthetic noise.

Scope of override (Path A — export-time):
  - meta: age
  - outcome_baselines: wearable 30d means + biomarker latest-draw values
  - loads_today: real ACWR / CTL where the persona declares them

NOT overridden (Path A limitations):
  - Daily time-series (HRV/sleep/training per-day arrays). The persona
    doesn't carry these, so the synthetic 4012-day series stays.
  - effects_bayesian posteriors. These are fit on the synthetic data;
    Path B (CSV-input replacement + re-fit) is what makes those use
    his real labs.

When caspian.ts gets updated, mirror the change here. Keep the field
names identical to the JSON keys the export emits (so the override
loop is a simple `state[k] = v` per field).

Sourced from the most-recent lab draw containing each biomarker
(2025-11-22 panel except for hba1c/insulin/lipids which roll back to
2025-03-15 — the last comprehensive metabolic panel).
"""

from __future__ import annotations


# pid that maps to Caspian in the synthetic cohort. participant_0001
# is the engine's stand-in across Insights / Twin / Protocols.
CASPIAN_PID: int = 1


# ── Demographics ──────────────────────────────────────────────────

CASPIAN_AGE: int = 38
CASPIAN_IS_FEMALE: bool = False
# Cohort stays cohort_a — no override; Tel Aviv is captured in the
# weather routing layer (loads.real_weather_for_date).


# ── Wearable 30d means (currentMetrics from caspian.ts) ───────────
# Maps directly into outcome_baselines for wearable outcomes.

CASPIAN_OUTCOME_BASELINES_WEARABLE: dict[str, float] = {
    "hrv_daily":        32.0,    # Apple Health SDNN 30d mean
    "resting_hr":       52.0,    # Apple Health 30d mean
    "deep_sleep":       54.0,    # Apple Health sleep stages 30d mean
    "rem_sleep":        91.0,    # Apple Health sleep stages 30d mean
    # body_mass_kg lives on the biomarker side per BIOMARKER_HORIZONS;
    # weight is real here (Apple Health latest body mass).
    "body_mass_kg":     72.8,
}


# ── Biomarker latest-draw values ──────────────────────────────────
# Most recent value per biomarker across the 6 lab draws. Picks the
# latest draw that contains each marker (some panels are partial).
# All values are in the same units the synthetic generator + frontend
# expect (matches BIOMARKER_PRIORS in synthetic/config.py).

CASPIAN_OUTCOME_BASELINES_BIOMARKER: dict[str, float] = {
    # Iron status — the headline of his archetype
    "ferritin":     46.0,    # 2025-11-22 (low end; trended from 24 → 46 with intervention)
    "iron_total":   37.0,    # 2025-11-22 (still low; below clinical threshold)
    # Inflammation
    "hscrp":        0.3,     # 2025-11-22 (excellent — anti-inflammatory)
    # Metabolic
    "glucose":      96.0,    # 2025-11-22 fastingGlucose
    "hba1c":        5.2,     # 2025-11-22
    "insulin":      5.1,     # 2025-11-22
    # Lipids
    "ldl":          68.0,    # 2025-11-22
    "hdl":          43.0,    # 2025-11-22
    "triglycerides": 62.0,   # 2025-11-22
    "total_cholesterol": 125.0,  # 2025-11-22
    "apob":         61.0,    # 2025-11-22
    # Hormones
    "testosterone": 348.0,   # 2025-11-22 (low-normal)
    "cortisol":     11.1,    # 2025-11-22 (calm HPA)
    # Other
    "vitamin_d":    47.0,    # 2025-11-22 (close to optimal)
}


def caspian_outcome_baselines() -> dict[str, float]:
    """Combined wearable + biomarker baselines. Use at export time to
    overwrite synthetic baselines for participant_0001."""
    out: dict[str, float] = {}
    out.update(CASPIAN_OUTCOME_BASELINES_WEARABLE)
    out.update(CASPIAN_OUTCOME_BASELINES_BIOMARKER)
    return out


# ── Load summary overrides ────────────────────────────────────────
# Real values from caspian.ts loads section. Only overrides the load
# `value` (not baseline / sd / z); those derive from his rolling
# history which stays synthetic for now.

CASPIAN_LOADS_TODAY_VALUES: dict[str, float] = {
    "acwr":     0.69,    # caspian.ts: ACWR 0.69 — below habitual
    "ctl":      11.2,    # caspian.ts: CTL 11.2
    # tsb: persona doesn't declare; derive from CTL - ATL synthetic
}
