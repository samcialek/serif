import type { Persona, Insight, DailyMetrics, LabResult, Protocol, DailyPlan, Campaign } from '@/types'
import type { PersonaData, PersonaRegistryEntry } from './types'

// Import all persona data
import {
  rajanPersona,
  rajanInsights,
  rajanMetrics,
  rajanLabs,
  rajanProtocols,
  rajanDailyPlan,
} from './rajan'

import {
  sarahPersona,
  sarahInsights,
  sarahMetrics,
  sarahLabs,
  sarahProtocols,
  sarahDailyPlan,
} from './sarah'

import {
  marcusPersona,
  marcusInsights,
  marcusMetrics,
  marcusLabs,
  marcusProtocols,
  marcusDailyPlan,
} from './marcus'

import {
  emmaPersona,
  emmaInsights,
  emmaMetrics,
  emmaLabs,
  emmaProtocols,
  emmaDailyPlan,
} from './emma'

import {
  oronPersona,
  oronInsights,
  oronMetrics,
  oronLabs,
  oronProtocols,
  oronDailyPlan,
} from './oron'

import { oronCampaigns } from '@/data/oronCampaigns'

// Export individual personas
export {
  rajanPersona,
  rajanInsights,
  rajanMetrics,
  rajanLabs,
  rajanProtocols,
  rajanDailyPlan,
  sarahPersona,
  sarahInsights,
  sarahMetrics,
  sarahLabs,
  sarahProtocols,
  sarahDailyPlan,
  marcusPersona,
  marcusInsights,
  marcusMetrics,
  marcusLabs,
  marcusProtocols,
  marcusDailyPlan,
  emmaPersona,
  emmaInsights,
  emmaMetrics,
  emmaLabs,
  emmaProtocols,
  emmaDailyPlan,
  oronPersona,
  oronInsights,
  oronMetrics,
  oronLabs,
  oronProtocols,
  oronDailyPlan,
  oronCampaigns,
}

// Aggregated exports
export const personas: Persona[] = [
  rajanPersona,
  sarahPersona,
  marcusPersona,
  emmaPersona,
  oronPersona,
]

export const allInsights: Insight[] = [
  ...rajanInsights,
  ...sarahInsights,
  ...marcusInsights,
  ...emmaInsights,
  ...oronInsights,
]

export const allProtocols: Protocol[] = [
  ...rajanProtocols,
  ...sarahProtocols,
  ...marcusProtocols,
  ...emmaProtocols,
  ...oronProtocols,
]

// Complete persona data bundles
export const personaDataMap: Record<string, PersonaData> = {
  rajan: {
    persona: rajanPersona,
    insights: rajanInsights,
    metrics: rajanMetrics,
    labs: rajanLabs,
    protocols: rajanProtocols,
    dailyPlan: rajanDailyPlan,
  },
  sarah: {
    persona: sarahPersona,
    insights: sarahInsights,
    metrics: sarahMetrics,
    labs: sarahLabs,
    protocols: sarahProtocols,
    dailyPlan: sarahDailyPlan,
  },
  marcus: {
    persona: marcusPersona,
    insights: marcusInsights,
    metrics: marcusMetrics,
    labs: marcusLabs,
    protocols: marcusProtocols,
    dailyPlan: marcusDailyPlan,
  },
  emma: {
    persona: emmaPersona,
    insights: emmaInsights,
    metrics: emmaMetrics,
    labs: emmaLabs,
    protocols: emmaProtocols,
    dailyPlan: emmaDailyPlan,
  },
  oron: {
    persona: oronPersona,
    insights: oronInsights,
    metrics: oronMetrics,
    labs: oronLabs,
    protocols: oronProtocols,
    dailyPlan: oronDailyPlan,
    campaigns: oronCampaigns,
  },
}

// Quick lookup registry
export const personaRegistry: PersonaRegistryEntry[] = personas.map(p => ({
  id: p.id,
  name: p.name,
  archetype: p.archetype,
  avatar: p.avatar,
  tags: p.tags,
}))

// Helper functions
export function getAllPersonas(): Persona[] {
  return personas
}

export function getPersonaById(id: string): Persona | undefined {
  return personas.find(p => p.id === id)
}

export function getPersonaData(id: string): PersonaData | undefined {
  return personaDataMap[id]
}

export function getInsightsForPersona(personaId: string): Insight[] {
  return allInsights.filter(i => i.personaId === personaId)
}

export function getProtocolsForPersona(personaId: string): Protocol[] {
  return allProtocols.filter(p => p.personaId === personaId)
}

export function getMetricsForPersona(personaId: string): DailyMetrics[] {
  return personaDataMap[personaId]?.metrics ?? []
}

export function getLabsForPersona(personaId: string): LabResult[] {
  return personaDataMap[personaId]?.labs ?? []
}

export function getDailyPlanForPersona(personaId: string): DailyPlan | undefined {
  return personaDataMap[personaId]?.dailyPlan
}

export function getCampaignsForPersona(personaId: string): Campaign[] {
  return personaDataMap[personaId]?.campaigns ?? []
}

// Re-export types
export type { PersonaData, PersonaRegistryEntry } from './types'
