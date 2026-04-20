"""Per-action intervention-feasibility bounds.

Caps engine-proposed intervention magnitudes against what the participant
can physically reach from their current operating point. Without these
bounds, a posterior slope fit from cohorts that span 0-30 km/day running
could project "reduce running by 38 km/day" for a participant whose
current average is 4 km/day — a math-world artifact, not a recommendation.

Semantic model: dose_action = nominal_step × dose_multiplier. After
bounding, dose_multiplier is scaled so that current + dose_action stays
within the per-action feasible range centered on `current`. The bounded
dose never flips sign (sign-flip cases collapse to zero and get
suppressed downstream by existing min-dose filters).
"""

from __future__ import annotations

from typing import Optional


def feasible_range(action: str, current: float) -> Optional[tuple[float, float]]:
    """Per-action target-value range around `current`.

    Returns None when no bound is configured for the action (pass-through)
    or when `current` is not finite.
    """
    if current is None:
        return None
    try:
        cur = float(current)
    except (TypeError, ValueError):
        return None
    if cur != cur or cur in (float("inf"), float("-inf")):  # NaN or inf
        return None

    # Time-of-day actions: ±2h either direction.
    if action in ("bedtime", "wake_time", "workout_time"):
        return (cur - 2.0, cur + 2.0)

    # Duration actions: ±min(50% × current, 2h).
    if action in ("sleep_duration", "training_volume"):
        span = min(0.5 * abs(cur), 2.0)
        return (cur - span, cur + span)

    # Distance/volume actions: [0.25×cur, 1.5×cur].
    if action in ("running_volume", "zone2_volume"):
        if cur <= 0:
            return (0.0, 0.0)
        return (0.25 * cur, 1.5 * cur)

    # Training load: [max(50, 0.5×cur), max(300, 1.5×cur)].
    if action == "training_load":
        return (max(50.0, 0.5 * cur), max(300.0, 1.5 * cur))

    # Steps: [max(3000, 0.5×cur), min(25000, 1.5×cur)].
    if action == "steps":
        return (max(3000.0, 0.5 * cur), min(25000.0, 1.5 * cur))

    # Dietary protein: [max(40, 0.5×cur), min(250, 1.5×cur)].
    if action == "dietary_protein":
        return (max(40.0, 0.5 * cur), min(250.0, 1.5 * cur))

    # Dietary energy: ±30% of current, no hard absolute floor/ceiling.
    if action == "dietary_energy":
        return (0.7 * cur, 1.3 * cur)

    return None


def bound_dose(
    action: str,
    current: Optional[float],
    nominal_step: float,
    dose_multiplier: float,
) -> tuple[float, bool]:
    """Return (bounded_dose_multiplier, was_bounded).

    Shrinks the engine's proposed intervention so that current + dose falls
    within the action's feasible range. If feasibility is undefined for
    this action, or nominal_step is zero, returns the input unchanged.

    Sign-flip guard: if clamping would flip the sign of the dose (e.g.,
    a decrease recommendation becomes an increase because current lies
    below the action's absolute floor), returns bounded_mult=0 so
    downstream min-dose filters naturally suppress the insight.
    """
    if current is None:
        return float(dose_multiplier), False
    rng = feasible_range(action, float(current))
    if rng is None or nominal_step == 0:
        return float(dose_multiplier), False

    lo, hi = rng
    cur = float(current)
    original_dose = float(nominal_step) * float(dose_multiplier)
    proposed_target = cur + original_dose
    bounded_target = max(lo, min(hi, proposed_target))

    if abs(bounded_target - proposed_target) < 1e-9:
        return float(dose_multiplier), False

    bounded_dose = bounded_target - cur
    # Sign-flip guard: bounded dose must agree with original dose direction.
    if original_dose > 1e-9 and bounded_dose < -1e-9:
        return 0.0, True
    if original_dose < -1e-9 and bounded_dose > 1e-9:
        return 0.0, True

    bounded_mult = bounded_dose / float(nominal_step)
    return float(bounded_mult), True
