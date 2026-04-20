import type { Persona, Insight, DailyMetrics, LabResult, Protocol, DailyPlan, Campaign } from '@/types'

/**
 * Complete persona data bundle including all associated data
 */
export interface PersonaData {
  persona: Persona
  insights: Insight[]
  metrics: DailyMetrics[]
  labs: LabResult[]
  protocols: Protocol[]
  dailyPlan: DailyPlan
  campaigns?: Campaign[]
}

/**
 * Persona registry entry for quick lookup
 */
export interface PersonaRegistryEntry {
  id: string
  name: string
  archetype: string
  avatar: string
  tags: string[]
}

/**
 * Narrative arc types for data generation
 */
export type NarrativeArc =
  | 'baseline'           // Stable good performance
  | 'declining'          // Recent regression
  | 'improving'          // Positive trend
  | 'disrupted'          // External disruption (travel, stress)
  | 'experimenting'      // Trying new interventions

/**
 * Data generation config for a persona
 */
export interface PersonaDataConfig {
  daysOfData: number
  narrativeArc: NarrativeArc
  baselineMetrics: Partial<DailyMetrics>
  disruptions?: {
    startDay: number
    endDay: number
    type: string
    effect: Partial<DailyMetrics>
  }[]
}
