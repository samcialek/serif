import type { InsightBayesian } from '@/data/portal/types'

export type EdgePosteriorKind =
  | 'personal'
  | 'cohort'
  | 'literature'
  | 'model_prior'
  | 'unknown'

export type MetricProvenanceKind =
  | 'fitted'
  | 'wearable'
  | 'lab'
  | 'literature'
  | 'logged'

type PosteriorWithKind = InsightBayesian['posterior'] & {
  kind?: string | null
}

function normalizedPosteriorKind(edge: InsightBayesian): string {
  const posterior = edge.posterior as PosteriorWithKind | undefined
  return String(posterior?.kind ?? '').toLowerCase()
}

function posteriorSource(edge: InsightBayesian): string {
  return String(edge.posterior?.source ?? '').toLowerCase()
}

function sourceHas(edge: InsightBayesian, tokens: string[]): boolean {
  const source = posteriorSource(edge)
  return tokens.some((token) => source.includes(token))
}

function hasLiteratureSignal(edge: InsightBayesian): boolean {
  return (
    edge.literature_backed === true ||
    edge.prior_provenance === 'model_fit+literature' ||
    edge.prior_provenance === 'synthetic+literature' ||
    sourceHas(edge, ['literature', 'rct', 'meta'])
  )
}

function hasMemberSignal(edge: InsightBayesian): boolean {
  const kind = normalizedPosteriorKind(edge)
  return (
    kind.includes('personal') ||
    kind.includes('user') ||
    edge.evidence_tier === 'personal_emerging' ||
    edge.evidence_tier === 'personal_established' ||
    (edge.user_obs?.n ?? 0) > 0 ||
    sourceHas(edge, ['user', 'personal'])
  )
}

export function isExploratoryPriorEdge(edge: InsightBayesian): boolean {
  const kind = normalizedPosteriorKind(edge)
  const isPriorOnly =
    edge.prior_provenance === 'weak_default' ||
    kind === 'weak_default' ||
    kind === 'model_prior' ||
    kind === 'prior_only'
  return isPriorOnly && !hasMemberSignal(edge)
}

/**
 * Frontend adapter for edge provenance.
 *
 * Today the export mostly exposes provenance via raw source strings and
 * prior_provenance. Later, when the backend emits posterior.kind, this is
 * the only place the mapping should need to change.
 */
export function posteriorKindForEdge(edge: InsightBayesian): EdgePosteriorKind {
  const kind = normalizedPosteriorKind(edge)

  if (hasMemberSignal(edge)) return 'personal'
  if (isExploratoryPriorEdge(edge)) return 'model_prior'

  if (kind) {
    if (kind.includes('literature') || kind === 'lit') return 'literature'
    if (kind.includes('cohort') || kind.includes('fitted')) return 'cohort'
    if (kind.includes('prior')) return 'model_prior'
  }

  if (hasLiteratureSignal(edge)) {
    return 'literature'
  }

  if (
    edge.prior_provenance === 'synthetic' ||
    edge.prior_provenance === 'model_fit' ||
    edge.evidence_tier === 'cohort_level' ||
    sourceHas(edge, ['cohort', 'fitted', 'engine', 'computed', 'derived'])
  ) {
    return 'cohort'
  }

  return 'unknown'
}

export function hasPersonalPosterior(edge: InsightBayesian): boolean {
  return posteriorKindForEdge(edge) === 'personal'
}

export function isLiteratureEdge(edge: InsightBayesian): boolean {
  return hasLiteratureSignal(edge)
}

export function provenanceSortRank(edge: InsightBayesian): number {
  const kind = posteriorKindForEdge(edge)
  if (kind === 'literature') return 0
  if (kind === 'personal' || kind === 'cohort') return 1
  if (kind === 'model_prior') return 2
  return 3
}

export function metricProvenanceFromSource(
  source: string | undefined | null,
): MetricProvenanceKind {
  if (!source) return 'wearable'
  const s = source.toLowerCase()
  if (s.includes('lab') || s.includes('quest') || s.includes('labcorp')) return 'lab'
  if (s.includes('myfitnesspal') || s.includes('manual') || s.includes('log')) return 'logged'
  if (s.includes('literature') || s.includes('rct')) return 'literature'
  if (s.includes('engine') || s.includes('computed') || s.includes('derived')) return 'fitted'
  return 'wearable'
}
