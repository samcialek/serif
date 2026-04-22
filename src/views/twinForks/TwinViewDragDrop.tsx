/**
 * Fork B — Drag-and-drop composition.
 *
 * The Twin becomes a workbench. Levers live in a palette on the left;
 * you drag them into a "staging zone" to propose them, and drag outcome
 * rows onto a Goal slot to reframe results. Pinned outcomes bubble to
 * the top of the list.
 *
 * Uses the HTML5 drag-and-drop API (no external library) — one `draggable`
 * source type per zone. The dataTransfer payload carries the id.
 */

import { useMemo, useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  GripVertical,
  Loader2,
  Pin,
  PinOff,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
  X,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Button, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { useBartTwin } from '@/hooks/useBartTwin'
import type { FullCounterfactualState, NodeEffect } from '@/data/scm/fullCounterfactual'
import type { MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
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
  type GoalCandidate,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  buildObservedValues,
  MethodBadge,
  DecayCurve,
  toneForEffect,
} from './_shared'

const ATDAYS = 90

// Drag source MIME types — lets us discriminate between dragging a
// lever tile and dragging an outcome row. If the browser tries to drop
// a random <img> or text, the zones just ignore it.
const MIME_LEVER = 'application/x-twin-lever'
const MIME_OUTCOME = 'application/x-twin-outcome'

function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

// ─── Lever palette tile (drag source) ───────────────────────────────

interface LeverTileProps {
  nodeId: string
  label: string
  inStage: boolean
}

function LeverTile({ nodeId, label, inStage }: LeverTileProps) {
  return (
    <div
      draggable={!inStage}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_LEVER, nodeId)
        e.dataTransfer.setData('text/plain', nodeId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md border transition-all',
        inStage
          ? 'bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed'
          : 'bg-white border-slate-200 text-slate-700 cursor-grab active:cursor-grabbing hover:border-primary-300 hover:shadow-sm',
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-slate-400" />
      <span className="text-xs font-medium truncate">{label}</span>
      {inStage && <span className="text-[10px] text-slate-400 ml-auto">staged</span>}
    </div>
  )
}

// ─── Staged intervention row ────────────────────────────────────────

interface StageRowProps {
  nodeId: string
  label: string
  unit: string
  step: number
  current: number
  value: number
  range: { min: number; max: number }
  onValueChange: (v: number) => void
  onRemove: () => void
}

function StageRow({
  nodeId,
  label,
  current,
  value,
  range,
  step,
  onValueChange,
  onRemove,
}: StageRowProps) {
  const changed = Math.abs(value - current) > 1e-9
  const node = { id: nodeId, unit: '' }
  return (
    <div
      className={cn(
        'rounded-md p-2.5 border transition-colors',
        changed
          ? 'bg-primary-50/40 border-primary-200'
          : 'bg-white border-slate-200',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="text-[11px] font-semibold text-slate-700 truncate">{label}</div>
        <div className="flex items-center gap-1.5">
          <div className="text-right">
            <span className="text-[10px] text-slate-400">
              {formatNodeValue(current, { id: nodeId, unit: MANIPULABLE_NODES.find((n) => n.id === nodeId)?.unit ?? '' })}→
            </span>
            <span className="text-[11px] font-medium text-slate-800 tabular-nums ml-0.5">
              {formatNodeValue(value, { id: nodeId, unit: MANIPULABLE_NODES.find((n) => n.id === nodeId)?.unit ?? '' })}
            </span>
          </div>
          <button
            onClick={onRemove}
            className="text-slate-400 hover:text-rose-500 p-0.5 rounded"
            title="Remove from stage"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={step}
        value={value}
        onChange={onValueChange}
      />
    </div>
  )
}

// ─── Goal drop slot ─────────────────────────────────────────────────

interface GoalSlotProps {
  goal: GoalCandidate | null
  onSet: (goal: GoalCandidate) => void
  onClear: () => void
  dragActive: boolean
  onDragActive: (v: boolean) => void
}

function GoalSlot({ goal, onSet, onClear, dragActive, onDragActive }: GoalSlotProps) {
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(MIME_OUTCOME)) {
          e.preventDefault()
          onDragActive(true)
        }
      }}
      onDragLeave={() => onDragActive(false)}
      onDrop={(e) => {
        const outcomeId = e.dataTransfer.getData(MIME_OUTCOME)
        onDragActive(false)
        if (!outcomeId) return
        const match = GOAL_CANDIDATES.find((c) => c.outcomeId === outcomeId)
        if (match) onSet(match)
        e.preventDefault()
      }}
      className={cn(
        'rounded-md border-2 border-dashed px-3 py-2 flex items-center gap-2 transition-all',
        dragActive
          ? 'border-emerald-400 bg-emerald-50 scale-[1.02]'
          : goal
            ? 'border-emerald-200 bg-emerald-50/50'
            : 'border-slate-200 bg-slate-50',
      )}
    >
      <Target
        className={cn('w-4 h-4', goal || dragActive ? 'text-emerald-600' : 'text-slate-400')}
      />
      {goal ? (
        <>
          <span className="text-xs font-semibold text-emerald-900 flex-1 truncate">
            Goal: {goal.label}
          </span>
          <button
            onClick={onClear}
            className="text-emerald-700 hover:text-emerald-900 p-0.5"
            title="Clear goal"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      ) : (
        <span className="text-xs text-slate-500 italic">
          Drag any outcome here to set it as your goal
        </span>
      )}
    </div>
  )
}

// ─── Outcome row (drag source + pin target) ────────────────────────

interface OutcomeRowProps {
  effect: NodeEffect
  atDays: number
  pinned: boolean
  onTogglePin: () => void
  isGoal: boolean
}

function OutcomeRow({ effect, atDays, pinned, onTogglePin, isGoal }: OutcomeRowProps) {
  const key = canonicalOutcomeKey(effect.nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30
  const fraction = cumulativeEffectFraction(atDays, horizonDays)
  const timedEffect = effect.totalEffect * fraction
  const tone = toneForEffect(timedEffect, meta?.beneficial ?? 'higher')
  const Icon = timedEffect > 0 ? TrendingUp : TrendingDown
  const toneColor =
    tone === 'benefit' ? 'text-emerald-600' : tone === 'harm' ? 'text-rose-600' : 'text-slate-500'
  const toneIcon =
    tone === 'benefit' ? 'text-emerald-500' : tone === 'harm' ? 'text-rose-500' : 'text-slate-400'

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME_OUTCOME, key)
        e.dataTransfer.setData('text/plain', key)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-md transition-colors cursor-grab active:cursor-grabbing',
        isGoal
          ? 'bg-emerald-50/50 ring-1 ring-emerald-200'
          : pinned
            ? 'bg-amber-50/50 ring-1 ring-amber-200'
            : 'hover:bg-slate-50',
      )}
    >
      <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400">
          full effect ~{horizonDays < 14 ? `${horizonDays}d` : `${Math.round(horizonDays / 7)}w`}
          · drag to set as goal
        </div>
      </div>
      <div className="flex-shrink-0">
        <DecayCurve horizonDays={horizonDays} atDays={atDays} tone={tone} widthPx={80} heightPx={24} />
      </div>
      <div className="text-right flex-shrink-0 w-24">
        <div className={cn('text-sm font-semibold tabular-nums', toneColor)}>
          {formatEffectDelta(timedEffect, effect.nodeId)}
        </div>
      </div>
      <button
        onClick={onTogglePin}
        className={cn(
          'p-1 rounded text-slate-400 hover:text-amber-600',
          pinned && 'text-amber-500',
        )}
        title={pinned ? 'Unpin' : 'Pin to top'}
      >
        {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinViewDragDrop() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()
  const { status: bartStatus, runMC } = useBartTwin()

  // `stagedIds` is the ordered list of levers the user has dropped into
  // the stage. `stageValues` is their current slider values. Keeping them
  // separate keeps the render order predictable (drop-order) while
  // allowing slider manipulation to be independent.
  const [stagedIds, setStagedIds] = useState<string[]>([])
  const [stageValues, setStageValues] = useState<Record<string, number>>({})
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [goal, setGoal] = useState<GoalCandidate | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [stageHover, setStageHover] = useState(false)

  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', ATDAYS)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => ({
      node,
      current: participant.current_values?.[node.id] ?? node.defaultValue,
    }))
  }, [participant])

  useEffect(() => {
    setState(null)
    setMcState(null)
  }, [stagedIds, stageValues])

  const handleStageLever = useCallback(
    (nodeId: string) => {
      if (stagedIds.includes(nodeId)) return
      const row = interventionRows.find((r) => r.node.id === nodeId)
      if (!row) return
      // Seed with a meaningful change so "staging = active" — bump by ~+15%
      // toward the high end of the range. User can tweak from there.
      const range = rangeFor(row.node, row.current)
      const suggest = Math.min(range.max, row.current + (range.max - row.current) * 0.3)
      const stepped = Math.round(suggest / row.node.step) * row.node.step
      setStagedIds((prev) => [...prev, nodeId])
      setStageValues((prev) => ({ ...prev, [nodeId]: stepped }))
    },
    [interventionRows, stagedIds],
  )

  const handleUnstage = useCallback((nodeId: string) => {
    setStagedIds((prev) => prev.filter((id) => id !== nodeId))
    setStageValues((prev) => {
      const { [nodeId]: _, ...rest } = prev
      return rest
    })
  }, [])

  const deltas = useMemo(() => {
    const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
    for (const id of stagedIds) {
      const row = interventionRows.find((r) => r.node.id === id)
      if (!row) continue
      const v = stageValues[id]
      if (v != null && Math.abs(v - row.current) > 1e-9) {
        out.push({ nodeId: id, value: v, originalValue: row.current })
      }
    }
    return out
  }, [stagedIds, stageValues, interventionRows])

  const handleRun = useCallback(() => {
    if (!participant || deltas.length === 0) return
    setIsRunning(true)
    const observedValues = buildObservedValues(participant, {})
    try {
      setState(runFullCounterfactual(observedValues, deltas))
    } finally {
      setIsRunning(false)
    }
    if (bartStatus === 'ready') {
      runMC(observedValues, deltas)
        .then((mc) => mc && setMcState(mc))
        .catch((err) => console.warn('[TwinViewDragDrop] MC run failed:', err))
    }
  }, [participant, deltas, runFullCounterfactual, bartStatus, runMC])

  const sortedEffects = useMemo(() => {
    if (!state) return []
    const seen = new Set<string>()
    const out: NodeEffect[] = []
    for (const e of state.allEffects.values()) {
      if (Math.abs(e.totalEffect) <= 1e-6) continue
      if (seen.has(e.nodeId)) continue
      if (!isOutcomeCredibleAt(canonicalOutcomeKey(e.nodeId), ATDAYS)) continue
      seen.add(e.nodeId)
      out.push(e)
    }
    // Pinned first, then by horizon
    out.sort((a, b) => {
      const ap = pinnedIds.has(canonicalOutcomeKey(a.nodeId)) ? 0 : 1
      const bp = pinnedIds.has(canonicalOutcomeKey(b.nodeId)) ? 0 : 1
      if (ap !== bp) return ap - bp
      const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
      const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
      return ha - hb
    })
    return out
  }, [state, pinnedIds])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Drag & drop">
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
      <PageLayout title="Twin · Drag & drop">
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
      title="Twin · Drag & drop"
      subtitle="Drag a lever into the stage to propose it. Drag an outcome onto the goal slot to reframe results. Pin outcomes to keep them on top."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Drag-and-drop workbench · horizon fixed at 3mo
            </div>
          </div>
        </div>

        <MethodBadge />

        <GoalSlot
          goal={goal}
          onSet={setGoal}
          onClear={() => setGoal(null)}
          dragActive={dragActive}
          onDragActive={setDragActive}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1.4fr)_minmax(0,1.2fr)] gap-3">
          {/* Lever palette */}
          <Card>
            <div className="p-3 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Lever palette
              </div>
              <div className="space-y-1.5">
                {interventionRows.map(({ node }) => (
                  <LeverTile
                    key={node.id}
                    nodeId={node.id}
                    label={node.label}
                    inStage={stagedIds.includes(node.id)}
                  />
                ))}
              </div>
              <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 mt-2">
                Drag tiles right to stage them.
              </div>
            </div>
          </Card>

          {/* Staging zone + run */}
          <Card>
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(MIME_LEVER)) {
                  e.preventDefault()
                  setStageHover(true)
                }
              }}
              onDragLeave={() => setStageHover(false)}
              onDrop={(e) => {
                const leverId = e.dataTransfer.getData(MIME_LEVER)
                setStageHover(false)
                if (leverId) {
                  handleStageLever(leverId)
                  e.preventDefault()
                }
              }}
              className={cn(
                'p-3 space-y-2 min-h-[260px] transition-all rounded-md',
                stageHover && 'bg-primary-50/40 ring-2 ring-primary-300 ring-inset',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Staged interventions ({stagedIds.length})
                </div>
                <button
                  onClick={() => {
                    setStagedIds([])
                    setStageValues({})
                  }}
                  disabled={stagedIds.length === 0}
                  className={cn(
                    'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
                    stagedIds.length > 0
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-slate-300 border-slate-100 cursor-not-allowed',
                  )}
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear stage
                </button>
              </div>

              {stagedIds.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-3xl mb-2 opacity-30">📥</div>
                  <div className="text-sm font-medium text-slate-500">
                    Drop lever tiles here
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Only staged levers are applied when you run.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stagedIds.map((id) => {
                    const row = interventionRows.find((r) => r.node.id === id)
                    if (!row) return null
                    const range = rangeFor(row.node, row.current)
                    return (
                      <StageRow
                        key={id}
                        nodeId={id}
                        label={row.node.label}
                        unit={row.node.unit}
                        step={row.node.step}
                        current={row.current}
                        value={stageValues[id] ?? row.current}
                        range={range}
                        onValueChange={(v) =>
                          setStageValues((prev) => ({ ...prev, [id]: v }))
                        }
                        onRemove={() => handleUnstage(id)}
                      />
                    )
                  })}
                </div>
              )}

              <Button
                onClick={handleRun}
                disabled={isRunning || deltas.length === 0}
                className="w-full mt-2"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Propagating
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run the staged scenario
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Outcomes */}
          <Card>
            <div className="p-3 space-y-1">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Outcomes @ 3mo
                </div>
                {mcState && (
                  <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    {mcState.kSamples} draws
                  </span>
                )}
              </div>
              {state ? (
                sortedEffects.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">
                    Nothing moves measurably at {formatHorizonShort(ATDAYS)}.
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {sortedEffects.map((effect) => {
                      const key = canonicalOutcomeKey(effect.nodeId)
                      return (
                        <OutcomeRow
                          key={effect.nodeId}
                          effect={effect}
                          atDays={ATDAYS}
                          pinned={pinnedIds.has(key)}
                          onTogglePin={() => {
                            setPinnedIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(key)) next.delete(key)
                              else next.add(key)
                              return next
                            })
                          }}
                          isGoal={goal?.outcomeId === key}
                        />
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="py-8 text-center text-sm text-slate-400">
                  Stage some levers and run the scenario.
                </div>
              )}
            </div>
          </Card>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewDragDrop
