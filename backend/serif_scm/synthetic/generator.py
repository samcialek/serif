"""
Serif Synthetic Data Generator
==============================

Generates causally consistent data for 1,188 participants over a 100-day program.

Approach: SCM-forward generation
  1. Sample Day 1 baseline (demographics, blood draw, wearable baseline)
  2. Compute personalized recommendations from Day 1 profile
  3. Simulate 100 days of behavioral dynamics (AR(1) toward recommendation targets)
  4. Propagate behavioral changes through the SCM structural equations
  5. Biomarkers evolve via exponential approach to SCM equilibrium (tau = response time)
  6. Observe: blood draws on Day 1 + Day 100, wearables daily, lifestyle via app

Usage:
    python -m serif_scm.synthetic.generator [--output-dir ./output] [--seed 42]
"""

from __future__ import annotations

import json
import math
import argparse
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd

from .config import (
    N_TOTAL, PROGRAM_DAYS, BLOOD_DRAW_DAYS, SEED,
    COHORTS, CohortDef,
    AGE_MEAN, AGE_STD, AGE_CLIP, FEMALE_FRACTION,
    BEHAVIORAL_PRIORS, BIOMARKER_PRIORS, WEARABLE_PRIORS,
    DOSE_COLUMN_MAP, TARGET_COLUMN_MAP,
    ADHERENCE_DECAY_HALFLIFE_DAYS, ADHERENCE_FLOOR, BEHAVIORAL_ADAPTATION_DAYS,
)
from ..rich_member_data import attach_rich_member_data

# ── Edge loading ────────────────────────────────────────────────

EDGE_DATA_PATH = Path(__file__).resolve().parents[3] / "src" / "data" / "dataValue" / "edgeSummaryRaw.json"


def load_edges() -> list[dict]:
    """Load fitted edge parameters + regime equations from the TypeScript project."""
    # Try the relative path first, fall back to sibling location
    for path in [EDGE_DATA_PATH, Path(__file__).parent / "edgeSummaryRaw.json"]:
        if path.exists():
            edges = json.loads(path.read_text())
            return edges + REGIME_EDGE_DEFS
    raise FileNotFoundError(f"Cannot find edgeSummaryRaw.json (tried {EDGE_DATA_PATH})")


# Regime equations matching doseResponse.ts REGIME_EQUATIONS
# These aren't in edgeSummaryRaw — they represent mechanistic priors.
REGIME_EDGE_DEFS: list[dict] = [
    # Activation edges (sigmoid)
    {"source": "acwr",       "target": "overreaching_state",       "curve": "sigmoid", "theta": 1.5, "bb": 5.0,  "ba": 1.0, "eff_n": 50, "personal_pct": 0},
    {"source": "ferritin",   "target": "iron_deficiency_state",    "curve": "sigmoid", "theta": 30,  "bb": -0.2, "ba": 1.0, "eff_n": 30, "personal_pct": 0},
    {"source": "sleep_debt", "target": "sleep_deprivation_state",  "curve": "sigmoid", "theta": 5.0, "bb": 1.0,  "ba": 1.0, "eff_n": 40, "personal_pct": 0},
    {"source": "hscrp",      "target": "inflammation_state",       "curve": "sigmoid", "theta": 3.0, "bb": 2.0,  "ba": 1.0, "eff_n": 30, "personal_pct": 0},
    # Downstream regime effects (linear)
    {"source": "overreaching_state",      "target": "hscrp",         "curve": "linear", "theta": 0.5, "bb": 2.0,   "ba": 2.0,   "eff_n": 20, "personal_pct": 0},
    {"source": "overreaching_state",      "target": "cortisol",      "curve": "linear", "theta": 0.5, "bb": 3.5,   "ba": 3.5,   "eff_n": 20, "personal_pct": 0},
    {"source": "overreaching_state",      "target": "testosterone",  "curve": "linear", "theta": 0.5, "bb": -50.0, "ba": -50.0, "eff_n": 15, "personal_pct": 0},
    {"source": "overreaching_state",      "target": "hrv_daily",     "curve": "linear", "theta": 0.5, "bb": -8.0,  "ba": -8.0,  "eff_n": 25, "personal_pct": 0},
    {"source": "iron_deficiency_state",   "target": "hemoglobin",    "curve": "linear", "theta": 0.5, "bb": -1.5,  "ba": -1.5,  "eff_n": 20, "personal_pct": 0},
    {"source": "iron_deficiency_state",   "target": "vo2_peak",      "curve": "linear", "theta": 0.5, "bb": -4.0,  "ba": -4.0,  "eff_n": 15, "personal_pct": 0},
    {"source": "iron_deficiency_state",   "target": "rbc",           "curve": "linear", "theta": 0.5, "bb": -0.3,  "ba": -0.3,  "eff_n": 15, "personal_pct": 0},
    {"source": "sleep_deprivation_state", "target": "cortisol",      "curve": "linear", "theta": 0.5, "bb": 2.5,   "ba": 2.5,   "eff_n": 30, "personal_pct": 0},
    {"source": "sleep_deprivation_state", "target": "testosterone",  "curve": "linear", "theta": 0.5, "bb": -60.0, "ba": -60.0, "eff_n": 20, "personal_pct": 0},
    {"source": "sleep_deprivation_state", "target": "glucose",       "curve": "linear", "theta": 0.5, "bb": 8.0,   "ba": 8.0,   "eff_n": 25, "personal_pct": 0},
    {"source": "inflammation_state",      "target": "hdl",           "curve": "linear", "theta": 0.5, "bb": -5.0,  "ba": -5.0,  "eff_n": 20, "personal_pct": 0},
    {"source": "inflammation_state",      "target": "insulin",       "curve": "linear", "theta": 0.5, "bb": -0.15, "ba": -0.15, "eff_n": 15, "personal_pct": 0},
]


# ── Dose-response evaluation (Python port of evaluateEdge) ──────

def evaluate_edge(dose: float, theta: float, bb: float, ba: float, curve: str) -> float:
    """Piecewise-linear dose-response. Matches TypeScript evaluateEdge exactly."""
    if curve == "sigmoid":
        return ba / (1.0 + math.exp(-bb * (dose - theta)))
    below = bb * min(dose, theta)
    above = ba * max(0.0, dose - theta)
    return below + above


# ── Derived variable computation ────────────────────────────────

def compute_acwr(trimp_history: list[float]) -> float:
    """Acute:Chronic Workload Ratio from TRIMP history."""
    if len(trimp_history) < 28:
        return 1.0  # not enough history
    acute = sum(trimp_history[-7:]) / 7.0
    chronic = sum(trimp_history[-28:]) / 28.0
    if chronic < 1e-6:
        return 1.0
    return acute / chronic


def compute_sleep_debt(sleep_history: list[float], target: float = 7.5) -> float:
    """14-day accumulated sleep debt (hours below target)."""
    recent = sleep_history[-14:] if len(sleep_history) >= 14 else sleep_history
    return sum(max(0, target - h) for h in recent)


def compute_consistency(training_history: list[float], window: int = 90) -> float:
    """Fraction of days with any training in the window."""
    recent = training_history[-window:] if len(training_history) >= window else training_history
    if len(recent) == 0:
        return 0.5
    return sum(1 for t in recent if t > 5) / len(recent)  # >5 min counts as training


# ── Recommendation engine ───────────────────────────────────────

def compute_recommendations(
    day1_blood: dict[str, float],
    initial_behavior: dict[str, float],
) -> dict[str, float]:
    """
    Personalized behavioral targets from Day 1 profile.
    Each key is a behavioral variable, value is the recommended daily target.
    The participant's behavior drifts toward these targets scaled by adherence.
    """
    recs: dict[str, float] = {}

    # ── Iron pathway ──
    if day1_blood.get("ferritin", 999) < 30:
        # Low ferritin: cap running to prevent further depletion
        recs["run_km"] = min(initial_behavior.get("run_km", 5), 3.5)  # ~105 km/mo

    # ── Lipid pathway ──
    if day1_blood.get("hdl", 999) < 45:
        # Low HDL: increase zone 2 aerobic work
        recs["zone2_min"] = max(initial_behavior.get("zone2_min", 15), 25)  # ~750 min/mo
    if day1_blood.get("triglycerides", 0) > 180:
        recs["zone2_min"] = max(recs.get("zone2_min", initial_behavior.get("zone2_min", 15)), 25)

    # ── Inflammation ──
    if day1_blood.get("hscrp", 0) > 3.0:
        recs["sleep_hrs"] = max(initial_behavior.get("sleep_hrs", 7), 7.5)
        recs["trimp"] = min(initial_behavior.get("trimp", 80), 60)

    # ── Sleep ──
    if initial_behavior.get("sleep_hrs", 7) < 6.5:
        recs["sleep_hrs"] = 7.5
        recs["bedtime_hr"] = min(initial_behavior.get("bedtime_hr", 22.5), 22.0)
    elif initial_behavior.get("sleep_hrs", 7) < 7.0:
        recs["sleep_hrs"] = 7.0

    # ── Late workouts hurting sleep ──
    if initial_behavior.get("workout_end_hr", 18) > 20.5:
        recs["workout_end_hr"] = 19.0

    # ── Overtraining (high ACWR from excessive load) ──
    if initial_behavior.get("trimp", 80) > 120:
        recs["trimp"] = 85  # near the optimal theta

    # ── General wellness: if underactive, gentle push ──
    if initial_behavior.get("steps", 8500) < 5000:
        recs["steps"] = 7000
    if initial_behavior.get("training_min", 45) < 20:
        recs["training_min"] = 35

    return recs


# ── Participant initialization ──────────────────────────────────

def initialize_participant(
    rng: np.random.Generator,
    cohort: CohortDef,
    pid: int,
) -> dict:
    """Sample baseline demographics, blood, behavior, adherence for one participant."""
    is_female = rng.random() < FEMALE_FRACTION
    age = int(np.clip(rng.normal(AGE_MEAN, AGE_STD), *AGE_CLIP))

    # Sex-adjusted priors for key biomarkers
    sex_adj = {
        "testosterone": (-250, 0.6) if is_female else (0, 1.0),  # (mean_shift, std_scale)
        "hemoglobin":   (-1.5, 0.8) if is_female else (0, 1.0),
        "ferritin":     (-15, 0.8)  if is_female else (0, 1.0),
    }

    # Sample Day 1 blood
    day1_blood: dict[str, float] = {}
    for name, prior in BIOMARKER_PRIORS.items():
        shift, scale = sex_adj.get(name, (0, 1.0))
        val = rng.normal(prior.mean + shift, prior.std * scale)
        day1_blood[name] = float(np.clip(val, prior.clip_lo, prior.clip_hi))

    # Age adjustments: older → lower testosterone, higher glucose
    age_factor = (age - 35) / 20  # normalized: 0 at 35, +1 at 55, -0.65 at 22
    day1_blood["testosterone"] *= max(0.5, 1 - 0.15 * age_factor)
    day1_blood["glucose"] += 5 * age_factor
    day1_blood["glucose"] = float(np.clip(day1_blood["glucose"], 65, 150))

    # Fitness-adjusted: more active people have better baselines
    # Sample a latent "fitness level" that correlates behavior and biomarkers
    fitness_z = rng.normal(0, 1)  # standard normal, used to correlate

    # Sample baseline behavior
    behavior: dict[str, float] = {}
    for name, prior in BEHAVIORAL_PRIORS.items():
        # Fitness correlated: active people run more, sleep better
        fitness_nudge = 0.0
        if name in ("run_km", "training_min", "zone2_min", "trimp", "steps", "active_energy"):
            fitness_nudge = fitness_z * prior.std * 0.3  # positive fitness → more active
        elif name == "sleep_hrs":
            fitness_nudge = fitness_z * prior.std * 0.15  # slightly better sleep
        val = rng.normal(prior.mean + fitness_nudge, prior.std)
        behavior[name] = float(np.clip(val, prior.clip_lo, prior.clip_hi))

    # Fitness-correlated biomarker adjustments
    day1_blood["vo2_peak"] += fitness_z * 4
    day1_blood["vo2_peak"] = float(np.clip(day1_blood["vo2_peak"], 20, 70))
    day1_blood["resting_hr"] = float(np.clip(62 - fitness_z * 3, 40, 85))

    # Wearable baselines
    wearable_baseline: dict[str, float] = {}
    for name, prior in WEARABLE_PRIORS.items():
        val = rng.normal(prior.mean, prior.std)
        if name == "hrv_daily":
            val += fitness_z * 5  # fitter people have higher HRV
        elif name == "resting_hr":
            val -= fitness_z * 3
        wearable_baseline[name] = float(np.clip(val, prior.clip_lo, prior.clip_hi))

    # Adherence: sample from cohort-specific Beta distribution
    baseline_adherence = float(rng.beta(cohort.adherence_alpha, cohort.adherence_beta))

    # Individual random effects for biomarker evolution (personal sensitivity)
    personal_sensitivity = {name: rng.normal(1.0, 0.2) for name in BIOMARKER_PRIORS}
    personal_sensitivity.update({name: rng.normal(1.0, 0.2) for name in WEARABLE_PRIORS})

    return {
        "pid": pid,
        "cohort": cohort.name,
        "age": age,
        "is_female": is_female,
        "fitness_z": fitness_z,
        "day1_blood": day1_blood,
        "behavior_baseline": behavior,
        "wearable_baseline": wearable_baseline,
        "baseline_adherence": baseline_adherence,
        "personal_sensitivity": personal_sensitivity,
    }


# ── Daily simulation ────────────────────────────────────────────

def simulate_participant(
    participant: dict,
    edges: list[dict],
    rng: np.random.Generator,
    cohort: CohortDef,
) -> dict:
    """
    Simulate 100 days for one participant.

    Returns dict with:
      - daily_behavior: list of dicts (100 entries)
      - daily_wearables: list of dicts (100 entries, with missingness)
      - daily_biomarker_state: list of dicts (100 entries, true hidden state)
      - day1_observed: dict (blood draw with lab noise)
      - day100_observed: dict (blood draw with lab noise)
      - daily_adherence: list of floats
      - recommendations: dict
    """
    behavior_baseline = participant["behavior_baseline"]
    day1_blood = participant["day1_blood"]
    wearable_baseline = participant["wearable_baseline"]
    sensitivity = participant["personal_sensitivity"]
    base_adherence = participant["baseline_adherence"]

    # Compute recommendations from Day 1 profile
    recs = compute_recommendations(day1_blood, behavior_baseline)

    # Initialize regime activation states (start at 0 = inactive)
    biomarker_state = dict(day1_blood)
    for regime_node in ("overreaching_state", "iron_deficiency_state", "sleep_deprivation_state", "inflammation_state"):
        biomarker_state[regime_node] = 0.0

    # Group edges by target for efficient evaluation
    # Process regime activations first, then downstream effects
    regime_targets = {"overreaching_state", "iron_deficiency_state", "sleep_deprivation_state", "inflammation_state"}
    edges_by_target_regime: dict[str, list[dict]] = defaultdict(list)
    edges_by_target_regular: dict[str, list[dict]] = defaultdict(list)
    for e in edges:
        target_key = TARGET_COLUMN_MAP.get(e["target"])
        if target_key:
            if target_key in regime_targets:
                edges_by_target_regime[target_key].append(e)
            else:
                edges_by_target_regular[target_key].append(e)

    # ── Behavioral history buffers (for rolling aggregates) ──
    behavior_history: dict[str, list[float]] = {k: [] for k in BEHAVIORAL_PRIORS}
    # Pre-fill 30 days of baseline behavior for monthly aggregates at Day 1
    for _ in range(30):
        for k, prior in BEHAVIORAL_PRIORS.items():
            val = rng.normal(behavior_baseline[k], prior.std * 0.3)
            behavior_history[k].append(float(np.clip(val, prior.clip_lo, prior.clip_hi)))

    # ── State tracking (biomarker_state already initialized above with regime nodes) ──
    wearable_state = dict(wearable_baseline)

    daily_behavior_out: list[dict] = []
    daily_wearables_out: list[dict] = []
    daily_biomarker_state_out: list[dict] = []
    daily_adherence_out: list[float] = []

    decay_rate = math.log(2) / ADHERENCE_DECAY_HALFLIFE_DAYS
    adapt_rate = 1.0 / BEHAVIORAL_ADAPTATION_DAYS

    for day in range(PROGRAM_DAYS):
        # ── Adherence for this day ──
        adherence_t = base_adherence * math.exp(-decay_rate * day)
        adherence_t = max(adherence_t, ADHERENCE_FLOOR)
        # Add daily noise to adherence
        adherence_t = float(np.clip(adherence_t + rng.normal(0, 0.05), 0.05, 1.0))
        daily_adherence_out.append(adherence_t)

        # ── Update behavioral variables ──
        today_behavior: dict[str, float] = {}
        for name, prior in BEHAVIORAL_PRIORS.items():
            prev = behavior_history[name][-1]
            target = recs.get(name, behavior_baseline[name])

            # AR(1) process drifting toward (baseline + adherence-scaled recommendation)
            effective_target = behavior_baseline[name] + adherence_t * (target - behavior_baseline[name])
            innovation = rng.normal(0, prior.std * 0.3)  # daily noise
            new_val = prev * prior.autocorrelation + effective_target * (1 - prior.autocorrelation) + innovation
            new_val = float(np.clip(new_val, prior.clip_lo, prior.clip_hi))

            today_behavior[name] = new_val
            behavior_history[name].append(new_val)

        daily_behavior_out.append(today_behavior)

        # ── Compute derived variables ──
        derived = {
            "acwr": compute_acwr(behavior_history["trimp"]),
            "sleep_debt": compute_sleep_debt(behavior_history["sleep_hrs"]),
            "consistency": compute_consistency(behavior_history["training_min"]),
        }

        # ── Compute current dose values for each edge source ──
        def get_dose(source_col: str) -> float | None:
            spec = DOSE_COLUMN_MAP.get(source_col)
            if spec is None:
                return None
            if spec.aggregation == "monthly_sum":
                hist = behavior_history.get(spec.behavioral_var, [])
                return sum(hist[-30:]) if len(hist) >= 30 else sum(hist)
            elif spec.aggregation == "daily":
                return today_behavior.get(spec.behavioral_var, 0)
            elif spec.aggregation == "derived":
                return derived.get(spec.behavioral_var, 0)
            elif spec.aggregation == "biomarker":
                return biomarker_state.get(spec.behavioral_var, 0)
            return None

        # ── Compute baseline doses (participant's Day 1 behavior, for delta) ──
        def get_baseline_dose(source_col: str) -> float | None:
            spec = DOSE_COLUMN_MAP.get(source_col)
            if spec is None:
                return None
            if spec.aggregation == "monthly_sum":
                # First 30 entries in history are the pre-program baseline
                hist = behavior_history.get(spec.behavioral_var, [])
                return sum(hist[:30]) if len(hist) >= 30 else sum(hist)
            elif spec.aggregation == "daily":
                return behavior_baseline.get(spec.behavioral_var, 0)
            elif spec.aggregation == "derived":
                return {"acwr": 1.0, "sleep_debt": 3.5, "consistency": 0.5}.get(spec.behavioral_var)
            elif spec.aggregation == "biomarker":
                return day1_blood.get(spec.behavioral_var, 0)
            return None

        # ── Helper: propagate one set of edges ──
        def propagate_edges(edge_groups: dict[str, list[dict]]) -> None:
            for target_key, target_edges in edge_groups.items():
                delta_from_baseline = 0.0
                for e in target_edges:
                    dose = get_dose(e["source"])
                    baseline_dose = get_baseline_dose(e["source"])
                    if dose is None or baseline_dose is None:
                        continue
                    effect_current = evaluate_edge(dose, e["theta"], e["bb"], e["ba"], e["curve"])
                    effect_baseline = evaluate_edge(baseline_dose, e["theta"], e["bb"], e["ba"], e["curve"])
                    delta_from_baseline += (effect_current - effect_baseline) * sensitivity.get(target_key, 1.0)

                prior = BIOMARKER_PRIORS.get(target_key) or WEARABLE_PRIORS.get(target_key)

                # Regime nodes: direct sigmoid evaluation (fast, tau=1)
                if target_key in regime_targets:
                    # For regime nodes, just set the activation level directly
                    for e in target_edges:
                        dose = get_dose(e["source"])
                        if dose is not None:
                            biomarker_state[target_key] = evaluate_edge(dose, e["theta"], e["bb"], e["ba"], e["curve"])
                    continue

                if prior is None:
                    continue

                own_baseline = day1_blood.get(target_key, wearable_baseline.get(target_key, prior.mean))
                equilibrium = own_baseline + delta_from_baseline

                current = biomarker_state.get(target_key, wearable_state.get(target_key, own_baseline))
                tau = prior.tau_days
                rate = 1.0 / max(tau, 1.0)
                new_val = current + rate * (equilibrium - current) + rng.normal(0, prior.std * 0.02)
                new_val = float(np.clip(new_val, prior.clip_lo, prior.clip_hi))

                if target_key in BIOMARKER_PRIORS:
                    biomarker_state[target_key] = new_val
                if target_key in WEARABLE_PRIORS:
                    wearable_state[target_key] = new_val

        # ── Phase 1: Regime activations (sigmoid, must happen before downstream) ──
        propagate_edges(edges_by_target_regime)
        # ── Phase 2: Regular edges + regime downstream effects ──
        propagate_edges(edges_by_target_regular)

        daily_biomarker_state_out.append(dict(biomarker_state))

        # ── Wearable observation (with device noise + missingness) ──
        wearable_obs: dict[str, float | None] = {"day": day + 1}
        wear_today = rng.random() < cohort.wearable_compliance
        if wear_today:
            for name, prior in WEARABLE_PRIORS.items():
                val = wearable_state.get(name, prior.mean)
                # Device noise (wearables are noisier than labs)
                noise = rng.normal(0, prior.std * 0.1)
                wearable_obs[name] = round(float(np.clip(val + noise, prior.clip_lo, prior.clip_hi)), 1)
        else:
            for name in WEARABLE_PRIORS:
                wearable_obs[name] = None
        # Always include sleep and steps (from phone even if watch not worn)
        if not wear_today:
            wearable_obs["sleep_hrs"] = round(today_behavior["sleep_hrs"] + rng.normal(0, 0.3), 1)
            wearable_obs["steps"] = round(today_behavior["steps"] + rng.normal(0, 500))
        else:
            wearable_obs["sleep_hrs"] = round(today_behavior["sleep_hrs"] + rng.normal(0, 0.15), 1)
            wearable_obs["steps"] = round(today_behavior["steps"] + rng.normal(0, 300))

        daily_wearables_out.append(wearable_obs)

    # ── Blood draw observations (Day 1 + Day 100 with lab noise) ──
    def observe_blood(state: dict[str, float]) -> dict[str, float]:
        obs = {}
        for name, prior in BIOMARKER_PRIORS.items():
            true_val = state.get(name, prior.mean)
            lab_noise = rng.normal(0, true_val * prior.lab_cv) if prior.lab_cv > 0 else 0
            obs[name] = round(float(np.clip(true_val + lab_noise, prior.clip_lo, prior.clip_hi)), 2)
        return obs

    day1_observed = observe_blood(day1_blood)
    day100_observed = observe_blood(daily_biomarker_state_out[-1])

    return {
        "pid": participant["pid"],
        "cohort": participant["cohort"],
        "age": participant["age"],
        "is_female": participant["is_female"],
        "recommendations": recs,
        "daily_behavior": daily_behavior_out,
        "daily_wearables": daily_wearables_out,
        "daily_biomarker_state": daily_biomarker_state_out,
        "day1_observed": day1_observed,
        "day100_observed": day100_observed,
        "daily_adherence": daily_adherence_out,
    }


# ── Output assembly ─────────────────────────────────────────────

def assemble_blood_draws(results: list[dict]) -> pd.DataFrame:
    """Blood draws table: pid × 2 draws = 2,376 rows."""
    rows = []
    for r in results:
        base = {"participant_id": r["pid"], "cohort": r["cohort"], "age": r["age"], "is_female": r["is_female"]}
        rows.append({**base, "draw_day": 1, **r["day1_observed"]})
        rows.append({**base, "draw_day": 100, **r["day100_observed"]})
    return pd.DataFrame(rows)


def assemble_wearables(results: list[dict]) -> pd.DataFrame:
    """Wearable daily table: pid × ~100 days = ~118,800 rows."""
    rows = []
    for r in results:
        for obs in r["daily_wearables"]:
            rows.append({"participant_id": r["pid"], "cohort": r["cohort"], **obs})
    return pd.DataFrame(rows)


def assemble_lifestyle(results: list[dict], cohorts_by_pid: dict[int, CohortDef], rng: np.random.Generator) -> pd.DataFrame:
    """Lifestyle/app-reported data: variable frequency per participant."""
    rows = []
    for r in results:
        cohort = cohorts_by_pid[r["pid"]]
        for day_idx, beh in enumerate(r["daily_behavior"]):
            # Only log on days the participant opens the app
            if rng.random() > cohort.app_logging_rate * (0.5 + 0.5 * r["daily_adherence"][day_idx]):
                continue
            rows.append({
                "participant_id": r["pid"],
                "day": day_idx + 1,
                "run_km": round(beh["run_km"], 1),
                "training_min": round(beh["training_min"]),
                "zone2_min": round(beh["zone2_min"]),
                "steps": round(beh["steps"]),
                "sleep_hrs": round(beh["sleep_hrs"], 1),
                "bedtime_hr": round(beh["bedtime_hr"], 1),
                "protein_g": round(beh["protein_g"]),
                "energy_kcal": round(beh["energy_kcal"]),
            })
    return pd.DataFrame(rows)


def assemble_adherence(results: list[dict]) -> pd.DataFrame:
    """Adherence metrics: pid × 100 days."""
    rows = []
    for r in results:
        for day_idx, adh in enumerate(r["daily_adherence"]):
            rows.append({
                "participant_id": r["pid"],
                "day": day_idx + 1,
                "adherence_score": round(adh, 3),
                "cohort": r["cohort"],
            })
    return pd.DataFrame(rows)


# ── Summary statistics ──────────────────────────────────────────

def print_summary(blood_df: pd.DataFrame, results: list[dict]) -> None:
    """Print key statistics for validation."""
    print("\n" + "=" * 60)
    print("SYNTHETIC DATA SUMMARY")
    print("=" * 60)

    day1 = blood_df[blood_df["draw_day"] == 1]
    day100 = blood_df[blood_df["draw_day"] == 100]

    print(f"\nParticipants: {len(results)}")
    for c in COHORTS:
        n = sum(1 for r in results if r["cohort"] == c.name)
        print(f"  {c.name}: {n}")

    print(f"\nAdherence distribution:")
    mean_adh = np.mean([np.mean(r["daily_adherence"]) for r in results])
    print(f"  Mean adherence over program: {mean_adh:.2f}")

    print(f"\nRecommendation coverage:")
    rec_counts = defaultdict(int)
    for r in results:
        for k in r["recommendations"]:
            rec_counts[k] += 1
    for k, v in sorted(rec_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v} participants ({100*v/len(results):.0f}%)")

    # Key biomarker changes
    key_markers = ["ferritin", "hscrp", "testosterone", "hdl", "triglycerides",
                   "glucose", "cortisol", "hemoglobin", "vo2_peak"]
    print(f"\nDay 1 -> Day 100 biomarker changes (population mean):")
    print(f"  {'Marker':<20s} {'Day 1':>8s} {'Day 100':>8s} {'Delta':>8s} {'% Change':>8s}")
    print(f"  {'-'*20} {'-'*8} {'-'*8} {'-'*8} {'-'*8}")
    for marker in key_markers:
        if marker in day1.columns:
            m1 = day1[marker].mean()
            m100 = day100[marker].mean()
            delta = m100 - m1
            pct = 100 * delta / m1 if abs(m1) > 1e-6 else 0
            print(f"  {marker:<20s} {m1:>8.1f} {m100:>8.1f} {delta:>+8.1f} {pct:>+7.1f}%")

    # By cohort
    print(f"\nKey changes by cohort:")
    for cohort_name in [c.name for c in COHORTS]:
        c1 = day1[day1["cohort"] == cohort_name]
        c100 = day100[day100["cohort"] == cohort_name]
        print(f"\n  {cohort_name} (n={len(c1)}):")
        for marker in ["ferritin", "hscrp", "hdl"]:
            if marker in c1.columns:
                d = c100[marker].mean() - c1[marker].mean()
                print(f"    {marker}: {d:+.1f}")


# ── Main ────────────────────────────────────────────────────────

def generate(seed: int = SEED, output_dir: str | Path = "./output") -> dict[str, pd.DataFrame]:
    """Run the full generation pipeline."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(seed)
    edges = load_edges()
    print(f"Loaded {len(edges)} fitted edges from edgeSummaryRaw.json")

    # ── Initialize all participants ──
    participants = []
    cohorts_by_pid: dict[int, CohortDef] = {}
    pid = 1
    for cohort in COHORTS:
        for _ in range(cohort.n):
            p = initialize_participant(rng, cohort, pid)
            participants.append(p)
            cohorts_by_pid[pid] = cohort
            pid += 1

    print(f"Initialized {len(participants)} participants across {len(COHORTS)} cohorts")

    # ── Simulate each participant ──
    results = []
    for i, p in enumerate(participants):
        if (i + 1) % 100 == 0 or i == 0:
            print(f"  Simulating participant {i+1}/{len(participants)}...")
        cohort = cohorts_by_pid[p["pid"]]
        result = simulate_participant(p, edges, rng, cohort)
        results.append(result)

    print(f"Simulation complete.")

    # ── Assemble output tables ──
    print("Assembling output tables...")
    blood_df = assemble_blood_draws(results)
    wearables_df = assemble_wearables(results)
    lifestyle_df = assemble_lifestyle(results, cohorts_by_pid, rng)
    adherence_df = assemble_adherence(results)

    print(f"  blood_draws:    {len(blood_df):>8,} rows")
    print(f"  wearables:      {len(wearables_df):>8,} rows")
    print(f"  lifestyle_app:  {len(lifestyle_df):>8,} rows")
    print(f"  adherence:      {len(adherence_df):>8,} rows")

    # ── Save ──
    blood_df.to_csv(output_dir / "blood_draws.csv", index=False)
    wearables_df.to_csv(output_dir / "wearables_daily.csv", index=False)
    lifestyle_df.to_csv(output_dir / "lifestyle_app.csv", index=False)
    adherence_df.to_csv(output_dir / "adherence.csv", index=False)

    print("Attaching rich longitudinal member tables...")
    rich_frames = attach_rich_member_data(output_dir, seed=seed + 1000)
    print(
        "  Sarah M.: "
        f"{len(rich_frames['lifestyle_app']):,} days, "
        f"{len(rich_frames['blood_draws']):,} lab draws, "
        f"{len(rich_frames['meal_events']):,} meal events"
    )
    print(f"\nSaved to {output_dir.resolve()}")

    # ── Summary ──
    print_summary(blood_df, results)

    return {
        "blood_draws": blood_df,
        "wearables_daily": wearables_df,
        "lifestyle_app": lifestyle_df,
        "adherence": adherence_df,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Serif synthetic data")
    parser.add_argument("--output-dir", default="./output", help="Output directory")
    parser.add_argument("--seed", type=int, default=SEED, help="Random seed")
    args = parser.parse_args()
    generate(seed=args.seed, output_dir=args.output_dir)
