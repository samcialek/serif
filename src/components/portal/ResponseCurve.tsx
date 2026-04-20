/**
 * ResponseCurve — expanded dose-response visualization for a single insight.
 *
 * Load-agnostic: shows the mechanism-prior curve shape and a single dot
 * at the structural optimum (knee / peak / minimise / just-below-cliff).
 * No user-current marker, no tangent line — per-user load and dose sit
 * on the Protocols tab, which can render the same curve with a "now →
 * target" overlay layered on top.
 */

import { useMemo } from 'react'
import { shapeFor, type DoseShape } from '@/data/scm/doseShapes'
import { OUTCOME_META } from './InsightRow'
import type { InsightBayesian } from '@/data/portal/types'

interface ResponseCurveProps {
  insight: InsightBayesian
}

const W = 440
const H = 160
const PAD_X = 32
const PAD_TOP = 18
const PAD_BOTTOM = 26
const PLOT_W = W - PAD_X * 2
const PLOT_H = H - PAD_TOP - PAD_BOTTOM

function sampleShape(shape: DoseShape, n = 80): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const x = i / n
    let y: number
    if (shape === 'plateau_up') {
      y = Math.min(1, (2 / Math.PI) * Math.atan((x / 0.3) * 1.5))
    } else if (shape === 'plateau_down') {
      y = Math.max(0, 1 - (2 / Math.PI) * Math.atan((x / 0.3) * 1.5))
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

// Structural optimum — mechanism-derived, not user-specific.
function optimumFrac(shape: DoseShape): number {
  if (shape === 'inverted_u') return 0.5
  if (shape === 'plateau_down') return 0.1
  if (shape === 'threshold') return 0.75
  return 0.55 // plateau_up: knee
}

const OPTIMUM_LABEL: Record<DoseShape, string> = {
  plateau_up: 'knee — beyond here returns diminish',
  plateau_down: 'minimise — benefit falls as dose rises',
  inverted_u: 'peak — too little and too much both hurt',
  threshold: 'safe zone — just below the cliff',
}

// Load actions are rolling aggregates, never directly prescribed. The
// Protocols tab won't surface them, so the expanded-curve copy is tweaked
// to describe steering via upstream behaviours rather than pointing at
// Protocols for a dose target.
const LOAD_ACTIONS = new Set(['acwr', 'sleep_debt', 'travel_load'])

export function ResponseCurve({ insight }: ResponseCurveProps) {
  const beneficial = OUTCOME_META[insight.outcome]?.beneficial ?? 'neutral'
  const info = shapeFor(insight.action, insight.outcome, insight.scaled_effect, beneficial)
  const isLoad = LOAD_ACTIONS.has(insight.action)

  const optFrac = optimumFrac(info.shape)
  const points = useMemo(() => sampleShape(info.shape), [info.shape])

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

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
            Dose–response
          </p>
          <p className="text-xs text-slate-600 leading-snug">
            {isLoad
              ? 'Mechanism-prior shape — the dot marks the structural optimum. Loads aren\'t prescribed directly; steer them via the behavioural actions above.'
              : 'Mechanism-prior shape — the dot marks the structural optimum, not today\'s operating point. Personal dose targets live in the Protocols tab.'}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 flex-shrink-0">
          {info.shape.replace('_', ' ')}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full h-auto">
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
          <path d={curvePath} fill="none" stroke="#94a3b8" strokeWidth="1.75" />

          {/* Optimum marker */}
          <line
            x1={xPx(optFrac)}
            y1={PAD_TOP}
            x2={xPx(optFrac)}
            y2={PAD_TOP + PLOT_H}
            stroke="#4f46e5"
            strokeWidth="1"
            strokeDasharray="2,3"
          />
          <circle
            cx={xPx(optFrac)}
            cy={yAt(optFrac)}
            r="5"
            fill="#4f46e5"
            stroke="white"
            strokeWidth="2"
          />
          <text
            x={xPx(optFrac)}
            y={PAD_TOP - 4}
            fontSize="10"
            fill="#4f46e5"
            textAnchor="middle"
            fontWeight="600"
          >
            {info.shape === 'inverted_u'
              ? 'peak'
              : info.shape === 'plateau_down'
                ? 'minimise'
                : info.shape === 'threshold'
                  ? 'cliff'
                  : 'knee'}
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

      <p className="text-[11px] text-slate-500 leading-snug">
        <span className="font-medium text-slate-700">{info.edgeLabel}:</span>{' '}
        {OPTIMUM_LABEL[info.shape]}. Shape is a mechanism prior — per-user data
        is too sparse to identify curvature.
      </p>
    </div>
  )
}

export default ResponseCurve
