"""Protocol synthesis — consolidate per-(action, outcome) insights into
per-action daily recommendations.

Each insight from the Bayesian export is an evidence-level claim: "nudging
{action} by {nominal_step}×{multiplier} is predicted to change {outcome}
by {scaled_effect}." Protocols answer the action-level question: given all
insights that share an action, what single bedtime (or protein intake, or
run distance) should the user aim for?

Logic per action (for insights with gate_tier in {recommended, possible}):
  1. Zero insights → skip action.
  2. One insight → single protocol.
  3. Multiple, same direction (sign of delta=target-current):
       range = max(target) - min(target)
       if range ≤ COLLAPSE_FRAC * behavioral_sd[action]:
         single protocol at the most conservative (smallest |delta|) target
       else:
         two protocols split at the largest gap in sorted targets:
           - "conservative" (lower-magnitude-cluster, most-conservative target)
           - "aggressive"   (higher-magnitude-cluster, most-conservative target
             within that cluster)
  4. Multiple, conflicting direction:
       two protocols split by sign ("up" / "down").
  5. Cap at MAX_OPTIONS protocols per action.

Protocol gate_tier inherits the weakest tier among supporting insights;
horizon_days inherits the max. `weakest_contraction` is the min across
supporting insights (conservative framing).

Target values are expressed in the daily operating unit for each action
(e.g., bedtime in hour-of-day, running_volume in km/day, training_load
in TRIMP/day). Unit conventions live in `ACTION_UNITS`.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional

import pandas as pd

from .user_observations import NOMINAL_STEP_DAILY


# ── Tunables ──────────────────────────────────────────────────────

# "Similar enough to collapse" — fraction of the user's behavioral SD for
# that action below which target spread is treated as indistinguishable.
COLLAPSE_FRAC = 0.15

# Hard cap on distinct protocols per action.
MAX_OPTIONS = 2

# Magnitude of target-current below which delta is treated as zero.
SIGN_EPS = 1e-6

# Tier ordering: smaller number = stronger tier.
_TIER_ORDER = {"recommended": 0, "possible": 1, "not_exposed": 2}

# Days-to-first-signal per outcome at daily wearable cadence. Used to set
# the horizon the protocol should be evaluated over.
HORIZON_DAYS_BY_OUTCOME: dict[str, int] = {
    "hrv_daily":        4,
    "resting_hr":       4,
    "sleep_quality":    2,
    "sleep_efficiency": 2,
    "deep_sleep":       3,
}

# Native daily operating unit per action (what the user actually adjusts).
ACTION_UNITS: dict[str, str] = {
    "bedtime":        "hr",      # hour-of-day
    "sleep_duration": "hr",      # hours per night
    "running_volume": "km/day",
    "steps":          "steps/day",
    "training_load":  "TRIMP/day",
    "active_energy":  "kcal/day",
}

# Short, user-facing label per outcome for the rationale string.
_OUTCOME_LABEL: dict[str, str] = {
    "hrv_daily":        "HRV",
    "resting_hr":       "resting HR",
    "sleep_quality":    "sleep quality",
    "sleep_efficiency": "sleep efficiency",
    "deep_sleep":       "deep sleep",
}


@dataclass(frozen=True)
class Protocol:
    """One per-action recommendation. May be one of several options for an
    action if the underlying insights disagree beyond the collapse threshold."""
    protocol_id: str
    action: str
    target_value: float
    current_value: float
    delta: float                       # target - current, signed
    unit: str                          # from ACTION_UNITS
    option_index: int                  # 0 if single; 0/1 if split
    option_label: str                  # single|collapsed|conservative|aggressive|up|down
    supporting_insight_ids: list[str]  # "{action}_{outcome}"
    outcomes_served: list[str]
    gate_tier: str                     # weakest among supporting insights
    weakest_contraction: float         # min across supporting insights
    horizon_days: int                  # max across supporting insights
    description: str                   # templated human-readable target
    rationale: str                     # templated "optimizes X, Y, Z"
    # True when the aggressive training_load ceiling kicked in.
    clipped_at_ceiling: bool = False
    # Synthesis target before clipping, present only when clipped_at_ceiling.
    unclipped_value: Optional[float] = None


# ── Participant feature extraction ────────────────────────────────

def compute_behavioral_sds(life_df_pid: pd.DataFrame) -> dict[str, float]:
    """Day-to-day SD per manipulable action (daily unit) from one pid's rows.

    Values missing or < a small floor are retained as-is; callers fall back
    to a sensible default when dividing by a zero SD.
    """
    out: dict[str, float] = {}
    if "bedtime_hr" in life_df_pid:
        out["bedtime"] = float(life_df_pid["bedtime_hr"].std())
    if "sleep_hrs" in life_df_pid:
        out["sleep_duration"] = float(life_df_pid["sleep_hrs"].std())
    if "run_km" in life_df_pid:
        out["running_volume"] = float(life_df_pid["run_km"].std())
    if "steps" in life_df_pid:
        out["steps"] = float(life_df_pid["steps"].std())
    if "training_min" in life_df_pid:
        out["training_load"] = float(life_df_pid["training_min"].std() * 1.78)
    if {"steps", "training_min"}.issubset(life_df_pid.columns):
        ae = 0.04 * life_df_pid["steps"] + 3.0 * life_df_pid["training_min"]
        out["active_energy"] = float(ae.std())
    return out


def compute_current_values(life_df_pid: pd.DataFrame, window: int = 30) -> dict[str, float]:
    """Recent-window mean per manipulable action (daily unit). Window = last
    `window` rows; if shorter, uses whatever is available."""
    recent = life_df_pid.tail(window) if len(life_df_pid) > window else life_df_pid
    out: dict[str, float] = {}
    if "bedtime_hr" in recent:
        out["bedtime"] = float(recent["bedtime_hr"].mean())
    if "sleep_hrs" in recent:
        out["sleep_duration"] = float(recent["sleep_hrs"].mean())
    if "run_km" in recent:
        out["running_volume"] = float(recent["run_km"].mean())
    if "steps" in recent:
        out["steps"] = float(recent["steps"].mean())
    if "training_min" in recent:
        out["training_load"] = float((recent["training_min"] * 1.78).mean())
    if {"steps", "training_min"}.issubset(recent.columns):
        ae = 0.04 * recent["steps"] + 3.0 * recent["training_min"]
        out["active_energy"] = float(ae.mean())
    return out


# ── Formatting helpers ────────────────────────────────────────────

def _format_clock(hour_of_day: float) -> str:
    """22.75 → '10:45pm'. Handles 24h wraparound and 12am/12pm edge cases."""
    h = int(hour_of_day) % 24
    m = int(round((hour_of_day - int(hour_of_day)) * 60))
    if m == 60:
        h = (h + 1) % 24
        m = 0
    period = "am" if h < 12 else "pm"
    h12 = h if (h % 12) != 0 else 12
    if h12 > 12:
        h12 -= 12
    return f"{h12}:{m:02d}{period}"


def _render_description(action: str, current: float, target: float) -> str:
    delta = target - current
    if action == "bedtime":
        direction = "earlier" if delta < 0 else "later"
        return f"Shift bedtime {direction} to {_format_clock(target)}"
    if action == "sleep_duration":
        return f"Target {target:.1f} hours of sleep per night"
    if action == "running_volume":
        verb = "Increase" if delta > 0 else "Reduce"
        return f"{verb} daily running to {target:.1f} km/day"
    if action == "steps":
        return f"Target {int(round(target))} steps/day"
    if action == "training_load":
        return f"Target training load ~{target:.0f} TRIMP/day"
    if action == "active_energy":
        return f"Target active energy {target:.0f} kcal/day"
    return f"Target {action} = {target:.2f}"


def _render_rationale(outcomes: list[str]) -> str:
    labels = [_OUTCOME_LABEL.get(o, o) for o in outcomes]
    if not labels:
        return ""
    if len(labels) == 1:
        return f"Optimizes {labels[0]}"
    if len(labels) == 2:
        return f"Optimizes {labels[0]} and {labels[1]}"
    return f"Optimizes {', '.join(labels[:-1])}, and {labels[-1]}"


# ── Core synthesis ────────────────────────────────────────────────

def _compute_target(insight: dict, current: float, action: str) -> float:
    """target = current + NOMINAL_STEP_DAILY[action] * dose_multiplier.

    Falls back to insight['nominal_step'] if the action isn't in the daily
    registry — that means the monthly-sum action is interpreted as-is.
    """
    step_daily = NOMINAL_STEP_DAILY.get(action, float(insight.get("nominal_step", 0.0)))
    mult = float(insight.get("dose_multiplier", 1.0))
    return float(current) + float(step_daily) * mult


def _split_at_largest_gap(
    items: list[tuple[dict, float]],
) -> tuple[list[tuple[dict, float]], list[tuple[dict, float]]]:
    """items is a list of (insight, target) pairs sorted by target ascending.
    Returns (lower_cluster, upper_cluster) split at the largest consecutive
    gap."""
    if len(items) < 2:
        return items, []
    gaps = [items[i + 1][1] - items[i][1] for i in range(len(items) - 1)]
    cut = max(range(len(gaps)), key=lambda i: gaps[i])
    return items[: cut + 1], items[cut + 1 :]


def _most_conservative(
    items: list[tuple[dict, float]], current: float,
) -> tuple[dict, float]:
    """Pick the (insight, target) with the smallest |target - current|."""
    return min(items, key=lambda it: abs(it[1] - current))


def _weakest_tier(insights: list[dict]) -> str:
    tiers = [i["gate"]["tier"] for i in insights]
    return max(tiers, key=lambda t: _TIER_ORDER.get(t, 99))


def _apply_aggressive_clip(
    action: str, option_label: str, target: float, current: float,
) -> tuple[float, bool, Optional[float]]:
    """Cap aggressive training_load targets at max(300, 1.5 × current) TRIMP/day.

    Returns (clipped_target, was_clipped, unclipped_original). Only fires for
    training_load + aggressive; everything else passes through unchanged.
    """
    if action != "training_load" or option_label != "aggressive":
        return target, False, None
    ceiling = max(300.0, 1.5 * float(current))
    if target > ceiling:
        return ceiling, True, float(target)
    return target, False, None


def _make_protocol(
    pid: int,
    action: str,
    current: float,
    group: list[tuple[dict, float]],
    option_label: str,
    option_index: int,
) -> Protocol:
    chosen_insight, chosen_target = _most_conservative(group, current)
    chosen_target, clipped, unclipped = _apply_aggressive_clip(
        action, option_label, float(chosen_target), float(current),
    )
    supporting = [ins for ins, _ in group]
    insight_ids = [f"{i['action']}_{i['outcome']}" for i in supporting]
    outcomes = [i["outcome"] for i in supporting]
    tier = _weakest_tier(supporting)
    weakest_c = min(float(i["posterior"]["contraction"]) for i in supporting)
    horizon = max(HORIZON_DAYS_BY_OUTCOME.get(i["outcome"], 7) for i in supporting)
    suffix = f"{option_label}_" if option_label not in ("single", "collapsed") else ""
    protocol_id = f"{action}_{suffix}p{pid:04d}"
    return Protocol(
        protocol_id=protocol_id,
        action=action,
        target_value=float(chosen_target),
        current_value=float(current),
        delta=float(chosen_target - current),
        unit=ACTION_UNITS.get(action, ""),
        option_index=int(option_index),
        option_label=option_label,
        supporting_insight_ids=insight_ids,
        outcomes_served=outcomes,
        gate_tier=tier,
        weakest_contraction=float(weakest_c),
        horizon_days=int(horizon),
        description=_render_description(action, current, chosen_target),
        rationale=_render_rationale(outcomes),
        clipped_at_ceiling=clipped,
        unclipped_value=unclipped,
    )


def synthesize_protocols(
    pid: int,
    all_insights: list[dict],
    current_values: dict[str, float],
    behavioral_sds: dict[str, float],
    exposed_tiers: tuple[str, ...] = ("recommended", "possible"),
) -> list[Protocol]:
    """Consolidate exposed insights into per-action protocol recommendations.

    Only insights with `gate.tier ∈ exposed_tiers` participate.
    """
    exposed = [i for i in all_insights if i.get("gate", {}).get("tier") in exposed_tiers]
    by_action: dict[str, list[dict]] = {}
    for i in exposed:
        by_action.setdefault(i["action"], []).append(i)

    protocols: list[Protocol] = []
    for action, group in by_action.items():
        if action not in current_values:
            continue
        current = float(current_values[action])
        pairs: list[tuple[dict, float]] = [
            (i, _compute_target(i, current, action)) for i in group
        ]
        if not pairs:
            continue

        positive = [(i, t) for (i, t) in pairs if (t - current) > SIGN_EPS]
        negative = [(i, t) for (i, t) in pairs if (t - current) < -SIGN_EPS]

        # Conflicting directions → 2 protocols
        if positive and negative:
            pos_sorted = sorted(positive, key=lambda p: p[1])
            neg_sorted = sorted(negative, key=lambda p: p[1])
            protocols.append(_make_protocol(pid, action, current, neg_sorted, "down", 0))
            protocols.append(_make_protocol(pid, action, current, pos_sorted, "up", 1))
            continue

        same_direction = positive if positive else negative
        if not same_direction:
            continue  # all targets ~= current, no actionable protocol

        if len(same_direction) == 1:
            protocols.append(_make_protocol(pid, action, current, same_direction, "single", 0))
            continue

        sorted_items = sorted(same_direction, key=lambda p: p[1])
        span = sorted_items[-1][1] - sorted_items[0][1]
        sd = max(float(behavioral_sds.get(action, 0.0)), 0.0)
        threshold = COLLAPSE_FRAC * sd

        if sd > 0 and span <= threshold:
            protocols.append(_make_protocol(pid, action, current, sorted_items, "collapsed", 0))
        else:
            lower, upper = _split_at_largest_gap(sorted_items)
            # If one cluster is empty (can't happen with n>=2) or has 1 item
            # we still emit both.
            # "Conservative" = cluster with smaller |delta| from current; flip if needed.
            def _min_abs_delta(items: list[tuple[dict, float]]) -> float:
                return min(abs(t - current) for _, t in items) if items else float("inf")

            if _min_abs_delta(lower) <= _min_abs_delta(upper):
                conservative, aggressive = lower, upper
            else:
                conservative, aggressive = upper, lower
            protocols.append(_make_protocol(pid, action, current, conservative, "conservative", 0))
            if aggressive:
                protocols.append(_make_protocol(pid, action, current, aggressive, "aggressive", 1))

    # Enforce MAX_OPTIONS per action as a final safety net.
    capped: list[Protocol] = []
    seen_count: dict[str, int] = {}
    for p in protocols:
        n = seen_count.get(p.action, 0)
        if n < MAX_OPTIONS:
            capped.append(p)
            seen_count[p.action] = n + 1
    return capped


def protocols_to_dicts(protocols: list[Protocol]) -> list[dict]:
    return [asdict(p) for p in protocols]
