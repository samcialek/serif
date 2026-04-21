"""Precision-weighted Gaussian pooling of synthetic + literature priors.

Given:
  - TotalEffectPrior fit from Serif's synthetic cohort (in-engine fits)
  - LiteraturePrior sourced from a published UKB / AoU / meta-analysis slope

Both are Normal priors on the same (cohort, action, outcome) `scaled_effect`.
Pool them via conjugate-Gaussian precision weighting:

    τ_synth  = 1 / var_synth
    τ_lit    = 1 / var_lit        # already includes transportability inflation
    τ_blend  = τ_synth + τ_lit
    μ_blend  = (μ_synth * τ_synth + μ_lit * τ_lit) / τ_blend
    var_blend = 1 / τ_blend

The blend is strictly a tightening: `var_blend <= min(var_synth, var_lit)`.
Output is a new TotalEffectPrior with:
  - mean / variance / inflated_std replaced
  - n replaced with (n_synth + n_lit)         # conservative pooled n
  - raw_std kept from synthetic (for diagnostics)
  - floor fields from synthetic
  - p10/p50/p90 left as synthetic (not recomputed)

Provenance is tracked by the caller — typically tagged as
"synthetic+literature" when the blended prior flows through.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Optional

from .total_effect_priors import TotalEffectPrior
from .literature_priors import LiteraturePrior


def blend(
    synthetic: TotalEffectPrior,
    literature: LiteraturePrior,
) -> TotalEffectPrior:
    """Precision-weighted Gaussian pool of one synthetic + one literature prior.

    Raises ValueError if the keys don't match — catches accidental
    mis-pairing at the call site.
    """
    _check_compatible(synthetic, literature)

    # Guard against zero variance from either side. In practice both
    # priors are inflated, but belt-and-braces.
    var_s = max(synthetic.variance, 1e-12)
    var_l = max(literature.variance, 1e-12)

    tau_s = 1.0 / var_s
    tau_l = 1.0 / var_l
    tau_blend = tau_s + tau_l

    mu_blend = (synthetic.mean * tau_s + literature.mean * tau_l) / tau_blend
    var_blend = 1.0 / tau_blend

    return replace(
        synthetic,
        mean=mu_blend,
        variance=var_blend,
        inflated_std=var_blend ** 0.5,
        n=synthetic.n + literature.n,
    )


def blend_all(
    synthetic_priors: dict[tuple[str, str, str], TotalEffectPrior],
    literature_priors: dict[tuple[str, str, str], LiteraturePrior],
) -> tuple[dict[tuple[str, str, str], TotalEffectPrior], list[tuple[str, str, str]]]:
    """Blend every synthetic prior that has a matching literature prior.

    Returns
    -------
    blended : dict
        Full prior set — synthetic entries replaced with blended versions
        wherever a literature entry was available, untouched otherwise.
    touched : list
        Keys that were blended (for logging / diagnostics).
    """
    blended: dict[tuple[str, str, str], TotalEffectPrior] = dict(synthetic_priors)
    touched: list[tuple[str, str, str]] = []

    for key, lit in literature_priors.items():
        synth = synthetic_priors.get(key)
        if synth is None:
            # Literature has an edge the engine didn't fit — skip rather
            # than synthesize a fake synthetic half. A future option is
            # to promote the literature prior directly as the sole prior,
            # but that changes semantics — leave it explicit.
            continue
        blended[key] = blend(synth, lit)
        touched.append(key)

    return blended, sorted(touched)


def describe_blend(
    synthetic: TotalEffectPrior,
    literature: LiteraturePrior,
    blended: Optional[TotalEffectPrior] = None,
) -> str:
    """Debug string showing the three priors side-by-side."""
    b = blended if blended is not None else blend(synthetic, literature)
    return (
        f"({synthetic.cohort}, {synthetic.action}, {synthetic.outcome})\n"
        f"  synthetic:  b={synthetic.mean:+.4f}  SD={synthetic.inflated_std:.4f}  n={synthetic.n}\n"
        f"  literature: b={literature.mean:+.4f}  SD={literature.inflated_std:.4f}  n={literature.n}"
        f"  [{literature.source} {literature.year}]\n"
        f"  blended:    b={b.mean:+.4f}  SD={b.inflated_std:.4f}  n={b.n}\n"
        f"  SD reduction vs synthetic: "
        f"{(1 - b.inflated_std / max(synthetic.inflated_std, 1e-12)) * 100:.1f}%"
    )


def _check_compatible(s: TotalEffectPrior, l: LiteraturePrior) -> None:
    if (s.cohort, s.action, s.outcome) != (l.cohort, l.action, l.outcome):
        raise ValueError(
            f"blend key mismatch: synthetic=({s.cohort}, {s.action}, {s.outcome}) "
            f"literature=({l.cohort}, {l.action}, {l.outcome})"
        )


if __name__ == "__main__":
    # Quick demo: build a toy synthetic prior, blend against the loaded
    # literature set, print a side-by-side.
    from .literature_priors import load_literature_priors

    lit = load_literature_priors(include_drafts=True)
    if not lit:
        print("(no literature priors to demo)")
        raise SystemExit(0)

    # Fabricate a synthetic prior for the first literature key.
    key, l = next(iter(lit.items()))
    synth = TotalEffectPrior(
        cohort=key[0], action=key[1], outcome=key[2],
        mean=l.mean * 0.7,              # engine estimate a bit off
        variance=(l.raw_se * 4.0) ** 2, # engine CI wider than literature
        raw_std=l.raw_se * 4.0,
        inflated_std=l.raw_se * 4.0,
        n=1188,
        p10=l.mean - l.raw_se, p50=l.mean, p90=l.mean + l.raw_se,
        nominal_step=1.0,
        floor_mode="absolute",
    )
    print(describe_blend(synth, l))
