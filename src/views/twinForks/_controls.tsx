/**
 * Affordance-matched control library for the three v1/v2/v3 forks.
 *
 * Each control is a tactile, input-mode-specific variant on "pick a number in
 * a range" — chosen so the control *looks like* the thing it controls. The
 * principle: bedtime is a clock, so its control is a clock; dietary protein
 * is discrete servings, so its control snaps to stations; training volume is
 * a channel being driven, so its control is a fader.
 *
 * Every control shares the same prop surface (value/min/max/step/onChange)
 * plus optional anchors for magnetic snap and an accent color. `AutoControl`
 * dispatches to the right variant based on node.id.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/classNames'
import {
  type ManipulableNode,
  formatNodeValue,
  formatClock,
  rangeFor,
} from './_shared'

// ─── Magnetic snap ─────────────────────────────────────────────────

function snapToAnchor(raw: number, anchors: number[], step: number): number {
  if (anchors.length === 0) return raw
  const radius = step * 3
  let best = raw
  let bestDist = Infinity
  for (const a of anchors) {
    const d = Math.abs(a - raw)
    if (d < radius && d < bestDist) {
      best = a
      bestDist = d
    }
  }
  if (best !== raw) return raw + (best - raw) * 0.5
  return raw
}

function quantize(raw: number, step: number, min: number, max: number): number {
  const quantized = Math.round(raw / step) * step
  return Math.max(min, Math.min(max, quantized))
}

// ─── Shared props ──────────────────────────────────────────────────

export interface BaseControlProps {
  value: number
  min: number
  max: number
  step: number
  label: string
  onChange: (v: number) => void
  anchors?: number[]
  accent?: string
  sublabel?: string
  format?: (v: number) => string
  compact?: boolean
}

// ─── Rotary knob (270° arc — bedtime) ──────────────────────────────

export function RotaryKnob({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  anchors = [],
  accent = '#7c3aed',
  sublabel,
  compact = false,
}: BaseControlProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const size = compact ? 100 : 130

  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))
  const angleFromFrac = (f: number) => -135 + f * 270
  const angleDeg = angleFromFrac(valueFrac)
  const angleRad = (angleDeg * Math.PI) / 180

  const r = size / 2 - 12
  const cx = size / 2
  const cy = size / 2
  const thumbX = cx + r * Math.sin(angleRad)
  const thumbY = cy - r * Math.cos(angleRad)

  const arcFrom = {
    x: cx + r * Math.sin((-135 * Math.PI) / 180),
    y: cy - r * Math.cos((-135 * Math.PI) / 180),
  }
  const arcTo = {
    x: cx + r * Math.sin((135 * Math.PI) / 180),
    y: cy - r * Math.cos((135 * Math.PI) / 180),
  }
  const bgArc = `M ${arcFrom.x} ${arcFrom.y} A ${r} ${r} 0 1 1 ${arcTo.x} ${arcTo.y}`
  const filledArc = `M ${arcFrom.x} ${arcFrom.y} A ${r} ${r} 0 ${
    angleDeg - -135 > 180 ? 1 : 0
  } 1 ${thumbX} ${thumbY}`

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const localX = e.clientX - rect.left - size / 2
      const localY = e.clientY - rect.top - size / 2
      let deg = (Math.atan2(localX, -localY) * 180) / Math.PI
      deg = Math.max(-135, Math.min(135, deg))
      const frac = (deg + 135) / 270
      let raw = min + frac * range
      raw = snapToAnchor(raw, anchors, step)
      onChange(quantize(raw, step, min, max))
    },
    [anchors, max, min, onChange, range, size, step],
  )

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="touch-none select-none"
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => dragging && handlePointer(e)}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <path d={bgArc} stroke="#e2e8f0" strokeWidth={8} fill="none" strokeLinecap="round" />
        <path d={filledArc} stroke={accent} strokeWidth={8} fill="none" strokeLinecap="round" />
        {anchors.map((a) => {
          const f = Math.max(0, Math.min(1, (a - min) / range))
          const ang = (angleFromFrac(f) * Math.PI) / 180
          return (
            <line
              key={a}
              x1={cx + (r - 10) * Math.sin(ang)}
              y1={cy - (r - 10) * Math.cos(ang)}
              x2={cx + (r + 4) * Math.sin(ang)}
              y2={cy - (r + 4) * Math.cos(ang)}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          )
        })}
        <circle cx={thumbX} cy={thumbY} r={7} fill="#ffffff" stroke={accent} strokeWidth={3} />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={size / 7}
          fontWeight={600}
          fill="#334155"
          className="tabular-nums select-none pointer-events-none"
        >
          {format ? format(value) : value.toFixed(2)}
        </text>
      </svg>
      <div className="text-[11px] font-semibold text-slate-600 mt-1">{label}</div>
      {sublabel && <div className="text-[9px] text-slate-400">{sublabel}</div>}
    </div>
  )
}

// ─── Circular gauge (full pie, ≤ 1 turn — sleep duration) ──────────

export function CircularGauge({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  anchors = [],
  accent = '#0891b2',
  sublabel,
  compact = false,
}: BaseControlProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const size = compact ? 90 : 110

  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))
  // Full 360° sweep starting at 12 o'clock (−90° from SVG +x axis).
  const START_RAD = -Math.PI / 2
  const r = size / 2 - 10
  const cx = size / 2
  const cy = size / 2

  const sweep = valueFrac * Math.PI * 2
  const endX = cx + r * Math.cos(START_RAD + sweep)
  const endY = cy + r * Math.sin(START_RAD + sweep)
  const largeArc = sweep > Math.PI ? 1 : 0
  const fillPath =
    valueFrac < 0.999
      ? `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY} Z`
      : `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const localX = e.clientX - rect.left - size / 2
      const localY = e.clientY - rect.top - size / 2
      let deg = (Math.atan2(localX, -localY) * 180) / Math.PI
      // Map full circle [0..360) → fraction
      if (deg < 0) deg += 360
      const frac = deg / 360
      let raw = min + frac * range
      raw = snapToAnchor(raw, anchors, step)
      onChange(quantize(raw, step, min, max))
    },
    [anchors, max, min, onChange, range, size, step],
  )

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="touch-none select-none"
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => dragging && handlePointer(e)}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <circle cx={cx} cy={cy} r={r} fill="#f1f5f9" stroke="#e2e8f0" strokeWidth={1} />
        <path d={fillPath} fill={accent} opacity={0.85} />
        <circle cx={cx} cy={cy} r={r * 0.55} fill="#ffffff" />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={size / 6}
          fontWeight={700}
          fill="#334155"
          className="tabular-nums select-none pointer-events-none"
        >
          {format ? format(value) : value.toFixed(1)}
        </text>
      </svg>
      <div className="text-[11px] font-semibold text-slate-600 mt-1">{label}</div>
      {sublabel && <div className="text-[9px] text-slate-400">{sublabel}</div>}
    </div>
  )
}

// ─── Vertical fader (mixing-console — training volume) ────────────

export function VerticalFader({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  anchors = [],
  accent = '#059669',
  sublabel,
  compact = false,
}: BaseControlProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const height = compact ? 130 : 170

  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
      const frac = 1 - y / rect.height
      let raw = min + frac * range
      raw = snapToAnchor(raw, anchors, step)
      onChange(quantize(raw, step, min, max))
    },
    [anchors, max, min, onChange, range, step],
  )

  const notchFracs = useMemo(() => {
    const out: number[] = []
    const n = 5
    for (let i = 0; i <= n; i++) out.push(i / n)
    return out
  }, [])

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2">
        {/* Ticks */}
        <div className="flex flex-col justify-between" style={{ height }}>
          {notchFracs.slice().reverse().map((f, i) => (
            <span key={i} className="text-[8px] text-slate-400 tabular-nums leading-none">
              {(min + f * range).toFixed(range < 5 ? 1 : 0)}
            </span>
          ))}
        </div>
        <div
          ref={ref}
          className="relative touch-none select-none"
          style={{
            height,
            width: compact ? 26 : 32,
            cursor: dragging ? 'grabbing' : 'grab',
          }}
          onPointerDown={(e) => {
            setDragging(true)
            ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
            handlePointer(e)
          }}
          onPointerMove={(e) => dragging && handlePointer(e)}
          onPointerUp={(e) => {
            setDragging(false)
            ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
          }}
        >
          {/* Rail */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1.5 bg-slate-200 rounded-full" />
          {/* Notches */}
          {notchFracs.map((f) => (
            <span
              key={f}
              className="absolute left-1/2 -translate-x-1/2 w-3 h-px bg-slate-300"
              style={{ top: `${(1 - f) * 100}%` }}
            />
          ))}
          {/* Fill */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-1.5 rounded-full"
            style={{
              bottom: 0,
              height: `${valueFrac * 100}%`,
              backgroundColor: accent,
              opacity: 0.85,
            }}
          />
          {/* Thumb (mixer-cap shape) */}
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-sm border-2 shadow-sm bg-white flex items-center justify-center"
            style={{
              top: `calc(${(1 - valueFrac) * 100}% - ${compact ? 8 : 10}px)`,
              width: compact ? 24 : 30,
              height: compact ? 16 : 20,
              borderColor: accent,
            }}
          >
            <div className="w-4 h-px bg-slate-400" />
          </div>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-[12px] font-bold text-slate-800 tabular-nums">
          {format ? format(value) : value.toFixed(2)}
        </div>
        <div className="text-[11px] font-semibold text-slate-600 mt-0.5">{label}</div>
        {sublabel && <div className="text-[9px] text-slate-400">{sublabel}</div>}
      </div>
    </div>
  )
}

// ─── Horizontal fader (notched rail — running/zone2) ──────────────

export function HorizontalFader({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  anchors = [],
  accent = '#2563eb',
  sublabel,
}: BaseControlProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      const frac = x / rect.width
      let raw = min + frac * range
      raw = snapToAnchor(raw, anchors, step)
      onChange(quantize(raw, step, min, max))
    },
    [anchors, max, min, onChange, range, step],
  )

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-1.5 mb-1.5">
        <div className="text-[11px] font-semibold text-slate-700 truncate">
          {label}
          {sublabel && <span className="text-slate-400 font-normal ml-1">· {sublabel}</span>}
        </div>
        <div className="text-[12px] font-semibold tabular-nums" style={{ color: accent }}>
          {format ? format(value) : value.toFixed(2)}
        </div>
      </div>
      <div
        ref={ref}
        className="relative h-7 touch-none select-none"
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => dragging && handlePointer(e)}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
        }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        {/* Rail */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-slate-200 rounded-full" />
        {/* Notches */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span
            key={f}
            className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-slate-300"
            style={{ left: `${f * 100}%` }}
          />
        ))}
        {/* Anchor pips */}
        {anchors.map((a, i) => {
          const f = Math.max(0, Math.min(1, (a - min) / range))
          return (
            <span
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 rounded-full"
              style={{ left: `${f * 100}%`, backgroundColor: '#64748b' }}
            />
          )
        })}
        {/* Fill from left */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full"
          style={{
            left: 0,
            width: `${valueFrac * 100}%`,
            backgroundColor: accent,
            opacity: 0.6,
          }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow-sm"
          style={{
            left: `calc(${valueFrac * 100}% - 8px)`,
            width: 16,
            height: 16,
            borderColor: accent,
          }}
        />
      </div>
    </div>
  )
}

// ─── Semicircle gauge (speedometer — active energy) ───────────────

export function SemicircleGauge({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  anchors = [],
  accent = '#ea580c',
  sublabel,
  compact = false,
}: BaseControlProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const width = compact ? 130 : 160
  const height = compact ? 80 : 100

  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))
  // 180° arc from −90° (left) to +90° (right) relative to "up".
  const angleFromFrac = (f: number) => -90 + f * 180
  const angleDeg = angleFromFrac(valueFrac)
  const angleRad = (angleDeg * Math.PI) / 180

  const cx = width / 2
  const cy = height - 10
  const r = Math.min(cx, cy) - 12

  const arcFrom = { x: cx - r, y: cy }
  const arcTo = { x: cx + r, y: cy }
  const thumbX = cx + r * Math.sin(angleRad)
  const thumbY = cy - r * Math.cos(angleRad)

  const bgArc = `M ${arcFrom.x} ${arcFrom.y} A ${r} ${r} 0 0 1 ${arcTo.x} ${arcTo.y}`
  const filledArc = `M ${arcFrom.x} ${arcFrom.y} A ${r} ${r} 0 0 1 ${thumbX} ${thumbY}`

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const localX = e.clientX - rect.left - cx
      const localY = e.clientY - rect.top - cy
      let deg = (Math.atan2(localX, -localY) * 180) / Math.PI
      deg = Math.max(-90, Math.min(90, deg))
      const frac = (deg + 90) / 180
      let raw = min + frac * range
      raw = snapToAnchor(raw, anchors, step)
      onChange(quantize(raw, step, min, max))
    },
    [anchors, cx, cy, max, min, onChange, range, step],
  )

  return (
    <div className="flex flex-col items-center">
      <svg
        ref={ref}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="touch-none select-none"
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
          handlePointer(e)
        }}
        onPointerMove={(e) => dragging && handlePointer(e)}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        }}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <path d={bgArc} stroke="#e2e8f0" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={filledArc} stroke={accent} strokeWidth={10} fill="none" strokeLinecap="round" />
        {anchors.map((a) => {
          const f = Math.max(0, Math.min(1, (a - min) / range))
          const ang = (angleFromFrac(f) * Math.PI) / 180
          return (
            <line
              key={a}
              x1={cx + (r - 12) * Math.sin(ang)}
              y1={cy - (r - 12) * Math.cos(ang)}
              x2={cx + (r + 4) * Math.sin(ang)}
              y2={cy - (r + 4) * Math.cos(ang)}
              stroke="#94a3b8"
              strokeWidth={1.5}
            />
          )
        })}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={thumbX}
          y2={thumbY}
          stroke="#334155"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill="#334155" />
        <text
          x={cx}
          y={cy - 16}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill="#334155"
          className="tabular-nums select-none pointer-events-none"
        >
          {format ? format(value) : value.toFixed(0)}
        </text>
      </svg>
      <div className="text-[11px] font-semibold text-slate-600 -mt-1">{label}</div>
      {sublabel && <div className="text-[9px] text-slate-400">{sublabel}</div>}
    </div>
  )
}

// ─── Stepped stations (discrete dots — protein) ───────────────────

export function SteppedStations({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  accent = '#7c3aed',
  sublabel,
}: BaseControlProps) {
  const stations = useMemo(() => {
    const out: number[] = []
    // Cap station count to avoid clutter — coarsen the step as needed.
    let effStep = step
    let count = Math.round((max - min) / effStep) + 1
    while (count > 11) {
      effStep *= 2
      count = Math.round((max - min) / effStep) + 1
    }
    for (let v = min; v <= max + 1e-9; v += effStep) {
      out.push(Math.round(v / step) * step)
    }
    return out
  }, [min, max, step])

  const pick = (s: number) => onChange(quantize(s, step, min, max))

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[11px] font-semibold text-slate-700">
          {label}
          {sublabel && <span className="text-slate-400 font-normal ml-1">· {sublabel}</span>}
        </div>
        <div className="text-[12px] font-semibold tabular-nums" style={{ color: accent }}>
          {format ? format(value) : value.toFixed(0)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-1">
        {stations.map((s, i) => {
          const active = Math.abs(value - s) <= step * 0.51
          const dim = s > value
          return (
            <button
              key={i}
              onClick={() => pick(s)}
              className="flex flex-col items-center gap-1 group"
              type="button"
            >
              <div
                className={cn(
                  'rounded-full transition-all',
                  active ? 'w-4 h-4 ring-2 ring-offset-1' : dim ? 'w-2 h-2' : 'w-3 h-3',
                )}
                style={{
                  backgroundColor: active ? accent : dim ? '#cbd5e1' : accent,
                  opacity: dim ? 0.35 : 1,
                  ...(active ? ({ '--tw-ring-color': accent } as React.CSSProperties) : {}),
                }}
              />
              <span className="text-[8px] text-slate-400 tabular-nums">
                {Math.round(s)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stepper (± buttons — daily steps) ────────────────────────────

export function StepperControl({
  value,
  min,
  max,
  step,
  label,
  format,
  onChange,
  accent = '#0891b2',
  sublabel,
}: BaseControlProps) {
  const range = max - min
  const valueFrac = Math.max(0, Math.min(1, (value - min) / range))
  const dec = () => onChange(quantize(value - step, step, min, max))
  const inc = () => onChange(quantize(value + step, step, min, max))
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[11px] font-semibold text-slate-700">
          {label}
          {sublabel && <span className="text-slate-400 font-normal ml-1">· {sublabel}</span>}
        </div>
      </div>
      <div className="flex items-stretch gap-1.5">
        <button
          type="button"
          onClick={dec}
          className="w-7 h-8 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm font-semibold"
        >
          −
        </button>
        <div className="flex-1 relative">
          <div
            className="h-8 rounded-md border flex items-center justify-center text-sm font-bold tabular-nums"
            style={{ borderColor: accent, color: '#334155' }}
          >
            {format ? format(value) : Math.round(value).toLocaleString()}
          </div>
          <div
            className="absolute bottom-0 left-0 h-0.5 rounded-b-md"
            style={{ width: `${valueFrac * 100}%`, backgroundColor: accent }}
          />
        </div>
        <button
          type="button"
          onClick={inc}
          className="w-7 h-8 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm font-semibold"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ─── AutoControl dispatcher ────────────────────────────────────────

export type ControlVariant =
  | 'rotary'
  | 'gauge'
  | 'semigauge'
  | 'fader-v'
  | 'fader-h'
  | 'stations'
  | 'stepper'

/** Default affordance per lever — bedtime → clock, protein → servings, etc. */
export function defaultVariantFor(nodeId: string): ControlVariant {
  switch (nodeId) {
    case 'bedtime':
      return 'rotary'
    case 'sleep_duration':
      return 'gauge'
    case 'training_volume':
      return 'fader-v'
    case 'running_volume':
    case 'zone2_volume':
    case 'zone2_minutes':
    case 'zone4_5_minutes':
      return 'fader-h'
    case 'active_energy':
    case 'dietary_energy':
      return 'semigauge'
    case 'dietary_protein':
      return 'stations'
    case 'steps':
      return 'stepper'
    default:
      return 'fader-h'
  }
}

interface AutoControlProps {
  node: ManipulableNode
  current: number
  value: number
  onChange: (v: number) => void
  variant?: ControlVariant
  accent?: string
  compact?: boolean
}

export function AutoControl({
  node,
  current,
  value,
  onChange,
  variant,
  accent,
  compact = false,
}: AutoControlProps) {
  const v = variant ?? defaultVariantFor(node.id)
  const range = rangeFor(node, current)
  const format = (val: number) => formatNodeValue(val, node)
  const anchors = [current, range.min, range.max]

  const common: BaseControlProps = {
    value,
    min: range.min,
    max: range.max,
    step: node.step,
    label: node.label,
    onChange,
    anchors,
    accent,
    format,
    sublabel: formatNodeValue(current, node) + ' now',
    compact,
  }

  // Special-case bedtime format to keep the center readout a clock.
  if (node.id === 'bedtime') {
    common.format = formatClock
  }

  switch (v) {
    case 'rotary':
      return <RotaryKnob {...common} />
    case 'gauge':
      return <CircularGauge {...common} />
    case 'semigauge':
      return <SemicircleGauge {...common} />
    case 'fader-v':
      return <VerticalFader {...common} />
    case 'fader-h':
      return <HorizontalFader {...common} />
    case 'stations':
      return <SteppedStations {...common} />
    case 'stepper':
      return <StepperControl {...common} />
  }
}

// ─── Control frame — uniform background + delta chip ──────────────

interface ControlFrameProps {
  changed: boolean
  children: ReactNode
  onReset?: () => void
}

export function ControlFrame({ changed, children, onReset }: ControlFrameProps) {
  return (
    <div
      className={cn(
        'rounded-lg p-3 border transition-colors relative',
        changed ? 'bg-violet-50/40 border-violet-200' : 'bg-slate-50 border-slate-100',
      )}
    >
      {children}
      {changed && onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Revert to current"
          className="absolute top-1 right-1 text-[9px] text-violet-500 hover:text-violet-700 px-1"
        >
          reset
        </button>
      )}
    </div>
  )
}
