"""Unit tests for the protocol synthesis module.

Run:  python -m serif_scm.tests.test_protocols
"""

from __future__ import annotations

import math
from pathlib import Path

from ..protocols import (
    Protocol,
    COLLAPSE_FRAC,
    MAX_OPTIONS,
    HORIZON_DAYS_BY_OUTCOME,
    ACTION_UNITS,
    compute_behavioral_sds,
    compute_current_values,
    synthesize_protocols,
    _compute_target,
    _split_at_largest_gap,
    _format_clock,
    _render_description,
    _render_rationale,
)


def _approx(a: float, b: float, tol: float = 1e-6) -> bool:
    return abs(a - b) <= tol


# ── Insight fixtures ──────────────────────────────────────────────

def _make_insight(
    action: str,
    outcome: str,
    nominal_step: float,
    dose_multiplier: float,
    tier: str = "recommended",
    contraction: float = 0.85,
) -> dict:
    """Minimum-fields insight row matching the export_portal_bayesian schema."""
    return {
        "action": action,
        "outcome": outcome,
        "nominal_step": nominal_step,
        "dose_multiplier": dose_multiplier,
        "dose_multiplier_raw": dose_multiplier,
        "direction_conflict": False,
        "scaled_effect": nominal_step * dose_multiplier,
        "posterior": {
            "mean": 0.5, "variance": 0.01, "sd": 0.1,
            "contraction": contraction,
            "prior_mean": 0.5, "prior_variance": 0.05,
            "source": "pop+user", "lam_js": 0.0, "n_cohort": 0,
            "z_like": 5.0,
        },
        "cohort_prior": None,
        "user_obs": None,
        "gate": {"score": contraction, "tier": tier},
    }


# ── _compute_target ──────────────────────────────────────────────

def test_compute_target_uses_daily_step():
    # bedtime: current=23.5, daily_step=-0.5, mult=0.8 -> target = 23.5 - 0.4 = 23.1
    insight = _make_insight("bedtime", "hrv_daily", -0.5, 0.8)
    assert _approx(_compute_target(insight, 23.5, "bedtime"), 23.1)


def test_compute_target_running_volume_daily_unit():
    # running_volume daily step = 1.0 km/day (not 30 km/month)
    insight = _make_insight("running_volume", "hrv_daily", 30.0, 0.868)
    target = _compute_target(insight, 3.5, "running_volume")
    assert _approx(target, 3.5 + 1.0 * 0.868)


# ── _split_at_largest_gap ────────────────────────────────────────

def test_split_at_largest_gap_uneven():
    pairs = [
        ({"id": "a"}, 22.0),
        ({"id": "b"}, 22.1),
        ({"id": "c"}, 22.2),
        ({"id": "d"}, 23.5),  # big gap here
        ({"id": "e"}, 23.6),
    ]
    lower, upper = _split_at_largest_gap(pairs)
    assert [p[1] for p in lower] == [22.0, 22.1, 22.2], f"lower={lower}"
    assert [p[1] for p in upper] == [23.5, 23.6], f"upper={upper}"


def test_split_at_largest_gap_two_items():
    pairs = [({"id": "a"}, 1.0), ({"id": "b"}, 2.0)]
    lower, upper = _split_at_largest_gap(pairs)
    assert len(lower) == 1 and len(upper) == 1


# ── _format_clock ────────────────────────────────────────────────

def test_format_clock_variants():
    assert _format_clock(22.75) == "10:45pm", _format_clock(22.75)
    assert _format_clock(23.0) == "11:00pm", _format_clock(23.0)
    assert _format_clock(0.5) == "12:30am", _format_clock(0.5)
    assert _format_clock(12.0) == "12:00pm", _format_clock(12.0)
    assert _format_clock(22.999).endswith("pm")


# ── Synthesis: zero / one / many ─────────────────────────────────

def test_zero_insights_zero_protocols():
    protos = synthesize_protocols(
        pid=1, all_insights=[], current_values={"bedtime": 23.0},
        behavioral_sds={"bedtime": 0.5},
    )
    assert protos == []


def test_single_exposed_insight_single_protocol():
    insight = _make_insight("bedtime", "hrv_daily", -0.5, 0.8, tier="recommended")
    protos = synthesize_protocols(
        pid=1, all_insights=[insight],
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 1
    p = protos[0]
    assert p.action == "bedtime"
    assert p.option_label == "single"
    assert p.supporting_insight_ids == ["bedtime_hrv_daily"]
    assert _approx(p.target_value, 23.0 - 0.5 * 0.8)


def test_not_exposed_insights_excluded():
    insight = _make_insight("bedtime", "hrv_daily", -0.5, 0.5, tier="not_exposed")
    protos = synthesize_protocols(
        pid=1, all_insights=[insight],
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert protos == []


def test_similar_targets_collapse_to_most_conservative():
    # current=23.0, daily_step=-0.5, multipliers 0.10, 0.12, 0.15 → targets 22.95, 22.94, 22.925
    # span ≈ 0.025, behavioral_sd=0.5 → threshold=0.075. span < threshold → collapse.
    insights = [
        _make_insight("bedtime", "hrv_daily",        -0.5, 0.10),
        _make_insight("bedtime", "deep_sleep",       -0.5, 0.12),
        _make_insight("bedtime", "sleep_efficiency", -0.5, 0.15),
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 1, f"expected 1 got {len(protos)}"
    p = protos[0]
    assert p.option_label == "collapsed", p.option_label
    assert len(p.supporting_insight_ids) == 3
    assert _approx(p.target_value, 22.95), p.target_value
    assert set(p.outcomes_served) == {"hrv_daily", "deep_sleep", "sleep_efficiency"}


def test_divergent_same_direction_targets_split_into_two():
    # current=23.0, daily_step=-0.5, multipliers 0.2 and 1.4 → targets 22.9 and 22.3
    # span (0.6) > threshold (0.15 * 0.5 = 0.075) → split.
    insights = [
        _make_insight("bedtime", "hrv_daily",  -0.5, 0.2),
        _make_insight("bedtime", "deep_sleep", -0.5, 1.4),
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 2
    labels = {p.option_label for p in protos}
    assert labels == {"conservative", "aggressive"}, labels
    conservative = next(p for p in protos if p.option_label == "conservative")
    aggressive = next(p for p in protos if p.option_label == "aggressive")
    assert _approx(conservative.target_value, 22.9)
    assert _approx(aggressive.target_value, 22.3)
    assert conservative.option_index == 0
    assert aggressive.option_index == 1


def test_conflicting_direction_insights_emit_two_protocols():
    # Use a fictional action NOT in NOMINAL_STEP_DAILY so the per-insight
    # nominal_step field is used (production actions all have fixed daily
    # steps, so direction-conflict between two same-action insights cannot
    # arise in the live pipeline — this is coverage for the safety branch).
    insights = [
        _make_insight("custom_action", "hrv_daily",  -0.5, 0.8),  # delta -0.4
        _make_insight("custom_action", "deep_sleep", +0.5, 0.8),  # delta +0.4
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"custom_action": 10.0},
        behavioral_sds={"custom_action": 2.0},
    )
    assert len(protos) == 2
    labels = {p.option_label for p in protos}
    assert labels == {"up", "down"}, labels


def test_direction_conflict_insights_admitted_when_exposed():
    insight = _make_insight("bedtime", "hrv_daily", -0.5, 0.5, tier="possible")
    insight["direction_conflict"] = True
    protos = synthesize_protocols(
        pid=1, all_insights=[insight],
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 1  # "possible" tier admits


def test_max_options_cap_never_exceeded():
    insights = [
        _make_insight("bedtime", "hrv_daily",        -0.5, 0.8),
        _make_insight("bedtime", "deep_sleep",       +0.5, 0.8),
        _make_insight("bedtime", "sleep_efficiency", +0.5, 1.2),
        _make_insight("bedtime", "sleep_quality",    +0.5, 1.4),
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == MAX_OPTIONS, len(protos)


def test_missing_current_value_skips_action():
    insight = _make_insight("bedtime", "hrv_daily", -0.5, 0.8)
    protos = synthesize_protocols(
        pid=1, all_insights=[insight],
        current_values={},
        behavioral_sds={"bedtime": 0.5},
    )
    assert protos == []


# ── Tier + horizon inheritance ───────────────────────────────────

def test_protocol_inherits_weakest_tier():
    insights = [
        _make_insight("bedtime", "hrv_daily",  -0.5, 0.10, tier="recommended"),
        _make_insight("bedtime", "deep_sleep", -0.5, 0.12, tier="possible"),
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 1
    assert protos[0].gate_tier == "possible"


def test_protocol_horizon_inherits_max():
    insights = [
        _make_insight("bedtime", "hrv_daily",     -0.5, 0.10),
        _make_insight("bedtime", "sleep_quality", -0.5, 0.12),
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 1
    assert protos[0].horizon_days == 4  # max(4, 2)


def test_weakest_contraction_is_min():
    insights = [
        _make_insight("bedtime", "hrv_daily",  -0.5, 0.10, contraction=0.9),
        _make_insight("bedtime", "deep_sleep", -0.5, 0.12, contraction=0.42),
    ]
    protos = synthesize_protocols(
        pid=1, all_insights=insights,
        current_values={"bedtime": 23.0}, behavioral_sds={"bedtime": 0.5},
    )
    assert len(protos) == 1
    assert _approx(protos[0].weakest_contraction, 0.42)


# ── Registries ───────────────────────────────────────────────────

def test_every_action_has_unit():
    for a in ("bedtime", "sleep_duration", "running_volume", "steps",
              "training_load", "active_energy"):
        assert a in ACTION_UNITS, a


def test_every_short_horizon_outcome_has_horizon():
    for o in ("hrv_daily", "resting_hr", "sleep_quality",
              "sleep_efficiency", "deep_sleep"):
        assert o in HORIZON_DAYS_BY_OUTCOME, o


def test_rationale_rendering_variants():
    assert _render_rationale(["hrv_daily"]) == "Optimizes HRV"
    assert _render_rationale(["hrv_daily", "deep_sleep"]) == "Optimizes HRV and deep sleep"
    r3 = _render_rationale(["hrv_daily", "deep_sleep", "sleep_quality"])
    # Oxford-comma style: "Optimizes HRV, deep sleep, and sleep quality"
    assert r3.count(",") == 2, r3
    assert "and sleep quality" in r3


# ── Helpers on real data ─────────────────────────────────────────

def test_behavioral_helpers_on_real_pid():
    out_dir = Path(__file__).resolve().parents[2] / "output"
    life_path = out_dir / "lifestyle_app.csv"
    if not life_path.exists():
        return  # skip
    import pandas as pd
    life = pd.read_csv(life_path)
    p1 = life[life.participant_id == 1]
    sds = compute_behavioral_sds(p1)
    currents = compute_current_values(p1)
    for a in ("bedtime", "sleep_duration", "running_volume", "steps",
              "training_load", "active_energy"):
        assert a in sds and math.isfinite(sds[a]), f"{a} sd"
        assert a in currents and math.isfinite(currents[a]), f"{a} current"


def test_end_to_end_on_real_participant():
    """Load one participant's exported JSON, synthesize protocols, sanity-check."""
    out_dir = Path(__file__).resolve().parents[2] / "output"
    portal = out_dir / "portal_bayesian"
    life_path = out_dir / "lifestyle_app.csv"
    if not (portal.exists() and life_path.exists()):
        return
    import json
    import pandas as pd
    life = pd.read_csv(life_path)
    pid = 1
    p_file = portal / f"participant_{pid:04d}.json"
    if not p_file.exists():
        return
    record = json.loads(p_file.read_text())
    insights = record.get("effects_bayesian", [])
    p_life = life[life.participant_id == pid]
    sds = compute_behavioral_sds(p_life)
    currents = compute_current_values(p_life)
    protos = synthesize_protocols(
        pid=pid, all_insights=insights,
        current_values=currents, behavioral_sds=sds,
    )
    # Must be non-negative and finite target values with supporting insights
    for p in protos:
        assert len(p.supporting_insight_ids) >= 1
        assert math.isfinite(p.target_value)
        assert math.isfinite(p.delta)
        assert p.gate_tier in ("recommended", "possible")


TESTS = [
    test_compute_target_uses_daily_step,
    test_compute_target_running_volume_daily_unit,
    test_split_at_largest_gap_uneven,
    test_split_at_largest_gap_two_items,
    test_format_clock_variants,
    test_zero_insights_zero_protocols,
    test_single_exposed_insight_single_protocol,
    test_not_exposed_insights_excluded,
    test_similar_targets_collapse_to_most_conservative,
    test_divergent_same_direction_targets_split_into_two,
    test_conflicting_direction_insights_emit_two_protocols,
    test_direction_conflict_insights_admitted_when_exposed,
    test_max_options_cap_never_exceeded,
    test_missing_current_value_skips_action,
    test_protocol_inherits_weakest_tier,
    test_protocol_horizon_inherits_max,
    test_weakest_contraction_is_min,
    test_every_action_has_unit,
    test_every_short_horizon_outcome_has_horizon,
    test_rationale_rendering_variants,
    test_behavioral_helpers_on_real_pid,
    test_end_to_end_on_real_participant,
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
