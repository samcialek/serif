/**
 * React hook wrapping the Twin SCM engine.
 *
 * Provides memoized equation state and a counterfactual query function
 * for use by the What-If Simulator and other UI components.
 */

import { useMemo, useCallback } from 'react'
import edgeSummaryRaw from '@/data/dataValue/edgeSummaryRaw.json'
import { STRUCTURAL_EDGES } from '@/data/dataValue/mechanismCatalog'
import type { EdgeResult } from '@/data/dataValue/types'
import type {
  Intervention,
  CounterfactualResult,
  IdentificationResult,
  StructuralEquation,
} from '@/data/scm/types'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import { buildEquationsWithRegimes } from '@/data/scm/doseResponse'
import { topologicalSort } from '@/data/scm/dagGraph'
import { computeCounterfactual } from '@/data/scm/twinEngine'
import { computeFullCounterfactual } from '@/data/scm/fullCounterfactual'
import { identifyQuery } from '@/data/scm/identification'

export function useSCM() {
  const edgeResults = edgeSummaryRaw as EdgeResult[]

  // Memoize structural equations (derived from fitted edges)
  const equations: StructuralEquation[] = useMemo(
    () => buildEquationsWithRegimes(edgeResults),
    [edgeResults]
  )

  // Memoize topological order (derived from structural DAG)
  const topoOrder: string[] = useMemo(
    () => topologicalSort(STRUCTURAL_EDGES),
    []
  )

  // Counterfactual query
  const runCounterfactual = useCallback(
    (
      observedValues: Record<string, number>,
      interventions: Intervention[],
      targetNodes: string[]
    ): CounterfactualResult[] => {
      return computeCounterfactual(
        observedValues,
        interventions,
        targetNodes,
        equations,
        STRUCTURAL_EDGES,
        topoOrder
      )
    },
    [equations, topoOrder]
  )

  // Full counterfactual (uncollapsed model — all descendants, category grouping, tradeoffs)
  const runFullCounterfactual = useCallback(
    (
      observedValues: Record<string, number>,
      interventions: Intervention[]
    ): FullCounterfactualState => {
      return computeFullCounterfactual(
        observedValues,
        interventions,
        equations,
        STRUCTURAL_EDGES,
        topoOrder
      )
    },
    [equations, topoOrder]
  )

  // Identification query
  const identify = useCallback(
    (treatment: string, outcome: string): IdentificationResult => {
      return identifyQuery(treatment, outcome, STRUCTURAL_EDGES)
    },
    []
  )

  return {
    equations,
    topoOrder,
    edgeResults,
    runCounterfactual,
    runFullCounterfactual,
    identify,
  }
}
