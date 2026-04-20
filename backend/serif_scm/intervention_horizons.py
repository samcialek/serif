"""Intervention horizons — days-to-first-signal for each outcome.

Single source of truth for how long an intervention takes to produce a
detectable change in a given outcome. Used by:
  - protocols.py: setting protocol evaluation window
  - export_portal_bayesian.py: horizon_days / horizon_display per recommendation
  - user_observations.py: pathway routing (wearable vs biomarker)

The split is mechanical, not biological: wearable outcomes get updated daily
so first signal surfaces in days; biomarker outcomes come from blood draws on
a 100-day schedule so the horizon reflects biological turnover time (half-
life, protein synthesis, RBC lifespan) rather than measurement cadence.
"""

from __future__ import annotations


# ── Wearable outcomes (daily cadence) ──────────────────────────────
# Days until an intervention's effect crosses measurement noise at daily
# cadence. Tight because wearables integrate many short observations.
WEARABLE_HORIZONS: dict[str, int] = {
    "hrv_daily":        4,
    "resting_hr":       4,
    "sleep_quality":    2,
    "sleep_efficiency": 2,
    "deep_sleep":       3,
}


# ── Biomarker outcomes (100-day lab cadence) ───────────────────────
# Days for biological turnover / equilibration. Derived from clinical
# practice and mechanism-of-action literature. Clustered by physiological
# process:
#
#   28 days  — fast turnover (glucose/cortisol/WBC; acute inflammation)
#   35 days  — diet-responsive lipid subset (triglycerides)
#   42 days  — sex hormones, fitness markers, liver enzymes, chronic
#              inflammation markers, uric acid
#   56 days  — iron status (ferritin half-life), albumin, micronutrients,
#              VO2 max training adaptation
#   70 days  — HDL particle turnover
#   84 days  — cholesterol particle kinetics, body composition, long
#              erythrocyte-dependent markers
#   90 days  — HbA1c (full RBC glycation window), omega-3 incorporation
BIOMARKER_HORIZONS: dict[str, int] = {
    # Iron / hematology
    "ferritin": 56, "iron_total": 56, "hemoglobin": 84,
    "rbc": 84, "mcv": 84, "rdw": 56, "nlr": 28,
    "wbc": 28, "platelets": 42,
    # Lipids
    "apob": 84, "ldl": 84, "non_hdl_cholesterol": 84,
    "total_cholesterol": 84, "hdl": 70, "triglycerides": 35,
    # Metabolic
    "hba1c": 90, "glucose": 28, "insulin": 28, "uric_acid": 42,
    # Inflammation / hormones
    "hscrp": 42, "testosterone": 42, "cortisol": 28,
    "estradiol": 42, "dhea_s": 42, "shbg": 42,
    # Micronutrients
    "zinc": 56, "magnesium_rbc": 84, "b12": 56, "folate": 56,
    "homocysteine": 56, "omega3_index": 90,
    # Liver / kidney
    "ast": 42, "alt": 42, "creatinine": 42, "albumin": 56,
    # Fitness / body composition
    "vo2_peak": 56, "body_fat_pct": 84, "body_mass_kg": 84,
}


def get_horizon(outcome: str) -> int | None:
    """Days-to-first-signal for any outcome. None if outcome is unknown.

    Biomarker table takes precedence on the assumption that future outcomes
    may have both wearable proxies and blood-draw confirmations — if the
    caller is asking about the long-horizon version, it lives here.
    """
    if outcome in BIOMARKER_HORIZONS:
        return BIOMARKER_HORIZONS[outcome]
    if outcome in WEARABLE_HORIZONS:
        return WEARABLE_HORIZONS[outcome]
    return None


def pathway_for(outcome: str) -> str | None:
    """'wearable' | 'biomarker' | None. None signals an unknown outcome."""
    if outcome in BIOMARKER_HORIZONS:
        return "biomarker"
    if outcome in WEARABLE_HORIZONS:
        return "wearable"
    return None


def horizon_display(days: int) -> str:
    """User-facing label. <=21 days → '{n} days', else rounded weeks.

    Weeks are rounded to the nearest integer (7 day half-week ties round up
    per Python's Banker's rounding; add a small nudge if the UI wants
    tie-breaking toward more time).
    """
    if days <= 21:
        return f"{days} days"
    weeks = round(days / 7)
    return f"{weeks} weeks"
