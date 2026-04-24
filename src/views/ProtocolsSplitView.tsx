/**
 * ProtocolsSplitView — master-detail variant at /protocols-split.
 *
 * Layout: TodayContext on top, then a two-column split:
 *   - Left (narrow): vertical spine with compact markers.
 *   - Right (wide): detail card for the selected marker — all the
 *     audit trail, chip, sparkline, rationale, etc. gets the breathing
 *     room the horizontal bar denied them.
 *
 * Sister routes:
 *   /protocols        — original full-detail vertical spine.
 *   /protocols-bar    — experimental horizontal day-bar.
 *   /protocols-lanes  — experimental swim-lanes (this commit).
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
import { ProtocolTimelineSpine } from '@/components/portal/ProtocolTimelineSpine'
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
import type { MatchedProtocolItem, ProtocolItem } from '@/utils/dailyProtocol'

const DAY_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export function ProtocolsSplitView() {
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

  const selectedIndex =
    matched.length === 0
      ? null
      : Math.min(Math.max(0, requestedIndex), matched.length - 1)

  if (activePid == null) {
    return (
      <PageLayout
        title="Today's plan (split)"
        subtitle="Experimental split layout — vertical spine with side detail."
      >
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Select a member
          </h3>
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
        title={`${displayName} — today's plan (split)`}
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
        title={`${displayName} — today's plan (split)`}
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
  const items = matched.map((m) => m.real)

  const actions = (
    <ProtocolContextVariantToggle variants={variants} onChange={setVariants} />
  )

  const selected = selectedIndex != null ? matched[selectedIndex] ?? null : null

  return (
    <PageLayout
      title={`${displayName} — today's plan (split)`}
      titleAccessory={titleAccessory}
      actions={actions}
      subtitle="Vertical spine with side-by-side detail."
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

          {/* Split: compact spine (narrow) + detail (wide) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,320px)_1fr] gap-4">
            <ProtocolTimelineSpine
              items={items}
              selectedIndex={selectedIndex}
              onSelect={setRequestedIndex}
              nowDecimal={nowDecimal}
            />
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
                Pick a protocol in the spine to see its detail.
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </PageLayout>
  )
}

export default ProtocolsSplitView
