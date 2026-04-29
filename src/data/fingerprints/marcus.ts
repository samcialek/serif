/**
 * Marcus J. — "The Recovery Specialist"
 *
 * 47-year-old former athlete managing inflammation through tight
 * recovery protocols. HRV recovery is slow (48 hrs), training stacks
 * fast (only 36 hrs between sessions). His Fingerprint centers on the
 * inflammation-management discipline that's working, and the
 * recovery-time mismatch that's undermining it.
 */

import type { Fingerprint, FingerprintBundle } from './types'

const FINGERPRINTS: Fingerprint[] = [
  // ─── IDENTITY HERO ──
  {
    id: 'id_inflammation_managed',
    type: 'identity_label',
    identity_label_id: 'inflammation_managed_athlete',
    label: 'Inflammation-managed athlete',
    claim:
      'hsCRP has trended down across the data window — the zero-alcohol + cool-sleep + early-cutoff stack is working. Inflammation is no longer the constraint it was; the residual issues live elsewhere now.',
    evidence: { kind: 'note', body: 'Synthesizes the hsCRP trajectory + zero-alcohol streak + cool-sleeper + early caffeine cutoff.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recently_changed',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'Don\'t loosen the anti-inflammatory protocols — they\'re load-bearing. The next gains come from elsewhere (recovery timing).',
    next_question:
      'Does relaxing one protocol (e.g., reintroducing 1 alcohol/week) move hsCRP detectably, or is the buffer wide enough?',
    supports: ['fp_hscrp_falling', 'fp_zero_alcohol', 'fp_cool_sleeper'],
    links: { outcomes: ['hscrp', 'sleep_efficiency'] },
  },
  {
    id: 'id_slow_recovery_window',
    type: 'identity_label',
    identity_label_id: 'slow_autonomic_recovery',
    label: 'Slow autonomic recovery (48-hour window)',
    claim:
      'HRV takes ~48 hours to return to baseline after hard sessions, but he\'s currently stacking sessions every 36 hours. The protocol is fighting his recovery clock.',
    evidence: { kind: 'note', body: 'Anchored on fp_hrv_recovery_lag.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'The cheapest training change is spacing — same volume, 48-hour gaps instead of 36-hour. Equal load, lower autonomic cost.',
    next_question:
      'Does the 48-hour recovery window shorten over a 4-week deload, or is it constitutional?',
    supports: ['fp_hrv_recovery_lag'],
  },
  {
    id: 'id_caffeine_sensitive',
    type: 'identity_label',
    identity_label_id: 'caffeine_sensitive_recovery',
    label: 'Caffeine-sensitive recovery',
    claim:
      'Cutoff at noon — 4-5 hours earlier than the cohort median. He metabolizes caffeine slowly and the deep-sleep cost of any afternoon caffeine is steep.',
    evidence: { kind: 'note', body: 'Anchored on fp_noon_caffeine_cutoff.' },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'No social or workplace caffeine after noon — this is a hard rail, not a guideline.',
    next_question:
      'Does CYP1A2 genotype confirm the slow-metabolizer phenotype the data is showing?',
    supports: ['fp_noon_caffeine_cutoff'],
  },

  // ─── THRESHOLDS ──
  {
    id: 'fp_hrv_recovery_lag',
    type: 'threshold',
    label: '48-hour HRV recovery window vs 36-hour spacing',
    claim:
      'Post-session HRV takes a median 48 hours to return to baseline, but his current schedule stacks sessions every 36 hours — meaning his nervous system is starting each session ~10-12 ms below baseline.',
    evidence: {
      kind: 'cliff',
      knee: 36,
      knee_unit: 'h',
      slope_before: 0,
      slope_after: -11,
      outcome_label: 'HRV at next session start',
      outcome_unit: 'ms',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Same volume, 48-hour gaps would let HRV reset — quality of each session would rise, even if total weekly load was identical.',
    next_question:
      'Does adding a single low-intensity Z2 day in the gap (instead of full rest) hurt or help recovery?',
    links: {
      outcomes: ['hrv_daily'],
      edges: [{ action: 'training_load', outcome: 'hrv_daily' }],
    },
  },
  {
    id: 'fp_noon_caffeine_cutoff',
    type: 'threshold',
    label: 'Caffeine after noon = -8 minutes deep sleep',
    claim:
      'Each cup of coffee after 12:00 costs ~8 minutes of deep sleep that night. The cutoff is sharp — caffeine before noon is fine, after noon is not.',
    evidence: {
      kind: 'cliff',
      knee: 12,
      knee_unit: 'h',
      slope_before: 0,
      slope_after: -8,
      outcome_label: 'Deep sleep',
      outcome_unit: 'min',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recurring',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Slow caffeine metabolism makes the 12:00 cutoff a hard rail, not a guideline.',
    next_question:
      'Does decaf at 2 PM trigger the same cost (placebo / ritual), or only caffeinated?',
    links: {
      outcomes: ['deep_sleep', 'sleep_efficiency'],
      edges: [{ action: 'caffeine_timing', outcome: 'deep_sleep' }],
    },
  },

  // ─── BEHAVIORAL ──
  {
    id: 'fp_zero_alcohol',
    type: 'behavior',
    label: '60-day zero-alcohol streak',
    claim:
      'Zero alcohol for 60 days is the longest discipline streak in his data set. hsCRP began declining about 3 weeks into it — alcohol cessation appears to be the single largest driver of the inflammation improvement.',
    evidence: {
      kind: 'sparkline',
      values: [1.8, 1.7, 1.6, 1.5, 1.3, 1.2, 1.1, 0.9, 0.8, 0.7, 0.6, 0.5],
      label: 'hsCRP trajectory (mg/L) over alcohol-free weeks',
      unit: 'mg/L',
    },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'watch_only',
    finding: 'likely_driver',
    implication:
      'This is the keystone protocol — the rest of the inflammatory wins likely cascade from it. Treat the streak as a load-bearing intervention.',
    next_question:
      'How does hsCRP behave if alcohol is reintroduced at 1 unit/week — does the inflammation reset, or stay quiet?',
    links: { outcomes: ['hscrp'] },
  },

  // ─── CONTRADICTIONS ──
  {
    id: 'fp_high_volume_short_recovery',
    type: 'contradiction',
    label: 'Training load up, recovery time down',
    claim:
      'Training load (TRIMP) has risen across the last 3 weeks while between-session recovery time has shrunk — a load-recovery scissors that\'s pulling the autonomic system below baseline before each new stimulus.',
    evidence: { kind: 'note', body: 'Combines fp_hrv_recovery_lag with the rising TRIMP series in his loads.' },
    comparison: 'self_history',
    strength: 'strong',
    confidence: 'high',
    stability: 'recently_changed',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Either the load needs to drop, or the spacing needs to widen. The current trajectory is unsustainable for an athlete with his recovery timing.',
    next_question:
      'Does pulling the third hard session of the week to the following Monday (creating a 60-hour gap) reset the trend?',
    links: { outcomes: ['hrv_daily', 'sleep_efficiency'] },
  },

  // ─── OUTLIERS ──
  {
    id: 'fp_cool_sleeper',
    type: 'outlier',
    label: 'Cool-sleeper threshold at 18 °C',
    claim:
      'Sleep efficiency drops sharply above 18 °C bedroom temperature — among the tightest heat tolerances in the cohort. Even mild summer warming triggers fragmentation.',
    evidence: {
      kind: 'compare_pair',
      self: 18,
      cohort: 21,
      label: 'Bedroom temperature ceiling',
      unit: '°C',
      // Tighter threshold = more constraint, not better physiology.
      beneficial: 'neutral',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'stable',
    actionability: 'direct',
    finding: 'likely_driver',
    implication:
      'Active climate control year-round, not just in summer. A 22 °C bedroom is sleep loss, not comfort.',
    next_question:
      'Does the threshold shift if humidity is controlled (i.e., is it heat-index, not raw temp)?',
    links: { outcomes: ['sleep_efficiency', 'deep_sleep'] },
  },
  {
    id: 'fp_hscrp_falling',
    type: 'outlier',
    label: 'hsCRP improving — now in optimal range',
    claim:
      'hsCRP fell from 1.8 to 0.5 mg/L over the data window — moved from average-risk to optimal-range. This is the highest-leverage marker in his improvement story.',
    evidence: {
      kind: 'compare_pair',
      self: 0.5,
      cohort: 1.0,
      label: 'hsCRP',
      unit: 'mg/L',
      beneficial: 'lower',
    },
    comparison: 'cohort',
    strength: 'strong',
    confidence: 'high',
    stability: 'recently_changed',
    actionability: 'watch_only',
    finding: 'reliable_pattern',
    implication:
      'The whole-system inflammatory burden has dropped meaningfully. Recovery should accelerate as a second-order effect.',
    next_question:
      'Does HRV mean rise alongside hsCRP falling, or are they tracking independently?',
    links: { outcomes: ['hscrp', 'hrv_daily'] },
  },
]

export const marcusFingerprintBundle: FingerprintBundle = {
  participantPid: 4,
  fingerprints: FINGERPRINTS,
  mode: 'rich',
}
