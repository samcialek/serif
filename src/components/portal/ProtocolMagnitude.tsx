/**
 * ProtocolMagnitude — render a ProtocolItem's "dose" as a visual shape
 * instead of as text.
 *
 * Three flavors, switched by item title:
 *
 *   Time-anchored point  (Wake, Caffeine cutoff, Wind-down, Screens
 *                         off, Lights out, Iron-support, Anti-inflam.)
 *     A horizontal day-axis from ~wake to midnight with a marker at
 *     the item's time. For bedtime-derived items, if the user's
 *     current bedtime differs from today's target, we ALSO plot a
 *     dimmed "current" marker and draw an arrow between them — so
 *     "caffeine cutoff pulled earlier" reads as an actual leftward
 *     shift, not just a dose sentence.
 *
 *   Session span  (Training — *)
 *     A highlighted duration bar on the same day-axis, stretching from
 *     the session's start for its training_volume. Duration in minutes
 *     printed to the right of the bar.
 *
 *   Sleep window  (Lights out, when bedtime + sleep_duration is known)
 *     Same as time-anchored, plus a light-blue "sleep window" tint
 *     running from bedtime to wake on the axis.
 *
 * The point of this component is to let the eye read *magnitudes*
 * (where in the day, how long, how much of a shift) without parsing
 * the dose sentence.
 */

import { ArrowRight } from 'lucide-react'
import type { ProtocolItem } from '@/utils/dailyProtocol'
import type { ParticipantPortal } from '@/data/portal/types'
import type { CandidateSchedule } from '@/utils/twinSem'
import { SESSION_PRESETS } from '@/utils/twinSem'

const AXIS_START_BUFFER = 0.5 // hours before first anchor
const AXIS_END_BUFFER = 0.5 // hours after last anchor
const BAR_HEIGHT = 28 // px — overall SVG height
const AXIS_Y = 18 // baseline y-coordinate
const MARKER_R = 5 // marker radius

function hmToDecimal(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h + m / 60
}

function formatClock(decimal: number): string {
  const hr = ((Math.floor(decimal) % 24) + 24) % 24
  const mins = Math.round((decimal - Math.floor(decimal)) * 60) % 60
  const period = hr < 12 ? 'am' : 'pm'
  const h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}:${String(mins).padStart(2, '0')}${period}`
}

/** Given a protocol item and the current-vs-target bedtimes, return the
 * equivalent time the item would have landed at if today's picker had
 * made the "current" choice — or null if the item isn't bedtime-derived.
 *
 * Wake IS indirectly derived via sleep_duration, but our ProtocolItem
 * Wake is pinned to the *observed* wake anyway so we don't plot a shift
 * for it. Training & emphasis items have no current-vs-target shift.
 */
function currentEquivalentTime(
  item: ProtocolItem,
  currentBed: number | undefined,
  targetBed: number,
): number | null {
  if (currentBed == null || Math.abs(currentBed - targetBed) < 0.01) return null
  const shift = targetBed - currentBed
  const tDec = hmToDecimal(item.time)
  switch (item.title) {
    case 'Caffeine cutoff':
    case 'Wind-down window':
    case 'Screens off':
    case 'Lights out':
      return tDec - shift
    default:
      return null
  }
}

interface Props {
  item: ProtocolItem
  participant: ParticipantPortal
  schedule: CandidateSchedule
  wakeTime: number
  width?: number
}

export function ProtocolMagnitude({
  item,
  participant,
  schedule,
  wakeTime,
  width = 280,
}: Props) {
  const currentBed = participant.current_values?.bedtime as number | undefined
  const targetBed = schedule.bedtime
  const tDec = hmToDecimal(item.time)
  const currentT = currentEquivalentTime(item, currentBed, targetBed)

  // Build a day-axis range that covers wake, all relevant markers, and a
  // buffer on either side.
  const candidates = [wakeTime, tDec, targetBed]
  if (currentT != null) candidates.push(currentT)
  if (currentBed != null) candidates.push(currentBed)
  const axisStart = Math.floor(Math.min(...candidates) - AXIS_START_BUFFER)
  const axisEnd = Math.ceil(Math.max(...candidates) + AXIS_END_BUFFER)
  const axisSpan = Math.max(axisEnd - axisStart, 1)

  const toX = (decimal: number): number => {
    const clamped = Math.min(Math.max(decimal, axisStart), axisEnd)
    return ((clamped - axisStart) / axisSpan) * width
  }

  const isTraining = item.title.startsWith('Training')
  const isLightsOut = item.title === 'Lights out'

  // Training span endpoints
  let sessionDurationMin: number | null = null
  let sessionEndDec: number | null = null
  if (isTraining) {
    const session = SESSION_PRESETS[schedule.session]
    sessionDurationMin = session.training_volume * 60
    sessionEndDec = tDec + session.training_volume
  }

  // Sleep window endpoints (lights-out → wake-next-day)
  let sleepWindow: { start: number; end: number } | null = null
  if (isLightsOut) {
    const wrappedWake = wakeTime <= targetBed ? wakeTime + 24 : wakeTime
    // Show the wake-next-day side only if it fits in the axis
    const endShown = Math.min(wrappedWake, axisEnd)
    sleepWindow = { start: tDec, end: endShown }
  }

  const hourTicks: number[] = []
  const tickStride = axisSpan <= 6 ? 1 : axisSpan <= 12 ? 2 : 3
  for (let h = Math.ceil(axisStart / tickStride) * tickStride; h <= axisEnd; h += tickStride) {
    hourTicks.push(h)
  }

  return (
    <div className="my-1">
      <svg
        width={width}
        height={BAR_HEIGHT}
        role="img"
        aria-label={`${item.title} at ${formatClock(tDec)}`}
      >
        {/* Axis spine */}
        <line
          x1={0}
          x2={width}
          y1={AXIS_Y}
          y2={AXIS_Y}
          stroke="#cbd5e1"
          strokeWidth={1}
        />

        {/* Hour tick marks */}
        {hourTicks.map((h) => {
          const x = toX(h)
          return (
            <g key={h}>
              <line
                x1={x}
                x2={x}
                y1={AXIS_Y - 2}
                y2={AXIS_Y + 2}
                stroke="#94a3b8"
                strokeWidth={1}
              />
              <text
                x={x}
                y={BAR_HEIGHT - 1}
                textAnchor="middle"
                className="fill-slate-400"
                fontSize={8.5}
              >
                {formatClockShort(h)}
              </text>
            </g>
          )
        })}

        {/* Sleep window tint */}
        {sleepWindow && (
          <rect
            x={toX(sleepWindow.start)}
            width={Math.max(1, toX(sleepWindow.end) - toX(sleepWindow.start))}
            y={AXIS_Y - 5}
            height={10}
            fill="#c7d2fe"
            opacity={0.45}
            rx={2}
          />
        )}

        {/* Training span */}
        {isTraining && sessionEndDec != null && (
          <rect
            x={toX(tDec)}
            width={Math.max(6, toX(sessionEndDec) - toX(tDec))}
            y={AXIS_Y - 5}
            height={10}
            fill="#10b981"
            opacity={0.35}
            rx={2}
          />
        )}

        {/* Current-state marker + arrow (bedtime-derived items only) */}
        {currentT != null && (
          <>
            <circle
              cx={toX(currentT)}
              cy={AXIS_Y}
              r={MARKER_R - 1}
              fill="white"
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
            <ShiftArrow
              fromX={toX(currentT)}
              toX={toX(tDec)}
              y={AXIS_Y - 11}
            />
          </>
        )}

        {/* Target marker — the item's actual time */}
        <circle
          cx={toX(tDec)}
          cy={AXIS_Y}
          r={MARKER_R}
          fill={isTraining ? '#059669' : '#4f46e5'}
          stroke="white"
          strokeWidth={1.5}
        />
      </svg>

      {/* Labels row */}
      <div className="flex items-center gap-2 mt-0.5 text-[10px] tabular-nums text-slate-600 leading-none">
        {currentT != null && (
          <>
            <span className="text-slate-400 line-through">{formatClock(currentT)}</span>
            <ArrowRight className="w-2.5 h-2.5 text-slate-400" aria-hidden />
          </>
        )}
        <span className={isTraining ? 'font-semibold text-emerald-700' : 'font-semibold text-indigo-700'}>
          {formatClock(tDec)}
        </span>
        {isTraining && sessionDurationMin != null && (
          <span className="text-slate-500">
            · {Math.round(sessionDurationMin)} min
          </span>
        )}
        {sleepWindow && (
          <span className="text-slate-500">
            · {formatDuration(sleepWindow.end - sleepWindow.start)} in bed
          </span>
        )}
      </div>
    </div>
  )
}

function formatClockShort(decimal: number): string {
  const hr = ((Math.round(decimal) % 24) + 24) % 24
  const period = hr < 12 ? 'a' : 'p'
  const h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}${period}`
}

function formatDuration(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`
  }
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

function ShiftArrow({
  fromX,
  toX,
  y,
}: {
  fromX: number
  toX: number
  y: number
}) {
  const goingRight = toX > fromX
  const tipX = toX
  const tailX = fromX
  return (
    <g>
      <line
        x1={tailX}
        x2={tipX}
        y1={y}
        y2={y}
        stroke="#64748b"
        strokeWidth={1}
        strokeDasharray="2 1.5"
      />
      {/* Arrowhead */}
      <polygon
        points={`${tipX},${y} ${tipX - (goingRight ? 4 : -4)},${y - 2} ${tipX - (goingRight ? 4 : -4)},${y + 2}`}
        fill="#64748b"
      />
    </g>
  )
}

export default ProtocolMagnitude
