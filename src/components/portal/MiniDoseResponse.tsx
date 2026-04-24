/**
 * MiniDoseResponse — small inline curve preview for InsightActionRow.
 *
 * Shows the actual response curve shape (saturating, plateau, inverted-U,
 * threshold) the engine encodes — not just the linearized tilt. The
 * user's current operating point is marked with a dot, and a short
 * tangent line through it shows the local slope (= the marginal
 * causal effect they'd actually experience from a small change).
 *
 * Purpose: at a glance the user can tell whether they're on the steep
 * part of the curve, near a plateau, on the wrong side of a peak,
 * etc. — and whether moving up or down has more leverage from where
 * they are. Replaces the abstract slope-bar from the previous v1.
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import type { SyntheticShape } from '@/data/scm/syntheticEdges'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'
import {
  isBeneficial,
  slopeAtBaseline,
  type EffectBand,
} from '@/utils/insightStandardization'

const SHAPE_CACHE = new Map<string, SyntheticShape | null>()
function lookupShape(action: string, outcome: string): SyntheticShape | null {
  const key = `${action}::${outcome}`
  if (SHAPE_CACHE.has(key)) return SHAPE_CACHE.get(key) ?? null
  const spec = PHASE_1_EDGES.find(
    (e) => e.action === action && e.outcome === outcome,
  )
  const shape = spec?.shape ?? null
  SHAPE_CACHE.set(key, shape)
  return shape
}

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
  band: EffectBand
  width?: number
  height?: number
}

export function MiniDoseResponse({
  edge,
  participant,
  band,
  width = 90,
  height = 28,
}: Props) {
  const padX = 3
  const padY = 3

  const data = useMemo(() => {
    const explicit = ACTION_DOMAIN[edge.action]
    const x0 = participant.current_values?.[edge.action]
    let xMin: number
    let xMax: number
    if (explicit) {
      xMin = explicit.min
      xMax = explicit.max
    } else if (x0 != null) {
      const sd = Math.max(
        participant.behavioral_sds?.[edge.action] ?? 1,
        Math.abs(x0) * 0.2,
      )
      xMin = x0 - 3 * sd
      xMax = x0 + 3 * sd
    } else {
      xMin = 0
      xMax = 1
    }

    const shape = lookupShape(edge.action, edge.outcome)
    const linearSlope = (() => {
      if (!edge.nominal_step || Math.abs(edge.nominal_step) < 1e-12) return 0
      return edge.posterior.mean / edge.nominal_step
    })()

    const f = (x: number): number => {
      if (shape) {
        const baseline = x0 ?? (xMin + xMax) / 2
        return evaluateShape(shape, x) - evaluateShape(shape, baseline)
      }
      const anchor = x0 ?? (xMin + xMax) / 2
      return linearSlope * (x - anchor)
    }

    const N = 40
    const xs = Array.from(
      { length: N + 1 },
      (_, i) => xMin + (i / N) * (xMax - xMin),
    )
    const ys = xs.map(f)

    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 0)
    const ySpan = Math.max(Math.abs(maxY - minY), 1e-9)
    const yPad = ySpan * 0.18
    const yLo = minY - yPad
    const yHi = maxY + yPad

    const toX = (x: number): number =>
      padX + ((x - xMin) / (xMax - xMin)) * (width - 2 * padX)
    const toY = (y: number): number =>
      height - padY - ((y - yLo) / (yHi - yLo)) * (height - 2 * padY)

    const path = xs
      .map((x, i) => `${i === 0 ? 'M' : 'L'} ${toX(x).toFixed(1)} ${toY(ys[i]).toFixed(1)}`)
      .join(' ')

    // Local tangent at x0 — short line segment through the current point
    // showing the marginal slope. Length scales to ~22% of the chart
    // width regardless of the absolute slope value (visual cue, not metric).
    let tangentPath: string | null = null
    let dotX: number | null = null
    let dotY: number | null = null
    if (x0 != null) {
      const dx = (xMax - xMin) * 0.11
      const slopeLocal = (f(x0 + dx) - f(x0 - dx)) / (2 * dx)
      const tx0 = toX(x0 - dx)
      const ty0 = toY(f(x0) - slopeLocal * dx)
      const tx1 = toX(x0 + dx)
      const ty1 = toY(f(x0) + slopeLocal * dx)
      tangentPath = `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} L ${tx1.toFixed(1)} ${ty1.toFixed(1)}`
      dotX = toX(x0)
      dotY = toY(f(x0))
    }

    return { path, tangentPath, dotX, dotY }
  }, [edge, participant, width, height])

  const beneficial = isBeneficial(edge)
  const stroke =
    band === 'trivial'
      ? '#94a3b8' // slate-400
      : beneficial
        ? '#10b981' // emerald-500
        : '#f43f5e' // rose-500
  const tint = beneficial ? 'rgba(16,185,129,0.10)' : 'rgba(244,63,94,0.10)'

  return (
    <svg
      width={width}
      height={height}
      className={cn('flex-shrink-0 overflow-visible')}
      role="img"
      aria-label={`Response curve for ${edge.action} → ${edge.outcome}`}
    >
      {/* Faint baseline — y=0 reference */}
      <line
        x1={padX}
        x2={width - padX}
        y1={height / 2}
        y2={height / 2}
        stroke="#e2e8f0"
        strokeWidth={0.8}
        strokeDasharray="2 2"
      />
      {/* Soft fill under the curve, tinted by direction */}
      <path
        d={`${data.path} L ${(width - padX).toFixed(1)} ${height / 2} L ${padX.toFixed(1)} ${height / 2} Z`}
        fill={tint}
      />
      {/* The actual response curve */}
      <path
        d={data.path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Tangent line through the user's current point — bold and indigo
          so it pops out as "this is the slope you experience right now" */}
      {data.tangentPath && (
        <path
          d={data.tangentPath}
          fill="none"
          stroke="#4f46e5"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.9}
        />
      )}
      {/* User's current operating point */}
      {data.dotX !== null && data.dotY !== null && (
        <circle
          cx={data.dotX}
          cy={data.dotY}
          r={2.75}
          fill="#4f46e5"
          stroke="white"
          strokeWidth={1}
        />
      )}
    </svg>
  )
}

export default MiniDoseResponse
