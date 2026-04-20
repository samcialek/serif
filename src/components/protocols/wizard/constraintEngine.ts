// ============================================================================
// CONSTRAINT ENGINE — Pure functions for the Weekly Protocol Wizard
// ============================================================================

import type {
  MutableActivity,
  DayAssignment,
  ConstraintCheck,
  PredictedMetrics,
} from './wizardTypes'

// ============================================================================
// DEFAULT ACTIVITIES — extracted from weeklyPlan
// ============================================================================

export const MUTABLE_ACTIVITIES: MutableActivity[] = [
  { id: 'z2-run', label: 'Zone 2 Run', dayType: 'easy', duration: 50, isRunning: true, estimatedTRIMP: 40 },
  { id: 'z2-bike', label: 'Zone 2 Bike', dayType: 'moderate', duration: 60, isRunning: false, estimatedTRIMP: 45 },
  { id: 'rest-1', label: 'Rest Day', dayType: 'rest', duration: 0, isRunning: false, estimatedTRIMP: 0 },
  { id: 'tempo-run', label: 'Tempo Run', dayType: 'hard', duration: 40, isRunning: true, estimatedTRIMP: 75 },
  { id: 'easy-z2-run', label: 'Easy Zone 2 Run', dayType: 'easy', duration: 35, isRunning: true, estimatedTRIMP: 30 },
  { id: 'z2-bike-long', label: 'Zone 2 Bike (Long)', dayType: 'moderate', duration: 75, isRunning: false, estimatedTRIMP: 55 },
  { id: 'rest-2', label: 'Rest Day', dayType: 'rest', duration: 0, isRunning: false, estimatedTRIMP: 0 },
]

// Original weeklyPlan order (Sun–Sat): rest, z2-run, z2-bike, rest, tempo-run, easy-z2-run, z2-bike-long
export const DEFAULT_ARRANGEMENT: (string | null)[] = [
  'rest-1',       // Sun
  'z2-run',       // Mon
  'z2-bike',      // Tue
  'rest-2',       // Wed
  'tempo-run',    // Thu
  'easy-z2-run',  // Fri
  'z2-bike-long', // Sat
]

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function getDayLabel(index: number): string {
  return DAY_LABELS[index] ?? ''
}

export function getDayAbbrev(index: number): string {
  return DAY_LABELS[index]?.slice(0, 3) ?? ''
}

// ============================================================================
// BUILD ASSIGNMENTS from arrangement
// ============================================================================

export function buildAssignments(arrangement: (string | null)[]): DayAssignment[] {
  return arrangement.map((activityId, dayIndex) => ({
    dayIndex,
    activity: activityId ? MUTABLE_ACTIVITIES.find((a) => a.id === activityId) ?? null : null,
  }))
}

export function getUnassignedActivities(assignments: DayAssignment[]): MutableActivity[] {
  const assignedIds = new Set(assignments.map((a) => a.activity?.id).filter(Boolean))
  return MUTABLE_ACTIVITIES.filter((a) => !assignedIds.has(a.id))
}

export function isFullyAssigned(assignments: DayAssignment[]): boolean {
  return assignments.every((a) => a.activity !== null)
}

// ============================================================================
// CONSTRAINT EVALUATION
// ============================================================================

export function evaluateConstraints(assignments: DayAssignment[]): ConstraintCheck[] {
  const checks: ConstraintCheck[] = []
  const activities = assignments.map((a) => a.activity)

  // 1. Back-to-back hard days
  for (let i = 0; i < activities.length - 1; i++) {
    const curr = activities[i]
    const next = activities[i + 1]
    if (curr && next) {
      const currHard = curr.dayType === 'hard'
      const nextHard = next.dayType === 'hard'
      if (currHard && nextHard) {
        checks.push({
          id: `back-to-back-hard-${i}`,
          label: 'Back-to-back hard days',
          severity: 'error',
          message: `${getDayLabel(i)} and ${getDayLabel(i + 1)} are both hard sessions. This significantly increases injury and overtraining risk.`,
        })
      }
    }
  }

  // 2. Adjacent running days (iron risk)
  for (let i = 0; i < activities.length - 1; i++) {
    const curr = activities[i]
    const next = activities[i + 1]
    if (curr && next && curr.isRunning && next.isRunning) {
      checks.push({
        id: `adjacent-run-${i}`,
        label: 'Adjacent running days',
        severity: 'warning',
        message: `${getDayLabel(i)} and ${getDayLabel(i + 1)} are both running sessions. With iron at 37 mcg/dL, consecutive foot-strike hemolysis days accelerate iron depletion.`,
      })
    }
  }

  // 3. No rest before hard session
  for (let i = 1; i < activities.length; i++) {
    const curr = activities[i]
    const prev = activities[i - 1]
    if (curr && curr.dayType === 'hard' && prev && prev.dayType !== 'rest') {
      checks.push({
        id: `no-rest-before-hard-${i}`,
        label: 'No rest before hard session',
        severity: 'warning',
        message: `${getDayLabel(i)} is a hard session but ${getDayLabel(i - 1)} is not a rest day. Recovery may be suboptimal for peak performance.`,
      })
    }
  }

  // 4. No recovery after hard session
  for (let i = 0; i < activities.length - 1; i++) {
    const curr = activities[i]
    const next = activities[i + 1]
    if (curr && curr.dayType === 'hard' && next && next.dayType === 'hard') {
      // Already caught by rule 1, skip duplicate
    } else if (
      curr &&
      curr.dayType === 'hard' &&
      next &&
      next.dayType !== 'rest' &&
      next.dayType !== 'easy'
    ) {
      checks.push({
        id: `no-recovery-after-hard-${i}`,
        label: 'No recovery after hard session',
        severity: 'warning',
        message: `${getDayLabel(i)} is a hard session but ${getDayLabel(i + 1)} is a ${next.dayType} day. HRV expects 24-48h recovery after hard efforts.`,
      })
    }
  }

  // 5. 4+ consecutive training days
  let consecutive = 0
  let streakStart = 0
  for (let i = 0; i < activities.length; i++) {
    if (activities[i] && activities[i]!.dayType !== 'rest') {
      if (consecutive === 0) streakStart = i
      consecutive++
      if (consecutive >= 4) {
        checks.push({
          id: `consecutive-training-${streakStart}-${i}`,
          label: '4+ consecutive training days',
          severity: 'warning',
          message: `${getDayLabel(streakStart)} through ${getDayLabel(i)} is ${consecutive} consecutive training days. Consider adding a rest day to reduce overtraining risk.`,
        })
        // Only flag once per streak
        break
      }
    } else {
      consecutive = 0
    }
  }

  // 6. All clear
  if (checks.length === 0) {
    checks.push({
      id: 'all-clear',
      label: 'All clear',
      severity: 'pass',
      message: 'No constraint violations found. This arrangement respects recovery, iron protection, and load management guidelines.',
    })
  }

  return checks
}

// ============================================================================
// PREDICTED METRICS
// ============================================================================

const CURRENT_ACWR = 0.93
const RUN_PACE_KM_PER_MIN = 0.167 // ~6:00/km pace

export function computePredictedMetrics(assignments: DayAssignment[]): PredictedMetrics {
  const activities = assignments.map((a) => a.activity).filter(Boolean) as MutableActivity[]

  const totalTrainingMin = activities.reduce((s, a) => s + a.duration, 0)
  const runActivities = activities.filter((a) => a.isRunning)
  const bikeActivities = activities.filter((a) => !a.isRunning && a.duration > 0)

  const totalRunMin = runActivities.reduce((s, a) => s + a.duration, 0)
  const totalRunKm = Math.round(totalRunMin * RUN_PACE_KM_PER_MIN * 10) / 10
  const totalBikeMin = bikeActivities.reduce((s, a) => s + a.duration, 0)

  // All sessions are Zone 2 or Zone 2-adjacent except tempo
  const tempoActivity = activities.find((a) => a.id === 'tempo-run')
  const totalZone2Min = totalTrainingMin - (tempoActivity ? tempoActivity.duration : 0)

  const totalTRIMP = activities.reduce((s, a) => s + a.estimatedTRIMP, 0)

  const hardDays = activities.filter((a) => a.dayType === 'hard').length
  const easyDays = activities.filter((a) => a.dayType === 'easy').length
  const moderateDays = activities.filter((a) => a.dayType === 'moderate').length
  const restDays = 7 - activities.filter((a) => a.dayType !== 'rest').length

  // Simplified ACWR estimation: new week load relative to chronic
  // Chronic load assumed from current ACWR baseline
  const weeklyLoad = totalTRIMP
  const chronicLoad = weeklyLoad / CURRENT_ACWR
  const estimatedACWR = chronicLoad > 0 ? Math.round((weeklyLoad / chronicLoad) * 100) / 100 : 0

  const zone2Pct = totalTrainingMin > 0 ? Math.round((totalZone2Min / totalTrainingMin) * 100) : 0

  return {
    totalTrainingMin,
    totalRunKm,
    totalBikeMin,
    totalZone2Min,
    estimatedACWR: Math.max(0.7, Math.min(1.5, estimatedACWR || 1.05)),
    hardDays,
    easyDays,
    moderateDays,
    restDays,
    sleepTargetAvg: 7.4,
    zone2Pct,
    totalTRIMP,
  }
}

// ============================================================================
// HELPERS
// ============================================================================

export function getWorstSeverity(checks: ConstraintCheck[]): 'error' | 'warning' | 'pass' {
  if (checks.some((c) => c.severity === 'error')) return 'error'
  if (checks.some((c) => c.severity === 'warning')) return 'warning'
  return 'pass'
}
