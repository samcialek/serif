import type { CausalParameters } from '@/types'
import { DoseResponseCurve3D } from './DoseResponseCurve3D'

interface EnhancedCurveProps {
  params: CausalParameters
  width?: number
  height?: number
  showUncertainty?: boolean
  showProbabilityBadge?: boolean
  compact?: boolean
}

const serifColors = {
  plateau_up: { line: '#89CCF0', fill: 'rgba(137, 204, 240, 0.15)', threshold: '#5ba8d4' },
  plateau_down: { line: '#f8c8dc', fill: 'rgba(248, 200, 220, 0.15)', threshold: '#e99bbe' },
  v_min: { line: '#89CCF0', fill: 'rgba(137, 204, 240, 0.15)', threshold: '#5ba8d4' },
  v_max: { line: '#b8aadd', fill: 'rgba(184, 170, 221, 0.15)', threshold: '#9182c4' },
  linear: { line: '#96b9d0', fill: 'rgba(150, 185, 208, 0.15)', threshold: '#6a95b3' },
}

export function DoseResponseCurveEnhanced({ params, width = 320, height = 220, showUncertainty: _showUncertainty = true, showProbabilityBadge = true, compact = false }: EnhancedCurveProps) {
  // If posteriorSamples available, use the curve + dual-histogram view
  if (params.posteriorSamples && params.posteriorSamples.theta.length > 0) {
    return (
      <DoseResponseCurve3D
        params={params}
        width={width}
        height={height}
        compact={compact}
      />
    )
  }

  // Fallback: simple parameter display for personas without posteriorSamples
  const colors = serifColors[params.curveType]
  const prob = Math.round((0.5 + params.changepointProb * 0.3) * 100)

  return (
    <div className="relative p-4 bg-gray-50 rounded-lg">
      <div className="text-sm text-gray-600">Enhanced curve visualization</div>
      <div className="mt-2 p-3 bg-white rounded border" style={{ borderColor: colors.line }}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs" style={{ color: colors.threshold }}>θ = {params.theta.displayValue}</span>
          {showProbabilityBadge && <span className="px-2 py-1 rounded text-xs font-bold" style={{ backgroundColor: colors.fill, color: colors.threshold }}>P(benefit): {prob}%</span>}
        </div>
        <div className="mt-2 text-xs text-gray-500">[{params.theta.low.toFixed(1)} - {params.theta.high.toFixed(1)}] 95% CI</div>
      </div>
    </div>
  )
}

export default DoseResponseCurveEnhanced
