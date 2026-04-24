/**
 * Caffeine & alcohol — decay curve.
 *
 * Single-variable widget: only the cutoff time (hours prior to bed). The
 * peak position represents *when* you stopped consuming; height is fixed
 * because amount is intentionally not modeled here. The curve is
 * rendered as a soft pastel haze — it asserts a shape, not quantities.
 *
 * Flat Serif styling: white background, pastel accents (lavender for
 * alcohol, pink for caffeine), Inter numerals, no glows.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Coffee, Wine } from 'lucide-react'
import { formatAxisValue, quantize, type ConsumableSpec } from './types'

interface ConsumableLeverProps {
  spec: ConsumableSpec
  amount: number
  cutoff: number
  onChange: (amount: number, cutoff: number) => void
}

const DC_W = 360
const DC_H = 170
const DC_PAD = { l: 18, r: 10, t: 18, b: 30 }
const DC_CHART_W = DC_W - DC_PAD.l - DC_PAD.r
const DC_CHART_H = DC_H - DC_PAD.t - DC_PAD.b

const BED_FRAC = 0.9

export function DecayCurveLever({ spec, amount, cutoff, onChange }: ConsumableLeverProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const maxCutoff = spec.cutoff.max

  function cutoffToPx(c: number): number {
    const frac = BED_FRAC * (1 - c / maxCutoff)
    return DC_PAD.l + frac * DC_CHART_W
  }
  function pxToCutoff(px: number): number {
    const frac = (px - DC_PAD.l) / DC_CHART_W
    return maxCutoff * (1 - frac / BED_FRAC)
  }

  const peakX = cutoffToPx(cutoff)
  const bedX = cutoffToPx(0)
  const baseY = DC_PAD.t + DC_CHART_H
  // Peak height scales with amount, with a small floor so the curve is
  // always visible at low amounts.
  const MAX_PEAK_HEIGHT = DC_CHART_H * 0.85
  const amountFrac = Math.max(0, Math.min(1, amount / spec.amount.max))
  const peakHeight = MAX_PEAK_HEIGHT * Math.max(0.06, amountFrac)

  const curveD = useMemo(() => {
    const samples = 80
    const startPx = peakX
    const endPx = DC_PAD.l + DC_CHART_W
    const pxPerHour = (BED_FRAC * DC_CHART_W) / maxCutoff
    const points: Array<[number, number]> = []
    for (let i = 0; i <= samples; i++) {
      const f = i / samples
      const x = startPx + f * (endPx - startPx)
      const elapsedHours = (x - peakX) / pxPerHour
      const level = Math.pow(0.5, elapsedHours / spec.halfLifeHours)
      points.push([x, baseY - level * peakHeight])
    }
    const [px0, py0] = points[0]
    return (
      `M ${px0.toFixed(1)} ${baseY.toFixed(1)} ` +
      `L ${px0.toFixed(1)} ${py0.toFixed(1)} ` +
      points
        .slice(1)
        .map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ') +
      ` L ${endPx.toFixed(1)} ${baseY.toFixed(1)} Z`
    )
  }, [peakX, maxCutoff, spec.halfLifeHours, baseY, peakHeight])

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const px = Math.max(
        DC_PAD.l,
        Math.min(DC_PAD.l + DC_CHART_W * BED_FRAC, e.clientX - rect.left),
      )
      const py = Math.max(DC_PAD.t, Math.min(baseY, e.clientY - rect.top))
      const newCutoff = pxToCutoff(px)
      const newAmountFrac = Math.max(0, Math.min(1, (baseY - py) / MAX_PEAK_HEIGHT))
      const newAmount = newAmountFrac * spec.amount.max
      onChange(quantize(newAmount, spec.amount), quantize(newCutoff, spec.cutoff))
    },
    [spec, onChange, baseY],
  )

  const Glyph = spec.glyph === 'wine' ? Wine : Coffee
  const filterId = `decay-haze-${spec.id}`
  const gradId = `decay-grad-${spec.id}`

  const tickHours = spec.id === 'caffeine' ? [12, 8, 4, 0] : [8, 4, 0]

  return (
    <div className="select-none" style={{ width: DC_W }}>
      <Header spec={spec} amount={amount} cutoff={cutoff} />
      <svg
        ref={svgRef}
        width={DC_W}
        height={DC_H}
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
        style={{
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'crosshair',
          display: 'block',
        }}
      >
        <defs>
          <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={spec.accent} stopOpacity="0.42" />
            <stop offset="100%" stopColor={spec.accent} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Hazy curve fill */}
        <path
          d={curveD}
          fill={`${spec.accent}33`}
          filter={`url(#${filterId})`}
          style={{
            transition: dragging ? 'none' : 'd 260ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />
        <path
          d={curveD}
          fill={`url(#${gradId})`}
          style={{
            transition: dragging ? 'none' : 'd 260ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />

        {/* Bedtime dotted line */}
        <line
          x1={bedX}
          x2={bedX}
          y1={DC_PAD.t}
          y2={baseY}
          stroke="#a8a29e"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <text
          x={bedX + 5}
          y={DC_PAD.t + 11}
          fontSize={11}
          fill="#78716c"
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          bed
        </text>

        {/* Peak vertical pin */}
        <line
          x1={peakX}
          x2={peakX}
          y1={DC_PAD.t}
          y2={baseY}
          stroke={spec.accent}
          strokeWidth={1}
          opacity={0.5}
          style={{
            transition: dragging
              ? 'none'
              : 'x1 260ms cubic-bezier(0.4,0,0.2,1), x2 260ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />

        {/* Drag handle */}
        <g
          style={{
            transition: dragging ? 'none' : 'transform 260ms cubic-bezier(0.4,0,0.2,1)',
            transform: `translate(${peakX}px, ${baseY - peakHeight}px)`,
          }}
        >
          <circle r={7} fill="#fff" stroke={spec.accent} strokeWidth={2} />
          <foreignObject x={-8} y={-28} width={16} height={16}>
            <div style={{ color: spec.highlight }}>
              <Glyph className="w-4 h-4" strokeWidth={1.75} />
            </div>
          </foreignObject>
        </g>

        {/* X axis ticks */}
        {tickHours.map((h) => {
          const x = cutoffToPx(h)
          return (
            <g key={h}>
              <line
                x1={x}
                x2={x}
                y1={baseY}
                y2={baseY + 3}
                stroke="#d6d3d1"
                strokeWidth={0.75}
              />
              <text
                x={x}
                y={baseY + 15}
                textAnchor="middle"
                fontSize={11}
                fill="#a8a29e"
                style={{
                  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
                }}
              >
                {h === 0 ? '0h' : `${h}h`}
              </text>
            </g>
          )
        })}
        <text
          x={DC_PAD.l + (DC_CHART_W * BED_FRAC) / 2}
          y={DC_H - 6}
          textAnchor="middle"
          fontSize={11}
          fill="#a8a29e"
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          hours before bed
        </text>
      </svg>
    </div>
  )
}

function Header({
  spec,
  amount,
  cutoff,
}: {
  spec: ConsumableSpec
  amount: number
  cutoff: number
}) {
  const a = Math.round(amount)
  const amountLabel = a === 1 ? `1 ${spec.unitNoun}` : `${a} ${spec.unitNoun}s`
  // Category label (e.g., "Caffeine") is rendered by the parent view as a
  // standardized header above the widget — we keep only the readout here.
  return (
    <div className="flex items-baseline justify-end mb-3" style={{ width: DC_W }}>
      <span
        className="text-[13px] text-stone-500"
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {amountLabel}, {formatAxisValue(spec.cutoff, cutoff)}
      </span>
    </div>
  )
}
