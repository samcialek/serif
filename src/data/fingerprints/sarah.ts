/**
 * Sarah M. — "The Metabolic Optimizer"
 *
 * 41-year-old pre-diabetic turnaround success. Fasting glucose 118 → 94
 * over 9 months via eating-window discipline. Her Fingerprint is the
 * inverse of most members': the metabolic system is responding *to* her
 * interventions in a way that makes her a clean signal study.
 */

import type { Fingerprint, FingerprintBundle } from './types'

const FINGERPRINTS: Fingerprint[] = [
  // ─── IDENTITY HERO ──
  {
    id: 'id_metabolic_responder',
    type: 'identity_label',
    label: 'High-responder metabolic system',
    claim:
      'Glucose, weight, and lipid markers all respond strongly and quickly to dietary interventions. Sarah\'s metabolic plasticity is on the high end of the cohort — what works lands hard, what slips lands hard too.',
    evidence: { kind: 'note', body: 'Synthesizes the 9-month glucose trajectory + alcohol cost + late-meal cost.' },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Interventions can be aggressive and short — she doesn\'t need a 12-week protocol to see if something works; 2-3 weeks is usually enough to read the signal.',
    next_question:
      'Does this responsiveness extend to lipid interventions (omega-3, fiber), or is it specific to glucose?',
    supports: ['fp_glucose_trajectory', 'fp_late_meal_cliff', 'fp_alcohol_cost'],
    links: { outcomes: ['glucose', 'hba1c', 'apob'] },
  },
  {
    id: 'id_eating_window_responder',
    type: 'identity_label',
    label: 'Eating-window responder',
    claim:
      'Tightening the eating window from ~13 hrs to ~8 hrs cut her glucose CV from 24% to 14% — the cleanest single-intervention story in her data set.',
    evidence: { kind: 'note', body: 'Anchored on fp_glucose_trajectory.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'The eating window is now her load-bearing metabolic protocol — protect it before optimizing anything else.',
    next_question:
      'Where does the diminishing-returns point sit — does shrinking from 8 to 6 hrs add anything?',
    supports: ['fp_glucose_trajectory'],
  },
  {
    id: 'id_glucose_sensitive_to_alcohol',
    type: 'identity_label',
    label: 'Glucose-sensitive to alcohol',
    claim:
      'Each alcoholic drink shows up as ~+8 mg/dL on next-morning glucose — a tight, repeatable per-unit cost in her data.',
    evidence: { kind: 'note', body: 'Anchored on fp_alcohol_cost.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Alcohol can be quantified for her like any other lever — "one glass of wine" carries a known metabolic price tag.',
    next_question:
      'Does the per-unit cost depend on what was eaten with it, or is it intake-dose linear?',
    supports: ['fp_alcohol_cost'],
  },

  // ─── CONTRADICTIONS / TRAJECTORY ──
  {
    id: 'fp_glucose_trajectory',
    type: 'contradiction',
    label: 'Pre-diabetic → optimal in 9 months',
    claim:
      'Fasting glucose moved from 118 mg/dL (pre-diabetic range) to 94 mg/dL (optimal) over the data window — without medication. The eating window + reduced alcohol are the load-bearing changes.',
    evidence: {
      kind: 'lab_pair',
      labels: ['Fasting glucose (mg/dL)', 'Glucose CV (%)'],
      values_first: [
        { date: '2024-04-15', value: 118, unit: 'mg/dL' },
        { date: '2024-07-10', value: 108, unit: 'mg/dL' },
        { date: '2024-10-05', value: 99, unit: 'mg/dL' },
        { date: '2025-01-08', value: 94, unit: 'mg/dL' },
      ],
      values_second: [
        { date: '2024-04-15', value: 24, unit: '%' },
        { date: '2024-07-10', value: 21, unit: '%' },
        { date: '2024-10-05', value: 17, unit: '%' },
        { date: '2025-01-08', value: 14, unit: '%' },
      ],
    },
    comparison: 'prior_baseline',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'Intervention is working — the right move is consistency, not optimization. Switching protocols now would burn the response.',
    next_question:
      'Has insulin sensitivity (HOMA-IR) caught up with the glucose normalization, or is fasting glucose leading?',
    links: { outcomes: ['glucose', 'hba1c'] },
  },

  // ─── THRESHOLDS ──
  {
    id: 'fp_late_meal_cliff',
    type: 'threshold',
    label: 'Meals after 7 PM cost +12 mg/dL morning glucose',
    claim:
      'Each meal eaten after 19:00 raises next-morning fasting glucose by approximately 12 mg/dL on her own data. The relationship is dose-linear within her observed range (1-3 late meals/week).',
    evidence: {
      kind: 'cliff',
      knee: 19,
      knee_unit: 'h',
      slope_before: 0,
      slope_after: -12,
      outcome_label: 'Next-morning glucose',
      outcome_unit: 'mg/dL',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'A late-meal exception is fine occasionally; stacking 3+ in a week visibly degrades her morning glucose for the following week.',
    next_question:
      'Does meal composition (protein-only vs carb-heavy) shift the per-meal cost meaningfully?',
    links: {
      outcomes: ['glucose'],
      edges: [{ action: 'meal_timing', outcome: 'glucose' }],
    },
  },
  {
    id: 'fp_alcohol_cost',
    type: 'threshold',
    label: 'Per-unit alcohol cost: +8 mg/dL morning glucose',
    claim:
      'Each unit of alcohol consumed the night before raises next-morning fasting glucose by ~8 mg/dL. The relationship is linear in her observed range (0-3 units).',
    evidence: {
      kind: 'cliff',
      knee: 0,
      knee_unit: 'units',
      slope_before: 0,
      slope_after: -8,
      outcome_label: 'Next-morning glucose',
      outcome_unit: 'mg/dL',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Alcohol decisions can be priced — a 2-unit dinner = ~16 mg/dL on next morning\'s reading. Useful for tradeoff conversations.',
    next_question:
      'Does the per-unit cost rise with cumulative weekly intake, or stay constant?',
    links: {
      outcomes: ['glucose'],
      edges: [{ action: 'alcohol_units', outcome: 'glucose' }],
    },
  },

  // ─── OUTLIERS / RARE COMBOS ──
  {
    id: 'fp_caffeine_tolerant',
    type: 'outlier',
    label: 'Caffeine-tolerant — late cutoff at 4:30 PM',
    claim:
      'Sleep onset doesn\'t shift meaningfully even with afternoon caffeine. She metabolizes caffeine on the faster end of the cohort distribution — her cutoff is ~2 hours later than the population median.',
    evidence: {
      kind: 'compare_pair',
      self: 16.5,
      cohort: 14.5,
      label: 'Caffeine cutoff (clock hour)',
      unit: 'h',
      // Clock-hour ordering is a metabolic proxy, not a virtue.
      beneficial: 'neutral',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'She has more flexibility around afternoon coffee than the typical cohort recommendation suggests — don\'t apply a generic cutoff to her.',
    next_question:
      'Does the tolerance hold for higher doses (>200mg post-noon), or only at typical intake?',
    links: { outcomes: ['sleep_onset_latency'] },
  },
  {
    id: 'fp_heat_sensitive_sleeper',
    type: 'sensitivity',
    label: 'Heat-sensitive sleeper — bedroom cap 19 °C',
    claim:
      'Sleep efficiency drops sharply above 19 °C bedroom temperature. Her threshold is ~2 °C tighter than the cohort median — heat is a structural sleep risk for her.',
    evidence: {
      kind: 'cliff',
      knee: 19,
      knee_unit: '°C',
      slope_before: 0,
      slope_after: -8,
      outcome_label: 'Sleep efficiency',
      outcome_unit: '%',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Bedroom climate control is a load-bearing protocol — summer / heatwave weeks need active intervention, not just hope.',
    next_question:
      'Does the threshold shift seasonally (acclimation), or stay fixed at 19 °C year-round?',
    links: { outcomes: ['sleep_efficiency', 'deep_sleep'] },
  },
  {
    id: 'fp_strong_sleep_architecture',
    type: 'rare_combination',
    label: 'Strong deep + REM despite metabolic history',
    claim:
      'Deep sleep (55 min) and REM (95 min) both sit above cohort medians despite the historical pre-diabetic glucose. Sleep architecture wasn\'t the metabolic bottleneck — and it remains an asset she can build on.',
    evidence: {
      kind: 'compare_pair',
      self: 55,
      cohort: 45,
      label: 'Deep sleep',
      unit: 'min',
      beneficial: 'higher',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'unusual_baseline',
    implication:
      'Sleep is not where her metabolic improvements need to come from. Don\'t over-engineer it — protect what\'s already working.',
    next_question:
      'Does the strong architecture predate the eating-window changes, or did it improve with them?',
    links: { outcomes: ['deep_sleep', 'rem_sleep'] },
  },

  // ─── DATA FINGERPRINTS ──
  {
    id: 'fp_data_dense_glucose',
    type: 'data_gap',
    label: 'Daily glucose + quarterly labs = high-fidelity metabolic picture',
    claim:
      'CGM-style daily glucose with 4 quarterly lab confirmations is dense enough to track per-meal effects, not just averages. Most metabolic edges in her data are personally tightened, not cohort-derived.',
    evidence: {
      kind: 'note',
      body: '90 days of daily glucose + 4 fasting draws — CGM-tier coverage for the metabolic axis.',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'Per-meal experiments are worth running — she has the cadence to read individual interventions, not just rolling averages.',
    next_question:
      'Would adding postprandial spikes (peak height + duration) on top of fasting glucose unlock new insights, or is fasting enough?',
  },
]

export const sarahFingerprintBundle: FingerprintBundle = {
  participantPid: 3,
  fingerprints: FINGERPRINTS,
  mode: 'rich',
}
