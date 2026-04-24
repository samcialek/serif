/**
 * ExplorationActionRow — one experiment candidate row.
 *
 * Layout (left → right):
 *   icon · action label · → outcome · narrow-bar · prior-d chip
 *   · kind badge · feasibility chip · horizon chip · [progress] · expander
 *
 * Visually mirrors InsightActionRow so the two tabs feel like siblings.
 * The "narrow bar" is an indigo (suggested) / amber (running) gradient
 * that fills to `narrow × 100%` — how much uncertainty an experiment
 * would eliminate. The "prior-d" chip shows the cohort-prior expected
 * magnitude with its ± uncertainty.
 */

import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/classNames'
import {
  ACTION_ICON_COLOR,
  ACTION_ICONS,
  ACTION_LABELS,
  OUTCOME_LABELS,
} from './InsightRow'
import type { ExplorationEdge } from '@/utils/exploration'
import { horizonLabelFor } from '@/utils/exploration'
import {
  explorationKey,
  progressFor,
  useExplorationStore,
} from '@/stores/explorationStore'

const KIND_STYLE: Record<string, string> = {
  vary_action: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  repeat_measurement: 'text-emerald-700 bg-emerald-50 border-emerald-200',
}
const KIND_LABEL: Record<string, string> = {
  vary_action: 'Vary action',
  repeat_measurement: 'Repeat draw',
}

const FLAG_STYLE: Record<string, string> = {
  ok: 'text-slate-600 bg-slate-50 border-slate-200',
  marginal: 'text-amber-700 bg-amber-50 border-amber-200',
  insufficient: 'text-rose-700 bg-rose-50 border-rose-200',
}
const FLAG_LABEL: Record<string, string> = {
  ok: 'ready',
  marginal: 'nearly',
  insufficient: 'too-flat',
}

interface Props {
  edge: ExplorationEdge
  expanded?: boolean
  onToggle?: () => void
}

function formatOutcome(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, ' ')
}
function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

export function ExplorationActionRow({ edge, expanded = false, onToggle }: Props) {
  const { priorD, priorDSD, narrow, horizonDays } = edge.computed
  const key = explorationKey(edge.action, edge.outcome)
  const launched = useExplorationStore((s) => s.launched[key])
  const progress = progressFor(launched)
  const isRunning = progress?.isRunning === true
  const isComplete = progress?.isComplete === true

  const ActionIcon = ACTION_ICONS[edge.action]
  const barColor = isRunning
    ? 'bg-gradient-to-r from-amber-400 to-amber-500'
    : isComplete
      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
      : 'bg-gradient-to-r from-indigo-400 to-indigo-500'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors border-b border-slate-100 last:border-b-0',
        isRunning ? 'bg-amber-50/30' : isComplete ? 'bg-emerald-50/30' : 'hover:bg-slate-50',
      )}
    >
      {ActionIcon && (
        <ActionIcon
          className="w-3.5 h-3.5 flex-shrink-0"
          style={{ color: ACTION_ICON_COLOR }}
          aria-hidden
        />
      )}
      <span
        className="text-[13px] font-medium text-slate-800 w-28 flex-shrink-0 truncate"
        title={formatAction(edge.action)}
      >
        {formatAction(edge.action)}
      </span>
      <span className="text-slate-300 text-xs flex-shrink-0">→</span>
      <span
        className="text-[12px] text-slate-600 w-28 flex-shrink-0 truncate"
        title={formatOutcome(edge.outcome)}
      >
        {formatOutcome(edge.outcome)}
      </span>

      {/* Narrow bar — what fraction of uncertainty the experiment removes */}
      <span
        className="flex items-center gap-1.5 flex-shrink-0"
        title={`A successful experiment would eliminate ~${Math.round(narrow * 100)}% of the uncertainty on this slope.`}
      >
        <span className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <span
            className={cn('block h-full rounded-full', barColor)}
            style={{ width: `${Math.round(narrow * 100)}%` }}
          />
        </span>
        <span className="text-[10px] tabular-nums text-slate-500 w-8 text-right">
          {Math.round(narrow * 100)}%
        </span>
      </span>

      {/* Prior-d chip — expected magnitude under cohort prior */}
      <span
        className="inline-flex items-baseline gap-0.5 px-1.5 py-0 text-[11px] font-medium border rounded tabular-nums border-slate-200 bg-white text-slate-700"
        title={`Cohort-prior expected effect size, Cohen's d. ±${priorDSD.toFixed(2)} uncertainty.`}
      >
        <span>{`${priorD >= 0 ? '+' : ''}${priorD.toFixed(2)}σ`}</span>
        <span className="text-[9px] text-slate-400">±{priorDSD.toFixed(2)}</span>
      </span>

      {/* Kind */}
      <span
        className={cn(
          'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
          KIND_STYLE[edge.kind],
        )}
      >
        {KIND_LABEL[edge.kind]}
      </span>

      {/* Feasibility */}
      <span
        className={cn(
          'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
          FLAG_STYLE[edge.positivity_flag] ?? FLAG_STYLE.ok,
        )}
      >
        {FLAG_LABEL[edge.positivity_flag] ?? edge.positivity_flag}
      </span>

      {/* Horizon */}
      <span className="text-[10px] text-slate-500 tabular-nums">
        {horizonLabelFor(horizonDays)}
      </span>

      {/* Running progress */}
      {progress && (
        <span
          className={cn(
            'text-[10px] tabular-nums ml-1',
            isComplete ? 'text-emerald-700 font-semibold' : 'text-amber-700',
          )}
        >
          {isComplete
            ? 'done'
            : `${Math.round(progress.daysElapsed)}/${progress.daysTotal}d`}
        </span>
      )}

      <ChevronDown
        className={cn(
          'w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ml-auto',
          expanded && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  )
}

export default ExplorationActionRow
