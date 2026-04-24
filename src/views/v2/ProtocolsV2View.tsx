/**
 * ProtocolsV2View — swim-lanes variant at /protocols-lanes.
 *
 * Groups today's protocol items into three parallel VERTICAL lanes by
 * FUNCTION (not theme), so the lanes stay balanced across different
 * regime states:
 *
 *   Anchors       — non-negotiable times: Wake, Training, Lights out.
 *   Focus areas   — things to actively choose or avoid today:
 *                   Caffeine cutoff, Iron-support, Anti-inflammatory.
 *   Recovery prep — wind-down protocols protecting tonight's sleep:
 *                   Wind-down window, Screens off.
 *
 * A typical day lands ~3/2/2 instead of the 5/1/1 skew the tag-based
 * Sleep/Training/Nutrition version produced.
 *
 * All lanes share the same y-axis hour range so items at the same time
 * align horizontally across columns. A single "now" line cuts across
 * all three. Selection state is shared: clicking any marker surfaces
 * the same detail card.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Calendar,
  Loader2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { Card, MemberAvatar } from '@/components/common'
import {
  useTwinSnapshotStore,
  type TwinSnapshot,
} from '@/stores/twinSnapshotStore'
import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'
import {
  ProtocolContextVariantToggle,
  TodayContext,
  useContextVariants,
} from '@/components/portal'
import { ProtocolVerticalLanes } from '@/components/portal/ProtocolVerticalLanes'
import type { VerticalLaneSpec } from '@/components/portal/ProtocolVerticalLanes'
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

type LaneKey = 'anchors' | 'focus' | 'recovery'

interface LaneSpec {
  key: LaneKey
  label: string
  hint: string
}

const LANES: LaneSpec[] = [
  {
    key: 'anchors',
    label: 'Anchors',
    hint: 'Non-negotiable times — wake, training, lights-out',
  },
  {
    key: 'focus',
    label: 'Focus areas',
    hint: 'Things to actively choose or avoid today',
  },
  {
    key: 'recovery',
    label: 'Recovery prep',
    hint: 'Wind-down protocols protecting tonight’s sleep',
  },
]

/** Title-based lane assignment. The protocol items emitted by
 * buildDailyProtocol have stable titles, so we map by title rather than
 * piggybacking on the tag palette (which is also consumed by the
 * row-level tag badges and would otherwise double-duty as layout). */
function assignLane(item: ProtocolItem): LaneKey | null {
  if (item.title.startsWith('Training')) return 'anchors'
  switch (item.title) {
    case 'Wake':
    case 'Lights out':
      return 'anchors'
    case 'Caffeine cutoff':
    case 'Iron-support window':
    case 'Anti-inflammatory emphasis':
      return 'focus'
    case 'Wind-down window':
    case 'Screens off':
      return 'recovery'
  }
  return null
}

export function ProtocolsV2View() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, persona } = useActiveParticipant()
  const [variants, setVariants] = useContextVariants()
  const [requestedIndex, setRequestedIndex] = useState<number>(0)

  const tunedSnapshots = useTwinSnapshotStore((s) =>
    activePid != null ? s.snapshots.filter((x) => x.participantPid === activePid) : [],
  )
  const removeSnapshot = useTwinSnapshotStore((s) => s.remove)

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
  const { laneSpecs, minHour, maxHour } = useMemo(() => {
    const byKey: Record<LaneKey, Array<{ item: ProtocolItem; originalIndex: number }>> = {
      anchors: [],
      focus: [],
      recovery: [],
    }
    matched.forEach((m, i) => {
      const lane = assignLane(m.real)
      if (lane) byKey[lane].push({ item: m.real, originalIndex: i })
    })

    // Shared time range across all lanes so columns align vertically.
    const allTimes = matched.map((m) => {
      const [h, min] = m.real.time.split(':').map(Number)
      return h + min / 60
    })
    const minH = allTimes.length ? Math.floor(Math.min(...allTimes) - 0.5) : 6
    const maxH = allTimes.length ? Math.ceil(Math.max(...allTimes) + 0.5) : 24

    const specs: VerticalLaneSpec[] = LANES.map((lane) => ({
      key: lane.key,
      label: lane.label,
      hint: lane.hint,
      entries: byKey[lane.key],
    }))
    return { laneSpecs: specs, minHour: minH, maxHour: maxH }
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

          {/* Tuned-from-Twin protocol cards (Phase 2b) */}
          <TunedProtocolsSection
            snapshots={tunedSnapshots}
            onRemove={removeSnapshot}
          />

          {/* Three parallel vertical lanes */}
          <ProtocolVerticalLanes
            lanes={laneSpecs}
            minHour={minHour}
            maxHour={maxHour}
            selectedIndex={selectedIndex}
            onSelect={setRequestedIndex}
            nowDecimal={nowDecimal}
          />

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

export default ProtocolsV2View

// ─── Tuned-from-Twin protocols ────────────────────────────────────
//
// Renders snapshots saved from /twin-v2 as a horizontal strip of cards
// above the algorithmic schedule. Each card shows the lever
// configuration as a chip cluster, and the predicted outcomes as
// signed deltas so the coach can compare proposals at a glance.

const ACTION_LABEL: Record<string, string> = {
  steps: 'Steps',
  zone2_minutes: 'Z2-3',
  zone4_5_minutes: 'Z4-5',
  caffeine_mg: 'Caffeine',
  caffeine_timing: 'Caf cutoff',
  alcohol_units: 'Alcohol',
  alcohol_timing: 'Alc cutoff',
  dietary_protein: 'Protein',
  dietary_energy: 'Calories',
  bedtime: 'Bedtime',
  sleep_duration: 'Sleep hrs',
  sleep_quality: 'Sleep qual',
  resistance_training_minutes: 'Resistance',
  supp_omega3: 'Omega-3',
  supp_magnesium: 'Magnesium',
  supp_vitamin_d: 'Vitamin D',
  supp_b_complex: 'B-complex',
  supp_creatine: 'Creatine',
}

const ACTION_UNIT: Record<string, string> = {
  steps: '',
  zone2_minutes: 'min',
  zone4_5_minutes: 'min',
  caffeine_mg: 'mg',
  caffeine_timing: 'h',
  alcohol_units: 'u',
  alcohol_timing: 'h',
  dietary_protein: 'g',
  dietary_energy: 'kcal',
  bedtime: '',
  sleep_duration: 'h',
  sleep_quality: '%',
  resistance_training_minutes: 'min/wk',
}

function formatActionDelta(
  nodeId: string,
  value: number,
  originalValue: number,
): string {
  const label = ACTION_LABEL[nodeId] ?? nodeId
  // Supplements are 0/1 toggles — render the on/off as a phrase.
  if (nodeId.startsWith('supp_')) {
    if (value >= 0.5 && originalValue < 0.5) return `+ ${label}`
    if (value < 0.5 && originalValue >= 0.5) return `- ${label}`
    return label
  }
  const unit = ACTION_UNIT[nodeId] ?? ''
  const fmt = (v: number) =>
    Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1)
  const arrow = value > originalValue ? '↑' : value < originalValue ? '↓' : '·'
  return `${label} ${arrow} ${fmt(value)}${unit ? ' ' + unit : ''}`
}

function TunedProtocolsSection({
  snapshots,
  onRemove,
}: {
  snapshots: TwinSnapshot[]
  onRemove: (id: string) => void
}) {
  if (snapshots.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-4 flex items-center gap-3"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <Sparkles className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-slate-700">
            No tuned protocols yet
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Open the{' '}
            <Link to="/twin-v2" className="text-sky-600 hover:underline">
              Twin
            </Link>
            , drag a few levers (or use ⚡ Optimize), then click{' '}
            <span className="font-medium">Save as protocol</span>.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3
          className="text-[13px] font-medium text-slate-700 flex items-center gap-1.5"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          Tuned protocols ({snapshots.length})
        </h3>
        <Link
          to="/twin-v2"
          className="text-[11px] text-sky-600 hover:underline"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Tune another →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {snapshots.map((snap) => (
          <TunedProtocolCard key={snap.id} snap={snap} onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}

function TunedProtocolCard({
  snap,
  onRemove,
}: {
  snap: TwinSnapshot
  onRemove: (id: string) => void
}) {
  const date = new Date(snap.createdAt)
  const horizonText = snap.atDays >= 30 ? `${Math.round(snap.atDays / 30)}-mo` : `${snap.atDays}-d`
  // Limit display chips so cards stay scannable on dense layouts.
  const chipCap = 6
  const visibleInterventions = snap.interventions.slice(0, chipCap)
  const overflow = snap.interventions.length - visibleInterventions.length
  const visibleOutcomes = snap.outcomes.slice(0, 4)
  return (
    <div
      className="rounded-xl bg-white p-4 hover:shadow-sm transition-shadow"
      style={{
        border: '1px solid #f0e9d8',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-800 truncate">
            {snap.label}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
            {snap.regime === 'longevity' ? 'Longevity' : 'Quotidian'} · {horizonText}{' '}
            horizon · {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <button
          onClick={() => onRemove(snap.id)}
          className="text-slate-300 hover:text-rose-500 transition-colors"
          title="Delete this snapshot"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Intervention chips */}
      <div className="flex flex-wrap gap-1 mb-3">
        {visibleInterventions.map((iv) => (
          <span
            key={iv.nodeId}
            className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md text-[10px] tabular-nums"
            style={{
              background: '#f8f5ed',
              border: '1px solid #efe6d6',
              color: '#5b524a',
            }}
          >
            {formatActionDelta(iv.nodeId, iv.value, iv.originalValue)}
          </span>
        ))}
        {overflow > 0 && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] text-slate-500"
            style={{ background: '#f5f5f4' }}
          >
            +{overflow} more
          </span>
        )}
      </div>

      {/* Predicted outcome row — top 4, signed delta */}
      {visibleOutcomes.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2 border-t border-slate-100">
          {visibleOutcomes.map((o) => {
            const tc =
              o.tone === 'benefit'
                ? '#4A8AB5'
                : o.tone === 'harm'
                  ? '#8B4830'
                  : '#847764'
            const sign = o.delta > 0 ? '+' : '−'
            const eps = Math.pow(10, -o.decimals - 1)
            const display =
              Math.abs(o.delta) <= eps
                ? '—'
                : `${sign}${Math.abs(o.delta).toFixed(o.decimals)}`
            return (
              <div
                key={o.id}
                className="flex flex-col leading-tight"
                style={{ minWidth: 56 }}
              >
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">
                  {o.label}
                </span>
                <span
                  className="text-[12px] tabular-nums"
                  style={{ color: tc, fontWeight: 500 }}
                >
                  {display}
                  {o.unit && (
                    <span className="text-[9px] ml-0.5 opacity-75">{o.unit}</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-100">
          No outcome deltas captured.
        </div>
      )}
    </div>
  )
}
