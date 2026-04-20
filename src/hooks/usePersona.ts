/**
 * Hook for managing persona state and data
 */

import { useMemo, useCallback } from 'react'
import { usePersonaStore } from '@/stores/personaStore'
import { getPersonaById, getAllPersonas, getMetricsForPersona } from '@/data/personas'
import type { Persona, DailyMetrics } from '@/types'

export interface UsePersonaReturn {
  // Current persona
  activePersona: Persona | null
  activePersonaId: string

  // All personas
  personas: Persona[]

  // Persona actions
  setPersona: (id: string) => void
  nextPersona: () => void
  previousPersona: () => void

  // Data access
  getMetrics: () => DailyMetrics[]
  getRecentMetrics: (days: number) => DailyMetrics[]
  getLatestMetric: () => DailyMetrics | null

  // Persona info helpers
  getDaysOfData: () => number
  getEvidenceWeight: () => number
  isNewUser: () => boolean
}

export function usePersona(): UsePersonaReturn {
  const { activePersonaId, setActivePersona } = usePersonaStore()

  // Get all personas
  const personas = useMemo(() => getAllPersonas(), [])

  // Get active persona
  const activePersona = useMemo(() => {
    return getPersonaById(activePersonaId) ?? null
  }, [activePersonaId])

  // Set persona by ID
  const setPersona = useCallback(
    (id: string) => {
      setActivePersona(id)
    },
    [setActivePersona]
  )

  // Navigate to next persona
  const nextPersona = useCallback(() => {
    const currentIndex = personas.findIndex(p => p.id === activePersonaId)
    const nextIndex = (currentIndex + 1) % personas.length
    setActivePersona(personas[nextIndex].id)
  }, [activePersonaId, personas, setActivePersona])

  // Navigate to previous persona
  const previousPersona = useCallback(() => {
    const currentIndex = personas.findIndex(p => p.id === activePersonaId)
    const prevIndex = currentIndex === 0 ? personas.length - 1 : currentIndex - 1
    setActivePersona(personas[prevIndex].id)
  }, [activePersonaId, personas, setActivePersona])

  // Get all metrics for current persona
  const getMetrics = useCallback(() => {
    return getMetricsForPersona(activePersonaId)
  }, [activePersonaId])

  // Get recent metrics (last N days)
  const getRecentMetrics = useCallback(
    (days: number) => {
      const metrics = getMetricsForPersona(activePersonaId)
      return metrics.slice(-days)
    },
    [activePersonaId]
  )

  // Get latest metric
  const getLatestMetric = useCallback(() => {
    const metrics = getMetricsForPersona(activePersonaId)
    return metrics.length > 0 ? metrics[metrics.length - 1] : null
  }, [activePersonaId])

  // Get days of data
  const getDaysOfData = useCallback(() => {
    if (!activePersona) return 0
    return activePersona.dataContext?.daysOfData ?? activePersona.daysOfData
  }, [activePersona])

  // Get evidence weight (personal vs population)
  const getEvidenceWeight = useCallback(() => {
    if (!activePersona) return 0
    return activePersona.dataContext?.evidenceWeight ?? 0.7
  }, [activePersona])

  // Check if new user (< 14 days)
  const isNewUser = useCallback(() => {
    if (!activePersona) return true
    return (activePersona.dataContext?.daysOfData ?? activePersona.daysOfData) < 14
  }, [activePersona])

  return {
    activePersona,
    activePersonaId,
    personas,
    setPersona,
    nextPersona,
    previousPersona,
    getMetrics,
    getRecentMetrics,
    getLatestMetric,
    getDaysOfData,
    getEvidenceWeight,
    isNewUser,
  }
}

/**
 * Hook for persona comparison
 */
export function usePersonaComparison(personaIds: string[]) {
  const comparisonData = useMemo(() => {
    return personaIds.map(id => {
      const persona = getPersonaById(id)
      const metrics = getMetricsForPersona(id)
      return { persona, metrics }
    })
  }, [personaIds])

  return comparisonData
}

/**
 * Hook for persona thresholds
 */
export function usePersonaThresholds() {
  const { activePersonaId } = usePersonaStore()

  const thresholds = useMemo(() => {
    const persona = getPersonaById(activePersonaId)
    if (!persona) {
      return {
        caffeineCutoff: '14:00',
        alcoholLimit: 2,
        exerciseCutoff: '19:00',
        screenCutoff: '22:00',
        bedtimeTarget: '22:30',
      }
    }
    return persona.thresholds
  }, [activePersonaId])

  return thresholds
}

export default usePersona
