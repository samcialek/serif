"""Recommendation release scheduler.

Given a participant's synthesized protocols and their current regime state,
produce a per-day release schedule for days 7 through 80 (73-day window).

Scheduling rules (see Task #14 spec):
  - Zero releases days 0-6 (warmup).
  - Each protocol can surface at most once per `cooldown_days` (default 14).
  - Daily cap: at most 1 new protocol per day.
  - Target: each exposed protocol surfaces 1-3 times, with rotating framing
    (initial / adherence-check / reinforcement).
  - Priority (descending): regime_urgency × gate_score_proxy × novelty_bonus
      * regime_urgency = 2.0 if the protocol addresses a currently-active
        regime in the direction the regime needs, 1.0 otherwise.
      * gate_score_proxy = protocol `weakest_contraction` (the min contraction
        across supporting insights — matches the weakest-link rule used in
        protocol synthesis).
      * novelty_bonus = 1.2 if the protocol's action is not in the last 3
        released actions, 1.0 otherwise.

Stop condition: if release count per participant averages below 3 or above 20,
the caller should report rather than adjust. `release_count_warnings` returns
the set of tripped bounds for a batch run.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional


# ── Action → regime mapping ───────────────────────────────────────

# Which active regime (if any) a given action's protocol can address, and the
# delta direction required for the protocol to actually resolve (not aggravate)
# that regime. Actions without a mapping get no regime-urgency boost.
#
#   "lower"   → protocol's target must be below current   (delta < 0)
#   "higher"  → protocol's target must be above current   (delta > 0)
ACTION_TO_REGIME: dict[str, str] = {
    "bedtime":         "sleep_deprivation_state",
    "sleep_duration":  "sleep_deprivation_state",
    "running_volume":  "overreaching_state",
    "training_load":   "overreaching_state",
}

REGIME_ADDRESSING_DIRECTION: dict[tuple[str, str], str] = {
    ("bedtime",         "sleep_deprivation_state"): "lower",   # bedtime earlier
    ("sleep_duration",  "sleep_deprivation_state"): "higher",  # sleep longer
    ("running_volume",  "overreaching_state"):      "lower",   # run less
    ("training_load",   "overreaching_state"):      "lower",   # train less
}


# ── Tunables ──────────────────────────────────────────────────────

START_DAY = 7
END_DAY = 80
COOLDOWN_DAYS = 14
DAILY_CAP = 1
MAX_SURFACINGS = 3
MIN_SURFACINGS_TARGET = 1
REGIME_URGENCY_MULT = 2.0
NOVELTY_BONUS_MULT = 1.2
REGIME_ACTIVE_THRESHOLD = 0.5
NOVELTY_WINDOW = 3

FRAMINGS: tuple[str, ...] = ("initial", "adherence-check", "reinforcement")

EXPOSED_TIERS: tuple[str, ...] = ("recommended", "possible")

# Stop-condition bounds for batch-level mean releases per participant.
RELEASE_COUNT_LOWER = 3
RELEASE_COUNT_UPPER = 20


@dataclass(frozen=True)
class Release:
    day: int
    protocol_id: str
    framing: str


# ── Public API ────────────────────────────────────────────────────

def addresses_active_regime(
    protocol: dict,
    regime_activations: dict[str, float],
    threshold: float = REGIME_ACTIVE_THRESHOLD,
) -> bool:
    """True if the protocol's action maps to a regime that is currently
    active (activation ≥ threshold) AND the protocol's delta moves in the
    direction that resolves it.
    """
    action = protocol.get("action")
    regime = ACTION_TO_REGIME.get(action) if action else None
    if regime is None:
        return False
    activation = float(regime_activations.get(regime, 0.0))
    if activation < threshold:
        return False
    direction_needed = REGIME_ADDRESSING_DIRECTION.get((action, regime))
    if direction_needed is None:
        return False
    delta = float(protocol.get("delta", 0.0))
    if direction_needed == "lower":
        return delta < 0
    if direction_needed == "higher":
        return delta > 0
    return False


def _priority(
    protocol: dict,
    regime_activations: dict[str, float],
    last_actions: list[str],
) -> float:
    """Compute the scheduling priority for one candidate protocol."""
    # gate_score proxy: weakest_contraction is the protocol-level strength
    # (lowest contraction among supporting insights, already computed upstream).
    gate_proxy = max(float(protocol.get("weakest_contraction", 0.0)), 1e-6)
    regime_mult = (
        REGIME_URGENCY_MULT
        if addresses_active_regime(protocol, regime_activations)
        else 1.0
    )
    novelty_mult = (
        NOVELTY_BONUS_MULT
        if protocol.get("action") not in last_actions
        else 1.0
    )
    return gate_proxy * regime_mult * novelty_mult


def compute_release_schedule(
    protocols: Iterable[dict],
    regime_activations: Optional[dict[str, float]] = None,
    *,
    start_day: int = START_DAY,
    end_day: int = END_DAY,
    cooldown_days: int = COOLDOWN_DAYS,
    max_surfacings: int = MAX_SURFACINGS,
) -> list[Release]:
    """Build a day-by-day release schedule for a participant's protocols.

    Only protocols whose `gate_tier` is in EXPOSED_TIERS are scheduled.
    The returned list is sorted by day ascending. Days with no eligible
    protocol are silently skipped (no filler).
    """
    regime_activations = regime_activations or {}
    exposed = [p for p in protocols if p.get("gate_tier") in EXPOSED_TIERS]
    if not exposed:
        return []

    surfacing_count: dict[str, int] = {p["protocol_id"]: 0 for p in exposed}
    last_day_released: dict[str, int] = {}
    last_actions: list[str] = []
    releases: list[Release] = []

    for day in range(start_day, end_day + 1):
        eligible: list[dict] = []
        for p in exposed:
            pid = p["protocol_id"]
            if surfacing_count[pid] >= max_surfacings:
                continue
            prior = last_day_released.get(pid)
            if prior is not None and (day - prior) < cooldown_days:
                continue
            eligible.append(p)
        if not eligible:
            continue

        chosen = max(
            eligible,
            key=lambda p: _priority(p, regime_activations, last_actions),
        )

        count = surfacing_count[chosen["protocol_id"]]
        framing = FRAMINGS[min(count, len(FRAMINGS) - 1)]

        releases.append(Release(
            day=day,
            protocol_id=chosen["protocol_id"],
            framing=framing,
        ))

        surfacing_count[chosen["protocol_id"]] = count + 1
        last_day_released[chosen["protocol_id"]] = day
        last_actions.append(chosen["action"])
        if len(last_actions) > NOVELTY_WINDOW:
            last_actions.pop(0)

    return releases


def releases_to_dicts(releases: list[Release]) -> list[dict]:
    return [
        {"day": r.day, "protocol_id": r.protocol_id, "framing": r.framing}
        for r in releases
    ]


# ── Batch-level diagnostics ───────────────────────────────────────

def release_count_warnings(
    release_counts: list[int],
    *,
    lower: int = RELEASE_COUNT_LOWER,
    upper: int = RELEASE_COUNT_UPPER,
) -> list[str]:
    """Return human-readable strings for any stop-condition bounds tripped.

    Report rather than adjust: if a warning fires, the caller should surface
    it (don't rescue the release count by relaxing cooldown or raising the
    surfacing cap). Per Task #14 stop condition.
    """
    if not release_counts:
        return ["release_counts empty: 0 participants scheduled"]
    mean = sum(release_counts) / len(release_counts)
    out: list[str] = []
    if mean < lower:
        out.append(f"release_count_mean {mean:.2f} < {lower} (too few surfacings)")
    if mean > upper:
        out.append(f"release_count_mean {mean:.2f} > {upper} (too many surfacings)")
    return out


def release_count_distribution(release_counts: list[int]) -> dict[str, int]:
    """Histogram of per-participant release counts."""
    hist: dict[str, int] = {}
    for c in release_counts:
        hist[str(c)] = hist.get(str(c), 0) + 1
    return dict(sorted(hist.items(), key=lambda kv: int(kv[0])))
