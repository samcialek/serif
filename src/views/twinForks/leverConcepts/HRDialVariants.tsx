/**
 * Four HR-dial design concepts for side-by-side comparison.
 *
 *   A  Splash    — warm cream backdrop, generous airy layout, plain values
 *   B  Poster    — compact dial above three solid color-block panels
 *   C  Floating  — values float at each ring's handle; no separate legend
 *   D  Gallery   — dial with a museum-caption strip below
 *
 * All four share the dial geometry and pointer math; they vary only in
 * background, sizing, color application, and how (or whether) they show
 * the per-band readouts.
 */

import { useCallback, useRef, useState } from 'react'
import { quantizeBand, type ThreeBandSpec } from './types'

interface VariantProps {
  spec: ThreeBandSpec
  values: [number, number, number]
  onChange: (next: [number, number, number]) => void
}

// ─── Shared dial geometry ───────────────────────────────────────────

interface DialGeom {
  size: number
  radii: [number, number, number]
  arcW: number
}

const SWEEP_START = 135
const SWEEP_RANGE = 270
const SWEEP_END = SWEEP_START + SWEEP_RANGE

function fracToAngle(f: number): number {
  return SWEEP_START + f * SWEEP_RANGE
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const from = polar(cx, cy, r, fromDeg)
  const to = polar(cx, cy, r, toDeg)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  const sweep = toDeg > fromDeg ? 1 : 0
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
}

function angleFromPointer(
  px: number,
  py: number,
  rect: DOMRect,
  cx: number,
  cy: number,
): { frac: number; radius: number } {
  const dx = px - rect.left - cx
  const dy = py - rect.top - cy
  const radius = Math.sqrt(dx * dx + dy * dy)
  let raw = (Math.atan2(dy, dx) * 180) / Math.PI
  if (raw < 0) raw += 360
  let unwrapped: number
  if (raw >= SWEEP_START) unwrapped = raw
  else if (raw <= SWEEP_END - 360) unwrapped = raw + 360
  else {
    const distToStart = SWEEP_START - raw
    const distToEnd = raw - (SWEEP_END - 360)
    unwrapped = distToStart < distToEnd ? SWEEP_START : SWEEP_END
  }
  const frac = Math.max(0, Math.min(1, (unwrapped - SWEEP_START) / SWEEP_RANGE))
  return { frac, radius }
}

interface UseDialResult {
  svgRef: React.MutableRefObject<SVGSVGElement | null>
  dragging: 0 | 1 | 2 | null
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
}

function useDial(
  spec: ThreeBandSpec,
  values: [number, number, number],
  onChange: VariantProps['onChange'],
  geom: DialGeom,
): UseDialResult {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<0 | 1 | 2 | null>(null)
  const cx = geom.size / 2
  const cy = geom.size / 2

  const updateBand = useCallback(
    (idx: 0 | 1 | 2, frac: number) => {
      const band = spec.bands[idx]
      const raw = band.min + frac * (band.max - band.min)
      const next: [number, number, number] = [...values]
      next[idx] = quantizeBand(raw, band)
      onChange(next)
    },
    [values, spec, onChange],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const { radius, frac } = angleFromPointer(e.clientX, e.clientY, rect, cx, cy)
      const midpoints = [
        (geom.radii[0] + geom.radii[1]) / 2,
        (geom.radii[1] + geom.radii[2]) / 2,
      ]
      let target: 0 | 1 | 2
      if (radius >= midpoints[0]) target = 0
      else if (radius >= midpoints[1]) target = 1
      else target = 2
      setDragging(target)
      ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
      updateBand(target, frac)
    },
    [updateBand, geom, cx, cy],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (dragging == null || !svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const { frac } = angleFromPointer(e.clientX, e.clientY, rect, cx, cy)
      updateBand(dragging, frac)
    },
    [dragging, updateBand, cx, cy],
  )

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setDragging(null)
    ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
  }, [])

  return { svgRef, dragging, onPointerDown, onPointerMove, onPointerUp }
}

interface DialRingsProps {
  spec: ThreeBandSpec
  values: [number, number, number]
  geom: DialGeom
  trackColor: string
  handleStrokeWidth?: number
  handleR?: number
  handleFill?: string
  dragging: 0 | 1 | 2 | null
}

function DialRings({
  spec,
  values,
  geom,
  trackColor,
  handleStrokeWidth = 2.5,
  handleR = 7,
  handleFill = '#fff',
  dragging,
}: DialRingsProps) {
  const cx = geom.size / 2
  const cy = geom.size / 2
  return (
    <>
      {spec.bands.map((band, idx) => {
        const r = geom.radii[idx]
        const valueFrac = (values[idx] - band.min) / (band.max - band.min)
        const handleAngle = fracToAngle(valueFrac)
        const handlePos = polar(cx, cy, r, handleAngle)
        return (
          <g key={band.id}>
            <path
              d={arcPath(cx, cy, r, SWEEP_START, SWEEP_END)}
              fill="none"
              stroke={trackColor}
              strokeWidth={geom.arcW}
              strokeLinecap="round"
            />
            <path
              d={arcPath(cx, cy, r, SWEEP_START, handleAngle)}
              fill="none"
              stroke={band.color}
              strokeWidth={geom.arcW}
              strokeLinecap="round"
              style={{
                transition: dragging != null ? 'none' : 'd 280ms cubic-bezier(0.4,0,0.2,1)',
              }}
            />
            <circle
              cx={handlePos.x}
              cy={handlePos.y}
              r={handleR}
              fill={handleFill}
              stroke={band.color}
              strokeWidth={handleStrokeWidth}
              style={{
                transition: dragging != null ? 'none' : 'cx 280ms cubic-bezier(0.4,0,0.2,1), cy 280ms cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </g>
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// A · Splash — warm cream backdrop, airy layout, plain values
// ═══════════════════════════════════════════════════════════════════

/** TRIMP score (Edwards-style, simplified):
 *  TRIMP = Z1·1 + Z2-3·2 + Z4-5·2.5
 *  Default values (120, 30, 5) → 192.5 ≈ 193 */
export function trimpFor(values: [number, number, number]): number {
  return Math.round(values[0] * 1 + values[1] * 2 + values[2] * 2.5)
}

export function HRDialSplash({ spec, values, onChange }: VariantProps) {
  const geom: DialGeom = { size: 280, radii: [118, 92, 66], arcW: 12 }
  const dial = useDial(spec, values, onChange, geom)
  const trimp = trimpFor(values)
  const cx = geom.size / 2
  const cy = geom.size / 2

  return (
    <div
      className="rounded-3xl py-12 px-10"
      style={{
        background: '#fefbf3',
        border: '1px solid #f5efe2',
      }}
    >
      <div className="flex flex-col items-center gap-12">
        <svg
          ref={dial.svgRef}
          width={geom.size}
          height={geom.size}
          onPointerDown={dial.onPointerDown}
          onPointerMove={dial.onPointerMove}
          onPointerUp={dial.onPointerUp}
          style={{
            cursor: dial.dragging != null ? 'grabbing' : 'pointer',
            touchAction: 'none',
            display: 'block',
          }}
        >
          <DialRings
            spec={spec}
            values={values}
            geom={geom}
            trackColor="#f5efe2"
            dragging={dial.dragging}
          />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fontSize={48}
            fontWeight={200}
            fill="#1c1917"
            style={{
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '-0.04em',
            }}
          >
            {trimp}
          </text>
          <text
            x={cx}
            y={cy + 22}
            textAnchor="middle"
            fontSize={11}
            fontWeight={400}
            fill="#78716c"
            style={{
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            TRIMP
          </text>
        </svg>

        <div className="grid grid-cols-3 gap-12 w-full">
          {spec.bands.map((band, idx) => (
            <div key={band.id} className="flex flex-col items-center gap-2">
              <span
                className="text-[14px] text-slate-500 font-normal"
                style={{
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {band.label}
              </span>
              <span
                className="text-[44px] tabular-nums leading-none"
                style={{
                  color: band.color,
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                  fontWeight: 200,
                  letterSpacing: '-0.04em',
                }}
              >
                {Math.round(values[idx])}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// B · Poster — dial above three solid color blocks
// ═══════════════════════════════════════════════════════════════════

export function HRDialPoster({ spec, values, onChange }: VariantProps) {
  const geom: DialGeom = { size: 220, radii: [92, 72, 52], arcW: 9 }
  const dial = useDial(spec, values, onChange, geom)
  const totalMod = Math.round(values[1] + values[2])
  const cx = geom.size / 2
  const cy = geom.size / 2

  return (
    <div
      className="rounded-3xl bg-white overflow-hidden"
      style={{ border: '1px solid #e2e8f0' }}
    >
      <div className="flex flex-col items-center pt-10 pb-8">
        <svg
          ref={dial.svgRef}
          width={geom.size}
          height={geom.size}
          onPointerDown={dial.onPointerDown}
          onPointerMove={dial.onPointerMove}
          onPointerUp={dial.onPointerUp}
          style={{
            cursor: dial.dragging != null ? 'grabbing' : 'pointer',
            touchAction: 'none',
            display: 'block',
          }}
        >
          <DialRings
            spec={spec}
            values={values}
            geom={geom}
            trackColor="#f1f5f9"
            dragging={dial.dragging}
          />
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize={52}
            fontWeight={200}
            fill="#1e293b"
            style={{
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '-0.04em',
            }}
          >
            {totalMod}
          </text>
        </svg>
      </div>
      <div className="grid grid-cols-3">
        {spec.bands.map((band, idx) => (
          <div
            key={band.id}
            className="flex flex-col items-center justify-center py-6 px-2"
            style={{ background: band.color }}
          >
            <span
              className="text-[13px] font-normal mb-2"
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {band.label}
            </span>
            <span
              className="text-[36px] tabular-nums leading-none"
              style={{
                color: '#fff',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                fontWeight: 300,
                letterSpacing: '-0.03em',
              }}
            >
              {Math.round(values[idx])}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// C · Floating — values appear at each handle; no separate legend
// ═══════════════════════════════════════════════════════════════════

export function HRDialFloating({ spec, values, onChange }: VariantProps) {
  const geom: DialGeom = { size: 360, radii: [144, 116, 88], arcW: 11 }
  const dial = useDial(spec, values, onChange, geom)
  const totalMod = Math.round(values[1] + values[2])
  const cx = geom.size / 2
  const cy = geom.size / 2

  return (
    <div
      className="rounded-3xl py-12 px-12 flex justify-center"
      style={{
        background: '#fdfaf3',
        border: '1px solid #f5efe2',
      }}
    >
      <svg
        ref={dial.svgRef}
        width={geom.size}
        height={geom.size}
        onPointerDown={dial.onPointerDown}
        onPointerMove={dial.onPointerMove}
        onPointerUp={dial.onPointerUp}
        style={{
          cursor: dial.dragging != null ? 'grabbing' : 'pointer',
          touchAction: 'none',
          display: 'block',
          overflow: 'visible',
        }}
      >
        <DialRings
          spec={spec}
          values={values}
          geom={geom}
          trackColor="#f5efe2"
          dragging={dial.dragging}
        />
        {/* Floating zone labels at each ring's handle position */}
        {spec.bands.map((band, idx) => {
          const r = geom.radii[idx]
          const valueFrac = (values[idx] - band.min) / (band.max - band.min)
          const handleAngle = fracToAngle(valueFrac)
          // Place text just outside the ring along the same radial.
          const labelR = r + 22
          const pos = polar(cx, cy, labelR, handleAngle)
          // Decide which side based on x position
          const onLeft = pos.x < cx
          const anchor = onLeft ? 'end' : 'start'
          const offsetX = onLeft ? -6 : 6
          return (
            <g key={band.id}>
              <text
                x={pos.x + offsetX}
                y={pos.y - 4}
                textAnchor={anchor}
                fontSize={12}
                fill="#64748b"
                style={{
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {band.label}
              </text>
              <text
                x={pos.x + offsetX}
                y={pos.y + 14}
                textAnchor={anchor}
                fontSize={22}
                fontWeight={300}
                fill={band.color}
                style={{
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                  letterSpacing: '-0.02em',
                }}
              >
                {Math.round(values[idx])}
              </text>
            </g>
          )
        })}
        {/* Center stat */}
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize={76}
          fontWeight={200}
          fill="#1c1917"
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            letterSpacing: '-0.04em',
          }}
        >
          {totalMod}
        </text>
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// D · Gallery — museum-caption strip below the dial
// ═══════════════════════════════════════════════════════════════════

export function HRDialGallery({ spec, values, onChange }: VariantProps) {
  const geom: DialGeom = { size: 250, radii: [104, 82, 60], arcW: 10 }
  const dial = useDial(spec, values, onChange, geom)
  const totalMod = Math.round(values[1] + values[2])
  const cx = geom.size / 2
  const cy = geom.size / 2

  return (
    <div
      className="rounded-3xl py-12 px-10"
      style={{
        background: '#fafaf9',
        border: '1px solid #e7e5e4',
      }}
    >
      <div className="flex flex-col items-center gap-10">
        <svg
          ref={dial.svgRef}
          width={geom.size}
          height={geom.size}
          onPointerDown={dial.onPointerDown}
          onPointerMove={dial.onPointerMove}
          onPointerUp={dial.onPointerUp}
          style={{
            cursor: dial.dragging != null ? 'grabbing' : 'pointer',
            touchAction: 'none',
            display: 'block',
          }}
        >
          <DialRings
            spec={spec}
            values={values}
            geom={geom}
            trackColor="#e7e5e4"
            dragging={dial.dragging}
          />
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fontSize={62}
            fontWeight={200}
            fill="#1c1917"
            style={{
              fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              letterSpacing: '-0.04em',
            }}
          >
            {totalMod}
          </text>
        </svg>

        {/* Caption strip — gallery placard style */}
        <div className="flex items-center gap-6 w-full justify-center">
          {spec.bands.map((band, idx) => (
            <div key={band.id} className="flex items-center gap-3">
              <span
                className="rounded-full"
                style={{
                  width: 9,
                  height: 9,
                  background: band.color,
                }}
              />
              <span className="flex flex-col">
                <span
                  className="text-[12px] italic"
                  style={{
                    fontFamily: '"Crimson Pro", "Cormorant Garamond", Georgia, serif',
                    color: '#78716c',
                  }}
                >
                  {band.label}
                </span>
                <span
                  className="text-[28px] tabular-nums leading-none"
                  style={{
                    color: '#1c1917',
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                    fontWeight: 300,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {Math.round(values[idx])}
                </span>
              </span>
              {idx < spec.bands.length - 1 && (
                <span className="text-[18px] text-stone-300 ml-3">·</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
