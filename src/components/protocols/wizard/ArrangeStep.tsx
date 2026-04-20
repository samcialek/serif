import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Dumbbell,
  Bike,
  Footprints,
  Moon,
  RotateCcw,
  ListRestart,
  ChevronRight,
  GripVertical,
  X,
} from 'lucide-react'
import { Card } from '@/components/common'
import { getDayLabel, getDayAbbrev } from './constraintEngine'
import type { MutableActivity, DayAssignment } from './wizardTypes'

// ============================================================================
// DAY TYPE CONFIG (matches ProtocolsView)
// ============================================================================

const DAY_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; icon: React.ElementType }
> = {
  hard: { label: 'Hard', color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', icon: Dumbbell },
  moderate: { label: 'Moderate', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: Bike },
  easy: { label: 'Easy', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200', icon: Footprints },
  rest: { label: 'Rest', color: 'text-slate-600', bgColor: 'bg-slate-100', borderColor: 'border-slate-200', icon: Moon },
}

// ============================================================================
// DRAGGABLE ACTIVITY CARD
// ============================================================================

function DraggableActivityCard({
  activity,
  isInPool,
}: {
  activity: MutableActivity
  isInPool?: boolean
}) {
  const config = DAY_TYPE_CONFIG[activity.dayType]
  const Icon = config.icon

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', activity.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing select-none transition-all
        ${config.bgColor} ${config.borderColor}
        ${isInPool ? 'hover:shadow-md hover:scale-[1.02]' : ''}
      `}
    >
      {isInPool && <GripVertical className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
      <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${config.color}`}>{activity.label}</div>
        {activity.duration > 0 && (
          <div className="text-[10px] text-slate-400">
            {activity.duration} min | ~{activity.estimatedTRIMP} TRIMP
          </div>
        )}
      </div>
      <span
        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${config.color} ${config.bgColor}`}
      >
        {config.label}
      </span>
    </div>
  )
}

// ============================================================================
// DAY DROP SLOT
// ============================================================================

function DayDropSlot({
  dayIndex,
  activity,
  onDrop,
  onRemove,
}: {
  dayIndex: number
  activity: MutableActivity | null
  onDrop: (dayIndex: number, activityId: string) => void
  onRemove: (dayIndex: number) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const activityId = e.dataTransfer.getData('text/plain')
      if (activityId) {
        onDrop(dayIndex, activityId)
      }
    },
    [dayIndex, onDrop],
  )

  const config = activity ? DAY_TYPE_CONFIG[activity.dayType] : null
  const Icon = config?.icon

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-lg border-2 border-dashed transition-all min-h-[80px] flex flex-col
        ${isDragOver ? 'border-blue-400 bg-blue-50/50 scale-[1.02]' : ''}
        ${activity ? 'border-solid ' + (config?.borderColor ?? 'border-slate-200') : 'border-slate-200'}
        ${!activity && !isDragOver ? 'bg-slate-50/50' : ''}
      `}
    >
      {/* Day label */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {getDayAbbrev(dayIndex)}
          </span>
          <span className="text-[10px] text-slate-400 ml-1.5">{getDayLabel(dayIndex)}</span>
        </div>
        {activity && (
          <button
            onClick={() => onRemove(dayIndex)}
            className="p-0.5 rounded hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 transition-colors"
            title="Remove activity"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Content area */}
      <div className="px-3 pb-2.5 flex-1 flex items-center">
        {activity ? (
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', activity.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md cursor-grab active:cursor-grabbing ${config?.bgColor}`}
          >
            {Icon && <Icon className={`w-3.5 h-3.5 ${config?.color}`} />}
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-semibold ${config?.color}`}>{activity.label}</div>
              {activity.duration > 0 && (
                <div className="text-[10px] text-slate-400">{activity.duration} min</div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full text-center text-[10px] text-slate-400 italic py-2">
            {isDragOver ? 'Drop here' : 'Drag activity here'}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// ARRANGE STEP
// ============================================================================

interface ArrangeStepProps {
  assignments: DayAssignment[]
  unassigned: MutableActivity[]
  allPlaced: boolean
  onAssign: (dayIndex: number, activityId: string | null) => void
  onRemove: (dayIndex: number) => void
  onLoadDefault: () => void
  onReset: () => void
  onNext: () => void
}

export function ArrangeStep({
  assignments,
  unassigned,
  allPlaced,
  onAssign,
  onRemove,
  onLoadDefault,
  onReset,
  onNext,
}: ArrangeStepProps) {
  return (
    <div className="space-y-4">
      {/* Instructions */}
      <Card padding="sm">
        <p className="text-sm text-slate-600">
          Drag your 7 training activities onto the calendar below. The training types and durations are
          fixed — only <strong>day placement</strong> is mutable. Drop onto an occupied slot to swap.
        </p>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* Activity Pool — left sidebar */}
        <div className="col-span-4">
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Activity Pool
              </span>
              <span className="text-[10px] text-slate-400">{unassigned.length} remaining</span>
            </div>
            <div className="p-3 space-y-2">
              {unassigned.length > 0 ? (
                unassigned.map((activity) => (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    <DraggableActivityCard activity={activity} isInPool />
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-6">
                  <div className="text-sm font-medium text-emerald-700">All placed!</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Every activity has been assigned to a day
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-3 pb-3 flex gap-2">
              <button
                onClick={onLoadDefault}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <ListRestart className="w-3.5 h-3.5" />
                Use Default
              </button>
              <button
                onClick={onReset}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          </Card>
        </div>

        {/* Week Calendar Grid — right */}
        <div className="col-span-8">
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Weekly Calendar
              </span>
            </div>
            <div className="p-3 grid grid-cols-7 gap-2">
              {assignments.map((assignment) => (
                <DayDropSlot
                  key={assignment.dayIndex}
                  dayIndex={assignment.dayIndex}
                  activity={assignment.activity}
                  onDrop={onAssign}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Next button */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!allPlaced}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all
            ${
              allPlaced
                ? 'bg-slate-800 text-white hover:bg-slate-700 shadow-sm'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }
          `}
        >
          Review Plan
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
