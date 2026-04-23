/**
 * TodayContext — unified header panel above the Protocols timeline.
 *
 * One box answering "why today's protocol looks the way it does":
 *   1. Your loads — rolling ACWR / sleep debt / SRI / TSB / consistency
 *      grid with severity bands and personal-baseline deltas.
 *   2. Active regimes — each regime above its activation threshold gets
 *      a row with a plain-English summary of what that regime pulled
 *      (e.g., "Sleep-deprived 100% → pulls caffeine cutoff earlier,
 *      prioritizes bedtime and wind-down").
 *   3. Adjusted for — DAG confounders (season, weekend, travel load,
 *      location) the backdoor adjustment is conditioning on today.
 *
 * Replaces the split ContextStrip + amber "Active regime(s)" banner
 * that used to sit above the timeline. One box, three sections.
 */

import { AlertTriangle, Compass } from 'lucide-react'
import type {
  LoadKey,
  LoadValue,
  ParticipantPortal,
  RegimeKey,
} from '@/data/portal/types'
import { LoadGrid } from './ContextStrip'
import { buildConfounderDrivers } from '@/utils/dailyProtocol'
import { OBJECTIVE_ORON } from '@/utils/twinSem'

const REGIME_LABEL: Record<RegimeKey, string> = {
  overreaching_state: 'Overreaching',
  iron_deficiency_state: 'Iron-deficient',
  sleep_deprivation_state: 'Sleep-deprived',
  inflammation_state: 'Inflamed',
}

/** Plain-English summary of what each regime does to the day's protocol.
 * Sourced from the actual logic in buildDailyProtocol + the penalty
 * rules in twinSem — kept in one place so it doesn't drift. */
const REGIME_EFFECTS: Record<RegimeKey, string> = {
  sleep_deprivation_state:
    'pulls caffeine cutoff 2 h earlier, prioritizes bedtime and wind-down',
  overreaching_state:
    'penalizes heavy training load, emphasizes sleep recovery',
  inflammation_state:
    'adds anti-inflammatory diet emphasis, moderates training load',
  iron_deficiency_state:
    'adds iron-support window, reduces run volume, emphasizes dietary protein',
}

interface Props {
  participant: ParticipantPortal
  activeRegimes: Array<{ key: RegimeKey; activation: number }>
  date?: Date
}

export function TodayContext({ participant, activeRegimes, date }: Props) {
  const loads: Partial<Record<LoadKey, LoadValue>> = participant.loads_today ?? {}
  const hasLoads = Object.keys(loads).length > 0

  const objectiveOutcomes = OBJECTIVE_ORON.map((o) => o.outcome)
  const confounders = buildConfounderDrivers(
    participant,
    objectiveOutcomes,
    date ?? new Date(),
  )
  // Only surface confounders with a resolvable value today.
  const visibleConfounders = confounders.filter((c) => c.value)

  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/80 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-sm font-bold text-indigo-900 leading-none">
              Today's context
            </div>
            <div className="text-[10px] text-indigo-600 mt-0.5">
              why today's protocol looks the way it does
            </div>
          </div>
        </div>
      </div>

      {/* Your loads */}
      {hasLoads && (
        <div className="p-3">
          <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700 mb-2">
            Your loads
          </div>
          <LoadGrid loads={loads} />
        </div>
      )}

      {/* Active regimes */}
      {(hasLoads || activeRegimes.length > 0) && (
        <div className="h-px bg-slate-200" />
      )}
      <div className="p-3">
        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700 mb-2">
          Active regimes
        </div>
        {activeRegimes.length === 0 ? (
          <p className="text-[12px] text-slate-500 italic leading-snug">
            All regimes in normal range — today's protocol is baseline.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {activeRegimes.map((r) => (
              <li
                key={r.key}
                className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-[12px] leading-snug">
                  <span className="font-bold text-amber-900">
                    {REGIME_LABEL[r.key]}
                  </span>{' '}
                  <span className="tabular-nums font-semibold text-amber-700">
                    {Math.round(r.activation * 100)}%
                  </span>
                  <span className="text-amber-400"> → </span>
                  <span className="text-slate-700">{REGIME_EFFECTS[r.key]}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Adjusted for */}
      {visibleConfounders.length > 0 && (
        <>
          <div className="h-px bg-slate-200" />
          <div className="p-3">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700 mb-2">
              Adjusted for
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleConfounders.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-200 bg-white text-indigo-800 text-[11px]"
                >
                  <span className="font-semibold">{c.label}</span>
                  <span className="tabular-nums text-indigo-600">{c.value}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default TodayContext
