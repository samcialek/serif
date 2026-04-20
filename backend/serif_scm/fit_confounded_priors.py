"""Re-fit population priors for the 6 edges touched by the 3 priority latents.

Scope (deliberately narrow — this is the Phase 2 verification fit):

    sweat_iron_loss → running_volume →  {ferritin, iron_total}
    gi_iron_loss    → running_volume →  {ferritin, iron_total, hemoglobin}
    lipoprotein_lipase → zone2_volume → {triglycerides, hdl, ldl}

Data shape: synthetic `blood_draws.csv` has 2 draws per participant (day 1, day
100) across 1188 participants. Exposure between draws is reconstructed as the
100-day mean of daily action (from `lifestyle_app.csv`).

Model (cross-sectional, one NumPyro call per edge):

    # action model couples U to the observed 100-day avg
    obs_action  ~ Normal(mu_x + λ_x · U, σ_x)     # per participant
    # outcome model couples U to the day-100 biomarker
    obs_outcome ~ Normal(α + f(obs_action; bb, ba, θ) + λ_y · U, σ_y)
    U           ~ Normal(0, σ_U)                   # per participant
    λ_x, λ_y, σ_U, σ_x, σ_y, bb, ba, θ — population params

Identification: 1188 participants with cross-equation covariance in (action,
outcome) residuals identifies U_scale and λ coefficients. The slope f'(·)
reflects the within-DAG effect after partialling out U.

Output: `output/population_priors_confounded.json` (same shape as
`population_priors.json` but only for the 6 confounded edges — merged with the
original file for downstream consumers).

Run:  python -m serif_scm.fit_confounded_priors  [--edges running_volume->ferritin ...]
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

from serif_scm.curves import soft_piecewise


BACKEND_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BACKEND_DIR / "output"

# Map native action name -> CSV column in lifestyle_app.csv
ACTION_COL = {
    "running_volume": "run_km",
    "zone2_volume": "zone2_min",
    "training_volume": "training_min",
}

# Edges fit with wired confounders (Phase 2 + final Phase 3 set).
#
# Excluded from the fit, with reasons:
#   - workout_time → sleep_efficiency: core_temperature would touch it, but
#     `workout_end_hr` is not persisted in lifestyle_app.csv — generator keeps
#     it in memory only. Requires synthetic-data regeneration (deferred).
#   - zone2_volume → apob, zone2_volume → non_hdl_cholesterol: only latent was
#     reverse_cholesterol_transport. Phase 3 fit produced |λ_action|~3 with
#     |λ_outcome|<0.3 and slopes moving *away* from zero — over-parameterization
#     signature, i.e. RCT is not a functional confounder for these edges in the
#     synthetic data. LPL alone handles the zone2→lipid pathway. RCT is kept
#     in serif_confounding_structure.md for real-user reference but unwired.
#   - training_volume → insulin (insulin_sensitivity), training_volume →
#     body_fat_pct (energy_expenditure): both produced >5 divergences with
#     large latent σ_U and λ_action but near-zero causal slopes. Treated as
#     zero-slope edges per engine-lessons pattern #8. The latents themselves
#     remain available for other edges (e.g. insulin_sensitivity is wired on
#     zone2→triglycerides and training→glucose).
CONFOUNDED_EDGES = [
    # Iron (Phase 2)
    ("running_volume", "ferritin"),
    ("running_volume", "iron_total"),
    ("running_volume", "hemoglobin"),
    # Lipids — LPL only after Phase 3 RCT-drop
    ("zone2_volume", "triglycerides"),    # LPL + insulin_sensitivity
    ("zone2_volume", "hdl"),              # LPL
    ("zone2_volume", "ldl"),              # LPL
    # Glucose regulation (Phase 3)
    ("training_volume", "glucose"),       # insulin_sensitivity
]

# Which latents confound which edges. Reflects the final wiring after Phase 3
# decisions — reverse_cholesterol_transport, core_temperature are not wired;
# insulin_sensitivity/energy_expenditure remain available but only wired where
# the edge fit was stable.
EDGE_LATENTS = {
    ("running_volume", "ferritin"): ["sweat_iron_loss", "gi_iron_loss"],
    ("running_volume", "iron_total"): ["sweat_iron_loss", "gi_iron_loss"],
    ("running_volume", "hemoglobin"): ["gi_iron_loss"],
    ("zone2_volume", "triglycerides"): ["lipoprotein_lipase", "insulin_sensitivity"],
    ("zone2_volume", "hdl"): ["lipoprotein_lipase"],
    ("zone2_volume", "ldl"): ["lipoprotein_lipase"],
    ("training_volume", "glucose"): ["insulin_sensitivity"],
}


# ── Data loading ────────────────────────────────────────────────────

def load_participant_panel() -> pd.DataFrame:
    """One row per participant with 100-day action means + day-100 biomarkers."""
    blood = pd.read_csv(OUTPUT_DIR / "blood_draws.csv")
    lifestyle = pd.read_csv(OUTPUT_DIR / "lifestyle_app.csv")

    action_means = (
        lifestyle.groupby("participant_id")[["run_km", "zone2_min", "training_min"]]
        .mean()
        .rename(columns={"run_km": "running_volume",
                         "zone2_min": "zone2_volume",
                         "training_min": "training_volume"})
        .reset_index()
    )

    outcome_cols = ["participant_id", "cohort",
                    "ferritin", "iron_total", "hemoglobin",
                    "triglycerides", "hdl", "ldl",
                    "apob", "non_hdl_cholesterol",
                    "glucose", "insulin",
                    "body_fat_pct"]
    outcome = blood[blood["draw_day"] == 100][outcome_cols].copy()

    panel = outcome.merge(action_means, on="participant_id", how="inner")
    return panel


# ── One-edge NumPyro model ──────────────────────────────────────────

def confounded_edge_model(
    action: jnp.ndarray,
    outcome: jnp.ndarray,
    action_mean: float,
    outcome_mean: float,
    latent_names: list[str],
    pop_prior: dict,
    n_p: int,
):
    """Single (action, outcome) fit with shared-noise latents.

    One U per participant per latent. λ_x (on action) and λ_y (on outcome)
    couple the latent to both sides; MCMC uses cross-equation covariance to
    separate the causal slope f'(action) from the confounding.
    """
    # Causal-slope params (informed by current pop prior — diffuse but centered)
    bb = numpyro.sample(
        "bb", dist.Normal(pop_prior["pop_bb"], pop_prior["pop_bb_scale"])
    )
    ba = numpyro.sample(
        "ba", dist.Normal(pop_prior["pop_ba"], pop_prior["pop_ba_scale"])
    )
    theta = numpyro.sample(
        "theta", dist.Normal(pop_prior["pop_theta"], pop_prior["pop_theta_scale"])
    )

    # Participant-level latent confounders (one U per participant per latent)
    u_sum_action = jnp.zeros(n_p)
    u_sum_outcome = jnp.zeros(n_p)
    for c_name in latent_names:
        sigma_c = numpyro.sample(f"sigma_{c_name}", dist.HalfNormal(1.0))
        with numpyro.plate(f"plate_{c_name}", n_p):
            u = numpyro.sample(f"U_{c_name}", dist.Normal(0.0, sigma_c))
        lam_x = numpyro.sample(f"lambda_{c_name}_action", dist.Normal(0.0, 1.0))
        lam_y = numpyro.sample(f"lambda_{c_name}_outcome", dist.Normal(0.0, 1.0))
        u_sum_action = u_sum_action + lam_x * u
        u_sum_outcome = u_sum_outcome + lam_y * u

    # Action model: observed 100-day mean ~ pop mean + λ_x·U + noise
    sigma_action = numpyro.sample("sigma_action", dist.HalfNormal(1.0))
    numpyro.sample(
        "obs_action",
        dist.Normal(action_mean + u_sum_action, sigma_action),
        obs=action,
    )

    # Outcome model: centered contribution keeps θ in absolute coords
    contribution = (
        soft_piecewise(action, theta, bb, ba)
        - soft_piecewise(action_mean, theta, bb, ba)
    )
    mu_y = outcome_mean + contribution + u_sum_outcome
    sigma_outcome = numpyro.sample("sigma_outcome", dist.HalfNormal(10.0))
    numpyro.sample("obs_outcome", dist.Normal(mu_y, sigma_outcome), obs=outcome)


# ── Fit one edge, return posterior summary in prior schema ──────────

def fit_one_edge(
    action_name: str,
    outcome_name: str,
    panel: pd.DataFrame,
    pop_priors: dict,
    num_warmup: int,
    num_samples: int,
    seed: int,
) -> dict:
    edge_key = f"{action_name}|{outcome_name}"
    current = pop_priors[edge_key]

    sub = panel[[action_name, outcome_name]].dropna().reset_index(drop=True)
    n_p = len(sub)
    action_arr = jnp.asarray(sub[action_name].to_numpy(dtype="float32"))
    outcome_arr = jnp.asarray(sub[outcome_name].to_numpy(dtype="float32"))

    action_mean = float(sub[action_name].mean())
    outcome_mean = float(sub[outcome_name].mean())

    prior_for_model = {
        "pop_bb": float(current["mean_slope_bb"]),
        "pop_bb_scale": float(math.sqrt(max(current["var_slope_bb"], 1e-8))),
        "pop_ba": float(current["mean_slope_ba"]),
        "pop_ba_scale": float(math.sqrt(max(current["var_slope_ba"], 1e-8))),
        "pop_theta": float(current["mean_theta"]),
        "pop_theta_scale": float(math.sqrt(max(current["var_theta"], 1e-8))),
    }

    latent_names = EDGE_LATENTS[(action_name, outcome_name)]

    print(f"\n[{edge_key}]  n_p={n_p}  action_mean={action_mean:.2f}  outcome_mean={outcome_mean:.2f}")
    print(f"  latents={latent_names}")
    print(f"  prior bb={prior_for_model['pop_bb']:+.4f}±{prior_for_model['pop_bb_scale']:.4f}")

    kernel = NUTS(confounded_edge_model)
    mcmc = MCMC(
        kernel,
        num_warmup=num_warmup,
        num_samples=num_samples,
        num_chains=1,
        progress_bar=False,
    )
    t0 = time.time()
    mcmc.run(
        jax.random.PRNGKey(seed),
        action=action_arr,
        outcome=outcome_arr,
        action_mean=action_mean,
        outcome_mean=outcome_mean,
        latent_names=latent_names,
        pop_prior=prior_for_model,
        n_p=n_p,
        extra_fields=("diverging",),
    )
    elapsed = time.time() - t0

    samples = mcmc.get_samples()
    extra = mcmc.get_extra_fields()
    divergences = int(extra["diverging"].sum()) if "diverging" in extra else 0

    post_bb = {
        "mean": float(samples["bb"].mean()),
        "sd": float(samples["bb"].std()),
    }
    post_ba = {
        "mean": float(samples["ba"].mean()),
        "sd": float(samples["ba"].std()),
    }
    post_theta = {
        "mean": float(samples["theta"].mean()),
        "sd": float(samples["theta"].std()),
    }
    post_lambdas = {}
    for c_name in latent_names:
        post_lambdas[c_name] = {
            "lambda_action_mean": float(samples[f"lambda_{c_name}_action"].mean()),
            "lambda_action_sd": float(samples[f"lambda_{c_name}_action"].std()),
            "lambda_outcome_mean": float(samples[f"lambda_{c_name}_outcome"].mean()),
            "lambda_outcome_sd": float(samples[f"lambda_{c_name}_outcome"].std()),
            "sigma_mean": float(samples[f"sigma_{c_name}"].mean()),
        }

    print(f"  posterior bb={post_bb['mean']:+.4f}±{post_bb['sd']:.4f}  "
          f"ba={post_ba['mean']:+.4f}±{post_ba['sd']:.4f}  "
          f"divergences={divergences}  elapsed={elapsed:.1f}s")
    for c_name, ld in post_lambdas.items():
        print(f"  {c_name}: lam_act={ld['lambda_action_mean']:+.3f}  "
              f"lam_out={ld['lambda_outcome_mean']:+.3f}  sig_U={ld['sigma_mean']:.3f}")

    return {
        "source": action_name,
        "target": outcome_name,
        "n_participants": n_p,
        "prior_before": {
            "bb_mean": prior_for_model["pop_bb"],
            "bb_sd": prior_for_model["pop_bb_scale"],
            "ba_mean": prior_for_model["pop_ba"],
            "ba_sd": prior_for_model["pop_ba_scale"],
            "theta_mean": prior_for_model["pop_theta"],
            "theta_sd": prior_for_model["pop_theta_scale"],
        },
        "posterior_after": {
            "bb_mean": post_bb["mean"],
            "bb_sd": post_bb["sd"],
            "ba_mean": post_ba["mean"],
            "ba_sd": post_ba["sd"],
            "theta_mean": post_theta["mean"],
            "theta_sd": post_theta["sd"],
        },
        "latents": post_lambdas,
        "divergences": divergences,
        "mcmc_seconds": elapsed,
    }


# ── Main ────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--warmup", type=int, default=500)
    ap.add_argument("--samples", type=int, default=500)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--out", type=Path,
                    default=OUTPUT_DIR / "population_priors_confounded.json")
    ap.add_argument("--priors-source", type=Path,
                    default=OUTPUT_DIR / "population_priors_v1_unconfounded.json",
                    help="Prior centers are read from this file. Default uses the "
                         "pre-confounded snapshot so Phase 3 refits everything from "
                         "scratch against the original (unadjusted) priors, rather "
                         "than compounding on Phase 2 results.")
    args = ap.parse_args()

    numpyro.set_host_device_count(1)
    print(f"[fit] JAX devices: {jax.devices()}")

    print(f"[fit] Loading panel data...")
    panel = load_participant_panel()
    print(f"[fit] {len(panel)} participants after merge")

    pop_priors = json.loads(args.priors_source.read_text())
    print(f"[fit] Prior centers from: {args.priors_source.name}")

    results = {}
    for (src, tgt) in CONFOUNDED_EDGES:
        edge_result = fit_one_edge(
            src, tgt, panel, pop_priors,
            num_warmup=args.warmup,
            num_samples=args.samples,
            seed=args.seed,
        )
        results[f"{src}|{tgt}"] = edge_result

    args.out.write_text(json.dumps(results, indent=2))
    print(f"\n[fit] Wrote {args.out}")

    # Summary: delta bb/ba magnitude
    print("\n[fit] ===== Slope shifts =====")
    print(f"  {'edge':40s}  bb before->after        ba before->after")
    for key, r in results.items():
        bb_b = r["prior_before"]["bb_mean"]
        bb_a = r["posterior_after"]["bb_mean"]
        ba_b = r["prior_before"]["ba_mean"]
        ba_a = r["posterior_after"]["ba_mean"]
        print(f"  {key:40s}  {bb_b:+.4f} -> {bb_a:+.4f}  ({bb_a-bb_b:+.4f})   "
              f"{ba_b:+.4f} -> {ba_a:+.4f}  ({ba_a-ba_b:+.4f})")


if __name__ == "__main__":
    main()
