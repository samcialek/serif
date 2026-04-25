"""Transform synthetic CSVs into per-participant state dicts for the SCM engine.

Handles:
  - Column name mapping (CSV names -> SCM node names)
  - Behavioral aggregation (daily -> monthly sums, rolling averages)
  - Derived variable computation (ACWR, sleep_debt, consistency)
  - Sparse data handling (drop missing wearable days, conservative carry-forward)
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd

from .synthetic.config import (
    DOSE_COLUMN_MAP, TARGET_COLUMN_MAP,
    BIOMARKER_PRIORS, WEARABLE_PRIORS,
)


# ── Column name -> SCM node name mapping ──────────────────────────

# Behavioral CSV columns -> SCM dose node names
CSV_TO_DOSE_NODE: dict[str, str] = {
    "run_km":       "running_volume",
    "training_min": "training_volume",
    "zone2_min":    "zone2_volume",
    "steps":        "steps",
    "sleep_hrs":    "sleep_duration",
    "bedtime_hr":   "bedtime",
    "protein_g":    "dietary_protein",
    "energy_kcal":  "dietary_energy",
}

# Wearable CSV columns -> SCM node names
CSV_TO_WEARABLE_NODE: dict[str, str] = {
    "hrv_daily":        "hrv_daily",
    "resting_hr":       "resting_hr",
    "sleep_efficiency": "sleep_efficiency",
    "sleep_quality":    "sleep_quality",
    "deep_sleep":       "deep_sleep",
}

# Blood CSV columns -> SCM node names (1:1 match, but explicit for clarity)
BLOOD_NODE_NAMES = list(BIOMARKER_PRIORS.keys())


# ── Derived variable computation ──────────────────────────────────

def compute_acwr(daily_loads: list[float], day_idx: int) -> float:
    """Acute:Chronic Workload Ratio from a training load series.

    Acute = mean of last 7 days.
    Chronic = mean of last 28 days.
    """
    start_acute = max(0, day_idx - 6)
    start_chronic = max(0, day_idx - 27)
    acute = daily_loads[start_acute:day_idx + 1]
    chronic = daily_loads[start_chronic:day_idx + 1]
    mean_chronic = np.mean(chronic) if chronic else 1.0
    mean_acute = np.mean(acute) if acute else 0.0
    if mean_chronic < 1e-6:
        return 1.0
    return float(mean_acute / mean_chronic)


def compute_sleep_debt(daily_sleep: list[float], day_idx: int, target: float = 7.5) -> float:
    """Rolling 14-day cumulative sleep deficit (hours below target).

    Default target is 7.5h — aligned with `loads.sleep_debt_14d` so the
    regime classifier and the displayed load chip read the same metric.
    Previously this defaulted to 8.0h while loads used 7.5h; the
    divergence inflated Caspian's regime activation while the load chip
    showed a small debt. CDC + AASM recommend 7+ hours for adults; 7.5
    is the right baseline for a non-clinical "you're slipping" trigger.
    """
    start = max(0, day_idx - 13)
    window = daily_sleep[start:day_idx + 1]
    deficits = [max(0, target - s) for s in window]
    return float(np.sum(deficits))


def compute_consistency(daily_volumes: list[float], day_idx: int, window: int = 90) -> float:
    """Training consistency = 1 - CV of training volume over the window."""
    start = max(0, day_idx - window + 1)
    data = daily_volumes[start:day_idx + 1]
    if len(data) < 14:
        return 0.5
    mean = np.mean(data)
    if mean < 1e-6:
        return 0.0
    cv = float(np.std(data) / mean)
    return max(0.0, min(1.0, 1.0 - cv))


# ── Load and join CSVs ────────────────────────────────────────────

def load_csvs(data_dir: str | Path) -> dict[str, pd.DataFrame]:
    """Load the four synthetic CSVs."""
    data_dir = Path(data_dir)
    return {
        "blood":     pd.read_csv(data_dir / "blood_draws.csv"),
        "wearables": pd.read_csv(data_dir / "wearables_daily.csv"),
        "lifestyle": pd.read_csv(data_dir / "lifestyle_app.csv"),
        "adherence": pd.read_csv(data_dir / "adherence.csv"),
    }


def build_participant_state(
    pid: int,
    blood_df: pd.DataFrame,
    wearables_df: pd.DataFrame,
    lifestyle_df: pd.DataFrame,
    adherence_df: pd.DataFrame,
    eval_day: int = 100,
) -> dict:
    """Build a complete state dict for one participant.

    Returns
    -------
    dict with keys:
      - pid, cohort, age, is_female
      - day1_blood: dict[biomarker_name, value]
      - current_blood: dict[biomarker_name, value] (Day 100)
      - behavioral_state: dict[node_name, aggregated_value] (doses for the engine)
      - wearable_state: dict[node_name, recent_average]
      - derived: dict with acwr, sleep_debt, consistency
      - regime_inputs: dict with ferritin, hscrp (for regime activation check)
      - mean_adherence: float
    """
    # ── Blood draws ──
    p_blood = blood_df[blood_df["participant_id"] == pid]
    day1_row = p_blood[p_blood["draw_day"] == 1].iloc[0]
    day100_row = p_blood[p_blood["draw_day"] == eval_day].iloc[0]

    day1_blood = {col: float(day1_row[col]) for col in BLOOD_NODE_NAMES if col in day1_row.index}
    current_blood = {col: float(day100_row[col]) for col in BLOOD_NODE_NAMES if col in day100_row.index}

    meta = {
        "pid": pid,
        "cohort": day1_row["cohort"],
        "age": int(day1_row["age"]),
        "is_female": bool(day1_row["is_female"]),
    }

    # ── Lifestyle (sparse — drop days with no entry, carry-forward for rolling) ──
    p_life = lifestyle_df[lifestyle_df["participant_id"] == pid].sort_values("day")

    # Build daily behavioral series with carry-forward for missing days
    behavior_cols = ["run_km", "training_min", "zone2_min", "steps",
                     "sleep_hrs", "bedtime_hr", "protein_g", "energy_kcal"]

    # Initialize with NaN, fill logged days, then forward-fill
    daily_behavior = pd.DataFrame({"day": range(1, eval_day + 1)})
    daily_behavior = daily_behavior.merge(p_life[["day"] + behavior_cols], on="day", how="left")
    daily_behavior = daily_behavior.ffill().bfill()

    # Compute behavioral aggregates for SCM dose nodes
    last_30 = daily_behavior.tail(30)
    last_7 = daily_behavior.tail(7)

    behavioral_state = {
        "running_volume":   float(last_30["run_km"].sum()),       # km/month
        "training_volume":  float(last_30["training_min"].sum()), # min/month
        "zone2_volume":     float(last_30["zone2_min"].sum()),    # min/month
        "steps":            float(last_7["steps"].mean()),
        "sleep_duration":   float(last_7["sleep_hrs"].mean()),
        "bedtime":          float(last_7["bedtime_hr"].mean()),
        "dietary_protein":  float(last_7["protein_g"].mean()),
        "dietary_energy":   float(last_7["energy_kcal"].mean()),
        # Derived from available columns (not in CSV directly):
        # TRIMP ≈ training_min × 1.78 (ratio of population means: 80/45)
        "training_load":    float(last_7["training_min"].mean() * 1.78),
        # Active energy ≈ steps × 0.04 + training_min × 3 (kcal/day)
        "active_energy":    float(last_7["steps"].mean() * 0.04 + last_7["training_min"].mean() * 3),
    }

    # Baseline behavioral state (first 30 days) for delta computation
    first_30 = daily_behavior.head(30)
    first_7 = daily_behavior.head(7)

    baseline_behavioral = {
        "running_volume":   float(first_30["run_km"].sum()),
        "training_volume":  float(first_30["training_min"].sum()),
        "zone2_volume":     float(first_30["zone2_min"].sum()),
        "steps":            float(first_7["steps"].mean()),
        "sleep_duration":   float(first_7["sleep_hrs"].mean()),
        "bedtime":          float(first_7["bedtime_hr"].mean()),
        "dietary_protein":  float(first_7["protein_g"].mean()),
        "dietary_energy":   float(first_7["energy_kcal"].mean()),
        "training_load":    float(first_7["training_min"].mean() * 1.78),
        "active_energy":    float(first_7["steps"].mean() * 0.04 + first_7["training_min"].mean() * 3),
    }

    # ── Derived variables ──
    training_loads = daily_behavior["training_min"].tolist()
    sleep_series = daily_behavior["sleep_hrs"].tolist()
    run_series = daily_behavior["run_km"].tolist()

    derived = {
        "acwr":        compute_acwr(training_loads, eval_day - 1),
        "sleep_debt":  compute_sleep_debt(sleep_series, eval_day - 1),
        "consistency": compute_consistency(run_series, eval_day - 1),
    }

    baseline_derived = {
        "acwr":        compute_acwr(training_loads, 29),
        "sleep_debt":  compute_sleep_debt(sleep_series, 29),
        "consistency": compute_consistency(run_series, 29),
    }

    # ── Wearables (drop missing days per decision, use valid days for averages) ──
    p_wear = wearables_df[wearables_df["participant_id"] == pid].sort_values("day")
    last_7_wear = p_wear[p_wear["day"] > eval_day - 7]

    wearable_state = {}
    for csv_col, node_name in CSV_TO_WEARABLE_NODE.items():
        valid = last_7_wear[csv_col].dropna()
        if len(valid) > 0:
            wearable_state[node_name] = float(valid.mean())

    first_7_wear = p_wear[p_wear["day"] <= 7]
    baseline_wearable = {}
    for csv_col, node_name in CSV_TO_WEARABLE_NODE.items():
        valid = first_7_wear[csv_col].dropna()
        if len(valid) > 0:
            baseline_wearable[node_name] = float(valid.mean())

    # ── Adherence ──
    p_adh = adherence_df[adherence_df["participant_id"] == pid]
    mean_adherence = float(p_adh["adherence_score"].mean())

    return {
        **meta,
        "day1_blood":           day1_blood,
        "current_blood":        current_blood,
        "behavioral_state":     behavioral_state,
        "baseline_behavioral":  baseline_behavioral,
        "wearable_state":       wearable_state,
        "baseline_wearable":    baseline_wearable,
        "derived":              derived,
        "baseline_derived":     baseline_derived,
        "mean_adherence":       mean_adherence,
    }


def build_observed_values(state: dict, use_baseline: bool = False) -> dict[str, float]:
    """Flatten a participant state into the engine's observedValues format.

    Parameters
    ----------
    state : dict from build_participant_state
    use_baseline : if True, use Day 1 behavioral/wearable values instead of current
    """
    obs: dict[str, float] = {}

    # Blood biomarkers (always Day 1 as the baseline anchor)
    for k, v in state["day1_blood"].items():
        obs[k] = v

    # Behavioral doses
    beh = state["baseline_behavioral"] if use_baseline else state["behavioral_state"]
    for k, v in beh.items():
        obs[k] = v

    # Derived
    der = state["baseline_derived"] if use_baseline else state["derived"]
    for k, v in der.items():
        obs[k] = v

    # Wearable outcomes (for observed values in abduction)
    wear = state["baseline_wearable"] if use_baseline else state["wearable_state"]
    for k, v in wear.items():
        obs[k] = v

    return obs


def build_all_participants(data_dir: str | Path) -> list[dict]:
    """Load CSVs and build state for every participant."""
    csvs = load_csvs(data_dir)
    pids = sorted(csvs["blood"]["participant_id"].unique())

    participants = []
    for i, pid in enumerate(pids):
        if (i + 1) % 100 == 0:
            print(f"  Transforming participant {i+1}/{len(pids)}...")
        state = build_participant_state(
            pid,
            csvs["blood"],
            csvs["wearables"],
            csvs["lifestyle"],
            csvs["adherence"],
        )
        participants.append(state)

    return participants
