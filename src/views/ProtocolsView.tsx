/**
 * ProtocolsView — unified Protocols tab.
 *
 * Owns the full page: participant load, header, date strip, today's
 * story, today's context, tuned-from-Twin cards, and the mode toggle.
 * The mode toggle sits ABOVE THE SCHEDULE ONLY so switching between
 * swim-lanes and compact doesn't re-mount (or visually disturb) the
 * shared top-of-card sections.
 *
 * URL: /protocols (canonical). Old /protocols-* paths redirect here.
 *
 * The chosen mode is persisted to localStorage so a coach's preference
 * sticks across sessions / reloads.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Layers,
  Loader2,
  Users,
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, DataModeToggle, MemberAvatar } from '@/components/common'
import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'
import {
  ProtocolContextVariantToggle,
  StorylinePanel,
  TodayContext,
  TunedProtocolsSection,
  useContextVariants,
} from '@/components/portal'
import { useTwinSnapshotStore } from '@/stores/twinSnapshotStore'
import { useDataMode } from '@/hooks/useDataMode'
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
} from '@/utils/dailyProtocol'
import { buildTodaysStory } from '@/utils/storyline'
import { buildDayScore, dayScoreBand } from '@/utils/dayScore'
import type { DayScoreBreakdown } from '@/utils/dayScore'
import { LanesSchedule } from './ProtocolsLanesView'
import { VisualSchedule } from './ProtocolsVisualView'

type ProtocolsMode = 'lanes' | 'visual'

const MODE_STORAGE_KEY = 'serif:protocols-mode:v1'

function readModeFromStorage(): ProtocolsMode {
  if (typeof localStorage === 'undefined') return 'lanes'
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY)
    if (v === 'lanes' || v === 'visual') return v
  } catch {
    // ignore
  }
  return 'lanes'
}

function writeModeToStorage(mode: ProtocolsMode): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

const DAY_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export function ProtocolsView() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, persona } = useActiveParticipant()
  const [variants, setVariants] = useContextVariants()
  const dataMode = useDataMode()
  const tunedSnapshots = useTwinSnapshotStore((s) =>
    activePid != null ? s.snapshots.filter((x) => x.participantPid === activePid) : [],
  )
  const removeSnapshot = useTwinSnapshotStore((s) => s.remove)

  const [mode, setMode] = useState<ProtocolsMode>(readModeFromStorage)
  const setModeAndPersist = (next: ProtocolsMode) => {
    setMode(next)
    writeModeToStorage(next)
  }

  const titleAccessory = (
    <MemberAvatar persona={persona} displayName={displayName} size="xl" />
  )

  const today = useMemo(() => new Date(), [])

  const twin = useMemo(() => {
    if (!participant) return null
    const result = pickOptimalSchedule(participant, OBJECTIVE_ORON, dataMode)
    const neutralBaseline = pickNeutralBaseline(participant, OBJECTIVE_ORON, dataMode)
    const yesterday = variants.yesterdayDiff
      ? pickYesterdayProtocol(participant, OBJECTIVE_ORON, dataMode)
      : null
    const wakeTime = derivedWakeTime(participant)
    const regimes = participant.regime_activations ?? {}
    const activeRegimes = (Object.entries(regimes) as Array<[RegimeKey, number]>)
      .filter(([, v]) => v >= 0.3)
      .sort((a, b) => b[1] - a[1])
      .map(([key, activation]) => ({ key, activation }))
    return { result, neutralBaseline, yesterday, wakeTime, activeRegimes }
  }, [participant, variants.yesterdayDiff, dataMode])

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
        title="Today's plan"
        subtitle="The day's protocol, grounded in today's active regimes and loads."
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
      <PageLayout title={`${displayName} — today's plan`} titleAccessory={titleAccessory}>
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title={`${displayName} — today's plan`} titleAccessory={titleAccessory}>
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

  const dayScore = buildDayScore(participant)

  const dateLabel = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const actions = (
    <div className="flex items-center gap-2">
      <DataModeToggle />
      <ProtocolContextVariantToggle variants={variants} onChange={setVariants} />
    </div>
  )

  return (
    <PageLayout
      title={`${displayName} — today's plan`}
      titleAccessory={titleAccessory}
      actions={actions}
      subtitle={
        mode === 'lanes'
          ? 'Swim-lanes — anchors, focus, and recovery prep in parallel columns.'
          : 'Compact — one row per protocol item, expand for dose shape + context.'
      }
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
            <DayScorePill breakdown={dayScore} />
          </div>

          {/* Today's story — three-sentence summary of what's active
               and why the protocol looks the way it does. */}
          <StorylinePanel story={buildTodaysStory(participant)} mode="today" />

          {/* Today's context — loads, regimes, environmental adjustments. */}
          <TodayContext
            participant={participant}
            activeRegimes={twin.activeRegimes}
            date={today}
          />

          {/* Tuned-from-Twin protocol cards */}
          <TunedProtocolsSection
            snapshots={tunedSnapshots}
            onRemove={removeSnapshot}
          />

          {/* Schedule header — layout toggle sits here, right above the
               schedule it controls, so the shared sections above don't
               visually shift when the user switches views. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
              Schedule
            </p>
            <ProtocolsModeToggle mode={mode} onChange={setModeAndPersist} />
          </div>

          {mode === 'lanes' ? (
            <LanesSchedule
              matched={matched}
              yesterdayByTitle={yesterdayByTitle}
              participant={participant}
            />
          ) : (
            <VisualSchedule
              matched={matched}
              yesterdayByTitle={yesterdayByTitle}
              participant={participant}
              schedule={twin.result.best.schedule}
              wakeTime={twin.wakeTime}
              chipVariant={variants.chip}
            />
          )}
        </Card>
      </motion.div>
    </PageLayout>
  )
}

function ProtocolsModeToggle({
  mode,
  onChange,
}: {
  mode: ProtocolsMode
  onChange: (next: ProtocolsMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Schedule layout"
      className="inline-flex items-center rounded-full p-0.5 bg-white border border-slate-200"
    >
      <ToggleButton
        active={mode === 'lanes'}
        onClick={() => onChange('lanes')}
        icon={<Layers className="w-3 h-3" />}
        label="Swim lanes"
      />
      <ToggleButton
        active={mode === 'visual'}
        onClick={() => onChange('visual')}
        icon={<BarChart3 className="w-3 h-3" />}
        label="Compact"
      />
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors text-[12px] ' +
        (active
          ? 'bg-slate-100 text-slate-900 font-medium'
          : 'text-slate-500 hover:text-slate-700')
      }
    >
      {icon}
      {label}
    </button>
  )
}

const BAND_STYLE: Record<
  ReturnType<typeof dayScoreBand>,
  { text: string; bg: string; border: string; label: string }
> = {
  great: {
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'Great',
  },
  good: {
    text: 'text-emerald-700',
    bg: 'bg-emerald-50/70',
    border: 'border-emerald-200',
    label: 'Good',
  },
  par: {
    text: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    label: 'Par',
  },
  rough: {
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'Rough',
  },
  poor: {
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    label: 'Poor',
  },
}

const OUTCOME_DISPLAY: Record<string, string> = {
  hrv_daily: 'HRV',
  sleep_quality: 'Sleep quality',
  sleep_efficiency: 'Sleep eff.',
  deep_sleep: 'Deep sleep',
  resting_hr: 'RHR',
  cortisol: 'Cortisol',
  apob: 'apoB',
  hscrp: 'hs-CRP',
  glucose: 'Glucose',
  testosterone: 'Testosterone',
  ferritin: 'Ferritin',
}

function DayScorePill({ breakdown }: { breakdown: DayScoreBreakdown }) {
  const band = dayScoreBand(breakdown.score)
  const style = BAND_STYLE[band]
  const sign = breakdown.score >= 0 ? '+' : ''

  const top = breakdown.contributions.slice(0, 5)

  return (
    <div className="group relative">
      <div
        className={`inline-flex flex-col items-end rounded-lg border px-3 py-1.5 ${style.bg} ${style.border}`}
      >
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          Day score
        </span>
        <span className="flex items-baseline gap-2">
          <span className={`text-lg font-bold tabular-nums ${style.text}`}>
            {sign}
            {breakdown.score.toFixed(2)}
          </span>
          <span className={`text-[11px] font-medium ${style.text}`}>
            {style.label}
          </span>
        </span>
      </div>

      {/* Hover breakdown */}
      <div
        className="pointer-events-none absolute right-0 top-full mt-2 z-20 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
        role="tooltip"
      >
        <p className="text-[11px] text-slate-600 leading-snug mb-2">
          Weighted mean Cohen's <span className="italic">d</span> of today's
          state vs. the cohort norm, after sign-flipping "lower-is-better"
          outcomes. Regime / load penalty subtracted.
        </p>
        <div className="space-y-1 mb-2">
          {top.map((c) => {
            const positive = c.weighted > 0
            return (
              <div key={c.outcome} className="flex items-center gap-2 text-[11px]">
                <span className="w-24 text-slate-600">
                  {OUTCOME_DISPLAY[c.outcome] ?? c.outcome}
                </span>
                <span
                  className={`w-10 text-right tabular-nums ${
                    positive ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {positive ? '+' : ''}
                  {c.d.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-400">× {c.weight.toFixed(2)}</span>
                <span
                  className={`ml-auto tabular-nums font-medium ${
                    positive ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {positive ? '+' : ''}
                  {c.weighted.toFixed(2)}
                </span>
              </div>
            )
          })}
        </div>
        {(breakdown.regimePenalty > 0 || breakdown.loadPenalty > 0) && (
          <div className="pt-2 border-t border-slate-100 space-y-0.5">
            {breakdown.regimePenalty > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Regime penalty</span>
                <span className="text-rose-600 tabular-nums">
                  −{breakdown.regimePenalty.toFixed(2)}
                </span>
              </div>
            )}
            {breakdown.loadPenalty > 0 && (
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-500">Load penalty</span>
                <span className="text-rose-600 tabular-nums">
                  −{breakdown.loadPenalty.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProtocolsView
