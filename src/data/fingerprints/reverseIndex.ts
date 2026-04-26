/**
 * Reverse index — "which Fingerprints touch this outcome / lever?"
 *
 * Fingerprint cards carry an optional `links` payload listing the
 * outcomes, edges, and data streams they reference. This module reads
 * a member's bundle and answers the inverse question:
 *
 *   "Show me every Fingerprint that mentions HRV." (or sleep_efficiency,
 *   or the workout_end_time → sleep_efficiency edge, etc.)
 *
 * Used by:
 *   - InsightOutcomeCard  →  "Why?" link in the card header that opens
 *                            Fingerprint anchored to a relevant card.
 *   - Twin OutcomeHoverCard → 🫆 chip in the hover that does the same.
 *
 * Cheap to call — no caching needed at current bundle sizes
 * (10-15 cards per member); can add memoization if it ever matters.
 */

import type { ParticipantPortal } from '@/data/portal/types'
import { computeFingerprints } from './computeFingerprints'
import type { Fingerprint } from './types'

/**
 * Return all Fingerprints from this member's bundle that reference the
 * given outcome id (matched against `links.outcomes` and `links.edges[].outcome`).
 *
 * Excludes identity_label entries — they're hero-pill summaries, not
 * the discrete cards a coach wants to land on.
 */
export function getFingerprintsForOutcome(
  participant: ParticipantPortal | null | undefined,
  outcomeId: string,
): Fingerprint[] {
  if (!participant) return []
  const bundle = computeFingerprints(participant)
  return bundle.fingerprints.filter((f) => {
    if (f.type === 'identity_label') return false
    const outcomes = f.links?.outcomes ?? []
    if (outcomes.includes(outcomeId)) return true
    const edgeOutcomes = (f.links?.edges ?? []).map((e) => e.outcome)
    return edgeOutcomes.includes(outcomeId)
  })
}

/** Same shape, but for a specific (action → outcome) edge. */
export function getFingerprintsForEdge(
  participant: ParticipantPortal | null | undefined,
  action: string,
  outcome: string,
): Fingerprint[] {
  if (!participant) return []
  const bundle = computeFingerprints(participant)
  return bundle.fingerprints.filter((f) => {
    if (f.type === 'identity_label') return false
    const edges = f.links?.edges ?? []
    return edges.some((e) => e.action === action && e.outcome === outcome)
  })
}

/** Convenience: does this member have ANY fingerprint touching the
 *  outcome? Use to decide whether to render the link at all. */
export function hasFingerprintsForOutcome(
  participant: ParticipantPortal | null | undefined,
  outcomeId: string,
): boolean {
  return getFingerprintsForOutcome(participant, outcomeId).length > 0
}
