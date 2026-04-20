import type { Protocol, ProtocolAction, DailyPlan } from '@/types'

/**
 * Simulator state for what-if calculations
 */
export interface SimulatorState {
  protocolId: string
  baselineValue: number
  activeActions: Set<string>
  predictedValue: number
  deltaFromBaseline: number
}

/**
 * Simulator result after toggling actions
 */
export interface SimulatorResult {
  predictedValue: number
  deltaFromBaseline: number
  activeActionsCount: number
  maxPossibleDelta: number
  percentOfMax: number
  // Additional display properties
  metric?: string
  baseline?: number
  projected?: number
  change?: number
  changePercent?: number
  certainty?: number
  timeToEffect?: string
  confidenceInterval?: {
    low: number
    high: number
  }
}

/**
 * Simulator scenario for what-if calculations
 */
export interface SimulatorScenario {
  id: string
  name: string
  description: string
  actions: string[]
  expectedImpact: number
  // Additional properties for simulation
  intervention?: string
  currentValue?: number
  proposedValue?: number
  impactPerUnit?: number
  maxImpact?: number
  metric?: string
  certainty?: number
}

/**
 * Protocol impact calculation result
 */
export interface ProtocolImpact {
  metricName: string
  currentValue: number
  projectedValue: number
  change: number
  changePercent: number
  certainty: number
  intervention?: string
}

/**
 * Protocol summary for list views
 */
export interface ProtocolSummary {
  id: string
  personaId: string
  name: string
  outcome: string
  actionCount: number
  activeActionCount: number
  potentialImpact: number
}

/**
 * Action with computed state
 */
export interface ActionWithState extends ProtocolAction {
  isToggled: boolean
  contributionPercent: number
}

/**
 * Daily plan with computed state
 */
export interface DailyPlanWithState extends DailyPlan {
  completedCount: number
  totalCount: number
  completionPercent: number
}

/**
 * Plan item priority levels
 */
export type PriorityLevel = 'high' | 'moderate' | 'maintain'

/**
 * Priority colors for UI
 */
export const PRIORITY_COLORS: Record<PriorityLevel, { bg: string; text: string; border: string }> = {
  high: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  moderate: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  maintain: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
}

/**
 * Calculate total potential impact from a protocol
 */
export function calculateMaxImpact(protocol: Protocol): number {
  return protocol.actions.reduce((sum, action) => sum + action.impact, 0)
}

/**
 * Calculate current impact based on active actions
 */
export function calculateCurrentImpact(
  protocol: Protocol,
  activeActionIds: Set<string>
): number {
  return protocol.actions
    .filter(action => activeActionIds.has(action.id))
    .reduce((sum, action) => sum + action.impact, 0)
}

/**
 * Get predicted outcome value
 */
export function getPredictedOutcome(
  baseline: number,
  protocol: Protocol,
  activeActionIds: Set<string>
): number {
  const delta = calculateCurrentImpact(protocol, activeActionIds)
  return baseline + delta
}

/**
 * Get plan item counts by status
 */
export function getPlanItemCounts(plan: DailyPlan): {
  total: number
  completed: number
  pending: number
  missed: number
} {
  const allItems = [
    ...plan.priorities.high,
    ...plan.priorities.moderate,
    ...plan.priorities.maintain,
  ]

  return {
    total: allItems.length,
    completed: allItems.filter(i => i.status === 'completed').length,
    pending: allItems.filter(i => i.status === 'pending' || !i.status).length,
    missed: allItems.filter(i => i.status === 'missed').length,
  }
}
