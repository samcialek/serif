import type { InsightBayesian } from '@/data/portal/types'
import type { ScopeRegime } from '@/stores/scopeStore'
import { bandsForRegime, explorationBandFor } from '@/utils/exploration'
import { hasPersonalPosterior } from '@/utils/edgeProvenance'

export function prettyEdgeId(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bHrv\b/g, 'HRV')
    .replace(/\bHscrp\b/g, 'hsCRP')
    .replace(/\bAqi\b/g, 'AQI')
    .replace(/\bUv\b/g, 'UV')
}

export function scopeLabel(regime: ScopeRegime): string {
  if (regime === 'quotidian') return 'Quotidian'
  if (regime === 'longevity') return 'Longevity'
  return 'All'
}

export function scopeBlurb(regime: ScopeRegime): string {
  if (regime === 'quotidian') return 'day-scale wearable outcomes'
  if (regime === 'longevity') return 'monthly and long-term biomarker outcomes'
  return 'all outcome horizons'
}

export function scopedEdgesForRegime(
  edges: InsightBayesian[],
  regime: ScopeRegime,
): InsightBayesian[] {
  const allowed = bandsForRegime(regime)
  return edges.filter((edge) => allowed.has(explorationBandFor(edge.outcome)))
}

export function hasPersonalEvidence(edge: InsightBayesian): boolean {
  const backendPct = edge.personalization?.member_specific_pct
  if (Number.isFinite(backendPct) && Number(backendPct) > 0) return true
  return hasPersonalPosterior(edge)
}

export function observationCoverageForEdge(edge: InsightBayesian): number {
  const backendPct = edge.personalization?.coverage_pct
  if (Number.isFinite(backendPct)) {
    return Math.max(0, Math.min(1, Number(backendPct) / 100))
  }
  const n = edge.user_obs?.n ?? 0
  if (n <= 0) return 0
  const pathway = edge.user_obs?.pathway ?? edge.pathway ?? 'wearable'
  const halfSaturation = pathway === 'biomarker' ? 5 : 30
  return Math.max(0, Math.min(1, n / (n + halfSaturation)))
}

/**
 * Personalization score for a single edge: a [0, 1] proxy for how much
 * member-specific evidence is now carrying this estimate.
 *
 * It combines two signals:
 * 1. observation coverage: usable rows/draws for this member, cadence-aware;
 * 2. posterior narrowing: how much posterior uncertainty fell versus the model.
 *
 * This is not a literal likelihood mixing weight. It is the product surface a
 * coach needs: "is this estimate about this member yet?" Daily streams should
 * move the badge once we have enough usable days even when posterior variance
 * only tightens modestly.
 */
export function personalizationForEdge(edge: InsightBayesian): number {
  const backendPct = edge.personalization?.member_specific_pct
  if (Number.isFinite(backendPct)) {
    return Math.max(0, Math.min(1, Number(backendPct) / 100))
  }
  if (!hasPersonalEvidence(edge)) return 0
  const contraction = edge.posterior?.contraction ?? 0
  const coverage = observationCoverageForEdge(edge)
  const value = Math.max(contraction, coverage)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function edgeWeight(edge: InsightBayesian): number {
  return Math.max(0.01, Math.abs(edge.scaled_effect ?? edge.posterior?.mean ?? 0))
}

/**
 * Magnitude-weighted personalization score across a set of edges, [0, 1].
 *
 * Each edge contributes `personalizationForEdge(e) * edgeWeight(e)` so a tiny
 * well-fit edge does not dominate a big model-prior edge.
 */
export function weightedPersonalizationPct(edges: InsightBayesian[]): number {
  let numerator = 0
  let denominator = 0
  for (const edge of edges) {
    const weight = edgeWeight(edge)
    numerator += personalizationForEdge(edge) * weight
    denominator += weight
  }
  return denominator > 0 ? numerator / denominator : 0
}

export function median(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (clean.length === 0) return 0
  const mid = Math.floor(clean.length / 2)
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid]
}

export interface EdgeEvidenceCounts {
  total: number
  personal: number
  personalizing: number
  priorHeavy: number
  blocked: number
}

export function evidenceCounts(edges: InsightBayesian[]): EdgeEvidenceCounts {
  let personal = 0
  let personalizing = 0
  let priorHeavy = 0
  let blocked = 0

  for (const edge of edges) {
    const share = personalizationForEdge(edge)
    if (share >= 0.65 || edge.evidence_tier === 'personal_established') {
      personal += 1
    } else if (share > 0) {
      personalizing += 1
    }
    if (share < 0.25) priorHeavy += 1
    if (
      edge.gate?.tier === 'not_exposed' ||
      edge.direction_conflict ||
      (edge.posterior?.contraction ?? 0) < 0.25
    ) {
      blocked += 1
    }
  }

  return {
    total: edges.length,
    personal,
    personalizing,
    priorHeavy,
    blocked,
  }
}

export function priorHeavyEdges(
  edges: InsightBayesian[],
  limit = 6,
): InsightBayesian[] {
  return edges
    .filter((edge) => personalizationForEdge(edge) < 0.25)
    .sort((a, b) => edgeWeight(b) - edgeWeight(a))
    .slice(0, limit)
}
