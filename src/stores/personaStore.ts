import { create } from 'zustand'
import type { Persona } from '@/types'

interface PersonaState {
  activePersonaId: string
  personas: Persona[]
  isLoading: boolean

  getActivePersona: () => Persona | undefined
  setActivePersona: (id: string) => void
  setPersonas: (personas: Persona[]) => void
}

// Default empty persona for fallback
const defaultPersona: Persona = {
  id: 'default',
  name: 'Loading...',
  avatar: '',
  age: 0,
  archetype: '',
  narrative: '',
  daysOfData: 0,
  devices: [],
  hasBloodwork: false,
  labDraws: 0,
  thresholds: {
    caffeineCutoff: '14:00',
    workoutEndTime: '19:00',
    bedroomTempCeiling: 20,
    eatingWindowHours: 10,
    minSleepHours: 7,
    maxAlcoholUnits: 2,
  },
  currentMetrics: {
    sleepScore: 0,
    deepSleepMin: 0,
    remSleepMin: 0,
    sleepLatencyMin: 0,
    hrv: 0,
    restingHr: 0,
    fastingGlucose: 0,
    weight: 0,
    trainingLoad: 'optimal',
  },
  tags: [],
}

export const usePersonaStore = create<PersonaState>((set, get) => ({
  activePersonaId: 'rajan',
  personas: [],
  isLoading: true,

  getActivePersona: () => {
    const { activePersonaId, personas } = get()
    return personas.find(p => p.id === activePersonaId) || personas[0] || defaultPersona
  },

  setActivePersona: (id) => set({ activePersonaId: id }),

  setPersonas: (personas) => set({ personas, isLoading: false }),
}))

// Selector hooks for common operations
export const useActivePersona = () => {
  const personas = usePersonaStore(state => state.personas)
  const activePersonaId = usePersonaStore(state => state.activePersonaId)
  return personas.find(p => p.id === activePersonaId) || personas[0]
}

export const usePersonaList = () => {
  return usePersonaStore(state => state.personas)
}

export const usePersonaById = (id: string) => {
  const personas = usePersonaStore(state => state.personas)
  return personas.find(p => p.id === id)
}
