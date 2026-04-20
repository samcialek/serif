import { motion } from 'framer-motion'

interface WaterfallItem {
  label: string
  value: number
  type: 'baseline' | 'positive' | 'negative' | 'total'
}

interface WaterfallChartProps {
  items: WaterfallItem[]
  title?: string
  unit?: string
  className?: string
}

const typeColors = {
  baseline: { bg: '#96b9d0', text: '#6a95b3' },
  positive: { bg: '#89CCF0', text: '#5ba8d4' },
  negative: { bg: '#f8c8dc', text: '#e99bbe' },
  total: { bg: '#b8aadd', text: '#9182c4' },
}

export function WaterfallChart({ items, title = 'Outcome Decomposition', unit = 'min', className = '' }: WaterfallChartProps) {
  // Calculate the max extent the waterfall reaches (for proper scaling)
  let runningForScale = 0
  let maxExtent = 0
  let minExtent = 0

  items.forEach(item => {
    if (item.type === 'baseline') {
      runningForScale = item.value
    } else if (item.type !== 'total') {
      runningForScale += item.value
    }
    maxExtent = Math.max(maxExtent, runningForScale)
    minExtent = Math.min(minExtent, runningForScale)
  })

  // Scale to fit within 90% of the bar (leaving some padding)
  const range = maxExtent - minExtent
  const scale = 90 / Math.max(range, maxExtent, 100)
  const offset = minExtent < 0 ? Math.abs(minExtent) * scale : 0

  let runningTotal = 0

  return (
    <div className={'bg-white rounded-xl p-5 border border-gray-100 ' + className}>
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const startPos = item.type === 'baseline' ? 0 : runningTotal
          if (item.type !== 'total') runningTotal += item.value
          const colors = typeColors[item.type]

          // Calculate bar position and width
          let barLeft: number
          let barWidth: number

          if (item.type === 'total') {
            // Total bar starts from 0 and shows final value
            barLeft = offset
            barWidth = Math.abs(item.value) * scale
          } else if (item.type === 'baseline') {
            barLeft = offset
            barWidth = Math.abs(item.value) * scale
          } else {
            // Incremental items
            if (item.value >= 0) {
              barLeft = offset + startPos * scale
              barWidth = item.value * scale
            } else {
              barLeft = offset + (startPos + item.value) * scale
              barWidth = Math.abs(item.value) * scale
            }
          }

          // Clamp values to prevent overflow
          barLeft = Math.max(0, Math.min(barLeft, 95))
          barWidth = Math.min(barWidth, 95 - barLeft)

          return (
            <motion.div
              key={item.label}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="w-28 text-sm text-gray-600 text-right">{item.label}</div>
              <div className="flex-1 h-8 bg-gray-50 rounded relative overflow-hidden">
                <div
                  className="absolute h-full rounded transition-all"
                  style={{
                    left: `${barLeft}%`,
                    width: `${barWidth}%`,
                    backgroundColor: colors.bg,
                  }}
                />
              </div>
              <div className="w-20 text-sm font-mono" style={{ color: colors.text }}>
                {item.type === 'baseline' || item.type === 'total' ? '' : item.value >= 0 ? '+' : ''}{item.value} {unit}
              </div>
            </motion.div>
          )
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>Waterfall shows contribution of each factor</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#89CCF0' }} /> Positive</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#f8c8dc' }} /> Negative</span>
        </div>
      </div>
    </div>
  )
}

// Preset waterfall for sleep prediction
export function SleepPredictionWaterfall({ className = '' }: { className?: string }) {
  const items: WaterfallItem[] = [
    { label: 'Baseline', value: 75, type: 'baseline' },
    { label: 'Caffeine cutoff', value: 8, type: 'positive' },
    { label: 'Late meal', value: -5, type: 'negative' },
    { label: 'Sleep debt', value: -3, type: 'negative' },
    { label: 'Cool room', value: 4, type: 'positive' },
    { label: 'Predicted', value: 79, type: 'total' },
  ]

  return <WaterfallChart items={items} title="Tonight's Sleep Score" unit="pts" className={className} />
}

export default WaterfallChart
