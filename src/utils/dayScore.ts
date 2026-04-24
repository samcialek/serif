/**
 * Day Score — single dimensionally-coherent number summarizing how the
 * member is doing today.
 *
 * Formula: weighted mean Cohen's d of the member's current outcome
 * state against a cohort reference, with "lower is better" outcomes
 * sign-flipped so higher is always beneficial. A small penalty for
 * active regimes and off-baseline loads is subtracted.
 *
 *     d_i     = (x_i − μ_cohort_i) / σ_cohort_i         per outcome
 *     d_i'    = d_i × beneficialSign(outcome_i)        sign-flipped
 *     score_d = Σ (w_i × d_i') / Σ w_i                  weighted mean
 *     penalty = Σ (act_r × 0.4)  +  Σ load_penalty_l
 *     day     = score_d − penalty
 *
 * Units: cohort-standard-deviations, after weighting. Typical range
 * [−2.5, +2.5]. Zero = an average cohort day. +1 = one SD better
 * across their weighted outcomes.
 *
 * Contrast with the legacy Twin-SEM score, which summed raw outcome
 * changes in mismatched native units; that number still ranks schedules
 * but isn't interpretable on its own.
 */

import type { ParticipantPortal, RegimeKey } from '@/data/portal/types'
import { OUTCOME_SD, beneficialSign } from '@/utils/insightStandardization'

/** Cohort-marginal outcome MEAN. Mirrored from
 * backend/serif_scm/synthetic/config.py BIOMARKER_PRIORS + WEARABLE_PRIORS.
 * Update when those tables change. */
export const OUTCOME_MEAN: Record<string, number> = {
  // Wearable
  hrv_daily: 50,
  resting_hr: 62,
  sleep_efficiency: 87,
  sleep_quality: 70,
  deep_sleep: 80,
  // Iron / hematology
  ferritin: 65,
  iron_total: 90,
  hemoglobin: 14.2,
  rbc: 4.8,
  mcv: 88,
  rdw: 13.0,
  wbc: 6.5,
  platelets: 250,
  nlr: 1.8,
  // Hormones
  testosterone: 500,
  cortisol: 14,
  estradiol: 40,
  dhea_s: 200,
  shbg: 35,
  // Lipids
  triglycerides: 110,
  hdl: 55,
  ldl: 110,
  total_cholesterol: 190,
  non_hdl_cholesterol: 135,
  apob: 95,
  // Inflammation
  hscrp: 1.4,
  // Metabolic
  glucose: 92,
  insulin: 8,
  hba1c: 5.3,
  uric_acid: 5.5,
  // Micronutrients
  zinc: 90,
  magnesium_rbc: 5.2,
  homocysteine: 9,
  omega3_index: 6,
  b12: 550,
  folate: 13,
  // Liver / kidney
  ast: 22,
  alt: 22,
  creatinine: 1.0,
  albumin: 4.3,
  // Fitness / body comp
  vo2_peak: 42,
  body_fat_pct: 22,
  body_mass_kg: 75,
}

/** Outcomes that contribute to the Day Score, with their weights.
 * Weights are relative — the final score normalizes by the sum of
 * weights of outcomes the member actually has data for. */
export const DAY_SCORE_OUTCOMES: Array<{ outcome: string; weight: number }> = [
  // Wearable signals — updated daily.
  { outcome: 'hrv_daily', weight: 1.0 },
  { outcome: 'sleep_quality', weight: 1.0 },
  { outcome: 'sleep_efficiency', weight: 0.8 },
  { outcome: 'deep_sleep', weight: 0.6 },
  { outcome: 'resting_hr', weight: 0.5 },
  // Monthly biomarker signals — most useful when a recent draw is in range.
  { outcome: 'cortisol', weight: 0.7 },
  { outcome: 'apob', weight: 0.6 },
  { outcome: 'hscrp', weight: 0.5 },
  { outcome: 'glucose', weight: 0.5 },
  { outcome: 'testosterone', weight: 0.4 },
  { outcome: 'ferritin', weight: 0.35 },
]

export interface DayScoreContribution {
  outcome: string
  weight: number
  /** Raw value (x_i). */
  value: number
  /** Cohort reference mean (μ_i). */
  reference: number
  /** Cohort SD (σ_i). */
  sd: number
  /** Signed Cohen's d after beneficial-direction flip. */
  d: number
  /** w_i × d_i — this outcome's contribution to the weighted sum. */
  weighted: number
}

export interface DayScoreBreakdown {
  /** Final Day Score: weighted-mean-d minus regime+load penalty. */
  score: number
  /** Weighted mean Cohen's d across available outcomes, before penalties. */
  outcomeScore: number
  /** Sum of regime-activation penalties (subtracted from score). */
  regimePenalty: number
  /** Sum of load-deviation penalties (subtracted from score). */
  loadPenalty: number
  /** Per-outcome detail — what's pulling the score up or down. */
  contributions: DayScoreContribution[]
  /** Outcomes in DAY_SCORE_OUTCOMES but missing for this participant. */
  missing: string[]
}

/** Regime severity weights — how much a 100%-active regime subtracts
 * from the Day Score. Penalty scales linearly with activation. */
const REGIME_PENALTY_WEIGHT: Record<RegimeKey, number> = {
  sleep_deprivation_state: 0.5,
  overreaching_state: 0.4,
  inflammation_state: 0.4,
  iron_deficiency_state: 0.3,
}

/** Normalized load-deviation penalty. Returns the Day-Score units to
 * subtract (0 = not concerning). */
function loadPenalty(loads: ParticipantPortal['loads_today']): number {
  if (!loads) return 0
  let p = 0
  const acwr = loads.acwr?.value
  if (typeof acwr === 'number' && Number.isFinite(acwr)) {
    // Optimal range 0.8–1.3; linear penalty outside.
    if (acwr > 1.3) p += Math.min(1.0, (acwr - 1.3) * 1.5)
    else if (acwr < 0.8) p += Math.min(0.5, (0.8 - acwr) * 1.0)
  }
  const debt = loads.sleep_debt_14d?.value
  if (typeof debt === 'number' && Number.isFinite(debt) && debt > 0) {
    // Every 7h of sleep debt = 1 SD of day-score penalty.
    p += Math.min(1.0, debt / 7)
  }
  const tsb = loads.tsb?.value
  if (typeof tsb === 'number' && Number.isFinite(tsb) && tsb < -25) {
    // Deep negative training-stress balance — accumulated fatigue.
    p += Math.min(0.5, (-tsb - 25) / 40)
  }
  return p
}

export function buildDayScore(
  participant: ParticipantPortal,
): DayScoreBreakdown {
  const baselines = participant.outcome_baselines ?? {}
  const contributions: DayScoreContribution[] = []
  const missing: string[] = []
  let weightSum = 0
  let weightedSum = 0

  for (const { outcome, weight } of DAY_SCORE_OUTCOMES) {
    const value = baselines[outcome]
    if (value == null || !Number.isFinite(value)) {
      missing.push(outcome)
      continue
    }
    const reference = OUTCOME_MEAN[outcome]
    const sd = OUTCOME_SD[outcome]
    if (reference == null || sd == null || sd < 1e-9) {
      missing.push(outcome)
      continue
    }
    const rawD = (value - reference) / sd
    const sign = beneficialSign(outcome)
    const d = rawD * sign
    const weighted = d * weight
    contributions.push({
      outcome,
      weight,
      value,
      reference,
      sd,
      d,
      weighted,
    })
    weightSum += weight
    weightedSum += weighted
  }

  const outcomeScore = weightSum > 0 ? weightedSum / weightSum : 0

  // Regime penalty.
  const regimes = participant.regime_activations ?? {}
  let regimePenalty = 0
  for (const [key, act] of Object.entries(regimes) as Array<[RegimeKey, number]>) {
    if (!act || act < 0.3) continue
    regimePenalty += act * (REGIME_PENALTY_WEIGHT[key] ?? 0.3)
  }

  const lp = loadPenalty(participant.loads_today)

  return {
    score: outcomeScore - regimePenalty - lp,
    outcomeScore,
    regimePenalty,
    loadPenalty: lp,
    contributions: contributions.sort(
      (a, b) => Math.abs(b.weighted) - Math.abs(a.weighted),
    ),
    missing,
  }
}

/** Qualitative band for display. Tuned to typical synthetic-cohort
 * spread — cohort-average day lands around 0, strong days ≥ +1. */
export function dayScoreBand(
  score: number,
): 'great' | 'good' | 'par' | 'rough' | 'poor' {
  if (score >= 1.3) return 'great'
  if (score >= 0.5) return 'good'
  if (score >= -0.3) return 'par'
  if (score >= -1.0) return 'rough'
  return 'poor'
}
