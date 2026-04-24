/**
 * ExperimentPrescription — compact "how to run it" card.
 *
 * Layout:
 *   - Row 1: range visualization — horizontal bar with the user's
 *     current value as a tick, the prescribed delta band shaded.
 *   - Row 2: chips — cadence · duration · washout · feasibility.
 *
 * Visual language mirrors ProtocolMagnitude (the Protocols tab's
 * day-axis bar) so the user's eye moves between Protocols and
 * Exploration without re-learning. Renders differently by kind:
 * vary_action shows a delta band; repeat_measurement shows a single
 * anchor + arrow to "next draw" with the interval labelled.
 */

import { Calendar, Clock, Droplets, RotateCw, Zap } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type {
  ExperimentSpec,
  ParticipantPortal,
} from '@/data/portal/types'
import type { ExplorationEdge } from '@/utils/exploration'
import {
  cadenceLabel,
  durationLabel,
  feasibilityLabel,
  feasibilityStyle,
} from '@/utils/experimentPrescription'

interface Props {
  edge: ExplorationEdge
  spec: ExperimentSpec
  participant: ParticipantPortal
}

function formatNum(n: number, precision = 2): string {
  const absN = Math.abs(n)
  if (absN === 0) return '0'
  if (absN < 1) return n.toFixed(2)
  if (absN < 10) return n.toFixed(1)
  return Math.round(n).toString()
}

const ACTION_UNITS: Record<string, string> = {
  bedtime: 'h',
  sleep_duration: 'h',
  caffeine_timing: 'h earlier',
  caffeine_mg: ' mg',
  alcohol_units: ' drinks',
  alcohol_timing: 'h earlier',
  zone2_volume: ' min',
  zone2_minutes: ' min',
  zone4_5_minutes: ' min',
  running_volume: ' km',
  training_load: ' TRIMP',
  training_volume: ' h',
  steps: ' steps',
  active_energy: ' kcal',
  dietary_protein: ' g',
  dietary_energy: ' kcal',
  acwr: '',
  sleep_debt: ' h',
}

function actionUnit(action: string): string {
  return ACTION_UNITS[action] ?? ''
}

// ─── Range visualisation ────────────────────────────────────────

function RangeBar({
  edge,
  spec,
  participant,
}: {
  edge: ExplorationEdge
  spec: ExperimentSpec
  participant: ParticipantPortal
}) {
  const current = participant.current_values?.[edge.action]
  const unit = actionUnit(edge.action)
  const [lo, hi] = spec.action_range_delta

  // Range visualization: ±3 SDs around current as the axis. Shaded
  // region = current + [lo, hi]. Current is a tick.
  const sd = Math.max(
    participant.behavioral_sds?.[edge.action] ?? Math.max(Math.abs(hi - lo) / 2, 1),
    0.05,
  )
  const center = current ?? 0
  const axisLo = center - Math.max(Math.abs(lo), sd * 2)
  const axisHi = center + Math.max(Math.abs(hi), sd * 2)
  const axisSpan = axisHi - axisLo
  const pctLo = ((center + lo - axisLo) / axisSpan) * 100
  const pctHi = ((center + hi - axisLo) / axisSpan) * 100
  const pctCenter = ((center - axisLo) / axisSpan) * 100

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <span className="tabular-nums">{formatNum(axisLo)}{unit}</span>
        <div className="flex-1 relative h-5 bg-slate-100 rounded">
          {/* Shaded delta band */}
          <div
            className="absolute top-0 bottom-0 bg-indigo-200/70 rounded"
            style={{
              left: `${pctLo}%`,
              width: `${Math.max(0.5, pctHi - pctLo)}%`,
            }}
          />
          {/* Current tick */}
          {current != null && (
            <div
              className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-slate-800"
              style={{ left: `calc(${pctCenter}% - 1px)` }}
              title={`Current ${edge.action.replace(/_/g, ' ')}: ${formatNum(current)}${unit}`}
            />
          )}
        </div>
        <span className="tabular-nums">{formatNum(axisHi)}{unit}</span>
      </div>
      {current != null && (
        <div className="text-[10px] text-slate-500 mt-1">
          Current <span className="tabular-nums font-medium">{formatNum(current)}{unit}</span>
          {' · '}prescribed range{' '}
          <span className="tabular-nums font-medium text-indigo-700">
            {lo >= 0 ? '+' : ''}{formatNum(lo)} to {hi >= 0 ? '+' : ''}{formatNum(hi)}{unit}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Repeat-draw visualisation ──────────────────────────────────

function RepeatDrawBar({ spec }: { spec: ExperimentSpec }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500">
      <Droplets className="w-3.5 h-3.5 text-rose-500" aria-hidden />
      <div className="flex-1 relative h-5 bg-slate-100 rounded flex items-center">
        <div className="absolute left-2 top-0 bottom-0 w-[3px] bg-slate-600 rounded-sm" />
        <div
          className="absolute top-1/2 h-[2px] bg-indigo-400 -translate-y-1/2"
          style={{ left: '8px', right: '10%' }}
        />
        <div className="absolute right-2 top-0 bottom-0 w-[3px] bg-indigo-600 rounded-sm" />
      </div>
      <span className="text-[10px] text-slate-500 tabular-nums">
        + {durationLabel(spec)}
      </span>
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────

export function ExperimentPrescription({ edge, spec, participant }: Props) {
  const isRepeat = edge.kind === 'repeat_measurement'

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          Prescription
        </span>
        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
            feasibilityStyle(spec.feasibility),
          )}
          title={spec.feasibility_note}
        >
          {feasibilityLabel(spec.feasibility)}
        </span>
      </div>

      {isRepeat ? <RepeatDrawBar spec={spec} /> : <RangeBar edge={edge} spec={spec} participant={participant} />}

      {/* Chip row */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
          <Zap className="w-3 h-3" aria-hidden />
          {cadenceLabel(spec)}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
          <Clock className="w-3 h-3" aria-hidden />
          {durationLabel(spec)}
        </span>
        {spec.washout_days != null && spec.washout_days > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
            <RotateCw className="w-3 h-3" aria-hidden />
            {spec.washout_days}d washout
          </span>
        )}
        {spec.n_per_week != null && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">
            <Calendar className="w-3 h-3" aria-hidden />
            {spec.n_per_week} sessions/week
          </span>
        )}
      </div>

      {spec.feasibility_note && (
        <p className="text-[11px] text-slate-500 italic leading-snug">
          {spec.feasibility_note}
        </p>
      )}
    </div>
  )
}

export default ExperimentPrescription
