/**
 * Fork E — Cascade storytelling.
 *
 * Treats the counterfactual as a timeline to watch unfold. You dial in
 * a lever, hit Play, and the horizon sweeps from today to a year —
 * outcomes light up in the order their physiology responds: HRV and
 * sleep in the first second or two, then glucose and cortisol, then
 * lipids, then iron, then VO2 and body composition at the end.
 *
 * The punchline this view sells: response times aren't arbitrary — they
 * are the actual first-order time constants baked into the engine. The
 * play button makes that visible.
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  TrendingDown,
  TrendingUp,
  Users as UsersIcon,
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

const MAX_HORIZON = 365
const PLAYBACK_DURATION_MS = 9000

function formatEffectDelta(value: number, outcomeId: string): string {
  if (!Number.isFinite(value)) return '—'
  const key = canonicalOutcomeKey(outcomeId)
  const meta = OUTCOME_META[key]
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const rounded = formatOutcomeValue(Math.abs(value), key)
  if (meta) return `${sign}${rounded} ${meta.unit}`
  return `${sign}${rounded}`
}

// ─── Cascade row ───────────────────────────────────────────────────

interface CascadeRowProps {
  effect: NodeEffect
  atDays: number
  justAppeared: boolean
}

function CascadeRow({ effect, atDays, justAppeared }: CascadeRowProps) {
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
  const toneBg =
    tone === 'benefit' ? 'bg-emerald-50' : tone === 'harm' ? 'bg-rose-50' : 'bg-slate-50'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 32, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-md border transition-colors',
        justAppeared ? cn(toneBg, 'border-transparent shadow-sm') : 'bg-white border-slate-100',
      )}
    >
      <Icon className={cn('w-4 h-4 flex-shrink-0', toneIcon)} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate">
          {meta?.noun ?? friendlyName(effect.nodeId)}
        </div>
        <div className="text-[10px] text-slate-400">
          τ ≈ {horizonDays}d · {Math.round(fraction * 100)}% realised
        </div>
      </div>
      <div className="text-right flex-shrink-0 w-28">
        <motion.div
          key={timedEffect.toFixed(3)}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className={cn('text-sm font-semibold tabular-nums', toneColor)}
        >
          {formatEffectDelta(timedEffect, effect.nodeId)}
        </motion.div>
      </div>
    </motion.div>
  )
}

// ─── Play-head strip ───────────────────────────────────────────────

interface PlayheadProps {
  atDays: number
  onChange: (days: number) => void
}

function PlayheadStrip({ atDays, onChange }: PlayheadProps) {
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

export function TwinViewCascade() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual } = useSCM()

  const [proposedValues, setProposedValues] = useState<Record<string, number>>({})
  const [state, setState] = useState<FullCounterfactualState | null>(null)
  const [atDays, setAtDays] = useState(1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false)

  const rafRef = useRef<number | null>(null)
  const playStartRef = useRef<number>(0)
  const playStartPosRef = useRef<number>(0)
  const prevVisibleRef = useRef<Set<string>>(new Set())
  const [justAppearedIds, setJustAppearedIds] = useState<Set<string>>(new Set())

  // Run the full counterfactual once when deltas change — the cascade
  // is purely a display-time effect, since totalEffect is asymptotic
  // and we re-derive timed deltas from cumulativeEffectFraction.
  const interventionRows = useMemo(() => {
    if (!participant) return []
    const credible = leversAvailableAt('intervention', MAX_HORIZON)
    return MANIPULABLE_NODES.filter((n) => credible.has(n.id)).map((node) => {
      const current = participant.current_values?.[node.id] ?? node.defaultValue
      return { node, current }
    })
  }, [participant])

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

  useEffect(() => {
    if (!participant || deltas.length === 0) {
      setState(null)
      return
    }
    const observedValues = buildObservedValues(participant)
    try {
      const result = runFullCounterfactual(observedValues, deltas)
      setState(result)
    } catch (err) {
      console.warn('[TwinViewCascade] counterfactual failed:', err)
    }
  }, [participant, deltas, runFullCounterfactual])

  // Playback RAF loop — sweeps position 0..1000 (log-ish in days via
  // positionToDays) over PLAYBACK_DURATION_MS.
  const stopPlayback = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const startPlayback = useCallback(() => {
    if (!state) return
    const currentPos = daysToPosition(atDays)
    // If already at end, restart from beginning.
    const startPos = currentPos >= 995 ? 0 : currentPos
    playStartPosRef.current = startPos
    playStartRef.current = performance.now()
    setIsPlaying(true)
    setHasPlayedOnce(true)
    prevVisibleRef.current = new Set()
    setAtDays(positionToDays(startPos))

    const step = (now: number) => {
      const elapsed = now - playStartRef.current
      const remainingSpan = 1000 - playStartPosRef.current
      const progress = Math.min(1, elapsed / PLAYBACK_DURATION_MS)
      const pos = playStartPosRef.current + remainingSpan * progress
      setAtDays(positionToDays(pos))
      if (progress >= 1) {
        setIsPlaying(false)
        rafRef.current = null
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [state, atDays])

  useEffect(() => () => stopPlayback(), [stopPlayback])

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

  // Track outcomes that just became visible this frame — used for
  // "just-appeared" highlighting.
  useEffect(() => {
    const current = new Set(sortedEffects.map((e) => e.nodeId))
    const appeared = new Set<string>()
    for (const id of current) {
      if (!prevVisibleRef.current.has(id)) appeared.add(id)
    }
    if (appeared.size > 0) {
      setJustAppearedIds(appeared)
      const timer = window.setTimeout(() => setJustAppearedIds(new Set()), 900)
      prevVisibleRef.current = current
      return () => window.clearTimeout(timer)
    }
    prevVisibleRef.current = current
  }, [sortedEffects])

  if (pid == null) {
    return (
      <PageLayout title="Twin · Cascade">
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
      <PageLayout title="Twin · Cascade">
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading twin for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const hasChange = deltas.length > 0
  const showCurtain = hasChange && state != null && !hasPlayedOnce
  const emergingCount = sortedEffects.length

  return (
    <PageLayout
      title="Twin · Cascade"
      subtitle="Hit play. Outcomes light up in the order their physiology responds — sleep/HRV first, body composition last."
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
              {cohort ? `Cohort ${cohort} · ` : ''}Cascade demo
            </div>
          </div>
        </div>

        <MethodBadge />

        <Card>
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {isPlaying ? (
                  <>
                    Playing through{' '}
                    <span className="font-semibold text-slate-800">{formatHorizonLong(atDays)}</span>
                  </>
                ) : (
                  <>
                    Frozen at{' '}
                    <span className="font-semibold text-slate-800">{formatHorizonLong(atDays)}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isPlaying ? (
                  <Button onClick={stopPlayback} className="h-8 px-3">
                    <Pause className="w-3.5 h-3.5 mr-1.5" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    onClick={startPlayback}
                    disabled={!state}
                    className="h-8 px-3"
                  >
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    {atDays >= MAX_HORIZON - 1 ? 'Replay' : hasPlayedOnce ? 'Resume' : 'Play cascade'}
                  </Button>
                )}
                <button
                  onClick={() => {
                    stopPlayback()
                    setAtDays(MAX_HORIZON)
                    prevVisibleRef.current = new Set()
                  }}
                  disabled={!state}
                  className={cn(
                    'h-8 px-2 rounded border text-[11px] flex items-center gap-1',
                    state
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-slate-300 border-slate-100 cursor-not-allowed',
                  )}
                  title="Jump to end"
                >
                  <SkipForward className="w-3 h-3" />
                  End
                </button>
                <button
                  onClick={() => {
                    stopPlayback()
                    setAtDays(1)
                    prevVisibleRef.current = new Set()
                    setHasPlayedOnce(false)
                  }}
                  disabled={!state}
                  className={cn(
                    'h-8 px-2 rounded border text-[11px] flex items-center gap-1',
                    state
                      ? 'text-slate-600 border-slate-200 hover:bg-slate-50'
                      : 'text-slate-300 border-slate-100 cursor-not-allowed',
                  )}
                  title="Rewind"
                >
                  <RotateCcw className="w-3 h-3" />
                  Rewind
                </button>
              </div>
            </div>
            <PlayheadStrip
              atDays={atDays}
              onChange={(d) => {
                stopPlayback()
                setAtDays(d)
              }}
            />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Card>
            <div className="p-3 space-y-3">
              <div className="flex items-baseline justify-between">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Daily interventions
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

              <div className="grid grid-cols-2 gap-2">
                {interventionRows.map(({ node, current }) => {
                  const range = rangeFor(node, current)
                  const value = proposedValues[node.id] ?? current
                  const changed = Math.abs(value - current) > 1e-9
                  return (
                    <div
                      key={node.id}
                      className={cn(
                        'rounded-md p-2 border transition-colors',
                        changed
                          ? 'bg-primary-50/40 border-primary-100'
                          : 'bg-slate-50 border-slate-100',
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
                          <span className="text-[11px] font-medium text-slate-800 tabular-nums ml-0.5">
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
                          setProposedValues((p) => ({
                            ...p,
                            [node.id]: Math.max(range.min, Math.min(range.max, q)),
                          }))
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-4 relative">
              {hasChange && state ? (
                <>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Emerging · {emergingCount} outcome{emergingCount === 1 ? '' : 's'} visible
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      day {atDays} of {MAX_HORIZON}
                    </div>
                  </div>
                  <div className="space-y-1 min-h-[240px]">
                    <AnimatePresence initial={false}>
                      {sortedEffects.map((effect) => (
                        <CascadeRow
                          key={effect.nodeId}
                          effect={effect}
                          atDays={atDays}
                          justAppeared={justAppearedIds.has(effect.nodeId)}
                        />
                      ))}
                    </AnimatePresence>
                    {sortedEffects.length === 0 && (
                      <div className="py-6 text-center text-[11px] text-slate-400 italic">
                        Too early — nothing has accrued a measurable response yet.
                      </div>
                    )}
                  </div>
                  {showCurtain && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-lg"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <motion.button
                        onClick={startPlayback}
                        className="flex flex-col items-center gap-2 text-slate-600 hover:text-primary-600 transition-colors"
                        animate={{ scale: [1, 1.04, 1] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <div className="w-14 h-14 rounded-full border-2 border-current flex items-center justify-center">
                          <Play className="w-6 h-6 ml-0.5" />
                        </div>
                        <div className="text-xs font-medium">Play cascade</div>
                      </motion.button>
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="py-10 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
                  <Play className="w-6 h-6 text-slate-300" />
                  <div>Change a lever, then hit play to watch outcomes light up by response time.</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default TwinViewCascade
