/**
 * Fork A — Direct manipulation.
 *
 * Swaps linear sliders for richer, tactile controls and unifies the horizon
 * control with the outcome rows:
 *   • Rotary knob for bedtime (drag the arc, not a slider).
 *   • Magnetic snap on intervention sliders — the thumb pulls toward today's
 *     value and the credibility-edge values, so the "right" dose feels sticky.
 *   • Scrubbable sparklines — click or drag anywhere on an outcome's decay
 *     curve to set the global atDays. No horizon slider needed.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Info,
  Loader2,
  Play,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
  Clock,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { useBartTwin } from '@/hooks/useBartTwin'
import type { FullCounterfactualState, NodeEffect } from '@/data/scm/fullCounterfactual'
import type { MCNodeEffect, MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import {
  cumulativeEffectFraction,
  horizonDaysFor,
  isOutcomeCredibleAt,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue } from '@/utils/rounding'
import { leversAvailableAt, filterCredibleLevers } from '@/data/scm/leverCredibility'
import {
  MANIPULABLE_NODES,
  type ManipulableNode,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  formatHorizonLong,
  buildObservedValues,
  MethodBadge,
  BartStatusBadge,
  DecayCurve,
  PosteriorBand,
  toneForEffect,
  formatClock,
} from './_shared'

// ─── Magnetic snap ─────────────────────────────────────────────────
//
// Given a raw slider value, pull toward the nearest "anchor" if we're
// within a magnet radius. Anchors are: the member's current value, and
// the range extremes (what the UI treats as "low" and "high" options).
// The pull gets stronger closer to the anchor so you feel a subtle
// detent without losing fine control.

function snapToAnchor(
  raw: number,
  anchors: number[],
  step: number,
): number {
  const radius = step * 3
  let best = raw
  let bestDist = Infinity
  for (const a of anchors) {
    const d = Math.abs(a - raw)
    if (d < radius && d < bestDist) {
      best = a
      bestDist = d
    }
  }
  // Soft snap: if we found an anchor, nudge 50% of the way in.
  if (best !== raw) {
    const pull = (best - raw) * 0.5
    return raw + pull
  }
  return raw
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

// ─── Rotary knob ───────────────────────────────────────────────────
//
// An arc-based control. Drag the thumb around a 270° arc (-135° to +135°
// from straight up). Feels like a synth knob or a physical dial rather
// than a linear slider — especially suited to bedtime which is inherently
// cyclic.

interface RotaryKnobProps {
  value: number
  min: number
  max: number
  step: number
  label: string
  format: (v: number) => string
  onChange: (v: number) => void
  anchors?: number[]
  size?: number
  accent?: string
}

function RotaryKnob({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  anchors = [],
  size = 100,
  accent = '#0891b2',
}: RotaryKnobProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))
  // Arc spans from -135° to +135° (270° total), centered at top (0° = up).
  const angleFromFrac = (f: number) => -135 + f * 270
  const angleDeg = angleFromFrac(valueFrac)
  const angleRad = (angleDeg * Math.PI) / 180

  const r = size / 2 - 10
  const cx = size / 2
  const cy = size / 2

  const thumbX = cx + r * Math.sin(angleRad)
  const thumbY = cy - r * Math.cos(angleRad)

  // Background arc path
  const arcFrom = { x: cx + r * Math.sin((-135 * Math.PI) / 180), y: cy - r * Math.cos((-135 * Math.PI) / 180) }
  const arcTo = { x: cx + r * Math.sin((135 * Math.PI) / 180), y: cy - r * Math.cos((135 * Math.PI) / 180) }
  const bgArc = `M ${arcFrom.x} ${arcFrom.y} A ${r} ${r} 0 1 1 ${arcTo.x} ${arcTo.y}`

  // Filled portion (from -135° to current angle)
  const filledArc = `M ${arcFrom.x} ${arcFrom.y} A ${r} ${r} 0 ${
    angleDeg - -135 > 180 ? 1 : 0
  } 1 ${thumbX} ${thumbY}`

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const localX = e.clientX - rect.left - size / 2
      const localY = e.clientY - rect.top - size / 2
      // Angle 0 = pointing up. atan2(x, -y) gives us that frame.
      let deg = (Math.atan2(localX, -localY) * 180) / Math.PI
      // Clamp to arc
      deg = Math.max(-135, Math.min(135, deg))
      const frac = (deg + 135) / 270
      let raw = min + frac * range
      if (anchors.length) raw = snapToAnchor(raw, anchors, step)
      // Quantize
      const quantized = Math.round(raw / step) * step
      const clamped = Math.max(min, Math.min(max, quantized))
      onChange(clamped)
    },
    [anchors, max, min, onChange, range, size, step],
  )

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="touch-none select-none"
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => {
          if (dragging) handlePointer(e)
        }}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {/* Background arc */}
        <path d={bgArc} stroke="#e2e8f0" strokeWidth={8} fill="none" strokeLinecap="round" />
        {/* Filled portion */}
        <path d={filledArc} stroke={accent} strokeWidth={8} fill="none" strokeLinecap="round" />
        {/* Anchor ticks */}
        {anchors.map((a) => {
          const f = Math.max(0, Math.min(1, (a - min) / range))
          const ang = (angleFromFrac(f) * Math.PI) / 180
          const rInner = r - 10
          const rOuter = r + 4
          return (
            <line
              key={a}
              x1={cx + rInner * Math.sin(ang)}
              y1={cy - rInner * Math.cos(ang)}
              x2={cx + rOuter * Math.sin(ang)}
              y2={cy - rOuter * Math.cos(ang)}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          )
        })}
        {/* Thumb */}
        <circle cx={thumbX} cy={thumbY} r={7} fill="#ffffff" stroke={accent} strokeWidth={3} />
        {/* Center readout */}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={size / 7}
          fontWeight={600}
          fill="#334155"
          className="tabular-nums select-none pointer-events-none"
        >
          {format(value)}
        </text>
      </svg>
      <div className="text-[11px] font-semibold text-slate-600 mt-1">{label}</div>
    </div>
  )
}

// ─── Magnetic intervention slider ──────────────────────────────────

interface MagneticSliderProps {
  node: ManipulableNode
  current: number
  value: number
  range: { min: number; max: number }
  onChange: (v: number) => void
}

function MagneticSlider({ node, current, value, range, onChange }: MagneticSliderProps) {
  const anchors = useMemo(
    () => [current, range.min, range.max],
    [current, range.min, range.max],
  )
  const handle = (raw: number) => {
    const snapped = snapToAnchor(raw, anchors, node.step)
    const quantized = Math.round(snapped / node.step) * node.step
    onChange(Math.max(range.min, Math.min(range.max, quantized)))
  }
  const changed = Math.abs(value - current) > 1e-9
  return (
    <div
      className={cn(
        'rounded-md p-2 border transition-colors',
        changed ? 'bg-primary-50/40 border-primary-100' : 'bg-slate-50 border-slate-100',
      )}
    >
      <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
        <div className="text-[11px] font-semibold text-slate-700 truncate">{node.label}</div>
        <div className="text-right flex-shrink-0">
          <span className="text-[10px] text-slate-400">{formatNodeValue(current, node)}→</span>
          <span className="text-[11px] font-medium text-slate-800 tabular-nums ml-0.5">
            {formatNodeValue(value, node)}
          </span>
        </div>
      </div>
      <div className="relative">
        <Slider
          min={range.min}
          max={range.max}
          step={node.step}
          value={value}
          onChange={handle}
        />
        {/* Anchor pips */}
        <div className="absolute inset-x-0 -top-0.5 pointer-events-none">
          {anchors.map((a, i) => {
            const frac = (a - range.min) / (range.max - range.min)
            return (
              <span
                key={i}
                className="absolute top-1 w-0.5 h-2 bg-slate-400/60 rounded-full"
                style={{ left: `${frac * 100}%`, transform: 'translateX(-50%)' }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Scrubbable outcome row ────────────────────────────────────────

interface ScrubEffectRowProps {
  effect: NodeEffect
  atDays: number
  mcEffect?: MCNodeEffect | null
  onScrubAtDays: (days: number) => void
}

function ScrubEffectRow({ effect, atDays, mcEffect, onScrubAtDays }: ScrubEffectRowProps) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30
  const fraction = cumulativeEffectFraction(atDays, horizonDays)
  const timedEffect = effect.totalEffect * fraction

  const tone = toneForEffect(timedEffect, meta?.beneficial ?? 'higher')
  const Icon = timedEffect > 0 ? TrendingUp : TrendingDown
  const toneColor =
    tone === 'benefit' ? 'text-emerald-600' : tone === 'harm' ? 'text-rose-600' : 'text-slate-500'
  const toneIcon =
    tone === 'benefit' ? 'text-emerald-500' : tone === 'harm' ? 'text-rose-500' : 'text-slate-400'

  const showBand = mcEffect?.hasBartAncestor === true
  const asymDeltaP05 = mcEffect ? mcEffect.posteriorSummary.p05 - mcEffect.factualValue : 0
  const asymDeltaP50 = mcEffect ? mcEffect.posteriorSummary.p50 - mcEffect.factualValue : 0
  const asymDeltaP95 = mcEffect ? mcEffect.posteriorSummary.p95 - mcEffect.factualValue : 0

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-slate-50 transition-colors">
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400">
          drag curve → scrubs horizon
        </div>
      </div>
      <div className="flex-shrink-0">
        <DecayCurve
          horizonDays={horizonDays}
          atDays={atDays}
          tone={tone}
          widthPx={120}
          heightPx={32}
          onScrub={onScrubAtDays}
        />
      </div>
      <div className="text-right flex-shrink-0 w-24">
        <div className={cn('text-sm font-semibold tabular-nums', toneColor)}>
          {formatEffectDelta(timedEffect, effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400">
          {Math.round(fraction * 100)}% realised
        </div>
        {showBand && (
          <PosteriorBand
            deltaP05={asymDeltaP05 * fraction}
            deltaP50={asymDeltaP50 * fraction}
            deltaP95={asymDeltaP95 * fraction}
            tone={tone}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinViewDirect() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()
  const { status: bartStatus, runMC, coverage } = useBartTwin()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [atDays, setAtDays] = useState(30)

  useEffect(() => {
    setState(null)
    setMcState(null)
  }, [proposedValues])

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', atDays)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current }
    })
  }, [participant, atDays])

  const bedtimeRow = useMemo(
    () => interventionRows.find((r) => r.node.id === 'bedtime') ?? null,
    [interventionRows],
  )
  const nonBedtimeRows = useMemo(
    () => interventionRows.filter((r) => r.node.id !== 'bedtime'),
    [interventionRows],
  )

  const deltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    for (const { node, current } of interventionRows) {
      const effective = proposedValues[node.id] ?? current
      if (Math.abs(effective - current) > 1e-9) {
        out.push({ nodeId: node.id, value: effective, originalValue: current })
      }
    }
    return out
  }, [interventionRows, proposedValues])

  const handleRun = useCallback(() => {
    if (!participant || deltas.length === 0) return
    setIsRunning(true)
    const credibleOverrides = filterCredibleLevers({}, 'stateOverride', atDays)
    const observedValues = buildObservedValues(participant, credibleOverrides)
    try {
      const result = runFullCounterfactual(observedValues, deltas)
      setState(result)
    } finally {
      setIsRunning(false)
    }
    if (bartStatus === 'ready') {
      runMC(observedValues, deltas)
        .then((mc) => {
          if (mc) setMcState(mc)
        })
        .catch((err) => console.warn('[TwinViewDirect] MC run failed:', err))
    }
  }, [participant, deltas, atDays, runFullCounterfactual, bartStatus, runMC])

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
      return ha - hb
    })
  }, [state, atDays])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Direct">
        <Card>
          <div className="p-8 text-center">
            <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Pick a member to open their twin.</p>
          </div>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading || !participant) {
    return (
      <PageLayout title="Twin · Direct">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const bedtimeCurrent = bedtimeRow ? bedtimeRow.current : 22.5
  const bedtimeValue = proposedValues.bedtime ?? bedtimeCurrent

  return (
    <PageLayout
      title="Twin · Direct manipulation"
      subtitle="Rotary knob, magnetic snap, scrubbable sparklines — set the horizon by dragging any outcome curve."
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
        <div className="flex items-center gap-3">
          <MemberAvatar persona={persona} displayName={displayName} size="md" />
          <div>
            <div className="text-sm font-semibold text-slate-800">{displayName}</div>
            <div className="text-xs text-slate-500">
              {cohort ? `Cohort ${cohort} · ` : ''}Direct-manipulation demo
            </div>
          </div>
        </div>

        <MethodBadge />
        <BartStatusBadge
          status={bartStatus}
          coverageCount={coverage.length}
          kSamples={mcState?.kSamples}
        />

        <Card>
          <div className="p-3 flex items-center gap-2 text-xs text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Showing projected state at{' '}
            <span className="font-semibold text-slate-800">{formatHorizonLong(atDays)}</span>
            <span className="text-slate-400 ml-auto">drag any outcome curve below to scrub the horizon</span>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3">
          <Card>
            <div className="p-3 space-y-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Daily interventions
              </div>

              {/* Rotary knob row for bedtime */}
              {bedtimeRow && (
                <div className="flex items-center gap-6 pb-3 border-b border-slate-100">
                  <RotaryKnob
                    value={bedtimeValue}
                    min={20}
                    max={28}
                    step={0.25}
                    label="Bedtime"
                    format={formatClock}
                    onChange={(v) => setProposedValues((p) => ({ ...p, bedtime: v }))}
                    anchors={[bedtimeCurrent, 21.5, 23.5]}
                    size={120}
                    accent="#7c3aed"
                  />
                  <div className="text-[11px] text-slate-500 max-w-sm leading-relaxed">
                    Drag the arc. Small pips mark <span className="font-medium">your current bedtime</span> plus
                    common anchors (9:30 PM, 11:30 PM) — the thumb pulls softly toward them.
                  </div>
                </div>
              )}

              {/* Magnetic sliders for the rest */}
              <div className="grid grid-cols-2 gap-2">
                {nonBedtimeRows.map(({ node, current }) => (
                  <MagneticSlider
                    key={node.id}
                    node={node}
                    current={current}
                    value={proposedValues[node.id] ?? current}
                    range={rangeFor(node, current)}
                    onChange={(v) => setProposedValues((p) => ({ ...p, [node.id]: v }))}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleRun}
                  disabled={isRunning || deltas.length === 0}
                  className="flex-1"
                >
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
                <button
                  onClick={() => setProposedValues({})}
                  disabled={deltas.length === 0}
                  className={cn(
                    'text-[11px] flex items-center gap-1 px-2 py-2 rounded border transition-colors',
                    deltas.length > 0
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-slate-300 border-slate-100 cursor-not-allowed',
                  )}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-2">
              {state ? (
                sortedEffects.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">
                    Nothing moves measurably at {formatHorizonShort(atDays)}. Scrub a curve further right.
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      At {formatHorizonShort(atDays)}
                    </div>
                    <div className="space-y-0.5">
                      {sortedEffects.map((effect) => (
                        <ScrubEffectRow
                          key={effect.nodeId}
                          effect={effect}
                          atDays={atDays}
                          mcEffect={mcState?.allEffects.get(effect.nodeId)}
                          onScrubAtDays={setAtDays}
                        />
                      ))}
                    </div>
                  </>
                )
              ) : (
                <div className="py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                  <Info className="w-6 h-6 text-slate-300" />
                  Dial in a change and run. Then drag any outcome's curve to scrub through time.
                </div>
              )}
            </div>
          </Card>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewDirect
