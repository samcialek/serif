import { useState } from 'react'
import { PageLayout } from '@/components/layout'
import { Card, Button, Badge } from '@/components/common'
import { Check } from 'lucide-react'
import type { CausalParameters } from '@/types'

// Sample data for demonstration
const sampleParams: CausalParameters = {
  source: 'bedtime_hour',
  target: 'sleep_efficiency',
  theta: { value: 22.25, unit: 'hour', low: 21.75, high: 22.75, displayValue: '10:15 PM' },
  betaBelow: { value: 0.02, unit: '%', description: '+2% per hour earlier' },
  betaAbove: { value: -0.023, unit: '%', description: '-2.3% per hour later' },
  curveType: 'plateau_down',
  observations: 142,
  completePct: 94.5,
  changepointProb: 0.92,
  sizeCategory: 'medium',
  currentValue: 23.5, // 11:30 PM
  currentStatus: 'above_optimal',
}

// Color scheme
const colors = {
  curve: '#10B981',
  threshold: '#10B981',
  current: '#F59E0B',
  fill: 'rgba(16, 185, 129, 0.15)',
  grid: '#E5E7EB',
  text: '#374151',
  muted: '#9CA3AF',
}

// ============================================================================
// STYLE 1: EXPANDED HORIZONTAL
// Wide format with clear separation - labels outside the chart area
// ============================================================================
function Style1_ExpandedHorizontal({ params }: { params: CausalParameters }) {
  const width = 400
  const height = 180
  const padding = { top: 30, right: 50, bottom: 50, left: 60 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  return (
    <div className="bg-white border-2 border-black p-4">
      <svg width={width} height={height}>
        {/* Chart area background */}
        <rect
          x={padding.left}
          y={padding.top}
          width={chartW}
          height={chartH}
          fill="#FAFAFA"
          stroke="#E5E7EB"
          strokeWidth="1"
        />

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((pct) => (
          <line
            key={pct}
            x1={padding.left}
            y1={padding.top + chartH * pct}
            x2={padding.left + chartW}
            y2={padding.top + chartH * pct}
            stroke="#E5E7EB"
            strokeDasharray="2 4"
          />
        ))}

        {/* Curve - plateau_down */}
        <path
          d={`M ${padding.left} ${padding.top + chartH * 0.15}
              L ${padding.left + chartW * 0.5} ${padding.top + chartH * 0.15}
              Q ${padding.left + chartW * 0.65} ${padding.top + chartH * 0.3}
              ${padding.left + chartW} ${padding.top + chartH * 0.85}`}
          fill="none"
          stroke={colors.curve}
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Fill under curve */}
        <path
          d={`M ${padding.left} ${padding.top + chartH * 0.15}
              L ${padding.left + chartW * 0.5} ${padding.top + chartH * 0.15}
              Q ${padding.left + chartW * 0.65} ${padding.top + chartH * 0.3}
              ${padding.left + chartW} ${padding.top + chartH * 0.85}
              L ${padding.left + chartW} ${padding.top + chartH}
              L ${padding.left} ${padding.top + chartH}
              Z`}
          fill={colors.fill}
        />

        {/* Threshold line */}
        <line
          x1={padding.left + chartW * 0.5}
          y1={padding.top}
          x2={padding.left + chartW * 0.5}
          y2={padding.top + chartH}
          stroke={colors.threshold}
          strokeWidth="2"
          strokeDasharray="6 4"
        />

        {/* Threshold point */}
        <circle
          cx={padding.left + chartW * 0.5}
          cy={padding.top + chartH * 0.15}
          r="8"
          fill={colors.threshold}
        />
        <circle
          cx={padding.left + chartW * 0.5}
          cy={padding.top + chartH * 0.15}
          r="4"
          fill="white"
        />

        {/* Current value marker */}
        <circle
          cx={padding.left + chartW * 0.75}
          cy={padding.top + chartH * 0.55}
          r="7"
          fill={colors.current}
        />
        <circle
          cx={padding.left + chartW * 0.75}
          cy={padding.top + chartH * 0.55}
          r="3"
          fill="white"
        />

        {/* Y-axis label */}
        <text
          x={15}
          y={padding.top + chartH / 2}
          textAnchor="middle"
          className="text-xs font-bold fill-gray-600 uppercase"
          transform={`rotate(-90, 15, ${padding.top + chartH / 2})`}
        >
          Sleep Efficiency
        </text>

        {/* X-axis label */}
        <text
          x={padding.left + chartW / 2}
          y={height - 8}
          textAnchor="middle"
          className="text-xs font-bold fill-gray-600 uppercase"
        >
          Bedtime Hour
        </text>

        {/* Threshold label - outside chart */}
        <text
          x={padding.left + chartW * 0.5}
          y={padding.top - 10}
          textAnchor="middle"
          className="text-sm font-black fill-emerald-600"
        >
          θ = 10:15 PM
        </text>

        {/* Current value label - outside */}
        <text
          x={padding.left + chartW * 0.75}
          y={padding.top - 10}
          textAnchor="middle"
          className="text-sm font-bold fill-amber-600"
        >
          YOU: 11:30 PM
        </text>
      </svg>
    </div>
  )
}

// ============================================================================
// STYLE 2: SPLIT PANEL
// Chart and parameters in separate panels side by side
// ============================================================================
function Style2_SplitPanel({ params }: { params: CausalParameters }) {
  const chartSize = 160

  return (
    <div className="flex border-2 border-black">
      {/* Left: Pure Chart */}
      <div className="p-4 border-r-2 border-black bg-gray-50">
        <svg width={chartSize} height={chartSize}>
          {/* Simple grid */}
          <rect x="0" y="0" width={chartSize} height={chartSize} fill="#FAFAFA" />
          <line x1="0" y1={chartSize} x2={chartSize} y2={chartSize} stroke="#000" strokeWidth="2" />
          <line x1="0" y1="0" x2="0" y2={chartSize} stroke="#000" strokeWidth="2" />

          {/* Curve */}
          <path
            d={`M 0 ${chartSize * 0.2}
                L ${chartSize * 0.5} ${chartSize * 0.2}
                Q ${chartSize * 0.7} ${chartSize * 0.35}
                ${chartSize} ${chartSize * 0.85}`}
            fill={colors.fill}
            stroke={colors.curve}
            strokeWidth="3"
          />

          {/* Threshold */}
          <line
            x1={chartSize * 0.5}
            y1="0"
            x2={chartSize * 0.5}
            y2={chartSize}
            stroke={colors.threshold}
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <circle cx={chartSize * 0.5} cy={chartSize * 0.2} r="8" fill={colors.threshold} />
          <circle cx={chartSize * 0.5} cy={chartSize * 0.2} r="4" fill="white" />

          {/* Current */}
          <circle cx={chartSize * 0.75} cy={chartSize * 0.55} r="6" fill={colors.current} />
        </svg>
      </div>

      {/* Right: Parameters */}
      <div className="flex-1 p-4 bg-white">
        <div className="space-y-3">
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Threshold (θ)</div>
            <div className="text-2xl font-black text-black">10:15 PM</div>
          </div>
          <div className="h-0.5 bg-black" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase">Before θ</div>
              <div className="text-lg font-bold text-emerald-600">+2%/hr</div>
            </div>
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase">After θ</div>
              <div className="text-lg font-bold text-rose-600">-2.3%/hr</div>
            </div>
          </div>
          <div className="h-0.5 bg-gray-200" />
          <div>
            <div className="text-xs font-bold text-gray-500 uppercase">Your Current</div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-amber-600">11:30 PM</span>
              <span className="px-2 py-0.5 bg-amber-500 text-white text-xs font-bold uppercase">Above θ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STYLE 3: STACKED VERTICAL
// Large chart on top, parameters below in horizontal blocks
// ============================================================================
function Style3_StackedVertical({ params }: { params: CausalParameters }) {
  const width = 340
  const chartHeight = 140

  return (
    <div className="border-2 border-black">
      {/* Header */}
      <div className="px-4 py-2 bg-black text-white">
        <div className="text-xs font-bold uppercase tracking-wider">Dose-Response: Bedtime → Sleep</div>
      </div>

      {/* Chart */}
      <div className="p-4 bg-gray-50 border-b-2 border-black">
        <svg width={width} height={chartHeight}>
          {/* Background */}
          <rect x="40" y="10" width={width - 60} height={chartHeight - 30} fill="white" stroke="#E5E7EB" />

          {/* Curve */}
          <path
            d={`M 40 ${chartHeight * 0.2}
                L ${width * 0.45} ${chartHeight * 0.2}
                Q ${width * 0.6} ${chartHeight * 0.35}
                ${width - 20} ${chartHeight * 0.75}`}
            fill={colors.fill}
            stroke={colors.curve}
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Threshold line */}
          <line
            x1={width * 0.45}
            y1="10"
            x2={width * 0.45}
            y2={chartHeight - 20}
            stroke={colors.threshold}
            strokeWidth="2"
            strokeDasharray="6 3"
          />

          {/* Threshold dot */}
          <circle cx={width * 0.45} cy={chartHeight * 0.2} r="10" fill={colors.threshold} />
          <text
            x={width * 0.45}
            y={chartHeight * 0.2 + 4}
            textAnchor="middle"
            className="text-xs font-black fill-white"
          >
            θ
          </text>

          {/* Current marker */}
          <circle cx={width * 0.7} cy={chartHeight * 0.5} r="8" fill={colors.current} stroke="white" strokeWidth="2" />

          {/* X-axis labels */}
          <text x="40" y={chartHeight - 5} className="text-xs fill-gray-500">Early</text>
          <text x={width - 20} y={chartHeight - 5} textAnchor="end" className="text-xs fill-gray-500">Late</text>
        </svg>
      </div>

      {/* Parameters in blocks */}
      <div className="grid grid-cols-3">
        <div className="p-3 border-r-2 border-black text-center">
          <div className="text-xs font-bold text-gray-500 uppercase">Threshold</div>
          <div className="text-xl font-black text-emerald-600">10:15 PM</div>
        </div>
        <div className="p-3 border-r-2 border-black text-center">
          <div className="text-xs font-bold text-gray-500 uppercase">Effect (β)</div>
          <div className="text-xl font-black text-rose-600">-2.3%/hr</div>
        </div>
        <div className="p-3 text-center bg-amber-50">
          <div className="text-xs font-bold text-gray-500 uppercase">You Now</div>
          <div className="text-xl font-black text-amber-600">11:30 PM</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STYLE 4: MINIMAL ANNOTATION
// Large clean curve with floating annotation badges
// ============================================================================
function Style4_MinimalAnnotation({ params }: { params: CausalParameters }) {
  const width = 360
  const height = 200

  return (
    <div className="relative border-2 border-black bg-white p-4">
      <svg width={width} height={height}>
        {/* Subtle grid */}
        <defs>
          <pattern id="minGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#F3F4F6" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#minGrid)" />

        {/* Large, clear curve */}
        <path
          d={`M 20 ${height * 0.25}
              L ${width * 0.45} ${height * 0.25}
              Q ${width * 0.6} ${height * 0.4}
              ${width - 20} ${height * 0.8}`}
          fill="none"
          stroke={colors.curve}
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Fill */}
        <path
          d={`M 20 ${height * 0.25}
              L ${width * 0.45} ${height * 0.25}
              Q ${width * 0.6} ${height * 0.4}
              ${width - 20} ${height * 0.8}
              L ${width - 20} ${height}
              L 20 ${height}
              Z`}
          fill={colors.fill}
        />

        {/* Threshold vertical band */}
        <rect
          x={width * 0.45 - 3}
          y="0"
          width="6"
          height={height}
          fill={colors.threshold}
          opacity="0.2"
        />

        {/* Threshold point - large */}
        <circle cx={width * 0.45} cy={height * 0.25} r="12" fill={colors.threshold} />
        <circle cx={width * 0.45} cy={height * 0.25} r="6" fill="white" />

        {/* Current marker - large */}
        <circle cx={width * 0.72} cy={height * 0.55} r="10" fill={colors.current} />
        <circle cx={width * 0.72} cy={height * 0.55} r="5" fill="white" />

        {/* Connection line */}
        <line
          x1={width * 0.45}
          y1={height * 0.25}
          x2={width * 0.72}
          y2={height * 0.55}
          stroke="#CBD5E1"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
      </svg>

      {/* Floating annotations */}
      <div
        className="absolute px-3 py-1.5 bg-emerald-500 text-white font-black text-sm uppercase"
        style={{ top: '10px', left: `calc(45% - 40px)` }}
      >
        θ = 10:15 PM
      </div>

      <div
        className="absolute px-3 py-1.5 bg-amber-500 text-white font-black text-sm uppercase"
        style={{ top: '45%', right: '20px' }}
      >
        YOU: 11:30 PM
      </div>

      <div
        className="absolute px-2 py-1 bg-rose-500 text-white font-bold text-xs uppercase"
        style={{ bottom: '20px', right: '60px' }}
      >
        -2.3%/hr after θ
      </div>
    </div>
  )
}

// ============================================================================
// STYLE 5: DATA TABLE FOCUS
// De-emphasize chart, focus on clear tabular parameter display
// ============================================================================
function Style5_DataTableFocus({ params }: { params: CausalParameters }) {
  const chartWidth = 120
  const chartHeight = 80

  return (
    <div className="border-2 border-black">
      {/* Header with mini chart */}
      <div className="flex items-center justify-between p-4 bg-gray-50 border-b-2 border-black">
        <div>
          <div className="text-lg font-black text-black uppercase">Bedtime → Sleep Efficiency</div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Plateau-Down Curve • n=142</div>
        </div>
        {/* Mini chart as icon */}
        <svg width={chartWidth} height={chartHeight} className="border border-gray-200">
          <path
            d={`M 5 ${chartHeight * 0.25}
                L ${chartWidth * 0.45} ${chartHeight * 0.25}
                Q ${chartWidth * 0.6} ${chartHeight * 0.4}
                ${chartWidth - 5} ${chartHeight * 0.8}`}
            fill={colors.fill}
            stroke={colors.curve}
            strokeWidth="2"
          />
          <circle cx={chartWidth * 0.45} cy={chartHeight * 0.25} r="4" fill={colors.threshold} />
          <circle cx={chartWidth * 0.72} cy={chartHeight * 0.55} r="4" fill={colors.current} />
        </svg>
      </div>

      {/* Data table */}
      <table className="w-full">
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="px-4 py-3 bg-emerald-50 font-bold text-xs uppercase text-gray-600 w-1/3">
              Threshold (θ)
            </td>
            <td className="px-4 py-3 font-black text-xl text-emerald-600">
              10:15 PM
            </td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="px-4 py-3 bg-gray-50 font-bold text-xs uppercase text-gray-600">
              Effect Before θ
            </td>
            <td className="px-4 py-3 font-bold text-lg text-emerald-600">
              +2% per hour earlier
            </td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="px-4 py-3 bg-gray-50 font-bold text-xs uppercase text-gray-600">
              Effect After θ
            </td>
            <td className="px-4 py-3 font-bold text-lg text-rose-600">
              -2.3% per hour later
            </td>
          </tr>
          <tr className="bg-amber-50">
            <td className="px-4 py-3 font-bold text-xs uppercase text-gray-600">
              Your Current
            </td>
            <td className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-black text-xl text-amber-600">11:30 PM</span>
                <span className="px-2 py-1 bg-amber-500 text-white text-xs font-bold uppercase">
                  1h 15m after optimal
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// MAIN DEMO VIEW
// ============================================================================
export default function CurveStyleDemoView() {
  const [selectedStyle, setSelectedStyle] = useState<number | null>(null)

  const styles = [
    {
      id: 1,
      name: 'Expanded Horizontal',
      description: 'Wide format with generous spacing. Labels outside chart area for maximum clarity.',
      pros: ['Clear axis labels', 'No overlapping elements', 'Room for annotations'],
      cons: ['Takes more horizontal space', 'May not fit in 2-column grid well'],
    },
    {
      id: 2,
      name: 'Split Panel',
      description: 'Chart and parameters in separate panels. Clean separation of visual and numeric data.',
      pros: ['Clear parameter display', 'Chart stays simple', 'Brutalist blocks aesthetic'],
      cons: ['More complex layout', 'Duplicates some information'],
    },
    {
      id: 3,
      name: 'Stacked Vertical',
      description: 'Large chart on top, parameter blocks below. Vertical flow is easy to scan.',
      pros: ['Natural top-to-bottom flow', 'Parameters as color blocks', 'Works well in cards'],
      cons: ['Taller component', 'Chart width limited'],
    },
    {
      id: 4,
      name: 'Minimal Annotation',
      description: 'Large clean curve with floating badges. Emphasizes the visual relationship.',
      pros: ['Dramatic visual impact', 'Clear markers', 'Modern feel'],
      cons: ['Annotations could overlap', 'Less precise than numbers'],
    },
    {
      id: 5,
      name: 'Data Table Focus',
      description: 'Mini chart as icon, emphasis on tabular parameter display. Best for data accuracy.',
      pros: ['Precise numbers', 'Easy to scan', 'Most space-efficient'],
      cons: ['Chart is decorative only', 'Less visual impact'],
    },
  ]

  return (
    <PageLayout title="Curve Visualization Styles" subtitle="Select the best format for dose-response curves">
      <div className="space-y-8">
        {/* Style 1 */}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 bg-gray-100 border-b-2 border-black flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase">Style 1: {styles[0].name}</h3>
              <p className="text-sm text-gray-600">{styles[0].description}</p>
            </div>
            <Button
              variant={selectedStyle === 1 ? 'success' : 'outline'}
              size="sm"
              onClick={() => setSelectedStyle(1)}
              leftIcon={selectedStyle === 1 ? <Check className="w-4 h-4" /> : undefined}
            >
              {selectedStyle === 1 ? 'Selected' : 'Select'}
            </Button>
          </div>
          <div className="p-6 bg-white">
            <Style1_ExpandedHorizontal params={sampleParams} />
          </div>
          <div className="p-4 bg-gray-50 border-t-2 border-black flex gap-4">
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Pros:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[0].pros.map((pro) => (
                  <Badge key={pro} variant="success" size="sm">{pro}</Badge>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Cons:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[0].cons.map((con) => (
                  <Badge key={con} variant="warning" size="sm">{con}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Style 2 */}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 bg-gray-100 border-b-2 border-black flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase">Style 2: {styles[1].name}</h3>
              <p className="text-sm text-gray-600">{styles[1].description}</p>
            </div>
            <Button
              variant={selectedStyle === 2 ? 'success' : 'outline'}
              size="sm"
              onClick={() => setSelectedStyle(2)}
              leftIcon={selectedStyle === 2 ? <Check className="w-4 h-4" /> : undefined}
            >
              {selectedStyle === 2 ? 'Selected' : 'Select'}
            </Button>
          </div>
          <div className="p-6 bg-white">
            <Style2_SplitPanel params={sampleParams} />
          </div>
          <div className="p-4 bg-gray-50 border-t-2 border-black flex gap-4">
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Pros:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[1].pros.map((pro) => (
                  <Badge key={pro} variant="success" size="sm">{pro}</Badge>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Cons:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[1].cons.map((con) => (
                  <Badge key={con} variant="warning" size="sm">{con}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Style 3 */}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 bg-gray-100 border-b-2 border-black flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase">Style 3: {styles[2].name}</h3>
              <p className="text-sm text-gray-600">{styles[2].description}</p>
            </div>
            <Button
              variant={selectedStyle === 3 ? 'success' : 'outline'}
              size="sm"
              onClick={() => setSelectedStyle(3)}
              leftIcon={selectedStyle === 3 ? <Check className="w-4 h-4" /> : undefined}
            >
              {selectedStyle === 3 ? 'Selected' : 'Select'}
            </Button>
          </div>
          <div className="p-6 bg-white">
            <Style3_StackedVertical params={sampleParams} />
          </div>
          <div className="p-4 bg-gray-50 border-t-2 border-black flex gap-4">
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Pros:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[2].pros.map((pro) => (
                  <Badge key={pro} variant="success" size="sm">{pro}</Badge>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Cons:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[2].cons.map((con) => (
                  <Badge key={con} variant="warning" size="sm">{con}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Style 4 */}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 bg-gray-100 border-b-2 border-black flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase">Style 4: {styles[3].name}</h3>
              <p className="text-sm text-gray-600">{styles[3].description}</p>
            </div>
            <Button
              variant={selectedStyle === 4 ? 'success' : 'outline'}
              size="sm"
              onClick={() => setSelectedStyle(4)}
              leftIcon={selectedStyle === 4 ? <Check className="w-4 h-4" /> : undefined}
            >
              {selectedStyle === 4 ? 'Selected' : 'Select'}
            </Button>
          </div>
          <div className="p-6 bg-white">
            <Style4_MinimalAnnotation params={sampleParams} />
          </div>
          <div className="p-4 bg-gray-50 border-t-2 border-black flex gap-4">
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Pros:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[3].pros.map((pro) => (
                  <Badge key={pro} variant="success" size="sm">{pro}</Badge>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Cons:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[3].cons.map((con) => (
                  <Badge key={con} variant="warning" size="sm">{con}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Style 5 */}
        <Card padding="none" className="overflow-hidden">
          <div className="p-4 bg-gray-100 border-b-2 border-black flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black uppercase">Style 5: {styles[4].name}</h3>
              <p className="text-sm text-gray-600">{styles[4].description}</p>
            </div>
            <Button
              variant={selectedStyle === 5 ? 'success' : 'outline'}
              size="sm"
              onClick={() => setSelectedStyle(5)}
              leftIcon={selectedStyle === 5 ? <Check className="w-4 h-4" /> : undefined}
            >
              {selectedStyle === 5 ? 'Selected' : 'Select'}
            </Button>
          </div>
          <div className="p-6 bg-white">
            <Style5_DataTableFocus params={sampleParams} />
          </div>
          <div className="p-4 bg-gray-50 border-t-2 border-black flex gap-4">
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Pros:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[4].pros.map((pro) => (
                  <Badge key={pro} variant="success" size="sm">{pro}</Badge>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold text-gray-500 uppercase">Cons:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {styles[4].cons.map((con) => (
                  <Badge key={con} variant="warning" size="sm">{con}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Selection Summary */}
        {selectedStyle && (
          <div className="p-4 bg-emerald-50 border-2 border-emerald-500">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-emerald-700 uppercase">Selected:</span>
                <span className="ml-2 text-lg font-black text-emerald-900">
                  Style {selectedStyle}: {styles[selectedStyle - 1].name}
                </span>
              </div>
              <Button variant="primary" size="sm">
                Apply to Insights
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
