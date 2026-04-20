/**
 * Dose-response shape classification by action.
 *
 * The engine exports linear posterior slope + sigmoid dose_multiplier (a
 * plateau-up model). Most edges are genuinely plateau-up. A few actions
 * are biologically inverted-U (too little AND too much are bad) or
 * threshold (fine until a cliff).
 *
 * Shape drives the *semantics* of the gauge: for plateau-up, the useful
 * edge is the knee; for inverted-U, it's the peak; for threshold, it's
 * staying below the cliff.
 *
 * NOTE: This is a manual mechanism table, not something the engine
 * derives from data. Sparse per-user data can't identify shape —
 * mechanism must supply it.
 */

export type DoseShape = 'plateau_up' | 'inverted_u' | 'threshold'

export interface ShapeInfo {
  shape: DoseShape
  /** Human-readable name of the useful edge. */
  edgeLabel: string
  /** Short explanation for tooltips. */
  description: string
}

const DEFAULT_SHAPE: ShapeInfo = {
  shape: 'plateau_up',
  edgeLabel: 'Diminishing returns',
  description: 'Effect rises, then flattens. Recommendation targets the knee — past it, more dose adds little.',
}

const SHAPE_BY_ACTION: Record<string, ShapeInfo> = {
  bedtime: {
    shape: 'inverted_u',
    edgeLabel: 'Optimal window',
    description: 'Going earlier helps up to a point, then circadian misalignment reverses it. Recommendation targets the peak.',
  },
  sleep_duration: {
    shape: 'inverted_u',
    edgeLabel: 'Optimal window',
    description: 'Too little and too much both impair recovery. Recommendation targets the peak.',
  },
  training_load: {
    shape: 'inverted_u',
    edgeLabel: 'Peak stimulus',
    description: 'Stimulus rises with load, then overtraining tips it negative. Recommendation targets the peak.',
  },
  running_volume: {
    shape: 'inverted_u',
    edgeLabel: 'Peak stimulus',
    description: 'Mileage helps aerobic development, then iron/HRV cost reverses gains. Recommendation targets the peak.',
  },
  active_energy: DEFAULT_SHAPE,
  zone2_volume: DEFAULT_SHAPE,
  training_volume: {
    shape: 'inverted_u',
    edgeLabel: 'Peak stimulus',
    description: 'Volume builds capacity, then diminishing returns and injury risk dominate.',
  },
  steps: DEFAULT_SHAPE,
  dietary_protein: DEFAULT_SHAPE,
  dietary_energy: {
    shape: 'inverted_u',
    edgeLabel: 'Energy balance',
    description: 'Too low impairs recovery; too high drives fat gain. Recommendation targets the optimal zone.',
  },
}

export function shapeFor(action: string): ShapeInfo {
  return SHAPE_BY_ACTION[action] ?? DEFAULT_SHAPE
}
