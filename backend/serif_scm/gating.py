"""v2.5 certainty gating for SCM-derived recommendations.

Python port of src/data/scm/gating.ts. Kept byte-for-byte equivalent with the
TypeScript version (same formulas, same constants, same tier boundaries) so
that exports produced here round-trip through the frontend without surprise.

Formula:

    se = |effect| / sqrt(effN)

    P_meaningful = Phi((|effect| - min_detectable) / se)    if beneficial
                 = 0                                        otherwise

    theta_margin        = |user_dose - theta| / theta_CI_width
    position_confidence = Phi(theta_margin)
    gate                = P_meaningful * position_confidence

Exposure tiers:
    > 0.8      Recommended
    0.5-0.8    Possible (show with caveats)
    <= 0.5     Not exposed

Special cases:
  - Literature-anchored edges with personal_pct < 0.2 get their position
    term hard-suppressed to 0.1 (engine lesson #10).
  - Regime aggregates force position_confidence = 1.0 (sigmoid regime gates
    don't share the linear-changepoint geometry).

See `src/data/scm/gating.ts` for the canonical documentation.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

from .clinical_thresholds import get as get_threshold


# ── Constants ───────────────────────────────────────────────────

LITERATURE_PERSONAL_PCT_THRESHOLD = 0.2
LITERATURE_SUPPRESSED_POSITION = 0.1


# Gate threshold presets. Both `recommended` and `possible` tiers are
# surfaced to the user ("exposed"); `possible` carries hedging UI.
#   strict:     original 0.8/0.5 calibration (pre-2026-04-17)
#   default:    product default as of 2026-04-17 — targets ~36 recs/participant
#               over days 7-80 via the scheduler layer
#   permissive: slider-low-end, for exploratory browsing
# Literature-suppressed edges cap at score <= 0.1 so they never expose under
# any preset (position_confidence is hard-set to 0.1 in that branch).

GatePreset = Literal["strict", "default", "permissive"]

PRESET_BOUNDARIES: dict[str, dict[str, float]] = {
    "strict":     {"recommended": 0.8, "possible": 0.5},
    "default":    {"recommended": 0.6, "possible": 0.4},
    "permissive": {"recommended": 0.4, "possible": 0.2},
}

DEFAULT_PRESET: GatePreset = "default"

# Back-compat constants resolve to the default preset's boundaries.
TIER_RECOMMENDED = PRESET_BOUNDARIES["default"]["recommended"]
TIER_POSSIBLE = PRESET_BOUNDARIES["default"]["possible"]

_DEFAULT_POSITION_WHEN_UNKNOWN = 0.5
_MIN_SE = 1e-6


Provenance = Literal["literature", "fitted"]
ExposureTier = Literal["recommended", "possible", "not_exposed"]
Direction = Literal["higher", "lower"]


# ── Phi (standard normal CDF) ───────────────────────────────────

def normal_cdf(z: float) -> float:
    """Abramowitz & Stegun 26.2.17 approximation. Accuracy ~1e-7."""
    a1 =  0.254829592
    a2 = -0.284496736
    a3 =  1.421413741
    a4 = -1.453152027
    a5 =  1.061405429
    p  =  0.3275911
    sign = -1 if z < 0 else 1
    x = abs(z) / math.sqrt(2.0)
    t = 1.0 / (1.0 + p * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)
    return 0.5 * (1.0 + sign * y)


# ── Types ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class GatingInput:
    effect: float
    outcome: str
    eff_n: float
    provenance: Provenance
    personal_pct: float
    user_dose: Optional[float] = None
    theta: Optional[float] = None
    theta_ci_width: Optional[float] = None
    is_regime_aggregate: bool = False
    # Tier preset ('strict' | 'default' | 'permissive'). The raw score is
    # preset-independent; only the tier label changes. Defaults to DEFAULT_PRESET.
    preset: GatePreset = DEFAULT_PRESET


@dataclass(frozen=True)
class GatingBreakdown:
    se: float
    theta_margin: float
    direction: Direction
    min_detectable: float
    beneficial: bool
    literature_suppressed: bool


@dataclass(frozen=True)
class GatingOutput:
    score: float
    tier: ExposureTier
    p_meaningful: float
    position_confidence: float
    breakdown: GatingBreakdown


# ── Core ────────────────────────────────────────────────────────

def compute_gating_score(inp: GatingInput) -> GatingOutput:
    threshold = get_threshold(inp.outcome)
    direction: Direction = threshold.direction if threshold is not None else "higher"
    min_detectable = threshold.min_detectable if threshold is not None else 0.0

    beneficial = inp.effect < 0 if direction == "lower" else inp.effect > 0
    abs_effect = abs(inp.effect)
    safe_eff_n = max(inp.eff_n, 1.0)
    se = max(abs_effect / math.sqrt(safe_eff_n), _MIN_SE)

    p_meaningful = normal_cdf((abs_effect - min_detectable) / se) if beneficial else 0.0

    theta_margin = 0.0
    literature_suppressed = False
    if inp.is_regime_aggregate:
        position_confidence = 1.0
    elif (inp.provenance == "literature"
          and inp.personal_pct < LITERATURE_PERSONAL_PCT_THRESHOLD):
        position_confidence = LITERATURE_SUPPRESSED_POSITION
        literature_suppressed = True
    elif (inp.user_dose is None or inp.theta is None
          or inp.theta_ci_width is None or inp.theta_ci_width <= 0):
        position_confidence = _DEFAULT_POSITION_WHEN_UNKNOWN
    else:
        theta_margin = abs(inp.user_dose - inp.theta) / inp.theta_ci_width
        position_confidence = normal_cdf(theta_margin)

    score = p_meaningful * position_confidence
    tier: ExposureTier = tier_from_score(score, inp.preset)

    return GatingOutput(
        score=score,
        tier=tier,
        p_meaningful=p_meaningful,
        position_confidence=position_confidence,
        breakdown=GatingBreakdown(
            se=se,
            theta_margin=theta_margin,
            direction=direction,
            min_detectable=min_detectable,
            beneficial=beneficial,
            literature_suppressed=literature_suppressed,
        ),
    )


def tier_from_score(score: float, preset: GatePreset = DEFAULT_PRESET) -> ExposureTier:
    """Tier assignment for a given preset. Raw score is preset-independent."""
    b = PRESET_BOUNDARIES[preset]
    if score > b["recommended"]:
        return "recommended"
    if score > b["possible"]:
        return "possible"
    return "not_exposed"


def is_exposed(tier: ExposureTier) -> bool:
    """True for both 'recommended' and 'possible'. 'possible' shows with hedging."""
    return tier in ("recommended", "possible")


# ── Helpers ─────────────────────────────────────────────────────

def parse_theta_ci(raw: Optional[str | list[float]]) -> Optional[float]:
    """Parse theta_ci string like '[132.37, 174.05]' into a width (high - low).

    Returns None if input is missing/malformed or the width is non-positive.
    Accepts already-parsed [low, high] lists as well.
    """
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)) and len(raw) == 2:
        low, high = float(raw[0]), float(raw[1])
        w = high - low
        return w if w > 0 else None
    if isinstance(raw, str):
        s = raw.strip().lstrip("[").rstrip("]")
        parts = [p.strip() for p in s.split(",")]
        if len(parts) != 2:
            return None
        try:
            low, high = float(parts[0]), float(parts[1])
        except ValueError:
            return None
        w = high - low
        return w if w > 0 else None
    return None
