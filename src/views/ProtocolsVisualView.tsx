/**
 * ProtocolsVisualView — experimental visual-magnitude fork of the
 * canonical /protocols route.
 *
 * Keeps the full vertical-spine layout from ProtocolsView, but per row:
 *   - Drops the text "details" bullet list + italic rationale.
 *   - Replaces them with a ProtocolMagnitude visualization: a
 *     day-axis bar with the item's time as a marker, plus (for
 *     bedtime-derived items) a dimmed "current" marker and an arrow
 *     showing the shift. Training items get a duration-span bar.
 *   - Keeps the context chip, sparkline, yesterday-diff, tags, and
 *     audit-trail button.
 *
 * The point: dose sentences become dose shapes. "Target 8 h of sleep"
 * reads as a highlighted sleep-window band; "caffeine cutoff pulled
 * from 4:30pm to 2:30pm" reads as a leftward arrow on the day-axis.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  Users,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import { Card, MemberAvatar } from '@/components/common'
import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'
import {
  ProtocolContextVariantToggle,
  TodayContext,
  useContextVariants,
} from '@/components/portal'
import { CausalSparkline } from '@/components/portal/CausalSparkline'
import { ProtocolAuditTrail } from '@/components/portal/ProtocolAuditTrail'
import { ProtocolContextChip } from '@/components/portal/ProtocolContextChip'
import { ProtocolMagnitude } from '@/components/portal/ProtocolMagnitude'
import { RegimeGlyphs } from '@/components/portal/RegimeGlyphs'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import { usePortalStore } from '@/stores/portalStore'
import {
  derivedWakeTime,
  pickNeutralBaseline,
  pickOptimalSchedule,
  pickYesterdayProtocol,
  OBJECTIVE_ORON,
} from '@/utils/twinSem'
import type { CandidateSchedule } from '@/utils/twinSem'
import {
  buildDailyProtocol,
  matchProtocolItems,
  sourceLabel,
  tagColor,
  userConfoundersForItem,
} from '@/utils/dailyProtocol'
import type {
  MatchedProtocolItem,
  ProtocolItem,
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

const SOURCE_DOT: Record<ProtocolItem['source'], string> = {
  twin_sem: 'bg-emerald-500',
  regime_driven: 'bg-amber-500',
  baseline: 'bg-slate-300',
}

function doseDiffers(today: ProtocolItem, yesterday: ProtocolItem): boolean {
  if (today.dose !== yesterday.dose) return true
  if (today.displayTime !== yesterday.displayTime) return true
  const t = (today.details ?? []).join('|')
  const y = (yesterday.details ?? []).join('|')
  return t !== y
}

export function ProtocolsVisualView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, persona } = useActiveParticipant()
  const [variants, setVariants] = useContextVariants()

  const titleAccessory = (
    <MemberAvatar persona={persona} displayName={displayName} size="lg" />
  )

  const today = useMemo(() => new Date(), [])

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

  if (activePid == null) {
    return (
      <PageLayout
        title="Today's plan (visual)"
        subtitle="Experimental dose-as-magnitude fork of the protocols timeline."
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
      <PageLayout title={`${displayName} — today's plan (visual)`} titleAccessory={titleAccessory}>
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title={`${displayName} — today's plan (visual)`} titleAccessory={titleAccessory}>
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

  return (
    <PageLayout
      title={`${displayName} — today's plan (visual)`}
      titleAccessory={titleAccessory}
      actions={actions}
      subtitle="Dose-as-shape: text turns into day-axis markers, duration bars, and before/after arrows."
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

          <TodayContext
            participant={participant}
            activeRegimes={twin.activeRegimes}
            date={today}
          />

          {/* Timeline */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                Today's protocol
              </p>
              <p className="text-[11px] text-slate-400 tabular-nums">
                {matched.length} actions
              </p>
            </div>
            <div className="relative">
              <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />
              <ul className="space-y-3">
                {matched.map((m, i) => (
                  <VisualProtocolRow
                    key={i}
                    matched={m}
                    yesterdayItem={yesterdayByTitle?.get(m.real.title) ?? null}
                    participant={participant}
                    schedule={twin.result.best.schedule}
                    wakeTime={twin.wakeTime}
                    chipVariant={variants.chip}
                  />
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </motion.div>
    </PageLayout>
  )
}

interface RowProps {
  matched: MatchedProtocolItem
  yesterdayItem: ProtocolItem | null
  participant: ParticipantPortal
  schedule: CandidateSchedule
  wakeTime: number
  chipVariant: 'minimal' | 'detailed'
}

function VisualProtocolRow({
  matched,
  yesterdayItem,
  participant,
  schedule,
  wakeTime,
  chipVariant,
}: RowProps) {
  const { real, neutral } = matched
  const [suggestOpen, setSuggestOpen] = useState<boolean>(false)
  const [auditOpen, setAuditOpen] = useState<boolean>(false)
  const hasSuggestions = real.suggestions && real.suggestions.length > 0

  const userConfounders = useMemo(
    () => userConfoundersForItem(real, participant.effects_bayesian),
    [real, participant.effects_bayesian],
  )
  const hasContext =
    real.context.active_regimes.length > 0 ||
    real.context.driving_loads.length > 0 ||
    real.context.confounders_adjusted.some((c) => c.value)
  const topLoad = real.context.driving_loads[0]
  const series = topLoad ? participant.loads_history?.[topLoad.key] ?? [] : []

  return (
    <li className="relative pl-12">
      <div className="absolute left-0 top-0.5 flex items-center gap-1.5 w-[44px]">
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-white relative z-10',
            SOURCE_DOT[real.source],
          )}
        />
      </div>
      <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
        <span className="text-base leading-none">{real.icon}</span>
        <span className="text-sm font-semibold text-slate-800">{real.title}</span>
        <RegimeGlyphs regimes={real.context.active_regimes} />
      </div>

      {/* Magnitude visualization replaces the text details + rationale */}
      <div className="ml-[22px]">
        <ProtocolMagnitude
          item={real}
          participant={participant}
          schedule={schedule}
          wakeTime={wakeTime}
        />
      </div>

      {yesterdayItem && doseDiffers(real, yesterdayItem) && (
        <div className="ml-[22px] mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-[10px] leading-snug tabular-nums">
          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
            Yesterday
          </span>
          <span>{yesterdayItem.displayTime}</span>
        </div>
      )}

      {hasContext && (
        <div className="ml-[22px] mb-1 flex items-center gap-2 flex-wrap">
          <ProtocolContextChip context={real.context} variant={chipVariant} />
          {topLoad && series.length >= 2 && (
            <CausalSparkline
              series={series}
              loadKey={topLoad.key}
              label={topLoad.label}
              severityOverride={topLoad.severity}
            />
          )}
        </div>
      )}

      <div className="ml-[22px] flex items-center gap-1.5 flex-wrap">
        {real.tags.map((t) => (
          <span
            key={t}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border tabular-nums',
              tagColor(t),
            )}
          >
            {t}
          </span>
        ))}
        {hasSuggestions && (
          <button
            onClick={() => setSuggestOpen((v) => !v)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-expanded={suggestOpen}
          >
            <Lightbulb className="w-3 h-3" />
            {suggestOpen ? 'Hide options' : 'Suggest options'}
            {suggestOpen ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
        {hasContext && (
          <ProtocolAuditTrail
            real={real}
            neutral={neutral}
            userConfounders={userConfounders}
            placement="inline"
            open={auditOpen}
            onToggle={() => setAuditOpen((v) => !v)}
            onClose={() => setAuditOpen(false)}
          />
        )}
        <span className="text-[10px] text-slate-400 ml-auto">
          {sourceLabel(real.source)}
        </span>
      </div>

      {hasSuggestions && suggestOpen && (
        <div className="ml-[22px] mt-1.5 p-2 bg-slate-50 border border-dashed border-slate-300 rounded">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
            Non-engine suggestions
          </p>
          <ul className="space-y-0.5">
            {real.suggestions!.map((s, i) => (
              <li key={i} className="text-[12px] text-slate-600 leading-snug">
                · {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export default ProtocolsVisualView
