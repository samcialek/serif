/**
 * Monte-Carlo counterfactual propagation over BART posterior draws.
 *
 * Un-collapses the Twin's three simplifications (piecewise shape,
 * additive parents, point-estimate evaluation) by running K independent
 * abduction → action → prediction traversals — one per posterior draw —
 * and aggregating the K trajectories into posterior-predictive quantile
 * bands per target node.
 *
 * Where a node has no BART fit in the bundle, the loop falls back to
 * the existing piecewise-linear equations (`doseResponse.evaluateEdge`)
 * with a single noise residual shared across draws. Only BART-fit
 * nodes + their descendants acquire per-draw spread; root and piecewise
 * nodes without BART ancestors remain flat (one value across K draws).
 *
 * See `memory/serif_twin_bart_direction.md` (2026-04-21) for the full
 * design rationale.
 */

import type { StructuralEquation, Intervention } from './types'
import type { StructuralEdge } from '../dataValue/types'
import type { BartDraws } from './bartDraws'
import type { FullCounterfactualState, NodeEffect } from './fullCounterfactual'
import { buildEquationsByTarget, evaluateEdge } from './doseResponse'
import { buildCausalAdjacency, getDescendants, topologicalSort } from './dagGraph'
import {
  extractParentVector,
  findNearestGridIndex,
  quantileSummary,
} from './bartInterpolator'
import {
  getCategoriesForNode,
  buildCategorySummaries,
  detectTradeoffs,
  friendlyName,
} from './fullCounterfactual'

// ─── Public types ──────────────────────────────────────────────────

/** Per-draw noise residual for one node, plus a flag for which path was used. */
interface AbductionEntry {
  /** Per-draw noise U_k (length = K if BART, length = 1 if piecewise). */
  noise: Float32Array
  /** True if this node used BART surface for abduction. */
  usedBart: boolean
}

/** Posterior-predictive summary for a single target node. */
export interface PosteriorSummary {
  p05: number
  p25: number
  p50: number
  p75: number
  p95: number
  mean: number
}

/** MC-aware variant of NodeEffect with posterior bands. */
export interface MCNodeEffect extends Omit<NodeEffect, 'confidenceInterval' | 'pathways' | 'identification'> {
  /** Posterior-predictive samples of the counterfactual value, length K. */
  counterfactualSamples: Float32Array
  /** Quantile summary of those samples. */
  posteriorSummary: PosteriorSummary
  /** 90% credible band (p05, p95) — compat field for UI that expects CI. */
  confidenceInterval: { low: number; high: number }
  /** True iff this node's value was propagated through at least one BART surface. */
  hasBartAncestor: boolean
}

export interface MCFullCounterfactualState
  extends Omit<FullCounterfactualState, 'allEffects'> {
  allEffects: Map<string, MCNodeEffect>
  /** K draws actually propagated (== min over BART-fit draw counts in play). */
  kSamples: number
  /** Outcomes for which BART was the source of truth (rest ran piecewise). */
  bartOutcomes: string[]
}

// ─── Core MC propagation ───────────────────────────────────────────

/**
 * Run K posterior-draw propagations. Returns per-node K-sample arrays.
 *
 * This is the shape-preserving bit: we maintain K samples for every
 * node in the topological traversal. Nodes without BART ancestors
 * collapse to all-identical-K (effectively point estimates), but the
 * data layout stays uniform.
 */
function propagateMonteCarloSamples(
  observedValues: Record<string, number>,
  interventions: Intervention[],
  equations: StructuralEquation[],
  bartDraws: Map<string, BartDraws>,
  topoOrder: string[],
  kSamples: number
): Map<string, Float32Array> {
  const eqByTarget = buildEquationsByTarget(equations)

  // Which interventions clamp which nodes?
  const interventionMap = new Map<string, number>()
  for (const intv of interventions) interventionMap.set(intv.nodeId, intv.value)

  // ── Step 1: abduction (per-draw noise for BART nodes, shared for piecewise) ──
  const abduction = new Map<string, AbductionEntry>()
  // Also cache each BART node's observed grid index so we don't recompute it.
  const observedGridIdx = new Map<string, number>()

  for (const nodeId of topoOrder) {
    const observed = observedValues[nodeId]
    const parentEqs = eqByTarget.get(nodeId)

    if (observed === undefined || !Number.isFinite(observed)) {
      // Latent / missing observation: no noise to abduce. Skip.
      continue
    }

    const draws = bartDraws.get(nodeId)
    if (draws) {
      const parents = extractParentVector(draws, observedValues)
      if (parents !== null) {
        const gIdx = findNearestGridIndex(draws, parents)
        observedGridIdx.set(nodeId, gIdx)
        const noise = new Float32Array(kSamples)
        for (let k = 0; k < kSamples; k++) {
          const surfaceK = draws.predictions[k * draws.nGrid + gIdx]
          noise[k] = observed - surfaceK
        }
        abduction.set(nodeId, { noise, usedBart: true })
        continue
      }
      // Parent extraction failed (unobserved parent) — fall through to piecewise
    }

    // Piecewise branch (root or BART-fallback)
    if (!parentEqs || parentEqs.length === 0) {
      const noise = new Float32Array(1)
      noise[0] = observed
      abduction.set(nodeId, { noise, usedBart: false })
      continue
    }

    let contrib = 0
    for (const eq of parentEqs) {
      const parentVal = observedValues[eq.source] ?? 0
      contrib += evaluateEdge(parentVal, eq)
    }
    const noise = new Float32Array(1)
    noise[0] = observed - contrib
    abduction.set(nodeId, { noise, usedBart: false })
  }

  // ── Step 2 + 3: action + prediction, iterating K draws ──
  // Per-node K-sample arrays (counter world). Allocate lazily.
  const counter = new Map<string, Float32Array>()

  // Helper: read a parent's k-th counterfactual value, falling back to
  // observed value if not yet propagated (e.g., root not in topoOrder).
  const readParent = (nodeId: string, k: number): number => {
    const arr = counter.get(nodeId)
    if (arr) return arr[k % arr.length]
    const obs = observedValues[nodeId]
    return obs !== undefined && Number.isFinite(obs) ? obs : 0
  }

  // Prefill intervened nodes: constant across draws.
  for (const [nodeId, val] of interventionMap) {
    const arr = new Float32Array(kSamples)
    arr.fill(val)
    counter.set(nodeId, arr)
  }

  for (const nodeId of topoOrder) {
    if (counter.has(nodeId)) continue // intervened already set

    const abd = abduction.get(nodeId)
    if (!abd) {
      // No abduction for this node (latent / unobserved). Leave it out
      // of the counter world; descendants that try to read it via
      // readParent() will see 0.
      continue
    }

    const draws = bartDraws.get(nodeId)
    const parentEqs = eqByTarget.get(nodeId)

    if (draws && abd.usedBart) {
      // BART surface evaluation per draw.
      const out = new Float32Array(kSamples)

      // Check whether any BART parent is MC-spread (has non-constant K).
      // If all parents are constant, we can hit the grid once.
      let anyMcParent = false
      for (const name of draws.parentNames) {
        const arr = counter.get(name)
        if (arr && arr.length > 1) { anyMcParent = true; break }
      }

      if (!anyMcParent) {
        const parentVec = new Float32Array(draws.nParents)
        let ok = true
        for (let p = 0; p < draws.nParents; p++) {
          const name = draws.parentNames[p]
          const arr = counter.get(name)
          const v = arr ? arr[0] : observedValues[name]
          if (v === undefined || !Number.isFinite(v)) { ok = false; break }
          parentVec[p] = v
        }
        if (ok) {
          const gIdx = findNearestGridIndex(draws, parentVec)
          for (let k = 0; k < kSamples; k++) {
            out[k] = draws.predictions[k * draws.nGrid + gIdx] + abd.noise[k]
          }
          counter.set(nodeId, out)
          continue
        }
        // fall through to per-k path if we hit a missing parent edge case
      }

      // Per-k grid lookup (BART parent spread).
      const parentVec = new Float32Array(draws.nParents)
      for (let k = 0; k < kSamples; k++) {
        for (let p = 0; p < draws.nParents; p++) {
          parentVec[p] = readParent(draws.parentNames[p], k)
        }
        const gIdx = findNearestGridIndex(draws, parentVec)
        out[k] = draws.predictions[k * draws.nGrid + gIdx] + abd.noise[k]
      }
      counter.set(nodeId, out)
      continue
    }

    // Piecewise propagation — may still be MC-spread if any parent has
    // per-draw variation from an upstream BART node.
    if (!parentEqs || parentEqs.length === 0) {
      // Root: value = noise (constant across draws since usedBart=false)
      const arr = new Float32Array(1)
      arr[0] = abd.noise[0]
      counter.set(nodeId, arr)
      continue
    }

    let anyMcParent = false
    for (const eq of parentEqs) {
      const arr = counter.get(eq.source)
      if (arr && arr.length > 1) { anyMcParent = true; break }
    }

    if (!anyMcParent) {
      let contrib = 0
      for (const eq of parentEqs) {
        contrib += evaluateEdge(readParent(eq.source, 0), eq)
      }
      const arr = new Float32Array(1)
      arr[0] = contrib + abd.noise[0]
      counter.set(nodeId, arr)
      continue
    }

    const out = new Float32Array(kSamples)
    const noiseVal = abd.noise[0] // piecewise uses one shared noise residual
    for (let k = 0; k < kSamples; k++) {
      let contrib = 0
      for (const eq of parentEqs) {
        contrib += evaluateEdge(readParent(eq.source, k), eq)
      }
      out[k] = contrib + noiseVal
    }
    counter.set(nodeId, out)
  }

  return counter
}

// ─── Has-BART-ancestor cache ───────────────────────────────────────

/** Which nodes lie downstream of a BART-fit node? Those are the MC-meaningful targets. */
function computeBartAncestors(
  bartOutcomes: Set<string>,
  causalAdj: ReturnType<typeof buildCausalAdjacency>
): Set<string> {
  const hasBartAncestor = new Set<string>()
  for (const outcome of bartOutcomes) {
    hasBartAncestor.add(outcome)
    for (const d of getDescendants(outcome, causalAdj)) {
      hasBartAncestor.add(d)
    }
  }
  return hasBartAncestor
}

// ─── Full counterfactual with MC bands ─────────────────────────────

/**
 * Drop-in replacement for `computeFullCounterfactual` that returns
 * per-node posterior-predictive bands instead of point-estimate CIs.
 *
 * Signature-compatible with the existing call site in `provider.ts` —
 * BartTwinProvider can swap this in for `computeFullCounterfactual`
 * and the UI receives the same `FullCounterfactualState`-shaped object
 * with extra per-sample data available on each `MCNodeEffect`.
 */
export function computeMonteCarloFullCounterfactual(
  observedValues: Record<string, number>,
  interventions: Intervention[],
  equations: StructuralEquation[],
  structuralEdges: StructuralEdge[],
  bartDraws: Map<string, BartDraws>,
  options: {
    kSamples?: number
    topoOrder?: string[]
  } = {}
): MCFullCounterfactualState {
  const kSamples = options.kSamples ?? 200
  const topoOrder = options.topoOrder ?? topologicalSort(structuralEdges)

  if (interventions.length === 0) {
    return {
      interventions: [],
      allEffects: new Map(),
      categoryEffects: {
        metabolic: { category: 'metabolic', affectedNodes: [], netSignal: 0, topBenefit: null, topCost: null, avgIdentificationQuality: 0 },
        cardio: { category: 'cardio', affectedNodes: [], netSignal: 0, topBenefit: null, topCost: null, avgIdentificationQuality: 0 },
        recovery: { category: 'recovery', affectedNodes: [], netSignal: 0, topBenefit: null, topCost: null, avgIdentificationQuality: 0 },
        sleep: { category: 'sleep', affectedNodes: [], netSignal: 0, topBenefit: null, topCost: null, avgIdentificationQuality: 0 },
      },
      tradeoffs: [],
      timestamp: Date.now(),
      kSamples,
      bartOutcomes: [],
    }
  }

  // Figure out which downstream nodes we care about (descendants of interventions)
  const causalAdj = buildCausalAdjacency(structuralEdges)
  const targetSet = new Set<string>()
  for (const intv of interventions) {
    for (const d of getDescendants(intv.nodeId, causalAdj)) {
      targetSet.add(d)
    }
  }
  // Also include BART-fit outcomes so the UI can surface spread even for
  // outcomes not in the descendant set (rare but possible under complex DAGs)

  // Run MC propagation once — produces per-node K-sample arrays.
  const counterSamples = propagateMonteCarloSamples(
    observedValues,
    interventions,
    equations,
    bartDraws,
    topoOrder,
    kSamples,
  )

  // Also run factual propagation (interventions == []) to recover factual values.
  // We can't just read observedValues because some nodes are latent / derived.
  const factualSamples = propagateMonteCarloSamples(
    observedValues,
    [],
    equations,
    bartDraws,
    topoOrder,
    kSamples,
  )

  const bartOutcomes = new Set(bartDraws.keys())
  const hasBartAncestor = computeBartAncestors(bartOutcomes, causalAdj)

  const allEffects = new Map<string, MCNodeEffect>()

  for (const nodeId of targetSet) {
    const counterArr = counterSamples.get(nodeId)
    const factualArr = factualSamples.get(nodeId)
    if (!counterArr || !factualArr) continue

    // Expand to length-K for quantile math (factual might be length-1)
    const counterK = counterArr.length === kSamples
      ? counterArr
      : Float32Array.from({ length: kSamples }, () => counterArr[0])
    const factualScalar = factualArr[0] // factual is typically shared; use first

    // Skip negligible effects (same threshold as point-estimate engine)
    const counterMean = counterK.reduce((s, v) => s + v, 0) / kSamples
    const totalEffect = counterMean - factualScalar
    if (Math.abs(totalEffect) < 1e-10) continue

    // Copy before sorting — quantileSummary sorts in place
    const samplesCopy = new Float32Array(counterK)
    const summary = quantileSummary(samplesCopy)

    allEffects.set(nodeId, {
      nodeId,
      factualValue: factualScalar,
      counterfactualValue: summary.mean,
      totalEffect,
      counterfactualSamples: counterK,
      posteriorSummary: summary,
      confidenceInterval: { low: summary.p05, high: summary.p95 },
      categories: getCategoriesForNode(nodeId),
      hasBartAncestor: hasBartAncestor.has(nodeId),
    })
  }

  // Category summaries + tradeoffs reuse the same logic as the point-estimate
  // path — they operate on NodeEffect-shape objects. Since MCNodeEffect
  // strips pathways/identification, we adapt by building a NodeEffect-compatible
  // view for the legacy helpers.
  const legacyEffects = new Map<string, NodeEffect>()
  for (const [id, mc] of allEffects) {
    legacyEffects.set(id, {
      nodeId: mc.nodeId,
      factualValue: mc.factualValue,
      counterfactualValue: mc.counterfactualValue,
      totalEffect: mc.totalEffect,
      confidenceInterval: mc.confidenceInterval,
      categories: mc.categories,
      pathways: [],
      identification: {
        strategy: 'backdoor',
        adjustmentSet: [],
        mediatorSet: [],
        blockedPaths: [],
        unblockedPaths: [],
        rationale: '',
      },
    })
  }

  const categoryEffects = buildCategorySummaries(legacyEffects)
  const tradeoffs = detectTradeoffs(
    legacyEffects,
    interventions.map((i) => friendlyName(i.nodeId)),
  )

  return {
    interventions,
    allEffects,
    categoryEffects,
    tradeoffs,
    timestamp: Date.now(),
    kSamples,
    bartOutcomes: Array.from(bartOutcomes),
  }
}
