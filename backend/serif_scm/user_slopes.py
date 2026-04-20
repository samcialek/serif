"""Per-user OLS slope estimation for wearable-target edges.

Feeds the `user` layer of the pop → cohort → user hierarchy. For each
participant and each edge with a wearable target (blood biomarkers have only
2 draws per participant, so slopes aren't identifiable), we fit

    outcome_t ~ alpha + beta * source_t + epsilon

on daily data (100 days per participant). `beta` is the user-specific slope
that the conjugate layer treats as an observation of the true per-user bb,
with SE derived from OLS residuals and the source variance.

Returns a nested dict:
    user_slopes[pid][edge_id] = {
        "slope": float,      # beta
        "se": float,         # SE of beta
        "n": int,            # days with both values non-null
        "behavioral_sd": float,  # SD of source (for dose_multiplier aux use)
    }

Biomarker-target edges are not fit; they simply aren't present in the dict,
and the conjugate layer falls back to pop+cohort for those.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


# Node name -> (CSV name, column). CSV name is "lifestyle" or "wearable".
# Sources observed in lifestyle_app.csv or wearables_daily.csv:
_SOURCE_COLUMNS: dict[str, tuple[str, str]] = {
    "running_volume":   ("lifestyle", "run_km"),
    "training_volume":  ("lifestyle", "training_min"),
    "zone2_volume":     ("lifestyle", "zone2_min"),
    "sleep_duration":   ("lifestyle", "sleep_hrs"),
    "bedtime":          ("lifestyle", "bedtime_hr"),
    "dietary_protein":  ("lifestyle", "protein_g"),
    "dietary_energy":   ("lifestyle", "energy_kcal"),
    "steps":            ("wearable",  "steps"),
}

# Wearable / derived targets we can fit on 100-day time series.
_TARGET_COLUMNS: dict[str, tuple[str, str]] = {
    "hrv_daily":         ("wearable", "hrv_daily"),
    "resting_hr":        ("wearable", "resting_hr"),
    "sleep_efficiency":  ("wearable", "sleep_efficiency"),
    "sleep_quality":     ("wearable", "sleep_quality"),
    "deep_sleep":        ("wearable", "deep_sleep"),
    "sleep_hrs":         ("wearable", "sleep_hrs"),
    "sleep_duration":    ("wearable", "sleep_hrs"),
    "steps":             ("wearable", "steps"),
}


def supported_edges(pop_prior_keys) -> list[tuple[str, str]]:
    """Edges from population_priors that we can fit per-user slopes for."""
    out: list[tuple[str, str]] = []
    for (src, tgt) in pop_prior_keys:
        if src in _SOURCE_COLUMNS and tgt in _TARGET_COLUMNS:
            out.append((src, tgt))
    return out


def _col_frame(
    lifestyle: pd.DataFrame, wearable: pd.DataFrame, kind: str, col: str
) -> pd.DataFrame:
    """Return the DataFrame that owns a (kind, column) pair."""
    if kind == "lifestyle":
        return lifestyle[["participant_id", "day", col]].rename(columns={col: "value"})
    return wearable[["participant_id", "day", col]].rename(columns={col: "value"})


def _ols_per_user(
    merged: pd.DataFrame,
    min_n: int = 10,
) -> dict[int, dict]:
    """Vectorized per-participant OLS slope + SE on (x, y) columns of `merged`.

    Skips participants with <min_n non-null pairs. Returns
    {pid: {"slope": ..., "se": ..., "n": ..., "behavioral_sd": ...}}.
    """
    out: dict[int, dict] = {}

    m = merged.dropna(subset=["x", "y"])
    grouped = m.groupby("participant_id", sort=False)
    for pid, g in grouped:
        n = len(g)
        if n < min_n:
            continue
        x = g["x"].to_numpy(dtype=float)
        y = g["y"].to_numpy(dtype=float)
        x_mean = x.mean()
        y_mean = y.mean()
        dx = x - x_mean
        sxx = float((dx * dx).sum())
        if sxx <= 1e-12:
            # zero-variance source in this user's series — slope undefined
            continue
        dy = y - y_mean
        sxy = float((dx * dy).sum())
        beta = sxy / sxx
        alpha = y_mean - beta * x_mean
        resid = y - (alpha + beta * x)
        # Standard OLS: sigma^2 = SSR / (n-2); SE(beta) = sigma / sqrt(sxx)
        if n > 2:
            sigma2 = float((resid * resid).sum() / (n - 2))
            se = float(np.sqrt(sigma2 / sxx)) if sigma2 > 0 else float("nan")
        else:
            se = float("nan")
        behavioral_sd = float(dx.std(ddof=1)) if n > 1 else float("nan")
        out[int(pid)] = {
            "slope": float(beta),
            "slope_bb": float(beta),     # alias for compute_cohort_prior's expected key
            "se": se,
            "n": int(n),
            "behavioral_sd": behavioral_sd,
        }
    return out


def build_user_slopes(
    edges: list[tuple[str, str]],
    data_dir: str | Path,
    min_n: int = 10,
) -> dict[int, dict[tuple[str, str], dict]]:
    """Compute per-user OLS slopes for every edge in `edges`.

    Returns user_slopes[pid][edge_id] = {slope, se, n, behavioral_sd}.
    Participants who fail `min_n` or who have zero-variance source are omitted
    from that edge's entry (and will fall back to pop+cohort priors).
    """
    data_dir = Path(data_dir)
    lifestyle = pd.read_csv(data_dir / "lifestyle_app.csv")
    wearable = pd.read_csv(data_dir / "wearables_daily.csv")

    # Normalize: inner-join day to align source and target to same calendar day.
    out: dict[int, dict[tuple[str, str], dict]] = {}

    for (src, tgt) in edges:
        src_kind, src_col = _SOURCE_COLUMNS[src]
        tgt_kind, tgt_col = _TARGET_COLUMNS[tgt]
        if src_kind == tgt_kind and src_col == tgt_col:
            # Self-loop (shouldn't happen, but skip defensively).
            continue

        src_df = _col_frame(lifestyle, wearable, src_kind, src_col).rename(columns={"value": "x"})
        tgt_df = _col_frame(lifestyle, wearable, tgt_kind, tgt_col).rename(columns={"value": "y"})

        merged = src_df.merge(tgt_df, on=["participant_id", "day"], how="inner")
        per_user = _ols_per_user(merged, min_n=min_n)

        for pid, rec in per_user.items():
            out.setdefault(pid, {})[(src, tgt)] = rec

    return out


if __name__ == "__main__":
    import sys
    from .population_priors import load_priors_json

    priors = load_priors_json("output/population_priors.json")
    edges = supported_edges(priors.keys())
    print(f"[user_slopes] {len(edges)} wearable-target edges supported out of {len(priors)}")
    for e in edges:
        print(f"  {e[0]} -> {e[1]}")

    import time
    t0 = time.time()
    us = build_user_slopes(edges, "output")
    print(f"[user_slopes] built slopes for {len(us)} participants in {time.time()-t0:.1f}s")

    # Spot-check first participant
    if us:
        pid = min(us.keys())
        print(f"  sample pid={pid}:")
        for e, rec in list(us[pid].items())[:5]:
            print(f"    {e[0]}->{e[1]}: slope={rec['slope']:.4g}, se={rec['se']:.4g}, n={rec['n']}")
