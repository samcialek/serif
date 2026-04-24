/**
 * Exploration helpers — enrich backend-emitted exploration recs with
 * standardised-effect-size estimates so the v2 view can rank and render
 * them consistently with Insights v2.
 *
 * Phase 1 is deliberately heuristic: where the backend hasn't emitted
 * `prior_cohens_d`, `prior_cohens_d_sd`, or `expected_posterior_narrow`
 * yet, we fill in defaults so the UI can already sort by "expected
 * learned magnitude" (priorD × narrow). Phase 3 swaps these for the
 * principled conjugate-update values emitted from the engine.
 */

import type {
  ExperimentSpec,
  ExplorationRecommendation,
  InsightBayesian,
  ParticipantPortal,
  Pathway,
} from '@/data/portal/types'
import { cohensD, cohensDSD } from '@/utils/insightStandardization'
import { prescriptionFor } from '@/utils/experimentPrescription'

/** Mirrors the horizon-band taxonomy used by Insights v2 so the two
 *  tabs agree on what "quotidian" vs "longevity" means. */
export type ExplorationHorizonBand = 'quotidian' | 'monthly' | 'longterm'

const OUTCOME_HORIZON: Record<string, ExplorationHorizonBand> = {
  hrv_daily: 'quotidian',
  resting_hr: 'monthly',
  sleep_quality: 'quotidian',
  sleep_efficiency: 'quotidian',
  deep_sleep: 'quotidian',
  rem_sleep: 'quotidian',
  sleep_onset_latency: 'quotidian',
  cortisol: 'monthly',
  glucose: 'monthly',
  insulin: 'monthly',
  hba1c: 'longterm',
  hscrp: 'monthly',
  apob: 'longterm',
  ldl: 'longterm',
  hdl: 'longterm',
  triglycerides: 'longterm',
  ferritin: 'longterm',
  hemoglobin: 'longterm',
  iron_total: 'longterm',
  zinc: 'longterm',
  testosterone: 'longterm',
  vo2_peak: 'longterm',
  body_fat_pct: 'longterm',
}

export const EXPLORATION_BAND_ORDER: ExplorationHorizonBand[] = [
  'quotidian',
  'monthly',
  'longterm',
]

export const EXPLORATION_BAND_LABEL: Record<
  ExplorationHorizonBand,
  { title: string; blurb: string }
> = {
  quotidian: {
    title: 'Quotidian',
    blurb: 'Experiments that pay off in days — wearable signals.',
  },
  monthly: {
    title: 'Monthly',
    blurb: 'Weeks-to-month biomarkers — worth repeating a draw for.',
  },
  longterm: {
    title: 'Long-term',
    blurb: 'Slow biology — lipids, hormones, body composition.',
  },
}

export function explorationBandFor(outcome: string): ExplorationHorizonBand {
  return OUTCOME_HORIZON[outcome] ?? 'longterm'
}

/** ScopeRegime → set of horizon bands, identical to Insights v2's
 *  `bandsForRegime` so the cross-tab regime toggle behaves the same. */
export function bandsForRegime(
  regime: 'quotidian' | 'longevity' | 'all',
): Set<ExplorationHorizonBand> {
  if (regime === 'quotidian') return new Set<ExplorationHorizonBand>(['quotidian'])
  if (regime === 'longevity') {
    return new Set<ExplorationHorizonBand>(['monthly', 'longterm'])
  }
  return new Set<ExplorationHorizonBand>(EXPLORATION_BAND_ORDER)
}

// ─── Info-gain math (conjugate-Normal update) ───────────────────

/** Effective per-day observation density per pathway, on the
 *  standardized-d scale. Wearables deliver one slope-informative
 *  observation per day; biomarker draws are sparse, so a "daily"
 *  biomarker experiment is diluted to 1/14. */
const OBS_PER_DAY_BY_PATHWAY: Record<Pathway, number> = {
  wearable: 1,
  biomarker: 1 / 14,
}

/** Per-observation residual SD on the d scale after confounder
 *  adjustment. After outcome-SD scaling, one wearable day sits ~0.4σ
 *  from the true slope. Conservative default; could be calibrated per
 *  outcome in a follow-up. */
const SIGMA_OBS_D = 0.4

/** Fallback tier SDs when no matching edge exists in effects_bayesian
 *  (shouldn't happen for properly-emitted exploration recs, but guards
 *  against stale or partial data). */
const PRIOR_D_SD_FALLBACK: Record<string, number> = {
  cohort_level: 0.35,
  personal_emerging: 0.22,
  personal_established: 0.14,
}

/** Find the matching fitted edge in the participant's effects_bayesian,
 *  if one exists. Lets us reuse the principled cohensD / cohensDSD
 *  (which already account for shape, local tangent, personal action
 *  SD, etc.) instead of recomputing from the posterior. */
function findMatchingEdge(
  participant: ParticipantPortal,
  action: string,
  outcome: string,
): InsightBayesian | null {
  const rows = participant.effects_bayesian ?? []
  for (const e of rows) {
    if (e.action === action && e.outcome === outcome) return e
  }
  return null
}

function computePriorCohensD(
  rec: ExplorationRecommendation,
  participant: ParticipantPortal,
): number {
  const match = findMatchingEdge(participant, rec.action, rec.outcome)
  if (match) return cohensD(match, participant)
  return 0
}

function computePriorCohensDSD(
  rec: ExplorationRecommendation,
  participant: ParticipantPortal,
): number {
  const match = findMatchingEdge(participant, rec.action, rec.outcome)
  if (match) {
    const sd = cohensDSD(match, participant)
    if (sd > 1e-9) return sd
    const tier = match.evidence_tier ?? 'cohort_level'
    return PRIOR_D_SD_FALLBACK[tier] ?? 0.3
  }
  return 0.4
}

/** Effective sample size on the standardized-d scale for a given
 *  experiment spec and pathway. One-shot draws count as n=1; daily /
 *  weekly cadences scale by duration × obs-per-day adjusted for
 *  weekly density when cadence is n_per_week. */
function effectiveSampleSize(
  spec: ExperimentSpec,
  pathway: Pathway,
): number {
  if (spec.cadence === 'one_shot') return 1
  const obsPerDay = OBS_PER_DAY_BY_PATHWAY[pathway] ?? 1
  if (spec.cadence === 'daily') {
    return Math.max(1, spec.duration_days * obsPerDay)
  }
  // n_per_week
  const weeklyFraction = (spec.n_per_week ?? 3) / 7
  return Math.max(1, spec.duration_days * obsPerDay * weeklyFraction)
}

/** Conjugate-Normal update on the slope. Returns the fraction of the
 *  prior-SD that a successful experiment would eliminate.
 *
 *    σ_post² = 1 / (1/σ_prior² + n_eff / σ_obs²)
 *    narrow  = 1 − σ_post / σ_prior
 *
 *  Clamped to [0, 1]. Returns 0 when priorSD is effectively zero
 *  (nothing left to tighten). */
export function principledNarrow(
  priorDSD: number,
  spec: ExperimentSpec,
  pathway: Pathway,
): number {
  if (priorDSD < 1e-9) return 0
  const n_eff = effectiveSampleSize(spec, pathway)
  const sigma_prior_sq = priorDSD * priorDSD
  const sigma_obs_sq = SIGMA_OBS_D * SIGMA_OBS_D
  const sigma_post_sq = 1 / (1 / sigma_prior_sq + n_eff / sigma_obs_sq)
  const sigma_post = Math.sqrt(sigma_post_sq)
  return Math.max(0, Math.min(1, 1 - sigma_post / priorDSD))
}

/** Horizon_days fallback — use the rec's outcome mapping. */
const FALLBACK_HORIZON_DAYS: Record<string, number> = {
  hrv_daily: 4,
  sleep_quality: 3,
  sleep_efficiency: 3,
  deep_sleep: 3,
  rem_sleep: 3,
  sleep_onset_latency: 2,
  resting_hr: 14,
  cortisol: 14,
  glucose: 21,
  insulin: 28,
  hba1c: 60,
  hscrp: 21,
  apob: 60,
  ldl: 60,
  hdl: 60,
  triglycerides: 45,
  ferritin: 90,
  hemoglobin: 90,
  iron_total: 30,
  zinc: 45,
  testosterone: 45,
  vo2_peak: 60,
  body_fat_pct: 60,
}

function heuristicHorizonDays(rec: ExplorationRecommendation): number {
  return FALLBACK_HORIZON_DAYS[rec.outcome] ?? 60
}

// ─── Enriched edge ──────────────────────────────────────────────

export interface ExplorationEdge extends ExplorationRecommendation {
  /** Derived values used by the UI. Always present — either copied
   *  from the backend fields when available, or computed client-side
   *  with the same conjugate-Normal math. */
  computed: {
    priorD: number
    priorDSD: number
    narrow: number
    horizonDays: number
    band: ExplorationHorizonBand
    /** priorD × narrow — the default sort key, "expected learned
     *  standardized magnitude." */
    infoGain: number
    /** Resolved experiment spec used to compute narrow. Cached so the
     *  detail panel doesn't re-derive it. */
    spec: ExperimentSpec
  }
}

export function enrichExplorationEdge(
  rec: ExplorationRecommendation,
  participant: ParticipantPortal,
): ExplorationEdge {
  // 1. Prior on the slope, in standardized-d units.
  const priorD =
    rec.prior_cohens_d != null
      ? rec.prior_cohens_d
      : computePriorCohensD(rec, participant)
  const priorDSD =
    rec.prior_cohens_d_sd != null
      ? rec.prior_cohens_d_sd
      : computePriorCohensDSD(rec, participant)

  // 2. Experiment prescription — depends on priorD (for feasibility),
  //    not on narrow, so we can compute it before narrow.
  const spec = prescriptionFor(rec, participant, priorD)

  // 3. Expected posterior narrowing — conjugate-Normal update. Prefer
  //    backend-emitted value when present (Phase 3b will switch this
  //    on once the engine re-emits).
  const narrow =
    rec.expected_posterior_narrow != null
      ? rec.expected_posterior_narrow
      : principledNarrow(priorDSD, spec, rec.pathway)

  const horizonDays =
    rec.horizon_days != null ? rec.horizon_days : heuristicHorizonDays(rec)
  const band = explorationBandFor(rec.outcome)
  const infoGain = Math.abs(priorD) * narrow

  return {
    ...rec,
    computed: { priorD, priorDSD, narrow, horizonDays, band, infoGain, spec },
  }
}

// ─── Ranking ────────────────────────────────────────────────────

export type ExplorationSort = 'infogain' | 'feasibility' | 'horizon'

const FLAG_RANK: Record<string, number> = {
  ok: 0,
  marginal: 1,
  insufficient: 2,
}

export function rankExplorations(
  edges: ExplorationEdge[],
  sort: ExplorationSort,
): ExplorationEdge[] {
  const copy = edges.slice()
  if (sort === 'infogain') {
    copy.sort((a, b) => b.computed.infoGain - a.computed.infoGain)
  } else if (sort === 'feasibility') {
    copy.sort((a, b) => {
      const ra = FLAG_RANK[a.positivity_flag] ?? 3
      const rb = FLAG_RANK[b.positivity_flag] ?? 3
      if (ra !== rb) return ra - rb
      return b.computed.infoGain - a.computed.infoGain
    })
  } else {
    copy.sort((a, b) => a.computed.horizonDays - b.computed.horizonDays)
  }
  return copy
}

/** Horizon string for chips — matches Insights v2's "14d / 4w / 3mo". */
export function horizonLabelFor(days: number): string {
  if (days < 10) return `${Math.round(days)}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  return `${Math.round(days / 30)}mo`
}
