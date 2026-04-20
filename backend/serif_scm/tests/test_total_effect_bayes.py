"""Unit tests for the total-effect Bayesian layer.

Run:  python -m serif_scm.tests.test_total_effect_bayes
"""

from __future__ import annotations

from ..conjugate_update import (
    update_normal_normal, james_stein_blend, posterior_contraction,
    compute_posterior, sigma_data_for_outcome, SIGMA_DATA_BY_OUTCOME,
)
from ..total_effect_priors import TotalEffectPrior, VAR_INFLATION, _fit_prior
from ..user_observations import (
    UserObservation, NOMINAL_STEP_DAILY, ACTION_NATIVE_DEPS, SUPPORTED_PAIRS,
)
from ..dose_multiplier import multiplier_from_posterior


def _approx(a: float, b: float, tol: float = 1e-6) -> bool:
    return abs(a - b) <= tol


# ── update_normal_normal (Sam's spec formula) ──────────────────────

def test_update_nn_basic():
    # prior N(0, 1), obs 2.0 at n=1, sigma_data=0.5 -> tau_y = 1/0.25 = 4
    # tau_post = 1+4 = 5; var_post = 0.2; mu_post = 0.2*(1*0+4*2)=1.6
    mu, var = update_normal_normal(
        prior_mean=0.0, prior_var=1.0,
        obs_slope=2.0, obs_n=1, sigma_data=0.5,
    )
    assert _approx(mu, 1.6), f"got {mu}"
    assert _approx(var, 0.2), f"got {var}"


def test_update_nn_zero_obs_returns_prior():
    # obs_n=0 means no observation -> prior unchanged
    mu, var = update_normal_normal(5.0, 2.0, obs_slope=10.0, obs_n=0, sigma_data=1.0)
    assert mu == 5.0 and var == 2.0


def test_update_nn_n_scaling():
    # data_precision scales with n. n=100 should move the mean ~100x more than n=1.
    mu1, _ = update_normal_normal(0.0, 1.0, obs_slope=1.0, obs_n=1, sigma_data=1.0)
    mu100, _ = update_normal_normal(0.0, 1.0, obs_slope=1.0, obs_n=100, sigma_data=1.0)
    # n=1: tau_y=1, tau_post=2, mu=0.5
    # n=100: tau_y=100, tau_post=101, mu=100/101 ≈ 0.99
    assert _approx(mu1, 0.5)
    assert 0.98 < mu100 < 1.0


def test_update_nn_raises_on_invalid():
    try:
        update_normal_normal(0.0, -1.0, 0.0, 10, 1.0)
        assert False, "should have raised"
    except ValueError:
        pass
    try:
        update_normal_normal(0.0, 1.0, 0.0, 10, 0.0)
        assert False, "should have raised"
    except ValueError:
        pass


# ── james_stein_blend ──────────────────────────────────────────────

def test_js_lambda_curve():
    for n, expected_lam in [(0, 0.0), (25, 0.25), (75, 0.5), (225, 0.75)]:
        _, _, lam = james_stein_blend(0.0, 1.0, 0.0, 1.0, n_cohort=n, kappa=75)
        assert _approx(lam, expected_lam, tol=1e-3), f"lambda({n})={lam} != {expected_lam}"


def test_js_variance_bounded_by_inputs():
    # Harmonic-weighted blend: bounded by max(var_pop, var_cohort). With equal
    # variances and equal lambda, the blend equals the input (no tightening).
    _, var_eq, _ = james_stein_blend(0.0, 1.0, 0.0, 1.0, n_cohort=75, kappa=75)
    assert _approx(var_eq, 1.0, tol=1e-6)
    # With unequal variances, blend is between the two (precision-weighted).
    _, var_mix, _ = james_stein_blend(0.0, 1.0, 0.0, 0.25, n_cohort=75, kappa=75)
    assert 0.25 <= var_mix <= 1.0


def test_js_endpoints():
    # lambda=0 (no cohort): pure pop
    mu0, var0, lam0 = james_stein_blend(1.0, 2.0, 10.0, 5.0, n_cohort=0, kappa=75)
    assert _approx(mu0, 1.0) and _approx(var0, 2.0) and _approx(lam0, 0.0)
    # Very large n: lambda -> 1, blend -> cohort
    mu_big, var_big, lam_big = james_stein_blend(1.0, 2.0, 10.0, 5.0, n_cohort=100000, kappa=75)
    assert lam_big > 0.999
    assert _approx(mu_big, 10.0, tol=0.02)
    assert _approx(var_big, 5.0, tol=0.1)


# ── posterior_contraction ──────────────────────────────────────────

def test_contraction_bounds():
    assert posterior_contraction(1.0, 1.0) == 0.0
    assert posterior_contraction(1.0, 0.5) == 0.5
    assert posterior_contraction(1.0, 0.0) == 1.0
    # posterior > prior -> negative ratio clipped to 0
    assert posterior_contraction(1.0, 1.5) == 0.0
    # degenerate prior
    assert posterior_contraction(0.0, 0.5) == 0.0


# ── sigma_data_for_outcome ─────────────────────────────────────────

def test_sigma_data_lookup():
    assert sigma_data_for_outcome("hrv_daily") == SIGMA_DATA_BY_OUTCOME["hrv_daily"]
    assert sigma_data_for_outcome("resting_hr") == SIGMA_DATA_BY_OUTCOME["resting_hr"]
    # Unknown outcome -> default 1.0
    assert sigma_data_for_outcome("nonexistent") == 1.0


# ── total_effect_priors._fit_prior ─────────────────────────────────

def test_fit_prior_variance_inflation():
    # Variance should equal 2x sample variance (VAR_INFLATION=2.0)
    values = [0.0, 1.0, 2.0, 3.0, 4.0]  # sample var (ddof=1) = 2.5
    p = _fit_prior(values, "__all__", "action", "outcome", nominal_step=1.0)
    assert _approx(p.raw_std, 2.5 ** 0.5, tol=1e-6)
    assert _approx(p.variance, 2.5 * VAR_INFLATION)
    assert _approx(p.inflated_std, (2.5 * VAR_INFLATION) ** 0.5)
    assert p.n == 5
    assert _approx(p.mean, 2.0)


def test_fit_prior_percentiles():
    values = list(range(1, 101))
    p = _fit_prior(values, "__all__", "a", "o", nominal_step=1.0)
    assert _approx(p.p10, 11.0, tol=1.0)
    assert _approx(p.p50, 50.5, tol=1.0)
    assert _approx(p.p90, 91.0, tol=1.0)


# ── compute_posterior paths ────────────────────────────────────────

def _mk_prior(mean=1.0, var=1.0, n=100, cohort="__all__"):
    return TotalEffectPrior(
        cohort=cohort, action="a", outcome="hrv_daily",
        mean=mean, variance=var, raw_std=var ** 0.5, inflated_std=var ** 0.5,
        n=n, p10=mean - 1, p50=mean, p90=mean + 1, nominal_step=1.0,
    )


def _mk_obs(at_step=1.5, se_at_step=0.3, n=80):
    return UserObservation(
        action="a", outcome="hrv_daily",
        slope=at_step, se=se_at_step, n=n,
        residual_sd=1.0,
        at_nominal_step=at_step, se_at_step=se_at_step,
    )


def test_posterior_pop_only():
    pop = _mk_prior(mean=2.0, var=0.5)
    p = compute_posterior(pop, cohort_prior=None, user_obs=None)
    assert p.source == "pop"
    assert _approx(p.mean, 2.0) and _approx(p.variance, 0.5)
    assert p.contraction == 0.0
    assert p.lam_js == 0.0 and p.n_cohort == 0


def test_posterior_pop_plus_cohort():
    pop = _mk_prior(mean=0.0, var=1.0)
    cohort = _mk_prior(mean=2.0, var=0.5, n=100, cohort="cohort_a")
    p = compute_posterior(pop, cohort_prior=cohort, user_obs=None)
    assert p.source == "pop+cohort"
    assert p.n_cohort == 100
    # lambda = 100/175 ≈ 0.571
    assert 0.56 < p.lam_js < 0.58
    # Mean is between the two
    assert 0.0 < p.mean < 2.0


def test_posterior_full_chain():
    pop = _mk_prior(mean=0.0, var=1.0)
    cohort = _mk_prior(mean=2.0, var=0.5, n=100, cohort="cohort_a")
    user = _mk_obs(at_step=3.0, se_at_step=0.1, n=80)  # noisy user SE unused by default
    p = compute_posterior(pop, cohort_prior=cohort, user_obs=user)
    assert p.source == "pop+cohort+user"
    # Posterior should be tighter than prior (contraction > 0)
    assert p.contraction > 0.0
    # Mean somewhere between cohort blend (~1.1) and user (3.0)
    assert 1.0 < p.mean < 3.0


def test_posterior_empty_cohort_falls_back():
    pop = _mk_prior(mean=0.0, var=1.0)
    # Cohort with n=0 should be treated as missing
    empty_cohort = _mk_prior(mean=99.0, var=1.0, n=0, cohort="cohort_a")
    p = compute_posterior(pop, empty_cohort, user_obs=None)
    assert p.source == "pop"
    assert _approx(p.mean, 0.0)


# ── user_observations registry ─────────────────────────────────────

def test_nominal_step_daily_covers_all_actions():
    # Every action in MARGINAL_STEPS should have a daily equivalent
    from ..point_engine import MARGINAL_STEPS
    for action in MARGINAL_STEPS:
        assert action in NOMINAL_STEP_DAILY, f"missing {action}"


def test_action_native_deps_no_self_reference_violation():
    # Each action's native deps should be real lifestyle columns
    valid_cols = {"bedtime_hr", "sleep_hrs", "run_km", "steps",
                  "training_min", "zone2_min"}
    for action, deps in ACTION_NATIVE_DEPS.items():
        for dep in deps:
            assert dep in valid_cols, f"{action} deps include unknown {dep}"


def test_supported_pairs_nonempty():
    assert len(SUPPORTED_PAIRS) >= 5


# ── Dose multiplier integration unchanged ─────────────────────────

def test_dose_multiplier_reads_posterior_contraction():
    # Building a posterior with known contraction should map through dose_multiplier
    pop = _mk_prior(mean=1.0, var=1.0)
    cohort = _mk_prior(mean=1.0, var=1.0, n=100, cohort="cohort_a")
    user = _mk_obs(at_step=1.0, se_at_step=0.1, n=80)
    p = compute_posterior(pop, cohort, user)
    adj = multiplier_from_posterior(
        contraction=p.contraction, posterior_mean=p.mean, pop_mean=pop.mean,
    )
    # Direction agrees -> no conflict
    assert adj.direction_conflict is False
    # Contraction > 0 -> multiplier > floor (0.5)
    assert adj.multiplier > 0.5


# ── End-to-end: real pipeline smoke test ──────────────────────────

def test_end_to_end_on_real_data():
    """Loads real priors/obs and spot-checks one participant."""
    from pathlib import Path
    from ..total_effect_priors import load_priors
    from ..user_observations import load_user_observations

    priors_path = Path("./output/total_effect_priors.json")
    obs_path = Path("./output/user_observations.json")
    if not (priors_path.exists() and obs_path.exists()):
        return  # Skip if artifacts missing
    priors = load_priors(priors_path)
    obs = load_user_observations(obs_path)
    # Should have __all__ priors for all supported pairs
    for (action, outcome) in SUPPORTED_PAIRS:
        assert ("__all__", action, outcome) in priors, f"no pop prior for {action}->{outcome}"
    # At least some users should have all 7 pairs
    full = sum(1 for pid, pairs in obs.items() if len(pairs) == len(SUPPORTED_PAIRS))
    assert full > 100, f"only {full} users have all pairs"


TESTS = [
    test_update_nn_basic,
    test_update_nn_zero_obs_returns_prior,
    test_update_nn_n_scaling,
    test_update_nn_raises_on_invalid,
    test_js_lambda_curve,
    test_js_variance_bounded_by_inputs,
    test_js_endpoints,
    test_contraction_bounds,
    test_sigma_data_lookup,
    test_fit_prior_variance_inflation,
    test_fit_prior_percentiles,
    test_posterior_pop_only,
    test_posterior_pop_plus_cohort,
    test_posterior_full_chain,
    test_posterior_empty_cohort_falls_back,
    test_nominal_step_daily_covers_all_actions,
    test_action_native_deps_no_self_reference_violation,
    test_supported_pairs_nonempty,
    test_dose_multiplier_reads_posterior_contraction,
    test_end_to_end_on_real_data,
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
