/**
 * LanesSchedule — swim-lanes schedule body.
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
 * All lanes share the same y-axis hour range so items at the same time
 * align horizontally across columns. A single "now" line cuts across
 * all three. Selection state is local: clicking any marker surfaces
 * the same detail card.
 *
 * This component renders only the schedule — the participant load,
 * page layout, header, and shared top-of-card sections are owned by
 * `ProtocolsView`.
 */

import { useMemo, useState } from 'react'
import { ProtocolVerticalLanes } from '@/components/portal/ProtocolVerticalLanes'
import type { VerticalLaneSpec } from '@/components/portal/ProtocolVerticalLanes'
import { ProtocolDetailCard } from '@/components/portal/ProtocolDetailCard'
import type { ParticipantPortal } from '@/data/portal/types'
import type {
  MatchedProtocolItem,
  ProtocolItem,
} from '@/utils/dailyProtocol'

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

export interface LanesScheduleProps {
  matched: MatchedProtocolItem[]
  yesterdayByTitle: Map<string, ProtocolItem> | null
  participant: ParticipantPortal
}

export function LanesSchedule({
  matched,
  yesterdayByTitle,
  participant,
}: LanesScheduleProps) {
  const [requestedIndex, setRequestedIndex] = useState<number>(0)

  const today = useMemo(() => new Date(), [])
  const nowDecimal = today.getHours() + today.getMinutes() / 60

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

  const selected = selectedIndex != null ? matched[selectedIndex] ?? null : null

  return (
    <>
      <ProtocolVerticalLanes
        lanes={laneSpecs}
        minHour={minHour}
        maxHour={maxHour}
        selectedIndex={selectedIndex}
        onSelect={setRequestedIndex}
        nowDecimal={nowDecimal}
      />

      {selected ? (
        <ProtocolDetailCard
          matched={selected}
          yesterdayItem={yesterdayByTitle?.get(selected.real.title) ?? null}
          participant={participant}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-sm p-6 text-center">
          Pick a marker in any lane to see its details.
        </div>
      )}
    </>
  )
}

export default LanesSchedule
