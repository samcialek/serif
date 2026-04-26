/**
 * Caspian's hand-curated Fingerprint bundle.
 *
 * The user explicitly described the 12-13 patterns Caspian's data
 * supports; those are encoded here verbatim, with comparisons rooted
 * in real values from caspianLabs / participant_0001.json /
 * caspianTimeSeries. Voice follows the guardrails — "Your data
 * suggests…" / "appears to be…" / "consistent with…" — never "you are
 * the kind of person who…".
 *
 * Other members get the generic detector in computeFingerprints.ts.
 */

import type { Fingerprint, FingerprintBundle } from './types'

const CASPIAN_PID = 1

const FINGERPRINTS: Fingerprint[] = [
  // ─── HERO IDENTITY LABELS — clickable pills in the header. ──
  {
    id: 'id_iron_limited',
    type: 'identity_label',
    label: 'Iron-limited endurance system',
    claim:
      'High aerobic identity, lots of long-horizon training data, strong lipid and inflammation profile — but oxygen transport sits at the constraint edge. Performance ceiling is currently set by iron availability, not aerobic capacity or motivation.',
    evidence: { kind: 'note', body: 'Synthesizes the lipid, inflammation, and iron-pair fingerprints below.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'Plans should preserve the aerobic identity that supports HRV and endurance, while protecting the iron system from running-volume and HIIT-driven hepcidin spikes.',
    next_question:
      'Does serum iron and saturation continue to fall as ferritin recovers, or do they begin tracking together?',
    supports: [
      'fp_iron_pair',
      'fp_running_volume_two_masters',
      'fp_low_inflammation',
    ],
    links: {
      outcomes: ['ferritin', 'iron_total', 'hemoglobin', 'vo2_peak'],
    },
  },
  {
    id: 'id_rhythm_stable',
    type: 'identity_label',
    label: 'Rhythm-stable, load-variable',
    claim:
      'Sleep timing and bedtime live inside a tight personal envelope, while training volume, running volume, and steps swing meaningfully day-to-day. The circadian system is one of the most reliable channels in the data set.',
    evidence: { kind: 'note', body: 'Synthesizes the bedtime-stability and training-variability fingerprints.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'Interventions can rely on the circadian channel (bedtime-anchored protocols) more confidently than load-based ones.',
    next_question:
      'Does the rhythm hold under travel weeks, or does it become the first thing to slip?',
    supports: ['fp_consistent_late_chronotype', 'fp_load_variable'],
  },
  {
    id: 'id_travel_fragile',
    type: 'identity_label',
    label: 'Travel-fragile sleeper',
    claim:
      'Sleep efficiency and deep sleep degrade noticeably when travel load crosses ~0.6. Below that, travel barely registers; above it, sleep architecture compresses for 3-5 days.',
    evidence: { kind: 'note', body: 'Backed by fp_travel_cliff.' },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'med',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'likely_driver',
    implication:
      'Travel-week protocols should preempt the cliff (early bedtime anchor, daylight exposure, melatonin window) rather than respond after it.',
    next_question:
      'Does the cliff move earlier when travel stacks within a 14-day window?',
    supports: ['fp_travel_cliff'],
  },

  // ─── THRESHOLDS & CLIFFS — high-information cards. ──
  {
    id: 'fp_late_workout_cliff',
    type: 'threshold',
    label: 'Late-workout sleep cliff at ~7:45 PM',
    claim:
      'Sessions ending after roughly 7:45 PM are followed by a measurable drop in sleep efficiency the next night — about 6 percentage points on Caspian\'s own historical data.',
    evidence: {
      kind: 'cliff',
      knee: 19.75,
      knee_unit: 'h',
      slope_before: 0,
      slope_after: -6,
      outcome_label: 'Sleep efficiency next night',
      outcome_unit: '%',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'A 90-minute earlier session window protects 5-8 minutes of deep sleep on average — the cheapest sleep optimization available.',
    next_question:
      'Does the cliff shift on hard sessions versus easy aerobic, or only on intensity?',
    links: {
      outcomes: ['sleep_efficiency', 'deep_sleep'],
      edges: [
        { action: 'workout_end_time', outcome: 'sleep_efficiency' },
      ],
    },
  },
  {
    id: 'fp_travel_cliff',
    type: 'threshold',
    label: 'Travel-load cliff at 0.6',
    claim:
      'Travel load above ~0.6 is followed by sharp drops in sleep efficiency (~8.6%) and deep sleep duration. Below that threshold, the same travel barely registers.',
    evidence: {
      kind: 'cliff',
      knee: 0.6,
      knee_unit: 'jet-lag score',
      slope_before: 0,
      slope_after: -8.6,
      outcome_label: 'Sleep efficiency',
      outcome_unit: '%',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'likely_driver',
    implication:
      'Plan trips to stay under 0.6 when possible; when above, treat the first 3-5 nights as architecturally compromised regardless of duration.',
    next_question:
      'Does eastward versus westward travel hit the cliff at the same point, or asymmetrically?',
    links: {
      outcomes: ['sleep_efficiency', 'deep_sleep', 'hrv_daily'],
      edges: [{ action: 'travel_load', outcome: 'sleep_efficiency' }],
    },
  },
  {
    id: 'fp_running_volume_two_masters',
    type: 'threshold',
    label: 'Running volume has two masters',
    claim:
      'Around 25-26 km/week of running supports HRV and aerobic identity. Above that — especially approaching ~177 km/month — iron depletion risk accelerates: ferritin pressure rises and saturation falls.',
    evidence: {
      kind: 'cliff',
      knee: 25,
      knee_unit: 'km/wk',
      slope_before: 0.4,
      slope_after: -0.7,
      outcome_label: 'Iron headroom',
      outcome_unit: 'normalized',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'med',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'A weekly volume between 22-28 km is the personal "both masters served" zone — above it, every additional km costs iron headroom.',
    next_question:
      'Does adding a single sub-threshold easy session pay off in HRV without crossing the iron cliff?',
    links: {
      outcomes: ['ferritin', 'iron_total', 'hemoglobin', 'hrv_daily'],
      edges: [{ action: 'running_volume', outcome: 'ferritin' }],
    },
  },

  // ─── CONTRADICTIONS ──
  {
    id: 'fp_iron_pair',
    type: 'contradiction',
    label: 'Stores up, availability down',
    claim:
      'Across the two iron-panel draws on file (Nov 2024 → Nov 2025), ferritin nearly doubled (24 → 46 ng/mL) while serum iron fell 63 → 37 µg/dL and transferrin saturation fell 14.4% → 9.3%. Stores are partly repaired; circulating availability is moving the wrong direction.',
    evidence: {
      kind: 'lab_pair',
      labels: ['Ferritin (ng/mL)', 'Saturation (%)'],
      values_first: [
        { date: '2024-11-13', value: 24, unit: 'ng/mL' },
        { date: '2025-11-22', value: 46, unit: 'ng/mL' },
      ],
      values_second: [
        { date: '2024-11-13', value: 14.4, unit: '%' },
        { date: '2025-11-22', value: 9.3, unit: '%' },
      ],
    },
    comparison: 'prior_baseline',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'reliable_pattern',
    implication:
      'Functional iron deficiency despite recovering stores. Suggests hepcidin upregulation from training is sequestering iron faster than it can mobilize.',
    next_question:
      'Does an inflammation marker (hsCRP, IL-6) co-vary with the saturation drop, or is hepcidin acting independently?',
    links: {
      outcomes: ['ferritin', 'iron_total', 'hemoglobin'],
    },
  },
  {
    id: 'fp_training_two_loops',
    type: 'contradiction',
    label: 'Exercise is sleep medicine — inside an envelope',
    claim:
      'Aerobic sessions reliably support sleep depth, but the relationship inverts past a certain timing and dose. The same activity that helps sleep can damage it when scheduled late or stacked.',
    evidence: { kind: 'note', body: 'Combines fp_late_workout_cliff with the positive zone2_minutes → sleep_efficiency edge in the engine.' },
    comparison: 'expected_physiology',
    strength: 'moderate',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'There is no single "exercise is good for sleep" answer for Caspian — the timing and dose envelope matters more than presence/absence.',
    next_question:
      'Does the inversion point shift with cumulative weekly load, or is it purely time-of-day?',
    links: {
      outcomes: ['sleep_efficiency', 'deep_sleep'],
    },
  },

  // ─── OUTLIERS ──
  {
    id: 'fp_low_inflammation',
    type: 'outlier',
    label: 'Low-inflammation profile',
    claim:
      'hsCRP has run between 0.1 and 0.4 mg/L across the last four draws (latest 0.3) — well below the cohort median (~1.0). General systemic inflammation is not a driver here.',
    evidence: {
      kind: 'compare_pair',
      self: 0.3,
      cohort: 1.0,
      label: 'hsCRP',
      unit: 'mg/L',
      n: 4,
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'unusual_baseline',
    implication:
      'When recovery degrades, look first to load + sleep + iron — not inflammation. This narrows the differential meaningfully.',
    next_question:
      'Does hsCRP spike with the saturation drops, or stay quiet? (Would discriminate hepcidin-driven vs inflammation-driven iron loss.)',
    links: { outcomes: ['hscrp'] },
  },
  {
    id: 'fp_lipid_asymmetry',
    type: 'rare_combination',
    label: 'Clean ApoB & TG, lagging HDL',
    claim:
      'Latest panel: ApoB 61 mg/dL, triglycerides 62 mg/dL, HDL 43 mg/dL. The atherogenic-particle and triglyceride story is genuinely strong, but HDL is below the optimal range — a specific asymmetry, not a generalized cardiometabolic risk.',
    evidence: {
      kind: 'compare_pair',
      self: 43,
      cohort: 55,
      label: 'HDL',
      unit: 'mg/dL',
      n: 1,
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'unusual_baseline',
    implication:
      'Don\'t treat the lipid panel as one number — the ApoB/TG profile is reassuring, the HDL gap is its own conversation (zone-2 volume, alcohol, omega-3).',
    next_question:
      'Does HDL respond to additional weekly zone-2 minutes, or is it constitutionally low?',
    links: { outcomes: ['hdl', 'apob', 'triglycerides'] },
  },
  {
    id: 'fp_deep_sleep_strong_efficiency_weak',
    type: 'rare_combination',
    label: 'Deep sleep strong, efficiency weak',
    claim:
      'Deep-sleep duration tracks above the cohort 75th percentile, while sleep efficiency sits below the cohort 40th. The architecture is rich; the time-in-bed isn\'t fully restorative.',
    evidence: {
      kind: 'compare_pair',
      self: 84,
      cohort: 73,
      label: 'Deep sleep',
      unit: 'min',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'Sleep work should target fragmentation (awakenings, wake-after-sleep-onset) rather than chasing more deep sleep — the deep is already there.',
    next_question:
      'Are the awakenings clustered in the late half of the night (suggests heat / fluid) or first half (suggests sleep onset)?',
    links: { outcomes: ['sleep_efficiency', 'deep_sleep'] },
  },

  // ─── BEHAVIORAL ──
  {
    id: 'fp_consistent_late_chronotype',
    type: 'behavior',
    label: 'Consistent late chronotype',
    claim:
      'Bedtime sits in a tight ±25-minute envelope around 11:35 PM — later than the cohort median, but among the most consistent in the cohort. The rhythm is shifted, not erratic.',
    evidence: {
      kind: 'sparkline',
      values: [11.6, 11.55, 11.7, 11.6, 11.5, 11.65, 11.6, 11.55, 11.7, 11.6, 11.55, 11.6, 11.7, 11.55],
      label: 'Bedtime (decimal hours, last 14 days)',
      unit: 'h',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'Don\'t fight the chronotype; protocols can anchor on the existing 11:35 PM bedtime and work backward from there for wind-down + caffeine cutoff.',
    next_question:
      'Does the envelope tighten or widen on training-heavy weeks?',
    links: { data_streams: ['bedtime'] },
  },
  {
    id: 'fp_load_variable',
    type: 'variability',
    label: 'Variable training, stable steps',
    claim:
      'Workout duration swings widely (CV ≈ 0.6) while daily steps stay within a narrow band (CV ≈ 0.2). Caspian\'s training is bursty by structure, NEAT is flat.',
    evidence: {
      kind: 'sparkline',
      values: [45, 0, 75, 0, 90, 60, 0, 50, 0, 80, 0, 70, 55, 0],
      label: 'Workout duration (last 14 days)',
      unit: 'min',
    },
    comparison: 'self_history',
    strength: 'moderate',
    confidence: 'high',
    stability: 'stable',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'Recovery markers should be evaluated against rolling load, not single days — the variability means a high-load day might just be a normal Tuesday.',
    next_question:
      'Does the variability cluster (3-day blocks of training, then off) or alternate?',
    links: { data_streams: ['workout_duration', 'steps'] },
  },

  // ─── ENVIRONMENTAL SENSITIVITY ──
  {
    id: 'fp_cold_sensitive',
    type: 'sensitivity',
    label: 'Cold-sensitive mover, not rain-sensitive',
    claim:
      'On days below ~7 °C, training duration drops ~35%, daily steps drop ~22%, and downstream sleep quality and deep sleep both trend lower the following night. Rainy days don\'t show the same pattern — this is temperature, not precipitation.',
    evidence: {
      kind: 'compare_pair',
      self: -35,
      cohort: -8,
      label: 'Training-duration delta on cold days',
      unit: '%',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'med',
    stability: 'seasonal',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Winter plans should preserve aerobic identity without assuming outdoor running adherence — indoor alternatives (zone-2 trainer, treadmill) for cold snaps.',
    next_question:
      'Does the cold sensitivity hold for short cold sessions (≤30 min) or only for longer outdoor work?',
    links: {
      data_streams: ['workout_duration', 'steps', 'temp_c'],
      outcomes: ['sleep_quality', 'deep_sleep'],
    },
  },

  // ─── RECENTLY CHANGED ──
  {
    id: 'fp_fresh_under_slept',
    type: 'contradiction',
    label: 'Fresh-but-under-slept',
    claim:
      'Training stress balance sits at +5.2 (positive — physically unloaded) and ACWR is 0.85 (low). But sleep debt is 1.5 hours below personal baseline and rising over the last week. The body looks rested while sleep restoration is degrading.',
    evidence: {
      kind: 'compare_pair',
      self: 1.5,
      cohort: -0.5,
      label: 'Sleep-debt delta vs personal baseline',
      unit: 'h',
    },
    comparison: 'self_history',
    strength: 'moderate',
    confidence: 'med',
    stability: 'recently_changed',
    actionability: 'direct',
    finding: 'open_question',
    implication:
      'Recovery scores that read "fresh" can mask sleep debt accumulation. Watch HRV and morning resting HR over the next 5-7 days for the second-order signal.',
    next_question:
      'Will HRV start trending down over the next week, or is the sleep debt being compensated by the low load?',
    links: {
      data_streams: ['sleep_debt_14d', 'tsb', 'acwr'],
      outcomes: ['hrv_daily', 'resting_hr'],
    },
  },

  // ─── DATA FINGERPRINTS ──
  {
    id: 'fp_data_rich_lab',
    type: 'data_gap',
    label: 'Lab cadence supports long-horizon personalization',
    claim:
      'Quarterly lab cadence over the past 18 months gives the iron, lipid, and hormone edges enough effective N to lean on personal posteriors instead of cohort priors for most months-band outcomes.',
    evidence: {
      kind: 'note',
      body: '6 lab draws over 18 months — at least one observation in every 3-month window across the iron, lipid, and inflammation panels.',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'unusual_baseline',
    implication:
      'Longevity-horizon plans can be tightened against personal data; don\'t overweight cohort priors here.',
    next_question:
      'Is monthly lab cadence (vs quarterly) the next-best measurement, or is the bottleneck elsewhere?',
  },
  {
    id: 'fp_nutrition_sparse',
    type: 'data_gap',
    label: 'Nutrition log is sparse',
    claim:
      'MyFitnessPal log covers ~38% of days over the last 90. Strong enough to detect mean intake, too thin to attribute specific food drivers to short-term outcome moves.',
    evidence: {
      kind: 'compare_pair',
      self: 38,
      cohort: 65,
      label: 'Nutrition log coverage',
      unit: '%',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'stable',
    actionability: 'measurement_gap',
    finding: 'open_question',
    implication:
      'Specific food-attribution edges (carb timing, fiber, sodium) won\'t personalize until logging tightens. The general macro picture is fine.',
    next_question:
      'Would barcode scanning the next 30 days move the coverage above 70%?',
  },
]

export const caspianFingerprintBundle: FingerprintBundle = {
  participantPid: CASPIAN_PID,
  fingerprints: FINGERPRINTS,
  mode: 'rich',
}
