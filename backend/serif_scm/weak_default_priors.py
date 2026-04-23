"""Layer 0 — weak zero-centered default priors.

Fills the (action, outcome) Cartesian grid for pairs where the synthetic
DAG fit has no edge, so user observations can still update a prior and
surface in the UI when personal evidence is strong.

Design:
  - mean = 0                      (no mechanism claim, no prior directional belief)
  - sigma = POP_SD[outcome] * SIGMA_WEAK_FRAC
  - provenance = "weak_default"

SIGMA_WEAK_FRAC = 0.25 (k=4) was calibrated against the synthetic fit-prior
SD distribution (output/total_effect_priors.json, 2026-04-22):
  * p10 = 0.6% of pop SD,  p50 = 3.8%,  p90 = 15.2%,  max = 64.6%.
A 25% SD is wider than all but one outlier fit, so whenever a pair has a
structural fit the fit dominates the precision-weighted pool. Layer 0
only carries the posterior forward when no fit exists.

Separation of concerns:
  - Layer 0 never replaces a fit — `fill_weak_defaults` skips pairs that
    are already in the priors dict, regardless of that fit's magnitude.
    The existing zero-mean filter in `supported_pairs_from_priors` handles
    the Bucket-B-like case where a DAG path sums to ~0; Layer 0 stays out
    of that decision.
  - Only `("__all__", action, outcome)` is filled. Cohort-specific priors
    remain absent for Layer 0 pairs — `compute_posterior` treats missing
    cohort prior as a no-op, which is the right fallback when we have no
    cohort-specific evidence.
"""

from __future__ import annotations

from .point_engine import MANIPULABLE_NODES, LOAD_ACTIONS, MARGINAL_STEPS
from .intervention_horizons import WEARABLE_HORIZONS, BIOMARKER_HORIZONS
from .synthetic.config import BIOMARKER_PRIORS, WEARABLE_PRIORS
from .total_effect_priors import TotalEffectPrior


SIGMA_WEAK_FRAC: float = 0.25

ALL_ACTIONS: list[str] = sorted(MANIPULABLE_NODES | LOAD_ACTIONS)
ALL_OUTCOMES: list[str] = sorted(set(WEARABLE_HORIZONS.keys()) | set(BIOMARKER_HORIZONS.keys()))


def pop_sd_for_outcome(outcome: str) -> float:
    """Population SD for an outcome, from BIOMARKER_PRIORS or WEARABLE_PRIORS."""
    if outcome in BIOMARKER_PRIORS:
        return float(BIOMARKER_PRIORS[outcome].std)
    if outcome in WEARABLE_PRIORS:
        return float(WEARABLE_PRIORS[outcome].std)
    raise KeyError(f"No population SD registered for outcome {outcome!r}")


def _weak_prior_for(
    action: str, outcome: str, cohort: str = "__all__",
) -> TotalEffectPrior:
    sigma = pop_sd_for_outcome(outcome) * SIGMA_WEAK_FRAC
    variance = sigma * sigma
    nominal_step = float(MARGINAL_STEPS.get(action, 1.0))
    return TotalEffectPrior(
        cohort=cohort,
        action=action,
        outcome=outcome,
        mean=0.0,
        variance=variance,
        raw_std=sigma,
        inflated_std=sigma,
        n=0,
        p10=-sigma,
        p50=0.0,
        p90=+sigma,
        nominal_step=nominal_step,
        floor_mode="absolute",
        floor_applied=False,
        mean_scaled_std=0.0,
        provenance="weak_default",
    )


def fill_weak_defaults(
    priors: dict[tuple[str, str, str], TotalEffectPrior],
) -> tuple[dict[tuple[str, str, str], TotalEffectPrior], list[tuple[str, str]]]:
    """Add Layer 0 weak priors for population-level pairs missing a fit.

    Returns
    -------
    out : dict
        `priors` augmented with weak-default entries for every
        `__all__` pair missing from the Cartesian grid.
    added : list
        `(action, outcome)` pairs that were added, sorted.
    """
    out = dict(priors)
    added: list[tuple[str, str]] = []

    for action in ALL_ACTIONS:
        for outcome in ALL_OUTCOMES:
            key = ("__all__", action, outcome)
            if key in out:
                continue
            out[key] = _weak_prior_for(action, outcome)
            added.append((action, outcome))

    return out, sorted(added)


def summarize_by_provenance(
    priors: dict[tuple[str, str, str], TotalEffectPrior],
) -> dict[str, int]:
    """Count population-level priors by provenance tag."""
    counts: dict[str, int] = {}
    for (cohort, _, _), p in priors.items():
        if cohort != "__all__":
            continue
        tag = getattr(p, "provenance", "synthetic")
        counts[tag] = counts.get(tag, 0) + 1
    return counts
