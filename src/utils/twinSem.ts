/**
 * Twin-SEM counterfactual schedule picker.
 *
 * Given a participant's Bayesian edge posteriors + current regime state,
 * enumerates candidate daily schedules, scores each by forward-propagating
 * through the load-bearing outcome edges, and picks the top schedule.
 *
 * Scoring:
 *   outcome_change     = (delta_action / nominal_step) * posterior.mean
 *   conflict_discount  = 0.5 if direction_conflict else 1.0
 *   user_benefit       = outcome_change * sign(beneficial_direction)
 *   tier_weight        = 1.0 (established) | 0.7 (emerging) | 0.4 (cohort)
 *   contribution       = user_benefit * tier_weight * conflict_discount * obj.weight
 *   total              = Σ contributions − regime_penalty
 *
 * The result is a ranked list: chosen schedule + runners-up, each with
 * per-outcome projections so the UI can render "HRV 52 → 57 ↑" alongside
 * "why this beat the alternative".
 */

import type { InsightBayesian, ParticipantPortal, RegimeKey } from '@/data/portal/types'
import { beneficialDirection } from '@/utils/rounding'

// Actions that can appear in a candidate schedule.
export type ScheduleActionKey =
  | 'bedtime'
  | 'sleep_duration'
  | 'training_load'
  | 'training_volume'
  | 'running_volume'
  | 'zone2_volume'

// A training session is a preset that couples training_load / training_volume /
// running_volume / zone2_volume together — in reality these are entailed by one
// choice ("what workout today?"), so we don't search them independently.
export type SessionKind = 'rest' | 'easy_z2' | 'moderate' | 'hard_intervals'

export interface SessionPreset {
  kind: SessionKind
  label: string
  icon: string
  time: string // HH:MM when the session happens
  training_load: number // TRIMP/day
  training_volume: number // hours
  running_volume: number // km
  zone2_volume: number // km
  description: string
}

export const SESSION_PRESETS: Record<SessionKind, SessionPreset> = {
  rest: {
    kind: 'rest',
    label: 'Rest day',
    icon: '🧘',
    time: '—',
    training_load: 0,
    training_volume: 0,
    running_volume: 0,
    zone2_volume: 0,
    description: 'Mobility + easy walking only — no structured training',
  },
  easy_z2: {
    kind: 'easy_z2',
    label: 'Easy Zone 2',
    icon: '🚴',
    time: '16:30',
    training_load: 45,
    training_volume: 1.0,
    running_volume: 0,
    zone2_volume: 8,
    description: '60 min bike or steady jog, HR 130–145',
  },
  moderate: {
    kind: 'moderate',
    label: 'Moderate run',
    icon: '🏃',
    time: '16:30',
    training_load: 85,
    training_volume: 1.25,
    running_volume: 8,
    zone2_volume: 4,
    description: '50 min steady-state, HR 140–155',
  },
  hard_intervals: {
    kind: 'hard_intervals',
    label: 'Hard intervals',
    icon: '⚡',
    time: '16:30',
    training_load: 160,
    training_volume: 1.0,
    running_volume: 6,
    zone2_volume: 0,
    description: '10 × 3 min @ VO2max with 2 min recovery',
  },
}

// Decimal hours — 22:00, 22:30, 23:00.
export const BEDTIME_OPTIONS = [22.0, 22.5, 23.0]

// Participant-specific wake time derived from current bedtime + sleep duration.
export function derivedWakeTime(p: ParticipantPortal): number {
  const bed = p.current_values?.bedtime ?? 22.5
  const dur = p.current_values?.sleep_duration ?? 8
  let wake = bed + dur - 24
  if (wake < 0) wake += 24
  if (wake >= 24) wake -= 24
  return wake
}

export interface CandidateSchedule {
  bedtime: number // decimal hours
  session: SessionKind
  sleep_duration: number // hours — derived from bedtime + wake time
}

export interface ObjectiveOutcome {
  outcome: string
  weight: number
  /** Outcomes sharing a group contribute under a shared label (e.g., iron panel). */
  group?: string
  groupLabel?: string
}

// Load-bearing outcomes for Caspian — matches the 6 edges we identified:
// sleep_quality, hrv_daily, cortisol, glucose, apob + iron-panel composite.
// Weights reflect tier × mechanistic relevance for a sleep-deprived
// endurance athlete.
export const OBJECTIVE_ORON: ObjectiveOutcome[] = [
  { outcome: 'sleep_quality', weight: 1.0 },
  { outcome: 'hrv_daily', weight: 1.0 },
  { outcome: 'cortisol', weight: 0.7 },
  { outcome: 'glucose', weight: 0.5 },
  { outcome: 'apob', weight: 0.6 },
  { outcome: 'ferritin', weight: 0.25, group: 'iron', groupLabel: 'Iron panel' },
  { outcome: 'hemoglobin', weight: 0.25, group: 'iron', groupLabel: 'Iron panel' },
  { outcome: 'iron_total', weight: 0.25, group: 'iron', groupLabel: 'Iron panel' },
  { outcome: 'zinc', weight: 0.2, group: 'iron', groupLabel: 'Iron panel' },
]

const TIER_WEIGHT: Record<string, number> = {
  personal_established: 1.0,
  personal_emerging: 0.7,
  cohort_level: 0.4,
}

const CONFLICT_DISCOUNT = 0.5

interface RegimePenaltyRule {
  regime: RegimeKey
  minActivation: number
  evaluate: (
    activation: number,
    schedule: CandidateSchedule,
  ) => { penalty: number; label?: string }
}

const REGIME_RULES: RegimePenaltyRule[] = [
  {
    regime: 'sleep_deprivation_state',
    minActivation: 0.5,
    evaluate: (act, s) => {
      const lateness = Math.max(0, s.bedtime - 22.0)
      const tooShort = Math.max(0, 8.0 - s.sleep_duration)
      const penalty = act * (lateness * 1.2 + tooShort * 0.8)
      return {
        penalty,
        label: penalty > 0 ? 'Sleep-deprived: later bedtime / short sleep penalized' : undefined,
      }
    },
  },
  {
    regime: 'overreaching_state',
    minActivation: 0.3,
    evaluate: (act, s) => {
      const tl = SESSION_PRESETS[s.session].training_load
      const over = Math.max(0, tl - 60) / 60
      const penalty = act * over * 1.2
      return {
        penalty,
        label: penalty > 0 ? 'Overreaching: heavy load penalized' : undefined,
      }
    },
  },
  {
    regime: 'inflammation_state',
    minActivation: 0.3,
    evaluate: (act, s) => {
      const tl = SESSION_PRESETS[s.session].training_load
      const over = Math.max(0, tl - 80) / 80
      const penalty = act * over * 0.9
      return {
        penalty,
        label: penalty > 0 ? 'Inflammation: hard training penalized' : undefined,
      }
    },
  },
  {
    regime: 'iron_deficiency_state',
    minActivation: 0.3,
    evaluate: (act, s) => {
      const rv = SESSION_PRESETS[s.session].running_volume
      const over = Math.max(0, rv - 4) / 8
      const penalty = act * over * 1.3
      return {
        penalty,
        label: penalty > 0 ? 'Iron-deficient: high run volume penalized' : undefined,
      }
    },
  },
]

export interface OutcomeContribution {
  outcome: string
  action: ScheduleActionKey
  tier: string
  pathway: string
  delta_action: number
  nominal_step: number
  posterior_mean: number
  direction_conflict: boolean
  benefit_direction: 'higher' | 'lower' | 'neutral'
  outcome_change: number // absolute change in outcome units
  user_benefit: number // sign-flipped for user (outcome_change * dir sign)
  tier_weight: number
  weight: number
  group?: string
  weighted_contribution: number
}

export interface OutcomeProjection {
  outcome: string
  group?: string
  groupLabel?: string
  baseline: number | null
  projected: number | null
  delta: number
  benefit_direction: 'higher' | 'lower' | 'neutral'
  is_user_benefit: boolean
  contributions: OutcomeContribution[]
  weighted_total: number
}

export interface ScoredSchedule {
  schedule: CandidateSchedule
  total: number
  outcomeScore: number
  regimePenalty: number
  regimeLabels: string[]
  components: OutcomeContribution[]
  projections: OutcomeProjection[]
  groupTotals: Record<string, { label: string; total: number }>
}

function findEffect(
  effects: InsightBayesian[],
  action: string,
  outcome: string,
): InsightBayesian | null {
  // Protocols (dose-targeting) require a causal mechanism: dose curves,
  // direction-conflict logic, and the dose-effectiveness gauge all assume
  // the edge has a structural fit. Layer 0 weak-default rows are an
  // unadjusted confounded slope — exclude them from scoring so a strong
  // OLS signal on a non-mechanistic pair never drives a recommendation.
  const matches = effects.filter(
    (e) =>
      e.action === action &&
      e.outcome === outcome &&
      e.prior_provenance !== 'weak_default',
  )
  if (matches.length === 0) return null
  const tierOrder = ['personal_established', 'personal_emerging', 'cohort_level']
  matches.sort(
    (a, b) =>
      tierOrder.indexOf(a.evidence_tier ?? 'cohort_level') -
      tierOrder.indexOf(b.evidence_tier ?? 'cohort_level'),
  )
  return matches[0]
}

function scheduleActionValues(
  s: CandidateSchedule,
): Record<ScheduleActionKey, number> {
  const session = SESSION_PRESETS[s.session]
  return {
    bedtime: s.bedtime,
    sleep_duration: s.sleep_duration,
    training_load: session.training_load,
    training_volume: session.training_volume,
    running_volume: session.running_volume,
    zone2_volume: session.zone2_volume,
  }
}

export function scoreSchedule(
  participant: ParticipantPortal,
  schedule: CandidateSchedule,
  objective: ObjectiveOutcome[] = OBJECTIVE_ORON,
): ScoredSchedule {
  const candidateValues = scheduleActionValues(schedule)
  const current = participant.current_values || {}
  const baselines = participant.outcome_baselines || {}
  const components: OutcomeContribution[] = []

  const projectionMap: Record<string, OutcomeProjection> = {}

  for (const obj of objective) {
    const dir = beneficialDirection(obj.outcome)
    const dirSign = dir === 'higher' ? 1 : dir === 'lower' ? -1 : 0
    const baseline = baselines[obj.outcome] ?? null
    const proj: OutcomeProjection = {
      outcome: obj.outcome,
      group: obj.group,
      groupLabel: obj.groupLabel,
      baseline,
      projected: baseline,
      delta: 0,
      benefit_direction: dir,
      is_user_benefit: false,
      contributions: [],
      weighted_total: 0,
    }

    for (const actionKey of Object.keys(candidateValues) as ScheduleActionKey[]) {
      const candidateValue = candidateValues[actionKey]
      const edge = findEffect(participant.effects_bayesian, actionKey, obj.outcome)
      if (!edge) continue
      const currentValue = current[actionKey] ?? 0
      const deltaAction = candidateValue - currentValue
      // nominal_step is signed: negative when the beneficial direction
      // decreases the action (e.g., bedtime's nominal_step is -0.5h =
      // "go to bed 30 min earlier"). Only skip if the step is exactly 0.
      if (Math.abs(deltaAction) < 1e-9 || edge.nominal_step === 0) continue

      const conflictDiscount = edge.direction_conflict ? CONFLICT_DISCOUNT : 1.0
      const outcomeChange =
        (deltaAction / edge.nominal_step) * edge.posterior.mean * conflictDiscount

      const userBenefit =
        dir === 'neutral' ? 0 : outcomeChange * dirSign
      const tierW = TIER_WEIGHT[edge.evidence_tier ?? 'cohort_level'] ?? 0.4
      const weighted = userBenefit * tierW * obj.weight

      const comp: OutcomeContribution = {
        outcome: obj.outcome,
        action: actionKey,
        tier: edge.evidence_tier ?? 'cohort_level',
        pathway: edge.pathway ?? 'wearable',
        delta_action: deltaAction,
        nominal_step: edge.nominal_step,
        posterior_mean: edge.posterior.mean,
        direction_conflict: edge.direction_conflict,
        benefit_direction: dir,
        outcome_change: outcomeChange,
        user_benefit: userBenefit,
        tier_weight: tierW,
        weight: obj.weight,
        group: obj.group,
        weighted_contribution: weighted,
      }
      components.push(comp)
      proj.contributions.push(comp)
      proj.delta += outcomeChange
      proj.weighted_total += weighted
    }
    if (baseline != null) proj.projected = baseline + proj.delta
    proj.is_user_benefit =
      dir === 'neutral' ? false : Math.sign(proj.delta) === dirSign && proj.delta !== 0
    projectionMap[obj.outcome] = proj
  }

  // Group totals (e.g., iron panel aggregates 4 outcomes into one line).
  const groupTotals: Record<string, { label: string; total: number }> = {}
  for (const proj of Object.values(projectionMap)) {
    if (!proj.group) continue
    const key = proj.group
    if (!groupTotals[key])
      groupTotals[key] = { label: proj.groupLabel ?? key, total: 0 }
    groupTotals[key].total += proj.weighted_total
  }

  const outcomeScore = components.reduce((s, c) => s + c.weighted_contribution, 0)

  // Regime penalty.
  const regimes = participant.regime_activations || {}
  let regimePenalty = 0
  const regimeLabels: string[] = []
  for (const rule of REGIME_RULES) {
    const act = regimes[rule.regime] ?? 0
    if (act < rule.minActivation) continue
    const { penalty, label } = rule.evaluate(act, schedule)
    regimePenalty += penalty
    if (label && !regimeLabels.includes(label)) regimeLabels.push(label)
  }

  const projections = objective
    .filter((obj, idx, self) => self.findIndex((o) => o.outcome === obj.outcome) === idx)
    .map((obj) => projectionMap[obj.outcome])
    .filter((p): p is OutcomeProjection => Boolean(p))

  return {
    schedule,
    total: outcomeScore - regimePenalty,
    outcomeScore,
    regimePenalty,
    regimeLabels,
    components,
    projections,
    groupTotals,
  }
}

export function enumerateSchedules(participant: ParticipantPortal): CandidateSchedule[] {
  const wake = derivedWakeTime(participant)
  const sessions: SessionKind[] = ['rest', 'easy_z2', 'moderate', 'hard_intervals']
  const out: CandidateSchedule[] = []
  for (const bedtime of BEDTIME_OPTIONS) {
    const sleep_duration = 24 - bedtime + wake
    for (const session of sessions) {
      out.push({ bedtime, session, sleep_duration })
    }
  }
  return out
}

export interface CounterfactualResult {
  best: ScoredSchedule
  alternatives: ScoredSchedule[]
  all: ScoredSchedule[]
}

export function pickOptimalSchedule(
  participant: ParticipantPortal,
  objective: ObjectiveOutcome[] = OBJECTIVE_ORON,
): CounterfactualResult {
  const candidates = enumerateSchedules(participant)
  const scored = candidates.map((c) => scoreSchedule(participant, c, objective))
  scored.sort((a, b) => b.total - a.total)
  return {
    best: scored[0],
    alternatives: scored.slice(1, 4),
    all: scored,
  }
}

// Human-readable diff between two schedules ("vs chosen: +0.4 HRV, −0.3 cortisol").
export interface ScheduleDiff {
  bedtimeDelta: number // hours
  sessionChange: { from: SessionKind; to: SessionKind } | null
  topOutcomeDeltas: Array<{ outcome: string; delta: number; beneficial: boolean }>
  totalDelta: number
}

export function diffSchedules(base: ScoredSchedule, compare: ScoredSchedule): ScheduleDiff {
  const bedtimeDelta = compare.schedule.bedtime - base.schedule.bedtime
  const sessionChange =
    compare.schedule.session !== base.schedule.session
      ? { from: base.schedule.session, to: compare.schedule.session }
      : null
  const byOutcome: Record<string, { delta: number; beneficial: boolean }> = {}
  for (const proj of base.projections) {
    byOutcome[proj.outcome] = { delta: -proj.delta, beneficial: proj.is_user_benefit }
  }
  for (const proj of compare.projections) {
    const existing = byOutcome[proj.outcome] ?? { delta: 0, beneficial: false }
    byOutcome[proj.outcome] = {
      delta: existing.delta + proj.delta,
      beneficial: proj.is_user_benefit,
    }
  }
  const topOutcomeDeltas = Object.entries(byOutcome)
    .map(([outcome, v]) => ({ outcome, delta: v.delta, beneficial: v.beneficial }))
    .filter((d) => Math.abs(d.delta) > 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)
  return {
    bedtimeDelta,
    sessionChange,
    topOutcomeDeltas,
    totalDelta: compare.total - base.total,
  }
}
