/**
 * Insights-tab tier derivation.
 *
 * The published `gate.tier` encodes a contraction × personalisation rule
 * tuned for the Protocols tab (is this dose safe to act on?). The
 * Insights tab is load-agnostic: what matters is whether the sign of
 * the cohort-level effect is resolved. We promote an edge to Suggested
 * when ≥80% of posterior mass sits on one side of zero, and to
 * Actionable at ≥95% — i.e. the sign is well-identified regardless of
 * whether the user has enough personal exposure to individualise the
 * slope yet.
 */

import type { GateTier, InsightBayesian } from '@/data/portal/types'
import { isExploratoryPriorEdge } from '@/utils/edgeProvenance'

// Abramowitz & Stegun 26.2.17 — accurate to ~7.5e-8 on |z|<7.
function normCdf(z: number): number {
  const absZ = Math.abs(z)
  const t = 1 / (1 + 0.2316419 * absZ)
  const d = 0.3989422804014327 * Math.exp(-0.5 * absZ * absZ)
  const p =
    d *
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/** P(true effect has the same sign as posterior mean). */
export function signProbability(mean: number, sd: number): number {
  if (!Number.isFinite(sd) || sd <= 0) return mean === 0 ? 0.5 : 1
  return normCdf(Math.abs(mean) / sd)
}

export const INSIGHT_TIER_THRESHOLDS = {
  actionable: 0.95,
  suggested: 0.8,
} as const

/** Stricter cutoffs for exploratory-prior insights.
 *  Weak-default rows have no DAG path → user OLS is an unadjusted
 *  confounded slope, not a causal effect. Backend doc (2026-04-22)
 *  recommends pick *one* lever — prior-widening or threshold-tightening,
 *  not both. We hold the backend prior at 0.25·pop_SD and tighten here. */
export const INSIGHT_TIER_THRESHOLDS_WEAK = {
  actionable: 0.99,
  suggested: 0.9,
} as const

export function insightTierFor(insight: InsightBayesian): GateTier {
  const p = signProbability(insight.posterior.mean, insight.posterior.sd)
  const t =
    isExploratoryPriorEdge(insight)
      ? INSIGHT_TIER_THRESHOLDS_WEAK
      : INSIGHT_TIER_THRESHOLDS
  if (p >= t.actionable) return 'recommended'
  if (p >= t.suggested) return 'possible'
  return 'not_exposed'
}

export function insightTierCounts(
  insights: InsightBayesian[],
): Record<GateTier, number> {
  const counts: Record<GateTier, number> = {
    recommended: 0,
    possible: 0,
    not_exposed: 0,
  }
  for (const i of insights) counts[insightTierFor(i)]++
  return counts
}
