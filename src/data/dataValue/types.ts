// ─── Data Value Tab Type Definitions ─────────────────────────────

export interface DoseFamilyDef {
  id: string
  label: string
  columns: string[]
  unit: string
  compleCategory: string // "C" | "L" | "M"
}

export interface ResponseFamilyDef {
  id: string
  label: string
  columns: string[]
  unit: string
  compleCategory: string // "M" | "O"
  biologicalTimescale: 'fast' | 'medium' | 'slow'
}

export interface MechanismDef {
  id: string
  name: string
  doseFamily: string
  responseFamily: string
  category: 'metabolic' | 'cardio' | 'recovery' | 'sleep'
  mechanism: string
}

export interface StructuralEdge {
  source: string
  target: string
  edgeType: 'causal' | 'confounds'
}

export interface MechanismCatalogData {
  doseFamilies: Record<string, DoseFamilyDef>
  responseFamilies: Record<string, ResponseFamilyDef>
  mechanisms: MechanismDef[]
  structuralEdges: StructuralEdge[]
  latentNodes: string[]
  nodeToColumns: Record<string, string[]>
  deviceToColumns: Record<string, string[]>
}

/** A single fitted edge from the pipeline output */
export interface EdgeResult {
  title: string
  source: string
  target: string
  curve: string
  theta: number
  theta_unit: string
  theta_ci: string
  bb: number
  ba: number
  bb_desc: string
  ba_desc: string
  effect_unit: string
  eff_n: number
  raw_n: number
  personal_pct: number
  /**
   * 'literature' — hand-parameterized from published studies (round coefficients,
   * low eff_n). Position confidence via theta_CI is not meaningful; gate-suppress
   * when personal data is insufficient. See serif_engine_lessons.md #10.
   * 'fitted' — derived from data; eff_n and theta_ci are real estimates.
   */
  provenance: 'literature' | 'fitted'
}

/** Existing data source summary */
export interface ExistingDataSource {
  id: string
  name: string
  icon: string // lucide icon name
  category: string
  edgesParticipating: number
  totalEdges: number
  columns: string[]
  avgPersonalPct: number
  avgEffN: number
  /** Connection health. 'syncing' = live & recent; 'issue' = stale, disconnected, or other problem. */
  status: 'syncing' | 'issue'
  /** Short human-readable status line ('Syncing · 2h ago' / 'Paired but not streaming · 26h since last packet'). */
  statusDetail?: string
}

/** A candidate data source to evaluate */
export interface CandidateDataSource {
  id: string
  name: string
  icon: string // lucide icon name
  category: string
  description: string
  exampleProducts: string[]
  newDoseFamilies: string[]
  newResponseFamilies: string[]
  newColumns: string[]
  frequency: string
  /** 2-3 curated narratives about the most interesting edges this source would affect */
  keyEdgeNarratives: Array<{
    edgeTitle: string
    narrative: string
    type: 'unlock' | 'boost' | 'confounder'
  }>
}

/** Marginal value score for a candidate data source */
export interface MarginalValueScore {
  candidateId: string
  composite: number // 0-100
  newEdgesUnlocked: number
  newEdgePoints: number // up to 40
  confoundersResolved: number
  confounderPoints: number // up to 30
  signalBoostEdges: number
  signalBoostPoints: number // up to 30
  tier: 'transformative' | 'high' | 'moderate' | 'low'
  unlockedMechanisms: MechanismDef[]
  resolvedLatentNodes: string[]
  boostedEdgeTitles: string[]
}

/** Testability classification of a mechanism */
export interface MechanismTestability {
  mechanism: MechanismDef
  testable: boolean
  hasDoseData: boolean
  hasResponseData: boolean
  missingDoseFamilies: string[]
  missingResponseFamilies: string[]
}
