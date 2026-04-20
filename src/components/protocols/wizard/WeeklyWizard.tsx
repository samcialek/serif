import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SegmentedProgress } from '@/components/common'
import { ArrangeStep } from './ArrangeStep'
import { ReviewStep } from './ReviewStep'
import { LockInStep } from './LockInStep'
import {
  DEFAULT_ARRANGEMENT,
  buildAssignments,
  getUnassignedActivities,
  isFullyAssigned,
  evaluateConstraints,
  computePredictedMetrics,
} from './constraintEngine'
import type { WizardStep } from './wizardTypes'

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'arrange', label: 'Arrange' },
  { id: 'review', label: 'Review' },
  { id: 'lockin', label: 'Lock In' },
]

export function WeeklyWizard() {
  const [step, setStep] = useState<WizardStep>('arrange')
  const [arrangement, setArrangement] = useState<(string | null)[]>(Array(7).fill(null))
  const [locked, setLocked] = useState(false)

  const assignments = buildAssignments(arrangement)
  const unassigned = getUnassignedActivities(assignments)
  const allPlaced = isFullyAssigned(assignments)
  const constraints = evaluateConstraints(assignments)
  const metrics = computePredictedMetrics(assignments)

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  const segmentedSteps = STEPS.map((s, i) => ({
    label: s.label,
    completed: i < stepIndex || locked,
    active: i === stepIndex,
  }))

  const handleAssign = useCallback(
    (dayIndex: number, activityId: string | null) => {
      setArrangement((prev) => {
        const next = [...prev]
        // If dropping an activity that's already placed elsewhere, swap
        if (activityId) {
          const existingIdx = next.indexOf(activityId)
          if (existingIdx !== -1 && existingIdx !== dayIndex) {
            // Swap: displaced activity goes to the source slot
            next[existingIdx] = next[dayIndex]
          }
        }
        next[dayIndex] = activityId
        return next
      })
    },
    [],
  )

  const handleRemove = useCallback((dayIndex: number) => {
    setArrangement((prev) => {
      const next = [...prev]
      next[dayIndex] = null
      return next
    })
  }, [])

  const handleLoadDefault = useCallback(() => {
    setArrangement([...DEFAULT_ARRANGEMENT])
  }, [])

  const handleReset = useCallback(() => {
    setArrangement(Array(7).fill(null))
  }, [])

  const handleLockIn = useCallback(() => {
    setLocked(true)
  }, [])

  const handleUnlock = useCallback(() => {
    setLocked(false)
    setStep('arrange')
  }, [])

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex justify-center">
        <div className="w-72">
          <SegmentedProgress steps={segmentedSteps} size="md" showLabels />
        </div>
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
        >
          {step === 'arrange' && (
            <ArrangeStep
              assignments={assignments}
              unassigned={unassigned}
              allPlaced={allPlaced}
              onAssign={handleAssign}
              onRemove={handleRemove}
              onLoadDefault={handleLoadDefault}
              onReset={handleReset}
              onNext={() => setStep('review')}
            />
          )}

          {step === 'review' && (
            <ReviewStep
              assignments={assignments}
              constraints={constraints}
              metrics={metrics}
              onBack={() => setStep('arrange')}
              onNext={() => setStep('lockin')}
            />
          )}

          {step === 'lockin' && (
            <LockInStep
              assignments={assignments}
              metrics={metrics}
              locked={locked}
              onLockIn={handleLockIn}
              onBack={() => setStep('review')}
              onStartOver={handleUnlock}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
