/**
 * Sleep window — minimal line.
 *
 * Flat Serif-palette styling. A thin pastel track with two handles for
 * bedtime and wake; clock labels float above, duration sits centered
 * below. Inter sans throughout.
 */

import { useCallback, useRef, useState } from 'react'
import {
  formatClock,
  formatDuration,
  quantize,
  sleepDuration,
  type LeverPairSpec,
} from './types'

interface SleepLeverProps {
  spec: LeverPairSpec
  bedtime: number
  wake: number
  onChange: (bedtime: number, wake: number) => void
}

const SLEEP_ACCENT = '#5B9FCC' // deeper, painterly cool blue

const ML_W = 400
const ML_H = 72

export function MinimalLine({ spec, bedtime, wake, onChange }: SleepLeverProps) {
  const STRIP_START = 18 // 6 PM
  const STRIP_END = 36 // noon next day
  const stripSpan = STRIP_END - STRIP_START

  const stripRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<'bed' | 'wake' | null>(null)

  const bedFrac = (bedtime - STRIP_START) / stripSpan
  const wakeFrac = (wake + 24 - STRIP_START) / stripSpan

  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!stripRef.current || !dragging) return
      const rect = stripRef.current.getBoundingClientRect()
      const fx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const time = STRIP_START + fx * stripSpan
      if (dragging === 'bed') {
        onChange(
          quantize(Math.max(spec.xAxis.min, Math.min(spec.xAxis.max, time)), spec.xAxis),
          wake,
        )
      } else {
        const newWake = time - 24
        onChange(
          bedtime,
          quantize(Math.max(spec.yAxis.min, Math.min(spec.yAxis.max, newWake)), spec.yAxis),
        )
      }
    },
    [dragging, stripSpan, bedtime, wake, spec, onChange],
  )

  const dur = sleepDuration(bedtime, wake)

  return (
    <div className="select-none" style={{ width: ML_W }}>
      <div className="relative" style={{ height: ML_H }}>
        <div
          ref={stripRef}
          className="relative touch-none"
          style={{
            height: 4,
            top: 34,
            background: '#eef2f7',
            borderRadius: 2,
          }}
          onPointerMove={onPointer}
          onPointerUp={(e) => {
            setDragging(null)
            ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
          }}
        >
          {/* Sleep window — solid pastel, flat */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${bedFrac * 100}%`,
              width: `${(wakeFrac - bedFrac) * 100}%`,
              top: 0,
              bottom: 0,
              background: SLEEP_ACCENT,
              borderRadius: 2,
              transition: dragging ? 'none' : 'all 200ms cubic-bezier(0.4,0,0.2,1)',
            }}
          />
          {/* Bedtime handle */}
          <div
            className="absolute cursor-ew-resize"
            style={{
              left: `calc(${bedFrac * 100}% - 10px)`,
              top: -10,
              width: 20,
              height: 24,
              display: 'flex',
              justifyContent: 'center',
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              setDragging('bed')
              ;(e.currentTarget.parentElement as HTMLDivElement).setPointerCapture(e.pointerId)
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                border: `2px solid ${SLEEP_ACCENT}`,
                marginTop: 3,
              }}
            />
          </div>
          {/* Wake handle */}
          <div
            className="absolute cursor-ew-resize"
            style={{
              left: `calc(${wakeFrac * 100}% - 10px)`,
              top: -10,
              width: 20,
              height: 24,
              display: 'flex',
              justifyContent: 'center',
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              setDragging('wake')
              ;(e.currentTarget.parentElement as HTMLDivElement).setPointerCapture(e.pointerId)
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                border: `2px solid ${SLEEP_ACCENT}`,
                marginTop: 3,
              }}
            />
          </div>
        </div>

        {/* Floating bedtime label */}
        <div
          className="absolute pointer-events-none whitespace-nowrap"
          style={{
            left: `calc(${bedFrac * 100}% - 30px)`,
            top: 0,
            width: 60,
            textAlign: 'center',
            color: '#334155',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 15,
            fontWeight: 400,
          }}
        >
          {formatClock(bedtime)}
        </div>
        {/* Floating wake label */}
        <div
          className="absolute pointer-events-none whitespace-nowrap"
          style={{
            left: `calc(${wakeFrac * 100}% - 30px)`,
            top: 0,
            width: 60,
            textAlign: 'center',
            color: '#334155',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 15,
            fontWeight: 400,
          }}
        >
          {formatClock(wake)}
        </div>
        {/* Center duration label */}
        <div
          className="absolute pointer-events-none whitespace-nowrap"
          style={{
            left: `${((bedFrac + wakeFrac) / 2) * 100}%`,
            transform: 'translateX(-50%)',
            bottom: 2,
            color: '#64748b',
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 13,
            fontWeight: 400,
          }}
        >
          {formatDuration(dur)}
        </div>
      </div>
    </div>
  )
}
