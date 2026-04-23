/**
 * React hook wrapping the Twin SCM engine.
 *
 * Provides memoized equation state and a counterfactual query function
 * for use by the What-If Simulator and other UI components.
 */

import { useMemo, useCallback } from 'react'
import edgeSummaryRaw from '@/data/dataValue/edgeSummaryRaw.json'
import { STRUCTURAL_EDGES } from '@/data/dataValue/mechanismCatalog'
import type { EdgeResult, StructuralEdge } from '@/data/dataValue/types'
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
import { buildSyntheticEquations } from '@/data/scm/syntheticEdges'

export function useSCM() {
  const edgeResults = edgeSummaryRaw as EdgeResult[]

  // Cohort-fit equations + literature-prior synthetic equations are
  // peers in the engine. The synthetic side covers actions and outcomes
  // the cohort can't estimate (caffeine timing, REM sleep, etc.); when
  // a (source, target) pair is fit by the cohort, the fit takes
  // precedence so the slope reflects observed data.
  const equations: StructuralEquation[] = useMemo(() => {
    const fitted = buildEquationsWithRegimes(edgeResults)
    const fittedKeys = new Set(fitted.map((e) => `${e.source}→${e.target}`))
    const synthetic = buildSyntheticEquations(fittedKeys)
    return [...fitted, ...synthetic.equations]
  }, [edgeResults])

  // Same merge for the structural DAG — descendant queries and topo
  // sort need to know about the synthetic action→outcome arrows.
  const structuralEdges: StructuralEdge[] = useMemo(() => {
    const existingKeys = new Set(
      STRUCTURAL_EDGES.filter((e) => e.edgeType === 'causal').map(
        (e) => `${e.source}→${e.target}`,
      ),
    )
    const synthetic = buildSyntheticEquations(new Set(), existingKeys)
    return [...STRUCTURAL_EDGES, ...synthetic.structuralEdges]
  }, [])

  // Topological order over the merged DAG.
  const topoOrder: string[] = useMemo(
    () => topologicalSort(structuralEdges),
    [structuralEdges]
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
        structuralEdges,
        topoOrder
      )
    },
    [equations, structuralEdges, topoOrder]
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
        structuralEdges,
        topoOrder
      )
    },
    [equations, structuralEdges, topoOrder]
  )

  // Identification query
  const identify = useCallback(
    (treatment: string, outcome: string): IdentificationResult => {
      return identifyQuery(treatment, outcome, structuralEdges)
    },
    [structuralEdges]
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
