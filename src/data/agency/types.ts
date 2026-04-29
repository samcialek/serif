/**
 * Agency graph
 *
 * Fingerprint answers: "What is distinctive about this member?"
 * Agency answers: "Given that, what can they do, steer, respect, or observe?"
 */

import type { ParticipantPortal } from '@/data/portal/types'

export type AgencyKind = 'do' | 'steer' | 'respect' | 'observe'

export type AgencyNodeKind =
  | 'action'
  | 'load'
  | 'context'
  | 'state'
  | 'biomarker'
  | 'outcome'
  | 'regime'

export type AgencyTimeScale =
  | 'today'
  | 'days'
  | 'weeks'
  | 'months'
  | 'quarter'

export type AgencyRating =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'

export type AgencyEdgeSign = 'benefit' | 'harm' | 'mixed' | 'context'

export type AgencyCausalShape =
  | 'linear'
  | 'threshold'
  | 'inverted_u'
  | 'u_shaped'
  | 'lagged'
  | 'state_gate'
  | 'protective'

export type AgencyEvidenceSource =
  | 'fingerprint'
  | 'portal_bayesian'
  | 'protocol'
  | 'literature'
  | 'curated'

export interface AgencyEvidenceRef {
  source: AgencyEvidenceSource
  id: string
  label: string
}

export interface AgencyNode {
  id: string
  label: string
  kind: AgencyNodeKind
  agencyKind: AgencyKind
  timeScale: AgencyTimeScale
  description: string
  unit?: string
  memoryWindowDays?: number
  manipulability: AgencyRating
  cost: AgencyRating
  reversibility: AgencyRating
  affordance: string
  tags?: string[]
}

export interface AgencyEdge {
  id: string
  source: string
  target: string
  sign: AgencyEdgeSign
  causalShape: AgencyCausalShape
  effectSize: number
  confidence: number
  horizonDays: number
  claim: string
  action: string
  outcome: string
  holdConstant: string[]
  watch: string[]
  substitutes: string[]
  tradeoffs: string[]
  evidence: AgencyEvidenceRef[]
  context?: string[]
  tags?: string[]
}

export interface AgencyGraph {
  participantPid: number
  id: string
  title: string
  nodes: AgencyNode[]
  edges: AgencyEdge[]
}

export type AgencyRecommendationGroup =
  | 'do_today'
  | 'steer_this_week'
  | 'respect_today'
  | 'observe_recheck'

export type AgencyViewHorizon = 'today' | 'week' | 'quarter'

export interface AgencyScoringOptions {
  horizon?: AgencyViewHorizon
  maxPerGroup?: number
  priorityTags?: string[]
}

export interface AgencyScoringContext {
  participant?: ParticipantPortal | null
  options?: AgencyScoringOptions
}

export interface AgencyRecommendation {
  id: string
  group: AgencyRecommendationGroup
  score: number
  edge: AgencyEdge
  source: AgencyNode
  target: AgencyNode
  title: string
  rationale: string
  horizonLabel: string
  priorityReasons: string[]
}

export interface AgencyObservation {
  id: string
  node: AgencyNode
  score: number
  reason: string
  horizonLabel: string
  drivenBy: string[]
}

export interface AgencyPlan {
  graph: AgencyGraph
  recommendations: AgencyRecommendation[]
  byGroup: Record<AgencyRecommendationGroup, AgencyRecommendation[]>
  observations: AgencyObservation[]
}

export interface AgencyExplanation {
  because: string
  holdConstant: AgencyNode[]
  watch: AgencyNode[]
  substitutes: AgencyNode[]
  tradeoffs: string[]
}
