/**
 * Fork I (v1) — Deck (cockpit).
 *
 * Dense single-surface layout: varied tactile controls at top, outcome list
 * in the middle, live causal graph at the bottom. Drag-and-drop returns as
 * the on-ramp to abduction: drop an outcome card into the "Goal" slot to
 * flip the cockpit into solver mode. A slide-in drawer shows the plan
 * evolving; an "Apply plan" button copies the solver's lever values back
 * into the control widgets (so propagation and abduction live on the same
 * surface, not in two different screens).
 *
 * Both propagation (tweak levers, watch outcomes + particles) and abduction
 * (set a goal, let the solver move the levers) are first-class here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
import { useTwinSolver, leverRows } from './_solver'

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

// ─── Outcome card (draggable) ─────────────────────────────────────

interface OutcomeCardProps {
  effect: NodeEffect
  atDays: number
  onSetGoal: (id: string) => void
  isGoal: boolean
}

function OutcomeCard({ effect, atDays, onSetGoal, isGoal }: OutcomeCardProps) {
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
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-serif-outcome', key)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors bg-white',
        isGoal ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneColor)} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400 truncate">
          {Math.round(fraction * 100)}% realised · drag onto Goal
        </div>
      </div>
      <DecayCurve
        horizonDays={horizonDays}
        atDays={atDays}
        tone={tone}
        widthPx={56}
        heightPx={20}
      />
      <div className="text-right flex-shrink-0 w-20">
        <div className={cn('text-[12px] font-semibold tabular-nums', toneColor)}>
          {formatEffectDelta(timedEffect, effect.nodeId)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSetGoal(key)}
        className={cn(
          'text-[10px] px-1.5 py-1 rounded flex items-center gap-0.5 flex-shrink-0',
          isGoal
            ? 'bg-emerald-100 text-emerald-700'
            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50',
        )}
        title={isGoal ? 'Current goal' : 'Use as goal'}
      >
        <Target className="w-3 h-3" />
      </button>
    </div>
  )
}

// ─── Goal drop slot ────────────────────────────────────────────────

interface GoalSlotProps {
  goalOutcomeId: string | null
  onSetGoal: (id: string | null) => void
}

function GoalSlot({ goalOutcomeId, onSetGoal }: GoalSlotProps) {
  const [dragOver, setDragOver] = useState(false)
  const label = goalOutcomeId
    ? OUTCOME_META[goalOutcomeId]?.noun ?? friendlyName(goalOutcomeId)
    : null

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-serif-outcome')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData('application/x-serif-outcome')
        if (id) onSetGoal(id)
      }}
      className={cn(
        'rounded-lg border-2 border-dashed p-3 transition-all flex items-center gap-2',
        dragOver
          ? 'border-emerald-400 bg-emerald-50'
          : goalOutcomeId
            ? 'border-emerald-200 bg-emerald-50/60'
            : 'border-slate-300 bg-slate-50/80',
      )}
    >
      <Target
        className={cn(
          'w-4 h-4 flex-shrink-0',
          goalOutcomeId ? 'text-emerald-600' : 'text-slate-400',
        )}
      />
      <div className="flex-1 min-w-0">
        {goalOutcomeId ? (
          <>
            <div className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wide">
              Goal locked in
            </div>
            <div className="text-[13px] font-semibold text-emerald-900 truncate">{label}</div>
          </>
        ) : (
          <>
            <div className="text-[11px] font-semibold text-slate-600">Drop an outcome here</div>
            <div className="text-[10px] text-slate-400">— or click any 🎯 — to switch to abduction</div>
          </>
        )}
      </div>
      {goalOutcomeId && (
        <button
          onClick={() => onSetGoal(null)}
          className="p-1 rounded text-emerald-600 hover:bg-emerald-100"
          title="Clear goal"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────

export function TwinViewDeck() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [goalOutcomeId, setGoalOutcomeId] = useState<string | null>(null)
  const [activeLever, setActiveLever] = useState<string | null>(null)
  const [targetSize, setTargetSize] = useState(5)
  const solverPanelOpen = goalOutcomeId != null

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current, range: rangeFor(node, current) }
    })
  }, [participant])

  // Live counterfactual (point estimate, no MC — keeps it snappy).
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
      console.warn('[TwinViewDeck] cf failed:', err)
      return null
    }
  }, [participant, deltas, runFullCounterfactual])

  // Graph geometry & data
  const layout = useMemo(() => defaultLayout(900, 420), [])
  const graph = useMemo(() => {
    if (!participant) return { nodes: [], edges: [] }
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return buildGraph(participant.effects_bayesian, credible, layout)
  }, [participant, layout])
  const graphOutcomeIds = useMemo(
    () => new Set(graph.nodes.filter((n) => n.kind === 'outcome').map((n) => n.id)),
    [graph],
  )
  const outcomeDeltas = useMemo(
    () => outcomeDeltasAt(state, AT_DAYS, graphOutcomeIds),
    [state, graphOutcomeIds],
  )

  // Outcome list (filtered + sorted)
  const sortedEffects = useMemo(() => {
    if (!state) return []
    const seen = new Set<string>()
    const out: NodeEffect[] = []
    for (const e of state.allEffects.values()) {
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
  }, [state])

  // ─── Solver hook ─────────────────────────────────────────────────

  const solver = useTwinSolver({
    participant,
    rows: interventionRows,
    atDays: AT_DAYS,
    runFullCounterfactual,
  })

  // Apply the solver's plan to the control widgets.
  const applyPlan = useCallback(() => {
    setProposedValues({ ...solver.values })
  }, [solver.values])

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

  if (pid == null) {
    return (
      <PageLayout title="Twin · Deck">
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
      <PageLayout title="Twin · Deck">
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

  return (
    <PageLayout
      title="Twin · Deck"
      subtitle="Cockpit view. Varied tactile controls, live outcomes, and a causal graph — drop an outcome into Goal to flip into solver mode."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Cockpit · at {formatHorizonShort(AT_DAYS)}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {deltas.length > 0 && (
              <button
                onClick={() => setProposedValues({})}
                className="text-[11px] flex items-center gap-1 px-2 py-1.5 rounded border text-slate-600 border-slate-200 hover:bg-slate-50"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        <MethodBadge />

        {/* ─── CONTROLS (top) ─── */}
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Daily levers
              </div>
              <div className="text-[10px] text-slate-400">
                Each control is shaped to its lever. Dial / fader / gauge / stations.
              </div>
            </div>
            <DeckControlGrid
              rows={interventionRows}
              values={proposedValues}
              activeLever={activeLever}
              onChange={(id, v) => {
                setActiveLever(id)
                setProposedValues((p) => ({ ...p, [id]: v }))
                window.setTimeout(
                  () => setActiveLever((cur) => (cur === id ? null : cur)),
                  500,
                )
              }}
              onResetLever={(id) =>
                setProposedValues((p) => {
                  const { [id]: _removed, ...rest } = p
                  return rest
                })
              }
            />
          </div>
        </Card>

        {/* ─── OUTCOMES + GOAL SLOT ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
          <Card>
            <div className="p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Outcomes at {formatHorizonShort(AT_DAYS)}
              </div>
              {sortedEffects.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-slate-400">
                  Dial in a change above. Outcomes and particles stream in live.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sortedEffects.map((effect) => (
                    <OutcomeCard
                      key={effect.nodeId}
                      effect={effect}
                      atDays={AT_DAYS}
                      isGoal={canonicalOutcomeKey(effect.nodeId) === goalOutcomeId}
                      onSetGoal={setGoalOutcomeId}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-3 space-y-3">
              <GoalSlot goalOutcomeId={goalOutcomeId} onSetGoal={setGoalOutcomeId} />
              <AnimatePresence mode="wait">
                {goalCandidate ? (
                  <motion.div
                    key="solver"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-3"
                  >
                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="text-[11px] font-semibold text-slate-700">
                          Target size
                        </div>
                        <div className="text-xs font-bold text-primary-700 tabular-nums">
                          {goalCandidate.direction === 'higher' ? '+' : '−'}
                          {formatOutcomeValue(
                            Math.abs(targetSize),
                            canonicalOutcomeKey(goalCandidate.outcomeId),
                          )}{' '}
                          {goalUnit}
                        </div>
                      </div>
                      <Slider
                        min={1}
                        max={20}
                        step={0.5}
                        value={targetSize}
                        onChange={setTargetSize}
                      />
                    </div>

                    {solver.isSolving ? (
                      <Button onClick={solver.cancel} className="w-full">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Searching · iter {solver.history.length}/40
                      </Button>
                    ) : solver.solved ? (
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => solver.start(goalCandidate, targetSize)}
                          className="flex-1"
                        >
                          <Wand2 className="w-4 h-4 mr-2" />
                          Solve again
                        </Button>
                        <Button onClick={applyPlan} variant="secondary" className="flex-1">
                          <Check className="w-4 h-4 mr-2" />
                          Apply plan
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => solver.start(goalCandidate, targetSize)}
                        className="w-full"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Solve for this goal
                      </Button>
                    )}

                    {(solver.isSolving || solver.solved) && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-baseline justify-between text-[11px]">
                          <span className="text-slate-500">Achieved</span>
                          <span className="tabular-nums font-semibold text-slate-700">
                            {formatEffectDelta(
                              goalCandidate.direction === 'higher' ? achieved : -achieved,
                              goalCandidate.outcomeId,
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
                        {solver.solved && (
                          <div className="text-[10px] text-slate-500">
                            {Math.abs(solver.solved.error) <
                            Math.max(0.5, Math.abs(targetSize) * 0.03)
                              ? `Hit target in ${solver.solved.iter + 1} iterations. Click "Apply plan" to load the solution into the controls above.`
                              : `Search exhausted. Closest reachable: ${formatEffectDelta(
                                  goalCandidate.direction === 'higher'
                                    ? solver.solved.achieved
                                    : -solver.solved.achieved,
                                  goalCandidate.outcomeId,
                                )}.`}
                          </div>
                        )}
                      </div>
                    )}

                    {solver.history.length > 0 && (
                      <div className="pt-1 border-t border-slate-100">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                          Plan in progress
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {interventionRows.map(({ node, current, range }) => {
                            const value = solver.values[node.id] ?? current
                            const changed = Math.abs(value - current) > 1e-9
                            const pct = ((value - range.min) / (range.max - range.min)) * 100
                            const curPct = ((current - range.min) / (range.max - range.min)) * 100
                            if (!changed) return null
                            return (
                              <div
                                key={node.id}
                                className="rounded-md p-1.5 border border-slate-100 bg-slate-50"
                              >
                                <div className="flex items-baseline justify-between gap-1 mb-1">
                                  <div className="text-[10px] font-medium text-slate-700 truncate">
                                    {node.label}
                                  </div>
                                  <div className="text-[10px] font-semibold text-primary-700 tabular-nums">
                                    {formatNodeValue(value, node)}
                                  </div>
                                </div>
                                <div className="relative h-1 bg-slate-100 rounded-full">
                                  <div
                                    className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-slate-400"
                                    style={{ left: `${curPct}%`, transform: 'translate(-50%, -50%)' }}
                                  />
                                  <div
                                    className="absolute top-0 h-full bg-primary-400 rounded-full"
                                    style={{
                                      left: `${Math.min(pct, curPct)}%`,
                                      width: `${Math.abs(pct - curPct)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="noop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] text-slate-400 leading-relaxed pt-1"
                  >
                    With no goal set, you're in <span className="font-semibold">propagation</span> mode.
                    The outcomes list, particles, and graph below update as you turn any control.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </div>

        {/* ─── GRAPH (bottom) ─── */}
        <Card>
          <div className="p-2">
            <div className="flex items-center justify-between mb-1 px-2 pt-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Causal graph · {solverPanelOpen ? 'reverse flow — solver pulling through the DAG' : 'forward flow — tweak any control to stream particles'}
              </div>
            </div>
            <CausalGraphCanvas
              nodes={graph.nodes}
              edges={graph.edges}
              outcomeDeltas={outcomeDeltas}
              activeLever={activeLever}
              goalOutcomeId={goalOutcomeId}
              particleDirection={solverPanelOpen && solver.isSolving ? 'reverse' : 'forward'}
              layout={layout}
              onOutcomeClick={(id) => setGoalOutcomeId((prev) => (prev === id ? null : id))}
              proposedLevers={new Set(Object.keys(proposedValues))}
            />
          </div>
        </Card>
      </motion.div>
    </PageLayout>
  )
}

// ─── Control grid (layout of varied widgets) ──────────────────────

interface DeckControlGridProps {
  rows: Array<{
    node: typeof MANIPULABLE_NODES[number]
    current: number
    range: { min: number; max: number }
  }>
  values: Record<string, number>
  activeLever: string | null
  onChange: (id: string, v: number) => void
  onResetLever: (id: string) => void
}

function DeckControlGrid({ rows, values, onChange, onResetLever }: DeckControlGridProps) {
  // Lay out by affordance family so the user sees a "pad of mixed controls."
  // Heavy rotary / gauge controls up front, faders middle, stations + stepper
  // at the end.
  const order = [
    'bedtime',
    'sleep_duration',
    'active_energy',
    'dietary_energy',
    'training_volume',
    'running_volume',
    'zone2_volume',
    'dietary_protein',
    'steps',
  ]
  const ordered = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.node.id, r]))
    return order.map((id) => byId.get(id)).filter(Boolean) as typeof rows
  }, [rows])

  const circularRow = ordered.filter((r) =>
    ['bedtime', 'sleep_duration', 'active_energy', 'dietary_energy'].includes(r.node.id),
  )
  const faderRow = ordered.filter((r) =>
    ['training_volume', 'running_volume', 'zone2_volume'].includes(r.node.id),
  )
  const stationsRow = ordered.filter((r) =>
    ['dietary_protein', 'steps'].includes(r.node.id),
  )

  return (
    <div className="space-y-3">
      {/* Row 1: round, gauge-like */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {circularRow.map(({ node, current }) => {
          const value = values[node.id] ?? current
          const changed = Math.abs(value - current) > 1e-9
          return (
            <ControlFrame
              key={node.id}
              changed={changed}
              onReset={() => onResetLever(node.id)}
            >
              <AutoControl
                node={node}
                current={current}
                value={value}
                onChange={(v) => onChange(node.id, v)}
              />
            </ControlFrame>
          )
        })}
      </div>

      {/* Row 2: faders */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {faderRow.map(({ node, current }) => {
          const value = values[node.id] ?? current
          const changed = Math.abs(value - current) > 1e-9
          // VerticalFader for training_volume (the "channel"), horizontal for the rest.
          return (
            <ControlFrame
              key={node.id}
              changed={changed}
              onReset={() => onResetLever(node.id)}
            >
              <AutoControl
                node={node}
                current={current}
                value={value}
                onChange={(v) => onChange(node.id, v)}
              />
            </ControlFrame>
          )
        })}
      </div>

      {/* Row 3: stations + stepper */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {stationsRow.map(({ node, current }) => {
          const value = values[node.id] ?? current
          const changed = Math.abs(value - current) > 1e-9
          return (
            <ControlFrame
              key={node.id}
              changed={changed}
              onReset={() => onResetLever(node.id)}
            >
              <AutoControl
                node={node}
                current={current}
                value={value}
                onChange={(v) => onChange(node.id, v)}
              />
            </ControlFrame>
          )
        })}
      </div>
    </div>
  )
}

export default TwinViewDeck
