/**
 * Full (uncollapsed) counterfactual engine.
 *
 * Unlike computeCounterfactual() which returns results for a filtered
 * target list, this module computes effects on ALL downstream nodes
 * and organizes them by mechanism category (metabolic / cardio /
 * recovery / sleep) with cross-category tradeoff detection.
 *
 * The full state is the "uncollapsed model" — the UI can slice or
 * collapse it for display without losing any computed effects.
 */

import type {
  Intervention,
  StructuralEquation,
  PathwayEffect,
  IdentificationResult,
  CounterfactualResult,
} from './types'
import type { StructuralEdge, MechanismDef } from '../dataValue/types'
import {
  MECHANISM_CATALOG,
  DOSE_FAMILIES,
  RESPONSE_FAMILIES,
  STRUCTURAL_EDGES,
} from '../dataValue/mechanismCatalog'
import { buildCausalAdjacency, getDescendants } from './dagGraph'
import { computeCounterfactual } from './twinEngine'

// ─── Types ─────────────────────────────────────────────────────────

export type MechanismCategory = 'metabolic' | 'cardio' | 'recovery' | 'sleep'

export interface NodeEffect {
  nodeId: string
  factualValue: number
  counterfactualValue: number
  totalEffect: number
  confidenceInterval: { low: number; high: number }
  /** Categories this node participates in (many-to-many) */
  categories: MechanismCategory[]
  pathways: PathwayEffect[]
  identification: IdentificationResult
}

export interface CategorySummary {
  category: MechanismCategory
  affectedNodes: NodeEffect[]
  /** Sum of signed effects (positive = net benefit) */
  netSignal: number
  topBenefit: NodeEffect | null
  topCost: NodeEffect | null
  avgIdentificationQuality: number
}

export interface Tradeoff {
  benefitNode: string
  benefitCategory: MechanismCategory
  benefitEffect: number
  costNode: string
  costCategory: MechanismCategory
  costEffect: number
  sharedInterventions: string[]
  description: string
}

export interface FullCounterfactualState {
  interventions: Intervention[]
  /** Every node with a non-zero effect — the uncollapsed model */
  allEffects: Map<string, NodeEffect>
  /** Effects grouped by mechanism category */
  categoryEffects: Record<MechanismCategory, CategorySummary>
  /** Cross-category trade-offs where effects conflict */
  tradeoffs: Tradeoff[]
  timestamp: number
}

// ─── Node → Category mapping ───────────────────────────────────────

/**
 * Build a map from node ID → set of mechanism categories it participates in.
 * A node can appear in multiple categories (e.g., hscrp → metabolic + recovery).
 *
 * Built from MECHANISM_CATALOG: each mechanism's doseFamily and responseFamily
 * are resolved to node IDs and tagged with the mechanism's category.
 */
function buildNodeCategoryMapFromCatalog(catalog: MechanismDef[]): Map<string, Set<MechanismCategory>> {
  const map = new Map<string, Set<MechanismCategory>>()

  function tag(nodeId: string, category: MechanismCategory) {
    if (!map.has(nodeId)) map.set(nodeId, new Set())
    map.get(nodeId)!.add(category)
  }

  for (const mech of catalog) {
    const cat = mech.category as MechanismCategory

    // Tag the dose family node
    const doseFam = DOSE_FAMILIES[mech.doseFamily]
    if (doseFam) tag(doseFam.id, cat)

    // Tag the response family node
    const respFam = RESPONSE_FAMILIES[mech.responseFamily]
    if (respFam) tag(respFam.id, cat)

    // Also tag by the family IDs directly (they often ARE the node IDs)
    tag(mech.doseFamily, cat)
    tag(mech.responseFamily, cat)
  }

  return map
}

// Memoized at module level (catalog is static)
let _nodeCategoryMap: Map<string, Set<MechanismCategory>> | null = null

export function getNodeCategoryMap(): Map<string, Set<MechanismCategory>> {
  if (!_nodeCategoryMap) {
    _nodeCategoryMap = buildNodeCategoryMapFromCatalog(MECHANISM_CATALOG)
  }
  return _nodeCategoryMap
}

// Regime nodes are category-less infrastructure (ADR-004).
// Their downstream effects show up in metabolic/cardio/recovery/sleep,
// but the regime node itself is not a health marker to display in a category.
const REGIME_NODE_IDS = new Set([
  'overreaching_state',
  'iron_deficiency_state',
  'sleep_deprivation_state',
  'inflammation_state',
])

/**
 * Get categories for a node. Returns [] for regime nodes (ADR-004),
 * and ['metabolic'] as default for nodes not explicitly in the catalog.
 */
export function getCategoriesForNode(nodeId: string): MechanismCategory[] {
  if (REGIME_NODE_IDS.has(nodeId)) return []

  const map = getNodeCategoryMap()
  const cats = map.get(nodeId)
  if (cats && cats.size > 0) return [...cats]

  // Heuristic fallback: check if the node name suggests a category
  if (nodeId.includes('sleep') || nodeId.includes('deep_sleep') || nodeId.includes('bedtime')) return ['sleep']
  if (nodeId.includes('hrv') || nodeId.includes('resting_hr')) return ['recovery']
  if (nodeId.includes('hdl') || nodeId.includes('ldl') || nodeId.includes('triglycerides') || nodeId.includes('vo2')) return ['cardio']
  return ['metabolic']
}

// ─── Friendly node names ───────────────────────────────────────────

const FRIENDLY_NAMES: Record<string, string> = {
  running_volume: 'Running Volume',
  training_volume: 'Training Volume',
  zone2_volume: 'Zone 2 Volume',
  training_load: 'Training Load',
  sleep_duration: 'Sleep Duration',
  iron_total: 'Serum Iron',
  ferritin: 'Ferritin',
  hemoglobin: 'Hemoglobin',
  vo2_peak: 'VO2 Peak',
  cortisol: 'Cortisol',
  testosterone: 'Testosterone',
  triglycerides: 'Triglycerides',
  hdl: 'HDL',
  ldl: 'LDL',
  hscrp: 'hsCRP',
  hrv_daily: 'Overnight RMSSD',
  resting_hr: 'Resting HR',
  wbc: 'White Blood Cells',
  body_fat_pct: 'Body Fat %',
  glucose: 'Glucose',
  insulin: 'Insulin',
  zinc: 'Zinc',
  magnesium_rbc: 'Magnesium (RBC)',
  rbc: 'Red Blood Cells',
  ast: 'AST',
  creatinine: 'Creatinine',
  ground_contacts: 'Ground Contacts',
  core_temperature: 'Core Temperature',
  insulin_sensitivity: 'Insulin Sensitivity',
  energy_expenditure: 'Energy Expenditure',
  sleep_quality: 'Sleep Quality',
  deep_sleep: 'Deep Sleep',
  sleep_efficiency: 'Sleep Efficiency',
  // Regime activation nodes
  overreaching_state: 'Overreaching State',
  iron_deficiency_state: 'Iron Deficiency State',
  sleep_deprivation_state: 'Sleep Deprivation State',
  inflammation_state: 'Inflammation State',
  // Load nodes (upstream to regime activation)
  acwr: 'Acute:Chronic Workload Ratio',
  sleep_debt: 'Sleep Debt',
}

function friendlyName(nodeId: string): string {
  return FRIENDLY_NAMES[nodeId] ?? nodeId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Tradeoff detection ────────────────────────────────────────────

export function detectTradeoffs(
  effects: Map<string, NodeEffect>,
  interventionNames: string[]
): Tradeoff[] {
  const tradeoffs: Tradeoff[] = []
  const nodes = [...effects.values()]

  // Find positive and negative effects
  const positives = nodes.filter(n => n.totalEffect > 0)
  const negatives = nodes.filter(n => n.totalEffect < 0)

  for (const pos of positives) {
    for (const neg of negatives) {
      // Only surface cross-category tradeoffs
      const posCategories = new Set(pos.categories)
      const negCategories = new Set(neg.categories)
      const hasDistinctCategory = [...negCategories].some(c => !posCategories.has(c))

      if (!hasDistinctCategory) continue

      // Both effects must be meaningful (>1% of factual value)
      const posSignificant = pos.factualValue !== 0 && Math.abs(pos.totalEffect / pos.factualValue) > 0.01
      const negSignificant = neg.factualValue !== 0 && Math.abs(neg.totalEffect / neg.factualValue) > 0.01

      if (!posSignificant || !negSignificant) continue

      // Pick the most distinct category pair
      const benefitCat = pos.categories[0]
      const costCat = neg.categories.find(c => !posCategories.has(c)) ?? neg.categories[0]

      tradeoffs.push({
        benefitNode: pos.nodeId,
        benefitCategory: benefitCat,
        benefitEffect: pos.totalEffect,
        costNode: neg.nodeId,
        costCategory: costCat,
        costEffect: neg.totalEffect,
        sharedInterventions: interventionNames,
        description: `${friendlyName(pos.nodeId)} improves (+${pos.totalEffect.toFixed(1)}) but ${friendlyName(neg.nodeId)} declines (${neg.totalEffect.toFixed(1)})`,
      })
    }
  }

  // Sort by combined magnitude (most impactful tradeoffs first)
  tradeoffs.sort((a, b) =>
    (Math.abs(b.benefitEffect) + Math.abs(b.costEffect)) -
    (Math.abs(a.benefitEffect) + Math.abs(a.costEffect))
  )

  // Limit to top 5 most significant tradeoffs
  return tradeoffs.slice(0, 5)
}

// ─── Category summaries ────────────────────────────────────────────

export function buildCategorySummaries(
  effects: Map<string, NodeEffect>
): Record<MechanismCategory, CategorySummary> {
  const categories: MechanismCategory[] = ['metabolic', 'cardio', 'recovery', 'sleep']
  const result = {} as Record<MechanismCategory, CategorySummary>

  for (const cat of categories) {
    // Collect nodes that belong to this category
    const affected = [...effects.values()].filter(n =>
      n.categories.includes(cat) && Math.abs(n.totalEffect) > 1e-6
    )

    const netSignal = affected.reduce((sum, n) => sum + n.totalEffect, 0)

    // Find top benefit and cost within this category
    const sorted = [...affected].sort((a, b) => b.totalEffect - a.totalEffect)
    const topBenefit = sorted.find(n => n.totalEffect > 0) ?? null
    const topCost = sorted.reverse().find(n => n.totalEffect < 0) ?? null

    // Average identification quality (backdoor=1, frontdoor=0.7, unidentified=0.3)
    const qualityScores = { backdoor: 1, frontdoor: 0.7, unidentified: 0.3 }
    const avgQuality = affected.length > 0
      ? affected.reduce((sum, n) => sum + (qualityScores[n.identification.strategy] ?? 0.5), 0) / affected.length
      : 0

    result[cat] = {
      category: cat,
      affectedNodes: affected,
      netSignal,
      topBenefit,
      topCost,
      avgIdentificationQuality: avgQuality,
    }
  }

  return result
}

// ─── Full counterfactual computation ───────────────────────────────

/**
 * Compute the uncollapsed counterfactual state.
 *
 * Unlike computeCounterfactual() which targets specific nodes, this
 * propagates through the entire DAG and returns effects on ALL
 * downstream nodes grouped by mechanism category.
 */
export function computeFullCounterfactual(
  observedValues: Record<string, number>,
  interventions: Intervention[],
  equations: StructuralEquation[],
  structuralEdges: StructuralEdge[],
  topoOrder?: string[]
): FullCounterfactualState {
  if (interventions.length === 0) {
    return {
      interventions: [],
      allEffects: new Map(),
      categoryEffects: buildCategorySummaries(new Map()),
      tradeoffs: [],
      timestamp: Date.now(),
    }
  }

  // Find ALL descendants of ALL intervention nodes
  const causalAdj = buildCausalAdjacency(structuralEdges)
  const targetSet = new Set<string>()

  for (const intv of interventions) {
    const descendants = getDescendants(intv.nodeId, causalAdj)
    for (const d of descendants) {
      targetSet.add(d)
    }
  }

  const allTargets = [...targetSet]

  // Run the engine ONCE with all interventions batched and all targets
  const cfResults = computeCounterfactual(
    observedValues,
    interventions,
    allTargets,
    equations,
    structuralEdges,
    topoOrder
  )

  // Convert to NodeEffect map
  const allEffects = new Map<string, NodeEffect>()

  for (const r of cfResults) {
    // Skip nodes with negligible effects
    if (Math.abs(r.totalEffect) < 1e-10) continue

    allEffects.set(r.targetId, {
      nodeId: r.targetId,
      factualValue: r.factualValue,
      counterfactualValue: r.counterfactualValue,
      totalEffect: r.totalEffect,
      confidenceInterval: r.confidenceInterval,
      categories: getCategoriesForNode(r.targetId),
      pathways: r.pathwayDecomposition,
      identification: {
        strategy: r.identificationStrategy,
        adjustmentSet: r.adjustmentSet,
        mediatorSet: [],
        blockedPaths: [],
        unblockedPaths: [],
        rationale: '',
      },
    })
  }

  // Build category summaries
  const categoryEffects = buildCategorySummaries(allEffects)

  // Detect tradeoffs
  const interventionNames = interventions.map(i => friendlyName(i.nodeId))
  const tradeoffs = detectTradeoffs(allEffects, interventionNames)

  return {
    interventions,
    allEffects,
    categoryEffects,
    tradeoffs,
    timestamp: Date.now(),
  }
}

// ─── Helpers for UI consumption ────────────────────────────────────

/**
 * Get a flat list of all effects sorted by absolute magnitude.
 * Useful for the backwards-compatible flat display.
 */
export function flattenEffects(state: FullCounterfactualState): NodeEffect[] {
  return [...state.allEffects.values()].sort(
    (a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect)
  )
}

/**
 * Get only effects for a specific category.
 */
export function getEffectsForCategory(
  state: FullCounterfactualState,
  category: MechanismCategory
): NodeEffect[] {
  return state.categoryEffects[category]?.affectedNodes ?? []
}

/**
 * Get a human-readable summary of effects for a category.
 */
export function summarizeCategory(summary: CategorySummary): string {
  if (summary.affectedNodes.length === 0) return 'No effects detected'

  const direction = summary.netSignal > 0 ? 'net positive' : summary.netSignal < 0 ? 'net negative' : 'mixed'
  return `${summary.affectedNodes.length} markers affected (${direction})`
}

export { friendlyName }
