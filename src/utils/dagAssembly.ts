/**
 * Edge & node unification for the Edge Map DAG mode.
 *
 * Pulls four sources, dedupes by (source, target), and emits typed
 * DagNode/DagEdge arrays the layout function consumes:
 *
 *   1. participant.effects_bayesian  — member-fitted (Caspian's posteriors)
 *   2. PHASE_1_EDGES                 — canonical literature priors
 *   3. PHASE_2_EDGES                 — additive literature priors
 *   4. ENVIRONMENTAL_EDGES           — heat/AQI/UV/travel/daylight literature
 *   5. STRUCTURAL_EDGES              — mechanism backbone (mediator chains, confounders)
 *
 * Tier ranking when a pair appears in multiple sources:
 *   member > cohort > literature > mechanism
 *
 * The DagEdge.effect uses the highest-tier source's value. Lower-tier
 * appearances flip provenance flags (fromMember/fromLiterature/fromMechanism)
 * but don't overwrite magnitude.
 */

import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'
import { PHASE_2_EDGES } from '@/data/scm/syntheticEdgesV2'
import { ENVIRONMENTAL_EDGES } from '@/data/scm/environmentalEdges'
import { STRUCTURAL_EDGES } from '@/data/dataValue/mechanismCatalog'
import type { SyntheticEdgeSpec } from '@/data/scm/syntheticEdges'
import type { StructuralEdge } from '@/data/dataValue/types'
import { beneficialDirection } from './rounding'
import { prettyEdgeId } from './edgeEvidence'
import {
  classifyOperational,
  horizonForOutcome,
  inferCausalKind,
  pathwayForOutcome,
  systemFor,
} from './dagClassify'
import type {
  CausalKind,
  DagEdge,
  DagNode,
  EvidenceTier,
  Horizon,
} from './dagTypes'

// ─── Public API ─────────────────────────────────────────────────────

export interface AssembleOptions {
  /** Include the structural-mediator backbone (chain edges + confounders).
   *  Defaults true. Disable for a thinner action→outcome-only view. */
  includeStructural?: boolean
  /** Include literature priors (PHASE_1, PHASE_2, ENV). Defaults true. */
  includeLiterature?: boolean
}

export interface AssembledDag {
  nodes: DagNode[]
  edges: DagEdge[]
}

/** Build the unified DAG for a participant. Pure function — no side effects.
 *  Output is deterministic and stable to use as a useMemo key target. */
export function assembleDag(
  participant: ParticipantPortal,
  options: AssembleOptions = {},
): AssembledDag {
  const includeStructural = options.includeStructural ?? true
  const includeLiterature = options.includeLiterature ?? true

  const edgeMap = new Map<string, DagEdge>()

  // ─── 1. Member-fitted edges (Caspian's posteriors) ──────────────
  for (const e of participant.effects_bayesian ?? []) {
    upsertMemberEdge(edgeMap, e)
  }

  // ─── 2. Literature priors ───────────────────────────────────────
  if (includeLiterature) {
    for (const spec of PHASE_1_EDGES) upsertLiteratureEdge(edgeMap, spec)
    for (const spec of PHASE_2_EDGES) upsertLiteratureEdge(edgeMap, spec)
    for (const spec of ENVIRONMENTAL_EDGES) upsertLiteratureEdge(edgeMap, spec)
  }

  // ─── 3. Structural backbone ─────────────────────────────────────
  if (includeStructural) {
    for (const se of STRUCTURAL_EDGES) upsertStructuralEdge(edgeMap, se)
  }

  const edges = [...edgeMap.values()]

  // ─── 4. Build node set with degrees + Caspian-relevance ─────────
  const nodes = buildNodes(edges)

  return { nodes, edges }
}

// ─── Edge upserts ──────────────────────────────────────────────────

function edgeKey(source: string, target: string, kind: 'causal' | 'confounds'): string {
  // Confounds and causal are kept separate — the same pair can appear
  // as both (e.g. travel_load → hrv_daily is in STRUCTURAL_EDGES as
  // 'confounds' and could also appear in literature as 'causal').
  return `${source}->${target}::${kind}`
}

function upsertMemberEdge(map: Map<string, DagEdge>, edge: InsightBayesian): void {
  const key = edgeKey(edge.action, edge.outcome, 'causal')
  const existing = map.get(key)

  // Determine evidence tier from the participant's edge. 'personal_*' = member,
  // 'cohort_level' = cohort. Default cohort if absent.
  const memberTier: EvidenceTier =
    edge.evidence_tier === 'personal_emerging' ||
    edge.evidence_tier === 'personal_established'
      ? 'member'
      : 'cohort'

  const post = edge.posterior
  const effect = post?.mean ?? edge.scaled_effect ?? 0
  const effectSd = post?.sd ?? 0.5
  const horizonDays = edge.horizon_days
  const pathway = edge.pathway
  const horizon = horizonFromDaysAndPathway(horizonDays, pathway, edge.outcome)

  if (!existing) {
    map.set(key, {
      source: edge.action,
      target: edge.outcome,
      kind: 'causal',
      fromMember: true,
      fromLiterature: edge.literature_backed === true,
      fromMechanism: false,
      effect,
      effectSd,
      beneficial: beneficialFor(edge.outcome, effect),
      horizon,
      pathway,
      horizonDays,
      evidenceTier: memberTier,
      rationale: edge.supporting_data_description,
    })
    return
  }

  // Merge: member tier wins. Promote provenance flags.
  existing.fromMember = true
  if (edge.literature_backed) existing.fromLiterature = true
  // member > cohort > literature > mechanism
  if (compareTier(memberTier, existing.evidenceTier) > 0) {
    existing.evidenceTier = memberTier
    existing.effect = effect
    existing.effectSd = effectSd
    existing.beneficial = beneficialFor(edge.outcome, effect)
    if (horizonDays != null) existing.horizonDays = horizonDays
    if (pathway != null) existing.pathway = pathway
    existing.horizon = horizon
    existing.rationale = edge.supporting_data_description ?? existing.rationale
  }
}

function upsertLiteratureEdge(
  map: Map<string, DagEdge>,
  spec: SyntheticEdgeSpec,
): void {
  const key = edgeKey(spec.action, spec.outcome, 'causal')
  const existing = map.get(key)
  const horizon = horizonFromDaysAndPathway(
    spec.horizonDays,
    spec.pathway,
    spec.outcome,
  )

  if (!existing) {
    map.set(key, {
      source: spec.action,
      target: spec.outcome,
      kind: 'causal',
      fromMember: false,
      fromLiterature: true,
      fromMechanism: false,
      effect: spec.mean,
      effectSd: 0.5,
      beneficial: beneficialFor(spec.outcome, spec.mean),
      horizon,
      pathway: spec.pathway,
      horizonDays: spec.horizonDays,
      evidenceTier: 'literature',
      rationale: spec.rationale,
    })
    return
  }

  existing.fromLiterature = true
  // Lower-tier source — only fill in fields the higher-tier didn't have.
  if (compareTier('literature', existing.evidenceTier) > 0) {
    existing.evidenceTier = 'literature'
    existing.effect = spec.mean
    existing.effectSd = 0.5
    existing.beneficial = beneficialFor(spec.outcome, spec.mean)
    existing.horizon = horizon
    existing.horizonDays = spec.horizonDays
    existing.pathway = spec.pathway
    existing.rationale = spec.rationale
  } else if (existing.rationale == null) {
    existing.rationale = spec.rationale
  }
}

function upsertStructuralEdge(
  map: Map<string, DagEdge>,
  se: StructuralEdge,
): void {
  const key = edgeKey(se.source, se.target, se.edgeType)
  const existing = map.get(key)

  if (!existing) {
    map.set(key, {
      source: se.source,
      target: se.target,
      kind: se.edgeType,
      fromMember: false,
      fromLiterature: false,
      fromMechanism: true,
      effect: 0,
      effectSd: 1,
      beneficial: null,
      horizon: 'quarter', // safe default; structural edges have no defined response time
      pathway: pathwayForOutcome(se.target),
      evidenceTier: 'mechanism',
    })
    return
  }
  existing.fromMechanism = true
}

// ─── Helpers ────────────────────────────────────────────────────────

function compareTier(a: EvidenceTier, b: EvidenceTier): number {
  // member > cohort > literature > mechanism
  const rank: Record<EvidenceTier, number> = {
    member: 4,
    cohort: 3,
    literature: 2,
    mechanism: 1,
  }
  return rank[a] - rank[b]
}

function beneficialFor(outcome: string, effect: number): boolean | null {
  const dir = beneficialDirection(outcome)
  if (dir === 'neutral') return null
  if (Math.abs(effect) < 1e-6) return null
  if (dir === 'higher') return effect > 0
  return effect < 0
}

function horizonFromDaysAndPathway(
  days: number | undefined,
  pathway: string | undefined,
  outcome: string,
): Horizon {
  // Priority: explicit pathway → outcome lookup → days fallback.
  if (pathway === 'wearable') return 'week'
  if (pathway === 'biomarker') return 'quarter'
  // No pathway: use the outcome map.
  const fromOutcome = horizonForOutcome(outcome)
  if (fromOutcome === 'week') return 'week'
  if (fromOutcome === 'quarter') return 'quarter'
  // Fall back to days if available.
  if (days != null) {
    return days <= 14 ? 'week' : 'quarter'
  }
  return 'quarter'
}

// ─── Node construction ─────────────────────────────────────────────

function buildNodes(edges: DagEdge[]): DagNode[] {
  // Track per-node: degrees, role appearances, member relevance.
  interface Tally {
    asSource: number
    asTarget: number
    asConfounder: number
    fromMember: boolean
  }
  const tally = new Map<string, Tally>()

  function bump(id: string): Tally {
    let t = tally.get(id)
    if (!t) {
      t = { asSource: 0, asTarget: 0, asConfounder: 0, fromMember: false }
      tally.set(id, t)
    }
    return t
  }

  for (const e of edges) {
    const s = bump(e.source)
    const t = bump(e.target)
    if (e.kind === 'confounds') {
      s.asConfounder += 1
    } else {
      s.asSource += 1
      t.asTarget += 1
    }
    if (e.fromMember) {
      s.fromMember = true
      t.fromMember = true
    }
  }

  const nodes: DagNode[] = []
  for (const [id, t] of tally) {
    const causalKind = inferCausalKind(id, {
      asSource: t.asSource,
      asTarget: t.asTarget,
      asConfounder: t.asConfounder,
    })
    const operationalClass = classifyOperational(id, causalKind)
    nodes.push({
      id,
      label: prettyEdgeId(id),
      causalKind,
      operationalClass,
      system: systemFor(id),
      inDegree: t.asTarget,
      outDegree: t.asSource + t.asConfounder,
      caspianRelevant: t.fromMember,
    })
  }

  // Stable order — id sort, deterministic.
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return nodes
}
