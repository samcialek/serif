/**
 * DAG graph utilities for the Serif causal model.
 *
 * Builds adjacency representations from STRUCTURAL_EDGES and provides
 * the graph algorithms that identification, twin propagation, and
 * pathway decomposition depend on.
 */

import type { StructuralEdge } from '../dataValue/types'
import type { AdjacencyList, FullAdjacency } from './types'

// ─── Build adjacency ────────────────────────────────────────────

/**
 * Build causal-only adjacency lists (parent→child directed edges).
 * Confounding edges are excluded — they are handled separately
 * by the identification engine.
 */
export function buildCausalAdjacency(edges: StructuralEdge[]): AdjacencyList {
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()

  for (const e of edges) {
    if (e.edgeType !== 'causal') continue

    if (!children.has(e.source)) children.set(e.source, [])
    children.get(e.source)!.push(e.target)

    if (!parents.has(e.target)) parents.set(e.target, [])
    parents.get(e.target)!.push(e.source)
  }

  return { children, parents }
}

/**
 * Build full adjacency including confounding fork structures.
 * Confounders are modeled as common causes: for edge
 * `{ source: C, target: X, edgeType: 'confounds' }`, C is a common
 * parent of both X and (implicitly) the other nodes C confounds.
 */
export function buildFullAdjacency(edges: StructuralEdge[]): FullAdjacency {
  const causal = buildCausalAdjacency(edges)
  const allNodes = new Set<string>()
  const confoundingForks: FullAdjacency['confoundingForks'] = []

  // Collect all nodes
  for (const e of edges) {
    allNodes.add(e.source)
    allNodes.add(e.target)
  }

  // Group confounding edges by confounder source
  const confoundTargets = new Map<string, string[]>()
  for (const e of edges) {
    if (e.edgeType !== 'confounds') continue
    if (!confoundTargets.has(e.source)) confoundTargets.set(e.source, [])
    confoundTargets.get(e.source)!.push(e.target)
  }

  // Generate fork pairs: confounder C → {A, B} means C confounds A and B
  for (const [confounder, targets] of confoundTargets) {
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        confoundingForks.push({
          confounder,
          left: targets[i],
          right: targets[j],
        })
      }
    }
  }

  return { ...causal, confoundingForks, allNodes }
}

// ─── Topological sort (Kahn's algorithm) ────────────────────────

/**
 * Topological sort over causal edges only.
 * Returns node IDs in forward-propagation order.
 * Nodes with no causal parents appear first (exogenous roots).
 */
export function topologicalSort(edges: StructuralEdge[]): string[] {
  const causalEdges = edges.filter((e) => e.edgeType === 'causal')

  // Collect all nodes that appear in causal edges
  const allNodes = new Set<string>()
  for (const e of causalEdges) {
    allNodes.add(e.source)
    allNodes.add(e.target)
  }

  // Build in-degree map
  const inDegree = new Map<string, number>()
  const children = new Map<string, string[]>()

  for (const node of allNodes) {
    inDegree.set(node, 0)
    children.set(node, [])
  }

  for (const e of causalEdges) {
    children.get(e.source)!.push(e.target)
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
  }

  // Kahn's: start with all zero-in-degree nodes
  const queue: string[] = []
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node)
  }
  // Sort the initial queue for deterministic ordering
  queue.sort()

  const order: string[] = []

  while (queue.length > 0) {
    const node = queue.shift()!
    order.push(node)

    for (const child of children.get(node) ?? []) {
      const newDeg = (inDegree.get(child) ?? 1) - 1
      inDegree.set(child, newDeg)
      if (newDeg === 0) {
        // Insert sorted for determinism
        const insertIdx = queue.findIndex((q) => q > child)
        if (insertIdx === -1) queue.push(child)
        else queue.splice(insertIdx, 0, child)
      }
    }
  }

  return order
}

// ─── Path finding ───────────────────────────────────────────────

/**
 * Find all directed (causal) paths from source to target.
 * DFS with cycle detection. Returns array of paths, each path
 * is an array of node IDs including source and target.
 */
export function findAllDirectedPaths(
  source: string,
  target: string,
  adj: AdjacencyList
): string[][] {
  const paths: string[][] = []
  const visited = new Set<string>()

  function dfs(current: string, path: string[]) {
    if (current === target) {
      paths.push([...path])
      return
    }

    visited.add(current)
    for (const child of adj.children.get(current) ?? []) {
      if (!visited.has(child)) {
        path.push(child)
        dfs(child, path)
        path.pop()
      }
    }
    visited.delete(current)
  }

  dfs(source, [source])
  return paths
}

// ─── Ancestor / descendant queries ──────────────────────────────

/**
 * Get all descendants of a node via causal edges (BFS).
 */
export function getDescendants(nodeId: string, adj: AdjacencyList): Set<string> {
  const descendants = new Set<string>()
  const queue = [...(adj.children.get(nodeId) ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (descendants.has(current)) continue
    descendants.add(current)
    for (const child of adj.children.get(current) ?? []) {
      queue.push(child)
    }
  }

  return descendants
}

/**
 * Get all ancestors of a node via causal edges (reverse BFS).
 */
export function getAncestors(nodeId: string, adj: AdjacencyList): Set<string> {
  const ancestors = new Set<string>()
  const queue = [...(adj.parents.get(nodeId) ?? [])]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (ancestors.has(current)) continue
    ancestors.add(current)
    for (const parent of adj.parents.get(current) ?? []) {
      queue.push(parent)
    }
  }

  return ancestors
}

// ─── Back-door path finding ─────────────────────────────────────

/**
 * Find all "back-door paths" from treatment X to outcome Y.
 *
 * A back-door path is any path from X to Y that starts with an
 * incoming edge into X (i.e., goes X ← ... → Y through common
 * causes). In Pearl's framework these are non-causal paths that
 * create spurious association.
 *
 * We enumerate them by finding confounders that are ancestors of
 * both X and Y (or confound X directly while being connected to Y).
 */
export function findBackdoorPaths(
  treatment: string,
  outcome: string,
  edges: StructuralEdge[]
): { paths: string[][]; confounders: string[] } {
  const backdoorPaths: string[][] = []
  const confounders = new Set<string>()

  // Find confounders that directly touch the treatment
  const confoundEdges = edges.filter((e) => e.edgeType === 'confounds')

  // Group confounding edges by source (the confounder)
  const confoundTargets = new Map<string, string[]>()
  for (const e of confoundEdges) {
    if (!confoundTargets.has(e.source)) confoundTargets.set(e.source, [])
    confoundTargets.get(e.source)!.push(e.target)
  }

  // Build causal adjacency for forward reachability
  const causalAdj = buildCausalAdjacency(edges)

  for (const [confounder, targets] of confoundTargets) {
    const confoundsTreatment = targets.includes(treatment)
    if (!confoundsTreatment) continue

    // Check if this confounder also reaches the outcome
    // Either directly confounds it, or has a causal path to it
    const confoundsOutcome = targets.includes(outcome)
    const descendants = getDescendants(confounder, causalAdj)
    const reachesOutcome = confoundsOutcome || descendants.has(outcome)

    // Also check if confounder reaches outcome through other confounded nodes
    const reachesViaConfounded = targets.some((t) => {
      if (t === treatment) return false
      const tDescendants = getDescendants(t, causalAdj)
      return t === outcome || tDescendants.has(outcome)
    })

    if (reachesOutcome || reachesViaConfounded) {
      confounders.add(confounder)

      // Build the path representation
      const otherTargets = targets.filter((t) => t !== treatment)
      for (const other of otherTargets) {
        // Find if other connects to outcome
        if (other === outcome) {
          backdoorPaths.push([treatment, confounder, outcome])
        } else {
          const pathsToOutcome = findAllDirectedPaths(other, outcome, causalAdj)
          for (const p of pathsToOutcome) {
            backdoorPaths.push([treatment, confounder, ...p])
          }
          // Also check if other IS the outcome or confounds it
          if (getDescendants(other, causalAdj).has(outcome)) {
            // Already captured above
          }
        }
      }

      // Direct confounder → outcome causal paths
      const directPaths = findAllDirectedPaths(confounder, outcome, causalAdj)
      for (const p of directPaths) {
        backdoorPaths.push([treatment, ...p])
      }
    }
  }

  return {
    paths: backdoorPaths,
    confounders: [...confounders],
  }
}
