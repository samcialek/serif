/**
 * Shared types for the Edge Map DAG mode.
 *
 * Two layered taxonomies:
 *   - causal kind  (action | exposure | mediator | context | outcome)
 *     — the SCM role; what the node *does* in the graph
 *   - operational class  (dose | load | field | constant | target | mediator)
 *     — the agency the user has over it
 *
 * Vocabulary locked 2026-04-26. See memory/project_dag_vocabulary.md for the
 * full rationale. The verbs matter:
 *   I PULL doses · I BUILD loads · I NAVIGATE fields · I ACCEPT constants ·
 *   I MOVE targets via causes
 */

/** SCM role — already used elsewhere in EdgeMapView. */
export type CausalKind = 'action' | 'exposure' | 'mediator' | 'context' | 'outcome'

/** Operational class — the agency layer over the SCM role. */
export type OperationalClass =
  | 'dose'      // pulled daily, instant onset (bedtime, caffeine, supps)
  | 'load'      // built over weeks (ACWR, sleep_debt_14d, training_consistency)
  | 'field'     // imposed by environment (heat, AQI, season, travel, weekend)
  | 'constant'  // fixed traits (age, sex, archetype) — kept off-graph as a side card
  | 'target'    // outcomes (wearables + biomarkers) — moved via causes
  | 'mediator'  // internal physiology between cause and target

/** Physiological system used for within-band grouping. */
export type PhysSystem =
  | 'sleep'
  | 'autonomic'
  | 'iron'
  | 'lipids'
  | 'hormones'
  | 'inflammation'
  | 'metabolic'
  | 'body_comp'
  | 'cardio'
  | 'renal'
  | 'immune'
  | 'training'      // for action-side grouping (training behaviors)
  | 'diet'          // dietary actions
  | 'supplements'   // supp_*
  | 'environment'   // for FIELD nodes
  | 'other'

/**
 * Outcome-evaluation horizon. Three values, locked at user request:
 *   - tomorrow: when a DOSE is pulled (action timing only — never an outcome window)
 *   - week:     wearables resolve over a week of repeated daily doses
 *   - quarter:  biomarkers and fitness adaptation resolve at 90 days
 *
 * Edges between non-confounder pairs always carry one of the three. Hard
 * rule: never present a same-day outcome prediction.
 */
export type Horizon = 'tomorrow' | 'week' | 'quarter'

/**
 * Evidence tier for the edge's effect estimate.
 *   - member:     fitted on this participant's data (Caspian's posteriors win)
 *   - cohort:     fitted on cohort, not yet personalized
 *   - literature: prior only (PHASE_1 / PHASE_2 / ENV)
 *   - mechanism:  structural backbone, no magnitude
 */
export type EvidenceTier = 'member' | 'cohort' | 'literature' | 'mechanism'

export interface DagNode {
  id: string
  label: string
  causalKind: CausalKind
  operationalClass: OperationalClass
  system: PhysSystem
  inDegree: number
  outDegree: number
  /** True if this node appears in any member-fitted edge for the active
   *  participant. Drives the solid-vs-dotted node border. */
  caspianRelevant: boolean
}

export interface DagEdge {
  source: string
  target: string
  kind: 'causal' | 'confounds'

  /** Provenance — multiple flags may be true if the edge appears in
   *  several sources. */
  fromMember: boolean
  fromLiterature: boolean
  fromMechanism: boolean

  /** Best summary for visual encoding. Member posterior wins; else
   *  literature mean; else 0 for mechanism-only edges. */
  effect: number       // signed, [-1, 1] scale
  effectSd: number     // posterior SD; 0.5 default for literature, 1 for mechanism
  /** True if effect direction matches the outcome's beneficial direction;
   *  null when undefined (e.g. outcome has no clear "good direction"). */
  beneficial: boolean | null

  /** Outcome-evaluation horizon. See Horizon comment. */
  horizon: Horizon
  pathway?: 'wearable' | 'biomarker' | 'mediator'
  /** Raw days carried from the source spec; horizon is derived from this. */
  horizonDays?: number

  evidenceTier: EvidenceTier

  /** Optional detail surfaced in tooltips and side panels. */
  rationale?: string
  mechanism?: string
}

/** Output of layoutDag — pure positional metadata, no DOM. */
export interface LaidOutDag {
  /** Node id → absolute (x, y) center. */
  positions: Map<string, { x: number; y: number }>
  /** Node id → column index (0..5). */
  columns: Map<string, number>
  /** Bounding box of the laid-out graph in the same coordinate space. */
  bbox: { width: number; height: number }
  /** Per-column system group separators, for rendering gutter labels. */
  groupSeparators: Array<{
    column: number
    system: PhysSystem
    yTop: number
    yBottom: number
  }>
}

/** Column ordering, left → right. Stable indices used by both layout and
 *  the renderer. */
export const DAG_COLUMNS = [
  'context',     // 0 — FIELDS
  'exposure',    // 1 — LOADS
  'action',      // 2 — DOSES
  'mediator',    // 3 — MEDIATORS
  'wearable',    // 4 — WEARABLE TARGETS
  'biomarker',   // 5 — BIOMARKER TARGETS
] as const
export type DagColumn = (typeof DAG_COLUMNS)[number]
