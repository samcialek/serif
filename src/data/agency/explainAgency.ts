import type {
  AgencyExplanation,
  AgencyGraph,
  AgencyNode,
  AgencyRecommendation,
} from './types'

function nodesFor(ids: string[], byId: Map<string, AgencyNode>): AgencyNode[] {
  return ids
    .map((id) => byId.get(id))
    .filter((node): node is AgencyNode => node != null)
}

export function explainAgencyRecommendation(
  graph: AgencyGraph,
  recommendation: AgencyRecommendation,
): AgencyExplanation {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  return {
    because: `${recommendation.edge.action} This should ${recommendation.edge.outcome.toLowerCase()} over ${recommendation.horizonLabel}.`,
    holdConstant: nodesFor(recommendation.edge.holdConstant, byId),
    watch: nodesFor(recommendation.edge.watch, byId),
    substitutes: nodesFor(recommendation.edge.substitutes, byId),
    tradeoffs: recommendation.edge.tradeoffs,
  }
}

export function compactEvidenceLabel(recommendation: AgencyRecommendation): string {
  const personal = recommendation.edge.evidence.find(
    (ref) => ref.source === 'fingerprint' || ref.source === 'portal_bayesian',
  )
  return personal?.label ?? recommendation.edge.evidence[0]?.label ?? 'Curated edge'
}
