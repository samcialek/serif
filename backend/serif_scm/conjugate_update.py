"""Normal-Normal conjugate update + James-Stein blend for total-effect priors.

Replaces `conjugate_priors.py` under the total-effect architecture. Operates
directly on `TotalEffectPrior` (population & per-cohort) and `UserObservation`
(at-nominal-step slope). Formula per Sam's spec:

    prior_precision = 1 / prior_var
    data_precision  = obs_n / sigma_data**2
    post_precision  = prior_precision + data_precision
    post_mean       = (prior_precision*prior_mean + data_precision*obs_slope)
                      / post_precision
    post_var        = 1 / post_precision

Using `sigma_data` (per-observation measurement noise from the measurement
model) rather than the user's OLS SE is deliberate: SEs are unstable at small
n; a library sigma_data stabilises the update. The user's OLS SE is retained
in the output for diagnostic comparison but not consumed by the update.

James-Stein calibration: `lambda = n_cohort / (n_cohort + 75)`. The v1
spec's truncated form (`james_stein_blend(pop_prior, cohort...`) is implemented
as a bare-number interface for reuse, with a thin adapter that takes
TotalEffectPrior objects.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .total_effect_priors import TotalEffectPrior
from .user_observations import UserObservation


# Per-observation outcome noise SDs in absolute units. Derived by applying the
# measurement-model memory's multiplicative fractions (conjugate_priors._MULT_SD)
# at typical outcome levels (WEARABLE_PRIORS means). Used as sigma_data in the
# conjugate update.
#
#   outcome        frac   typical   sigma_data
#   hrv_daily      0.07   50 ms     3.5
#   resting_hr     0.02   62 bpm    1.2
#   sleep_efficiency 0.05 87 %      4.35
#   sleep_quality  0.10   70 score  7.0
#   deep_sleep     0.15   80 min    12.0
SIGMA_DATA_BY_OUTCOME: dict[str, float] = {
    "hrv_daily":        3.5,
    "resting_hr":       1.2,
    "sleep_efficiency": 4.35,
    "sleep_quality":    7.0,
    "deep_sleep":       12.0,
}
_SIGMA_DATA_DEFAULT = 1.0


def sigma_data_for_outcome(outcome: str) -> float:
    """Library per-obs outcome noise. Defaults to 1.0 for unknown outcomes."""
    return SIGMA_DATA_BY_OUTCOME.get(outcome, _SIGMA_DATA_DEFAULT)


@dataclass(frozen=True)
class Posterior:
    mean: float
    variance: float
    prior_mean: float
    prior_variance: float
    contraction: float
    source: str        # e.g., "pop", "pop+cohort", "pop+user", "pop+cohort+user"
    lam_js: float      # James-Stein lambda actually applied (0 if no cohort)
    n_cohort: int


# ── Primitives ─────────────────────────────────────────────────────

def update_normal_normal(
    prior_mean: float,
    prior_var: float,
    obs_slope: float,
    obs_n: int,
    sigma_data: float,
) -> tuple[float, float]:
    """Spec formula. Returns (post_mean, post_var)."""
    if prior_var <= 0:
        raise ValueError(f"prior_var must be > 0, got {prior_var}")
    if sigma_data <= 0:
        raise ValueError(f"sigma_data must be > 0, got {sigma_data}")
    if obs_n <= 0:
        return float(prior_mean), float(prior_var)
    prior_precision = 1.0 / float(prior_var)
    data_precision = float(obs_n) / (float(sigma_data) ** 2)
    post_precision = prior_precision + data_precision
    post_mean = (
        prior_precision * float(prior_mean)
        + data_precision * float(obs_slope)
    ) / post_precision
    post_var = 1.0 / post_precision
    return float(post_mean), float(post_var)


def james_stein_blend(
    pop_mean: float, pop_var: float,
    cohort_mean: float, cohort_var: float,
    n_cohort: int,
    kappa: float = 75.0,
) -> tuple[float, float, float]:
    """Return (mu_blend, var_blend, lambda).

    lambda = n_cohort / (n_cohort + kappa) matches the v1 spec. Variance is
    precision-weighted: 1/var_blend = (1-lam)/var_pop + lam/var_cohort.
    """
    n_cohort = max(int(n_cohort), 0)
    lam = n_cohort / (n_cohort + kappa) if (n_cohort + kappa) > 0 else 0.0
    mu_blend = (1.0 - lam) * float(pop_mean) + lam * float(cohort_mean)
    pv = max(float(pop_var), 1e-12)
    cv = max(float(cohort_var), 1e-12)
    tau = (1.0 - lam) / pv + lam / cv
    var_blend = 1.0 / tau if tau > 0 else pv
    return float(mu_blend), float(var_blend), float(lam)


def posterior_contraction(var_prior: float, var_post: float) -> float:
    """1 - var_post/var_prior, clipped to [0,1]."""
    if var_prior <= 0:
        return 0.0
    return max(0.0, min(1.0, 1.0 - var_post / var_prior))


# ── Adapter: TotalEffectPrior + UserObservation -> Posterior ───────

def compute_posterior(
    pop_prior: TotalEffectPrior,
    cohort_prior: Optional[TotalEffectPrior],
    user_obs: Optional[UserObservation],
    sigma_data: Optional[float] = None,
    kappa: float = 75.0,
) -> Posterior:
    """Pop -> cohort -> user posterior for one (action, outcome).

    sigma_data defaults to the outcome's library value; pass an override for
    sensitivity analysis or when operating in a non-standard scale.
    """
    prior_mean_root = float(pop_prior.mean)
    prior_var_root = float(pop_prior.variance)

    layers: list[str] = ["pop"]

    # Layer 2: cohort blend
    have_cohort = (
        cohort_prior is not None
        and cohort_prior.n > 0
        and cohort_prior.variance > 0
    )
    if have_cohort:
        mu_blend, var_blend, lam = james_stein_blend(
            pop_mean=pop_prior.mean, pop_var=pop_prior.variance,
            cohort_mean=cohort_prior.mean, cohort_var=cohort_prior.variance,
            n_cohort=cohort_prior.n, kappa=kappa,
        )
        layers.append("cohort")
        n_cohort = int(cohort_prior.n)
    else:
        mu_blend, var_blend, lam = prior_mean_root, prior_var_root, 0.0
        n_cohort = 0

    # Layer 3: user
    have_user = user_obs is not None and user_obs.n > 0
    if have_user:
        # Explicit override wins. Otherwise biomarker observations carry
        # their own sigma_data (computed from BIOMARKER_PRIORS * 1.4);
        # wearable observations fall back to SIGMA_DATA_BY_OUTCOME.
        if sigma_data is not None:
            sd = sigma_data
        elif getattr(user_obs, "sigma_data_used", 0.0) > 0:
            sd = user_obs.sigma_data_used
        else:
            sd = sigma_data_for_outcome(user_obs.outcome)
        mu_final, var_final = update_normal_normal(
            prior_mean=mu_blend, prior_var=var_blend,
            obs_slope=user_obs.at_nominal_step, obs_n=user_obs.n,
            sigma_data=sd,
        )
        layers.append("user")
    else:
        mu_final, var_final = mu_blend, var_blend

    return Posterior(
        mean=float(mu_final),
        variance=float(var_final),
        prior_mean=prior_mean_root,
        prior_variance=prior_var_root,
        contraction=posterior_contraction(prior_var_root, var_final),
        source="+".join(layers),
        lam_js=float(lam),
        n_cohort=n_cohort,
    )
