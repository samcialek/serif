/**
 * Tiny always-visible dose-response indicator for an insight row.
 *
 * Load-agnostic: shows the mechanism-prior curve and a single dot at
 * the structural optimum — knee for plateau_up, peak for inverted_u,
 * low anchor for plateau_down ("minimise"), just-before-cliff for
 * threshold. No current/target — that's Protocol-tab concern.
 */

import { useMemo } from 'react'
import { shapeFor, type DoseShape } from '@/data/scm/doseShapes'
import { OUTCOME_META } from './InsightRow'
import type { InsightBayesian } from '@/data/portal/types'

interface InlineShapeGaugeProps {
  insight: InsightBayesian
}

const W = 80
const H = 28
const PAD_X = 4
const PAD_Y = 4
const PLOT_W = W - PAD_X * 2
const PLOT_H = H - PAD_Y * 2

function shapePoints(shape: DoseShape, n = 40): Array<[number, number]> {
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

// Structural optimum on the curve — purely mechanism-derived, not
// user-specific. Returns the x-fraction in [0,1] where we'd place
// the single dot.
function optimumFrac(shape: DoseShape): number {
  if (shape === 'inverted_u') return 0.5 // peak
  if (shape === 'plateau_down') return 0.1 // minimise
  if (shape === 'threshold') return 0.75 // just before cliff
  return 0.55 // plateau_up: knee
}

export function InlineShapeGauge({ insight }: InlineShapeGaugeProps) {
  const beneficial = OUTCOME_META[insight.outcome]?.beneficial ?? 'neutral'
  const info = shapeFor(insight.action, insight.outcome, insight.scaled_effect, beneficial)
  const pts = useMemo(() => shapePoints(info.shape), [info.shape])
  const optFrac = optimumFrac(info.shape)

  const xPx = (fx: number) => PAD_X + fx * PLOT_W
  const yPx = (fy: number) => PAD_Y + (1 - fy) * PLOT_H

  const curvePath = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${xPx(x).toFixed(1)},${yPx(y).toFixed(1)}`)
    .join(' ')
  const areaPath = `${curvePath} L${xPx(1).toFixed(1)},${yPx(0).toFixed(1)} L${xPx(0).toFixed(1)},${yPx(0).toFixed(1)} Z`

  const yAt = (frac: number) => {
    const p = pts[Math.round(frac * (pts.length - 1))]
    return yPx(p[1])
  }

  const shapeLabel =
    info.shape === 'plateau_up'
      ? 'Plateau-up · knee'
      : info.shape === 'plateau_down'
      ? 'Plateau-down · minimise'
      : info.shape === 'inverted_u'
      ? 'Inverted-U · peak'
      : 'Threshold · just below cliff'

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="flex-shrink-0"
      role="img"
      aria-label={`${shapeLabel} dose-response`}
    >
      <title>{shapeLabel}</title>
      <path d={areaPath} fill="#6366f1" fillOpacity="0.06" />
      <path d={curvePath} fill="none" stroke="#94a3b8" strokeWidth="1.25" />
      <circle cx={xPx(optFrac)} cy={yAt(optFrac)} r="3" fill="#4f46e5" stroke="white" strokeWidth="1" />
    </svg>
  )
}

export default InlineShapeGauge
