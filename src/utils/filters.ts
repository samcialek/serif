/**
 * Filter utilities for insights, protocols, and metrics
 */

import type { Insight, Protocol, DailyMetrics, InsightVariableType } from '@/types'

// ============================================================
// INSIGHT FILTERS
// ============================================================

/**
 * Filter insights by certainty threshold
 */
export function filterByCertainty(insights: Insight[], minCertainty: number): Insight[] {
  return insights.filter(insight => insight.certainty >= minCertainty)
}

/**
 * Filter insights by category
 */
export function filterByCategory(insights: Insight[], categories: string[]): Insight[] {
  if (categories.length === 0) return insights
  return insights.filter(insight => categories.includes(insight.category))
}

/**
 * Filter insights by actionability
 */
export function filterByActionable(insights: Insight[], actionableOnly: boolean): Insight[] {
  if (!actionableOnly) return insights
  return insights.filter(insight => insight.actionable)
}

/**
 * Filter insights by status
 */
export function filterByStatus(insights: Insight[], statuses: Insight['status'][]): Insight[] {
  if (statuses.length === 0) return insights
  return insights.filter(insight => statuses.includes(insight.status))
}

/**
 * Filter insights by priority
 */
export function filterByPriority(insights: Insight[], minPriority: number): Insight[] {
  return insights.filter(insight => (insight.priority || 0) >= minPriority)
}

/**
 * Filter insights by variable type (outcome, load, marker)
 */
export function filterByVariableType(insights: Insight[], variableTypes: InsightVariableType[]): Insight[] {
  if (variableTypes.length === 0) return insights
  return insights.filter(insight => variableTypes.includes(insight.variableType))
}

/**
 * Combined insight filter
 */
export interface InsightFilterOptions {
  minCertainty?: number
  categories?: string[]
  variableTypes?: InsightVariableType[]  // Filter by outcome, load, marker
  actionableOnly?: boolean
  statuses?: Insight['status'][]
  minPriority?: number
  searchQuery?: string
}

export function filterInsights(insights: Insight[], options: InsightFilterOptions): Insight[] {
  let filtered = [...insights]

  if (options.minCertainty !== undefined) {
    filtered = filterByCertainty(filtered, options.minCertainty)
  }

  if (options.variableTypes && options.variableTypes.length > 0) {
    filtered = filterByVariableType(filtered, options.variableTypes)
  }

  if (options.categories && options.categories.length > 0) {
    filtered = filterByCategory(filtered, options.categories)
  }

  if (options.actionableOnly) {
    filtered = filterByActionable(filtered, true)
  }

  if (options.statuses && options.statuses.length > 0) {
    filtered = filterByStatus(filtered, options.statuses)
  }

  if (options.minPriority !== undefined) {
    filtered = filterByPriority(filtered, options.minPriority)
  }

  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase()
    filtered = filtered.filter(
      insight =>
        insight.title.toLowerCase().includes(query) ||
        insight.summary?.toLowerCase().includes(query) ||
        insight.narrative?.toLowerCase().includes(query)
    )
  }

  return filtered
}

// ============================================================
// PROTOCOL FILTERS
// ============================================================

/**
 * Filter protocols by category
 */
export function filterProtocolsByCategory(protocols: Protocol[], category: string): Protocol[] {
  if (!category || category === 'all') return protocols
  return protocols.filter(protocol => protocol.category === category)
}

/**
 * Filter protocols by status
 */
export function filterProtocolsByStatus(protocols: Protocol[], status: Protocol['status']): Protocol[] {
  return protocols.filter(protocol => protocol.status === status)
}

/**
 * Filter protocols by difficulty
 */
export function filterProtocolsByDifficulty(protocols: Protocol[], maxDifficulty: number): Protocol[] {
  return protocols.filter(protocol => (protocol.difficulty || 1) <= maxDifficulty)
}

/**
 * Filter protocols by evidence level
 */
export function filterProtocolsByEvidence(protocols: Protocol[], minEvidence: number): Protocol[] {
  return protocols.filter(protocol => (protocol.evidenceLevel || 0) >= minEvidence)
}

/**
 * Combined protocol filter
 */
export interface ProtocolFilterOptions {
  category?: string
  status?: Protocol['status']
  maxDifficulty?: number
  minEvidence?: number
  searchQuery?: string
}

export function filterProtocols(protocols: Protocol[], options: ProtocolFilterOptions): Protocol[] {
  let filtered = [...protocols]

  if (options.category) {
    filtered = filterProtocolsByCategory(filtered, options.category)
  }

  if (options.status) {
    filtered = filterProtocolsByStatus(filtered, options.status)
  }

  if (options.maxDifficulty !== undefined) {
    filtered = filterProtocolsByDifficulty(filtered, options.maxDifficulty)
  }

  if (options.minEvidence !== undefined) {
    filtered = filterProtocolsByEvidence(filtered, options.minEvidence)
  }

  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase()
    filtered = filtered.filter(
      protocol =>
        protocol.title?.toLowerCase().includes(query) ||
        protocol.description?.toLowerCase().includes(query) ||
        protocol.name.toLowerCase().includes(query)
    )
  }

  return filtered
}

// ============================================================
// METRICS FILTERS
// ============================================================

/**
 * Filter metrics by date range
 */
export function filterMetricsByDateRange(
  metrics: DailyMetrics[],
  startDate: string,
  endDate: string
): DailyMetrics[] {
  return metrics.filter(m => m.date >= startDate && m.date <= endDate)
}

/**
 * Filter metrics by days from today
 */
export function filterMetricsByDays(metrics: DailyMetrics[], days: number): DailyMetrics[] {
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - days)

  const startStr = startDate.toISOString().split('T')[0]
  const endStr = today.toISOString().split('T')[0]

  return filterMetricsByDateRange(metrics, startStr, endStr)
}

/**
 * Filter metrics with valid values for a specific key
 */
export function filterMetricsByKey(metrics: DailyMetrics[], key: keyof DailyMetrics): DailyMetrics[] {
  return metrics.filter(m => {
    const value = m[key]
    return value !== undefined && value !== null && (typeof value !== 'number' || !isNaN(value))
  })
}

/**
 * Filter to only metrics with events
 */
export function filterMetricsWithEvents(metrics: DailyMetrics[]): DailyMetrics[] {
  return metrics.filter(m => m.events && m.events.length > 0)
}

// ============================================================
// SORTING UTILITIES
// ============================================================

export type SortDirection = 'asc' | 'desc'

/**
 * Sort insights by various criteria
 */
export function sortInsights(
  insights: Insight[],
  by: 'certainty' | 'priority' | 'date' | 'category',
  direction: SortDirection = 'desc'
): Insight[] {
  const sorted = [...insights].sort((a, b) => {
    let comparison = 0

    switch (by) {
      case 'certainty':
        comparison = a.certainty - b.certainty
        break
      case 'priority':
        comparison = (a.priority || 0) - (b.priority || 0)
        break
      case 'date':
        comparison = new Date(a.discoveredAt ?? '').getTime() - new Date(b.discoveredAt ?? '').getTime()
        break
      case 'category':
        comparison = a.category.localeCompare(b.category)
        break
    }

    return direction === 'desc' ? -comparison : comparison
  })

  return sorted
}

/**
 * Sort protocols by various criteria
 */
export function sortProtocols(
  protocols: Protocol[],
  by: 'difficulty' | 'evidence' | 'name' | 'category',
  direction: SortDirection = 'asc'
): Protocol[] {
  const sorted = [...protocols].sort((a, b) => {
    let comparison = 0

    switch (by) {
      case 'difficulty':
        comparison = (a.difficulty || 1) - (b.difficulty || 1)
        break
      case 'evidence':
        comparison = (a.evidenceLevel || 0) - (b.evidenceLevel || 0)
        break
      case 'name':
        comparison = (a.title ?? a.name).localeCompare(b.title ?? b.name)
        break
      case 'category':
        comparison = (a.category ?? '').localeCompare(b.category ?? '')
        break
    }

    return direction === 'desc' ? -comparison : comparison
  })

  return sorted
}

/**
 * Sort metrics by date
 */
export function sortMetricsByDate(metrics: DailyMetrics[], direction: SortDirection = 'asc'): DailyMetrics[] {
  return [...metrics].sort((a, b) => {
    const comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
    return direction === 'desc' ? -comparison : comparison
  })
}

// ============================================================
// GROUPING UTILITIES
// ============================================================

/**
 * Group insights by category
 */
export function groupInsightsByCategory(insights: Insight[]): Record<string, Insight[]> {
  return insights.reduce(
    (groups, insight) => {
      const category = insight.category
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(insight)
      return groups
    },
    {} as Record<string, Insight[]>
  )
}

/**
 * Group protocols by category
 */
export function groupProtocolsByCategory(protocols: Protocol[]): Record<string, Protocol[]> {
  return protocols.reduce(
    (groups, protocol) => {
      const category = protocol.category
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(protocol)
      return groups
    },
    {} as Record<string, Protocol[]>
  )
}

/**
 * Group metrics by week
 */
export function groupMetricsByWeek(metrics: DailyMetrics[]): Record<string, DailyMetrics[]> {
  return metrics.reduce(
    (groups, metric) => {
      const date = new Date(metric.date)
      // Get the Monday of the week
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(date.setDate(diff))
      const weekKey = monday.toISOString().split('T')[0]

      if (!groups[weekKey]) {
        groups[weekKey] = []
      }
      groups[weekKey].push(metric)
      return groups
    },
    {} as Record<string, DailyMetrics[]>
  )
}

/**
 * Group metrics by month
 */
export function groupMetricsByMonth(metrics: DailyMetrics[]): Record<string, DailyMetrics[]> {
  return metrics.reduce(
    (groups, metric) => {
      const monthKey = metric.date.substring(0, 7) // YYYY-MM
      if (!groups[monthKey]) {
        groups[monthKey] = []
      }
      groups[monthKey].push(metric)
      return groups
    },
    {} as Record<string, DailyMetrics[]>
  )
}

// ============================================================
// SEARCH UTILITIES
// ============================================================

/**
 * Fuzzy match score (0-1)
 */
export function fuzzyMatchScore(text: string, query: string): number {
  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase()

  // Exact match
  if (textLower === queryLower) return 1

  // Contains match
  if (textLower.includes(queryLower)) return 0.8

  // Word match
  const textWords = textLower.split(/\s+/)
  const queryWords = queryLower.split(/\s+/)

  const matchedWords = queryWords.filter(qw => textWords.some(tw => tw.includes(qw)))
  if (matchedWords.length > 0) {
    return 0.5 * (matchedWords.length / queryWords.length)
  }

  return 0
}

/**
 * Search with scoring
 */
export function searchWithScore<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  searchFields: (keyof T)[]
): { item: T; score: number }[] {
  if (!query) return items.map(item => ({ item, score: 1 }))

  return items
    .map(item => {
      const scores = searchFields.map(field => {
        const value = item[field]
        if (typeof value === 'string') {
          return fuzzyMatchScore(value, query)
        }
        return 0
      })
      return { item, score: Math.max(...scores) }
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
}
