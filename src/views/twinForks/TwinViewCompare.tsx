/**
 * Fork F — Scenario A/B compare.
 *
 * Two scenarios side by side, each with its own lever state. The middle
 * column shows per-outcome deltas for both scenarios and marks the
 * "winner" when one is clearly better. Answers the real coaching
 * question: "should I prioritize sleep or training?"
 *
 * Horizon is shared — comparing two scenarios at different horizons is
 * almost never what you want. Flip button swaps A↔B to sanity-check
 * framing bias.
 */

import { useMemo, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeftRight,
  Clock,
  Loader2,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Slider, MemberAvatar } from '@/components/common'
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
import { leversAvailableAt, filterCredibleLevers } from '@/data/scm/leverCredibility'
import {
  MANIPULABLE_NODES,
  type ManipulableNode,
  rangeFor,
  formatNodeValue,
  formatHorizonShort,
  formatHorizonLong,
  buildObservedValues,
  MethodBadge,
  toneForEffect,
  HORIZON_TICKS,
  TICK_POSITIONS,
  daysToPosition,
  positionToDays,
} from './_shared'

type ScenarioKey = 'A' | 'B'

interface Scenario {
  label: string
  values: Record<string, number>
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

const SCENARIO_COLORS: Record<ScenarioKey, { accent: string; bg: string; border: string; text: string; pill: string }> = {
  A: {
    accent: 'bg-indigo-500',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    pill: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  },
  B: {
    accent: 'bg-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
  },
}

// ─── Scenario column ───────────────────────────────────────────────

interface ScenarioColumnProps {
  scenarioKey: ScenarioKey
  scenario: Scenario
  interventionRows: Array<{ node: ManipulableNode; current: number }>
  setScenario: (updater: (s: Scenario) => Scenario) => void
}

function ScenarioColumn({
  scenarioKey,
  scenario,
  interventionRows,
  setScenario,
}: ScenarioColumnProps) {
  const c = SCENARIO_COLORS[scenarioKey]
  const hasChange = Object.entries(scenario.values).some(([id, v]) => {
    const r = interventionRows.find((r) => r.node.id === id)
    return r ? Math.abs(v - r.current) > 1e-9 : false
  })
  return (
    <Card className={cn('border-2', c.border)}>
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'px-2 py-0.5 text-[11px] font-bold rounded border',
                c.pill,
              )}
            >
              Scenario {scenarioKey}
            </span>
            <input
              value={scenario.label}
              onChange={(e) => setScenario((s) => ({ ...s, label: e.target.value }))}
              className="text-xs bg-transparent border-b border-slate-200 focus:border-slate-400 outline-none px-1 py-0.5 min-w-0 flex-1"
            />
          </div>
          <button
            onClick={() => setScenario((s) => ({ ...s, values: {} }))}
            disabled={!hasChange}
            className={cn(
              'text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors',
              hasChange
                ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                : 'text-slate-300 border-slate-100 cursor-not-allowed',
            )}
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Clear
          </button>
        </div>
        <div className="space-y-1.5">
          {interventionRows.map(({ node, current }) => {
            const range = rangeFor(node, current)
            const value = scenario.values[node.id] ?? current
            const changed = Math.abs(value - current) > 1e-9
            return (
              <div
                key={node.id}
                className={cn(
                  'rounded-md p-1.5 border transition-colors',
                  changed ? cn(c.bg, c.border) : 'bg-slate-50 border-slate-100',
                )}
              >
                <div className="flex items-baseline justify-between gap-1 mb-1">
                  <div className="text-[10px] font-semibold text-slate-700 truncate">
                    {node.label}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[9px] text-slate-400">
                      {formatNodeValue(current, node)}→
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-medium tabular-nums ml-0.5',
                        changed ? c.text : 'text-slate-700',
                      )}
                    >
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
                    const q = Math.round(v / node.step) * node.step
                    const clamped = Math.max(range.min, Math.min(range.max, q))
                    setScenario((s) => ({
                      ...s,
                      values: { ...s.values, [node.id]: clamped },
                    }))
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ─── Comparison row ───────────────────────────────────────────────

interface CompareRowProps {
  nodeId: string
  deltaA: number
  deltaB: number
  atDays: number
  beneficial: 'higher' | 'lower' | 'neutral' | undefined
}

function CompareRow({ nodeId, deltaA, deltaB, atDays, beneficial }: CompareRowProps) {
  const key = canonicalOutcomeKey(nodeId)
  const meta = OUTCOME_META[key]
  const horizonDays = horizonDaysFor(key) ?? 30
  const fraction = cumulativeEffectFraction(atDays, horizonDays)
  const tA = deltaA * fraction
  const tB = deltaB * fraction

  const score = (v: number) => {
    if (beneficial === 'higher') return v
    if (beneficial === 'lower') return -v
    return Math.abs(v)
  }
  const sA = score(tA)
  const sB = score(tB)
  const diff = sA - sB
  const winner: 'A' | 'B' | 'tie' =
    Math.abs(diff) < Math.max(Math.abs(tA), Math.abs(tB)) * 0.1
      ? 'tie'
      : diff > 0
        ? 'A'
        : 'B'

  const toneA = toneForEffect(tA, beneficial ?? 'higher')
  const toneB = toneForEffect(tB, beneficial ?? 'higher')
  const colorA =
    toneA === 'benefit' ? 'text-emerald-600' : toneA === 'harm' ? 'text-rose-600' : 'text-slate-500'
  const colorB =
    toneB === 'benefit' ? 'text-emerald-600' : toneB === 'harm' ? 'text-rose-600' : 'text-slate-500'
  const IconA = tA > 0 ? TrendingUp : TrendingDown
  const IconB = tB > 0 ? TrendingUp : TrendingDown

  // Shared axis for the bar viz.
  const axisMax = Math.max(Math.abs(tA), Math.abs(tB), 1e-9)
  const pctA = (tA / axisMax) * 50
  const pctB = (tB / axisMax) * 50

  return (
    <div className="py-2 px-3 border-b border-slate-100 last:border-b-0">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(nodeId)}
        </div>
        <div
          className={cn(
            'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
            winner === 'A'
              ? SCENARIO_COLORS.A.pill
              : winner === 'B'
                ? SCENARIO_COLORS.B.pill
                : 'text-slate-500 bg-slate-50 border-slate-200',
          )}
        >
          {winner === 'tie' ? 'Tie' : `${winner} wins`}
        </div>
      </div>
      {/* Mirrored bar viz: A on top, B on bottom, zero-centred. */}
      <div className="relative h-6 my-1">
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
        <div
          className={cn('absolute top-0.5 h-2 rounded-sm', SCENARIO_COLORS.A.accent)}
          style={{
            left: pctA >= 0 ? '50%' : `${50 + pctA}%`,
            width: `${Math.abs(pctA)}%`,
            opacity: 0.85,
          }}
        />
        <div
          className={cn('absolute bottom-0.5 h-2 rounded-sm', SCENARIO_COLORS.B.accent)}
          style={{
            left: pctB >= 0 ? '50%' : `${50 + pctB}%`,
            width: `${Math.abs(pctB)}%`,
            opacity: 0.85,
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] gap-2">
        <div className="flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', SCENARIO_COLORS.A.accent)} />
          <IconA className={cn('w-3 h-3', colorA)} />
          <span className={cn('tabular-nums font-semibold', colorA)}>
            {formatEffectDelta(tA, nodeId)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('tabular-nums font-semibold', colorB)}>
            {formatEffectDelta(tB, nodeId)}
          </span>
          <IconB className={cn('w-3 h-3', colorB)} />
          <span className={cn('w-1.5 h-1.5 rounded-full', SCENARIO_COLORS.B.accent)} />
        </div>
      </div>
    </div>
  )
}

// ─── Horizon strip ─────────────────────────────────────────────────

function HorizonStrip({ atDays, onChange }: { atDays: number; onChange: (days: number) => void }) {
  const pos = daysToPosition(atDays)
  return (
    <div className="space-y-1">
      <div className="relative">
        <Slider min={0} max={1000} step={1} value={pos} onChange={(p) => onChange(positionToDays(p))} />
        <div className="absolute inset-x-0 -top-0.5 pointer-events-none">
          {TICK_POSITIONS.map((p, i) => (
            <span
              key={i}
              className="absolute top-1 w-0.5 h-2 bg-slate-300 rounded-full"
              style={{ left: `${(p / 1000) * 100}%`, transform: 'translateX(-50%)' }}
            />
          ))}
        </div>
      </div>
      <div className="relative h-3 text-[10px] text-slate-400">
        {HORIZON_TICKS.map((t, i) => (
          <span
            key={t.days}
            className="absolute"
            style={{
              left: `${(TICK_POSITIONS[i] / 1000) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Main view ──────────────────────────────────────────────────────

export function TwinViewCompare() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [scenarioA, setScenarioA] = useState<Scenario>({ label: 'Sleep plan', values: {} })
  const [scenarioB, setScenarioB] = useState<Scenario>({ label: 'Training plan', values: {} })
  const [atDays, setAtDays] = useState(30)
  const [stateA, setStateA] = useState<FullCounterfactualState | null>(null)
  const [stateB, setStateB] = useState<FullCounterfactualState | null>(null)

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', atDays)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current }
    })
  }, [participant, atDays])

  const deltasFor = useCallback(
    (scenario: Scenario) => {
      const out: Array<{ nodeId: string; value: number; originalValue: number }> = []
      for (const { node, current } of interventionRows) {
        const effective = scenario.values[node.id] ?? current
        if (Math.abs(effective - current) > 1e-9) {
          out.push({ nodeId: node.id, value: effective, originalValue: current })
        }
      }
      return out
    },
    [interventionRows],
  )

  useEffect(() => {
    if (!participant) return
    const credibleOverrides = filterCredibleLevers({}, 'stateOverride', atDays)
    const observedValues = buildObservedValues(participant, credibleOverrides)
    const deltasA = deltasFor(scenarioA)
    const deltasB = deltasFor(scenarioB)
    try {
      setStateA(deltasA.length > 0 ? runFullCounterfactual(observedValues, deltasA) : null)
      setStateB(deltasB.length > 0 ? runFullCounterfactual(observedValues, deltasB) : null)
    } catch (err) {
      console.warn('[TwinViewCompare] counterfactual failed:', err)
    }
  }, [participant, scenarioA, scenarioB, atDays, runFullCounterfactual, deltasFor])

  const compareRows = useMemo(() => {
    const byId = new Map<string, { deltaA: number; deltaB: number; beneficial: 'higher' | 'lower' | 'neutral' | undefined }>()
    const collect = (st: FullCounterfactualState | null, key: 'deltaA' | 'deltaB') => {
      if (!st) return
      for (const e of st.allEffects.values() as IterableIterator<NodeEffect>) {
        if (Math.abs(e.totalEffect) <= 1e-6) continue
        if (!isOutcomeCredibleAt(canonicalOutcomeKey(e.nodeId), atDays)) continue
        const existing = byId.get(e.nodeId) ?? {
          deltaA: 0,
          deltaB: 0,
          beneficial: OUTCOME_META[canonicalOutcomeKey(e.nodeId)]?.beneficial,
        }
        existing[key] = e.totalEffect
        byId.set(e.nodeId, existing)
      }
    }
    collect(stateA, 'deltaA')
    collect(stateB, 'deltaB')
    return Array.from(byId.entries())
      .map(([nodeId, v]) => ({ nodeId, ...v }))
      .sort((a, b) => {
        const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
        const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
        return ha - hb
      })
  }, [stateA, stateB, atDays])

  const swap = useCallback(() => {
    setScenarioA(scenarioB)
    setScenarioB(scenarioA)
  }, [scenarioA, scenarioB])

  const { aWins, bWins, ties } = useMemo(() => {
    let a = 0, b = 0, t = 0
    for (const row of compareRows) {
      const horizonDays = horizonDaysFor(canonicalOutcomeKey(row.nodeId)) ?? 30
      const fraction = cumulativeEffectFraction(atDays, horizonDays)
      const tA = row.deltaA * fraction
      const tB = row.deltaB * fraction
      const score = (v: number) =>
        row.beneficial === 'higher' ? v : row.beneficial === 'lower' ? -v : Math.abs(v)
      const diff = score(tA) - score(tB)
      const mag = Math.max(Math.abs(tA), Math.abs(tB))
      if (Math.abs(diff) < mag * 0.1) t++
      else if (diff > 0) a++
      else b++
    }
    return { aWins: a, bWins: b, ties: t }
  }, [compareRows, atDays])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Compare">
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
      <PageLayout title="Twin · Compare">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const hasAny = compareRows.length > 0

  return (
    <PageLayout
      title="Twin · Compare"
      subtitle="Two scenarios, one horizon. The middle column shows per-outcome winners and the size of each win."
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
          <div className="flex-1">
            <div className="text-sm font-semibold text-slate-800">{displayName}</div>
            <div className="text-xs text-slate-500">
              {cohort ? `Cohort ${cohort} · ` : ''}A/B compare demo
            </div>
          </div>
          <button
            onClick={swap}
            className="text-[11px] flex items-center gap-1.5 px-2.5 py-1 rounded border text-slate-600 border-slate-200 hover:bg-slate-50"
            title="Swap A ↔ B"
          >
            <ArrowLeftRight className="w-3 h-3" />
            Swap A↔B
          </button>
        </div>

        <MethodBadge />

        <Card>
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Comparing at{' '}
                <span className="font-semibold text-slate-800">{formatHorizonLong(atDays)}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Headline:{' '}
                <span className={cn('font-semibold', SCENARIO_COLORS.A.text)}>A wins {aWins}</span>
                {' · '}
                <span className={cn('font-semibold', SCENARIO_COLORS.B.text)}>B wins {bWins}</span>
                {' · '}
                <span className="font-semibold text-slate-600">Tied {ties}</span>
              </div>
            </div>
            <HorizonStrip atDays={atDays} onChange={setAtDays} />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
          <ScenarioColumn
            scenarioKey="A"
            scenario={scenarioA}
            interventionRows={interventionRows}
            setScenario={setScenarioA}
          />

          <Card>
            <div className="p-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                At {formatHorizonShort(atDays)}
              </div>
              {hasAny ? (
                <div className="space-y-0">
                  {compareRows.map((row) => (
                    <CompareRow
                      key={row.nodeId}
                      nodeId={row.nodeId}
                      deltaA={row.deltaA}
                      deltaB={row.deltaB}
                      atDays={atDays}
                      beneficial={row.beneficial}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                  <ArrowLeftRight className="w-6 h-6 text-slate-300" />
                  <div>Dial in either scenario to see the head-to-head.</div>
                </div>
              )}
            </div>
          </Card>

          <ScenarioColumn
            scenarioKey="B"
            scenario={scenarioB}
            interventionRows={interventionRows}
            setScenario={setScenarioB}
          />
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewCompare
