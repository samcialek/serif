/**
 * V2 fork of `useSCM` — same engine, but the structural-equation list
 * unions `PHASE_1_EDGES` (canonical literature priors) with the additive
 * `PHASE_2_EDGES` from `syntheticEdgesV2`. v1 `useSCM` is untouched.
 *
 * Loading order matches v1:
 *   1. Cohort-fit equations (per-participant Bayesian) take precedence.
 *   2. Synthetic equations fill in (action, outcome) pairs the cohort
 *      doesn't cover. v1 + v2 specs concatenated; the merged list is
 *      deduped against fitted keys inside `buildSyntheticEquations`.
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
import { buildSyntheticEquations, type SyntheticEdgeSpec } from '@/data/scm/syntheticEdges'
import {
  PHASE_2_EDGES,
  V2_ACTION_SPAN,
  V2_OUTCOME_SPAN,
} from '@/data/scm/syntheticEdgesV2'

// PHASE_1_EDGES isn't directly exported; we get it indirectly via
// buildSyntheticEquations(). To layer in V2 edges we pass the union as
// the `edges` override and the V2 spans as overrides too.
const PHASE_1_THEN_2 = (
  base: SyntheticEdgeSpec[],
  extra: SyntheticEdgeSpec[],
) => [...base, ...extra]

export function useSCMv2() {
  const edgeResults = edgeSummaryRaw as EdgeResult[]

  const equations: StructuralEquation[] = useMemo(() => {
    const fitted = buildEquationsWithRegimes(edgeResults)
    const fittedKeys = new Set(fitted.map((e) => `${e.source}→${e.target}`))
    // First pass: build the canonical Phase-1 equations as before.
    const synthV1 = buildSyntheticEquations(fittedKeys)
    // Second pass: build the v2 additions, deduped against both fitted
    // and Phase-1 keys so v2 only contributes genuinely new edges.
    const allKnownKeys = new Set([
      ...fittedKeys,
      ...synthV1.equations.map((e) => `${e.source}→${e.target}`),
    ])
    const synthV2 = buildSyntheticEquations(
      allKnownKeys,
      allKnownKeys,
      PHASE_1_THEN_2([], PHASE_2_EDGES),
      V2_ACTION_SPAN,
      V2_OUTCOME_SPAN,
    )
    return [...fitted, ...synthV1.equations, ...synthV2.equations]
  }, [edgeResults])

  const structuralEdges: StructuralEdge[] = useMemo(() => {
    const existingKeys = new Set(
      STRUCTURAL_EDGES.filter((e) => e.edgeType === 'causal').map(
        (e) => `${e.source}→${e.target}`,
      ),
    )
    const synthV1 = buildSyntheticEquations(new Set(), existingKeys)
    const allKnownKeys = new Set([
      ...existingKeys,
      ...synthV1.structuralEdges.map((e) => `${e.source}→${e.target}`),
    ])
    const synthV2 = buildSyntheticEquations(
      new Set(),
      allKnownKeys,
      PHASE_1_THEN_2([], PHASE_2_EDGES),
      V2_ACTION_SPAN,
      V2_OUTCOME_SPAN,
    )
    return [
      ...STRUCTURAL_EDGES,
      ...synthV1.structuralEdges,
      ...synthV2.structuralEdges,
    ]
  }, [])

  const topoOrder: string[] = useMemo(
    () => topologicalSort(structuralEdges),
    [structuralEdges]
  )

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
