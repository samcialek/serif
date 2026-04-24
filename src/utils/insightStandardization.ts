/**
 * Insight standardization helpers — turn each Bayesian edge into
 * comparable, intelligible numbers for the Insights v2 surface.
 *
 * The engine emits per-edge `posterior.mean` in *outcome units per
 * nominal action step*. To put effects on a comparable axis across
 * outcomes (HRV ms vs cortisol µg/dL) we standardize to Cohen's d:
 *
 *   d  =  (slope per native action unit)  ×  SD(action)  ÷  SD(outcome)
 *
 * Where slope per native unit = posterior.mean / nominal_step.
 *
 * Action SDs come from `participant.behavioral_sds` (per-participant
 * day-to-day SD). Outcome SDs come from a frontend constant table
 * mirrored from backend BIOMARKER_PRIORS / WEARABLE_PRIORS — these
 * are cohort-level marginal SDs, deliberately not personal SDs, so
 * Cohen's d expresses "what fraction of a typical-cohort outcome SD
 * does a 1-cohort-action-SD move buy?" That's the comparable quantity.
 */

import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import type { SyntheticShape } from '@/data/scm/syntheticEdges'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'

/** Cohort-marginal outcome SD (units below). Mirrored from
 * backend/serif_scm/synthetic/config.py BIOMARKER_PRIORS + WEARABLE_PRIORS.
 * Update when those tables change. */
export const OUTCOME_SD: Record<string, number> = {
  // Wearable
  hrv_daily: 15,
  resting_hr: 7,
  sleep_efficiency: 5,
  sleep_quality: 12,
  deep_sleep: 20,
  // Iron / hematology
  ferritin: 35,
  iron_total: 30,
  hemoglobin: 1.2,
  rbc: 0.4,
  mcv: 5,
  rdw: 1.0,
  wbc: 1.5,
  platelets: 50,
  nlr: 0.6,
  // Hormones
  testosterone: 150,
  cortisol: 4,
  estradiol: 15,
  dhea_s: 100,
  shbg: 15,
  // Lipids
  triglycerides: 50,
  hdl: 14,
  ldl: 30,
  total_cholesterol: 35,
  non_hdl_cholesterol: 30,
  apob: 25,
  // Inflammation
  hscrp: 1.5,
  // Metabolic
  glucose: 12,
  insulin: 4,
  hba1c: 0.4,
  uric_acid: 1.5,
  // Micronutrients
  zinc: 15,
  magnesium_rbc: 0.8,
  homocysteine: 3,
  omega3_index: 1.5,
  b12: 200,
  folate: 5,
  // Liver / kidney
  ast: 8,
  alt: 8,
  creatinine: 0.2,
  albumin: 0.3,
  // Fitness / body comp
  vo2_peak: 10,
  body_fat_pct: 6,
  body_mass_kg: 12,
}

/** Cohort-marginal SD for actions where participant.behavioral_sds is
 * unavailable (some derived/load actions). Best-effort fallbacks. */
const FALLBACK_ACTION_SD: Record<string, number> = {
  bedtime: 0.6, // hours
  sleep_duration: 0.8, // hours
  running_volume: 6, // km/day
  steps: 3500, // steps/day
  training_load: 50, // TRIMP/day
  active_energy: 400, // kcal/day
  zone2_volume: 4, // km/day
  training_volume: 0.5, // hours/day
  dietary_protein: 30, // g/day
  dietary_energy: 400, // kcal/day
  acwr: 0.2,
  sleep_debt: 2,
  travel_load: 0.5,
}

/** SD of an action in the user's own behavioral data. Falls back to a
 * cohort-typical SD when the user's behavioral_sds doesn't carry it. */
export function actionSD(
  action: string,
  participant: ParticipantPortal,
): number {
  const personal = participant.behavioral_sds?.[action]
  if (personal != null && personal > 1e-6) return personal
  return FALLBACK_ACTION_SD[action] ?? 1
}

/** SD of an outcome at the cohort level. */
export function outcomeSD(outcome: string): number {
  return OUTCOME_SD[outcome] ?? 1
}

/** Slope per ONE NATIVE UNIT of action — global average, not local.
 * Engine emits posterior.mean scaled per `nominal_step`; divide to
 * per-1-unit. Use slopeAtBaseline() for the local-tangent slope which
 * respects shape (saturating, inverted-U, etc.) — that's the right
 * slope for Cohen's d at the user's operating point. */
export function slopePerNativeUnit(edge: InsightBayesian): number {
  if (!edge.nominal_step || Math.abs(edge.nominal_step) < 1e-12) return 0
  return edge.posterior.mean / edge.nominal_step
}

const SHAPE_BY_EDGE = new Map<string, SyntheticShape | null>()
function lookupShape(action: string, outcome: string): SyntheticShape | null {
  const key = `${action}::${outcome}`
  if (SHAPE_BY_EDGE.has(key)) return SHAPE_BY_EDGE.get(key) ?? null
  const spec = PHASE_1_EDGES.find(
    (e) => e.action === action && e.outcome === outcome,
  )
  const shape = spec?.shape ?? null
  SHAPE_BY_EDGE.set(key, shape)
  return shape
}

function evaluateShape(shape: SyntheticShape, dose: number): number {
  switch (shape.kind) {
    case 'linear':
      return shape.slope * dose
    case 'saturating': {
      if (dose <= shape.knee) return shape.slope * dose
      const after = shape.slopeAfter ?? 0
      return shape.slope * shape.knee + after * (dose - shape.knee)
    }
    case 'smooth_saturating':
      if (dose <= 0) return 0
      return shape.asymptote * (1 - Math.pow(2, -dose / shape.halfDose))
    case 'inverted_u': {
      if (dose <= shape.peak) return shape.slopeUp * dose
      return shape.slopeUp * shape.peak + shape.slopeDown * (dose - shape.peak)
    }
  }
}

/** Local tangent slope at the user's current operating point — i.e., the
 * derivative of the response curve at x = current_value. This is the
 * slope the user actually experiences from a marginal change. Uses the
 * registered SyntheticShape numerically when available; falls back to
 * the engine's posterior.mean/nominal_step (which is a global linear
 * approximation, not local). */
export function slopeAtBaseline(
  edge: InsightBayesian,
  participant: ParticipantPortal,
): number {
  const shape = lookupShape(edge.action, edge.outcome)
  const x0 = participant.current_values?.[edge.action]
  if (shape && x0 != null) {
    const sd = participant.behavioral_sds?.[edge.action] ?? 1
    const h = Math.max(Math.abs(sd) * 0.05, 1e-3)
    return (evaluateShape(shape, x0 + h) - evaluateShape(shape, x0 - h)) / (2 * h)
  }
  return slopePerNativeUnit(edge)
}

/** Standardized effect (Cohen's d, unitless) at the user's current
 * operating point: how many cohort-outcome SDs does a 1-action-SD move
 * buy at this user's baseline? Uses the local tangent slope (respects
 * curve shape — saturation, plateaus, inverted-U) rather than the
 * global slope. */
export function cohensD(
  edge: InsightBayesian,
  participant: ParticipantPortal,
): number {
  const slope = slopeAtBaseline(edge, participant)
  const sda = actionSD(edge.action, participant)
  const sdo = outcomeSD(edge.outcome)
  if (sdo < 1e-12) return 0
  return (slope * sda) / sdo
}

/** Magnitude bands per Cohen (1988):
 *   trivial  < 0.2
 *   small    0.2 – 0.5
 *   medium   0.5 – 0.8
 *   large    > 0.8 */
export type EffectBand = 'trivial' | 'small' | 'medium' | 'large'

export function effectBand(d: number): EffectBand {
  const abs = Math.abs(d)
  if (abs < 0.2) return 'trivial'
  if (abs < 0.5) return 'small'
  if (abs < 0.8) return 'medium'
  return 'large'
}

export const EFFECT_BAND_LABEL: Record<EffectBand, string> = {
  trivial: 'trivial',
  small: 'small',
  medium: 'medium',
  large: 'large',
}

/** Predicted change in the outcome from a +1 action-step intervention.
 * Native units, signed. Used for the "+30 min sleep ⇒ +4 min deep
 * sleep" supporting line. */
export function predictedNativeEffectAtStep(edge: InsightBayesian): number {
  return edge.posterior.mean
}

/** Beneficial-direction sign for an outcome — does increasing the
 * outcome help (e.g., HRV, deep sleep) or hurt (e.g., cortisol,
 * glucose, hsCRP)? Returns +1 if higher is better, −1 if lower. */
export function beneficialSign(outcome: string): number {
  const lowerIsBetter = new Set([
    'cortisol',
    'glucose',
    'insulin',
    'hba1c',
    'hscrp',
    'resting_hr',
    'apob',
    'ldl',
    'non_hdl_cholesterol',
    'total_cholesterol',
    'triglycerides',
    'sleep_debt_14d',
    'body_fat_pct',
  ])
  return lowerIsBetter.has(outcome) ? -1 : 1
}

/** True when the edge moves the outcome in the user-beneficial direction. */
export function isBeneficial(edge: InsightBayesian): boolean {
  return Math.sign(edge.posterior.mean) === beneficialSign(edge.outcome)
}
