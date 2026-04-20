import { motion, AnimatePresence } from 'framer-motion'
import {
  Dumbbell,
  Bike,
  Footprints,
  Moon,
  ChevronLeft,
  Lock,
  CheckCircle,
  Calendar,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { Card } from '@/components/common'
import { getDayLabel, getDayAbbrev } from './constraintEngine'
import type { DayAssignment, PredictedMetrics } from './wizardTypes'

// ============================================================================
// DAY TYPE CONFIG (matches ProtocolsView)
// ============================================================================

const DAY_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  hard: { label: 'Hard', color: 'text-rose-700', bgColor: 'bg-rose-50', icon: Dumbbell },
  moderate: { label: 'Moderate', color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Bike },
  easy: { label: 'Easy', color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: Footprints },
  rest: { label: 'Rest', color: 'text-slate-600', bgColor: 'bg-slate-100', icon: Moon },
}

// ============================================================================
// FINALIZED WEEK (matching WeeklyView style)
// ============================================================================

function FinalizedWeek({ assignments }: { assignments: DayAssignment[] }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Your 7-Day Training Plan</span>
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {assignments.map((a) => {
          const act = a.activity
          const config = act ? DAY_TYPE_CONFIG[act.dayType] : null
          const DayIcon = config?.icon
          return (
            <div
              key={a.dayIndex}
              className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50/50 transition-colors"
            >
              {/* Day */}
              <div className="w-32 flex-shrink-0">
                <div className="text-sm font-medium text-slate-800">{getDayLabel(a.dayIndex)}</div>
                <div className="text-[10px] text-slate-400">{getDayAbbrev(a.dayIndex)}</div>
              </div>

              {/* Day type badge */}
              <div className="w-24 flex-shrink-0">
                {config && DayIcon && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.color} ${config.bgColor}`}
                  >
                    <DayIcon className="w-2.5 h-2.5" />
                    {config.label}
                  </span>
                )}
              </div>

              {/* Training info */}
              <div className="flex-1 min-w-0">
                {act && act.duration > 0 ? (
                  <div>
                    <span className="text-sm font-medium text-slate-700">{act.label}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {act.duration} min | ~{act.estimatedTRIMP} TRIMP
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400 italic">Rest — mobility only</span>
                )}
              </div>

              {/* Running indicator */}
              <div className="w-20 flex-shrink-0 text-right">
                {act?.isRunning && (
                  <span className="text-[10px] text-slate-400">
                    <Footprints className="w-3 h-3 inline mr-1" />
                    Running
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ============================================================================
// SUMMARY STAT CARDS
// ============================================================================

function SummaryStatCards({ metrics }: { metrics: PredictedMetrics }) {
  const stats = [
    { label: 'Total Training', value: `${metrics.totalTrainingMin}`, unit: 'min', detail: `${metrics.hardDays} hard, ${metrics.easyDays} easy, ${metrics.moderateDays} moderate, ${metrics.restDays} rest` },
    { label: 'Zone 2 Volume', value: `${metrics.totalZone2Min}`, unit: 'min/wk', detail: `${metrics.zone2Pct}% of training is Zone 2` },
    { label: 'Running Volume', value: `${metrics.totalRunKm}`, unit: 'km', detail: 'Capped at 35 km/wk for iron protection' },
    { label: 'Est. ACWR', value: `${metrics.estimatedACWR}`, unit: 'ratio', detail: 'Target: 0.8–1.2 (from 0.93 current)' },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} padding="sm">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">{stat.label}</div>
          <div className="flex items-baseline mt-1">
            <span className="text-xl font-semibold font-mono text-slate-800">{stat.value}</span>
            <span className="text-xs text-slate-400 ml-1">{stat.unit}</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">{stat.detail}</div>
        </Card>
      ))}
    </div>
  )
}

// ============================================================================
// SUCCESS STATE
// ============================================================================

function SuccessState({ onStartOver }: { onStartOver: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="text-center py-8"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
      </motion.div>
      <h3 className="text-lg font-semibold text-slate-800">Plan Locked In</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Your weekly training plan has been set. Daily protocols will auto-adjust schedule blocks
        based on your arrangement. Check the "Today's Plan" tab for your updated daily view.
      </p>
      <button
        onClick={onStartOver}
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Plan Another Week
      </button>
    </motion.div>
  )
}

// ============================================================================
// LOCK IN STEP
// ============================================================================

interface LockInStepProps {
  assignments: DayAssignment[]
  metrics: PredictedMetrics
  locked: boolean
  onLockIn: () => void
  onBack: () => void
  onStartOver: () => void
}

export function LockInStep({
  assignments,
  metrics,
  locked,
  onLockIn,
  onBack,
  onStartOver,
}: LockInStepProps) {
  return (
    <div className="space-y-4">
      <AnimatePresence mode="wait">
        {locked ? (
          <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SuccessState onStartOver={onStartOver} />
            <div className="mt-4">
              <FinalizedWeek assignments={assignments} />
            </div>
            <div className="mt-4">
              <SummaryStatCards metrics={metrics} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Pre-lock confirmation view */}
            <Card padding="md">
              <div className="flex items-center gap-3 mb-2">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100">
                  <Sparkles className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Ready to Lock In?</h3>
                  <p className="text-[11px] text-slate-500">
                    Review your finalized plan below. Once locked, daily schedule blocks will be auto-adjusted to match this arrangement.
                  </p>
                </div>
              </div>
            </Card>

            <div className="mt-4">
              <FinalizedWeek assignments={assignments} />
            </div>
            <div className="mt-4">
              <SummaryStatCards metrics={metrics} />
            </div>

            {/* Load distribution mini-chart */}
            <div className="mt-4">
              <Card padding="md">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-3">
                  Load Distribution
                </div>
                <div className="flex items-center gap-2">
                  {assignments.map((a) => {
                    const act = a.activity
                    const heightMap: Record<string, string> = {
                      hard: 'h-20',
                      moderate: 'h-14',
                      easy: 'h-10',
                      rest: 'h-4',
                    }
                    const config = act ? DAY_TYPE_CONFIG[act.dayType] : null
                    return (
                      <div key={a.dayIndex} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className={`w-full rounded-t-md ${heightMap[act?.dayType ?? 'rest']} ${config?.bgColor ?? 'bg-slate-100'}`}
                          style={{ borderBottom: '3px solid #5ba8d4' }}
                        />
                        <span className="text-[9px] text-slate-400">
                          {getDayAbbrev(a.dayIndex)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  {Object.entries(DAY_TYPE_CONFIG).map(([key, cfg]) => (
                    <span key={key} className="flex items-center gap-1 text-[9px] text-slate-400">
                      <span className={`inline-block w-2 h-2 rounded-sm ${cfg.bgColor}`} />
                      {cfg.label}
                    </span>
                  ))}
                </div>
              </Card>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Review
              </button>
              <button
                onClick={onLockIn}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-all"
              >
                <Lock className="w-4 h-4" />
                Lock In Plan
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
