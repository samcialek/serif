"""Three-level hierarchical fit — feasibility test for two edges.

Architecture (non-centered throughout):

    mu_bb_pop, mu_ba_pop, mu_theta_pop                    (population)
    bb_cohort[c]   = mu_bb_pop + sigma_bb_cohort * z_bb_cohort[c]
    bb_individual[i] = bb_cohort[cohort[i]]
                     + sigma_bb_individual * z_bb_individual[i]
    (same for ba and theta)

    sigma_bb_cohort, sigma_ba_cohort ~ HalfNormal(0.5)
        (absolute scale — decoupled from pop_scale, since between-cohort
         variation reflects real cohort differences, not uncertainty about
         the global mean)
    sigma_theta_cohort ~ HalfNormal(2 * pop_theta_scale)
    sigma_*_individual ~ HalfNormal(0.5 * pop_scale)
    z_* ~ Normal(0, 1)
    sigma_obs ~ HalfNormal(pop_scale_y)   (per outcome, not pooled)

Edges tested:
    sleep_duration -> hrv_daily    (wearable: ~100 daily obs per participant)
    running_volume -> ferritin     (biomarker: pre/post pair per participant)

For the biomarker edge the likelihood uses day-100 ferritin versus the 100-day
running mean — one obs per participant. Hierarchy is the only identifier for
individual params in this regime; shrinkage behaviour (or sigma_individual
collapse) is precisely the diagnostic Sam wants.

Run:   python -m serif_scm.hierarchical_model --n-per-cohort 10
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import jax
import jax.numpy as jnp
import numpy as np
import numpyro
import numpyro.distributions as dist
import pandas as pd
from numpyro.infer import MCMC, NUTS
from numpyro.infer.initialization import init_to_sample, init_to_uniform

from serif_scm.curves import soft_piecewise


BACKEND_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BACKEND_DIR / "output"


# ── Participant selection ───────────────────────────────────────────

def pick_participants(
    blood_df: pd.DataFrame, n_per_cohort: int, seed: int,
) -> list[int]:
    """Random pids within each cohort, reproducible under `seed`."""
    rng = np.random.default_rng(seed)
    picks: list[int] = []
    per_cohort_pid = (
        blood_df.drop_duplicates("participant_id")[["participant_id", "cohort"]]
    )
    for cohort, sub in per_cohort_pid.groupby("cohort"):
        pids = sub["participant_id"].to_numpy()
        k = min(n_per_cohort, len(pids))
        picks.extend(rng.choice(pids, size=k, replace=False).tolist())
    return sorted(int(p) for p in picks)


# ── Data assembly ───────────────────────────────────────────────────

def load_wearable_panel(
    pids: list[int],
) -> tuple[pd.DataFrame, list[str]]:
    """Long-form panel: one row per (pid, day) for sleep_duration -> hrv_daily.

    Returns (panel, cohort_labels) where cohort_labels is the unique sorted
    list of cohorts in the picked population (used to build cohort indices).
    """
    wear = pd.read_csv(OUTPUT_DIR / "wearables_daily.csv")
    sub = wear[wear["participant_id"].isin(pids)].copy()
    sub = sub.dropna(subset=["hrv_daily", "sleep_hrs"])
    sub = sub.rename(columns={"sleep_hrs": "sleep_duration"})
    cohort_labels = sorted(sub["cohort"].unique().tolist())
    return sub[["participant_id", "cohort", "day", "sleep_duration", "hrv_daily"]], cohort_labels


def load_biomarker_panel(
    pids: list[int],
) -> tuple[pd.DataFrame, list[str]]:
    """One row per pid: 100-day running-volume mean + day-100 ferritin."""
    blood = pd.read_csv(OUTPUT_DIR / "blood_draws.csv")
    life = pd.read_csv(OUTPUT_DIR / "lifestyle_app.csv")

    run_mean = (
        life[life["participant_id"].isin(pids)]
        .groupby("participant_id")["run_km"].mean()
        .rename("running_volume").reset_index()
    )
    fer = (
        blood[(blood["participant_id"].isin(pids)) & (blood["draw_day"] == 100)]
        [["participant_id", "cohort", "ferritin"]].dropna()
    )
    panel = fer.merge(run_mean, on="participant_id", how="inner")
    cohort_labels = sorted(panel["cohort"].unique().tolist())
    return panel, cohort_labels


# ── Hierarchical model ─────────────────────────────────────────────

def hierarchical_edge(
    action, outcome,
    participant_idx, cohort_idx,
    n_participants, n_cohorts,
    action_mean, outcome_mean,
    pop_prior,
    sigma_obs_scale,
    measurement_sd: float | None = None,
):
    """Non-centered three-level hierarchical fit.

    The population priors anchor mu_*_pop at the fitted pop-level mean; the
    two sigma_* scales at each level are ~HalfNormal(0.5 * pop_scale), so
    cohort and individual deviations are a priori smaller than the width of
    the population prior itself.
    """
    pop_bb_scale = pop_prior["pop_bb_scale"]
    pop_ba_scale = pop_prior["pop_ba_scale"]
    pop_theta_scale = pop_prior["pop_theta_scale"]

    # ── Population-level means ──
    mu_bb_pop = numpyro.sample(
        "mu_bb_pop", dist.Normal(pop_prior["pop_bb"], pop_bb_scale)
    )
    mu_ba_pop = numpyro.sample(
        "mu_ba_pop", dist.Normal(pop_prior["pop_ba"], pop_ba_scale)
    )
    mu_theta_pop = numpyro.sample(
        "mu_theta_pop", dist.Normal(pop_prior["pop_theta"], pop_theta_scale)
    )

    # ── Cohort-level scales + offsets ──
    # Absolute-scale priors for slope parameters (bb, ba). The pop_scale is the
    # uncertainty about the global mean; between-cohort variation is a
    # different quantity and can exceed it. 300-ppt scale test (2026-04-19)
    # showed HalfNormal(0.5 * pop_scale) = HalfNormal(0.025) for bb fighting
    # a data-driven between-cohort sd ~1.75 → multimodal chains, R-hat 3.60.
    #
    # Task 1c attempted HalfNormal(0.15) (empirically-calibrated) but did NOT
    # fix the mode-jumping — the binding constraint is sigma_bb_individual,
    # not sigma_*_cohort. Reverted. See output/hierarchical_v3_findings.md
    # for the full diagnosis; proposed fix is widening sigma_bb_individual
    # from HalfNormal(0.5 * pop_bb_scale) to HalfNormal(0.75).
    sigma_bb_cohort = numpyro.sample(
        "sigma_bb_cohort", dist.HalfNormal(0.5)
    )
    sigma_ba_cohort = numpyro.sample(
        "sigma_ba_cohort", dist.HalfNormal(0.5)
    )
    sigma_theta_cohort = numpyro.sample(
        "sigma_theta_cohort", dist.HalfNormal(2.0 * pop_theta_scale)
    )
    with numpyro.plate("cohort_plate", n_cohorts):
        z_bb_cohort = numpyro.sample("z_bb_cohort", dist.Normal(0.0, 1.0))
        z_ba_cohort = numpyro.sample("z_ba_cohort", dist.Normal(0.0, 1.0))
        z_theta_cohort = numpyro.sample("z_theta_cohort", dist.Normal(0.0, 1.0))
    bb_cohort = mu_bb_pop + sigma_bb_cohort * z_bb_cohort
    ba_cohort = mu_ba_pop + sigma_ba_cohort * z_ba_cohort
    theta_cohort = mu_theta_pop + sigma_theta_cohort * z_theta_cohort
    numpyro.deterministic("bb_cohort", bb_cohort)
    numpyro.deterministic("ba_cohort", ba_cohort)
    numpyro.deterministic("theta_cohort", theta_cohort)

    # ── Individual-level scales + offsets ──
    # Individual-level prior scale set to allow empirical heterogeneity
    # (v3 diagnosis 2026-04-19: empirical SD on sleep_duration→hrv_daily was
    # 0.576 ms/hr; prior HalfNormal(0.025) was 29x too tight and forced
    # multimodal posteriors — the sampler spilled individual variation into
    # the cohort level, causing R-hat 28 chain disagreement). sigma_theta_
    # individual is left scaled to pop_theta_scale because theta is already
    # well-identified (v3 ferritin edge converged with cohort_theta spread ≈ 0
    # and no mode-jumping).
    sigma_bb_individual = numpyro.sample(
        "sigma_bb_individual", dist.HalfNormal(0.75)
    )
    sigma_ba_individual = numpyro.sample(
        "sigma_ba_individual", dist.HalfNormal(0.75)
    )
    sigma_theta_individual = numpyro.sample(
        "sigma_theta_individual", dist.HalfNormal(0.5 * pop_theta_scale)
    )
    with numpyro.plate("participant_plate", n_participants):
        z_bb_individual = numpyro.sample("z_bb_individual", dist.Normal(0.0, 1.0))
        z_ba_individual = numpyro.sample("z_ba_individual", dist.Normal(0.0, 1.0))
        z_theta_individual = numpyro.sample("z_theta_individual", dist.Normal(0.0, 1.0))
    bb_individual = bb_cohort[cohort_idx] + sigma_bb_individual * z_bb_individual
    ba_individual = ba_cohort[cohort_idx] + sigma_ba_individual * z_ba_individual
    theta_individual = theta_cohort[cohort_idx] + sigma_theta_individual * z_theta_individual
    numpyro.deterministic("bb_individual", bb_individual)
    numpyro.deterministic("ba_individual", ba_individual)
    numpyro.deterministic("theta_individual", theta_individual)

    # ── Likelihood ──
    bb_obs = bb_individual[participant_idx]
    ba_obs = ba_individual[participant_idx]
    theta_obs = theta_individual[participant_idx]
    contribution = (
        soft_piecewise(action, theta_obs, bb_obs, ba_obs)
        - soft_piecewise(action_mean, theta_obs, bb_obs, ba_obs)
    )
    mu_y = outcome_mean + contribution

    if measurement_sd is not None and measurement_sd > 0:
        sigma_obs = numpyro.sample(
            "sigma_obs",
            dist.LogNormal(loc=jnp.log(measurement_sd), scale=0.2),
        )
    else:
        sigma_obs = numpyro.sample("sigma_obs", dist.HalfNormal(sigma_obs_scale))
    numpyro.sample("y", dist.Normal(mu_y, sigma_obs), obs=outcome)


# ── Fit runner + diagnostics ───────────────────────────────────────

def _pop_prior_block(raw_edge: dict) -> dict:
    return {
        "pop_bb": float(raw_edge["mean_slope_bb"]),
        "pop_bb_scale": float(math.sqrt(max(raw_edge["var_slope_bb"], 1e-6))),
        "pop_ba": float(raw_edge["mean_slope_ba"]),
        "pop_ba_scale": float(math.sqrt(max(raw_edge["var_slope_ba"], 1e-6))),
        "pop_theta": float(raw_edge["mean_theta"]),
        "pop_theta_scale": float(math.sqrt(max(raw_edge["var_theta"], 1e-6))),
    }


def _rhat(samples_by_chain: np.ndarray) -> float:
    """Gelman-Rubin R-hat on (chains, draws, ...) array."""
    arr = np.asarray(samples_by_chain)
    if arr.ndim < 2:
        return float("nan")
    flat = arr.reshape(arr.shape[0], arr.shape[1], -1)
    rhats: list[float] = []
    for k in range(flat.shape[-1]):
        x = flat[:, :, k]
        m, n = x.shape
        if n < 2 or m < 2:
            continue
        chain_means = x.mean(axis=1)
        chain_vars = x.var(axis=1, ddof=1)
        W = chain_vars.mean()
        B = n * chain_means.var(ddof=1)
        var_hat = ((n - 1) / n) * W + B / n
        if W <= 0:
            continue
        rhats.append(float(math.sqrt(var_hat / W)))
    return max(rhats) if rhats else float("nan")


def _ess(samples_by_chain: np.ndarray) -> float:
    """Crude effective-sample-size estimate (chains combined, simple)."""
    arr = np.asarray(samples_by_chain)
    if arr.ndim < 2:
        return float("nan")
    flat = arr.reshape(arr.shape[0], arr.shape[1], -1)
    ess_vals: list[float] = []
    for k in range(flat.shape[-1]):
        x = flat[:, :, k].reshape(-1)
        n = x.size
        if n < 4:
            continue
        mean = x.mean()
        var = x.var()
        if var <= 0:
            continue
        lags = min(50, n // 4)
        rho_sum = 0.0
        for lag in range(1, lags):
            cov = ((x[:-lag] - mean) * (x[lag:] - mean)).mean()
            rho = cov / var
            if rho < 0.05:
                break
            rho_sum += rho
        tau = 1.0 + 2.0 * rho_sum
        ess_vals.append(float(n / max(tau, 1.0)))
    return min(ess_vals) if ess_vals else float("nan")


def summarize_level(samples: dict, keys: list[str]) -> dict:
    max_rhat = -1.0
    min_ess = float("inf")
    worst_rhat_key = None
    worst_ess_key = None
    for k in keys:
        if k not in samples:
            continue
        v = samples[k]
        if v.ndim == 2:
            r = _rhat(v)
            e = _ess(v)
        else:
            # (chains, draws, *dims)
            r = _rhat(v)
            e = _ess(v)
        if r > max_rhat:
            max_rhat = r
            worst_rhat_key = k
        if e < min_ess:
            min_ess = e
            worst_ess_key = k
    return {
        "max_rhat": max_rhat,
        "worst_rhat_param": worst_rhat_key,
        "min_ess": min_ess,
        "worst_ess_param": worst_ess_key,
    }


def fit_edge(
    edge_key: str,
    panel: pd.DataFrame,
    action_col: str,
    outcome_col: str,
    cohort_labels: list[str],
    pop_prior: dict,
    sigma_obs_scale: float,
    num_warmup: int,
    num_samples: int,
    num_chains: int,
    target_accept: float,
    seed: int,
    init_strategy: str = "uniform",
    measurement_sd: float | None = None,
) -> dict:
    # Stable participant + cohort indexing
    pids = sorted(panel["participant_id"].unique().tolist())
    pid_to_idx = {p: i for i, p in enumerate(pids)}
    cohort_to_idx = {c: i for i, c in enumerate(cohort_labels)}
    pid_cohort = (
        panel.drop_duplicates("participant_id")
        .set_index("participant_id")["cohort"]
        .to_dict()
    )
    per_participant_cohort_idx = np.array(
        [cohort_to_idx[pid_cohort[p]] for p in pids], dtype=np.int32
    )
    participant_idx = np.array(
        [pid_to_idx[p] for p in panel["participant_id"]], dtype=np.int32
    )

    action = jnp.asarray(panel[action_col].to_numpy(dtype="float32"))
    outcome = jnp.asarray(panel[outcome_col].to_numpy(dtype="float32"))
    action_mean = float(panel[action_col].mean())
    outcome_mean = float(panel[outcome_col].mean())

    print(f"\n[hier] === {edge_key} ===")
    print(f"[hier] n_rows={len(panel)}  n_participants={len(pids)}  n_cohorts={len(cohort_labels)}")
    print(f"[hier] action_mean={action_mean:.3f}  outcome_mean={outcome_mean:.3f}")
    print(f"[hier] pop prior: bb={pop_prior['pop_bb']:+.4f}±{pop_prior['pop_bb_scale']:.4f}  "
          f"ba={pop_prior['pop_ba']:+.4f}±{pop_prior['pop_ba_scale']:.4f}  "
          f"theta={pop_prior['pop_theta']:+.3f}±{pop_prior['pop_theta_scale']:.3f}")

    if init_strategy == "sample":
        init_fn = init_to_sample()
    else:
        init_fn = init_to_uniform()
    kernel = NUTS(
        hierarchical_edge,
        target_accept_prob=target_accept,
        init_strategy=init_fn,
    )
    mcmc = MCMC(
        kernel,
        num_warmup=num_warmup,
        num_samples=num_samples,
        num_chains=num_chains,
        progress_bar=False,
        chain_method="sequential",
    )
    t0 = time.time()
    mcmc.run(
        jax.random.PRNGKey(seed),
        action=action,
        outcome=outcome,
        participant_idx=jnp.asarray(participant_idx),
        cohort_idx=jnp.asarray(per_participant_cohort_idx),
        n_participants=len(pids),
        n_cohorts=len(cohort_labels),
        action_mean=action_mean,
        outcome_mean=outcome_mean,
        pop_prior=pop_prior,
        sigma_obs_scale=sigma_obs_scale,
        measurement_sd=measurement_sd,
        extra_fields=("diverging",),
    )
    elapsed = time.time() - t0

    samples = mcmc.get_samples(group_by_chain=True)
    flat = mcmc.get_samples(group_by_chain=False)
    extra = mcmc.get_extra_fields()
    divergences = int(extra["diverging"].sum()) if "diverging" in extra else 0

    pop_keys = ["mu_bb_pop", "mu_ba_pop", "mu_theta_pop"]
    sigma_cohort_keys = ["sigma_bb_cohort", "sigma_ba_cohort", "sigma_theta_cohort"]
    sigma_indiv_keys = ["sigma_bb_individual", "sigma_ba_individual", "sigma_theta_individual"]
    cohort_keys = ["bb_cohort", "ba_cohort", "theta_cohort"]
    indiv_keys = ["bb_individual", "ba_individual", "theta_individual"]

    pop_diag = summarize_level(samples, pop_keys + sigma_cohort_keys + sigma_indiv_keys)
    cohort_diag = summarize_level(samples, cohort_keys)
    indiv_diag = summarize_level(samples, indiv_keys)

    # Shrinkage diagnostic: each individual's distance from its cohort mean,
    # normalized by sigma_individual posterior median.
    bb_ind_mean = np.asarray(flat["bb_individual"]).mean(axis=0)   # (n_ppts,)
    bb_cohort_mean = np.asarray(flat["bb_cohort"]).mean(axis=0)     # (n_cohorts,)
    bb_cohort_assignment = bb_cohort_mean[per_participant_cohort_idx]
    sig_bb_ind_med = float(np.median(np.asarray(flat["sigma_bb_individual"])))
    z_from_cohort = (bb_ind_mean - bb_cohort_assignment) / max(sig_bb_ind_med, 1e-9)

    # Cross-cohort spread of bb
    bb_cohort_spread = float(np.std(bb_cohort_mean))
    ba_cohort_mean = np.asarray(flat["ba_cohort"]).mean(axis=0)
    ba_cohort_spread = float(np.std(ba_cohort_mean))

    # Sigma-individual collapse indicator
    sig_bb_ind_p05 = float(np.quantile(np.asarray(flat["sigma_bb_individual"]), 0.05))
    sig_ba_ind_p05 = float(np.quantile(np.asarray(flat["sigma_ba_individual"]), 0.05))
    sig_th_ind_p05 = float(np.quantile(np.asarray(flat["sigma_theta_individual"]), 0.05))

    print(f"[hier] elapsed={elapsed:.1f}s  divergences={divergences}")
    print(f"[hier] pop_level   max R-hat={pop_diag['max_rhat']:.3f} (worst: {pop_diag['worst_rhat_param']})  "
          f"min ESS={pop_diag['min_ess']:.0f}")
    print(f"[hier] cohort      max R-hat={cohort_diag['max_rhat']:.3f}  min ESS={cohort_diag['min_ess']:.0f}")
    print(f"[hier] individual  max R-hat={indiv_diag['max_rhat']:.3f}  min ESS={indiv_diag['min_ess']:.0f}")
    print(f"[hier] posterior mu_bb_pop={float(np.mean(flat['mu_bb_pop'])):+.4f}  "
          f"mu_ba_pop={float(np.mean(flat['mu_ba_pop'])):+.4f}  "
          f"mu_theta_pop={float(np.mean(flat['mu_theta_pop'])):+.3f}")
    print(f"[hier] cohort spread (sd across cohorts): bb={bb_cohort_spread:.4f}  ba={ba_cohort_spread:.4f}")
    print(f"[hier] sigma_individual (post median): "
          f"bb={sig_bb_ind_med:.4g}  "
          f"ba={float(np.median(np.asarray(flat['sigma_ba_individual']))):.4g}  "
          f"theta={float(np.median(np.asarray(flat['sigma_theta_individual']))):.4g}")
    print(f"[hier] sigma_individual 5th pct (collapse check): "
          f"bb_p05={sig_bb_ind_p05:.4g}  ba_p05={sig_ba_ind_p05:.4g}  theta_p05={sig_th_ind_p05:.4g}")
    print(f"[hier] individual z-from-cohort (bb): "
          f"mean_abs={float(np.mean(np.abs(z_from_cohort))):.3f}  "
          f"max_abs={float(np.max(np.abs(z_from_cohort))):.3f}")

    cohort_bb_posterior = [
        {"cohort": cohort_labels[k],
         "bb_mean": float(bb_cohort_mean[k]),
         "ba_mean": float(ba_cohort_mean[k])}
        for k in range(len(cohort_labels))
    ]

    # Per-chain cohort bb means — the label-swapping diagnostic. If chains
    # disagree on a cohort's sign, averaging across chains hides the problem
    # in the flat summary. This surfaces the disagreement directly.
    per_chain_bb = np.asarray(samples["bb_cohort"])  # (chains, draws, n_cohorts)
    per_chain_bb_mean = per_chain_bb.mean(axis=1)     # (chains, n_cohorts)
    per_chain_cohort_bb = []
    for c_idx in range(len(cohort_labels)):
        per_chain_cohort_bb.append({
            "cohort": cohort_labels[c_idx],
            "per_chain_mean": [float(per_chain_bb_mean[ch, c_idx])
                               for ch in range(per_chain_bb_mean.shape[0])],
        })
    print(f"[hier] per-chain bb_cohort means:")
    for entry in per_chain_cohort_bb:
        chain_str = ", ".join(f"{v:+.3f}" for v in entry["per_chain_mean"])
        print(f"  {entry['cohort']:10s}  [{chain_str}]")

    return {
        "edge": edge_key,
        "elapsed_sec": elapsed,
        "n_rows": int(len(panel)),
        "n_participants": len(pids),
        "n_cohorts": len(cohort_labels),
        "divergences": divergences,
        "pop_diagnostics": pop_diag,
        "cohort_diagnostics": cohort_diag,
        "individual_diagnostics": indiv_diag,
        "pop_posterior": {
            "mu_bb_pop": float(np.mean(flat["mu_bb_pop"])),
            "mu_ba_pop": float(np.mean(flat["mu_ba_pop"])),
            "mu_theta_pop": float(np.mean(flat["mu_theta_pop"])),
        },
        "cohort_bb_spread": bb_cohort_spread,
        "cohort_ba_spread": ba_cohort_spread,
        "cohort_bb_posterior": cohort_bb_posterior,
        "sigma_individual_median": {
            "bb": sig_bb_ind_med,
            "ba": float(np.median(np.asarray(flat["sigma_ba_individual"]))),
            "theta": float(np.median(np.asarray(flat["sigma_theta_individual"]))),
        },
        "sigma_individual_p05": {
            "bb": sig_bb_ind_p05,
            "ba": sig_ba_ind_p05,
            "theta": sig_th_ind_p05,
        },
        "shrinkage_z_bb": {
            "mean_abs": float(np.mean(np.abs(z_from_cohort))),
            "max_abs": float(np.max(np.abs(z_from_cohort))),
        },
    }


# ── Main ───────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-per-cohort", type=int, default=10)
    ap.add_argument("--warmup", type=int, default=1000)
    ap.add_argument("--samples", type=int, default=1000)
    ap.add_argument("--chains", type=int, default=2)
    ap.add_argument("--target-accept", type=float, default=0.9)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path, default=OUTPUT_DIR / "hierarchical_feasibility.json")
    ap.add_argument("--skip", choices=["wearable", "biomarker"], default=None,
                    help="Skip one edge for debugging")
    ap.add_argument("--init-strategy", choices=["uniform", "sample"],
                    default="uniform",
                    help="Chain init: uniform (default) or sample (from prior)")
    ap.add_argument("--measurement-aware", action="store_true",
                    help="Use literature measurement SD as LogNormal prior for sigma_obs")
    args = ap.parse_args()

    numpyro.set_host_device_count(max(args.chains, 1))
    print(f"[hier] JAX devices: {jax.devices()}")
    print(f"[hier] MCMC config: {args.chains} chains, {args.warmup} warmup, "
          f"{args.samples} samples, target_accept={args.target_accept}")

    blood_all = pd.read_csv(OUTPUT_DIR / "blood_draws.csv")
    pids = pick_participants(blood_all, n_per_cohort=args.n_per_cohort, seed=args.seed)
    print(f"[hier] Selected {len(pids)} participants ({args.n_per_cohort}/cohort)")

    with open(OUTPUT_DIR / "population_priors.json") as f:
        pop_priors_raw = json.load(f)

    results = {}

    # ── Wearable edge: sleep_duration -> hrv_daily ──
    if args.skip != "wearable":
        wear_panel, wear_cohorts = load_wearable_panel(pids)
        prior_w = _pop_prior_block(pop_priors_raw["sleep_duration|hrv_daily"])
        # HRV daily ranges roughly 20-100 with SD ~15; use that as obs scale prior
        sigma_obs_scale_w = 20.0
        measurement_sd_w = None
        if args.measurement_aware:
            from serif_scm.measurement_priors import lookup_measurement_sd
            hrv_mean = float(wear_panel["hrv_daily"].mean())
            measurement_sd_w = lookup_measurement_sd("hrv_daily", hrv_mean)
            print(f"[hier] measurement-aware: hrv_daily mean={hrv_mean:.2f}  "
                  f"measurement_sd={measurement_sd_w:.3f}")
        res_w = fit_edge(
            "sleep_duration|hrv_daily",
            wear_panel,
            action_col="sleep_duration",
            outcome_col="hrv_daily",
            cohort_labels=wear_cohorts,
            pop_prior=prior_w,
            sigma_obs_scale=sigma_obs_scale_w,
            num_warmup=args.warmup,
            num_samples=args.samples,
            num_chains=args.chains,
            target_accept=args.target_accept,
            seed=args.seed,
            init_strategy=args.init_strategy,
            measurement_sd=measurement_sd_w,
        )
        results["sleep_duration|hrv_daily"] = res_w

    # ── Biomarker edge: running_volume -> ferritin ──
    if args.skip != "biomarker":
        bio_panel, bio_cohorts = load_biomarker_panel(pids)
        prior_b = _pop_prior_block(pop_priors_raw["running_volume|ferritin"])
        # Ferritin (ng/mL) ranges roughly 30-300 with SD ~50; obs_scale 50 is generous
        sigma_obs_scale_b = 60.0
        measurement_sd_b = None
        if args.measurement_aware:
            from serif_scm.measurement_priors import lookup_measurement_sd
            ferritin_mean = float(bio_panel["ferritin"].mean())
            measurement_sd_b = lookup_measurement_sd("ferritin", ferritin_mean)
            print(f"[hier] measurement-aware: ferritin mean={ferritin_mean:.2f}  "
                  f"measurement_sd={measurement_sd_b:.3f}")
        res_b = fit_edge(
            "running_volume|ferritin",
            bio_panel,
            action_col="running_volume",
            outcome_col="ferritin",
            cohort_labels=bio_cohorts,
            pop_prior=prior_b,
            sigma_obs_scale=sigma_obs_scale_b,
            num_warmup=args.warmup,
            num_samples=args.samples,
            num_chains=args.chains,
            target_accept=args.target_accept,
            seed=args.seed + 1,
            init_strategy=args.init_strategy,
            measurement_sd=measurement_sd_b,
        )
        results["running_volume|ferritin"] = res_b

    args.out.write_text(json.dumps(results, indent=2, default=float))
    print(f"\n[hier] Wrote {args.out}")

    # ── Extrapolation ──
    total_elapsed = sum(r["elapsed_sec"] for r in results.values())
    avg_per_edge = total_elapsed / max(len(results), 1)
    print(f"\n[hier] Total wall: {total_elapsed:.1f}s  "
          f"avg/edge: {avg_per_edge:.1f}s  "
          f"extrapolated 40 edges: {avg_per_edge * 40 / 60:.1f} min")

    # ── Stop-condition check ──
    stop_flags: list[str] = []
    for key, r in results.items():
        if r["divergences"] > 50:
            stop_flags.append(f"{key}: {r['divergences']} divergences > 50")
        if r["pop_diagnostics"]["max_rhat"] > 1.1:
            stop_flags.append(
                f"{key}: pop max R-hat {r['pop_diagnostics']['max_rhat']:.3f} > 1.1 "
                f"(param: {r['pop_diagnostics']['worst_rhat_param']})"
            )
        if r["sigma_individual_p05"]["bb"] < 1e-4:
            stop_flags.append(
                f"{key}: sigma_bb_individual p05={r['sigma_individual_p05']['bb']:.2e} "
                f"— individual-level hierarchy collapsed"
            )
        if r["elapsed_sec"] > 7200:
            stop_flags.append(f"{key}: {r['elapsed_sec']:.0f}s > 2h per edge")

    if stop_flags:
        print(f"\n[hier] STOP CONDITIONS TRIPPED:")
        for s in stop_flags:
            print(f"  - {s}")
    else:
        print(f"\n[hier] No stop conditions tripped.")


if __name__ == "__main__":
    main()
