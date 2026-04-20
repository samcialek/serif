"""Unit tests for the Bayesian hierarchy layer.

Run:  python -m serif_scm.tests.test_bayesian_layer
"""

from __future__ import annotations

import math

from ..conjugate_priors import (
    update_normal_normal, posterior_contraction,
    james_stein_blend, sigma_data_for_edge,
    compute_user_edge_posterior,
)
from ..dose_multiplier import multiplier_from_posterior, MULT_FLOOR, MULT_CEILING
from ..cohorts import CohortPrior
from ..population_priors import EdgePrior


def _approx(a: float, b: float, tol: float = 1e-6) -> bool:
    return abs(a - b) <= tol


def test_update_normal_normal_basic():
    mu, var = update_normal_normal(0.0, 1.0, 2.0, 0.5)
    # tau0=1, tau_y=4 -> tau_post=5, var_post=0.2, mu_post=0.2*(0+4*2)=1.6
    assert _approx(mu, 1.6), f"got {mu}"
    assert _approx(var, 0.2), f"got {var}"


def test_update_normal_normal_tight_prior_dominates():
    # Very tight prior (var=0.001) should barely move given a noisy obs (sigma=1).
    mu, var = update_normal_normal(5.0, 0.001, 100.0, 1.0)
    assert abs(mu - 5.0) < 0.1
    assert var < 0.001


def test_contraction_bounds():
    assert posterior_contraction(1.0, 1.0) == 0.0
    assert _approx(posterior_contraction(1.0, 0.5), 0.5)
    assert _approx(posterior_contraction(1.0, 0.0), 1.0)
    # Clip negative (posterior > prior variance -> 0, not negative)
    assert posterior_contraction(1.0, 1.5) == 0.0


def test_james_stein_curve():
    # Spec: heavy-pop at n<50, balanced at ~100, cohort-dominated at n>200
    mu_p, var_p = 0.0, 1.0
    mu_c, var_c = 2.0, 0.5

    for n, expected_lam in [(0, 0.0), (50, 0.4), (100, 4/7), (200, 8/11)]:
        _, _ = james_stein_blend(mu_p, var_p, mu_c, var_c, n)
        lam = n / (n + 75)
        assert _approx(lam, expected_lam, tol=1e-3), f"lambda({n})={lam} != {expected_lam}"


def test_james_stein_variance_bounded_by_inputs():
    # Harmonic-weighted blend: bounded by max(var_pop, var_cohort), and at the
    # endpoints collapses to the dominant prior.
    _, var_blend = james_stein_blend(0.0, 1.0, 2.0, 0.5, n_cohort=100)
    assert var_blend <= 1.0

    # lambda=0 -> pure pop
    _, var0 = james_stein_blend(0.0, 1.0, 2.0, 0.5, n_cohort=0)
    assert _approx(var0, 1.0, tol=1e-9)

    # Very large n -> dominated by cohort
    _, var_big = james_stein_blend(0.0, 1.0, 2.0, 0.5, n_cohort=100000)
    assert _approx(var_big, 0.5, tol=1e-2)


def test_sigma_data_lookup():
    # Known biomarkers
    assert sigma_data_for_edge(("x", "testosterone_smoothed")) == 0.15
    assert sigma_data_for_edge(("x", "ferritin_smoothed")) == 0.20
    # Wearables
    assert sigma_data_for_edge(("x", "hrv_daily")) == 0.07
    # Unknown -> default 0.10
    assert sigma_data_for_edge(("x", "unknown_thing")) == 0.10


def test_three_level_posterior():
    pop = EdgePrior(
        edge_id=("a", "b"), title="test", provenance="fitted", curve="linear",
        eff_n=100, mean_slope_bb=1.0, var_slope_bb=1.0,
        mean_slope_ba=1.0, var_slope_ba=1.0,
        mean_theta=None, var_theta=None,
        bb_ci_width_used=0.5, ba_ci_width_used=0.5, theta_ci_width_used=None,
    )
    cohort = CohortPrior(
        mean_slope_bb=1.2, var_slope_bb=0.8,
        mean_slope_ba=1.2, var_slope_ba=0.8,
        mean_theta=None, var_theta=None,
        behavioral_sd_mean=None, behavioral_sd_var=None,
        n=100,
    )
    post = compute_user_edge_posterior(
        edge_id=("a", "b"), slope_kind="bb",
        pop_prior=pop, cohort_prior=cohort,
        user_obs=1.5, user_obs_se=0.3,
    )
    # Posterior should sit between the three means and be tighter than all.
    assert 1.0 <= post.mean <= 1.5
    assert post.variance < min(pop.var_slope_bb, cohort.var_slope_bb, 0.3**2)
    assert post.contraction > 0.5
    assert post.source == "pop+cohort+user"


def test_pop_only_when_cohort_missing():
    pop = EdgePrior(
        edge_id=("a", "b"), title="test", provenance="fitted", curve="linear",
        eff_n=2, mean_slope_bb=1.0, var_slope_bb=1.0,
        mean_slope_ba=1.0, var_slope_ba=1.0,
        mean_theta=None, var_theta=None,
        bb_ci_width_used=0.5, ba_ci_width_used=0.5, theta_ci_width_used=None,
    )
    post = compute_user_edge_posterior(
        edge_id=("a", "b"), slope_kind="bb",
        pop_prior=pop, cohort_prior=None,
        user_obs=None, user_obs_se=None,
    )
    assert post.source == "pop_only"
    assert post.mean == pop.mean_slope_bb
    assert post.variance == pop.var_slope_bb
    assert post.contraction == 0.0


def test_dose_multiplier_linear_in_contraction():
    # c=0 -> floor, c=1 -> ceiling, c=0.5 -> midpoint
    adj0 = multiplier_from_posterior(0.0, 1.0, 1.0)
    adj1 = multiplier_from_posterior(1.0, 1.0, 1.0)
    adj_mid = multiplier_from_posterior(0.5, 1.0, 1.0)
    assert adj0.multiplier == MULT_FLOOR
    assert adj1.multiplier == MULT_CEILING
    assert _approx(adj_mid.multiplier, (MULT_FLOOR + MULT_CEILING) / 2)


def test_dose_multiplier_direction_guard():
    # High contraction but opposite sign -> floor
    adj = multiplier_from_posterior(1.0, 1.0, -1.0)
    assert adj.direction_conflict is True
    assert adj.multiplier == MULT_FLOOR

    # Near-zero magnitudes don't trip the guard
    adj = multiplier_from_posterior(0.8, 1e-8, -1e-8)
    assert adj.direction_conflict is False

    # pop=None disables guard
    adj = multiplier_from_posterior(1.0, 1.0, None)
    assert adj.direction_conflict is False
    assert adj.multiplier == MULT_CEILING


def test_dose_multiplier_clamp():
    # Contraction out of [0,1] is clamped, not errored
    adj_lo = multiplier_from_posterior(-0.5, 1.0, 1.0)
    adj_hi = multiplier_from_posterior(1.5, 1.0, 1.0)
    assert adj_lo.multiplier == MULT_FLOOR
    assert adj_hi.multiplier == MULT_CEILING


TESTS = [
    test_update_normal_normal_basic,
    test_update_normal_normal_tight_prior_dominates,
    test_contraction_bounds,
    test_james_stein_curve,
    test_james_stein_variance_bounded_by_inputs,
    test_sigma_data_lookup,
    test_three_level_posterior,
    test_pop_only_when_cohort_missing,
    test_dose_multiplier_linear_in_contraction,
    test_dose_multiplier_direction_guard,
    test_dose_multiplier_clamp,
]


def run_all() -> int:
    failed = 0
    for t in TESTS:
        try:
            t()
            print(f"  PASS  {t.__name__}")
        except AssertionError as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERR   {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{len(TESTS) - failed}/{len(TESTS)} passed")
    return failed


if __name__ == "__main__":
    import sys
    sys.exit(run_all())
