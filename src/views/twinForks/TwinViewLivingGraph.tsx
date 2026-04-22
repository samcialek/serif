/**
 * Fork J (v2) — LivingGraph.
 *
 * The DAG *is* the interface. Lever controls are embedded inline on the
 * left-side nodes (rotary, fader, gauge — one per lever). Outcomes on the
 * right are clickable to set a goal; when set, the particle flow reverses
 * and the solver tunes the levers, which you watch animate in place.
 *
 * Design bets:
 *   - No separate control panel. Everything happens on the canvas.
 *   - Propagation (default) and abduction (goal set + Solve) both render as
 *     particle flow on the same DAG, just opposite directions.
 *   - Drag-and-drop: drag a proposed setting "ghost" from a lever into the
 *     graph to lock it, pinning it during solver runs.
 */

import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Loader2,
  Play,
  RotateCcw,
  Target,
  Users as UsersIcon,
  Wand2,
  X,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import { formatOutcomeValue } from '@/utils/rounding'
import { leversAvailableAt } from '@/data/scm/leverCredibility'
import {
  MANIPULABLE_NODES,
  GOAL_CANDIDATES,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  buildObservedValues,
  MethodBadge,
} from './_shared'
import { AutoControl } from './_controls'
import {
  CausalGraphCanvas,
  buildGraph,
  outcomeDeltasAt,
  type GraphLayout,
} from './_graph'
import { useTwinSolver } from './_solver'

const AT_DAYS = 90
const LEVER_CARD_W = 148
const LEVER_CARD_H = 120

function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

// ─── LivingGraph layout ────────────────────────────────────────────

function livingLayout(width: number, height: number): GraphLayout {
  return {
    width,
    height,
    leftX: LEVER_CARD_W / 2 + 24, // leave room for the lever card on the left
    rightX: width - 180, // leave room for outcome label on the right
    topPad: 48,
    bottomPad: 36,
  }
}

// ─── Main ─────────────────────────────────────────────────────────

export function TwinViewLivingGraph() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [goalOutcomeId, setGoalOutcomeId] = useState<string | null>(null)
  const [activeLever, setActiveLever] = useState<string | null>(null)
  const [targetSize, setTargetSize] = useState(5)

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current, range: rangeFor(node, current) }
    })
  }, [participant])

  // Compute the layout from intervention row count.
  const graphHeight = Math.max(480, interventionRows.length * (LEVER_CARD_H + 16) + 80)
  const layout = useMemo(() => livingLayout(1100, graphHeight), [graphHeight])

  const graph = useMemo(() => {
    if (!participant) return { nodes: [], edges: [] }
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return buildGraph(participant.effects_bayesian, credible, layout)
  }, [participant, layout])
  const graphOutcomeIds = useMemo(
    () => new Set(graph.nodes.filter((n) => n.kind === 'outcome').map((n) => n.id)),
    [graph],
  )

  // Counterfactual state
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
    if (!participant) return null
    if (deltas.length === 0) {
      return { allEffects: new Map() } as unknown as FullCounterfactualState
    }
    const observed = buildObservedValues(participant)
    try {
      return runFullCounterfactual(observed, deltas)
    } catch (err) {
      console.warn('[TwinViewLivingGraph] cf failed:', err)
      return null
    }
  }, [participant, deltas, runFullCounterfactual])

  const outcomeDeltas = useMemo(
    () => outcomeDeltasAt(state, AT_DAYS, graphOutcomeIds),
    [state, graphOutcomeIds],
  )

  // Solver
  const solver = useTwinSolver({
    participant,
    rows: interventionRows,
    atDays: AT_DAYS,
    runFullCounterfactual,
  })
  const goalCandidate = useMemo(() => {
    if (!goalOutcomeId) return null
    return (
      GOAL_CANDIDATES.find((g) => canonicalOutcomeKey(g.outcomeId) === goalOutcomeId) ??
      GOAL_CANDIDATES.find((g) => g.outcomeId === goalOutcomeId) ??
      null
    )
  }, [goalOutcomeId])
  const goalUnit = goalCandidate
    ? OUTCOME_META[canonicalOutcomeKey(goalCandidate.outcomeId)]?.unit ?? ''
    : ''

  // When the solver changes values, mirror them into the controls so the
  // inline widgets animate to the plan.
  const inSolverMode = goalOutcomeId != null
  const effectiveValues = inSolverMode ? solver.values : proposedValues

  const handleLeverChange = useCallback(
    (id: string, v: number) => {
      setActiveLever(id)
      setProposedValues((p) => ({ ...p, [id]: v }))
      window.setTimeout(() => setActiveLever((cur) => (cur === id ? null : cur)), 500)
    },
    [],
  )

  const applyPlan = useCallback(() => {
    setProposedValues({ ...solver.values })
    setGoalOutcomeId(null)
  }, [solver.values])

  if (pid == null) {
    return (
      <PageLayout title="Twin · LivingGraph">
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
      <PageLayout title="Twin · LivingGraph">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const achieved = solver.history.length > 0
    ? solver.history[solver.history.length - 1].achieved
    : 0
  const progress = Math.max(0, Math.min(1, Math.abs(achieved) / Math.abs(targetSize || 1)))

  const rowById = new Map(interventionRows.map((r) => [r.node.id, r]))

  return (
    <PageLayout
      title="Twin · LivingGraph"
      subtitle="The DAG is the interface. Levers live on the graph. Click any outcome to flip into solver mode and watch particles reverse."
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
              {cohort ? `Cohort ${cohort} · ` : ''}
              {inSolverMode
                ? `Abduction · solver working back through the DAG`
                : `Propagation · tweak any inline control`}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {inSolverMode ? (
              <button
                onClick={() => {
                  solver.cancel()
                  setGoalOutcomeId(null)
                }}
                className="text-[11px] flex items-center gap-1 px-2 py-1.5 rounded border text-slate-600 border-slate-200 hover:bg-slate-50"
              >
                <X className="w-3 h-3" />
                Exit solver
              </button>
            ) : (
              deltas.length > 0 && (
                <button
                  onClick={() => setProposedValues({})}
                  className="text-[11px] flex items-center gap-1 px-2 py-1.5 rounded border text-slate-600 border-slate-200 hover:bg-slate-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              )
            )}
          </div>
        </div>

        <MethodBadge />

        {/* Solver control bar appears above the graph when in solver mode. */}
        <AnimatePresence>
          {inSolverMode && goalCandidate && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <Card>
                <div className="p-3 flex items-center gap-4 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full pl-2.5 pr-2 py-1">
                    <Target className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[12px] font-semibold text-emerald-900">
                      Goal: {OUTCOME_META[goalOutcomeId!]?.noun ?? goalOutcomeId}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      Target
                    </span>
                    <div className="flex-1">
                      <Slider
                        min={1}
                        max={20}
                        step={0.5}
                        value={targetSize}
                        onChange={setTargetSize}
                      />
                    </div>
                    <span className="text-xs font-bold text-primary-700 tabular-nums whitespace-nowrap">
                      {goalCandidate.direction === 'higher' ? '+' : '−'}
                      {formatOutcomeValue(
                        Math.abs(targetSize),
                        canonicalOutcomeKey(goalCandidate.outcomeId),
                      )}{' '}
                      {goalUnit}
                    </span>
                  </div>
                  {solver.isSolving ? (
                    <Button onClick={solver.cancel} size="sm">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      iter {solver.history.length}/40
                    </Button>
                  ) : solver.solved ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => solver.start(goalCandidate, targetSize)}
                      >
                        <Wand2 className="w-4 h-4 mr-1" />
                        Re-solve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={applyPlan}>
                        Apply
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => solver.start(goalCandidate, targetSize)}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Solve
                    </Button>
                  )}
                  {(solver.isSolving || solver.solved) && (
                    <div className="w-28">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-primary-500"
                          animate={{ width: `${progress * 100}%` }}
                          transition={{ duration: 0.18 }}
                        />
                      </div>
                      <div className="text-[9px] text-slate-500 text-right tabular-nums">
                        {formatEffectDelta(
                          goalCandidate.direction === 'higher' ? achieved : -achieved,
                          goalCandidate.outcomeId,
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The graph. */}
        <Card>
          <div className="p-2 relative">
            <div className="relative" style={{ height: graphHeight }}>
              <CausalGraphCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                outcomeDeltas={outcomeDeltas}
                activeLever={activeLever}
                goalOutcomeId={goalOutcomeId}
                particleDirection={inSolverMode && solver.isSolving ? 'reverse' : 'forward'}
                layout={layout}
                className="w-full h-full"
                leverPillHalfWidth={LEVER_CARD_W / 2}
                dimMode="none"
                onOutcomeClick={(id) => {
                  setGoalOutcomeId((prev) => (prev === id ? null : id))
                }}
                renderOutcomeOverlay={({ label, delta, tone, deltaNorm }) => {
                  const fill =
                    tone === 'benefit'
                      ? '#10b981'
                      : tone === 'harm'
                        ? '#f43f5e'
                        : '#94a3b8'
                  const isGoal = goalOutcomeId != null
                  const baseR = 14
                  return (
                    <>
                      {deltaNorm > 0.05 && (
                        <circle r={baseR + deltaNorm * 12} fill={fill} opacity={0.18 * deltaNorm} />
                      )}
                      <circle
                        r={baseR}
                        fill="#ffffff"
                        stroke={isGoal ? '#059669' : fill}
                        strokeWidth={isGoal ? 3 : 1.5}
                      />
                      <text
                        x={baseR + 8}
                        y={2}
                        textAnchor="start"
                        fontSize={11}
                        fontWeight={600}
                        fill="#1e293b"
                        style={{ pointerEvents: 'none' }}
                      >
                        {label}
                      </text>
                      {Math.abs(delta) > 1e-6 && (
                        <text
                          x={baseR + 8}
                          y={16}
                          textAnchor="start"
                          fontSize={9}
                          fontWeight={500}
                          fill={tone === 'benefit' ? '#059669' : tone === 'harm' ? '#e11d48' : '#64748b'}
                          style={{ pointerEvents: 'none' }}
                        >
                          {formatEffectDelta(delta, label)}
                        </text>
                      )}
                    </>
                  )
                }}
              />

              {/* Absolute-positioned lever widgets overlayed on the SVG node
                  positions. We convert graph coords → SVG viewport % so the
                  widgets follow responsive resizes. */}
              {graph.nodes
                .filter((n) => n.kind === 'lever')
                .map((n) => {
                  const row = rowById.get(n.id)
                  if (!row) return null
                  const xPct = (n.x / layout.width) * 100
                  const yPct = (n.y / layout.height) * 100
                  const value = effectiveValues[n.id] ?? row.current
                  const changed = Math.abs(value - row.current) > 1e-9
                  const locked = inSolverMode
                  return (
                    <div
                      key={n.id}
                      className="absolute pointer-events-auto"
                      style={{
                        left: `${xPct}%`,
                        top: `${yPct}%`,
                        transform: `translate(-50%, -50%)`,
                        width: LEVER_CARD_W,
                      }}
                    >
                      <div
                        className={cn(
                          'rounded-lg border p-2 bg-white shadow-sm backdrop-blur-sm transition-all',
                          changed
                            ? 'border-violet-300 ring-1 ring-violet-200'
                            : 'border-slate-200',
                          locked && 'ring-1 ring-emerald-200',
                        )}
                      >
                        <AutoControl
                          node={row.node}
                          current={row.current}
                          value={value}
                          onChange={
                            locked
                              ? () => {}
                              : (v) => handleLeverChange(n.id, v)
                          }
                          compact
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
            <div className="px-2 pt-1 text-[10px] text-slate-400">
              {inSolverMode
                ? 'Solver mode: violet particles sweep backward from the goal, levers animate to the plan. Click "Apply" in the bar above to load it into the controls.'
                : 'Forward mode: turn any inline control, watch particles flow and outcomes pulse. Click an outcome to flip into solver mode.'}
            </div>
          </div>
        </Card>

        {/* Mini outcomes strip below the graph — quick read-out in case the
            user wants numeric deltas without scanning node labels. */}
        {!inSolverMode && deltas.length > 0 && (
          <Card>
            <div className="p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                At {formatHorizonShort(AT_DAYS)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(outcomeDeltas.entries())
                  .filter(([, d]) => Math.abs(d) > 1e-6)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 8)
                  .map(([id, delta]) => {
                    const meta = OUTCOME_META[id]
                    const beneficial = meta?.beneficial ?? 'higher'
                    const isBen =
                      beneficial === 'neutral'
                        ? false
                        : beneficial === 'higher'
                          ? delta > 0
                          : delta < 0
                    const pillCls = isBen
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                    return (
                      <div
                        key={id}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border',
                          pillCls,
                        )}
                      >
                        <span className="font-medium">
                          {meta?.noun ?? friendlyName(id)}
                        </span>
                        <span className="tabular-nums font-semibold">
                          {formatEffectDelta(delta, id)}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          </Card>
        )}
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewLivingGraph
