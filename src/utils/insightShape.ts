/**
 * Every action × outcome edge gets a plausible SMOOTH nonlinear
 * response shape — no hard kinks — so the curve in the Insights v2
 * row preview and the expanded chart has actual structure for the
 * tangent line to lie against.
 *
 * Shapes used:
 *   smooth_saturating   — Hill approach to an asymptote. For
 *                         monotonic "more is better (with diminishing
 *                         returns)" or "less is worse (with floor)".
 *                         Form: asymptote × (1 − 2^(−x/halfDose)).
 *   smooth_inverted_u   — Symmetric downward parabola centered at
 *                         `peakX`. Peak value = `amplitude`, zero
 *                         crossings at peakX ± halfWidth. Tangent at
 *                         the peak is naturally 0 — no corner. For
 *                         actions with a clear optimum (training load,
 *                         ACWR, dietary energy).
 *
 * PHASE_1_EDGES explicit shapes (caffeine_mg / alcohol_units Hill
 * curves) pass through unchanged. The legacy piecewise `saturating`
 * and `inverted_u` kinds get smoothed for visualisation but the
 * backend engine keeps its exact piecewise semantics elsewhere.
 */

import type { SyntheticShape } from '@/data/scm/syntheticEdges'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'
import { PHASE_2_EDGES } from '@/data/scm/syntheticEdgesV2'
import type { InsightBayesian } from '@/data/portal/types'
import { isContextSuppressed } from '@/utils/edgeSuppression'

/** Extended shape type used by the Insights v2 curves. Adds
 * smooth_inverted_u on top of the engine's SyntheticShape union.
 * thermoneutral_window now lives on SyntheticShape itself (used by
 * bedroom_temp_c PHASE_2 edges directly), so it flows through the
 * union without a separate entry here. */
export type InferredShape =
  | SyntheticShape
  | {
      kind: 'smooth_inverted_u'
      /** x-location of the peak. */
      peakX: number
      /** signed peak value — positive for a max, negative for a min. */
      amplitude: number
      /** x-distance from peak to the zero-crossings. */
      halfWidth: number
    }

/** Plot-domain per action — shared with the chart components. */
export const ACTION_DOMAIN: Record<string, { min: number; max: number }> = {
  bedtime: { min: 21.5, max: 24.5 },
  bedroom_temp_c: { min: 16, max: 27 },
  sleep_duration: { min: 4, max: 10 },
  sleep_quality: { min: 60, max: 100 },
  caffeine_mg: { min: 0, max: 600 },
  caffeine_cutoff: { min: 0, max: 14 },
  caffeine_timing: { min: 0, max: 14 },
  alcohol_units: { min: 0, max: 6 },
  alcohol_timing: { min: 0, max: 8 },
  zone2_minutes: { min: 0, max: 300 },
  zone2_volume: { min: 0, max: 50 },
  zone4_5_minutes: { min: 0, max: 90 },
  training_volume: { min: 0, max: 3 },
  training_load: { min: 0, max: 200 },
  running_volume: { min: 0, max: 30 },
  steps: { min: 0, max: 25000 },
  active_energy: { min: 0, max: 3000 },
  resistance_training_minutes: { min: 0, max: 180 },
  dietary_protein: { min: 30, max: 250 },
  dietary_energy: { min: 1500, max: 4000 },
  carbohydrate_g: { min: 50, max: 300 },
  fiber_g: { min: 5, max: 50 },
  late_meal_count: { min: 0, max: 7 },
  post_meal_walks: { min: 0, max: 4 },
  cycle_luteal_phase: { min: 0, max: 1 },
  luteal_symptom_score: { min: 0, max: 10 },
  supp_omega3: { min: 0, max: 1 },
  supp_magnesium: { min: 0, max: 1 },
  supp_vitamin_d: { min: 0, max: 1 },
  supp_b_complex: { min: 0, max: 1 },
  supp_creatine: { min: 0, max: 1 },
  supp_melatonin: { min: 0, max: 1 },
  supp_l_theanine: { min: 0, max: 1 },
  supp_zinc: { min: 0, max: 1 },
  acwr: { min: 0.5, max: 2 },
  sleep_debt: { min: 0, max: 20 },
}

/** Actions whose response is characteristically inverted-U. */
const INVERTED_U_ACTIONS = new Set<string>([
  'training_load',
  'training_volume',
  'zone4_5_minutes',
  'acwr',
  'dietary_energy',
  // bedroom_temp_c was here historically; it's now modelled as a
  // thermoneutral_window (flat plateau + asymmetric roll-off) on its
  // PHASE_2 edges, so the synthetic-fallback inverted-U inference no
  // longer applies.
])

/** Evaluate an InferredShape at a given dose. Smooth everywhere — no
 * piecewise kinks — so the curve has clear tangents across its full
 * range and the user's tangent line is visually distinct from the
 * curve even when they intersect at the operating point. */
export function evaluateShape(shape: InferredShape, dose: number): number {
  switch (shape.kind) {
    case 'linear':
      return shape.slope * dose
    case 'saturating': {
      // Smoothed to a Hill approach for visualisation.
      if (dose <= 0) return 0
      const plateau = shape.slope * shape.knee
      return plateau * (1 - Math.pow(2, -dose / Math.max(shape.knee, 1e-9)))
    }
    case 'smooth_saturating':
      if (dose <= 0) return 0
      return shape.asymptote * (1 - Math.pow(2, -dose / shape.halfDose))
    case 'inverted_u': {
      // Smoothed to a parabola. The legacy piecewise params
      // `peak` (x-location) + `slopeUp` × `slopeDown` are reinterpreted:
      // amplitude = slopeUp × peak, symmetric half-width = peak.
      const amplitude = shape.slopeUp * shape.peak
      const halfWidth = shape.peak || 1
      const t = (dose - shape.peak) / halfWidth
      return amplitude * (1 - t * t)
    }
    case 'smooth_inverted_u': {
      const t = (dose - shape.peakX) / Math.max(shape.halfWidth, 1e-9)
      return shape.amplitude * (1 - t * t)
    }
    case 'thermoneutral_window': {
      // Flat amplitude inside the tolerance band; quadratic roll-off
      // outside, asymmetric (heat penalty steeper than cold).
      if (dose >= shape.peakLow && dose <= shape.peakHigh) {
        return shape.amplitude
      }
      if (dose < shape.peakLow) {
        const t = (shape.peakLow - dose) / Math.max(shape.halfBelow, 1e-9)
        return shape.amplitude * (1 - t * t)
      }
      const t = (dose - shape.peakHigh) / Math.max(shape.halfAbove, 1e-9)
      return shape.amplitude * (1 - t * t)
    }
  }
}

/** Numerical derivative of a shape at a given dose (central difference). */
export function slopeOfShape(shape: InferredShape, dose: number, h = 0.01): number {
  const hh = Math.max(h, Math.abs(dose) * 0.01)
  return (evaluateShape(shape, dose + hh) - evaluateShape(shape, dose - hh)) / (2 * hh)
}

const SHAPE_CACHE = new Map<string, InferredShape>()

function lookupExplicitShape(
  action: string,
  outcome: string,
): SyntheticShape | null {
  const spec = PHASE_1_EDGES.find(
    (e) => e.action === action && e.outcome === outcome,
  ) ?? PHASE_2_EDGES.find((e) => e.action === action && e.outcome === outcome)
  return spec?.shape ?? null
}

/** Return a smooth nonlinear shape for any edge. Falls through to
 * explicit PHASE_1_EDGES shapes, then to the inverted-U parabola for
 * training/load actions, then to a Hill saturating curve for
 * everything else. Calibrated so the curve's amplitude reflects the
 * engine's posterior.mean × domain span — big-picture magnitude
 * honest, shape coarse. */
export function inferShape(edge: InsightBayesian): InferredShape {
  if (isContextSuppressed(edge)) {
    return { kind: 'linear', slope: 0 }
  }

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
  const step = edge.nominal_step || 1
  const spanChange = (edge.posterior.mean / step) * span
  const signedAmp = Math.abs(spanChange) < 1e-6 ? 0.01 : spanChange

  let shape: InferredShape

  if (INVERTED_U_ACTIONS.has(edge.action) && domain) {
    // Peak at ~55% of the action's domain. Symmetric parabola with
    // half-width reaching the nearest zero-crossing at the domain
    // min (or the equivalent on the far side). Tangent at the peak
    // is zero; tangent on the wings is non-zero and signed.
    const peakX = domain.min + span * 0.55
    const halfWidth = Math.min(peakX - domain.min, domain.max - peakX)
    shape = {
      kind: 'smooth_inverted_u',
      peakX,
      amplitude: signedAmp,
      halfWidth: Math.max(halfWidth, 1e-3),
    }
  } else if (domain) {
    // Smooth-saturating (Hill). EC50 at 40% of the domain so the user
    // sits in the steep part of the curve in most realistic cases.
    shape = {
      kind: 'smooth_saturating',
      asymptote: signedAmp,
      halfDose: Math.max(span * 0.4, 1e-3),
    }
  } else {
    shape = {
      kind: 'smooth_saturating',
      asymptote: signedAmp,
      halfDose: 0.4,
    }
  }

  SHAPE_CACHE.set(cacheKey, shape)
  return shape
}
