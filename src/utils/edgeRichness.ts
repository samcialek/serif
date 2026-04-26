/**
 * edgeRichness — gate edges by member data availability + flag
 * implausibly tight effects.
 *
 * The backend currently fits the same Bayesian action set across every
 * participant — including actions that depend on rich data streams
 * (CGM, meal logs, cycle tracking, bedroom-temp sensors). For members
 * without those streams, "personal" effects on those actions are
 * spurious noise. This module gates them.
 *
 * Two checks:
 *   1. hasStreamForAction(pid, action) — does this member actually
 *      have the data stream this action depends on?
 *   2. isImplausibleEdge(edge) — is the posterior so tight (|z| > 8)
 *      that it suggests synthetic-data overfitting rather than a real
 *      biological signal?
 *
 * Both are applied in `effectiveTier()` which downgrades affected
 * edges from `personal_established` to `cohort_level`. Callers can also
 * use `passesRichnessGate()` to drop edges from a UI surface entirely.
 */

import type { InsightBayesian } from '@/data/portal/types'

/** Members with curated rich data streams. Add a new entry when a
 *  persona gets its own real / hand-crafted longitudinal data. */
const RICH_STREAMS_BY_PID: Record<number, ReadonlySet<string>> = {
  // Caspian (pid 1) — Apple Health workouts/sleep, GPS, iron panel,
  // multi-year quarterly labs, weather (Tel Aviv).
  1: new Set([
    'apple_health_workouts',
    'apple_health_sleep',
    'gpx',
    'iron_labs',
    'weather',
  ]),
  // Sarah (pid 3) — CGM, meal events, cycle tracking, bedroom temp
  // sensor, DEXA, weather (NYC + occasional travel).
  3: new Set([
    'cgm',
    'meals',
    'cycle',
    'bedroom_temp',
    'post_meal_walks',
    'dexa',
    'weather',
  ]),
}

/** Map each action to the data stream required to estimate it
 *  personally. Actions absent from this map are treated as universally
 *  available (sleep, training basics, supplements that everyone logs). */
const ACTION_REQUIRES_STREAM: Record<string, string> = {
  // Meal logging
  late_meal_count: 'meals',
  meal_window_hours: 'meals',
  meal_timing: 'meals',
  fiber_g: 'meals',
  dietary_fiber: 'meals',
  dietary_protein: 'meals',
  dietary_energy: 'meals',
  carbs_g: 'meals',
  // CGM
  glucose_cv: 'cgm',
  glucose_aoc: 'cgm',
  postprandial_glucose: 'cgm',
  // Cycle tracking
  cycle_luteal_phase: 'cycle',
  cycle_follicular_phase: 'cycle',
  cycle_day: 'cycle',
  // Behavioral
  post_meal_walks: 'post_meal_walks',
  // Bedroom-environment sensor
  bedroom_temp_c: 'bedroom_temp',
}

export function hasStreamForAction(
  pid: number | null | undefined,
  action: string,
): boolean {
  const required = ACTION_REQUIRES_STREAM[action]
  // Action doesn't depend on a rich stream — always available.
  if (!required) return true
  if (pid == null) return false
  return RICH_STREAMS_BY_PID[pid]?.has(required) ?? false
}

/** Posterior tightness check — flags edges whose
 *  |posterior_mean / posterior_sd| exceeds 8. Real biological effects
 *  rarely sit that far from measurement noise; values above this
 *  threshold typically reflect synthetic-data overfit when a member
 *  has very dense data (e.g. Sarah's 2700 days of CGM + meals). */
export function isImplausibleEdge(edge: InsightBayesian): boolean {
  const post = edge.posterior
  if (!post) return false
  const mean = post.mean
  const sd = post.sd
  if (typeof mean !== 'number' || typeof sd !== 'number' || sd <= 0) {
    return false
  }
  return Math.abs(mean) / sd > 8
}

/** Returns the tier we should display for this edge after applying the
 *  richness gate + plausibility check. Demotes:
 *    - personal_* → cohort_level when the stream is missing
 *    - personal_established → cohort_level when the posterior is
 *      implausibly tight (|z| > 8)
 *  Otherwise returns the edge's reported tier. */
export function effectiveTier(
  edge: InsightBayesian,
  pid: number | null | undefined,
): InsightBayesian['evidence_tier'] {
  const reported = edge.evidence_tier
  if (reported === 'personal_established' || reported === 'personal_emerging') {
    if (!hasStreamForAction(pid, edge.action)) return 'cohort_level'
    if (reported === 'personal_established' && isImplausibleEdge(edge)) {
      return 'cohort_level'
    }
  }
  return reported
}

/** Drop-in filter for UI surfaces that want to hide rich-data-only
 *  edges entirely (rather than just demote their tier). True = keep. */
export function passesRichnessGate(
  edge: InsightBayesian,
  pid: number | null | undefined,
): boolean {
  return hasStreamForAction(pid, edge.action)
}
