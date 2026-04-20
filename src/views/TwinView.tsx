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
import type { FullCounterfactualState, NodeEffect } from '@/data/scm/fullCounterfactual'
import { friendlyName } from '@/data/scm/fullCounterfactual'
import { OUTCOME_META } from '@/components/portal/InsightRow'
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

const MANIPULABLE_NODES: ManipulableNode[] = [
  { id: 'sleep_duration', label: 'Sleep Duration', unit: 'hrs', step: 0.25, defaultValue: 7 },
  { id: 'running_volume', label: 'Running Volume', unit: 'km/mo', step: 5, defaultValue: 120 },
  { id: 'zone2_volume', label: 'Zone 2 Volume', unit: 'min/wk', step: 5, defaultValue: 60 },
  { id: 'training_load', label: 'Training Load', unit: 'TRIMP', step: 25, defaultValue: 600 },
  { id: 'training_volume', label: 'Training Volume', unit: 'min/mo', step: 30, defaultValue: 1200 },
  { id: 'steps', label: 'Daily Steps', unit: 'steps', step: 500, defaultValue: 8000 },
  { id: 'active_energy', label: 'Active Energy', unit: 'kcal/day', step: 50, defaultValue: 600 },
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

// Natural-unit formatter for an outcome-node change. Falls back to the
// generic formatter when we don't have metadata for the node.
function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const meta = OUTCOME_META[outcomeId]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), outcomeId)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

function formatEffectValue(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const meta = OUTCOME_META[outcomeId]
  const rounded = formatOutcomeValue(value, outcomeId)
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

interface InterventionPanelProps {
  node: ManipulableNode
  currentValue: number
  proposedValue: number
  onNodeChange: (id: string) => void
  onProposedChange: (value: number) => void
  onRun: () => void
  isRunning: boolean
}

function InterventionPanel({
  node,
  currentValue,
  proposedValue,
  onNodeChange,
  onProposedChange,
  onRun,
  isRunning,
}: InterventionPanelProps) {
  const range = useMemo(
    () => rangeFor(currentValue, node.step),
    [currentValue, node.step],
  )

  const delta = proposedValue - currentValue
  const pct = currentValue !== 0 ? (delta / Math.abs(currentValue)) * 100 : 0

  return (
    <Card>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Intervention
          </div>
          <div className="text-[11px] text-slate-400">do(X := x′)</div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">Node</label>
          <select
            value={node.id}
            onChange={(e) => onNodeChange(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white"
          >
            {MANIPULABLE_NODES.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs text-slate-500">
              Current {formatValue(currentValue, node.unit)}
            </span>
            <span className="text-xs font-medium text-slate-800">
              Proposed {formatValue(proposedValue, node.unit)}
              <span
                className={cn(
                  'ml-2',
                  delta > 0 && 'text-emerald-600',
                  delta < 0 && 'text-rose-600',
                  delta === 0 && 'text-slate-400',
                )}
              >
                ({delta >= 0 ? '+' : ''}
                {pct.toFixed(0)}%)
              </span>
            </span>
          </div>
          <Slider
            min={range.min}
            max={range.max}
            step={node.step}
            value={proposedValue}
            onChange={onProposedChange}
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>{range.min}</span>
            <span>{range.max}</span>
          </div>
        </div>

        <Button onClick={onRun} disabled={isRunning || delta === 0} className="w-full">
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

function ResultsPanel({ state }: ResultsPanelProps) {
  const sortedEffects = useMemo(() => {
    const arr = Array.from(state.allEffects.values())
    arr.sort((a, b) => Math.abs(b.totalEffect) - Math.abs(a.totalEffect))
    return arr.filter((e) => Math.abs(e.totalEffect) > 1e-6).slice(0, 8)
  }, [state.allEffects])

  // Top 2 effects with at least one pathway get their own decomposition card.
  const topDecomposables: NodeEffect[] = useMemo(
    () => sortedEffects.filter((e) => e.pathways.length > 0).slice(0, 2),
    [sortedEffects],
  )

  if (sortedEffects.length === 0) {
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
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Downstream effects
          </div>
          <div className="space-y-2">
            {sortedEffects.map((effect) => {
              const meta = OUTCOME_META[effect.nodeId]
              // Beneficial direction is outcome-specific: +ferritin is
              // good, +hscrp is bad. Fall back to "up = good" when we
              // don't know.
              const beneficial: 'higher' | 'lower' | 'neutral' =
                meta?.beneficial ?? 'higher'
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
                <div
                  key={effect.nodeId}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-slate-50 transition-colors"
                >
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
                      {formatEffectValue(
                        effect.counterfactualValue,
                        effect.nodeId,
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {topDecomposables.map((effect) => (
        <Card key={`path-${effect.nodeId}`}>
          <div className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Pathways into {OUTCOME_META[effect.nodeId]?.noun ??
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

  const [nodeId, setNodeId] = useState<string>(MANIPULABLE_NODES[0].id)
  const [proposedValue, setProposedValue] = useState<number | null>(null)
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const selectedNode = useMemo(
    () => MANIPULABLE_NODES.find((n) => n.id === nodeId) ?? MANIPULABLE_NODES[0],
    [nodeId],
  )

  const currentValue = useMemo(() => {
    const observed = participant?.current_values?.[nodeId]
    return observed != null ? observed : selectedNode.defaultValue
  }, [participant, nodeId, selectedNode])

  const effectiveProposed = proposedValue ?? currentValue

  const handleNodeChange = useCallback((id: string) => {
    setNodeId(id)
    setProposedValue(null)
    setState(null)
  }, [])

  const handleProposedChange = useCallback((value: number) => {
    setProposedValue(value)
  }, [])

  const handleRun = useCallback(() => {
    if (!participant) return
    setIsRunning(true)
    try {
      const observedValues: Record<string, number> = {
        ...participant.current_values,
      }
      const result = runFullCounterfactual(observedValues, [
        {
          nodeId,
          value: effectiveProposed,
          originalValue: currentValue,
        },
      ])
      setState(result)
    } finally {
      setIsRunning(false)
    }
  }, [participant, runFullCounterfactual, nodeId, effectiveProposed, currentValue])

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
          <InterventionPanel
            node={selectedNode}
            currentValue={currentValue}
            proposedValue={effectiveProposed}
            onNodeChange={handleNodeChange}
            onProposedChange={handleProposedChange}
            onRun={handleRun}
            isRunning={isRunning}
          />

          {state ? (
            <ResultsPanel state={state} />
          ) : (
            <Card>
              <div className="p-6 text-center text-sm text-slate-400">
                Pick an intervention value and run to see the counterfactual
                trajectory across all downstream nodes.
              </div>
            </Card>
          )}
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinView
