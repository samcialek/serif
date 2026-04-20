/**
 * Hook for managing protocols with filtering and what-if simulation
 */

import { useMemo, useState, useCallback } from 'react'
import { usePersonaStore } from '@/stores/personaStore'
import { getProtocolsForPersona, getPersonaById } from '@/data/personas'
import {
  filterProtocols,
  sortProtocols,
  groupProtocolsByCategory,
  type ProtocolFilterOptions,
  type SortDirection,
} from '@/utils/filters'
import type { Protocol } from '@/types'

export type ProtocolSortKey = 'difficulty' | 'evidence' | 'name' | 'category'

export interface UseProtocolsOptions {
  initialCategory?: string
  initialStatus?: Protocol['status']
  initialSort?: ProtocolSortKey
}

export interface UseProtocolsReturn {
  // Filtered and sorted protocols
  protocols: Protocol[]
  allProtocols: Protocol[]

  // Filter state
  category: string
  setCategory: (category: string) => void
  status: Protocol['status'] | null
  setStatus: (status: Protocol['status'] | null) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  maxDifficulty: number
  setMaxDifficulty: (value: number) => void

  // Sort state
  sortBy: ProtocolSortKey
  setSortBy: (key: ProtocolSortKey) => void
  sortDirection: SortDirection
  setSortDirection: (direction: SortDirection) => void

  // Grouped data
  protocolsByCategory: Record<string, Protocol[]>
  protocolsByStatus: {
    active: Protocol[]
    suggested: Protocol[]
    completed: Protocol[]
  }

  // Stats
  totalCount: number
  filteredCount: number
  activeCount: number
  suggestedCount: number

  // Actions
  resetFilters: () => void
  getProtocolById: (id: string) => Protocol | undefined
}

export function useProtocols(options: UseProtocolsOptions = {}): UseProtocolsReturn {
  const { activePersonaId } = usePersonaStore()

  // Filter state
  const [category, setCategory] = useState(options.initialCategory ?? 'all')
  const [status, setStatus] = useState<Protocol['status'] | null>(options.initialStatus ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const [maxDifficulty, setMaxDifficulty] = useState(5)

  // Sort state
  const [sortBy, setSortBy] = useState<ProtocolSortKey>(options.initialSort ?? 'difficulty')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Get all protocols for persona
  const allProtocols = useMemo(() => {
    return getProtocolsForPersona(activePersonaId)
  }, [activePersonaId])

  // Reset filters to defaults
  const resetFilters = useCallback(() => {
    setCategory('all')
    setStatus(null)
    setSearchQuery('')
    setMaxDifficulty(5)
    setSortBy('difficulty')
    setSortDirection('asc')
  }, [])

  // Apply filters
  const filterOptions: ProtocolFilterOptions = useMemo(
    () => ({
      category: category !== 'all' ? category : undefined,
      status: status ?? undefined,
      searchQuery: searchQuery || undefined,
      maxDifficulty,
    }),
    [category, status, searchQuery, maxDifficulty]
  )

  // Filtered and sorted protocols
  const protocols = useMemo(() => {
    const filtered = filterProtocols(allProtocols, filterOptions)
    return sortProtocols(filtered, sortBy, sortDirection)
  }, [allProtocols, filterOptions, sortBy, sortDirection])

  // Group by category
  const protocolsByCategory = useMemo(() => {
    return groupProtocolsByCategory(protocols)
  }, [protocols])

  // Group by status
  const protocolsByStatus = useMemo(() => {
    return {
      active: allProtocols.filter(p => p.status === 'active'),
      suggested: allProtocols.filter(p => p.status === 'suggested'),
      completed: allProtocols.filter(p => p.status === 'completed'),
    }
  }, [allProtocols])

  // Get protocol by ID
  const getProtocolById = useCallback(
    (id: string) => {
      return allProtocols.find(p => p.id === id)
    },
    [allProtocols]
  )

  return {
    protocols,
    allProtocols,
    category,
    setCategory,
    status,
    setStatus,
    searchQuery,
    setSearchQuery,
    maxDifficulty,
    setMaxDifficulty,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    protocolsByCategory,
    protocolsByStatus,
    totalCount: allProtocols.length,
    filteredCount: protocols.length,
    activeCount: protocolsByStatus.active.length,
    suggestedCount: protocolsByStatus.suggested.length,
    resetFilters,
    getProtocolById,
  }
}

/**
 * Hook for protocol categories
 */
export function useProtocolCategories() {
  const { activePersonaId } = usePersonaStore()

  const categories = useMemo(() => {
    const protocols = getProtocolsForPersona(activePersonaId)
    const categorySet = new Set(protocols.map(p => p.category))
    return Array.from(categorySet).sort()
  }, [activePersonaId])

  return categories
}

/**
 * Hook for active protocols (for daily plan)
 */
export function useActiveProtocols() {
  const { activePersonaId } = usePersonaStore()

  const activeProtocols = useMemo(() => {
    const protocols = getProtocolsForPersona(activePersonaId)
    return protocols.filter(p => p.status === 'active')
  }, [activePersonaId])

  return activeProtocols
}

/**
 * Hook for suggested protocols
 */
export function useSuggestedProtocols() {
  const { activePersonaId } = usePersonaStore()

  const suggestedProtocols = useMemo(() => {
    const protocols = getProtocolsForPersona(activePersonaId)
    return protocols
      .filter(p => p.status === 'suggested')
      .sort((a, b) => (b.evidenceLevel || 0) - (a.evidenceLevel || 0))
  }, [activePersonaId])

  return suggestedProtocols
}

/**
 * Hook for protocol detail
 */
export function useProtocolDetail(protocolId: string) {
  const { activePersonaId } = usePersonaStore()

  const protocol = useMemo(() => {
    const protocols = getProtocolsForPersona(activePersonaId)
    return protocols.find(p => p.id === protocolId)
  }, [activePersonaId, protocolId])

  const persona = useMemo(() => {
    return getPersonaById(activePersonaId)
  }, [activePersonaId])

  // Get related protocols (same category)
  const relatedProtocols = useMemo(() => {
    if (!protocol) return []
    const protocols = getProtocolsForPersona(activePersonaId)
    return protocols
      .filter(p => p.category === protocol.category && p.id !== protocolId)
      .slice(0, 3)
  }, [activePersonaId, protocol, protocolId])

  return {
    protocol,
    persona,
    relatedProtocols,
  }
}

export default useProtocols
