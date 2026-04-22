/**
 * Fork C — Live causal graph with particle flow.
 *
 * Renders the SCM as an interactive DAG: levers on the left, outcomes on
 * the right, edges drawn as curved bezier paths whose thickness encodes
 * effect strength. When the user tweaks a lever's intensity, particles
 * stream along every edge it feeds, and each downstream outcome node
 * pulses proportional to the timed delta it absorbs.
 *
 * A goal selection fades the irrelevant subgraph so the user can see
 * exactly which levers reach the target outcome.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  Play,
  RotateCcw,
  Target,
  Users as UsersIcon,
  X,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import {
  cumulativeEffectFraction,
  horizonDaysFor,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import { leversAvailableAt } from '@/data/scm/leverCredibility'
import {
  MANIPULABLE_NODES,
  type ManipulableNode,
  rangeFor,
  formatNodeValue,
  buildObservedValues,
  MethodBadge,
} from './_shared'

const ATDAYS = 90

// ─── Graph layout ───────────────────────────────────────────────────

const CANVAS_W = 900
const CANVAS_H = 520
const LEFT_X = 140
const RIGHT_X = 760
const TOP_PAD = 40
const BOTTOM_PAD = 40

interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  kind: 'lever' | 'outcome'
}

interface GraphEdge {
  from: string
  to: string
  // Strength comes from the sum of |mean| across stored draws — a rough
  // "how big a dial is this" signal we use to scale the base edge width.
  strength: number
  // Sign is used for color tinting.
  sign: -1 | 1 | 0
}

/** Cubic bezier waypoints for an edge — control points at 1/2 of dx for a
 *  smooth horizontal S-curve. */
function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax
  const c1x = ax + dx * 0.5
  const c1y = ay
  const c2x = bx - dx * 0.5
  const c2y = by
  return `M${ax},${ay} C${c1x},${c1y} ${c2x},${c2y} ${bx},${by}`
}

/** Evaluate a cubic bezier at parameter t ∈ [0,1]. */
function bezierAt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
): { x: number; y: number } {
  const dx = bx - ax
  const c1x = ax + dx * 0.5
  const c1y = ay
  const c2x = bx - dx * 0.5
  const c2y = by
  const u = 1 - t
  const x = u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx
  const y = u * u * u * ay + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * by
  return { x, y }
}

// ─── Particle ──────────────────────────────────────────────────────

interface Particle {
  id: number
  edgeIdx: number
  t: number
  speed: number
  color: string
}

const COLORS = {
  benefit: '#059669',
  harm: '#e11d48',
  neutral: '#64748b',
  dim: '#cbd5e1',
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinViewGraph() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [goalOutcomeId, setGoalOutcomeId] = useState<string | null>(null)
  const [activeLever, setActiveLever] = useState<string | null>(null)

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', ATDAYS)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => ({
      node,
      current: participant.current_values?.[node.id] ?? node.defaultValue,
    }))
  }, [participant])

  // Build graph nodes + edges from participant.effects_bayesian (which is
  // the action→outcome list with magnitude). We filter to actions present
  // in our credible lever set, and outcomes the user can see (registered).
  const { nodes, edges } = useMemo(() => {
    if (!participant) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] }

    const credibleLevers = leversAvailableAt('intervention', ATDAYS)

    // Aggregate effects_bayesian to one per (action, outcome) by max abs mean
    const agg = new Map<string, { strength: number; sign: -1 | 1 | 0 }>()
    for (const e of participant.effects_bayesian) {
      if (!credibleLevers.has(e.action)) continue
      const outcomeKey = canonicalOutcomeKey(e.outcome)
      const k = `${e.action}|${outcomeKey}`
      const prev = agg.get(k)
      const strength = Math.abs(e.posterior?.mean ?? 0)
      const sign: -1 | 1 | 0 =
        (e.posterior?.mean ?? 0) > 0 ? 1 : (e.posterior?.mean ?? 0) < 0 ? -1 : 0
      if (!prev || strength > prev.strength) {
        agg.set(k, { strength, sign })
      }
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

    const ns: GraphNode[] = []
    const leverSpan = CANVAS_H - TOP_PAD - BOTTOM_PAD
    leverIds.forEach((id, i) => {
      const y = TOP_PAD + (leverSpan * (i + 0.5)) / leverIds.length
      ns.push({ id, label: leverLabel(id), x: LEFT_X, y, kind: 'lever' })
    })
    outcomeIds.forEach((id, i) => {
      const y = TOP_PAD + (leverSpan * (i + 0.5)) / outcomeIds.length
      ns.push({ id, label: outcomeLabel(id), x: RIGHT_X, y, kind: 'outcome' })
    })

    const es: GraphEdge[] = []
    for (const [k, v] of agg.entries()) {
      const [from, to] = k.split('|')
      es.push({ from, to, strength: v.strength, sign: v.sign })
    }
    return { nodes: ns, edges: es }
  }, [participant])

  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  // Normalize edge strengths to 0..1 for rendering.
  const strengthNorm = useMemo(() => {
    const maxS = Math.max(1e-9, ...edges.map((e) => e.strength))
    return (s: number) => s / maxS
  }, [edges])

  // Run counterfactual on every change (the graph is the demo — no Run
  // button). Keep it cheap: point-estimate only, no MC.
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

  const state = useMemo(() => {
    if (!participant || deltas.length === 0) return null
    const obs = buildObservedValues(participant, {})
    return runFullCounterfactual(obs, deltas)
  }, [participant, deltas, runFullCounterfactual])

  // Per-outcome timed delta for node glow sizing
  const outcomeDeltas = useMemo(() => {
    const out = new Map<string, number>()
    if (!state) return out
    for (const e of state.allEffects.values()) {
      const key = canonicalOutcomeKey(e.nodeId)
      if (!nodeById.has(key)) continue
      const horizonDays = horizonDaysFor(key) ?? 30
      const fraction = cumulativeEffectFraction(ATDAYS, horizonDays)
      const timed = e.totalEffect * fraction
      const prev = out.get(key) ?? 0
      if (Math.abs(timed) > Math.abs(prev)) out.set(key, timed)
    }
    return out
  }, [state, nodeById])

  const maxTimedAbs = useMemo(
    () => Math.max(1e-9, ...Array.from(outcomeDeltas.values()).map(Math.abs)),
    [outcomeDeltas],
  )

  // Reachability for goal dimming
  const reachableFromGoal = useMemo(() => {
    if (!goalOutcomeId) return null
    const reachable = new Set<string>()
    reachable.add(goalOutcomeId)
    for (const e of edges) {
      if (e.to === goalOutcomeId) reachable.add(e.from)
    }
    return reachable
  }, [edges, goalOutcomeId])

  // ─── Particle engine ─────────────────────────────────────────────
  //
  // When `activeLever` is set (user is dragging a slider), we continuously
  // spawn particles on every edge whose `from` matches. Each particle
  // advances along its edge's bezier at speed proportional to strength.
  // Dead particles (t >= 1) are pruned.

  const particlesRef = useRef<Particle[]>([])
  const [, forceRender] = useState(0)
  const lastSpawnRef = useRef(0)
  const nextIdRef = useRef(0)

  useEffect(() => {
    let rafId = 0
    let lastT = performance.now()
    const loop = (now: number) => {
      const dt = (now - lastT) / 1000
      lastT = now

      // Advance existing particles
      const live: Particle[] = []
      for (const p of particlesRef.current) {
        const nt = p.t + p.speed * dt
        if (nt < 1) live.push({ ...p, t: nt })
      }
      particlesRef.current = live

      // Spawn new ones on the active lever's outbound edges
      if (activeLever) {
        const spawnInterval = 0.15 // seconds between spawns per edge
        if (now - lastSpawnRef.current > spawnInterval * 1000) {
          lastSpawnRef.current = now
          edges.forEach((edge, edgeIdx) => {
            if (edge.from !== activeLever) return
            const color =
              edge.sign > 0 ? COLORS.benefit : edge.sign < 0 ? COLORS.harm : COLORS.neutral
            particlesRef.current.push({
              id: nextIdRef.current++,
              edgeIdx,
              t: 0,
              // Stronger edges → faster particles (more "signal"). Clamp so
              // weak edges still complete the journey.
              speed: 0.25 + strengthNorm(edge.strength) * 0.55,
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
  }, [activeLever, edges, strengthNorm])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Graph">
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
      <PageLayout title="Twin · Graph">
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
      title="Twin · Live causal graph"
      subtitle="Drag any lever and watch the signal flow along its edges. Outcomes pulse in proportion to the delta they absorb."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Live DAG · particles stream on active edges
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {goalOutcomeId ? (
              <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full pl-2.5 pr-1 py-1">
                <Target className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-medium text-emerald-900">
                  Goal: {OUTCOME_META[goalOutcomeId]?.noun ?? goalOutcomeId}
                </span>
                <button
                  onClick={() => setGoalOutcomeId(null)}
                  className="ml-0.5 p-0.5 rounded-full text-emerald-600 hover:bg-emerald-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">Click any outcome node to set it as goal.</span>
            )}
            <button
              onClick={() => setProposedValues({})}
              disabled={Object.keys(proposedValues).length === 0}
              className={cn(
                'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
                Object.keys(proposedValues).length > 0
                  ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'text-slate-300 border-slate-100 cursor-not-allowed',
              )}
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>

        <MethodBadge />

        <Card>
          <div className="p-2">
            <svg
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="w-full h-auto"
              style={{ maxHeight: '600px' }}
            >
              {/* Edges */}
              {edges.map((e, i) => {
                const a = nodeById.get(e.from)
                const b = nodeById.get(e.to)
                if (!a || !b) return null
                const dimmed =
                  reachableFromGoal != null &&
                  !(reachableFromGoal.has(e.from) && reachableFromGoal.has(e.to))
                const isActive = activeLever === e.from
                const w = 0.5 + strengthNorm(e.strength) * 3
                const color =
                  e.sign > 0 ? COLORS.benefit : e.sign < 0 ? COLORS.harm : COLORS.neutral
                return (
                  <path
                    key={`edge-${i}`}
                    d={edgePath(a.x + 40, a.y, b.x - 40, b.y)}
                    stroke={dimmed ? COLORS.dim : color}
                    strokeOpacity={dimmed ? 0.12 : isActive ? 0.75 : 0.35}
                    strokeWidth={w}
                    fill="none"
                  />
                )
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
                const pt = bezierAt(a.x + 40, a.y, b.x - 40, b.y, p.t)
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

              {/* Nodes */}
              {nodes.map((n) => {
                const dimmed =
                  reachableFromGoal != null && !reachableFromGoal.has(n.id)
                if (n.kind === 'lever') {
                  const active = activeLever === n.id
                  const hasProposed = proposedValues[n.id] != null
                  return (
                    <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                      <rect
                        x={-38}
                        y={-14}
                        width={76}
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
                }
                // Outcome node: size by current timed delta
                const delta = outcomeDeltas.get(n.id) ?? 0
                const deltaNorm = Math.abs(delta) / maxTimedAbs
                const baseR = 14
                const pulseR = baseR + deltaNorm * 12
                const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0
                const meta = OUTCOME_META[n.id]
                const beneficial = meta?.beneficial ?? 'higher'
                const tone =
                  beneficial === 'neutral' || sign === 0
                    ? 'neutral'
                    : (beneficial === 'higher' ? sign > 0 : sign < 0)
                      ? 'benefit'
                      : 'harm'
                const fill = tone === 'benefit' ? '#10b981' : tone === 'harm' ? '#f43f5e' : '#94a3b8'
                const isGoal = goalOutcomeId === n.id
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    onClick={() =>
                      setGoalOutcomeId((prev) => (prev === n.id ? null : n.id))
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Pulse halo proportional to delta */}
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

              {/* Column headers */}
              <text x={LEFT_X} y={24} textAnchor="middle" fontSize={10} fontWeight={700} fill="#64748b" letterSpacing="0.05em">
                LEVERS
              </text>
              <text x={RIGHT_X} y={24} textAnchor="start" fontSize={10} fontWeight={700} fill="#64748b" letterSpacing="0.05em">
                OUTCOMES
              </text>
            </svg>
          </div>
        </Card>

        {/* Lever sliders below the graph */}
        <Card>
          <div className="p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
              Lever controls — grab any one to stream particles
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {interventionRows.map(({ node, current }) => {
                const range = rangeFor(node, current)
                const value = proposedValues[node.id] ?? current
                const changed = Math.abs(value - current) > 1e-9
                return (
                  <div
                    key={node.id}
                    className={cn(
                      'rounded-md p-2 border transition-colors',
                      changed
                        ? 'bg-violet-50/40 border-violet-200'
                        : 'bg-slate-50 border-slate-100',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-1 mb-1.5">
                      <div className="text-[11px] font-semibold text-slate-700 truncate">
                        {node.label}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400">
                          {formatNodeValue(current, node)}→
                        </span>
                        <span className="text-[11px] font-medium text-slate-800 tabular-nums ml-0.5">
                          {formatNodeValue(value, node)}
                        </span>
                      </div>
                    </div>
                    <Slider
                      min={range.min}
                      max={range.max}
                      step={node.step}
                      value={value}
                      onChange={(v) => {
                        setActiveLever(node.id)
                        setProposedValues((p) => ({ ...p, [node.id]: v }))
                      }}
                      onChangeEnd={() => {
                        // Let particles continue briefly after release
                        setTimeout(() => {
                          setActiveLever((cur) => (cur === node.id ? null : cur))
                        }, 400)
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewGraph
