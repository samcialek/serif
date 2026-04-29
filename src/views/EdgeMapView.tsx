import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Beaker,
  CalendarClock,
  CloudSun,
  Compass,
  Database,
  GitBranch,
  Gauge,
  Layers3,
  LineChart,
  ListChecks,
  Microscope,
  Network,
  Route,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { DagCanvas } from '@/components/portal/DagCanvas'
import { PageLayout } from '@/components/layout'
import {
  Card,
  DataModeToggle,
  EdgeEvidenceChip,
  ScopeBar,
} from '@/components/common'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import { useScopeStore } from '@/stores/scopeStore'
import {
  BG_CANVAS,
  BG_CARD,
  BG_CARD_WARM,
  BG_TRACK,
  CONF_COLORS,
  LINE,
  TEXT_BODY,
  TEXT_INK,
  TEXT_MUTED,
} from '@/styles/painterlyTokens'
import { cn } from '@/utils/classNames'
import {
  evidenceCounts,
  prettyEdgeId,
  scopeBlurb,
  scopeLabel,
  scopedEdgesForRegime,
  personalizationForEdge,
  weightedPersonalizationPct,
} from '@/utils/edgeEvidence'
import { posteriorKindForEdge } from '@/utils/edgeProvenance'
import { explorationBandFor } from '@/utils/exploration'
import { beneficialDirection, formatActionValue } from '@/utils/rounding'

type VisualMode = 'pathway' | 'intervention' | 'matrix' | 'dag'

type NodeKind = 'action' | 'exposure' | 'mediator' | 'context' | 'outcome'

interface CausalNode {
  id: string
  kind: NodeKind
  label: string
  eyebrow: string
  detail: string
  icon: LucideIcon
  mutable: boolean
  observable: boolean
  cadence: string
}

interface CausalLeg {
  id: string
  from: string
  to: string
  label: string
  detail: string
  strengthPct: number
  uncertaintyPct: number
  tone: 'member' | 'mixed' | 'model'
}

interface EdgeStory {
  key: string
  edge: InsightBayesian
  title: string
  subtitle: string
  nodes: CausalNode[]
  legs: CausalLeg[]
  confounders: string[]
  modifiers: string[]
  affordances: Affordance[]
  score: number
}

interface Affordance {
  kind: 'intervene' | 'measure' | 'context' | 'cadence' | 'caution'
  label: string
  detail: string
  score: number
  icon: LucideIcon
}

interface TabAuditItem {
  tab: string
  icon: LucideIcon
  role: string
  strong: string
  watch: string
  next: string
}

const MODES: Array<{
  id: VisualMode
  label: string
  icon: LucideIcon
  description: string
}> = [
  {
    id: 'pathway',
    label: 'Pathway',
    icon: Workflow,
    description: 'Action to outcome with context and evidence on each leg.',
  },
  {
    id: 'intervention',
    label: 'Intervention',
    icon: Route,
    description: 'Where a coach can act, measure, or wait.',
  },
  {
    id: 'matrix',
    label: 'Matrix',
    icon: BarChart3,
    description: 'Many edges compared by the same affordance attributes.',
  },
  {
    id: 'dag',
    label: 'DAG',
    icon: GitBranch,
    description: 'Full directed graph: every edge, every node, panable.',
  },
]

const PREFERRED_EDGE_KEYS = [
  'late_meal_count->glucose',
  'post_meal_walks->glucose',
  'fiber_g->triglycerides',
  'cycle_luteal_phase->glucose',
  'bedroom_temp_c->deep_sleep',
  'bedtime->sleep_quality',
  'caffeine_timing->sleep_onset_latency',
  'training_load->hrv_daily',
  'zone2_minutes->hrv_daily',
  'supp_melatonin->sleep_quality',
  'supp_l_theanine->sleep_quality',
  'supp_zinc->zinc',
  'dietary_energy->glucose',
  'dietary_protein->body_fat_pct',
  'alcohol_timing->sleep_quality',
  'active_energy->resting_hr',
]

const CONTEXT_ACTIONS = new Set([
  'temp_c',
  'heat_index_c',
  'humidity_pct',
  'aqi',
  'uv_index',
  'daylight_hours',
  'sleep_debt',
  'travel_load',
  'acwr',
  'training_monotony',
])

const ACTION_LABELS: Record<string, string> = {
  bedtime: 'Bedtime',
  wake_time: 'Wake time',
  workout_time: 'Workout timing',
  sleep_duration: 'Sleep duration',
  sleep_quality: 'Sleep quality',
  caffeine_mg: 'Caffeine dose',
  caffeine_timing: 'Caffeine timing',
  alcohol_units: 'Alcohol dose',
  alcohol_timing: 'Alcohol timing',
  training_load: 'Training load',
  training_volume: 'Training volume',
  zone2_minutes: 'Zone 2 minutes',
  zone4_5_minutes: 'Zone 4-5 minutes',
  resistance_training_minutes: 'Resistance training',
  dietary_protein: 'Protein',
  dietary_energy: 'Energy intake',
  carbohydrate_g: 'Carbohydrates',
  fiber_g: 'Fiber',
  late_meal_count: 'Late meals',
  post_meal_walks: 'Post-meal walks',
  active_energy: 'Active energy',
  bedroom_temp_c: 'Bedroom temperature',
  cycle_luteal_phase: 'Luteal phase',
  luteal_symptom_score: 'Luteal symptoms',
  steps: 'Steps',
  supp_omega3: 'Omega-3',
  supp_magnesium: 'Magnesium',
  supp_vitamin_d: 'Vitamin D',
  supp_b_complex: 'B-complex',
  supp_creatine: 'Creatine',
  supp_melatonin: 'Melatonin',
  supp_l_theanine: 'L-theanine',
  supp_zinc: 'Zinc',
  temp_c: 'Temperature',
  heat_index_c: 'Heat index',
  humidity_pct: 'Humidity',
  aqi: 'AQI',
  uv_index: 'UV',
  daylight_hours: 'Daylight',
  sleep_debt: 'Sleep debt',
  travel_load: 'Travel load',
  acwr: 'ACWR',
}

const OUTCOME_LABELS: Record<string, string> = {
  hrv_daily: 'HRV',
  resting_hr: 'Resting HR',
  sleep_quality: 'Sleep quality',
  sleep_efficiency: 'Sleep efficiency',
  sleep_onset_latency: 'Sleep onset',
  deep_sleep: 'Deep sleep',
  rem_sleep: 'REM sleep',
  hscrp: 'hs-CRP',
  apob: 'apoB',
  ldl: 'LDL',
  hdl: 'HDL',
  triglycerides: 'Triglycerides',
  glucose: 'Glucose',
  insulin: 'Insulin',
  cortisol: 'Cortisol',
  ferritin: 'Ferritin',
  hemoglobin: 'Hemoglobin',
  zinc: 'Zinc',
  magnesium_rbc: 'RBC magnesium',
  vo2_peak: 'VO2 peak',
  body_fat_pct: 'Body fat',
  testosterone: 'Testosterone',
}

const KIND_STYLE: Record<
  NodeKind,
  { bg: string; border: string; text: string; chip: string }
> = {
  action: {
    bg: '#f8fbfd',
    border: '#cfe5f1',
    text: '#356f93',
    chip: 'bg-sky-50 text-sky-700 border-sky-100',
  },
  exposure: {
    bg: '#fff9ed',
    border: '#ecd8a4',
    text: '#8a6420',
    chip: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  mediator: {
    bg: '#f7fbf7',
    border: '#cfe1d4',
    text: '#51705b',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  context: {
    bg: '#fbf7f2',
    border: '#eadccd',
    text: '#80644f',
    chip: 'bg-stone-50 text-stone-700 border-stone-100',
  },
  outcome: {
    bg: '#fbf7fb',
    border: '#e5d1e5',
    text: '#7a587a',
    chip: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100',
  },
}

const AFFORDANCE_STYLE: Record<
  Affordance['kind'],
  { bg: string; border: string; text: string }
> = {
  intervene: { bg: '#f1f8f4', border: '#cfe1d4', text: '#4f735a' },
  measure: { bg: '#f8fbfd', border: '#cfe5f1', text: '#356f93' },
  context: { bg: '#fff9ed', border: '#ecd8a4', text: '#8a6420' },
  cadence: { bg: '#fbf7fb', border: '#e5d1e5', text: '#7a587a' },
  caution: { bg: '#fbf6f2', border: '#edcbbd', text: '#8b4830' },
}

const TAB_AUDIT: TabAuditItem[] = [
  {
    tab: 'Data',
    icon: Database,
    role: 'Shows the raw streams, cadence, coverage, weather, loads, and edge readiness.',
    strong: 'The right home for explaining why an edge is or is not member-specific yet.',
    watch: 'Keep badges consolidated so the tab reads as measurement infrastructure, not another insights list.',
    next: 'Make coverage gaps edge-led: pick an outcome, then show the streams that would unlock it.',
  },
  {
    tab: 'Devices',
    icon: Gauge,
    role: 'Ranks sources by which edges they tighten, unlock, or make identifiable.',
    strong: 'The value-of-information framing is exactly the right acquisition logic.',
    watch: 'Avoid burying the edge list below a device score; the edge is the unit of value.',
    next: 'Show expected personalization gain, confounder resolution, and cadence lift as separate columns.',
  },
  {
    tab: 'Insights',
    icon: Sparkles,
    role: 'Outcome-first ranking of mutable drivers and context drivers.',
    strong: 'This is the canonical coach answer to "what moves this outcome?"',
    watch: 'Uncertainty language must stay plain: member share, model share, observations, and band width.',
    next: 'Let hover cards open this Edge Map for the selected action-outcome pair.',
  },
  {
    tab: 'Fingerprint',
    icon: Microscope,
    role: 'Summarizes the member phenotype and recurring patterns.',
    strong: 'Useful for a narrative profile before choosing objectives.',
    watch: 'It can become too descriptive unless every trait links back to a mutable lever or data gap.',
    next: 'Attach each fingerprint claim to the strongest supporting edges and active regimes.',
  },
  {
    tab: 'Exploration',
    icon: Compass,
    role: 'Turns weak or blocked edges into practical measurement plans.',
    strong: 'Best place for exposure variation, outcome cadence, positivity, and confounder coverage logic.',
    watch: 'Full experiment mode is heavy; keep the first version as guided data collection.',
    next: 'Group recommendations by what they unlock: action variation, lab cadence, or context measurement.',
  },
  {
    tab: 'Baseline',
    icon: LineChart,
    role: 'Anchors current values, norms, and trend state.',
    strong: 'The right tab for "where is this member starting from?"',
    watch: 'Baseline should not feel separate from the causal engine; it is the operating point.',
    next: 'Show which baselines are inputs to Twin projections and protocol feasibility bounds.',
  },
  {
    tab: 'Twin',
    icon: Network,
    role: 'Runs live do() counterfactuals over the member SCM.',
    strong: 'The most vivid proof that the platform is causal, not a lookup table.',
    watch: 'Canvas clarity matters: weather/context belongs in quotidian, and uncertainty should be visible but calm.',
    next: 'Add a drill-in from each projected outcome to the full path and confounder set.',
  },
  {
    tab: 'Protocols',
    icon: ListChecks,
    role: 'Converts counterfactual utility into a day plan.',
    strong: 'Regimes and loads make it feel aware of today, not just generally optimized.',
    watch: 'Protocol explanations should stay simple; deeper provenance belongs in Data, Devices, and Edge Map.',
    next: 'Expose optimizer utility, feasibility, and uncertainty as a hover or detail drawer.',
  },
]

function pct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.max(0, Math.min(100, value)))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function edgeKey(edge: InsightBayesian): string {
  return `${edge.action}->${edge.outcome}`
}

function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? prettyEdgeId(action)
}

function labelForOutcome(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? prettyEdgeId(outcome)
}

function memberShare(edge: InsightBayesian): number {
  return clamp01(personalizationForEdge(edge))
}

function modelShare(edge: InsightBayesian): number {
  const backend = edge.personalization?.model_pct
  if (Number.isFinite(backend)) return clamp01(Number(backend) / 100)
  return 1 - memberShare(edge)
}

function coverageShare(edge: InsightBayesian): number {
  const backend = edge.personalization?.coverage_pct
  if (Number.isFinite(backend)) return clamp01(Number(backend) / 100)
  const n = edge.user_obs?.n ?? 0
  const half = edge.pathway === 'biomarker' ? 5 : 30
  return n > 0 ? clamp01(n / (n + half)) : 0
}

function narrowingShare(edge: InsightBayesian): number {
  const backend = edge.personalization?.narrowing_pct
  if (Number.isFinite(backend)) return clamp01(Number(backend) / 100)
  return clamp01(edge.posterior?.contraction ?? 0)
}

function lagLabel(edge: InsightBayesian): string {
  const days = edge.horizon_days
  if (!Number.isFinite(days)) return 'unknown lag'
  if ((days ?? 0) <= 7) return `${days}d response`
  if ((days ?? 0) <= 42) return `${days}d stabilization`
  return `${days}d turnover`
}

function cadenceLabel(edge: InsightBayesian): string {
  if (edge.pathway === 'biomarker') return 'episodic lab'
  const band = explorationBandFor(edge.outcome)
  if (band === 'quotidian') return 'daily wearable'
  if (band === 'monthly') return 'weekly-monthly'
  return 'episodic'
}

function directionText(edge: InsightBayesian): string {
  const beneficial = beneficialDirection(edge.outcome)
  const effect = edge.scaled_effect ?? edge.posterior?.mean ?? 0
  if (beneficial === 'higher') return effect >= 0 ? 'toward goal' : 'away from goal'
  if (beneficial === 'lower') return effect <= 0 ? 'toward goal' : 'away from goal'
  if (Math.abs(effect) < 0.01) return 'neutral'
  return effect > 0 ? 'raises outcome' : 'lowers outcome'
}

function meanAndBand(edge: InsightBayesian): string {
  const mean = edge.posterior?.mean ?? edge.scaled_effect ?? 0
  const sd = edge.posterior?.sd ?? 0
  const lo = mean - 1.64 * sd
  const hi = mean + 1.64 * sd
  return `${mean.toFixed(2)} [${lo.toFixed(2)}, ${hi.toFixed(2)}]`
}

function positivityPct(edge: InsightBayesian): number {
  let score =
    edge.gate?.tier === 'recommended'
      ? 86
      : edge.gate?.tier === 'possible'
        ? 64
        : 28
  if (edge.dose_bounded) score -= 16
  if (edge.direction_conflict) score -= 20
  if ((edge.user_obs?.n ?? 0) === 0) score -= 8
  return pct(score)
}

function actionabilityScore(edge: InsightBayesian): number {
  const gate =
    edge.gate?.tier === 'recommended'
      ? 1
      : edge.gate?.tier === 'possible'
        ? 0.65
        : 0.25
  const personal = memberShare(edge)
  const coverage = coverageShare(edge)
  const narrowing = narrowingShare(edge)
  const positivity = positivityPct(edge) / 100
  const penalty = edge.direction_conflict ? 0.25 : edge.dose_bounded ? 0.1 : 0
  return pct((0.3 * gate + 0.25 * personal + 0.2 * coverage + 0.15 * narrowing + 0.1 * positivity - penalty) * 100)
}

function toneForEdge(edge: InsightBayesian): CausalLeg['tone'] {
  const personal = memberShare(edge)
  if (personal >= 0.65) return 'member'
  if (personal > 0.15) return 'mixed'
  return 'model'
}

function toneColor(tone: CausalLeg['tone']): string {
  if (tone === 'member') return CONF_COLORS.high
  if (tone === 'mixed') return CONF_COLORS.med
  return CONF_COLORS.lit
}

function posteriorKindLabel(edge: InsightBayesian): string {
  const kind = posteriorKindForEdge(edge)
  if (kind === 'personal') return 'Member evidence'
  if (kind === 'cohort') return 'Cohort evidence'
  if (kind === 'literature') return 'Literature'
  if (kind === 'model_prior') return 'Model prior'
  return 'Unknown evidence'
}

function mechanismFor(edge: InsightBayesian): string {
  const out = edge.outcome
  const action = edge.action
  if (out.includes('sleep') || out === 'deep_sleep' || out === 'rem_sleep') {
    return action === 'bedroom_temp_c'
      ? 'Thermal sleep architecture'
      : 'Sleep architecture'
  }
  if (out.includes('hrv') || out.includes('resting_hr')) return 'Autonomic recovery'
  if (out.includes('hscrp') || out.includes('nlr') || out.includes('wbc')) return 'Inflammatory tone'
  if (out.includes('glucose') || out.includes('insulin')) return 'Metabolic response'
  if (out.includes('apob') || out.includes('ldl') || out.includes('hdl') || out.includes('triglycerides')) return 'Lipid handling'
  if (out.includes('ferritin') || out.includes('iron') || out.includes('zinc') || out.includes('magnesium')) return 'Mineral status'
  if (out.includes('cortisol') || out.includes('testosterone') || out.includes('estradiol')) return 'Endocrine rhythm'
  if (out.includes('vo2')) return 'Cardiorespiratory adaptation'
  if (out.includes('body')) return 'Body-composition trajectory'
  return 'Physiologic response'
}

function confoundersFor(edge: InsightBayesian): string[] {
  const adjusted = edge.user_obs?.confounders_adjusted ?? []
  if (adjusted.length > 0) return adjusted.map(prettyEdgeId).slice(0, 8)
  if (edge.pathway === 'wearable') {
    return ['Season', 'Weekend', 'Sleep debt', 'Training load', 'Heat index', 'Humidity', 'AQI']
  }
  return ['Season', 'Training load', 'Inflammation state', 'Sleep debt', 'Diet quality', 'Recent illness']
}

function modifiersFor(participant: ParticipantPortal | null, edge: InsightBayesian): string[] {
  const out: string[] = []
  const loads = participant?.loads_today ?? {}
  const regimes = participant?.regime_activations ?? {}
  const weather = participant?.weather_today ?? {}

  const loadEntries = Object.entries(loads)
    .filter(([, value]) => Number.isFinite(value?.z) && Math.abs(value?.z ?? 0) >= 0.75)
    .sort((a, b) => Math.abs(b[1]?.z ?? 0) - Math.abs(a[1]?.z ?? 0))
    .slice(0, 2)
  for (const [key, value] of loadEntries) {
    out.push(`${prettyEdgeId(key)} ${value.z >= 0 ? '+' : ''}${value.z.toFixed(1)} sd`)
  }

  const regimeEntries = Object.entries(regimes)
    .filter(([, value]) => Number.isFinite(value) && Number(value) >= 0.35)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
  for (const [key, value] of regimeEntries) {
    out.push(`${prettyEdgeId(key.replace('_state', ''))} ${pct(Number(value) * 100)}%`)
  }

  if (edge.pathway === 'wearable') {
    const temp = weather.temp_c
    const aqi = weather.aqi
    if (Number.isFinite(temp)) out.push(`${Number(temp).toFixed(0)} deg C`)
    if (Number.isFinite(aqi)) out.push(`AQI ${Number(aqi).toFixed(0)}`)
  }

  return out.slice(0, 5)
}

function actionDetail(participant: ParticipantPortal | null, edge: InsightBayesian): string {
  const current = participant?.current_values?.[edge.action]
  if (Number.isFinite(current)) {
    return `Current ${formatActionValue(Number(current), edge.action)}`
  }
  if (edge.action.startsWith('supp_')) return 'Binary supplement lever'
  if (CONTEXT_ACTIONS.has(edge.action)) return 'Context driver'
  return 'Mutable behavior lever'
}

function doseDetail(edge: InsightBayesian): string {
  const step = Number(edge.nominal_step)
  if (Number.isFinite(step) && step !== 0) {
    return `Nominal step ${formatActionValue(Math.abs(step), edge.action)}`
  }
  if (edge.action.startsWith('supp_')) return 'Off to on exposure'
  return 'Observed exposure contrast'
}

function buildAffordances(edge: InsightBayesian): Affordance[] {
  const personal = memberShare(edge)
  const coverage = coverageShare(edge)
  const narrowing = narrowingShare(edge)
  const positivity = positivityPct(edge)
  const gate = edge.gate?.tier ?? 'not_exposed'
  const out: Affordance[] = []

  if (gate === 'recommended' && positivity >= 70 && !edge.direction_conflict) {
    out.push({
      kind: 'intervene',
      label: 'Intervene now',
      detail: 'The lever is surfaced by the gate and has enough support for a protocol-sized nudge.',
      score: actionabilityScore(edge),
      icon: SlidersHorizontal,
    })
  } else if (gate === 'possible') {
    out.push({
      kind: 'intervene',
      label: 'Small monitored nudge',
      detail: 'A Twin or protocol nudge is reasonable, but the next read should be watched closely.',
      score: actionabilityScore(edge),
      icon: SlidersHorizontal,
    })
  } else {
    out.push({
      kind: 'caution',
      label: 'Do not prescribe yet',
      detail: 'This edge is still blocked, sparse, or outside enough observed variation.',
      score: actionabilityScore(edge),
      icon: BadgeCheck,
    })
  }

  if (personal < 0.65) {
    out.push({
      kind: 'measure',
      label: 'Collect member contrast',
      detail: 'More within-person variation would move this from model-heavy to member-specific.',
      score: pct((1 - personal) * 100),
      icon: Activity,
    })
  }

  if (coverage < 0.55) {
    out.push({
      kind: 'cadence',
      label: 'Improve cadence',
      detail: 'The outcome or lever needs more repeated observations before the edge can tighten.',
      score: pct((1 - coverage) * 100),
      icon: CalendarClock,
    })
  }

  if ((edge.user_obs?.confounders_adjusted?.length ?? 0) === 0) {
    out.push({
      kind: 'context',
      label: 'Measure backdoor set',
      detail: 'Context streams are needed so the engine can condition on the likely common causes.',
      score: 72,
      icon: CloudSun,
    })
  }

  if (narrowing < 0.35) {
    out.push({
      kind: 'measure',
      label: 'Narrow the band',
      detail: 'The estimate still has a wide posterior band; more usable rows would reduce ambiguity.',
      score: pct((1 - narrowing) * 100),
      icon: TimerReset,
    })
  }

  if (edge.direction_conflict || edge.dose_bounded) {
    out.push({
      kind: 'caution',
      label: edge.direction_conflict ? 'Direction conflict' : 'Dose bounded',
      detail: edge.direction_conflict
        ? 'The fitted direction disagrees with the expected literature direction.'
        : 'The requested contrast was clipped by the member feasible range.',
      score: 85,
      icon: Beaker,
    })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 5)
}

function buildStory(edge: InsightBayesian, participant: ParticipantPortal | null): EdgeStory {
  const personalPct = pct(memberShare(edge) * 100)
  const uncertaintyPct = pct((1 - narrowingShare(edge)) * 100)
  const score = actionabilityScore(edge)
  const confounders = confoundersFor(edge)
  const modifiers = modifiersFor(participant, edge)
  const tone = toneForEdge(edge)
  const nodes: CausalNode[] = [
    {
      id: 'action',
      kind: 'action',
      label: labelForAction(edge.action),
      eyebrow: CONTEXT_ACTIONS.has(edge.action) ? 'Context driver' : 'Mutable action',
      detail: actionDetail(participant, edge),
      icon: CONTEXT_ACTIONS.has(edge.action) ? CloudSun : SlidersHorizontal,
      mutable: !CONTEXT_ACTIONS.has(edge.action),
      observable: true,
      cadence: edge.action.startsWith('supp_') ? 'daily binary' : 'daily or logged',
    },
    {
      id: 'exposure',
      kind: 'exposure',
      label: 'Dose and timing',
      eyebrow: 'Exposure contrast',
      detail: doseDetail(edge),
      icon: Gauge,
      mutable: !CONTEXT_ACTIONS.has(edge.action),
      observable: true,
      cadence: 'same-day',
    },
    {
      id: 'mediator',
      kind: 'mediator',
      label: mechanismFor(edge),
      eyebrow: 'Mediator',
      detail: `${lagLabel(edge)} with ${cadenceLabel(edge)} readout`,
      icon: GitBranch,
      mutable: false,
      observable: edge.pathway === 'wearable',
      cadence: edge.pathway === 'wearable' ? 'daily proxy' : 'inferred path',
    },
    {
      id: 'outcome',
      kind: 'outcome',
      label: labelForOutcome(edge.outcome),
      eyebrow: edge.pathway === 'biomarker' ? 'Longevity outcome' : 'Quotidian outcome',
      detail: `${directionText(edge)} - ${meanAndBand(edge)}`,
      icon: edge.pathway === 'biomarker' ? Beaker : LineChart,
      mutable: false,
      observable: true,
      cadence: cadenceLabel(edge),
    },
  ]

  const legs: CausalLeg[] = [
    {
      id: 'leg-control',
      from: 'action',
      to: 'exposure',
      label: 'Control surface',
      detail: edge.action.startsWith('supp_') ? 'binary adherence' : 'dose, timing, and feasible range',
      strengthPct: positivityPct(edge),
      uncertaintyPct,
      tone,
    },
    {
      id: 'leg-identification',
      from: 'exposure',
      to: 'mediator',
      label: 'Identification',
      detail: confounders.length > 0 ? `${confounders.length} context variables` : 'backdoor set pending',
      strengthPct: pct(coverageShare(edge) * 100),
      uncertaintyPct,
      tone,
    },
    {
      id: 'leg-response',
      from: 'mediator',
      to: 'outcome',
      label: 'Response estimate',
      detail: `${personalPct}% member, ${pct(modelShare(edge) * 100)}% model`,
      strengthPct: pct(Math.max(memberShare(edge), narrowingShare(edge)) * 100),
      uncertaintyPct,
      tone,
    },
  ]

  return {
    key: edgeKey(edge),
    edge,
    title: `${labelForAction(edge.action)} to ${labelForOutcome(edge.outcome)}`,
    subtitle: `${edge.pathway === 'biomarker' ? 'Longevity' : 'Quotidian'} edge - ${edge.gate?.tier?.replace('_', ' ') ?? 'ungated'}`,
    nodes,
    legs,
    confounders,
    modifiers,
    affordances: buildAffordances(edge),
    score,
  }
}

function selectStories(
  edges: InsightBayesian[],
  participant: ParticipantPortal | null,
): EdgeStory[] {
  const byKey = new Map(edges.map((edge) => [edgeKey(edge), edge]))
  const picked: InsightBayesian[] = []
  for (const key of PREFERRED_EDGE_KEYS) {
    const edge = byKey.get(key)
    if (edge) picked.push(edge)
  }

  const seen = new Set(picked.map(edgeKey))
  const top = [...edges]
    .filter((edge) => !seen.has(edgeKey(edge)))
    .sort((a, b) => {
      const aScore = actionabilityScore(a) + Math.abs(a.scaled_effect ?? 0) * 4 + memberShare(a) * 25
      const bScore = actionabilityScore(b) + Math.abs(b.scaled_effect ?? 0) * 4 + memberShare(b) * 25
      return bScore - aScore
    })
    .slice(0, Math.max(0, 14 - picked.length))

  return [...picked, ...top].map((edge) => buildStory(edge, participant))
}

function modeButtonClass(active: boolean): string {
  return cn(
    'inline-flex w-full min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors sm:w-auto sm:min-w-[132px]',
    active
      ? 'border-sage-300 bg-white text-stone-950 shadow-sm'
      : 'border-stone-200 bg-white/60 text-stone-500 hover:bg-white hover:text-stone-800',
  )
}

function SegmentedModes({
  mode,
  onChange,
}: {
  mode: VisualMode
  onChange: (mode: VisualMode) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Edge map view">
      {MODES.map((item) => {
        const Icon = item.icon
        const active = mode === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={modeButtonClass(active)}
            onClick={() => onChange(item.id)}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">{item.label}</span>
              <span className="hidden truncate text-[10px] opacity-70 sm:block">
                {item.description}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function EdgeMapHeader({
  displayName,
  edgeCount,
  mode,
  onModeChange,
}: {
  displayName: string
  edgeCount: number
  mode: VisualMode
  onModeChange: (mode: VisualMode) => void
}) {
  return (
    <div
      className="mb-5 rounded-2xl border px-3 py-4 sm:px-5"
      style={{ background: BG_CARD, borderColor: LINE }}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase text-stone-500">
            <Network className="h-3.5 w-3.5" />
            Edge map
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-stone-950 sm:text-2xl">
            Full causal edge inspector
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">
            A demonstration surface for how a mutable lever, context, mediator,
            and outcome become an actionable member-specific edge.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
              {displayName}
            </span>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
              {edgeCount} scoped edges
            </span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <ScopeBar />
            <DataModeToggle size="sm" />
          </div>
          <SegmentedModes mode={mode} onChange={onModeChange} />
        </div>
      </div>
    </div>
  )
}

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase text-stone-400">
          {label}
        </span>
        <Icon className="h-4 w-4 text-stone-400" />
      </div>
      <div className="text-xl font-semibold tabular-nums text-stone-950">{value}</div>
      <div className="mt-1 text-xs leading-5 text-stone-500">{detail}</div>
    </div>
  )
}

function OverviewMetrics({
  edges,
  stories,
}: {
  edges: InsightBayesian[]
  stories: EdgeStory[]
}) {
  const counts = evidenceCounts(edges)
  const memberPct = pct(weightedPersonalizationPct(edges) * 100)
  const ready = stories.filter((story) => story.score >= 70).length
  const contextEdges = edges.filter((edge) => CONTEXT_ACTIONS.has(edge.action)).length
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricTile
        label="Evidence mix"
        value={`${memberPct}%`}
        detail="Magnitude-weighted member-specific share across scoped edges."
        icon={BadgeCheck}
      />
      <MetricTile
        label="Ready edges"
        value={`${ready}`}
        detail="Edges with enough gate, positivity, and uncertainty support."
        icon={SlidersHorizontal}
      />
      <MetricTile
        label="Personalizing"
        value={`${counts.personal + counts.personalizing}`}
        detail="Established or emerging member-specific relationships."
        icon={Activity}
      />
      <MetricTile
        label="Context drivers"
        value={`${contextEdges}`}
        detail="Weather, load, travel, and other non-prescribed drivers."
        icon={CloudSun}
      />
    </div>
  )
}

function EdgeRail({
  stories,
  selectedKey,
  onSelect,
}: {
  stories: EdgeStory[]
  selectedKey: string
  onSelect: (key: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-950">Representative edges</h2>
          <p className="text-xs text-stone-500">
            Select one path to inspect the affordances.
          </p>
        </div>
      </div>
      <div className="max-h-[720px] space-y-2 overflow-auto pr-1">
        {stories.map((story) => {
          const selected = story.key === selectedKey
          const tone = toneColor(toneForEdge(story.edge))
          return (
            <button
              key={story.key}
              type="button"
              onClick={() => onSelect(story.key)}
              className={cn(
                'w-full rounded-xl border bg-white p-3 text-left transition-all',
                selected
                  ? 'border-stone-300 shadow-md'
                  : 'border-stone-200 shadow-sm hover:border-stone-300',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-stone-950">
                    {story.title}
                  </div>
                  <div className="mt-0.5 text-[11px] capitalize text-stone-500">
                    {story.subtitle}
                  </div>
                </div>
                <div
                  className="h-8 w-8 flex-shrink-0 rounded-lg border text-center text-[11px] font-semibold leading-8 tabular-nums"
                  style={{
                    color: tone,
                    borderColor: `${tone}55`,
                    background: `${tone}12`,
                  }}
                >
                  {story.score}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct(memberShare(story.edge) * 100)}%`,
                      background: tone,
                    }}
                  />
                </div>
                <span className="text-[10px] font-medium tabular-nums text-stone-500">
                  {pct(memberShare(story.edge) * 100)}%
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NodeCard({ node }: { node: CausalNode }) {
  const Icon = node.icon
  const style = KIND_STYLE[node.kind]
  return (
    <div
      className="min-h-[184px] rounded-xl border p-4 shadow-sm"
      style={{ background: style.bg, borderColor: style.border }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white"
          style={{ borderColor: style.border, color: style.text }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
            style.chip,
          )}
        >
          {node.eyebrow}
        </span>
      </div>
      <h3 className="text-base font-semibold leading-6" style={{ color: TEXT_INK }}>
        {node.label}
      </h3>
      <p className="mt-2 text-xs leading-5" style={{ color: TEXT_BODY }}>
        {node.detail}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] text-stone-500">
        <span className="rounded-lg border border-white/70 bg-white/60 px-2 py-1">
          {node.mutable ? 'Mutable' : 'Fixed'}
        </span>
        <span className="rounded-lg border border-white/70 bg-white/60 px-2 py-1">
          {node.observable ? 'Observed' : 'Latent'}
        </span>
        <span className="rounded-lg border border-white/70 bg-white/60 px-2 py-1">
          Cadence: {node.cadence}
        </span>
      </div>
    </div>
  )
}

function LegBand({ leg }: { leg: CausalLeg }) {
  const color = toneColor(leg.tone)
  return (
    <div className="flex min-h-[184px] flex-col items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white/80 px-3 py-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-white">
        <ArrowRight className="h-4 w-4" style={{ color }} />
      </div>
      <div className="w-full text-center">
        <div className="text-xs font-semibold text-stone-950">{leg.label}</div>
        <div className="mt-1 text-[10px] leading-4 text-stone-500">{leg.detail}</div>
      </div>
      <div className="w-full space-y-2">
        <div>
          <div className="mb-1 text-center text-[9px] uppercase text-stone-400">
            <span>Support {leg.strengthPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-stone-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${leg.strengthPct}%`, background: color }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 text-center text-[9px] uppercase text-stone-400">
            <span>Uncertainty {leg.uncertaintyPct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-stone-300"
              style={{ width: `${leg.uncertaintyPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ContextRail({ story }: { story: EdgeStory }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-stone-500" />
          <h3 className="text-sm font-semibold text-stone-950">Backdoor context</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {story.confounders.map((item) => (
            <span
              key={item}
              className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-600"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-stone-500" />
          <h3 className="text-sm font-semibold text-stone-950">Today modifiers</h3>
        </div>
        {story.modifiers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {story.modifiers.map((item) => (
              <span
                key={item}
                className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-xs text-amber-700"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-5 text-stone-500">
            No large active load, regime, or weather modifier is dominating this selected edge.
          </p>
        )}
      </div>
    </div>
  )
}

function AffordanceStack({ story }: { story: EdgeStory }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-stone-950">Intervention affordances</h2>
        <p className="text-xs leading-5 text-stone-500">
          The same edge can invite a protocol nudge, more data, or a context measurement.
        </p>
      </div>
      {story.affordances.map((affordance) => {
        const Icon = affordance.icon
        const style = AFFORDANCE_STYLE[affordance.kind]
        return (
          <div
            key={`${affordance.kind}-${affordance.label}`}
            className="rounded-xl border p-3 shadow-sm"
            style={{ background: style.bg, borderColor: style.border }}
          >
            <div className="flex items-start gap-3">
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border bg-white"
                style={{ color: style.text, borderColor: style.border }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold" style={{ color: style.text }}>
                    {affordance.label}
                  </h3>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: style.text }}>
                    {affordance.score}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-600">{affordance.detail}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PathwayCanvas({ story }: { story: EdgeStory }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">{story.title}</h2>
            <p className="mt-1 text-sm text-stone-500">{story.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EdgeEvidenceChip edge={story.edge} />
            <span className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs capitalize text-stone-600">
              {posteriorKindLabel(story.edge)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)_84px_minmax(0,1fr)_84px_minmax(0,1fr)]">
          <NodeCard node={story.nodes[0]} />
          <LegBand leg={story.legs[0]} />
          <NodeCard node={story.nodes[1]} />
          <LegBand leg={story.legs[1]} />
          <NodeCard node={story.nodes[2]} />
          <LegBand leg={story.legs[2]} />
          <NodeCard node={story.nodes[3]} />
        </div>
      </div>
      <ContextRail story={story} />
    </div>
  )
}

function InterventionLadder({ story }: { story: EdgeStory }) {
  const steps = [
    {
      title: '1. Move the lever',
      icon: SlidersHorizontal,
      body: story.nodes[0].mutable
        ? `${story.nodes[0].label} is directly changeable. Use dose and timing bounds before prescribing.`
        : `${story.nodes[0].label} is context, so the intervention is measurement or avoidance rather than prescription.`,
      metric: `${positivityPct(story.edge)}% positivity`,
    },
    {
      title: '2. Hold context visible',
      icon: CloudSun,
      body: `Condition on ${story.confounders.slice(0, 4).join(', ')} before reading the effect.`,
      metric: `${story.confounders.length} variables`,
    },
    {
      title: '3. Watch the mediator',
      icon: GitBranch,
      body: `${story.nodes[2].label} explains the middle of the path and tells the coach what should move first.`,
      metric: story.nodes[2].cadence,
    },
    {
      title: '4. Read the outcome',
      icon: LineChart,
      body: `${story.nodes[3].label} should be interpreted at its natural horizon, not at an arbitrary short window.`,
      metric: lagLabel(story.edge),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-950">
              Intervention ladder
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {story.title}: where to act, where to measure, and where to wait.
            </p>
          </div>
          <EdgeEvidenceChip edge={story.edge} />
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div
                key={step.title}
                className="relative rounded-xl border border-stone-200 bg-stone-50/60 p-4"
              >
                {index < steps.length - 1 && (
                  <div className="absolute right-[-14px] top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200 bg-white lg:flex">
                    <ArrowRight className="h-3.5 w-3.5 text-stone-400" />
                  </div>
                )}
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white">
                  <Icon className="h-4 w-4 text-stone-600" />
                </div>
                <h3 className="text-sm font-semibold text-stone-950">{step.title}</h3>
                <p className="mt-2 min-h-[90px] text-xs leading-5 text-stone-600">
                  {step.body}
                </p>
                <div className="mt-3 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600">
                  {step.metric}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <AffordanceStack story={story} />
    </div>
  )
}

function ProgressCell({
  value,
  color,
  label,
}: {
  value: number
  color: string
  label?: string
}) {
  return (
    <div className="min-w-[104px]">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-stone-500">
        <span>{label ?? 'Score'}</span>
        <span className="tabular-nums">{pct(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-stone-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct(value)}%`, background: color }}
        />
      </div>
    </div>
  )
}

function EvidenceMatrix({ stories }: { stories: EdgeStory[] }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-lg font-semibold text-stone-950">Edge affordance matrix</h2>
        <p className="mt-1 text-sm text-stone-500">
          The same attributes decide whether an edge is ready for action, ready for measurement, or still blocked.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-[10px] uppercase text-stone-400">
              <th className="px-4 py-3 font-semibold">Edge</th>
              <th className="px-3 py-3 font-semibold">Direction</th>
              <th className="px-3 py-3 font-semibold">Gate</th>
              <th className="px-3 py-3 font-semibold">Member share</th>
              <th className="px-3 py-3 font-semibold">Coverage</th>
              <th className="px-3 py-3 font-semibold">Narrowing</th>
              <th className="px-3 py-3 font-semibold">Positivity</th>
              <th className="px-3 py-3 font-semibold">Best affordance</th>
            </tr>
          </thead>
          <tbody>
            {stories.map((story) => {
              const color = toneColor(toneForEdge(story.edge))
              const top = story.affordances[0]
              return (
                <tr key={story.key} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-stone-950">{story.title}</div>
                    <div className="mt-0.5 text-xs text-stone-500">
                      {cadenceLabel(story.edge)} - {lagLabel(story.edge)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs capitalize text-stone-600">
                    {directionText(story.edge)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs capitalize text-stone-600">
                      {story.edge.gate?.tier?.replace('_', ' ') ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <ProgressCell value={memberShare(story.edge) * 100} color={color} label="Member" />
                  </td>
                  <td className="px-3 py-3">
                    <ProgressCell value={coverageShare(story.edge) * 100} color={CONF_COLORS.high} label="Coverage" />
                  </td>
                  <td className="px-3 py-3">
                    <ProgressCell value={narrowingShare(story.edge) * 100} color={CONF_COLORS.med} label="Narrowing" />
                  </td>
                  <td className="px-3 py-3">
                    <ProgressCell value={positivityPct(story.edge)} color={CONF_COLORS.high} label="Positivity" />
                  </td>
                  <td className="px-3 py-3">
                    {top ? (
                      <div>
                        <div className="text-xs font-semibold text-stone-950">{top.label}</div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-500">
                          {top.detail}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400">Pending</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EdgeLegend() {
  const items = [
    {
      label: 'Member-specific',
      color: CONF_COLORS.high,
      detail: 'Daily rows or lab draws now carry the estimate.',
    },
    {
      label: 'Blended',
      color: CONF_COLORS.med,
      detail: 'Member data and model evidence both matter.',
    },
    {
      label: 'Model-heavy',
      color: CONF_COLORS.lit,
      detail: 'Useful starting belief, still needs member contrast.',
    },
  ]
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-stone-950">Evidence colors</h3>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <span
              className="mt-1 h-3 w-3 flex-shrink-0 rounded-full"
              style={{ background: item.color }}
            />
            <div>
              <div className="text-xs font-semibold text-stone-700">{item.label}</div>
              <div className="text-[11px] leading-4 text-stone-500">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberTabAudit() {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-950">Member tab audit</h2>
          <p className="text-sm text-stone-500">
            How each tab should participate in the edge life cycle without becoming redundant.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TAB_AUDIT.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.tab}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50">
                  <Icon className="h-4 w-4 text-stone-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-950">{item.tab}</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-stone-500">{item.role}</p>
                </div>
              </div>
              <AuditLine label="Strong" text={item.strong} />
              <AuditLine label="Watch" text={item.watch} />
              <AuditLine label="Next" text={item.next} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function AuditLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <div className="text-[10px] font-semibold uppercase text-stone-400">{label}</div>
      <p className="mt-1 text-xs leading-5 text-stone-600">{text}</p>
    </div>
  )
}

function EmptyEdgeState() {
  return (
    <Card padding="lg" className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-stone-200 bg-stone-50">
        <Network className="h-5 w-5 text-stone-500" />
      </div>
      <h2 className="text-base font-semibold text-stone-950">No scoped edges</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
        Switch the scope to All or select another member to inspect the causal edge map.
      </p>
    </Card>
  )
}

export function EdgeMapView() {
  const { participant, isLoading, error } = useParticipant()
  const { displayName } = useActiveParticipant()
  const regime = useScopeStore((s) => s.regime)
  const [mode, setMode] = useState<VisualMode>('pathway')
  const [selectedKey, setSelectedKey] = useState<string>('')

  const scopedEdges = useMemo(() => {
    const raw = participant?.effects_bayesian ?? []
    return scopedEdgesForRegime(raw, regime)
  }, [participant, regime])

  const stories = useMemo(
    () => selectStories(scopedEdges, participant),
    [scopedEdges, participant],
  )

  const selectedStory = useMemo(() => {
    if (stories.length === 0) return null
    return stories.find((story) => story.key === selectedKey) ?? stories[0]
  }, [stories, selectedKey])

  const resolvedSelectedKey = selectedStory?.key ?? ''

  if (isLoading) {
    return (
      <PageLayout
        maxWidth="full"
        padding="none"
        className="min-h-full p-3 sm:p-4 lg:p-6"
        style={{ background: BG_CANVAS }}
      >
        <Card padding="lg" className="mx-auto mt-10 max-w-xl text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-pulse rounded-full" style={{ background: BG_TRACK }} />
          <h2 className="text-base font-semibold text-stone-950">Loading edge map</h2>
          <p className="mt-2 text-sm text-stone-500">Resolving the selected member's causal graph.</p>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout
        maxWidth="full"
        padding="none"
        className="min-h-full p-3 sm:p-4 lg:p-6"
        style={{ background: BG_CANVAS }}
      >
        <Card padding="lg" className="mx-auto mt-10 max-w-xl text-center">
          <h2 className="text-base font-semibold text-stone-950">Edge map unavailable</h2>
          <p className="mt-2 text-sm text-stone-500">{error.message}</p>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      maxWidth="full"
      padding="none"
      className="min-h-full p-3 sm:p-4 lg:p-6"
      style={{
        background: BG_CANVAS,
        color: TEXT_INK,
      }}
    >
      <EdgeMapHeader
        displayName={displayName}
        edgeCount={scopedEdges.length}
        mode={mode}
        onModeChange={setMode}
      />

      <OverviewMetrics edges={scopedEdges} stories={stories} />

      {mode === 'dag' && participant != null ? (
        <DagCanvas participant={participant} />
      ) : selectedStory ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-4">
            <EdgeRail
              stories={stories}
              selectedKey={resolvedSelectedKey}
              onSelect={setSelectedKey}
            />
            <EdgeLegend />
            <div
              className="rounded-xl border p-4 text-xs leading-5 shadow-sm"
              style={{
                background: BG_CARD_WARM,
                borderColor: LINE,
                color: TEXT_MUTED,
              }}
            >
              <div className="mb-1 font-semibold" style={{ color: TEXT_BODY }}>
                Active scope
              </div>
              {scopeLabel(regime)}: {scopeBlurb(regime)}. The matrix, pathway,
              and intervention ladder use the same filtered edge set.
            </div>
          </div>

          <div className="min-w-0">
            {mode === 'pathway' && (
              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
                <PathwayCanvas story={selectedStory} />
                <AffordanceStack story={selectedStory} />
              </div>
            )}
            {mode === 'intervention' && <InterventionLadder story={selectedStory} />}
            {mode === 'matrix' && <EvidenceMatrix stories={stories} />}
          </div>
        </div>
      ) : (
        <EmptyEdgeState />
      )}

      <MemberTabAudit />

      <div className="mt-5 rounded-xl border border-stone-200 bg-white px-4 py-3 text-xs leading-5 text-stone-500 shadow-sm">
        Edge readiness is not a badge lifecycle. It is a decision over exposure
        variation, outcome cadence, backdoor coverage, positivity, uncertainty
        narrowing, and direction stability. This page shows those attributes in
        one place so each tab can stay simpler.
      </div>
    </PageLayout>
  )
}

export default EdgeMapView
