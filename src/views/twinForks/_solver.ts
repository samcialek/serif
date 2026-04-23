/**
 * Shared inverse-solver hook — coordinate descent over the credible lever
 * set, optimizing signed-timed-effect on a chosen goal outcome.
 *
 * Extracted from TwinViewSolve so Deck/LivingGraph/Workspace can all invoke
 * the same "find a plan that moves Y by X" engine. The hook owns:
 *   - current trial `values` (so the parent can render sliders animating in)
 *   - `history` (the per-iteration trail for live visualisation)
 *   - `solved` (the final step, tagged with error tolerance)
 *   - `isSolving` + cancel semantics
 *
 * The parent passes in the participant, credible lever rows, and a goal.
 * The hook exposes `start(goal, targetSigned)` and `cancel()` / `reset()`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ParticipantPortal } from '@/data/portal/types'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import { cumulativeEffectFraction, horizonDaysFor } from '@/data/scm/outcomeHorizons'
import { canonicalOutcomeKey } from '@/components/portal/InsightRow'
import {
  MANIPULABLE_NODES,
  type GoalCandidate,
  type ManipulableNode,
  buildObservedValues,
} from './_shared'

// ─── Types ────────────────────────────────────────────────────────

export interface SolverStep {
  iter: number
  values: Record<string, number>
  achieved: number
  error: number
  moved?: string
}

export interface SolverRow {
  node: ManipulableNode
  current: number
  range: { min: number; max: number }
}

interface UseTwinSolverOpts {
  participant: ParticipantPortal | null
  rows: SolverRow[]
  atDays: number
  runFullCounterfactual: (
    obs: Record<string, number>,
    deltas: Array<{ nodeId: string; value: number; originalValue: number }>,
  ) => FullCounterfactualState
  maxIter?: number
  iterDelayMs?: number
  onSolved?: (step: SolverStep) => void
}

// ─── Objective: signed timed effect on the goal ──────────────────

export function signedTimedEffect(
  state: FullCounterfactualState | null,
  goalOutcome: string,
  atDays: number,
  direction: 'higher' | 'lower',
): number {
  if (!state) return 0
  for (const e of state.allEffects.values()) {
    if (canonicalOutcomeKey(e.nodeId) !== canonicalOutcomeKey(goalOutcome)) continue
    const horizonDays = horizonDaysFor(canonicalOutcomeKey(e.nodeId)) ?? 30
    const fraction = cumulativeEffectFraction(atDays, horizonDays)
    const timed = e.totalEffect * fraction
    return direction === 'higher' ? timed : -timed
  }
  return 0
}

// ─── Hook ────────────────────────────────────────────────────────

export function useTwinSolver({
  participant,
  rows,
  atDays,
  runFullCounterfactual,
  maxIter = 40,
  iterDelayMs = 55,
  onSolved,
}: UseTwinSolverOpts) {
  // Baseline = the member's current value for each credible lever.
  const baseline = (() => {
    const base: Record<string, number> = {}
    for (const { node, current } of rows) base[node.id] = current
    return base
  })()

  const [values, setValues] = useState<Record<string, number>>(baseline)
  const [history, setHistory] = useState<SolverStep[]>([])
  const [isSolving, setIsSolving] = useState(false)
  const [solved, setSolved] = useState<SolverStep | null>(null)

  const cancelRef = useRef(false)
  const timeoutRef = useRef<number | null>(null)

  // Sync to a new baseline whenever the participant/row-set changes.
  const baselineKey = JSON.stringify(baseline)
  useEffect(() => {
    setValues({ ...baseline })
    setHistory([])
    setSolved(null)
    cancelRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineKey])

  useEffect(
    () => () => {
      if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
      cancelRef.current = true
    },
    [],
  )

  const runAt = useCallback(
    (vals: Record<string, number>): FullCounterfactualState | null => {
      if (!participant) return null
      const observed = buildObservedValues(participant)
      const deltas = rows
        .filter(({ node, current }) => Math.abs((vals[node.id] ?? current) - current) > 1e-9)
        .map(({ node, current }) => ({
          nodeId: node.id,
          value: vals[node.id] ?? current,
          originalValue: current,
        }))
      if (deltas.length === 0) {
        return { allEffects: new Map() } as unknown as FullCounterfactualState
      }
      try {
        return runFullCounterfactual(observed, deltas)
      } catch (err) {
        console.warn('[useTwinSolver] iteration failed:', err)
        return null
      }
    },
    [participant, rows, runFullCounterfactual],
  )

  const cancel = useCallback(() => {
    cancelRef.current = true
    if (timeoutRef.current != null) window.clearTimeout(timeoutRef.current)
    setIsSolving(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    setValues({ ...baseline })
    setHistory([])
    setSolved(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel, baselineKey])

  const start = useCallback(
    (goal: GoalCandidate, targetSigned: number, opts?: { maximize?: boolean }) => {
      if (!participant || rows.length === 0) return
      cancelRef.current = false
      setIsSolving(true)
      setSolved(null)

      // Maximize mode: ignore the target tolerance and keep stepping while
      // any lever still offers improvement in signedTimedEffect. The user's
      // expectation for the per-outcome Optimize button is "show me the
      // *best* plan", not "satisfy a small target with one cheap move".
      const maximize = opts?.maximize === true

      let current = { ...baseline }
      setValues(current)
      const trail: SolverStep[] = []

      const step = (iter: number) => {
        if (cancelRef.current) {
          setIsSolving(false)
          return
        }
        const state = runAt(current)
        const achieved = signedTimedEffect(state, goal.outcomeId, atDays, goal.direction)
        const error = targetSigned - achieved
        const entry: SolverStep = { iter, values: { ...current }, achieved, error }
        trail.push(entry)
        setHistory([...trail])

        if (iter >= maxIter) {
          setSolved(entry)
          setIsSolving(false)
          onSolved?.(entry)
          return
        }
        if (!maximize) {
          const tol = Math.max(0.5, Math.abs(targetSigned) * 0.03)
          if (Math.abs(error) < tol) {
            setSolved(entry)
            setIsSolving(false)
            onSolved?.(entry)
            return
          }
        }

        // In target-seeking mode wantSign flips when overshooting; in
        // maximize mode we always want signedTimedEffect to go up.
        const wantSign = maximize ? 1 : error > 0 ? 1 : -1
        let bestGain = 0
        let bestLeverId: string | null = null
        let bestNewValue = 0
        const stepScale = 1 + Math.floor(iter / 10)

        for (const { node, current: cv, range } of rows) {
          for (const dir of [-1, 1] as const) {
            const candidate = Math.max(
              range.min,
              Math.min(range.max, (current[node.id] ?? cv) + dir * node.step * stepScale),
            )
            if (Math.abs(candidate - (current[node.id] ?? cv)) < 1e-9) continue
            const trial = { ...current, [node.id]: candidate }
            const trialState = runAt(trial)
            const trialAchieved = signedTimedEffect(
              trialState,
              goal.outcomeId,
              atDays,
              goal.direction,
            )
            const gain = maximize
              ? (trialAchieved - achieved) * wantSign
              : (Math.abs(error) - Math.abs(targetSigned - trialAchieved)) * wantSign
            // Tiny travel-cost tiebreaker so the solver prefers cheaper
            // moves when two levers offer the same gain. Kept much smaller
            // in maximize mode (0.001) so it never blocks a real-but-small
            // improvement on a far-travel lever.
            const travelCost = Math.abs(candidate - cv) / (range.max - range.min || 1)
            const score = gain - travelCost * (maximize ? 0.001 : 0.05)
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
          onSolved?.(entry)
          return
        }
        current = { ...current, [bestLeverId]: bestNewValue }
        entry.moved = bestLeverId
        setValues(current)
        timeoutRef.current = window.setTimeout(() => step(iter + 1), iterDelayMs)
      }

      step(0)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participant, rows, baselineKey, atDays, runAt, maxIter, iterDelayMs, onSolved],
  )

  return {
    values,
    setValues,
    history,
    isSolving,
    solved,
    start,
    cancel,
    reset,
    baseline,
  }
}

// ─── Helper: filter MANIPULABLE_NODES by credibility ────────────────

export function leverRows(
  participant: ParticipantPortal,
  credible: Set<string>,
  rangeForFn: (n: ManipulableNode, current: number) => { min: number; max: number },
): SolverRow[] {
  return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
    const current = participant.current_values?.[node.id] ?? node.defaultValue
    return { node, current, range: rangeForFn(node, current) }
  })
}
