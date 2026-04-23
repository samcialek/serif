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

import { AlertTriangle } from 'lucide-react'
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
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-baseline justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Today's context
        </div>
        <div className="text-[10px] text-slate-400">
          why today's protocol looks the way it does
        </div>
      </div>

      {/* Your loads */}
      {hasLoads && (
        <div className="p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
            Your loads
          </div>
          <LoadGrid loads={loads} />
        </div>
      )}

      {/* Active regimes */}
      {(hasLoads || activeRegimes.length > 0) && (
        <div className="h-px bg-slate-100" />
      )}
      <div className="p-3">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
          Active regimes
        </div>
        {activeRegimes.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic leading-snug">
            All regimes in normal range — today's protocol is baseline.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {activeRegimes.map((r) => (
              <li key={r.key} className="flex items-baseline gap-1.5 text-[12px] leading-snug">
                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 translate-y-[1px]" />
                <span>
                  <span className="font-semibold text-slate-800">
                    {REGIME_LABEL[r.key]}
                  </span>{' '}
                  <span className="tabular-nums text-amber-700">
                    {Math.round(r.activation * 100)}%
                  </span>
                  <span className="text-slate-400"> → </span>
                  <span className="text-slate-600">{REGIME_EFFECTS[r.key]}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Adjusted for */}
      {visibleConfounders.length > 0 && (
        <>
          <div className="h-px bg-slate-100" />
          <div className="p-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
              Adjusted for
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleConfounders.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px]"
                >
                  <span className="font-medium">{c.label}</span>
                  <span className="tabular-nums">{c.value}</span>
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
