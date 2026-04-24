/**
 * InsightActionRow — one (action → outcome) edge, linearized at the
 * user's baseline operating point.
 *
 * Layout (left → right):
 *   icon · action label · slope-bar · Cohen's d chip · native-units
 *   · contraction thermometer · evidence-tier story chip · expander
 *
 * Compact by default; click the row to drill into the full edge
 * detail (curve shape, Bayesian breakdown, conditional-on chips).
 *
 * Reads from useDataMode so cohort mode swaps posterior.mean for
 * posterior.prior_mean via effectMean — the standardized effect
 * recomputes accordingly so the slope-bar tilts per-mode.
 */

import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import {
  cohensD,
  effectBand,
  isBeneficial,
  predictedNativeEffectAtStep,
  type EffectBand,
} from '@/utils/insightStandardization'
import { effectMean } from '@/utils/twinSem'
import { useDataMode } from '@/hooks/useDataMode'
import { SlopeBar } from './SlopeBar'

const ACTION_LABEL: Record<string, string> = {
  bedtime: 'Bedtime',
  sleep_duration: 'Sleep duration',
  running_volume: 'Running volume',
  steps: 'Daily steps',
  training_load: 'Training load',
  active_energy: 'Active energy',
  zone2_volume: 'Zone-2 volume',
  training_volume: 'Training volume',
  dietary_protein: 'Dietary protein',
  dietary_energy: 'Dietary energy',
  acwr: 'ACWR',
  sleep_debt: 'Sleep debt',
  travel_load: 'Travel load',
}

const ACTION_NATIVE_UNIT_PER_STEP: Record<string, string> = {
  bedtime: 'h',
  sleep_duration: 'h',
  running_volume: 'km',
  steps: '1k steps',
  training_load: 'TRIMP',
  active_energy: 'kcal',
  zone2_volume: 'km',
  training_volume: 'h',
  dietary_protein: 'g',
  dietary_energy: 'kcal',
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

const BAND_TONE: Record<EffectBand, string> = {
  trivial: 'text-slate-400',
  small: 'text-slate-700',
  medium: 'text-slate-900 font-semibold',
  large: 'text-indigo-700 font-bold',
}

interface Props {
  edge: InsightBayesian
  participant: ParticipantPortal
  expanded?: boolean
  onToggle?: () => void
}

export function InsightActionRow({
  edge,
  participant,
  expanded = false,
  onToggle,
}: Props) {
  const dataMode = useDataMode()

  // Recompute the edge's headline magnitude under the active data mode.
  // We mutate a shallow copy of posterior.mean so cohensD + the native
  // slope below pick up the swap without further plumbing.
  const effectiveMean = effectMean(edge, dataMode)
  const effectiveEdge: InsightBayesian = {
    ...edge,
    posterior: { ...edge.posterior, mean: effectiveMean },
  }
  const d = cohensD(effectiveEdge, participant)
  const band = effectBand(d)
  const beneficial = isBeneficial(effectiveEdge)
  const contraction = edge.posterior.contraction ?? 0
  const dStr = `${d >= 0 ? '+' : ''}${d.toFixed(2)}σ`
  const native = predictedNativeEffectAtStep(effectiveEdge)
  const actionUnit = ACTION_NATIVE_UNIT_PER_STEP[edge.action] ?? ''
  const outcomeUnit = OUTCOME_NATIVE_UNIT[edge.outcome] ?? ''
  const stepLabel = actionUnit ? `+1 ${actionUnit}` : '+1 step'
  const nativeStr = `${native >= 0 ? '+' : ''}${formatNative(native)}${outcomeUnit ? ' ' + outcomeUnit : ''} per ${stepLabel}`

  const evidenceLabel = (() => {
    if (dataMode === 'cohort') return 'cohort'
    switch (edge.evidence_tier) {
      case 'personal_established': return 'personal'
      case 'personal_emerging': return 'emerging'
      case 'cohort_level': return 'cohort'
      default: return ''
    }
  })()

  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors',
        'hover:bg-slate-50',
        expanded && 'bg-indigo-50/50 ring-1 ring-indigo-200',
      )}
      aria-expanded={expanded}
      title={`${ACTION_LABEL[edge.action] ?? edge.action} → ${edge.outcome}: d=${dStr}, ${band}`}
    >
      <div className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">
        {ACTION_LABEL[edge.action] ?? edge.action}
      </div>

      <SlopeBar
        d={d}
        beneficial={beneficial}
        contraction={contraction}
        band={band}
      />

      <div className={cn('w-14 text-right text-xs tabular-nums', BAND_TONE[band])}>
        {dStr}
      </div>

      <div className="w-36 text-right text-[11px] text-slate-500 tabular-nums truncate hidden md:block">
        {nativeStr}
      </div>

      <ContractionPip contraction={contraction} />

      {evidenceLabel && (
        <span
          className={cn(
            'text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border',
            evidenceLabel === 'personal'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : evidenceLabel === 'emerging'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-slate-50 text-slate-500',
          )}
        >
          {evidenceLabel}
        </span>
      )}

      <ChevronDown
        className={cn(
          'w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0',
          expanded && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  )
}

function ContractionPip({ contraction }: { contraction: number }) {
  // Discretize contraction to a 5-segment vertical thermometer.
  const filled = Math.max(0, Math.min(5, Math.round(contraction * 5)))
  return (
    <span
      className="inline-flex flex-col items-end gap-[1px] flex-shrink-0"
      title={`Posterior contraction ${(contraction * 100).toFixed(0)}%`}
      aria-label={`Confidence ${filled}/5`}
    >
      {[5, 4, 3, 2, 1].map((seg) => (
        <span
          key={seg}
          className={cn(
            'block w-3 h-[3px] rounded-sm',
            seg <= filled ? 'bg-indigo-500' : 'bg-slate-200',
          )}
        />
      ))}
    </span>
  )
}

function formatNative(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(0)
  if (abs >= 10) return v.toFixed(1)
  if (abs >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

export default InsightActionRow
