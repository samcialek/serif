/**
 * PriorCurvePreview — visualises the "what we expect / what we'd learn"
 * curve for an exploration edge.
 *
 * Renders:
 *   1. The cohort-prior response curve (central line).
 *   2. A shaded ±2σ_prior band around it — the engine's uncertainty
 *      on the slope before running the experiment.
 *   3. A dashed ±2σ_post band overlay — the expected tightened
 *      uncertainty AFTER a successful experiment. σ_post is derived
 *      from `narrow`: σ_post = σ_prior × (1 − narrow).
 *
 * Legend is rendered outside the SVG by the consumer (detail panel
 * already has space for it). Two sizes:
 *   - inline (width 120, height 48)
 *   - detail (width 520, height 180)
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import { ACTION_DOMAIN, evaluateShape, inferShape } from '@/utils/insightShape'
import type { ParticipantPortal } from '@/data/portal/types'

interface Props {
  action: string
  outcome: string
  participant: ParticipantPortal
  /** Cohort-prior expected Cohen's d. Used to scale the y-axis so the
   *  prior band has visible height even when priorD ≈ 0. */
  priorD: number
  /** Prior uncertainty on the slope (SD of d, not variance). */
  priorDSD: number
  /** Fraction of σ_prior the experiment is expected to eliminate. ∈ [0,1]. */
  narrow: number
  variant?: 'inline' | 'detail'
  className?: string
}

export function PriorCurvePreview({
  action,
  outcome,
  participant,
  priorD,
  priorDSD,
  narrow,
  variant = 'inline',
  className,
}: Props) {
  const width = variant === 'detail' ? 520 : 120
  const height = variant === 'detail' ? 180 : 48
  const padX = variant === 'detail' ? 18 : 4
  const padY = variant === 'detail' ? 16 : 4

  const data = useMemo(() => {
    const explicit = ACTION_DOMAIN[action]
    const rawX0 = participant.current_values?.[action]
    let xMin: number
    let xMax: number
    if (explicit) {
      xMin = explicit.min
      xMax = explicit.max
    } else if (rawX0 != null) {
      const sd = Math.max(
        participant.behavioral_sds?.[action] ?? 1,
        Math.abs(rawX0) * 0.2,
      )
      xMin = rawX0 - 3 * sd
      xMax = rawX0 + 3 * sd
    } else {
      xMin = 0
      xMax = 1
    }
    const x0 = rawX0 ?? (xMin + xMax) / 2

    // Use a synthetic edge-like shape so prior-d sign + magnitude bend
    // the curve appropriately. We cheat: build a shape object whose
    // slope roughly encodes the prior d.
    const syntheticEdge = {
      action,
      outcome,
      posterior: { mean: priorD, sd: priorDSD, contraction: 0 },
      nominal_step: 1,
      direction_conflict: false,
      pathway: 'wearable' as const,
      gate: { tier: 'possible' as const, score: 0 },
      horizon_days: 14,
      evidence_tier: 'cohort_level' as const,
      prior_provenance: 'literature' as const,
    }
    // inferShape consumes a structural shape hint from the edge.
    // Build a minimal object that satisfies the duck-type.
    const shape = inferShape(syntheticEdge as unknown as Parameters<typeof inferShape>[0])
    const fAbs = (x: number): number => evaluateShape(shape, x)
    const f = (x: number): number => fAbs(x) - fAbs(x0)

    const N = variant === 'detail' ? 80 : 24
    const xs = Array.from({ length: N + 1 }, (_, i) => xMin + (i / N) * (xMax - xMin))
    const ys = xs.map(f)

    // Scale y by prior_d so the curve has real visible amplitude even
    // at small |priorD|. Use prior_d as a magnitude reference.
    const amp = Math.max(Math.abs(priorD) * 1, 0.05)
    const yLo = -amp - priorDSD * 2
    const yHi = amp + priorDSD * 2

    const toX = (x: number): number =>
      padX + ((x - xMin) / (xMax - xMin)) * (width - 2 * padX)
    const toY = (y: number): number =>
      height - padY - ((y - yLo) / (yHi - yLo)) * (height - 2 * padY)

    const central = xs
      .map((x, i) => `${i === 0 ? 'M' : 'L'} ${toX(x).toFixed(1)} ${toY(ys[i]).toFixed(1)}`)
      .join(' ')

    // Prior band: ±2σ around the central curve. Because priorDSD is on
    // the SLOPE in d-units, the band grows linearly with |x − x0| — at
    // the user's baseline the uncertainty vanishes (we know where we
    // are), and widens out toward the domain edges.
    const priorBandTop = xs
      .map((x, i) => {
        const wid = 2 * priorDSD * Math.abs(x - x0)
        return `${i === 0 ? 'M' : 'L'} ${toX(x).toFixed(1)} ${toY(ys[i] + wid).toFixed(1)}`
      })
      .join(' ')
    const priorBandBottom = xs
      .slice()
      .reverse()
      .map((x) => {
        const wid = 2 * priorDSD * Math.abs(x - x0)
        const i = xs.indexOf(x)
        return `L ${toX(x).toFixed(1)} ${toY(ys[i] - wid).toFixed(1)}`
      })
      .join(' ')
    const priorBand = `${priorBandTop} ${priorBandBottom} Z`

    const narrowedSD = priorDSD * (1 - narrow)
    const postBandTop = xs
      .map((x, i) => {
        const wid = 2 * narrowedSD * Math.abs(x - x0)
        return `${i === 0 ? 'M' : 'L'} ${toX(x).toFixed(1)} ${toY(ys[i] + wid).toFixed(1)}`
      })
      .join(' ')
    const postBandBottom = xs
      .slice()
      .reverse()
      .map((x) => {
        const wid = 2 * narrowedSD * Math.abs(x - x0)
        const i = xs.indexOf(x)
        return `L ${toX(x).toFixed(1)} ${toY(ys[i] - wid).toFixed(1)}`
      })
      .join(' ')
    const postBand = `${postBandTop} ${postBandBottom} Z`

    const baselineY = toY(0)
    const dotX = toX(x0)
    const dotY = toY(0)

    return { central, priorBand, postBand, baselineY, dotX, dotY }
  }, [action, participant, priorD, priorDSD, narrow, width, height, padX, padY, variant, outcome])

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      role="img"
      aria-label={`Prior curve preview for ${action} → ${outcome}`}
    >
      {/* Baseline */}
      <line
        x1={padX}
        x2={width - padX}
        y1={data.baselineY}
        y2={data.baselineY}
        stroke="#e2e8f0"
        strokeWidth={0.8}
        strokeDasharray="2 2"
      />
      {/* Prior band — wide, shaded */}
      <path d={data.priorBand} fill="rgba(148,163,184,0.28)" />
      {/* Posterior band — narrower, dashed border, softer fill */}
      <path
        d={data.postBand}
        fill="rgba(79,70,229,0.18)"
        stroke="#4f46e5"
        strokeDasharray="3 2"
        strokeWidth={0.8}
      />
      {/* Central response curve */}
      <path
        d={data.central}
        fill="none"
        stroke="#4f46e5"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* User's current point */}
      <circle
        cx={data.dotX}
        cy={data.dotY}
        r={3}
        fill="#4f46e5"
        stroke="white"
        strokeWidth={1.2}
      />
    </svg>
  )
}

/** Small legend string component the consumer can render next to the
 *  curve. Kept separate so it only renders in the detail variant. */
export function PriorCurveLegend() {
  return (
    <div className="flex items-center gap-4 text-[10px] text-slate-500 pl-1">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-3 h-2 rounded-sm bg-slate-400/40" />
        Cohort prior ±2σ
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block w-3 h-2 rounded-sm"
          style={{ background: 'rgba(79,70,229,0.3)', borderTop: '1px dashed #4f46e5', borderBottom: '1px dashed #4f46e5' }}
        />
        If experiment succeeds
      </span>
    </div>
  )
}

export default PriorCurvePreview
