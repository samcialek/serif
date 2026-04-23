/**
 * Reusable causal-graph canvas.
 *
 * Headless in two ways:
 *   1. It doesn't own lever state — the parent passes `activeLever` +
 *      `onSetActiveLever`, which lets the parent decide whether the edge
 *      flow streams because of a knob being dragged, a hover, or an
 *      abduction sweep.
 *   2. It accepts `renderLeverOverlay` / `renderOutcomeOverlay` render-prop
 *      slots, so a fork can embed e.g. a fader directly on the node
 *      without forking this file.
 *
 * Edge flow runs `forward` (lever → outcome, for propagation) or `reverse`
 * (outcome → lever, for abduction storytelling).
 */

import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { MANIPULABLE_NODES } from './_shared'

// ─── Types ────────────────────────────────────────────────────────

export interface GraphEdge {
  from: string
  to: string
  strength: number
  sign: -1 | 0 | 1
}

export interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  kind: 'lever' | 'outcome'
}

interface ParticipantEffect {
  action: string
  outcome: string
  posterior?: { mean?: number | null } | null
}

/** Build nodes + edges from the participant's effects_bayesian list, filtered
 *  by the set of credible lever IDs the parent cares about. */
export function buildGraph(
  effects: ParticipantEffect[],
  credibleLevers: Set<string>,
  layout: GraphLayout,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const agg = new Map<string, { strength: number; sign: -1 | 0 | 1 }>()
  for (const e of effects) {
    if (!credibleLevers.has(e.action)) continue
    const outcomeKey = canonicalOutcomeKey(e.outcome)
    const k = `${e.action}|${outcomeKey}`
    const mean = e.posterior?.mean ?? 0
    const strength = Math.abs(mean)
    const sign: -1 | 0 | 1 = mean > 0 ? 1 : mean < 0 ? -1 : 0
    const prev = agg.get(k)
    if (!prev || strength > prev.strength) agg.set(k, { strength, sign })
  }

  const leverIds = Array.from(
    new Set(Array.from(agg.keys()).map((k) => k.split('|')[0])),
  ).sort()
  const outcomeIds = Array.from(
    new Set(Array.from(agg.keys()).map((k) => k.split('|')[1])),
  ).sort()

  const leverLabel = (id: string) =>
    MANIPULABLE_NODES.find((n) => n.id === id)?.label ?? friendlyName(id)
  const outcomeLabel = (id: string) => OUTCOME_META[id]?.noun ?? friendlyName(id)

  const nodes: GraphNode[] = []
  const leverSpan = layout.height - layout.topPad - layout.bottomPad
  leverIds.forEach((id, i) => {
    const y = layout.topPad + (leverSpan * (i + 0.5)) / leverIds.length
    nodes.push({ id, label: leverLabel(id), x: layout.leftX, y, kind: 'lever' })
  })
  outcomeIds.forEach((id, i) => {
    const y = layout.topPad + (leverSpan * (i + 0.5)) / outcomeIds.length
    nodes.push({ id, label: outcomeLabel(id), x: layout.rightX, y, kind: 'outcome' })
  })

  const edges: GraphEdge[] = []
  for (const [k, v] of agg.entries()) {
    const [from, to] = k.split('|')
    edges.push({ from, to, strength: v.strength, sign: v.sign })
  }
  return { nodes, edges }
}

// ─── Bezier math ──────────────────────────────────────────────────

function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax
  const c1x = ax + dx * 0.5
  const c2x = bx - dx * 0.5
  return `M${ax},${ay} C${c1x},${ay} ${c2x},${by} ${bx},${by}`
}

const COLORS = {
  benefit: '#059669',
  harm: '#e11d48',
  neutral: '#64748b',
  dim: '#cbd5e1',
}

// ─── Layout ──────────────────────────────────────────────────────

export interface GraphLayout {
  width: number
  height: number
  leftX: number
  rightX: number
  topPad: number
  bottomPad: number
}

export function defaultLayout(width: number, height: number): GraphLayout {
  return {
    width,
    height,
    leftX: Math.max(80, width * 0.16),
    rightX: Math.min(width - 80, width * 0.84),
    topPad: 40,
    bottomPad: 40,
  }
}

// ─── Canvas component ────────────────────────────────────────────

export interface LeverOverlaySlot {
  id: string
  x: number
  y: number
  label: string
}

export interface OutcomeOverlaySlot {
  id: string
  x: number
  y: number
  label: string
  delta: number
  deltaNorm: number
  tone: 'benefit' | 'harm' | 'neutral'
  /** Factual (pre-intervention) value at the chosen horizon. Present when
   *  the parent passed `outcomeStats`; undefined otherwise. */
  factual?: number
  /** Counterfactual (post-intervention) value at the chosen horizon. */
  after?: number
  /** Lower bound of the after value's posterior band (BART MC p10). When the
   *  BART bundle is loaded for this outcome, the canvas surfaces this so the
   *  overlay can render a "± uncertainty" pill alongside the point estimate. */
  afterLow?: number
  /** Upper bound of the after value's posterior band (BART MC p90). */
  afterHigh?: number
}

/** Per-outcome before/after/delta values, indexed by canonical outcome key.
 *  Optional `afterLow`/`afterHigh` carry the BART posterior band when MC is
 *  available; UI may render them as a ± uncertainty alongside the point
 *  estimate but solver decisions stay on the point estimate for tractability. */
export type OutcomeStateMap = Map<
  string,
  { factual: number; after: number; delta: number; afterLow?: number; afterHigh?: number }
>

interface CausalGraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  outcomeDeltas?: Map<string, number>
  /** Optional before/after/delta per outcome. When provided, the
   *  `OutcomeOverlaySlot.factual` / `after` fields are populated and the
   *  default outcome render shows the values inline next to the label. */
  outcomeStats?: OutcomeStateMap
  activeLever?: string | null
  goalOutcomeId?: string | null
  onLeverClick?: (id: string) => void
  onOutcomeClick?: (id: string) => void
  layout: GraphLayout
  className?: string
  showHeaders?: boolean
  leverPillHalfWidth?: number
  /** Horizontal inset from the outcome node where edges terminate. Defaults
   *  to leverPillHalfWidth (symmetric). Set smaller for wide lever cards
   *  with narrow outcome circles so edges visually land on the outcome. */
  outcomeAnchorInset?: number
  renderLeverOverlay?: (slot: LeverOverlaySlot) => ReactNode
  renderOutcomeOverlay?: (slot: OutcomeOverlaySlot) => ReactNode
  proposedLevers?: Set<string>
  /** Per-lever normalized delta in [0,1]. Edges from a moved lever get
   *  visibly thicker proportional to how far it's been moved from
   *  baseline. Independent of `activeLever`, which is a transient
   *  "just-touched" flag for triggering the electricity-flow pulse. */
  leverDeltas?: Map<string, number>
  /** How the parent wants downstream nodes to appear on goal-set. Defaults
   *  to 'dim-others' (goal mode from TwinViewGraph). 'none' disables it. */
  dimMode?: 'dim-others' | 'none'
}

export function CausalGraphCanvas({
  nodes,
  edges,
  outcomeDeltas,
  outcomeStats,
  activeLever,
  goalOutcomeId,
  onLeverClick,
  onOutcomeClick,
  layout,
  className,
  showHeaders = true,
  leverPillHalfWidth = 40,
  outcomeAnchorInset,
  renderLeverOverlay,
  renderOutcomeOverlay,
  proposedLevers,
  leverDeltas,
  dimMode = 'dim-others',
}: CausalGraphCanvasProps) {
  const rightInset = outcomeAnchorInset ?? leverPillHalfWidth
  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  const strengthNorm = useMemo(() => {
    const maxS = Math.max(1e-9, ...edges.map((e) => e.strength))
    return (s: number) => s / maxS
  }, [edges])

  const maxTimedAbs = useMemo(
    () => Math.max(1e-9, ...Array.from(outcomeDeltas?.values() ?? []).map(Math.abs)),
    [outcomeDeltas],
  )

  const reachableFromGoal = useMemo(() => {
    if (!goalOutcomeId || dimMode === 'none') return null
    const reachable = new Set<string>()
    reachable.add(goalOutcomeId)
    for (const e of edges) if (e.to === goalOutcomeId) reachable.add(e.from)
    return reachable
  }, [edges, goalOutcomeId, dimMode])

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={className ?? 'w-full h-auto'}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Plasma shared defs + keyframes */}
      <defs>
        <filter
          id="sf-soft-blur"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      <style>{`
        @keyframes sf-plasma-flow  { to { stroke-dashoffset: -30; } }
      `}</style>

      {/* Edges — plasma. Persistent thin lines at rest; source-lever delta
          thickens outgoing edges; activeLever triggers electricity flow. */}
      {edges.map((e, i) => {
        const a = nodeById.get(e.from)
        const b = nodeById.get(e.to)
        if (!a || !b) return null
        const ax = a.x + leverPillHalfWidth
        const ay = a.y
        const bx = b.x - rightInset
        const by = b.y
        const d = edgePath(ax, ay, bx, by)
        const dimmed =
          reachableFromGoal != null &&
          !(reachableFromGoal.has(e.from) && reachableFromGoal.has(e.to))
        const isActive = activeLever === e.from || goalOutcomeId === e.to
        const strength = strengthNorm(e.strength)
        const signColor =
          e.sign > 0 ? COLORS.benefit : e.sign < 0 ? COLORS.harm : COLORS.neutral
        const color = dimmed ? COLORS.dim : signColor
        const leverDelta = leverDeltas?.get(e.from) ?? 0
        const moved = leverDelta > 0.01
        const widthBoost = 1 + leverDelta * 2.2
        const baseW = (0.6 + strength * 1.4) * widthBoost
        const flowDur = Math.max(0.6, 1.6 - leverDelta * 0.8)
        return (
          <g key={`edge-${i}`} opacity={dimmed ? 0.2 : 1}>
            {moved && (
              <path
                d={d}
                stroke={color}
                strokeOpacity={0.18 + leverDelta * 0.25}
                strokeWidth={baseW * 4}
                fill="none"
                filter="url(#sf-soft-blur)"
              />
            )}
            <path
              d={d}
              stroke={color}
              strokeOpacity={0.32 + leverDelta * 0.4}
              strokeWidth={baseW}
              fill="none"
            />
            {isActive && (
              <path
                d={d}
                stroke={color}
                strokeOpacity={0.95}
                strokeWidth={Math.max(2, baseW * 1.3)}
                fill="none"
                strokeDasharray="6 24"
                strokeLinecap="round"
                style={{
                  animation: `sf-plasma-flow ${flowDur}s linear infinite`,
                  filter: `drop-shadow(0 0 6px ${color})`,
                }}
              />
            )}
          </g>
        )
      })}

      {/* Lever nodes */}
      {nodes
        .filter((n) => n.kind === 'lever')
        .map((n) => {
          const dimmed = reachableFromGoal != null && !reachableFromGoal.has(n.id)
          const active = activeLever === n.id
          const hasProposed = proposedLevers?.has(n.id)
          if (renderLeverOverlay) {
            // Parent renders the lever widget — only draw a halo hint.
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ opacity: dimmed ? 0.3 : 1 }}
                onClick={() => onLeverClick?.(n.id)}
              >
                {renderLeverOverlay({ id: n.id, x: n.x, y: n.y, label: n.label })}
              </g>
            )
          }
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onClick={() => onLeverClick?.(n.id)}
              style={{ cursor: onLeverClick ? 'pointer' : 'default' }}
            >
              <rect
                x={-leverPillHalfWidth}
                y={-14}
                width={leverPillHalfWidth * 2}
                height={28}
                rx={14}
                fill={active ? '#7c3aed' : hasProposed ? '#a855f7' : '#f1f5f9'}
                opacity={dimmed ? 0.15 : 1}
                stroke={active ? '#6d28d9' : '#cbd5e1'}
                strokeWidth={active ? 2 : 1}
              />
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={active || hasProposed ? '#ffffff' : '#475569'}
                opacity={dimmed ? 0.3 : 1}
                style={{ pointerEvents: 'none' }}
              >
                {n.label}
              </text>
            </g>
          )
        })}

      {/* Outcome nodes */}
      {nodes
        .filter((n) => n.kind === 'outcome')
        .map((n) => {
          const dimmed = reachableFromGoal != null && !reachableFromGoal.has(n.id)
          const delta = outcomeDeltas?.get(n.id) ?? 0
          const deltaNorm = Math.abs(delta) / maxTimedAbs
          const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0
          const meta = OUTCOME_META[n.id]
          const beneficial = meta?.beneficial ?? 'higher'
          const tone: 'benefit' | 'harm' | 'neutral' =
            beneficial === 'neutral' || sign === 0
              ? 'neutral'
              : (beneficial === 'higher' ? sign > 0 : sign < 0)
                ? 'benefit'
                : 'harm'
          const fill =
            tone === 'benefit' ? '#10b981' : tone === 'harm' ? '#f43f5e' : '#94a3b8'
          const isGoal = goalOutcomeId === n.id
          const baseR = 14
          const pulseR = baseR + deltaNorm * 12

          const stats = outcomeStats?.get(n.id)
          if (renderOutcomeOverlay) {
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ opacity: dimmed ? 0.3 : 1 }}
                onClick={() => onOutcomeClick?.(n.id)}
              >
                {renderOutcomeOverlay({
                  id: n.id,
                  x: n.x,
                  y: n.y,
                  label: n.label,
                  delta,
                  deltaNorm,
                  tone,
                  factual: stats?.factual,
                  after: stats?.after,
                  afterLow: stats?.afterLow,
                  afterHigh: stats?.afterHigh,
                })}
              </g>
            )
          }

          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onClick={() => onOutcomeClick?.(n.id)}
              style={{ cursor: onOutcomeClick ? 'pointer' : 'default' }}
            >
              {deltaNorm > 0.05 && (
                <circle r={pulseR} fill={fill} opacity={0.18 * deltaNorm} />
              )}
              <circle
                r={baseR}
                fill="#ffffff"
                stroke={isGoal ? '#059669' : dimmed ? '#e2e8f0' : fill}
                strokeWidth={isGoal ? 3 : 1.5}
                opacity={dimmed ? 0.4 : 1}
              />
              <text
                x={baseR + 8}
                y={4}
                textAnchor="start"
                fontSize={11}
                fontWeight={500}
                fill={dimmed ? '#94a3b8' : '#1e293b'}
                opacity={dimmed ? 0.6 : 1}
                style={{ pointerEvents: 'none' }}
              >
                {n.label}
              </text>
            </g>
          )
        })}

      {showHeaders && (
        <>
          <text
            x={layout.leftX}
            y={24}
            textAnchor="middle"
            fontSize={10}
            fontWeight={700}
            fill="#64748b"
            letterSpacing="0.05em"
          >
            LEVERS
          </text>
          <text
            x={layout.rightX}
            y={24}
            textAnchor="start"
            fontSize={10}
            fontWeight={700}
            fill="#64748b"
            letterSpacing="0.05em"
          >
            OUTCOMES
          </text>
        </>
      )}
    </svg>
  )
}

// ─── Helper: build outcomeDeltas from a counterfactual state ───────

import { cumulativeEffectFraction, horizonDaysFor } from '@/data/scm/outcomeHorizons'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import type { MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
import { applyOutcomeBound } from '@/data/scm/syntheticEdges'

export function outcomeDeltasAt(
  state: FullCounterfactualState | null,
  atDays: number,
  outcomeIdSet?: Set<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!state) return out
  for (const e of state.allEffects.values()) {
    const key = canonicalOutcomeKey(e.nodeId)
    if (outcomeIdSet && !outcomeIdSet.has(key)) continue
    const horizonDays = horizonDaysFor(key) ?? 30
    const fraction = cumulativeEffectFraction(atDays, horizonDays)
    const timed = e.totalEffect * fraction
    const prev = out.get(key) ?? 0
    if (Math.abs(timed) > Math.abs(prev)) out.set(key, timed)
  }
  return out
}

/** Like outcomeDeltasAt but returns the full {factual, after, delta} triple
 *  per outcome — needed when the UI wants to surface absolute pre/post values
 *  (e.g., the Twin view showing "42 → 51" alongside the colored Δ). The same
 *  horizon phase-in (cumulativeEffectFraction) is applied, so `after` is the
 *  factual value plus the timed effect, not the asymptotic counterfactual.
 *
 *  Both `factual` and `after` are clamped to physical bounds (e.g. SOL ≥ 0,
 *  SE ∈ [0, 100]); `delta` is then recomputed as `after − factual` so the
 *  rendered triple stays internally consistent.
 *
 *  Pass `baselineValues` to seed factual readings for outcomes that don't
 *  appear in `state.allEffects` — needed so the Twin view can display
 *  "current value, no change yet" before the user moves any lever. The
 *  baseline pair is `{factual, after: factual, delta: 0}`. */
export function outcomeStatesAt(
  state: FullCounterfactualState | null,
  atDays: number,
  outcomeIdSet?: Set<string>,
  baselineValues?: Record<string, number>,
): OutcomeStateMap {
  const out: OutcomeStateMap = new Map()

  if (baselineValues && outcomeIdSet) {
    for (const key of outcomeIdSet) {
      const v = baselineValues[key]
      if (typeof v === 'number' && Number.isFinite(v)) {
        const f = applyOutcomeBound(key, v)
        out.set(key, { factual: f, after: f, delta: 0 })
      }
    }
  }

  if (!state) return out
  for (const e of state.allEffects.values()) {
    const key = canonicalOutcomeKey(e.nodeId)
    if (outcomeIdSet && !outcomeIdSet.has(key)) continue
    const horizonDays = horizonDaysFor(key) ?? 30
    const fraction = cumulativeEffectFraction(atDays, horizonDays)
    const timed = e.totalEffect * fraction
    const prev = out.get(key)
    // Replace baseline (delta=0) or earlier weaker effect with this one.
    if (!prev || Math.abs(timed) > Math.abs(prev.delta)) {
      const factual = applyOutcomeBound(key, e.factualValue)
      const after = applyOutcomeBound(key, e.factualValue + timed)
      out.set(key, {
        factual,
        after,
        delta: after - factual,
      })
    }
  }
  return out
}

/** Merge MC posterior bands from a BART-backed MCFullCounterfactualState
 *  into an existing OutcomeStateMap. The point-estimate state stays the
 *  source of truth for `after` (so the solver and the rendered number
 *  agree); the MC state only contributes the `afterLow`/`afterHigh` band.
 *
 *  Bands are scaled by the same horizon fraction as the point estimate, so
 *  at short atDays the band is narrow (effect not yet accrued) and widens
 *  to the asymptotic posterior spread as atDays → horizon.
 *
 *  Outcomes without a BART surface or without enough downstream MC spread
 *  (collapsed to a single value) get no band — UI falls back to a plain
 *  point estimate. */
export function mergeBandsFromMC(
  base: OutcomeStateMap,
  mc: MCFullCounterfactualState | null,
  atDays: number,
  outcomeIdSet?: Set<string>,
): OutcomeStateMap {
  if (!mc) return base
  const out: OutcomeStateMap = new Map(base)
  for (const e of mc.allEffects.values()) {
    const key = canonicalOutcomeKey(e.nodeId)
    if (outcomeIdSet && !outcomeIdSet.has(key)) continue
    const baseEntry = out.get(key)
    if (!baseEntry) continue
    const samples = e.counterfactualSamples
    if (!samples || samples.length === 0) continue
    // Treat the band as flat across draws if all samples agree to within
    // a tiny epsilon — no MC spread reached this node, no band to show.
    const summary = e.posteriorSummary
    if (!summary) continue
    const spread = summary.p95 - summary.p05
    if (spread < 1e-6) continue
    // Scale the spread by the same horizon fraction we applied to the point
    // estimate's totalEffect — at atDays much less than the outcome's
    // horizon, only a fraction of the asymptotic uncertainty has accrued.
    const horizonDays = horizonDaysFor(key) ?? 30
    const fraction = cumulativeEffectFraction(atDays, horizonDays)
    // Center the timed band on the point-estimate `after` so the rendered
    // bracket reads "after ± timed_uncertainty" — symmetric, with the
    // posterior shape preserved via the (p05, p95) → ± spread mapping.
    const halfSpread = ((summary.p95 - summary.p05) / 2) * fraction
    const afterLow = applyOutcomeBound(key, baseEntry.after - halfSpread)
    const afterHigh = applyOutcomeBound(key, baseEntry.after + halfSpread)
    out.set(key, { ...baseEntry, afterLow, afterHigh })
  }
  return out
}
