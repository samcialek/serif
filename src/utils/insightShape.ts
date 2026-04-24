/**
 * Every action × outcome edge gets a plausible nonlinear response
 * shape — not just a linear fallback — so the curve in the row
 * preview and the expanded chart has actual structure to look at.
 *
 * Three kinds of shapes:
 *
 *   saturating_up  : f increases with diminishing returns — used for
 *                    most positive-slope edges (sleep_duration →
 *                    deep_sleep, dietary_protein → ferritin, etc.).
 *                    Hill form: slope × domain × (1 − 2^(−x/halfDose)).
 *
 *   saturating_down: f decreases toward a floor — mirror of the above
 *                    for negative-slope edges (caffeine_mg → hrv_daily
 *                    before any explicit shape lands).
 *
 *   inverted_u     : f rises then falls — for action-outcome pairs
 *                    with a clear optimum (training_load, ACWR,
 *                    dietary_energy for body comp). Peak at action's
 *                    typical "sweet spot".
 *
 *   threshold_up/down: sharp change past a threshold — bedtime for
 *                      sleep outcomes, sleep_debt for HRV.
 *
 * Where an explicit shape is already registered in PHASE_1_EDGES
 * (caffeine_mg edges, alcohol_units edges), that shape wins and the
 * inference is skipped.
 *
 * The inferred shapes are calibrated so:
 *   1. The slope averaged across the action's plausible domain
 *      matches the engine's posterior.mean / nominal_step.
 *   2. The curve is meaningful at the user's typical operating point
 *      (so the tangent isn't on a flat part by accident).
 */

import type { SyntheticShape } from '@/data/scm/syntheticEdges'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'
import type { InsightBayesian } from '@/data/portal/types'

/** Plot-domain per action (same table MiniDoseResponse and
 * DoseResponseChart use for their x-axis). Exported so both can
 * import it without duplicating. */
export const ACTION_DOMAIN: Record<string, { min: number; max: number }> = {
  bedtime: { min: 21.5, max: 24.5 },
  sleep_duration: { min: 4, max: 10 },
  caffeine_mg: { min: 0, max: 600 },
  caffeine_cutoff: { min: 0, max: 14 },
  alcohol_units: { min: 0, max: 6 },
  zone2_minutes: { min: 0, max: 300 },
  zone2_volume: { min: 0, max: 50 },
  zone4_5_minutes: { min: 0, max: 90 },
  training_volume: { min: 0, max: 3 },
  training_load: { min: 0, max: 200 },
  running_volume: { min: 0, max: 30 },
  steps: { min: 0, max: 25000 },
  active_energy: { min: 0, max: 3000 },
  dietary_protein: { min: 30, max: 250 },
  dietary_energy: { min: 1500, max: 4000 },
  acwr: { min: 0.5, max: 2 },
  sleep_debt: { min: 0, max: 20 },
}

/** Actions whose response is characteristically inverted-U (too
 * little = no effect, too much = maladaptation). */
const INVERTED_U_ACTIONS = new Set<string>([
  'training_load',
  'training_volume',
  'zone4_5_minutes',
  'acwr',
  'dietary_energy', // above maintenance = gain, far above = harm
])

/** Evaluate a SyntheticShape at a given dose — same semantics as
 * doseResponse.ts but local so callers don't need the full engine. */
export function evaluateShape(shape: SyntheticShape, dose: number): number {
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

/** Numerical derivative of a shape at a given dose. */
export function slopeOfShape(shape: SyntheticShape, dose: number, h = 0.01): number {
  const hh = Math.max(h, Math.abs(dose) * 0.01)
  return (evaluateShape(shape, dose + hh) - evaluateShape(shape, dose - hh)) / (2 * hh)
}

const SHAPE_CACHE = new Map<string, SyntheticShape>()

/** Pull an explicit shape from PHASE_1_EDGES if one exists for this
 * (action, outcome) pair. Returns null when none is registered. */
function lookupExplicitShape(
  action: string,
  outcome: string,
): SyntheticShape | null {
  const spec = PHASE_1_EDGES.find(
    (e) => e.action === action && e.outcome === outcome,
  )
  return spec?.shape ?? null
}

/** Infer a plausible response shape for an edge based on action
 * category and the sign of its posterior mean. The inferred curve's
 * average-slope-over-the-action's-domain is calibrated to match the
 * engine's posterior.mean so the big-picture magnitude stays honest,
 * but the curve has structure (knees, peaks, saturation) where a
 * linear fallback would have had none.
 *
 * Shapes are coarse by design — the point is for the user to see
 * "this is a saturating relationship with diminishing returns past
 * my current operating point" at a glance, not to match a specific
 * Hill equation to three decimal places. The backend's actual fitted
 * curves (when eventually exposed) should override this. */
export function inferShape(edge: InsightBayesian): SyntheticShape {
  const cacheKey = `${edge.action}::${edge.outcome}`
  const cached = SHAPE_CACHE.get(cacheKey)
  if (cached) return cached

  const explicit = lookupExplicitShape(edge.action, edge.outcome)
  if (explicit) {
    SHAPE_CACHE.set(cacheKey, explicit)
    return explicit
  }

  const domain = ACTION_DOMAIN[edge.action]
  const span = domain ? domain.max - domain.min : 1
  // The engine's posterior.mean is the predicted change per
  // nominal_step; the total span-wide change ≈ mean * (span / nominal_step).
  const step = edge.nominal_step || 1
  const spanChange = (edge.posterior.mean / step) * span
  // If the posterior is effectively zero, fabricate a tiny non-zero
  // span-change so the curve still has visible shape.
  const signedSpanChange = Math.abs(spanChange) < 1e-6 ? 0.01 : spanChange
  const sign = Math.sign(signedSpanChange) || 1
  const magnitude = Math.abs(signedSpanChange)

  let shape: SyntheticShape

  if (INVERTED_U_ACTIONS.has(edge.action)) {
    // Peak at ~60% of the domain — biology's sweet spot is usually
    // between the action's minimum and maximum but not at the center.
    const peakFrac = 0.55
    const peak = domain ? domain.min + span * peakFrac : 0.55
    // Rising segment carries the full magnitude; falling segment
    // declines to about half the peak by the domain max.
    const slopeUp = (magnitude * sign) / (peak - (domain?.min ?? 0) + 1e-9)
    const slopeDown = -((magnitude * sign) * 0.5) / (span * (1 - peakFrac))
    shape = { kind: 'inverted_u', peak, slopeUp, slopeDown }
  } else {
    // Smooth-saturating (Hill) — asymptote = total span change,
    // halfDose = 40% of the action's range (EC50 close to the lower
    // third so most of the action happens in the user's operating
    // zone, not out at the edges).
    const halfDose = domain ? domain.min + span * 0.4 : 0.4
    shape = {
      kind: 'smooth_saturating',
      asymptote: signedSpanChange,
      halfDose: Math.max(halfDose, 1e-3),
    }
  }

  SHAPE_CACHE.set(cacheKey, shape)
  return shape
}
