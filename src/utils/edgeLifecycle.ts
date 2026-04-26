import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import { CONFOUNDERS_BY_OUTCOME } from '@/utils/dailyProtocol'

export type EdgeLifecycleStage =
  | 'population_prior'
  | 'needs_exposure_variation'
  | 'needs_outcome_cadence'
  | 'confounder_blocked'
  | 'positivity_limited'
  | 'estimating'
  | 'personalizing'
  | 'personal_edge'
  | 'recommended_edge'
  | 'needs_refresh'

export type EdgeLifecycleBlocker =
  | 'exposure_variation'
  | 'outcome_cadence'
  | 'confounder_coverage'
  | 'positivity'
  | 'posterior_contraction'
  | 'direction_stability'

export interface EdgeLifecycleAssessment {
  key: string
  edge: InsightBayesian
  stage: EdgeLifecycleStage
  blockers: EdgeLifecycleBlocker[]
  missingConfounders: string[]
  userN: number
  contraction: number
  directionStable: boolean
  positivityLimited: boolean
  priority: number
  nextStep: string
  sourceHint: string
}

export interface EdgeAcquisitionRecommendation {
  blocker: EdgeLifecycleBlocker
  title: string
  sourceHint: string
  rationale: string
  edgeCount: number
  examples: EdgeLifecycleAssessment[]
  priority: number
}

export interface EdgeLifecycleSummary {
  assessments: EdgeLifecycleAssessment[]
  stageCounts: Record<EdgeLifecycleStage, number>
  blockerCounts: Record<EdgeLifecycleBlocker, number>
  recommendations: EdgeAcquisitionRecommendation[]
  personalEdgeCount: number
  blockedEdgeCount: number
  priorOnlyCount: number
}

export const EDGE_LIFECYCLE_STAGE_META: Record<
  EdgeLifecycleStage,
  { label: string; shortLabel: string; tone: 'slate' | 'amber' | 'blue' | 'emerald' | 'rose' }
> = {
  population_prior: { label: 'Model only', shortLabel: 'Model', tone: 'slate' },
  needs_exposure_variation: { label: 'Needs exposure variation', shortLabel: 'Exposure', tone: 'amber' },
  needs_outcome_cadence: { label: 'Needs outcome cadence', shortLabel: 'Cadence', tone: 'amber' },
  confounder_blocked: { label: 'Confounder blocked', shortLabel: 'Confounder', tone: 'rose' },
  positivity_limited: { label: 'Positivity limited', shortLabel: 'Positivity', tone: 'rose' },
  estimating: { label: 'Estimating', shortLabel: 'Estimating', tone: 'blue' },
  personalizing: { label: 'Personalizing', shortLabel: 'Personalizing', tone: 'blue' },
  personal_edge: { label: 'Personal edge', shortLabel: 'Personal', tone: 'emerald' },
  recommended_edge: { label: 'Recommended edge', shortLabel: 'Recommended', tone: 'emerald' },
  needs_refresh: { label: 'Needs refresh', shortLabel: 'Refresh', tone: 'slate' },
}

const STAGE_ORDER: EdgeLifecycleStage[] = [
  'recommended_edge',
  'personal_edge',
  'personalizing',
  'estimating',
  'needs_exposure_variation',
  'needs_outcome_cadence',
  'confounder_blocked',
  'positivity_limited',
  'population_prior',
  'needs_refresh',
]

const BLOCKER_ORDER: EdgeLifecycleBlocker[] = [
  'exposure_variation',
  'outcome_cadence',
  'confounder_coverage',
  'positivity',
  'posterior_contraction',
  'direction_stability',
]

const DAILY_OUTCOMES = new Set([
  'hrv_daily',
  'resting_hr',
  'sleep_duration',
  'sleep_quality',
  'sleep_efficiency',
  'sleep_onset_latency',
  'deep_sleep',
  'rem_sleep',
])

const CONTEXT_ACTIONS = new Set([
  'acwr',
  'aqi',
  'daylight_hours',
  'heat_index',
  'heat_index_c',
  'humidity_pct',
  'season',
  'sleep_debt',
  'temp_c',
  'travel_load',
  'uv_index',
])

const WEATHER_CONFOUNDERS: Record<string, keyof NonNullable<ParticipantPortal['weather_today']>> = {
  heat_index: 'heat_index_c',
  heat_index_c: 'heat_index_c',
  temp_c: 'temp_c',
  humidity_pct: 'humidity_pct',
  uv_index: 'uv_index',
  aqi: 'aqi',
}

const LOAD_CONFOUNDERS: Record<string, string> = {
  acwr: 'acwr',
  sleep_debt: 'sleep_debt_14d',
  travel_load: 'travel_load',
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function edgeKey(edge: InsightBayesian): string {
  return `${edge.action}->${edge.outcome}`
}

function prettifyId(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bHrv\b/g, 'HRV')
    .replace(/\bHscrp\b/g, 'hsCRP')
    .replace(/\bAqi\b/g, 'AQI')
    .replace(/\bUv\b/g, 'UV')
}

export function formatEdgeLabel(edge: InsightBayesian): string {
  return `${prettifyId(edge.action)} to ${prettifyId(edge.outcome)}`
}

function isOutcomeCadenceThin(edge: InsightBayesian, participant: ParticipantPortal, userN: number): boolean {
  const hasOutcome = participant.outcome_baselines?.[edge.outcome] != null
  const isDaily = edge.pathway === 'wearable' || DAILY_OUTCOMES.has(edge.outcome)
  const minN = isDaily ? 14 : 6
  if (!hasOutcome && !isDaily) return true
  return userN > 0 && userN < minN
}

function isExposureThin(edge: InsightBayesian, participant: ParticipantPortal, userN: number): boolean {
  if (CONTEXT_ACTIONS.has(edge.action)) return false
  if (edge.gate.tier === 'not_exposed') return true
  const sd = participant.behavioral_sds?.[edge.action]
  if (typeof sd === 'number' && Number.isFinite(sd) && sd < 1e-6) return true
  return userN > 0 && userN < 10
}

function hasObservedConfounder(
  key: string,
  participant: ParticipantPortal,
  adjusted: Set<string>,
): boolean {
  if (adjusted.has(key)) return true
  if (key === 'season' || key === 'is_weekend' || key === 'location') return true
  const weatherKey = WEATHER_CONFOUNDERS[key]
  if (weatherKey) return participant.weather_today?.[weatherKey] != null
  const loadKey = LOAD_CONFOUNDERS[key]
  if (loadKey === 'sleep_debt_14d') return participant.loads_today?.sleep_debt_14d != null
  if (loadKey === 'acwr') return participant.loads_today?.acwr != null
  return false
}

function missingConfoundersFor(edge: InsightBayesian, participant: ParticipantPortal): string[] {
  const required = CONFOUNDERS_BY_OUTCOME[edge.outcome] ?? []
  const adjusted = new Set(edge.user_obs?.confounders_adjusted ?? [])
  return required.filter((key) => !hasObservedConfounder(key, participant, adjusted))
}

function isPositivityLimited(edge: InsightBayesian): boolean {
  if (edge.dose_bounded) return true
  const bounded = Math.abs(edge.dose_multiplier ?? 0)
  const raw = Math.abs(edge.unbounded_dose_multiplier ?? edge.dose_multiplier_raw ?? bounded)
  return raw > 0 && bounded > 0 && bounded < raw * 0.8
}

function directionStable(edge: InsightBayesian): boolean {
  if (edge.direction_conflict) return false
  const mean = Math.abs(edge.posterior.mean)
  const sd = Math.max(0, edge.posterior.sd)
  if (edge.literature_backed && mean >= 0.03) return true
  return mean >= Math.max(0.04, sd * 0.35)
}

function sourceHintForBlocker(
  blocker: EdgeLifecycleBlocker,
  edge: InsightBayesian,
  missingConfounders: string[],
): string {
  if (blocker === 'exposure_variation') return 'Structured lever variation'
  if (blocker === 'outcome_cadence') {
    if (edge.outcome === 'glucose' || edge.outcome === 'insulin') return 'CGM or monthly metabolic labs'
    if (edge.pathway === 'biomarker') return 'Monthly lab cadence'
    return 'Daily wearable stream'
  }
  if (blocker === 'confounder_coverage') {
    if (missingConfounders.some((c) => WEATHER_CONFOUNDERS[c])) return 'Weather and AQI feed'
    if (missingConfounders.includes('travel_load')) return 'Calendar or travel log'
    if (missingConfounders.includes('vitamin_d')) return 'Vitamin D lab or sunlight proxy'
    return 'Context logging'
  }
  if (blocker === 'positivity') return 'Comparable contrast days'
  if (blocker === 'direction_stability') return 'Replication window'
  return 'Continue current collection'
}

function nextStepForStage(
  stage: EdgeLifecycleStage,
  edge: InsightBayesian,
  blockers: EdgeLifecycleBlocker[],
  missingConfounders: string[],
): string {
  const primary = blockers[0]
  if (primary === 'exposure_variation') {
    return `Create safe variation in ${prettifyId(edge.action)} across comparable days.`
  }
  if (primary === 'outcome_cadence') {
    return `Increase ${prettifyId(edge.outcome)} cadence enough to cross the model-personal inflection.`
  }
  if (primary === 'confounder_coverage') {
    return `Capture ${missingConfounders.map(prettifyId).join(', ')} before calling this personal.`
  }
  if (primary === 'positivity') {
    return 'Collect matched high and low exposure days in the same causal context.'
  }
  if (primary === 'direction_stability') {
    return 'Replicate the edge in a second window before promoting it.'
  }
  if (stage === 'recommended_edge') return 'Eligible for recommendation language.'
  if (stage === 'personal_edge') return 'Personal enough to drive Twin and Insights confidence.'
  return 'Keep collecting until the posterior contracts further.'
}

function priorityFor(edge: InsightBayesian, blockers: EdgeLifecycleBlocker[]): number {
  const effect = Math.abs(edge.scaled_effect ?? edge.posterior.mean ?? 0)
  const uncertainty = Math.max(0, 1 - clamp01(edge.posterior.contraction))
  const gate = clamp01(edge.gate.score ?? 0)
  return effect * 50 + uncertainty * 25 + gate * 15 + blockers.length * 5
}

export function classifyEdgeLifecycle(
  edge: InsightBayesian,
  participant: ParticipantPortal,
): EdgeLifecycleAssessment {
  const userN = edge.user_obs?.n ?? 0
  const contraction = clamp01(edge.posterior.contraction)
  const missingConfounders = missingConfoundersFor(edge, participant)
  const positivityLimited = isPositivityLimited(edge)
  const stable = directionStable(edge)
  const blockers: EdgeLifecycleBlocker[] = []

  if (isExposureThin(edge, participant, userN)) blockers.push('exposure_variation')
  if (isOutcomeCadenceThin(edge, participant, userN)) blockers.push('outcome_cadence')
  if (missingConfounders.length > 0) blockers.push('confounder_coverage')
  if (positivityLimited) blockers.push('positivity')
  if (contraction < 0.55) blockers.push('posterior_contraction')
  if (!stable) blockers.push('direction_stability')

  let stage: EdgeLifecycleStage
  if (!edge.user_obs && edge.gate.tier !== 'recommended') {
    stage = 'population_prior'
  } else if (blockers.includes('exposure_variation')) {
    stage = 'needs_exposure_variation'
  } else if (blockers.includes('outcome_cadence')) {
    stage = 'needs_outcome_cadence'
  } else if (blockers.includes('confounder_coverage')) {
    stage = 'confounder_blocked'
  } else if (blockers.includes('positivity')) {
    stage = 'positivity_limited'
  } else if (edge.gate.tier === 'recommended' && contraction >= 0.65 && stable) {
    stage = 'recommended_edge'
  } else if (edge.evidence_tier === 'personal_established' && contraction >= 0.55 && stable) {
    stage = 'personal_edge'
  } else if (contraction >= 0.4 && stable) {
    stage = 'personalizing'
  } else {
    stage = 'estimating'
  }

  const primaryBlocker = blockers[0] ?? 'posterior_contraction'
  return {
    key: edgeKey(edge),
    edge,
    stage,
    blockers,
    missingConfounders,
    userN,
    contraction,
    directionStable: stable,
    positivityLimited,
    priority: priorityFor(edge, blockers),
    nextStep: nextStepForStage(stage, edge, blockers, missingConfounders),
    sourceHint: sourceHintForBlocker(primaryBlocker, edge, missingConfounders),
  }
}

function recommendationCopy(blocker: EdgeLifecycleBlocker, sourceHint: string): { title: string; rationale: string } {
  switch (blocker) {
    case 'exposure_variation':
      return {
        title: 'Create safe action variation',
        rationale: 'These edges have outcomes, but the lever has not moved enough to identify a personal slope.',
      }
    case 'outcome_cadence':
      return {
        title: 'Increase outcome cadence',
        rationale: 'The action varies, but the outcome is too episodic or sparse to shrink the posterior.',
      }
    case 'confounder_coverage':
      return {
        title: 'Fill context coverage',
        rationale: 'The backdoor set is not fully observed, so the edge should stay below personal status.',
      }
    case 'positivity':
      return {
        title: 'Collect comparable contrast days',
        rationale: 'The model needs overlap: high and low exposure days under similar context.',
      }
    case 'direction_stability':
      return {
        title: 'Replicate direction',
        rationale: 'The effect direction is not stable enough to recommend confidently.',
      }
    default:
      return {
        title: sourceHint,
        rationale: 'More observations would move population weight toward personal weight.',
      }
  }
}

export function buildEdgeLifecycleSummary(participant: ParticipantPortal): EdgeLifecycleSummary {
  const assessments = participant.effects_bayesian
    .map((edge) => classifyEdgeLifecycle(edge, participant))
    .sort((a, b) => b.priority - a.priority)

  const stageCounts = Object.fromEntries(STAGE_ORDER.map((stage) => [stage, 0])) as Record<EdgeLifecycleStage, number>
  const blockerCounts = Object.fromEntries(BLOCKER_ORDER.map((blocker) => [blocker, 0])) as Record<EdgeLifecycleBlocker, number>

  for (const assessment of assessments) {
    stageCounts[assessment.stage] += 1
    for (const blocker of assessment.blockers) blockerCounts[blocker] += 1
  }

  const byBlocker = new Map<EdgeLifecycleBlocker, EdgeLifecycleAssessment[]>()
  for (const blocker of BLOCKER_ORDER) byBlocker.set(blocker, [])
  for (const assessment of assessments) {
    for (const blocker of assessment.blockers) {
      byBlocker.get(blocker)?.push(assessment)
    }
  }

  const recommendations = BLOCKER_ORDER.flatMap((blocker): EdgeAcquisitionRecommendation[] => {
    const examples = (byBlocker.get(blocker) ?? [])
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 4)
    if (examples.length === 0) return []
    const sourceHint = examples[0].sourceHint
    const copy = recommendationCopy(blocker, sourceHint)
    return [{
      blocker,
      title: copy.title,
      sourceHint,
      rationale: copy.rationale,
      edgeCount: byBlocker.get(blocker)?.length ?? 0,
      examples,
      priority: examples.reduce((sum, item) => sum + item.priority, 0),
    }]
  }).sort((a, b) => b.priority - a.priority)

  const personalEdgeCount =
    stageCounts.personal_edge + stageCounts.recommended_edge + stageCounts.personalizing
  const blockedEdgeCount =
    stageCounts.needs_exposure_variation +
    stageCounts.needs_outcome_cadence +
    stageCounts.confounder_blocked +
    stageCounts.positivity_limited

  return {
    assessments,
    stageCounts,
    blockerCounts,
    recommendations,
    personalEdgeCount,
    blockedEdgeCount,
    priorOnlyCount: stageCounts.population_prior,
  }
}
