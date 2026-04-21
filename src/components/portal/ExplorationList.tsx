/**
 * Exploration rows — mirror the Insights row layout, but instead of
 * surfacing a causal effect they surface the test that would improve
 * the engine most on a given pair.
 *
 * For each (action, outcome) pair the engine currently can't speak to,
 * we show:
 *   - what to change (kind: vary_action / repeat_measurement)
 *   - why the engine is stuck (positivity flag + rationale)
 *   - how much model lift a successful test would buy
 *
 * Ranked by descending lift so the highest-value tests land on top.
 */

import { useMemo, useState } from 'react'
import {
  ChevronRight,
  FlaskConical,
  Watch,
  Activity,
  RotateCw,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import {
  ACTION_ICON_COLOR,
  ACTION_ICONS,
  ACTION_LABELS,
  OUTCOME_LABELS,
} from './InsightRow'
import type {
  ExplorationRecommendation,
  ParticipantPortal,
} from '@/data/portal/types'

interface ExplorationListProps {
  participant: ParticipantPortal
}

type ExplorationRow = ExplorationRecommendation & {
  lift: number
}

const FLAG_RANK: Record<string, number> = {
  insufficient: 2,
  marginal: 1,
  ok: 0,
}

const FLAG_STYLE: Record<string, string> = {
  insufficient: 'text-rose-700 bg-rose-50 border-rose-200',
  marginal: 'text-amber-700 bg-amber-50 border-amber-200',
  ok: 'text-slate-600 bg-slate-50 border-slate-200',
}

const FLAG_LABEL: Record<string, string> = {
  insufficient: 'too-flat',
  marginal: 'nearly',
  ok: 'ready',
}

const KIND_STYLE: Record<string, string> = {
  vary_action: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  repeat_measurement: 'text-emerald-700 bg-emerald-50 border-emerald-200',
}

const KIND_LABEL: Record<string, string> = {
  vary_action: 'Vary action',
  repeat_measurement: 'Repeat draw',
}

const KIND_TOOLTIP: Record<string, string> = {
  vary_action:
    'Change day-to-day behavior on this action so the engine can see how your personal response differs from the cohort.',
  repeat_measurement:
    'Schedule another measurement so the engine has more than one personal observation to work with.',
}

const FLAG_TOOLTIP: Record<string, string> = {
  insufficient:
    'Your behavior on this action has been too flat to separate cause from noise. A test needs real variation.',
  marginal:
    'Close to enough variation — a test now would help, but more spread would help more.',
  ok: 'Enough variation already exists; this test is ready to run.',
}

function lift(rec: ExplorationRecommendation): number {
  // Room left for personal data to move the posterior away from the
  // cohort prior. Bounded [0, 1]; higher = more model lift from a
  // successful test.
  return Math.max(0, Math.min(1, 1 - rec.prior_contraction))
}

function formatOutcome(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, ' ')
}

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ')
}

export function ExplorationList({ participant }: ExplorationListProps) {
  const [kindFilter, setKindFilter] = useState<
    'all' | 'vary_action' | 'repeat_measurement'
  >('all')

  const rows = useMemo<ExplorationRow[]>(() => {
    const recs = participant.exploration_recommendations ?? []
    return recs
      .map((r) => ({ ...r, lift: lift(r) }))
      .sort((a, b) => b.lift - a.lift || FLAG_RANK[a.positivity_flag] - FLAG_RANK[b.positivity_flag])
  }, [participant])

  const filtered = useMemo(
    () => (kindFilter === 'all' ? rows : rows.filter((r) => r.kind === kindFilter)),
    [rows, kindFilter],
  )

  const counts = useMemo(() => {
    const c = { all: rows.length, vary_action: 0, repeat_measurement: 0 }
    for (const r of rows) c[r.kind] += 1
    return c
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl">
        No outstanding exploration suggestions — the engine has what it needs.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        Each row is a test the engine can't answer yet, ranked by how much
        a successful test would personalize the answer. The percentage is
        how much of the engine's answer is still borrowed from the cohort
        average — the higher it is, the more room your personal data has
        to move the result.
      </p>

      <div className="flex gap-1.5 text-[11px]">
        <FilterChip
          active={kindFilter === 'all'}
          onClick={() => setKindFilter('all')}
          label={`All ${counts.all}`}
        />
        <FilterChip
          active={kindFilter === 'vary_action'}
          onClick={() => setKindFilter('vary_action')}
          icon={<Activity className="w-3 h-3" />}
          label={`Vary action ${counts.vary_action}`}
        />
        <FilterChip
          active={kindFilter === 'repeat_measurement'}
          onClick={() => setKindFilter('repeat_measurement')}
          icon={<RotateCw className="w-3 h-3" />}
          label={`Repeat draw ${counts.repeat_measurement}`}
        />
      </div>

      <div className="space-y-1.5">
        {filtered.map((r) => (
          <ExplorationRowItem key={`${r.action}-${r.outcome}`} row={r} />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors',
        active
          ? 'bg-primary-50 border-primary-200 text-primary-700'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function ExplorationRowItem({ row }: { row: ExplorationRow }) {
  const [expanded, setExpanded] = useState(false)
  const PathwayIcon = row.pathway === 'biomarker' ? FlaskConical : Watch
  const ActionIcon = ACTION_ICONS[row.action]
  const liftPct = Math.round(row.lift * 100)

  return (
    <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
      >
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        {ActionIcon && (
          <ActionIcon
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: ACTION_ICON_COLOR }}
            aria-hidden
          />
        )}
        <span
          className="text-[13px] font-medium text-slate-800 w-32 flex-shrink-0 truncate"
          title={formatAction(row.action)}
        >
          {formatAction(row.action)}
        </span>
        <span className="text-slate-300 text-xs flex-shrink-0">→</span>
        <span
          className="text-[13px] font-medium text-slate-800 w-32 flex-shrink-0 truncate"
          title={formatOutcome(row.outcome)}
        >
          {formatOutcome(row.outcome)}
        </span>

        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
            KIND_STYLE[row.kind],
          )}
          title={KIND_TOOLTIP[row.kind]}
        >
          {KIND_LABEL[row.kind]}
        </span>
        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
            FLAG_STYLE[row.positivity_flag],
          )}
          title={FLAG_TOOLTIP[row.positivity_flag]}
        >
          {FLAG_LABEL[row.positivity_flag]}
        </span>
        <PathwayIcon
          className="w-3 h-3 flex-shrink-0"
          style={{ color: ACTION_ICON_COLOR }}
          aria-label={row.pathway === 'biomarker' ? 'Biomarker' : 'Wearable'}
        />

        <span
          className="ml-auto flex items-center gap-2 flex-shrink-0"
          title={`${liftPct}% of this answer is still the cohort average — that's the room a successful test has to personalize it.`}
        >
          <span className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <span
              className="block h-full bg-indigo-500 rounded-full"
              style={{ width: `${liftPct}%` }}
            />
          </span>
          <span className="text-[12px] font-semibold text-slate-700 tabular-nums w-8 text-right">
            {liftPct}%
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/60 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
              Why this test
            </p>
            <p className="text-xs text-slate-700 leading-snug">{row.rationale}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div>
              <span className="block text-slate-400 uppercase tracking-wider text-[10px]">
                Current n
              </span>
              <span className="text-slate-700 tabular-nums">{row.user_n}</span>
            </div>
            <div>
              <span className="block text-slate-400 uppercase tracking-wider text-[10px]">
                Already personalized
              </span>
              <span className="text-slate-700 tabular-nums">
                {Math.round(row.prior_contraction * 100)}%
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            {row.kind === 'vary_action'
              ? 'Introduce real day-to-day variation on this action to let the engine fit a personal slope.'
              : 'Schedule a follow-up draw so the engine has more than one personal observation.'}
          </p>
        </div>
      )}
    </div>
  )
}

export default ExplorationList
