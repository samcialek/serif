/**
 * Hook for What-If simulator functionality.
 *
 * Uses the Twin SCM engine for counterfactual analysis when the
 * intervention maps to a known DAG node. Falls back to linear
 * approximation for unmapped behavioral interventions.
 */

import { useState, useMemo, useCallback } from 'react'
import { useDemoStore } from '@/stores/demoStore'
import { usePersonaStore } from '@/stores/personaStore'
import { getPersonaById, getMetricsForPersona } from '@/data/personas'
import { delay } from '@/utils/simulateDelay'
import { useSCM } from './useSCM'
import type { PathwayEffect, IdentificationResult } from '@/data/scm/types'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import { friendlyName } from '@/data/scm/fullCounterfactual'

export interface SimulatorInput {
  intervention: string
  currentValue: number
  proposedValue: number
  unit: string
}

export interface SimulatorResultDisplay {
  metric: string
  /** DAG node ID (set when usedSCM = true) */
  nodeId?: string
  baseline: number
  projected: number
  change: number
  changePercent: number
  certainty: number
  timeToEffect: string
  confidenceInterval: {
    low: number
    high: number
  }
  // SCM-specific fields (populated when DAG-based computation is used)
  pathwayDecomposition?: PathwayEffect[]
  identificationStrategy?: 'backdoor' | 'frontdoor' | 'unidentified'
  adjustmentSet?: string[]
  usedSCM?: boolean
}

/**
 * Maps behavioral intervention IDs to SCM DAG node IDs.
 * Interventions not in this map fall back to linear approximation.
 */
const INTERVENTION_TO_NODE: Record<string, string> = {
  // Behavioral presets → DAG nodes
  caffeine_cutoff: 'bedtime',
  exercise_time: 'workout_time',
  bedtime_variance: 'sleep_debt',
  alcohol_drinks: 'sleep_quality',
  screen_cutoff: 'bedtime',
  // Direct DAG node interventions
  running_volume: 'running_volume',
  zone2_volume: 'zone2_volume',
  training_load: 'training_load',
  sleep_duration: 'sleep_duration',
  training_volume: 'training_volume',
  daily_steps: 'steps',
  bedtime: 'bedtime',
  active_energy: 'active_energy',
}

export interface UseSimulatorReturn {
  // State
  inputs: SimulatorInput[]
  results: SimulatorResultDisplay[]
  /** The uncollapsed counterfactual state — all downstream effects, category grouping, tradeoffs */
  fullState: FullCounterfactualState | null
  isSimulating: boolean
  hasRun: boolean
  combinedImpact: {
    totalChange: number
    interactions: string[]
    netCertainty: number
  } | null

  // Actions
  setInput: (index: number, input: Partial<SimulatorInput>) => void
  addInput: (input: SimulatorInput) => void
  removeInput: (index: number) => void
  clearInputs: () => void
  runSimulation: () => Promise<void>
  resetSimulation: () => void

  // Presets
  loadPreset: (presetName: string) => void
  availablePresets: string[]
}

// Preset scenarios for quick testing
const SIMULATOR_PRESETS: Record<string, SimulatorInput[]> = {
  // ── Behavioral presets (original) ──
  'caffeine-cutoff': [
    { intervention: 'caffeine_cutoff', currentValue: 16, proposedValue: 14, unit: 'hour' },
  ],
  'exercise-timing': [
    { intervention: 'exercise_time', currentValue: 19, proposedValue: 17, unit: 'hour' },
  ],
  'sleep-consistency': [
    { intervention: 'bedtime_variance', currentValue: 60, proposedValue: 30, unit: 'min' },
  ],
  'alcohol-reduction': [
    { intervention: 'alcohol_drinks', currentValue: 2, proposedValue: 0, unit: 'drinks' },
  ],
  'combined-sleep': [
    { intervention: 'caffeine_cutoff', currentValue: 16, proposedValue: 14, unit: 'hour' },
    { intervention: 'screen_cutoff', currentValue: 23, proposedValue: 21.5, unit: 'hour' },
    { intervention: 'alcohol_drinks', currentValue: 2, proposedValue: 1, unit: 'drinks' },
  ],
  // ── SCM-native presets (use DAG nodes directly) ──
  'increase-running': [
    { intervention: 'running_volume', currentValue: 120, proposedValue: 200, unit: 'km/month' },
  ],
  'add-zone2': [
    { intervention: 'zone2_volume', currentValue: 30, proposedValue: 90, unit: 'min/week' },
  ],
  'more-sleep': [
    { intervention: 'sleep_duration', currentValue: 6.5, proposedValue: 7.5, unit: 'hours' },
  ],
  'reduce-training-load': [
    { intervention: 'training_load', currentValue: 800, proposedValue: 500, unit: 'TRIMP' },
  ],
}

export function useSimulator(): UseSimulatorReturn {
  const { activePersonaId } = usePersonaStore()
  const { addToast } = useDemoStore()
  const { runFullCounterfactual, identify } = useSCM()

  const [inputs, setInputs] = useState<SimulatorInput[]>([
    { intervention: 'caffeine_cutoff', currentValue: 16, proposedValue: 14, unit: 'hour' },
  ])
  const [results, setResults] = useState<SimulatorResultDisplay[]>([])
  const [fullState, setFullState] = useState<FullCounterfactualState | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  // Get persona for sensitivity modifiers
  const persona = useMemo(() => getPersonaById(activePersonaId), [activePersonaId])
  const metrics = useMemo(() => getMetricsForPersona(activePersonaId), [activePersonaId])

  // Calculate combined impact from results — uses tradeoffs from full state when available
  const combinedImpact = useMemo(() => {
    if (results.length === 0) return null
    const totalChange = results.reduce((sum, r) => sum + r.change, 0)
    const netCertainty = results.reduce((sum, r) => sum + r.certainty, 0) / results.length

    const interactions: string[] = []
    if (fullState?.tradeoffs && fullState.tradeoffs.length > 0) {
      for (const t of fullState.tradeoffs) {
        interactions.push(t.description)
      }
    } else if (results.length > 1) {
      interactions.push('Stacking effects may compound via causal pathways')
    }

    return { totalChange, interactions, netCertainty }
  }, [results, fullState])

  // Set a specific input
  const setInput = useCallback((index: number, updates: Partial<SimulatorInput>) => {
    setInputs(prev => {
      const newInputs = [...prev]
      newInputs[index] = { ...newInputs[index], ...updates }
      return newInputs
    })
    setHasRun(false)
  }, [])

  // Add a new input
  const addInput = useCallback((input: SimulatorInput) => {
    setInputs(prev => [...prev, input])
    setHasRun(false)
  }, [])

  // Remove an input
  const removeInput = useCallback((index: number) => {
    setInputs(prev => prev.filter((_, i) => i !== index))
    setHasRun(false)
  }, [])

  // Clear all inputs
  const clearInputs = useCallback(() => {
    setInputs([])
    setResults([])
    setHasRun(false)
  }, [])

  // Run the simulation — batches all SCM-mapped interventions into ONE engine call
  const runSimulation = useCallback(async () => {
    if (inputs.length === 0) {
      addToast({ title: 'Add at least one intervention to simulate', type: 'error' })
      return
    }

    setIsSimulating(true)

    try {
      // Brief delay for UX feedback
      await delay(400)

      const newResults: SimulatorResultDisplay[] = []

      // Get baseline sleep score from metrics (for linear fallback)
      const recentMetrics = metrics.slice(-7)
      const baselineSleepScore = recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.sleepScore, 0) / recentMetrics.length
        : 72
      const personalSensitivity = persona?.dataContext?.evidenceWeight ?? 0.7

      // Separate SCM-mappable inputs from fallback inputs
      const scmInputs: SimulatorInput[] = []
      const fallbackInputs: SimulatorInput[] = []

      for (const input of inputs) {
        if (INTERVENTION_TO_NODE[input.intervention]) {
          scmInputs.push(input)
        } else {
          fallbackInputs.push(input)
        }
      }

      // ── ONE batched SCM call for all DAG-mapped interventions ──
      let state: FullCounterfactualState | null = null

      if (scmInputs.length > 0) {
        // Build observed values from ALL intervention nodes
        const observedValues: Record<string, number> = {}
        const interventions = scmInputs.map(input => {
          const dagNode = INTERVENTION_TO_NODE[input.intervention]
          observedValues[dagNode] = input.currentValue
          return {
            nodeId: dagNode,
            value: input.proposedValue,
            originalValue: input.currentValue,
          }
        })

        state = runFullCounterfactual(observedValues, interventions)

        // Convert NodeEffects to display results
        for (const [nodeId, effect] of state.allEffects) {
          const identification = identify(
            interventions[0].nodeId,
            nodeId
          )

          newResults.push({
            metric: friendlyName(nodeId),
            nodeId,
            baseline: effect.factualValue,
            projected: effect.counterfactualValue,
            change: effect.totalEffect,
            changePercent: effect.factualValue !== 0
              ? (effect.totalEffect / Math.abs(effect.factualValue)) * 100
              : 0,
            certainty: identification.strategy === 'unidentified' ? 0.4 : 0.75,
            timeToEffect: '3-14 days',
            confidenceInterval: effect.confidenceInterval,
            pathwayDecomposition: effect.pathways,
            identificationStrategy: effect.identification.strategy,
            adjustmentSet: effect.identification.adjustmentSet,
            usedSCM: true,
          })
        }
      }

      // ── Linear fallback for non-DAG inputs ──
      for (const input of fallbackInputs) {
        const change = (input.proposedValue - input.currentValue) * personalSensitivity * 0.5
        const projected = baselineSleepScore + change

        newResults.push({
          metric: input.intervention,
          baseline: baselineSleepScore,
          projected,
          change,
          changePercent: (change / baselineSleepScore) * 100,
          certainty: 0.6 + personalSensitivity * 0.2,
          timeToEffect: '3-7 days',
          confidenceInterval: { low: projected - 2, high: projected + 2 },
          usedSCM: false,
        })
      }

      // Sort by absolute effect magnitude (biggest movers first)
      newResults.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

      setFullState(state)
      setResults(newResults)
      setHasRun(true)
      addToast({ title: 'Counterfactual analysis complete', type: 'success' })
    } catch (error) {
      addToast({ title: 'Simulation failed', type: 'error' })
      console.error('Simulation error:', error)
    } finally {
      setIsSimulating(false)
    }
  }, [inputs, metrics, persona, addToast, runFullCounterfactual, identify])

  // Reset simulation
  const resetSimulation = useCallback(() => {
    setResults([])
    setFullState(null)
    setHasRun(false)
  }, [])

  // Load a preset
  const loadPreset = useCallback((presetName: string) => {
    const preset = SIMULATOR_PRESETS[presetName]
    if (preset) {
      setInputs([...preset])
      setResults([])
      setHasRun(false)
    }
  }, [])

  return {
    inputs,
    results,
    fullState,
    isSimulating,
    hasRun,
    combinedImpact,
    setInput,
    addInput,
    removeInput,
    clearInputs,
    runSimulation,
    resetSimulation,
    loadPreset,
    availablePresets: Object.keys(SIMULATOR_PRESETS),
  }
}

/**
 * Hook for quick What-If check (single intervention)
 */
export function useQuickSimulation(intervention: string) {
  const { activePersonaId } = usePersonaStore()
  const [result, setResult] = useState<SimulatorResultDisplay | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)

  const metrics = useMemo(() => getMetricsForPersona(activePersonaId), [activePersonaId])
  const persona = useMemo(() => getPersonaById(activePersonaId), [activePersonaId])

  const simulate = useCallback(
    async (currentValue: number, proposedValue: number) => {
      setIsSimulating(true)

      await delay(400)

      const recentMetrics = metrics.slice(-7)
      const baseline = recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.sleepScore, 0) / recentMetrics.length
        : 72

      const sensitivity = persona?.dataContext?.evidenceWeight ?? 0.7
      const change = (proposedValue - currentValue) * sensitivity * 0.5
      const projected = baseline + change

      setResult({
        metric: intervention,
        baseline,
        projected,
        change,
        changePercent: (change / baseline) * 100,
        certainty: 0.6 + sensitivity * 0.2,
        timeToEffect: '3-7 days',
        confidenceInterval: {
          low: projected - 2,
          high: projected + 2,
        },
      })

      setIsSimulating(false)
    },
    [intervention, metrics, persona]
  )

  const reset = useCallback(() => {
    setResult(null)
  }, [])

  return { result, isSimulating, simulate, reset }
}

export default useSimulator
