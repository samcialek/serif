/**
 * Simulator and calculation utilities for What-If analysis
 */

import type { SimulatorScenario, SimulatorResult, ProtocolImpact } from '@/data/protocols/types'

// ============================================================
// STATISTICAL CALCULATIONS
// ============================================================

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const squaredDiffs = values.map(v => Math.pow(v - avg, 2))
  return Math.sqrt(mean(squaredDiffs))
}

/**
 * Calculate percentile
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

/**
 * Calculate correlation coefficient between two arrays
 */
export function correlation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0

  const n = x.length
  const meanX = mean(x)
  const meanY = mean(y)

  let numerator = 0
  let sumX2 = 0
  let sumY2 = 0

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX
    const dy = y[i] - meanY
    numerator += dx * dy
    sumX2 += dx * dx
    sumY2 += dy * dy
  }

  const denominator = Math.sqrt(sumX2 * sumY2)
  if (denominator === 0) return 0

  return numerator / denominator
}

// ============================================================
// BAYESIAN CALCULATIONS (Simplified for demo)
// ============================================================

/**
 * Combine personal evidence weight with population prior
 * This simulates the Bayesian updating process Serif uses
 */
export function combineWithPrior(
  personalEstimate: number,
  populationPrior: number,
  personalWeight: number // 0-1, based on data density
): number {
  return personalEstimate * personalWeight + populationPrior * (1 - personalWeight)
}

/**
 * Calculate evidence weight based on sample size
 * More data points = higher personal weight
 */
export function calculateEvidenceWeight(sampleSize: number, minSamples: number = 7, maxSamples: number = 90): number {
  if (sampleSize < minSamples) return 0.1
  if (sampleSize >= maxSamples) return 0.95

  // Logarithmic scaling for evidence weight
  const normalized = (sampleSize - minSamples) / (maxSamples - minSamples)
  return 0.1 + 0.85 * Math.sqrt(normalized)
}

/**
 * Calculate certainty level based on data quality and quantity
 */
export function calculateCertainty(
  sampleSize: number,
  effectStrength: number, // absolute correlation or effect size
  dataConsistency: number // 0-1, how consistent the observations are
): number {
  const sampleFactor = Math.min(1, sampleSize / 60) // caps at 60 days
  const effectFactor = Math.min(1, Math.abs(effectStrength) / 0.5) // caps at 0.5 correlation
  const consistencyFactor = dataConsistency

  // Weighted combination
  const rawCertainty = sampleFactor * 0.3 + effectFactor * 0.4 + consistencyFactor * 0.3

  // Apply sigmoid to keep in reasonable range (0.3 - 0.95)
  return 0.3 + 0.65 * sigmoid(rawCertainty * 4 - 2)
}

/**
 * Sigmoid function for smooth bounding
 */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

// ============================================================
// SIMULATOR CALCULATIONS
// ============================================================

/**
 * Simulate the impact of a protocol change
 * This is a simplified version of Serif's causal inference
 */
export function simulateProtocolImpact(
  scenario: SimulatorScenario,
  baselineValue: number,
  personalSensitivity: number = 1.0 // persona-specific modifier
): SimulatorResult {
  const currentValue = scenario.currentValue ?? 0
  const proposedValue = scenario.proposedValue ?? 0
  const impactPerUnit = scenario.impactPerUnit ?? 1
  const maxImpact = scenario.maxImpact ?? 10
  const metric = scenario.metric ?? 'sleep_score'

  const change = proposedValue - currentValue

  // Calculate raw impact
  let rawImpact = change * impactPerUnit * personalSensitivity

  // Apply diminishing returns
  rawImpact = applyDiminishingReturns(rawImpact, maxImpact)

  // Calculate projected value
  const projectedValue = baselineValue + rawImpact

  // Simulate confidence interval (wider for larger changes)
  const uncertaintyFactor = Math.abs(change) / 10
  const confidenceInterval = {
    low: projectedValue - rawImpact * 0.3 * (1 + uncertaintyFactor),
    high: projectedValue + rawImpact * 0.2 * (1 + uncertaintyFactor),
  }

  // Time to effect based on the type of intervention
  const timeToEffect = estimateTimeToEffect(scenario.intervention ?? '')

  return {
    predictedValue: projectedValue,
    deltaFromBaseline: rawImpact,
    activeActionsCount: 1,
    maxPossibleDelta: maxImpact,
    percentOfMax: maxImpact > 0 ? (rawImpact / maxImpact) * 100 : 0,
    metric,
    baseline: baselineValue,
    projected: projectedValue,
    change: rawImpact,
    changePercent: (rawImpact / baselineValue) * 100,
    confidenceInterval,
    certainty: scenario.certainty ?? 0.75,
    timeToEffect,
  }
}

/**
 * Apply diminishing returns to impact
 */
export function applyDiminishingReturns(impact: number, maxImpact: number): number {
  if (impact === 0) return 0

  const sign = Math.sign(impact)
  const absImpact = Math.abs(impact)
  const absMax = Math.abs(maxImpact)

  // Logarithmic diminishing returns
  const diminished = absMax * (1 - Math.exp(-absImpact / absMax))

  return sign * diminished
}

/**
 * Estimate time to see effect based on intervention type
 */
export function estimateTimeToEffect(intervention: string): string {
  const immediateInterventions = ['caffeine', 'alcohol', 'screen', 'light']
  const shortTermInterventions = ['sleep', 'exercise', 'meal', 'timing']
  const mediumTermInterventions = ['supplement', 'medication', 'routine']

  const lower = intervention.toLowerCase()

  if (immediateInterventions.some(i => lower.includes(i))) {
    return '1-2 days'
  }
  if (shortTermInterventions.some(i => lower.includes(i))) {
    return '3-7 days'
  }
  if (mediumTermInterventions.some(i => lower.includes(i))) {
    return '2-4 weeks'
  }
  return '1-2 weeks'
}

/**
 * Combine multiple protocol impacts
 */
export function combineProtocolImpacts(impacts: ProtocolImpact[]): {
  totalChange: number
  interactions: string[]
  netCertainty: number
} {
  let totalChange = 0
  const interactions: string[] = []
  let certaintySum = 0

  // Check for interactions
  const interventionTypes = impacts.map(i => i.intervention?.toLowerCase() || '')

  // Known interactions
  if (interventionTypes.includes('caffeine') && interventionTypes.includes('sleep')) {
    interactions.push('Caffeine timing affects sleep quality')
  }
  if (interventionTypes.includes('exercise') && interventionTypes.includes('sleep')) {
    interactions.push('Exercise timing affects sleep onset')
  }
  if (interventionTypes.includes('alcohol') && interventionTypes.includes('hrv')) {
    interactions.push('Alcohol significantly impacts HRV')
  }

  // Sum impacts with diminishing returns for multiple interventions
  impacts.forEach((impact, index) => {
    // Each additional intervention has slightly less effect (interaction penalty)
    const interactionPenalty = Math.pow(0.9, index)
    totalChange += impact.change * interactionPenalty
    certaintySum += impact.certainty * interactionPenalty
  })

  const netCertainty = impacts.length > 0 ? certaintySum / impacts.length : 0

  return { totalChange, interactions, netCertainty }
}

// ============================================================
// THRESHOLD CALCULATIONS
// ============================================================

/**
 * Calculate personalized threshold based on historical data
 */
export function calculatePersonalThreshold(
  values: number[],
  populationThreshold: number,
  targetPercentile: number = 75
): number {
  if (values.length < 7) {
    // Not enough data, use population threshold
    return populationThreshold
  }

  const personalThreshold = percentile(values, targetPercentile)
  const evidenceWeight = calculateEvidenceWeight(values.length)

  return combineWithPrior(personalThreshold, populationThreshold, evidenceWeight)
}

/**
 * Calculate optimal timing window
 */
export function calculateOptimalTiming(
  observations: { time: string; outcome: number }[],
  targetOutcome: 'maximize' | 'minimize' = 'maximize'
): { optimalTime: string; confidence: number } {
  if (observations.length < 7) {
    return { optimalTime: 'insufficient data', confidence: 0.3 }
  }

  // Group by hour
  const byHour: Record<number, number[]> = {}

  observations.forEach(obs => {
    const hour = parseInt(obs.time.split(':')[0])
    if (!byHour[hour]) byHour[hour] = []
    byHour[hour].push(obs.outcome)
  })

  // Find optimal hour
  let bestHour = 12
  let bestValue = targetOutcome === 'maximize' ? -Infinity : Infinity

  Object.entries(byHour).forEach(([hour, values]) => {
    const avg = mean(values)
    if (targetOutcome === 'maximize' && avg > bestValue) {
      bestValue = avg
      bestHour = parseInt(hour)
    } else if (targetOutcome === 'minimize' && avg < bestValue) {
      bestValue = avg
      bestHour = parseInt(hour)
    }
  })

  // Calculate confidence based on consistency
  const bestHourValues = byHour[bestHour] || []
  const std = standardDeviation(bestHourValues)
  const avgStd = mean(Object.values(byHour).map(standardDeviation))
  const consistency = avgStd > 0 ? 1 - std / avgStd : 0.5

  const confidence = calculateCertainty(observations.length, 0.3, consistency)

  return {
    optimalTime: `${bestHour.toString().padStart(2, '0')}:00`,
    confidence,
  }
}

// ============================================================
// TREND ANALYSIS
// ============================================================

/**
 * Calculate moving average
 */
export function movingAverage(values: number[], window: number = 7): number[] {
  if (values.length < window) return values

  const result: number[] = []
  for (let i = 0; i <= values.length - window; i++) {
    const windowValues = values.slice(i, i + window)
    result.push(mean(windowValues))
  }
  return result
}

/**
 * Detect significant changes (breakpoints) in a time series
 */
export function detectBreakpoints(values: number[], threshold: number = 2): number[] {
  if (values.length < 10) return []

  const breakpoints: number[] = []
  const ma = movingAverage(values, 5)
  const std = standardDeviation(values)

  for (let i = 1; i < ma.length; i++) {
    const diff = Math.abs(ma[i] - ma[i - 1])
    if (diff > threshold * std) {
      breakpoints.push(i + 2) // Adjust for moving average offset
    }
  }

  return breakpoints
}

/**
 * Calculate linear regression slope
 */
export function linearRegressionSlope(values: number[]): number {
  if (values.length < 2) return 0

  const n = values.length
  const x = Array.from({ length: n }, (_, i) => i)
  const meanX = mean(x)
  const meanY = mean(values)

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (values[i] - meanY)
    denominator += (x[i] - meanX) ** 2
  }

  return denominator !== 0 ? numerator / denominator : 0
}

/**
 * Calculate rate of improvement
 */
export function calculateImprovementRate(values: number[], windowDays: number = 7): number {
  if (values.length < windowDays * 2) return 0

  const recent = values.slice(-windowDays)
  const previous = values.slice(-windowDays * 2, -windowDays)

  const recentAvg = mean(recent)
  const previousAvg = mean(previous)

  if (previousAvg === 0) return 0
  return ((recentAvg - previousAvg) / previousAvg) * 100
}
