/**
 * Dose-response shape classification per insight.
 *
 * Semantic convention: the curve plots *benefit vs dose*, not raw outcome.
 *   - plateau_up   → doing more of the action moves the outcome in its
 *                    beneficial direction, with diminishing returns
 *   - plateau_down → doing more of the action moves the outcome *against*
 *                    its beneficial direction (the recommendation is less)
 *   - inverted_u   → genuine biological sweet spot; peak is optimal
 *   - threshold    → fine below a cliff, then falls off (rarely used)
 *
 * Under this semantic, target dot always sits on the up-slope side of the
 * curve: right of current for plateau_up, left for plateau_down, toward
 * the peak for inverted_u.
 *
 * Shape is derived from (action, outcome, sign of the measured slope,
 * beneficial-direction of the outcome). Sparse per-user data can't
 * identify curvature, so curvature (plateau vs U) comes from a narrow
 * mechanism allowlist; slope *direction* comes from the engine-estimated
 * posterior on this participant.
 */

export type DoseShape = 'plateau_up' | 'plateau_down' | 'inverted_u' | 'threshold'

export type BeneficialDir = 'higher' | 'lower' | 'neutral'

export interface ShapeInfo {
  shape: DoseShape
  /** Human-readable name of the useful edge. */
  edgeLabel: string
  /** Short explanation for tooltips. */
  description: string
}

// Mechanism-prior shape overrides. Sparse per-user data can't identify
// curvature, and for many edges the measured slope sign is dominated by
// confounder bias (e.g. Oron's running→VO2 reads negative because iron
// depletion masks the aerobic adaptation). Biology wins over the sign.
//
// Keyed by action → outcome → shape. Use the literal '*' to apply one
// shape to all outcomes under that action.
const SHAPE_OVERRIDE: Record<string, Record<string, DoseShape>> = {
  // Clock-time bedtime: too early and too late both misalign circadian
  // phase / fragment sleep — canonical sweet spot.
  bedtime: { '*': 'inverted_u' },

  // Aerobic conditioning — monotonic-up with diminishing returns. At
  // extreme volumes autonomic/sleep markers flip into overtraining.
  running_volume: {
    vo2_peak: 'plateau_up',
    hrv_daily: 'inverted_u',
    resting_hr: 'inverted_u',
  },
  zone2_volume: {
    vo2_peak: 'plateau_up',
  },
  training_volume: {
    vo2_peak: 'plateau_up',
    hdl: 'plateau_up',
    // Overtraining sweet spot — too little under-stresses, too much
    // suppresses HPA/HPG axis.
    testosterone: 'inverted_u',
    cortisol: 'inverted_u',
    dhea_s: 'inverted_u',
    hrv_daily: 'inverted_u',
    deep_sleep: 'inverted_u',
    sleep_quality: 'inverted_u',
    sleep_efficiency: 'inverted_u',
  },
  training_load: {
    hrv_daily: 'inverted_u',
    resting_hr: 'inverted_u',
    testosterone: 'inverted_u',
    cortisol: 'inverted_u',
    deep_sleep: 'inverted_u',
    sleep_quality: 'inverted_u',
    sleep_efficiency: 'inverted_u',
  },

  // Sleep duration: too little or too much cortisol is bad.
  sleep_duration: {
    cortisol: 'inverted_u',
  },
}

const PLATEAU_UP: ShapeInfo = {
  shape: 'plateau_up',
  edgeLabel: 'Diminishing returns',
  description:
    'More of the action improves the outcome up to a knee, then flattens. Recommendation targets the knee — past it, additional dose adds little.',
}

const PLATEAU_DOWN: ShapeInfo = {
  shape: 'plateau_down',
  edgeLabel: 'Counterproductive',
  description:
    'More of the action moves the outcome against its beneficial direction. Recommendation is to reduce — the curve flattens as you pull back.',
}

const INVERTED_U_INFO: ShapeInfo = {
  shape: 'inverted_u',
  edgeLabel: 'Optimal window',
  description:
    'Too little and too much both hurt. Recommendation targets the peak of the window.',
}

const SHAPE_INFO: Record<DoseShape, ShapeInfo> = {
  plateau_up: PLATEAU_UP,
  plateau_down: PLATEAU_DOWN,
  inverted_u: INVERTED_U_INFO,
  threshold: {
    shape: 'threshold',
    edgeLabel: 'Safe zone',
    description:
      'Fine below a cliff, then falls off sharply. Recommendation targets just under the threshold.',
  },
}

function lookupOverride(action: string, outcome: string): DoseShape | null {
  const byAction = SHAPE_OVERRIDE[action]
  if (!byAction) return null
  return byAction[outcome] ?? byAction['*'] ?? null
}

/**
 * Choose a dose-response shape for a single insight. `scaledEffect` is the
 * engine's measured per-participant slope (signed); `beneficial` is whether
 * higher outcome values are clinically better. When `beneficial` is
 * unknown/neutral, the raw slope sign is used.
 */
export function shapeFor(
  action: string,
  outcome: string = '',
  scaledEffect: number = 0,
  beneficial: BeneficialDir = 'neutral',
): ShapeInfo {
  const override = lookupOverride(action, outcome)
  if (override) return SHAPE_INFO[override]

  // "Improves with dose" = moving dose upward pushes the outcome toward
  // its beneficial side. XOR of slope sign and beneficial direction.
  const slopePositive = scaledEffect >= 0
  const improvesWithDose =
    beneficial === 'lower' ? !slopePositive : slopePositive
  return improvesWithDose ? PLATEAU_UP : PLATEAU_DOWN
}
