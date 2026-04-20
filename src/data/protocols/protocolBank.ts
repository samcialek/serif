import type { Protocol, DailyPlan, ProtocolAction } from '@/types'
import type { SimulatorResult, ProtocolSummary, ActionWithState } from './types'
import { calculateMaxImpact, getPredictedOutcome } from './types'
import { allProtocols, personaDataMap } from '@/data/personas'

/**
 * Get all protocols
 */
export function getAllProtocols(): Protocol[] {
  return allProtocols
}

/**
 * Get protocols for a specific persona
 */
export function getProtocolsForPersona(personaId: string): Protocol[] {
  return allProtocols.filter(p => p.personaId === personaId)
}

/**
 * Get protocol by ID
 */
export function getProtocolById(id: string): Protocol | undefined {
  return allProtocols.find(p => p.id === id)
}

/**
 * Get daily plan for a persona
 */
export function getDailyPlanForPersona(personaId: string): DailyPlan | undefined {
  return personaDataMap[personaId]?.dailyPlan
}

/**
 * Get protocol summary
 */
export function getProtocolSummary(protocol: Protocol): ProtocolSummary {
  return {
    id: protocol.id,
    personaId: protocol.personaId,
    name: protocol.name,
    outcome: protocol.outcome,
    actionCount: protocol.actions.length,
    activeActionCount: protocol.actions.filter(a => a.isActive).length,
    potentialImpact: calculateMaxImpact(protocol),
  }
}

/**
 * Simulate outcome based on active actions
 */
export function simulateOutcome(
  protocol: Protocol,
  activeActionIds: Set<string>
): SimulatorResult {
  const baseline = protocol.baseline.value
  const predictedValue = getPredictedOutcome(baseline, protocol, activeActionIds)
  const deltaFromBaseline = predictedValue - baseline
  const maxPossibleDelta = calculateMaxImpact(protocol)

  return {
    predictedValue,
    deltaFromBaseline,
    activeActionsCount: activeActionIds.size,
    maxPossibleDelta,
    percentOfMax: maxPossibleDelta > 0 ? (deltaFromBaseline / maxPossibleDelta) * 100 : 0,
  }
}

/**
 * Get actions with toggle state
 */
export function getActionsWithState(
  protocol: Protocol,
  toggledActionIds: Record<string, boolean>
): ActionWithState[] {
  const maxImpact = calculateMaxImpact(protocol)

  return protocol.actions.map(action => ({
    ...action,
    isToggled: toggledActionIds[action.id] ?? action.isActive,
    contributionPercent: maxImpact > 0 ? (action.impact / maxImpact) * 100 : 0,
  }))
}

/**
 * Get recommended actions based on current states
 */
export function getRecommendedActions(protocol: Protocol): ProtocolAction[] {
  const activeStateIds = new Set(
    protocol.states.filter(s => s.isActive).map(s => s.id)
  )

  const recommendedActionIds = new Set<string>()

  protocol.triggers.forEach(trigger => {
    const allConditionsMet = trigger.if.every(stateId => activeStateIds.has(stateId))
    if (allConditionsMet) {
      trigger.then.forEach(actionId => recommendedActionIds.add(actionId))
    }
  })

  return protocol.actions.filter(action => recommendedActionIds.has(action.id))
}

/**
 * Calculate adherence percentage for a protocol
 */
export function calculateAdherence(
  protocol: Protocol,
  completedActionIds: Set<string>
): number {
  const totalActions = protocol.actions.length
  if (totalActions === 0) return 0

  const completedCount = protocol.actions.filter(
    action => completedActionIds.has(action.id)
  ).length

  return (completedCount / totalActions) * 100
}

/**
 * Get action by ID within a protocol
 */
export function getActionById(
  protocol: Protocol,
  actionId: string
): ProtocolAction | undefined {
  return protocol.actions.find(a => a.id === actionId)
}

/**
 * Sort actions by impact (highest first)
 */
export function sortActionsByImpact(actions: ProtocolAction[]): ProtocolAction[] {
  return [...actions].sort((a, b) => b.impact - a.impact)
}

/**
 * Get top impact actions
 */
export function getTopImpactActions(
  protocol: Protocol,
  limit: number = 3
): ProtocolAction[] {
  return sortActionsByImpact(protocol.actions).slice(0, limit)
}

/**
 * Format outcome value for display
 */
export function formatOutcomeValue(value: number, unit: string): string {
  if (unit === 'efficiency' || unit === '%') {
    return `${Math.round(value * 100)}%`
  }
  if (unit === 'score') {
    return `${Math.round(value)}`
  }
  return `${value.toFixed(1)} ${unit}`
}

/**
 * Get delta display string
 */
export function formatDelta(delta: number, unit: string): string {
  const sign = delta >= 0 ? '+' : ''
  if (unit === 'efficiency' || unit === '%') {
    return `${sign}${Math.round(delta * 100)}%`
  }
  if (unit === 'score') {
    return `${sign}${Math.round(delta)}`
  }
  return `${sign}${delta.toFixed(1)} ${unit}`
}

/**
 * Get protocol simulator with extended result
 */
export function getProtocolSimulator(protocol: Protocol) {
  return {
    simulate: (activeActionIds: Set<string>): SimulatorResult => {
      const baseline = protocol.baseline.value
      const predictedValue = getPredictedOutcome(baseline, protocol, activeActionIds)
      const deltaFromBaseline = predictedValue - baseline
      const maxPossibleDelta = calculateMaxImpact(protocol)
      const changePercent = baseline > 0 ? (deltaFromBaseline / baseline) * 100 : 0

      return {
        predictedValue,
        deltaFromBaseline,
        activeActionsCount: activeActionIds.size,
        maxPossibleDelta,
        percentOfMax: maxPossibleDelta > 0 ? (deltaFromBaseline / maxPossibleDelta) * 100 : 0,
        metric: protocol.outcome,
        baseline,
        projected: predictedValue,
        change: deltaFromBaseline,
        changePercent,
        certainty: 0.75 + (activeActionIds.size * 0.02),
        timeToEffect: '3-7 days',
        confidenceInterval: {
          low: predictedValue - 2,
          high: predictedValue + 2,
        },
      }
    },
    getProtocol: () => protocol,
  }
}
