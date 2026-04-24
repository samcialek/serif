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
  ExplorationRecommendation,
  InsightBayesian,
  ParticipantPortal,
} from '@/data/portal/types'
import { cohensD } from '@/utils/insightStandardization'

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

// ─── Phase 1 heuristic fallbacks ────────────────────────────────

/** Narrowing heuristic per (kind × pathway) — calibrated so the UI has
 *  a plausible ranking signal before Phase 3 backend math lands.
 *  Daily wearable variation contracts faster than infrequent biomarker
 *  repeats, all else equal. */
const NARROW_FALLBACK: Record<string, number> = {
  'vary_action::wearable': 0.6,
  'vary_action::biomarker': 0.45,
  'repeat_measurement::biomarker': 0.4,
  'repeat_measurement::wearable': 0.3,
}

/** Default posterior-SD on d by evidence tier. Used only when backend
 *  hasn't emitted `prior_cohens_d_sd`. */
const PRIOR_D_SD_FALLBACK: Record<string, number> = {
  cohort_level: 0.35,
  personal_emerging: 0.22,
  personal_established: 0.14,
}

/** Find the matching fitted edge in the participant's effects_bayesian,
 *  if one exists — lets us reuse the principled cohensD from Insights. */
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

/** Phase 1 prior-d heuristic: fall back on the cohort-level matching
 *  edge's cohensD when present; otherwise 0 with wide uncertainty. */
function heuristicPriorCohensD(
  rec: ExplorationRecommendation,
  participant: ParticipantPortal,
): number {
  const match = findMatchingEdge(participant, rec.action, rec.outcome)
  if (match) return cohensD(match, participant)
  return 0
}

function heuristicPriorCohensDSD(
  rec: ExplorationRecommendation,
  participant: ParticipantPortal,
): number {
  const match = findMatchingEdge(participant, rec.action, rec.outcome)
  if (match) {
    const tier = match.evidence_tier ?? 'cohort_level'
    return PRIOR_D_SD_FALLBACK[tier] ?? 0.3
  }
  return 0.4
}

function heuristicNarrow(rec: ExplorationRecommendation): number {
  return NARROW_FALLBACK[`${rec.kind}::${rec.pathway}`] ?? 0.4
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
   *  from the backend fields when available, or heuristic defaults. */
  computed: {
    priorD: number
    priorDSD: number
    narrow: number
    horizonDays: number
    band: ExplorationHorizonBand
    /** priorD × narrow — the default sort key, "expected learned
     *  standardized magnitude." */
    infoGain: number
  }
}

export function enrichExplorationEdge(
  rec: ExplorationRecommendation,
  participant: ParticipantPortal,
): ExplorationEdge {
  const priorD =
    rec.prior_cohens_d != null
      ? rec.prior_cohens_d
      : heuristicPriorCohensD(rec, participant)
  const priorDSD =
    rec.prior_cohens_d_sd != null
      ? rec.prior_cohens_d_sd
      : heuristicPriorCohensDSD(rec, participant)
  const narrow =
    rec.expected_posterior_narrow != null
      ? rec.expected_posterior_narrow
      : heuristicNarrow(rec)
  const horizonDays =
    rec.horizon_days != null ? rec.horizon_days : heuristicHorizonDays(rec)
  const band = explorationBandFor(rec.outcome)
  const infoGain = Math.abs(priorD) * narrow
  return {
    ...rec,
    computed: { priorD, priorDSD, narrow, horizonDays, band, infoGain },
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
