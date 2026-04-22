/**
 * Reusable causal-graph canvas.
 *
 * Extracted from TwinViewGraph so Deck/LivingGraph/Workspace can all share
 * the same particle-flow DAG rendering. The canvas is headless in two ways:
 *   1. It doesn't own lever state — the parent passes `activeLever` +
 *      `onSetActiveLever`, which lets the parent decide whether particles
 *      stream because of a knob being dragged, a hover, or an abduction
 *      sweep.
 *   2. It accepts `renderLeverOverlay` / `renderOutcomeOverlay` render-prop
 *      slots, so a fork can embed e.g. a fader directly on the node (for
 *      LivingGraph) without forking this file.
 *
 * Particles can flow `forward` (lever → outcome, for propagation) or
 * `reverse` (outcome → lever, for abduction storytelling).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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

function bezierAt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
): { x: number; y: number } {
  const dx = bx - ax
  const c1x = ax + dx * 0.5
  const c2x = bx - dx * 0.5
  const u = 1 - t
  const x = u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx
  const y = u * u * u * ay + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * by
  return { x, y }
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

// ─── Particle engine ─────────────────────────────────────────────

interface Particle {
  id: number
  edgeIdx: number
  t: number
  speed: number
  color: string
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
}

/** How edges visualize energy flow. Each style trades off fidelity, density,
 *  and perf.
 *   - 'particles' (classic): discrete dots traveling along bezier.
 *   - 'circuit': layered glow + bright dashed overlay flowing via
 *     stroke-dashoffset CSS anim (fast, tech).
 *   - 'plasma': smooth translating gradient pulse (slow, organic).
 *   - 'lightning': mostly quiet base with random bright strike flashes. */
export type EdgeStyle = 'particles' | 'circuit' | 'plasma' | 'lightning'

interface CausalGraphCanvasProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  outcomeDeltas?: Map<string, number>
  activeLever?: string | null
  goalOutcomeId?: string | null
  onLeverClick?: (id: string) => void
  onOutcomeClick?: (id: string) => void
  particleDirection?: 'forward' | 'reverse'
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
  /** How the parent wants downstream nodes to appear on goal-set. Defaults
   *  to 'dim-others' (goal mode from TwinViewGraph). 'none' disables it. */
  dimMode?: 'dim-others' | 'none'
  /** How edges render energy flow. Defaults to 'particles' (classic). */
  edgeStyle?: EdgeStyle
}

export function CausalGraphCanvas({
  nodes,
  edges,
  outcomeDeltas,
  activeLever,
  goalOutcomeId,
  onLeverClick,
  onOutcomeClick,
  particleDirection = 'forward',
  layout,
  className,
  showHeaders = true,
  leverPillHalfWidth = 40,
  outcomeAnchorInset,
  renderLeverOverlay,
  renderOutcomeOverlay,
  proposedLevers,
  dimMode = 'dim-others',
  edgeStyle = 'particles',
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

  // ─── Particle engine (only used when edgeStyle === 'particles') ──

  const particlesRef = useRef<Particle[]>([])
  const [, forceRender] = useState(0)
  const lastSpawnRef = useRef(0)
  const nextIdRef = useRef(0)

  useEffect(() => {
    if (edgeStyle !== 'particles') return
    let rafId = 0
    let lastT = performance.now()
    const loop = (now: number) => {
      const dt = (now - lastT) / 1000
      lastT = now

      const live: Particle[] = []
      for (const p of particlesRef.current) {
        const nt = p.t + p.speed * dt
        if (nt < 1) live.push({ ...p, t: nt })
      }
      particlesRef.current = live

      // Spawn spec:
      //   forward + activeLever: spawn on outbound edges from that lever.
      //   reverse + goalOutcomeId: spawn on inbound edges to that outcome,
      //     drawn in reverse (t is flipped in the render step).
      if (particleDirection === 'forward' && activeLever) {
        const spawnInterval = 150
        if (now - lastSpawnRef.current > spawnInterval) {
          lastSpawnRef.current = now
          edges.forEach((edge, edgeIdx) => {
            if (edge.from !== activeLever) return
            const color =
              edge.sign > 0 ? COLORS.benefit : edge.sign < 0 ? COLORS.harm : COLORS.neutral
            particlesRef.current.push({
              id: nextIdRef.current++,
              edgeIdx,
              t: 0,
              speed: 0.25 + strengthNorm(edge.strength) * 0.55,
              color,
            })
          })
        }
      } else if (particleDirection === 'reverse' && goalOutcomeId) {
        const spawnInterval = 180
        if (now - lastSpawnRef.current > spawnInterval) {
          lastSpawnRef.current = now
          edges.forEach((edge, edgeIdx) => {
            if (edge.to !== goalOutcomeId) return
            const color = '#a855f7'
            particlesRef.current.push({
              id: nextIdRef.current++,
              edgeIdx,
              t: 0,
              speed: 0.35 + strengthNorm(edge.strength) * 0.4,
              color,
            })
          })
        }
      }

      forceRender((x) => (x + 1) % 1000000)
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [edgeStyle, activeLever, goalOutcomeId, particleDirection, edges, strengthNorm])

  // ─── Lightning strike trigger (edgeStyle === 'lightning') ────────
  // Every ~700ms, pick 2-4 random edges to "strike" — flash bright for
  // 180ms. Active lever's edges are favored so interaction feels causal.

  const [strikingEdges, setStrikingEdges] = useState<Set<number>>(new Set())
  useEffect(() => {
    if (edgeStyle !== 'lightning' || edges.length === 0) {
      setStrikingEdges(new Set())
      return
    }
    let flashTimeout: number | null = null
    const fire = () => {
      const count = Math.min(edges.length, 2 + Math.floor(Math.random() * 3))
      const ids = new Set<number>()
      // 50% of picks prefer edges from the active lever / to the goal outcome.
      const preferred: number[] = []
      if (activeLever || goalOutcomeId) {
        edges.forEach((e, idx) => {
          if (e.from === activeLever || e.to === goalOutcomeId) preferred.push(idx)
        })
      }
      while (ids.size < count) {
        if (preferred.length > 0 && Math.random() < 0.5) {
          ids.add(preferred[Math.floor(Math.random() * preferred.length)])
        } else {
          ids.add(Math.floor(Math.random() * edges.length))
        }
      }
      setStrikingEdges(ids)
      flashTimeout = window.setTimeout(() => setStrikingEdges(new Set()), 180)
    }
    const interval = window.setInterval(fire, 700)
    return () => {
      window.clearInterval(interval)
      if (flashTimeout) window.clearTimeout(flashTimeout)
    }
  }, [edgeStyle, edges, activeLever, goalOutcomeId])

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className={className ?? 'w-full h-auto'}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Shared defs + keyframes. Referenced by non-'particles' styles. */}
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
        <filter
          id="sf-lightning-disp"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            seed="3"
          />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </defs>
      <style>{`
        @keyframes sf-circuit-flow { to { stroke-dashoffset: -13; } }
        @keyframes sf-plasma-flow  { to { stroke-dashoffset: -36; } }
        @keyframes sf-plasma-surge { to { stroke-dashoffset: -18; } }
        @keyframes sf-surge-fade-in {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes sf-strike-pulse {
          0%   { opacity: 0.2; }
          20%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Edges — branched on edgeStyle */}
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
        const w = 0.5 + strength * 3
        const signColor =
          e.sign > 0 ? COLORS.benefit : e.sign < 0 ? COLORS.harm : COLORS.neutral
        const color = dimmed ? COLORS.dim : signColor

        if (edgeStyle === 'particles') {
          return (
            <path
              key={`edge-${i}`}
              d={d}
              stroke={color}
              strokeOpacity={dimmed ? 0.12 : isActive ? 0.75 : 0.35}
              strokeWidth={w}
              fill="none"
            />
          )
        }

        if (edgeStyle === 'circuit') {
          const dur = Math.max(0.5, 2 - strength * 1.2)
          return (
            <g key={`edge-${i}`} opacity={dimmed ? 0.2 : 1}>
              {/* Outer soft glow */}
              <path
                d={d}
                stroke={color}
                strokeOpacity={0.22}
                strokeWidth={w * 3.5}
                fill="none"
                filter="url(#sf-soft-blur)"
              />
              {/* Solid middle */}
              <path
                d={d}
                stroke={color}
                strokeOpacity={0.5}
                strokeWidth={w}
                fill="none"
              />
              {/* Bright dashed flowing overlay */}
              <path
                d={d}
                stroke="#ffffff"
                strokeOpacity={isActive ? 1 : 0.85}
                strokeWidth={Math.max(1, w * 0.6)}
                fill="none"
                strokeDasharray="3 10"
                style={{ animation: `sf-circuit-flow ${dur}s linear infinite` }}
              />
            </g>
          )
        }

        if (edgeStyle === 'plasma') {
          const dur = Math.max(1.2, 3 - strength * 1.5)
          // Active surge — fast dense bright pulses on edges out of the
          // dragged lever (or into the goal outcome). Gives "energy just
          // surged through this edge because you touched something"
          // without abandoning the ambient breathing flow on the others.
          const surgeDur = Math.max(0.55, 1.3 - strength * 0.7)
          return (
            <g key={`edge-${i}`} opacity={dimmed ? 0.2 : 1}>
              {/* Wide diffuse glow */}
              <path
                d={d}
                stroke={color}
                strokeOpacity={isActive ? 0.35 : 0.2}
                strokeWidth={w * 4.5}
                fill="none"
                filter="url(#sf-soft-blur)"
              />
              {/* Solid base */}
              <path
                d={d}
                stroke={color}
                strokeOpacity={isActive ? 0.55 : 0.35}
                strokeWidth={w * 1.3}
                fill="none"
              />
              {/* Ambient sparse pulses (always running, reads as "alive") */}
              <path
                d={d}
                stroke={color}
                strokeOpacity={isActive ? 0.75 : 0.9}
                strokeWidth={Math.max(2, w * 1.4)}
                fill="none"
                strokeDasharray="2 34"
                strokeLinecap="round"
                style={{
                  animation: `sf-plasma-flow ${dur}s linear infinite`,
                  filter: `drop-shadow(0 0 4px ${color})`,
                }}
              />
              {/* Surge: dense + fast bright pulse train, active only. */}
              {isActive && (
                <path
                  d={d}
                  stroke="#ffffff"
                  strokeOpacity={1}
                  strokeWidth={Math.max(2.4, w * 1.55)}
                  fill="none"
                  strokeDasharray="4 14"
                  strokeLinecap="round"
                  style={{
                    animation: `sf-plasma-surge ${surgeDur}s linear infinite, sf-surge-fade-in 140ms ease-out both`,
                    filter: `drop-shadow(0 0 7px ${color}) drop-shadow(0 0 2px #ffffff)`,
                  }}
                />
              )}
            </g>
          )
        }

        if (edgeStyle === 'lightning') {
          const striking = strikingEdges.has(i)
          return (
            <g key={`edge-${i}`} opacity={dimmed ? 0.25 : 1}>
              {/* Quiet base stroke */}
              <path
                d={d}
                stroke={color}
                strokeOpacity={striking ? 0.5 : 0.28}
                strokeWidth={Math.max(0.5, w * 0.7)}
                fill="none"
              />
              {striking && (
                <>
                  {/* Bright halo */}
                  <path
                    d={d}
                    stroke={color}
                    strokeOpacity={0.7}
                    strokeWidth={w * 5}
                    fill="none"
                    filter="url(#sf-soft-blur)"
                    style={{ animation: 'sf-strike-pulse 180ms ease-out forwards' }}
                  />
                  {/* Jagged bolt core */}
                  <path
                    d={d}
                    stroke="#ffffff"
                    strokeOpacity={1}
                    strokeWidth={Math.max(1.2, w * 1.3)}
                    fill="none"
                    filter="url(#sf-lightning-disp)"
                    style={{ animation: 'sf-strike-pulse 180ms ease-out forwards' }}
                  />
                </>
              )}
            </g>
          )
        }

        return null
      })}

      {/* Particles */}
      {particlesRef.current.map((p) => {
        const edge = edges[p.edgeIdx]
        if (!edge) return null
        const a = nodeById.get(edge.from)
        const b = nodeById.get(edge.to)
        if (!a || !b) return null
        if (
          reachableFromGoal != null &&
          !(reachableFromGoal.has(edge.from) && reachableFromGoal.has(edge.to))
        ) {
          return null
        }
        const t = particleDirection === 'reverse' ? 1 - p.t : p.t
        const pt = bezierAt(
          a.x + leverPillHalfWidth,
          a.y,
          b.x - rightInset,
          b.y,
          t,
        )
        const alpha = 1 - Math.abs(p.t - 0.5) * 1.6
        return (
          <circle
            key={`p-${p.id}`}
            cx={pt.x}
            cy={pt.y}
            r={2.5}
            fill={p.color}
            opacity={Math.max(0, alpha)}
          />
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
