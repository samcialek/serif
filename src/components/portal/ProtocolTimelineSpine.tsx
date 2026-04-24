/**
 * ProtocolTimelineSpine — vertical compact timeline used in the
 * master-detail split layout (/protocols-split).
 *
 * Renders a narrow left column: hour-of-day ordering, circular markers
 * with source-ring coloring, time + short title to the right of each
 * marker. A "now" horizontal line crosses the spine at current time.
 * Clicking a marker selects it; the caller renders the detail card on
 * the right.
 *
 * Sibling to ProtocolTimelineBar (horizontal variant at /protocols-bar).
 * Same visual language, different axis.
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

const MARKER_SIZE = 36 // px — slightly smaller than the bar variant

function hmToDecimal(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h + m / 60
}

interface Props {
  items: ProtocolItem[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  nowDecimal?: number
}

export function ProtocolTimelineSpine({
  items,
  selectedIndex,
  onSelect,
  nowDecimal,
}: Props) {
  // Sort once; compute the time-y position from hour bounds so the "now"
  // line lands correctly even on sparse days.
  const { sorted, minHour, maxHour } = useMemo(() => {
    if (items.length === 0) return { sorted: [], minHour: 6, maxHour: 24 }
    const withIdx = items.map((item, index) => ({
      item,
      index,
      timeDecimal: hmToDecimal(item.time),
    }))
    withIdx.sort((a, b) => a.timeDecimal - b.timeDecimal)
    const rawMin = withIdx[0].timeDecimal
    const rawMax = withIdx[withIdx.length - 1].timeDecimal
    return {
      sorted: withIdx,
      minHour: Math.floor(rawMin - 0.5),
      maxHour: Math.ceil(rawMax + 0.5),
    }
  }, [items])

  if (sorted.length === 0) return null

  const nowOnSpine =
    nowDecimal != null && nowDecimal >= minHour && nowDecimal <= maxHour

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 flex items-baseline justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
          Today's protocol
        </div>
        <div className="text-[10px] text-slate-400 tabular-nums">
          {items.length} actions
        </div>
      </div>

      {/* Subtle dawn-to-night vertical gradient, mirrors the bar view */}
      <div
        className="relative"
        style={{
          background:
            'linear-gradient(to bottom, #fef9c3 0%, #ffffff 30%, #ffffff 70%, #e0e7ff 100%)',
        }}
      >
        <ul className="relative py-3 pr-3 space-y-1.5">
          {/* Vertical spine line */}
          <div
            className="absolute w-px bg-slate-300 pointer-events-none"
            style={{
              left: `${MARKER_SIZE / 2 + 12}px`,
              top: '12px',
              bottom: '12px',
            }}
          />

          {sorted.map((p) => {
            const isSelected = p.index === selectedIndex
            return (
              <li key={p.index} className="relative">
                <button
                  onClick={() => onSelect(p.index)}
                  className={cn(
                    'w-full flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-lg text-left transition-all',
                    isSelected
                      ? 'bg-indigo-50 ring-1 ring-indigo-200'
                      : 'hover:bg-slate-50',
                  )}
                  aria-pressed={isSelected}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center rounded-full ring-2 flex-shrink-0 relative z-10 transition-all',
                      SOURCE_BG[p.item.source],
                      SOURCE_RING[p.item.source],
                      isSelected && 'ring-[3px]',
                    )}
                    style={{
                      width: `${MARKER_SIZE}px`,
                      height: `${MARKER_SIZE}px`,
                    }}
                  >
                    <span className="text-base leading-none">{p.item.icon}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium tabular-nums text-slate-500 leading-none">
                      {p.item.displayTime}
                    </div>
                    <div
                      className={cn(
                        'text-[13px] leading-snug truncate mt-0.5',
                        isSelected
                          ? 'font-semibold text-slate-900'
                          : 'font-medium text-slate-700',
                      )}
                    >
                      {p.item.title}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        {/* "Now" horizontal line interpolated between markers based on hour */}
        {nowOnSpine && (
          <NowLine
            sorted={sorted}
            nowDecimal={nowDecimal!}
            markerSize={MARKER_SIZE}
          />
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
      </div>
    </div>
  )
}

/** Interpolate a "now" line onto the vertical spine based on how the
 * current time sits between the two neighboring markers. Lives absolute
 * inside the same relative container as the marker list. */
function NowLine({
  sorted,
  nowDecimal,
  markerSize,
}: {
  sorted: Array<{ timeDecimal: number; index: number }>
  nowDecimal: number
  markerSize: number
}) {
  // Find the marker pair that brackets now; snap above first or below
  // last otherwise.
  let topPct: number | null = null
  if (nowDecimal <= sorted[0].timeDecimal) {
    topPct = 0
  } else if (nowDecimal >= sorted[sorted.length - 1].timeDecimal) {
    topPct = 100
  } else {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      if (nowDecimal >= a.timeDecimal && nowDecimal <= b.timeDecimal) {
        const frac = (nowDecimal - a.timeDecimal) / (b.timeDecimal - a.timeDecimal)
        // Each item takes (100 / n) of the vertical space (approximately).
        const segmentPct = 100 / sorted.length
        topPct = segmentPct * (i + 0.5) + segmentPct * frac
        break
      }
    }
  }
  if (topPct === null) return null
  return (
    <div
      className="absolute left-0 right-0 h-0.5 bg-indigo-500/70 pointer-events-none z-20 flex items-center"
      style={{ top: `${topPct}%` }}
      title="Now"
    >
      <span
        className="text-[9px] uppercase tracking-wider font-bold text-indigo-700 bg-white px-1 ml-1 rounded"
        style={{ marginLeft: `${markerSize + 20}px` }}
      >
        now
      </span>
    </div>
  )
}

export default ProtocolTimelineSpine
