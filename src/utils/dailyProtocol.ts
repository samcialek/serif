/**
 * Day-protocol timeline built from engine-picked anchors.
 *
 * Engine-driven items (time-targeted, backed by either the twin-SEM pick or
 * a regime threshold): wake, caffeine cutoff, training block, wind-down,
 * screens-off, lights out. Plus regime-triggered emphasis items that flag
 * focus areas without prescribing specific foods or rituals.
 *
 * Food/ritual specifics (what to eat, which mobility sequence, etc.) are
 * NOT engine outputs — those ship as optional `suggestions` on each item
 * so the UI can surface them as non-engine ideas behind a disclosure, not
 * as prescriptions.
 *
 * Source tagging:
 *   - twin_sem      → bedtime, training session, sleep duration
 *   - regime_driven → caffeine cutoff, wind-down window, regime-triggered
 *                     emphasis flags
 *   - baseline      → wake anchor
 *
 * Each item carries a `context` field that records which loads, regimes,
 * and confounders steered it today. The context is what the Protocol tab's
 * ContextChip + AuditTrail surfaces render from — it answers "why this
 * specific dose on this specific day?" without users having to read the
 * engine code.
 */

import { formatClockTime } from '@/utils/rounding'
import type {
  InsightBayesian,
  LoadKey,
  LoadValue,
  ParticipantPortal,
  RegimeKey,
} from '@/data/portal/types'
import type { CandidateSchedule } from '@/utils/twinSem'
import { SESSION_PRESETS } from '@/utils/twinSem'

export type ProtocolSlot =
  | 'dawn'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'night'

export type ProtocolTag =
  | 'sleep'
  | 'iron'
  | 'training'
  | 'recovery'
  | 'circadian'
  | 'anti-inflammation'
  | 'overreaching'

export type ProtocolSource = 'twin_sem' | 'regime_driven' | 'baseline'

export type LoadSeverity = 'good' | 'neutral' | 'watch' | 'elevated'

export interface LoadDriver {
  key: LoadKey
  value: number
  severity: LoadSeverity
  label: string
  /** Short explainer — what elevation/depression means for today's pick. */
  hint: string
}

export interface RegimeDriver {
  key: RegimeKey
  activation: number
  label: string
}

export interface ConfounderDriver {
  /** Canonical ID — matches backend CONFOUNDERS_BY_OUTCOME keys. */
  key: string
  label: string
  /** Observed value for this participant today (when determinable). */
  value?: string
}

export interface ProtocolItemContext {
  /** Loads that are relevant to this item's underlying actions AND are
   * currently off-baseline (severity ≠ 'good'). Ordered by magnitude. */
  driving_loads: LoadDriver[]
  /** Regimes that are active above the item's threshold — the ones that
   * pulled this item's dose away from the baseline. */
  active_regimes: RegimeDriver[]
  /** DAG-level confounders we adjusted for when estimating the effects
   * that back this item. Sourced from CONFOUNDERS_BY_OUTCOME mirrored
   * from backend/serif_scm/export_bart_draws.py. */
  confounders_adjusted: ConfounderDriver[]
  /** Action keys this item is primarily driven by (e.g. 'bedtime',
   * 'training_volume'). Lets downstream tooling look up insights. */
  related_actions: string[]
  /** Outcomes this item is targeting — drives the confounder lookup. */
  related_outcomes: string[]
  /** Short narration: how today's loads/regimes/confounders modified the
   * baseline dose. Filled in when the OptimalSchedule layer has both a
   * real and a neutral-state pick to compare. */
  dose_rationale?: string
}

export interface ProtocolItem {
  time: string
  displayTime: string
  slot: ProtocolSlot
  icon: string
  title: string
  dose: string
  /** Engine-relevant facts: dose magnitudes, regime percentages, TRIMP, etc. */
  details?: string[]
  /** Non-engine ideas — meal options, mobility sequences. Rendered behind
   *  a "Suggest options" disclosure and clearly marked as non-prescriptive. */
  suggestions?: string[]
  rationale?: string
  tags: ProtocolTag[]
  source: ProtocolSource
  /** Why this item has this specific shape today — loads, regimes, and
   * confounders that drove it. Always present (may be empty). */
  context: ProtocolItemContext
}

// ── Load relevance + labels ─────────────────────────────────────────
// Which loads are causally relevant to each action. Used to decide which
// loads to surface on a given ProtocolItem — noise-filter against the 8
// load columns so the chip only shows what actually steers THIS item.

export const LOAD_RELEVANCE_BY_ACTION: Record<string, LoadKey[]> = {
  bedtime: ['sleep_debt_14d', 'sri_7d'],
  sleep_duration: ['sleep_debt_14d', 'sri_7d'],
  training_load: ['acwr', 'tsb', 'training_monotony'],
  training_volume: ['acwr', 'tsb', 'training_monotony'],
  zone2_volume: ['acwr', 'tsb'],
  running_volume: ['acwr', 'tsb', 'training_monotony'],
  dietary_protein: [],
  dietary_energy: [],
}

const LOAD_LABELS: Record<LoadKey, string> = {
  acwr: 'ACWR',
  ctl: 'Chronic load',
  atl: 'Acute load',
  tsb: 'Training balance',
  sleep_debt_14d: 'Sleep debt (14d)',
  sri_7d: 'Sleep regularity',
  training_monotony: 'Monotony',
  training_consistency: 'Consistency',
}

export function loadSeverity(key: LoadKey, value: number): LoadSeverity {
  switch (key) {
    case 'acwr':
      return value < 0.8 ? 'watch' : value > 1.3 ? 'elevated' : 'good'
    case 'sleep_debt_14d':
      return value < 3 ? 'good' : value < 7 ? 'watch' : 'elevated'
    case 'sri_7d':
      return value >= 85 ? 'good' : value >= 70 ? 'neutral' : 'watch'
    case 'tsb':
      return value > -10 && value < 15 ? 'good' : value < -25 ? 'elevated' : 'neutral'
    case 'training_consistency':
      return value >= 0.7 ? 'good' : value >= 0.4 ? 'neutral' : 'watch'
    case 'training_monotony':
      return value > 2 ? 'elevated' : value > 1.8 ? 'watch' : 'good'
    default:
      return 'neutral'
  }
}

function loadHint(key: LoadKey, value: number): string {
  switch (key) {
    case 'acwr':
      if (value > 1.5) return 'danger zone — injury risk elevated'
      if (value > 1.3) return 'high — monitor fatigue'
      if (value < 0.8) return 'detraining — acute load < 80% of chronic'
      return 'balanced acute vs chronic load'
    case 'sleep_debt_14d':
      if (value >= 7) return 'substantial deficit — HRV & immunity impacted'
      if (value >= 3) return 'moderate accumulated deficit'
      return 'within normal range'
    case 'sri_7d':
      if (value < 70) return 'irregular — circadian alignment at risk'
      if (value < 85) return 'some day-to-day drift'
      return 'consistent schedule'
    case 'tsb':
      if (value < -25) return 'highly fatigued — taper soon'
      if (value < -10) return 'productive fatigue'
      if (value > 25) return 'very fresh — detraining risk'
      return 'balanced CTL vs ATL'
    case 'training_monotony':
      if (value > 2) return 'high monotony — overreaching risk'
      if (value > 1.8) return 'monotony rising'
      return 'healthy training variation'
    default:
      return ''
  }
}

function severityRank(sev: LoadSeverity): number {
  return { good: 0, neutral: 1, watch: 2, elevated: 3 }[sev]
}

export function buildLoadDrivers(
  loads: Partial<Record<LoadKey, LoadValue>> | undefined,
  relevantKeys: LoadKey[],
): LoadDriver[] {
  if (!loads) return []
  const out: LoadDriver[] = []
  for (const key of relevantKeys) {
    const lv = loads[key]
    if (!lv) continue
    const severity = loadSeverity(key, lv.value)
    if (severity === 'good') continue
    out.push({
      key,
      value: lv.value,
      severity,
      label: LOAD_LABELS[key],
      hint: loadHint(key, lv.value),
    })
  }
  return out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
}

// ── Regime thresholds + labels ──────────────────────────────────────
// Thresholds match how buildDailyProtocol already gates items. A regime
// with activation below its item threshold doesn't drive the item, so it
// shouldn't appear in active_regimes for that item.

const REGIME_LABELS: Record<RegimeKey, string> = {
  overreaching_state: 'Overreaching',
  iron_deficiency_state: 'Iron-deficient',
  sleep_deprivation_state: 'Sleep-deprived',
  inflammation_state: 'Inflamed',
}

export function buildRegimeDrivers(
  regimes: Partial<Record<RegimeKey, number>> | undefined,
  regimeKeys: RegimeKey[],
  minActivation: number = 0.3,
): RegimeDriver[] {
  if (!regimes) return []
  const out: RegimeDriver[] = []
  for (const key of regimeKeys) {
    const act = regimes[key] ?? 0
    if (act < minActivation) continue
    out.push({ key, activation: act, label: REGIME_LABELS[key] })
  }
  return out.sort((a, b) => b.activation - a.activation)
}

// ── DAG confounders ─────────────────────────────────────────────────
// Mirrors backend/serif_scm/export_bart_draws.py CONFOUNDERS_BY_OUTCOME.
// These are DAG-level confounders the backdoor adjustment conditions on
// when estimating causal effects — what we tell users we "control for."

export const CONFOUNDERS_BY_OUTCOME: Record<string, string[]> = {
  training_volume: ['season', 'location', 'is_weekend', 'heat_index'],
  vitamin_d: ['season', 'uv_index'],
  testosterone: ['season', 'vitamin_d'],
  sleep_duration: ['season', 'is_weekend', 'temp_c'],
  sleep_quality: ['location', 'travel_load', 'temp_c', 'humidity_pct'],
  hrv_daily: ['travel_load', 'heat_index'],
  resting_hr: ['travel_load', 'heat_index'],
  bedtime: ['is_weekend'],
  omega3_index: ['season'],
}

const CONFOUNDER_LABELS: Record<string, string> = {
  season: 'Season',
  location: 'Location',
  is_weekend: 'Weekend effect',
  travel_load: 'Travel load',
  vitamin_d: 'Vitamin D status',
  heat_index: 'Heat index',
  temp_c: 'Temperature',
  humidity_pct: 'Humidity',
  uv_index: 'UV index',
  aqi: 'Air quality',
}

function seasonForDate(date: Date): string {
  const m = date.getMonth()
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'autumn'
  return 'winter'
}

function confounderValue(
  key: string,
  participant: ParticipantPortal,
  date: Date,
): string | undefined {
  if (key === 'is_weekend') {
    const day = date.getDay()
    return day === 0 || day === 6 ? 'weekend' : 'weekday'
  }
  if (key === 'season') return seasonForDate(date)
  if (key === 'location') return participant.cohort
  if (key === 'travel_load') {
    // travel_load isn't in the engine's load summary (LOAD_COLUMNS doesn't
    // include it) — it's a BART confounder only. Show without a value.
    return undefined
  }
  // Weather confounders — resolve from participant.weather_today.
  const wt = participant.weather_today
  if (!wt) return undefined
  if (key === 'heat_index' && wt.heat_index_c != null) {
    return `${Math.round(wt.heat_index_c)}°C`
  }
  if (key === 'temp_c' && wt.temp_c != null) {
    return `${Math.round(wt.temp_c)}°C`
  }
  if (key === 'humidity_pct' && wt.humidity_pct != null) {
    return `${Math.round(wt.humidity_pct)}%`
  }
  if (key === 'uv_index' && wt.uv_index != null) {
    return wt.uv_index.toFixed(1)
  }
  if (key === 'aqi' && wt.aqi != null) {
    return Math.round(wt.aqi).toString()
  }
  return undefined
}

export function buildConfounderDrivers(
  participant: ParticipantPortal,
  outcomes: string[],
  date: Date = new Date(),
): ConfounderDriver[] {
  const keys = new Set<string>()
  for (const outcome of outcomes) {
    for (const k of CONFOUNDERS_BY_OUTCOME[outcome] ?? []) {
      keys.add(k)
    }
  }
  return Array.from(keys).map((key) => ({
    key,
    label: CONFOUNDER_LABELS[key] ?? key,
    value: confounderValue(key, participant, date),
  }))
}

// ── Narration builders ──────────────────────────────────────────────

function loadBlurb(d: LoadDriver): string {
  const valueStr =
    d.key === 'acwr' || d.key === 'training_monotony'
      ? d.value.toFixed(2)
      : d.key === 'training_consistency'
        ? `${Math.round(d.value * 100)}%`
        : d.key === 'sleep_debt_14d'
          ? `${d.value.toFixed(1)}h`
          : d.value.toFixed(0)
  return `${d.label} ${valueStr}`
}

function buildDoseRationale(
  context: ProtocolItemContext,
): string | undefined {
  const parts: string[] = []
  for (const r of context.active_regimes) {
    parts.push(`${r.label.toLowerCase()} active (${Math.round(r.activation * 100)}%)`)
  }
  for (const d of context.driving_loads.slice(0, 2)) {
    parts.push(loadBlurb(d).toLowerCase())
  }
  if (parts.length === 0) return undefined
  return `Today: ${parts.join(' · ')}`
}

// ── Main builder ────────────────────────────────────────────────────

function decimalToHHMM(decimalHours: number): string {
  let total = decimalHours
  while (total >= 24) total -= 24
  while (total < 0) total += 24
  const h = Math.floor(total)
  const m = Math.round((total - h) * 60)
  const hh = m === 60 ? h + 1 : h
  const mm = m === 60 ? 0 : m
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function slotForHour(h: number): ProtocolSlot {
  if (h < 6) return 'dawn'
  if (h < 11) return 'morning'
  if (h < 14) return 'midday'
  if (h < 18) return 'afternoon'
  if (h < 21) return 'evening'
  return 'night'
}

interface ItemArgs {
  decimalHour: number
  icon: string
  title: string
  dose: string
  tags: ProtocolTag[]
  source: ProtocolSource
  details?: string[]
  suggestions?: string[]
  rationale?: string
  context: ProtocolItemContext
}

function item(args: ItemArgs): ProtocolItem {
  return {
    time: decimalToHHMM(args.decimalHour),
    displayTime: formatClockTime(args.decimalHour),
    slot: slotForHour(Math.floor(args.decimalHour)),
    icon: args.icon,
    title: args.title,
    dose: args.dose,
    details: args.details,
    suggestions: args.suggestions,
    rationale: args.rationale,
    tags: args.tags,
    source: args.source,
    context: args.context,
  }
}

function buildContext(
  participant: ParticipantPortal,
  related_actions: string[],
  related_outcomes: string[],
  activeRegimeKeys: RegimeKey[],
  minRegimeActivation: number,
  date: Date,
): ProtocolItemContext {
  const relevantLoadKeys = new Set<LoadKey>()
  for (const a of related_actions) {
    for (const k of LOAD_RELEVANCE_BY_ACTION[a] ?? []) relevantLoadKeys.add(k)
  }
  const driving_loads = buildLoadDrivers(
    participant.loads_today,
    Array.from(relevantLoadKeys),
  )
  const active_regimes = buildRegimeDrivers(
    participant.regime_activations,
    activeRegimeKeys,
    minRegimeActivation,
  )
  const confounders_adjusted = buildConfounderDrivers(
    participant,
    related_outcomes,
    date,
  )
  const ctx: ProtocolItemContext = {
    driving_loads,
    active_regimes,
    confounders_adjusted,
    related_actions,
    related_outcomes,
  }
  ctx.dose_rationale = buildDoseRationale(ctx)
  return ctx
}

export interface BuildProtocolOptions {
  wakeTime: number
  /** Date anchor for confounder resolution (season, is_weekend). Defaults
   * to now. Passed through from the parent so chip and audit trail agree. */
  date?: Date
}

export function buildDailyProtocol(
  participant: ParticipantPortal,
  schedule: CandidateSchedule,
  opts: BuildProtocolOptions,
): ProtocolItem[] {
  const wake = opts.wakeTime
  const bed = schedule.bedtime
  const date = opts.date ?? new Date()
  const regimes = participant.regime_activations ?? {}
  const sleepDep = regimes.sleep_deprivation_state ?? 0
  const inflam = regimes.inflammation_state ?? 0
  const ironDef = regimes.iron_deficiency_state ?? 0
  const overreach = regimes.overreaching_state ?? 0

  const session = SESSION_PRESETS[schedule.session]
  const isRest = schedule.session === 'rest'

  const out: ProtocolItem[] = []

  out.push(
    item({
      decimalHour: wake,
      icon: '☀️',
      title: 'Wake',
      dose: `Start the day at ${formatClockTime(wake)}`,
      tags: ['circadian'],
      source: 'baseline',
      suggestions: [
        '5–10 min outdoor light within the first hour anchors the circadian phase',
        'Delay caffeine 60–90 min to let cortisol finish its wake peak',
      ],
      rationale:
        sleepDep >= 0.5
          ? 'Sleep_deprivation active — morning light is the strongest circadian re-anchor.'
          : 'Morning light consolidates tomorrow night’s sleep pressure.',
      context: buildContext(
        participant,
        ['bedtime', 'sleep_duration'],
        ['sleep_duration', 'bedtime'],
        ['sleep_deprivation_state'],
        0.5,
        date,
      ),
    }),
  )

  const caffeineOffset = sleepDep >= 0.5 ? 8 : 6
  const caffeineCutoff = bed - caffeineOffset
  out.push(
    item({
      decimalHour: caffeineCutoff,
      icon: '☕',
      title: 'Caffeine cutoff',
      dose: `No caffeine past ${formatClockTime(caffeineCutoff)}`,
      tags: ['sleep', 'circadian'],
      source: 'regime_driven',
      details: [
        sleepDep >= 0.5
          ? `sleep_deprivation_state: ${Math.round(sleepDep * 100)}% — cutoff pulled to 8 h pre-bed`
          : 'Caffeine half-life is 8–10 h; default 6-h cutoff',
      ],
      suggestions: ['Water, herbal tea, or decaf after the cutoff'],
      rationale:
        sleepDep >= 0.5
          ? 'Sleep_deprivation active — earlier cutoff protects tonight’s recovery.'
          : 'Keeps caffeine below the threshold that fragments deep sleep.',
      context: buildContext(
        participant,
        ['sleep_duration', 'bedtime'],
        ['sleep_quality', 'deep_sleep'],
        ['sleep_deprivation_state'],
        0.5,
        date,
      ),
    }),
  )

  if (ironDef >= 0.2) {
    out.push(
      item({
        decimalHour: 10.5,
        icon: '💊',
        title: 'Iron-support window',
        dose: 'Pair an iron-rich food with a vitamin-C source',
        tags: ['iron'],
        source: 'regime_driven',
        details: [
          `iron_deficiency_state: ${Math.round(ironDef * 100)}%`,
          'Avoid tea/coffee within 60 min of iron-focused food',
        ],
        suggestions: [
          'Non-heme: lentils, pumpkin seeds, spinach + citrus',
          'Heme: lean red meat, liver, shellfish',
        ],
        rationale:
          'Iron-deficiency state elevated. Vitamin C improves non-heme iron absorption 2–3×.',
        context: buildContext(
          participant,
          ['dietary_protein', 'dietary_energy'],
          ['ferritin', 'iron_total', 'hemoglobin'],
          ['iron_deficiency_state'],
          0.2,
          date,
        ),
      }),
    )
  }

  if (inflam >= 0.3) {
    out.push(
      item({
        decimalHour: 12.5,
        icon: '🫐',
        title: 'Anti-inflammatory emphasis',
        dose: 'Favor omega-3 and polyphenol sources today',
        tags: ['anti-inflammation'],
        source: 'regime_driven',
        details: [`inflammation_state: ${Math.round(inflam * 100)}%`],
        suggestions: [
          'Omega-3: fatty fish (salmon, sardines), flax, walnuts',
          'Polyphenols: berries, leafy greens, olive oil, tea',
          'Minimize refined seed oils and ultra-processed items',
        ],
        rationale:
          'Inflammation state elevated. RCT literature supports omega-3 + polyphenol load for lowering CRP set-point.',
        context: buildContext(
          participant,
          ['dietary_protein'],
          ['hscrp', 'omega3_index'],
          ['inflammation_state'],
          0.3,
          date,
        ),
      }),
    )
  }

  if (!isRest) {
    const workoutHour =
      parseFloat(session.time.split(':')[0]) +
      parseFloat(session.time.split(':')[1]) / 60
    const overreachingCaveat =
      overreach >= 0.3
        ? ` · overreaching_state ${Math.round(overreach * 100)}% — twin-SEM kept load under the penalty threshold`
        : ''
    out.push(
      item({
        decimalHour: workoutHour,
        icon: session.icon,
        title: `Training — ${session.label}`,
        dose: session.description,
        tags: overreach >= 0.3 ? ['training', 'overreaching'] : ['training'],
        source: 'twin_sem',
        details: [
          `${session.training_load.toFixed(0)} TRIMP · ${(session.training_volume * 60).toFixed(0)} min`,
          session.zone2_volume > 0 ? `${session.zone2_volume} km in Zone 2` : '',
          session.running_volume > 0 ? `${session.running_volume} km running` : '',
        ].filter(Boolean),
        rationale: `Twin-SEM pick: highest HRV/cortisol score among the candidate sessions${overreachingCaveat}.`,
        context: buildContext(
          participant,
          ['training_volume', 'training_load', 'zone2_volume', 'running_volume'],
          ['hrv_daily', 'resting_hr', 'training_volume'],
          ['overreaching_state', 'inflammation_state', 'iron_deficiency_state'],
          0.3,
          date,
        ),
      }),
    )
  }

  out.push(
    item({
      decimalHour: bed - 1.0,
      icon: '🧘',
      title: 'Wind-down window',
      dose: `Start slowing at ${formatClockTime(bed - 1.0)}`,
      tags: ['sleep', 'circadian'],
      source: 'regime_driven',
      details: ['Dim overhead lights, bedroom cool (18–20 °C)'],
      suggestions: [
        'Light mobility, foam roll, or 10 min reading',
        'Warm shower 60–90 min pre-bed helps core-temp drop',
      ],
      rationale:
        sleepDep >= 0.5
          ? 'Sleep_deprivation active — protecting this hour is the highest-leverage lever in the day.'
          : 'Dim light + cool temperature cue melatonin onset.',
      context: buildContext(
        participant,
        ['bedtime'],
        ['sleep_quality', 'deep_sleep'],
        ['sleep_deprivation_state'],
        0.5,
        date,
      ),
    }),
  )

  out.push(
    item({
      decimalHour: bed - 0.5,
      icon: '📵',
      title: 'Screens off',
      dose: 'No phone, laptop, or TV',
      tags: ['sleep', 'circadian'],
      source: 'regime_driven',
      suggestions: [
        'Phone out of the bedroom; charge elsewhere',
        'If you must use a screen, blue-light filter + minimum brightness',
      ],
      rationale:
        'Blue light suppresses melatonin for 30–60 min even at low exposure.',
      context: buildContext(
        participant,
        ['bedtime'],
        ['sleep_quality', 'deep_sleep'],
        ['sleep_deprivation_state'],
        0.5,
        date,
      ),
    }),
  )

  out.push(
    item({
      decimalHour: bed,
      icon: '🌙',
      title: 'Lights out',
      dose: `Asleep by ${formatClockTime(bed)}`,
      tags: ['sleep'],
      source: 'twin_sem',
      details: [`Target sleep duration: ${schedule.sleep_duration.toFixed(1)} h`],
      rationale:
        'Twin-SEM pick: this bedtime scored highest against your sleep-quality and HRV posteriors given tonight’s regime state.',
      context: buildContext(
        participant,
        ['bedtime', 'sleep_duration'],
        ['sleep_quality', 'hrv_daily', 'deep_sleep'],
        ['sleep_deprivation_state', 'overreaching_state', 'inflammation_state'],
        0.3,
        date,
      ),
    }),
  )

  out.sort((a, b) => a.time.localeCompare(b.time))
  return out
}

export function slotOrder(slot: ProtocolSlot): number {
  return ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'].indexOf(slot)
}

export function tagColor(tag: ProtocolTag): string {
  switch (tag) {
    case 'sleep':
      return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'iron':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    case 'training':
      return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'recovery':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'circadian':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    case 'anti-inflammation':
      return 'bg-orange-50 text-orange-700 border-orange-200'
    case 'overreaching':
      return 'bg-amber-50 text-amber-700 border-amber-200'
  }
}

export function sourceLabel(source: ProtocolSource): string {
  switch (source) {
    case 'twin_sem':
      return 'Twin-SEM pick'
    case 'regime_driven':
      return 'Regime-driven'
    case 'baseline':
      return 'Baseline'
  }
}

// ── Match real vs neutral picks for audit trails ────────────────────
// Two buildDailyProtocol outputs (real + neutral) are matched by title so
// the audit trail can show "baseline dose" vs "today's dose" side-by-side.
// Items that exist only in the real pick (e.g., iron-support, which appears
// only when iron_deficiency_state ≥ 0.2) return null for the neutral pair.

export interface MatchedProtocolItem {
  real: ProtocolItem
  neutral: ProtocolItem | null
}

export function matchProtocolItems(
  real: ProtocolItem[],
  neutral: ProtocolItem[],
): MatchedProtocolItem[] {
  const neutralByTitle = new Map<string, ProtocolItem>()
  for (const it of neutral) neutralByTitle.set(it.title, it)
  return real.map((r) => ({
    real: r,
    neutral: neutralByTitle.get(r.title) ?? null,
  }))
}

/** Union the user_obs.confounders_adjusted strings across all insights
 * whose action is in the item's related_actions set and whose outcome is
 * in related_outcomes. Noisier than the DAG-level confounders but lets us
 * show "we also controlled for X" in the audit trail detail. */
export function userConfoundersForItem(
  item: ProtocolItem,
  effects: InsightBayesian[],
): string[] {
  const actions = new Set(item.context.related_actions)
  const outcomes = new Set(item.context.related_outcomes)
  const out = new Set<string>()
  for (const e of effects) {
    if (!actions.has(e.action)) continue
    if (!outcomes.has(e.outcome)) continue
    for (const c of e.user_obs?.confounders_adjusted ?? []) out.add(c)
  }
  return Array.from(out).sort()
}
