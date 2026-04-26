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

export interface PersonalizationEvidence {
  member_specific_pct: number
  model_pct: number
  coverage_pct: number
  narrowing_pct: number
  observations: number
  basis: 'member_rows_and_posterior' | 'model_only' | string
}

/** Where the prior on this (action, outcome) pair came from in the
 *  backend pipeline. `synthetic` is the legacy wire key for a fitted
 *  model-derived DAG path.
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
   * defensive parsing of pre-2026-04-22 fixtures. */
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
  personalization?: PersonalizationEvidence
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
  clipped_at_ceiling?: boolean
  unclipped_value?: number | null
  optimizer_score?: number
  expected_utility?: number
  uncertainty_penalty?: number
  feasibility_penalty?: number
  evidence_quality?: number
  objective_key?: string
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

/** Weather columns emitted alongside loads. */
export type WeatherKey =
  | 'temp_c'
  | 'humidity_pct'
  | 'uv_index'
  | 'heat_index_c'
  | 'aqi'

export interface WeatherLocation {
  location_id?: string | null
  city?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
  timezone?: string | null
  confidence?: number | null
  source?: string | null
}

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

export type ExperimentCadence = 'daily' | 'n_per_week' | 'one_shot'

export type ExperimentFeasibility =
  | 'ready'
  | 'needs_baseline'
  | 'seasonal'
  | 'blocked'

export interface ExperimentSpec {
  /** For vary_action: [lo, hi] delta from the user's current value, in
   * native units. For repeat_measurement: [0, 0] (not used). */
  action_range_delta: [number, number]
  cadence: ExperimentCadence
  n_per_week?: number
  duration_days: number
  washout_days?: number
  feasibility: ExperimentFeasibility
  feasibility_note?: string
}

export interface ExplorationRecommendation {
  action: string
  outcome: string
  pathway: Pathway
  kind: ExplorationKind
  rationale: string
  prior_contraction: number
  positivity_flag: string
  user_n: number
  // ─── Phase 2/3 fields — optional until backend emits them ─────────
  /** Standardized expected slope under the cohort prior (Cohen's d
   * units). Heuristic default is computed client-side from
   * effects_bayesian when absent. */
  prior_cohens_d?: number
  /** Uncertainty on prior_cohens_d (SD of d). */
  prior_cohens_d_sd?: number
  /** Fraction of the uncertainty on the slope (σ_prior → σ_post) that a
   * successful experiment would eliminate. ∈ [0, 1]. */
  expected_posterior_narrow?: number
  /** Days until the outcome stabilises after the action changes — drives
   * horizon banding and experiment duration sanity. */
  horizon_days?: number
  /** Concrete experiment prescription — filled by Phase 2. */
  experiment?: ExperimentSpec
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
  /** Last 14 days of each load, oldest-first. Last entry == loads_today.value.
   * Drives per-item causal sparklines (#5) and yesterday-vs-today diff (#4). */
  loads_history?: Partial<Record<LoadKey, number[]>>
  /** Last 14 days of each regime activation, oldest-first. Last entry
   * matches regime_activations. Drives the yesterday-vs-today pick diff. */
  regimes_history?: Partial<Record<RegimeKey, number[]>>
  /** Today's weather at the participant's current modeled location. */
  weather_today?: Partial<Record<WeatherKey, number>>
  weather_location_today?: WeatherLocation
  /** Last 14 days of each weather column, oldest-first. */
  weather_history?: Partial<Record<WeatherKey, number[]>>
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
