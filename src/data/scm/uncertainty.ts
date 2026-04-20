/**
 * Uncertainty propagation for counterfactual estimates.
 *
 * Two sources compound through causal chains:
 *
 *   1. Edge precision: sigma_edge ≈ |effect| / sqrt(effN)
 *      Low-effN edges (e.g., Running Volume → Iron at effN=2) carry wide bands.
 *      High-effN edges (e.g., TRIMP → HRV at effN=797) are tight.
 *
 *   2. Chain propagation: For a path [e1, e2, ..., ek],
 *      total variance ≈ SUM(sigma_ei^2) (independence assumption).
 *      Cross-path: sigma_total = sqrt(SUM(sigma_chain_k^2))
 */

import type { StructuralEquation, PathwayEffect, UncertaintyResult, UncertaintySource } from './types'

/**
 * Compute a confidence interval for a counterfactual total effect,
 * given the pathway decomposition and the underlying equations.
 *
 * Returns ±1.96σ (95% CI) bounds and a list of uncertainty sources
 * ranked by contribution.
 */
export function propagateUncertainty(
  totalEffect: number,
  pathways: PathwayEffect[],
  equations: StructuralEquation[]
): UncertaintyResult {
  // Build equation lookup for effN
  const eqLookup = new Map<string, StructuralEquation>()
  for (const eq of equations) {
    eqLookup.set(`${eq.source}→${eq.target}`, eq)
  }

  const sources: UncertaintySource[] = []
  let totalVariance = 0

  for (const pathway of pathways) {
    let chainVariance = 0

    for (let i = 0; i < pathway.path.length - 1; i++) {
      const src = pathway.path[i]
      const tgt = pathway.path[i + 1]
      const key = `${src}→${tgt}`

      // Find the equation (try exact match, then substring match)
      let eq = eqLookup.get(key)
      if (!eq) {
        // Try fuzzy match via column names
        for (const [, candidate] of eqLookup) {
          if (candidate.source.includes(src) && candidate.target.includes(tgt)) {
            eq = candidate
            break
          }
        }
      }

      const effN = eq?.effN ?? 1
      // Standard error: |effect per edge| / sqrt(effN)
      // Use the pathway effect scaled by edge count as proxy for per-edge effect
      const edgeCount = Math.max(1, pathway.path.length - 1)
      const perEdgeEffect = Math.abs(pathway.effect) / edgeCount
      const sigma = perEdgeEffect / Math.sqrt(Math.max(1, effN))
      const edgeVariance = sigma * sigma

      chainVariance += edgeVariance

      sources.push({
        edgeLabel: `${src} → ${tgt}`,
        effN,
        contribution: edgeVariance,
      })
    }

    totalVariance += chainVariance
  }

  // If no pathways, use a default based on total effect
  if (pathways.length === 0 && totalEffect !== 0) {
    // Assume moderate uncertainty (equivalent to effN=10)
    const sigma = Math.abs(totalEffect) / Math.sqrt(10)
    totalVariance = sigma * sigma
    sources.push({
      edgeLabel: 'direct (no pathway)',
      effN: 10,
      contribution: totalVariance,
    })
  }

  const totalSigma = Math.sqrt(totalVariance)
  const z = 1.96 // 95% CI

  // Sort sources by contribution (largest first)
  sources.sort((a, b) => b.contribution - a.contribution)

  // Deduplicate sources (same edge may appear in multiple pathways)
  const deduped = new Map<string, UncertaintySource>()
  for (const src of sources) {
    const existing = deduped.get(src.edgeLabel)
    if (existing) {
      existing.contribution += src.contribution
    } else {
      deduped.set(src.edgeLabel, { ...src })
    }
  }
  const dedupedSources = [...deduped.values()].sort(
    (a, b) => b.contribution - a.contribution
  )

  return {
    low: totalEffect - z * totalSigma,
    high: totalEffect + z * totalSigma,
    sources: dedupedSources,
    bottleneck: dedupedSources.length > 0 ? dedupedSources[0] : null,
  }
}
