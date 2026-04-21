/**
 * BartTwinProvider — SCMProvider that evaluates counterfactuals over
 * BART posterior draws with piecewise-linear fallback.
 *
 * Wraps LocalTwinProvider for the parts that don't need MC (candidate
 * scoring), and replaces `computeFullCounterfactual` with the MC loop.
 *
 * Usage:
 *     const provider = await BartTwinProvider.create(edgeResults)
 *     const state = await provider.computeFullCounterfactual(obs, interventions)
 *     // state.kSamples === 200, state.allEffects.get(x).posteriorSummary available
 *
 * UI code that reads the legacy FullCounterfactualState shape continues
 * to work — MCFullCounterfactualState extends that shape. Twin-specific
 * UI can downcast to access posterior bands via state.allEffects.get(x)
 * as MCNodeEffect.
 */

import type { SCMProvider } from './provider'
import type { Intervention, StructuralEquation } from './types'
import type { StructuralEdge, EdgeResult } from '../dataValue/types'
import type { FullCounterfactualState } from './fullCounterfactual'
import type { InformationTheoreticScore } from '../dataValue/informationTheoreticScoring'
import type { BartDraws } from './bartDraws'
import type { MCFullCounterfactualState } from './bartMonteCarlo'

import { LocalTwinProvider } from './provider'
import { buildEquationsWithRegimes } from './doseResponse'
import { topologicalSort } from './dagGraph'
import { STRUCTURAL_EDGES } from '../dataValue/mechanismCatalog'
import {
  loadBartManifest,
  preloadBartDraws,
  type BartBundleManifest,
} from './bartDraws'
import { computeMonteCarloFullCounterfactual } from './bartMonteCarlo'

// ─── Provider ──────────────────────────────────────────────────────

export class BartTwinProvider implements SCMProvider {
  readonly source = 'local_twin' as const

  private local: LocalTwinProvider
  private equations: StructuralEquation[]
  private structuralEdges: StructuralEdge[]
  private topoOrder: string[]
  private bartDraws: Map<string, BartDraws>
  private kSamples: number

  /** Use `BartTwinProvider.create()` — async load of the manifest + draws. */
  private constructor(
    edgeResults: EdgeResult[],
    bartDraws: Map<string, BartDraws>,
    kSamples: number,
  ) {
    this.local = new LocalTwinProvider(edgeResults)
    this.equations = buildEquationsWithRegimes(edgeResults)
    this.structuralEdges = STRUCTURAL_EDGES
    this.topoOrder = topologicalSort(STRUCTURAL_EDGES)
    this.bartDraws = bartDraws
    this.kSamples = kSamples
  }

  /**
   * Async factory. Loads the BART manifest, optionally preloads draws
   * for a subset of outcomes (default: all). Falls back to LocalTwin
   * behaviour if the manifest can't be fetched.
   */
  static async create(
    edgeResults: EdgeResult[],
    options: {
      kSamples?: number
      preloadOutcomes?: string[]
    } = {},
  ): Promise<BartTwinProvider> {
    const kSamples = options.kSamples ?? 200

    let manifest: BartBundleManifest
    try {
      manifest = await loadBartManifest()
    } catch (e) {
      // Graceful degradation: ship LocalTwin if manifest is missing.
      // The UI's MC bands collapse to point estimates for every node.
      console.warn(
        '[BartTwinProvider] manifest unavailable, falling back to piecewise-only:',
        e,
      )
      return new BartTwinProvider(edgeResults, new Map(), kSamples)
    }

    const outcomes = options.preloadOutcomes ?? Object.keys(manifest)
    const draws = await preloadBartDraws(outcomes)
    return new BartTwinProvider(edgeResults, draws, kSamples)
  }

  async computeFullCounterfactual(
    observedValues: Record<string, number>,
    interventions: Intervention[],
  ): Promise<FullCounterfactualState> {
    const mcState: MCFullCounterfactualState = computeMonteCarloFullCounterfactual(
      observedValues,
      interventions,
      this.equations,
      this.structuralEdges,
      this.bartDraws,
      { kSamples: this.kSamples, topoOrder: this.topoOrder },
    )
    // MCFullCounterfactualState is assignment-compatible with FullCounterfactualState
    // because MCNodeEffect carries the same NodeEffect fields (minus pathways,
    // which are synthesized as empty arrays below for legacy UI compat).
    const legacyAllEffects = new Map<string, FullCounterfactualState['allEffects'] extends Map<string, infer V> ? V : never>()
    for (const [id, mc] of mcState.allEffects) {
      legacyAllEffects.set(id, {
        nodeId: mc.nodeId,
        factualValue: mc.factualValue,
        counterfactualValue: mc.counterfactualValue,
        totalEffect: mc.totalEffect,
        confidenceInterval: mc.confidenceInterval,
        categories: mc.categories,
        pathways: [],
        identification: {
          strategy: 'backdoor',
          adjustmentSet: [],
          mediatorSet: [],
          blockedPaths: [],
          unblockedPaths: [],
          rationale: '',
        },
      })
    }
    return {
      interventions: mcState.interventions,
      allEffects: legacyAllEffects,
      categoryEffects: mcState.categoryEffects,
      tradeoffs: mcState.tradeoffs,
      timestamp: mcState.timestamp,
    }
  }

  /**
   * Richer variant used by Twin UI that wants the posterior bands.
   * Not part of the SCMProvider interface — callers must instanceof-check.
   */
  async computeFullCounterfactualMC(
    observedValues: Record<string, number>,
    interventions: Intervention[],
  ): Promise<MCFullCounterfactualState> {
    return computeMonteCarloFullCounterfactual(
      observedValues,
      interventions,
      this.equations,
      this.structuralEdges,
      this.bartDraws,
      { kSamples: this.kSamples, topoOrder: this.topoOrder },
    )
  }

  async scoreCandidate(candidateId: string): Promise<InformationTheoreticScore> {
    return this.local.scoreCandidate(candidateId)
  }

  /** Outcomes covered by BART (descendants get MC spread automatically). */
  get bartCoverage(): string[] {
    return Array.from(this.bartDraws.keys())
  }
}
