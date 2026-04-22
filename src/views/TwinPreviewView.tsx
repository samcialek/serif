/**
 * TwinPreviewView -- design wireframe for the temporal Twin.
 *
 * This is the "what if the Twin talked about time?" sketch, living at a
 * separate route so Sam can review the interaction before we commit to
 * shipping decay curves in the real Twin. Not wired into the nav.
 *
 * Premise: reuse the existing point-estimate counterfactual engine for
 * asymptotic magnitudes, then overlay a synthetic decay/accumulation
 * shape keyed on each outcome's published horizon_days. The curves are
 * transparently approximate -- first-order `1 - exp(-t/tau)` with
 * `tau = horizon/3` -- so we can iterate on the UI before investing in
 * fitted or literature-derived shapes.
 *
 * Two modes:
 *   - cumulative ("every day, starting now"): effect at t = A * (1 - e^(-t/tau))
 *   - one-off ("today only, then stop"): effect at t = A * (t/tau) * e^(1 - t/tau)
 *
 * What the real implementation would need before shipping:
 *   - per-edge decay shapes (literature half-lives, or fit from cohort)
 *   - biomarker-specific lag (cortisol days, ferritin months)
 *   - confidence band that widens with time-from-now
 */

import { useMemo, useState, useCallback, useLayoutEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  GitBranch,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import type {
  FullCounterfactualState,
  NodeEffect,
} from '@/data/scm/fullCounterfactual'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import {
  cumulativeEffectFraction,
  oneOffEffectFraction,
  horizonDaysFor,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue, formatClockTime } from '@/utils/rounding'

// ─── Horizons ───────────────────────────────────────────────────────

interface HorizonChoice {
  id: string
  label: string
  days: number
}

const HORIZON_CHOICES: HorizonChoice[] = [
  { id: 'tomorrow', label: 'Tomorrow', days: 1 },
  { id: 'week', label: 'In 1 week', days: 7 },
  { id: 'month', label: 'In 1 month', days: 30 },
  { id: '3mo', label: 'In 3 months', days: 90 },
  { id: '6mo', label: 'In 6 months', days: 180 },
]

type DosingMode = 'cumulative' | 'oneoff'

// ─── Manipulable nodes (mirrors TwinView) ──────────────────────────

interface ManipulableNode {
  id: string
  label: string
  unit: string
  step: number
  defaultValue: number
  fixedRange?: { min: number; max: number }
  derived?: boolean
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
  { id: 'acwr', label: 'ACWR', unit: 'ratio', step: 0.05, defaultValue: 1.0,
    fixedRange: { min: 0.8, max: 1.8 }, derived: true },
  { id: 'training_load', label: 'Training Load', unit: 'TRIMP/day', step: 5, defaultValue: 60,
    fixedRange: { min: 20, max: 150 }, derived: true },
]

// ─── Binary "today only" interventions ──────────────────────────────
//
// Some interventions are naturally yes/no commitments rather than dosed
// quantities ("did you travel today?", "did you have alcohol?"). These
// map onto existing SCM continuous nodes via a known preset value (set
// mode) or an offset applied to the slider value (delta mode). When ON,
// the binary's effective value overrides what the slider shows.

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
    description: 'A glass or two with dinner — fragments deep sleep.',
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
  // Window the x-axis at 3*horizon (or the toggled horizon, whichever is
  // larger) so the asymptote is visible and the "now" marker has context.
  const xMax = Math.max(horizonDays * 3, atDays * 1.1)
  const nSamples = 48

  const fn = mode === 'cumulative' ? cumulativeEffectFraction : oneOffEffectFraction
  // For one-off mode the peak can exceed 1 (the `(t/tau)*exp(1-t/tau)` has
  // a peak of 1 at t=tau). Normalise to the observed max for display.
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
      {/* baseline */}
      <line
        x1={0}
        y1={heightPx - 1}
        x2={widthPx}
        y2={heightPx - 1}
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      {/* area under */}
      <path
        d={`${pathD} L${widthPx},${heightPx - 1} L0,${heightPx - 1} Z`}
        fill={fill}
        opacity={0.35}
      />
      {/* line */}
      <path d={pathD} fill="none" stroke={stroke} strokeWidth={1.5} />
      {/* horizon tick (tau * 3 ≈ 95% realised point) */}
      <line
        x1={toX(horizonDays)}
        y1={2}
        x2={toX(horizonDays)}
        y2={heightPx - 1}
        stroke="#94a3b8"
        strokeWidth={0.75}
        strokeDasharray="2 2"
      />
      {/* now marker */}
      <circle cx={nowX} cy={nowY} r={2.5} fill={stroke} />
    </svg>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <PageLayout title="Twin Preview">
      <Card>
        <div className="p-8 text-center">
          <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Pick a member to open their twin
          </h3>
        </div>
      </Card>
    </PageLayout>
  )
}

interface HorizonToggleProps {
  choice: HorizonChoice
  onChoiceChange: (c: HorizonChoice) => void
  mode: DosingMode
  onModeChange: (m: DosingMode) => void
}

function HorizonToggle({ choice, onChoiceChange, mode, onModeChange }: HorizonToggleProps) {
  const idx = HORIZON_CHOICES.findIndex((c) => c.id === choice.id)
  const safeIdx = idx >= 0 ? idx : 0
  return (
    <Card>
      <div className="p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <Clock className="w-3.5 h-3.5" />
            Time horizon
            <span className="normal-case font-medium text-slate-800 ml-1">
              · {choice.label}
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

        <div className="px-1">
          <Slider
            min={0}
            max={HORIZON_CHOICES.length - 1}
            step={1}
            value={safeIdx}
            onChange={(v) => onChoiceChange(HORIZON_CHOICES[Math.round(v)])}
          />
        </div>

        <div className="flex justify-between mt-1 px-1">
          {HORIZON_CHOICES.map((c, i) => (
            <button
              key={c.id}
              onClick={() => onChoiceChange(c)}
              className={cn(
                'text-[10px] transition-colors',
                i === safeIdx
                  ? 'text-slate-800 font-semibold'
                  : 'text-slate-400 hover:text-slate-600',
              )}
            >
              {c.label.replace('In ', '')}
            </button>
          ))}
        </div>

        <div className="mt-2 text-[11px] text-slate-500">
          {mode === 'cumulative' ? (
            <>
              How much of each outcome's long-run effect has accrued by{' '}
              <span className="font-medium">day {choice.days}</span> if
              the change is sustained from today.
            </>
          ) : (
            <>
              Lingering effect at{' '}
              <span className="font-medium">day {choice.days}</span> from
              a single day's change. Most markers decay back to baseline.
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

interface EffectRowProps {
  effect: NodeEffect
  atDays: number
  mode: DosingMode
}

function EffectRow({ effect, atDays, mode }: EffectRowProps) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30 // conservative fallback
  const fn = mode === 'cumulative' ? cumulativeEffectFraction : oneOffEffectFraction
  const fraction = fn(atDays, horizonDays)
  const fractionAsymptote = fn(horizonDays * 10, horizonDays) // ~1 for cumulative, ~0 for oneoff long-tail
  const normalised =
    mode === 'cumulative' ? fraction : fraction // already peaks at 1 in one-off mode

  const asymptoticEffect = effect.totalEffect
  const timedEffect = asymptoticEffect * normalised

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

  // "Fully realised" indicator — if the toggled horizon is well past the
  // outcome's own horizon, the timed effect is ≈ asymptotic.
  const pctOfAsymptote =
    mode === 'cumulative' && fractionAsymptote > 0
      ? Math.min(100, Math.round((fraction / fractionAsymptote) * 100))
      : null

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-slate-50 transition-colors">
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(effect.nodeId)}
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
  // Map node -> active binary that targets it (for hint badges).
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

        {/* Binary "today only" toggles */}
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

        {/* Continuous sliders */}
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
                    {node.derived && (
                      <span className="text-[8px] uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1 bg-white">
                        d
                      </span>
                    )}
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

export function TwinPreviewView() {
  const { pid, displayName, cohort } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [binaryOn, setBinaryOn] = useState<Record<string, boolean>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [choice, setChoice] = useState<HorizonChoice>(HORIZON_CHOICES[3]) // 3 months
  const [mode, setMode] = useState<DosingMode>('cumulative')

  const resultsRef = useRef<HTMLDivElement>(null)

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

  // Effective per-node values: slider value, then any active binary
  // override stamped on top (binary ON wins over slider for that node).
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
    // Binary targets that aren't in the slider rows (e.g., travel_load,
    // which we removed from MANIPULABLE_NODES so it's binary-only).
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
  }, [participant, runFullCounterfactual, deltas])

  // Scroll results into view on first run
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
      // Sort by horizon (fast first), then by magnitude
      const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
      const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
      if (ha !== hb) return ha - hb
      return Math.abs(b.totalEffect) - Math.abs(a.totalEffect)
    })
  }, [state])

  if (pid == null) return <EmptyState />
  if (isLoading || !participant) {
    return (
      <PageLayout title="Twin Preview">
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
      title="Twin Preview"
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
              <div className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                {displayName}
                <span className="text-[10px] font-medium uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded">
                  preview
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {cohort ? `Cohort ${cohort} · ` : ''}Temporal Twin wireframe
              </div>
            </div>
          </div>
          <Link
            to="/twin"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Twin
          </Link>
        </div>

        <div className="flex items-center gap-2 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-md p-3">
          <Sparkles className="w-4 h-4 flex-shrink-0 text-indigo-500" />
          <span>
            <strong className="font-semibold">Design preview.</strong>{' '}
            Asymptotic magnitudes come from the real SCM; decay shapes are
            first-order synthetic curves keyed on each outcome's published
            horizon. Not medical advice, not final data.
          </span>
        </div>

        <HorizonToggle
          choice={choice}
          onChoiceChange={setChoice}
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
                <div className="p-4">
                  <div className="flex items-baseline justify-between mb-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {mode === 'cumulative'
                          ? `If you sustain this change, in ${choice.label.toLowerCase()}:`
                          : `One-off: effect lingering in ${choice.label.toLowerCase()}:`}
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
                        atDays={choice.days}
                        mode={mode}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="p-6 text-center text-sm text-slate-400">
                  Adjust any slider and run. Use the time horizon above to
                  scrub from tomorrow to 6 months out.
                </div>
              </Card>
            )}
          </div>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinPreviewView
