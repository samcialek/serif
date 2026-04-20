import type { Insight, InsightCategory } from '@/types'
import type { InsightFilters, InsightWithDisplay } from './types'
import { INSIGHT_CATEGORY_META, getCertaintyLabel, getEvidenceLabel } from './types'
import { allInsights } from '@/data/personas'

/**
 * Get all insights from the bank
 */
export function getAllInsights(): Insight[] {
  return allInsights
}

/**
 * Get insights filtered by criteria
 */
export function getFilteredInsights(filters: InsightFilters): Insight[] {
  let filtered = [...allInsights]

  if (filters.personaId) {
    filtered = filtered.filter(i => i.personaId === filters.personaId)
  }

  if (filters.category) {
    const categories = Array.isArray(filters.category)
      ? filters.category
      : [filters.category]
    filtered = filtered.filter(i => categories.includes(i.category))
  }

  if (filters.minCertainty !== undefined) {
    filtered = filtered.filter(i => i.certainty >= filters.minCertainty!)
  }

  if (filters.maxCertainty !== undefined) {
    filtered = filtered.filter(i => i.certainty <= filters.maxCertainty!)
  }

  if (filters.hasHoldoutPreview !== undefined) {
    filtered = filtered.filter(i =>
      filters.hasHoldoutPreview ? !!i.holdoutPreview : !i.holdoutPreview
    )
  }

  if (filters.dataSources && filters.dataSources.length > 0) {
    filtered = filtered.filter(i =>
      filters.dataSources!.some(ds => i.dataSources.includes(ds as any))
    )
  }

  return filtered
}

/**
 * Get insights for a persona, filtered by certainty threshold
 */
export function getInsightsForPersonaWithThreshold(
  personaId: string,
  certaintyThreshold: number
): Insight[] {
  return allInsights.filter(
    i => i.personaId === personaId && i.certainty >= certaintyThreshold
  )
}

/**
 * Get insight by ID
 */
export function getInsightById(id: string): Insight | undefined {
  return allInsights.find(i => i.id === id)
}

/**
 * Enhance insight with display properties
 */
export function enhanceInsight(insight: Insight): InsightWithDisplay {
  const categoryMeta = INSIGHT_CATEGORY_META[insight.category]

  return {
    ...insight,
    categoryColor: categoryMeta.color,
    categoryGradient: categoryMeta.gradient,
    certaintyLabel: getCertaintyLabel(insight.certainty),
    evidenceLabel: getEvidenceLabel(insight.evidence.personalWeight),
    isHighCertainty: insight.certainty >= 0.8,
    isPersonalized: insight.evidence.personalWeight >= 0.5,
  }
}

/**
 * Get enhanced insights for display
 */
export function getEnhancedInsights(
  personaId: string,
  certaintyThreshold: number
): InsightWithDisplay[] {
  return getInsightsForPersonaWithThreshold(personaId, certaintyThreshold)
    .map(enhanceInsight)
    .sort((a, b) => b.certainty - a.certainty)
}

/**
 * Group insights by category
 */
export function groupInsightsByCategory(
  insights: Insight[]
): Record<InsightCategory, Insight[]> {
  const grouped: Record<InsightCategory, Insight[]> = {
    sleep: [],
    metabolic: [],
    cardio: [],
    recovery: [],
    mood: [],
    nutrition: [],
    cognitive: [],
    activity: [],
    stress: [],
  }

  insights.forEach(insight => {
    grouped[insight.category].push(insight)
  })

  return grouped
}

/**
 * Get count of insights at different certainty levels
 */
export function getInsightCounts(
  personaId: string
): { total: number; byThreshold: Record<string, number> } {
  const personaInsights = allInsights.filter(i => i.personaId === personaId)

  return {
    total: personaInsights.length,
    byThreshold: {
      '0.60': personaInsights.filter(i => i.certainty >= 0.60).length,
      '0.70': personaInsights.filter(i => i.certainty >= 0.70).length,
      '0.75': personaInsights.filter(i => i.certainty >= 0.75).length,
      '0.80': personaInsights.filter(i => i.certainty >= 0.80).length,
      '0.85': personaInsights.filter(i => i.certainty >= 0.85).length,
      '0.90': personaInsights.filter(i => i.certainty >= 0.90).length,
      '0.95': personaInsights.filter(i => i.certainty >= 0.95).length,
    },
  }
}

/**
 * Get related insights (same category or shared data sources)
 */
export function getRelatedInsights(
  insight: Insight,
  limit: number = 3
): Insight[] {
  return allInsights
    .filter(i =>
      i.id !== insight.id &&
      i.personaId === insight.personaId &&
      (i.category === insight.category ||
        i.dataSources.some(ds => insight.dataSources.includes(ds)))
    )
    .slice(0, limit)
}

/**
 * Calculate average certainty for a persona
 */
export function getAverageCertainty(personaId: string): number {
  const personaInsights = allInsights.filter(i => i.personaId === personaId)
  if (personaInsights.length === 0) return 0

  const sum = personaInsights.reduce((acc, i) => acc + i.certainty, 0)
  return sum / personaInsights.length
}

/**
 * Get the highest certainty insights for a persona
 */
export function getTopInsights(
  personaId: string,
  limit: number = 3
): Insight[] {
  return allInsights
    .filter(i => i.personaId === personaId)
    .sort((a, b) => b.certainty - a.certainty)
    .slice(0, limit)
}
