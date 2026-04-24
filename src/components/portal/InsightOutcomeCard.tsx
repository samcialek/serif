/**
 * InsightOutcomeCard — wraps a single outcome with the actions that
 * move it, ranked by absolute Cohen's d.
 *
 * Header: outcome label + current value (from outcome_baselines) +
 * cohort percentile band.
 * Body: top-N InsightActionRow entries, with a "show all" expander
 * for additional edges.
 *
 * v1 omits the per-row expanded detail panel (Phase 3 will fill that
 * in with curve shape + Bayesian breakdown). For now clicking a row
 * just opens an inline placeholder so the wiring is in place.
 */

import { useMemo, useState } from 'react'
import { cn } from '@/utils/classNames'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import {
  cohensD,
  outcomeSD,
  beneficialSign,
} from '@/utils/insightStandardization'
import { InsightActionRow } from './InsightActionRow'
import { InsightActionDetail } from './InsightActionDetail'

const TOP_N_DEFAULT = 5

const OUTCOME_LABELS: Record<string, string> = {
  hrv_daily: 'Overnight HRV',
  resting_hr: 'Resting heart rate',
  sleep_quality: 'Sleep quality',
  sleep_efficiency: 'Sleep efficiency',
  deep_sleep: 'Deep sleep',
  cortisol: 'Cortisol',
  glucose: 'Glucose',
  apob: 'ApoB',
  ferritin: 'Ferritin',
  hemoglobin: 'Hemoglobin',
  iron_total: 'Iron (total)',
  zinc: 'Zinc',
  testosterone: 'Testosterone',
  hscrp: 'hs-CRP',
}

const OUTCOME_UNIT: Record<string, string> = {
  hrv_daily: 'ms',
  resting_hr: 'bpm',
  sleep_quality: '',
  sleep_efficiency: '%',
  deep_sleep: 'min',
  cortisol: 'µg/dL',
  glucose: 'mg/dL',
  apob: 'mg/dL',
  ferritin: 'ng/mL',
  hemoglobin: 'g/dL',
  iron_total: 'µg/dL',
  zinc: 'µg/dL',
  testosterone: 'ng/dL',
  hscrp: 'mg/L',
}

/** Soft band stripe per outcome category — gives the cards a quick
 * visual rhythm without making them shouty. */
const OUTCOME_STRIPE: Record<string, string> = {
  hrv_daily: 'bg-rose-400',
  resting_hr: 'bg-rose-400',
  sleep_quality: 'bg-violet-400',
  sleep_efficiency: 'bg-violet-400',
  deep_sleep: 'bg-violet-400',
  cortisol: 'bg-amber-400',
  glucose: 'bg-amber-400',
  apob: 'bg-amber-400',
  hscrp: 'bg-orange-400',
  ferritin: 'bg-emerald-400',
  hemoglobin: 'bg-emerald-400',
  iron_total: 'bg-emerald-400',
  zinc: 'bg-teal-400',
  testosterone: 'bg-indigo-400',
}

interface Props {
  outcome: string
  edges: InsightBayesian[]
  participant: ParticipantPortal
}

export function InsightOutcomeCard({ outcome, edges, participant }: Props) {
  const [expandAll, setExpandAll] = useState(false)
  const [openEdgeId, setOpenEdgeId] = useState<string | null>(null)

  // Rank edges by absolute Cohen's d under personal-mode posterior.
  // (DataModeToggle changes the row visual but ranking stays stable so
  // the user sees the same edge set in both modes.)
  const ranked = useMemo(() => {
    const scored = edges.map((edge) => ({
      edge,
      absD: Math.abs(cohensD(edge, participant)),
      key: `${edge.action}-${edge.outcome}`,
    }))
    scored.sort((a, b) => b.absD - a.absD)
    return scored
  }, [edges, participant])

  const visible = expandAll ? ranked : ranked.slice(0, TOP_N_DEFAULT)
  const hidden = ranked.length - visible.length

  const baseline = participant.outcome_baselines?.[outcome]
  const unit = OUTCOME_UNIT[outcome] ?? ''
  const sd = outcomeSD(outcome)
  const direction = beneficialSign(outcome) > 0 ? 'higher better' : 'lower better'

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="flex">
        {/* Category color stripe */}
        <div
          className={cn(
            'w-1 flex-shrink-0',
            OUTCOME_STRIPE[outcome] ?? 'bg-slate-300',
          )}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 truncate">
                {OUTCOME_LABELS[outcome] ?? outcome}
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {direction} · cohort SD ≈ {formatSD(sd)} {unit}
              </p>
            </div>
            {baseline != null && (
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">
                  Current
                </div>
                <div className="text-base font-semibold tabular-nums text-slate-700">
                  {formatBaseline(baseline)} <span className="text-xs text-slate-400">{unit}</span>
                </div>
              </div>
            )}
          </div>

          {/* Body — ranked rows */}
          <ul className="p-1">
            {visible.map(({ edge, key }) => (
              <li key={key}>
                <InsightActionRow
                  edge={edge}
                  participant={participant}
                  expanded={openEdgeId === key}
                  onToggle={() =>
                    setOpenEdgeId((prev) => (prev === key ? null : key))
                  }
                />
                {openEdgeId === key && (
                  <InsightActionDetail edge={edge} participant={participant} />
                )}
              </li>
            ))}
            {visible.length === 0 && (
              <li className="px-3 py-3 text-[11px] italic text-slate-400">
                No exposed edges for this outcome yet.
              </li>
            )}
          </ul>

          {/* Footer */}
          {hidden > 0 && (
            <button
              onClick={() => setExpandAll(true)}
              className="w-full px-4 py-2 text-[11px] text-slate-500 hover:text-slate-700 border-t border-slate-100 text-left"
            >
              Show {hidden} more edge{hidden === 1 ? '' : 's'}
            </button>
          )}
          {expandAll && ranked.length > TOP_N_DEFAULT && (
            <button
              onClick={() => setExpandAll(false)}
              className="w-full px-4 py-2 text-[11px] text-slate-500 hover:text-slate-700 border-t border-slate-100 text-left"
            >
              Show top {TOP_N_DEFAULT} only
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBaseline(v: number): string {
  if (Math.abs(v) >= 100) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

function formatSD(sd: number): string {
  if (sd >= 100) return sd.toFixed(0)
  if (sd >= 10) return sd.toFixed(1)
  return sd.toFixed(2)
}

export default InsightOutcomeCard
