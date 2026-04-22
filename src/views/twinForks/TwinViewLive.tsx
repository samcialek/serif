/**
 * Fork D — Live recompute (no Run button).
 *
 * The "instrument" mode. Every slider move recomputes the point-estimate
 * counterfactual live (debounced one frame) so the outcome column feels
 * like a physical panel that responds to your hand, not a query tool
 * you have to trigger.
 *
 * Posterior bands are lazy — they kick off when you stop moving
 * (pointer-up idle for ~250ms) and then "breathe" via a subtle scale
 * animation so uncertainty reads as alive rather than static.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  Loader2,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
  Zap,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, Slider, MemberAvatar } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { useBartTwin } from '@/hooks/useBartTwin'
import type { FullCounterfactualState, NodeEffect } from '@/data/scm/fullCounterfactual'
import type { MCNodeEffect, MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
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
  buildObservedValues,
  MethodBadge,
  BartStatusBadge,
  DecayCurve,
  toneForEffect,
  HORIZON_TICKS,
  TICK_POSITIONS,
  daysToPosition,
  positionToDays,
} from './_shared'

const AT_DAYS_DEFAULT = 30

function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

// ─── Shimmering posterior band ─────────────────────────────────────
//
// The headline aesthetic of this fork: posterior bands don't sit still.
// They gently breathe — scale on the X axis and fade a touch — to make
// uncertainty read as alive, stochastic, continuously resampled. The
// underlying quantiles are static (we don't have raw draws in the
// summary), but the motion cues the user that this is a band, not a
// bar.

interface ShimmerBandProps {
  deltaP05: number
  deltaP50: number
  deltaP95: number
  tone: 'benefit' | 'harm' | 'neutral'
  active: boolean
}

function ShimmerBand({ deltaP05, deltaP50, deltaP95, tone, active }: ShimmerBandProps) {
  const lo = Math.min(deltaP05, 0)
  const hi = Math.max(deltaP95, 0)
  const span = hi - lo
  if (!Number.isFinite(span) || span <= 0) return null
  const pct = (v: number) => ((v - lo) / span) * 100
  const bar =
    tone === 'benefit'
      ? 'bg-emerald-300/70'
      : tone === 'harm'
        ? 'bg-rose-300/70'
        : 'bg-slate-300/70'
  const tick =
    tone === 'benefit'
      ? 'bg-emerald-700'
      : tone === 'harm'
        ? 'bg-rose-700'
        : 'bg-slate-700'
  const bandLeft = pct(deltaP05)
  const bandWidth = pct(deltaP95) - pct(deltaP05)

  return (
    <div className="relative h-1.5 w-28 bg-slate-100 rounded-full mt-1 ml-auto overflow-visible">
      <motion.div
        className={cn('absolute h-full rounded-full', bar)}
        style={{
          left: `${bandLeft}%`,
          width: `${bandWidth}%`,
          transformOrigin: `${pct(deltaP50)}% center`,
        }}
        animate={
          active
            ? {
                scaleX: [1, 1.05, 0.96, 1.03, 1],
                opacity: [0.75, 1, 0.7, 0.95, 0.75],
              }
            : { scaleX: 1, opacity: 0.9 }
        }
        transition={{
          duration: 2.8,
          repeat: active ? Infinity : 0,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className={cn('absolute w-0.5 h-full', tick)}
        style={{ left: `${pct(deltaP50)}%` }}
        animate={active ? { opacity: [0.85, 1, 0.85] } : { opacity: 1 }}
        transition={{ duration: 1.4, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
      />
      <div
        className="absolute w-px h-[260%] -top-[80%] bg-slate-300"
        style={{ left: `${pct(0)}%` }}
      />
    </div>
  )
}

// ─── Live intervention slider ───────────────────────────────────────

interface LiveSliderProps {
  node: ManipulableNode
  current: number
  value: number
  range: { min: number; max: number }
  onChange: (v: number) => void
  onDragEnd: () => void
}

function LiveSlider({ node, current, value, range, onChange, onDragEnd }: LiveSliderProps) {
  const changed = Math.abs(value - current) > 1e-9
  return (
    <div
      className={cn(
        'rounded-md p-2 border transition-colors',
        changed ? 'bg-primary-50/40 border-primary-100' : 'bg-slate-50 border-slate-100',
      )}
      onPointerUp={onDragEnd}
      onPointerLeave={onDragEnd}
    >
      <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
        <div className="text-[11px] font-semibold text-slate-700 truncate">{node.label}</div>
        <div className="text-right flex-shrink-0">
          <span className="text-[10px] text-slate-400">{formatNodeValue(current, node)}→</span>
          <motion.span
            key={value}
            initial={{ opacity: 0.4, y: -1 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            className="text-[11px] font-medium text-slate-800 tabular-nums ml-0.5 inline-block"
          >
            {formatNodeValue(value, node)}
          </motion.span>
        </div>
      </div>
      <Slider
        min={range.min}
        max={range.max}
        step={node.step}
        value={value}
        onChange={(v) => {
          const quantized = Math.round(v / node.step) * node.step
          onChange(Math.max(range.min, Math.min(range.max, quantized)))
        }}
      />
    </div>
  )
}

// ─── Live outcome row ──────────────────────────────────────────────

interface LiveEffectRowProps {
  effect: NodeEffect
  atDays: number
  mcEffect?: MCNodeEffect | null
  bandsShimmering: boolean
  isRecomputing: boolean
}

function LiveEffectRow({
  effect,
  atDays,
  mcEffect,
  bandsShimmering,
  isRecomputing,
}: LiveEffectRowProps) {
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

  const showBand = mcEffect?.hasBartAncestor === true
  const asymDeltaP05 = mcEffect ? mcEffect.posteriorSummary.p05 - mcEffect.factualValue : 0
  const asymDeltaP50 = mcEffect ? mcEffect.posteriorSummary.p50 - mcEffect.factualValue : 0
  const asymDeltaP95 = mcEffect ? mcEffect.posteriorSummary.p95 - mcEffect.factualValue : 0

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-md transition-colors',
        isRecomputing ? 'bg-primary-50/30' : 'hover:bg-slate-50',
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400">
          {Math.round(fraction * 100)}% realised at {formatHorizonShort(atDays)}
        </div>
      </div>
      <div className="flex-shrink-0">
        <DecayCurve
          horizonDays={horizonDays}
          atDays={atDays}
          tone={tone}
          widthPx={96}
          heightPx={28}
        />
      </div>
      <div className="text-right flex-shrink-0 w-24">
        <motion.div
          key={timedEffect.toFixed(3)}
          initial={{ opacity: 0.3, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={cn('text-sm font-semibold tabular-nums', toneColor)}
        >
          {formatEffectDelta(timedEffect, effect.nodeId)}
        </motion.div>
        {showBand && (
          <ShimmerBand
            deltaP05={asymDeltaP05 * fraction}
            deltaP50={asymDeltaP50 * fraction}
            deltaP95={asymDeltaP95 * fraction}
            tone={tone}
            active={bandsShimmering}
          />
        )}
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

export function TwinViewLive() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()
  const { status: bartStatus, runMC, coverage } = useBartTwin()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  const [atDays, setAtDays] = useState(AT_DAYS_DEFAULT)
  const [isDragging, setIsDragging] = useState(false)
  const [isRecomputing, setIsRecomputing] = useState(false)

  const ptTimerRef = useRef<number | null>(null)
  const mcTimerRef = useRef<number | null>(null)
  const mcRunIdRef = useRef(0)

  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', atDays)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current }
    })
  }, [participant, atDays])

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

  // Point-estimate: recompute live, one-frame debounce.
  useEffect(() => {
    if (!participant) return
    if (deltas.length === 0) {
      setState(null)
      setMcState(null)
      return
    }
    if (ptTimerRef.current != null) window.clearTimeout(ptTimerRef.current)
    setIsRecomputing(true)
    ptTimerRef.current = window.setTimeout(() => {
      const credibleOverrides = filterCredibleLevers({}, 'stateOverride', atDays)
      const observedValues = buildObservedValues(participant, credibleOverrides)
      try {
        const result = runFullCounterfactual(observedValues, deltas)
        setState(result)
      } catch (err) {
        console.warn('[TwinViewLive] counterfactual failed:', err)
      }
      setIsRecomputing(false)
    }, 60)
    return () => {
      if (ptTimerRef.current != null) window.clearTimeout(ptTimerRef.current)
    }
  }, [participant, deltas, atDays, runFullCounterfactual])

  // MC bands: kick off when user stops dragging for ~250ms.
  useEffect(() => {
    if (mcTimerRef.current != null) window.clearTimeout(mcTimerRef.current)
    if (!participant || deltas.length === 0 || isDragging || bartStatus !== 'ready') return
    const runId = ++mcRunIdRef.current
    mcTimerRef.current = window.setTimeout(() => {
      const credibleOverrides = filterCredibleLevers({}, 'stateOverride', atDays)
      const observedValues = buildObservedValues(participant, credibleOverrides)
      runMC(observedValues, deltas)
        .then((mc) => {
          if (mc && runId === mcRunIdRef.current) setMcState(mc)
        })
        .catch((err) => console.warn('[TwinViewLive] MC failed:', err))
    }, 250)
    return () => {
      if (mcTimerRef.current != null) window.clearTimeout(mcTimerRef.current)
    }
  }, [participant, deltas, atDays, isDragging, bartStatus, runMC])

  // Clear MC bands immediately when user starts a new drag so stale
  // bands don't linger on the new numbers.
  useEffect(() => {
    if (isDragging) setMcState(null)
  }, [isDragging])

  const handleDragStart = useCallback(() => setIsDragging(true), [])
  const handleDragEnd = useCallback(() => setIsDragging(false), [])

  const sortedEffects = useMemo(() => {
    if (!state) return []
    const seen = new Set<string>()
    const out: NodeEffect[] = []
    for (const e of state.allEffects.values()) {
      if (Math.abs(e.totalEffect) <= 1e-6) continue
      if (seen.has(e.nodeId)) continue
      if (!isOutcomeCredibleAt(canonicalOutcomeKey(e.nodeId), atDays)) continue
      seen.add(e.nodeId)
      out.push(e)
    }
    return out.sort((a, b) => {
      const ha = horizonDaysFor(canonicalOutcomeKey(a.nodeId)) ?? 999
      const hb = horizonDaysFor(canonicalOutcomeKey(b.nodeId)) ?? 999
      return ha - hb
    })
  }, [state, atDays])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Live">
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
      <PageLayout title="Twin · Live">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const mcReady = mcState != null && !isDragging
  const hasChange = deltas.length > 0

  return (
    <PageLayout
      title="Twin · Live"
      subtitle="No Run button. The outcome panel recomputes as you move — posterior bands breathe when they settle."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Live-recompute demo
            </div>
          </div>
          <motion.div
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border',
              hasChange
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-slate-500 bg-slate-50 border-slate-200',
            )}
            animate={hasChange ? { opacity: [0.75, 1, 0.75] } : { opacity: 0.8 }}
            transition={{
              duration: 1.6,
              repeat: hasChange ? Infinity : 0,
              ease: 'easeInOut',
            }}
          >
            <Zap
              className={cn(
                'w-3 h-3',
                hasChange ? 'text-emerald-500 fill-emerald-400' : 'text-slate-400',
              )}
            />
            {hasChange
              ? isRecomputing
                ? 'Recomputing'
                : mcReady
                  ? 'Engine live · bands settled'
                  : 'Engine live · awaiting draws'
              : 'Engine idle'}
          </motion.div>
        </div>

        <MethodBadge />
        <BartStatusBadge
          status={bartStatus}
          coverageCount={coverage.length}
          kSamples={mcState?.kSamples}
        />

        <Card>
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Horizon
              </div>
              <div className="text-[11px] text-slate-400">
                Projecting to{' '}
                <span className="text-slate-700 font-semibold">{formatHorizonShort(atDays)}</span>
              </div>
            </div>
            <HorizonStrip atDays={atDays} onChange={setAtDays} />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-3">
          <Card>
            <div
              className="p-3 space-y-3"
              onPointerDown={handleDragStart}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Daily interventions · applied every day for {formatHorizonShort(atDays)}
                </div>
                <button
                  onClick={() => setProposedValues({})}
                  disabled={!hasChange}
                  className={cn(
                    'text-[11px] flex items-center gap-1 px-2 py-1 rounded border transition-colors',
                    hasChange
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-slate-300 border-slate-100 cursor-not-allowed',
                  )}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </button>
              </div>
              {interventionRows.length === 0 ? (
                <div className="text-[11px] text-slate-500 italic py-6 text-center">
                  No levers credible at this horizon. Shorten the horizon to bring sleep and
                  bedtime back.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {interventionRows.map(({ node, current }) => (
                    <LiveSlider
                      key={node.id}
                      node={node}
                      current={current}
                      value={proposedValues[node.id] ?? current}
                      range={rangeFor(node, current)}
                      onChange={(v) => setProposedValues((p) => ({ ...p, [node.id]: v }))}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-2">
              {hasChange && state ? (
                sortedEffects.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">
                    Nothing moves measurably at {formatHorizonShort(atDays)}. Dial up a lever or
                    extend the horizon.
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Projected movement · {formatHorizonShort(atDays)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {mcReady ? 'bands breathing' : 'point estimate'}
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {sortedEffects.map((effect) => (
                        <LiveEffectRow
                          key={effect.nodeId}
                          effect={effect}
                          atDays={atDays}
                          mcEffect={mcState?.allEffects.get(effect.nodeId)}
                          bandsShimmering={mcReady}
                          isRecomputing={isRecomputing}
                        />
                      ))}
                    </div>
                  </>
                )
              ) : (
                <div className="py-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                  <Zap className="w-6 h-6 text-slate-300" />
                  <div>
                    Nudge any lever on the left. The outcomes update live — no Run button.
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewLive
