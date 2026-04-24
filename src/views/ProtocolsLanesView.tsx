/**
 * ProtocolsLanesView — swim-lanes variant at /protocols-lanes.
 *
 * Groups today's protocol items into three parallel horizontal lanes by
 * tag category, so users can see parallel daily themes at a glance:
 *
 *   Sleep / circadian    — bedtime-side items + wake anchor
 *   Training             — workout + overreaching-tinted items
 *   Nutrition / recovery — iron-support, anti-inflammatory
 *
 * Each lane is a ProtocolTimelineBar instance fed a filtered subset.
 * Selection state is shared across the three lanes so clicking any
 * marker surfaces the same detail card.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Calendar, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, MemberAvatar } from '@/components/common'
import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'
import {
  ProtocolContextVariantToggle,
  TodayContext,
  useContextVariants,
} from '@/components/portal'
import { ProtocolTimelineBar } from '@/components/portal/ProtocolTimelineBar'
import { ProtocolDetailCard } from '@/components/portal/ProtocolDetailCard'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import {
  derivedWakeTime,
  pickNeutralBaseline,
  pickOptimalSchedule,
  pickYesterdayProtocol,
  OBJECTIVE_ORON,
} from '@/utils/twinSem'
import {
  buildDailyProtocol,
  matchProtocolItems,
} from '@/utils/dailyProtocol'
import type {
  MatchedProtocolItem,
  ProtocolItem,
  ProtocolTag,
} from '@/utils/dailyProtocol'

const DAY_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

type LaneKey = 'sleep' | 'training' | 'nutrition'

interface LaneSpec {
  key: LaneKey
  label: string
  hint: string
  tags: ProtocolTag[]
}

const LANES: LaneSpec[] = [
  {
    key: 'sleep',
    label: 'Sleep & circadian',
    hint: 'Wake, caffeine cutoff, wind-down, screens-off, lights-out',
    tags: ['sleep', 'circadian'],
  },
  {
    key: 'training',
    label: 'Training',
    hint: 'The day’s session and overreaching-tinted items',
    tags: ['training', 'recovery', 'overreaching'],
  },
  {
    key: 'nutrition',
    label: 'Nutrition & recovery',
    hint: 'Iron-support window, anti-inflammatory emphasis',
    tags: ['iron', 'anti-inflammation'],
  },
]

/** Return each item's lane assignment. An item goes into the first lane
 * whose tag set intersects its own; items with no match are skipped
 * (shouldn't happen for our canonical items, but don't crash on extras).
 */
function assignLane(item: ProtocolItem): LaneKey | null {
  for (const lane of LANES) {
    if (item.tags.some((t) => lane.tags.includes(t))) return lane.key
  }
  return null
}

export function ProtocolsLanesView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, persona } = useActiveParticipant()
  const [variants, setVariants] = useContextVariants()
  const [requestedIndex, setRequestedIndex] = useState<number>(0)

  const titleAccessory = (
    <MemberAvatar persona={persona} displayName={displayName} size="lg" />
  )

  const today = useMemo(() => new Date(), [])
  const nowDecimal = today.getHours() + today.getMinutes() / 60

  const twin = useMemo(() => {
    if (!participant) return null
    const result = pickOptimalSchedule(participant, OBJECTIVE_ORON)
    const neutralBaseline = pickNeutralBaseline(participant, OBJECTIVE_ORON)
    const yesterday = variants.yesterdayDiff
      ? pickYesterdayProtocol(participant, OBJECTIVE_ORON)
      : null
    const wakeTime = derivedWakeTime(participant)
    const regimes = participant.regime_activations ?? {}
    const activeRegimes = (Object.entries(regimes) as Array<[RegimeKey, number]>)
      .filter(([, v]) => v >= 0.3)
      .sort((a, b) => b[1] - a[1])
      .map(([key, activation]) => ({ key, activation }))
    return { result, neutralBaseline, yesterday, wakeTime, activeRegimes }
  }, [participant, variants.yesterdayDiff])

  const { matched, yesterdayByTitle } = useMemo(() => {
    if (!participant || !twin) {
      return {
        matched: [] as MatchedProtocolItem[],
        yesterdayByTitle: null as Map<string, ProtocolItem> | null,
      }
    }
    const real = buildDailyProtocol(participant, twin.result.best.schedule, {
      wakeTime: twin.wakeTime,
      date: today,
    })

    let matched: MatchedProtocolItem[]
    if (twin.neutralBaseline) {
      const neutralParticipant: ParticipantPortal = {
        ...participant,
        regime_activations: {},
        loads_today: undefined,
      }
      const neutral = buildDailyProtocol(
        neutralParticipant,
        twin.neutralBaseline.best.schedule,
        { wakeTime: twin.wakeTime, date: today },
      )
      matched = matchProtocolItems(real, neutral)
    } else {
      matched = real.map((r) => ({ real: r, neutral: null }))
    }

    let map: Map<string, ProtocolItem> | null = null
    if (twin.yesterday) {
      const yItems = buildDailyProtocol(
        twin.yesterday.yesterdayParticipant,
        twin.yesterday.result.best.schedule,
        { wakeTime: twin.wakeTime, date: today },
      )
      map = new Map<string, ProtocolItem>()
      for (const it of yItems) map.set(it.title, it)
    }
    return { matched, yesterdayByTitle: map }
  }, [participant, twin, today])

  // Per-lane item lists, each remembering the ORIGINAL index into
  // matched so selection handlers can set the global requested index.
  const lanes = useMemo(() => {
    const out: Record<LaneKey, Array<{ item: ProtocolItem; originalIndex: number }>> = {
      sleep: [],
      training: [],
      nutrition: [],
    }
    matched.forEach((m, i) => {
      const lane = assignLane(m.real)
      if (lane) out[lane].push({ item: m.real, originalIndex: i })
    })
    return out
  }, [matched])

  const selectedIndex =
    matched.length === 0
      ? null
      : Math.min(Math.max(0, requestedIndex), matched.length - 1)

  if (activePid == null) {
    return (
      <PageLayout
        title="Today's plan (lanes)"
        subtitle="Experimental swim-lane layout — parallel horizontal timelines by theme."
      >
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Select a member</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Pick a member from the Insights tab to see their daily schedule.
          </p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout
        title={`${displayName} — today's plan (lanes)`}
        titleAccessory={titleAccessory}
      >
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout
        title={`${displayName} — today's plan (lanes)`}
        titleAccessory={titleAccessory}
      >
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Failed to load</h3>
          <p className="text-sm text-slate-500 font-mono">{error.message}</p>
        </Card>
      </PageLayout>
    )
  }

  if (!participant || !twin) return null

  const dateLabel = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const actions = (
    <ProtocolContextVariantToggle variants={variants} onChange={setVariants} />
  )

  const selected = selectedIndex != null ? matched[selectedIndex] ?? null : null

  return (
    <PageLayout
      title={`${displayName} — today's plan (lanes)`}
      titleAccessory={titleAccessory}
      actions={actions}
      subtitle="Swim-lanes — each theme on its own horizontal timeline."
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card padding="md" className="rounded-xl space-y-5">
          {/* Date header */}
          <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                {DAY_OF_WEEK[today.getDay()]}
              </h2>
              <p className="text-xs text-slate-500 tabular-nums">{dateLabel}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">
                  Twin-SEM score
                </p>
                <p className="text-lg font-bold tabular-nums text-emerald-700">
                  {twin.result.best.total >= 0 ? '+' : ''}
                  {twin.result.best.total.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Today's context */}
          <TodayContext
            participant={participant}
            activeRegimes={twin.activeRegimes}
            date={today}
          />

          {/* Three lanes */}
          <div className="space-y-4">
            {LANES.map((lane) => {
              const laneItems = lanes[lane.key]
              if (laneItems.length === 0) return (
                <EmptyLane key={lane.key} lane={lane} />
              )
              // The bar component takes a selectedIndex INTO the items
              // list it receives, so we translate globally-indexed
              // selection to locally-indexed for rendering.
              const localSelected = laneItems.findIndex(
                (e) => e.originalIndex === selectedIndex,
              )
              return (
                <div key={lane.key}>
                  <div className="px-1 mb-1">
                    <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700">
                      {lane.label}
                    </div>
                    <div className="text-[10px] text-slate-500">{lane.hint}</div>
                  </div>
                  <ProtocolTimelineBar
                    items={laneItems.map((e) => e.item)}
                    selectedIndex={localSelected === -1 ? null : localSelected}
                    onSelect={(localIdx) =>
                      setRequestedIndex(laneItems[localIdx].originalIndex)
                    }
                    nowDecimal={nowDecimal}
                  />
                </div>
              )
            })}
          </div>

          {/* Detail card for the selected marker */}
          {selected ? (
            <ProtocolDetailCard
              matched={selected}
              yesterdayItem={
                yesterdayByTitle?.get(selected.real.title) ?? null
              }
              participant={participant}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-sm p-6 text-center">
              Pick a marker in any lane to see its details.
            </div>
          )}
        </Card>
      </motion.div>
    </PageLayout>
  )
}

function EmptyLane({ lane }: { lane: LaneSpec }) {
  return (
    <div>
      <div className="px-1 mb-1">
        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
          {lane.label}
        </div>
        <div className="text-[10px] text-slate-400">{lane.hint}</div>
      </div>
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-[11px] text-slate-400 italic text-center">
        No items in this lane today.
      </div>
    </div>
  )
}

export default ProtocolsLanesView
