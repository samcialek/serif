/**
 * OptimalSchedule — renders the full daily protocol.
 *
 * The twin-SEM pick (bedtime + session) is the spine; buildDailyProtocol
 * fills in the rest of the day. Layout priorities:
 *   1. Protocol timeline — dominant content (10–14 concrete actions)
 *   2. Projected outcomes — compact strip, one line per outcome
 *   3. Alternatives considered — collapsed accordion
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
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
import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'
import type { ProtocolItem } from '@/utils/dailyProtocol'
import {
  buildDailyProtocol,
  sourceLabel,
  tagColor,
} from '@/utils/dailyProtocol'

const REGIME_LABEL: Record<RegimeKey, string> = {
  overreaching_state: 'Overreaching',
  iron_deficiency_state: 'Iron-deficient',
  sleep_deprivation_state: 'Sleep-deprived',
  inflammation_state: 'Inflamed',
}

const OUTCOME_DISPLAY: Record<string, string> = {
  sleep_quality: 'Sleep quality',
  hrv_daily: 'Overnight RMSSD',
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

const SOURCE_DOT: Record<ProtocolItem['source'], string> = {
  twin_sem: 'bg-emerald-500',
  regime_driven: 'bg-amber-500',
  baseline: 'bg-slate-300',
}

interface OptimalScheduleProps {
  participant: ParticipantPortal
  result: CounterfactualResult
  dateLabel: string
  dayOfWeek: string
  activeRegimes: Array<{ key: RegimeKey; activation: number }>
  wakeTime: number
}

export function OptimalSchedule({
  participant,
  result,
  dateLabel,
  dayOfWeek,
  activeRegimes,
  wakeTime,
}: OptimalScheduleProps) {
  const { best, alternatives } = result
  const [altOpen, setAltOpen] = useState<boolean>(false)
  const [outcomesOpen, setOutcomesOpen] = useState<boolean>(false)
  const session = SESSION_PRESETS[best.schedule.session]

  const protocol = useMemo(
    () =>
      buildDailyProtocol(participant, best.schedule, {
        wakeTime,
      }),
    [participant, best.schedule, wakeTime],
  )

  // Top 3 beneficial projections for the compact outcomes strip.
  const topProjections = useMemo(() => {
    const items = best.projections
      .filter((p) => Math.abs(p.weighted_total) > 0.01)
      .sort((a, b) => Math.abs(b.weighted_total) - Math.abs(a.weighted_total))
    return items
  }, [best.projections])

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
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Session</p>
            <p className="text-sm font-semibold text-slate-700">
              {session.icon} {session.label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">
              Twin-SEM score
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-700">
              {best.total >= 0 ? '+' : ''}
              {best.total.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Regime banner */}
      {activeRegimes.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
          <span>
            <span className="font-semibold">
              Active regime{activeRegimes.length > 1 ? 's' : ''}:
            </span>{' '}
            {activeRegimes
              .map(
                (r) =>
                  `${REGIME_LABEL[r.key]} (${(r.activation * 100).toFixed(0)}%)`,
              )
              .join(' · ')}{' '}
            — protocol is tuned accordingly.
          </span>
        </div>
      )}

      {/* Compact outcomes strip */}
      {topProjections.length > 0 && (
        <div>
          <button
            onClick={() => setOutcomesOpen(!outcomesOpen)}
            className="w-full text-left"
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                Projected outcomes
              </p>
              <span className="flex items-center gap-1 text-[11px] text-slate-400">
                {outcomesOpen ? 'Hide detail' : 'Show detail'}
                {outcomesOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              {topProjections.map((p) => (
                <OutcomeChip key={p.outcome} projection={p} />
              ))}
            </div>
          </button>
          {outcomesOpen && (
            <div className="mt-2 divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
              {topProjections.map((p, i) => (
                <ProjectionRow key={i} projection={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROTOCOL TIMELINE — dominant content */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
            Today's protocol
          </p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            {protocol.length} actions · wake {formatClockTime(wakeTime)} → lights out{' '}
            {formatClockTime(best.schedule.bedtime)}
          </p>
        </div>
        <div className="relative">
          {/* Timeline spine */}
          <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />
          <ul className="space-y-2.5">
            {protocol.map((p, i) => (
              <ProtocolRow key={i} item={p} />
            ))}
          </ul>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Twin-SEM pick
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Regime-driven
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-300" /> Baseline
          </span>
          {best.regimeLabels.length > 0 && (
            <span className="text-amber-700 ml-auto">
              <AlertTriangle className="inline w-3 h-3 mr-1" />
              {best.regimeLabels.join(' · ')}
            </span>
          )}
        </div>
      </div>

      {/* Alternatives considered */}
      <div>
        <button
          onClick={() => setAltOpen(!altOpen)}
          className="flex items-center justify-between w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <span>
            Alternatives considered{' '}
            <span className="text-slate-500 font-normal">
              ({alternatives.length} of {result.all.length - 1} runner-ups)
            </span>
          </span>
          {altOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        {altOpen && (
          <div className="mt-2 space-y-2">
            {alternatives.map((alt, i) => (
              <AlternativeRow key={i} base={best} alt={alt} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ProtocolRow({ item }: { item: ProtocolItem }) {
  return (
    <li className="relative pl-12">
      {/* Time + source dot on the spine */}
      <div className="absolute left-0 top-0.5 flex items-center gap-1.5 w-[44px]">
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-white relative z-10',
            SOURCE_DOT[item.source],
          )}
        />
      </div>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="text-[11px] font-medium tabular-nums text-slate-500 w-14 flex-shrink-0">
          {item.displayTime}
        </span>
        <span className="text-base leading-none">{item.icon}</span>
        <span className="text-sm font-semibold text-slate-800">{item.title}</span>
        <span className="text-sm text-slate-600">·</span>
        <span className="text-sm text-slate-700">{item.dose}</span>
      </div>
      {item.details && item.details.length > 0 && (
        <ul className="ml-[72px] space-y-0.5 mb-1">
          {item.details.map((d, i) => (
            <li key={i} className="text-[12px] text-slate-600 leading-snug">
              · {d}
            </li>
          ))}
        </ul>
      )}
      {item.rationale && (
        <p className="ml-[72px] text-[11px] text-slate-500 italic leading-snug mb-1">
          {item.rationale}
        </p>
      )}
      <div className="ml-[72px] flex items-center gap-1.5 flex-wrap">
        {item.tags.map((t) => (
          <span
            key={t}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border tabular-nums',
              tagColor(t),
            )}
          >
            {t}
          </span>
        ))}
        <span className="text-[10px] text-slate-400 ml-auto">
          {sourceLabel(item.source)}
        </span>
      </div>
    </li>
  )
}

function OutcomeChip({ projection: p }: { projection: OutcomeProjection }) {
  const unit = OUTCOME_UNIT[p.outcome] ?? ''
  const inc = outcomeIncrement(p.outcome)
  const deltaDisplay = roundToIncrement(p.delta, inc)
  const label =
    OUTCOME_DISPLAY[p.outcome] ??
    (p.groupLabel ? p.groupLabel : p.outcome)
  const Arrow = p.is_user_benefit ? TrendingUp : TrendingDown
  const tone = p.is_user_benefit ? 'text-emerald-700' : 'text-rose-700'

  if (p.baseline != null && p.projected != null) {
    return (
      <span className="flex items-baseline gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] tabular-nums">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-700">
          {formatOutcomeValue(p.baseline, p.outcome)} →{' '}
          {formatOutcomeValue(p.projected, p.outcome)}
          {unit}
        </span>
        <Arrow className={cn('w-3 h-3', tone)} />
      </span>
    )
  }
  return (
    <span className="flex items-baseline gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] tabular-nums">
      <span className="text-slate-600">{label}</span>
      <span className={tone}>
        {deltaDisplay >= 0 ? '+' : ''}
        {deltaDisplay.toFixed(inc < 1 ? 1 : 0)}
        {unit}
      </span>
      <Arrow className={cn('w-3 h-3', tone)} />
    </span>
  )
}

const TIER_LABEL: Record<string, string> = {
  personal_established: 'Personal · established',
  personal_emerging: 'Personal · emerging',
  cohort_level: 'Cohort-level',
}

function ProjectionRow({ projection: p }: { projection: OutcomeProjection }) {
  const label =
    OUTCOME_DISPLAY[p.outcome] ??
    (p.groupLabel ? p.groupLabel : p.outcome)
  const unit = OUTCOME_UNIT[p.outcome] ?? ''
  const inc = outcomeIncrement(p.outcome)
  const deltaDisplay = roundToIncrement(p.delta, inc)
  const Arrow = p.is_user_benefit ? TrendingUp : TrendingDown
  const tone = p.is_user_benefit ? 'text-emerald-700' : 'text-rose-700'
  return (
    <div className="p-3 bg-white">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <span className={cn('text-[11px] tabular-nums flex items-baseline gap-1', tone)}>
          {p.baseline != null && p.projected != null ? (
            <>
              {formatOutcomeValue(p.baseline, p.outcome)} →{' '}
              {formatOutcomeValue(p.projected, p.outcome)}
              {unit}
            </>
          ) : (
            <>
              {deltaDisplay >= 0 ? '+' : ''}
              {deltaDisplay.toFixed(inc < 1 ? 1 : 0)}
              {unit}
            </>
          )}
          <Arrow className="w-3 h-3" />
        </span>
      </div>
      {p.contributions.length > 0 && (
        <div className="space-y-0.5">
          {p.contributions
            .slice()
            .sort(
              (a, b) =>
                Math.abs(b.weighted_contribution) -
                Math.abs(a.weighted_contribution),
            )
            .slice(0, 3)
            .map((c, i) => (
              <p key={i} className="text-[11px] text-slate-500 leading-snug">
                via{' '}
                <span className="font-medium text-slate-700">
                  {c.action.replace(/_/g, ' ')}
                </span>{' '}
                <span className="text-slate-400">
                  ({TIER_LABEL[c.tier] ?? c.tier})
                </span>{' '}
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

function AlternativeRow({
  base,
  alt,
}: {
  base: ScoredSchedule
  alt: ScoredSchedule
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
            {formatClockTime(alt.schedule.bedtime)} lights out ·{' '}
            {formatHours(alt.schedule.sleep_duration)} in bed
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
