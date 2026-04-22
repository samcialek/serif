/**
 * Fork K (v3) — Workspace.
 *
 * Explicit dual-mode: Propagate and Abduct as equal first-class panels,
 * side-by-side above a shared causal graph. The graph is always visible,
 * so you can see the DAG structure no matter which mode you're using.
 *
 * The drag-and-drop story returns as the bridge between the two modes:
 * once the solver finishes in Abduct, its "Plan" card becomes draggable —
 * drop it onto the Propagate panel to load the values into the controls
 * there, then dial them up or down manually. Abduction informs intent;
 * propagation lets you play with the shape of the answer.
 *
 * Design bet: keeping both modes visible at once makes the distinction
 * legible in a way a tab toggle can't. Users aren't context-switching;
 * they're reading across two columns.
 */

import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeftRight,
  Check,
  Loader2,
  Play,
  RotateCcw,
  Target,
  TrendingDown,
  TrendingUp,
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
import type {
  FullCounterfactualState,
  NodeEffect,
} from '@/data/scm/fullCounterfactual'
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
  GOAL_CANDIDATES,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  buildObservedValues,
  MethodBadge,
  DecayCurve,
  toneForEffect,
} from './_shared'
import { AutoControl, ControlFrame } from './_controls'
import {
  CausalGraphCanvas,
  buildGraph,
  defaultLayout,
  outcomeDeltasAt,
} from './_graph'
import { useTwinSolver } from './_solver'

const AT_DAYS = 90

function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

// ─── Main ─────────────────────────────────────────────────────────

export function TwinViewWorkspace() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  // Propagate-side state
  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [activeLever, setActiveLever] = useState<string | null>(null)

  // Abduct-side state
  const [goalId, setGoalId] = useState<string>('hrv_daily')
  const [targetSize, setTargetSize] = useState(5)

  // UI state for which side the graph should highlight
  const [focusedMode, setFocusedMode] = useState<'propagate' | 'abduct'>('propagate')

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current, range: rangeFor(node, current) }
    })
  }, [participant])

  // Propagation counterfactual (live)
  const propagateDeltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    for (const { node, current } of interventionRows) {
      const effective = proposedValues[node.id] ?? current
      if (Math.abs(effective - current) > 1e-9) {
        out.push({ nodeId: node.id, value: effective, originalValue: current })
      }
    }
    return out
  }, [interventionRows, proposedValues])

  const propagateState = useMemo(() => {
    if (!participant) return null
    if (propagateDeltas.length === 0) {
      return { allEffects: new Map() } as unknown as FullCounterfactualState
    }
    const observed = buildObservedValues(participant)
    try {
      return runFullCounterfactual(observed, propagateDeltas)
    } catch (err) {
      console.warn('[TwinViewWorkspace] cf failed:', err)
      return null
    }
  }, [participant, propagateDeltas, runFullCounterfactual])

  // Solver
  const solver = useTwinSolver({
    participant,
    rows: interventionRows,
    atDays: AT_DAYS,
    runFullCounterfactual,
  })

  const goal = useMemo(
    () => GOAL_CANDIDATES.find((g) => g.outcomeId === goalId) ?? GOAL_CANDIDATES[0],
    [goalId],
  )
  const goalUnit = OUTCOME_META[canonicalOutcomeKey(goal.outcomeId)]?.unit ?? ''

  // Shared graph geometry
  const layout = useMemo(() => defaultLayout(980, 440), [])
  const graph = useMemo(() => {
    if (!participant) return { nodes: [], edges: [] }
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return buildGraph(participant.effects_bayesian, credible, layout)
  }, [participant, layout])
  const graphOutcomeIds = useMemo(
    () => new Set(graph.nodes.filter((n) => n.kind === 'outcome').map((n) => n.id)),
    [graph],
  )

  // When focusedMode === 'propagate' use propagateState; when 'abduct' use the
  // solver's current trial state (so the graph reflects whichever panel is
  // in focus).
  const solverTrialState = useMemo(() => {
    if (!participant || solver.history.length === 0) return null
    const lastVals = solver.values
    const deltas = interventionRows
      .filter(({ node, current }) => Math.abs((lastVals[node.id] ?? current) - current) > 1e-9)
      .map(({ node, current }) => ({
        nodeId: node.id,
        value: lastVals[node.id] ?? current,
        originalValue: current,
      }))
    if (deltas.length === 0) {
      return { allEffects: new Map() } as unknown as FullCounterfactualState
    }
    const observed = buildObservedValues(participant)
    try {
      return runFullCounterfactual(observed, deltas)
    } catch {
      return null
    }
  }, [participant, interventionRows, solver.values, solver.history.length, runFullCounterfactual])

  const graphOutcomeDeltas = useMemo(
    () =>
      outcomeDeltasAt(
        focusedMode === 'abduct' ? solverTrialState : propagateState,
        AT_DAYS,
        graphOutcomeIds,
      ),
    [focusedMode, solverTrialState, propagateState, graphOutcomeIds],
  )

  // Propagation outcome list
  const sortedPropagateEffects = useMemo(() => {
    if (!propagateState) return []
    const seen = new Set<string>()
    const out: NodeEffect[] = []
    for (const e of propagateState.allEffects.values()) {
      if (Math.abs(e.totalEffect) <= 1e-6) continue
      const key = canonicalOutcomeKey(e.nodeId)
      if (seen.has(key)) continue
      if (!isOutcomeCredibleAt(key, AT_DAYS)) continue
      seen.add(key)
      out.push(e)
    }
    return out.sort((a, b) => {
      const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
      const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
      return ha - hb
    })
  }, [propagateState])

  // Apply plan (from drag-drop or button)
  const applyPlan = useCallback(() => {
    setProposedValues({ ...solver.values })
    setFocusedMode('propagate')
  }, [solver.values])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Workspace">
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
      <PageLayout title="Twin · Workspace">
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
  const isSolved = solver.solved != null

  return (
    <PageLayout
      title="Twin · Workspace"
      subtitle="Propagate and Abduct side-by-side. Drag a solved plan across to load it into the controls — two modes, one DAG."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Workspace · {formatHorizonShort(AT_DAYS)}
            </div>
          </div>
          <div className="ml-auto inline-flex items-center gap-1 border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setFocusedMode('propagate')}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors',
                focusedMode === 'propagate'
                  ? 'bg-primary-500 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
              title="Graph reflects the controls on the left"
            >
              Watching · Propagate
            </button>
            <button
              onClick={() => setFocusedMode('abduct')}
              className={cn(
                'text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors',
                focusedMode === 'abduct'
                  ? 'bg-primary-500 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              )}
              title="Graph reflects the solver on the right"
            >
              Watching · Abduct
            </button>
          </div>
        </div>

        <MethodBadge />

        {/* Two-panel main area */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {/* ─── PROPAGATE PANEL ─── */}
          <Card
            className={cn(
              focusedMode === 'propagate' ? 'ring-2 ring-primary-200' : undefined,
            )}
          >
            <div
              className="p-3 space-y-3 min-h-[560px]"
              onMouseEnter={() => setFocusedMode('propagate')}
            >
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Propagate
                </div>
                <span className="text-[10px] text-slate-400">
                  Turn a control · watch outcomes propagate forward
                </span>
                <div className="ml-auto">
                  {Object.keys(proposedValues).length > 0 && (
                    <button
                      onClick={() => setProposedValues({})}
                      className="text-[11px] flex items-center gap-1 px-2 py-1 rounded border text-slate-600 border-slate-200 hover:bg-slate-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <PropagateDropZone onDropPlan={applyPlan}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {interventionRows.map(({ node, current }) => {
                    const value = proposedValues[node.id] ?? current
                    const changed = Math.abs(value - current) > 1e-9
                    return (
                      <ControlFrame
                        key={node.id}
                        changed={changed}
                        onReset={() =>
                          setProposedValues((p) => {
                            const { [node.id]: _removed, ...rest } = p
                            return rest
                          })
                        }
                      >
                        <AutoControl
                          node={node}
                          current={current}
                          value={value}
                          onChange={(v) => {
                            setActiveLever(node.id)
                            setProposedValues((p) => ({ ...p, [node.id]: v }))
                            setFocusedMode('propagate')
                            window.setTimeout(
                              () =>
                                setActiveLever((cur) => (cur === node.id ? null : cur)),
                              500,
                            )
                          }}
                          compact
                        />
                      </ControlFrame>
                    )
                  })}
                </div>
              </PropagateDropZone>

              <div className="pt-2 border-t border-slate-100">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Outcomes at {formatHorizonShort(AT_DAYS)}
                </div>
                {sortedPropagateEffects.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-slate-400">
                    No change yet — turn a control above or drag a plan from Abduct.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sortedPropagateEffects.slice(0, 6).map((effect) => (
                      <PropagateOutcomeRow
                        key={effect.nodeId}
                        effect={effect}
                        atDays={AT_DAYS}
                      />
                    ))}
                    {sortedPropagateEffects.length > 6 && (
                      <div className="text-[10px] text-slate-400 pt-1">
                        +{sortedPropagateEffects.length - 6} more outcomes below the fold
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* ─── ABDUCT PANEL ─── */}
          <Card
            className={cn(
              focusedMode === 'abduct' ? 'ring-2 ring-primary-200' : undefined,
            )}
          >
            <div
              className="p-3 space-y-3 min-h-[560px]"
              onMouseEnter={() => setFocusedMode('abduct')}
            >
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Abduct
                </div>
                <span className="text-[10px] text-slate-400">
                  Pick a goal · the solver moves the levers
                </span>
              </div>

              <div>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Goal
                </div>
                <GoalPickerCompact
                  selectedId={goalId}
                  onSelect={(id) => {
                    setGoalId(id)
                    solver.reset()
                  }}
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="text-[11px] font-semibold text-slate-700">Target size</div>
                  <div className="text-xs font-bold text-primary-700 tabular-nums">
                    {goal.direction === 'higher' ? '+' : '−'}
                    {formatOutcomeValue(
                      Math.abs(targetSize),
                      canonicalOutcomeKey(goal.outcomeId),
                    )}{' '}
                    {goalUnit}
                  </div>
                </div>
                <Slider
                  min={1}
                  max={20}
                  step={0.5}
                  value={targetSize}
                  onChange={(v) => {
                    setTargetSize(v)
                    solver.reset()
                  }}
                />
              </div>

              <div className="flex items-center gap-2">
                {solver.isSolving ? (
                  <Button onClick={solver.cancel} className="flex-1">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    iter {solver.history.length}/40
                  </Button>
                ) : isSolved ? (
                  <>
                    <Button
                      onClick={() => solver.start(goal, targetSize)}
                      className="flex-1"
                    >
                      <Wand2 className="w-4 h-4 mr-2" />
                      Solve again
                    </Button>
                    <Button
                      onClick={applyPlan}
                      variant="secondary"
                      className="flex-1"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Apply
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => {
                      solver.start(goal, targetSize)
                      setFocusedMode('abduct')
                    }}
                    className="flex-1"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Solve
                  </Button>
                )}
              </div>

              {(solver.isSolving || isSolved) && (
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">Achieved</span>
                    <span className="tabular-nums font-semibold text-slate-700">
                      {formatEffectDelta(
                        goal.direction === 'higher' ? achieved : -achieved,
                        goal.outcomeId,
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary-500"
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ duration: 0.18 }}
                    />
                  </div>
                </div>
              )}

              {/* Plan card — draggable to Propagate side */}
              <AnimatePresence>
                {isSolved && solver.solved && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <PlanCard
                      solver={solver}
                      rows={interventionRows}
                      goalOutcomeId={goal.outcomeId}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </div>

        {/* ─── SHARED CAUSAL GRAPH ─── */}
        <Card>
          <div className="p-2">
            <div className="flex items-center justify-between mb-1 px-2 pt-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Shared causal graph
              </div>
              <div className="text-[10px] text-slate-400">
                Reflects the{' '}
                <span className="font-semibold">
                  {focusedMode === 'propagate' ? 'Propagate' : 'Abduct'}
                </span>{' '}
                panel · particles{' '}
                {focusedMode === 'abduct' && solver.isSolving ? 'reverse' : 'forward'}
              </div>
            </div>
            <CausalGraphCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              outcomeDeltas={graphOutcomeDeltas}
              activeLever={activeLever}
              goalOutcomeId={focusedMode === 'abduct' ? goal.outcomeId : null}
              particleDirection={focusedMode === 'abduct' && solver.isSolving ? 'reverse' : 'forward'}
              layout={layout}
              onOutcomeClick={(id) => {
                setGoalId(id)
                setFocusedMode('abduct')
                solver.reset()
              }}
              proposedLevers={
                focusedMode === 'abduct'
                  ? new Set(
                      Object.keys(solver.values).filter((k) => {
                        const row = interventionRows.find((r) => r.node.id === k)
                        return row && Math.abs(solver.values[k] - row.current) > 1e-9
                      }),
                    )
                  : new Set(Object.keys(proposedValues))
              }
            />
          </div>
        </Card>
      </motion.div>
    </PageLayout>
  )
}

// ─── Goal picker (compact, for Abduct panel) ───────────────────────

interface GoalPickerCompactProps {
  selectedId: string
  onSelect: (id: string) => void
}

function GoalPickerCompact({ selectedId, onSelect }: GoalPickerCompactProps) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof GOAL_CANDIDATES>()
    for (const g of GOAL_CANDIDATES) {
      const arr = byGroup.get(g.group) ?? []
      arr.push(g)
      byGroup.set(g.group, arr)
    }
    return Array.from(byGroup.entries())
  }, [])
  return (
    <div className="space-y-1.5">
      {groups.map(([groupName, items]) => (
        <div key={groupName}>
          <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            {groupName}
          </div>
          <div className="flex flex-wrap gap-1">
            {items.map((g) => (
              <button
                key={g.outcomeId}
                onClick={() => onSelect(g.outcomeId)}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                  selectedId === g.outcomeId
                    ? 'bg-primary-50 text-primary-700 border-primary-200 font-semibold'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-50',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Propagate outcome row ─────────────────────────────────────────

interface PropagateOutcomeRowProps {
  effect: NodeEffect
  atDays: number
}

function PropagateOutcomeRow({ effect, atDays }: PropagateOutcomeRowProps) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30
  const fraction = cumulativeEffectFraction(atDays, horizonDays)
  const timedEffect = effect.totalEffect * fraction
  const tone = toneForEffect(timedEffect, meta?.beneficial ?? 'higher')
  const Icon = timedEffect > 0 ? TrendingUp : TrendingDown
  const toneColor =
    tone === 'benefit' ? 'text-emerald-600' : tone === 'harm' ? 'text-rose-600' : 'text-slate-500'
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', toneColor)} />
      <div className="min-w-0 flex-1 text-[12px] font-medium text-slate-800 truncate">
        {meta?.noun ?? friendlyName(effect.nodeId)}
      </div>
      <DecayCurve
        horizonDays={horizonDays}
        atDays={atDays}
        tone={tone}
        widthPx={48}
        heightPx={18}
      />
      <div className={cn('text-[12px] font-semibold tabular-nums w-20 text-right', toneColor)}>
        {formatEffectDelta(timedEffect, effect.nodeId)}
      </div>
    </div>
  )
}

// ─── Plan card (draggable) ─────────────────────────────────────────

interface PlanCardProps {
  solver: ReturnType<typeof useTwinSolver>
  rows: Array<{
    node: typeof MANIPULABLE_NODES[number]
    current: number
    range: { min: number; max: number }
  }>
  goalOutcomeId: string
}

function PlanCard({ solver, rows, goalOutcomeId }: PlanCardProps) {
  const changedRows = rows.filter(({ node, current }) => {
    const v = solver.values[node.id] ?? current
    return Math.abs(v - current) > 1e-9
  })

  if (changedRows.length === 0) {
    return (
      <div className="text-[11px] text-slate-500 bg-slate-50 rounded-md border border-slate-200 p-2">
        Solver converged without moving any levers — target already reachable at baseline.
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-serif-plan', goalOutcomeId)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="rounded-md border border-primary-200 bg-primary-50/40 p-2 cursor-grab active:cursor-grabbing"
      title="Drag this plan onto the Propagate panel to load its values"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <ArrowLeftRight className="w-3.5 h-3.5 text-primary-600" />
        <div className="text-[11px] font-semibold text-primary-800">
          Plan · {changedRows.length} lever{changedRows.length === 1 ? '' : 's'} to move
        </div>
        <div className="ml-auto text-[9px] text-primary-600 uppercase tracking-wider">
          drag → Propagate
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {changedRows.map(({ node, current }) => {
          const v = solver.values[node.id] ?? current
          return (
            <div
              key={node.id}
              className="text-[10px] bg-white rounded border border-primary-100 px-1.5 py-1 flex items-baseline justify-between gap-1"
            >
              <span className="font-medium text-slate-700 truncate">{node.label}</span>
              <span className="text-[10px] text-slate-400 tabular-nums">
                {formatNodeValue(current, node)}→
              </span>
              <span className="text-[11px] font-semibold text-primary-700 tabular-nums">
                {formatNodeValue(v, node)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Propagate drop zone ──────────────────────────────────────────

interface PropagateDropZoneProps {
  children: React.ReactNode
  onDropPlan: () => void
}

function PropagateDropZone({ children, onDropPlan }: PropagateDropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-serif-plan')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes('application/x-serif-plan')) {
          e.preventDefault()
          setDragOver(false)
          onDropPlan()
        }
      }}
      className={cn(
        'rounded-lg transition-all relative',
        dragOver && 'ring-2 ring-primary-400 ring-offset-1 bg-primary-50/40',
      )}
    >
      {children}
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-primary-500 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full shadow-lg">
            Drop to load plan into controls
          </div>
        </div>
      )}
    </div>
  )
}

export default TwinViewWorkspace
