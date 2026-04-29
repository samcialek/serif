/**
 * Emma L. — "The New Explorer"
 *
 * 28-year-old, 12 days of data, no bloodwork. Most edges still lean on
 * cohort and literature priors. Her Fingerprint runs in `forming` mode:
 * a small set of strong behavioral patterns (social jet lag, screen
 * time → sleep latency) anchored by a transparent data-gap section
 * showing what would unlock more.
 */

import type { Fingerprint, FingerprintBundle } from './types'

const FINGERPRINTS: Fingerprint[] = [
  // ─── IDENTITY HERO — only 2 labels appropriate at this data depth ──
  {
    id: 'id_baseline_forming',
    type: 'identity_label',
    identity_label_id: 'baseline_still_forming',
    label: 'Baseline still forming',
    claim:
      'Twelve days of wearable data and no bloodwork — most relationships in Emma\'s data are still leaning on cohort and literature priors. Personalization will sharpen quickly as more data arrives.',
    evidence: { kind: 'note', body: 'Anchored on the data-gap section below.' },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'emerging',
    actionability: 'measurement_gap',
    finding: 'unusual_baseline',
    implication:
      'Insight-style edges should be read as "cohort-typical" not "Emma-specific" for now. The story will tighten with each weekly data check-in.',
    next_question:
      'Which next data source — first bloodwork draw, or 30 more wearable days — would shift the most edges to personal posteriors?',
    supports: ['fp_data_no_bloodwork', 'fp_data_short_window'],
  },
  {
    id: 'id_social_jet_lag',
    type: 'identity_label',
    identity_label_id: 'social_jet_lag_pattern',
    label: 'Social-jet-lag pattern',
    claim:
      'Weekend wake time runs ~2.5 hours later than weekday wake — equivalent to flying two time zones every Monday morning. The weekday/weekend gap is structural, not occasional.',
    evidence: { kind: 'note', body: 'Anchored on fp_weekend_drift.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'med',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Even with only 12 days, the weekday/weekend pattern is consistent enough to call it. The Monday HRV dip is probably already a downstream signal.',
    next_question:
      'Does the gap narrow on weeks without late-Saturday social events, or hold regardless?',
    supports: ['fp_weekend_drift'],
  },

  // ─── BEHAVIORAL — the strong-signal cards. ──
  {
    id: 'fp_weekend_drift',
    type: 'behavior',
    label: '2.5-hour weekend bedtime drift',
    claim:
      'Weekday bedtime: ~10:45 PM. Weekend bedtime: ~1:15 AM. Weekday wake: 7:00 AM. Weekend wake: 9:30 AM. The shift is consistent across the data window — not driven by isolated events.',
    evidence: {
      kind: 'sparkline',
      values: [10.75, 10.7, 10.85, 10.8, 10.75, 13.25, 13.5, 10.8, 10.7, 10.9, 10.8, 13.0],
      label: 'Bedtime, last 12 days (decimal hours)',
      unit: 'h',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'med',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'The weekly autonomic shock is real. A "social wind-down anchor" (consistent weekend lights-out within 90 min of weekday) would be the single highest-leverage change.',
    next_question:
      'Is the drift driven by both bedtime shift and wake-time shift, or asymmetric?',
    links: { data_streams: ['bedtime', 'wake_time'] },
  },
  {
    id: 'fp_screen_latency_link',
    type: 'sensitivity',
    label: 'Screen time after 9 PM → +18 min sleep latency',
    claim:
      'On nights with >2 hours of post-9-PM screen time, sleep onset latency stretches by ~18 minutes versus low-screen nights. The relationship holds even on otherwise consistent days.',
    evidence: {
      kind: 'compare_pair',
      self: 18,
      cohort: 8,
      label: 'Latency delta on high-screen nights',
      unit: 'min',
      beneficial: 'lower',
    },
    comparison: 'self_history',
    strength: 'moderate',
    confidence: 'med',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Screen-time discipline before bed is a higher-leverage intervention for her than caffeine timing or bedroom temp at this data depth.',
    next_question:
      'Does blue-light filtering shift the relationship, or is it screen-content driven (work / scroll / both)?',
    links: { outcomes: ['sleep_onset_latency'] },
  },

  // ─── OUTLIERS / RARE ──
  {
    id: 'fp_low_hrv_baseline',
    type: 'outlier',
    label: 'HRV 38 ms — below cohort, but baseline still forming',
    claim:
      'Average HRV across the 12-day window is 38 ms, below the cohort 25th percentile (~45 ms). At this data depth, it could be a baseline trait or a transient stress signal — too early to tell.',
    evidence: {
      kind: 'compare_pair',
      self: 38,
      cohort: 50,
      label: 'HRV',
      unit: 'ms',
      n: 12,
      beneficial: 'higher',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'low',
    stability: 'emerging',
    actionability: 'watch_only',
    finding: 'open_question',
    implication:
      'Don\'t over-interpret yet — 12 days isn\'t enough to separate stress-state from trait baseline. Watch the trajectory, not the absolute number.',
    next_question:
      'Does HRV recover during exam-free weeks, or stay below 45 regardless of context?',
    links: { outcomes: ['hrv_daily'] },
  },
  {
    id: 'fp_hydration_rhr',
    type: 'sensitivity',
    label: 'Hydration deficit → +3 bpm resting HR',
    claim:
      'On days with <1.5 L water intake, the next-morning resting HR runs ~3 bpm higher than on better-hydrated days. The signal is consistent across the short data window.',
    evidence: {
      kind: 'compare_pair',
      self: 3,
      cohort: 1,
      label: 'RHR delta on low-hydration days',
      unit: 'bpm',
      beneficial: 'lower',
    },
    comparison: 'self_history',
    strength: 'moderate',
    confidence: 'low',
    stability: 'emerging',
    actionability: 'direct',
    finding: 'open_question',
    implication:
      'Cheapest intervention available — hydration can be moved without a behavior change beyond water-bottle access.',
    next_question:
      'Does the 3-bpm delta persist as more days accumulate, or shrink toward 0 (suggesting confounding)?',
    links: { outcomes: ['resting_hr'] },
  },

  // ─── DATA FINGERPRINTS — first-class given the forming mode ──
  {
    id: 'fp_data_no_bloodwork',
    type: 'data_gap',
    label: 'No bloodwork — biomarker fingerprints unavailable',
    claim:
      'Without lab data, none of the months-band biomarker fingerprints (lipid asymmetry, iron status, inflammation profile, hormone balance) can fire. The whole longevity-horizon side of the picture is dark.',
    evidence: {
      kind: 'compare_pair',
      self: 0,
      cohort: 3,
      label: 'Lab draws (lifetime)',
      unit: '',
      beneficial: 'higher',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'measurement_gap',
    finding: 'unusual_baseline',
    implication:
      'A first lipid + ferritin + hsCRP draw would unlock ~30% of the personalized-edge surface immediately. Highest-leverage data acquisition available.',
    next_question:
      'What\'s the soonest she can get a baseline draw scheduled?',
  },
  {
    id: 'fp_data_short_window',
    type: 'data_gap',
    label: 'Only 12 days of wearable history',
    claim:
      'Wearable streams (sleep, HRV, RHR, steps) are present and clean, but the window is too short for variability or threshold detection. Most personal posteriors won\'t cross the cohort/personal weighting inflection until ~30 days.',
    evidence: {
      kind: 'compare_pair',
      self: 12,
      cohort: 60,
      label: 'Wearable days collected',
      unit: 'd',
      beneficial: 'higher',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'emerging',
    actionability: 'measurement_gap',
    finding: 'unusual_baseline',
    implication:
      'Just keep wearing the device — most of the personalization unlock here is automatic with time, not active intervention.',
    next_question:
      'At what data depth (30, 60, 90 days) does each Fingerprint type become reliably detectable for new members?',
  },
]

export const emmaFingerprintBundle: FingerprintBundle = {
  participantPid: 5,
  fingerprints: FINGERPRINTS,
  mode: 'forming',
}
