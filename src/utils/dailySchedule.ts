/**
 * Daily schedule derivation — translates the engine's weekly/monthly
 * targets into *today's specific action*, adjusted for where the member
 * currently sits in the week and which regimes are active.
 *
 * Week-to-date data is synthesized deterministically from pid + date for
 * the demo — in production this would come from a daily observation
 * stream. The translation logic from target -> today's dose is real.
 */

import type { ParticipantPortal, Protocol, RegimeKey } from '@/data/portal/types'
import {
  actionIncrement,
  formatActionValue,
  formatClockTime,
  formatHours,
  roundForAction,
  roundToIncrement,
} from '@/utils/rounding'

export interface ScheduleItem {
  time: string // HH:MM
  slot: 'morning' | 'afternoon' | 'evening'
  icon: string // emoji
  title: string // "Lights out" / "Zone 2 run"
  dose: string // "22:45 tonight" / "35 min, ~8 km"
  rationale: string // "You ran 42 of 65 target km this week — today ramps you up"
  modifier?: string // "Iron-deficient: keep HR below 140"
  action: string // engine action key, for dedup/reference
  tier: Protocol['gate_tier']
}

export interface WeekStat {
  label: string
  done: number
  target: number
  unit: string
  ratio: number
  status: 'behind' | 'on_track' | 'ahead'
}

export interface WeekContext {
  dateLabel: string
  dayOfWeek: string
  stats: WeekStat[]
  activeRegimes: RegimeKey[]
  /** Cumulative-load narrative line (one sentence). */
  narrative: string
}

const DAY_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Deterministic hash: pid + day-of-year -> float in [0,1).
function seedRandom(pid: number, day: number): () => number {
  let state = (pid * 73856093) ^ (day * 19349663)
  return () => {
    state = (state * 1664525 + 1013904223) | 0
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000)
}

// 24-hour HH:MM for the schedule time slot (sortable via localeCompare).
// 15-min rounding via the centralized bedtime increment.
function toClock24(decimalHours: number): string {
  const rounded = roundToIncrement(decimalHours, 0.25)
  let total = rounded
  while (total >= 24) total -= 24
  while (total < 0) total += 24
  const h = Math.floor(total)
  const m = Math.round((total - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Weekly total formatted with protocol's native unit. Uses the action's
// clinical rounding increment so week aggregates align with daily dose.
function formatWeeklyTotal(value: number, action: string, unit?: string): string {
  const rounded = roundForAction(value, action)
  const inc = actionIncrement(action)
  const decimals = inc >= 1 ? 0 : inc >= 0.1 ? 1 : 2
  return `${rounded.toFixed(decimals)}${unit ? ' ' + unit : ''}`
}

// How often per week each action is performed (for translating weekly
// target -> today's dose).
const WEEKLY_CADENCE: Record<string, number> = {
  running_volume: 5,
  training_volume: 5,
  training_load: 5,
  zone2_volume: 3,
  active_energy: 7,
  steps: 7,
  dietary_protein: 7,
  dietary_energy: 7,
  carbohydrate_g: 7,
  fiber_g: 7,
  late_meal_count: 7,
  post_meal_walks: 7,
  bedroom_temp_c: 7,
  bedtime: 7,
  sleep_duration: 7,
}

// Clock slot + display metadata per action.
const ACTION_SLOT: Record<
  string,
  { time: string; slot: ScheduleItem['slot']; icon: string; title: string }
> = {
  dietary_protein: { time: '07:00', slot: 'morning', icon: '🥚', title: 'Morning protein' },
  dietary_energy: { time: '12:30', slot: 'afternoon', icon: '🍽️', title: 'Midday meal' },
  carbohydrate_g: { time: '12:30', slot: 'afternoon', icon: '🍽️', title: 'Carbohydrate target' },
  fiber_g: { time: '12:30', slot: 'afternoon', icon: '🥬', title: 'Fiber target' },
  late_meal_count: { time: '18:30', slot: 'evening', icon: '🕡', title: 'Meal cutoff' },
  post_meal_walks: { time: '13:15', slot: 'afternoon', icon: '🚶', title: 'Post-meal walks' },
  bedroom_temp_c: { time: '21:00', slot: 'evening', icon: '🌡️', title: 'Bedroom cooling' },
  active_energy: { time: '07:30', slot: 'morning', icon: '🚶', title: 'Morning movement' },
  steps: { time: '12:00', slot: 'afternoon', icon: '👟', title: 'Walk breaks' },
  running_volume: { time: '16:30', slot: 'afternoon', icon: '🏃', title: 'Training run' },
  training_volume: { time: '16:30', slot: 'afternoon', icon: '🏋️', title: 'Training session' },
  training_load: { time: '16:30', slot: 'afternoon', icon: '🏋️', title: 'Training session' },
  zone2_volume: { time: '16:30', slot: 'afternoon', icon: '🚴', title: 'Zone 2 session' },
  bedtime: { time: '22:30', slot: 'evening', icon: '🌙', title: 'Lights out' },
  sleep_duration: { time: '22:30', slot: 'evening', icon: '😴', title: 'Sleep window' },
}

const REGIME_LABEL: Record<RegimeKey, string> = {
  overreaching_state: 'Overreaching',
  iron_deficiency_state: 'Iron-deficient',
  sleep_deprivation_state: 'Sleep-deprived',
  inflammation_state: 'Inflamed',
}

function activeRegimes(activations: Partial<Record<RegimeKey, number>> | undefined): RegimeKey[] {
  if (!activations) return []
  return (Object.entries(activations) as Array<[RegimeKey, number]>)
    .filter(([, v]) => v >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
}

// Translate a protocol's (target_value, current_value) into today's
// specific action, given the active regime + week-to-date ratio.
function doseForToday(
  protocol: Protocol,
  weekRatio: number,
  regimes: RegimeKey[],
): { dose: string; rationale: string; modifier?: string } {
  const { action, target_value, current_value, unit } = protocol
  const cadence = WEEKLY_CADENCE[action] ?? 7

  // Bedtime / sleep_duration: target is a daily clock / duration — direct.
  if (action === 'bedtime') {
    const today = formatClockTime(target_value)
    const curr = formatClockTime(current_value)
    const deltaHours = roundToIncrement(current_value - target_value, 0.25)
    const deltaMin = Math.round(deltaHours * 60)
    return {
      dose: `${today} tonight`,
      rationale:
        deltaMin > 0
          ? `You've been averaging ${curr} — pull tonight forward by ~${deltaMin} min`
          : `On target (avg ${curr})`,
    }
  }
  if (action === 'sleep_duration') {
    return {
      dose: `${formatHours(target_value)} in bed`,
      rationale: `Week trailing avg ${formatHours(current_value)} — aim for ${formatHours(target_value)} tonight`,
    }
  }

  // Daily-frequency actions (protein, energy, steps, active energy): show
  // today's target directly, flagged if behind this week.
  if (cadence >= 7) {
    const pct = Math.round((current_value / target_value) * 100)
    return {
      dose: formatActionValue(target_value, action),
      rationale:
        pct < 80
          ? `Week trailing avg ${formatActionValue(current_value, action)} (~${pct}% of target)`
          : `Holding steady at ~${pct}% of target`,
    }
  }

  // Training actions (running, cycling, sessions): convert weekly target
  // to today's dose. If week-to-date is behind, today's dose is larger;
  // if ahead, today's is smaller / rest.
  const weeklyTarget = target_value * cadence
  const weeklyDone = weeklyTarget * weekRatio
  const remainingDays = Math.max(1, cadence - Math.round(weekRatio * cadence))
  const todayDose = Math.max(0, (weeklyTarget - weeklyDone) / remainingDays)

  let regimeModifier: string | undefined
  let adjustedDose = todayDose
  if (regimes.includes('overreaching_state') || regimes.includes('iron_deficiency_state')) {
    adjustedDose = todayDose * 0.6
    regimeModifier = regimes.includes('iron_deficiency_state')
      ? 'Iron-deficient: cap intensity · keep HR < 145'
      : 'Overreaching: easy effort only · dial volume back 40%'
  } else if (regimes.includes('inflammation_state')) {
    adjustedDose = todayDose * 0.5
    regimeModifier = 'Inflammation: skip hard intervals, recovery pace'
  }

  const weeklyDoneStr = formatWeeklyTotal(weeklyDone, action, unit)
  const weeklyTargetStr = formatWeeklyTotal(weeklyTarget, action, unit)

  if (adjustedDose < weeklyTarget * 0.04) {
    return {
      dose: 'Rest day',
      rationale: `You're ahead of the weekly target (${weeklyDoneStr} / ${weeklyTargetStr})`,
      modifier: regimeModifier,
    }
  }

  return {
    dose: formatActionValue(adjustedDose, action),
    rationale: `Week so far: ${weeklyDoneStr} / ${weeklyTargetStr} (${Math.round(weekRatio * 100)}%) · today brings you to the cadence`,
    modifier: regimeModifier,
  }
}

// Week-so-far stats derived deterministically from pid + day for the demo.
function buildWeekStats(
  protocols: Protocol[],
  pid: number,
  day: number,
): { stats: WeekStat[]; ratios: Record<string, number> } {
  const stats: WeekStat[] = []
  const ratios: Record<string, number> = {}
  const rng = seedRandom(pid, Math.floor(day / 7))

  const volumeActions = protocols.filter((p) =>
    ['running_volume', 'training_volume', 'zone2_volume'].includes(p.action),
  )
  for (const p of volumeActions.slice(0, 2)) {
    const cadence = WEEKLY_CADENCE[p.action] ?? 5
    const weeklyTarget = p.target_value * cadence
    // Week-to-date fraction depends on day-of-week (assume Tuesday = ~28% in)
    const dayOfWeek = day % 7
    const expectedRatio = dayOfWeek / 7
    // Behavior noise: real-life members rarely hit the linear schedule.
    const actual = Math.max(0, Math.min(1.2, expectedRatio + (rng() - 0.5) * 0.35))
    const done = weeklyTarget * actual
    ratios[p.action] = actual
    stats.push({
      label: p.action.replace(/_/g, ' '),
      done: Math.round(done),
      target: Math.round(weeklyTarget),
      unit: p.unit || '',
      ratio: actual,
      status: actual < 0.75 ? 'behind' : actual > 1.05 ? 'ahead' : 'on_track',
    })
  }
  return { stats, ratios }
}

export function deriveWeekContext(
  participant: ParticipantPortal,
  date: Date = new Date(),
): WeekContext {
  const day = dayOfYear(date)
  const { stats } = buildWeekStats(participant.protocols, participant.pid, day)
  const regimes = activeRegimes(participant.regime_activations)

  let narrative = 'Steady week — today follows the baseline plan.'
  if (regimes.length > 0) {
    narrative = `${regimes.map((r) => REGIME_LABEL[r]).join(' + ')} regime active — today's schedule dials back accordingly.`
  } else if (stats.some((s) => s.status === 'behind')) {
    const behind = stats.find((s) => s.status === 'behind')!
    narrative = `You're behind on ${behind.label} (${behind.done}/${behind.target} ${behind.unit}) — today ramps you back toward the weekly target.`
  } else if (stats.some((s) => s.status === 'ahead')) {
    narrative = `Ahead of schedule — today is lighter than usual to protect recovery.`
  }

  return {
    dateLabel: date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    dayOfWeek: DAY_OF_WEEK[date.getDay()],
    stats,
    activeRegimes: regimes,
    narrative,
  }
}

export function deriveTodaySchedule(
  participant: ParticipantPortal,
  date: Date = new Date(),
): ScheduleItem[] {
  const day = dayOfYear(date)
  const { ratios } = buildWeekStats(participant.protocols, participant.pid, day)
  const regimes = activeRegimes(participant.regime_activations)

  // Dedup protocols by action (engine emits multiple options per action —
  // the day-level schedule picks the conservative one).
  const byAction = new Map<string, Protocol>()
  for (const p of participant.protocols) {
    const existing = byAction.get(p.action)
    if (!existing) byAction.set(p.action, p)
    else if (p.option_label === 'conservative' || p.option_label === 'single') {
      byAction.set(p.action, p)
    }
  }

  const items: ScheduleItem[] = []
  for (const [action, protocol] of byAction) {
    const slot = ACTION_SLOT[action]
    if (!slot) continue

    const weekRatio = ratios[action] ?? 0.5
    const { dose, rationale, modifier } = doseForToday(protocol, weekRatio, regimes)

    // Override time for bedtime: use the target itself (24h HH:MM so
    // localeCompare sorts it correctly relative to other slot times).
    let time = slot.time
    if (action === 'bedtime') {
      time = toClock24(protocol.target_value)
    }

    items.push({
      time,
      slot: slot.slot,
      icon: slot.icon,
      title: slot.title,
      dose,
      rationale,
      modifier,
      action,
      tier: protocol.gate_tier,
    })
  }

  items.sort((a, b) => a.time.localeCompare(b.time))
  return items
}
