import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, Coffee, Utensils, Moon, Dumbbell, Zap, Sun,
  TrendingUp, Activity, Target, AlertCircle
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { Insight, InsightVariableType } from '@/types'

// ============================================================================
// Types
// ============================================================================

interface TimelineActionInput {
  id: string
  label: string
  category?: string
  isActive?: boolean
  impact?: number
  time?: string
  actionType?: 'cutoff' | 'duration' | 'target'
  // Duration-specific
  startTime?: string
  endTime?: string
  durationMinutes?: number
  // Link to insight
  linkedInsightId?: string
}

interface ProtocolTimelineProps {
  protocolName?: string
  actions: TimelineActionInput[]
  insights?: Insight[]
  className?: string
}

interface TimelineEvent {
  id: string
  label: string
  shortLabel: string
  type: 'duration' | 'point-in-time'
  category: string
  startHour: number
  endHour?: number
  time?: string
  isActive: boolean
  impact: number
  linkedInsight?: Insight
  variableType?: InsightVariableType
  color: string
  icon: React.ElementType
}

interface TooltipData {
  event: TimelineEvent
  x: number
  y: number
}

// ============================================================================
// Constants
// ============================================================================

// Timeline configuration
const TIMELINE_START = 6   // 6 AM
const TIMELINE_END = 24    // Midnight
const TOTAL_HOURS = TIMELINE_END - TIMELINE_START

// Category configuration
const CATEGORY_CONFIG: Record<string, { label: string; order: number; color: string }> = {
  sleep: { label: 'Sleep', order: 1, color: '#8B5CF6' },      // Violet
  metabolic: { label: 'Metabolic', order: 2, color: '#F59E0B' }, // Amber
  activity: { label: 'Activity', order: 3, color: '#3B82F6' },   // Blue
  nutrition: { label: 'Nutrition', order: 4, color: '#10B981' }, // Emerald
  recovery: { label: 'Recovery', order: 5, color: '#EC4899' },   // Pink
  cardio: { label: 'Cardio', order: 6, color: '#EF4444' },       // Red
  cognitive: { label: 'Cognitive', order: 7, color: '#6366F1' }, // Indigo
  stress: { label: 'Stress', order: 8, color: '#14B8A6' },       // Teal
}

// Variable type colors and labels
const VARIABLE_TYPE_CONFIG: Record<InsightVariableType, { label: string; color: string; bgColor: string }> = {
  outcome: { label: 'Outcome', color: '#10B981', bgColor: 'bg-emerald-50' },
  load: { label: 'Load', color: '#F59E0B', bgColor: 'bg-amber-50' },
  marker: { label: 'Marker', color: '#8B5CF6', bgColor: 'bg-violet-50' },
}

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  caffeine: Coffee,
  coffee: Coffee,
  meal: Utensils,
  eating: Utensils,
  food: Utensils,
  sleep: Moon,
  bed: Moon,
  bedtime: Moon,
  exercise: Dumbbell,
  workout: Dumbbell,
  strength: Dumbbell,
  zone: Zap,
  cardio: Zap,
  screen: Moon,
  wake: Sun,
  morning: Sun,
  walk: Activity,
}

// ============================================================================
// Utility Functions
// ============================================================================

function parseTimeToHour(timeStr: string): number {
  // Handle "HH:MM" format
  const militaryMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (militaryMatch) {
    return parseInt(militaryMatch[1]) + parseInt(militaryMatch[2]) / 60
  }

  // Handle "H:MM AM/PM" format
  const ampmMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1])
    const minute = parseInt(ampmMatch[2])
    const period = ampmMatch[3].toUpperCase()
    if (period === 'PM' && hour !== 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0
    return hour + minute / 60
  }

  return 12 // Default to noon
}

function formatTimeShort(hour: number): string {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return m === 0 ? `${displayHour}${period}` : `${displayHour}:${m.toString().padStart(2, '0')}${period}`
}

function getShortLabel(label: string): string {
  if (label.toLowerCase().includes('caffeine')) return 'Caffeine'
  if (label.toLowerCase().includes('last meal')) return 'Last Meal'
  if (label.toLowerCase().includes('eating window')) return 'Eating'
  if (label.toLowerCase().includes('bed')) return 'Bedtime'
  if (label.toLowerCase().includes('workout') || label.toLowerCase().includes('exercise')) return 'Workout'
  if (label.toLowerCase().includes('zone 2')) return 'Zone 2'
  if (label.toLowerCase().includes('screen')) return 'Screens'
  if (label.toLowerCase().includes('walk')) return 'Walk'
  if (label.toLowerCase().includes('sleep')) return 'Sleep'
  return label.split(' ').slice(0, 2).join(' ')
}

function getIcon(label: string): React.ElementType {
  const lowerLabel = label.toLowerCase()
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (lowerLabel.includes(key)) return icon
  }
  return Clock
}

function getCategoryColor(category: string): string {
  return CATEGORY_CONFIG[category]?.color || '#6B7280'
}

// ============================================================================
// Data Processing
// ============================================================================

function processActions(
  actions: TimelineActionInput[],
  insights?: Insight[]
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const insightMap = new Map(insights?.map(i => [i.id, i]) || [])

  for (const action of actions) {
    const linkedInsight = action.linkedInsightId
      ? insightMap.get(action.linkedInsightId)
      : undefined

    const category = action.category || 'sleep'
    const color = getCategoryColor(category)
    const icon = getIcon(action.label)

    if (action.actionType === 'cutoff' && action.time) {
      // Point-in-time event
      events.push({
        id: action.id,
        label: action.label,
        shortLabel: getShortLabel(action.label),
        type: 'point-in-time',
        category,
        startHour: parseTimeToHour(action.time),
        time: action.time,
        isActive: action.isActive ?? true,
        impact: action.impact || 0,
        linkedInsight,
        variableType: linkedInsight?.variableType,
        color,
        icon,
      })
    } else if (action.actionType === 'duration' && action.startTime && action.endTime) {
      // Duration event with explicit times
      events.push({
        id: action.id,
        label: action.label,
        shortLabel: getShortLabel(action.label),
        type: 'duration',
        category,
        startHour: parseTimeToHour(action.startTime),
        endHour: parseTimeToHour(action.endTime),
        isActive: action.isActive ?? true,
        impact: action.impact || 0,
        linkedInsight,
        variableType: linkedInsight?.variableType,
        color,
        icon,
      })
    }
  }

  return events.sort((a, b) => a.startHour - b.startHour)
}

// Add default duration events based on protocol context
function addDefaultDurations(events: TimelineEvent[]): TimelineEvent[] {
  const result = [...events]

  // Find bedtime cutoff to infer sleep window
  const bedtimeCutoff = events.find(e =>
    e.type === 'point-in-time' &&
    (e.shortLabel.toLowerCase().includes('bed') || e.label.toLowerCase().includes('bed'))
  )

  if (bedtimeCutoff) {
    // Add sleep duration bar (bedtime to ~6:30 AM next day)
    result.push({
      id: 'sleep-window',
      label: 'Sleep Window',
      shortLabel: 'Sleep',
      type: 'duration',
      category: 'sleep',
      startHour: bedtimeCutoff.startHour,
      endHour: 24, // To midnight (visual end)
      isActive: true,
      impact: bedtimeCutoff.impact,
      linkedInsight: bedtimeCutoff.linkedInsight,
      variableType: bedtimeCutoff.variableType,
      color: '#8B5CF6',
      icon: Moon,
    })
  }

  // Find meal cutoff to infer eating window
  const lastMealCutoff = events.find(e =>
    e.type === 'point-in-time' &&
    (e.shortLabel.toLowerCase().includes('meal') || e.label.toLowerCase().includes('meal'))
  )

  if (lastMealCutoff) {
    // Add eating window (7:30 AM to last meal time)
    result.push({
      id: 'eating-window',
      label: 'Eating Window',
      shortLabel: 'Eating',
      type: 'duration',
      category: 'metabolic',
      startHour: 7.5, // 7:30 AM
      endHour: lastMealCutoff.startHour,
      isActive: true,
      impact: lastMealCutoff.impact,
      linkedInsight: lastMealCutoff.linkedInsight,
      variableType: lastMealCutoff.variableType,
      color: '#F59E0B',
      icon: Utensils,
    })
  }

  return result
}

// Group events by category
function groupByCategory(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>()

  for (const event of events) {
    const existing = groups.get(event.category) || []
    existing.push(event)
    groups.set(event.category, existing)
  }

  // Sort groups by category order
  return new Map(
    [...groups.entries()].sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a[0]]?.order || 99
      const orderB = CATEGORY_CONFIG[b[0]]?.order || 99
      return orderA - orderB
    })
  )
}

// ============================================================================
// Tooltip Component
// ============================================================================

function TimelineTooltip({ event, x, y }: TooltipData) {
  const Icon = event.icon
  const vtConfig = event.variableType ? VARIABLE_TYPE_CONFIG[event.variableType] : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 5 }}
      className="fixed z-50 pointer-events-none"
      style={{
        left: Math.min(x, window.innerWidth - 320),
        top: y + 10,
      }}
    >
      <div className="bg-slate-900 text-white rounded-lg shadow-xl p-3 w-72">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-1.5 rounded"
            style={{ backgroundColor: event.color + '30' }}
          >
            <Icon className="w-4 h-4" style={{ color: event.color }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{event.label}</p>
            {event.time && (
              <p className="text-xs text-gray-400">
                {event.type === 'point-in-time' ? `Cutoff: ${event.time}` : `${formatTimeShort(event.startHour)} - ${formatTimeShort(event.endHour!)}`}
              </p>
            )}
          </div>
        </div>

        {/* Variable Type Badge */}
        {vtConfig && (
          <div className="mb-2">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: vtConfig.color + '20', color: vtConfig.color }}
            >
              {event.variableType === 'outcome' && <Target className="w-3 h-3" />}
              {event.variableType === 'load' && <TrendingUp className="w-3 h-3" />}
              {event.variableType === 'marker' && <Activity className="w-3 h-3" />}
              Affects {vtConfig.label}
            </div>
          </div>
        )}

        {/* Linked Insight Details */}
        {event.linkedInsight && (
          <div className="border-t border-white/10 pt-2 mt-2">
            <p className="text-xs text-gray-300 mb-1">
              <span className="text-gray-500">Linked insight:</span> {event.linkedInsight.title}
            </p>
            {event.linkedInsight.explanation && (
              <p className="text-xs text-emerald-400">
                Effect: {event.linkedInsight.explanation}
              </p>
            )}
            {event.linkedInsight.causalParams && (
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className="text-gray-400">
                  θ = {event.linkedInsight.causalParams.theta.displayValue}
                </span>
                <span className="text-gray-400">
                  n = {event.linkedInsight.causalParams.observations}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Impact */}
        {event.impact > 0 && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
            <span className="text-xs text-gray-400">Impact:</span>
            <span className="text-xs font-medium text-emerald-400">
              +{(event.impact * 100).toFixed(0)}% contribution
            </span>
          </div>
        )}

        {!event.isActive && (
          <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/10 text-amber-400">
            <AlertCircle className="w-3 h-3" />
            <span className="text-xs">Currently inactive</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ProtocolTimeline({
  protocolName = 'Daily Protocol',
  actions,
  insights,
  className = ''
}: ProtocolTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  // Process and group events
  const events = useMemo(() => {
    const processed = processActions(actions, insights)
    const withDefaults = addDefaultDurations(processed)
    return withDefaults
  }, [actions, insights])

  const groupedEvents = useMemo(() => groupByCategory(events), [events])

  // Calculate position percentage
  const getPositionPercent = (hour: number) => {
    return ((Math.max(TIMELINE_START, Math.min(TIMELINE_END, hour)) - TIMELINE_START) / TOTAL_HOURS) * 100
  }

  // Handle hover
  const handleMouseEnter = (event: TimelineEvent, e: React.MouseEvent) => {
    setTooltip({ event, x: e.clientX, y: e.clientY })
  }

  const handleMouseLeave = () => {
    setTooltip(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltip) {
      setTooltip({ ...tooltip, x: e.clientX, y: e.clientY })
    }
  }

  // Generate hour markers
  const hourMarkers = []
  for (let h = TIMELINE_START; h <= TIMELINE_END; h += 3) {
    hourMarkers.push(h)
  }

  if (events.length === 0) {
    return null
  }

  return (
    <div className={cn('bg-white rounded-xl border border-slate-200 overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">{protocolName}</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <div className="w-4 h-1.5 rounded bg-slate-400" />
              Duration
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              Cutoff
            </span>
          </div>
        </div>
      </div>

      {/* Timeline Content */}
      <div className="p-4">
        {/* Hour Labels */}
        <div className="relative h-6 mb-2 ml-24">
          {hourMarkers.map(hour => (
            <div
              key={hour}
              className="absolute transform -translate-x-1/2 text-[10px] text-slate-400 font-medium"
              style={{ left: `${getPositionPercent(hour)}%` }}
            >
              {hour === 12 ? '12PM' : hour < 12 ? `${hour}AM` : hour === 24 ? '12AM' : `${hour - 12}PM`}
            </div>
          ))}
        </div>

        {/* Category Rows */}
        <div className="space-y-1">
          {Array.from(groupedEvents.entries()).map(([category, categoryEvents]) => {
            const config = CATEGORY_CONFIG[category] || { label: category, color: '#6B7280' }
            const durationEvents = categoryEvents.filter(e => e.type === 'duration')
            const pointEvents = categoryEvents.filter(e => e.type === 'point-in-time')

            return (
              <div key={category} className="flex items-center h-10">
                {/* Category Label */}
                <div className="w-24 flex-shrink-0 pr-2">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: config.color + '15',
                      color: config.color,
                    }}
                  >
                    {config.label}
                  </span>
                </div>

                {/* Timeline Track */}
                <div className="flex-1 relative h-full">
                  {/* Background track */}
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2" />

                  {/* Hour tick marks */}
                  {hourMarkers.map(hour => (
                    <div
                      key={hour}
                      className="absolute top-1/2 w-px h-2 bg-slate-200 -translate-y-1/2"
                      style={{ left: `${getPositionPercent(hour)}%` }}
                    />
                  ))}

                  {/* Duration bars */}
                  {durationEvents.map((event, idx) => {
                    const startPct = getPositionPercent(event.startHour)
                    const endPct = getPositionPercent(event.endHour || event.startHour + 1)
                    const width = Math.max(endPct - startPct, 2)

                    return (
                      <motion.div
                        key={event.id}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 h-5 rounded cursor-pointer transition-all',
                          !event.isActive && 'opacity-40'
                        )}
                        style={{
                          left: `${startPct}%`,
                          width: `${width}%`,
                          backgroundColor: event.color + '25',
                          border: `1.5px solid ${event.color}`,
                        }}
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        onMouseEnter={(e) => handleMouseEnter(event, e)}
                        onMouseLeave={handleMouseLeave}
                        onMouseMove={handleMouseMove}
                        whileHover={{
                          scale: 1.02,
                          boxShadow: `0 2px 8px ${event.color}40`,
                        }}
                      >
                        {/* Duration label (if wide enough) */}
                        {width > 8 && (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-[10px] font-medium truncate px-1"
                            style={{ color: event.color }}
                          >
                            {event.shortLabel}
                          </span>
                        )}
                      </motion.div>
                    )
                  })}

                  {/* Point-in-time markers */}
                  {pointEvents.map((event, idx) => {
                    const Icon = event.icon
                    const pos = getPositionPercent(event.startHour)

                    return (
                      <motion.div
                        key={event.id}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
                        style={{ left: `${pos}%` }}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + idx * 0.05 }}
                      >
                        <div
                          className={cn(
                            'relative cursor-pointer group',
                            !event.isActive && 'opacity-40'
                          )}
                          onMouseEnter={(e) => handleMouseEnter(event, e)}
                          onMouseLeave={handleMouseLeave}
                          onMouseMove={handleMouseMove}
                        >
                          {/* Marker circle */}
                          <motion.div
                            className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm border-2 border-white"
                            style={{ backgroundColor: event.color }}
                            whileHover={{ scale: 1.15, boxShadow: `0 2px 8px ${event.color}60` }}
                          >
                            <Icon className="w-3.5 h-3.5 text-white" />
                          </motion.div>

                          {/* Time label below */}
                          <div
                            className="absolute top-full mt-0.5 left-1/2 -translate-x-1/2 text-[9px] font-medium whitespace-nowrap"
                            style={{ color: event.color }}
                          >
                            {formatTimeShort(event.startHour)}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-500" />
              <span>Outcome (daily)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              <span>Load (accumulated)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-violet-500" />
              <span>Marker (biomarker)</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && <TimelineTooltip {...tooltip} />}
      </AnimatePresence>
    </div>
  )
}

export default ProtocolTimeline
