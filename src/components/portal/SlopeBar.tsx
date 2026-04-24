/**
 * SlopeBar — inline SVG showing a linearized edge effect.
 *
 *   tilt        ↦  signed magnitude (Cohen's d). +large d → strongly
 *                  upward tilt, +small d → gentle tilt, 0 → flat,
 *                  negative → downward tilt.
 *   color       ↦  beneficial direction (emerald) vs adverse (rose),
 *                  or neutral (slate) when |d| is trivial.
 *   thickness   ↦  posterior contraction — thin = wide posterior /
 *                  cohort-only, thick = personally-tightened.
 *
 * Reads at a glance: "is this big and which way?", "how confident?".
 */

import type { EffectBand } from '@/utils/insightStandardization'

const BENEFIT_COLOR: Record<'pos' | 'neg' | 'neutral', string> = {
  pos: '#10b981', // emerald-500
  neg: '#f43f5e', // rose-500
  neutral: '#94a3b8', // slate-400
}

interface Props {
  /** Standardized effect (Cohen's d). Sign drives tilt direction. */
  d: number
  /** Whether the move is in the user-beneficial direction. */
  beneficial: boolean
  /** Posterior contraction in [0, 1]. Maps to stroke thickness. */
  contraction: number
  /** Effect-magnitude band — used to mute color for trivial effects. */
  band: EffectBand
  width?: number
  height?: number
}

export function SlopeBar({
  d,
  beneficial,
  contraction,
  band,
  width = 56,
  height = 22,
}: Props) {
  // Map |d| from [0, 1.5] → tilt amount (clamp at d=1.5 = effectively
  // "very large"). Tilt is half the height to keep things visually tidy.
  const norm = Math.max(-1, Math.min(1, d / 1.5))
  const dy = norm * (height * 0.65)
  const cy = height / 2
  const padX = 3

  // Anchor the slope around the center: (padX, cy + dy/2) → (W-padX, cy - dy/2)
  // gives an upward tilt for positive d.
  const x1 = padX
  const x2 = width - padX
  const y1 = cy + dy / 2
  const y2 = cy - dy / 2

  const stroke =
    band === 'trivial'
      ? BENEFIT_COLOR.neutral
      : beneficial
        ? BENEFIT_COLOR.pos
        : BENEFIT_COLOR.neg
  // Contraction → stroke width: 1.25 (uncertain) → 3 (very tight).
  const strokeWidth = 1.25 + Math.max(0, Math.min(1, contraction)) * 1.75

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Standardized effect ${d.toFixed(2)} sigma, ${band}, ${beneficial ? 'beneficial' : 'adverse'}`}
      className="flex-shrink-0"
    >
      {/* Faint baseline so flat slopes still read as "flat" not "missing". */}
      <line
        x1={padX}
        x2={width - padX}
        y1={cy}
        y2={cy}
        stroke="#e2e8f0"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      {/* The slope itself. */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Endpoint dots at start (action baseline) and end (action +1 SD). */}
      <circle cx={x1} cy={y1} r={1.5} fill={stroke} opacity={0.7} />
      <circle cx={x2} cy={y2} r={2.5} fill={stroke} />
    </svg>
  )
}

export default SlopeBar
