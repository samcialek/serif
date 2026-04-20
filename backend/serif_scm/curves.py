"""Differentiable dose-response curves for NUTS compatibility.

The TypeScript engine uses piecewise-linear curves (below/above theta).
For gradient-based MCMC we need smooth approximations.
"""

from __future__ import annotations

import jax.numpy as jnp


def soft_piecewise(
    dose: float | jnp.ndarray,
    theta: float,
    bb: float,
    ba: float,
    sharpness: float = 20.0,
) -> jnp.ndarray:
    """Smooth approximation of the piecewise-linear dose-response.

    Below theta: effect = bb * dose
    Above theta: effect = bb * theta + ba * (dose - theta)

    Uses softplus for the transition region (C-infinity smooth).

    Parameters
    ----------
    dose : scalar or array
        Dose values (e.g., running_volume in km/month)
    theta : float
        Threshold where slope changes
    bb : float
        Slope below theta (dose-response per unit)
    ba : float
        Slope above theta (dose-response per unit)
    sharpness : float
        Controls transition sharpness. Higher = closer to piecewise.
        20.0 gives <1% error beyond 0.15 units from theta.
    """
    dose = jnp.asarray(dose)
    # Below-theta contribution: bb * min(dose, theta)
    below = bb * (dose - jnp.logaddexp(0.0, sharpness * (dose - theta)) / sharpness)
    # Above-theta contribution: ba * max(0, dose - theta)
    above = ba * jnp.logaddexp(0.0, sharpness * (dose - theta)) / sharpness
    return below + above


def soft_piecewise_v_max(
    dose: float | jnp.ndarray,
    theta: float,
    bb: float,
    ba: float,
    sharpness: float = 20.0,
) -> jnp.ndarray:
    """V-max curve: rises to theta, then falls.

    Typical for HRV response to training load — improves up to
    optimal load, then overtraining causes decline.
    """
    dose = jnp.asarray(dose)
    # Rising phase: bb * min(dose, theta)
    rising = bb * (dose - jnp.logaddexp(0.0, sharpness * (dose - theta)) / sharpness)
    # Falling phase: ba * max(0, dose - theta)  where ba < 0
    falling = ba * jnp.logaddexp(0.0, sharpness * (dose - theta)) / sharpness
    return rising + falling


def soft_piecewise_v_min(
    dose: float | jnp.ndarray,
    theta: float,
    bb: float,
    ba: float,
    sharpness: float = 20.0,
) -> jnp.ndarray:
    """V-min curve: falls to theta, then rises.

    Typical for cortisol response to training — drops with moderate
    exercise, then rises with overtraining stress.
    """
    # Same mechanics as v_max but with reversed sign conventions
    return soft_piecewise_v_max(dose, theta, bb, ba, sharpness)


def sigmoid_activation(
    dose: float | jnp.ndarray,
    theta: float,
    bb: float,
    ba: float,
) -> jnp.ndarray:
    """Sigmoid activation for regime nodes.

    f(dose) = ba / (1 + exp(-bb * (dose - theta)))

    Parameters
    ----------
    dose : scalar or array
        Input value (e.g., acwr, ferritin, sleep_debt, hscrp)
    theta : float
        Midpoint — dose at which activation = ba/2
    bb : float
        Steepness (k). Positive = activates as dose rises above theta.
        Negative = inverse sigmoid (activates as dose drops below theta).
    ba : float
        Maximum activation level (typically 1.0 for regime nodes)
    """
    dose = jnp.asarray(dose)
    return ba / (1.0 + jnp.exp(-bb * (dose - theta)))
