"""Translate a posterior's contraction into an intervention-dose multiplier.

The Bayesian gating path adjusts the nominal MARGINAL_STEP for an edge by a
multiplier in [0.5, 1.5]:

    multiplier = 0.5 + 1.0 * contraction          (baseline, no guard)

Semantics:
    contraction = 0   (no learning beyond prior)   -> multiplier 0.5  (half dose)
    contraction = 0.5                              -> multiplier 1.0  (nominal)
    contraction = 1   (posterior is a point mass)  -> multiplier 1.5  (1.5x dose)

This is NOT a rescaling of MARGINAL_STEPS (the derivative probe) — it scales
the *intervention dose used for gating decisions* so that well-identified
per-user effects can justify a stronger recommendation. See
`feedback_marginal_steps.md`: MARGINAL_STEPS remains a fixed derivative probe.

Direction-agreement guard:
    If the user's posterior slope has the opposite sign as the population
    prior, collapse multiplier to 0.5. Rationale: large contraction can occur
    simply because the user's fitted slope is precise — but if it points the
    other way from the population, a larger dose is not justified. The floor
    keeps the intervention nominal-weak rather than promoting it. A zero-near
    sign (both within an epsilon of zero) passes through without penalty.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


MULT_FLOOR = 0.5
MULT_CEILING = 1.5
SIGN_EPSILON = 1e-6  # magnitudes below this are treated as "zero" (no sign conflict)


@dataclass(frozen=True)
class DoseAdjustment:
    """Output of multiplier_from_posterior."""
    multiplier: float            # final, in [0.5, 1.5]
    raw_multiplier: float        # pre-guard (purely from contraction)
    direction_conflict: bool     # True iff user-posterior sign opposes pop
    contraction_used: float


def _sign(x: float, eps: float = SIGN_EPSILON) -> int:
    """-1 / 0 / +1 with a zero-band so near-zero values don't flip at noise."""
    if x is None:
        return 0
    if x > eps:
        return 1
    if x < -eps:
        return -1
    return 0


def multiplier_from_posterior(
    contraction: float,
    posterior_mean: float,
    pop_mean: Optional[float],
    floor: float = MULT_FLOOR,
    ceiling: float = MULT_CEILING,
    sign_epsilon: float = SIGN_EPSILON,
) -> DoseAdjustment:
    """Core API: compute a dose multiplier from one posterior's contraction.

    Args:
        contraction: posterior contraction in [0, 1] (see conjugate_priors).
        posterior_mean: posterior mean of the slope.
        pop_mean: population prior mean for same slope (None disables guard).
        floor / ceiling: bounds on the returned multiplier.
        sign_epsilon: magnitudes below this don't trigger the guard.
    """
    c = float(max(0.0, min(1.0, contraction)))
    raw = floor + (ceiling - floor) * c

    conflict = False
    if pop_mean is not None:
        s_post = _sign(posterior_mean, sign_epsilon)
        s_pop = _sign(pop_mean, sign_epsilon)
        if s_post != 0 and s_pop != 0 and s_post != s_pop:
            conflict = True

    mult = floor if conflict else raw
    # Final safety clamp.
    mult = max(floor, min(ceiling, mult))
    return DoseAdjustment(
        multiplier=float(mult),
        raw_multiplier=float(raw),
        direction_conflict=bool(conflict),
        contraction_used=float(c),
    )


def apply_to_step(
    nominal_step: float,
    adj: DoseAdjustment,
) -> float:
    """Convenience: nominal_step * adj.multiplier. Kept explicit to document
    that the scaling happens at the gating layer, not at the derivative probe.
    """
    return float(nominal_step) * float(adj.multiplier)
