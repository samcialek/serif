/**
 * Twin SCM — per-member counterfactual workspace.
 *
 * MVP architecture (2026-04-19):
 *
 *   FACTUAL WORLD ─── participant.current_values (observed) + inferred noise
 *        │
 *        ▼
 *   ACTION ─── user picks one manipulable node + proposed value
 *        │
 *        ▼
 *   COUNTER WORLD ─── abduction-action-prediction via useSCM.runFullCounterfactual
 *        │
 *        ▼
 *   ALL DOWNSTREAM EFFECTS grouped into outcome table + pathway decomposition
 *
 * Parameters today: population-average edge slopes (edgeSummaryRaw.json).
 * Parameters next:  per-participant posterior means from the hierarchical build
 *                   (pending wearable-edge convergence fix, see
 *                   backend/output/hierarchical_scale_findings.md).
 *
 * The user's factual state is already per-participant. What MVP does NOT yet
 * personalize is the *response shape* — all members share the same bb/ba/theta
 * for each edge. The hierarchical fit, once it converges at 300-ppt scale,
 * will swap those for posterior means per participant.
 */

import { useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  GitBranch,
  Play,
  Loader2,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Info,
  Users as UsersIcon,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import type {
  FullCounterfactualState,
  MechanismCategory,
  NodeEffect,
} from '@/data/scm/fullCounterfactual'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue } from '@/utils/rounding'

// ─── Manipulable DAG nodes ──────────────────────────────────────────

interface ManipulableNode {
  id: string
  label: string
  unit: string
  step: number
  /** Falls back when participant has no observed value for this node. */
  defaultValue: number
}

// training_load (TRIMP) is a derived metric, not a user-mutable action —
// excluded from the manipulable set.
const MANIPULABLE_NODES: ManipulableNode[] = [
  { id: 'sleep_duration', label: 'Sleep Duration', unit: 'hrs', step: 0.25, defaultValue: 7 },
  { id: 'running_volume', label: 'Running Volume', unit: 'km/day', step: 0.5, defaultValue: 6 },
  { id: 'zone2_volume', label: 'Zone 2 Volume', unit: 'km/day', step: 0.5, defaultValue: 3 },
  { id: 'training_volume', label: 'Training Volume', unit: 'hrs/day', step: 0.25, defaultValue: 1 },
  { id: 'steps', label: 'Daily Steps', unit: 'steps', step: 500, defaultValue: 8000 },
  { id: 'active_energy', label: 'Active Energy', unit: 'kcal/day', step: 50, defaultValue: 600 },
  { id: 'dietary_protein', label: 'Dietary Protein', unit: 'g/day', step: 5, defaultValue: 100 },
  { id: 'dietary_energy', label: 'Dietary Energy', unit: 'kcal/day', step: 100, defaultValue: 2500 },
  { id: 'bedtime', label: 'Bedtime (24h)', unit: 'hr', step: 0.25, defaultValue: 22.5 },
]

// ─── Helpers ────────────────────────────────────────────────────────

function rangeFor(currentValue: number, step: number): { min: number; max: number } {
  const base = Math.max(currentValue, step * 4)
  const lower = Math.max(0, base * 0.5)
  const upper = base * 1.5
  const round = (v: number) => Math.round(v / step) * step
  return { min: round(lower), max: round(upper) }
}

function formatValue(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const rounded = value.toFixed(digits)
  return unit ? `${rounded} ${unit}` : rounded
}

// Natural-unit formatter for an outcome-node change. SCM node IDs carry
// suffixes (_smoothed, _mean, _score, _min, _pct) — canonicalise to look
// up metadata + rounding increments in OUTCOME_META / rounding.ts.
function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

function formatEffectValue(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const rounded = formatOutcomeValue(value, key)
  if (meta) return `${rounded} ${meta.unit}`
  return rounded
}

// ─── Sub-components ────────────────────────────────────────────────

function EmptyState() {
  return (
    <PageLayout title="Causal Twin">
      <Card>
        <div className="p-8 text-center">
          <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Pick a member to open their twin
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            The twin is per-member. Select someone from the header switcher to
            run counterfactuals against their observed state.
          </p>
        </div>
      </Card>
    </PageLayout>
  )
}

function MethodBadge() {
  return (
    <div className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-3">
      <Info className="w-4 h-4 flex-shrink-0 text-amber-500" />
      <span className="font-medium">Model predictions — not medical advice.</span>
    </div>
  )
}

interface FactualPanelProps {
  currentValues: Record<string, number>
}

function FactualPanel({ currentValues }: FactualPanelProps) {
  const rows = MANIPULABLE_NODES
    .filter((n) => currentValues[n.id] != null)
    .slice(0, 6)

  if (rows.length === 0) {
    return (
      <Card>
        <div className="p-4 text-sm text-slate-500">
          No observed node values on file for this member.
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Factual state
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map((n) => (
            <div key={n.id} className="bg-slate-50 rounded-md px-3 py-2">
              <div className="text-[10px] uppercase text-slate-400 tracking-wide">
                {n.label}
              </div>
              <div className="text-sm font-medium text-slate-800">
                {formatValue(currentValues[n.id], n.unit)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

interface InterventionRow {
  node: ManipulableNode
  currentValue: number
  edgeCount: number
}

interface MultiInterventionPanelProps {
  rows: InterventionRow[]
  proposedValues: Record<string, number>
  onProposedChange: (nodeId: string, value: number) => void
  onResetNode: (nodeId: string) => void
  onResetAll: () => void
  onRun: () => void
  isRunning: boolean
  anyDelta: boolean
}

function MultiInterventionPanel({
  rows,
  proposedValues,
  onProposedChange,
  onResetNode,
  onResetAll,
  onRun,
  isRunning,
  anyDelta,
}: MultiInterventionPanelProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <div className="p-6 text-center text-sm text-slate-500">
          No manipulable actions with causal edges for this member.
        </div>
      </Card>
    )
  }
  return (
    <Card>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Interventions ({rows.length})
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onResetAll}
              disabled={!anyDelta}
              className={cn(
                'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
                anyDelta
                  ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                  : 'text-slate-300 border-slate-100 cursor-not-allowed',
              )}
              title="Reset all sliders to current values"
            >
              <RotateCcw className="w-3 h-3" />
              Reset all
            </button>
            <div className="text-[11px] text-slate-400">do(X := x′)</div>
          </div>
        </div>

        <div className="space-y-3">
          {rows.map(({ node, currentValue, edgeCount }) => {
            const proposed = proposedValues[node.id] ?? currentValue
            const delta = proposed - currentValue
            const pct = currentValue !== 0 ? (delta / Math.abs(currentValue)) * 100 : 0
            const range = rangeFor(currentValue, node.step)
            const changed = Math.abs(delta) > 1e-9
            return (
              <div
                key={node.id}
                className={cn(
                  'rounded-md p-3 border transition-colors',
                  changed
                    ? 'bg-primary-50/40 border-primary-100'
                    : 'bg-slate-50 border-slate-100',
                )}
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate">
                      {node.label}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {edgeCount} causal {edgeCount === 1 ? 'edge' : 'edges'}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[11px] text-slate-500">
                      {formatValue(currentValue, node.unit)} →{' '}
                    </span>
                    <span className="text-xs font-medium text-slate-800 tabular-nums">
                      {formatValue(proposed, node.unit)}
                    </span>
                    {changed && (
                      <span
                        className={cn(
                          'ml-1.5 text-[10px] tabular-nums',
                          delta > 0 ? 'text-emerald-600' : 'text-rose-600',
                        )}
                      >
                        ({delta >= 0 ? '+' : ''}
                        {pct.toFixed(0)}%)
                      </span>
                    )}
                    {changed && (
                      <button
                        onClick={() => onResetNode(node.id)}
                        title="Reset to current"
                        className="ml-2 text-[10px] text-slate-400 hover:text-slate-600"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                </div>
                <Slider
                  min={range.min}
                  max={range.max}
                  step={node.step}
                  value={proposed}
                  onChange={(v) => onProposedChange(node.id, v)}
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>{range.min}</span>
                  <span>{range.max}</span>
                </div>
              </div>
            )
          })}
        </div>

        <Button onClick={onRun} disabled={isRunning || !anyDelta} className="w-full">
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Propagating
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run counterfactual
            </>
          )}
        </Button>
      </div>
    </Card>
  )
}

interface ResultsPanelProps {
  state: FullCounterfactualState
}

const CATEGORY_ORDER: MechanismCategory[] = ['sleep', 'recovery', 'cardio', 'metabolic']
const CATEGORY_LABELS: Record<MechanismCategory, string> = {
  sleep: 'Sleep',
  recovery: 'Recovery',
  cardio: 'Cardio',
  metabolic: 'Metabolic',
}

function EffectRow({ effect }: { effect: NodeEffect }) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  // Beneficial direction is outcome-specific: +ferritin good, +hscrp bad.
  // Fall back to "up = good" when unknown.
  const beneficial: 'higher' | 'lower' | 'neutral' = meta?.beneficial ?? 'higher'
  const isBenefit =
    beneficial === 'higher'
      ? effect.totalEffect > 0
      : beneficial === 'lower'
        ? effect.totalEffect < 0
        : false
  const isNeutralDir = beneficial === 'neutral'
  const Icon = effect.totalEffect > 0 ? TrendingUp : TrendingDown
  const toneColor = isNeutralDir
    ? 'text-slate-500'
    : isBenefit
      ? 'text-emerald-600'
      : 'text-rose-600'
  const toneIcon = isNeutralDir
    ? 'text-slate-400'
    : isBenefit
      ? 'text-emerald-500'
      : 'text-rose-500'
  return (
    <div className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">
            {meta?.noun ?? friendlyName(effect.nodeId)}
          </div>
          <div className="text-[11px] text-slate-400">
            {effect.identification.strategy === 'unidentified'
              ? 'unidentified — observational only'
              : `${effect.identification.strategy} identification`}
          </div>
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-3">
        <div className={cn('text-sm font-semibold', toneColor)}>
          {formatEffectDelta(effect.totalEffect, effect.nodeId)}
        </div>
        <div className="text-[11px] text-slate-400">
          {formatEffectValue(effect.factualValue, effect.nodeId)}
          {' → '}
          {formatEffectValue(effect.counterfactualValue, effect.nodeId)}
        </div>
      </div>
    </div>
  )
}

function ResultsPanel({ state }: ResultsPanelProps) {
  // Group by mechanism category so wearable outcomes (sleep/recovery) stay
  // visible alongside biomarkers (cardio/metabolic) — sorting purely by
  // absolute effect magnitude buries low-unit daily metrics behind lab
  // markers that naturally move by larger numeric amounts.
  const byCategory = useMemo(() => {
    const seen = new Set<string>()
    const groups: Array<{ category: MechanismCategory; effects: NodeEffect[] }> = []
    for (const cat of CATEGORY_ORDER) {
      const summary = state.categoryEffects[cat]
      if (!summary) continue
      const effects = summary.affectedNodes
        .filter((e) => Math.abs(e.totalEffect) > 1e-6)
        .filter((e) => {
          // A node can belong to multiple categories (e.g. hscrp →
          // metabolic + recovery). Show it under the first category it
          // appears in, following CATEGORY_ORDER, so users don't see the
          // same row twice.
          if (seen.has(e.nodeId)) return false
          seen.add(e.nodeId)
          return true
        })
        .sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect))
      if (effects.length > 0) groups.push({ category: cat, effects })
    }
    return groups
  }, [state.categoryEffects])

  const totalVisible = useMemo(
    () => byCategory.reduce((n, g) => n + g.effects.length, 0),
    [byCategory],
  )

  const topDecomposables: NodeEffect[] = useMemo(() => {
    const all = byCategory.flatMap((g) => g.effects)
    return all
      .filter((e) => e.pathways.length > 0)
      .sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect))
      .slice(0, 2)
  }, [byCategory])

  if (totalVisible === 0) {
    return (
      <Card>
        <div className="p-6 text-center text-sm text-slate-500">
          No downstream effects. The intervention is either too small to
          propagate or the target is disconnected in the current DAG.
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Downstream effects
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              {totalVisible} across {byCategory.length}{' '}
              {byCategory.length === 1 ? 'domain' : 'domains'}
            </div>
          </div>
          <div className="space-y-4">
            {byCategory.map(({ category, effects }) => (
              <div key={category}>
                <div className="flex items-baseline gap-2 px-3 mb-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {CATEGORY_LABELS[category]}
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {effects.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {effects.map((effect) => (
                    <EffectRow key={effect.nodeId} effect={effect} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {topDecomposables.map((effect) => (
        <Card key={`path-${effect.nodeId}`}>
          <div className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Pathways into {OUTCOME_META[canonicalOutcomeKey(effect.nodeId)]?.noun ??
                friendlyName(effect.nodeId)}
            </div>
            <div className="space-y-2">
              {effect.pathways.slice(0, 4).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs py-1.5 px-2 bg-slate-50 rounded"
                >
                  <div className="text-slate-600 truncate">
                    {p.path.map(friendlyName).join(' → ')}
                    {p.isRegimeAggregate && (
                      <span className="ml-2 text-[10px] text-amber-600 uppercase">
                        regime
                      </span>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-2 text-slate-800 font-medium">
                    {(p.fractionOfTotal * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ))}

      {state.tradeoffs.length > 0 && (
        <Card>
          <div className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Tradeoffs
            </div>
            <div className="space-y-2">
              {state.tradeoffs.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-slate-600 bg-rose-50/60 border border-rose-100 rounded px-2.5 py-2"
                >
                  <TrendingDown className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{t.description}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Main view ─────────────────────────────────────────────────────

export function TwinView() {
  const { pid, displayName, cohort } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Only show sliders for actions that actually have a causal edge for this
  // member. Everything else would be a no-op intervention.
  const interventionRows = useMemo<InterventionRow[]>(() => {
    if (!participant) return []
    const edgeCounts = new Map<string, number>()
    for (const e of participant.effects_bayesian) {
      edgeCounts.set(e.action, (edgeCounts.get(e.action) ?? 0) + 1)
    }
    return MANIPULABLE_NODES
      .filter((n) => edgeCounts.has(n.id))
      .map((node) => ({
        node,
        currentValue: participant.current_values?.[node.id] ?? node.defaultValue,
        edgeCount: edgeCounts.get(node.id) ?? 0,
      }))
      .sort((a, b) => b.edgeCount - a.edgeCount)
  }, [participant])

  const deltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    for (const { node, currentValue } of interventionRows) {
      const proposed = proposedValues[node.id]
      if (proposed != null && Math.abs(proposed - currentValue) > 1e-9) {
        out.push({ nodeId: node.id, value: proposed, originalValue: currentValue })
      }
    }
    return out
  }, [interventionRows, proposedValues])

  const handleProposedChange = useCallback((nodeId: string, value: number) => {
    setProposedValues((prev) => ({ ...prev, [nodeId]: value }))
  }, [])

  const handleResetNode = useCallback((nodeId: string) => {
    setProposedValues((prev) => {
      const next = { ...prev }
      delete next[nodeId]
      return next
    })
  }, [])

  const handleResetAll = useCallback(() => {
    setProposedValues({})
    setState(null)
  }, [])

  const handleRun = useCallback(() => {
    if (!participant || deltas.length === 0) return
    setIsRunning(true)
    try {
      const observedValues: Record<string, number> = {
        ...participant.current_values,
      }
      const result = runFullCounterfactual(observedValues, deltas)
      setState(result)
    } finally {
      setIsRunning(false)
    }
  }, [participant, runFullCounterfactual, deltas])

  if (pid == null) return <EmptyState />

  if (isLoading || !participant) {
    return (
      <PageLayout title="Causal Twin">
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
    <PageLayout title="Causal Twin">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {displayName}
            </div>
            <div className="text-xs text-slate-500">
              {cohort ? `Cohort ${cohort} · ` : ''}Structural causal twin
            </div>
          </div>
        </div>

        <MethodBadge />

        <FactualPanel currentValues={participant.current_values} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MultiInterventionPanel
            rows={interventionRows}
            proposedValues={proposedValues}
            onProposedChange={handleProposedChange}
            onResetNode={handleResetNode}
            onResetAll={handleResetAll}
            onRun={handleRun}
            isRunning={isRunning}
            anyDelta={deltas.length > 0}
          />

          {state ? (
            <ResultsPanel state={state} />
          ) : (
            <Card>
              <div className="p-6 text-center text-sm text-slate-400">
                Adjust any number of sliders and run to see the joint
                counterfactual across all downstream nodes.
              </div>
            </Card>
          )}
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinView
