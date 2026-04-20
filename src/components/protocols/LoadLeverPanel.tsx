import { ArrowDown, ArrowUp, AlertTriangle, Clock } from 'lucide-react'
import type { LoadLever, TimeConstant } from '@/types'

const TIME_CONSTANT_CONFIG: Record<TimeConstant, { label: string; color: string; bgColor: string }> = {
  immediate: { label: 'Immediate', color: 'text-rose-700', bgColor: 'bg-rose-50' },
  days: { label: 'Days', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  weeks: { label: 'Weeks', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  months: { label: 'Months', color: 'text-violet-700', bgColor: 'bg-violet-50' },
}

const CATEGORY_COLORS: Record<string, string> = {
  sleep: '#b8aadd',
  training: '#5ba8d4',
  recovery: '#e99bbe',
  nutrition: '#f59e0b',
  medical: '#ef4444',
}

interface LoadLeverPanelProps {
  levers: LoadLever[]
  loadLabel: string
  decreaseIsGood?: boolean
}

export function LoadLeverPanel({ levers, loadLabel, decreaseIsGood = true }: LoadLeverPanelProps) {
  if (!levers || levers.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
        What Moves {loadLabel}
      </div>
      <div className="space-y-2">
        {levers.map((lever) => {
          const tcConfig = TIME_CONSTANT_CONFIG[lever.timeConstant]
          const isGood =
            (decreaseIsGood && lever.effect.direction === 'decrease') ||
            (!decreaseIsGood && lever.effect.direction === 'increase')
          const ArrowIcon = lever.effect.direction === 'decrease' ? ArrowDown : ArrowUp
          const arrowColor = isGood ? 'text-emerald-600' : 'text-rose-600'
          const effectBg = isGood ? 'bg-emerald-50' : 'bg-rose-50'

          return (
            <div
              key={lever.id}
              className="p-2.5 bg-slate-50 rounded-lg border border-slate-100"
            >
              <div className="flex items-start gap-2.5">
                {/* Category dot */}
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[lever.category] ?? '#94a3b8' }}
                />

                <div className="flex-1 min-w-0">
                  {/* Action + effect */}
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700">
                      {lever.action}
                    </span>
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${effectBg} flex-shrink-0`}>
                      <ArrowIcon className={`w-2.5 h-2.5 ${arrowColor}`} />
                      <span className={`text-[10px] font-semibold ${arrowColor}`}>
                        {lever.effect.magnitude} {lever.effect.unit}
                      </span>
                    </div>
                  </div>

                  {/* Time constant + evidence */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${tcConfig.color} ${tcConfig.bgColor}`}
                    >
                      <Clock className="w-2 h-2" />
                      {tcConfig.label}
                    </span>
                    <span className="text-[9px] text-slate-400 truncate">
                      {lever.evidenceSource}
                    </span>
                  </div>

                  {/* Prerequisites warning */}
                  {lever.prerequisites && lever.prerequisites.length > 0 && (
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-600">
                      <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                      Requires: {lever.prerequisites.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
