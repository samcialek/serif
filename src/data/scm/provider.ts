/**
 * SCM Provider abstraction.
 *
 * Allows the UI to work identically with:
 *  - LocalTwinProvider: synchronous TypeScript point-estimate engine
 *  - NumPyroProvider: async HTTP calls to Python Bayesian backend
 *
 * Both return the same types. The `source` field lets the UI
 * indicate whether results are approximate or exact posteriors.
 */

import type { Intervention, StructuralEquation } from './types'
import type { StructuralEdge } from '../dataValue/types'
import type { FullCounterfactualState } from './fullCounterfactual'
import type { InformationTheoreticScore } from '../dataValue/informationTheoreticScoring'
import { buildEquationsWithRegimes } from './doseResponse'
import { topologicalSort } from './dagGraph'
import { computeFullCounterfactual } from './fullCounterfactual'
import { computeInformationTheoreticScore } from '../dataValue/informationTheoreticScoring'
import { STRUCTURAL_EDGES } from '../dataValue/mechanismCatalog'
import { CANDIDATE_DATA_SOURCES } from '../dataValue/candidateDataSources'
import { getAvailableColumns } from '../dataValue/marginalValueEngine'
import type { EdgeResult, CandidateDataSource } from '../dataValue/types'

// ─── Interface ──────────────────────────────────────────────────

export interface SCMProvider {
  computeFullCounterfactual(
    observedValues: Record<string, number>,
    interventions: Intervention[]
  ): Promise<FullCounterfactualState>

  scoreCandidate(candidateId: string): Promise<InformationTheoreticScore>

  readonly source: 'local_twin' | 'numpyro_backend'
}

// ─── LocalTwinProvider ──────────────────────────────────────────

/**
 * Wraps the existing TypeScript SCM engine as a synchronous provider.
 * All methods return resolved promises for interface compatibility.
 */
export class LocalTwinProvider implements SCMProvider {
  readonly source = 'local_twin' as const

  private equations: StructuralEquation[]
  private structuralEdges: StructuralEdge[]
  private topoOrder: string[]
  private edgeResults: EdgeResult[]
  private availableColumns: Set<string>

  constructor(edgeResults: EdgeResult[]) {
    this.edgeResults = edgeResults
    // Include 16 regime equations (sigmoid activation + downstream effects)
    // alongside fitted edges (zero-slope edges pruned in buildEquationsFromEdges)
    this.equations = buildEquationsWithRegimes(edgeResults)
    this.structuralEdges = STRUCTURAL_EDGES
    this.topoOrder = topologicalSort(STRUCTURAL_EDGES)
    this.availableColumns = getAvailableColumns()
  }

  async computeFullCounterfactual(
    observedValues: Record<string, number>,
    interventions: Intervention[]
  ): Promise<FullCounterfactualState> {
    return computeFullCounterfactual(
      observedValues,
      interventions,
      this.equations,
      this.structuralEdges,
      this.topoOrder
    )
  }

  async scoreCandidate(candidateId: string): Promise<InformationTheoreticScore> {
    const candidate = CANDIDATE_DATA_SOURCES.find(c => c.id === candidateId)
    if (!candidate) {
      throw new Error(`Unknown candidate: ${candidateId}`)
    }
    return computeInformationTheoreticScore(
      candidate,
      this.availableColumns,
      this.edgeResults
    )
  }
}

// ─── NumPyroProvider (stub) ─────────────────────────────────────

/**
 * HTTP provider for the Python NumPyro backend.
 * Implements the same interface via REST calls.
 *
 * Not yet implemented — included as a forward declaration
 * so the type system validates the provider swap.
 */
export class NumPyroProvider implements SCMProvider {
  readonly source = 'numpyro_backend' as const

  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async computeFullCounterfactual(
    observedValues: Record<string, number>,
    interventions: Intervention[]
  ): Promise<FullCounterfactualState> {
    const response = await fetch(`${this.baseUrl}/api/v1/counterfactual/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observedValues, interventions }),
    })

    if (!response.ok) {
      throw new Error(`NumPyro backend error: ${response.status}`)
    }

    const data = await response.json()
    // Convert JSON arrays back to Maps
    return {
      ...data,
      allEffects: new Map(Object.entries(data.allEffects)),
    }
  }

  async scoreCandidate(candidateId: string): Promise<InformationTheoreticScore> {
    const response = await fetch(`${this.baseUrl}/api/v1/affordance/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })

    if (!response.ok) {
      throw new Error(`NumPyro backend error: ${response.status}`)
    }

    return response.json()
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create the appropriate provider based on backend availability.
 */
export function createProvider(
  edgeResults: EdgeResult[],
  numpyroUrl?: string
): SCMProvider {
  if (numpyroUrl) {
    return new NumPyroProvider(numpyroUrl)
  }
  return new LocalTwinProvider(edgeResults)
}
