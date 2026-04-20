import { useMemo } from 'react'
import type { CausalParameters } from '@/types'

// ──────────────────────────────────────────────────────────────
// DoseResponseCurve3D
//
// A single dose-response curve with a light CI band, plus two
// side-by-side posterior histograms: "current dose" vs "at θ".
// The histograms show how the 128 posterior worlds distribute
// the predicted outcome at each dose level.
// ──────────────────────────────────────────────────────────────

interface DoseResponseCurve3DProps {
  params: CausalParameters
  width?: number
  height?: number
  compact?: boolean
  // unused but kept for API compat with the old component
  initialMode?: string
  showControls?: boolean
}

const serifColors = {
  plateau_up: { line: '#89CCF0', band: 'rgba(137, 204, 240, 0.18)', threshold: '#5ba8d4', current: '#6b7280', recommended: '#89CCF0' },
  plateau_down: { line: '#f8c8dc', band: 'rgba(248, 200, 220, 0.18)', threshold: '#e99bbe', current: '#6b7280', recommended: '#f8c8dc' },
  v_min: { line: '#89CCF0', band: 'rgba(137, 204, 240, 0.18)', threshold: '#5ba8d4', current: '#6b7280', recommended: '#89CCF0' },
  v_max: { line: '#b8aadd', band: 'rgba(184, 170, 221, 0.18)', threshold: '#9182c4', current: '#6b7280', recommended: '#b8aadd' },
  linear: { line: '#96b9d0', band: 'rgba(150, 185, 208, 0.18)', threshold: '#6a95b3', current: '#6b7280', recommended: '#96b9d0' },
}

function piecewiseY(x: number, theta: number, alpha: number, betaBelow: number, betaAbove: number): number {
  return x <= theta
    ? alpha + betaBelow * (x - theta)
    : alpha + betaAbove * (x - theta)
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** Compute posterior y-values at a specific dose across all 128 worlds */
function posteriorAtDose(dose: number, samples: NonNullable<CausalParameters['posteriorSamples']>): number[] {
  return samples.theta.map((_, i) =>
    piecewiseY(dose, samples.theta[i], samples.alpha[i], samples.betaBelow[i], samples.betaAbove[i])
  )
}

/** Build a small horizontal histogram from an array of values */
function buildHistogramBins(values: number[], nBins: number) {
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const binW = range / nBins
  const bins = Array.from({ length: nBins }, (_, i) => ({
    lo: minV + i * binW,
    hi: minV + (i + 1) * binW,
    mid: minV + (i + 0.5) * binW,
    count: 0,
  }))
  for (const v of values) {
    const idx = Math.min(Math.floor((v - minV) / binW), nBins - 1)
    if (idx >= 0) bins[idx].count++
  }
  const maxCount = Math.max(...bins.map(b => b.count), 1)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return { bins, maxCount, mean, min: minV, max: maxV }
}

export function DoseResponseCurve3D({
  params,
  width = 360,
  height: _height = 260,
  compact = false,
}: DoseResponseCurve3DProps) {
  const colors = serifColors[params.curveType]
  const hasSamples = params.posteriorSamples && params.posteriorSamples.theta.length > 0

  // Decide the two dose levels to compare
  const currentDose = params.currentValue ?? params.theta.value * 1.15
  const recommendedDose = params.theta.value

  // Layout: curve on top, two histograms side-by-side below
  const curveH = compact ? 110 : 130
  const histH = compact ? 60 : 72
  const _gap = 8
  const pad = compact ? 18 : 30
  const plotW = width - pad * 2
  const nSteps = 50

  // X range
  const xRange = useMemo(() => {
    const theta = params.theta.value
    const spread = Math.max(Math.abs(params.theta.high - params.theta.low) * 2, theta * 0.4, Math.abs(currentDose - theta) * 1.3)
    return { min: Math.max(0, Math.min(theta, currentDose) - spread * 0.3), max: Math.max(theta, currentDose) + spread * 0.3 }
  }, [params.theta, currentDose])

  // Curve data: median + single 80% CI band
  const curveData = useMemo(() => {
    if (!hasSamples) return null
    const samples = params.posteriorSamples!
    const n = samples.theta.length
    const xStep = (xRange.max - xRange.min) / nSteps

    const allCurves: number[][] = []
    for (let s = 0; s < n; s++) {
      const curve: number[] = []
      for (let i = 0; i <= nSteps; i++) {
        const x = xRange.min + i * xStep
        curve.push(piecewiseY(x, samples.theta[s], samples.alpha[s], samples.betaBelow[s], samples.betaAbove[s]))
      }
      allCurves.push(curve)
    }

    const median: number[] = []
    const p10: number[] = []
    const p90: number[] = []
    for (let i = 0; i <= nSteps; i++) {
      const col = allCurves.map(c => c[i])
      median.push(percentile(col, 50))
      p10.push(percentile(col, 10))
      p90.push(percentile(col, 90))
    }
    return { median, p10, p90 }
  }, [hasSamples, params.posteriorSamples, xRange, nSteps])

  // Histograms at the two dose levels
  const histograms = useMemo(() => {
    if (!hasSamples) return null
    const samples = params.posteriorSamples!
    const nBins = 10
    const atCurrent = posteriorAtDose(currentDose, samples)
    const atRecommended = posteriorAtDose(recommendedDose, samples)
    return {
      current: buildHistogramBins(atCurrent, nBins),
      recommended: buildHistogramBins(atRecommended, nBins),
    }
  }, [hasSamples, params.posteriorSamples, currentDose, recommendedDose])

  // Y range from curve
  const yRange = useMemo(() => {
    if (!curveData) return { min: 30, max: 70 }
    const allY = [...curveData.p10, ...curveData.p90]
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const margin = (maxY - minY) * 0.12
    return { min: minY - margin, max: maxY + margin }
  }, [curveData])

  const toSvgX = (v: number) => pad + ((v - xRange.min) / (xRange.max - xRange.min)) * plotW
  const toSvgY = (v: number) => pad + (curveH - pad * 2) - ((v - yRange.min) / (yRange.max - yRange.min)) * (curveH - pad * 2)

  const buildPath = (ys: number[]) =>
    ys.map((y, i) => {
      const x = xRange.min + i * ((xRange.max - xRange.min) / nSteps)
      return `${i === 0 ? 'M' : 'L'}${toSvgX(x).toFixed(1)},${toSvgY(y).toFixed(1)}`
    }).join(' ')

  const buildBand = (upper: number[], lower: number[]) => {
    const forward = upper.map((y, i) => {
      const x = xRange.min + i * ((xRange.max - xRange.min) / nSteps)
      return `${i === 0 ? 'M' : 'L'}${toSvgX(x).toFixed(1)},${toSvgY(y).toFixed(1)}`
    }).join(' ')
    const backward = [...lower].reverse().map((y, i) => {
      const x = xRange.max - i * ((xRange.max - xRange.min) / nSteps)
      return `L${toSvgX(x).toFixed(1)},${toSvgY(y).toFixed(1)}`
    }).join(' ')
    return `${forward} ${backward} Z`
  }

  // Fallback when there are no posterior samples
  if (!hasSamples || !curveData || !histograms) {
    const prob = Math.round((0.5 + params.changepointProb * 0.3) * 100)
    return (
      <div className="relative p-3 bg-gray-50 rounded-lg" style={{ width }}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-xs" style={{ color: colors.threshold }}>θ = {params.theta.displayValue}</span>
          <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: colors.band, color: colors.threshold }}>P: {prob}%</span>
        </div>
        <div className="text-xs text-gray-500">[{params.theta.low.toFixed(1)} – {params.theta.high.toFixed(1)}] 95% CI</div>
      </div>
    )
  }

  const thetaSvgX = toSvgX(params.theta.value)
  const currentSvgX = toSvgX(currentDose)

  // Median Y at the two dose points (for the dot markers)
  const medianStepCurrent = Math.round(((currentDose - xRange.min) / (xRange.max - xRange.min)) * nSteps)
  const medianStepTheta = Math.round(((recommendedDose - xRange.min) / (xRange.max - xRange.min)) * nSteps)
  const medianYCurrent = curveData.median[Math.min(Math.max(medianStepCurrent, 0), nSteps)]
  const medianYTheta = curveData.median[Math.min(Math.max(medianStepTheta, 0), nSteps)]

  // Shared Y range for histograms so they're comparable
  const histYMin = Math.min(histograms.current.min, histograms.recommended.min)
  const histYMax = Math.max(histograms.current.max, histograms.recommended.max)

  const halfW = (width - 12) / 2 // each histogram panel

  return (
    <div style={{ width }}>
      {/* ─── Main curve ──────────────────────────────── */}
      <svg width={width} height={curveH} viewBox={`0 0 ${width} ${curveH}`}>
        {/* Light grid */}
        <line x1={pad} y1={toSvgY(yRange.min + (yRange.max - yRange.min) * 0.5)} x2={pad + plotW} y2={toSvgY(yRange.min + (yRange.max - yRange.min) * 0.5)} stroke="#f3f4f6" strokeWidth={0.5} />

        {/* 80% CI band */}
        <path d={buildBand(curveData.p90, curveData.p10)} fill={colors.band} />

        {/* Median line */}
        <path d={buildPath(curveData.median)} fill="none" stroke={colors.line} strokeWidth={2} />

        {/* Threshold dashed line */}
        <line x1={thetaSvgX} y1={pad - 4} x2={thetaSvgX} y2={curveH - pad + 4} stroke={colors.threshold} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />

        {/* Current dose line */}
        {currentDose !== recommendedDose && (
          <line x1={currentSvgX} y1={pad - 4} x2={currentSvgX} y2={curveH - pad + 4} stroke={colors.current} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}

        {/* Dot at θ */}
        <circle cx={thetaSvgX} cy={toSvgY(medianYTheta)} r={4.5} fill={colors.threshold} stroke="white" strokeWidth={1.5} />

        {/* Dot at current */}
        {currentDose !== recommendedDose && (
          <circle cx={currentSvgX} cy={toSvgY(medianYCurrent)} r={4.5} fill={colors.current} stroke="white" strokeWidth={1.5} />
        )}

        {/* Labels */}
        <text x={thetaSvgX} y={pad - 7} textAnchor="middle" fill={colors.threshold} fontSize={9} fontWeight={600}>θ</text>
        {currentDose !== recommendedDose && (
          <text x={currentSvgX} y={pad - 7} textAnchor="middle" fill={colors.current} fontSize={9} fontWeight={600}>You</text>
        )}

        {/* X-axis label */}
        <text x={width / 2} y={curveH - 3} textAnchor="middle" fill="#9ca3af" fontSize={8}>
          {params.source.replace(/_/g, ' ')} ({params.theta.unit})
        </text>
      </svg>

      {/* ─── Two histogram panels ────────────────────── */}
      <div className="flex gap-3 mt-1">
        <HistogramPanel
          title="At current"
          subtitle={`${currentDose.toFixed(0)} ${params.theta.unit}`}
          data={histograms.current}
          color={colors.current}
          width={halfW}
          height={histH}
          unit={params.betaBelow.unit}
          globalMin={histYMin}
          globalMax={histYMax}
        />
        <HistogramPanel
          title="At threshold"
          subtitle={`${recommendedDose.toFixed(0)} ${params.theta.unit}`}
          data={histograms.recommended}
          color={colors.threshold}
          width={halfW}
          height={histH}
          unit={params.betaBelow.unit}
          globalMin={histYMin}
          globalMax={histYMax}
        />
      </div>

      {/* ─── Evidence line ───────────────────────────── */}
      {!compact && (
        <div className="flex items-center justify-between px-0.5 mt-1.5 text-xs text-gray-400">
          <span>{params.observations} obs · θ = {params.theta.displayValue}</span>
          <span className="font-mono">[{params.theta.low.toFixed(1)} – {params.theta.high.toFixed(1)}]</span>
        </div>
      )}
    </div>
  )
}

/** Small horizontal histogram for one dose level */
function HistogramPanel({
  title,
  subtitle,
  data,
  color,
  width,
  height,
  unit,
  globalMin,
  globalMax,
}: {
  title: string
  subtitle: string
  data: ReturnType<typeof buildHistogramBins>
  color: string
  width: number
  height: number
  unit: string
  globalMin: number
  globalMax: number
}) {
  const pad = 4
  const barAreaW = width - pad * 2 - 30 // leave room for y-labels
  const barAreaH = height - 22 // leave room for header
  const barH = Math.max(2, (barAreaH / data.bins.length) - 1)
  const globalRange = globalMax - globalMin || 1

  return (
    <div className="flex-1 bg-gray-50 rounded px-2 py-1.5">
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-xs font-medium" style={{ color }}>{title}</span>
        <span className="text-xs text-gray-400">{subtitle}</span>
      </div>
      <svg width={width - 16} height={barAreaH} viewBox={`0 0 ${width - 16} ${barAreaH}`}>
        {data.bins.map((bin, i) => {
          const barW = data.maxCount > 0 ? (bin.count / data.maxCount) * barAreaW : 0
          const y = ((bin.mid - globalMin) / globalRange) * barAreaH
          const flippedY = barAreaH - y - barH / 2
          return (
            <rect
              key={i}
              x={30}
              y={Math.max(0, flippedY)}
              width={barW}
              height={barH}
              fill={color}
              opacity={0.55}
              rx={1}
            />
          )
        })}
        {/* Mean line */}
        {(() => {
          const meanY = barAreaH - ((data.mean - globalMin) / globalRange) * barAreaH
          return (
            <line x1={28} y1={meanY} x2={30 + barAreaW} y2={meanY} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" />
          )
        })()}
        {/* Y-axis: min/max labels */}
        <text x={26} y={barAreaH - 1} textAnchor="end" fill="#9ca3af" fontSize={7}>{globalMin.toFixed(0)}</text>
        <text x={26} y={8} textAnchor="end" fill="#9ca3af" fontSize={7}>{globalMax.toFixed(0)}</text>
      </svg>
      <div className="text-center text-xs font-mono" style={{ color }}>
        {data.mean.toFixed(1)} {unit}
      </div>
    </div>
  )
}

export default DoseResponseCurve3D
