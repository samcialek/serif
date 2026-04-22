// ============================================================
// PERSONA TYPES
// ============================================================

export type TimeConstant = 'immediate' | 'days' | 'weeks' | 'months'

export interface LoadLever {
  id: string
  loadId: string                     // References PersonaLoad.id
  action: string                     // Human-readable daily action
  effect: {
    magnitude: number
    direction: 'increase' | 'decrease'
    unit: string                     // e.g. '%/week', 'score/day'
  }
  timeConstant: TimeConstant
  category: 'sleep' | 'training' | 'recovery' | 'nutrition' | 'medical'
  evidenceSource: string
  prerequisites?: string[]           // e.g. ['medical clearance']
  isActive?: boolean
}

export interface CampaignPhase {
  id: string
  name: string                       // e.g. "Foundation", "Build", "Verify"
  weekRange: [number, number]
  goal: string
  dailyActions: CampaignAction[]
  constraints?: string[]
  expectedLoadValue?: number
}

export interface CampaignAction {
  id: string
  leverId: string                    // References LoadLever.id
  action: string
  frequency: 'daily' | 'weekly' | 'as-needed' | 'once'
  timing?: string
  category: 'sleep' | 'training' | 'recovery' | 'nutrition' | 'medical'
  detail?: string
}

export interface CampaignCheckpoint {
  id: string
  weekNumber: number
  type: 'lab-retest' | 'metric-review' | 'coach-check-in' | 'self-assessment'
  description: string
  metric: string
  targetValue?: number
  action: string
}

export interface CampaignTrajectoryPoint {
  weekNumber: number
  expectedValue: number
  rangeLow: number
  rangeHigh: number
  label?: string
}

export interface Campaign {
  id: string
  personaId: string
  loadId: string
  name: string
  status: 'active' | 'planned' | 'completed' | 'paused'
  currentValue: number
  goalValue: number
  currentUnit: string
  estimatedDurationWeeks: number
  startDate?: string
  currentWeek?: number
  phases: CampaignPhase[]
  checkpoints: CampaignCheckpoint[]
  trajectory: CampaignTrajectoryPoint[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  sourceInsightIds: string[]
  activePhaseId?: string
}

export interface PersonaLoad {
  id: string
  label: string
  kind: 'load' | 'marker'  // load = accumulation of choices; marker = slow biology
  value: number        // 0-100 scale
  trend: 'rising' | 'falling' | 'stable'
  trendPositive?: boolean  // Is the current trend direction good? Controls arrow color (green vs red)
  status: 'low' | 'moderate' | 'high' | 'critical'
  unit?: string
  detail?: string
  targetRange?: [number, number]
  targetUnit?: string
  levers?: LoadLever[]
  strategy?: 'maintain' | 'recover'
  affectedInsightIds?: string[]
}

export interface PersonaResidence {
  country: string  // ISO-2 code (e.g. 'IL', 'US')
  city?: string
  timezone: string  // IANA zone (e.g. 'Asia/Jerusalem')
  lat?: number
  lon?: number
}

export interface Persona {
  id: string
  name: string
  avatar: string
  persona?: string  // Short description like "Busy tech professional"
  age: number
  archetype: string
  narrative: string
  daysOfData: number
  devices: DeviceId[]
  deviceConnections?: PersonaDeviceConnection[]  // Detailed per-device connection status
  hasBloodwork: boolean
  labDraws: number
  thresholds: PersonalThresholds
  currentMetrics: CurrentMetrics
  loads?: PersonaLoad[]  // Accumulated stressors on the system
  // In production this is hydrated from the modal OAuth timezone offset over
  // the last 30d (e.g. Oura daily summaries). Hard-coded here for the demo.
  residence?: PersonaResidence
  tags: string[]
  dataContext?: DataContext  // Added for components
}

export interface DataContext {
  daysOfData: number
  evidenceWeight: number  // 0-1
  devices: string[]
  primaryDevice: string
}

export interface PersonalThresholds {
  caffeineCutoff: string
  workoutEndTime: string
  bedroomTempCeiling: number
  eatingWindowHours: number
  minSleepHours: number
  maxAlcoholUnits: number
  alcoholLimit?: number
  exerciseCutoff?: string
  screenCutoff?: string
  bedtimeTarget?: string
}

export interface CurrentMetrics {
  sleepScore: number
  deepSleepMin: number
  remSleepMin: number
  sleepLatencyMin: number
  hrv: number
  restingHr: number
  fastingGlucose: number
  weight: number
  trainingLoad: 'low' | 'optimal' | 'high' | 'overreaching'
}

// ============================================================
// INSIGHT TYPES
// ============================================================

// Curve types for dose-response relationships
export type CurveType =
  | 'plateau_up'    // Benefit increases until θ, then plateaus
  | 'plateau_down'  // Outcome good until θ, then drops
  | 'v_min'         // U-shaped, optimal minimum value
  | 'v_max'         // Inverted U, optimal peak value
  | 'linear'        // Linear relationship throughout

export interface CausalParameters {
  // Source → Target relationship
  source: string           // The variable you control (e.g., 'bedtime_hour')
  target: string           // The outcome you care about (e.g., 'sleep_efficiency_pct')

  // Curve type determines visualization
  curveType: CurveType

  // θ (theta) - Personal threshold/changepoint
  theta: {
    value: number          // The threshold value (e.g., 22.25 for 10:15 PM)
    unit: string           // Unit of measure (e.g., 'hour', 'minutes', 'mg')
    low: number            // Lower bound of 95% CI
    high: number           // Upper bound of 95% CI
    displayValue: string   // Human-readable (e.g., "10:15 PM", "52 min")
  }

  // β (beta) - Effect sizes
  betaBelow: {
    value: number          // Effect per unit below threshold
    unit: string           // Unit of effect (e.g., '%', 'ms', 'sec')
    description: string    // Human-readable (e.g., "+3.8 sec/min")
  }
  betaAbove: {
    value: number          // Effect per unit above threshold
    unit: string           // Unit of effect
    description: string    // Human-readable (e.g., "+0.2 sec/min")
  }

  // Evidence quality
  observations: number     // N observations (e.g., 243)
  completePct: number      // Data completeness (e.g., 99.2)
  changepointProb: number  // Probability there IS a threshold (0-1)

  // Effect categorization
  sizeCategory: 'small' | 'medium' | 'large'

  // For display: current user state relative to threshold
  currentValue?: number
  currentStatus?: 'below_optimal' | 'at_optimal' | 'above_optimal' | 'below_threshold' | 'above_threshold'

  // Posterior samples for 3D probability-aware visualization (128 Thompson worlds)
  posteriorSamples?: {
    theta: number[]          // 128 theta samples
    betaBelow: number[]      // 128 beta_below samples
    betaAbove: number[]      // 128 beta_above samples
    alpha: number[]          // 128 intercept samples
  }
}

export interface Insight {
  id: string
  personaId: string
  category: InsightCategory
  variableType: InsightVariableType  // COMPLE framework: outcome, load, or marker
  title: string
  headline: string
  summary?: string
  recommendation: string
  explanation: string
  narrative?: string

  // NEW: Causal parameters with θ and β
  causalParams?: CausalParameters

  // Legacy causal relationship (kept for backwards compatibility)
  cause: {
    behavior: string
    threshold: string | number
    unit: string
    direction: 'before' | 'after' | 'below' | 'above'
  }

  // Population comparison for showing individual vs average
  populationThreshold?: {
    value: string | number
    label: string  // e.g., "Population Average"
    variance?: string  // e.g., "2.5 hours later" or "15% higher"
  }

  outcome: {
    metric: string
    effect: string
    direction: 'positive' | 'negative'
  }

  // Confidence breakdown
  certainty: number
  evidenceWeight?: number
  evidence: {
    personalDays: number
    personalWeight: number
    populationWeight: number
    stability: number
  }

  // Display data
  dataSources: DeviceId[]
  comparison: {
    before: { value: number; label: string }
    after: { value: number; label: string }
  }

  whyNow: string

  // Change indicator
  change?: {
    value: number
    unit: string
    direction: 'up' | 'down'
    period: string
  }

  // Actionability
  actionable?: boolean
  suggestedAction?: string
  priority?: number
  status?: 'new' | 'viewed' | 'acted' | 'dismissed'
  discoveredAt?: string

  // Supporting evidence
  supportingData?: string[]
  causalChain?: string[]

  holdoutPreview?: {
    metric: string
    expectedChange: number
    unit: string
    horizon: string
  }

  showWork: string
}

export type InsightCategory =
  | 'sleep'
  | 'metabolic'
  | 'cardio'
  | 'recovery'
  | 'mood'
  | 'nutrition'
  | 'cognitive'
  | 'activity'
  | 'stress'

/**
 * COMPLE Framework Variable Types
 * Based on Serif's causal model:
 * - Outcomes: What you care about that changes DAILY (sleep quality, energy, mood, HRV, recovery)
 * - Loads: ACCUMULATION of recent choices (training load, sleep debt, stress accumulation)
 * - Markers: SLOW biology to be optimized (HbA1c, hsCRP, lipids, hormones)
 */
export type InsightVariableType = 'outcome' | 'load' | 'marker'

// ============================================================
// PROTOCOL TYPES
// ============================================================

export interface Protocol {
  id: string
  personaId: string
  name: string
  title?: string
  description?: string
  category?: string
  outcome: string
  status?: 'active' | 'suggested' | 'completed' | 'paused'

  baseline: {
    value: number
    unit: string
  }

  actions: ProtocolAction[]
  states: ProtocolState[]
  triggers: ProtocolTrigger[]

  // Additional display fields
  personalizedTiming?: string
  expectedImpact?: string
  difficulty?: number  // 1-5
  evidenceLevel?: number  // 0-100
  progress?: number  // 0-100

  simulator: {
    deltas: Record<string, number>
  }
}

export interface ProtocolAction {
  id: string
  label: string
  category: InsightCategory
  isActive: boolean
  impact: number
  // Action type determines timeline display
  actionType?: 'cutoff' | 'duration' | 'target'  // cutoff = point-in-time marker, duration = span, target = goal
  time?: string  // For cutoff actions, e.g., "2:15 PM"
  startTime?: string  // For duration actions, e.g., "5:00 PM"
  endTime?: string    // For duration actions, e.g., "6:00 PM"
  linkedInsightId?: string  // Reference to driving insight
}

export interface ProtocolState {
  id: string
  label: string
  isActive: boolean
}

export interface ProtocolTrigger {
  if: string[]
  then: string[]
  reason: string
}

export interface DailyPlan {
  personaId: string
  date: string
  greeting: string

  priorities: {
    high: PlanItem[]
    moderate: PlanItem[]
    maintain: PlanItem[]
  }

  eveningCheckIn?: {
    completed: PlanItem[]
    pending: PlanItem[]
    prediction: SleepPrediction
  }
}

export interface PlanItem {
  id: string
  text: string
  explanation: string
  evidenceWeight: string
  status?: 'completed' | 'pending' | 'missed'
  completedAt?: string
}

export interface SleepPrediction {
  sleepScore: number
  deepSleep: number
  sleepLatency: number
  confidence: number
}

// ============================================================
// COACH TYPES
// ============================================================

export interface CoachMember {
  id: string
  personaId: string
  name: string
  avatar: string
  focus?: string
  daysOfData?: number
  insightCount?: number
  activeProtocols?: number
  adherence?: number
  lastSyncHours?: number
  status: 'active' | 'inactive' | 'at-risk' | 'needs-attention' | 'on-track' | 'insufficient-data'
  statusReason: string

  flags: string[]

  lastSession: string
  nextSession: string

  keyMetrics: MetricDelta[]

  topDrivers: {
    driver: string
    direction: 'positive' | 'negative'
    certainty: number
  }[]

  todayReco: {
    text: string
    certainty: number
  }[]

  coachMessage: string
}

export interface MetricDelta {
  name: string
  label?: string  // Added
  value?: string | number  // Added
  previous: number
  current: number
  unit: string
  trend: 'up' | 'down' | 'stable' | string
  isGood: boolean
}

export interface SessionPrep {
  id?: string
  memberId: string
  memberName?: string
  clientName?: string
  sessionDate: string
  sessionTime?: string
  sessionDuration: number
  focus?: string
  urgency?: 'high' | 'medium' | 'low'
  prepTimeSaved: string

  discussionPoints: (DiscussionPoint | string)[]
  keyMetrics?: MetricDelta[]
  alerts?: string[]

  metrics: MetricDelta[]

  lastSessionNotes: string

  adherence: {
    category: string
    percentage: number
  }[]
}

export interface DiscussionPoint {
  title: string
  priority: 'high' | 'medium' | 'low'
  priorityColor: string

  whatIsHappening: string[]
  rootCause: string
  suggestedIntervention: string
  expectedImpact: string
  talkingPoints: string[]
}

export interface WeeklyDigest {
  memberId: string
  weekOf: string
  wins: string[]
  regressions: string[]
  likelyCauses: string[]
  recommendedNextSteps: string[]
  confidenceNote: string
  totalSessions?: number
  newInsights?: number
  protocolsStarted?: number
  avgCertainty?: number
  needsAttention?: { name: string; reason: string }[]
  topProtocols?: { name: string; clients: number; improvement: string }[]
}

// ============================================================
// INTEGRATION TYPES
// ============================================================

export type DeviceId =
  | 'oura'
  | 'fitbit'
  | 'bloodwork'
  | 'weather'
  | string

export interface Device {
  id: DeviceId
  name: string
  type?: string
  icon: string
  metrics: string[]
  dataTypes?: string[]
}

// Per-persona device connection status
export interface PersonaDeviceConnection {
  deviceId: DeviceId
  isActive: boolean          // Currently connected (shows in #89ccf0)
  firstConnected?: string    // ISO date of first connection
  lastRefreshed?: string     // ISO date of last sync
}

export interface LabConnection {
  isConnected: boolean
  provider: string
  lastSync?: string
  markersAvailable: string[]
  usersWithData: number
  totalUsers: number
}

export interface SyncSchedule {
  wearables: 'realtime' | 'hourly' | 'daily' | 'custom'
  bloodwork: 'on-result' | 'daily' | 'weekly'
  insightDelivery: 'immediate' | 'batched'
  protocolTimes: string[]
}

export interface SyncLogEntry {
  id: string
  timestamp: string
  type: 'wearables' | 'bloodwork' | 'full'
  duration: string
  status: 'success' | 'partial' | 'failed'
  rowsIngested: number
  source: string
}

// ============================================================
// CONFIGURATION TYPES
// ============================================================

export interface DemoConfig {
  certaintyThreshold: number
  minEffectSize: number
  minDataDays: number
  populationPriorEnabled: boolean
}

export interface ProductModule {
  id: string
  name: string
  description: string
  pricePerUser: number
  priceAtScale: number
  scaleThreshold: number
  isActive: boolean
  enabled?: boolean
  features?: string[]
}

// ============================================================
// TIME SERIES TYPES
// ============================================================

export interface DailyMetrics {
  date: string

  // Sleep (from Oura/Whoop)
  sleepScore: number
  sleepDuration: number
  deepSleep: number
  remSleep: number
  lightSleep: number
  sleepLatency: number
  sleepEfficiency: number
  bedtime: string
  wakeTime: string

  // Recovery (from wearables)
  hrv: number
  restingHr: number
  respiratoryRate: number
  bodyTemp: number

  // Activity
  steps: number
  activeCalories: number
  moderateMinutes: number
  vigorousMinutes: number
  zone2Minutes: number
  trainingLoad: number

  // Choices (user input or inferred)
  caffeineCutoff: string | null
  alcoholUnits: number
  eatingWindowStart: string
  eatingWindowEnd: string
  bedroomTemp: number
  workoutTime: string | null
  workoutType: string | null

  // Subjective
  mood: number
  energy: number
  focus: number
  stress: number

  // Events (for narrative)
  events?: string[]
}

export interface LabResult {
  date: string

  // Metabolic
  fastingGlucose?: number
  hba1c?: number
  insulin?: number

  // Lipids
  totalCholesterol?: number
  ldl?: number
  hdl?: number
  triglycerides?: number

  // Inflammation
  hsCrp?: number
  homocysteine?: number

  // Hormones
  testosterone?: number
  cortisol?: number
  tsh?: number

  // Vitamins
  vitaminD?: number
  b12?: number
  ferritin?: number

  // Extended iron panel (for Caspian and similar)
  iron?: number
  tibc?: number
  ironSaturationPct?: number

  // Omega-3 panel
  epa?: number
  dha?: number
  aaEpaRatio?: number

  // Additional markers
  apob?: number
}

// ============================================================
// DEMO MODE TYPES
// ============================================================

export interface DemoStep {
  id: string
  title: string
  description: string
  targetElement: string
  action?: 'click' | 'slide' | 'type' | 'wait'
  actionTarget?: string
  actionValue?: string | number
  voiceover: string
  duration: number
}

export interface DemoScript {
  id: string
  name: string
  duration: string
  steps: DemoStep[]
}

// ============================================================
// UTILITY TYPES
// ============================================================

export type ViewId =
  | 'landing'
  | 'integrate'
  | 'insights'
  | 'protocols'
  | 'coach'
  | 'admin'
  | 'api'

export interface NavItem {
  id: ViewId
  label: string
  icon: string
  path: string
}

// Toast types
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}
