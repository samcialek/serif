/**
 * ProtocolVerticalLanes — swim lanes running top-to-bottom.
 *
 * Three parallel columns (Sleep & circadian / Training / Nutrition &
 * recovery), each an independent vertical timeline. A shared hour axis
 * sits on the left; a horizontal "now" line crosses all three columns
 * at their shared y coordinate.
 *
 * Marker y-positions come from the shared min/max hour range so items
 * at the same time align across columns.
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import type { ProtocolItem, ProtocolSource } from '@/utils/dailyProtocol'

const SOURCE_RING: Record<ProtocolSource, string> = {
  twin_sem: 'ring-emerald-400',
  regime_driven: 'ring-amber-400',
  baseline: 'ring-slate-300',
}
const SOURCE_BG: Record<ProtocolSource, string> = {
  twin_sem: 'bg-emerald-50',
  regime_driven: 'bg-amber-50',
  baseline: 'bg-slate-50',
}

const MARKER_SIZE = 40 // px
const MIN_GAP_PX = 10 // minimum clear space between two markers' edges
const ROW_PITCH = MARKER_SIZE + MIN_GAP_PX // center-to-center minimum
const COLUMN_HEIGHT = 520 // px — roughly 16h of day at ~33px/hour

function hmToDecimal(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h + m / 60
}

function hourLabel(h: number): string {
  const hr = ((Math.round(h) % 24) + 24) % 24
  const period = hr < 12 ? 'am' : 'pm'
  const h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}${period}`
}

export interface LaneEntry {
  item: ProtocolItem
  originalIndex: number
}

export interface VerticalLaneSpec {
  key: string
  label: string
  hint: string
  entries: LaneEntry[]
}

interface Props {
  lanes: VerticalLaneSpec[]
  /** Shared time range so lanes align on the y-axis. */
  minHour: number
  maxHour: number
  selectedIndex: number | null
  onSelect: (originalIndex: number) => void
  nowDecimal?: number
}

export function ProtocolVerticalLanes({
  lanes,
  minHour,
  maxHour,
  selectedIndex,
  onSelect,
  nowDecimal,
}: Props) {
  const { hourTicks, nowPct } = useMemo(() => {
    const ticks: number[] = []
    for (let h = Math.ceil(minHour / 2) * 2; h <= maxHour; h += 2) {
      ticks.push(h)
    }
    const now =
      nowDecimal != null && nowDecimal >= minHour && nowDecimal <= maxHour
        ? ((nowDecimal - minHour) / (maxHour - minHour)) * 100
        : null
    return { hourTicks: ticks, nowPct: now }
  }, [minHour, maxHour, nowDecimal])

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="grid gap-3 p-3 border-b border-slate-100 bg-white"
        style={{
          gridTemplateColumns: `64px repeat(${lanes.length}, minmax(0, 1fr))`,
        }}
      >
        <div />
        {lanes.map((lane) => (
          <div key={lane.key}>
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-700">
              {lane.label}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{lane.hint}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div
        className="relative grid gap-3 p-3"
        style={{
          gridTemplateColumns: `64px repeat(${lanes.length}, minmax(0, 1fr))`,
          height: `${COLUMN_HEIGHT}px`,
          background:
            'linear-gradient(to bottom, #fef9c3 0%, #ffffff 22%, #ffffff 72%, #e0e7ff 100%)',
        }}
      >
        {/* Hour axis */}
        <div className="relative">
          {hourTicks.map((h) => {
            const pct = ((h - minHour) / (maxHour - minHour)) * 100
            return (
              <div
                key={h}
                className="absolute right-0 text-[10px] tabular-nums text-slate-500 flex items-center gap-1 pr-1"
                style={{ top: `${pct}%`, transform: 'translateY(-50%)' }}
              >
                <span>{hourLabel(h)}</span>
                <span className="w-1.5 h-px bg-slate-400" />
              </div>
            )
          })}
        </div>

        {/* Lane columns */}
        {lanes.map((lane) => (
          <LaneColumn
            key={lane.key}
            lane={lane}
            minHour={minHour}
            maxHour={maxHour}
            selectedIndex={selectedIndex}
            onSelect={onSelect}
          />
        ))}

        {/* "Now" horizontal line across all columns (grid-positioned) */}
        {nowPct != null && (
          <div
            className="pointer-events-none z-30 absolute left-3 right-3 flex items-center"
            style={{
              top: `calc(12px + ${nowPct}% * ${(COLUMN_HEIGHT - 24) / 100}px)`,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="h-0.5 bg-indigo-500/70 flex-1" />
            <span className="absolute -top-2 right-0 text-[9px] uppercase tracking-wider font-bold text-indigo-700 bg-white px-1 rounded border border-indigo-200">
              now
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Twin-SEM
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Regime
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" /> Baseline
        </span>
        {nowPct != null && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> Now
          </span>
        )}
      </div>
    </div>
  )
}

/** Resolve collisions within a single lane: if two markers' nominal
 * top positions are closer than ROW_PITCH, push the later one down so
 * they visually stay clear of each other. The marker's TIME LABEL on
 * the item itself still says the real clock time, so the displacement
 * is a layout concession, not a factual lie. */
function resolveLanePositions(
  entries: LaneEntry[],
  minHour: number,
  maxHour: number,
): Array<{ entry: LaneEntry; topPx: number; displaced: boolean }> {
  const hourSpan = Math.max(maxHour - minHour, 1e-6)
  // Work in percent of column, convert to px for min-gap checks.
  const innerHeight = COLUMN_HEIGHT - 16 // account for p-3 = 12px top + 4px breathing
  const sorted = [...entries].sort(
    (a, b) => hmToDecimal(a.item.time) - hmToDecimal(b.item.time),
  )
  const positioned: Array<{ entry: LaneEntry; topPx: number; displaced: boolean }> = []
  let minNextTop = 0
  for (const entry of sorted) {
    const tDec = hmToDecimal(entry.item.time)
    const nominalCenter = ((tDec - minHour) / hourSpan) * innerHeight
    const nominalTop = nominalCenter - MARKER_SIZE / 2
    const actualTop = Math.max(nominalTop, minNextTop)
    positioned.push({
      entry,
      topPx: actualTop,
      displaced: actualTop > nominalTop + 0.5,
    })
    minNextTop = actualTop + ROW_PITCH
  }
  return positioned
}

function LaneColumn({
  lane,
  minHour,
  maxHour,
  selectedIndex,
  onSelect,
}: {
  lane: VerticalLaneSpec
  minHour: number
  maxHour: number
  selectedIndex: number | null
  onSelect: (originalIndex: number) => void
}) {
  const positions = useMemo(
    () => resolveLanePositions(lane.entries, minHour, maxHour),
    [lane.entries, minHour, maxHour],
  )

  if (lane.entries.length === 0) {
    return (
      <div className="relative rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex items-center justify-center">
        <span className="text-[11px] text-slate-400 italic">
          No items today.
        </span>
        <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-200" />
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical spine */}
      <div className="absolute left-5 top-2 bottom-2 w-px bg-slate-300" />

      {positions.map(({ entry, topPx, displaced }) => {
        const isSelected = entry.originalIndex === selectedIndex
        return (
          <button
            key={entry.originalIndex}
            onClick={() => onSelect(entry.originalIndex)}
            className={cn(
              'absolute flex items-center gap-2 text-left pr-2 rounded-lg transition-all',
              'hover:bg-slate-50/70',
              isSelected && 'bg-indigo-50 ring-1 ring-indigo-200',
            )}
            style={{
              top: `${topPx}px`,
              left: 0,
              right: 0,
            }}
            aria-pressed={isSelected}
            title={
              displaced
                ? `${entry.item.displayTime} — laid out slightly below its actual time to stay clear of the previous item`
                : undefined
            }
          >
            <span
              className={cn(
                'flex items-center justify-center rounded-full ring-2 flex-shrink-0 relative z-10 transition-all',
                SOURCE_BG[entry.item.source],
                SOURCE_RING[entry.item.source],
                isSelected && 'ring-[3px] scale-105 shadow',
              )}
              style={{
                width: `${MARKER_SIZE}px`,
                height: `${MARKER_SIZE}px`,
              }}
            >
              <span className="text-base leading-none">{entry.item.icon}</span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium tabular-nums text-slate-500 leading-none">
                {entry.item.displayTime}
              </div>
              <div
                className={cn(
                  'text-[12px] leading-snug truncate mt-0.5',
                  isSelected
                    ? 'font-semibold text-slate-900'
                    : 'font-medium text-slate-700',
                )}
              >
                {entry.item.title}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default ProtocolVerticalLanes
