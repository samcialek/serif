/**
 * OptimalSchedule — renders the full daily protocol.
 *
 * The twin-SEM pick (bedtime + session) is the spine; buildDailyProtocol
 * fills in the rest of the day. Layout priorities:
 *   1. Protocol timeline — dominant content (10–14 concrete actions)
 *   2. Projected outcomes — compact strip, one line per outcome
 *   3. Alternatives considered — collapsed accordion
 *
 * Each timeline row carries a `context` field (driving loads, active regimes,
 * DAG confounders). Two surfaces explain that context to the user:
 *   - ProtocolContextChip: inline one-glance summary on every row.
 *   - ProtocolAuditTrail:  three-block "how we chose this" (baseline →
 *                          modifiers → final) behind a disclosure button.
 * Both have prototype variants; see ProtocolContextVariantToggle.
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Lightbulb,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Wand2,
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
import type { MatchedProtocolItem, ProtocolItem } from '@/utils/dailyProtocol'
import {
  buildDailyProtocol,
  matchProtocolItems,
  sourceLabel,
  tagColor,
  userConfoundersForItem,
} from '@/utils/dailyProtocol'
import { ContextStrip } from '@/components/portal/ContextStrip'
import { ProtocolContextChip } from '@/components/portal/ProtocolContextChip'
import type { ChipVariant } from '@/components/portal/ProtocolContextChip'
import { ProtocolAuditTrail } from '@/components/portal/ProtocolAuditTrail'
import type { AuditPlacement } from '@/components/portal/ProtocolAuditTrail'
import type { RegimeOverrides } from '@/components/portal/CounterfactualSliders'

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
  neutralBaseline: CounterfactualResult | null
  dateLabel: string
  dayOfWeek: string
  activeRegimes: Array<{ key: RegimeKey; activation: number }>
  wakeTime: number
  chipVariant: ChipVariant
  auditPlacement: AuditPlacement
  /** True when at least one regime slider has been moved away from
   * baseline. Gates the counterfactual banner above the timeline. */
  isCounterfactual?: boolean
  /** Current override map — which regimes have been moved and to where. */
  overrides?: RegimeOverrides
  /** Real (non-overridden) regime activations, for the "X → Y" diff
   * displayed in the counterfactual banner. */
  realBaselines?: Partial<Record<RegimeKey, number>>
  /** Called when the user clicks Reset in the banner. */
  onResetCounterfactual?: () => void
}

export function OptimalSchedule({
  participant,
  result,
  neutralBaseline,
  dateLabel,
  dayOfWeek,
  activeRegimes,
  wakeTime,
  chipVariant,
  auditPlacement,
  isCounterfactual = false,
  overrides = {},
  realBaselines = {},
  onResetCounterfactual,
}: OptimalScheduleProps) {
  const { best, alternatives } = result
  const [altOpen, setAltOpen] = useState<boolean>(false)
  const [outcomesOpen, setOutcomesOpen] = useState<boolean>(false)
  const session = SESSION_PRESETS[best.schedule.session]
  const today = useMemo(() => new Date(), [])

  const matched: MatchedProtocolItem[] = useMemo(() => {
    const real = buildDailyProtocol(participant, best.schedule, {
      wakeTime,
      date: today,
    })
    if (!neutralBaseline) {
      return real.map((r) => ({ real: r, neutral: null }))
    }
    const neutralParticipant: ParticipantPortal = {
      ...participant,
      regime_activations: {},
      loads_today: undefined,
    }
    const neutral = buildDailyProtocol(
      neutralParticipant,
      neutralBaseline.best.schedule,
      { wakeTime, date: today },
    )
    return matchProtocolItems(real, neutral)
  }, [participant, best.schedule, neutralBaseline, wakeTime, today])

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

      {/* Loads strip — today's rolling-load context */}
      {participant.loads_today && (
        <ContextStrip loads={participant.loads_today} />
      )}

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

      {/* Counterfactual banner */}
      {isCounterfactual && (
        <CounterfactualBanner
          overrides={overrides}
          realBaselines={realBaselines}
          onReset={onResetCounterfactual}
        />
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
            {matched.length} actions · wake {formatClockTime(wakeTime)} → lights out{' '}
            {formatClockTime(best.schedule.bedtime)}
          </p>
        </div>
        <div className="relative">
          {/* Timeline spine */}
          <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />
          <ul className="space-y-2.5">
            {matched.map((m, i) => (
              <ProtocolRow
                key={i}
                matched={m}
                participant={participant}
                chipVariant={chipVariant}
                auditPlacement={auditPlacement}
              />
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

interface ProtocolRowProps {
  matched: MatchedProtocolItem
  participant: ParticipantPortal
  chipVariant: ChipVariant
  auditPlacement: AuditPlacement
}

function ProtocolRow({
  matched,
  participant,
  chipVariant,
  auditPlacement,
}: ProtocolRowProps) {
  const { real, neutral } = matched
  const [suggestOpen, setSuggestOpen] = useState<boolean>(false)
  const [auditOpen, setAuditOpen] = useState<boolean>(false)
  const hasSuggestions = real.suggestions && real.suggestions.length > 0

  const userConfounders = useMemo(
    () => userConfoundersForItem(real, participant.effects_bayesian),
    [real, participant.effects_bayesian],
  )

  const hasContext =
    real.context.active_regimes.length > 0 ||
    real.context.driving_loads.length > 0 ||
    real.context.confounders_adjusted.some((c) => c.value)

  return (
    <li className="relative pl-12">
      {/* Time + source dot on the spine */}
      <div className="absolute left-0 top-0.5 flex items-center gap-1.5 w-[44px]">
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-white relative z-10',
            SOURCE_DOT[real.source],
          )}
        />
      </div>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="text-[11px] font-medium tabular-nums text-slate-500 w-14 flex-shrink-0">
          {real.displayTime}
        </span>
        <span className="text-base leading-none">{real.icon}</span>
        <span className="text-sm font-semibold text-slate-800">{real.title}</span>
        <span className="text-sm text-slate-600">·</span>
        <span className="text-sm text-slate-700">{real.dose}</span>
      </div>
      {real.details && real.details.length > 0 && (
        <ul className="ml-[72px] space-y-0.5 mb-1">
          {real.details.map((d, i) => (
            <li key={i} className="text-[12px] text-slate-600 leading-snug">
              · {d}
            </li>
          ))}
        </ul>
      )}
      {real.rationale && (
        <p className="ml-[72px] text-[11px] text-slate-500 italic leading-snug mb-1">
          {real.rationale}
        </p>
      )}
      {hasContext && (
        <div className="ml-[72px] mb-1">
          <ProtocolContextChip context={real.context} variant={chipVariant} />
        </div>
      )}
      <div className="ml-[72px] flex items-center gap-1.5 flex-wrap">
        {real.tags.map((t) => (
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
        {hasSuggestions && (
          <button
            onClick={() => setSuggestOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-expanded={suggestOpen}
          >
            <Lightbulb className="w-3 h-3" />
            {suggestOpen ? 'Hide options' : 'Suggest options'}
            {suggestOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
        {hasContext && (
          <ProtocolAuditTrail
            real={real}
            neutral={neutral}
            userConfounders={userConfounders}
            placement={auditPlacement}
            open={auditOpen}
            onToggle={() => setAuditOpen((v) => !v)}
            onClose={() => setAuditOpen(false)}
          />
        )}
        <span className="text-[10px] text-slate-400 ml-auto">
          {sourceLabel(real.source)}
        </span>
      </div>
      {hasSuggestions && suggestOpen && (
        <div className="ml-[72px] mt-1.5 p-2 bg-slate-50 border border-dashed border-slate-300 rounded">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Non-engine suggestions
          </p>
          <ul className="space-y-0.5">
            {real.suggestions!.map((s, i) => (
              <li key={i} className="text-[12px] text-slate-600 leading-snug">
                · {s}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-slate-400 leading-snug">
            These ideas are outside the engine’s scope — pick what suits you.
          </p>
        </div>
      )}
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

const REGIME_SHORT_LABEL: Record<RegimeKey, string> = {
  overreaching_state: 'overreaching',
  iron_deficiency_state: 'iron-def',
  sleep_deprivation_state: 'sleep-dep',
  inflammation_state: 'inflamed',
}

function CounterfactualBanner({
  overrides,
  realBaselines,
  onReset,
}: {
  overrides: RegimeOverrides
  realBaselines: Partial<Record<RegimeKey, number>>
  onReset?: () => void
}) {
  const entries = (Object.entries(overrides) as Array<[RegimeKey, number]>).filter(
    ([key, value]) => {
      const baseline = realBaselines[key] ?? 0
      return Math.abs(value - baseline) > 0.005
    },
  )
  if (entries.length === 0) return null
  return (
    <div className="flex items-start gap-2 p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900">
      <Wand2 className="w-3.5 h-3.5 flex-shrink-0 text-indigo-600 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold mb-0.5">
          Counterfactual — today re-picked under these overrides:
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
          {entries.map(([key, value]) => {
            const baseline = realBaselines[key] ?? 0
            return (
              <span key={key}>
                <span className="font-medium">{REGIME_SHORT_LABEL[key]}</span>{' '}
                <span className="text-indigo-600">
                  {Math.round(baseline * 100)}% → {Math.round(value * 100)}%
                </span>
              </span>
            )
          })}
        </div>
      </div>
      {onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-100"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
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
