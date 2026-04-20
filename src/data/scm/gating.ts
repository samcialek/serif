/**
 * v2.5 certainty gating for SCM-derived recommendations.
 *
 * Formula:
 *
 *   se = |effect| / sqrt(effN)
 *
 *   P_meaningful = Φ((|effect| - min_detectable) / se)    if beneficial
 *                = 0                                      otherwise
 *
 *   theta_margin       = |user_dose - theta| / theta_CI_width
 *   position_confidence = Φ(theta_margin)
 *     # 0.5 at the changepoint; approaches 1 as the user moves away
 *
 *   gate = P_meaningful * position_confidence
 *
 * Exposure tiers:
 *   > 0.8         Recommended
 *   0.5–0.8       Possible (show with caveats)
 *   ≤ 0.5         Not exposed
 *
 * Literature-anchored edges with no personal data get their position term
 * suppressed — a fitted theta_CI on an edge hand-parameterized from sports-
 * science literature (round coefficients, effN≈2–4) is not a meaningful
 * position-confidence input. See `serif_engine_lessons.md` #10.
 *
 * Regime aggregates skip the theta_margin term entirely: a sigmoid gate
 * doesn't have a linear-regression changepoint whose CI is interpretable.
 * The regime's clinical relevance is captured via min_detectable and effN.
 *
 * This is a formal approximation of what posterior-based gating does
 * in v3-hierarchical (P(|effect| > meaningful AND beneficial) > 0.8).
 * Replace when MCMC samples are available. See engine lesson #14 — the
 * delta-method approximation here is directionally correct but not a
 * replacement for posterior propagation.
 */

import { getThreshold, type Direction } from '../dataValue/clinicalThresholds'

// ─── Public types ───────────────────────────────────────────────

export interface GatingInput {
  /** Counterfactual delta (temporal-scaled, same units as outcome). */
  effect: number
  /** Outcome node ID — used to look up direction + min_detectable. */
  outcome: string
  /** Bottleneck effective sample size along the causal path. */
  effN: number
  /** 'literature' or 'fitted'. See EdgeResult.provenance. */
  provenance: 'literature' | 'fitted'
  /** Weight of personal vs population data for this edge (0 = cohort-only). */
  personalPct: number
  /**
   * User's current operating dose on the treatment axis. Required unless
   * isRegimeAggregate is true. When omitted for non-regime inputs,
   * position_confidence defaults to 0.5 (uninformative).
   */
  userDose?: number
  /** Fitted changepoint (theta). Ignored for regime aggregates. */
  theta?: number
  /** Width of the 95% CI on theta (high - low). Ignored for regime aggregates. */
  thetaCiWidth?: number
  /**
   * True for PathwayEffect entries with isRegimeAggregate=true. Position
   * confidence is forced to 1.0 because a sigmoid regime gate doesn't
   * share the linear changepoint geometry.
   */
  isRegimeAggregate?: boolean
  /**
   * Tier preset used to assign recommended/possible/not_exposed from the
   * raw score. Default is DEFAULT_PRESET ('default' → 0.6/0.4). The raw
   * score is preset-independent; only the tier assignment varies.
   */
  preset?: GatePreset
}

export interface GatingBreakdown {
  se: number
  thetaMargin: number
  direction: Direction
  minDetectable: number
  /** True if effect moves outcome in the desirable direction. */
  beneficial: boolean
  /** True if literature-anchored + insufficient personal data suppression fired. */
  literatureSuppressed: boolean
}

export type ExposureTier = 'recommended' | 'possible' | 'not_exposed'

export interface GatingOutput {
  /** gate = P_meaningful * position_confidence, in [0, 1]. */
  score: number
  /** Exposure tier derived from score. */
  tier: ExposureTier
  /** P_meaningful_benefit term. */
  pMeaningful: number
  /** position_confidence term. */
  positionConfidence: number
  breakdown: GatingBreakdown
}

// ─── Constants ──────────────────────────────────────────────────

/** Below this personal_pct, a literature-anchored edge has its position
 *  term hard-suppressed to 0.1 (≈ 15-th percentile). */
export const LITERATURE_PERSONAL_PCT_THRESHOLD = 0.2
export const LITERATURE_SUPPRESSED_POSITION = 0.1

/**
 * Gate threshold presets. Both `recommended` and `possible` tiers are
 * surfaced to the user ("exposed"); `possible` carries hedging UI.
 *
 *   strict:     original 0.8/0.5 calibration (pre-2026-04-17)
 *   default:    product default as of 2026-04-17 — targets ~36 recs/participant
 *               over days 7-80 via the scheduler layer
 *   permissive: slider-low-end, for exploratory browsing
 *
 * Literature-suppressed edges cap at score ≤ 0.1 so they never expose under
 * any preset (position_confidence is hard-set to 0.1 in that branch).
 */
export type GatePreset = 'strict' | 'default' | 'permissive'

export interface TierBoundaries {
  recommended: number
  possible: number
}

export const PRESET_BOUNDARIES: Record<GatePreset, TierBoundaries> = {
  strict:     { recommended: 0.8, possible: 0.5 },
  default:    { recommended: 0.6, possible: 0.4 },
  permissive: { recommended: 0.4, possible: 0.2 },
}

export const DEFAULT_PRESET: GatePreset = 'default'

// Back-compat constants resolve to the default preset's boundaries.
export const TIER_RECOMMENDED = PRESET_BOUNDARIES.default.recommended
export const TIER_POSSIBLE = PRESET_BOUNDARIES.default.possible

const DEFAULT_POSITION_WHEN_UNKNOWN = 0.5
const MIN_SE = 1e-6

// ─── Φ (standard normal CDF) ────────────────────────────────────

/**
 * Abramowitz & Stegun 26.2.17 approximation. Accuracy ~1e-7 — plenty for
 * recommendation gating. Symmetric: cdf(-z) = 1 - cdf(z).
 */
export function normalCdf(z: number): number {
  const a1 =  0.254829592
  const a2 = -0.284496736
  const a3 =  1.421413741
  const a4 = -1.453152027
  const a5 =  1.061405429
  const p  =  0.3275911
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + p * x)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1 + sign * y)
}

// ─── Core ───────────────────────────────────────────────────────

export function computeGatingScore(input: GatingInput): GatingOutput {
  const threshold = getThreshold(input.outcome)
  const direction: Direction = threshold?.direction ?? 'higher'
  const minDetectable = threshold?.minDetectable ?? 0

  const beneficial = direction === 'lower' ? input.effect < 0 : input.effect > 0
  const absEffect = Math.abs(input.effect)
  const safeEffN = Math.max(input.effN, 1)
  const se = Math.max(absEffect / Math.sqrt(safeEffN), MIN_SE)

  // P_meaningful — probability the beneficial effect exceeds the MCID.
  const pMeaningful = beneficial ? normalCdf((absEffect - minDetectable) / se) : 0

  // position_confidence — are we far enough from the changepoint to know
  // which slope applies? Forced to 1 for regime aggregates (sigmoid geometry).
  let positionConfidence: number
  let thetaMargin = 0
  let literatureSuppressed = false

  if (input.isRegimeAggregate) {
    positionConfidence = 1.0
  } else if (input.provenance === 'literature' &&
             input.personalPct < LITERATURE_PERSONAL_PCT_THRESHOLD) {
    // Engine lesson #10: literature-anchored theta_CI isn't a real fit.
    // Suppress the position term until personal data accumulates.
    positionConfidence = LITERATURE_SUPPRESSED_POSITION
    literatureSuppressed = true
  } else if (input.userDose === undefined ||
             input.theta === undefined ||
             input.thetaCiWidth === undefined ||
             input.thetaCiWidth <= 0) {
    positionConfidence = DEFAULT_POSITION_WHEN_UNKNOWN
  } else {
    thetaMargin = Math.abs(input.userDose - input.theta) / input.thetaCiWidth
    positionConfidence = normalCdf(thetaMargin)
  }

  const score = pMeaningful * positionConfidence
  const preset = input.preset ?? DEFAULT_PRESET
  const tier = tierFromScore(score, preset)

  return {
    score,
    tier,
    pMeaningful,
    positionConfidence,
    breakdown: {
      se,
      thetaMargin,
      direction,
      minDetectable,
      beneficial,
      literatureSuppressed,
    },
  }
}

/**
 * Classify an already-computed gate score into a tier, under the specified
 * preset. Defaults to DEFAULT_PRESET. The raw score is preset-independent,
 * so the frontend can re-tier without regenerating the export.
 */
export function tierFromScore(
  score: number,
  preset: GatePreset = DEFAULT_PRESET,
): ExposureTier {
  const b = PRESET_BOUNDARIES[preset]
  if (score > b.recommended) return 'recommended'
  if (score > b.possible) return 'possible'
  return 'not_exposed'
}

/**
 * True for both 'recommended' and 'possible' tiers — the two surfaces the
 * user sees. 'possible' shows with hedging UI.
 */
export function isExposed(tier: ExposureTier): boolean {
  return tier === 'recommended' || tier === 'possible'
}
