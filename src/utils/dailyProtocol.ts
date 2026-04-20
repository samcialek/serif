/**
 * Full-day protocol generator.
 *
 * A "protocol" here means a rich, time-blocked set of concrete actions —
 * not just the single lights-out time that the twin-SEM picks. The twin-SEM
 * schedule (bedtime + session) is the spine; this module fills in the rest
 * of the day (wake routine, meals, pre/post-workout fuel, caffeine cutoff,
 * wind-down ritual, lights out) conditioned on the participant's current
 * regime state and load-bearing edges.
 *
 * Mapping:
 *   - twin_sem        → bedtime, lights-out, training session, sleep
 *                       duration — i.e. actions the twin actually optimized
 *   - regime_driven   → anti-inflammation meal choices, iron-panel support,
 *                       caffeine cutoff, recovery emphasis — triggered by
 *                       sleep_deprivation / inflammation / iron_deficiency
 *   - baseline        → daily-living defaults that the cohort prior endorses
 *                       (hydration on wake, protein at each meal, light walk)
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
  | 'nutrition'
  | 'hydration'
  | 'cardio'
  | 'circadian'
  | 'anti-inflammation'

export type ProtocolSource = 'twin_sem' | 'regime_driven' | 'baseline'

export interface ProtocolItem {
  time: string // "HH:MM" 24h — sort key
  displayTime: string // "6:30am"
  slot: ProtocolSlot
  icon: string
  title: string
  dose: string
  details?: string[]
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

function item(
  decimalHour: number,
  icon: string,
  title: string,
  dose: string,
  tags: ProtocolTag[],
  source: ProtocolSource,
  details?: string[],
  rationale?: string,
): ProtocolItem {
  return {
    time: decimalToHHMM(decimalHour),
    displayTime: formatClockTime(decimalHour),
    slot: slotForHour(Math.floor(decimalHour)),
    icon,
    title,
    dose,
    details,
    rationale,
    tags,
    source,
  }
}

export interface BuildProtocolOptions {
  wakeTime: number // decimal hours
  /** Defaults to 72 kg — only matters for protein / carb dosing text. */
  bodyMassKg?: number
}

export function buildDailyProtocol(
  participant: ParticipantPortal,
  schedule: CandidateSchedule,
  opts: BuildProtocolOptions,
): ProtocolItem[] {
  const wake = opts.wakeTime
  const mass = opts.bodyMassKg ?? 72

  const regimes = participant.regime_activations ?? {}
  const isSleepDep = (regimes.sleep_deprivation_state ?? 0) >= 0.5
  const isInflamed = (regimes.inflammation_state ?? 0) >= 0.3
  const isIronRisk = (regimes.iron_deficiency_state ?? 0) >= 0.2

  // Oron's cohort-level iron panel shows sensitivity to running_volume even
  // when the regime flag is quiet; fold that in by treating zone2/running days
  // as iron-support days too.
  const session = SESSION_PRESETS[schedule.session]
  const isRest = schedule.session === 'rest'
  const isHard = schedule.session === 'hard_intervals'
  const hasRunVolume = session.running_volume > 0 || session.zone2_volume > 0

  const ironFocus = isIronRisk || hasRunVolume
  const antiInflam = isInflamed

  const p = (gPerKg: number): number => Math.round(gPerKg * mass)
  const out: ProtocolItem[] = []

  // 1. Wake — hydrate + light exposure
  out.push(
    item(
      wake,
      '☀️',
      'Wake + hydrate',
      '500 ml water with a pinch of sea salt',
      ['hydration', 'circadian'],
      'baseline',
      [
        'Open blinds or step outside within 10 min — 5–10 min of outdoor light',
        'No caffeine for 90 min (let cortisol finish its peak)',
      ],
      isSleepDep
        ? 'Morning light anchors the circadian clock; critical while sleep_deprivation is active (100%).'
        : 'Morning light consolidates tomorrow night\'s sleep pressure.',
    ),
  )

  // 2. Breakfast — protein-front, anti-inflammatory if flagged
  const breakfastAt = wake + 0.5
  out.push(
    item(
      breakfastAt,
      '🥣',
      'Breakfast',
      `${p(0.5)}–${p(0.55)} g protein + complex carbs`,
      antiInflam
        ? ['nutrition', 'anti-inflammation', 'recovery']
        : ['nutrition', 'recovery'],
      'regime_driven',
      antiInflam
        ? [
            'Greek yogurt or whey + rolled oats + berries + 1 tbsp ground flax',
            'Skip processed meats and refined sugar this morning',
          ]
        : [
            'Eggs + oats or whey + rolled oats',
            'Add berries or a citrus fruit for polyphenols',
          ],
      antiInflam
        ? 'Inflammation is elevated (48%) — omega-3 + polyphenol load at breakfast shifts the day\'s cytokine set-point down.'
        : 'Front-loading protein improves satiety and downstream glucose control.',
    ),
  )

  // 3. Easy movement — only on rest/easy days as an AM anchor
  if (isRest || schedule.session === 'easy_z2') {
    out.push(
      item(
        wake + 1.25,
        '🚶',
        'Easy outdoor walk',
        '15–20 min, conversational pace',
        ['cardio', 'circadian'],
        'baseline',
        ['Outside if possible — keep HR below 120'],
        'Low-intensity movement improves glucose disposal without adding training load.',
      ),
    )
  }

  // 4. Iron-support snack (mid-morning) — only if iron-focus day
  if (ironFocus) {
    out.push(
      item(
        10.5,
        '🥭',
        'Iron-support snack',
        '2 dates + 30 g pumpkin seeds + 1 orange',
        ['iron', 'nutrition'],
        'regime_driven',
        [
          'Vitamin C (orange) boosts non-heme iron absorption 2–3×',
          'Avoid tea or coffee within 60 min of this snack — tannins block absorption',
        ],
        'Iron panel (ferritin, hemoglobin, iron, zinc) is sensitive to running volume in your cohort; this is a pre-emptive hedge.',
      ),
    )
  }

  // 5. Pre-workout fuel — only on training days with meaningful load
  if (!isRest) {
    const workoutHour = parseFloat(session.time.split(':')[0]) +
      parseFloat(session.time.split(':')[1]) / 60
    const preAt = workoutHour - 1.5
    out.push(
      item(
        preAt,
        '🍌',
        'Pre-workout fuel',
        isHard
          ? `${Math.round(mass * 1.0)} g carbs + 15 g protein, low fat/fibre`
          : `${Math.round(mass * 0.5)} g carbs, light snack`,
        ['nutrition', 'training'],
        'regime_driven',
        isHard
          ? [
              'Rice cakes + honey + a scoop of whey, or banana + dates',
              'Finish 60–90 min before start',
            ]
          : ['Banana or toast with jam — nothing heavy'],
        isHard
          ? 'VO2 intervals deplete muscle glycogen fast; under-fuelling here blunts the training stimulus.'
          : 'Easy sessions don\'t need much, but a small carb hit keeps intensity honest.',
      ),
    )
  }

  // 6. Lunch
  const lunchHour = 12.5
  out.push(
    item(
      lunchHour,
      '🥗',
      'Lunch',
      `${p(0.6)} g protein + leafy greens + legumes or whole grains`,
      ironFocus
        ? ['nutrition', 'iron', 'anti-inflammation']
        : ['nutrition'],
      'baseline',
      ironFocus
        ? [
            'Spinach + lentils + grilled chicken or salmon',
            'Dress with olive oil and lemon (vitamin C + MUFA)',
          ]
        : [
            'Grilled chicken or salmon + quinoa + mixed vegetables',
            'Olive oil dressing',
          ],
      'Protein at lunch protects muscle mass and stabilizes afternoon glucose.',
    ),
  )

  // 7. Caffeine cutoff — hard stop for sleep-deprived
  out.push(
    item(
      isSleepDep ? 13.0 : 14.0,
      '☕',
      'Caffeine cutoff',
      'No coffee, tea, or pre-workout past this point',
      ['sleep', 'circadian'],
      'regime_driven',
      [
        'Caffeine has an 8–10 h half-life',
        'After cutoff: water, herbal tea, or decaf only',
      ],
      isSleepDep
        ? 'Sleep deprivation is fully active (100%). Bringing the cutoff forward 1 h protects the bedtime target.'
        : 'Keeps caffeine below the threshold that fragments deep sleep.',
    ),
  )

  // 8. Training block — only if not rest day
  if (!isRest) {
    const workoutHour = parseFloat(session.time.split(':')[0]) +
      parseFloat(session.time.split(':')[1]) / 60
    out.push(
      item(
        workoutHour,
        session.icon,
        `Training — ${session.label}`,
        session.description,
        ['training', 'cardio'],
        'twin_sem',
        [
          `${session.training_load.toFixed(0)} TRIMP · ${(session.training_volume * 60).toFixed(0)} min`,
          session.zone2_volume > 0 ? `${session.zone2_volume} km in Zone 2` : '',
          session.running_volume > 0 ? `${session.running_volume} km running` : '',
          'Warm-up 10 min, cool-down 5 min',
        ].filter(Boolean),
        antiInflam
          ? 'Twin-SEM kept this session under the inflammation penalty threshold.'
          : 'Twin-SEM picked this session over alternatives as the best HRV/cortisol trade-off given today\'s regime state.',
      ),
    )

    // 9. Post-workout recovery
    out.push(
      item(
        workoutHour + session.training_volume + 0.25,
        '🥤',
        'Post-workout recovery',
        `${p(0.4)} g protein + ${Math.round(mass * 1.0)} g carbs within 45 min`,
        ['recovery', 'nutrition', 'training'],
        'regime_driven',
        [
          'Whey + rice + banana, or chocolate milk + protein',
          'Rehydrate 500–750 ml water with electrolytes',
        ],
        'Fast glycogen window + protein synthesis; offsets overreaching signal.',
      ),
    )
  } else {
    // 8b. Rest-day afternoon walk
    out.push(
      item(
        15.5,
        '🚶',
        'Afternoon walk',
        '30 min outdoor, Zone 1–2',
        ['cardio', 'recovery'],
        'baseline',
        ['Keep HR below 130', 'Sunlight exposure if possible'],
        'Aerobic work without added load — sustains VO2 baseline on rest days.',
      ),
    )
  }

  // 10. Dinner — iron-forward if iron focus
  const dinnerHour = 18.5
  out.push(
    item(
      dinnerHour,
      '🍽️',
      'Dinner',
      ironFocus
        ? `${p(0.5)} g heme-iron protein + cruciferous vegetables`
        : `${p(0.5)} g protein + vegetables + slow carbs`,
      ironFocus
        ? ['nutrition', 'iron', 'anti-inflammation']
        : antiInflam
          ? ['nutrition', 'anti-inflammation']
          : ['nutrition'],
      'regime_driven',
      ironFocus
        ? [
            'Lean beef, lamb, or oysters — plus broccoli or Brussels sprouts',
            'Bell peppers or citrus side for vitamin C',
            'Avoid coffee/tea with meal',
          ]
        : antiInflam
          ? [
              'Fatty fish (salmon, sardines) + roasted veg + sweet potato',
              'Olive oil finish — skip vegetable/seed oils',
            ]
          : [
              'Chicken or fish + roasted vegetables + sweet potato or rice',
            ],
      'Finishing dinner 3+ h before lights-out prevents nocturnal glucose disruption of sleep.',
    ),
  )

  // 11. Wind-down ritual — crucial for sleep-deprived
  const bed = schedule.bedtime
  out.push(
    item(
      bed - 1.0,
      '🧘',
      'Wind-down ritual',
      '15–20 min mobility + dim lights',
      ['sleep', 'circadian'],
      'regime_driven',
      [
        'Dim all overhead lights — lamps only, warm bulbs',
        'Light stretching, foam rolling, or 10 min reading',
        'Bedroom to 65–68°F / 18–20°C',
      ],
      isSleepDep
        ? 'Sleep deprivation is fully active — protecting this hour is the highest-leverage lever in the entire day.'
        : 'Dim light and cool temperature cue melatonin onset.',
    ),
  )

  // 12. Screens off
  out.push(
    item(
      bed - 0.5,
      '📵',
      'Screens off',
      'No phone, laptop, or TV',
      ['sleep', 'circadian'],
      'regime_driven',
      [
        'If you must use a screen: blue-light blockers + brightness minimum',
        'Phone out of bedroom — charge in another room',
      ],
      'Blue light suppresses melatonin for 30–60 min even at low exposure.',
    ),
  )

  // 13. Lights out — the twin-SEM pick
  out.push(
    item(
      bed,
      '🌙',
      'Lights out',
      `Asleep by ${formatClockTime(bed)}`,
      ['sleep'],
      'twin_sem',
      [
        `Target sleep duration: ${schedule.sleep_duration.toFixed(1)} h`,
        'Bedroom: dark, cool, quiet — eye mask if needed',
      ],
      'Twin-SEM pick: this bedtime scored highest against your sleep-quality and HRV posteriors given tonight\'s regime state.',
    ),
  )

  // Sort by time (handling late-evening wrap)
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
    case 'nutrition':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'hydration':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200'
    case 'cardio':
      return 'bg-teal-50 text-teal-700 border-teal-200'
    case 'circadian':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    case 'anti-inflammation':
      return 'bg-orange-50 text-orange-700 border-orange-200'
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
