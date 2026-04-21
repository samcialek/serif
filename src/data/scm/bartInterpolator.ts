/**
 * Parent-vector → posterior-draw lookup for BART surfaces.
 *
 * Design choice: nearest-neighbor lookup on the exported grid (the
 * grid is the unique set of observed training parent vectors by
 * default — see `backend/serif_scm/bart_fit.py::fit_node_bart`). This
 * is cheap (O(G*P) per query) and matches the data-supported region
 * exactly. No extrapolation, which is the right behaviour for a Twin
 * that shouldn't counterfactualize beyond the observed cohort.
 *
 * For low-dimensional outcomes where the caller exported a dense
 * product grid, nearest-neighbor gives a piecewise-constant surface —
 * visually jaggy but correct. If smoother interpolation is needed
 * later, swap `findNearestGridIndex` for k-NN + inverse-distance
 * weighting without touching the callers.
 *
 * Distance metric: normalized Euclidean. Each parent column is scaled
 * to [0, 1] using the grid's own min/max (computed once on decode).
 * Without normalization, parents with large magnitudes (e.g., steps in
 * 1k–20k range) would dominate acwr (0.5–2.0) in distance, making the
 * neighbor lookup degenerate.
 */

import type { BartDraws } from './bartDraws'

// ─── Parent vector extraction ──────────────────────────────────────

/**
 * Assemble the parent vector from an observed-values map, in the order
 * expected by the BartDraws grid. Returns null if any required parent
 * is missing or non-finite — the caller should fall back to piecewise.
 */
export function extractParentVector(
  draws: BartDraws,
  observedValues: Record<string, number>
): Float32Array | null {
  const vec = new Float32Array(draws.nParents)
  for (let p = 0; p < draws.nParents; p++) {
    const name = draws.parentNames[p]
    const v = observedValues[name]
    if (v === undefined || !Number.isFinite(v)) return null
    vec[p] = v
  }
  return vec
}

// ─── Nearest-neighbor lookup ───────────────────────────────────────

/**
 * Find the grid row index nearest to `parents` under normalized
 * Euclidean distance. Parents and grid are normalized by the BartDraws'
 * precomputed per-column range.
 */
export function findNearestGridIndex(
  draws: BartDraws,
  parents: Float32Array
): number {
  const { grid, nGrid, nParents, parentMin, parentRange } = draws

  let bestIdx = 0
  let bestDistSq = Infinity

  for (let g = 0; g < nGrid; g++) {
    const base = g * nParents
    let distSq = 0
    for (let p = 0; p < nParents; p++) {
      const queryNorm = (parents[p] - parentMin[p]) / parentRange[p]
      const gridNorm = (grid[base + p] - parentMin[p]) / parentRange[p]
      const diff = queryNorm - gridNorm
      distSq += diff * diff
      // Early termination: if we've already exceeded the current best,
      // bail out. Saves ~30% on high-P outcomes in profiling.
      if (distSq >= bestDistSq) break
    }
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestIdx = g
    }
  }

  return bestIdx
}

// ─── Per-draw surface evaluation ───────────────────────────────────

/**
 * Evaluate all K posterior draws of the response surface at a parent
 * vector. Returns a Float32Array of length K — the mean function for
 * each draw (data_mean already added back on export side).
 *
 * Reuses `out` if provided — callers in hot paths should preallocate
 * one buffer per outcome node and pass it in per query.
 */
export function evaluateAllDraws(
  draws: BartDraws,
  parents: Float32Array,
  out?: Float32Array
): Float32Array {
  const { predictions, nDraws, nGrid } = draws
  const result = out ?? new Float32Array(nDraws)

  const gridIdx = findNearestGridIndex(draws, parents)
  // predictions laid out K*G row-major: k-th draw at predictions[k*G + gridIdx]
  for (let k = 0; k < nDraws; k++) {
    result[k] = predictions[k * nGrid + gridIdx]
  }
  return result
}

/**
 * Evaluate a single posterior draw at a parent vector. Cheap for use
 * inside an outer MC loop that walks draws sequentially.
 */
export function evaluateSingleDraw(
  draws: BartDraws,
  parents: Float32Array,
  drawIdx: number
): number {
  const { predictions, nGrid } = draws
  const gridIdx = findNearestGridIndex(draws, parents)
  return predictions[drawIdx * nGrid + gridIdx]
}

// ─── Posterior quantile summarization ──────────────────────────────

/**
 * Sort + quantile a K-sample vector in place. Faster than sort+quantile
 * for modest K. Returns [p05, p25, p50, p75, p95].
 *
 * NOTE: mutates `samples` by sorting. Pass a copy if you need to
 * preserve ordering elsewhere.
 */
export function quantileSummary(samples: Float32Array): {
  p05: number
  p25: number
  p50: number
  p75: number
  p95: number
  mean: number
} {
  const n = samples.length
  if (n === 0) return { p05: 0, p25: 0, p50: 0, p75: 0, p95: 0, mean: 0 }

  // Float32Array.sort is a sort without a comparator — it already
  // sorts numerically ascending (unlike Array.sort with no cmp).
  samples.sort()

  // Linear interpolation between ranks for smooth quantiles.
  const q = (p: number) => {
    const rank = p * (n - 1)
    const lo = Math.floor(rank)
    const hi = Math.ceil(rank)
    if (lo === hi) return samples[lo]
    const frac = rank - lo
    return samples[lo] * (1 - frac) + samples[hi] * frac
  }

  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i]

  return {
    p05: q(0.05),
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    mean: sum / n,
  }
}
