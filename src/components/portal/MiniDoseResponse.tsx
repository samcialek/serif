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
import {
  isBeneficial,
  type EffectBand,
} from '@/utils/insightStandardization'
import { ACTION_DOMAIN, evaluateShape, inferShape } from '@/utils/insightShape'
import { isContextSuppressed } from '@/utils/edgeSuppression'

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
    const rawX0 = participant.current_values?.[edge.action]
    let xMin: number
    let xMax: number
    if (explicit) {
      xMin = explicit.min
      xMax = explicit.max
    } else if (rawX0 != null) {
      const sd = Math.max(
        participant.behavioral_sds?.[edge.action] ?? 1,
        Math.abs(rawX0) * 0.2,
      )
      xMin = rawX0 - 3 * sd
      xMax = rawX0 + 3 * sd
    } else {
      xMin = 0
      xMax = 1
    }
    // Always have an x0 so the tangent + dot always render. Fall back
    // to the domain midpoint when participant.current_values doesn't
    // carry this action (common for derived/load actions).
    const x0 = rawX0 ?? (xMin + xMax) / 2

    // Every edge has a plausible nonlinear shape via inferShape, so
    // the curve always has visible structure (no linear fallback).
    const shape = inferShape(edge)
    const fAbs = (x: number): number => evaluateShape(shape, x)
    const f = (x: number): number => fAbs(x) - fAbs(x0)

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

    // Local tangent — always drawn now that x0 is never null.
    const dx = (xMax - xMin) * 0.11
    const slopeLocal = (f(x0 + dx) - f(x0 - dx)) / (2 * dx)
    const tx0 = toX(x0 - dx)
    const ty0 = toY(f(x0) - slopeLocal * dx)
    const tx1 = toX(x0 + dx)
    const ty1 = toY(f(x0) + slopeLocal * dx)
    const tangentPath = `M ${tx0.toFixed(1)} ${ty0.toFixed(1)} L ${tx1.toFixed(1)} ${ty1.toFixed(1)}`
    const dotX = toX(x0)
    const dotY = toY(f(x0))

    return { path, tangentPath, dotX, dotY, estimated: rawX0 == null }
  }, [edge, participant, width, height])

  const beneficial = isBeneficial(edge)
  const suppressed = isContextSuppressed(edge)
  const stroke =
    suppressed || band === 'trivial'
      ? '#94a3b8' // slate-400
      : beneficial
        ? '#10b981' // emerald-500
        : '#f43f5e' // rose-500
  const tint =
    suppressed || band === 'trivial'
      ? 'rgba(148,163,184,0.08)'
      : beneficial
        ? 'rgba(16,185,129,0.10)'
        : 'rgba(244,63,94,0.10)'

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
          so it pops out as "this is the slope you experience right now".
          When `data.estimated` is true (no current_values entry for this
          action), render with a dashed pattern to signal the baseline
          is a domain-midpoint estimate, not the user's observed value. */}
      <path
        d={data.tangentPath}
        fill="none"
        stroke="#4f46e5"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={data.estimated ? '3 2' : undefined}
        opacity={0.9}
      />
      <circle
        cx={data.dotX}
        cy={data.dotY}
        r={2.75}
        fill={data.estimated ? 'white' : '#4f46e5'}
        stroke="#4f46e5"
        strokeWidth={1.5}
      />
    </svg>
  )
}

export default MiniDoseResponse
