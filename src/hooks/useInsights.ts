/**
 * Hook for managing insights with filtering and sorting
 */

import { useMemo, useState, useCallback } from 'react'
import { usePersonaStore } from '@/stores/personaStore'
import { useDemoStore } from '@/stores/demoStore'
import { getInsightsForPersona, getPersonaById } from '@/data/personas'
import {
  filterInsights,
  sortInsights,
  groupInsightsByCategory,
  type InsightFilterOptions,
  type SortDirection,
} from '@/utils/filters'
import type { Insight, InsightVariableType } from '@/types'

export type InsightSortKey = 'certainty' | 'priority' | 'date' | 'category'

export interface UseInsightsOptions {
  initialMinCertainty?: number
  initialCategories?: string[]
  initialVariableTypes?: InsightVariableType[]
  initialSort?: InsightSortKey
  initialSortDirection?: SortDirection
}

export interface UseInsightsReturn {
  // Filtered and sorted insights
  insights: Insight[]
  allInsights: Insight[]

  // Filter state
  minCertainty: number
  setMinCertainty: (value: number) => void
  variableTypes: InsightVariableType[]
  setVariableTypes: (types: InsightVariableType[]) => void
  toggleVariableType: (type: InsightVariableType) => void
  categories: string[]
  setCategories: (categories: string[]) => void
  toggleCategory: (category: string) => void
  actionableOnly: boolean
  setActionableOnly: (value: boolean) => void
  searchQuery: string
  setSearchQuery: (query: string) => void

  // Sort state
  sortBy: InsightSortKey
  setSortBy: (key: InsightSortKey) => void
  sortDirection: SortDirection
  setSortDirection: (direction: SortDirection) => void

  // Grouped data
  insightsByCategory: Record<string, Insight[]>

  // Stats
  totalCount: number
  filteredCount: number
  categoryStats: { category: string; count: number; avgCertainty: number }[]

  // Actions
  resetFilters: () => void
  getInsightById: (id: string) => Insight | undefined
}

export function useInsights(options: UseInsightsOptions = {}): UseInsightsReturn {
  const { activePersonaId } = usePersonaStore()
  const { certaintyThreshold } = useDemoStore()

  // Default certainty from global store or option
  // certaintyThreshold is 0-100 (percentage), convert to 0-1 for filtering
  const defaultCertainty = options.initialMinCertainty ?? (certaintyThreshold / 100)

  // Filter state
  const [minCertainty, setMinCertainty] = useState(defaultCertainty)
  const [variableTypes, setVariableTypes] = useState<InsightVariableType[]>(options.initialVariableTypes ?? [])
  const [categories, setCategories] = useState<string[]>(options.initialCategories ?? [])
  const [actionableOnly, setActionableOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Sort state
  const [sortBy, setSortBy] = useState<InsightSortKey>(options.initialSort ?? 'certainty')
  const [sortDirection, setSortDirection] = useState<SortDirection>(options.initialSortDirection ?? 'desc')

  // Get all insights for persona
  const allInsights = useMemo(() => {
    return getInsightsForPersona(activePersonaId)
  }, [activePersonaId])

  // Toggle variable type selection
  const toggleVariableType = useCallback((type: InsightVariableType) => {
    setVariableTypes(prev => {
      if (prev.includes(type)) {
        return prev.filter(t => t !== type)
      }
      return [...prev, type]
    })
  }, [])

  // Toggle category selection
  const toggleCategory = useCallback((category: string) => {
    setCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category)
      }
      return [...prev, category]
    })
  }, [])

  // Reset filters to defaults
  const resetFilters = useCallback(() => {
    setMinCertainty(defaultCertainty)
    setVariableTypes([])
    setCategories([])
    setActionableOnly(false)
    setSearchQuery('')
    setSortBy('certainty')
    setSortDirection('desc')
  }, [defaultCertainty])

  // Apply filters
  const filterOptions: InsightFilterOptions = useMemo(
    () => ({
      minCertainty,
      variableTypes: variableTypes.length > 0 ? variableTypes : undefined,
      categories: categories.length > 0 ? categories : undefined,
      actionableOnly,
      searchQuery: searchQuery || undefined,
    }),
    [minCertainty, variableTypes, categories, actionableOnly, searchQuery]
  )

  // Filtered and sorted insights
  const insights = useMemo(() => {
    const filtered = filterInsights(allInsights, filterOptions)
    return sortInsights(filtered, sortBy, sortDirection)
  }, [allInsights, filterOptions, sortBy, sortDirection])

  // Group by category
  const insightsByCategory = useMemo(() => {
    return groupInsightsByCategory(insights)
  }, [insights])

  // Calculate category stats
  const categoryStats = useMemo(() => {
    const grouped = groupInsightsByCategory(allInsights)
    return Object.entries(grouped).map(([category, categoryInsights]) => ({
      category,
      count: categoryInsights.length,
      avgCertainty:
        categoryInsights.reduce((sum, i) => sum + i.certainty, 0) / categoryInsights.length,
    }))
  }, [allInsights])

  // Get insight by ID
  const getInsightById = useCallback(
    (id: string) => {
      return allInsights.find(i => i.id === id)
    },
    [allInsights]
  )

  return {
    insights,
    allInsights,
    minCertainty,
    setMinCertainty,
    variableTypes,
    setVariableTypes,
    toggleVariableType,
    categories,
    setCategories,
    toggleCategory,
    actionableOnly,
    setActionableOnly,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    insightsByCategory,
    totalCount: allInsights.length,
    filteredCount: insights.length,
    categoryStats,
    resetFilters,
    getInsightById,
  }
}

/**
 * Hook for high-priority insights (for daily plan)
 */
export function useHighPriorityInsights(maxCount: number = 3) {
  const { activePersonaId } = usePersonaStore()
  const { certaintyThreshold } = useDemoStore()

  const priorityInsights = useMemo(() => {
    const insights = getInsightsForPersona(activePersonaId)
    // certaintyThreshold is 0-100, insights have certainty as 0-1
    return insights
      .filter(i => i.certainty >= (certaintyThreshold / 100) && i.actionable)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .slice(0, maxCount)
  }, [activePersonaId, certaintyThreshold, maxCount])

  return priorityInsights
}

/**
 * Hook for insight details
 */
export function useInsightDetail(insightId: string) {
  const { activePersonaId } = usePersonaStore()

  const insight = useMemo(() => {
    const insights = getInsightsForPersona(activePersonaId)
    return insights.find(i => i.id === insightId)
  }, [activePersonaId, insightId])

  const persona = useMemo(() => {
    return getPersonaById(activePersonaId)
  }, [activePersonaId])

  // Get related insights (same category)
  const relatedInsights = useMemo(() => {
    if (!insight) return []
    const insights = getInsightsForPersona(activePersonaId)
    return insights.filter(i => i.category === insight.category && i.id !== insightId).slice(0, 3)
  }, [activePersonaId, insight, insightId])

  return {
    insight,
    persona,
    relatedInsights,
  }
}

export default useInsights
