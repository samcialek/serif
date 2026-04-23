/**
 * Shared scaffolding for TwinView fork demos.
 *
 * Each fork in this folder explores ONE interaction-design idea on top of
 * the same underlying SCM engine. To keep the forks lean and focused on
 * their headline idea, the boilerplate — lever definitions, range math,
 * observed-values assembly, formatting — lives here.
 *
 * These exports are intentionally identical in shape to what TwinView.tsx
 * uses internally. If main TwinView ever evolves, the forks can either
 * follow along by importing from here or intentionally diverge.
 */

import { cn } from '@/utils/classNames'
import { Info, Loader2, Sparkles } from 'lucide-react'
import type { ParticipantPortal } from '@/data/portal/types'
import { cumulativeEffectFraction } from '@/data/scm/outcomeHorizons'

// ─── Manipulable actions ────────────────────────────────────────────

export interface ManipulableNode {
  id: string
  label: string
  unit: string
  step: number
  defaultValue: number
  fixedRange?: { min: number; max: number }
}

export const MANIPULABLE_NODES: ManipulableNode[] = [
  { id: 'sleep_duration', label: 'Sleep Duration', unit: 'hrs', step: 0.25, defaultValue: 7 },
  { id: 'zone2_minutes', label: 'Zone 2', unit: 'min/day', step: 5, defaultValue: 30, fixedRange: { min: 0, max: 120 } },
  { id: 'zone4_5_minutes', label: 'Zone 4-5', unit: 'min/day', step: 1, defaultValue: 5, fixedRange: { min: 0, max: 30 } },
  { id: 'training_volume', label: 'Training Volume', unit: 'hrs/day', step: 0.25, defaultValue: 1 },
  { id: 'steps', label: 'Daily Steps', unit: 'steps', step: 500, defaultValue: 8000 },
  { id: 'active_energy', label: 'Active Energy', unit: 'kcal/day', step: 50, defaultValue: 600 },
  { id: 'dietary_protein', label: 'Dietary Protein', unit: 'g/day', step: 5, defaultValue: 100 },
  { id: 'dietary_energy', label: 'Dietary Energy', unit: 'kcal/day', step: 100, defaultValue: 2500 },
  { id: 'caffeine_mg', label: 'Caffeine', unit: 'mg/day', step: 25, defaultValue: 200, fixedRange: { min: 0, max: 600 } },
  { id: 'caffeine_timing', label: 'Caffeine Cutoff', unit: 'h pre-bed', step: 0.5, defaultValue: 8, fixedRange: { min: 0, max: 14 } },
  { id: 'alcohol_units', label: 'Alcohol', unit: 'units/day', step: 0.5, defaultValue: 1, fixedRange: { min: 0, max: 6 } },
  { id: 'alcohol_timing', label: 'Alcohol Cutoff', unit: 'h pre-bed', step: 0.5, defaultValue: 3, fixedRange: { min: 0, max: 8 } },
  { id: 'bedtime', label: 'Bedtime', unit: 'hr', step: 0.25, defaultValue: 22.5 },
]

// ─── Goal candidates ────────────────────────────────────────────────

export type GoalDirection = 'higher' | 'lower'

export interface GoalCandidate {
  outcomeId: string
  label: string
  group: 'Wearable & sleep' | 'Cardio-metabolic' | 'Iron panel' | 'Performance'
  direction: GoalDirection
}

export const GOAL_CANDIDATES: GoalCandidate[] = [
  { outcomeId: 'hrv_daily', label: 'Raise overnight RMSSD', group: 'Wearable & sleep', direction: 'higher' },
  { outcomeId: 'sleep_efficiency', label: 'Improve sleep efficiency', group: 'Wearable & sleep', direction: 'higher' },
  { outcomeId: 'deep_sleep', label: 'More deep sleep', group: 'Wearable & sleep', direction: 'higher' },
  { outcomeId: 'rem_sleep', label: 'More REM sleep', group: 'Wearable & sleep', direction: 'higher' },
  { outcomeId: 'sleep_onset_latency', label: 'Fall asleep faster', group: 'Wearable & sleep', direction: 'lower' },
  { outcomeId: 'apob', label: 'Lower ApoB', group: 'Cardio-metabolic', direction: 'lower' },
  { outcomeId: 'ldl', label: 'Lower LDL', group: 'Cardio-metabolic', direction: 'lower' },
  { outcomeId: 'hdl', label: 'Raise HDL', group: 'Cardio-metabolic', direction: 'higher' },
  { outcomeId: 'triglycerides', label: 'Lower triglycerides', group: 'Cardio-metabolic', direction: 'lower' },
  { outcomeId: 'glucose', label: 'Lower fasting glucose', group: 'Cardio-metabolic', direction: 'lower' },
  { outcomeId: 'hscrp', label: 'Lower hsCRP (inflammation)', group: 'Cardio-metabolic', direction: 'lower' },
  { outcomeId: 'ferritin', label: 'Raise ferritin', group: 'Iron panel', direction: 'higher' },
  { outcomeId: 'hemoglobin', label: 'Raise hemoglobin', group: 'Iron panel', direction: 'higher' },
  { outcomeId: 'iron_total', label: 'Raise serum iron', group: 'Iron panel', direction: 'higher' },
  { outcomeId: 'vo2_peak', label: 'Raise VO2 peak', group: 'Performance', direction: 'higher' },
]

// ─── Horizon math ───────────────────────────────────────────────────

export const MIN_DAYS = 1
export const MAX_DAYS = 365

export interface HorizonTick {
  days: number
  label: string
}

export const HORIZON_TICKS: HorizonTick[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '1 wk' },
  { days: 30, label: '1 mo' },
  { days: 90, label: '3 mo' },
  { days: 180, label: '6 mo' },
  { days: 365, label: '1 yr' },
]

export const POSITION_RESOLUTION = 1000

export const TICK_POSITIONS: number[] = HORIZON_TICKS.map(
  (_, i) => (i / (HORIZON_TICKS.length - 1)) * POSITION_RESOLUTION,
)

export function daysToPosition(days: number): number {
  const clamped = Math.min(MAX_DAYS, Math.max(MIN_DAYS, days))
  for (let i = 0; i < HORIZON_TICKS.length - 1; i++) {
    const lo = HORIZON_TICKS[i].days
    const hi = HORIZON_TICKS[i + 1].days
    if (clamped >= lo && clamped <= hi) {
      const frac = hi === lo ? 0 : (clamped - lo) / (hi - lo)
      return TICK_POSITIONS[i] + frac * (TICK_POSITIONS[i + 1] - TICK_POSITIONS[i])
    }
  }
  return clamped <= HORIZON_TICKS[0].days
    ? TICK_POSITIONS[0]
    : TICK_POSITIONS[TICK_POSITIONS.length - 1]
}

export function positionToDays(pos: number): number {
  const clamped = Math.min(POSITION_RESOLUTION, Math.max(0, pos))
  for (let i = 0; i < TICK_POSITIONS.length - 1; i++) {
    const lo = TICK_POSITIONS[i]
    const hi = TICK_POSITIONS[i + 1]
    if (clamped >= lo && clamped <= hi) {
      const frac = hi === lo ? 0 : (clamped - lo) / (hi - lo)
      const days =
        HORIZON_TICKS[i].days +
        frac * (HORIZON_TICKS[i + 1].days - HORIZON_TICKS[i].days)
      return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(days)))
    }
  }
  return HORIZON_TICKS[HORIZON_TICKS.length - 1].days
}

export function formatHorizonLong(days: number): string {
  if (days <= 1) return 'Tomorrow'
  if (days < 14) return `${days} days from now`
  if (days < 60) {
    const w = Math.round(days / 7)
    return `${w} week${w === 1 ? '' : 's'} from now`
  }
  if (days < 320) {
    const m = Math.round(days / 30)
    return `${m} month${m === 1 ? '' : 's'} from now`
  }
  return '1 year from now'
}

export function formatHorizonShort(days: number): string {
  if (days <= 1) return 'tomorrow'
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  if (days < 320) return `${Math.round(days / 30)} months`
  return '1 year'
}

// ─── Formatting helpers ─────────────────────────────────────────────

const BEDTIME_MIN = 20
const BEDTIME_MAX = 28

export function rangeFor(
  node: ManipulableNode,
  currentValue: number,
): { min: number; max: number } {
  if (node.id === 'bedtime') return { min: BEDTIME_MIN, max: BEDTIME_MAX }
  if (node.fixedRange) return node.fixedRange
  const base = Math.max(currentValue, node.step * 4)
  const round = (v: number) => Math.round(v / node.step) * node.step
  return { min: round(Math.max(0, base * 0.5)), max: round(base * 1.5) }
}

export function formatValue(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const rounded = value.toFixed(digits)
  return unit ? `${rounded} ${unit}` : rounded
}

/** Plain-English clock time from decimal hours (e.g. 22.5 → "10:30 PM"). */
export function formatClock(decimalHours: number): string {
  const h = Math.floor(decimalHours) % 24
  const m = Math.round((decimalHours - Math.floor(decimalHours)) * 60)
  const ampm = h < 12 ? 'AM' : 'PM'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function formatNodeValue(
  value: number,
  node: { id: string; unit: string },
): string {
  if (node.id === 'bedtime') return formatClock(value)
  return formatValue(value, node.unit)
}

// ─── Observed-values assembly ───────────────────────────────────────

/** Build the observedValues record engines consume — merges current_values
 *  with loads_today and outcome_baselines under every name the DAG might
 *  look up, then lays state-space overrides on top. Default layer is the
 *  MANIPULABLE_NODES defaults so BART parent extraction never falls back
 *  to piecewise just because the participant JSON omits a key. */
export function buildObservedValues(
  participant: ParticipantPortal,
  stateOverrides: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const node of MANIPULABLE_NODES) out[node.id] = node.defaultValue
  Object.assign(out, participant.current_values)

  const loads = participant.loads_today
  if (loads) {
    for (const [rawKey, load] of Object.entries(loads)) {
      if (load && Number.isFinite(load.value)) out[rawKey] = load.value
    }
    if (loads.sleep_debt_14d) out.sleep_debt = loads.sleep_debt_14d.value
  }

  const baselines = participant.outcome_baselines
  if (baselines) {
    for (const [key, v] of Object.entries(baselines)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    }
  }

  for (const [k, v] of Object.entries(stateOverrides)) {
    if (Number.isFinite(v)) out[k] = v
  }
  if (stateOverrides.sleep_debt != null) {
    out.sleep_debt_14d = stateOverrides.sleep_debt
  }
  return out
}

// ─── Small shared UI primitives ─────────────────────────────────────

export function MethodBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3',
        className,
      )}
    >
      <Info className="w-4 h-4 flex-shrink-0 text-amber-500" />
      <span className="font-medium">Model predictions, not medical advice.</span>
    </div>
  )
}

interface BartStatusBadgeProps {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  coverageCount: number
  kSamples?: number
}

export function BartStatusBadge({ status, coverageCount, kSamples }: BartStatusBadgeProps) {
  if (status === 'idle') return null
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
        <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-slate-400" />
        <span>Loading posterior draws…</span>
      </div>
    )
  }
  if (status === 'unavailable') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        <span>Point estimates only. Posterior bands unavailable for this build.</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-md px-3 py-2">
      <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-indigo-500" />
      <span>
        Posterior bands ready. {coverageCount} BART outcome
        {coverageCount === 1 ? '' : 's'}
        {kSamples ? `, K=${kSamples} draws` : ''}.
      </span>
    </div>
  )
}

// ─── Decay curve (shared rendering primitive) ───────────────────────

interface DecayCurveProps {
  horizonDays: number
  atDays: number
  tone: 'benefit' | 'harm' | 'neutral'
  widthPx?: number
  heightPx?: number
  onScrub?: (days: number) => void
  showPlayhead?: boolean
}

/** Cumulative-accrual sparkline. When `onScrub` is provided, the curve
 *  becomes a click+drag target that reports the day the pointer is over —
 *  used by the Direct fork to replace the horizon slider with a per-row
 *  timeline. */
export function DecayCurve({
  horizonDays,
  atDays,
  tone,
  widthPx = 96,
  heightPx = 28,
  onScrub,
  showPlayhead = true,
}: DecayCurveProps) {
  const xMax = Math.max(horizonDays * 3, atDays * 1.1)
  const nSamples = 48

  const samples = Array.from({ length: nSamples + 1 }, (_, i) => {
    const t = (i / nSamples) * xMax
    return { t, y: cumulativeEffectFraction(t, horizonDays) }
  })
  const yMax = Math.max(1, ...samples.map((s) => s.y))
  const toX = (t: number) => (t / xMax) * widthPx
  const toY = (y: number) => heightPx - (y / yMax) * (heightPx - 2) - 1

  const pathD = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${toX(s.t).toFixed(1)},${toY(s.y).toFixed(1)}`)
    .join(' ')

  const stroke =
    tone === 'benefit' ? '#059669' : tone === 'harm' ? '#e11d48' : '#64748b'
  const fill =
    tone === 'benefit' ? '#6ee7b7' : tone === 'harm' ? '#fda4af' : '#cbd5e1'

  const nowX = toX(Math.min(atDays, xMax))
  const nowY = toY(cumulativeEffectFraction(Math.min(atDays, xMax), horizonDays))

  const handlePointer = onScrub
    ? (e: React.PointerEvent<SVGSVGElement>) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        const day = Math.round(frac * xMax)
        onScrub(Math.max(1, day))
      }
    : undefined

  return (
    <svg
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      onPointerDown={handlePointer}
      onPointerMove={(e) => {
        if (handlePointer && (e.buttons & 1)) handlePointer(e)
      }}
      style={{ cursor: onScrub ? 'col-resize' : undefined }}
    >
      <line
        x1={0}
        y1={heightPx - 1}
        x2={widthPx}
        y2={heightPx - 1}
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      <path
        d={`${pathD} L${widthPx},${heightPx - 1} L0,${heightPx - 1} Z`}
        fill={fill}
        opacity={0.35}
      />
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1.5} />
      <line
        x1={toX(horizonDays)}
        y1={2}
        x2={toX(horizonDays)}
        y2={heightPx - 1}
        stroke="#94a3b8"
        strokeWidth={0.75}
        strokeDasharray="2 2"
      />
      {showPlayhead && <circle cx={nowX} cy={nowY} r={2.5} fill={stroke} />}
    </svg>
  )
}

// ─── Posterior band (shared rendering primitive) ───────────────────

interface PosteriorBandProps {
  deltaP05: number
  deltaP50: number
  deltaP95: number
  tone: 'benefit' | 'harm' | 'neutral'
  shimmer?: boolean
}

export function PosteriorBand({
  deltaP05,
  deltaP50,
  deltaP95,
  tone,
  shimmer = false,
}: PosteriorBandProps) {
  const lo = Math.min(deltaP05, 0)
  const hi = Math.max(deltaP95, 0)
  const span = hi - lo
  if (!Number.isFinite(span) || span <= 0) return null
  const pct = (v: number) => ((v - lo) / span) * 100
  const bar =
    tone === 'benefit'
      ? 'bg-emerald-200'
      : tone === 'harm'
        ? 'bg-rose-200'
        : 'bg-slate-200'
  const tick =
    tone === 'benefit'
      ? 'bg-emerald-600'
      : tone === 'harm'
        ? 'bg-rose-600'
        : 'bg-slate-600'
  return (
    <div className="relative h-1 w-24 bg-slate-100 rounded-full mt-1 ml-auto">
      <div
        className={cn('absolute h-full rounded-full', bar, shimmer && 'animate-pulse')}
        style={{ left: `${pct(deltaP05)}%`, width: `${pct(deltaP95) - pct(deltaP05)}%` }}
      />
      <div
        className={cn('absolute w-0.5 h-full', tick)}
        style={{ left: `${pct(deltaP50)}%` }}
      />
      <div
        className="absolute w-px h-[240%] -top-[70%] bg-slate-300"
        style={{ left: `${pct(0)}%` }}
      />
    </div>
  )
}

// ─── Tone utility ───────────────────────────────────────────────────

export function toneForEffect(
  totalEffect: number,
  beneficial: 'higher' | 'lower' | 'neutral' | undefined,
): 'benefit' | 'harm' | 'neutral' {
  if (beneficial === 'neutral' || beneficial == null) return 'neutral'
  const isBenefit =
    beneficial === 'higher' ? totalEffect > 0 : totalEffect < 0
  return isBenefit ? 'benefit' : 'harm'
}
