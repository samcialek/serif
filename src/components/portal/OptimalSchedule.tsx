/**
 * OptimalSchedule — renders the twin-SEM counterfactual pick.
 *
 * Displays:
 *   1. Chosen schedule (bedtime + session) as time-blocked cards
 *   2. Projected outcomes with baseline → projected deltas
 *   3. "Why this beat the alternatives" — top runner-ups with score diffs
 */

import { useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Moon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import {
  formatClockTime,
  formatHours,
  formatOutcomeValue,
  outcomeIncrement,
  roundToIncrement,
} from '@/utils/rounding'
import type {
  CounterfactualResult,
  OutcomeProjection,
  ScoredSchedule,
} from '@/utils/twinSem'
import { SESSION_PRESETS, diffSchedules } from '@/utils/twinSem'
import type { RegimeKey } from '@/data/portal/types'

const REGIME_LABEL: Record<RegimeKey, string> = {
  overreaching_state: 'Overreaching',
  iron_deficiency_state: 'Iron-deficient',
  sleep_deprivation_state: 'Sleep-deprived',
  inflammation_state: 'Inflamed',
}

const OUTCOME_DISPLAY: Record<string, string> = {
  sleep_quality: 'Sleep quality',
  hrv_daily: 'HRV',
  cortisol: 'Cortisol',
  glucose: 'Glucose',
  apob: 'ApoB',
  ferritin: 'Ferritin',
  hemoglobin: 'Hemoglobin',
  iron_total: 'Iron',
  zinc: 'Zinc',
}

const OUTCOME_UNIT: Record<string, string> = {
  sleep_quality: '',
  hrv_daily: ' ms',
  cortisol: ' µg/dL',
  glucose: ' mg/dL',
  apob: ' mg/dL',
  ferritin: ' ng/mL',
  hemoglobin: ' g/dL',
  iron_total: ' µg/dL',
  zinc: ' µg/dL',
}

const TIER_LABEL: Record<string, string> = {
  personal_established: 'Personal · established',
  personal_emerging: 'Personal · emerging',
  cohort_level: 'Cohort-level',
}

function formatBedtime(decimalHours: number): string {
  return formatClockTime(roundToIncrement(decimalHours, 0.25))
}

function formatHrsMin(hours: number): string {
  return formatHours(hours)
}

interface OptimalScheduleProps {
  result: CounterfactualResult
  dateLabel: string
  dayOfWeek: string
  activeRegimes: Array<{ key: RegimeKey; activation: number }>
  wakeTime: number // decimal hours
  current: {
    bedtime: number
    sleep_duration: number
    training_load: number
    running_volume: number
  }
}

export function OptimalSchedule({
  result,
  dateLabel,
  dayOfWeek,
  activeRegimes,
  wakeTime,
  current,
}: OptimalScheduleProps) {
  const { best, alternatives } = result
  const [expanded, setExpanded] = useState<boolean>(true)
  const session = SESSION_PRESETS[best.schedule.session]

  return (
    <div className="space-y-5">
      {/* Date header */}
      <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            {dayOfWeek}
          </h2>
          <p className="text-xs text-slate-500 tabular-nums">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-400">
            Twin-SEM score
          </span>
          <span className="text-lg font-bold tabular-nums text-emerald-700">
            {best.total >= 0 ? '+' : ''}
            {best.total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Regime banner */}
      {activeRegimes.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
          <span>
            <span className="font-semibold">Active regime{activeRegimes.length > 1 ? 's' : ''}:</span>{' '}
            {activeRegimes
              .map((r) => `${REGIME_LABEL[r.key]} (${(r.activation * 100).toFixed(0)}%)`)
              .join(' · ')}{' '}
            — schedule dials back accordingly.
          </span>
        </div>
      )}

      {/* Chosen schedule — time-blocked */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2">
          Today's optimal plan
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          {/* Training session */}
          <div
            className={cn(
              'p-4 rounded-xl border-2 relative overflow-hidden',
              best.schedule.session === 'rest'
                ? 'bg-slate-50 border-slate-300'
                : 'bg-sky-50 border-sky-300',
            )}
          >
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl">{session.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  {best.schedule.session === 'rest' ? 'All day' : session.time}
                </p>
                <p className="text-base font-bold text-slate-900">{session.label}</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-snug">{session.description}</p>
            {best.schedule.session !== 'rest' && session.training_load > 0 && (
              <div className="mt-2 pt-2 border-t border-sky-200 flex items-center gap-3 text-[11px] text-slate-600">
                <span className="tabular-nums">
                  <span className="font-semibold">{session.training_load.toFixed(0)}</span>{' '}
                  TRIMP
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold">{formatHours(session.training_volume)}</span>
                </span>
                {session.zone2_volume > 0 && (
                  <span className="tabular-nums">
                    <span className="font-semibold">{session.zone2_volume}</span> km Z2
                  </span>
                )}
                {session.running_volume > 0 && (
                  <span className="tabular-nums">
                    <span className="font-semibold">{session.running_volume}</span> km run
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bedtime + sleep */}
          <div className="p-4 rounded-xl border-2 bg-violet-50 border-violet-300">
            <div className="flex items-baseline gap-2 mb-2">
              <Moon className="w-5 h-5 text-violet-600" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  Lights out
                </p>
                <p className="text-base font-bold text-slate-900">
                  {formatBedtime(best.schedule.bedtime)}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-snug">
              {formatHrsMin(best.schedule.sleep_duration)} in bed — wake{' '}
              {formatClockTime(wakeTime)}
            </p>
            <div className="mt-2 pt-2 border-t border-violet-200 flex items-center gap-3 text-[11px] text-slate-600">
              <span className="tabular-nums">
                Shift from{' '}
                <span className="font-semibold">{formatBedtime(current.bedtime)}</span>
              </span>
              <span className="tabular-nums">
                <span className="font-semibold">
                  {(best.schedule.bedtime - current.bedtime >= 0 ? '+' : '') +
                    Math.round((best.schedule.bedtime - current.bedtime) * 60)}
                </span>{' '}
                min
              </span>
            </div>
          </div>
        </div>

        {best.regimeLabels.length > 0 && (
          <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{best.regimeLabels.join(' · ')}</span>
          </div>
        )}
      </div>

      {/* Projected outcomes */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mb-2">
          Projected outcomes under this plan
        </p>
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {collapseGroupedProjections(best.projections).map((p, i) => (
            <ProjectionRow key={i} projection={p} />
          ))}
        </div>
      </div>

      {/* Alternatives considered */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <span>
            Alternatives considered{' '}
            <span className="text-slate-500 font-normal">
              ({alternatives.length} of {result.all.length - 1} runner-ups shown)
            </span>
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {expanded && (
          <div className="mt-2 space-y-2">
            {alternatives.map((alt, i) => (
              <AlternativeRow key={i} base={best} alt={alt} wakeTime={wakeTime} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Group multiple outcomes (e.g., iron panel) under one row.
interface DisplayProjection {
  label: string
  outcomes: OutcomeProjection[]
  is_group: boolean
}

function collapseGroupedProjections(projs: OutcomeProjection[]): DisplayProjection[] {
  const out: DisplayProjection[] = []
  const groupBuckets = new Map<string, OutcomeProjection[]>()
  for (const p of projs) {
    if (p.group) {
      const bucket = groupBuckets.get(p.group) ?? []
      bucket.push(p)
      groupBuckets.set(p.group, bucket)
    } else {
      out.push({
        label: OUTCOME_DISPLAY[p.outcome] ?? p.outcome,
        outcomes: [p],
        is_group: false,
      })
    }
  }
  for (const [, bucket] of groupBuckets) {
    out.push({
      label: bucket[0].groupLabel ?? bucket[0].group ?? '',
      outcomes: bucket,
      is_group: true,
    })
  }
  return out
}

function ProjectionRow({ projection }: { projection: DisplayProjection }) {
  if (projection.is_group) {
    const totalWeighted = projection.outcomes.reduce((s, p) => s + p.weighted_total, 0)
    return (
      <div className="p-3 bg-white">
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <span className="text-sm font-semibold text-slate-800">{projection.label}</span>
          <ContributionBadge weighted={totalWeighted} />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {projection.outcomes.map((p) => (
            <div key={p.outcome} className="flex items-baseline justify-between gap-1.5">
              <span className="text-slate-500">{OUTCOME_DISPLAY[p.outcome] ?? p.outcome}</span>
              <ProjectedDeltaInline projection={p} />
            </div>
          ))}
        </div>
      </div>
    )
  }
  const p = projection.outcomes[0]
  return (
    <div className="p-3 bg-white">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-slate-800">{projection.label}</span>
        <ProjectedDeltaInline projection={p} />
      </div>
      {p.contributions.length > 0 && (
        <div className="space-y-0.5">
          {p.contributions
            .slice()
            .sort((a, b) => Math.abs(b.weighted_contribution) - Math.abs(a.weighted_contribution))
            .slice(0, 3)
            .map((c, i) => (
              <p key={i} className="text-[11px] text-slate-500 leading-snug">
                via <span className="font-medium text-slate-700">{c.action.replace(/_/g, ' ')}</span>{' '}
                <span className="text-slate-400">({TIER_LABEL[c.tier] ?? c.tier})</span>{' '}
                <span className="tabular-nums">
                  {c.weighted_contribution >= 0 ? '+' : ''}
                  {c.weighted_contribution.toFixed(2)}
                </span>
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

function ProjectedDeltaInline({ projection: p }: { projection: OutcomeProjection }) {
  const unit = OUTCOME_UNIT[p.outcome] ?? ''
  const inc = outcomeIncrement(p.outcome)
  const deltaDisplay = roundToIncrement(p.delta, inc)
  const Arrow = p.is_user_benefit ? TrendingUp : TrendingDown
  const tone = p.is_user_benefit ? 'text-emerald-700' : 'text-rose-700'

  if (p.baseline != null && p.projected != null) {
    return (
      <span className="flex items-baseline gap-1.5 tabular-nums text-[11px]">
        <span className="text-slate-600">
          {formatOutcomeValue(p.baseline, p.outcome)} → {formatOutcomeValue(p.projected, p.outcome)}
          {unit}
        </span>
        <Arrow className={cn('w-3 h-3', tone)} />
      </span>
    )
  }
  return (
    <span className={cn('flex items-baseline gap-1 tabular-nums text-[11px]', tone)}>
      <span>
        {deltaDisplay >= 0 ? '+' : ''}
        {deltaDisplay.toFixed(inc < 1 ? 1 : 0)}
        {unit}
      </span>
      <Arrow className="w-3 h-3" />
    </span>
  )
}

function ContributionBadge({ weighted }: { weighted: number }) {
  const tone =
    weighted > 0.01 ? 'text-emerald-700' : weighted < -0.01 ? 'text-rose-700' : 'text-slate-500'
  return (
    <span className={cn('text-[11px] tabular-nums font-medium', tone)}>
      {weighted >= 0 ? '+' : ''}
      {weighted.toFixed(2)}
    </span>
  )
}

function AlternativeRow({
  base,
  alt,
  wakeTime,
}: {
  base: ScoredSchedule
  alt: ScoredSchedule
  wakeTime: number
}) {
  const altSession = SESSION_PRESETS[alt.schedule.session]
  const diff = diffSchedules(base, alt)
  return (
    <div className="p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm">
            {altSession.icon} {altSession.label}
          </span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs text-slate-600 tabular-nums">
            {formatBedtime(alt.schedule.bedtime)} lights out · {formatHours(alt.schedule.sleep_duration)} in bed
          </span>
        </div>
        <span
          className={cn(
            'text-xs tabular-nums font-medium',
            diff.totalDelta >= 0 ? 'text-emerald-700' : 'text-rose-700',
          )}
        >
          {diff.totalDelta >= 0 ? '+' : ''}
          {diff.totalDelta.toFixed(2)} vs chosen
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600">
        <span className="text-slate-500">Trade-offs:</span>
        {diff.topOutcomeDeltas.map((d, i) => (
          <span
            key={i}
            className={cn(
              'tabular-nums',
              d.delta > 0
                ? d.beneficial
                  ? 'text-emerald-700'
                  : 'text-rose-700'
                : d.beneficial
                ? 'text-rose-700'
                : 'text-emerald-700',
            )}
          >
            {d.delta >= 0 ? '+' : ''}
            {d.delta.toFixed(2)} {OUTCOME_DISPLAY[d.outcome] ?? d.outcome}
          </span>
        ))}
        {alt.regimeLabels.length > 0 && (
          <span className="text-amber-700 ml-auto">{alt.regimeLabels[0]}</span>
        )}
      </div>
    </div>
  )
}

export default OptimalSchedule
