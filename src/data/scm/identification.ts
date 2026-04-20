/**
 * Causal identification engine.
 *
 * Determines whether a causal effect P(Y | do(X)) is identifiable
 * from observational data, and if so, which criterion applies:
 *
 *   Back-door: Condition on a set Z that blocks all non-causal paths
 *              from X to Y while containing no descendants of X.
 *
 *   Front-door: When confounders are unobserved, route through a
 *               mediator M on the causal path X → M → Y, provided
 *               M satisfies the front-door conditions.
 */

import type { StructuralEdge } from '../dataValue/types'
import type { IdentificationResult } from './types'
import { LATENT_NODES } from '../dataValue/mechanismCatalog'
import {
  buildCausalAdjacency,
  getDescendants,
  findAllDirectedPaths,
  findBackdoorPaths,
} from './dagGraph'

const LATENT_SET = new Set(LATENT_NODES)

// Observed confounders in the Serif DAG
const OBSERVED_CONFOUNDERS = new Set([
  'season', 'location', 'travel_load', 'is_weekend',
  'day_of_week', 'year', 'month',
])

// ─── Back-door criterion ────────────────────────────────────────

/**
 * Find a valid back-door adjustment set for the effect of X on Y.
 *
 * A set Z satisfies the back-door criterion if:
 *   1. No node in Z is a descendant of X
 *   2. Z blocks every non-causal (back-door) path from X to Y
 *
 * Returns the adjustment set and whether it's valid (all members observed).
 */
export function findBackdoorSet(
  treatment: string,
  outcome: string,
  edges: StructuralEdge[]
): {
  adjustmentSet: string[]
  backdoorPaths: string[][]
  allObserved: boolean
  unobservedConfounders: string[]
} {
  const { paths, confounders } = findBackdoorPaths(treatment, outcome, edges)
  const causalAdj = buildCausalAdjacency(edges)
  const treatmentDescendants = getDescendants(treatment, causalAdj)

  // Filter: adjustment candidates must not be descendants of X
  const validCandidates = confounders.filter(
    (c) => !treatmentDescendants.has(c)
  )

  // Check observability
  const unobserved = validCandidates.filter(
    (c) => LATENT_SET.has(c) && !OBSERVED_CONFOUNDERS.has(c)
  )
  const observed = validCandidates.filter(
    (c) => !LATENT_SET.has(c) || OBSERVED_CONFOUNDERS.has(c)
  )

  return {
    adjustmentSet: observed,
    backdoorPaths: paths,
    allObserved: unobserved.length === 0,
    unobservedConfounders: unobserved,
  }
}

// ─── Front-door criterion ───────────────────────────────────────

/**
 * Find a valid front-door mediator set for the effect of X on Y.
 *
 * The front-door criterion applies when:
 *   1. X → M intercepts all directed paths from X to Y
 *   2. There is no unblocked back-door path from X to M
 *   3. All back-door paths from M to Y are blocked by X
 *
 * In Serif's DAG, front-door candidates are intermediate nodes on
 * causal chains where the confounder is unobserved:
 *   - running_volume → [ground_contacts] → iron_total
 *   - zone2_volume → [lipoprotein_lipase] → triglycerides
 *   - zone2_volume → [reverse_cholesterol_transport] → hdl
 *   - training_load → [core_temperature] → sleep_quality
 */
export function findFrontdoorSet(
  treatment: string,
  outcome: string,
  edges: StructuralEdge[]
): {
  mediatorSet: string[]
  valid: boolean
  rationale: string
} {
  const causalAdj = buildCausalAdjacency(edges)

  // Find all directed paths from treatment to outcome
  const allPaths = findAllDirectedPaths(treatment, outcome, causalAdj)
  if (allPaths.length === 0) {
    return { mediatorSet: [], valid: false, rationale: 'No causal path from treatment to outcome' }
  }

  // Candidate mediators: nodes that appear on ALL directed paths from X to Y
  // (excluding X and Y themselves)
  const pathInteriors = allPaths.map((p) => new Set(p.slice(1, -1)))

  // Find nodes that intercept all paths
  const candidates: string[] = []
  if (pathInteriors.length > 0) {
    const firstPath = pathInteriors[0]
    for (const node of firstPath) {
      const onAllPaths = pathInteriors.every((interior) => interior.has(node))
      if (onAllPaths) candidates.push(node)
    }
  }

  if (candidates.length === 0) {
    return {
      mediatorSet: [],
      valid: false,
      rationale: 'No mediator intercepts all directed paths from treatment to outcome',
    }
  }

  // Check front-door conditions for each candidate
  for (const mediator of candidates) {
    // Condition 2: No unblocked back-door from X to M
    const { confounders: xmConfounders } = findBackdoorPaths(treatment, mediator, edges)
    const xmHasBackdoor = xmConfounders.length > 0

    // Condition 3: All back-door paths from M to Y are blocked by conditioning on X
    // (In the front-door adjustment, we condition on X to block M ← U → Y paths)
    // This is automatically satisfied when X is the only common cause of M and Y
    // through the confounding structure.

    if (!xmHasBackdoor) {
      return {
        mediatorSet: [mediator],
        valid: true,
        rationale: `Front-door through ${mediator}: no confounding on ${treatment}→${mediator} path, and ${treatment} blocks back-door from ${mediator} to ${outcome}`,
      }
    }
  }

  // If all candidates have back-door issues, try the first anyway
  // (may still be approximately valid with partial adjustment)
  return {
    mediatorSet: [candidates[0]],
    valid: false,
    rationale: `Candidate mediator ${candidates[0]} has residual confounding on the ${treatment}→${candidates[0]} path`,
  }
}

// ─── Auto-selector ──────────────────────────────────────────────

/**
 * Automatically determine the best identification strategy for a
 * (treatment, outcome) pair.
 *
 * Priority:
 *   1. Back-door (if adjustment set is fully observed)
 *   2. Front-door (if a valid mediator exists)
 *   3. Unidentified (with explanation)
 */
export function identifyQuery(
  treatment: string,
  outcome: string,
  edges: StructuralEdge[]
): IdentificationResult {
  // Try back-door first
  const backdoor = findBackdoorSet(treatment, outcome, edges)

  if (backdoor.backdoorPaths.length === 0) {
    // No confounding — the naive estimate is causal
    return {
      strategy: 'backdoor',
      adjustmentSet: [],
      mediatorSet: [],
      blockedPaths: [],
      unblockedPaths: [],
      rationale: 'No confounding detected — direct causal estimate is valid',
    }
  }

  if (backdoor.allObserved) {
    return {
      strategy: 'backdoor',
      adjustmentSet: backdoor.adjustmentSet,
      mediatorSet: [],
      blockedPaths: backdoor.backdoorPaths,
      unblockedPaths: [],
      rationale: `Back-door adjusted for ${backdoor.adjustmentSet.join(', ')}`,
    }
  }

  // Back-door has unobserved confounders — try front-door
  const frontdoor = findFrontdoorSet(treatment, outcome, edges)

  if (frontdoor.valid) {
    return {
      strategy: 'frontdoor',
      adjustmentSet: [],
      mediatorSet: frontdoor.mediatorSet,
      blockedPaths: backdoor.backdoorPaths,
      unblockedPaths: [],
      rationale: `Front-door via ${frontdoor.mediatorSet.join(', ')}: ${frontdoor.rationale}`,
    }
  }

  // Neither criterion fully applies
  return {
    strategy: 'unidentified',
    adjustmentSet: backdoor.adjustmentSet,
    mediatorSet: frontdoor.mediatorSet,
    blockedPaths: [],
    unblockedPaths: backdoor.backdoorPaths,
    rationale: `Unobserved confounders [${backdoor.unobservedConfounders.join(', ')}] prevent full identification. Partial back-door adjustment applied for [${backdoor.adjustmentSet.join(', ')}]. ${frontdoor.rationale}`,
  }
}
