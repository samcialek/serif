/**
 * DoseResponseChart — expanded per-edge chart showing the engine's
 * full response curve with the user's current operating point and
 * the local tangent that the row preview is drawing.
 *
 * Rendering layers (back → front):
 *   1. Dashed zero-line at Δ=0 for reference.
 *   2. Soft-tinted area under the curve (emerald for beneficial
 *      direction, rose for adverse) so the eye reads direction.
 *   3. Response curve — thick, colored, with slight transparency so
 *      the tangent can sit over top without disappearing.
 *   4. Dashed vertical guide through the user's x-position.
 *   5. Tangent line — bright indigo, bold, with arrow caps so it
 *      reads as a distinct segment resting on the curve.
 *   6. "You, now" dot on the curve.
 *   7. Axis tick labels + bottom legend.
 *
 * Curve shape comes from inferShape: every edge has a plausible
 * nonlinear shape (saturating, inverted-U, smooth-saturating,
 * explicit shape from PHASE_1_EDGES). No more linear fallback that
 * coincides with the tangent.
 */

import { useMemo } from 'react'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import { isBeneficial } from '@/utils/insightStandardization'
import { ACTION_DOMAIN, evaluateShape, inferShape } from '@/utils/insightShape'

interface Props {
  edge: InsightBayesian
  participant: ParticipantPortal
  width?: number
  height?: number
}

export function DoseResponseChart({
  edge,
  participant,
  width = 520,
  height = 180,
}: Props) {
  const padX = 36
  const padY = 18

  const data = useMemo(() => {
    const explicit = ACTION_DOMAIN[edge.action]
    const currentVal = participant.current_values?.[edge.action]
    let xMin: number
    let xMax: number
    if (explicit) {
      xMin = explicit.min
      xMax = explicit.max
    } else if (currentVal != null) {
      const sd = Math.max(
        participant.behavioral_sds?.[edge.action] ?? 1,
        Math.abs(currentVal) * 0.2,
      )
      xMin = currentVal - 3 * sd
      xMax = currentVal + 3 * sd
    } else {
      xMin = 0
      xMax = 1
    }

    // Universal nonlinear shape per edge via inferShape.
    const shape = inferShape(edge)
    const anchor = currentVal ?? (xMin + xMax) / 2
    const fAbs = (x: number): number => evaluateShape(shape, x)
    const f = (x: number): number => fAbs(x) - fAbs(anchor)

    // Sample the curve densely.
    const N = 96
    const xs = Array.from(
      { length: N + 1 },
      (_, i) => xMin + (i / N) * (xMax - xMin),
    )
    const ys = xs.map(f)

    // Y-axis range — pad slightly so curve isn't flush against edges.
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 0)
    const ySpan = Math.max(Math.abs(maxY - minY), 1e-9)
    const yPad = ySpan * 0.22
    const yLo = minY - yPad
    const yHi = maxY + yPad

    const toX = (x: number): number =>
      padX + ((x - xMin) / (xMax - xMin)) * (width - 2 * padX)
    const toY = (y: number): number =>
      height - padY - ((y - yLo) / (yHi - yLo)) * (height - 2 * padY)

    const path = xs
      .map((x, i) => `${i === 0 ? 'M' : 'L'} ${toX(x).toFixed(1)} ${toY(ys[i]).toFixed(1)}`)
      .join(' ')

    const zeroY = toY(0)
    const currentX = currentVal != null ? toX(currentVal) : null
    const currentY = currentVal != null ? toY(f(currentVal)) : null

    // Tangent line at the user's current point — extended so it
    // clearly leaves the curve's neighborhood on both sides.
    let tangentPath: string | null = null
    let tangentSlope: number | null = null
    let tangentX0: number | null = null
    let tangentY0: number | null = null
    let tangentX1: number | null = null
    let tangentY1: number | null = null
    if (currentVal != null) {
      const dx = (xMax - xMin) * 0.18 // wider than the 12% in the row preview so the tangent is visible
      const localSlope = (f(currentVal + dx * 0.1) - f(currentVal - dx * 0.1)) / (0.2 * dx)
      tangentSlope = localSlope
      tangentX0 = toX(currentVal - dx)
      tangentY0 = toY(f(currentVal) - localSlope * dx)
      tangentX1 = toX(currentVal + dx)
      tangentY1 = toY(f(currentVal) + localSlope * dx)
      tangentPath = `M ${tangentX0.toFixed(1)} ${tangentY0.toFixed(1)} L ${tangentX1.toFixed(1)} ${tangentY1.toFixed(1)}`
    }

    return {
      xMin, xMax, yLo, yHi, path, zeroY,
      currentVal, currentX, currentY,
      tangentPath, tangentSlope, tangentX0, tangentY0, tangentX1, tangentY1,
      shape,
    }
  }, [edge, participant, width, height, padX, padY])

  const beneficial = isBeneficial(edge)
  const curveStroke = beneficial ? '#10b981' : '#f43f5e'
  const curveFill = beneficial ? 'rgba(16,185,129,0.14)' : 'rgba(244,63,94,0.14)'

  // Arrow marker def — for the tangent line ends.
  return (
    <div className="w-full">
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <marker
            id="tangent-arrow"
            viewBox="0 0 10 10"
            refX={5}
            refY={5}
            markerWidth={5}
            markerHeight={5}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#4f46e5" />
          </marker>
        </defs>

        {/* y=0 reference line */}
        <line
          x1={padX}
          x2={width - padX}
          y1={data.zeroY}
          y2={data.zeroY}
          stroke="#cbd5e1"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Soft area under the curve — direction cue */}
        <path
          d={`${data.path} L ${(width - padX).toFixed(1)} ${data.zeroY.toFixed(1)} L ${padX.toFixed(1)} ${data.zeroY.toFixed(1)} Z`}
          fill={curveFill}
        />

        {/* The response curve (thick, semi-opaque so tangent can sit on top). */}
        <path
          d={data.path}
          fill="none"
          stroke={curveStroke}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />

        {/* Vertical guide through the user's x-position */}
        {data.currentX !== null && (
          <line
            x1={data.currentX}
            x2={data.currentX}
            y1={padY}
            y2={height - padY}
            stroke="#4f46e5"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.35}
          />
        )}

        {/* Tangent line — bright indigo, with arrow caps so it clearly
            reads as a separate surface from the green/rose curve */}
        {data.tangentPath && (
          <path
            d={data.tangentPath}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={2.75}
            strokeLinecap="round"
            markerStart="url(#tangent-arrow)"
            markerEnd="url(#tangent-arrow)"
            opacity={1}
          />
        )}

        {/* User's "you, now" dot sitting on the curve */}
        {data.currentX !== null && data.currentY !== null && (
          <circle
            cx={data.currentX}
            cy={data.currentY}
            r={5}
            fill="#4f46e5"
            stroke="white"
            strokeWidth={2}
          />
        )}

        {/* X-axis labels (min / current / max) */}
        <text
          x={padX}
          y={height - 3}
          textAnchor="start"
          fontSize={10}
          className="fill-slate-400 tabular-nums"
        >
          {formatX(edge.action)(data.xMin)}
        </text>
        <text
          x={width - padX}
          y={height - 3}
          textAnchor="end"
          fontSize={10}
          className="fill-slate-400 tabular-nums"
        >
          {formatX(edge.action)(data.xMax)}
        </text>
        {data.currentVal != null && data.currentX !== null && (
          <text
            x={data.currentX}
            y={height - 3}
            textAnchor="middle"
            fontSize={10}
            className="fill-indigo-600 tabular-nums font-semibold"
          >
            {formatX(edge.action)(data.currentVal)}
          </text>
        )}

        {/* Y-axis Δ range labels */}
        <text
          x={padX - 4}
          y={padY + 4}
          textAnchor="end"
          fontSize={10}
          className="fill-slate-400 tabular-nums"
        >
          {data.yHi >= 0 ? '+' : ''}
          {formatNumber(data.yHi)}
        </text>
        <text
          x={padX - 4}
          y={height - padY}
          textAnchor="end"
          fontSize={10}
          className="fill-slate-400 tabular-nums"
        >
          {data.yLo >= 0 ? '+' : ''}
          {formatNumber(data.yLo)}
        </text>
      </svg>

      {/* Axis label row */}
      <div className="px-1 mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          {edge.action.replace(/_/g, ' ')} →
          <span className="ml-1 text-slate-400">{shapeName(data.shape)}</span>
        </span>
        <span>Δ {edge.outcome.replace(/_/g, ' ')}</span>
      </div>

      {/* Legend row */}
      <div className="px-1 mt-2 flex items-center gap-4 text-[10px] text-slate-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <svg width={14} height={4} aria-hidden>
            <line
              x1={0}
              x2={14}
              y1={2}
              y2={2}
              stroke={curveStroke}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.85}
            />
          </svg>
          Response curve (engine's shape)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={16} height={5} aria-hidden>
            <line
              x1={1}
              x2={15}
              y1={2.5}
              y2={2.5}
              stroke="#4f46e5"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </svg>
          Local tangent (your marginal effect)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" aria-hidden />
          You, now
          {data.currentVal != null && (
            <span className="ml-1 tabular-nums text-slate-400">
              ({formatX(edge.action)(data.currentVal)})
            </span>
          )}
        </span>
      </div>
    </div>
  )
}

function shapeName(shape: { kind: string }): string {
  switch (shape.kind) {
    case 'linear': return 'linear'
    case 'saturating': return 'piecewise saturating'
    case 'smooth_saturating': return 'smooth saturating (Hill)'
    case 'inverted_u': return 'inverted-U (optimum)'
    default: return ''
  }
}

function formatX(action: string): (n: number) => string {
  if (action === 'bedtime' || action === 'caffeine_cutoff') {
    return (n) => `${n.toFixed(1)}h`
  }
  if (action === 'sleep_duration' || action === 'training_volume') {
    return (n) => `${n.toFixed(1)}h`
  }
  if (action === 'caffeine_mg' || action === 'training_load' || action === 'active_energy') {
    return (n) => `${Math.round(n)}`
  }
  if (action === 'steps') return (n) => `${(n / 1000).toFixed(0)}k`
  if (action === 'acwr' || action === 'alcohol_units') return (n) => n.toFixed(1)
  return (n) => formatNumber(n)
}

function formatNumber(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 10) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

export default DoseResponseChart
