/**
 * Horizon-dependent lever credibility.
 *
 * A lever plays up to two roles in the Twin:
 *   - intervention:   "I will do X every day from now through the horizon."
 *                     Credibility here asks whether the SCM can predict the
 *                     effect of sustaining this daily action for N days.
 *                     Past the credible horizon, either adaptation, dropout,
 *                     or physiologic regime-change invalidates the acute
 *                     dose-response surface BART fit on.
 *   - stateOverride:  "My current starting value for X is Y."
 *                     Credibility asks whether an altered starting value
 *                     still conditions outcomes meaningfully at horizon N.
 *                     For accumulators (sleep_debt, acwr), the starting
 *                     value is replaced by ongoing accumulation within its
 *                     own window and has no causal hold beyond. For slow
 *                     biomarkers (ferritin, hscrp), the starting value
 *                     persists for months.
 *
 * A lever can play one, both, or neither role — null means "not this role."
 *
 * Phase 1 of the horizon-adaptive engine: filter the Twin's levers by
 * role-specific credibility. If a lever isn't credible at the chosen
 * horizon in a given role, it silently disappears from that panel. No
 * tooltip, no greyed-out ghost — the causal model cannot validate it, so
 * it is not offered. See serif_twin_followups for roadmap context.
 */

export type LeverRole = 'intervention' | 'stateOverride'

export interface LeverCredibility {
  /** Max horizon (days) at which daily-sustained intervention on this lever
   *  remains inside the SCM's credibility envelope. null if this lever is
   *  not an action the user can "do" (pure loads / biomarker states). */
  intervention: number | null
  /** Max horizon (days) at which a starting-value override on this lever
   *  still meaningfully conditions downstream outcomes. null if this lever
   *  is not something the user overrides as a starting state. */
  stateOverride: number | null
  /** Terse rationale — surfaces in dev tooling / future optional tooltip. */
  reason: string
}

export const LEVER_CREDIBILITY: Record<string, LeverCredibility> = {
  // ─── Daily-behavioral actions ──
  sleep_duration: {
    intervention: 56,
    stateOverride: null,
    reason:
      'Sustained ≤5h or ≥9h past ~8 weeks exits observed support; body adapts or subjects drop out, breaking the acute dose-response.',
  },
  bedtime: {
    intervention: 56,
    stateOverride: null,
    reason:
      'Circadian phase entrainment completes in ~2 months; past that, the shifted bedtime is a new baseline, not an ongoing perturbation.',
  },
  dietary_protein: {
    intervention: 180,
    stateOverride: null,
    reason:
      'Protein intake holds as a sustainable daily pattern; long-term observational cohorts support 6-month extrapolation.',
  },
  dietary_energy: {
    intervention: 180,
    stateOverride: null,
    reason:
      'Energy balance is a sustainable daily behavior; body composition compounds cleanly across months.',
  },
  running_volume: {
    intervention: 90,
    stateOverride: null,
    reason:
      'Progressive running volume holds for ~3 months before overuse risk or periodization breaks the constant-dose assumption.',
  },
  training_volume: {
    intervention: 90,
    stateOverride: null,
    reason:
      'Sustainable at moderate volumes for ~3 months; extreme daily volumes exit observed support earlier via overtraining dropout.',
  },
  zone2_volume: {
    intervention: 90,
    stateOverride: null,
    reason:
      'Aerobic base work holds at sustainable volumes for ~3 months; longer horizons require periodization the static lever does not model.',
  },
  active_energy: {
    intervention: 90,
    stateOverride: null,
    reason:
      'NEAT + structured activity is a behaviorally stable pattern for ~3 months before lifestyle-level shifts dominate.',
  },
  steps: {
    intervention: 180,
    stateOverride: null,
    reason:
      'Step count is among the most behaviorally stable long-term signals; 6-month daily-sustained extrapolation is supported.',
  },

  // ─── Loads: accumulators + training-status indicators ──
  acwr: {
    intervention: 21,
    stateOverride: 21,
    reason:
      '7d/28d acute:chronic training-load ratio; sustained >1.4 past ~3 weeks reliably couples to injury/overreaching, exiting the observed response surface.',
  },
  sleep_debt: {
    intervention: null,
    stateOverride: 14,
    reason:
      '14d rolling accumulator; starting value has no causal hold beyond its own window — replaced by new daily accumulation.',
  },
  training_load: {
    intervention: null,
    stateOverride: 42,
    reason:
      'Training-load baseline represents chronic fitness state; holds ~6 weeks before turnover replaces it.',
  },
  training_consistency: {
    intervention: null,
    stateOverride: 28,
    reason:
      'Adherence score with a ~4-week memory; starting value conditions the next month, replaced after that.',
  },

  // ─── Slow-moving biomarker / inflammation state ──
  ferritin: {
    intervention: null,
    stateOverride: 180,
    reason:
      'Iron stores turn over slowly; starting ferritin conditions outcomes for ~6 months via aerobic-capacity and fatigue pathways.',
  },
  hscrp: {
    intervention: null,
    stateOverride: 90,
    reason:
      'Chronic inflammation signature with ~3-month memory; past that, whatever factor set it dominates the current value.',
  },
}

/** Returns the set of lever keys credible for the given role at the given
 *  horizon. Unknown keys (no entry in LEVER_CREDIBILITY) default to visible
 *  with a dev-mode console warning — this avoids silently hiding a newly
 *  added lever that hasn't yet been credibility-reviewed. */
export function leversAvailableAt(
  role: LeverRole,
  horizonDays: number,
): Set<string> {
  const out = new Set<string>()
  for (const [key, cred] of Object.entries(LEVER_CREDIBILITY)) {
    const max = cred[role]
    if (max != null && horizonDays <= max) out.add(key)
  }
  return out
}

/** Single-lever credibility check. Prefer `leversAvailableAt` for batch use. */
export function isLeverCredibleAt(
  lever: string,
  role: LeverRole,
  horizonDays: number,
): boolean {
  const cred = LEVER_CREDIBILITY[lever]
  if (!cred) {
    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
      console.warn(
        `[leverCredibility] no entry for "${lever}" — defaulting to visible. Add to LEVER_CREDIBILITY.`,
      )
    }
    return true
  }
  const max = cred[role]
  return max != null && horizonDays <= max
}

/** Filter a record of overrides/proposals to only the keys credible for
 *  the given role+horizon. Use at apply-time to drop orphaned values that
 *  were set at a shorter horizon. */
export function filterCredibleLevers<V>(
  values: Record<string, V>,
  role: LeverRole,
  horizonDays: number,
): Record<string, V> {
  const out: Record<string, V> = {}
  for (const [key, v] of Object.entries(values)) {
    if (isLeverCredibleAt(key, role, horizonDays)) out[key] = v
  }
  return out
}
