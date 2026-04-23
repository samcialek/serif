/**
 * Biological time-to-effect for each outcome, expressed in days.
 *
 * Sourced from the portal_bayesian export where every action-outcome edge
 * carries a `horizon_days` field. For each outcome, the horizon is invariant
 * across actions (it's a property of the outcome's own biology, not of the
 * intervention that nudges it), so we aggregate to one value per outcome.
 *
 * Regenerate from fresh portal data with:
 *   python3 -c "import json,glob; by={};
 *     [by.setdefault(e['outcome'],e['horizon_days']) for f in glob.glob('public/portal_bayesian/participant_0*.json')
 *     for e in json.load(open(f))['effects_bayesian']];
 *     print(sorted(by.items(), key=lambda x: x[1]))"
 */

export const OUTCOME_HORIZON_DAYS: Record<string, number> = {
  // Tomorrow band (<= 7d) — fast wearable response
  sleep_quality: 2,
  sleep_efficiency: 2,
  sleep_onset_latency: 2,
  deep_sleep: 3,
  rem_sleep: 3,
  hrv_daily: 4,

  // Weeks band (8-42d) — hormonal + short-turnover markers
  cortisol: 28,
  glucose: 28,
  insulin: 28,
  nlr: 28,
  wbc: 28,
  triglycerides: 35,
  alt: 42,
  ast: 42,
  dhea_s: 42,
  estradiol: 42,
  hscrp: 42,
  platelets: 42,
  shbg: 42,
  testosterone: 42,
  uric_acid: 42,

  // Months band (>= 43d) — slow-turnover + structural
  ferritin: 56,
  homocysteine: 56,
  iron_total: 56,
  rdw: 56,
  vo2_peak: 56,
  zinc: 56,
  hdl: 70,
  apob: 84,
  body_fat_pct: 84,
  body_mass_kg: 84,
  hemoglobin: 84,
  ldl: 84,
  magnesium_rbc: 84,
  mcv: 84,
  non_hdl_cholesterol: 84,
  rbc: 84,
  total_cholesterol: 84,
}

/**
 * Curated longevity outcome list — what surfaces in the LivingGraph
 * "Longevity" regime. Keeping this explicit (rather than "everything not
 * today-band") because the longevity tab is a curatorial decision: drop
 * redundant downstream-of-other-markers outcomes (total_cholesterol /
 * non_hdl_cholesterol with apob/ldl/hdl present, iron_total with ferritin,
 * ast with alt, mcv/rbc as hematology detail) and low-coverage / low-
 * interpretability rows (estradiol, shbg, platelets, wbc, zinc,
 * body_mass_kg). Horizon entries above are kept intact so the engine can
 * still reason about them when needed.
 *
 * 20 outcomes — 10 weeks band, 10 months band.
 */
export const CURATED_LONGEVITY_OUTCOMES = new Set<string>([
  // Weeks band (8-42d)
  'cortisol',
  'glucose',
  'insulin',
  'nlr',
  'triglycerides',
  'alt',
  'dhea_s',
  'hscrp',
  'testosterone',
  'uric_acid',
  // Months band (>= 43d)
  'ferritin',
  'homocysteine',
  'rdw',
  'vo2_peak',
  'hdl',
  'apob',
  'body_fat_pct',
  'hemoglobin',
  'ldl',
  'magnesium_rbc',
])

export type HorizonBand = 'today' | 'weeks' | 'months' | 'unknown'

export const HORIZON_BAND_ORDER: HorizonBand[] = ['today', 'weeks', 'months', 'unknown']

export const HORIZON_BAND_META: Record<HorizonBand, {
  label: string
  subtitle: string
  rangeDays: [number, number]
}> = {
  today: {
    label: 'Tomorrow',
    subtitle: 'Visible within a few days of the change',
    rangeDays: [1, 7],
  },
  weeks: {
    label: 'Over 2-6 weeks',
    subtitle: 'Hormonal and short-turnover markers stabilise',
    rangeDays: [8, 42],
  },
  months: {
    label: 'Over 2-3 months',
    subtitle: 'Slow-turnover labs, structural adaptations',
    rangeDays: [43, 180],
  },
  unknown: {
    label: 'Unspecified horizon',
    subtitle: 'No published horizon for this outcome',
    rangeDays: [0, 0],
  },
}

export function horizonDaysFor(canonicalKey: string): number | null {
  return OUTCOME_HORIZON_DAYS[canonicalKey] ?? null
}

export function horizonBandFor(canonicalKey: string): HorizonBand {
  const days = OUTCOME_HORIZON_DAYS[canonicalKey]
  if (days == null) return 'unknown'
  if (days <= 7) return 'today'
  if (days <= 42) return 'weeks'
  return 'months'
}

/**
 * First-order accumulation curve for a cumulative daily intervention.
 * Returns the fraction of the asymptotic effect realised at time `t` days,
 * given the outcome reaches ~95% of asymptote at its `horizonDays`.
 *
 * Shape: `1 - exp(-t / tau)` with `tau = horizonDays / 3`.
 * - At t = 0  : 0
 * - At t = H  : 0.95
 * - At t = 3H : 0.9975
 */
export function cumulativeEffectFraction(t: number, horizonDays: number): number {
  if (horizonDays <= 0 || t <= 0) return 0
  const tau = horizonDays / 3
  return 1 - Math.exp(-t / tau)
}

/**
 * Symmetric decay curve for a one-off intervention: effect peaks at the
 * outcome's natural response time, then decays back to baseline. Useful
 * for "if I do this today, what happens tomorrow?" framing.
 *
 * Shape: `(t / tau) * exp(1 - t/tau)` — a gamma-like impulse with peak at
 * t = tau.
 */
export function oneOffEffectFraction(t: number, horizonDays: number): number {
  if (horizonDays <= 0 || t <= 0) return 0
  const tau = horizonDays / 3
  const x = t / tau
  return x * Math.exp(1 - x)
}

/**
 * Minimum fraction of asymptotic effect realised before the Twin treats an
 * outcome as credible to report at a given horizon.
 *
 * On the first-order curve `1 - exp(-t/tau)` with `tau = H/3`, the 10%
 * crossover sits at `t ≈ 0.035·H`. So an outcome with horizon H disappears
 * from the Twin results when `atDays < 0.035 * H`.
 *
 * Rationale (per Sam 2026-04-22): at 1 day of intervention, ferritin /
 * zinc / vo2_peak have not moved measurably — reporting a non-zero delta
 * is spurious precision. This mirrors the per-lever credibility layer:
 * the SCM refuses to answer questions it cannot validate. Raise to
 * 0.15-0.20 for stricter gating; drop to 0.05 to be more permissive.
 */
export const MIN_ACCRUAL_FRACTION = 0.10

/**
 * True iff, at the given horizon, this outcome has accumulated at least
 * `MIN_ACCRUAL_FRACTION` of its asymptotic response. Outcomes without a
 * registered horizon default to visible with a dev-mode console.warn so
 * a newly added outcome doesn't silently disappear before review.
 */
export function isOutcomeCredibleAt(
  outcomeKey: string,
  atDays: number,
): boolean {
  const horizonDays = OUTCOME_HORIZON_DAYS[outcomeKey]
  if (horizonDays == null) {
    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
      console.warn(
        `[outcomeHorizons] no horizon for "${outcomeKey}" — defaulting to visible. Add to OUTCOME_HORIZON_DAYS.`,
      )
    }
    return true
  }
  return cumulativeEffectFraction(atDays, horizonDays) >= MIN_ACCRUAL_FRACTION
}

/**
 * Batch variant: returns the subset of outcome keys credible at the
 * given horizon. Prefer this when filtering goal candidates or effect
 * rows over repeated single-key checks.
 */
export function outcomesCredibleAt(
  atDays: number,
  outcomeKeys: Iterable<string>,
): Set<string> {
  const out = new Set<string>()
  for (const key of outcomeKeys) {
    if (isOutcomeCredibleAt(key, atDays)) out.add(key)
  }
  return out
}
