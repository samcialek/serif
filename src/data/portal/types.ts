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

/** Where the prior on this (action, outcome) pair came from in the
 *  backend pipeline. `synthetic` = fitted from a real DAG path.
 *  `weak_default` = Layer 0 fallback (N(0, 0.25·pop_SD²)) for pairs the
 *  DAG doesn't yet model — surface only with a "From your data" caveat
 *  because there's no causal adjustment set behind the user OLS.
 *  `synthetic+literature` = DAG fit pooled with a published prior. */
export type PriorProvenance = 'synthetic' | 'weak_default' | 'synthetic+literature'

export interface InsightBayesian {
  action: string
  outcome: string
  pathway?: Pathway
  evidence_tier?: EvidenceTier
  /** Direction of effect supported by established RCT / mechanistic literature,
   * not just the cohort fit. Rendered as a small "Lit" badge in the UI. */
  literature_backed?: boolean
  /** Backend Layer 0 / Layer 1 / Layer 1+lit provenance. Optional for
   * defensive parsing of pre-2026-04-22 fixtures (those rows are all
   * effectively `synthetic` since Layer 0 didn't exist yet). */
  prior_provenance?: PriorProvenance
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

export type LoadKey =
  | 'acwr'
  | 'ctl'
  | 'atl'
  | 'tsb'
  | 'sleep_debt_14d'
  | 'sri_7d'
  | 'training_monotony'
  | 'training_consistency'

export interface LoadValue {
  /** Most recent value for this load. */
  value: number
  /** Personal rolling-mean baseline (default window 28 days). */
  baseline: number
  /** SD over the baseline window. */
  sd: number
  /** Standardised deviation from baseline ((value - baseline) / sd). */
  z: number
  /** value / baseline — stable even when SD is tiny or the load is
   * naturally ratiometric (ACWR, monotony). */
  ratio: number
}

/** Context-driver actions — surfaced as cohort-level priors, not
 * prescribed directly. Mirrors LOAD_ACTIONS in the backend engine. */
export type LoadAction = 'acwr' | 'sleep_debt' | 'travel_load'
export const LOAD_ACTIONS: ReadonlySet<string> = new Set<LoadAction>([
  'acwr',
  'sleep_debt',
  'travel_load',
])
export const isLoadAction = (action: string): boolean =>
  LOAD_ACTIONS.has(action)

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
  /** Today's rolling-load summary (acwr, ctl, sleep_debt_14d, …) with
   * personal-baseline deviations. Present when life_df had data. */
  loads_today?: Partial<Record<LoadKey, LoadValue>>
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
