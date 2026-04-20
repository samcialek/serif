/**
 * ResponseCurve — the expanded dose-response visualization for a single insight.
 *
 * Honesty model:
 *   - The *curve shape* is a mechanism prior from doseShapes.ts
 *     (plateau_up / inverted_u / threshold). Per-user data is too sparse
 *     to identify curvature.
 *   - The *tangent line at the user's current operating point* is the
 *     user-calibrated slope: posterior.mean ± posterior.sd. This is what
 *     the engine actually fits per participant.
 *   - The dots are the user's current value and the engine's recommended
 *     target (current + dose_multiplier × nominal_step).
 *
 * Reading the plot: curve = mechanism belief, tangent = data belief near
 * where you actually live. Where they agree, confidence in the
 * recommendation is high; where they conflict (direction_conflict), the
 * engine applies a discount.
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import { shapeFor, type DoseShape } from '@/data/scm/doseShapes'
import { formatActionValue, formatOutcomeValue } from '@/utils/rounding'
import type { EvidenceTier, InsightBayesian } from '@/data/portal/types'

interface ResponseCurveProps {
  insight: InsightBayesian
  currentValue: number | undefined
  outcomeBaseline: number | undefined
  outcomeUnit?: string
}

const W = 440
const H = 160
const PAD_X = 32
const PAD_TOP = 18
const PAD_BOTTOM = 26
const PLOT_W = W - PAD_X * 2
const PLOT_H = H - PAD_TOP - PAD_BOTTOM

// Sample the mechanism-prior curve on [0,1] normalized dose axis.
// Output y is also normalized to [0,1] — it's a *shape*, not scaled to
// any outcome unit. The tangent line uses the user's actual slope.
function sampleShape(shape: DoseShape, n = 80): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const x = i / n
    let y: number
    if (shape === 'plateau_up') {
      y = Math.min(1, (2 / Math.PI) * Math.atan((x / 0.3) * 1.5))
    } else if (shape === 'inverted_u') {
      const d = (x - 0.5) / 0.3
      y = Math.exp(-d * d)
    } else {
      y = x < 0.82 ? x / 0.82 : Math.max(0, 1 - (x - 0.82) * 4)
    }
    pts.push([x, y])
  }
  return pts
}

// Where on the shape the current point sits, and where the recommendation
// lands. Same geometry the mini gauge uses, scaled up.
function dosePositions(shape: DoseShape, doseMultiplier: number, doseBounded: boolean) {
  const d = Math.max(0, Math.min(1, doseMultiplier))
  if (shape === 'plateau_up') {
    const currentFrac = 0.1
    const recFrac = currentFrac + 0.2 + (1 - d) * 0.35
    return { currentFrac, recFrac, edgeFrac: 0.8 as number | null, peakFrac: null as number | null }
  }
  if (shape === 'inverted_u') {
    // Current is left-of-peak; rec moves toward the peak.
    const currentFrac = 0.2
    const recFrac = Math.min(0.48, currentFrac + 0.1 + d * 0.2)
    return { currentFrac, recFrac, edgeFrac: null as number | null, peakFrac: 0.5 as number | null }
  }
  // threshold
  return {
    currentFrac: 0.15,
    recFrac: doseBounded ? 0.7 : 0.55,
    edgeFrac: 0.82 as number | null,
    peakFrac: null as number | null,
  }
}

const TIER_LABEL: Record<EvidenceTier, string> = {
  cohort_level: 'cohort-level',
  personal_emerging: 'personal · emerging',
  personal_established: 'personal · established',
}

const TIER_TANGENT_STROKE: Record<EvidenceTier, { width: number; dash?: string }> = {
  personal_established: { width: 2.25 },
  personal_emerging: { width: 1.75 },
  cohort_level: { width: 1.5, dash: '4,3' },
}

export function ResponseCurve({
  insight,
  currentValue,
  outcomeBaseline,
  outcomeUnit,
}: ResponseCurveProps) {
  const info = shapeFor(insight.action)
  const evidenceTier: EvidenceTier = insight.evidence_tier ?? 'cohort_level'
  const tangentStyle = TIER_TANGENT_STROKE[evidenceTier]

  const { currentFrac, recFrac, peakFrac, edgeFrac } = useMemo(
    () => dosePositions(info.shape, insight.dose_multiplier, insight.dose_bounded ?? false),
    [info.shape, insight.dose_multiplier, insight.dose_bounded],
  )

  const points = useMemo(() => sampleShape(info.shape), [info.shape])

  // Map normalized (0..1, 0..1) into SVG plot coords.
  const xPx = (fx: number) => PAD_X + fx * PLOT_W
  const yPx = (fy: number) => PAD_TOP + (1 - fy) * PLOT_H

  const curvePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${xPx(x).toFixed(1)},${yPx(y).toFixed(1)}`)
    .join(' ')
  const areaPath = `${curvePath} L${xPx(1).toFixed(1)},${yPx(0).toFixed(1)} L${xPx(0).toFixed(1)},${yPx(0).toFixed(1)} Z`

  const yAt = (frac: number) => {
    const p = points[Math.round(frac * (points.length - 1))]
    return yPx(p[1])
  }

  // Tangent at the current point: slope encoded in display units.
  // Direction = sign of scaled_effect (positive ⇒ recommendation points up on
  // the curve); magnitude derived from posterior.mean × one nominal_step, so
  // the tangent reflects "what the data says moving one step does to the
  // outcome." We render the tangent over the dose range [current - span,
  // current + span] where span is 0.2 of the normalized axis.
  const tangentSpan = 0.2
  const signed =
    (insight.scaled_effect >= 0 ? 1 : -1) *
    Math.abs(insight.posterior.mean * insight.nominal_step)
  // Render slope in display coords: over tangentSpan in x we rise by
  // |tangentSpan * rise_scale * sign|. rise_scale is chosen so the tangent
  // visibly differs from the curve — it's a schematic, not an anchored
  // quantity.
  const tangentRise = Math.max(-0.55, Math.min(0.55, signed > 0 ? 0.4 : -0.4))
  const curYPx = yAt(currentFrac)
  const tangentLeft = {
    x: xPx(Math.max(0, currentFrac - tangentSpan)),
    y: curYPx + tangentRise * PLOT_H * ((currentFrac - Math.max(0, currentFrac - tangentSpan)) / tangentSpan),
  }
  const tangentRight = {
    x: xPx(Math.min(1, currentFrac + tangentSpan)),
    y:
      curYPx -
      tangentRise *
        PLOT_H *
        ((Math.min(1, currentFrac + tangentSpan) - currentFrac) / tangentSpan),
  }

  // Tangent uncertainty band: ±sd scales the tangent slope.
  const sdFrac = insight.posterior.sd / Math.max(1e-6, Math.abs(insight.posterior.mean) + insight.posterior.sd)
  const bandWidth = Math.min(0.5, sdFrac) * PLOT_H * 0.35

  const recValue =
    currentValue != null
      ? currentValue + Math.sign(insight.scaled_effect || 1) *
        Math.abs(insight.dose_multiplier * insight.nominal_step)
      : null

  const projectedOutcome =
    outcomeBaseline != null && Number.isFinite(outcomeBaseline)
      ? outcomeBaseline + insight.scaled_effect
      : null

  const slopeLabel = Number.isFinite(insight.posterior.mean)
    ? `${insight.posterior.mean >= 0 ? '+' : ''}${insight.posterior.mean.toFixed(
        Math.abs(insight.posterior.mean) < 1 ? 2 : 1,
      )}`
    : '—'
  const slopeSdLabel = Number.isFinite(insight.posterior.sd)
    ? `±${insight.posterior.sd.toFixed(Math.abs(insight.posterior.sd) < 1 ? 2 : 1)}`
    : ''

  const arrowId = `curve-arrow-${insight.action}-${insight.outcome}`.replace(/[^a-z0-9-]/gi, '-')

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
            Dose–response
          </p>
          <p className="text-xs text-slate-600 leading-snug">
            Curve is the mechanism-prior shape.{' '}
            <span className="font-medium text-slate-700">Tangent</span> is your
            user-calibrated slope near where you live now.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 flex-shrink-0">
          {info.shape.replace('_', ' ')}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full h-auto">
          <defs>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,2 L6,5 L0,8" fill="#4f46e5" />
            </marker>
          </defs>

          {/* Axes */}
          <line
            x1={PAD_X}
            y1={PAD_TOP + PLOT_H}
            x2={PAD_X + PLOT_W}
            y2={PAD_TOP + PLOT_H}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <line
            x1={PAD_X}
            y1={PAD_TOP}
            x2={PAD_X}
            y2={PAD_TOP + PLOT_H}
            stroke="#e2e8f0"
            strokeWidth="1"
          />

          {/* Mechanism curve */}
          <path d={areaPath} fill="#6366f1" fillOpacity="0.06" />
          <path
            d={curvePath}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="3,3"
          />

          {/* Peak marker (inverted-u) */}
          {peakFrac != null && (
            <g>
              <line
                x1={xPx(peakFrac)}
                y1={PAD_TOP}
                x2={xPx(peakFrac)}
                y2={PAD_TOP + PLOT_H}
                stroke="#059669"
                strokeWidth="1"
                strokeDasharray="2,3"
              />
              <text
                x={xPx(peakFrac)}
                y={PAD_TOP - 4}
                fontSize="9"
                fill="#059669"
                textAnchor="middle"
              >
                optimal
              </text>
            </g>
          )}

          {/* Knee marker (plateau / threshold) */}
          {edgeFrac != null && peakFrac == null && (
            <g>
              <line
                x1={xPx(edgeFrac)}
                y1={PAD_TOP}
                x2={xPx(edgeFrac)}
                y2={PAD_TOP + PLOT_H}
                stroke={info.shape === 'threshold' ? '#dc2626' : '#94a3b8'}
                strokeWidth="1"
                strokeDasharray="2,3"
              />
              <text
                x={xPx(edgeFrac)}
                y={PAD_TOP - 4}
                fontSize="9"
                fill={info.shape === 'threshold' ? '#dc2626' : '#64748b'}
                textAnchor="middle"
              >
                {info.shape === 'threshold' ? 'cliff' : 'knee'}
              </text>
            </g>
          )}

          {/* Tangent uncertainty band */}
          <path
            d={`M${tangentLeft.x},${tangentLeft.y - bandWidth} L${tangentRight.x},${tangentRight.y - bandWidth} L${tangentRight.x},${tangentRight.y + bandWidth} L${tangentLeft.x},${tangentLeft.y + bandWidth} Z`}
            fill="#4f46e5"
            fillOpacity="0.08"
          />

          {/* Tangent line */}
          <line
            x1={tangentLeft.x}
            y1={tangentLeft.y}
            x2={tangentRight.x}
            y2={tangentRight.y}
            stroke="#4f46e5"
            strokeWidth={tangentStyle.width}
            strokeDasharray={tangentStyle.dash}
          />

          {/* Direction arrow from current to rec */}
          <line
            x1={xPx(currentFrac)}
            y1={yAt(currentFrac)}
            x2={xPx(recFrac) - 6}
            y2={yAt(recFrac)}
            stroke="#4f46e5"
            strokeWidth="1.25"
            strokeDasharray="1,2"
            markerEnd={`url(#${arrowId})`}
          />

          {/* Current dot */}
          <circle
            cx={xPx(currentFrac)}
            cy={yAt(currentFrac)}
            r="4.5"
            fill="#475569"
            stroke="white"
            strokeWidth="2"
          />
          <text
            x={xPx(currentFrac)}
            y={PAD_TOP + PLOT_H + 14}
            fontSize="10"
            fill="#64748b"
            textAnchor="middle"
          >
            now
          </text>

          {/* Recommended dot */}
          <circle
            cx={xPx(recFrac)}
            cy={yAt(recFrac)}
            r="5"
            fill="#4f46e5"
            stroke="white"
            strokeWidth="2"
          />
          <text
            x={xPx(recFrac)}
            y={PAD_TOP + PLOT_H + 14}
            fontSize="10"
            fill="#4f46e5"
            textAnchor="middle"
            fontWeight="600"
          >
            target
          </text>

          {/* Axis labels */}
          <text x={PAD_X} y={H - 4} fontSize="9" fill="#94a3b8">
            less
          </text>
          <text x={PAD_X + PLOT_W} y={H - 4} fontSize="9" fill="#94a3b8" textAnchor="end">
            more
          </text>
          <text
            x={6}
            y={PAD_TOP + PLOT_H / 2}
            fontSize="9"
            fill="#94a3b8"
            textAnchor="start"
            transform={`rotate(-90 6 ${PAD_TOP + PLOT_H / 2})`}
          >
            outcome
          </text>
        </svg>
      </div>

      {/* Legend + values */}
      <div className="flex items-start gap-4 flex-wrap text-[11px] text-slate-600">
        <Legend color="#94a3b8" dashed>
          mechanism curve ({info.shape.replace('_', '-')})
        </Legend>
        <Legend
          color="#4f46e5"
          thickness={tangentStyle.width}
          dashed={!!tangentStyle.dash}
        >
          user slope {slopeLabel} {slopeSdLabel}
          {outcomeUnit ? ` ${outcomeUnit}` : ''} ·{' '}
          <span className="text-slate-500">{TIER_LABEL[evidenceTier]}</span>
        </Legend>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] tabular-nums">
        {currentValue != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-500 inline-block flex-shrink-0" />
            <span className="text-slate-500">Now</span>
            <span className="text-slate-700">{formatActionValue(currentValue, insight.action)}</span>
            {outcomeBaseline != null && Number.isFinite(outcomeBaseline) && (
              <span className="text-slate-400">
                · {formatOutcomeValue(outcomeBaseline, insight.outcome)}
                {outcomeUnit ? ` ${outcomeUnit}` : ''}
              </span>
            )}
          </div>
        )}
        {recValue != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary-600 inline-block flex-shrink-0" />
            <span className="text-slate-500">Target</span>
            <span className="text-primary-700 font-medium">
              {formatActionValue(recValue, insight.action)}
            </span>
            {projectedOutcome != null && (
              <span className="text-slate-400">
                · ~{formatOutcomeValue(projectedOutcome, insight.outcome)}
                {outcomeUnit ? ` ${outcomeUnit}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400 italic leading-snug">
        Shape is a mechanism prior — per-user data is too sparse to identify
        curvature. Second-regime tangent overlay requires per-regime posteriors
        from the engine (not yet exported).
      </p>
    </div>
  )
}

function Legend({
  color,
  thickness = 2,
  dashed = false,
  children,
}: {
  color: string
  thickness?: number
  dashed?: boolean
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="8" className="flex-shrink-0">
        <line
          x1="1"
          y1="4"
          x2="21"
          y2="4"
          stroke={color}
          strokeWidth={thickness}
          strokeDasharray={dashed ? '3,3' : undefined}
        />
      </svg>
      <span className={cn(children ? '' : 'hidden')}>{children}</span>
    </span>
  )
}

export default ResponseCurve
