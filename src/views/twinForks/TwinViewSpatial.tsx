/**
 * Fork H — Spatial 2D bubble map.
 *
 * Puts every outcome at a point: X = response time (τ), Y = current
 * timed delta relative to baseline, bubble size = |asymptotic| size
 * (what you'd get if you waited forever). The quadrant structure makes
 * it obvious where the "fast benefit" wins vs "slow cost" regrets live.
 *
 * As you drag levers, the bubbles migrate through the plane. As you
 * drag the horizon, each bubble slides vertically toward its
 * asymptotic endpoint.
 */

import { useMemo, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Loader2,
  RotateCcw,
  Users as UsersIcon,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import type { FullCounterfactualState, NodeEffect } from '@/data/scm/fullCounterfactual'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import {
  cumulativeEffectFraction,
  horizonDaysFor,
  isOutcomeCredibleAt,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue } from '@/utils/rounding'
import { leversAvailableAt } from '@/data/scm/leverCredibility'
import {
  MANIPULABLE_NODES,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  buildObservedValues,
  MethodBadge,
  toneForEffect,
  HORIZON_TICKS,
  TICK_POSITIONS,
  daysToPosition,
  positionToDays,
} from './_shared'

const CANVAS_W = 820
const CANVAS_H = 420
const PAD_L = 56
const PAD_R = 24
const PAD_T = 32
const PAD_B = 44
const PLOT_W = CANVAS_W - PAD_L - PAD_R
const PLOT_H = CANVAS_H - PAD_T - PAD_B

// X-axis: response time in days, log-ish via HORIZON_TICKS positions.
function xForDays(days: number): number {
  return PAD_L + (daysToPosition(days) / 1000) * PLOT_W
}

interface BubbleSpec {
  nodeId: string
  label: string
  timed: number // current timed delta (signed)
  asymp: number // asymptotic totalEffect (signed)
  tau: number // horizon days
  tone: 'benefit' | 'harm' | 'neutral'
  fractionRealised: number
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

// ─── Spatial canvas ────────────────────────────────────────────────

interface SpatialCanvasProps {
  bubbles: BubbleSpec[]
  atDays: number
  hoveredId: string | null
  onHover: (id: string | null) => void
}

function SpatialCanvas({ bubbles, atDays, hoveredId, onHover }: SpatialCanvasProps) {
  // Normalize Y to a shared [-1, 1] using the max abs magnitude of both
  // timed and asymptotic deltas across all bubbles. Plot timed value
  // within that window so the zero line is meaningful.
  const yScale = useMemo(() => {
    let maxAbs = 1
    for (const b of bubbles) {
      maxAbs = Math.max(maxAbs, Math.abs(b.timed), Math.abs(b.asymp))
    }
    return maxAbs
  }, [bubbles])

  const yForVal = (v: number) =>
    PAD_T + (1 - (v / yScale + 1) / 2) * PLOT_H

  const sizeForAsymp = (v: number) => {
    const maxR = 26
    const minR = 5
    return Math.max(minR, Math.min(maxR, Math.sqrt(Math.abs(v) / (yScale || 1)) * 22 + 4))
  }

  const playheadX = xForDays(atDays)

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="select-none"
      style={{ maxWidth: '100%' }}
    >
      {/* Axes background */}
      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="#f8fafc" rx={6} />

      {/* Zero line */}
      <line
        x1={PAD_L}
        y1={yForVal(0)}
        x2={PAD_L + PLOT_W}
        y2={yForVal(0)}
        stroke="#94a3b8"
        strokeDasharray="3 3"
        strokeWidth={1}
      />

      {/* X ticks */}
      {HORIZON_TICKS.map((t, i) => {
        const tx = PAD_L + (TICK_POSITIONS[i] / 1000) * PLOT_W
        return (
          <g key={t.days}>
            <line x1={tx} y1={PAD_T + PLOT_H} x2={tx} y2={PAD_T + PLOT_H + 4} stroke="#94a3b8" />
            <text
              x={tx}
              y={PAD_T + PLOT_H + 18}
              textAnchor="middle"
              fontSize={10}
              fill="#64748b"
            >
              {t.label}
            </text>
          </g>
        )
      })}
      <text
        x={PAD_L + PLOT_W / 2}
        y={CANVAS_H - 6}
        textAnchor="middle"
        fontSize={10}
        fill="#475569"
        fontWeight={600}
      >
        Response time (τ)
      </text>

      {/* Y axis label */}
      <text
        x={PAD_L - 8}
        y={PAD_T + PLOT_H / 2}
        textAnchor="middle"
        fontSize={10}
        fill="#475569"
        fontWeight={600}
        transform={`rotate(-90, ${PAD_L - 8}, ${PAD_T + PLOT_H / 2})`}
      >
        Timed Δ (at horizon)
      </text>
      <text x={PAD_L - 6} y={yForVal(yScale) + 4} textAnchor="end" fontSize={9} fill="#64748b">
        benefit
      </text>
      <text x={PAD_L - 6} y={yForVal(-yScale) + 4} textAnchor="end" fontSize={9} fill="#64748b">
        harm
      </text>

      {/* Quadrant labels */}
      <text
        x={PAD_L + 8}
        y={PAD_T + 14}
        fontSize={9}
        fill="#059669"
        fontWeight={500}
        opacity={0.7}
      >
        fast benefits
      </text>
      <text
        x={PAD_L + PLOT_W - 8}
        y={PAD_T + 14}
        fontSize={9}
        fill="#059669"
        fontWeight={500}
        textAnchor="end"
        opacity={0.7}
      >
        slow benefits
      </text>
      <text
        x={PAD_L + 8}
        y={PAD_T + PLOT_H - 6}
        fontSize={9}
        fill="#e11d48"
        fontWeight={500}
        opacity={0.7}
      >
        fast costs
      </text>
      <text
        x={PAD_L + PLOT_W - 8}
        y={PAD_T + PLOT_H - 6}
        fontSize={9}
        fill="#e11d48"
        fontWeight={500}
        textAnchor="end"
        opacity={0.7}
      >
        slow costs
      </text>

      {/* Horizon playhead */}
      <line
        x1={playheadX}
        y1={PAD_T}
        x2={playheadX}
        y2={PAD_T + PLOT_H}
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.85}
      />
      <text
        x={playheadX}
        y={PAD_T - 6}
        fontSize={10}
        fill="#6366f1"
        textAnchor="middle"
        fontWeight={600}
      >
        now ({formatHorizonShort(atDays)})
      </text>

      {/* Bubbles: asymptotic rings (where it'll end up) + timed dot (now) */}
      {bubbles.map((b) => {
        const x = xForDays(b.tau)
        const yNow = yForVal(b.timed)
        const yAsymp = yForVal(b.asymp)
        const r = sizeForAsymp(b.asymp)
        const colorStroke =
          b.tone === 'benefit' ? '#059669' : b.tone === 'harm' ? '#e11d48' : '#64748b'
        const colorFill =
          b.tone === 'benefit' ? '#a7f3d0' : b.tone === 'harm' ? '#fecaca' : '#cbd5e1'
        const hovered = hoveredId === b.nodeId
        return (
          <g key={b.nodeId} style={{ cursor: 'pointer' }}>
            {/* Dashed ring = asymptote */}
            <circle
              cx={x}
              cy={yAsymp}
              r={r}
              fill="none"
              stroke={colorStroke}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.45}
            />
            {/* Trail from asymptote to "now" */}
            <line
              x1={x}
              y1={yAsymp}
              x2={x}
              y2={yNow}
              stroke={colorStroke}
              strokeWidth={1.5}
              strokeDasharray="2 2"
              opacity={0.5}
            />
            {/* Timed dot = where we are right now */}
            <motion.circle
              cx={x}
              cy={yNow}
              r={r * (0.35 + b.fractionRealised * 0.65)}
              fill={colorFill}
              stroke={colorStroke}
              strokeWidth={hovered ? 2.5 : 1.5}
              opacity={hovered ? 1 : 0.85}
              onPointerEnter={() => onHover(b.nodeId)}
              onPointerLeave={() => onHover(null)}
              animate={{
                cx: x,
                cy: yNow,
              }}
              transition={{ type: 'spring', stiffness: 180, damping: 22 }}
            />
            {hovered && (
              <>
                <rect
                  x={x + r + 6}
                  y={yNow - 20}
                  width={150}
                  height={36}
                  rx={4}
                  fill="white"
                  stroke="#cbd5e1"
                />
                <text x={x + r + 12} y={yNow - 6} fontSize={11} fontWeight={600} fill="#0f172a">
                  {b.label}
                </text>
                <text x={x + r + 12} y={yNow + 8} fontSize={10} fill={colorStroke}>
                  now: {formatEffectDelta(b.timed, b.nodeId)} · τ {b.tau}d
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinViewSpatial() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [atDays, setAtDays] = useState(30)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', atDays)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current }
    })
  }, [participant, atDays])

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

  useEffect(() => {
    if (!participant || deltas.length === 0) {
      setState(null)
      return
    }
    const observedValues = buildObservedValues(participant)
    try {
      setState(runFullCounterfactual(observedValues, deltas))
    } catch (err) {
      console.warn('[TwinViewSpatial] counterfactual failed:', err)
    }
  }, [participant, deltas, atDays, runFullCounterfactual])

  const bubbles = useMemo((): BubbleSpec[] => {
    if (!state) return []
    const seen = new Set<string>()
    const out: BubbleSpec[] = []
    for (const e of state.allEffects.values() as IterableIterator<NodeEffect>) {
      if (Math.abs(e.totalEffect) <= 1e-6) continue
      if (seen.has(e.nodeId)) continue
      if (!isOutcomeCredibleAt(canonicalOutcomeKey(e.nodeId), atDays)) continue
      seen.add(e.nodeId)
      const key = canonicalOutcomeKey(e.nodeId)
      const meta = OUTCOME_META[key]
      const tau = horizonDaysFor(key) ?? 30
      const fraction = cumulativeEffectFraction(atDays, tau)
      const timed = e.totalEffect * fraction
      const tone = toneForEffect(timed, meta?.beneficial ?? 'higher')
      out.push({
        nodeId: e.nodeId,
        label: meta?.noun ?? friendlyName(e.nodeId),
        timed,
        asymp: e.totalEffect,
        tau,
        tone,
        fractionRealised: fraction,
      })
    }
    return out
  }, [state, atDays])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Spatial">
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
      <PageLayout title="Twin · Spatial">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const hasChange = deltas.length > 0

  return (
    <PageLayout
      title="Twin · Spatial"
      subtitle="Every outcome as a bubble. X = response time, Y = current delta, size = asymptote. Quadrants reveal the shape of your plan."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Spatial 2D map demo
            </div>
          </div>
        </div>

        <MethodBadge />

        <Card>
          <div className="p-3">
            {hasChange && bubbles.length > 0 ? (
              <SpatialCanvas
                bubbles={bubbles}
                atDays={atDays}
                hoveredId={hoveredId}
                onHover={setHoveredId}
              />
            ) : (
              <div className="py-16 text-center text-sm text-slate-400">
                Pull a lever below. Every outcome will appear as a bubble — filled dot is where
                you are now, dashed ring is where the effect eventually settles.
              </div>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Card>
            <div className="p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Horizon — drag to slide bubbles toward their asymptotes
                </div>
                <div className="text-[11px] font-semibold text-slate-700 tabular-nums">
                  {formatHorizonShort(atDays)}
                </div>
              </div>
              <div className="relative">
                <Slider
                  min={0}
                  max={1000}
                  step={1}
                  value={daysToPosition(atDays)}
                  onChange={(p) => setAtDays(positionToDays(p))}
                />
                <div className="absolute inset-x-0 -top-0.5 pointer-events-none">
                  {TICK_POSITIONS.map((p, i) => (
                    <span
                      key={i}
                      className="absolute top-1 w-0.5 h-2 bg-slate-300 rounded-full"
                      style={{
                        left: `${(p / 1000) * 100}%`,
                        transform: 'translateX(-50%)',
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="relative h-3 text-[10px] text-slate-400">
                {HORIZON_TICKS.map((t, i) => (
                  <span
                    key={t.days}
                    className="absolute"
                    style={{
                      left: `${(TICK_POSITIONS[i] / 1000) * 100}%`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Levers — {interventionRows.length} credible at {formatHorizonShort(atDays)}
                </div>
                <button
                  onClick={() => setProposedValues({})}
                  disabled={!hasChange}
                  className={cn(
                    'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
                    hasChange
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-slate-300 border-slate-100 cursor-not-allowed',
                  )}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {interventionRows.map(({ node, current }) => {
                  const range = rangeFor(node, current)
                  const value = proposedValues[node.id] ?? current
                  const changed = Math.abs(value - current) > 1e-9
                  return (
                    <div
                      key={node.id}
                      className={cn(
                        'rounded-md p-1.5 border',
                        changed
                          ? 'bg-primary-50/40 border-primary-100'
                          : 'bg-slate-50 border-slate-100',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-1 mb-1">
                        <div className="text-[10px] font-semibold text-slate-700 truncate">
                          {node.label}
                        </div>
                        <div className="text-[10px] tabular-nums text-slate-700">
                          {formatNodeValue(value, node)}
                        </div>
                      </div>
                      <Slider
                        min={range.min}
                        max={range.max}
                        step={node.step}
                        value={value}
                        onChange={(v) => {
                          const q = Math.round(v / node.step) * node.step
                          setProposedValues((p) => ({
                            ...p,
                            [node.id]: Math.max(range.min, Math.min(range.max, q)),
                          }))
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewSpatial
