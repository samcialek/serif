/**
 * InsightActionDetail — expanded panel that opens beneath an
 * InsightActionRow when the user clicks. Carries the depth that the
 * compact row deliberately hides:
 *
 *   1. DoseResponseChart — the engine's actual response curve with
 *      the user's current point marked. Replaces the abstract
 *      slope-bar with the real shape (linear / saturating / smooth-
 *      saturating / inverted-U).
 *   2. Bayesian breakdown — three numbers (cohort prior · personal
 *      data · blended posterior) so the user can see where the
 *      headline came from.
 *   3. Conditional-on chips — the BART backdoor confounders this
 *      estimate is conditional on (season, weekend, heat index).
 *   4. Suggested move — the engine's recommended dose change with
 *      its confidence interval, in native units.
 *
 * Reads dataMode so cohort vs personal mode flips the breakdown's
 * highlight as well as which slope feeds the chart.
 */

import { Info } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import { DoseResponseChart } from './DoseResponseChart'
import { useDataMode } from '@/hooks/useDataMode'
import { effectMean } from '@/utils/twinSem'

interface Props {
  edge: InsightBayesian
  participant: ParticipantPortal
}

const ACTION_NATIVE_UNIT: Record<string, string> = {
  bedtime: 'h',
  sleep_duration: 'h',
  running_volume: 'km',
  steps: 'steps',
  training_load: 'TRIMP',
  active_energy: 'kcal',
  zone2_volume: 'km',
  training_volume: 'h',
  dietary_protein: 'g',
  dietary_energy: 'kcal',
  caffeine_mg: 'mg',
}

const OUTCOME_NATIVE_UNIT: Record<string, string> = {
  hrv_daily: 'ms',
  resting_hr: 'bpm',
  sleep_quality: 'pts',
  sleep_efficiency: '%',
  deep_sleep: 'min',
  ferritin: 'ng/mL',
  iron_total: 'µg/dL',
  hemoglobin: 'g/dL',
  zinc: 'µg/dL',
  cortisol: 'µg/dL',
  glucose: 'mg/dL',
  apob: 'mg/dL',
  testosterone: 'ng/dL',
  hscrp: 'mg/L',
}

export function InsightActionDetail({ edge, participant }: Props) {
  const dataMode = useDataMode()

  const cohortMean = edge.posterior.prior_mean
  const personalSlope = edge.user_obs?.at_nominal_step
  const blendedMean = edge.posterior.mean
  const userN = edge.user_obs?.n ?? 0
  const cohortN = edge.posterior.n_cohort ?? 0
  const contraction = edge.posterior.contraction ?? 0

  const actionUnit = ACTION_NATIVE_UNIT[edge.action] ?? ''
  const outcomeUnit = OUTCOME_NATIVE_UNIT[edge.outcome] ?? ''
  const stepLabel = `+1 ${actionUnit || 'step'} ${edge.action.replace(/_/g, ' ')}`

  // Display row for the breakdown — highlight the active mode.
  const cohortActive = dataMode === 'cohort'
  const personalActive = dataMode === 'personal'

  // Suggested move uses the engine's dose_multiplier × nominal_step.
  const suggestedDose = edge.nominal_step * (edge.dose_multiplier ?? 0)
  const suggestedEffect = effectMean(edge, dataMode) * (edge.dose_multiplier ?? 0)
  const postSd = edge.posterior.sd ?? 0
  const ciHalf = postSd * 1.96 * Math.abs(edge.dose_multiplier ?? 0)
  const ciLow = suggestedEffect - ciHalf
  const ciHigh = suggestedEffect + ciHalf

  const confounders = edge.user_obs?.confounders_adjusted ?? []

  return (
    <div className="mx-3 mb-3 px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
      {/* Curve */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
          Response curve
        </div>
        <DoseResponseChart edge={edge} participant={participant} width={420} height={120} />
      </div>

      {/* Bayesian breakdown */}
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
          Where this number came from
        </div>
        <div className="space-y-1 text-[12px]">
          <BreakdownLine
            label="Cohort prior"
            value={cohortMean}
            unit={outcomeUnit}
            stepLabel={stepLabel}
            n={cohortN}
            active={cohortActive}
            tone="slate"
          />
          <BreakdownLine
            label="Your data"
            value={personalSlope ?? null}
            unit={outcomeUnit}
            stepLabel={stepLabel}
            n={userN}
            active={false}
            tone="emerald"
            note={personalSlope == null ? 'no personal slope yet' : undefined}
          />
          <BreakdownLine
            label="Blended posterior"
            value={blendedMean}
            unit={outcomeUnit}
            stepLabel={stepLabel}
            n={null}
            active={personalActive}
            tone="indigo"
            note={`${Math.round(contraction * 100)}% contracted`}
          />
        </div>
      </div>

      {/* Conditional-on chips */}
      {confounders.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
            <Info className="w-3 h-3" /> Adjusted for
          </div>
          <div className="flex flex-wrap gap-1">
            {confounders.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 text-[10px] rounded border border-indigo-200 bg-white text-indigo-800 font-mono"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Suggested move */}
      {Math.abs(suggestedDose) > 1e-6 && (
        <div className="rounded-md bg-white border border-slate-200 px-3 py-2 text-[12px]">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mr-2">
            Suggested move
          </span>
          <span className="tabular-nums text-slate-800">
            {suggestedDose >= 0 ? '+' : ''}
            {formatN(suggestedDose)}
            {actionUnit && ` ${actionUnit}`} →{' '}
            <span className="font-semibold">
              {suggestedEffect >= 0 ? '+' : ''}
              {formatN(suggestedEffect)}
              {outcomeUnit && ` ${outcomeUnit}`}
            </span>
          </span>
          <span className="ml-2 text-[10px] text-slate-400 tabular-nums">
            95% CI: {formatN(ciLow)} to {formatN(ciHigh)} {outcomeUnit}
          </span>
        </div>
      )}

      <p className="text-[10px] text-slate-400 italic leading-snug">
        The curve above is the engine's estimated response shape. The
        compact slope-bar in the row collapses this into a single tilt
        at your current operating point — useful for comparison, but the
        full shape is what Twin reasons over.
      </p>
    </div>
  )
}

interface BreakdownLineProps {
  label: string
  value: number | null
  unit: string
  stepLabel: string
  n: number | null
  active: boolean
  tone: 'slate' | 'emerald' | 'indigo'
  note?: string
}

function BreakdownLine({
  label,
  value,
  unit,
  stepLabel,
  n,
  active,
  tone,
  note,
}: BreakdownLineProps) {
  const toneStyles: Record<typeof tone, { dot: string; text: string }> = {
    slate: { dot: 'bg-slate-400', text: 'text-slate-700' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
    indigo: { dot: 'bg-indigo-500', text: 'text-indigo-700' },
  }
  const styles = toneStyles[tone]
  return (
    <div
      className={cn(
        'flex items-baseline gap-2 px-2 py-1 rounded',
        active && 'bg-white ring-1 ring-indigo-200',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', styles.dot)} aria-hidden />
      <span className="w-32 text-[11px] font-medium text-slate-700 flex-shrink-0">{label}</span>
      <span className={cn('font-semibold tabular-nums', styles.text)}>
        {value != null
          ? `${value >= 0 ? '+' : ''}${formatN(value)}${unit ? ' ' + unit : ''}`
          : '—'}
      </span>
      <span className="text-[10px] text-slate-400 truncate">per {stepLabel}</span>
      {n != null && n > 0 && (
        <span className="ml-auto text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
          n={n}
        </span>
      )}
      {note && (
        <span className="ml-auto text-[10px] text-slate-500 italic">{note}</span>
      )}
    </div>
  )
}

function formatN(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(0)
  if (abs >= 10) return v.toFixed(1)
  if (abs >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

export default InsightActionDetail
