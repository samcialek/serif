"""Per-user observations for both wearable and biomarker pathways.

Wearable pathway — daily cadence, confounded-OLS:
    For each (action, outcome) wearable pair:
        outcome_t ~ action_t + other_actions_t + day_trend_t + const
    Stores slope, SE, residual SD. Adjustment set is all native actions the
    target action doesn't depend on, plus a linear day-of-study trend.

Biomarker pathway — pre/post sparse-draw:
    Two blood draws per user (day 1, day 100). Slope estimate from
    (outcome_day100 - outcome_day1) / (mean_action_last14 - mean_action_first14).
    Single observation (n_effective=1). sigma_data from biomarker measurement
    SD x 1.4 inflation for biological variability. Optional confounder
    adjustment by subtracting the cohort-median slope from the user's raw
    slope.

Output: `output/user_observations.json` keyed by pid, then `{action}:{outcome}`.
Wearable and biomarker observations share the `UserObservation` dataclass,
distinguished by `pathway` and `n` (>=20 wearable, 1 biomarker).

`at_nominal_step` is `slope * NOMINAL_STEP_DAILY[action]` — the observation's
predicted effect at the MARGINAL_STEPS dose, in the prior's natural scale.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from dataclasses import dataclass, asdict, field
from pathlib import Path

import numpy as np
import pandas as pd

from .intervention_horizons import BIOMARKER_HORIZONS, WEARABLE_HORIZONS
from .synthetic.config import BIOMARKER_PRIORS


# Default (action, outcome) pairs for the wearable pathway. The widened
# export populates SUPPORTED_PAIRS dynamically; this tuple remains the
# backward-compatible default when callers import the module directly.
SUPPORTED_PAIRS: tuple[tuple[str, str], ...] = (
    ("active_energy",  "deep_sleep"),
    ("bedtime",        "deep_sleep"),
    ("bedtime",        "sleep_quality"),
    ("running_volume", "hrv_daily"),
    ("sleep_duration", "hrv_daily"),
    ("training_load",  "hrv_daily"),
    ("training_load",  "resting_hr"),
)

# Native lifestyle columns — directly measured, basis for the confounder set.
NATIVE_COLUMNS: tuple[str, ...] = (
    "bedtime_hr", "sleep_hrs", "run_km", "steps", "training_min", "zone2_min",
)

# Each action's native-column dependencies. Derived actions (training_load,
# active_energy) are linear combinations of native columns and would create
# perfect collinearity if both the derived action and its native deps appeared
# in the same design matrix.
ACTION_NATIVE_DEPS: dict[str, tuple[str, ...]] = {
    "bedtime":         ("bedtime_hr",),
    "sleep_duration":  ("sleep_hrs",),
    "running_volume":  ("run_km",),
    "steps":           ("steps",),
    "training_load":   ("training_min",),
    "active_energy":   ("steps", "training_min"),
    "training_volume": ("training_min",),
    "zone2_volume":    ("zone2_min",),
    # Dietary actions: the synthetic generator doesn't persist protein_g /
    # dietary_kcal columns, so _daily_action returns zeros and the OLS
    # collapses to no-variation. Still register native-deps defensively so
    # the lookup doesn't KeyError on widened supported_pairs.
    "dietary_protein": (),
    "dietary_energy":  (),
}

# Dose applied per day to equal MARGINAL_STEPS[action] on the DAG node.
# running_volume is a monthly sum (transform.py: last_30["run_km"].sum()),
# so 30 km/month = 1 km/day sustained. training_load averages TRIMP over
# last 7 days; a 100 TRIMP increment is 100 TRIMP/day sustained.
NOMINAL_STEP_DAILY: dict[str, float] = {
    "running_volume":  1.0,     # 30 km/month / 30 d
    "training_volume": 5.0,     # 150 min/month / 30 d
    "zone2_volume":    2.0,     # 60 min/month / 30 d
    "training_load":   100.0,
    "sleep_duration":  0.5,
    "bedtime":         -0.5,
    "steps":           2000.0,
    "active_energy":   100.0,
    "dietary_protein": 20.0,
    "dietary_energy":  -200.0,
}


def _daily_action(df: pd.DataFrame, action: str) -> pd.Series:
    """Express one manipulable action's daily value from lifestyle columns."""
    if action == "bedtime":         return df["bedtime_hr"]
    if action == "sleep_duration":  return df["sleep_hrs"]
    if action == "running_volume":  return df["run_km"]
    if action == "steps":           return df["steps"]
    if action == "training_load":   return df["training_min"] * 1.78
    if action == "active_energy":   return df["steps"] * 0.04 + df["training_min"] * 3.0
    if action == "training_volume": return df["training_min"]
    if action == "zone2_volume":    return df["zone2_min"]
    # Dietary actions fall back to 0 when lifestyle CSV lacks the column —
    # matches synthetic-data reality (dietary columns not persisted in the
    # current generator).
    if action in ("dietary_protein", "dietary_energy"):
        col = "protein_g" if action == "dietary_protein" else "dietary_kcal"
        return df[col] if col in df.columns else pd.Series(0.0, index=df.index)
    raise KeyError(f"no daily expression for action {action}")


# Minimum |post - pre| daily action mean change required to trust a biomarker
# slope estimate. Roughly 10% of NOMINAL_STEP_DAILY — below this the ratio
# estimator is dominated by noise in the denominator.
ACTION_CHANGE_THRESHOLD: dict[str, float] = {
    "running_volume":  0.1,    # km/day
    "training_volume": 2.0,    # min/day
    "zone2_volume":    1.0,    # min/day
    "training_load":   5.0,    # TRIMP/day
    "sleep_duration":  0.05,   # hrs
    "bedtime":         0.05,   # hrs
    "steps":           200.0,
    "active_energy":   10.0,   # kcal/day
    "dietary_protein": 2.0,    # g/day
    "dietary_energy":  20.0,   # kcal/day
}


def biomarker_sigma_data(outcome: str, inflation: float = 1.4) -> float | None:
    """Per-observation biomarker noise SD used as sigma_data for biomarker
    pathway conjugate updates.

    Base: measurement SD = prior.mean * prior.lab_cv. Multiplied by 1.4 to
    cover biological variability beyond the pure assay CV (day-to-day
    fluctuation, hydration state, diurnal variation not controlled for at
    draw time).
    """
    prior = BIOMARKER_PRIORS.get(outcome)
    if prior is None:
        return None
    return float(prior.mean * prior.lab_cv * inflation)


@dataclass(frozen=True)
class UserObservation:
    action: str
    outcome: str
    slope: float           # dY/dX in native daily units (confounder-adjusted for biomarker)
    se: float              # SE of slope (OLS for wearable; sigma_data/|step| for biomarker)
    n: int                 # rows used (n_effective=1 for biomarker)
    residual_sd: float     # sqrt(MSE) wearable; sigma_data biomarker
    at_nominal_step: float # slope * NOMINAL_STEP_DAILY[action]
    se_at_step: float      # se * |NOMINAL_STEP_DAILY[action]| (or sigma_data for biomarker)
    # Pathway-aware metadata. Defaults preserve existing JSON shape: records
    # written before these fields existed load with pathway="wearable".
    pathway: str = "wearable"                     # "wearable" | "biomarker"
    sigma_data_used: float = 0.0                  # sigma_data entering the conjugate update
    confounders_adjusted: tuple[str, ...] = ()    # e.g., ("cohort_median",) for biomarker
    slope_raw: float = 0.0                        # biomarker pathway: raw slope before cohort subtraction


def fit_user_observations(
    pid: int,
    wear_pid: pd.DataFrame,
    life_pid: pd.DataFrame,
    min_n: int = 20,
) -> dict[tuple[str, str], UserObservation]:
    """One participant's per-pair OLS. Returns an empty dict if data is too thin."""
    df = life_pid.merge(
        wear_pid.drop(columns=[c for c in ("participant_id", "cohort") if c in wear_pid.columns]),
        on="day", how="inner", suffixes=("", "_w"),
    )
    if len(df) < min_n:
        return {}

    native_cols = {c: df[c].to_numpy(dtype=float) for c in NATIVE_COLUMNS}
    trend = (df["day"].to_numpy(dtype=float) - 1.0) / 99.0

    results: dict[tuple[str, str], UserObservation] = {}
    for action, outcome in SUPPORTED_PAIRS:
        y = df[outcome].to_numpy(dtype=float)
        action_col = _daily_action(df, action).to_numpy(dtype=float)
        # Confounders: all native columns the action does NOT depend on, plus
        # a day-of-study trend and intercept.
        deps = set(ACTION_NATIVE_DEPS[action])
        confounders = [native_cols[c] for c in NATIVE_COLUMNS if c not in deps]
        X = np.column_stack([np.ones_like(y), action_col, *confounders, trend])

        mask = np.isfinite(y) & np.all(np.isfinite(X), axis=1)
        if mask.sum() < min_n:
            continue
        X_m, y_m = X[mask], y[mask]
        if X_m[:, 1].std() < 1e-12:
            continue

        # Condition check — catches any residual near-collinearity.
        if np.linalg.cond(X_m) > 1e10:
            continue
        try:
            beta, *_ = np.linalg.lstsq(X_m, y_m, rcond=None)
            XtX_inv = np.linalg.inv(X_m.T @ X_m)
        except np.linalg.LinAlgError:
            continue

        residuals = y_m - X_m @ beta
        n, p = X_m.shape
        dof = n - p
        if dof <= 0:
            continue
        var_slope = float(XtX_inv[1, 1])
        if var_slope <= 0 or not np.isfinite(var_slope):
            continue
        mse = float((residuals ** 2).sum() / dof)
        se_beta = float(np.sqrt(mse * var_slope))
        if not np.isfinite(se_beta):
            continue
        step = NOMINAL_STEP_DAILY[action]
        results[(action, outcome)] = UserObservation(
            action=action, outcome=outcome,
            slope=float(beta[1]), se=se_beta, n=int(n),
            residual_sd=float(np.sqrt(mse)),
            at_nominal_step=float(beta[1]) * step,
            se_at_step=se_beta * abs(step),
        )
    return results


def fit_biomarker_observations(
    pid: int,
    life_pid: pd.DataFrame,
    blood_pid: pd.DataFrame,
    action_outcome_pairs: list[tuple[str, str]],
    cohort_median_slopes: dict[tuple[str, str], float] | None = None,
) -> dict[tuple[str, str], UserObservation]:
    """Sparse-draw pre/post slopes for biomarker outcomes.

    Requires at least 14 days each in [1, 14] and [87, 100] windows for the
    lifestyle CSV, plus a day-1 and day-100 blood draw. Returns an empty
    dict when the participant lacks either prerequisite.

    `cohort_median_slopes[(action, outcome)]` is subtracted from the user's
    raw slope as a cohort-median confounder adjustment. When absent or
    zero, `slope` equals `slope_raw`.
    """
    cohort_median_slopes = cohort_median_slopes or {}
    out: dict[tuple[str, str], UserObservation] = {}
    if life_pid is None or blood_pid is None:
        return out

    life_sorted = life_pid.sort_values("day")
    pre = life_sorted[life_sorted["day"].between(1, 14)]
    post = life_sorted[life_sorted["day"].between(87, 100)]
    if len(pre) < 7 or len(post) < 7:
        return out

    day1 = blood_pid[blood_pid["draw_day"] == 1]
    day100 = blood_pid[blood_pid["draw_day"] == 100]
    if len(day1) == 0 or len(day100) == 0:
        return out
    day1_row = day1.iloc[0]
    day100_row = day100.iloc[0]

    for action, outcome in action_outcome_pairs:
        if outcome not in BIOMARKER_HORIZONS:
            continue
        if outcome not in day1_row.index or outcome not in day100_row.index:
            continue
        try:
            action_pre_mean = float(_daily_action(pre, action).mean())
            action_post_mean = float(_daily_action(post, action).mean())
        except KeyError:
            continue
        action_change = action_post_mean - action_pre_mean
        threshold = ACTION_CHANGE_THRESHOLD.get(action, 0.0)
        if not np.isfinite(action_change) or abs(action_change) < threshold:
            continue

        y1 = float(day1_row[outcome])
        y100 = float(day100_row[outcome])
        if not (np.isfinite(y1) and np.isfinite(y100)):
            continue
        outcome_change = y100 - y1
        slope_raw = outcome_change / action_change

        cohort_med = float(cohort_median_slopes.get((action, outcome), 0.0))
        slope_adjusted = slope_raw - cohort_med
        confounders = ("cohort_median",) if cohort_med != 0.0 else ()

        sigma_data = biomarker_sigma_data(outcome)
        if sigma_data is None or sigma_data <= 0:
            continue

        step = NOMINAL_STEP_DAILY.get(action, 1.0)
        se_slope = sigma_data / max(abs(action_change), 1e-9)
        out[(action, outcome)] = UserObservation(
            action=action, outcome=outcome,
            slope=float(slope_adjusted),
            se=float(se_slope),
            n=1,  # single pre/post observation, per-spec
            residual_sd=float(sigma_data),
            at_nominal_step=float(slope_adjusted) * step,
            se_at_step=float(sigma_data),  # sigma_data already outcome-scale
            pathway="biomarker",
            sigma_data_used=float(sigma_data),
            confounders_adjusted=confounders,
            slope_raw=float(slope_raw),
        )
    return out


def _cohort_median_slopes(
    life_by_pid: dict[int, pd.DataFrame],
    blood_by_pid: dict[int, pd.DataFrame],
    pid_cohort: dict[int, str],
    pairs: list[tuple[str, str]],
) -> dict[str, dict[tuple[str, str], float]]:
    """Per-cohort median(raw slope) across members. Used to subtract
    shared confounder signal from each user's biomarker slope.
    """
    by_cohort_edge: dict[str, dict[tuple[str, str], list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for pid, cohort in pid_cohort.items():
        life_pid = life_by_pid.get(pid)
        blood_pid = blood_by_pid.get(pid)
        if life_pid is None or blood_pid is None:
            continue
        pre = life_pid[life_pid["day"].between(1, 14)]
        post = life_pid[life_pid["day"].between(87, 100)]
        if len(pre) < 7 or len(post) < 7:
            continue
        day1 = blood_pid[blood_pid["draw_day"] == 1]
        day100 = blood_pid[blood_pid["draw_day"] == 100]
        if len(day1) == 0 or len(day100) == 0:
            continue
        day1_row = day1.iloc[0]
        day100_row = day100.iloc[0]

        for action, outcome in pairs:
            if outcome not in day1_row.index:
                continue
            try:
                ac = float(_daily_action(post, action).mean() - _daily_action(pre, action).mean())
            except KeyError:
                continue
            if not np.isfinite(ac) or abs(ac) < ACTION_CHANGE_THRESHOLD.get(action, 0.0):
                continue
            y1 = float(day1_row[outcome])
            y100 = float(day100_row[outcome])
            if not (np.isfinite(y1) and np.isfinite(y100)):
                continue
            by_cohort_edge[cohort][(action, outcome)].append((y100 - y1) / ac)

    medians: dict[str, dict[tuple[str, str], float]] = {}
    for cohort, edges in by_cohort_edge.items():
        medians[cohort] = {k: float(np.median(vs)) for k, vs in edges.items() if vs}
    return medians


def build_all_user_observations(
    data_dir: str | Path,
    min_n: int = 20,
    supported_pairs: list[tuple[str, str]] | None = None,
) -> dict[int, dict[tuple[str, str], UserObservation]]:
    """Fit per-user observations for every (pid, action, outcome) pair.

    Pairs with wearable-horizon outcomes get OLS slopes (fit_user_observations);
    pairs with biomarker-horizon outcomes get pre/post slopes
    (fit_biomarker_observations). The pathway is inferred from the outcome.
    """
    global SUPPORTED_PAIRS  # declared here so the body can rebind during the run
    data_dir = Path(data_dir)
    wear = pd.read_csv(data_dir / "wearables_daily.csv")
    life = pd.read_csv(data_dir / "lifestyle_app.csv")

    pairs = list(supported_pairs) if supported_pairs is not None else list(SUPPORTED_PAIRS)
    # Load actions (acwr, sleep_debt, travel_load) are rolling aggregates of
    # the native columns already in the design matrix — fitting a daily OLS
    # against them would either collinearity-collapse (acwr is a deterministic
    # ratio of training_min windows) or require a separate rolling-feature
    # pipeline. Skip them here; they stay at the cohort prior, which is exactly
    # what load-sourced insights should carry (they're context knobs, not
    # user-identifiable slopes).
    LOAD_ACTIONS = frozenset({"acwr", "sleep_debt", "travel_load"})
    pairs = [(a, o) for (a, o) in pairs if a not in LOAD_ACTIONS]
    wearable_pairs = [(a, o) for a, o in pairs if o in WEARABLE_HORIZONS]
    biomarker_pairs = [(a, o) for a, o in pairs if o in BIOMARKER_HORIZONS]

    # Swap the default SUPPORTED_PAIRS inside fit_user_observations for this run.
    saved_supported = SUPPORTED_PAIRS
    SUPPORTED_PAIRS = tuple(wearable_pairs)

    wear_by_pid = {int(pid): g for pid, g in wear.groupby("participant_id")}
    life_by_pid = {int(pid): g for pid, g in life.groupby("participant_id")}
    pids = sorted(set(wear_by_pid) & set(life_by_pid))

    blood_by_pid: dict[int, pd.DataFrame] = {}
    pid_cohort: dict[int, str] = {}
    cohort_medians: dict[str, dict[tuple[str, str], float]] = {}

    if biomarker_pairs:
        blood = pd.read_csv(data_dir / "blood_draws.csv")
        blood_by_pid = {int(pid): g for pid, g in blood.groupby("participant_id")}
        # Any draw_day==1 row carries the participant's cohort id; pick the first.
        for pid, g in blood_by_pid.items():
            rows = g[g["draw_day"] == 1]
            if len(rows) > 0:
                pid_cohort[pid] = str(rows.iloc[0]["cohort"])
        cohort_medians = _cohort_median_slopes(
            life_by_pid, blood_by_pid, pid_cohort, biomarker_pairs
        )

    try:
        out: dict[int, dict[tuple[str, str], UserObservation]] = {}
        for pid in pids:
            pairs_out: dict[tuple[str, str], UserObservation] = {}
            if wearable_pairs:
                pairs_out.update(
                    fit_user_observations(pid, wear_by_pid[pid], life_by_pid[pid], min_n=min_n)
                )
            if biomarker_pairs:
                cohort = pid_cohort.get(pid, "__all__")
                pairs_out.update(
                    fit_biomarker_observations(
                        pid,
                        life_by_pid[pid],
                        blood_by_pid.get(pid),
                        biomarker_pairs,
                        cohort_median_slopes=cohort_medians.get(cohort, {}),
                    )
                )
            out[pid] = pairs_out
    finally:
        SUPPORTED_PAIRS = saved_supported
    return out


def _obs_to_dict(rec: UserObservation) -> dict:
    d = asdict(rec)
    # tuple -> list for JSON; list is what JSON gives us on reload anyway.
    d["confounders_adjusted"] = list(d.get("confounders_adjusted") or ())
    return d


def save_user_observations(
    obs: dict[int, dict[tuple[str, str], UserObservation]], out_path: Path,
) -> None:
    payload = {
        str(pid): {f"{a}:{o}": _obs_to_dict(rec) for (a, o), rec in pairs.items()}
        for pid, pairs in obs.items()
    }
    out_path.write_text(json.dumps(payload, indent=2))


def load_user_observations(
    in_path: Path,
) -> dict[int, dict[tuple[str, str], UserObservation]]:
    data = json.loads(in_path.read_text())
    out: dict[int, dict[tuple[str, str], UserObservation]] = {}
    for pid_s, pairs in data.items():
        pairs_out: dict[tuple[str, str], UserObservation] = {}
        for key, vals in pairs.items():
            a, o = key.split(":", 1)
            # Coerce list -> tuple for frozen dataclass consistency. Older
            # JSON files without pathway-aware fields get the default values.
            vals = dict(vals)
            if "confounders_adjusted" in vals:
                vals["confounders_adjusted"] = tuple(vals["confounders_adjusted"])
            pairs_out[(a, o)] = UserObservation(**vals)
        out[int(pid_s)] = pairs_out
    return out


def main():
    ap = argparse.ArgumentParser(description="Per-user OLS on daily CSVs")
    ap.add_argument("--data-dir", default="./output")
    ap.add_argument("--out", default="./output/user_observations.json")
    ap.add_argument("--min-n", type=int, default=20)
    args = ap.parse_args()

    t0 = time.time()
    all_obs = build_all_user_observations(args.data_dir, min_n=args.min_n)
    elapsed = time.time() - t0
    n_pairs = sum(len(v) for v in all_obs.values())
    print(f"[obs] {len(all_obs)} participants x {len(SUPPORTED_PAIRS)} pairs -> "
          f"{n_pairs} fits in {elapsed:.1f}s")

    # Per-pair summary
    by_pair: dict[tuple[str, str], list[UserObservation]] = defaultdict(list)
    for pairs in all_obs.values():
        for key, rec in pairs.items():
            by_pair[key].append(rec)
    print(f"[obs] per-pair summary:")
    for (action, outcome), recs in sorted(by_pair.items()):
        if not recs:
            continue
        at_step = np.array([r.at_nominal_step for r in recs])
        se_step = np.array([r.se_at_step for r in recs])
        print(
            f"  {action:18s} -> {outcome:18s}  "
            f"obs@step mean={at_step.mean():+.3f}  "
            f"p10/p50/p90={np.quantile(at_step,0.1):+.3f}/"
            f"{np.quantile(at_step,0.5):+.3f}/"
            f"{np.quantile(at_step,0.9):+.3f}  "
            f"median se@step={np.median(se_step):.3f}  n_users={len(recs)}"
        )

    save_user_observations(all_obs, Path(args.out))
    print(f"[obs] wrote {args.out}")


if __name__ == "__main__":
    main()
