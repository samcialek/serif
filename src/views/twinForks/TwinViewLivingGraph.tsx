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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { Card, Button, Slider, PersonaPortrait } from '@/components/common'
import type { PersonaPortraitStat } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { useBartTwin } from '@/hooks/useBartTwin'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import type { MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import { formatOutcomeValue } from '@/utils/rounding'
import { horizonBandFor, CURATED_LONGEVITY_OUTCOMES } from '@/data/scm/outcomeHorizons'
import { buildPhase1SyntheticEdges } from '@/data/scm/syntheticEdges'
import {
  MANIPULABLE_NODES,
  GOAL_CANDIDATES,
  type GoalCandidate,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  buildObservedValues,
  MethodBadge,
} from './_shared'
import { SleekLeverBar } from './_sleekBar'
import {
  CausalGraphCanvas,
  buildGraph,
  outcomeDeltasAt,
  outcomeStatesAt,
  mergeBandsFromMC,
  type EdgeStyle,
  type GraphLayout,
} from './_graph'
import { useTwinSolver } from './_solver'

// Horizon presets per regime. Quotidian ≈ 1 week (wearable-responsive
// outcomes only); longevity ≈ 6 months (biomarker/lab outcomes that take
// weeks to months to move). The regime determines *both* the atDays used
// for effect accrual and the subgraph that's rendered.
const QUOTIDIAN_AT_DAYS = 7
const LONGEVITY_AT_DAYS = 180

type Regime = 'quotidian' | 'longevity'

// Lever bars sit directly in the SVG space (no card chrome). Width sets the
// rail length; height is just used for vertical spacing between rows.
const LEVER_CARD_W = 360
const LEVER_CARD_H = 64

// Presets for the edge-style picker. Each chooses an accent used by the
// sleek lever bar (thumb glow, fill gradient, changed-value highlight) —
// edges themselves stay sign-colored so benefit/harm reading is preserved.
const EDGE_STYLE_PRESETS: Record<
  EdgeStyle,
  { label: string; accent: string; highlight: string; dark: boolean }
> = {
  particles: { label: 'Classic',   accent: '#06b6d4', highlight: '#ffffff', dark: false },
  circuit:   { label: 'Circuit',   accent: '#06b6d4', highlight: '#ffffff', dark: true  },
  plasma:    { label: 'Plasma',    accent: '#a855f7', highlight: '#f0abfc', dark: true  },
  lightning: { label: 'Lightning', accent: '#f59e0b', highlight: '#fef3c7', dark: true  },
}
const EDGE_STYLE_ORDER: EdgeStyle[] = ['particles', 'circuit', 'plasma', 'lightning']

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
    // Right margin sized for the big monospace readout (label + "72 → 89 unit"
    // value pair + delta pill stacked underneath). 240px keeps the longest
    // sleep_efficiency string ("88.0 → 88.0 %") from clipping.
    rightX: width - 240,
    topPad: 56,
    bottomPad: 48,
  }
}

// ─── Main ─────────────────────────────────────────────────────────

export function TwinViewLivingGraph() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()
  // BART MC runs in parallel with the synchronous piecewise pass. The
  // solver and the rendered point estimate keep using the synchronous
  // path (tractable, deterministic); when BART is ready, we fold the
  // posterior spread into outcome bands for display only.
  const { status: bartStatus, runMC: runBartMC } = useBartTwin()

  const [regime, setRegime] = useState<Regime>('quotidian')
  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [goalOutcomeId, setGoalOutcomeId] = useState<string | null>(null)
  const [activeLever, setActiveLever] = useState<string | null>(null)
  const [targetSize, setTargetSize] = useState(5)
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>('circuit')
  const stylePreset = EDGE_STYLE_PRESETS[edgeStyle]
  // Backend Layer 0 added ~468 weak-default edges/participant. They
  // surface a confounded OLS, not a causal effect — keep the graph
  // causal-by-default and let the user reveal them via the toggle.
  const [showExploratory, setShowExploratory] = useState(false)

  const atDays = regime === 'quotidian' ? QUOTIDIAN_AT_DAYS : LONGEVITY_AT_DAYS

  // Predicate for which outcomes belong in this regime's subgraph. The
  // wearable-responsive band ('today', ≤7d) is the only quotidian one;
  // longevity is the curated 20 (CURATED_LONGEVITY_OUTCOMES) — explicit
  // whitelist rather than "anything not today-band" so we can drop
  // redundant or low-interpretability biomarkers without deleting their
  // engine horizon entries.
  const outcomeInRegime = useCallback(
    (outcomeKey: string) => {
      if (regime === 'quotidian') return horizonBandFor(outcomeKey) === 'today'
      return CURATED_LONGEVITY_OUTCOMES.has(outcomeKey)
    },
    [regime],
  )

  // Clear solver goal when switching regime (the goal may no longer exist
  // in the subgraph).
  const switchRegime = useCallback(
    (next: Regime) => {
      setRegime(next)
      setGoalOutcomeId(null)
    },
    [],
  )

  // In LivingGraph, lever-side credibility is intentionally dropped: every
  // intervention lever in MANIPULABLE_NODES is always available. Gating is
  // purely outcome-side (regime's horizon band). Load accumulators (acwr,
  // sleep_debt, training_load, travel_load) still don't appear as levers
  // because they're not user-tunable actions, only derived state.
  const manipulableIds = useMemo(
    () => new Set(MANIPULABLE_NODES.map((n) => n.id)),
    [],
  )

  const interventionRows = useMemo(() => {
    if (!participant) return []
    return MANIPULABLE_NODES.map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current, range: rangeFor(node, current) }
    })
  }, [participant])

  // Compute the layout from intervention row count.
  const graphHeight = Math.max(420, interventionRows.length * (LEVER_CARD_H + 12) + 80)
  const layout = useMemo(() => livingLayout(1100, graphHeight), [graphHeight])

  const graph = useMemo(() => {
    if (!participant) return { nodes: [], edges: [] }
    // Merge real Bayesian effects with Phase 1 synthetic textbook arrows
    // (frontend-only density fill). Real edges win on (action, outcome)
    // collisions so synthetic data never overrides actual cohort signal.
    const realKeys = new Set(
      participant.effects_bayesian.map(
        (e) => `${e.action}|${canonicalOutcomeKey(e.outcome)}`,
      ),
    )
    const syntheticEdges = buildPhase1SyntheticEdges().filter(
      (e) => !realKeys.has(`${e.action}|${canonicalOutcomeKey(e.outcome)}`),
    )
    const allEffects = [...participant.effects_bayesian, ...syntheticEdges]
    // Drop Layer 0 weak-default rows by default. They have no DAG path,
    // so the implied edge is an unadjusted confounded slope (e.g. naive
    // bedtime → triglycerides). The "Show exploratory" toggle reveals
    // them with the same caveat the Insights tab applies.
    const causalOnly = showExploratory
      ? allEffects
      : allEffects.filter((e) => e.prior_provenance !== 'weak_default')
    // sleep_quality is a fuzzy wearable composite of efficiency + deep
    // sleep + HRV — overlaps with sleep_efficiency in the same band, so
    // we surface only sleep_efficiency to keep the graph honest.
    const regimeEffects = causalOnly.filter((e) => {
      const key = canonicalOutcomeKey(e.outcome)
      if (key === 'sleep_quality') return false
      return outcomeInRegime(key)
    })
    return buildGraph(regimeEffects, manipulableIds, layout)
  }, [participant, layout, manipulableIds, outcomeInRegime, showExploratory])
  const graphOutcomeIds = useMemo(
    () => new Set(graph.nodes.filter((n) => n.kind === 'outcome').map((n) => n.id)),
    [graph],
  )

  // Solver — declared before the deltas/state pipeline so the SCM state
  // can read solver-recommended values when the user enters solver mode.
  // Without this ordering, deltas would only see proposedValues and the
  // solver's chosen plan would never propagate into the displayed graph.
  const solver = useTwinSolver({
    participant,
    rows: interventionRows,
    atDays,
    runFullCounterfactual,
  })
  const inSolverMode = goalOutcomeId != null
  const effectiveValues = inSolverMode ? solver.values : proposedValues

  // Counterfactual state — pulls from effectiveValues so that whether the
  // user moved a slider directly or the solver chose a setting, the SCM
  // engine sees the same input and the outcome circles render the same
  // before/after pair.
  const deltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    for (const { node, current } of interventionRows) {
      const effective = effectiveValues[node.id] ?? current
      if (Math.abs(effective - current) > 1e-9) {
        out.push({ nodeId: node.id, value: effective, originalValue: current })
      }
    }
    return out
  }, [interventionRows, effectiveValues])

  const observedBaseline = useMemo(
    () => (participant ? buildObservedValues(participant) : null),
    [participant],
  )

  const state = useMemo(() => {
    if (!participant) return null
    if (deltas.length === 0) {
      return { allEffects: new Map() } as unknown as FullCounterfactualState
    }
    try {
      return runFullCounterfactual(observedBaseline ?? {}, deltas)
    } catch (err) {
      console.warn('[TwinViewLivingGraph] cf failed:', err)
      return null
    }
  }, [participant, deltas, observedBaseline, runFullCounterfactual])

  const outcomeDeltas = useMemo(
    () => outcomeDeltasAt(state, atDays, graphOutcomeIds),
    [state, graphOutcomeIds, atDays],
  )

  // Point-estimate stats — used as the baseline for everything (numbers
  // shown to user, solver decisions). BART bands are merged in below.
  const outcomeStatsPoint = useMemo(
    () => outcomeStatesAt(state, atDays, graphOutcomeIds, observedBaseline ?? undefined),
    [state, graphOutcomeIds, atDays, observedBaseline],
  )

  // BART MC pass — runs asynchronously when state changes. Result is the
  // posterior spread per outcome; the point-estimate `after` value isn't
  // touched. Solver runs on the synchronous engine, so it stays
  // tractable and deterministic.
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  useEffect(() => {
    if (bartStatus !== 'ready' || !participant || deltas.length === 0) {
      setMcState(null)
      return
    }
    let cancelled = false
    runBartMC(observedBaseline ?? {}, deltas)
      .then((result) => {
        if (cancelled) return
        setMcState(result)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[TwinViewLivingGraph] BART MC failed:', err)
        setMcState(null)
      })
    return () => {
      cancelled = true
    }
  }, [bartStatus, participant, deltas, observedBaseline, runBartMC])

  const outcomeStats = useMemo(
    () => mergeBandsFromMC(outcomeStatsPoint, mcState, atDays, graphOutcomeIds),
    [outcomeStatsPoint, mcState, atDays, graphOutcomeIds],
  )
  // Build a goal candidate for any outcome on the fly. If the outcome is
  // pre-registered in GOAL_CANDIDATES we use it; otherwise we synthesize
  // one from OUTCOME_META so the per-outcome Optimize button works for
  // every directional outcome (including newer additions like cortisol,
  // alt, etc. that haven't been added to GOAL_CANDIDATES).
  const goalCandidateFor = useCallback(
    (outcomeId: string): GoalCandidate | null => {
      const key = canonicalOutcomeKey(outcomeId)
      const found =
        GOAL_CANDIDATES.find((g) => canonicalOutcomeKey(g.outcomeId) === key) ??
        GOAL_CANDIDATES.find((g) => g.outcomeId === key)
      if (found) return found
      const meta = OUTCOME_META[key]
      if (!meta || meta.beneficial === 'neutral') return null
      return {
        outcomeId: key,
        label: `Optimize ${meta.noun}`,
        group: 'Wearable & sleep',
        direction: meta.beneficial,
      }
    },
    [],
  )
  const goalCandidate = useMemo(
    () => (goalOutcomeId ? goalCandidateFor(goalOutcomeId) : null),
    [goalOutcomeId, goalCandidateFor],
  )
  const goalUnit = goalCandidate
    ? OUTCOME_META[canonicalOutcomeKey(goalCandidate.outcomeId)]?.unit ?? ''
    : ''

  // (inSolverMode and effectiveValues declared above — the SCM state pipe
  //  needs them to feed the solver's chosen values into the engine.)

  // Persistent per-lever delta in [0,1] — how far each lever has been
  // moved from its baseline relative to its asymmetric reachable range.
  // Used by Plasma to thicken outgoing edges proportional to the move,
  // independent of the transient activeLever (which only triggers the
  // electricity flow animation right after a touch).
  const leverDeltas = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of interventionRows) {
      const value = effectiveValues[row.node.id] ?? row.current
      const halfSpan = Math.max(
        Math.abs(row.range.max - row.current),
        Math.abs(row.current - row.range.min),
      )
      if (halfSpan > 0) {
        const norm = Math.min(1, Math.abs(value - row.current) / halfSpan)
        m.set(row.node.id, norm)
      }
    }
    return m
  }, [interventionRows, effectiveValues])

  // Debounced clear timer so the active surge keeps flowing during a drag
  // and lingers ~1.4s after the user releases (long enough for pulses to
  // traverse even slow edges end-to-end).
  const clearActiveTimerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (clearActiveTimerRef.current) window.clearTimeout(clearActiveTimerRef.current)
    },
    [],
  )
  const handleLeverChange = useCallback(
    (id: string, v: number) => {
      setActiveLever(id)
      setProposedValues((p) => ({ ...p, [id]: v }))
      if (clearActiveTimerRef.current) window.clearTimeout(clearActiveTimerRef.current)
      clearActiveTimerRef.current = window.setTimeout(() => {
        setActiveLever((cur) => (cur === id ? null : cur))
        clearActiveTimerRef.current = null
      }, 1400)
    },
    [],
  )

  const applyPlan = useCallback(() => {
    setProposedValues({ ...solver.values })
    setGoalOutcomeId(null)
  }, [solver.values])

  // One-click Optimize: enter solver mode for `outcomeId` and immediately
  // start the solver. The user's proposedValues stay in state and are
  // restored on Exit, so the action is non-destructive (the Exit button
  // surfaces this when there are pending changes).
  const handleOptimize = useCallback(
    (outcomeId: string) => {
      const goal = goalCandidateFor(outcomeId)
      if (!goal) return
      const key = canonicalOutcomeKey(outcomeId)
      setGoalOutcomeId(key)
      // Defer to the next frame so goalCandidate updates before solving.
      // maximize:true — the user wants the *best* mechanism-aligned plan
      // for this outcome, not the minimum perturbation that hits a target.
      requestAnimationFrame(() => solver.start(goal, targetSize, { maximize: true }))
    },
    [goalCandidateFor, solver, targetSize],
  )

  // Cancel solver and restore the user's proposed values (the visual
  // restoration happens automatically because effectiveValues falls back
  // to proposedValues when goalOutcomeId is null).
  const exitSolver = useCallback(() => {
    solver.cancel()
    setGoalOutcomeId(null)
  }, [solver])

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
      subtitle={
        regime === 'quotidian'
          ? 'Quotidian subgraph: levers → wearable-responsive outcomes (day-scale). Toggle to Longevity for biomarker outcomes.'
          : 'Longevity subgraph: levers → biomarker/lab outcomes (weeks-to-months). Toggle to Quotidian for day-scale wearable outcomes.'
      }
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
        <div className="flex items-center gap-3 flex-wrap">
          <PersonaPortrait
            persona={persona}
            displayName={displayName}
            cohort={cohort}
            subtitle={
              inSolverMode
                ? 'Abduction · solver working back through the DAG'
                : 'Propagation · tweak any inline control'
            }
            stats={(() => {
              const m = persona?.currentMetrics
              if (!m) return []
              const out: PersonaPortraitStat[] = []
              if (m.hrv) out.push({ label: 'HRV', value: m.hrv, unit: 'ms' })
              if (m.restingHr) out.push({ label: 'RHR', value: m.restingHr, unit: 'bpm' })
              if (m.deepSleepMin) out.push({ label: 'Deep', value: m.deepSleepMin, unit: 'min' })
              if (m.remSleepMin) out.push({ label: 'REM', value: m.remSleepMin, unit: 'min' })
              return out
            })()}
          />

          {/* Regime toggle — determines which outcome subgraph is shown. */}
          <div className="ml-4 inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => switchRegime('quotidian')}
              className={cn(
                'px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors',
                regime === 'quotidian'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
              title="Wearable-class outcomes that move within ~1 week"
            >
              Quotidian health
              <span className="ml-1 text-[9px] font-normal text-slate-400">≤ 1 wk</span>
            </button>
            <button
              onClick={() => switchRegime('longevity')}
              className={cn(
                'px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors',
                regime === 'longevity'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
              title="Biomarker/lab-class outcomes that need weeks to months"
            >
              Longevity health
              <span className="ml-1 text-[9px] font-normal text-slate-400">6 mo</span>
            </button>
          </div>

          {/* Exploratory toggle — Layer 0 weak-default edges (no DAG path,
              confounded user OLS) are hidden by default. Mirrors the
              Insights-tab toggle. */}
          <label className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-3 h-3 rounded border-slate-300"
              checked={showExploratory}
              onChange={(e) => setShowExploratory(e.target.checked)}
            />
            <span title="Reveal Layer 0 weak-default edges — patterns from your data the causal model doesn't yet cover. Direction is suggestive, not adjusted.">
              Show exploratory
            </span>
          </label>

          {/* Edge-style picker — "particles" is the classic dot-flow, the
              others render edges as flowing energy with different feel. */}
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {EDGE_STYLE_ORDER.map((k) => {
              const selected = edgeStyle === k
              const preset = EDGE_STYLE_PRESETS[k]
              return (
                <button
                  key={k}
                  onClick={() => setEdgeStyle(k)}
                  className={cn(
                    'px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors',
                    selected
                      ? 'bg-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                  style={selected ? { color: preset.accent } : undefined}
                  title={`${preset.label} edge style`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {inSolverMode ? (
              <button
                onClick={exitSolver}
                className={cn(
                  'text-[11px] flex items-center gap-1 px-2 py-1.5 rounded border',
                  deltas.length > 0
                    ? 'text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 font-semibold'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-50',
                )}
                title={
                  deltas.length > 0
                    ? `Exit solver and restore your ${deltas.length} pending change${deltas.length === 1 ? '' : 's'}`
                    : 'Exit solver mode'
                }
              >
                <X className="w-3 h-3" />
                {deltas.length > 0
                  ? `Exit & restore your ${deltas.length} change${deltas.length === 1 ? '' : 's'}`
                  : 'Exit solver'}
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

        <div className="flex items-center gap-2 flex-wrap">
          <MethodBadge />
          {/* BART posterior badge — when the bundle is loaded, outcomes show
              ± posterior bands. Surfaces the engine state so the user knows
              whether the displayed numbers carry uncertainty quantification. */}
          {bartStatus === 'loading' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading posterior draws…
            </span>
          )}
          {bartStatus === 'ready' && mcState && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              BART · {mcState.kSamples} draws · {mcState.bartOutcomes.length} outcomes
            </span>
          )}
        </div>

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
                        onClick={() => solver.start(goalCandidate, targetSize, { maximize: true })}
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
                      onClick={() => solver.start(goalCandidate, targetSize, { maximize: true })}
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
            <div
              className={cn(
                'relative rounded-md transition-colors',
                stylePreset.dark && 'bg-slate-950',
              )}
              style={{ height: graphHeight }}
            >
              <CausalGraphCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                outcomeDeltas={outcomeDeltas}
                outcomeStats={outcomeStats}
                activeLever={activeLever}
                goalOutcomeId={goalOutcomeId}
                particleDirection={inSolverMode && solver.isSolving ? 'reverse' : 'forward'}
                layout={layout}
                className="w-full h-full"
                leverPillHalfWidth={LEVER_CARD_W / 2}
                outcomeAnchorInset={22}
                edgeStyle={edgeStyle}
                dimMode="none"
                leverDeltas={leverDeltas}
                renderLeverOverlay={() => null}
                onOutcomeClick={(id) => {
                  // Click outcome circle = same as Optimize button (auto-start
                  // solver). Cleaner affordance than the old toggle behavior.
                  if (goalOutcomeId === canonicalOutcomeKey(id)) {
                    exitSolver()
                  } else {
                    handleOptimize(id)
                  }
                }}
                renderOutcomeOverlay={({ id, label, delta, tone, deltaNorm, factual, after, afterLow, afterHigh }) => {
                  const fill =
                    tone === 'benefit'
                      ? '#10b981'
                      : tone === 'harm'
                        ? '#f43f5e'
                        : '#94a3b8'
                  const key = canonicalOutcomeKey(id)
                  const isGoal = goalOutcomeId === key
                  const canOptimize = !inSolverMode && goalCandidateFor(id) != null
                  const hasPendingChanges = deltas.length > 0
                  const baseR = 16
                  const dark = stylePreset.dark
                  const labelFill = dark ? '#f1f5f9' : '#0f172a'
                  const circleFill = dark ? '#0f172a' : '#ffffff'
                  const dimFill = dark ? '#94a3b8' : '#64748b'
                  const afterFill = dark ? '#f8fafc' : '#0f172a'
                  const deltaFill = dark
                    ? tone === 'benefit'
                      ? '#34d399'
                      : tone === 'harm'
                        ? '#fb7185'
                        : '#94a3b8'
                    : tone === 'benefit'
                      ? '#047857'
                      : tone === 'harm'
                        ? '#be123c'
                        : '#475569'
                  const pillBg = dark
                    ? tone === 'benefit'
                      ? 'rgba(52,211,153,0.18)'
                      : tone === 'harm'
                        ? 'rgba(251,113,133,0.18)'
                        : 'rgba(148,163,184,0.18)'
                    : tone === 'benefit'
                      ? '#d1fae5'
                      : tone === 'harm'
                        ? '#ffe4e6'
                        : '#f1f5f9'
                  const pillBorder = dark
                    ? tone === 'benefit'
                      ? 'rgba(52,211,153,0.45)'
                      : tone === 'harm'
                        ? 'rgba(251,113,133,0.45)'
                        : 'rgba(148,163,184,0.45)'
                    : tone === 'benefit'
                      ? '#a7f3d0'
                      : tone === 'harm'
                        ? '#fecdd3'
                        : '#cbd5e1'
                  const meta = OUTCOME_META[key]
                  const unit = meta?.unit ?? ''
                  const hasDelta = Math.abs(delta) > 1e-6
                  const hasStats = factual != null && after != null
                  const factualStr = hasStats ? formatOutcomeValue(factual!, key) : null
                  const afterStr = hasStats ? formatOutcomeValue(after!, key) : null
                  // BART posterior band: render as ± half-spread next to the
                  // unit. Only meaningful when the band is non-trivial relative
                  // to the displayed precision; suppress otherwise to keep the
                  // overlay clean for outcomes BART hasn't covered.
                  const hasBand =
                    afterLow != null &&
                    afterHigh != null &&
                    Math.abs(afterHigh - afterLow) > 1e-6
                  const bandHalf = hasBand ? (afterHigh! - afterLow!) / 2 : 0
                  const bandStr = hasBand ? formatOutcomeValue(bandHalf, key) : null
                  // Tooltip text spelt out so SVG-native title gives a complete
                  // band readout on hover ("Posterior 95% credible band: 47.5 to
                  // 52.5 ms"). Surfaces precise BART quantiles without
                  // crowding the visible label.
                  const bandTooltip = hasBand
                    ? `Posterior 95% credible band: ${formatOutcomeValue(afterLow!, key)}${unit ? ' ' + unit : ''} to ${formatOutcomeValue(afterHigh!, key)}${unit ? ' ' + unit : ''} (BART, K draws)`
                    : null
                  const deltaSign = delta > 0 ? '+' : delta < 0 ? '−' : ''
                  const deltaStr = formatOutcomeValue(Math.abs(delta), key)
                  const arrowGlyph = delta > 0 ? '▲' : delta < 0 ? '▼' : '•'
                  const monoStyle = {
                    pointerEvents: 'none' as const,
                    fontFamily:
                      'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontVariantNumeric: 'tabular-nums' as const,
                  }
                  // Estimate pill width from glyph count (monospace ≈ 9px/char at 14px font).
                  const pillLabel = `${arrowGlyph} ${deltaSign}${deltaStr}${unit ? ` ${unit}` : ''}`
                  const pillW = 16 + pillLabel.length * 8.4
                  // Stack: label (y=-4), value pair (y=18), optimize (y=42 if value, else y=24)
                  const valueY = 19
                  const optimizeY = hasStats ? 42 : 24
                  return (
                    <>
                      {/* Outer glow when an effect is meaningful — pulses the outcome with
                          tone-tinted halo so the eye lands on what changed. */}
                      {hasDelta && (
                        <circle
                          r={baseR + 8 + Math.min(deltaNorm, 1) * 14}
                          fill={fill}
                          opacity={0.18 + Math.min(deltaNorm, 1) * 0.22}
                        />
                      )}
                      {!hasDelta && deltaNorm > 0.05 && (
                        <circle r={baseR + deltaNorm * 12} fill={fill} opacity={0.18 * deltaNorm} />
                      )}
                      <circle
                        r={baseR}
                        fill={circleFill}
                        stroke={isGoal ? '#059669' : fill}
                        strokeWidth={isGoal ? 3.5 : 2.25}
                      />
                      {/* Label */}
                      <text
                        x={baseR + 10}
                        y={-4}
                        textAnchor="start"
                        fontSize={13}
                        fontWeight={700}
                        fill={labelFill}
                        style={{ pointerEvents: 'none', letterSpacing: '0.02em', textTransform: 'uppercase' as const }}
                      >
                        {label}
                      </text>
                      {/* Big value pair: BEFORE → AFTER  unit  [Δ pill] */}
                      {hasStats && (
                        <>
                          <text
                            x={baseR + 10}
                            y={valueY}
                            textAnchor="start"
                            fontSize={20}
                            fontWeight={700}
                            style={monoStyle}
                          >
                            <tspan fill={dimFill}>{factualStr}</tspan>
                            <tspan fill={dimFill} dx={6} fontWeight={400}>→</tspan>
                            <tspan
                              fill={hasDelta ? afterFill : dimFill}
                              fontWeight={800}
                              dx={6}
                            >
                              {afterStr}
                            </tspan>
                            {unit && (
                              <tspan fill={dimFill} dx={5} fontSize={12} fontWeight={500}>
                                {unit}
                              </tspan>
                            )}
                            {hasBand && (
                              <tspan
                                fill={dimFill}
                                dx={6}
                                fontSize={11}
                                fontWeight={500}
                                opacity={0.75}
                              >
                                ±{bandStr}
                                <title>{bandTooltip}</title>
                              </tspan>
                            )}
                          </text>
                          {hasDelta && (
                            <g transform={`translate(${baseR + 10}, ${valueY + 8})`}>
                              <rect
                                x={0}
                                width={pillW}
                                height={20}
                                rx={10}
                                fill={pillBg}
                                stroke={pillBorder}
                                strokeWidth={1}
                              />
                              <text
                                x={pillW / 2}
                                y={14}
                                textAnchor="middle"
                                fontSize={12.5}
                                fontWeight={700}
                                fill={deltaFill}
                                style={{
                                  ...monoStyle,
                                  letterSpacing: '0.02em',
                                }}
                              >
                                {pillLabel}
                              </text>
                            </g>
                          )}
                        </>
                      )}
                      {/* Optimize button — sits below the readout. Tinted amber when the
                          user has pending lever changes so the replace-and-restore-on-Exit
                          affordance is visible before the click. */}
                      {canOptimize && (
                        <g
                          transform={`translate(${baseR + 10}, ${hasDelta ? optimizeY + 22 : optimizeY})`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOptimize(id)
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <rect
                            width={86}
                            height={20}
                            rx={10}
                            fill={
                              hasPendingChanges
                                ? dark ? '#7c2d12' : '#fff7ed'
                                : dark ? '#1e293b' : '#f1f5f9'
                            }
                            stroke={
                              hasPendingChanges
                                ? '#f59e0b'
                                : dark ? '#475569' : '#cbd5e1'
                            }
                            strokeWidth={1.25}
                          />
                          <text
                            x={43}
                            y={14}
                            textAnchor="middle"
                            fontSize={10.5}
                            fontWeight={700}
                            fill={
                              hasPendingChanges
                                ? dark ? '#fed7aa' : '#9a3412'
                                : dark ? '#f1f5f9' : '#334155'
                            }
                            style={{ pointerEvents: 'none', letterSpacing: '0.04em' }}
                          >
                            ⚡ OPTIMIZE
                          </text>
                          <title>
                            {hasPendingChanges
                              ? `Replace your ${deltas.length} pending change${deltas.length === 1 ? '' : 's'} with the optimum for ${label}. Restorable via Exit.`
                              : `Find the lever set that best moves ${label}.`}
                          </title>
                        </g>
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
                        // Subtle text-shadow halo so labels stay legible
                        // against the SVG edge bundle behind them.
                        filter: changed
                          ? `drop-shadow(0 0 6px ${stylePreset.accent}66)`
                          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
                      }}
                    >
                      <SleekLeverBar
                        node={row.node}
                        current={row.current}
                        value={value}
                        accent={stylePreset.accent}
                        highlight={stylePreset.highlight}
                        disabled={locked}
                        onChange={(v) => handleLeverChange(n.id, v)}
                      />
                    </div>
                  )
                })}
            </div>
            <div className="px-2 pt-1 text-[10px] text-slate-400">
              {inSolverMode
                ? deltas.length > 0
                  ? 'Solver mode: levers are animating to the optimum. Apply locks the plan; Exit restores your previous changes.'
                  : 'Solver mode: levers are animating to the optimum. Apply locks the plan; Exit returns to baseline.'
                : 'Forward mode: turn any lever, watch particles flow and outcomes pulse. Click ⚡ Optimize on an outcome to have Serif find the best lever set.'}
            </div>
          </div>
        </Card>

        {/* Mini outcomes strip below the graph — quick read-out in case the
            user wants numeric deltas without scanning node labels. */}
        {!inSolverMode && deltas.length > 0 && (
          <Card>
            <div className="p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                At {formatHorizonShort(atDays)}
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
