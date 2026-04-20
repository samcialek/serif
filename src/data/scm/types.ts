/**
 * Twin SCM type definitions.
 *
 * These types model a Structural Causal Model over Serif's health DAG,
 * supporting counterfactual queries via the abduction-action-prediction
 * (twin network) pattern, with front-door and back-door identification.
 */

import type { StructuralEdge } from '../dataValue/types'

// ─── Curve types (matching edgeSummaryRaw.json) ─────────────────

export type CurveType = 'linear' | 'plateau_up' | 'plateau_down' | 'v_min' | 'v_max' | 'sigmoid'

// ─── DAG primitives ─────────────────────────────────────────────

/** Adjacency lists for the causal graph */
export interface AdjacencyList {
  /** node → its causal children */
  children: Map<string, string[]>
  /** node → its causal parents */
  parents: Map<string, string[]>
}

/** Augmented adjacency that also tracks confounding forks */
export interface FullAdjacency extends AdjacencyList {
  /** confounder → the pair of nodes it confounds */
  confoundingForks: Array<{ confounder: string; left: string; right: string }>
  /** all unique node IDs in the graph */
  allNodes: Set<string>
}

// ─── Structural equations ───────────────────────────────────────

/** A fitted structural equation for one directed edge */
export interface StructuralEquation {
  source: string
  target: string
  curveType: CurveType
  theta: number
  bb: number
  ba: number
  effN: number
  personalPct: number
  /** See EdgeResult.provenance. Regime equations default to 'literature'. */
  provenance: 'literature' | 'fitted'
}

/** A single node in the SCM DAG */
export interface SCMNode {
  id: string
  /** Current observed value (null for latent/unobserved nodes) */
  observedValue: number | null
  /** Exogenous noise inferred during abduction */
  exogenousNoise: number
  /** True for the 8 latent confounders */
  isLatent: boolean
  /** True after do(X = x') is applied */
  isIntervened: boolean
  /** Position in topological ordering */
  topoOrder: number
}

/** Complete twin SCM state for one counterfactual query */
export interface TwinSCMState {
  factualWorld: Map<string, SCMNode>
  counterWorld: Map<string, SCMNode>
  equations: StructuralEquation[]
  /** Lookup: target node → equations feeding into it */
  equationsByTarget: Map<string, StructuralEquation[]>
  topoOrder: string[]
  interventions: Intervention[]
}

// ─── Interventions & results ────────────────────────────────────

/** A do-intervention: do(nodeId = value) */
export interface Intervention {
  nodeId: string
  value: number
  originalValue: number
}

/** Result of a counterfactual query for one target node */
export interface CounterfactualResult {
  targetId: string
  factualValue: number
  counterfactualValue: number
  totalEffect: number
  pathwayDecomposition: PathwayEffect[]
  adjustmentSet: string[]
  identificationStrategy: 'backdoor' | 'frontdoor' | 'unidentified'
  confidenceInterval: { low: number; high: number }
}

/** Contribution of one causal pathway to the total effect */
export interface PathwayEffect {
  /** Node IDs along the path, e.g. ['running_volume', 'ground_contacts', 'iron_total', 'ferritin'] */
  path: string[]
  /** Causal effect attributable to this pathway */
  effect: number
  /** effect / totalEffect */
  fractionOfTotal: number
  /** Per-edge effN along the path (proxy for confidence) */
  edgeConfidences: number[]
  /** Label of the weakest-evidence edge on this path (lowest effN) */
  bottleneckEdge: string | null
  /**
   * True for synthesized aggregate entries representing effect routed through
   * one or more regime-activation (sigmoid) nodes. Regime paths are excluded
   * from per-path decomposition because linear attribution through a sigmoid
   * breaks additivity (engine lesson #16). UI should render these with a regime
   * badge rather than as a decomposed path. edgeConfidences is empty and
   * bottleneckEdge is null for aggregate entries.
   */
  isRegimeAggregate?: boolean
}

// ─── Identification ─────────────────────────────────────────────

export type IdentificationStrategy = 'backdoor' | 'frontdoor' | 'unidentified'

/** Result of causal identification analysis for a (treatment, outcome) pair */
export interface IdentificationResult {
  strategy: IdentificationStrategy
  /** Variables to condition on (back-door) */
  adjustmentSet: string[]
  /** Mediators used (front-door) */
  mediatorSet: string[]
  /** Non-causal paths that are successfully blocked */
  blockedPaths: string[][]
  /** Non-causal paths that remain open (if unidentified) */
  unblockedPaths: string[][]
  /** Human-readable explanation for UI display */
  rationale: string
}

// ─── Uncertainty ────────────────────────────────────────────────

export interface UncertaintySource {
  edgeLabel: string
  effN: number
  contribution: number
}

export interface UncertaintyResult {
  low: number
  high: number
  /** Ordered by contribution (largest first) */
  sources: UncertaintySource[]
  /** The single weakest link across all pathways */
  bottleneck: UncertaintySource | null
}

// ─── Re-exports for convenience ─────────────────────────────────

export type { StructuralEdge }
