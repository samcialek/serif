"""Exploration math — engine-side mirror of the Phase-3 frontend math
at src/utils/exploration.ts + src/utils/experimentPrescription.ts.

Emits three standardized quantities for each exploration candidate:

    prior_cohens_d          — expected slope magnitude on the d-scale
                               (σ_outcome-normalized, dimensionless)
    prior_cohens_d_sd       — uncertainty on that slope, d-scale
    expected_posterior_narrow
                            — fraction of σ_prior that a successful
                               experiment would eliminate, via a
                               conjugate-Normal update:

        σ_post² = 1 / (1/σ_prior² + n_eff / σ_obs²)
        narrow  = 1 − σ_post / σ_prior       ∈ [0, 1]

Plus a per-action experiment-prescription table so the backend can
emit the full `experiment: ExperimentSpec` payload the frontend
consumes. Keep this table in sync with
src/utils/experimentPrescription.ts — they are intentionally a two-way
mirror. If they diverge, the frontend treats the backend emission as
authoritative (it checks the rec for each field before falling back
on heuristics).
"""

from __future__ import annotations

import math
from typing import Literal

from .synthetic.config import BIOMARKER_PRIORS, WEARABLE_PRIORS


# ── Constants ─────────────────────────────────────────────────────

# Per-observation residual SD on the d-scale after confounder
# adjustment. Mirrors SIGMA_OBS_D in src/utils/exploration.ts. Tuned as
# a conservative default; a follow-up could calibrate this per-outcome
# from BART residuals.
SIGMA_OBS_D: float = 0.4

# Observations per day on the d-scale per pathway. Wearables deliver
# one slope-informative daily observation; biomarker draws are sparse,
# so even a "daily" biomarker experiment is diluted to 1/14. Mirrors
# OBS_PER_DAY_BY_PATHWAY in src/utils/exploration.ts.
OBS_PER_DAY_BY_PATHWAY: dict[str, float] = {
    "wearable": 1.0,
    "biomarker": 1.0 / 14.0,
}

# Fallback SDs on d when user_obs doesn't carry a posterior.sd (rare —
# weak_default layer). Keyed by evidence tier.
PRIOR_D_SD_FALLBACK: dict[str, float] = {
    "cohort_level": 0.35,
    "personal_emerging": 0.22,
    "personal_established": 0.14,
}


# ── Cohort-SD lookup ──────────────────────────────────────────────

def _outcome_sd(outcome: str) -> float:
    """Cohort marginal SD for an outcome, pulled from the synthetic
    priors that already drive the frontend's OUTCOME_SD table."""
    if outcome in WEARABLE_PRIORS:
        return float(WEARABLE_PRIORS[outcome].std)
    if outcome in BIOMARKER_PRIORS:
        return float(BIOMARKER_PRIORS[outcome].std)
    return 1.0


# Behavioral-action SDs — fallback when participant.behavioral_sds
# doesn't carry a key. Tuned against the cohort synthetic; mirrors
# FALLBACK_ACTION_SD on the frontend.
FALLBACK_ACTION_SD: dict[str, float] = {
    "bedtime":         0.6,
    "sleep_duration":  0.8,
    "running_volume":  6.0,
    "steps":           3_000.0,
    "training_load":   25.0,
    "active_energy":   400.0,
    "zone2_volume":    6.0,
    "zone2_minutes":   30.0,
    "zone4_5_minutes": 10.0,
    "training_volume": 0.8,
    "dietary_protein": 25.0,
    "dietary_energy":  400.0,
    "caffeine_mg":     100.0,
    "caffeine_timing": 1.5,
    "alcohol_units":   1.5,
    "alcohol_timing":  1.5,
    "acwr":            0.25,
    "sleep_debt":      1.5,
    "travel_load":     1.0,
}


def _action_sd(action: str, behavioral_sds: dict[str, float] | None) -> float:
    if behavioral_sds is not None:
        v = behavioral_sds.get(action)
        if v is not None and v > 1e-6:
            return float(v)
    return FALLBACK_ACTION_SD.get(action, 1.0)


# ── Cohen's d on the row's posterior ──────────────────────────────

def prior_cohens_d(
    row: dict,
    behavioral_sds: dict[str, float] | None = None,
) -> float:
    """Standardized expected slope from the row's Bayesian posterior.

        d = (posterior.mean / nominal_step) × σ_action / σ_outcome
    """
    step = float(row.get("nominal_step") or 0.0)
    if abs(step) < 1e-12:
        return 0.0
    sd_out = _outcome_sd(row["outcome"])
    if sd_out < 1e-12:
        return 0.0
    posterior = row.get("posterior") or {}
    mean = float(posterior.get("mean", 0.0))
    sd_act = _action_sd(row["action"], behavioral_sds)
    return (mean / step) * sd_act / sd_out


def prior_cohens_d_sd(
    row: dict,
    behavioral_sds: dict[str, float] | None = None,
) -> float:
    """Uncertainty on prior_cohens_d — scales posterior.sd to d-units
    the same way prior_cohens_d scales the mean. Falls back to a
    tier-based default when posterior.sd is missing."""
    step = float(row.get("nominal_step") or 0.0)
    if abs(step) < 1e-12:
        return _tier_fallback(row)
    sd_out = _outcome_sd(row["outcome"])
    if sd_out < 1e-12:
        return _tier_fallback(row)
    posterior = row.get("posterior") or {}
    sd_post = posterior.get("sd")
    if sd_post is None:
        return _tier_fallback(row)
    sd_act = _action_sd(row["action"], behavioral_sds)
    scaled = abs(float(sd_post) / step) * sd_act / sd_out
    if scaled > 1e-9:
        return scaled
    return _tier_fallback(row)


def _tier_fallback(row: dict) -> float:
    user = row.get("user_obs") or {}
    tier = row.get("evidence_tier")
    if tier is None:
        # Attempt to infer tier the same way the export does.
        n = int(user.get("n", 0) or 0)
        if n >= 15:
            tier = "personal_established"
        elif n >= 5:
            tier = "personal_emerging"
        else:
            tier = "cohort_level"
    return PRIOR_D_SD_FALLBACK.get(tier, 0.3)


# ── Conjugate-Normal narrow ───────────────────────────────────────

Cadence = Literal["daily", "n_per_week", "one_shot"]


def effective_sample_size(
    cadence: Cadence,
    duration_days: int,
    pathway: str,
    n_per_week: int | None = None,
) -> float:
    """n_eff for the conjugate-Normal update on the slope.

    One-shot draws count as n=1. Daily/weekly cadences scale by
    duration × obs-per-day, adjusted for weekly density when cadence
    is n_per_week.
    """
    if cadence == "one_shot":
        return 1.0
    obs_per_day = OBS_PER_DAY_BY_PATHWAY.get(pathway, 1.0)
    if cadence == "daily":
        return max(1.0, duration_days * obs_per_day)
    weekly_fraction = (n_per_week or 3) / 7.0
    return max(1.0, duration_days * obs_per_day * weekly_fraction)


def expected_posterior_narrow(
    prior_sd: float,
    cadence: Cadence,
    duration_days: int,
    pathway: str,
    n_per_week: int | None = None,
) -> float:
    """Fraction of σ_prior that a successful experiment would
    eliminate. Clamped to [0, 1]. Returns 0 when prior_sd ≈ 0."""
    if prior_sd < 1e-9:
        return 0.0
    n_eff = effective_sample_size(cadence, duration_days, pathway, n_per_week)
    sigma_prior_sq = prior_sd * prior_sd
    sigma_obs_sq = SIGMA_OBS_D * SIGMA_OBS_D
    sigma_post_sq = 1.0 / (1.0 / sigma_prior_sq + n_eff / sigma_obs_sq)
    sigma_post = math.sqrt(sigma_post_sq)
    narrow = 1.0 - sigma_post / prior_sd
    return max(0.0, min(1.0, narrow))


# ── Experiment prescription table ─────────────────────────────────

# Mirrors VARY_ACTION_PRESCRIPTIONS in src/utils/experimentPrescription.ts.
# Keep in sync manually. Each entry is the design the frontend would
# show the coach; the backend emits it so downstream consumers (Python
# notebooks, future APIs) can reuse the same prescription.
VARY_ACTION_PRESCRIPTIONS: dict[str, dict] = {
    "bedtime":         {"action_range_delta": (-0.5, 0.5),  "cadence": "daily", "duration_days": 14},
    "sleep_duration":  {"action_range_delta": (-0.75, 0.75),"cadence": "daily", "duration_days": 14},
    "caffeine_timing": {"action_range_delta": (-3, 0),      "cadence": "daily", "duration_days": 10, "washout_days": 2},
    "caffeine_mg":     {"action_range_delta": (-100, 0),    "cadence": "daily", "duration_days": 10},
    "alcohol_units":   {"action_range_delta": (-2, 0),      "cadence": "daily", "duration_days": 14},
    "alcohol_timing":  {"action_range_delta": (-2, 0),      "cadence": "daily", "duration_days": 10},
    "zone2_volume":    {"action_range_delta": (0, 90),      "cadence": "n_per_week", "n_per_week": 3, "duration_days": 21},
    "zone2_minutes":   {"action_range_delta": (0, 45),      "cadence": "n_per_week", "n_per_week": 3, "duration_days": 21},
    "zone4_5_minutes": {"action_range_delta": (0, 20),      "cadence": "n_per_week", "n_per_week": 2, "duration_days": 28},
    "running_volume":  {"action_range_delta": (-4, 4),      "cadence": "daily", "duration_days": 21},
    "training_load":   {"action_range_delta": (-25, 25),    "cadence": "daily", "duration_days": 21},
    "training_volume": {"action_range_delta": (-1.5, 1.5),  "cadence": "daily", "duration_days": 21},
    "steps":           {"action_range_delta": (-3000, 3000),"cadence": "daily", "duration_days": 14},
    "active_energy":   {"action_range_delta": (-200, 200),  "cadence": "daily", "duration_days": 14},
    "dietary_protein": {"action_range_delta": (0, 30),      "cadence": "daily", "duration_days": 28},
    "dietary_energy":  {"action_range_delta": (-300, 300),  "cadence": "daily", "duration_days": 28},
    "acwr":            {"action_range_delta": (-0.2, 0.2),  "cadence": "daily", "duration_days": 21},
    "sleep_debt":      {"action_range_delta": (-2, 0),      "cadence": "daily", "duration_days": 14},
}

REPEAT_DRAW_INTERVAL_DAYS: dict[str, int] = {
    "hscrp": 21, "cortisol": 14, "glucose": 28, "insulin": 28,
    "testosterone": 45, "apob": 56, "ldl": 56, "hdl": 56,
    "triglycerides": 42, "ferritin": 56, "hemoglobin": 56,
    "iron_total": 42, "zinc": 42, "hba1c": 90, "vo2_peak": 45,
}
DEFAULT_REPEAT_DAYS = 56


def prescription_for(
    action: str,
    outcome: str,
    kind: str,
    user_n: int,
    pathway: str,
    prior_d: float,
    has_current_value: bool,
    positivity_flag: str,
) -> dict:
    """Return a fully-resolved ExperimentSpec dict including feasibility."""
    if kind == "repeat_measurement":
        duration = REPEAT_DRAW_INTERVAL_DAYS.get(outcome, DEFAULT_REPEAT_DAYS)
        base = {
            "action_range_delta": [0, 0],
            "cadence": "one_shot",
            "duration_days": duration,
        }
    else:
        if action in VARY_ACTION_PRESCRIPTIONS:
            raw = VARY_ACTION_PRESCRIPTIONS[action]
            base = {
                "action_range_delta": list(raw["action_range_delta"]),
                "cadence": raw["cadence"],
                "duration_days": raw["duration_days"],
            }
            if "n_per_week" in raw:
                base["n_per_week"] = raw["n_per_week"]
            if "washout_days" in raw:
                base["washout_days"] = raw["washout_days"]
        else:
            base = {
                "action_range_delta": [-1.0, 1.0],
                "cadence": "daily",
                "duration_days": 14,
            }

    feasibility, note = _feasibility_for(
        kind=kind, action=action, outcome=outcome,
        user_n=user_n, pathway=pathway, prior_d=prior_d,
        has_current_value=has_current_value,
        positivity_flag=positivity_flag,
    )
    base["feasibility"] = feasibility
    if note is not None:
        base["feasibility_note"] = note
    return base


def _feasibility_for(
    *,
    kind: str,
    action: str,
    outcome: str,
    user_n: int,
    pathway: str,
    prior_d: float,
    has_current_value: bool,
    positivity_flag: str,
) -> tuple[str, str | None]:
    if abs(prior_d) < 0.05:
        return (
            "blocked",
            "Cohort prior shows almost no effect. Even a perfect experiment would add little.",
        )
    if kind == "vary_action":
        if not has_current_value:
            return (
                "needs_baseline",
                f"No current {action.replace('_', ' ')} measurement — log a baseline first.",
            )
        if user_n < 3:
            s = "" if user_n == 1 else "s"
            return (
                "needs_baseline",
                f"Only {user_n} personal observation{s}. Collect more baseline before varying.",
            )
        if positivity_flag == "insufficient":
            return (
                "ready",
                "Current variation is too flat for causal inference — this experiment fixes that.",
            )
        return ("ready", None)

    # repeat_measurement
    if user_n < 1:
        return (
            "needs_baseline",
            f"No baseline draw for {outcome.replace('_', ' ')} — order the first one.",
        )
    return ("ready", None)


# ── Top-level convenience ─────────────────────────────────────────

def enrich_row(
    row: dict,
    kind: str,
    pathway: str,
    behavioral_sds: dict[str, float] | None,
    current_values: dict[str, float] | None,
    horizon_days: int | None,
) -> dict:
    """Compute every Phase-3 field for one exploration row. Returns a
    dict of the extra fields to merge into the emission. Does NOT
    mutate the row."""
    d = prior_cohens_d(row, behavioral_sds)
    d_sd = prior_cohens_d_sd(row, behavioral_sds)
    user_n = int((row.get("user_obs") or {}).get("n", 0) or 0)
    has_current = bool(current_values and row["action"] in current_values)
    spec = prescription_for(
        action=row["action"],
        outcome=row["outcome"],
        kind=kind,
        user_n=user_n,
        pathway=pathway,
        prior_d=d,
        has_current_value=has_current,
        positivity_flag=row.get("positivity_flag", "ok"),
    )
    narrow = expected_posterior_narrow(
        prior_sd=d_sd,
        cadence=spec["cadence"],
        duration_days=spec["duration_days"],
        pathway=pathway,
        n_per_week=spec.get("n_per_week"),
    )
    return {
        "prior_cohens_d": float(d),
        "prior_cohens_d_sd": float(d_sd),
        "expected_posterior_narrow": float(narrow),
        "horizon_days": int(horizon_days) if horizon_days is not None else None,
        "experiment": spec,
    }
