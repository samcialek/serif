/**
 * ExplorationOutcomeCard — wraps the experiments that could personalize
 * a single outcome.
 *
 * Mirrors InsightOutcomeCard's layout: header with outcome label +
 * summary line, body with a ranked list of ExplorationActionRow entries.
 *
 * Phase 1 omits the per-row expanded detail panel — Phase 2 fills that
 * in with ExplorationActionDetail (prior curve + experiment prescription
 * + rationale). For Phase 1, clicking a row renders a small inline
 * placeholder with the rationale so the expand affordance works and
 * the row mounts the same way it will later.
 */

import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ExplorationEdge } from '@/utils/exploration'
import { ExplorationActionRow } from './ExplorationActionRow'

interface Props {
  outcome: string
  edges: ExplorationEdge[]
  outcomeLabel: string
}

const TOP_N_DEFAULT = 5

export function ExplorationOutcomeCard({ outcome, edges, outcomeLabel }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const visible = useMemo(
    () => (showAll ? edges : edges.slice(0, TOP_N_DEFAULT)),
    [edges, showAll],
  )

  const bestNarrow = edges.length > 0 ? Math.max(...edges.map((e) => e.computed.narrow)) : 0
  const bestInfoGain = edges.length > 0 ? Math.max(...edges.map((e) => e.computed.infoGain)) : 0

  return (
    <section
      id={`exploration-outcome-${outcome}`}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-3 flex-wrap">
        <h3 className="text-[13px] font-semibold text-slate-800">{outcomeLabel}</h3>
        <span className="text-[11px] text-slate-500">
          {edges.length} experiment{edges.length === 1 ? '' : 's'} could personalize this
        </span>
        {bestNarrow > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-indigo-700"
            title={`The strongest experiment here would eliminate ~${Math.round(bestNarrow * 100)}% of the remaining uncertainty on its slope.`}
          >
            <Sparkles className="w-3 h-3" aria-hidden />
            best narrow {Math.round(bestNarrow * 100)}% · best learn{' '}
            {bestInfoGain.toFixed(2)}σ
          </span>
        )}
      </div>

      {/* Rows */}
      <div>
        {visible.map((edge) => {
          const key = `${edge.action}::${edge.outcome}`
          const expanded = expandedKey === key
          return (
            <div key={key} className={cn(expanded && 'bg-slate-50/50')}>
              <ExplorationActionRow
                edge={edge}
                expanded={expanded}
                onToggle={() => setExpandedKey(expanded ? null : key)}
              />
              {expanded && (
                <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/40 text-[12px] text-slate-600 leading-snug">
                  <p>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block mb-0.5">
                      Why this experiment
                    </span>
                    {edge.rationale}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-500 italic">
                    Full prescription + prior curve lands in Phase 2. Current
                    observations: {edge.user_n}. Already personalized:{' '}
                    {Math.round(edge.prior_contraction * 100)}%.
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Show all */}
      {edges.length > TOP_N_DEFAULT && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-t border-slate-100"
        >
          {showAll
            ? 'Show top 5 only'
            : `Show ${edges.length - TOP_N_DEFAULT} more experiment${edges.length - TOP_N_DEFAULT === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  )
}

export default ExplorationOutcomeCard
