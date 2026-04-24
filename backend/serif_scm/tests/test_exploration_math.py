"""Smoke tests for backend exploration math.

Run:  python -m backend.serif_scm.tests.test_exploration_math
  or  pytest backend/serif_scm/tests/test_exploration_math.py

Structured so the module is runnable either way. Mirrors the TS
smoke tests at src/utils/exploration.test.ts; if the two ever
disagree, something drifted between frontend and backend.
"""

from __future__ import annotations

import math
import sys
import traceback

from backend.serif_scm import exploration_math as em


failures: list[str] = []


def check(cond: bool, msg: str) -> None:
    if cond:
        print(f"  PASS  {msg}")
    else:
        print(f"  FAIL  {msg}")
        failures.append(msg)


def approx(a: float, b: float, eps: float = 1e-9) -> bool:
    return abs(a - b) < eps


def test_narrow_monotone_duration() -> None:
    print("\nnarrow monotone in duration (daily wearable):")
    n14 = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="daily", duration_days=14, pathway="wearable",
    )
    n7 = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="daily", duration_days=7, pathway="wearable",
    )
    check(n14 > n7, f"14 daily > 7 daily ({n14:.3f} > {n7:.3f})")


def test_wearable_beats_biomarker() -> None:
    print("\nwearable narrows faster than biomarker:")
    w = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="daily", duration_days=14, pathway="wearable",
    )
    b = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="daily", duration_days=14, pathway="biomarker",
    )
    check(w > b, f"wearable > biomarker ({w:.3f} > {b:.3f})")


def test_one_shot_bounded() -> None:
    print("\none-shot narrow is bounded [0,1]:")
    v = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="one_shot", duration_days=56, pathway="biomarker",
    )
    check(0.0 <= v <= 1.0, f"narrow in [0,1] ({v:.3f})")


def test_zero_prior_clamps() -> None:
    print("\nzero prior SD clamps narrow to 0:")
    v = em.expected_posterior_narrow(
        prior_sd=1e-12, cadence="daily", duration_days=14, pathway="wearable",
    )
    check(approx(v, 0.0), f"narrow = 0 at zero prior SD (got {v})")


def test_weekly_less_than_daily() -> None:
    print("\nweekly cadence < daily same-duration:")
    d = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="daily", duration_days=21, pathway="wearable",
    )
    w = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="n_per_week", duration_days=21, pathway="wearable",
        n_per_week=3,
    )
    check(d > w, f"daily > 3/wk over same duration ({d:.3f} > {w:.3f})")


def test_huge_n_bounded_above() -> None:
    print("\nnarrow bounded above by 1 with huge n_eff:")
    v = em.expected_posterior_narrow(
        prior_sd=0.3, cadence="daily", duration_days=10_000, pathway="wearable",
    )
    check(v <= 1.0, f"narrow <= 1 (got {v:.4f})")


# ── cohens_d / cohens_d_sd on a stub row ─────────────────────────

def make_row(
    action: str = "bedtime",
    outcome: str = "hrv_daily",
    mean: float = 5.0,
    sd: float = 2.0,
    nominal_step: float = 1.0,
    user_n: int = 10,
    evidence_tier: str = "personal_emerging",
) -> dict:
    return {
        "action": action,
        "outcome": outcome,
        "nominal_step": nominal_step,
        "posterior": {"mean": mean, "sd": sd, "contraction": 0.2},
        "user_obs": {"n": user_n},
        "evidence_tier": evidence_tier,
        "positivity_flag": "ok",
    }


def test_prior_cohens_d_scales_with_mean() -> None:
    print("\nprior_cohens_d scales linearly with posterior.mean:")
    d_small = em.prior_cohens_d(make_row(mean=1.0))
    d_big = em.prior_cohens_d(make_row(mean=5.0))
    check(
        abs(d_big) > abs(d_small),
        f"|d| grows with mean ({abs(d_big):.3f} > {abs(d_small):.3f})",
    )


def test_prior_cohens_d_sd_uses_posterior_sd() -> None:
    print("\nprior_cohens_d_sd scales with posterior.sd:")
    sd_small = em.prior_cohens_d_sd(make_row(sd=0.5))
    sd_big = em.prior_cohens_d_sd(make_row(sd=5.0))
    check(
        sd_big > sd_small,
        f"sd_d grows with posterior sd ({sd_big:.3f} > {sd_small:.3f})",
    )


def test_prior_cohens_d_zero_step() -> None:
    print("\nzero nominal_step -> prior_cohens_d = 0:")
    d = em.prior_cohens_d(make_row(nominal_step=0))
    check(approx(d, 0.0), f"d = 0 when step = 0 (got {d})")


# ── prescription_for ──────────────────────────────────────────────

def test_prescription_vary_action_table() -> None:
    print("\nprescription: bedtime vary_action matches table:")
    spec = em.prescription_for(
        action="bedtime", outcome="hrv_daily", kind="vary_action",
        user_n=10, pathway="wearable", prior_d=0.3,
        has_current_value=True, positivity_flag="ok",
    )
    check(spec["cadence"] == "daily", f"cadence=daily (got {spec['cadence']})")
    check(spec["duration_days"] == 14, f"duration=14 (got {spec['duration_days']})")
    check(spec["feasibility"] == "ready", f"feasibility=ready (got {spec['feasibility']})")


def test_prescription_repeat_measurement() -> None:
    print("\nprescription: repeat_measurement for ferritin:")
    spec = em.prescription_for(
        action="dietary_protein", outcome="ferritin", kind="repeat_measurement",
        user_n=2, pathway="biomarker", prior_d=0.3,
        has_current_value=True, positivity_flag="ok",
    )
    check(spec["cadence"] == "one_shot", f"cadence=one_shot (got {spec['cadence']})")
    check(
        spec["duration_days"] == em.REPEAT_DRAW_INTERVAL_DAYS["ferritin"],
        f"duration matches ferritin interval (got {spec['duration_days']})",
    )


def test_prescription_blocks_low_prior() -> None:
    print("\nprescription blocks when priorD is near zero:")
    spec = em.prescription_for(
        action="bedtime", outcome="hrv_daily", kind="vary_action",
        user_n=10, pathway="wearable", prior_d=0.01,
        has_current_value=True, positivity_flag="ok",
    )
    check(
        spec["feasibility"] == "blocked",
        f"feasibility=blocked at priorD=0.01 (got {spec['feasibility']})",
    )


def test_prescription_needs_baseline() -> None:
    print("\nprescription needs_baseline when current value missing:")
    spec = em.prescription_for(
        action="caffeine_mg", outcome="sleep_quality", kind="vary_action",
        user_n=10, pathway="wearable", prior_d=0.3,
        has_current_value=False, positivity_flag="ok",
    )
    check(
        spec["feasibility"] == "needs_baseline",
        f"feasibility=needs_baseline without current value (got {spec['feasibility']})",
    )


# ── enrich_row end-to-end ────────────────────────────────────────

def test_enrich_row_all_fields() -> None:
    print("\nenrich_row returns all Phase-3 fields:")
    row = make_row()
    out = em.enrich_row(
        row=row, kind="vary_action", pathway="wearable",
        behavioral_sds={"bedtime": 0.5}, current_values={"bedtime": 23},
        horizon_days=4,
    )
    for k in ("prior_cohens_d", "prior_cohens_d_sd",
              "expected_posterior_narrow", "horizon_days", "experiment"):
        check(k in out, f"key {k} present")
    check(
        isinstance(out["experiment"], dict) and "cadence" in out["experiment"],
        "experiment contains cadence",
    )
    check(out["horizon_days"] == 4, f"horizon_days echoed (got {out['horizon_days']})")
    check(
        0.0 <= out["expected_posterior_narrow"] <= 1.0,
        f"narrow in [0,1] (got {out['expected_posterior_narrow']:.3f})",
    )


# ── Harness ────────────────────────────────────────────────────────

TESTS = [
    test_narrow_monotone_duration,
    test_wearable_beats_biomarker,
    test_one_shot_bounded,
    test_zero_prior_clamps,
    test_weekly_less_than_daily,
    test_huge_n_bounded_above,
    test_prior_cohens_d_scales_with_mean,
    test_prior_cohens_d_sd_uses_posterior_sd,
    test_prior_cohens_d_zero_step,
    test_prescription_vary_action_table,
    test_prescription_repeat_measurement,
    test_prescription_blocks_low_prior,
    test_prescription_needs_baseline,
    test_enrich_row_all_fields,
]


def main() -> int:
    for t in TESTS:
        try:
            t()
        except Exception:
            traceback.print_exc()
            failures.append(t.__name__)
    if failures:
        print(f"\n{len(failures)} failure(s): {failures}")
        return 1
    print("\nAll backend exploration-math smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
