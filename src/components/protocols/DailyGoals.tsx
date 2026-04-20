import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Timer,
  CheckCircle2,
  Circle,
  Footprints,
  Dumbbell,
  Droplets,
  Apple,
  Moon,
  Heart,
  Activity,
  Zap
} from 'lucide-react'

interface GoalActionInput {
  id: string
  label: string
  category?: string
  isActive?: boolean
  impact?: number
  actionType?: 'cutoff' | 'duration' | 'target'
}

interface DailyGoalsProps {
  actions: GoalActionInput[]
  className?: string
}

interface GoalItem {
  id: string
  label: string
  type: 'duration' | 'target'
  icon: React.ElementType
  color: string
  bgColor: string
  impact: number
}

// Get appropriate icon based on label content
function getGoalIcon(label: string): { icon: React.ElementType; color: string; bgColor: string } {
  const lowerLabel = label.toLowerCase()

  if (lowerLabel.includes('walk') || lowerLabel.includes('step')) {
    return { icon: Footprints, color: 'text-green-600', bgColor: 'bg-green-50' }
  }
  if (lowerLabel.includes('zone 2') || lowerLabel.includes('cardio') || lowerLabel.includes('exercise')) {
    return { icon: Activity, color: 'text-blue-600', bgColor: 'bg-blue-50' }
  }
  if (lowerLabel.includes('strength') || lowerLabel.includes('workout') || lowerLabel.includes('resistance')) {
    return { icon: Dumbbell, color: 'text-purple-600', bgColor: 'bg-purple-50' }
  }
  if (lowerLabel.includes('water') || lowerLabel.includes('hydrat')) {
    return { icon: Droplets, color: 'text-cyan-600', bgColor: 'bg-cyan-50' }
  }
  if (lowerLabel.includes('protein') || lowerLabel.includes('fiber') || lowerLabel.includes('vegetable')) {
    return { icon: Apple, color: 'text-emerald-600', bgColor: 'bg-emerald-50' }
  }
  if (lowerLabel.includes('sleep') || lowerLabel.includes('bed')) {
    return { icon: Moon, color: 'text-indigo-600', bgColor: 'bg-indigo-50' }
  }
  if (lowerLabel.includes('hrv') || lowerLabel.includes('heart')) {
    return { icon: Heart, color: 'text-rose-600', bgColor: 'bg-rose-50' }
  }
  if (lowerLabel.includes('energy') || lowerLabel.includes('power')) {
    return { icon: Zap, color: 'text-amber-600', bgColor: 'bg-amber-50' }
  }

  // Default based on action type would be set by caller
  return { icon: Target, color: 'text-gray-600', bgColor: 'bg-gray-50' }
}

// Extract target and duration actions
function extractGoals(actions: GoalActionInput[]): GoalItem[] {
  return actions
    .filter(action =>
      action.actionType === 'target' || action.actionType === 'duration'
    )
    .map(action => {
      const { icon, color, bgColor } = getGoalIcon(action.label)
      return {
        id: action.id,
        label: action.label,
        type: action.actionType as 'duration' | 'target',
        icon,
        color,
        bgColor,
        impact: action.impact ?? 5,
      }
    })
    .sort((a, b) => b.impact - a.impact) // Sort by impact, highest first
}

export function DailyGoals({ actions, className = '' }: DailyGoalsProps) {
  const goals = extractGoals(actions)
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())

  // If no goals, don't render
  if (goals.length === 0) {
    return null
  }

  const toggleGoal = (id: string) => {
    setCompletedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const completedCount = completedIds.size
  const totalCount = goals.length
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // Separate by type for visual grouping
  const targetGoals = goals.filter(g => g.type === 'target')
  const durationGoals = goals.filter(g => g.type === 'duration')

  return (
    <div className={'bg-white rounded-xl p-4 border border-gray-100 ' + className}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Daily Goals</h3>
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-green-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-xs text-gray-500">{completedCount}/{totalCount}</span>
        </div>
      </div>

      <div className="space-y-2">
        {/* Duration goals (things you need to do for X time) */}
        {durationGoals.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-medium">
              <Timer className="w-3 h-3" />
              <span>Activities</span>
            </div>
            {durationGoals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                isCompleted={completedIds.has(goal.id)}
                onToggle={() => toggleGoal(goal.id)}
              />
            ))}
          </div>
        )}

        {/* Target goals (things you need to hit) */}
        {targetGoals.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 font-medium">
              <Target className="w-3 h-3" />
              <span>Targets</span>
            </div>
            {targetGoals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                isCompleted={completedIds.has(goal.id)}
                onToggle={() => toggleGoal(goal.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Individual goal row component
function GoalRow({
  goal,
  isCompleted,
  onToggle
}: {
  goal: GoalItem
  isCompleted: boolean
  onToggle: () => void
}) {
  const Icon = goal.icon

  return (
    <motion.button
      onClick={onToggle}
      className={`
        w-full flex items-center gap-3 p-2 rounded-lg text-left
        transition-colors duration-150
        ${isCompleted
          ? 'bg-green-50/50'
          : 'hover:bg-gray-50'
        }
      `}
      whileTap={{ scale: 0.98 }}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0">
        <AnimatePresence mode="wait">
          {isCompleted ? (
            <motion.div
              key="checked"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <CheckCircle2 className="w-5 h-5 text-green-500" />
            </motion.div>
          ) : (
            <motion.div
              key="unchecked"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Circle className="w-5 h-5 text-gray-300" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Icon */}
      <div className={`p-1.5 rounded-md ${goal.bgColor} flex-shrink-0`}>
        <Icon className={`w-3.5 h-3.5 ${goal.color}`} />
      </div>

      {/* Label */}
      <span className={`
        text-sm flex-1 truncate
        ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}
      `}>
        {goal.label}
      </span>

      {/* Impact indicator */}
      <div className="flex-shrink-0 flex gap-0.5">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full ${
              i < Math.ceil(goal.impact / 4)
                ? 'bg-primary-400'
                : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
    </motion.button>
  )
}

export default DailyGoals
