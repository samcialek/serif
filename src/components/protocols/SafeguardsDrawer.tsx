import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, ChevronDown, ChevronUp, AlertTriangle, Heart, Moon, Activity } from 'lucide-react'

interface SuppressedAction {
  id: string
  action: string
  reason: string
  riskLevel: 'low' | 'medium' | 'high'
  alternative?: string
  metrics?: { name: string; value: string; status: 'warning' | 'danger' }[]
}

interface SafeguardsDrawerProps {
  suppressedActions: SuppressedAction[]
  className?: string
}

const riskColors = {
  low: { bg: '#96b9d0', text: '#6a95b3' },
  medium: { bg: '#f8c8dc', text: '#e99bbe' },
  high: { bg: '#e99bbe', text: '#c04d7d' },
}

const metricIcons = {
  hrv: Heart,
  rhr: Activity,
  sleep: Moon,
  default: AlertTriangle,
}

export function SafeguardsDrawer({ suppressedActions, className = '' }: SafeguardsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (suppressedActions.length === 0) return null

  return (
    <div className={'bg-white rounded-xl border border-gray-100 overflow-hidden ' + className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(248, 200, 220, 0.2)' }}>
            <Shield className="w-5 h-5" style={{ color: '#e99bbe' }} />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">Safeguards Active</h3>
            <p className="text-sm text-gray-500">{suppressedActions.length} action{suppressedActions.length > 1 ? 's' : ''} suppressed today</p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-3">
              {suppressedActions.map((item, idx) => {
                const colors = riskColors[item.riskLevel]
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-4 rounded-lg border-l-4"
                    style={{ backgroundColor: '#fafafa', borderLeftColor: colors.bg }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{item.action}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{item.reason}</p>
                      </div>
                      <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: colors.bg + '30', color: colors.text }}>
                        {item.riskLevel} risk
                      </span>
                    </div>
                    {item.metrics && item.metrics.length > 0 && (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                        {item.metrics.map((metric, mIdx) => {
                          const Icon = metricIcons[metric.name.toLowerCase() as keyof typeof metricIcons] || metricIcons.default
                          return (
                            <div key={mIdx} className="flex items-center gap-1.5 text-xs">
                              <Icon className="w-3.5 h-3.5" style={{ color: metric.status === 'danger' ? '#e99bbe' : '#f8c8dc' }} />
                              <span className="text-gray-600">{metric.name}:</span>
                              <span className="font-mono" style={{ color: metric.status === 'danger' ? '#e99bbe' : '#f8c8dc' }}>{metric.value}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {item.alternative && (
                      <div className="mt-3 p-2 rounded" style={{ backgroundColor: 'rgba(137, 204, 240, 0.1)' }}>
                        <p className="text-xs" style={{ color: '#5ba8d4' }}>
                          <span className="font-medium">Alternative:</span> {item.alternative}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Demo data generator
export function getDemoSuppressedActions(): SuppressedAction[] {
  return [
    {
      id: '1',
      action: 'High-intensity workout',
      reason: 'HRV below recovery threshold',
      riskLevel: 'high',
      alternative: 'Light walk or gentle yoga',
      metrics: [{ name: 'HRV', value: '28ms', status: 'danger' }, { name: 'RHR', value: '72bpm', status: 'warning' }],
    },
    {
      id: '2',
      action: 'Extended fasting window',
      reason: 'Sleep debt accumulated',
      riskLevel: 'medium',
      alternative: 'Standard 12h eating window',
      metrics: [{ name: 'Sleep', value: '-2.5h', status: 'warning' }],
    },
  ]
}

export default SafeguardsDrawer
