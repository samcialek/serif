/**
 * Twin SCM — per-member counterfactual workspace.
 *
 * The user pulls levers (continuous sliders over actions + state-space
 * overrides for loads and biomarker baselines) and runs the counterfactual
 * engine. Asymptotic magnitudes come from the SCM; the time horizon
 * reshapes them as cumulative-accrual curves: every lever is assumed to
 * be applied every day from now through the chosen horizon.
 *
 *   accrued fraction at t:  A * (1 - e^(-t/tau))
 *
 * Levers are gated by horizon-specific credibility (see
 * `src/data/scm/leverCredibility.ts`). If a lever's daily-sustained
 * intervention or state-override cannot be credibly predicted at the
 * chosen horizon, it is silently removed from the UI — the SCM does not
 * answer questions it cannot validate.
 *
 * Posterior bands come from the BART Twin fit when available. Rows
 * without a BART ancestor degrade to point estimates with the same
 * cumulative shape. A goal overlay (set via the header pill) reframes
 * the results around a headline outcome and flags off-goal movements
 * as costs.
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
import { Card, Button, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { useBartTwin } from '@/hooks/useBartTwin'
import type {
  FullCounterfactualState,
  NodeEffect,
} from '@/data/scm/fullCounterfactual'
import type { MCFullCounterfactualState, MCNodeEffect } from '@/data/scm/bartMonteCarlo'
import type { ParticipantPortal } from '@/data/portal/types'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import {
  cumulativeEffectFraction,
  horizonDaysFor,
  isOutcomeCredibleAt,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue, formatClockTime } from '@/utils/rounding'
import {
  leversAvailableAt,
  filterCredibleLevers,
} from '@/data/scm/leverCredibility'

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

// Ticks are positioned equidistantly on the track: the i-th tick lives at
// position (i / (N-1)) * RESOLUTION. Between ticks we interpolate linearly
// in day-space, so a position halfway between the "1 wk" and "1 mo" ticks
// resolves to ~18 days (midpoint of 7 and 30).
const TICK_POSITIONS: number[] = HORIZON_TICKS.map(
  (_, i) => (i / (HORIZON_TICKS.length - 1)) * POSITION_RESOLUTION,
)

function daysToPosition(days: number): number {
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

function positionToDays(pos: number): number {
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
  { outcomeId: 'hrv_daily', label: 'Raise overnight RMSSD', group: 'Wearable & sleep', direction: 'higher' },
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

// ─── State-space panel ─────────────────────────────────────────────
//
// Loads and biomarker confounders that BART reads as direct parents.
// The engine only shifts posteriors for variables that appear in a
// BART surface's `parentNames`; everything in this list has been
// verified against the manifest. Sliders here re-frame the factual
// state the MC abducts from — they are NOT interventions.

interface StateSpaceKnob {
  /** Key in observedValues (the name BART's parentNames expects). */
  observedKey: string
  label: string
  unit: string
  step: number
  /** Source for today's value + slider range. */
  source:
    | { kind: 'load'; loadKey: 'acwr' | 'sleep_debt_14d' | 'training_consistency' }
    | { kind: 'action'; actionKey: string }
    | { kind: 'baseline'; baselineKey: string; fallbackRange: [number, number] }
  /** Hard bounds; slider clamps even when (baseline ± 2·sd) would blow past them. */
  hardRange?: { min: number; max: number }
  /** Used when the source has no baseline/sd so we can't derive a personal range. */
  defaultRange?: { min: number; max: number }
  format?: (v: number) => string
}

const STATE_SPACE_KNOBS: StateSpaceKnob[] = [
  {
    observedKey: 'acwr',
    label: 'ACWR',
    unit: '',
    step: 0.05,
    source: { kind: 'load', loadKey: 'acwr' },
    hardRange: { min: 0.5, max: 2.0 },
    defaultRange: { min: 0.7, max: 1.5 },
    format: (v) => v.toFixed(2),
  },
  {
    observedKey: 'sleep_debt',
    label: 'Sleep debt (14d)',
    unit: 'hrs',
    step: 0.5,
    source: { kind: 'load', loadKey: 'sleep_debt_14d' },
    hardRange: { min: 0, max: 20 },
    defaultRange: { min: 0, max: 12 },
  },
  {
    observedKey: 'training_load',
    label: 'Training load',
    unit: 'au',
    step: 5,
    source: { kind: 'action', actionKey: 'training_load' },
    hardRange: { min: 0, max: 200 },
    defaultRange: { min: 0, max: 120 },
  },
  {
    observedKey: 'training_consistency',
    label: 'Training consistency',
    unit: '',
    step: 0.05,
    source: { kind: 'load', loadKey: 'training_consistency' },
    hardRange: { min: 0, max: 1 },
    defaultRange: { min: 0.3, max: 1 },
    format: (v) => v.toFixed(2),
  },
  {
    observedKey: 'ferritin',
    label: 'Ferritin',
    unit: 'ng/mL',
    step: 5,
    source: { kind: 'baseline', baselineKey: 'ferritin', fallbackRange: [20, 400] },
    hardRange: { min: 10, max: 500 },
  },
  {
    observedKey: 'hscrp',
    label: 'hs-CRP',
    unit: 'mg/L',
    step: 0.1,
    source: { kind: 'baseline', baselineKey: 'hscrp', fallbackRange: [0, 10] },
    hardRange: { min: 0, max: 15 },
  },
]

/** Resolve "today's value" for a state-space knob from the participant JSON. */
function todayValueForKnob(
  knob: StateSpaceKnob,
  participant: ParticipantPortal,
): number | null {
  const src = knob.source
  if (src.kind === 'load') {
    const load = participant.loads_today?.[src.loadKey]
    return load ? load.value : null
  }
  if (src.kind === 'action') {
    const v = participant.current_values?.[src.actionKey]
    return typeof v === 'number' ? v : null
  }
  const v = participant.outcome_baselines?.[src.baselineKey]
  return typeof v === 'number' ? v : null
}

/** Compute slider range for a knob: personal baseline ± 2σ when available,
 *  else the defaultRange, clamped by hardRange, and extended to include today. */
function rangeForKnob(
  knob: StateSpaceKnob,
  participant: ParticipantPortal,
): { min: number; max: number } {
  const today = todayValueForKnob(knob, participant)
  let lo: number, hi: number

  const src = knob.source
  if (src.kind === 'load') {
    const load = participant.loads_today?.[src.loadKey]
    if (load && Number.isFinite(load.baseline) && Number.isFinite(load.sd) && load.sd > 0) {
      lo = load.baseline - 2 * load.sd
      hi = load.baseline + 2 * load.sd
    } else {
      lo = knob.defaultRange?.min ?? 0
      hi = knob.defaultRange?.max ?? 1
    }
  } else if (src.kind === 'action') {
    const mean = participant.current_values?.[src.actionKey]
    const sd = participant.behavioral_sds?.[src.actionKey]
    if (typeof mean === 'number' && typeof sd === 'number' && sd > 0) {
      lo = mean - 2 * sd
      hi = mean + 2 * sd
    } else {
      lo = knob.defaultRange?.min ?? 0
      hi = knob.defaultRange?.max ?? 1
    }
  } else {
    lo = src.fallbackRange[0]
    hi = src.fallbackRange[1]
  }

  if (today != null) {
    lo = Math.min(lo, today)
    hi = Math.max(hi, today)
  }
  if (knob.hardRange) {
    lo = Math.max(lo, knob.hardRange.min)
    hi = Math.min(hi, knob.hardRange.max)
  }
  return { min: lo, max: hi }
}

/** Build the observedValues record both engines consume — merges current_values
 *  with loads_today and outcome_baselines under every name the DAG might look
 *  up (bare BART parentNames AND the load-key variants piecewise edges use),
 *  then lays state-space overrides on top. Fixes the pre-existing bug where
 *  loads and biomarker confounders were never populated. */
function buildObservedValues(
  participant: ParticipantPortal,
  stateOverrides: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {}
  // Default layer: guarantee every MANIPULABLE_NODES key is present even
  // when the participant JSON omits it. Without this, BART parent
  // extraction fails for any outcome whose parents include an action not
  // persisted in current_values, silently dropping it to piecewise.
  for (const node of MANIPULABLE_NODES) out[node.id] = node.defaultValue
  Object.assign(out, participant.current_values)

  const loads = participant.loads_today
  if (loads) {
    for (const [rawKey, load] of Object.entries(loads)) {
      if (load && Number.isFinite(load.value)) out[rawKey] = load.value
    }
    // BART manifest parentNames strip the 14d suffix — alias so lookups hit.
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
  // State-space panel edits the `sleep_debt` alias; mirror it back onto the
  // `_14d` key so piecewise edges see the same shift.
  if (stateOverrides.sleep_debt != null) {
    out.sleep_debt_14d = stateOverrides.sleep_debt
  }
  return out
}

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
): { headline: string; tone: 'good' | 'flat' | 'bad'; sub: string } {
  if (!effect) {
    return {
      headline: 'No movement',
      tone: 'flat',
      sub: 'Your current changes don\'t reach this outcome.',
    }
  }
  const horizonDays = horizonDaysFor(canonicalOutcomeKey(effect.nodeId)) ?? 30
  const fraction = cumulativeEffectFraction(atDays, horizonDays)
  const fractionAsymptote = cumulativeEffectFraction(horizonDays * 10, horizonDays)
  const timed = effect.totalEffect * fraction
  const isGood =
    goal.direction === 'higher' ? effect.totalEffect > 0 : effect.totalEffect < 0
  const pct = fractionAsymptote > 0
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
  tone: 'benefit' | 'harm' | 'neutral'
  widthPx?: number
  heightPx?: number
}

function DecayCurve({
  horizonDays,
  atDays,
  tone,
  widthPx = 96,
  heightPx = 28,
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
  costsCount: number
}

function GoalBanner({ goal, goalEffect, atDays, costsCount }: GoalBannerProps) {
  const { headline, tone, sub } = goalProgressLabel(goal, goalEffect, atDays)
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
}

function HorizonToggle({ atDays, onAtDaysChange }: HorizonToggleProps) {
  return (
    <Card>
      <div className="p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          <Clock className="w-3.5 h-3.5" />
          Time horizon
          <span className="normal-case font-medium text-slate-800 ml-1">
            · {formatHorizonLong(atDays)}
          </span>
        </div>

        <div className="max-w-sm">
          <div className="px-1 relative">
            <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 pointer-events-none">
              {HORIZON_TICKS.map((t, i) => {
                const pct = (TICK_POSITIONS[i] / POSITION_RESOLUTION) * 100
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
            {HORIZON_TICKS.map((t, i) => {
              const pct = (TICK_POSITIONS[i] / POSITION_RESOLUTION) * 100
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
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          Each lever you pull is applied{' '}
          <span className="font-medium">every day</span> from now through{' '}
          <span className="font-medium">{formatHorizonShort(atDays)}</span>.
          Levers and outcomes that the model cannot credibly predict at this
          horizon are hidden.
        </div>
      </div>
    </Card>
  )
}

// ─── EffectRow: decay curve + point estimate + optional BART band ──

interface EffectRowProps {
  effect: NodeEffect
  atDays: number
  mcEffect?: MCNodeEffect | null
}

function EffectRow({ effect, atDays, mcEffect }: EffectRowProps) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30
  const fraction = cumulativeEffectFraction(atDays, horizonDays)
  const fractionAsymptote = cumulativeEffectFraction(horizonDays * 10, horizonDays)

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

  const pctOfAsymptote = fractionAsymptote > 0
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

// ─── State-space panel component ───────────────────────────────────

interface StateSpacePanelProps {
  participant: ParticipantPortal
  stateOverrides: Record<string, number>
  atDays: number
  onOverrideChange: (key: string, value: number) => void
  onResetAll: () => void
}

function StateSpacePanel({
  participant,
  stateOverrides,
  atDays,
  onOverrideChange,
  onResetAll,
}: StateSpacePanelProps) {
  const [open, setOpen] = useState(false)

  const rows = useMemo(() => {
    const credible = leversAvailableAt('stateOverride', atDays)
    return STATE_SPACE_KNOBS.filter((knob) => credible.has(knob.observedKey)).map(
      (knob) => {
        const today = todayValueForKnob(knob, participant)
        const range = rangeForKnob(knob, participant)
        const override = stateOverrides[knob.observedKey]
        const effective = override ?? today
        const available = today != null
        const changed = available && override != null && Math.abs(override - today!) > 1e-9
        return { knob, today, range, effective, available, changed }
      },
    )
  }, [participant, stateOverrides, atDays])

  const anyChanged = rows.some((r) => r.changed)

  // If every knob is hidden at this horizon, don't render the panel at all.
  // Protects against an empty Card and a confusing "State today" header with
  // nothing underneath.
  if (rows.length === 0) return null
  const fmt = (v: number | null, knob: StateSpaceKnob) => {
    if (v == null || !Number.isFinite(v)) return '—'
    const formatted = knob.format ? knob.format(v) : formatValue(v, undefined)
    return knob.unit ? `${formatted} ${knob.unit}` : formatted
  }

  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50/60 transition-colors rounded-t-md"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn(
              'w-4 h-4 text-slate-400 transition-transform',
              open ? 'rotate-0' : '-rotate-90',
            )}
          />
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            State today
          </div>
          {anyChanged && (
            <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 ml-1">
              simulating from altered state
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 truncate ml-2">
          Loads + confounders that reshape Twin's factual baseline.
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div className="flex items-center justify-end">
            <button
              onClick={onResetAll}
              disabled={!anyChanged}
              className={cn(
                'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
                anyChanged
                  ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'text-slate-300 border-slate-100 cursor-not-allowed',
              )}
            >
              <RotateCcw className="w-3 h-3" />
              Reset state
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {rows.map(({ knob, today, range, effective, available, changed }) => (
              <div
                key={knob.observedKey}
                className={cn(
                  'rounded-md p-2 border transition-colors',
                  !available
                    ? 'bg-slate-50 border-slate-100 opacity-60'
                    : changed
                    ? 'bg-amber-50/40 border-amber-100'
                    : 'bg-slate-50 border-slate-100',
                )}
              >
                <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
                  <div className="text-[11px] font-semibold text-slate-700 truncate">
                    {knob.label}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400">
                      {fmt(today, knob)}
                      {changed ? '→' : ''}
                    </span>
                    {changed && (
                      <span className="text-[11px] font-medium text-amber-700 tabular-nums ml-0.5">
                        {fmt(effective ?? null, knob)}
                      </span>
                    )}
                  </div>
                </div>
                {available ? (
                  <Slider
                    min={range.min}
                    max={range.max}
                    step={knob.step}
                    value={effective ?? range.min}
                    onChange={(v) => onOverrideChange(knob.observedKey, v)}
                  />
                ) : (
                  <div className="text-[10px] text-slate-400 italic py-1">
                    no baseline for this member
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
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
  onProposedChange: (nodeId: string, value: number) => void
  onResetAll: () => void
  onRun: () => void
  isRunning: boolean
  anyDelta: boolean
  atDays: number
}

function MultiInterventionPanel({
  rows,
  proposedValues,
  onProposedChange,
  onResetAll,
  onRun,
  isRunning,
  anyDelta,
  atDays,
}: MultiInterventionPanelProps) {
  return (
    <Card>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Daily interventions
            <span className="normal-case font-normal text-slate-400 ml-2">
              · applied every day for {formatHorizonShort(atDays)}
            </span>
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

        {rows.length === 0 ? (
          <div className="text-[11px] text-slate-400 italic py-4 text-center">
            No interventions are credibly predictable at this horizon. Shorten
            the time frame to expose more levers.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {rows.map(({ node, currentValue }) => {
              const sliderValue = proposedValues[node.id] ?? currentValue
              const range = rangeFor(node, currentValue)
              const changed = Math.abs(sliderValue - currentValue) > 1e-9
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
                        {formatNodeValue(sliderValue, node)}
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
                </div>
              )
            })}
          </div>
        )}

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
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()
  const { status: bartStatus, runMC, coverage } = useBartTwin()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [stateOverrides, setStateOverrides] = useState<Record<string, number>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [atDays, setAtDays] = useState<number>(90)
  const [goal, setGoal] = useState<GoalCandidate | null>(null)

  const resultsRef = useRef<HTMLDivElement>(null)

  // Invalidate stale MC bands whenever the underlying levers change. The
  // bands are snapshotted from the last runMC call; if the user moves a
  // slider and doesn't re-run, we'd be painting yesterday's draws onto
  // today's point estimates. Horizon changes don't invalidate — the same
  // counterfactual just gets re-displayed with a different time fraction.
  useEffect(() => {
    setMcState(null)
    setState(null)
  }, [proposedValues, stateOverrides])

  const interventionRows = useMemo<InterventionRow[]>(() => {
    if (!participant) return []
    const edgeCounts = new Map<string, number>()
    for (const e of participant.effects_bayesian) {
      edgeCounts.set(e.action, (edgeCounts.get(e.action) ?? 0) + 1)
    }
    const credible = leversAvailableAt('intervention', atDays)
    return MANIPULABLE_NODES
      .filter((n) => edgeCounts.has(n.id) && credible.has(n.id))
      .map((node) => ({
        node,
        currentValue: participant.current_values?.[node.id] ?? node.defaultValue,
        edgeCount: edgeCounts.get(node.id) ?? 0,
      }))
      .sort((a, b) => b.edgeCount - a.edgeCount)
  }, [participant, atDays])

  const deltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    for (const { node, currentValue } of interventionRows) {
      const effective = proposedValues[node.id] ?? currentValue
      if (Math.abs(effective - currentValue) > 1e-9) {
        out.push({ nodeId: node.id, value: effective, originalValue: currentValue })
      }
    }
    return out
  }, [interventionRows, proposedValues])

  const handleProposedChange = useCallback((nodeId: string, value: number) => {
    setProposedValues((prev) => ({ ...prev, [nodeId]: value }))
  }, [])

  const handleResetAll = useCallback(() => {
    setProposedValues({})
    setStateOverrides({})
    setState(null)
    setMcState(null)
  }, [])

  const handleStateOverrideChange = useCallback((key: string, value: number) => {
    setStateOverrides((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleStateReset = useCallback(() => {
    setStateOverrides({})
  }, [])

  const handleRun = useCallback(() => {
    if (!participant || deltas.length === 0) return
    setIsRunning(true)
    // Drop any state-override the user set at a shorter horizon where the
    // knob is now hidden — otherwise a non-credible starting value would
    // silently leak into the factual the MC abducts from.
    const credibleOverrides = filterCredibleLevers(
      stateOverrides,
      'stateOverride',
      atDays,
    )
    const observedValues = buildObservedValues(participant, credibleOverrides)
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
  }, [participant, runFullCounterfactual, deltas, runMC, bartStatus, stateOverrides, atDays])

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
      if (!isOutcomeCredibleAt(canonicalOutcomeKey(e.nodeId), atDays)) continue
      seen.add(e.nodeId)
      out.push(e)
    }
    return out.sort((a, b) => {
      const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
      const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
      if (ha !== hb) return ha - hb
      return Math.abs(b.totalEffect) - Math.abs(a.totalEffect)
    })
  }, [state, atDays])

  const availableGoalCandidates = useMemo(() => {
    if (!participant) return []
    const reachable = new Set<string>()
    for (const e of participant.effects_bayesian) {
      reachable.add(canonicalOutcomeKey(e.outcome))
    }
    return GOAL_CANDIDATES.filter(
      (c) =>
        reachable.has(c.outcomeId) && isOutcomeCredibleAt(c.outcomeId, atDays),
    )
  }, [participant, atDays])

  // If the user's goal stops being credible after a horizon change (e.g.
  // scrubbing from 6mo to 1d with ferritin as goal), clear it so the
  // GoalPill and banner don't cling to a stale target. Mirrors how
  // filterCredibleLevers drops orphaned state-space overrides.
  useEffect(() => {
    if (!goal) return
    if (!availableGoalCandidates.some((c) => c.outcomeId === goal.outcomeId)) {
      setGoal(null)
    }
  }, [goal, availableGoalCandidates])

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
      subtitle="See how daily application of each change moves every outcome over your chosen horizon."
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
            <MemberAvatar persona={persona} displayName={displayName} size="md" />
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
        />

        <StateSpacePanel
          participant={participant}
          stateOverrides={stateOverrides}
          atDays={atDays}
          onOverrideChange={handleStateOverrideChange}
          onResetAll={handleStateReset}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          <MultiInterventionPanel
            rows={interventionRows}
            proposedValues={proposedValues}
            onProposedChange={handleProposedChange}
            onResetAll={handleResetAll}
            onRun={handleRun}
            isRunning={isRunning}
            anyDelta={deltas.length > 0}
            atDays={atDays}
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
                        costsCount={goalSplit.costs.length}
                      />
                      {goalSplit.goalEffect && (
                        <div>
                          <SectionLabel text="Goal outcome" count={1} />
                          <div className="rounded-md ring-1 ring-emerald-200 bg-emerald-50/30">
                            <EffectRow
                              effect={goalSplit.goalEffect}
                              atDays={atDays}
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
                            After {formatHorizonShort(atDays)} of applying these every day:
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Dashed tick = outcome's natural response time · dot = now
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {sortedEffects.length} outcome{sortedEffects.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      {sortedEffects.length === 0 ? (
                        <div className="py-4 text-center">
                          <div className="text-sm font-medium text-slate-700 mb-1">
                            Nothing moves measurably at {formatHorizonShort(atDays)}.
                          </div>
                          <div className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Outcomes tracked here respond on timescales from
                            days (sleep, HRV) to months (body composition,
                            lipids). Extend the horizon to see slower markers.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {sortedEffects.map((effect) => (
                            <EffectRow
                              key={effect.nodeId}
                              effect={effect}
                              atDays={atDays}
                              mcEffect={mcState?.allEffects.get(effect.nodeId)}
                            />
                          ))}
                        </div>
                      )}
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
