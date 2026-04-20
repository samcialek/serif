"""Cohort assignment, within-cohort NN matching, and empirical cohort priors.

Used by the Bayesian gating path (`export_portal._export_one_bayesian`) to:
  1. Assign each participant to a cohort (synthetic: ground truth from blood_draws).
  2. Find the k nearest-neighbor cohort-mates on baseline features (Mahalanobis).
  3. Compute an empirical prior for a given edge from cohort members (or an NN
     subset), used as the middle layer in pop → cohort → user conjugate updates.

Baseline features (8):
    age, is_female, baseline ferritin, baseline testosterone, baseline HRV,
    baseline sleep_duration, baseline training_volume (avg min/day, days 1-14),
    baseline hscrp.

Only 3 cohorts exist in the current synthetic dataset (cohort_a/cohort_b/cohort_c,
sizes 534/416/238). Sam's spec mentioned "9 synthetic cohorts"; the data has 3.
All three are above the James-Stein "large" threshold of 100, so all will blend
toward cohort-empirical (documented in conjugate_priors.james_stein_blend).

For real users later, `assign_cohort` can be swapped for a feature-based policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


BASELINE_FEATURES = (
    "age",
    "is_female",
    "baseline_ferritin",
    "baseline_testosterone",
    "baseline_hrv",
    "baseline_sleep_duration",
    "baseline_training_volume",
    "baseline_hscrp",
)


@dataclass(frozen=True)
class CohortPrior:
    """Empirical prior on an edge from within-cohort (or NN-subset) fits.

    All fields may be None if the cohort has insufficient data for the edge
    (e.g., no user's time series supports an OLS slope fit).
    """
    mean_slope_bb: Optional[float]
    var_slope_bb: Optional[float]
    mean_slope_ba: Optional[float]
    var_slope_ba: Optional[float]
    mean_theta: Optional[float]
    var_theta: Optional[float]
    behavioral_sd_mean: Optional[float]
    behavioral_sd_var: Optional[float]
    n: int  # number of contributing participants


# ── Cohort assignment ──────────────────────────────────────────────

def assign_cohort(participant_features: dict) -> str:
    """Deterministic cohort mapping.

    Synthetic-data contract: participant_features must include a 'cohort' key
    (we pull it from blood_draws.csv upstream). For real users, this becomes
    a classifier on location + training_status + age + sex.
    """
    if "cohort" in participant_features:
        return str(participant_features["cohort"])
    raise KeyError("participant_features must carry 'cohort' (synthetic ground truth)")


# ── Baseline feature extraction ────────────────────────────────────

def build_participant_features(
    pid: int,
    blood_df: pd.DataFrame,
    wear_df: pd.DataFrame,
    life_df: pd.DataFrame,
) -> dict:
    """Pull the 8 baseline features for one participant from the raw CSVs.

    Uses day-1 blood, day-1 (or first available) wearable, and mean training
    volume over days 1-14. NaN fills default to the cohort median upstream.
    """
    blood_day1 = blood_df[(blood_df.participant_id == pid) & (blood_df.draw_day == 1)]
    if len(blood_day1) == 0:
        raise ValueError(f"no day-1 blood draw for pid={pid}")
    row = blood_day1.iloc[0]

    wear_pid = wear_df[wear_df.participant_id == pid].sort_values("day")
    wear_day1 = wear_pid.iloc[0] if len(wear_pid) else None

    life_pid = life_df[(life_df.participant_id == pid) & (life_df.day <= 14)]
    baseline_training = float(life_pid.training_min.mean()) if len(life_pid) else np.nan

    return {
        "pid": int(pid),
        "cohort": str(row["cohort"]),
        "age": float(row["age"]),
        "is_female": float(bool(row["is_female"])),
        "baseline_ferritin": float(row["ferritin"]),
        "baseline_testosterone": float(row["testosterone"]),
        "baseline_hrv": float(wear_day1["hrv_daily"]) if wear_day1 is not None else np.nan,
        "baseline_sleep_duration": float(wear_day1["sleep_hrs"]) if wear_day1 is not None else np.nan,
        "baseline_training_volume": baseline_training,
        "baseline_hscrp": float(row["hscrp"]),
    }


def build_all_features(data_dir: str | Path) -> pd.DataFrame:
    """Feature matrix for every participant, indexed by pid.

    Computed once and cached; the NN matcher and empirical prior builder both
    iterate over it rather than re-parsing CSVs per-query.
    """
    data_dir = Path(data_dir)
    blood = pd.read_csv(data_dir / "blood_draws.csv")
    wear = pd.read_csv(data_dir / "wearables_daily.csv")
    life = pd.read_csv(data_dir / "lifestyle_app.csv")

    day1 = blood[blood.draw_day == 1].sort_values("participant_id")
    first_wear = (
        wear.sort_values(["participant_id", "day"])
            .groupby("participant_id", as_index=False)
            .first()
    )
    early_life = (
        life[life.day <= 14]
            .groupby("participant_id", as_index=False)["training_min"].mean()
            .rename(columns={"training_min": "baseline_training_volume"})
    )

    df = day1[["participant_id", "cohort", "age", "is_female", "ferritin",
               "testosterone", "hscrp"]].merge(
        first_wear[["participant_id", "hrv_daily", "sleep_hrs"]],
        on="participant_id", how="left"
    ).merge(
        early_life, on="participant_id", how="left"
    )
    df = df.rename(columns={
        "ferritin": "baseline_ferritin",
        "testosterone": "baseline_testosterone",
        "hscrp": "baseline_hscrp",
        "hrv_daily": "baseline_hrv",
        "sleep_hrs": "baseline_sleep_duration",
    })
    df["is_female"] = df["is_female"].astype(float)
    df = df.set_index("participant_id")
    # Fill NaNs per cohort with cohort median — keeps NN distances well-defined.
    for feat in BASELINE_FEATURES:
        df[feat] = df.groupby("cohort")[feat].transform(lambda s: s.fillna(s.median()))
    return df


# ── Nearest-neighbor matching ──────────────────────────────────────

def _mahalanobis_matrix(X: np.ndarray) -> np.ndarray:
    """Inverse covariance matrix (shrunk if singular). Used for M-distance."""
    cov = np.cov(X, rowvar=False)
    cov += np.eye(cov.shape[0]) * 1e-6 * np.trace(cov) / cov.shape[0]
    return np.linalg.inv(cov)


def find_similar_within_cohort(
    target_features: dict,
    cohort_id: str,
    features_df: pd.DataFrame,
    k: int = 20,
) -> list[int]:
    """k nearest cohort-mates by Mahalanobis distance on BASELINE_FEATURES.

    Excludes the target pid itself if it appears in the cohort. Returns an
    empty list if the cohort is too small (<3 members).
    """
    cohort_df = features_df[features_df.cohort == cohort_id]
    if len(cohort_df) < 3:
        return []

    X = cohort_df[list(BASELINE_FEATURES)].to_numpy(dtype=float)
    vinv = _mahalanobis_matrix(X)
    target_vec = np.array([target_features[f] for f in BASELINE_FEATURES], dtype=float)

    diffs = X - target_vec
    d2 = np.einsum("ij,jk,ik->i", diffs, vinv, diffs)

    pids = cohort_df.index.to_numpy()
    # Drop the target pid if present (distance 0).
    tgt_pid = target_features.get("pid")
    mask = pids != tgt_pid
    d2 = d2[mask]
    pids = pids[mask]

    order = np.argsort(d2)
    return pids[order[:k]].tolist()


def get_cohort_members(cohort_id: str, features_df: pd.DataFrame) -> list[int]:
    """Return all pids belonging to cohort_id (index order)."""
    return features_df[features_df.cohort == cohort_id].index.tolist()


# ── Empirical cohort prior for an edge ─────────────────────────────

def compute_cohort_prior(
    edge_id: tuple[str, str],
    cohort_id: str,
    user_slopes: dict[int, dict],
    features_df: pd.DataFrame,
    subset: Optional[list[int]] = None,
) -> CohortPrior:
    """Empirical mean/variance of per-user OLS slope estimates within cohort.

    `user_slopes[pid][edge_id]` should yield `{slope_bb, slope_ba, theta_proxy,
    behavioral_sd}` if the user supports the edge (i.e., has enough time-series
    variation). Users without data for this edge are skipped.

    If `subset` is given (list of pids, e.g., from `find_similar_within_cohort`),
    restrict the empirical pool to that subset.
    """
    if subset is not None:
        pool = subset
    else:
        pool = features_df[features_df.cohort == cohort_id].index.tolist()

    bb_vals, ba_vals, theta_vals, sd_vals = [], [], [], []
    for pid in pool:
        slopes = user_slopes.get(int(pid), {}).get(edge_id)
        if slopes is None:
            continue
        if slopes.get("slope_bb") is not None:
            bb_vals.append(slopes["slope_bb"])
        if slopes.get("slope_ba") is not None:
            ba_vals.append(slopes["slope_ba"])
        if slopes.get("theta_proxy") is not None:
            theta_vals.append(slopes["theta_proxy"])
        if slopes.get("behavioral_sd") is not None:
            sd_vals.append(slopes["behavioral_sd"])

    def _mean_var(xs: list[float]) -> tuple[Optional[float], Optional[float]]:
        if len(xs) < 2:
            return (xs[0] if xs else None, None)
        arr = np.asarray(xs, dtype=float)
        return float(arr.mean()), float(arr.var(ddof=1))

    mean_bb, var_bb = _mean_var(bb_vals)
    mean_ba, var_ba = _mean_var(ba_vals)
    mean_theta, var_theta = _mean_var(theta_vals)
    mean_sd, var_sd = _mean_var(sd_vals)

    return CohortPrior(
        mean_slope_bb=mean_bb, var_slope_bb=var_bb,
        mean_slope_ba=mean_ba, var_slope_ba=var_ba,
        mean_theta=mean_theta, var_theta=var_theta,
        behavioral_sd_mean=mean_sd, behavioral_sd_var=var_sd,
        n=len(pool),
    )
