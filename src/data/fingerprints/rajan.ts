/**
 * Rajan P. — "The Pressure-Forged Pro"
 *
 * 34-year-old high-performer, late workouts, accumulating sleep debt,
 * work stress, fasting glucose drifting upward (95 → 104 over 3 months).
 * His Fingerprint centers on the load/recovery mismatch and the
 * downstream metabolic creep that follows it.
 */

import type { Fingerprint, FingerprintBundle } from './types'

const FINGERPRINTS: Fingerprint[] = [
  // ─── IDENTITY HERO ──
  {
    id: 'id_pressure_glucose_drift',
    type: 'identity_label',
    label: 'Pressure-loaded glucose drift',
    claim:
      'Adherence is high and aerobic capacity is intact, but accumulated sleep debt and weekday work stress are co-rising with a quietly upward fasting-glucose trajectory. The system is being asked to perform faster than it can recover.',
    evidence: { kind: 'note', body: 'Synthesizes the late-workout cliff, sleep-debt accumulation, and 3-month glucose drift cards.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'Plans should pull recovery forward (caffeine cutoff, workout-end discipline) before adding more aerobic load — the metabolic system is running ahead of the recovery system.',
    next_question:
      'Does fasting glucose stabilize when sleep debt drops below 3 hrs, or does it lag by weeks?',
    supports: ['fp_late_workout_cliff', 'fp_sleep_debt_rising', 'fp_glucose_drift'],
    links: { outcomes: ['glucose', 'hrv_daily', 'sleep_efficiency'] },
  },
  {
    id: 'id_late_workout_sensitive',
    type: 'identity_label',
    label: 'Late-workout-sensitive sleeper',
    claim:
      'Sessions ending after 8 PM consistently degrade the next night\'s sleep architecture — REM is hit harder than deep sleep, and sleep latency stretches.',
    evidence: { kind: 'note', body: 'Anchored on fp_late_workout_cliff.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'A 90-minute earlier workout window is likely the cheapest sleep optimization Rajan can make.',
    next_question:
      'Does the cliff hold for low-intensity Z2, or only for hard sessions?',
    supports: ['fp_late_workout_cliff'],
  },
  {
    id: 'id_work_stress_autonomic',
    type: 'identity_label',
    label: 'Weekday-stress autonomic load',
    claim:
      'HRV is meaningfully lower on weekdays than weekends — a clean physiological fingerprint that work stress is taxing the autonomic system, not just the calendar.',
    evidence: { kind: 'note', body: 'Anchored on fp_weekday_hrv_suppression.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'med',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'Weekday recovery interventions (mid-day breath work, HRV biofeedback) are higher-leverage here than weekend ones.',
    next_question:
      'Does the weekday/weekend HRV gap shrink during PTO weeks?',
    supports: ['fp_weekday_hrv_suppression'],
  },

  // ─── THRESHOLDS ──
  {
    id: 'fp_late_workout_cliff',
    type: 'threshold',
    label: 'Workouts after 8 PM cost ~7% sleep efficiency',
    claim:
      'Sessions ending after 20:00 are followed by a measurable drop in sleep efficiency the next night — about 7 percentage points compared to sessions ending before 19:00.',
    evidence: {
      kind: 'cliff',
      knee: 20,
      knee_unit: 'h',
      slope_before: 0,
      slope_after: -7,
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
      'Workouts ending by 19:00 protect REM and sleep onset; pulling sessions out of the late evening is the highest-yield protocol change available.',
    next_question:
      'Does a hard 6 PM session damage sleep more than a moderate 8 PM session?',
    links: {
      outcomes: ['sleep_efficiency', 'rem_sleep'],
      edges: [{ action: 'workout_end_time', outcome: 'sleep_efficiency' }],
    },
  },

  // ─── CONTRADICTIONS ──
  {
    id: 'fp_glucose_drift',
    type: 'contradiction',
    label: 'Fit body, drifting glucose',
    claim:
      'Training volume is in the optimal zone and body composition is stable, but fasting glucose drifted from 95 → 104 mg/dL over three months — a metabolic signal that recovery, not exercise, is the limiter.',
    evidence: {
      kind: 'lab_pair',
      labels: ['Fasting glucose (mg/dL)', 'Sleep debt (h, 14-day)'],
      values_first: [
        { date: '2024-10-15', value: 95, unit: 'mg/dL' },
        { date: '2024-11-20', value: 99, unit: 'mg/dL' },
        { date: '2024-12-22', value: 102, unit: 'mg/dL' },
        { date: '2025-01-10', value: 104, unit: 'mg/dL' },
      ],
      values_second: [
        { date: '2024-10-15', value: 2.1, unit: 'h' },
        { date: '2024-11-20', value: 3.6, unit: 'h' },
        { date: '2024-12-22', value: 5.2, unit: 'h' },
        { date: '2025-01-10', value: 6.2, unit: 'h' },
      ],
    },
    comparison: 'prior_baseline',
    strength: 'strong',
    confidence: 'high',
    stability: 'recently_changed',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Glucose is tracking sleep debt almost monotonically — 9 mg/dL of drift co-occurred with 4 hrs of accumulated debt. Sleep restoration is the metabolic intervention here.',
    next_question:
      'Does a single 7-night reset bring glucose back below 100, or is hepatic insulin resistance now sticking?',
    links: {
      outcomes: ['glucose', 'sleep_efficiency'],
      edges: [{ action: 'sleep_debt', outcome: 'glucose' }],
    },
  },
  {
    id: 'fp_z2_strong_recovery_weak',
    type: 'contradiction',
    label: 'Z2 engine strong, recovery system lagging',
    claim:
      'Aerobic identity is genuinely good — Zone-2 capacity has improved across the data window. But HRV and sleep markers are not keeping pace, suggesting Rajan is stacking adaptive volume on a recovery system that hasn\'t scaled with it.',
    evidence: { kind: 'note', body: 'Combines the Z2 trajectory with the weekday-HRV suppression and sleep-debt accumulation.' },
    comparison: 'self_history',
    strength: 'moderate',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'reliable_pattern',
    implication:
      'Don\'t add Z2 minutes — add recovery scaffolding (earlier caffeine cutoff, earlier workout end, weekday wind-down protocol) until HRV catches up.',
    next_question:
      'Does cutting one weekly hard session, holding Z2 constant, restore the HRV trajectory?',
    links: { outcomes: ['hrv_daily', 'sleep_efficiency', 'vo2_peak'] },
  },

  // ─── BEHAVIORAL ──
  {
    id: 'fp_sleep_debt_rising',
    type: 'behavior',
    label: 'Sleep debt accumulating ~0.4 hrs/week',
    claim:
      'Bedtime has averaged 11:30 PM with wake at 6:30 AM — under his 7-hour minimum about 5 nights/week. The 14-day rolling debt is rising linearly, not catching up on weekends.',
    evidence: {
      kind: 'sparkline',
      values: [2.1, 2.4, 2.9, 3.2, 3.6, 3.9, 4.3, 4.6, 5.0, 5.2, 5.5, 5.8, 6.0, 6.2],
      label: 'Sleep debt 14-day rolling (hours)',
      unit: 'h',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recently_changed',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'No weekend recovery is happening — bedtime is structurally late, not opportunistically late. A bedtime anchor protocol would shift this faster than chasing more total sleep.',
    next_question:
      'Does a 10:30 PM lights-out anchor for 7 days reverse the slope, or just slow it?',
    links: { data_streams: ['sleep_debt_14d', 'bedtime'] },
  },
  {
    id: 'fp_weekday_hrv_suppression',
    type: 'sensitivity',
    label: 'Weekday HRV ~12 ms below weekend',
    claim:
      'Average HRV on weekdays runs ~36 ms; weekends jump to ~48 ms. A 25% gap that persists through the data window — the autonomic load tracks the work calendar, not training.',
    evidence: {
      kind: 'compare_pair',
      self: 36,
      cohort: 48,
      label: 'HRV: weekdays vs weekends',
      unit: 'ms',
      beneficial: 'higher',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'indirect',
    finding: 'reliable_pattern',
    implication:
      'The "I feel better on weekends" story has a clean physiological signature. Weekday-only interventions (mid-day breath work, evening wind-down) are the right shape.',
    next_question:
      'Is the gap driven by Mondays specifically (a weekly autonomic shock) or distributed evenly?',
    links: { data_streams: ['hrv_daily'] },
  },

  // ─── OUTLIERS / RARE COMBOS ──
  {
    id: 'fp_caffeine_early_cutoff',
    type: 'outlier',
    label: 'Caffeine clears slowly — cutoff before 2:15 PM',
    claim:
      'Sleep latency stretches sharply when caffeine is consumed after ~14:15. He metabolizes caffeine on the slower end of the cohort distribution — a single 3 PM coffee can add 18-25 minutes to sleep onset.',
    evidence: {
      kind: 'compare_pair',
      self: 14.25,
      cohort: 16.5,
      label: 'Caffeine cutoff (clock hour)',
      unit: 'h',
      // Lower cutoff = caffeine clears slower for him = more constraint,
      // not less; the clock-hour ordering is a proxy, not a virtue.
      beneficial: 'neutral',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Workplace coffee culture is a structural risk for him — meetings that involve afternoon caffeine are a sleep cost.',
    next_question:
      'Does switching to half-caf at 2 PM hold the line, or does any caffeine after that hour register?',
    links: {
      outcomes: ['sleep_onset_latency', 'sleep_efficiency'],
      edges: [{ action: 'caffeine_timing', outcome: 'sleep_onset_latency' }],
    },
  },

  // ─── DATA FINGERPRINTS ──
  {
    id: 'fp_data_quarterly_labs',
    type: 'data_gap',
    label: 'Quarterly labs catching glucose drift',
    claim:
      'Three lab draws over 90 days were dense enough to catch the fasting-glucose drift early. Continuing this cadence is the right metabolic surveillance for Rajan\'s archetype.',
    evidence: {
      kind: 'note',
      body: '3 draws in 90 days · enough cadence to confirm a 9 mg/dL drift is signal, not noise.',
    },
    comparison: 'cohort',
    strength: 'moderate',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'Don\'t back off the lab cadence — it\'s the early-warning system that caught the metabolic drift before HbA1c.',
    next_question:
      'Would adding HOMA-IR (fasting insulin) tighten the picture meaningfully, or is glucose alone enough?',
  },
]

export const rajanFingerprintBundle: FingerprintBundle = {
  participantPid: 2,
  fingerprints: FINGERPRINTS,
  mode: 'rich',
}
