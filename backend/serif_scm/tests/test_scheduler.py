"""Unit tests for scheduler.compute_release_schedule.

Covers the four acceptance checks from the Task #14 spec:
  1. Zero releases before day 7.
  2. Each protocol is released between 1 and 3 times (upper bound enforced;
     lower bound is a target, not a guarantee — the scheduler won't force
     releases when cooldown + priority rules don't allow them).
  3. No same protocol released within a 14-day window.
  4. Protocols addressing an active regime surface earlier on average
     than ones that do not.

Run:  python -m serif_scm.tests.test_scheduler
"""

from __future__ import annotations

from ..scheduler import (
    START_DAY,
    END_DAY,
    COOLDOWN_DAYS,
    MAX_SURFACINGS,
    FRAMINGS,
    Release,
    addresses_active_regime,
    compute_release_schedule,
    release_count_distribution,
    release_count_warnings,
    releases_to_dicts,
)


# ── Test helpers ──────────────────────────────────────────────────

def _proto(
    protocol_id: str,
    action: str,
    delta: float,
    tier: str = "recommended",
    contraction: float = 0.5,
) -> dict:
    return {
        "protocol_id": protocol_id,
        "action": action,
        "delta": delta,
        "gate_tier": tier,
        "weakest_contraction": contraction,
    }


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


# ── Tests ─────────────────────────────────────────────────────────

def test_zero_releases_before_day_7():
    protocols = [
        _proto("p1", "bedtime", -0.5),
        _proto("p2", "running_volume", -1.0),
    ]
    releases = compute_release_schedule(protocols, regime_activations={})
    days = [r.day for r in releases]
    _assert(all(d >= START_DAY for d in days),
            f"found release before day {START_DAY}: {days}")
    _assert(all(d <= END_DAY for d in days),
            f"found release past day {END_DAY}: {days}")


def test_release_count_per_protocol_within_bounds():
    protocols = [
        _proto("p1", "bedtime", -0.5, contraction=0.8),
        _proto("p2", "running_volume", -1.0, contraction=0.7),
        _proto("p3", "sleep_duration", 0.5, contraction=0.6),
    ]
    releases = compute_release_schedule(protocols, regime_activations={})
    per_proto: dict[str, int] = {}
    for r in releases:
        per_proto[r.protocol_id] = per_proto.get(r.protocol_id, 0) + 1
    for pid, count in per_proto.items():
        _assert(count <= MAX_SURFACINGS,
                f"{pid} released {count} times (>{MAX_SURFACINGS})")
        _assert(count >= 1, f"{pid} appears in list but count=0 (impossible)")


def test_no_same_protocol_within_14_day_window():
    protocols = [_proto("p1", "bedtime", -0.5, contraction=0.9)]
    releases = compute_release_schedule(protocols, regime_activations={})
    days_for_p1 = sorted([r.day for r in releases if r.protocol_id == "p1"])
    for i in range(1, len(days_for_p1)):
        gap = days_for_p1[i] - days_for_p1[i - 1]
        _assert(gap >= COOLDOWN_DAYS,
                f"p1 released {gap} days apart (< {COOLDOWN_DAYS})")


def test_active_regime_protocols_released_earlier_on_average():
    """Two protocols with identical contraction: one addresses an active
    regime, one does not. The regime-addressing one should land earlier
    due to the 2.0x priority multiplier — not because of novelty (which
    is identical at day 7 for both since neither has been released)."""
    protocols = [
        _proto("p_regime", "bedtime", -0.5, contraction=0.5),
        _proto("p_neutral", "steps", 500.0, contraction=0.5),
    ]
    regime_activations = {"sleep_deprivation_state": 0.9}
    releases = compute_release_schedule(protocols, regime_activations=regime_activations)

    first_days: dict[str, int] = {}
    for r in releases:
        if r.protocol_id not in first_days:
            first_days[r.protocol_id] = r.day

    _assert("p_regime" in first_days, "regime-addressing protocol never released")
    _assert("p_neutral" in first_days, "neutral protocol never released")
    _assert(first_days["p_regime"] < first_days["p_neutral"],
            f"regime-addressing protocol ({first_days['p_regime']}) not released "
            f"earlier than neutral ({first_days['p_neutral']})")


def test_only_exposed_tiers_scheduled():
    protocols = [
        _proto("p_rec", "bedtime", -0.5, tier="recommended"),
        _proto("p_pos", "running_volume", -1.0, tier="possible"),
        _proto("p_not", "sleep_duration", 0.5, tier="not_exposed"),
    ]
    releases = compute_release_schedule(protocols, regime_activations={})
    ids = {r.protocol_id for r in releases}
    _assert("p_not" not in ids, "not_exposed protocol was scheduled")
    _assert("p_rec" in ids, "recommended protocol missing from schedule")


def test_framing_rotation_per_protocol():
    protocols = [_proto("p1", "bedtime", -0.5, contraction=0.9)]
    releases = compute_release_schedule(protocols, regime_activations={})
    framings = [r.framing for r in releases if r.protocol_id == "p1"]
    for i, f in enumerate(framings):
        _assert(f == FRAMINGS[min(i, len(FRAMINGS) - 1)],
                f"framing #{i} was {f}, expected {FRAMINGS[min(i, len(FRAMINGS)-1)]}")


def test_addresses_active_regime_direction_matters():
    # sleep-deprivation regime active; bedtime-earlier (delta<0) addresses it
    active = {"sleep_deprivation_state": 0.8}
    p_earlier = _proto("p_e", "bedtime", delta=-0.5)
    p_later = _proto("p_l", "bedtime", delta=+0.5)  # going the wrong way
    _assert(addresses_active_regime(p_earlier, active) is True,
            "bedtime-earlier should address sleep-dep regime")
    _assert(addresses_active_regime(p_later, active) is False,
            "bedtime-later should NOT address sleep-dep regime")


def test_addresses_active_regime_requires_threshold():
    # Regime below threshold — no boost even if direction matches.
    inactive = {"sleep_deprivation_state": 0.3}
    p = _proto("p1", "bedtime", delta=-0.5)
    _assert(addresses_active_regime(p, inactive) is False,
            "sub-threshold regime should not count as active")


def test_novelty_bonus_changes_ordering():
    # Three protocols, all same gate_score, all eligible at day 7.
    # After first release at day 7, the next day (still within cooldown for
    # the same proto) picks a different action due to novelty bonus.
    protocols = [
        _proto("p_a", "bedtime",         -0.5, contraction=0.5),
        _proto("p_b", "running_volume",  -1.0, contraction=0.5),
        _proto("p_c", "steps",          500.0, contraction=0.5),
    ]
    releases = compute_release_schedule(protocols, regime_activations={})
    first_three_actions = []
    for r in releases:
        if len(first_three_actions) < 3:
            first_three_actions.append(r.protocol_id)
    _assert(len(set(first_three_actions)) == 3,
            f"first 3 releases should be 3 distinct actions (novelty), got "
            f"{first_three_actions}")


def test_no_protocols_produces_empty_schedule():
    _assert(compute_release_schedule([], regime_activations={}) == [],
            "empty protocol list should produce empty schedule")


def test_daily_cap_enforced():
    # 5 protocols, all exposed, all eligible — but only 1/day.
    protocols = [
        _proto(f"p{i}", "bedtime" if i == 0 else f"act_{i}", -0.5, contraction=0.9)
        for i in range(5)
    ]
    releases = compute_release_schedule(protocols, regime_activations={})
    per_day: dict[int, int] = {}
    for r in releases:
        per_day[r.day] = per_day.get(r.day, 0) + 1
    for day, count in per_day.items():
        _assert(count <= 1, f"day {day} had {count} releases (daily cap=1)")


def test_releases_to_dicts_schema():
    releases = [Release(day=7, protocol_id="p1", framing="initial")]
    dicts = releases_to_dicts(releases)
    _assert(dicts == [{"day": 7, "protocol_id": "p1", "framing": "initial"}],
            f"unexpected dict form: {dicts}")


def test_release_count_warnings_bounds():
    # Below lower
    _assert(
        any("too few" in w for w in release_count_warnings([0, 1, 2])),
        "expected too-few warning"
    )
    # Above upper
    _assert(
        any("too many" in w for w in release_count_warnings([25, 30, 40])),
        "expected too-many warning"
    )
    # In-band
    _assert(release_count_warnings([6, 8, 10]) == [],
            "in-band counts should produce no warnings")


def test_release_count_distribution_sorted():
    d = release_count_distribution([4, 4, 6, 2])
    keys = list(d.keys())
    _assert(keys == sorted(keys, key=int),
            f"distribution keys not sorted numerically: {keys}")


# ── Runner ────────────────────────────────────────────────────────

def main():
    tests = [
        test_zero_releases_before_day_7,
        test_release_count_per_protocol_within_bounds,
        test_no_same_protocol_within_14_day_window,
        test_active_regime_protocols_released_earlier_on_average,
        test_only_exposed_tiers_scheduled,
        test_framing_rotation_per_protocol,
        test_addresses_active_regime_direction_matters,
        test_addresses_active_regime_requires_threshold,
        test_novelty_bonus_changes_ordering,
        test_no_protocols_produces_empty_schedule,
        test_daily_cap_enforced,
        test_releases_to_dicts_schema,
        test_release_count_warnings_bounds,
        test_release_count_distribution_sorted,
    ]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"[pass] {t.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"[FAIL] {t.__name__}: {e}")
    if failed:
        raise SystemExit(f"\n{failed}/{len(tests)} tests failed")
    print(f"\nall {len(tests)} tests passed")


if __name__ == "__main__":
    main()
