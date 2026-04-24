/**
 * DoseResponseChart — small SVG plot of an edge's actual response
 * curve, with the user's current operating point marked.
 *
 * Replaces the prior abstract "tilt = magnitude" slope-bar with the
 * real shape the engine encodes (saturating, smooth-saturating,
 * inverted-U, linear). User can see at a glance:
 *   - where they are on the curve
 *   - whether moving up/down is steep or flat
 *   - whether the curve plateaus / inverts beyond their range
 *
 * Curve shape comes from PHASE_1_EDGES synthetic edge specs when
 * available; otherwise falls back to a linear approximation derived
 * from the posterior mean.
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import type { SyntheticShape } from '@/data/scm/syntheticEdges'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'
import { isBeneficial, slopePerNativeUnit } from '@/utils/insightStandardization'

const SHAPE_CACHE = new Map<string, SyntheticShape | null>()

function shapeKey(action: string, outcome: string): string {
  return `${action}::${outcome}`
}

/** Lookup the SyntheticShape for an (action, outcome) pair from
 * PHASE_1_EDGES. Returns null when no shape is registered (caller
 * should fall back to a linear projection of the posterior mean). */
function lookupShape(action: string, outcome: string): SyntheticShape | null {
  const key = shapeKey(action, outcome)
  if (SHAPE_CACHE.has(key)) return SHAPE_CACHE.get(key) ?? null
  const spec = PHASE_1_EDGES.find(
    (e) => e.action === action && e.outcome === outcome,
  )
  const shape = spec?.shape ?? null
  SHAPE_CACHE.set(key, shape)
  return shape
}

/** Evaluate a SyntheticShape at a given dose; returns the predicted
 * outcome change (relative to dose=0). */
function evaluateShape(shape: SyntheticShape, dose: number): number {
  switch (shape.kind) {
    case 'linear':
      return shape.slope * dose
    case 'saturating': {
      if (dose <= shape.knee) return shape.slope * dose
      const after = shape.slopeAfter ?? 0
      return shape.slope * shape.knee + after * (dose - shape.knee)
    }
    case 'smooth_saturating':
      if (dose <= 0) return 0
      return shape.asymptote * (1 - Math.pow(2, -dose / shape.halfDose))
    case 'inverted_u': {
      if (dose <= shape.peak) return shape.slopeUp * dose
      return shape.slopeUp * shape.peak + shape.slopeDown * (dose - shape.peak)
    }
  }
}

/** Plot domain (x-axis range) per action — natural sensible bounds.
 * Falls back to ±3·SD around the user's current value. */
const ACTION_DOMAIN: Record<string, { min: number; max: number }> = {
  bedtime: { min: 21.5, max: 24.5 },
  sleep_duration: { min: 4, max: 10 },
  caffeine_mg: { min: 0, max: 600 },
  caffeine_cutoff: { min: 0, max: 14 },
  alcohol_units: { min: 0, max: 6 },
  zone2_minutes: { min: 0, max: 300 },
  zone2_volume: { min: 0, max: 50 },
  zone4_5_minutes: { min: 0, max: 90 },
  training_volume: { min: 0, max: 3 },
  training_load: { min: 0, max: 200 },
  running_volume: { min: 0, max: 30 },
  steps: { min: 0, max: 25000 },
  active_energy: { min: 0, max: 3000 },
  dietary_protein: { min: 30, max: 250 },
  dietary_energy: { min: 1500, max: 4000 },
  acwr: { min: 0.5, max: 2 },
  sleep_debt: { min: 0, max: 20 },
}

interface Props {
  edge: InsightBayesian
  participant: ParticipantPortal
  width?: number
  height?: number
}

export function DoseResponseChart({
  edge,
  participant,
  width = 320,
  height = 120,
}: Props) {
  const padX = 28
  const padY = 14

  const data = useMemo(() => {
    // Pick the action's plot domain.
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

    // Resolve the curve. If we don't have an explicit shape, project a
    // linear curve from the posterior mean / nominal_step.
    const shape = lookupShape(edge.action, edge.outcome)
    const linearSlope = slopePerNativeUnit(edge)
    const f = (x: number): number => {
      if (shape) {
        const baseline = currentVal ?? (xMin + xMax) / 2
        return evaluateShape(shape, x) - evaluateShape(shape, baseline)
      }
      // Linear fallback — relative to the user's current value, so the
      // curve passes through (currentVal, 0).
      const anchor = currentVal ?? (xMin + xMax) / 2
      return linearSlope * (x - anchor)
    }

    // Sample the curve at 64 points.
    const N = 64
    const xs = Array.from({ length: N + 1 }, (_, i) => xMin + (i / N) * (xMax - xMin))
    const ys = xs.map(f)

    // Y-axis range — pad slightly so curve isn't flush against edges.
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 0)
    const ySpan = Math.max(Math.abs(maxY - minY), 1e-9)
    const yPad = ySpan * 0.15
    const yLo = minY - yPad
    const yHi = maxY + yPad

    const toX = (x: number): number =>
      padX + ((x - xMin) / (xMax - xMin)) * (width - 2 * padX)
    const toY = (y: number): number =>
      height - padY - ((y - yLo) / (yHi - yLo)) * (height - 2 * padY)

    const path = xs
      .map((x, i) => `${i === 0 ? 'M' : 'L'} ${toX(x).toFixed(1)} ${toY(ys[i]).toFixed(1)}`)
      .join(' ')

    // Zero line (Δ=0, where the user currently sits relative to baseline).
    const zeroY = toY(0)
    const currentX = currentVal != null ? toX(currentVal) : null
    const currentY = currentVal != null ? toY(f(currentVal)) : null

    // Tangent line at the user's current point — same construction as
    // MiniDoseResponse so the in-row preview and the expanded chart
    // tell the same visual story. Local slope by central difference;
    // segment extended ~12% of the x-range either side of the point.
    let tangentPath: string | null = null
    let tangentSlope: number | null = null
    if (currentVal != null) {
      const dx = (xMax - xMin) * 0.12
      const localSlope = (f(currentVal + dx) - f(currentVal - dx)) / (2 * dx)
      tangentSlope = localSlope
      const tx0 = toX(currentVal - dx)
      const ty0 = toY(f(currentVal) - localSlope * dx)
      const tx1 = toX(currentVal + dx)
      const ty1 = toY(f(currentVal) + localSlope * dx)
      tangentPath = `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} L ${tx1.toFixed(1)} ${ty1.toFixed(1)}`
    }

    return {
      xMin, xMax, yLo, yHi, path, zeroY, currentX, currentY, shape,
      tangentPath, tangentSlope, currentVal,
    }
  }, [edge, participant, width, height, padX, padY])

  const stroke = isBeneficial(edge) ? '#10b981' : '#f43f5e'
  const fillSoft = isBeneficial(edge) ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)'

  // Axis tick labels.
  const xTickFmt = formatX(edge.action)
  const yTickFmt = formatY(edge.outcome)

  return (
    <div className="w-full">
      <svg width={width} height={height} className="overflow-visible">
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

        {/* Filled area under the curve from the zero line — soft tone */}
        <path
          d={`${data.path} L ${(width - padX).toFixed(1)} ${data.zeroY.toFixed(1)} L ${padX.toFixed(1)} ${data.zeroY.toFixed(1)} Z`}
          fill={fillSoft}
        />

        {/* Curve itself */}
        <path
          d={data.path}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* User's current point + tangent */}
        {data.currentX !== null && data.currentY !== null && (
          <g>
            <line
              x1={data.currentX}
              x2={data.currentX}
              y1={padY}
              y2={height - padY}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.4}
            />
            {/* Tangent line — same indigo as the row preview, bolder */}
            {data.tangentPath && (
              <path
                d={data.tangentPath}
                fill="none"
                stroke="#4f46e5"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.95}
              />
            )}
            <circle
              cx={data.currentX}
              cy={data.currentY}
              r={4}
              fill="#4f46e5"
              stroke="white"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* X-axis labels */}
        <text
          x={padX}
          y={height - 2}
          textAnchor="start"
          fontSize={9}
          className="fill-slate-400 tabular-nums"
        >
          {xTickFmt(data.xMin)}
        </text>
        <text
          x={width - padX}
          y={height - 2}
          textAnchor="end"
          fontSize={9}
          className="fill-slate-400 tabular-nums"
        >
          {xTickFmt(data.xMax)}
        </text>

        {/* Y-axis Δ labels */}
        <text
          x={padX - 4}
          y={padY + 4}
          textAnchor="end"
          fontSize={9}
          className="fill-slate-400 tabular-nums"
        >
          {data.yHi >= 0 ? '+' : ''}
          {yTickFmt(data.yHi)}
        </text>
        <text
          x={padX - 4}
          y={height - padY}
          textAnchor="end"
          fontSize={9}
          className="fill-slate-400 tabular-nums"
        >
          {data.yLo >= 0 ? '+' : ''}
          {yTickFmt(data.yLo)}
        </text>
      </svg>
      <div className="px-1 mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-2">
          <span>
            {LABEL_X(edge.action)} →
            <span className="ml-1 text-slate-400">{shapeName(data.shape)}</span>
          </span>
        </span>
        <span>Δ {LABEL_Y(edge.outcome)}</span>
      </div>
      <div className="px-1 mt-1 flex items-center gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" aria-hidden />
          You, now
          {data.currentVal != null && (
            <span className="ml-1 tabular-nums text-slate-400">
              ({formatX(edge.action)(data.currentVal)})
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width={14} height={4} aria-hidden>
            <line x1={0} x2={14} y1={2} y2={2} stroke="#4f46e5" strokeWidth={2} strokeLinecap="round" />
          </svg>
          Local slope (your marginal effect)
        </span>
      </div>
    </div>
  )
}

const LABEL_X = (a: string): string => a.replace(/_/g, ' ')
const LABEL_Y = (o: string): string => o.replace(/_/g, ' ')

function shapeName(shape: SyntheticShape | null): string {
  if (!shape) return 'linear approximation'
  switch (shape.kind) {
    case 'linear': return 'linear'
    case 'saturating': return 'piecewise saturating'
    case 'smooth_saturating': return 'smooth saturating (Hill)'
    case 'inverted_u': return 'inverted-U'
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

function formatY(_outcome: string): (n: number) => string {
  return (n) => formatNumber(n)
}

function formatNumber(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 100) return n.toFixed(0)
  if (abs >= 10) return n.toFixed(1)
  if (abs >= 1) return n.toFixed(2)
  return n.toFixed(3)
}

// silence unused-import lint when cn is unused
void cn

export default DoseResponseChart
