/**
 * ProtocolTimelineBar — experimental horizontal layout for the
 * Protocols tab. Lives on the /protocols-bar route alongside the
 * canonical vertical spine at /protocols.
 *
 * Reads the same ProtocolItem[] from buildDailyProtocol. Plots each
 * item as a circular marker along a dawn-to-dusk horizontal bar with
 * hour ticks underneath. Collisions resolve into stacked rows so
 * items clustered near bedtime don't overlap. Click a marker → caller
 * gets a selection event and renders the item's detail below.
 *
 * Space trade-off we're testing: horizontal may be too narrow for
 * dense days. Caffeine cutoff, wind-down, screens-off, and lights-out
 * all cluster in a ~2h window before bed, so the collision-stacking
 * path gets exercised on most days.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
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

const MARKER_SIZE = 44 // px
const ROW_GAP = 6 // px vertical gap when stacking

/** Parse "HH:MM" to decimal hours (0–24). */
function hmToDecimal(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h + m / 60
}

interface MarkerPlacement {
  item: ProtocolItem
  index: number
  timeDecimal: number
  xPct: number
  row: number // 0 = closest to spine, 1 = stacked above, …
}

/** Greedy collision-stack: items processed left-to-right; each is placed
 * on the lowest row whose current right edge is < its left edge. */
function placeMarkers(
  items: ProtocolItem[],
  minHour: number,
  maxHour: number,
  containerWidth: number,
): MarkerPlacement[] {
  if (containerWidth <= 0 || maxHour <= minHour) {
    return items.map((item, i) => ({
      item,
      index: i,
      timeDecimal: hmToDecimal(item.time),
      xPct: 0,
      row: 0,
    }))
  }
  const span = maxHour - minHour
  const halfWidthPct = ((MARKER_SIZE + 4) / 2 / containerWidth) * 100
  const placements: MarkerPlacement[] = items
    .map((item, i) => ({
      item,
      index: i,
      timeDecimal: hmToDecimal(item.time),
      xPct: ((hmToDecimal(item.time) - minHour) / span) * 100,
      row: 0,
    }))
    .sort((a, b) => a.xPct - b.xPct)

  const rowRightEdges: number[] = []
  for (const p of placements) {
    const leftEdge = p.xPct - halfWidthPct
    const rightEdge = p.xPct + halfWidthPct
    let assigned = -1
    for (let r = 0; r < rowRightEdges.length; r++) {
      if (rowRightEdges[r] < leftEdge) {
        assigned = r
        break
      }
    }
    if (assigned === -1) {
      assigned = rowRightEdges.length
      rowRightEdges.push(rightEdge)
    } else {
      rowRightEdges[assigned] = rightEdge
    }
    p.row = assigned
  }
  placements.sort((a, b) => a.index - b.index)
  return placements
}

function hourLabel(h: number): string {
  const hr = ((Math.round(h) % 24) + 24) % 24
  const period = hr < 12 ? 'am' : 'pm'
  const h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}${period}`
}

interface Props {
  items: ProtocolItem[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  /** Current time as decimal hours (0–24). Omit to hide the "now" line. */
  nowDecimal?: number
}

export function ProtocolTimelineBar({
  items,
  selectedIndex,
  onSelect,
  nowDecimal,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState<number>(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (): void => setWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { minHour, maxHour, hourTicks } = useMemo(() => {
    if (items.length === 0) {
      return { minHour: 6, maxHour: 24, hourTicks: [8, 12, 16, 20] }
    }
    const times = items.map((i) => hmToDecimal(i.time))
    const rawMin = Math.min(...times)
    const rawMax = Math.max(...times)
    const minH = Math.floor(rawMin - 0.5)
    const maxH = Math.ceil(rawMax + 0.5)
    const ticks: number[] = []
    for (let h = Math.ceil(minH / 2) * 2; h <= maxH; h += 2) {
      if (h > minH && h < maxH) ticks.push(h)
    }
    return { minHour: minH, maxHour: maxH, hourTicks: ticks }
  }, [items])

  const placements = useMemo(
    () => placeMarkers(items, minHour, maxHour, width || 800),
    [items, minHour, maxHour, width],
  )

  const rowCount = placements.reduce((m, p) => Math.max(m, p.row + 1), 1)
  const stackHeight = rowCount * (MARKER_SIZE + ROW_GAP)
  const nowXPct =
    nowDecimal != null && nowDecimal >= minHour && nowDecimal <= maxHour
      ? ((nowDecimal - minHour) / (maxHour - minHour)) * 100
      : null

  return (
    <div className="w-full">
      <div className="px-3 mb-2 flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
          Today's protocol
        </div>
        <div className="text-[10px] text-slate-400 tabular-nums">
          {items.length} actions · {hourLabel(minHour)} → {hourLabel(maxHour)}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full rounded-xl border border-slate-200 overflow-hidden"
        style={{
          background:
            'linear-gradient(to right, #fef3c7 0%, #fef9c3 10%, #ffffff 35%, #ffffff 65%, #dbeafe 85%, #c7d2fe 100%)',
          height: `${stackHeight + 48}px`,
        }}
      >
        {placements.map((p) => {
          const isSelected = p.index === selectedIndex
          const topPx =
            rowCount * (MARKER_SIZE + ROW_GAP) - (p.row + 1) * (MARKER_SIZE + ROW_GAP)
          return (
            <button
              key={p.index}
              onClick={() => onSelect(p.index)}
              className={cn(
                'absolute flex items-center justify-center rounded-full ring-2 transition-all',
                SOURCE_BG[p.item.source],
                SOURCE_RING[p.item.source],
                isSelected
                  ? 'scale-110 ring-[3px] ring-offset-2 ring-offset-white z-20 shadow-md'
                  : 'hover:scale-105 hover:shadow z-10',
              )}
              style={{
                width: `${MARKER_SIZE}px`,
                height: `${MARKER_SIZE}px`,
                left: `calc(${p.xPct}% - ${MARKER_SIZE / 2}px)`,
                top: `${topPx + 4}px`,
              }}
              title={`${p.item.displayTime} · ${p.item.title}`}
              aria-label={`${p.item.title} at ${p.item.displayTime}`}
              aria-pressed={isSelected}
            >
              <span className="text-lg leading-none">{p.item.icon}</span>
            </button>
          )
        })}

        <div
          className="absolute left-3 right-3 h-px bg-slate-300"
          style={{ top: `${stackHeight + 8}px` }}
        />

        {nowXPct !== null && (
          <div
            className="absolute top-2 bottom-8 w-0.5 bg-indigo-500/70 z-30 pointer-events-none"
            style={{ left: `calc(${nowXPct}% - 1px)` }}
            title="Now"
          >
            <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white" />
          </div>
        )}

        <div className="absolute left-0 right-0 bottom-2 h-5 pointer-events-none">
          {[minHour, ...hourTicks, maxHour].map((h, i, arr) => {
            const xPct = ((h - minHour) / (maxHour - minHour)) * 100
            return (
              <div
                key={`${h}-${i}`}
                className="absolute text-[10px] tabular-nums text-slate-500"
                style={{
                  left: `${xPct}%`,
                  transform:
                    i === 0
                      ? 'translateX(0)'
                      : i === arr.length - 1
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
              >
                <div className="mx-auto w-px h-1.5 bg-slate-400 mb-0.5" />
                {hourLabel(h)}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-2 px-1 flex items-center gap-3 flex-wrap text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Twin-SEM pick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Regime-driven
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-300" /> Baseline
        </span>
        {nowXPct !== null && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> Now
          </span>
        )}
      </div>
    </div>
  )
}

export default ProtocolTimelineBar
