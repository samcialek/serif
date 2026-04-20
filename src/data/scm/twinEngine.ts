/**
 * Twin SCM engine — counterfactual reasoning via abduction-action-prediction.
 *
 * The "twin" technique maintains two copies of the SCM:
 *   Factual world   — observed values, inferred noise
 *   Counter world    — intervened values, same noise, re-propagated
 *
 * Three-step procedure:
 *   1. Abduction:  Given observed values, infer exogenous noise U_j for each node
 *   2. Action:     Apply do(X=x') — sever incoming edges, fix value
 *   3. Prediction: Propagate through modified equations with inferred U's
 *
 * Pattern ported from polmodel-clean's CVAE SCM (do_intervention + topological propagation).
 */

import type {
  SCMNode,
  StructuralEquation,
  TwinSCMState,
  Intervention,
  CounterfactualResult,
  PathwayEffect,
} from './types'
import { LATENT_NODES } from '../dataValue/mechanismCatalog'
import type { AdjacencyList } from './types'
import { topologicalSort, findAllDirectedPaths, buildCausalAdjacency } from './dagGraph'
import { evaluateEdge, buildEquationsByTarget } from './doseResponse'
import { identifyQuery } from './identification'
import { propagateUncertainty } from './uncertainty'

// ─── Node initialization ────────────────────────────────────────

const LATENT_SET = new Set(LATENT_NODES)

/**
 * Initialize an SCM node from an observed value.
 */
function makeNode(id: string, observedValue: number | null, topoOrder: number): SCMNode {
  return {
    id,
    observedValue,
    exogenousNoise: 0,
    isLatent: observedValue === null || LATENT_SET.has(id),
    isIntervened: false,
    topoOrder,
  }
}

// ─── Step 1: Abduction ──────────────────────────────────────────

/**
 * Given observed node values and structural equations, infer the
 * exogenous noise U_j for each node.
 *
 * U_j = observed_j - SUM_i( evaluateEdge(observed_parent_i, eq_i→j) )
 *
 * For root nodes (no causal parents): U_j = observed_j
 * For latent nodes (no observation): U_j = 0
 */
export function abduceNoise(
  observedValues: Record<string, number>,
  equations: StructuralEquation[],
  topoOrder: string[]
): Map<string, SCMNode> {
  const eqByTarget = buildEquationsByTarget(equations)
  const world = new Map<string, SCMNode>()

  // Build topo order index
  const topoIndex = new Map<string, number>()
  for (let i = 0; i < topoOrder.length; i++) {
    topoIndex.set(topoOrder[i], i)
  }

  // Also collect nodes that appear as equation sources but not in topoOrder
  // (exogenous nodes from the fitted edges)
  const allNodeIds = new Set<string>(topoOrder)
  for (const eq of equations) {
    allNodeIds.add(eq.source)
    allNodeIds.add(eq.target)
  }

  // Initialize all nodes
  for (const nodeId of allNodeIds) {
    const observed = observedValues[nodeId] ?? null
    const order = topoIndex.get(nodeId) ?? -1
    world.set(nodeId, makeNode(nodeId, observed, order))
  }

  // Walk topological order and compute noise
  for (const nodeId of topoOrder) {
    const node = world.get(nodeId)
    if (!node) continue

    const parentEqs = eqByTarget.get(nodeId)

    if (!parentEqs || parentEqs.length === 0) {
      // Root node: noise IS the observed value
      node.exogenousNoise = node.observedValue ?? 0
      continue
    }

    // Compute parent contribution for ALL non-root nodes (latent and observed).
    // This must happen before the latent/observed branch so that latent nodes
    // get their structural prediction as their world value.
    let parentContribution = 0
    for (const eq of parentEqs) {
      const parentNode = world.get(eq.source)
      const parentValue = parentNode?.observedValue ?? parentNode?.exogenousNoise ?? 0
      parentContribution += evaluateEdge(parentValue, eq)
    }

    if (node.isLatent || node.observedValue === null) {
      // Latent: set world value to structural prediction, noise = 0.
      // Matches Python: world[node] = parent_sum, noise[node] = 0.
      // Without this, downstream nodes reading a latent parent get null/0
      // instead of the structural equation prediction. See engine lessons #15.
      node.observedValue = parentContribution
      node.exogenousNoise = 0
      continue
    }

    // Endogenous observed node: U_j = observed - sum(parent contributions)
    node.exogenousNoise = node.observedValue - parentContribution
  }

  return world
}

// ─── Step 2: Intervention ───────────────────────────────────────

/**
 * Apply do-interventions: clone the factual world into the counter world,
 * then for each intervention, set the node value and mark it as intervened
 * (severing its incoming causal edges).
 */
export function applyIntervention(
  factualWorld: Map<string, SCMNode>,
  interventions: Intervention[]
): Map<string, SCMNode> {
  // Deep clone
  const counterWorld = new Map<string, SCMNode>()
  for (const [id, node] of factualWorld) {
    counterWorld.set(id, { ...node })
  }

  // Apply each intervention
  for (const intv of interventions) {
    const node = counterWorld.get(intv.nodeId)
    if (node) {
      node.observedValue = intv.value
      node.isIntervened = true
      // Noise is absorbed: the node's value is now externally fixed
      node.exogenousNoise = intv.value
    } else {
      // Node doesn't exist in the world yet — create it
      counterWorld.set(intv.nodeId, {
        id: intv.nodeId,
        observedValue: intv.value,
        exogenousNoise: intv.value,
        isLatent: false,
        isIntervened: true,
        topoOrder: -1,
      })
    }
  }

  return counterWorld
}

// ─── Step 3: Prediction ─────────────────────────────────────────

/**
 * Forward-propagate through the counter world using the structural
 * equations and inferred noise.
 *
 * Walk topological order. For each non-intervened node:
 *   value_j = SUM_i( evaluateEdge(counterWorld[parent_i], eq_i→j) ) + U_j
 */
export function propagateCounterfactual(
  counterWorld: Map<string, SCMNode>,
  equations: StructuralEquation[],
  topoOrder: string[]
): Map<string, SCMNode> {
  const eqByTarget = buildEquationsByTarget(equations)

  for (const nodeId of topoOrder) {
    const node = counterWorld.get(nodeId)
    if (!node) continue

    // Intervened nodes keep their fixed value
    if (node.isIntervened) continue

    const parentEqs = eqByTarget.get(nodeId)
    if (!parentEqs || parentEqs.length === 0) {
      // Root node: value = noise (unchanged from factual)
      node.observedValue = node.exogenousNoise
      continue
    }

    // Compute from parents + noise
    let parentContribution = 0
    for (const eq of parentEqs) {
      const parentNode = counterWorld.get(eq.source)
      const parentValue = parentNode?.observedValue ?? parentNode?.exogenousNoise ?? 0
      parentContribution += evaluateEdge(parentValue, eq)
    }

    node.observedValue = parentContribution + node.exogenousNoise
  }

  return counterWorld
}

// ─── Regime activation nodes ────────────────────────────────────

/**
 * Sigmoid-gated regime activation nodes (engine lesson #16). Linear attribution
 * through a sigmoid breaks additivity — the gate either activates or doesn't,
 * it does not split proportionally across parent contributions. Paths crossing
 * any of these nodes must be excluded from per-path decomposition and reported
 * as a single aggregate regime contribution.
 *
 * Kept in sync with REGIME_EQUATIONS sigmoid targets in doseResponse.ts and
 * the local REGIME_NODE_IDS in fullCounterfactual.ts (duplicated deliberately
 * to avoid a circular import; the set is small and stable).
 */
export const REGIME_NODE_IDS: ReadonlySet<string> = new Set([
  'overreaching_state',
  'iron_deficiency_state',
  'sleep_deprivation_state',
  'inflammation_state',
])

// ─── Pathway decomposition ──────────────────────────────────────

/**
 * Decompose the total causal effect into per-pathway contributions.
 *
 * For each directed path from treatment to outcome:
 *   1. Clamp all nodes NOT on this path to their factual values
 *   2. Propagate the intervention only through this path
 *   3. The difference from the factual outcome is this path's effect
 *
 * Paths containing any REGIME_NODE_IDS are excluded from per-path
 * decomposition (see engine lesson #16). Their contribution is reported as a
 * single aggregate PathwayEffect with isRegimeAggregate=true so the UI can
 * render "via overreaching regime" etc. without breaking sigmoid additivity.
 *
 * Call-site trace (defense-in-depth rationale): this function is currently
 * called only from computeCounterfactual below. Asserting the regime filter
 * here rather than at the caller protects any future caller that forgets.
 */
export function decomposePathways(
  treatment: string,
  outcome: string,
  factualWorld: Map<string, SCMNode>,
  equations: StructuralEquation[],
  topoOrder: string[],
  interventions: Intervention[],
  structuralEdges: import('../dataValue/types').StructuralEdge[],
  prebuiltCausalAdj?: AdjacencyList
): PathwayEffect[] {
  const causalAdj = prebuiltCausalAdj ?? buildCausalAdjacency(structuralEdges)
  const rawPaths = findAllDirectedPaths(treatment, outcome, causalAdj)

  if (rawPaths.length === 0) {
    // Try column-level paths via equation source/target
    // (fitted edges use column names, structural edges use node names)
    return []
  }

  // Split direct vs regime-mediated paths (engine lesson #16).
  const directPaths: string[][] = []
  const regimePaths: string[][] = []
  for (const path of rawPaths) {
    if (path.some((n) => REGIME_NODE_IDS.has(n))) {
      regimePaths.push(path)
    } else {
      directPaths.push(path)
    }
  }

  const eqByTarget = buildEquationsByTarget(equations)
  const factualOutcome = factualWorld.get(outcome)?.observedValue ?? 0

  // Compute full counterfactual for reference (totalEffect includes regime contributions)
  const fullCounter = applyIntervention(factualWorld, interventions)
  propagateCounterfactual(fullCounter, equations, topoOrder)
  const fullCounterfactualOutcome = fullCounter.get(outcome)?.observedValue ?? 0
  const totalEffect = fullCounterfactualOutcome - factualOutcome

  const pathEffects: PathwayEffect[] = []

  for (const path of directPaths) {
    const pathSet = new Set(path)

    // Create a world where only nodes on this path are free to change.
    // IMPORTANT: applyIntervention creates fresh node clones per path.
    // Do not factor outside the loop — mutations to off-path nodes
    // (isIntervened = true for clamping) would leak between paths.
    const pathCounter = applyIntervention(factualWorld, interventions)

    // Walk topo order, but clamp non-path nodes to factual values
    for (const nodeId of topoOrder) {
      const node = pathCounter.get(nodeId)
      if (!node) continue
      if (node.isIntervened) continue

      if (!pathSet.has(nodeId)) {
        // Clamp to factual value
        const factualNode = factualWorld.get(nodeId)
        node.observedValue = factualNode?.observedValue ?? node.exogenousNoise
        node.isIntervened = true // prevent further updates
        continue
      }

      // On-path: propagate normally
      const parentEqs = eqByTarget.get(nodeId)
      if (!parentEqs || parentEqs.length === 0) {
        node.observedValue = node.exogenousNoise
        continue
      }

      let parentContribution = 0
      for (const eq of parentEqs) {
        const parentNode = pathCounter.get(eq.source)
        const parentValue = parentNode?.observedValue ?? parentNode?.exogenousNoise ?? 0
        parentContribution += evaluateEdge(parentValue, eq)
      }
      node.observedValue = parentContribution + node.exogenousNoise
    }

    const pathOutcome = pathCounter.get(outcome)?.observedValue ?? 0
    const pathEffect = pathOutcome - factualOutcome

    // Collect per-edge confidence (effN) along the path
    const edgeConfidences: number[] = []
    let minEffN = Infinity
    let bottleneckEdge: string | null = null

    for (let i = 0; i < path.length - 1; i++) {
      const src = path[i]
      const tgt = path[i + 1]
      // Find the matching equation
      const eq = equations.find((e) => e.source === src && e.target === tgt)
        ?? equations.find((e) =>
          e.source.includes(src) && e.target.includes(tgt)
        )

      const effN = eq?.effN ?? 1
      edgeConfidences.push(effN)
      if (effN < minEffN) {
        minEffN = effN
        bottleneckEdge = `${src} → ${tgt}`
      }
    }

    pathEffects.push({
      path,
      effect: pathEffect,
      fractionOfTotal: totalEffect !== 0 ? pathEffect / totalEffect : 0,
      edgeConfidences,
      bottleneckEdge,
    })
  }

  // Engine lesson #16: emit a single aggregate entry for effect routed through
  // regime activation nodes. aggregate = totalEffect - sum(directPath effects).
  // This preserves sum(pathEffects) == totalEffect without attributing effect
  // through sigmoid gates linearly.
  if (regimePaths.length > 0) {
    const sumOfDirectEffects = pathEffects.reduce((s, p) => s + p.effect, 0)
    const regimeAggregateEffect = totalEffect - sumOfDirectEffects
    if (Math.abs(regimeAggregateEffect) > 1e-9) {
      const regimeNodesInvolved = new Set<string>()
      for (const p of regimePaths) {
        for (const n of p) {
          if (REGIME_NODE_IDS.has(n)) regimeNodesInvolved.add(n)
        }
      }
      pathEffects.push({
        path: [treatment, ...Array.from(regimeNodesInvolved), outcome],
        effect: regimeAggregateEffect,
        fractionOfTotal: totalEffect !== 0 ? regimeAggregateEffect / totalEffect : 0,
        edgeConfidences: [],
        bottleneckEdge: null,
        isRegimeAggregate: true,
      })
    }
  }

  return pathEffects
}

// ─── Full counterfactual query ──────────────────────────────────

/**
 * Run a complete counterfactual query: abduction → action → prediction.
 *
 * Given observed values, interventions, and target nodes, returns
 * CounterfactualResult for each target with pathway decomposition,
 * identification strategy, and uncertainty.
 */
export function computeCounterfactual(
  observedValues: Record<string, number>,
  interventions: Intervention[],
  targetNodes: string[],
  equations: StructuralEquation[],
  structuralEdges: import('../dataValue/types').StructuralEdge[],
  topoOrder?: string[]
): CounterfactualResult[] {
  // Compute topological order if not provided
  const order = topoOrder ?? topologicalSort(structuralEdges)

  // Step 1: Abduction
  const factualWorld = abduceNoise(observedValues, equations, order)

  // Step 2: Action
  const counterWorld = applyIntervention(factualWorld, interventions)

  // Step 3: Prediction
  propagateCounterfactual(counterWorld, equations, order)

  // Build causal adjacency once (reused by all pathway decompositions)
  const causalAdj = buildCausalAdjacency(structuralEdges)

  // Build results for each target
  const results: CounterfactualResult[] = []

  for (const targetId of targetNodes) {
    const factualNode = factualWorld.get(targetId)
    const counterNode = counterWorld.get(targetId)

    const factualValue = factualNode?.observedValue ?? 0
    const counterfactualValue = counterNode?.observedValue ?? 0
    const totalEffect = counterfactualValue - factualValue

    // Pathway decomposition (use the first intervention as treatment)
    const treatment = interventions[0]?.nodeId ?? ''
    const pathwayDecomposition = decomposePathways(
      treatment,
      targetId,
      factualWorld,
      equations,
      order,
      interventions,
      structuralEdges,
      causalAdj
    )

    // Identification
    const identification = identifyQuery(treatment, targetId, structuralEdges)

    // Uncertainty
    const uncertainty = propagateUncertainty(
      totalEffect,
      pathwayDecomposition,
      equations
    )

    results.push({
      targetId,
      factualValue,
      counterfactualValue,
      totalEffect,
      pathwayDecomposition,
      adjustmentSet: identification.adjustmentSet,
      identificationStrategy: identification.strategy,
      confidenceInterval: { low: uncertainty.low, high: uncertainty.high },
    })
  }

  return results
}
