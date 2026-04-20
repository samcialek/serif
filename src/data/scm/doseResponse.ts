/**
 * Dose-response curve evaluation for SCM structural equations.
 *
 * Each fitted edge has a piecewise-linear model:
 *   f(dose) = bb * min(dose, theta) + ba * max(0, dose - theta)
 *
 * This universal formula covers all 5 piecewise curve types:
 *   linear:       two slopes (bb ≈ ba, or one negligible)
 *   plateau_up:   bb > 0, ba ≈ 0 (saturating benefit)
 *   plateau_down: bb ≈ 0, ba < 0 (threshold decay)
 *   v_min:        bb < 0, ba > 0 (U-shape, minimum at theta)
 *   v_max:        bb > 0, ba < 0 (inverted U, peak at theta)
 *
 * Plus a sigmoid curve type for regime activation nodes:
 *   sigmoid:      f(dose) = ba / (1 + exp(-bb * (dose - theta)))
 *                 bb = steepness (k), ba = max activation, theta = midpoint
 *                 bb < 0 for inverse sigmoid (activates as dose drops below theta)
 *
 * bb and ba are slope coefficients from the fitted pipeline.
 */

import type { EdgeResult } from '../dataValue/types'
import type { StructuralEquation, CurveType } from './types'
import { NODE_TO_COLUMNS } from '../dataValue/mechanismCatalog'

// ─── Column → Node reverse mapping ────────────────────────────────
// Fitted edges use column names (e.g., daily_run_km → iron_total_smoothed).
// Structural edges and topological sort use node names (e.g., running_volume → iron_total).
// This mapping bridges the two naming systems.

const COLUMN_TO_NODE: Map<string, string> = new Map()

for (const [nodeId, columns] of Object.entries(NODE_TO_COLUMNS)) {
  for (const col of columns) {
    COLUMN_TO_NODE.set(col, nodeId)
  }
}

/**
 * Resolve a column name to its parent node ID.
 * Falls back to the column name itself if no mapping exists
 * (handles cases where the column IS the node name, e.g., 'resting_hr').
 */
function resolveNodeId(column: string): string {
  return COLUMN_TO_NODE.get(column) ?? column
}

// ─── Core evaluation ────────────────────────────────────────────

/**
 * Evaluate a single edge's dose-response contribution.
 *
 * Returns the response delta attributable to this edge given a dose value.
 * The piecewise function has a changepoint at theta.
 */
export function evaluateEdge(dose: number, eq: StructuralEquation): number {
  if (eq.curveType === 'sigmoid') {
    // Sigmoid activation: ba = max level, bb = steepness (k), theta = midpoint
    // f(dose) = ba / (1 + exp(-bb * (dose - theta)))
    // bb > 0: activates as dose rises above theta
    // bb < 0: activates as dose drops below theta (inverse sigmoid)
    return eq.ba / (1 + Math.exp(-eq.bb * (dose - eq.theta)))
  }
  const belowContribution = eq.bb * Math.min(dose, eq.theta)
  const aboveContribution = eq.ba * Math.max(0, dose - eq.theta)
  return belowContribution + aboveContribution
}

/**
 * Compute the marginal effect (local derivative) at a given dose.
 * Returns bb if dose <= theta, ba if dose > theta.
 * Used by uncertainty propagation to scale noise through the chain.
 */
export function edgeSensitivity(dose: number, eq: StructuralEquation): number {
  if (eq.curveType === 'sigmoid') {
    // Derivative of sigmoid: ba * bb * σ(x) * (1 - σ(x))
    const sig = 1 / (1 + Math.exp(-eq.bb * (dose - eq.theta)))
    return eq.ba * eq.bb * sig * (1 - sig)
  }
  return dose <= eq.theta ? eq.bb : eq.ba
}

/**
 * Compute the counterfactual difference for a dose change along one edge.
 * This is f(newDose) - f(oldDose), the causal effect of shifting the dose.
 */
export function edgeCounterfactualDelta(
  oldDose: number,
  newDose: number,
  eq: StructuralEquation
): number {
  return evaluateEdge(newDose, eq) - evaluateEdge(oldDose, eq)
}

// ─── Build equations from fitted edges ──────────────────────────

/**
 * Convert EdgeResult entries (from edgeSummaryRaw.json) into
 * StructuralEquation objects for the SCM engine.
 *
 * Maps:
 *   EdgeResult.curve → StructuralEquation.curveType
 *   EdgeResult.source/target → column-level IDs (e.g., 'daily_run_km')
 *   EdgeResult.theta/bb/ba/eff_n/personal_pct → direct copy
 */
export function buildEquationsFromEdges(
  edgeResults: EdgeResult[]
): StructuralEquation[] {
  // Deduplicate: if multiple column-level edges map to the same
  // (sourceNode, targetNode) pair, keep the one with higher effN.
  const seen = new Map<string, StructuralEquation>()

  for (const e of edgeResults) {
    const sourceNode = resolveNodeId(e.source)
    const targetNode = resolveNodeId(e.target)
    const key = `${sourceNode}→${targetNode}`

    const eq: StructuralEquation = {
      source: sourceNode,
      target: targetNode,
      curveType: e.curve as CurveType,
      theta: e.theta,
      bb: e.bb,
      ba: e.ba,
      effN: e.eff_n,
      personalPct: e.personal_pct,
      provenance: e.provenance ?? 'fitted',
    }

    // Skip zero-slope edges — no detectable causal effect. See engine lessons #8.
    const ZERO_SLOPE_EPSILON = 1e-6
    if (Math.abs(eq.bb) < ZERO_SLOPE_EPSILON && Math.abs(eq.ba) < ZERO_SLOPE_EPSILON) {
      continue
    }

    const existing = seen.get(key)
    if (!existing || eq.effN > existing.effN) {
      seen.set(key, eq)
    }
  }

  return [...seen.values()]
}

// ─── Regime activation equations (not fitted from data) ─────────

/**
 * Structural equations for regime activation edges (sigmoid) and
 * their downstream linear effects. These aren't in edgeSummaryRaw —
 * they represent mechanistic priors from the sports science literature.
 */
export const REGIME_EQUATIONS: StructuralEquation[] = [
  // ── Activation edges (sigmoid) ──
  // acwr → overreaching_state: activates above acwr 1.5, steepness k=5
  { source: 'acwr', target: 'overreaching_state', curveType: 'sigmoid', theta: 1.5, bb: 5.0, ba: 1.0, effN: 50, personalPct: 0, provenance: 'literature' },
  // ferritin → iron_deficiency_state: activates as ferritin drops below 30, inverse sigmoid (bb < 0)
  { source: 'ferritin', target: 'iron_deficiency_state', curveType: 'sigmoid', theta: 30, bb: -0.2, ba: 1.0, effN: 30, personalPct: 0, provenance: 'literature' },
  // sleep_debt → sleep_deprivation_state: activates above 5 hrs debt
  { source: 'sleep_debt', target: 'sleep_deprivation_state', curveType: 'sigmoid', theta: 5.0, bb: 1.0, ba: 1.0, effN: 40, personalPct: 0, provenance: 'literature' },
  // hscrp → inflammation_state: activates above 3.0 mg/L
  { source: 'hscrp', target: 'inflammation_state', curveType: 'sigmoid', theta: 3.0, bb: 2.0, ba: 1.0, effN: 30, personalPct: 0, provenance: 'literature' },

  // ── Downstream regime effects (linear) ──
  // Overreaching effects (Meeusen et al. 2013, Halson & Jeukendrup 2004)
  { source: 'overreaching_state', target: 'hscrp', curveType: 'linear', theta: 0.5, bb: 2.0, ba: 2.0, effN: 20, personalPct: 0, provenance: 'literature' },
  { source: 'overreaching_state', target: 'cortisol', curveType: 'linear', theta: 0.5, bb: 3.5, ba: 3.5, effN: 20, personalPct: 0, provenance: 'literature' },
  { source: 'overreaching_state', target: 'testosterone', curveType: 'linear', theta: 0.5, bb: -50.0, ba: -50.0, effN: 15, personalPct: 0, provenance: 'literature' },
  { source: 'overreaching_state', target: 'hrv_daily', curveType: 'linear', theta: 0.5, bb: -8.0, ba: -8.0, effN: 25, personalPct: 0, provenance: 'literature' },

  // Iron deficiency effects (Sim et al. 2019, Peeling et al. 2008)
  { source: 'iron_deficiency_state', target: 'hemoglobin', curveType: 'linear', theta: 0.5, bb: -1.5, ba: -1.5, effN: 20, personalPct: 0, provenance: 'literature' },
  { source: 'iron_deficiency_state', target: 'vo2_peak', curveType: 'linear', theta: 0.5, bb: -4.0, ba: -4.0, effN: 15, personalPct: 0, provenance: 'literature' },
  { source: 'iron_deficiency_state', target: 'rbc', curveType: 'linear', theta: 0.5, bb: -0.3, ba: -0.3, effN: 15, personalPct: 0, provenance: 'literature' },

  // Sleep deprivation effects (Spiegel et al. 2011, Leproult & Van Cauter 2011)
  { source: 'sleep_deprivation_state', target: 'cortisol', curveType: 'linear', theta: 0.5, bb: 2.5, ba: 2.5, effN: 30, personalPct: 0, provenance: 'literature' },
  { source: 'sleep_deprivation_state', target: 'testosterone', curveType: 'linear', theta: 0.5, bb: -60.0, ba: -60.0, effN: 20, personalPct: 0, provenance: 'literature' },
  { source: 'sleep_deprivation_state', target: 'glucose', curveType: 'linear', theta: 0.5, bb: 8.0, ba: 8.0, effN: 25, personalPct: 0, provenance: 'literature' },

  // Inflammation cascade (Ridker 2003, Emerging Risk Factors Collaboration)
  { source: 'inflammation_state', target: 'hdl', curveType: 'linear', theta: 0.5, bb: -5.0, ba: -5.0, effN: 20, personalPct: 0, provenance: 'literature' },
  { source: 'inflammation_state', target: 'insulin_sensitivity', curveType: 'linear', theta: 0.5, bb: -0.15, ba: -0.15, effN: 15, personalPct: 0, provenance: 'literature' },
]

/**
 * Build equations from fitted edges + regime equations combined.
 * Regime equations are appended after the fitted ones.
 */
export function buildEquationsWithRegimes(
  edgeResults: EdgeResult[]
): StructuralEquation[] {
  const fitted = buildEquationsFromEdges(edgeResults)
  return [...fitted, ...REGIME_EQUATIONS]
}

/**
 * Build a lookup map: target node → all equations feeding into it.
 * Used by the twin engine for fast parent-contribution summation.
 */
export function buildEquationsByTarget(
  equations: StructuralEquation[]
): Map<string, StructuralEquation[]> {
  const map = new Map<string, StructuralEquation[]>()
  for (const eq of equations) {
    if (!map.has(eq.target)) map.set(eq.target, [])
    map.get(eq.target)!.push(eq)
  }
  return map
}
