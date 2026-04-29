import type {
  AgencyGraph,
  AgencyNode,
  AgencyObservation,
  AgencyPlan,
  AgencyRating,
  AgencyRecommendation,
  AgencyRecommendationGroup,
  AgencyScoringContext,
  AgencyViewHorizon,
} from './types'

const GROUPS: AgencyRecommendationGroup[] = [
  'do_today',
  'steer_this_week',
  'respect_today',
  'observe_recheck',
]

const RATING_VALUE: Record<AgencyRating, number> = {
  very_low: 0.15,
  low: 0.35,
  medium: 0.6,
  high: 0.82,
  very_high: 1,
}

const COST_VALUE: Record<AgencyRating, number> = {
  very_low: 1,
  low: 0.88,
  medium: 0.62,
  high: 0.36,
  very_high: 0.18,
}

const AGENCY_GROUP: Record<string, AgencyRecommendationGroup> = {
  do: 'do_today',
  steer: 'steer_this_week',
  respect: 'respect_today',
  observe: 'observe_recheck',
}

function horizonLabel(days: number): string {
  if (days <= 1) return 'same or next day'
  if (days <= 7) return `${days} days`
  if (days <= 21) return `${Math.round(days / 7)} weeks`
  if (days <= 75) return `${Math.round(days / 30)} months`
  return 'next lab cycle'
}

function horizonFit(days: number, horizon: AgencyViewHorizon): number {
  if (horizon === 'today') {
    if (days <= 1) return 1
    if (days <= 7) return 0.9
    if (days <= 21) return 0.68
    if (days <= 60) return 0.45
    return 0.28
  }
  if (horizon === 'week') {
    if (days <= 1) return 0.88
    if (days <= 7) return 1
    if (days <= 21) return 0.95
    if (days <= 60) return 0.76
    return 0.56
  }
  if (days <= 7) return 0.72
  if (days <= 30) return 0.86
  if (days <= 120) return 1
  return 0.78
}

function groupForNode(node: AgencyNode): AgencyRecommendationGroup {
  return AGENCY_GROUP[node.agencyKind] ?? 'observe_recheck'
}

function hasAnyTag(tags: string[] | undefined, wanted: string[]): boolean {
  if (!tags?.length) return false
  return wanted.some((tag) => tags.includes(tag))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getLoadValue(
  context: AgencyScoringContext,
  key: string,
): number | undefined {
  const loads = context.participant?.loads_today as Record<
    string,
    { value?: number; z?: number; ratio?: number }
  > | undefined
  return loads?.[key]?.value
}

function getLoadRatio(
  context: AgencyScoringContext,
  key: string,
): number | undefined {
  const loads = context.participant?.loads_today as Record<
    string,
    { value?: number; z?: number; ratio?: number }
  > | undefined
  return loads?.[key]?.ratio
}

function currentNeedMultiplier(
  node: AgencyNode,
  tags: string[] | undefined,
  context: AgencyScoringContext,
): { multiplier: number; reasons: string[] } {
  const participant = context.participant
  if (!participant) return { multiplier: 1, reasons: [] }

  let multiplier = 1
  const reasons: string[] = []
  const regimes = participant.regime_activations ?? {}

  const add = (amount: number, reason: string) => {
    multiplier += amount
    reasons.push(reason)
  }

  if (hasAnyTag(tags, ['iron'])) {
    const p = regimes.iron_deficiency_state ?? 0
    if (p > 0.35) add(0.55 * p, 'iron constraint is active')
  }

  if (hasAnyTag(tags, ['sleep'])) {
    const p = regimes.sleep_deprivation_state ?? 0
    if (p > 0.35) add(0.45 * p, 'sleep constraint is active')
    const sleepDebtRatio = getLoadRatio(context, 'sleep_debt_14d')
    if (sleepDebtRatio != null && sleepDebtRatio > 1.05) {
      add(clamp((sleepDebtRatio - 1) * 0.35, 0.05, 0.24), 'sleep debt is above baseline')
    }
  }

  if (hasAnyTag(tags, ['training', 'recovery'])) {
    const p = regimes.overreaching_state ?? 0
    if (p > 0.35) add(0.35 * p, 'overreaching state is active')
    const acwr = getLoadValue(context, 'acwr')
    if (node.id === 'acwr' && acwr != null && (acwr < 0.75 || acwr > 1.25)) {
      add(0.16, 'ACWR is outside the easy middle')
    }
  }

  if (hasAnyTag(tags, ['inflammation'])) {
    const p = regimes.inflammation_state ?? 0
    if (p > 0.35) add(0.3 * p, 'inflammation state is active')
  }

  if (node.id === 'cold_temp') {
    const temp = participant.weather_today?.temp_c
    if (temp != null && temp < 7) add(temp < 0 ? 0.48 : 0.32, 'cold context is active today')
  }

  if (node.id === 'aqi') {
    const aqi = participant.weather_today?.aqi
    if (aqi != null && aqi >= 50) add(aqi >= 100 ? 0.46 : 0.24, 'AQI context is active today')
  }

  if (node.id === 'heat_humidity') {
    const heat = participant.weather_today?.heat_index_c ?? participant.weather_today?.temp_c
    if (heat != null && heat >= 27) add(0.24, 'heat context is active today')
  }

  if (node.id === 'travel_load') {
    const travelLoad = participant.current_values?.travel_load
    if (travelLoad != null && travelLoad >= 0.6) add(0.45, 'travel-load cliff is active')
  }

  return {
    multiplier: clamp(multiplier, 0.7, 1.9),
    reasons,
  }
}

function priorityMultiplier(
  tags: string[] | undefined,
  priorityTags: string[] | undefined,
): number {
  if (!priorityTags?.length || !tags?.length) return 1
  return hasAnyTag(tags, priorityTags) ? 1.18 : 1
}

function scoreRecommendation(
  source: AgencyNode,
  effectSize: number,
  confidence: number,
  horizonDays: number,
  tags: string[] | undefined,
  context: AgencyScoringContext,
): { score: number; reasons: string[] } {
  const view = context.options?.horizon ?? 'today'
  const need = currentNeedMultiplier(source, tags, context)
  const base =
    effectSize * 0.38 +
    confidence * 0.24 +
    RATING_VALUE[source.manipulability] * 0.18 +
    RATING_VALUE[source.reversibility] * 0.1 +
    COST_VALUE[source.cost] * 0.1

  const score =
    base *
    horizonFit(horizonDays, view) *
    need.multiplier *
    priorityMultiplier(tags, context.options?.priorityTags)

  return {
    score,
    reasons: need.reasons,
  }
}

function recTitle(group: AgencyRecommendationGroup, source: AgencyNode): string {
  if (group === 'respect_today') return `Respect ${source.label.toLowerCase()}`
  if (group === 'observe_recheck') return `Use ${source.label.toLowerCase()} as a gate`
  return source.label
}

function makeEmptyGroups(): Record<AgencyRecommendationGroup, AgencyRecommendation[]> {
  return {
    do_today: [],
    steer_this_week: [],
    respect_today: [],
    observe_recheck: [],
  }
}

function buildObservations(
  graph: AgencyGraph,
  recommendations: AgencyRecommendation[],
): AgencyObservation[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const byId = new Map<
    string,
    { node: AgencyNode; score: number; drivenBy: string[]; horizons: number[] }
  >()

  for (const rec of recommendations) {
    for (const id of rec.edge.watch) {
      const node = nodesById.get(id)
      if (!node) continue
      const current = byId.get(id)
      if (!current) {
        byId.set(id, {
          node,
          score: rec.score,
          drivenBy: [rec.source.label],
          horizons: [rec.edge.horizonDays],
        })
      } else {
        current.score = Math.max(current.score, rec.score)
        current.horizons.push(rec.edge.horizonDays)
        if (!current.drivenBy.includes(rec.source.label)) {
          current.drivenBy.push(rec.source.label)
        }
      }
    }
  }

  return Array.from(byId.entries())
    .map(([id, item]) => ({
      id: `obs_${id}`,
      node: item.node,
      score: item.score,
      reason: `Watch after ${item.drivenBy.slice(0, 2).join(' and ')} changes.`,
      horizonLabel: horizonLabel(Math.min(...item.horizons)),
      drivenBy: item.drivenBy,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

export function scoreAgencyGraph(
  graph: AgencyGraph,
  context: AgencyScoringContext = {},
): AgencyPlan {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const maxPerGroup = context.options?.maxPerGroup ?? 4
  const allRecommendations: AgencyRecommendation[] = []

  for (const edge of graph.edges) {
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    if (!source || !target) continue

    const group = groupForNode(source)
    const scored = scoreRecommendation(
      source,
      edge.effectSize,
      edge.confidence,
      edge.horizonDays,
      edge.tags,
      context,
    )

    allRecommendations.push({
      id: `rec_${edge.id}`,
      group,
      score: Number(scored.score.toFixed(4)),
      edge,
      source,
      target,
      title: recTitle(group, source),
      rationale: edge.claim,
      horizonLabel: horizonLabel(edge.horizonDays),
      priorityReasons: scored.reasons,
    })
  }

  const byGroup = makeEmptyGroups()
  for (const group of GROUPS) {
    byGroup[group] = allRecommendations
      .filter((rec) => rec.group === group)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerGroup)
  }

  const recommendations = GROUPS.flatMap((group) => byGroup[group])

  return {
    graph,
    recommendations,
    byGroup,
    observations: buildObservations(graph, recommendations),
  }
}

export { horizonLabel }
