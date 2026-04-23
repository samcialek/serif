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
 */

import { formatClockTime } from '@/utils/rounding'
import type { ParticipantPortal } from '@/data/portal/types'
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
}

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
  }
}

export interface BuildProtocolOptions {
  wakeTime: number
}

export function buildDailyProtocol(
  participant: ParticipantPortal,
  schedule: CandidateSchedule,
  opts: BuildProtocolOptions,
): ProtocolItem[] {
  const wake = opts.wakeTime
  const bed = schedule.bedtime
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
