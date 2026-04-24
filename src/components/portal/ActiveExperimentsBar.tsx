/**
 * ActiveExperimentsBar — sticky strip at the top of /exploration-v2
 * showing running + recently-completed experiments as chips.
 *
 * Each chip: action icon · arrow · outcome · progress ring · days left
 * (or "done" for complete). Clicking a chip scrolls to + focuses the
 * matching row inside its outcome card.
 *
 * Hidden when no experiments have been launched.
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import type { ExplorationEdge } from '@/utils/exploration'
import {
  explorationKey,
  progressFor,
  useExplorationStore,
} from '@/stores/explorationStore'
import {
  ACTION_ICON_COLOR,
  ACTION_ICONS,
  ACTION_LABELS,
  OUTCOME_LABELS,
} from './InsightRow'

interface Props {
  edges: ExplorationEdge[]
  onChipClick: (key: string) => void
}

interface ActiveChipState {
  key: string
  action: string
  outcome: string
  fraction: number
  daysRemaining: number
  isComplete: boolean
}

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

function formatOutcome(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, ' ')
}

/** Small SVG progress ring — filled arc grows with fraction. */
function ProgressRing({ fraction, size = 18, color }: { fraction: number; size?: number; color: string }) {
  const r = (size - 3) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const dashOffset = circ * (1 - fraction)
  return (
    <svg width={size} height={size} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#e2e8f0" strokeWidth={2} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: 'stroke-dashoffset 200ms ease-out' }}
      />
    </svg>
  )
}

export function ActiveExperimentsBar({ edges, onChipClick }: Props) {
  const launched = useExplorationStore((s) => s.launched)

  const chips = useMemo<ActiveChipState[]>(() => {
    const out: ActiveChipState[] = []
    for (const edge of edges) {
      const key = explorationKey(edge.action, edge.outcome)
      const entry = launched[key]
      if (!entry) continue
      const p = progressFor(entry)
      if (!p) continue
      out.push({
        key,
        action: edge.action,
        outcome: edge.outcome,
        fraction: p.fraction,
        daysRemaining: Math.max(0, p.daysTotal - p.daysElapsed),
        isComplete: p.isComplete,
      })
    }
    // Running first, then completed; within each, earliest-finish first
    out.sort((a, b) => {
      if (a.isComplete !== b.isComplete) return a.isComplete ? 1 : -1
      return a.daysRemaining - b.daysRemaining
    })
    return out
  }, [edges, launched])

  if (chips.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex-shrink-0">
          Active · {chips.filter((c) => !c.isComplete).length} running
          {chips.some((c) => c.isComplete)
            ? ` · ${chips.filter((c) => c.isComplete).length} complete`
            : ''}
        </span>
        <div className="h-4 w-px bg-slate-200" aria-hidden />
        {chips.map((c) => {
          const ActionIcon = ACTION_ICONS[c.action]
          const color = c.isComplete ? '#10b981' : '#f59e0b'
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChipClick(c.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[11px] transition-colors',
                c.isComplete
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
              )}
              title={`${formatAction(c.action)} → ${formatOutcome(c.outcome)} · ${c.isComplete ? 'complete' : `${c.daysRemaining.toFixed(0)} days left`}`}
            >
              <ProgressRing fraction={c.fraction} color={color} />
              {ActionIcon && (
                <ActionIcon
                  className="w-3 h-3"
                  style={{ color: ACTION_ICON_COLOR }}
                  aria-hidden
                />
              )}
              <span className="truncate max-w-[100px]">
                {formatAction(c.action)}
              </span>
              <span className="opacity-60 text-[10px] tabular-nums">
                {c.isComplete ? 'done' : `${Math.round(c.daysRemaining)}d`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ActiveExperimentsBar
