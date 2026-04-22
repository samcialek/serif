/**
 * Fork G — Inverse goal solver.
 *
 * Flips the twin from forward ("what happens if I change X?") to inverse
 * ("what minimum set of changes gets me to outcome Y by Z%?"). The
 * solver is coordinate descent over the credible-at-horizon lever set:
 * each iteration tries ±step on every lever and keeps the move with
 * best improvement per unit of lever travel.
 *
 * Demo punch: we animate the search — sliders crawl to their final
 * positions over ~30 iterations, giving the feeling of watching the
 * engine reason about a plan.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Loader2,
  Play,
  RotateCcw,
  Target,
  TrendingUp,
  Users as UsersIcon,
  Wand2,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import { cumulativeEffectFraction, horizonDaysFor } from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue } from '@/utils/rounding'
import { leversAvailableAt, filterCredibleLevers } from '@/data/scm/leverCredibility'
import {
  MANIPULABLE_NODES,
  GOAL_CANDIDATES,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  buildObservedValues,
  MethodBadge,
} from './_shared'

const AT_DAYS = 90
const MAX_ITER = 40
const ITER_DELAY_MS = 55

interface SolverStep {
  iter: number
  values: Record<string, number>
  achieved: number
  error: number
  moved?: string
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

// ─── Goal picker ───────────────────────────────────────────────────

interface GoalPickerProps {
  selectedId: string
  onSelect: (id: string) => void
}

function GoalPicker({ selectedId, onSelect }: GoalPickerProps) {
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
    <div className="space-y-2">
      {groups.map(([groupName, items]) => (
        <div key={groupName}>
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            {groupName}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {items.map((g) => (
              <button
                key={g.outcomeId}
                onClick={() => onSelect(g.outcomeId)}
                className={cn(
                  'text-[11px] px-2 py-1 rounded border transition-colors',
                  selectedId === g.outcomeId
                    ? 'bg-primary-50 text-primary-700 border-primary-200 font-medium'
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

// ─── Solver ───────────────────────────────────────────────────────
//
// Coordinate descent with a "work per unit lever travel" objective.
// We measure timedEffect (= totalEffect * fraction(atDays)) on the
// goal outcome because that's what the user sees in the output column.

function signedTimedEffect(
  state: FullCounterfactualState | null,
  goalOutcome: string,
  atDays: number,
  direction: 'higher' | 'lower',
): number {
  if (!state) return 0
  // effects is keyed by nodeId (the outcome); canonicalize and search
  for (const e of state.allEffects.values()) {
    if (canonicalOutcomeKey(e.nodeId) !== canonicalOutcomeKey(goalOutcome)) continue
    const horizonDays = horizonDaysFor(canonicalOutcomeKey(e.nodeId)) ?? 30
    const fraction = cumulativeEffectFraction(atDays, horizonDays)
    const timed = e.totalEffect * fraction
    return direction === 'higher' ? timed : -timed
  }
  return 0
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinViewSolve() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [goalId, setGoalId] = useState<string>('hrv_daily')
  const [targetSigned, setTargetSigned] = useState(5) // "raise by 5ms" or "lower by 5mg/dL"
  const [values, setValues] = useState<Record<string, number>>({})
  const [history, setHistory] = useState<SolverStep[]>([])
  const [isSolving, setIsSolving] = useState(false)
  const [solved, setSolved] = useState<SolverStep | null>(null)
  const cancelRef = useRef(false)

  const goal = useMemo(
    () => GOAL_CANDIDATES.find((g) => g.outcomeId === goalId) ?? GOAL_CANDIDATES[0],
    [goalId],
  )
  const goalMeta = OUTCOME_META[canonicalOutcomeKey(goal.outcomeId)]
  const goalUnit = goalMeta?.unit ?? ''

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', AT_DAYS)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current, range: rangeFor(node, current) }
    })
  }, [participant])

  const baseline = useMemo(() => {
    const base: Record<string, number> = {}
    for (const { node, current } of interventionRows) base[node.id] = current
    return base
  }, [interventionRows])

  // Sync values to baseline whenever participant or intervention set changes.
  useEffect(() => {
    setValues({ ...baseline })
    setHistory([])
    setSolved(null)
  }, [baseline])

  const runAt = useCallback(
    (vals: Record<string, number>): FullCounterfactualState | null => {
      if (!participant) return null
      const credibleOverrides = filterCredibleLevers({}, 'stateOverride', AT_DAYS)
      const observed = buildObservedValues(participant, credibleOverrides)
      const deltas = interventionRows
        .filter(({ node, current }) => Math.abs((vals[node.id] ?? current) - current) > 1e-9)
        .map(({ node, current }) => ({
          nodeId: node.id,
          value: vals[node.id] ?? current,
          originalValue: current,
        }))
      if (deltas.length === 0) {
        return {
          allEffects: new Map(),
        } as unknown as FullCounterfactualState
      }
      try {
        return runFullCounterfactual(observed, deltas)
      } catch (err) {
        console.warn('[TwinViewSolve] iteration failed:', err)
        return null
      }
    },
    [participant, interventionRows, runFullCounterfactual],
  )

  const cancelSolve = useCallback(() => {
    cancelRef.current = true
    setIsSolving(false)
  }, [])

  const startSolve = useCallback(() => {
    if (!participant || interventionRows.length === 0) return
    cancelRef.current = false
    setIsSolving(true)
    setSolved(null)

    let current = { ...baseline }
    setValues(current)
    const trail: SolverStep[] = []

    const step = (iter: number) => {
      if (cancelRef.current) {
        setIsSolving(false)
        return
      }
      const state = runAt(current)
      const achieved = signedTimedEffect(state, goal.outcomeId, AT_DAYS, goal.direction)
      const error = targetSigned - achieved
      const entry: SolverStep = { iter, values: { ...current }, achieved, error }
      trail.push(entry)
      setHistory([...trail])

      if (Math.abs(error) < Math.max(0.5, Math.abs(targetSigned) * 0.03) || iter >= MAX_ITER) {
        setSolved(entry)
        setIsSolving(false)
        return
      }

      // Direction of helpfulness: positive error → want achieved to go up.
      const wantSign = error > 0 ? 1 : -1

      let bestGain = 0
      let bestLeverId: string | null = null
      let bestNewValue = 0
      const stepScale = 1 + Math.floor(iter / 10) // larger steps late in search

      for (const { node, current: cv, range } of interventionRows) {
        for (const dir of [-1, 1] as const) {
          const candidate = Math.max(
            range.min,
            Math.min(range.max, (current[node.id] ?? cv) + dir * node.step * stepScale),
          )
          if (Math.abs(candidate - (current[node.id] ?? cv)) < 1e-9) continue
          const trial = { ...current, [node.id] : candidate }
          const trialState = runAt(trial)
          const trialAchieved = signedTimedEffect(trialState, goal.outcomeId, AT_DAYS, goal.direction)
          const trialError = targetSigned - trialAchieved
          const gain = (Math.abs(error) - Math.abs(trialError)) * wantSign * (trialAchieved - achieved > 0 ? 1 : 1)
          // Penalize cost: how far from baseline this move takes the lever,
          // measured in step units. Keeps the solution from running to the
          // rails on lever with weak effect.
          const travelCost =
            Math.abs(candidate - cv) / (range.max - range.min || 1)
          const score = gain - travelCost * 0.05
          if (score > bestGain) {
            bestGain = score
            bestLeverId = node.id
            bestNewValue = candidate
          }
        }
      }

      if (bestLeverId === null) {
        setSolved(entry)
        setIsSolving(false)
        return
      }
      current = { ...current, [bestLeverId]: bestNewValue }
      entry.moved = bestLeverId
      setValues(current)

      window.setTimeout(() => step(iter + 1), ITER_DELAY_MS)
    }

    step(0)
  }, [participant, interventionRows, baseline, goal, targetSigned, runAt])

  const resetValues = useCallback(() => {
    cancelRef.current = true
    setIsSolving(false)
    setValues({ ...baseline })
    setHistory([])
    setSolved(null)
  }, [baseline])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Solve">
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
      <PageLayout title="Twin · Solve">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const latest = history[history.length - 1]
  const achieved = latest?.achieved ?? 0
  const progress = Math.max(0, Math.min(1, Math.abs(achieved) / Math.abs(targetSigned || 1)))
  const absoluteTargetLabel = `${goal.direction === 'higher' ? '+' : '−'}${formatOutcomeValue(Math.abs(targetSigned), canonicalOutcomeKey(goal.outcomeId))} ${goalUnit}`

  return (
    <PageLayout
      title="Twin · Solve"
      subtitle="Inverse mode. Pick a goal and target size — the engine searches the lever space for the minimum-effort plan that gets there."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Goal-solver demo
            </div>
          </div>
        </div>

        <MethodBadge />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
          <Card>
            <div className="p-3 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-slate-400" />
                  Goal
                </div>
                <GoalPicker
                  selectedId={goalId}
                  onSelect={(id) => {
                    setGoalId(id)
                    setHistory([])
                    setSolved(null)
                  }}
                />
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-baseline justify-between">
                  <span>Target size</span>
                  <span className="text-xs font-bold text-primary-700 tabular-nums">
                    {absoluteTargetLabel}
                  </span>
                </div>
                <Slider
                  min={1}
                  max={20}
                  step={0.5}
                  value={targetSigned}
                  onChange={(v) => {
                    setTargetSigned(v)
                    setHistory([])
                    setSolved(null)
                  }}
                />
                <div className="text-[10px] text-slate-400 mt-1">
                  at {formatHorizonShort(AT_DAYS)} horizon
                </div>
              </div>

              <div className="pt-1">
                {isSolving ? (
                  <Button onClick={cancelSolve} className="w-full">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Searching · iter {history.length}/{MAX_ITER}
                  </Button>
                ) : solved ? (
                  <div className="flex items-center gap-2">
                    <Button onClick={startSolve} className="flex-1">
                      <Wand2 className="w-4 h-4 mr-2" />
                      Solve again
                    </Button>
                    <button
                      onClick={resetValues}
                      className="text-[11px] flex items-center gap-1 px-2 py-2 rounded border text-slate-600 border-slate-200 hover:bg-slate-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset
                    </button>
                  </div>
                ) : (
                  <Button onClick={startSolve} className="w-full">
                    <Play className="w-4 h-4 mr-2" />
                    Solve
                  </Button>
                )}
              </div>

              {(isSolving || solved) && (
                <div className="pt-2 space-y-1.5 border-t border-slate-100">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">Achieved so far</span>
                    <span className="tabular-nums font-semibold text-slate-700">
                      {formatEffectDelta(
                        goal.direction === 'higher' ? achieved : -achieved,
                        goal.outcomeId,
                      )}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ duration: 0.18 }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Target: {absoluteTargetLabel}
                    {latest && (
                      <>
                        {' · '}
                        Shortfall: {(Math.abs(latest.error)).toFixed(2)} {goalUnit}
                      </>
                    )}
                  </div>
                </div>
              )}

              <AnimatePresence>
                {solved && Math.abs(solved.error) < Math.max(0.5, Math.abs(targetSigned) * 0.03) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md p-2"
                  >
                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                    Found a plan that hits your target in {solved.iter + 1} iterations.
                  </motion.div>
                )}
                {solved && Math.abs(solved.error) >= Math.max(0.5, Math.abs(targetSigned) * 0.03) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2"
                  >
                    <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                    Search exhausted. The closest the model can get to your target with this
                    lever set is {formatEffectDelta(
                      goal.direction === 'higher' ? solved.achieved : -solved.achieved,
                      goal.outcomeId,
                    )}. Consider a smaller target or a longer horizon.
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>

          <Card>
            <div className="p-3 space-y-2">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Evolving plan
                </div>
                <div className="text-[10px] text-slate-400">
                  {history.length > 0
                    ? `${history[history.length - 1].moved ? `last move: ${history[history.length - 1].moved}` : 'initial'}`
                    : 'waiting for solve'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {interventionRows.map(({ node, current, range }) => {
                  const value = values[node.id] ?? current
                  const changed = Math.abs(value - current) > 1e-9
                  const justMoved = latest?.moved === node.id
                  return (
                    <motion.div
                      key={node.id}
                      animate={
                        justMoved
                          ? {
                              backgroundColor: [
                                'rgb(241 245 249)',
                                'rgb(224 231 255)',
                                'rgb(241 245 249)',
                              ],
                            }
                          : {}
                      }
                      transition={{ duration: 0.4 }}
                      className={cn(
                        'rounded-md p-2 border',
                        changed ? 'border-primary-200' : 'border-slate-100',
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
                        <div className="text-[11px] font-semibold text-slate-700 truncate">
                          {node.label}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] text-slate-400">
                            {formatNodeValue(current, node)}→
                          </span>
                          <motion.span
                            key={value}
                            initial={{ opacity: 0.3 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.18 }}
                            className={cn(
                              'text-[11px] font-medium tabular-nums ml-0.5 inline-block',
                              changed ? 'text-primary-700' : 'text-slate-800',
                            )}
                          >
                            {formatNodeValue(value, node)}
                          </motion.span>
                        </div>
                      </div>
                      <div className="relative h-1.5 bg-slate-100 rounded-full">
                        <motion.div
                          className="absolute h-full bg-primary-400 rounded-full"
                          animate={{
                            left: `${((Math.min(value, current) - range.min) / (range.max - range.min)) * 100}%`,
                            width: `${(Math.abs(value - current) / (range.max - range.min)) * 100}%`,
                          }}
                          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                        />
                        {/* Baseline marker */}
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-slate-500"
                          style={{
                            left: `${((current - range.min) / (range.max - range.min)) * 100}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        />
                      </div>
                    </motion.div>
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

export default TwinViewSolve
