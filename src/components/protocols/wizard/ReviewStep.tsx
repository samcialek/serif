import { motion } from 'framer-motion'
import {
  Dumbbell,
  Bike,
  Footprints,
  Moon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Shield,
  Heart,
  Activity,
} from 'lucide-react'
import { Card } from '@/components/common'
import { getDayAbbrev, getWorstSeverity } from './constraintEngine'
import type { DayAssignment, ConstraintCheck, PredictedMetrics } from './wizardTypes'

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
// COMPACT WEEK GRID (read-only)
// ============================================================================

function CompactWeekGrid({ assignments }: { assignments: DayAssignment[] }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Your Arrangement
        </span>
      </div>
      <div className="p-3 flex gap-2">
        {assignments.map((a) => {
          const act = a.activity
          const config = act ? DAY_TYPE_CONFIG[act.dayType] : null
          const Icon = config?.icon
          return (
            <div
              key={a.dayIndex}
              className={`flex-1 rounded-lg p-2.5 text-center ${config?.bgColor ?? 'bg-slate-50'}`}
            >
              <div className="text-[10px] font-semibold text-slate-500 uppercase">
                {getDayAbbrev(a.dayIndex)}
              </div>
              {Icon && <Icon className={`w-4 h-4 mx-auto mt-1 ${config?.color}`} />}
              <div className={`text-[10px] font-medium mt-1 ${config?.color ?? 'text-slate-400'}`}>
                {act?.label ?? '—'}
              </div>
              {act && act.duration > 0 && (
                <div className="text-[9px] text-slate-400 mt-0.5">{act.duration}m</div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ============================================================================
// CONSTRAINT CHECK LIST
// ============================================================================

const SEVERITY_CONFIG = {
  error: {
    icon: AlertCircle,
    borderColor: 'border-l-rose-500',
    bgColor: 'bg-rose-50/60',
    textColor: 'text-rose-700',
    badgeColor: 'bg-rose-100 text-rose-700',
    badgeLabel: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-50/60',
    textColor: 'text-amber-700',
    badgeColor: 'bg-amber-100 text-amber-700',
    badgeLabel: 'Warning',
  },
  pass: {
    icon: CheckCircle,
    borderColor: 'border-l-emerald-500',
    bgColor: 'bg-emerald-50/60',
    textColor: 'text-emerald-700',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    badgeLabel: 'Pass',
  },
}

function ConstraintCheckList({ checks }: { checks: ConstraintCheck[] }) {
  const worst = getWorstSeverity(checks)
  const summaryConfig = SEVERITY_CONFIG[worst]
  const SummaryIcon = summaryConfig.icon

  return (
    <Card padding="none" className="overflow-hidden">
      <div
        className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2"
        style={{ backgroundColor: worst === 'pass' ? '#f0fdf4' : worst === 'error' ? '#fff1f2' : '#fffbeb' }}
      >
        <Shield className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Constraint Checks
        </span>
        <span className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${summaryConfig.badgeColor}`}>
          <SummaryIcon className="w-3 h-3" />
          {worst === 'pass' ? 'All Clear' : `${checks.filter((c) => c.severity !== 'pass').length} issue${checks.filter((c) => c.severity !== 'pass').length !== 1 ? 's' : ''}`}
        </span>
      </div>
      <div className="p-3 space-y-2">
        {checks.map((check, idx) => {
          const cfg = SEVERITY_CONFIG[check.severity]
          const Icon = cfg.icon
          return (
            <motion.div
              key={check.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`p-3 rounded-lg border-l-4 ${cfg.borderColor} ${cfg.bgColor}`}
            >
              <div className="flex items-start gap-2.5">
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.textColor}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${cfg.textColor}`}>{check.label}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${cfg.badgeColor}`}>
                      {cfg.badgeLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{check.message}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </Card>
  )
}

// ============================================================================
// ACWR GAUGE (horizontal SVG)
// ============================================================================

function ACWRGauge({ value }: { value: number }) {
  // Range: 0.5 to 1.5
  const min = 0.5
  const max = 1.5
  const clamped = Math.max(min, Math.min(max, value))
  const pct = ((clamped - min) / (max - min)) * 100

  // Green zone: 0.8–1.2
  const greenLeft = ((0.8 - min) / (max - min)) * 100
  const greenRight = ((1.2 - min) / (max - min)) * 100

  const isInRange = value >= 0.8 && value <= 1.2
  const markerColor = isInRange ? '#059669' : value > 1.2 ? '#e11d48' : '#d97706'

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Activity className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Estimated ACWR
        </span>
        <span className="ml-auto text-sm font-mono font-semibold" style={{ color: markerColor }}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="p-4">
        <svg viewBox="0 0 400 40" className="w-full h-10">
          {/* Background bar */}
          <rect x="0" y="14" width="400" height="12" rx="6" fill="#f1f5f9" />
          {/* Green zone */}
          <rect
            x={greenLeft * 4}
            y="14"
            width={(greenRight - greenLeft) * 4}
            height="12"
            rx="0"
            fill="#d1fae5"
          />
          {/* Green zone outline */}
          <rect
            x={greenLeft * 4}
            y="14"
            width={(greenRight - greenLeft) * 4}
            height="12"
            rx="0"
            fill="none"
            stroke="#6ee7b7"
            strokeWidth="1"
          />
          {/* Marker */}
          <circle cx={pct * 4} cy="20" r="7" fill={markerColor} />
          <circle cx={pct * 4} cy="20" r="4" fill="white" />
          {/* Tick labels */}
          <text x="0" y="38" fontSize="9" fill="#94a3b8" textAnchor="start">0.5</text>
          <text x={greenLeft * 4} y="10" fontSize="9" fill="#6ee7b7" textAnchor="middle">0.8</text>
          <text x={greenRight * 4} y="10" fontSize="9" fill="#6ee7b7" textAnchor="middle">1.2</text>
          <text x="400" y="38" fontSize="9" fill="#94a3b8" textAnchor="end">1.5</text>
        </svg>
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-block w-3 h-2 rounded-sm bg-emerald-100 border border-emerald-300" />
          <span className="text-[10px] text-slate-400">Target zone (0.8–1.2)</span>
          {isInRange ? (
            <span className="text-[10px] text-emerald-600 font-medium ml-auto">Within range</span>
          ) : (
            <span className="text-[10px] text-amber-600 font-medium ml-auto">
              {value < 0.8 ? 'Below target — undertraining' : 'Above target — overload risk'}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// WEEKLY LOAD CHART (bar chart with DAY_TYPE_CONFIG colors)
// ============================================================================

function WeeklyLoadChart({ assignments }: { assignments: DayAssignment[] }) {
  const maxTRIMP = Math.max(...assignments.map((a) => a.activity?.estimatedTRIMP ?? 0), 80)

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Heart className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Weekly Load Distribution
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-end gap-2 h-28">
          {assignments.map((a) => {
            const act = a.activity
            const trimp = act?.estimatedTRIMP ?? 0
            const heightPct = maxTRIMP > 0 ? (trimp / maxTRIMP) * 100 : 0
            const config = act ? DAY_TYPE_CONFIG[act.dayType] : null

            const bgColorMap: Record<string, string> = {
              hard: '#ffe4e6',
              moderate: '#fef3c7',
              easy: '#d1fae5',
              rest: '#f1f5f9',
            }
            const borderColorMap: Record<string, string> = {
              hard: '#fb7185',
              moderate: '#fbbf24',
              easy: '#34d399',
              rest: '#cbd5e1',
            }

            return (
              <div key={a.dayIndex} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] font-mono text-slate-400">{trimp}</div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(heightPct, 4)}%` }}
                  transition={{ duration: 0.3, delay: a.dayIndex * 0.05 }}
                  className="w-full rounded-t-md"
                  style={{
                    backgroundColor: bgColorMap[act?.dayType ?? 'rest'],
                    borderBottom: `3px solid ${borderColorMap[act?.dayType ?? 'rest']}`,
                  }}
                />
                <span className={`text-[9px] font-medium ${config?.color ?? 'text-slate-400'}`}>
                  {getDayAbbrev(a.dayIndex)}
                </span>
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3">
          {Object.entries(DAY_TYPE_CONFIG).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1 text-[9px] text-slate-400">
              <span className={`inline-block w-2 h-2 rounded-sm ${cfg.bgColor}`} />
              {cfg.label}
            </span>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// RECOVERY WINDOW CARDS
// ============================================================================

function RecoveryWindowCards({ assignments }: { assignments: DayAssignment[] }) {
  // Find recovery windows: rest or easy day after a hard/moderate day
  const windows: { afterDay: number; beforeDay: number; quality: 'good' | 'partial' | 'none' }[] = []

  for (let i = 0; i < assignments.length - 1; i++) {
    const curr = assignments[i].activity
    const next = assignments[i + 1].activity
    if (curr && (curr.dayType === 'hard' || curr.dayType === 'moderate')) {
      if (next?.dayType === 'rest') {
        windows.push({ afterDay: i, beforeDay: i + 1, quality: 'good' })
      } else if (next?.dayType === 'easy') {
        windows.push({ afterDay: i, beforeDay: i + 1, quality: 'partial' })
      } else {
        windows.push({ afterDay: i, beforeDay: i + 1, quality: 'none' })
      }
    }
  }

  if (windows.length === 0) return null

  const qualityConfig = {
    good: { label: 'Full Recovery', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
    partial: { label: 'Partial Recovery', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
    none: { label: 'No Recovery', color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
          Recovery Windows
        </span>
      </div>
      <div className="p-3 space-y-2">
        {windows.map((w, idx) => {
          const cfg = qualityConfig[w.quality]
          return (
            <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${cfg.borderColor} ${cfg.bgColor}`}>
              <div className="flex-1">
                <span className="text-xs text-slate-600">
                  After <strong>{getDayAbbrev(w.afterDay)}</strong> →{' '}
                  <strong>{getDayAbbrev(w.beforeDay)}</strong>
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} ${cfg.bgColor}`}>
                {cfg.label}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ============================================================================
// REVIEW STEP
// ============================================================================

interface ReviewStepProps {
  assignments: DayAssignment[]
  constraints: ConstraintCheck[]
  metrics: PredictedMetrics
  onBack: () => void
  onNext: () => void
}

export function ReviewStep({ assignments, constraints, metrics, onBack, onNext }: ReviewStepProps) {
  const worst = getWorstSeverity(constraints)
  const hasErrors = worst === 'error'

  return (
    <div className="space-y-4">
      {/* Compact week grid */}
      <CompactWeekGrid assignments={assignments} />

      {/* Constraint checks + ACWR gauge side by side */}
      <div className="grid grid-cols-2 gap-4">
        <ConstraintCheckList checks={constraints} />
        <ACWRGauge value={metrics.estimatedACWR} />
      </div>

      {/* Load chart + Recovery windows */}
      <div className="grid grid-cols-2 gap-4">
        <WeeklyLoadChart assignments={assignments} />
        <RecoveryWindowCards assignments={assignments} />
      </div>

      {/* Predicted metrics row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Training" value={`${metrics.totalTrainingMin}`} unit="min" />
        <MetricCard label="Zone 2 Volume" value={`${metrics.totalZone2Min}`} unit="min" detail={`${metrics.zone2Pct}% of total`} />
        <MetricCard label="Running Volume" value={`${metrics.totalRunKm}`} unit="km" detail="Capped for iron protection" />
        <MetricCard label="Est. TRIMP" value={`${metrics.totalTRIMP}`} unit="total" detail={`${metrics.hardDays} hard, ${metrics.easyDays} easy, ${metrics.restDays} rest`} />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Arrange
        </button>
        <div className="flex items-center gap-3">
          {hasErrors && (
            <span className="text-xs text-rose-600 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Fix errors before proceeding
            </span>
          )}
          <button
            onClick={onNext}
            disabled={hasErrors}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all
              ${
                hasErrors
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-800 text-white hover:bg-slate-700 shadow-sm'
              }
            `}
          >
            Lock In Plan
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SMALL METRIC CARD
// ============================================================================

function MetricCard({
  label,
  value,
  unit,
  detail,
}: {
  label: string
  value: string
  unit: string
  detail?: string
}) {
  return (
    <Card padding="sm">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline mt-1">
        <span className="text-xl font-semibold font-mono text-slate-800">{value}</span>
        <span className="text-xs text-slate-400 ml-1">{unit}</span>
      </div>
      {detail && <div className="text-[10px] text-slate-400 mt-1">{detail}</div>}
    </Card>
  )
}
