import type { Insight, InsightCategory, InsightVariableType } from '@/types'

/**
 * Filter criteria for insights
 */
export interface InsightFilters {
  personaId?: string
  category?: InsightCategory | InsightCategory[]
  variableTypes?: InsightVariableType[]  // Filter by outcome, load, or marker
  minCertainty?: number
  maxCertainty?: number
  hasHoldoutPreview?: boolean
  dataSources?: string[]
}

/**
 * Insight with computed display properties
 */
export interface InsightWithDisplay extends Insight {
  categoryColor: string
  categoryGradient: string
  certaintyLabel: string
  evidenceLabel: string
  isHighCertainty: boolean
  isPersonalized: boolean
}

/**
 * Insight category metadata
 */
export interface InsightCategoryMeta {
  id: InsightCategory
  label: string
  color: string
  gradient: string
  icon: string
}

/**
 * Insight summary for list views
 */
export interface InsightSummary {
  id: string
  personaId: string
  category: InsightCategory
  title: string
  headline: string
  certainty: number
  personalWeight: number
}

/**
 * Category colors and metadata
 */
export const INSIGHT_CATEGORY_META: Record<InsightCategory, InsightCategoryMeta> = {
  sleep: {
    id: 'sleep',
    label: 'Sleep',
    color: '#8B5CF6',
    gradient: 'bg-gradient-sleep',
    icon: 'Moon',
  },
  metabolic: {
    id: 'metabolic',
    label: 'Metabolic',
    color: '#F97316',
    gradient: 'bg-gradient-metabolic',
    icon: 'Flame',
  },
  cardio: {
    id: 'cardio',
    label: 'Cardio',
    color: '#EC4899',
    gradient: 'bg-gradient-cardio',
    icon: 'Heart',
  },
  recovery: {
    id: 'recovery',
    label: 'Recovery',
    color: '#06B6D4',
    gradient: 'bg-gradient-recovery',
    icon: 'Battery',
  },
  mood: {
    id: 'mood',
    label: 'Mood',
    color: '#10B981',
    gradient: 'bg-gradient-mood',
    icon: 'Smile',
  },
  nutrition: {
    id: 'nutrition',
    label: 'Nutrition',
    color: '#EAB308',
    gradient: 'bg-gradient-nutrition',
    icon: 'Apple',
  },
  cognitive: {
    id: 'cognitive',
    label: 'Cognitive',
    color: '#6366F1',
    gradient: 'bg-gradient-cognitive',
    icon: 'Brain',
  },
  activity: {
    id: 'activity',
    label: 'Activity',
    color: '#22C55E',
    gradient: 'bg-gradient-activity',
    icon: 'Zap',
  },
  stress: {
    id: 'stress',
    label: 'Stress',
    color: '#EF4444',
    gradient: 'bg-gradient-stress',
    icon: 'AlertTriangle',
  },
}

/**
 * Variable type metadata (COMPLE Framework)
 */
export interface InsightVariableTypeMeta {
  id: InsightVariableType
  label: string
  shortLabel: string
  description: string
  color: string
  bgColor: string
  borderColor: string
  icon: string
  domains: InsightCategory[]  // Which domains/categories can appear under this type
}

/**
 * Variable type colors and metadata
 * Based on COMPLE Framework:
 * - Outcomes: What changes daily (sleep, mood, energy, recovery)
 * - Loads: Accumulated state (training load, sleep debt)
 * - Markers: Slow-changing biology (metabolic markers, hormones)
 */
export const INSIGHT_VARIABLE_TYPE_META: Record<InsightVariableType, InsightVariableTypeMeta> = {
  outcome: {
    id: 'outcome',
    label: 'Outcomes',
    shortLabel: 'Outcomes',
    description: 'Daily metrics you care about optimizing',
    color: '#10B981',  // Emerald green
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: 'Target',
    domains: ['sleep', 'recovery', 'mood', 'cognitive', 'activity', 'stress'],
  },
  load: {
    id: 'load',
    label: 'Loads',
    shortLabel: 'Loads',
    description: 'Accumulated state from recent choices',
    color: '#F59E0B',  // Amber
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: 'TrendingUp',
    domains: ['activity', 'recovery', 'stress', 'sleep'],
  },
  marker: {
    id: 'marker',
    label: 'Markers',
    shortLabel: 'Markers',
    description: 'Slow-changing biological markers',
    color: '#8B5CF6',  // Violet
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    icon: 'Activity',
    domains: ['metabolic', 'cardio', 'nutrition'],
  },
}

/**
 * Get domains available for a given variable type
 */
export function getDomainsForVariableType(variableType: InsightVariableType): InsightCategory[] {
  return INSIGHT_VARIABLE_TYPE_META[variableType].domains
}

/**
 * Certainty level labels
 */
export function getCertaintyLabel(certainty: number): string {
  if (certainty >= 0.9) return 'Very High'
  if (certainty >= 0.8) return 'High'
  if (certainty >= 0.7) return 'Moderate'
  if (certainty >= 0.6) return 'Developing'
  return 'Early'
}

/**
 * Check if insight meets certainty threshold
 */
export function meetsThreshold(insight: Insight, threshold: number): boolean {
  return insight.certainty >= threshold
}

/**
 * Get evidence label from weights
 */
export function getEvidenceLabel(personalWeight: number): string {
  const personalPct = Math.round(personalWeight * 100)
  const popPct = 100 - personalPct
  return `${personalPct}% your data, ${popPct}% population`
}
