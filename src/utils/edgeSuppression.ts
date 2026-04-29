import type { InsightBayesian } from '@/data/portal/types'

/** True when a member-specific context gate has blocked the edge.
 *
 * Example: zinc supplementation is only actionable when low zinc status is
 * observed. If the latest zinc lab is normal, the backend keeps the edge in
 * the graph for auditability but zeroes the causal effect.
 */
export function isContextSuppressed(edge: InsightBayesian): boolean {
  return edge.context_gate?.status === 'blocked'
}

