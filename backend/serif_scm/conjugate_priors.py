"""Conjugate Normal-Normal updates for the pop -> cohort -> user hierarchy.

The Bayesian gating path layers three sources of information onto each
per-user edge slope:

  1. Population prior      (from `population_priors.py`)
  2. Cohort prior          (from `cohorts.compute_cohort_prior`)
  3. User observation      (per-user OLS slope + SE)

`compute_user_edge_posterior` walks those layers:

    pop                        <-- diffuse literature / fit prior
      |  james_stein_blend     <-- shrinks cohort toward pop when n_cohort small
      v
    pop_cohort_blend
      |  update_normal_normal  <-- conjugate update with user obs
      v
    user_posterior

and returns mean/variance plus a `contraction` metric the dose-multiplier
module can read.

James-Stein blend calibration (per Sam's spec):
    lambda = n_cohort / (n_cohort + 75)

          n_cohort   lambda
          -------    ------
             0         0.00
             50        0.40   (heavy toward pop)
             100       0.57   (balanced)
             200       0.73
             500       0.87   (close to cohort-empirical)

All three synthetic cohorts have n > 100 (cohort_a=534, cohort_b=416, cohort_c=238),
so in the current dataset the blend always leans cohort-empirical. The form is
retained so real-user deployments with smaller/new cohorts degrade gracefully.

Variance blending uses precision-weighted combination:
    1/var_blend = (1-lambda)/var_pop + lambda/var_cohort
This gives a tighter posterior than either input when both contribute
information — the right semantics for "two independent estimates of the same
population-level quantity".

Measurement SDs (`sigma_data_for_edge`) come from the measurement-model memory
file. These are used when a caller needs a baseline outcome noise level (e.g.
to inflate user-slope SE when the OLS residual SD is unreliable with small n).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

from .cohorts import CohortPrior
from .population_priors import EdgePrior


# ── Measurement SDs per outcome ─────────────────────────────────────
# Multiplicative (fraction of value) unless absolute_sd is set. Source:
# serif_measurement_model.md. Keyed by target node name without the
# "_smoothed" / "_daily" suffix the DAG uses.

_MULT_SD: dict[str, float] = {
    # Blood biomarkers
    "hba1c": 0.025,
    "ferritin": 0.20,
    "iron_total": 0.25,
    "hscrp": 0.45,
    "apob": 0.08,
    "testosterone": 0.15,
    "cortisol": 0.15,          # treated like testosterone (circadian/biological)
    "triglycerides": 0.20,
    "hdl": 0.07,
    "ldl": 0.07,
    "total_cholesterol": 0.06,
    "hemoglobin": 0.04,
    "glucose": 0.08,           # CGM (Dexcom)
    "wbc": 0.10,               # generic default; no explicit memory entry
    "platelets": 0.08,
    "ast": 0.10,
    "alt": 0.10,
    # Wearables
    "hrv": 0.07,               # Oura nocturnal
    "hrv_daily": 0.07,
    "resting_hr": 0.02,
    "resting_hr_nocturnal": 0.02,
    "sleep_hrs": 0.05,         # ~10-15 min absolute on ~8hr -> ~3% floor
    "sleep_duration": 0.05,
    "deep_sleep_min": 0.15,    # 20-30 min absolute on ~90 min
    "rem_sleep_min": 0.15,
    "sleep_efficiency": 0.05,
    # Derived / computed
    "vo2peak": 0.08,
    "acwr": 0.10,
    "sleep_debt": 0.10,
    "omega3_index_derived": 0.10,
}

_DEFAULT_MULT_SD = 0.10  # fall-back for any target not listed above


def _strip_target_suffix(target: str) -> str:
    """Drop trailing '_smoothed' / '_daily' / '_derived' to match SD registry."""
    for suffix in ("_smoothed", "_daily", "_derived"):
        if target.endswith(suffix):
            return target[: -len(suffix)]
    return target


def sigma_data_for_edge(edge_id: tuple[str, str], outcome_value: float = 1.0) -> float:
    """Baseline measurement SD for an edge's target, in the target's units.

    Multiplicative form applied to `outcome_value`: SD = fraction * value.
    Pass outcome_value=1.0 to get the fractional coefficient directly (useful
    when the slope is expressed in standardized units).
    """
    _, target = edge_id
    key = _strip_target_suffix(target)
    frac = _MULT_SD.get(key, _DEFAULT_MULT_SD)
    return float(frac) * float(outcome_value if outcome_value is not None else 1.0)


# ── Core conjugate machinery ────────────────────────────────────────

@dataclass(frozen=True)
class Posterior:
    """Single-parameter Normal posterior with contraction metric."""
    mean: float
    variance: float
    prior_mean: float
    prior_variance: float
    contraction: float  # 1 - posterior_var/prior_var, clipped to [0,1]
    source: str         # "pop_only" | "pop+cohort" | "pop+cohort+user"


def update_normal_normal(
    mu0: float,
    var0: float,
    y: float,
    sigma_y: float,
) -> tuple[float, float]:
    """Posterior N(mu, var) for Normal prior N(mu0, var0) after obs y ± sigma_y.

    Standard conjugate: tau = 1/var. tau_post = tau0 + tau_y.
    mu_post = var_post * (tau0*mu0 + tau_y*y).
    """
    if var0 <= 0:
        raise ValueError(f"prior variance must be > 0, got {var0}")
    if sigma_y <= 0:
        raise ValueError(f"obs sigma must be > 0, got {sigma_y}")
    tau0 = 1.0 / var0
    tau_y = 1.0 / (sigma_y ** 2)
    var_post = 1.0 / (tau0 + tau_y)
    mu_post = var_post * (tau0 * mu0 + tau_y * y)
    return float(mu_post), float(var_post)


def posterior_contraction(var_prior: float, var_posterior: float) -> float:
    """1 - var_post / var_prior, clipped to [0,1].

    0 -> posterior is as diffuse as prior (no learning).
    1 -> posterior is a point mass (complete learning).
    Negative values (numerical noise) are clipped to 0.
    """
    if var_prior <= 0:
        return 0.0
    ratio = var_posterior / var_prior
    return float(max(0.0, min(1.0, 1.0 - ratio)))


def james_stein_blend(
    mu_pop: float, var_pop: float,
    mu_cohort: float, var_cohort: float,
    n_cohort: int,
    kappa: float = 75.0,
) -> tuple[float, float]:
    """Blend population and cohort priors into a single prior.

    lambda = n_cohort / (n_cohort + kappa) controls how strongly the blend
    leans on cohort-empirical. kappa=75 matches the specified calibration
    (heavy-pop at n<50, balanced at ~100, cohort-dominated at >200).

    Mean is the lambda-weighted average. Variance uses precision-weighted
    combination so the blended prior is tighter than either input when both
    contribute real information.
    """
    if n_cohort < 0:
        n_cohort = 0
    lam = n_cohort / (n_cohort + kappa) if (n_cohort + kappa) > 0 else 0.0

    mu_blend = (1.0 - lam) * mu_pop + lam * mu_cohort

    # Precision-weighted variance blend, guarded against degenerate priors.
    var_pop = max(float(var_pop), 1e-12)
    var_cohort = max(float(var_cohort), 1e-12)
    tau_blend = (1.0 - lam) / var_pop + lam / var_cohort
    var_blend = 1.0 / tau_blend if tau_blend > 0 else var_pop

    return float(mu_blend), float(var_blend)


# ── 3-level hierarchy entry point ───────────────────────────────────

def _pick_field(obj, mean_name: str, var_name: str) -> tuple[Optional[float], Optional[float]]:
    m = getattr(obj, mean_name, None)
    v = getattr(obj, var_name, None)
    return m, v


def compute_user_edge_posterior(
    edge_id: tuple[str, str],
    slope_kind: str,
    pop_prior: EdgePrior,
    cohort_prior: Optional[CohortPrior],
    user_obs: Optional[float],
    user_obs_se: Optional[float],
    kappa: float = 75.0,
) -> Posterior:
    """End-to-end pop -> cohort -> user posterior for one edge's slope.

    slope_kind: "bb" | "ba" | "theta" — selects which field of the priors to
    consume. (Behavioral_sd is handled separately in dose_multiplier.)

    Falls back to pop-only or pop+cohort when cohort/user information is
    missing, and always returns a valid Posterior. The `source` field records
    which layers actually contributed.
    """
    if slope_kind == "bb":
        mu_pop, var_pop = pop_prior.mean_slope_bb, pop_prior.var_slope_bb
        cohort_mean, cohort_var = _pick_field(cohort_prior, "mean_slope_bb", "var_slope_bb") if cohort_prior else (None, None)
    elif slope_kind == "ba":
        mu_pop, var_pop = pop_prior.mean_slope_ba, pop_prior.var_slope_ba
        cohort_mean, cohort_var = _pick_field(cohort_prior, "mean_slope_ba", "var_slope_ba") if cohort_prior else (None, None)
    elif slope_kind == "theta":
        mu_pop, var_pop = pop_prior.mean_theta, pop_prior.var_theta
        cohort_mean, cohort_var = _pick_field(cohort_prior, "mean_theta", "var_theta") if cohort_prior else (None, None)
    else:
        raise ValueError(f"unknown slope_kind: {slope_kind}")

    if mu_pop is None or var_pop is None or var_pop <= 0:
        # Nothing to work with — return a degenerate posterior centered at 0.
        return Posterior(
            mean=0.0, variance=1.0,
            prior_mean=0.0, prior_variance=1.0,
            contraction=0.0, source="none",
        )

    prior_mean_root = float(mu_pop)
    prior_var_root = float(var_pop)

    # ── Layer 2: cohort blend (if we have a usable cohort estimate) ──
    have_cohort = (
        cohort_prior is not None
        and cohort_mean is not None
        and cohort_var is not None
        and cohort_var > 0
        and cohort_prior.n > 0
    )
    if have_cohort:
        mu_blend, var_blend = james_stein_blend(
            mu_pop=float(mu_pop), var_pop=float(var_pop),
            mu_cohort=float(cohort_mean), var_cohort=float(cohort_var),
            n_cohort=int(cohort_prior.n),
            kappa=kappa,
        )
        source = "pop+cohort"
    else:
        mu_blend, var_blend = float(mu_pop), float(var_pop)
        source = "pop_only"

    # ── Layer 3: user observation (if present and well-posed) ──
    have_user = (
        user_obs is not None
        and user_obs_se is not None
        and np.isfinite(user_obs)
        and np.isfinite(user_obs_se)
        and user_obs_se > 0
    )
    if have_user:
        mu_final, var_final = update_normal_normal(
            mu0=mu_blend, var0=var_blend,
            y=float(user_obs), sigma_y=float(user_obs_se),
        )
        source = source + "+user" if source != "pop_only" else "pop+user"
    else:
        mu_final, var_final = mu_blend, var_blend

    return Posterior(
        mean=float(mu_final),
        variance=float(var_final),
        prior_mean=prior_mean_root,
        prior_variance=prior_var_root,
        contraction=posterior_contraction(prior_var_root, var_final),
        source=source,
    )
