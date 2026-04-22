/**
 * Twin SCM — per-member counterfactual workspace.
 *
 * The user pulls levers (continuous sliders + "today only" toggles) and
 * runs the counterfactual engine. Asymptotic magnitudes come from the
 * SCM; a log-scale time horizon reshapes them as decay curves so the
 * early dynamics (tomorrow → a month) get proportional real estate.
 *
 * Two modes:
 *   - cumulative ("every day, starting now"): A * (1 - e^(-t/tau))
 *   - one-off   ("today only, then stop"):    A * (t/tau) * e^(1 - t/tau)
 *
 * Posterior bands come from the BART Twin fit when available. Rows
 * without a BART ancestor degrade to point estimates with the same
 * decay shape. A goal overlay (set via the header pill) reframes the
 * results around a headline outcome and flags off-goal movements as
 * costs.
 *
 * Framing: Twin shows eternal, load-agnostic insights starting from the
 * member's baseline state-space. Today's loads, regime activations, and
 * confounders live on Protocols.
 */

import { useMemo, useState, useCallback, useLayoutEffect, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronDown,
  Clock,
  GitBranch,
  Info,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
  X,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { useBartTwin } from '@/hooks/useBartTwin'
import type {
  FullCounterfactualState,
  NodeEffect,
} from '@/data/scm/fullCounterfactual'
import type { MCFullCounterfactualState, MCNodeEffect } from '@/data/scm/bartMonteCarlo'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import {
  cumulativeEffectFraction,
  oneOffEffectFraction,
  horizonDaysFor,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue, formatClockTime } from '@/utils/rounding'

// ─── Horizons ───────────────────────────────────────────────────────
//
// The horizon control is a faux-continuous slider: position is on a log
// scale from day 1 to day 365, so the early "Tomorrow → 1 month" range
// (where most curve dynamics live) gets ~half the track instead of the
// 8% it would get with linear days. Tick labels mark conventional
// horizons but the user can land on any whole day.

const MIN_DAYS = 1
const MAX_DAYS = 365

interface HorizonTick {
  days: number
  label: string
}

const HORIZON_TICKS: HorizonTick[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '1 wk' },
  { days: 30, label: '1 mo' },
  { days: 90, label: '3 mo' },
  { days: 180, label: '6 mo' },
  { days: 365, label: '1 yr' },
]

const POSITION_RESOLUTION = 1000

function daysToPosition(days: number): number {
  const clamped = Math.min(MAX_DAYS, Math.max(MIN_DAYS, days))
  return (Math.log(clamped) / Math.log(MAX_DAYS)) * POSITION_RESOLUTION
}

function positionToDays(pos: number): number {
  const clamped = Math.min(POSITION_RESOLUTION, Math.max(0, pos))
  const raw = Math.exp((clamped / POSITION_RESOLUTION) * Math.log(MAX_DAYS))
  return Math.max(MIN_DAYS, Math.min(MAX_DAYS, Math.round(raw)))
}

function formatHorizonLong(days: number): string {
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

function formatHorizonShort(days: number): string {
  if (days <= 1) return 'tomorrow'
  if (days < 14) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  if (days < 320) return `${Math.round(days / 30)} months`
  return '1 year'
}

type DosingMode = 'cumulative' | 'oneoff'

// ─── Goal candidates ────────────────────────────────────────────────
//
// Goals are framed as outcome-direction pairs that map onto an entry in
// OUTCOME_META. The Twin keeps its agency-first model: the user pulls
// the levers, the goal just reframes which outcome is the headline and
// which other movements count as "costs". v1 is direction-only — the
// horizon slider stands in for "by when".

type GoalDirection = 'higher' | 'lower'

interface GoalCandidate {
  outcomeId: string
  label: string
  group: 'Wearable & sleep' | 'Cardio-metabolic' | 'Iron panel' | 'Performance'
  direction: GoalDirection
}

const GOAL_CANDIDATES: GoalCandidate[] = [
  { outcomeId: 'hrv_daily', label: 'Raise HRV', group: 'Wearable & sleep', direction: 'higher' },
  { outcomeId: 'resting_hr', label: 'Lower resting heart rate', group: 'Wearable & sleep', direction: 'lower' },
  { outcomeId: 'sleep_quality', label: 'Improve sleep quality', group: 'Wearable & sleep', direction: 'higher' },
  { outcomeId: 'deep_sleep', label: 'More deep sleep', group: 'Wearable & sleep', direction: 'higher' },
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

// ─── Manipulable nodes ──────────────────────────────────────────────
//
// Actions only. Load ratios (acwr, sleep_debt, training_load, travel_load)
// belong on Protocols as today's context, not as Twin levers.

interface ManipulableNode {
  id: string
  label: string
  unit: string
  step: number
  defaultValue: number
  fixedRange?: { min: number; max: number }
}

const MANIPULABLE_NODES: ManipulableNode[] = [
  { id: 'sleep_duration', label: 'Sleep Duration', unit: 'hrs', step: 0.25, defaultValue: 7 },
  { id: 'running_volume', label: 'Running Volume', unit: 'km/day', step: 0.5, defaultValue: 6 },
  { id: 'zone2_volume', label: 'Zone 2 Volume', unit: 'km/day', step: 0.5, defaultValue: 3 },
  { id: 'training_volume', label: 'Training Volume', unit: 'hrs/day', step: 0.25, defaultValue: 1 },
  { id: 'steps', label: 'Daily Steps', unit: 'steps', step: 500, defaultValue: 8000 },
  { id: 'active_energy', label: 'Active Energy', unit: 'kcal/day', step: 50, defaultValue: 600 },
  { id: 'dietary_protein', label: 'Dietary Protein', unit: 'g/day', step: 5, defaultValue: 100 },
  { id: 'dietary_energy', label: 'Dietary Energy', unit: 'kcal/day', step: 100, defaultValue: 2500 },
  { id: 'bedtime', label: 'Bedtime', unit: 'hr', step: 0.25, defaultValue: 22.5 },
]

// ─── Binary "today only" interventions ──────────────────────────────
//
// Some interventions are naturally yes/no commitments ("did you travel?",
// "did you have alcohol?"). These map onto existing SCM continuous nodes
// via a preset value (set) or an offset on the slider (delta). When ON,
// the effective value overrides what the slider shows.

interface BinaryIntervention {
  id: string
  label: string
  description: string
  targetNodeId: string
  mode: 'set' | 'delta'
  onValue: number
  hint: string
}

const BINARY_INTERVENTIONS: BinaryIntervention[] = [
  {
    id: 'travel_today',
    label: 'Travel today',
    description: 'A long flight or major time-zone shift today.',
    targetNodeId: 'travel_load',
    mode: 'set',
    onValue: 0.7,
    hint: 'jet-lag → 0.7',
  },
  {
    id: 'late_caffeine',
    label: 'Caffeine after 2pm',
    description: 'A coffee or tea late enough to push bedtime back.',
    targetNodeId: 'bedtime',
    mode: 'delta',
    onValue: 0.75,
    hint: 'bedtime +0:45',
  },
  {
    id: 'alcohol_tonight',
    label: 'Alcohol tonight',
    description: 'A glass or two with dinner; fragments deep sleep.',
    targetNodeId: 'sleep_duration',
    mode: 'delta',
    onValue: -0.5,
    hint: 'sleep −0.5h',
  },
]

const BEDTIME_MIN = 20
const BEDTIME_MAX = 28

function rangeFor(node: ManipulableNode, currentValue: number) {
  if (node.id === 'bedtime') return { min: BEDTIME_MIN, max: BEDTIME_MAX }
  if (node.fixedRange) return node.fixedRange
  const base = Math.max(currentValue, node.step * 4)
  const round = (v: number) => Math.round(v / node.step) * node.step
  return { min: round(Math.max(0, base * 0.5)), max: round(base * 1.5) }
}

function formatValue(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const rounded = value.toFixed(digits)
  return unit ? `${rounded} ${unit}` : rounded
}

function formatNodeValue(value: number, node: { id: string; unit: string }): string {
  if (node.id === 'bedtime') return formatClockTime(value)
  return formatValue(value, node.unit)
}

function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

// ─── Goal helpers ───────────────────────────────────────────────────

function findEffectForGoal(
  effects: NodeEffect[],
  goalOutcomeId: string,
): NodeEffect | null {
  let best: NodeEffect | null = null
  for (const e of effects) {
    if (canonicalOutcomeKey(e.nodeId) !== goalOutcomeId) continue
    if (!best || Math.abs(e.totalEffect) > Math.abs(best.totalEffect)) {
      best = e
    }
  }
  return best
}

function splitEffectsForGoal(
  effects: NodeEffect[],
  goalOutcomeId: string,
): { goalEffect: NodeEffect | null; costs: NodeEffect[]; others: NodeEffect[] } {
  const goalEffect = findEffectForGoal(effects, goalOutcomeId)
  const collapsed = new Map<string, NodeEffect>()
  for (const e of effects) {
    const key = canonicalOutcomeKey(e.nodeId)
    if (key === goalOutcomeId) continue
    const prev = collapsed.get(key)
    if (!prev || Math.abs(e.totalEffect) > Math.abs(prev.totalEffect)) {
      collapsed.set(key, e)
    }
  }
  const costs: NodeEffect[] = []
  const others: NodeEffect[] = []
  for (const e of collapsed.values()) {
    const meta = OUTCOME_META[canonicalOutcomeKey(e.nodeId)]
    const beneficial = meta?.beneficial ?? 'higher'
    if (beneficial === 'neutral') {
      others.push(e)
      continue
    }
    const isHarm =
      beneficial === 'higher' ? e.totalEffect < 0 : e.totalEffect > 0
    if (isHarm) costs.push(e)
    else others.push(e)
  }
  costs.sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect))
  others.sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect))
  return { goalEffect, costs, others }
}

function goalProgressLabel(
  goal: GoalCandidate,
  effect: NodeEffect | null,
  atDays: number,
  mode: DosingMode,
): { headline: string; tone: 'good' | 'flat' | 'bad'; sub: string } {
  if (!effect) {
    return {
      headline: 'No movement',
      tone: 'flat',
      sub: 'Your current changes don\'t reach this outcome.',
    }
  }
  const horizonDays = horizonDaysFor(canonicalOutcomeKey(effect.nodeId)) ?? 30
  const fn = mode === 'cumulative' ? cumulativeEffectFraction : oneOffEffectFraction
  const fraction = fn(atDays, horizonDays)
  const fractionAsymptote = fn(horizonDays * 10, horizonDays)
  const timed = effect.totalEffect * fraction
  const isGood =
    goal.direction === 'higher' ? effect.totalEffect > 0 : effect.totalEffect < 0
  const pct =
    mode === 'cumulative' && fractionAsymptote > 0
      ? Math.round((fraction / fractionAsymptote) * 100)
      : null
  const timedStr = formatEffectDelta(timed, effect.nodeId)
  const maxStr = formatEffectDelta(effect.totalEffect, effect.nodeId)
  if (Math.abs(effect.totalEffect) < 1e-6) {
    return {
      headline: 'No movement',
      tone: 'flat',
      sub: 'Your current changes don\'t reach this outcome.',
    }
  }
  if (!isGood) {
    return {
      headline: `Wrong direction: ${timedStr} by ${formatHorizonShort(atDays)}`,
      tone: 'bad',
      sub: `Long-run: ${maxStr}. Try a different lever.`,
    }
  }
  const pctText = pct != null ? ` · ${pct}% of long-run` : ''
  return {
    headline: `On track: ${timedStr} by ${formatHorizonShort(atDays)}`,
    tone: 'good',
    sub: `Long-run ceiling: ${maxStr}${pctText}.`,
  }
}

// ─── Decay sparkline ────────────────────────────────────────────────

interface DecayCurveProps {
  horizonDays: number
  atDays: number
  mode: DosingMode
  tone: 'benefit' | 'harm' | 'neutral'
  widthPx?: number
  heightPx?: number
}

function DecayCurve({
  horizonDays,
  atDays,
  mode,
  tone,
  widthPx = 96,
  heightPx = 28,
}: DecayCurveProps) {
  const xMax = Math.max(horizonDays * 3, atDays * 1.1)
  const nSamples = 48

  const fn = mode === 'cumulative' ? cumulativeEffectFraction : oneOffEffectFraction
  const samples = Array.from({ length: nSamples + 1 }, (_, i) => {
    const t = (i / nSamples) * xMax
    return { t, y: fn(t, horizonDays) }
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
  const nowY = toY(fn(Math.min(atDays, xMax), horizonDays))

  return (
    <svg width={widthPx} height={heightPx} viewBox={`0 0 ${widthPx} ${heightPx}`}>
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
      <circle cx={nowX} cy={nowY} r={2.5} fill={stroke} />
    </svg>
  )
}

// ─── Posterior band (from BART MC) ──────────────────────────────────

interface PosteriorBandProps {
  deltaP05: number
  deltaP50: number
  deltaP95: number
  tone: 'benefit' | 'harm' | 'neutral'
}

function PosteriorBand({ deltaP05, deltaP50, deltaP95, tone }: PosteriorBandProps) {
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
        className={cn('absolute h-full rounded-full', bar)}
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

// ─── Sub-components ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <PageLayout title="Causal Twin">
      <Card>
        <div className="p-8 text-center">
          <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Pick a member to open their twin
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            The twin is per-member. Select someone from the header switcher to
            run counterfactuals against their baseline state.
          </p>
        </div>
      </Card>
    </PageLayout>
  )
}

function MethodBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3">
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

function BartStatusBadge({ status, coverageCount, kSamples }: BartStatusBadgeProps) {
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

interface GoalPillProps {
  goal: GoalCandidate | null
  candidates: GoalCandidate[]
  onSelect: (goal: GoalCandidate | null) => void
}

function GoalPill({ goal, candidates, onSelect }: GoalPillProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const grouped = useMemo(() => {
    const out = new Map<string, GoalCandidate[]>()
    for (const c of candidates) {
      const arr = out.get(c.group) ?? []
      arr.push(c)
      out.set(c.group, arr)
    }
    return out
  }, [candidates])

  const ArrowDirection = goal?.direction === 'higher' ? TrendingUp : TrendingDown

  if (candidates.length === 0) {
    return null
  }

  return (
    <div ref={wrapRef} className="relative">
      {goal ? (
        <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full pl-2.5 pr-1 py-1">
          <Target className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[11px] font-medium text-emerald-900">
            Goal: {goal.label}
          </span>
          <ArrowDirection className="w-3 h-3 text-emerald-700" />
          <button
            onClick={() => onSelect(null)}
            className="ml-0.5 p-0.5 rounded-full text-emerald-600 hover:bg-emerald-100"
            title="Clear goal"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
        >
          <Target className="w-3.5 h-3.5 text-slate-500" />
          Set a goal
          <ChevronDown
            className={cn('w-3 h-3 transition-transform', open && 'rotate-180')}
          />
        </button>
      )}

      {open && !goal && (
        <div className="absolute right-0 mt-1.5 z-20 w-72 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
            <div className="text-[11px] font-semibold text-slate-700">
              Pick a goal
            </div>
            <div className="text-[10px] text-slate-500">
              The Twin reframes results around this outcome and flags the cost on others.
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  {group}
                </div>
                {items.map((c) => {
                  const Arrow = c.direction === 'higher' ? TrendingUp : TrendingDown
                  return (
                    <button
                      key={c.outcomeId}
                      onClick={() => {
                        onSelect(c)
                        setOpen(false)
                      }}
                      className="w-full text-left px-3 py-1.5 text-[12px] text-slate-700 hover:bg-emerald-50 flex items-center gap-2"
                    >
                      <Arrow
                        className={cn(
                          'w-3.5 h-3.5',
                          c.direction === 'higher'
                            ? 'text-emerald-600'
                            : 'text-rose-600',
                        )}
                      />
                      {c.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface SectionLabelProps {
  text: string
  count: number
  tone?: 'default' | 'bad'
}

function SectionLabel({ text, count, tone = 'default' }: SectionLabelProps) {
  const color =
    tone === 'bad'
      ? 'text-rose-700'
      : 'text-slate-500'
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <div
        className={cn(
          'text-[10px] uppercase tracking-wide font-semibold',
          color,
        )}
      >
        {text}
      </div>
      <div className="text-[10px] text-slate-400 tabular-nums">
        {count} outcome{count === 1 ? '' : 's'}
      </div>
    </div>
  )
}

interface GoalBannerProps {
  goal: GoalCandidate
  goalEffect: NodeEffect | null
  atDays: number
  mode: DosingMode
  costsCount: number
}

function GoalBanner({ goal, goalEffect, atDays, mode, costsCount }: GoalBannerProps) {
  const { headline, tone, sub } = goalProgressLabel(goal, goalEffect, atDays, mode)
  const toneClasses = {
    good: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    flat: 'bg-slate-50 border-slate-200 text-slate-700',
    bad: 'bg-rose-50 border-rose-200 text-rose-900',
  }[tone]
  const Arrow = goal.direction === 'higher' ? TrendingUp : TrendingDown
  return (
    <div className={cn('flex items-start gap-2.5 p-3 rounded-md border', toneClasses)}>
      <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] uppercase tracking-wide font-semibold opacity-70">
            Goal
          </span>
          <span className="text-xs font-semibold flex items-center gap-1">
            {goal.label} <Arrow className="w-3 h-3" />
          </span>
        </div>
        <div className="text-sm font-semibold mt-0.5">{headline}</div>
        <div className="text-[11px] opacity-80 mt-0.5">{sub}</div>
      </div>
      {costsCount > 0 && (
        <div className="text-right flex-shrink-0">
          <div className="text-[10px] uppercase tracking-wide opacity-70">Costs</div>
          <div className="text-sm font-semibold">{costsCount}</div>
        </div>
      )}
    </div>
  )
}

interface HorizonToggleProps {
  atDays: number
  onAtDaysChange: (days: number) => void
  mode: DosingMode
  onModeChange: (m: DosingMode) => void
}

function HorizonToggle({ atDays, onAtDaysChange, mode, onModeChange }: HorizonToggleProps) {
  return (
    <Card>
      <div className="p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <Clock className="w-3.5 h-3.5" />
            Time horizon
            <span className="normal-case font-medium text-slate-800 ml-1">
              · {formatHorizonLong(atDays)}
            </span>
          </div>
          <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => onModeChange('cumulative')}
              className={cn(
                'text-[11px] font-medium px-3 py-1 rounded',
                mode === 'cumulative'
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              Every day
            </button>
            <button
              onClick={() => onModeChange('oneoff')}
              className={cn(
                'text-[11px] font-medium px-3 py-1 rounded',
                mode === 'oneoff'
                  ? 'bg-white shadow-sm text-slate-800'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              Today only
            </button>
          </div>
        </div>

        <div className="px-1 relative">
          <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 pointer-events-none">
            {HORIZON_TICKS.map((t) => {
              const pct = (daysToPosition(t.days) / POSITION_RESOLUTION) * 100
              return (
                <span
                  key={t.days}
                  className="absolute w-0.5 h-2.5 bg-slate-300/70"
                  style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
                />
              )
            })}
          </div>
          <Slider
            min={0}
            max={POSITION_RESOLUTION}
            step={1}
            value={daysToPosition(atDays)}
            onChange={(pos) => onAtDaysChange(positionToDays(pos))}
          />
        </div>

        <div className="relative h-4 mt-1 mx-1">
          {HORIZON_TICKS.map((t) => {
            const pct = (daysToPosition(t.days) / POSITION_RESOLUTION) * 100
            const isActive = Math.abs(t.days - atDays) <= Math.max(1, t.days * 0.05)
            return (
              <button
                key={t.days}
                onClick={() => onAtDaysChange(t.days)}
                className={cn(
                  'absolute top-0 text-[10px] transition-colors whitespace-nowrap',
                  isActive
                    ? 'text-slate-800 font-semibold'
                    : 'text-slate-400 hover:text-slate-600',
                )}
                style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          {mode === 'cumulative' ? (
            <>
              How much of each outcome's long-run effect has accrued by{' '}
              <span className="font-medium">{formatHorizonShort(atDays)}</span>{' '}
              if the change is sustained from today.
            </>
          ) : (
            <>
              Lingering effect{' '}
              <span className="font-medium">{formatHorizonShort(atDays)}</span>{' '}
              after a single day's change. Most markers decay back to baseline.
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── EffectRow: decay curve + point estimate + optional BART band ──

interface EffectRowProps {
  effect: NodeEffect
  atDays: number
  mode: DosingMode
  mcEffect?: MCNodeEffect | null
}

function EffectRow({ effect, atDays, mode, mcEffect }: EffectRowProps) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30
  const fn = mode === 'cumulative' ? cumulativeEffectFraction : oneOffEffectFraction
  const fraction = fn(atDays, horizonDays)
  const fractionAsymptote = fn(horizonDays * 10, horizonDays)

  const asymptoticEffect = effect.totalEffect
  const timedEffect = asymptoticEffect * fraction

  const beneficial = meta?.beneficial ?? 'higher'
  const isNeutralDir = beneficial === 'neutral'
  const isBenefit =
    beneficial === 'higher'
      ? timedEffect > 0
      : beneficial === 'lower'
        ? timedEffect < 0
        : false
  const Icon = timedEffect > 0 ? TrendingUp : TrendingDown
  const toneColor = isNeutralDir
    ? 'text-slate-500'
    : isBenefit
      ? 'text-emerald-600'
      : 'text-rose-600'
  const toneIcon = isNeutralDir
    ? 'text-slate-400'
    : isBenefit
      ? 'text-emerald-500'
      : 'text-rose-500'
  const tone: 'benefit' | 'harm' | 'neutral' = isNeutralDir
    ? 'neutral'
    : isBenefit
      ? 'benefit'
      : 'harm'

  const pctOfAsymptote =
    mode === 'cumulative' && fractionAsymptote > 0
      ? Math.min(100, Math.round((fraction / fractionAsymptote) * 100))
      : null

  // Scale the BART posterior CI by the same time fraction used for the
  // point estimate so the band represents the timed delta, not the
  // asymptotic one. Only draw it if this outcome actually has a BART
  // ancestor in the propagation graph.
  const showBand = mcEffect?.hasBartAncestor === true
  const asymDeltaP05 = mcEffect ? mcEffect.posteriorSummary.p05 - mcEffect.factualValue : 0
  const asymDeltaP50 = mcEffect ? mcEffect.posteriorSummary.p50 - mcEffect.factualValue : 0
  const asymDeltaP95 = mcEffect ? mcEffect.posteriorSummary.p95 - mcEffect.factualValue : 0
  const timedDeltaP05 = asymDeltaP05 * fraction
  const timedDeltaP50 = asymDeltaP50 * fraction
  const timedDeltaP95 = asymDeltaP95 * fraction

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-slate-50 transition-colors">
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
          {meta?.noun ?? friendlyName(effect.nodeId)}
          {showBand && (
            <Sparkles
              className="w-3 h-3 flex-shrink-0 text-indigo-400"
              aria-label="Posterior band available"
            />
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          full effect ~{horizonDays < 14 ? `${horizonDays}d` : horizonDays < 60 ? `${Math.round(horizonDays / 7)}w` : `${Math.round(horizonDays / 30)}mo`}
          {pctOfAsymptote != null && (
            <span className="ml-1.5">
              · {pctOfAsymptote}% realised
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        <DecayCurve
          horizonDays={horizonDays}
          atDays={atDays}
          mode={mode}
          tone={tone}
        />
      </div>
      <div className="text-right flex-shrink-0 w-28">
        <div className={cn('text-sm font-semibold tabular-nums', toneColor)}>
          {formatEffectDelta(timedEffect, effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400 tabular-nums">
          of {formatEffectDelta(asymptoticEffect, effect.nodeId)} max
        </div>
        {showBand && (
          <>
            <PosteriorBand
              deltaP05={timedDeltaP05}
              deltaP50={timedDeltaP50}
              deltaP95={timedDeltaP95}
              tone={tone}
            />
            <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
              90% CI {formatEffectDelta(timedDeltaP05, effect.nodeId)} …{' '}
              {formatEffectDelta(timedDeltaP95, effect.nodeId)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface InterventionRow {
  node: ManipulableNode
  currentValue: number
  edgeCount: number
}

interface MultiInterventionPanelProps {
  rows: InterventionRow[]
  proposedValues: Record<string, number>
  effectiveValues: Record<string, number>
  onProposedChange: (nodeId: string, value: number) => void
  binaryOn: Record<string, boolean>
  onBinaryToggle: (id: string) => void
  onResetAll: () => void
  onRun: () => void
  isRunning: boolean
  anyDelta: boolean
}

function MultiInterventionPanel({
  rows,
  proposedValues,
  effectiveValues,
  onProposedChange,
  binaryOn,
  onBinaryToggle,
  onResetAll,
  onRun,
  isRunning,
  anyDelta,
}: MultiInterventionPanelProps) {
  const binaryByTarget = useMemo(() => {
    const out = new Map<string, BinaryIntervention>()
    for (const b of BINARY_INTERVENTIONS) {
      if (binaryOn[b.id]) out.set(b.targetNodeId, b)
    }
    return out
  }, [binaryOn])

  return (
    <Card>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Interventions
          </div>
          <button
            onClick={onResetAll}
            disabled={!anyDelta}
            className={cn(
              'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
              anyDelta
                ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                : 'text-slate-300 border-slate-100 cursor-not-allowed',
            )}
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>

        <div>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Today's commitments
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BINARY_INTERVENTIONS.map((b) => {
              const active = !!binaryOn[b.id]
              return (
                <button
                  key={b.id}
                  onClick={() => onBinaryToggle(b.id)}
                  title={b.description}
                  className={cn(
                    'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5',
                    active
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                  )}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      active ? 'bg-amber-500' : 'bg-slate-300',
                    )}
                  />
                  {b.label}
                  {active && (
                    <span className="text-[9px] text-amber-700/70 ml-0.5">
                      {b.hint}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {rows.map(({ node, currentValue }) => {
            const sliderValue = proposedValues[node.id] ?? currentValue
            const effective = effectiveValues[node.id] ?? sliderValue
            const range = rangeFor(node, currentValue)
            const changed = Math.abs(effective - currentValue) > 1e-9
            const binary = binaryByTarget.get(node.id)
            return (
              <div
                key={node.id}
                className={cn(
                  'rounded-md p-2 border transition-colors',
                  changed
                    ? 'bg-primary-50/40 border-primary-100'
                    : 'bg-slate-50 border-slate-100',
                )}
              >
                <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
                  <div className="min-w-0 flex items-center gap-1">
                    <div className="text-[11px] font-semibold text-slate-700 truncate">
                      {node.label}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400">
                      {formatNodeValue(currentValue, node)}→
                    </span>
                    <span className="text-[11px] font-medium text-slate-800 tabular-nums ml-0.5">
                      {formatNodeValue(effective, node)}
                    </span>
                  </div>
                </div>
                <Slider
                  min={range.min}
                  max={range.max}
                  step={node.step}
                  value={sliderValue}
                  onChange={(v) => onProposedChange(node.id, v)}
                />
                {binary && (
                  <div className="mt-1 text-[9px] text-amber-700/80 truncate">
                    + {binary.label.toLowerCase()} ({binary.hint})
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <Button onClick={onRun} disabled={isRunning || !anyDelta} className="w-full">
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Propagating
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run counterfactual
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinView() {
  const { pid, displayName, cohort } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()
  const { status: bartStatus, runMC, coverage } = useBartTwin()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [binaryOn, setBinaryOn] = useState<Record<string, boolean>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [atDays, setAtDays] = useState<number>(90)
  const [mode, setMode] = useState<DosingMode>('cumulative')
  const [goal, setGoal] = useState<GoalCandidate | null>(null)

  const resultsRef = useRef<HTMLDivElement>(null)

  // Invalidate stale MC bands whenever the underlying levers change. The
  // bands are snapshotted from the last runMC call; if the user moves a
  // slider and doesn't re-run, we'd be painting yesterday's draws onto
  // today's point estimates.
  useEffect(() => {
    setMcState(null)
  }, [proposedValues, binaryOn])

  const interventionRows = useMemo<InterventionRow[]>(() => {
    if (!participant) return []
    const edgeCounts = new Map<string, number>()
    for (const e of participant.effects_bayesian) {
      edgeCounts.set(e.action, (edgeCounts.get(e.action) ?? 0) + 1)
    }
    return MANIPULABLE_NODES
      .filter((n) => edgeCounts.has(n.id))
      .map((node) => ({
        node,
        currentValue: participant.current_values?.[node.id] ?? node.defaultValue,
        edgeCount: edgeCounts.get(node.id) ?? 0,
      }))
      .sort((a, b) => b.edgeCount - a.edgeCount)
  }, [participant])

  const effectiveValues = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const { node, currentValue } of interventionRows) {
      out[node.id] = proposedValues[node.id] ?? currentValue
    }
    for (const b of BINARY_INTERVENTIONS) {
      if (!binaryOn[b.id]) continue
      const baseline = participant?.current_values?.[b.targetNodeId] ?? 0
      const slider = proposedValues[b.targetNodeId] ?? baseline
      out[b.targetNodeId] =
        b.mode === 'set' ? b.onValue : slider + b.onValue
    }
    return out
  }, [interventionRows, proposedValues, binaryOn, participant])

  const deltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    const seen = new Set<string>()
    for (const { node, currentValue } of interventionRows) {
      const effective = effectiveValues[node.id] ?? currentValue
      if (Math.abs(effective - currentValue) > 1e-9) {
        out.push({ nodeId: node.id, value: effective, originalValue: currentValue })
        seen.add(node.id)
      }
    }
    for (const b of BINARY_INTERVENTIONS) {
      if (!binaryOn[b.id]) continue
      if (seen.has(b.targetNodeId)) continue
      const baseline = participant?.current_values?.[b.targetNodeId] ?? 0
      const effective = effectiveValues[b.targetNodeId]
      if (effective != null && Math.abs(effective - baseline) > 1e-9) {
        out.push({
          nodeId: b.targetNodeId,
          value: effective,
          originalValue: baseline,
        })
      }
    }
    return out
  }, [interventionRows, effectiveValues, binaryOn, participant])

  const handleProposedChange = useCallback((nodeId: string, value: number) => {
    setProposedValues((prev) => ({ ...prev, [nodeId]: value }))
  }, [])

  const handleBinaryToggle = useCallback((id: string) => {
    setBinaryOn((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const handleResetAll = useCallback(() => {
    setProposedValues({})
    setBinaryOn({})
    setState(null)
    setMcState(null)
  }, [])

  const handleRun = useCallback(() => {
    if (!participant || deltas.length === 0) return
    setIsRunning(true)
    const observedValues: Record<string, number> = { ...participant.current_values }
    try {
      const result = runFullCounterfactual(observedValues, deltas)
      setState(result)
    } finally {
      setIsRunning(false)
    }
    // Async MC — resolves in ~15-100 ms and upgrades the display with
    // posterior bands on the BART-covered outcomes. If the BART bundle
    // never loaded, runMC is a no-op returning null.
    if (bartStatus === 'ready') {
      runMC(observedValues, deltas)
        .then((mc) => {
          if (mc) setMcState(mc)
        })
        .catch((err) => {
          console.warn('[TwinView] MC run failed:', err)
        })
    }
  }, [participant, runFullCounterfactual, deltas, runMC, bartStatus])

  useLayoutEffect(() => {
    if (state && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [state])

  const sortedEffects = useMemo(() => {
    if (!state) return []
    const seen = new Set<string>()
    const out: NodeEffect[] = []
    for (const e of state.allEffects.values()) {
      if (Math.abs(e.totalEffect) <= 1e-6) continue
      if (seen.has(e.nodeId)) continue
      seen.add(e.nodeId)
      out.push(e)
    }
    return out.sort((a, b) => {
      const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
      const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
      if (ha !== hb) return ha - hb
      return Math.abs(b.totalEffect) - Math.abs(a.totalEffect)
    })
  }, [state])

  const availableGoalCandidates = useMemo(() => {
    if (!participant) return []
    const reachable = new Set<string>()
    for (const e of participant.effects_bayesian) {
      reachable.add(canonicalOutcomeKey(e.outcome))
    }
    return GOAL_CANDIDATES.filter((c) => reachable.has(c.outcomeId))
  }, [participant])

  const goalSplit = useMemo(() => {
    if (!goal || !state) return null
    return splitEffectsForGoal(sortedEffects, goal.outcomeId)
  }, [goal, state, sortedEffects])

  if (pid == null) return <EmptyState />
  if (isLoading || !participant) {
    return (
      <PageLayout title="Causal Twin">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Causal Twin"
      subtitle="See how a change moves every outcome over time. Results assume the change becomes your steady state."
      maxWidth="full"
      padding="none"
      className="pt-6 pb-6 pr-6 pl-3"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {displayName}
              </div>
              <div className="text-xs text-slate-500">
                {cohort ? `Cohort ${cohort} · ` : ''}Structural causal twin
              </div>
            </div>
          </div>
          <GoalPill
            goal={goal}
            candidates={availableGoalCandidates}
            onSelect={setGoal}
          />
        </div>

        <MethodBadge />

        <BartStatusBadge
          status={bartStatus}
          coverageCount={coverage.length}
          kSamples={mcState?.kSamples}
        />

        <HorizonToggle
          atDays={atDays}
          onAtDaysChange={setAtDays}
          mode={mode}
          onModeChange={setMode}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          <MultiInterventionPanel
            rows={interventionRows}
            proposedValues={proposedValues}
            effectiveValues={effectiveValues}
            onProposedChange={handleProposedChange}
            binaryOn={binaryOn}
            onBinaryToggle={handleBinaryToggle}
            onResetAll={handleResetAll}
            onRun={handleRun}
            isRunning={isRunning}
            anyDelta={deltas.length > 0}
          />

          <div ref={resultsRef}>
            {state ? (
              <Card>
                <div className="p-4 space-y-3">
                  {goal && goalSplit ? (
                    <>
                      <GoalBanner
                        goal={goal}
                        goalEffect={goalSplit.goalEffect}
                        atDays={atDays}
                        mode={mode}
                        costsCount={goalSplit.costs.length}
                      />
                      {goalSplit.goalEffect && (
                        <div>
                          <SectionLabel text="Goal outcome" count={1} />
                          <div className="rounded-md ring-1 ring-emerald-200 bg-emerald-50/30">
                            <EffectRow
                              effect={goalSplit.goalEffect}
                              atDays={atDays}
                              mode={mode}
                              mcEffect={mcState?.allEffects.get(goalSplit.goalEffect.nodeId)}
                            />
                          </div>
                        </div>
                      )}
                      {goalSplit.costs.length > 0 && (
                        <div>
                          <SectionLabel
                            text="What this costs you"
                            count={goalSplit.costs.length}
                            tone="bad"
                          />
                          <div className="space-y-0.5">
                            {goalSplit.costs.map((effect) => (
                              <EffectRow
                                key={effect.nodeId}
                                effect={effect}
                                atDays={atDays}
                                mode={mode}
                                mcEffect={mcState?.allEffects.get(effect.nodeId)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {goalSplit.others.length > 0 && (
                        <div>
                          <SectionLabel
                            text="Other movements"
                            count={goalSplit.others.length}
                          />
                          <div className="space-y-0.5">
                            {goalSplit.others.map((effect) => (
                              <EffectRow
                                key={effect.nodeId}
                                effect={effect}
                                atDays={atDays}
                                mode={mode}
                                mcEffect={mcState?.allEffects.get(effect.nodeId)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {mode === 'cumulative'
                              ? `If you sustain this change, ${formatHorizonShort(atDays)} from now:`
                              : `One-off: effect ${formatHorizonShort(atDays)} after a single day:`}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Dashed tick = outcome's natural response time · dot = now
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {sortedEffects.length} outcome{sortedEffects.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {sortedEffects.map((effect) => (
                          <EffectRow
                            key={effect.nodeId}
                            effect={effect}
                            atDays={atDays}
                            mode={mode}
                            mcEffect={mcState?.allEffects.get(effect.nodeId)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ) : (
              <Card>
                <div className="p-6 text-center text-sm text-slate-400">
                  {goal
                    ? `Goal set: ${goal.label.toLowerCase()}. Pull the levers and run to see how close you get and what it costs.`
                    : 'Adjust any slider and run. Use the time horizon above to scrub from tomorrow to a year out. Optional: set a goal to reframe results.'}
                </div>
              </Card>
            )}
          </div>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinView
