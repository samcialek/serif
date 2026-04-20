// ============================================================================
// WEEKLY WIZARD TYPES
// ============================================================================

export interface MutableActivity {
  id: string
  label: string
  dayType: 'hard' | 'moderate' | 'easy' | 'rest'
  duration: number // minutes, 0 for rest
  isRunning: boolean
  estimatedTRIMP: number
}

export interface DayAssignment {
  dayIndex: number // 0–6 (Sun–Sat)
  activity: MutableActivity | null
}

export type WizardStep = 'arrange' | 'review' | 'lockin'

export interface WizardState {
  step: WizardStep
  assignments: DayAssignment[]
  locked: boolean
}

export type ConstraintSeverity = 'error' | 'warning' | 'pass'

export interface ConstraintCheck {
  id: string
  label: string
  severity: ConstraintSeverity
  message: string
}

export interface PredictedMetrics {
  totalTrainingMin: number
  totalRunKm: number
  totalBikeMin: number
  totalZone2Min: number
  estimatedACWR: number
  hardDays: number
  easyDays: number
  moderateDays: number
  restDays: number
  sleepTargetAvg: number
  zone2Pct: number
  totalTRIMP: number
}
