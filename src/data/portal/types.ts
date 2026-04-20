/**
 * Types for the Bayesian portal export (backend/output/portal_bayesian/*).
 *
 * The canonical schema is defined by backend/serif_scm/export_portal_bayesian.py.
 * Any field changes there must be mirrored here.
 */

export type GateTier = 'recommended' | 'possible' | 'not_exposed'

export type Pathway = 'wearable' | 'biomarker'

export type EvidenceTier =
  | 'cohort_level'
  | 'personal_emerging'
  | 'personal_established'

export type ProtocolOptionLabel =
  | 'single'
  | 'collapsed'
  | 'conservative'
  | 'aggressive'
  | 'up'
  | 'down'

export interface Posterior {
  mean: number
  variance: number
  sd: number
  contraction: number
  prior_mean: number
  prior_variance: number
  source: string
  lam_js: number
  n_cohort: number
  z_like: number
}

export interface CohortPrior {
  mean: number
  variance: number
  n: number
}

export interface UserObs {
  slope: number
  se: number
  n: number
  at_nominal_step: number
  se_at_step: number
  residual_sd: number
  sigma_data_used: number
  pathway?: Pathway
  confounders_adjusted?: string[]
}

export interface GateInfo {
  score: number
  tier: GateTier
}

export interface InsightBayesian {
  action: string
  outcome: string
  pathway?: Pathway
  evidence_tier?: EvidenceTier
  horizon_days?: number
  horizon_display?: string
  supporting_data_description?: string
  nominal_step: number
  dose_multiplier: number
  dose_multiplier_raw: number
  direction_conflict: boolean
  /** True when the engine shrank dose_multiplier so `current + dose` stays
   * inside the participant's per-action feasible range. */
  dose_bounded?: boolean
  unbounded_dose_multiplier?: number
  unbounded_scaled_effect?: number
  scaled_effect: number
  posterior: Posterior
  cohort_prior: CohortPrior | null
  user_obs: UserObs | null
  gate: GateInfo
}

export interface Protocol {
  protocol_id: string
  action: string
  target_value: number
  current_value: number
  delta: number
  unit: string
  option_index: number
  option_label: ProtocolOptionLabel
  supporting_insight_ids: string[]
  outcomes_served: string[]
  gate_tier: GateTier
  weakest_contraction: number
  horizon_days: number
  description: string
  rationale: string
}

export type RegimeKey =
  | 'overreaching_state'
  | 'iron_deficiency_state'
  | 'sleep_deprivation_state'
  | 'inflammation_state'

export type ExplorationKind = 'vary_action' | 'repeat_measurement'

export interface ExplorationRecommendation {
  action: string
  outcome: string
  pathway: Pathway
  kind: ExplorationKind
  rationale: string
  prior_contraction: number
  positivity_flag: string
  user_n: number
}

export interface ReleaseEntry {
  day: number
  protocol_id: string
  framing: string
}

export interface ParticipantPortal {
  pid: number
  cohort: string
  age: number
  is_female: boolean
  effects_bayesian: InsightBayesian[]
  tier_counts: Record<GateTier, number>
  exposed_count: number
  protocols: Protocol[]
  current_values: Record<string, number>
  behavioral_sds: Record<string, number>
  /** Wearable: trailing-14-day mean. Biomarker: most recent draw value.
   * Present only for outcomes with available data. */
  outcome_baselines?: Record<string, number>
  regime_activations?: Partial<Record<RegimeKey, number>>
  release_schedule?: ReleaseEntry[]
  exploration_recommendations?: ExplorationRecommendation[]
}

export interface ParticipantSummary {
  pid: number
  cohort: string
  exposed_count: number
  recommended_count: number
  possible_count: number
  gate_score_sum: number
  regime_activations: Partial<Record<RegimeKey, number>>
  regime_urgency: number
}

export interface ParticipantSummaryFile {
  generated_at: string
  n_participants: number
  participants: ParticipantSummary[]
}

export interface PortalManifest {
  generated_at: string
  engine_version: string
  n_participants: number
  supported_pairs: Array<[string, string]>
  n_supported_pairs?: number
  n_wearable_pairs?: number
  n_biomarker_pairs?: number
  cohort_rename?: Record<string, string>
  evidence_tier_thresholds?: Record<
    Pathway,
    { cohort_level: number; personal_emerging: number }
  >
  per_pathway_tier?: Record<
    Pathway,
    Record<GateTier, number> & Record<EvidenceTier, number>
  >
  n_priors: number
  tier_counts: Record<GateTier, number>
  exposed_total: number
  contraction_p10_p50_p90_mean: [number, number, number, number]
  multiplier_p10_p50_p90_mean: [number, number, number, number]
  direction_conflict_rate: number
  gate_thresholds: { recommended: number; possible: number }
  direction_conflict_discount: number
  variance_floor_mode: 'absolute' | 'mean_scaled'
  mean_scaled_frac: number
  var_inflation: number
  per_edge_tier: Record<string, Record<GateTier, number>>
  protocol_count_total: number
  protocols_per_participant_mean: number
  protocols_per_participant_p10_p50_p90: [number, number, number]
  protocol_option_labels: Record<string, number>
  protocol_action_counts: Record<string, number>
  warnings: string[]
}

export const EXPECTED_ENGINE_VERSION = 'v5-biomarker-widened'
