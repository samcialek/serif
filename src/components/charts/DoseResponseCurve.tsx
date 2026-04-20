import { useMemo, useState } from 'react'
import type { CurveType, CausalParameters } from '@/types'

interface DoseResponseCurveProps {
  params: CausalParameters
  width?: number | '100%'
  height?: number
  showLabels?: boolean
  showCurrentValue?: boolean
  compact?: boolean
  className?: string
}

// Convert snake_case variable names to readable axis labels
function formatVariableLabel(varName: string): string {
  const labelMap: Record<string, string> = {
    sleep_efficiency_pct: 'Sleep Efficiency (%)',
    deep_sleep_min: 'Deep Sleep (min)',
    resting_hr: 'Resting HR (bpm)',
    resting_hr_7d_mean: 'Resting HR 7d (bpm)',
    hrv_daily_mean: 'HRV (ms)',
    hrv_7d_mean: 'HRV 7d (ms)',
    nlr: 'NLR',
    hscrp_smoothed: 'hsCRP (mg/L)',
    cortisol_smoothed: 'Cortisol',
    vo2_peak_smoothed: 'VO2 Peak',
    iron_total_smoothed: 'Iron',
  }
  if (labelMap[varName]) return labelMap[varName]
  // Fallback: replace underscores, title-case
  return varName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/ Pct$/, ' (%)')
    .replace(/ Min$/, ' (min)')
    .replace(/ Hrs?$/, ' (hr)')
}

function formatSourceLabel(varName: string): string {
  const labelMap: Record<string, string> = {
    travel_load: 'Jet Lag Score',
    acwr: 'ACWR',
    sleep_duration_hrs: 'Sleep Duration (hr)',
    omega3_index_derived: 'Omega-3 Index (%)',
    last_workout_end_hour: 'Last Workout Hour',
    bedtime_hour: 'Bedtime Hour',
    caffeine_mg: 'Caffeine (mg)',
    training_load_7d: 'Training Load 7d',
    alcohol_units: 'Alcohol (units)',
  }
  if (labelMap[varName]) return labelMap[varName]
  return varName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/ Pct$/, ' (%)')
    .replace(/ Hrs?$/, ' (hr)')
}

// ============================================================================
// CURVE SHAPE TAXONOMY
// Comprehensive naming system for dose-response curve shapes
// ============================================================================

interface CurveShapeMetadata {
  // Primary identifiers
  name: string                    // Human-readable name (e.g., "Saturating Benefit")
  shortName: string               // Abbreviated (e.g., "SAT-BEN")

  // Shape characteristics
  geometry: string                // Mathematical shape (e.g., "Concave Ascending Plateau")
  curvature: 'linear' | 'convex' | 'concave' | 'sigmoidal' | 'parabolic'
  symmetry: 'symmetric' | 'left-asymmetric' | 'right-asymmetric'

  // Behavioral interpretation
  interpretation: string          // What this means practically
  thresholdMeaning: string        // What crossing θ means
  recommendation: string          // General guidance

  // Risk profile
  riskProfile: 'safe' | 'caution' | 'risk' | 'optimize'

  // Visual
  icon: string                    // Unicode symbol
  color: string
  fill: string
}

const curveShapeMetadata: Record<CurveType, CurveShapeMetadata> = {
  plateau_up: {
    name: 'Saturating Benefit',
    shortName: 'SAT-BEN',
    geometry: 'Concave Ascending → Plateau',
    curvature: 'concave',
    symmetry: 'right-asymmetric',
    interpretation: 'Benefits increase up to a threshold, then level off. More is not better past θ.',
    thresholdMeaning: 'Point of diminishing returns - you\'ve captured most of the benefit',
    recommendation: 'Aim to reach θ, but don\'t stress about exceeding it',
    riskProfile: 'safe',
    icon: '📈→',
    color: '#10B981',
    fill: 'rgba(16, 185, 129, 0.15)',
  },

  plateau_down: {
    name: 'Threshold Decay',
    shortName: 'THR-DEC',
    geometry: 'Plateau → Convex Descending',
    curvature: 'convex',
    symmetry: 'left-asymmetric',
    interpretation: 'Outcome is stable until threshold, then declines rapidly. Stay below θ.',
    thresholdMeaning: 'Critical tipping point - exceeding this triggers negative effects',
    recommendation: 'Stay below θ with safety margin',
    riskProfile: 'caution',
    icon: '→📉',
    color: '#EF4444',
    fill: 'rgba(239, 68, 68, 0.15)',
  },

  v_min: {
    name: 'Optimal Minimum',
    shortName: 'OPT-MIN',
    geometry: 'Convex Parabola (U-Shape)',
    curvature: 'parabolic',
    symmetry: 'symmetric',
    interpretation: 'Both too little and too much are harmful. There\'s a "sweet spot" at θ.',
    thresholdMeaning: 'Goldilocks point - the optimal balance between extremes',
    recommendation: 'Target θ precisely; deviation in either direction hurts',
    riskProfile: 'optimize',
    icon: '∪',
    color: '#06B6D4',
    fill: 'rgba(6, 182, 212, 0.15)',
  },

  v_max: {
    name: 'Optimal Peak',
    shortName: 'OPT-PK',
    geometry: 'Concave Parabola (Inverted U)',
    curvature: 'parabolic',
    symmetry: 'symmetric',
    interpretation: 'Maximum benefit at θ, with diminishing returns on either side.',
    thresholdMeaning: 'Peak performance point - this is where you want to be',
    recommendation: 'Aim for θ; both under and over are suboptimal',
    riskProfile: 'optimize',
    icon: '∩',
    color: '#8B5CF6',
    fill: 'rgba(139, 92, 246, 0.15)',
  },

  linear: {
    name: 'Linear Dose-Response',
    shortName: 'LIN-DR',
    geometry: 'Linear Monotonic',
    curvature: 'linear',
    symmetry: 'symmetric',
    interpretation: 'Effect scales proportionally with dose. No threshold effects.',
    thresholdMeaning: 'Reference point only - effects are continuous across the range',
    recommendation: 'More (or less) directly translates to proportional change',
    riskProfile: 'safe',
    icon: '↗',
    color: '#6B7280',
    fill: 'rgba(107, 114, 128, 0.15)',
  },
}

// Derive current status description
function getStatusDescription(
  curveType: CurveType,
  status?: 'below_optimal' | 'at_optimal' | 'above_optimal' | 'below_threshold' | 'above_threshold'
): { label: string; severity: 'good' | 'moderate' | 'poor'; advice: string } {
  if (!status || status === 'at_optimal') {
    return { label: 'At Optimal', severity: 'good', advice: 'Maintain current behavior' }
  }

  if (curveType === 'plateau_up') {
    if (status === 'below_optimal') {
      return { label: 'Below Saturation', severity: 'moderate', advice: 'Room to increase for more benefit' }
    }
    return { label: 'Above Saturation', severity: 'good', advice: 'At or past full benefit - no action needed' }
  }

  if (curveType === 'plateau_down') {
    if (status === 'below_optimal') {
      return { label: 'In Safe Zone', severity: 'good', advice: 'Well below threshold - maintain' }
    }
    return { label: 'Past Threshold', severity: 'poor', advice: 'Reduce to get back below θ' }
  }

  if (curveType === 'v_min' || curveType === 'v_max') {
    if (status === 'below_optimal') {
      return { label: 'Below Optimal', severity: 'moderate', advice: 'Increase toward θ' }
    }
    return { label: 'Above Optimal', severity: 'moderate', advice: 'Decrease toward θ' }
  }

  // Linear / threshold statuses — no clear optimal, show position relative to kink
  if (status === 'below_threshold') {
    return { label: 'Below θ', severity: 'moderate', advice: 'Below the threshold — effect differs above' }
  }
  if (status === 'above_threshold') {
    return { label: 'Above θ', severity: 'moderate', advice: 'Above the threshold — effect differs below' }
  }
  return { label: status === 'below_optimal' ? 'Lower Range' : 'Higher Range', severity: 'moderate', advice: 'Adjust based on goals' }
}

// Color scheme for different curve types (legacy support)
const curveColors = {
  plateau_up: {
    line: '#10B981',
    fill: 'rgba(16, 185, 129, 0.1)',
    threshold: '#10B981',
  },
  plateau_down: {
    line: '#EF4444',
    fill: 'rgba(239, 68, 68, 0.1)',
    threshold: '#EF4444',
  },
  v_min: {
    line: '#06B6D4',
    fill: 'rgba(6, 182, 212, 0.1)',
    threshold: '#06B6D4',
  },
  v_max: {
    line: '#8B5CF6',
    fill: 'rgba(139, 92, 246, 0.1)',
    threshold: '#8B5CF6',
  },
  linear: {
    line: '#6B7280',
    fill: 'rgba(107, 114, 128, 0.1)',
    threshold: '#6B7280',
  },
}

// Generate SVG path for different curve types
// betaBelow/betaAbove are used for linear curves to determine slope direction
function generateCurvePath(
  curveType: CurveType,
  width: number,
  height: number,
  padding: number,
  betaBelow?: number,
  betaAbove?: number,
): string {
  const w = width - padding * 2
  const h = height - padding * 2
  const startX = padding
  const startY = height - padding
  const endX = width - padding
  const endY = padding
  const midX = width / 2

  switch (curveType) {
    case 'plateau_up':
      // Rises then plateaus
      return `M ${startX} ${startY}
              Q ${startX + w * 0.3} ${startY - h * 0.3} ${midX} ${startY - h * 0.8}
              L ${endX} ${startY - h * 0.8}`

    case 'plateau_down':
      // Flat then drops
      return `M ${startX} ${endY + h * 0.2}
              L ${midX} ${endY + h * 0.2}
              Q ${midX + w * 0.2} ${endY + h * 0.3} ${endX} ${startY}`

    case 'v_min':
      // U-shaped (optimal minimum)
      return `M ${startX} ${endY + h * 0.2}
              Q ${startX + w * 0.25} ${startY - h * 0.1} ${midX} ${startY - h * 0.15}
              Q ${midX + w * 0.25} ${startY - h * 0.1} ${endX} ${endY + h * 0.2}`

    case 'v_max':
      // Inverted U (optimal peak)
      return `M ${startX} ${startY - h * 0.2}
              Q ${startX + w * 0.25} ${endY + h * 0.1} ${midX} ${endY + h * 0.15}
              Q ${midX + w * 0.25} ${endY + h * 0.1} ${endX} ${startY - h * 0.2}`

    case 'linear':
    default: {
      // Use the dominant beta sign to determine slope direction
      const avgBeta = (betaBelow !== undefined && betaAbove !== undefined)
        ? (betaBelow + betaAbove) / 2
        : undefined
      // Positive beta → y increases as x increases → line goes up (startY → endY)
      // Negative beta → y decreases as x increases → line goes down (endY → startY)
      if (avgBeta !== undefined && avgBeta < 0) {
        // Negative slope: high at left, low at right
        return `M ${startX} ${endY} L ${endX} ${startY}`
      }
      // Positive slope: low at left, high at right (default)
      return `M ${startX} ${startY} L ${endX} ${endY}`
    }
  }
}

// Get the Y position for a given X value on the curve
function getYPositionOnCurve(
  curveType: CurveType,
  xPercent: number,
  height: number,
  padding: number,
  betaBelow?: number,
  betaAbove?: number,
): number {
  const h = height - padding * 2
  const startY = height - padding
  const endY = padding

  switch (curveType) {
    case 'plateau_up':
      if (xPercent < 0.5) {
        return startY - (xPercent * 2 * h * 0.8)
      }
      return startY - h * 0.8

    case 'plateau_down':
      if (xPercent < 0.5) {
        return endY + h * 0.2
      }
      return endY + h * 0.2 + ((xPercent - 0.5) * 2 * h * 0.6)

    case 'v_min': {
      const distFromCenter = Math.abs(xPercent - 0.5) * 2
      return startY - h * 0.15 - (distFromCenter * h * 0.65)
    }

    case 'v_max': {
      const distFromPeak = Math.abs(xPercent - 0.5) * 2
      return endY + h * 0.15 + (distFromPeak * h * 0.65)
    }

    default: {
      const avgBeta = (betaBelow !== undefined && betaAbove !== undefined)
        ? (betaBelow + betaAbove) / 2
        : undefined
      if (avgBeta !== undefined && avgBeta < 0) {
        // Negative slope: high at left (endY), low at right (startY)
        return endY + (xPercent * h)
      }
      // Positive slope: low at left (startY), high at right (endY)
      return startY - (xPercent * h)
    }
  }
}

export function DoseResponseCurve({
  params,
  width = 280,
  height = 200,
  showLabels = true,
  showCurrentValue = true,
  compact = false,
  className,
}: DoseResponseCurveProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Extra space for axis labels (Y-axis on left, X-axis on bottom)
  const labelPadLeft = compact ? 0 : 14
  const labelPadBottom = compact ? 0 : 22

  // Internal chart dimensions (used by generateCurvePath / getYPositionOnCurve)
  const chartW = typeof width === 'number' ? width : 340
  const chartH = height
  const padding = compact ? 15 : 24

  // Total SVG dimensions include room for axis labels
  const svgWidth = chartW + labelPadLeft
  const svgHeight = chartH + labelPadBottom

  // Handle mouse move for cursor-following tooltip
  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  // Calculate tooltip position with viewport boundary handling
  const tooltipWidth = 240
  const tooltipHeight = 200
  const offset = 12

  const tooltipX = typeof window !== 'undefined' && mousePos.x + offset + tooltipWidth > window.innerWidth
    ? mousePos.x - tooltipWidth - offset
    : mousePos.x + offset

  const tooltipY = typeof window !== 'undefined' && mousePos.y + offset + tooltipHeight > window.innerHeight
    ? mousePos.y - tooltipHeight - offset
    : mousePos.y + offset

  const colors = curveColors[params.curveType]
  const shapeMeta = curveShapeMetadata[params.curveType]
  const statusInfo = getStatusDescription(params.curveType, params.currentStatus)

  // Derive axis labels from params
  const yLabel = formatVariableLabel(params.target)
  const xLabel = formatSourceLabel(params.source)

  // Beta values for slope-aware rendering
  const bBelow = params.betaBelow.value
  const bAbove = params.betaAbove.value

  // All chart element positions are computed in the chart's own coordinate system
  // (0,0) to (chartW, chartH), offset into the SVG via <g transform>
  const thetaXPercent = 0.5 // Threshold at center
  const thetaX = padding + (chartW - padding * 2) * thetaXPercent
  const thetaY = getYPositionOnCurve(params.curveType, thetaXPercent, chartH, padding, bBelow, bAbove)

  // Calculate current value position if available
  const currentXPercent = useMemo(() => {
    if (params.currentValue === undefined) return null
    const theta = params.theta.value
    const range = theta * 0.6 // Assume range is ±60% of theta
    const normalized = (params.currentValue - (theta - range)) / (range * 2)
    return Math.max(0.05, Math.min(0.95, normalized))
  }, [params.currentValue, params.theta.value])

  const currentX = currentXPercent !== null
    ? padding + (chartW - padding * 2) * currentXPercent
    : null
  const currentY = currentXPercent !== null
    ? getYPositionOnCurve(params.curveType, currentXPercent, chartH, padding, bBelow, bAbove)
    : null

  const curvePath = generateCurvePath(params.curveType, chartW, chartH, padding, bBelow, bAbove)

  // Risk profile colors
  const riskColors = {
    safe: { bg: 'bg-emerald-500', text: 'text-emerald-100' },
    caution: { bg: 'bg-amber-500', text: 'text-amber-100' },
    risk: { bg: 'bg-rose-500', text: 'text-rose-100' },
    optimize: { bg: 'bg-violet-500', text: 'text-violet-100' },
  }

  const severityColors = {
    good: 'text-emerald-400',
    moderate: 'text-amber-400',
    poor: 'text-rose-400',
  }

  return (
    <div
      className={`relative ${className || ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMove={handleMouseMove}
    >
      <svg
        width={width === '100%' ? '100%' : svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible cursor-help"
      >
        <defs>
          <pattern id={`grid-${params.source}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Y-axis label (rotated, left side) */}
        {showLabels && !compact && (
          <text
            x={10}
            y={chartH / 2}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90, 10, ${chartH / 2})`}
            className="fill-slate-500"
            style={{ fontSize: '10px', fontWeight: 600 }}
          >
            {yLabel}
          </text>
        )}

        {/* X-axis label (bottom center) */}
        {showLabels && !compact && (
          <text
            x={labelPadLeft + chartW / 2}
            y={svgHeight - 3}
            textAnchor="middle"
            className="fill-slate-500"
            style={{ fontSize: '10px', fontWeight: 600 }}
          >
            {xLabel}
          </text>
        )}

        {/* Chart area shifted right by labelPadLeft */}
        <g transform={`translate(${labelPadLeft}, 0)`}>
          {/* Background grid */}
          <rect x={padding} y={padding} width={chartW - padding * 2} height={chartH - padding * 2} fill={`url(#grid-${params.source})`} />

          {/* Axes */}
          <line x1={padding} y1={chartH - padding} x2={chartW - padding} y2={chartH - padding} stroke="#D1D5DB" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={padding} y2={chartH - padding} stroke="#D1D5DB" strokeWidth="1" />

          {/* Fill under curve */}
          <path
            d={`${curvePath} L ${chartW - padding} ${chartH - padding} L ${padding} ${chartH - padding} Z`}
            fill={colors.fill}
          />

          {/* Main curve */}
          <path
            d={curvePath}
            fill="none"
            stroke={colors.line}
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Threshold line - hidden for linear curves (no real changepoint) */}
          {params.curveType !== 'linear' && (
            <line
              x1={thetaX}
              y1={padding}
              x2={thetaX}
              y2={chartH - padding}
              stroke={colors.threshold}
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
          )}

          {/* Threshold point - hidden for linear curves */}
          {params.curveType !== 'linear' && (
            <>
              <circle cx={thetaX} cy={thetaY} r="7" fill={colors.threshold} />
              <circle cx={thetaX} cy={thetaY} r="3.5" fill="white" />
            </>
          )}

          {/* Threshold confidence interval - hidden for linear curves */}
          {!compact && params.curveType !== 'linear' && (
            <rect
              x={thetaX - 15}
              y={chartH - padding + 5}
              width={30}
              height={4}
              rx={2}
              fill={colors.threshold}
              opacity={0.3}
            />
          )}

          {/* Current value marker */}
          {showCurrentValue && currentX !== null && currentY !== null && (
            <>
              <line
                x1={currentX}
                y1={currentY}
                x2={currentX}
                y2={chartH - padding}
                stroke="#F59E0B"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle cx={currentX} cy={currentY} r="5" fill="#F59E0B" />
              <circle cx={currentX} cy={currentY} r="2" fill="white" />
            </>
          )}

          {/* Current value label */}
          {showLabels && !compact && currentX !== null && (
            <text x={currentX} y={padding - 5} textAnchor="middle" className="fill-amber-600" style={{ fontSize: '10px', fontWeight: 700 }}>
              You: {params.currentValue}
            </text>
          )}

          {/* Theta label - hidden for linear curves */}
          {showLabels && !compact && params.curveType !== 'linear' && (
            <text x={thetaX} y={chartH - 4} textAnchor="middle" className="fill-gray-600" style={{ fontSize: '10px', fontWeight: 700 }}>
              θ={params.theta.displayValue}
            </text>
          )}
        </g>
      </svg>

      {/* Hover Tooltip - Compact cursor-following tooltip (200x120px max) */}
      {isHovered && !compact && (
        <div
          className="fixed z-[9999] bg-black text-white text-left border pointer-events-none shadow-lg"
          style={{
            left: tooltipX,
            top: tooltipY,
            width: tooltipWidth,
            maxHeight: tooltipHeight,
            borderColor: shapeMeta.color,
          }}
        >
          {/* Header - Colored bar with name */}
          <div
            className="px-2 py-1 flex items-center justify-between"
            style={{ backgroundColor: shapeMeta.color }}
          >
            <span className="text-[11px] font-black uppercase tracking-tight truncate">
              {shapeMeta.icon} {shapeMeta.name}
            </span>
            <span className="text-[9px] font-mono opacity-80 ml-1 flex-shrink-0">{shapeMeta.shortName}</span>
          </div>

          {/* Content - Expanded for better readability */}
          <div className="p-2.5 space-y-2">
            {/* Geometry & Curvature */}
            <div className="text-[10px] text-gray-400">
              <span className="capitalize">{shapeMeta.curvature}</span>
              <span className="mx-1">·</span>
              <span>{shapeMeta.geometry}</span>
            </div>

            {/* Full interpretation */}
            <p className="text-[11px] text-gray-300 leading-relaxed">
              {shapeMeta.interpretation}
            </p>

            {/* Threshold meaning - hidden for linear curves */}
            {params.curveType !== 'linear' && (
              <div className="text-[10px] text-gray-400 pt-1 border-t border-white/10">
                <span className="text-gray-500 uppercase tracking-wider text-[9px]">At θ:</span>
                <span className="ml-1">{shapeMeta.thresholdMeaning}</span>
              </div>
            )}

            {/* Parameters row */}
            <div className="flex items-center gap-2 text-[10px] font-mono pt-1 border-t border-white/20">
              {params.curveType !== 'linear' && (
                <span className="text-white font-bold">θ={params.theta.displayValue}</span>
              )}
              <span className="text-gray-500">n={params.observations}</span>
              <span className={`ml-auto px-1 py-0.5 text-[9px] font-bold uppercase ${riskColors[shapeMeta.riskProfile].bg} ${riskColors[shapeMeta.riskProfile].text}`}>
                {shapeMeta.riskProfile}
              </span>
            </div>

            {/* Status (if available) */}
            {params.currentStatus && (
              <div className="flex items-center gap-1 text-[10px]">
                <span className={`font-bold ${severityColors[statusInfo.severity]}`}>{statusInfo.label}</span>
                {params.currentValue !== undefined && (
                  <span className="text-gray-500">({params.currentValue})</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Compact version for lists
export function DoseResponseCurveCompact({ params }: { params: CausalParameters }) {
  return <DoseResponseCurve params={params} width={120} height={60} showLabels={false} compact />
}

// Effect size display component
interface EffectSizeDisplayProps {
  params: CausalParameters
  variant?: 'full' | 'compact'
}

export function EffectSizeDisplay({ params, variant = 'full' }: EffectSizeDisplayProps) {
  const isVShape = params.curveType === 'v_min' || params.curveType === 'v_max'

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono font-bold text-black">θ={params.theta.displayValue}</span>
        <span className="text-gray-400">|</span>
        <span className={`font-mono font-bold ${params.betaAbove.value < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          β={params.betaAbove.description}
        </span>
      </div>
    )
  }

  const isLinear = params.curveType === 'linear'

  // For linear curves, show a single-row summary instead of misleading below/above split
  if (isLinear) {
    // Pick the dominant slope (the one with the larger absolute value)
    const dominant = Math.abs(params.betaAbove.value) >= Math.abs(params.betaBelow.value)
      ? params.betaAbove : params.betaBelow
    return (
      <div className="p-3 border bg-slate-50 border-slate-200 rounded">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          Slope
        </div>
        <div className={`font-mono font-black text-lg ${
          dominant.value > 0 ? 'text-emerald-600' : 'text-rose-600'
        }`}>
          {dominant.description}
        </div>
      </div>
    )
  }

  // Clean design with subtle borders for internal elements
  return (
    <div className="grid grid-cols-2 gap-0">
      <div className={`p-3 border border-r-0 ${isVShape ? 'bg-sky-50 border-sky-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          Below θ
        </div>
        <div className={`font-mono font-black text-lg ${
          params.betaBelow.value > 0 ? 'text-emerald-600' : 'text-rose-600'
        }`}>
          {params.betaBelow.description}
        </div>
      </div>
      <div className={`p-3 border ${isVShape ? 'bg-violet-50 border-violet-200' : 'bg-rose-50 border-rose-200'}`}>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          Above θ
        </div>
        <div className={`font-mono font-black text-lg ${
          params.betaAbove.value > 0 ? 'text-emerald-600' : 'text-rose-600'
        }`}>
          {params.betaAbove.description}
        </div>
      </div>
    </div>
  )
}

// Evidence bar component
interface EvidenceBarProps {
  personalPct: number
  populationPct: number
  observations: number
  completePct: number
}

export function EvidenceBar({ personalPct, populationPct, observations, completePct }: EvidenceBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-primary-500"
            style={{ width: `${personalPct * 100}%` }}
            title={`${Math.round(personalPct * 100)}% your data`}
          />
          <div
            className="h-full bg-gray-300"
            style={{ width: `${populationPct * 100}%` }}
            title={`${Math.round(populationPct * 100)}% population`}
          />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{Math.round(personalPct * 100)}% your data, {Math.round(populationPct * 100)}% population</span>
        <span>{observations} obs · {completePct}% complete</span>
      </div>
    </div>
  )
}

export default DoseResponseCurve
