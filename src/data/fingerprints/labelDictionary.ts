/**
 * Identity-label dictionary — the controlled vocabulary of headline
 * phrases Fingerprint can use to summarize a member's pattern.
 *
 * Why a fixed dictionary: keeps Serif's voice consistent across 1,188
 * members. The same person looking at two different members in a week
 * should hear the same idiom, not 1,188 hand-rolled phrases. Supporting
 * sentences underneath the label are still template-driven from
 * evidence so each member feels distinct in detail.
 *
 * Add new labels sparingly. Each one should describe a real, observable
 * physiological / behavioral pattern that a coach would recognize as a
 * meaningful archetype.
 */

export interface IdentityLabelSpec {
  /** Stable id — referenced by Fingerprint.id when type=identity_label. */
  id: string
  /** Headline phrase. Keep ≤ 5 words. */
  label: string
  /** One-sentence "what does this mean?" body the renderer uses when
   *  the label is expanded. Generic — supporting Fingerprint cards
   *  carry the per-member specifics. */
  description: string
  /** Detector category — used by `computeFingerprints` to decide which
   *  signals can fire this label. */
  category:
    | 'aerobic'
    | 'metabolic'
    | 'sleep'
    | 'recovery'
    | 'rhythm'
    | 'environment'
    | 'data_quality'
}

export const IDENTITY_LABELS = [
  // ─── Aerobic / endurance system ──
  {
    id: 'iron_limited_endurance',
    label: 'Iron-limited endurance system',
    description:
      'Aerobic capacity and training volume are strong, but oxygen transport (iron stores, saturation, hemoglobin) is the constraint that bends the dose-response curve.',
    category: 'aerobic',
  },
  {
    id: 'sub_threshold_aerobic',
    label: 'Sub-threshold aerobic engine',
    description:
      'Cardio adaptations are tracking nicely with current load — VO₂ trajectory matches expected, no signs of overreaching.',
    category: 'aerobic',
  },
  {
    id: 'recovery_constrained_athlete',
    label: 'Training-motivated, recovery-constrained',
    description:
      'Adherence is high and motivation isn\'t the limiter — but recovery markers (HRV, sleep, immune) lag behind training load.',
    category: 'recovery',
  },

  // ─── Rhythm / behavior ──
  {
    id: 'rhythm_stable_load_variable',
    label: 'Rhythm-stable, load-variable',
    description:
      'Sleep and wake times sit in a tight personal envelope, while training volume / intensity vary substantially day to day.',
    category: 'rhythm',
  },
  {
    id: 'consistent_late_chronotype',
    label: 'Consistent late chronotype',
    description:
      'Bedtime is later than the cohort median, but extremely consistent — the rhythm is shifted, not erratic.',
    category: 'rhythm',
  },
  {
    id: 'weekend_drift',
    label: 'Weekend-drift sleeper',
    description:
      'Bedtime, wake time, or training load shift meaningfully between weekdays and weekends.',
    category: 'rhythm',
  },
  {
    id: 'social_jet_lag_pattern',
    label: 'Social-jet-lag pattern',
    description:
      'Weekday and weekend sleep timing diverge enough to create a recurring Monday recovery cost.',
    category: 'rhythm',
  },

  // ─── Sleep ──
  {
    id: 'travel_fragile_sleeper',
    label: 'Travel-fragile sleeper',
    description:
      'Sleep efficiency and architecture degrade sharply when travel load crosses a personal threshold.',
    category: 'sleep',
  },
  {
    id: 'late_workout_sensitive',
    label: 'Late-workout-sensitive sleeper',
    description:
      'Sessions ending late in the evening cost a personal-specific amount of sleep efficiency the following night.',
    category: 'sleep',
  },
  {
    id: 'deep_sleep_strong_efficiency_weak',
    label: 'Deep-sleep strong, efficiency weak',
    description:
      'Slow-wave sleep is reliably high, but time-in-bed isn\'t fully restorative — fragmentation rather than depth is the issue.',
    category: 'sleep',
  },
  {
    id: 'heat_sensitive_sleeper',
    label: 'Heat-sensitive sleeper',
    description:
      'Bedroom or ambient heat above a personal threshold is a strong predictor of fragmented sleep.',
    category: 'sleep',
  },
  {
    id: 'caffeine_sensitive_recovery',
    label: 'Caffeine-sensitive recovery',
    description:
      'Caffeine timing has a steeper-than-typical cost to sleep depth, recovery, or autonomic markers.',
    category: 'sleep',
  },

  // ─── Environment ──
  {
    id: 'cold_sensitive_mover',
    label: 'Cold-sensitive mover',
    description:
      'Cold days reduce training volume, steps, and downstream sleep markers — outdoor adherence is temperature-bounded.',
    category: 'environment',
  },
  {
    id: 'air_quality_sensitive',
    label: 'Air-quality-sensitive recovery',
    description:
      'HRV, resting HR, or hsCRP track local AQI more closely than the cohort average.',
    category: 'environment',
  },
  {
    id: 'humidity_sensitive_performance',
    label: 'Humidity-sensitive performer',
    description:
      'Aerobic session quality drops noticeably in high-humidity conditions versus dry-day baselines.',
    category: 'environment',
  },

  // ─── Metabolic / lipid / inflammation ──
  {
    id: 'low_inflammation_profile',
    label: 'Low-inflammation profile',
    description:
      'hsCRP and inflammatory markers run consistently below cohort medians, even when other systems are stressed.',
    category: 'metabolic',
  },
  {
    id: 'particle_clean_hdl_lagging',
    label: 'Clean ApoB, lagging HDL',
    description:
      'ApoB and triglyceride profile are excellent, but HDL is below the optimal range — a specific lipid asymmetry, not a general cardiometabolic risk.',
    category: 'metabolic',
  },
  {
    id: 'glucose_variable_mean_fine',
    label: 'Stable mean glucose, variable peaks',
    description:
      'Fasting glucose looks fine, but post-meal excursions or dawn-effect spikes carry the metabolic risk signal.',
    category: 'metabolic',
  },
  {
    id: 'pressure_loaded_glucose_drift',
    label: 'Pressure-loaded glucose drift',
    description:
      'Glucose is drifting upward while sleep debt, stress, or recovery load are also elevated.',
    category: 'metabolic',
  },
  {
    id: 'high_responder_metabolic',
    label: 'High-responder metabolic system',
    description:
      'Glucose, weight, or lipid markers respond quickly and noticeably to nutrition and timing changes.',
    category: 'metabolic',
  },
  {
    id: 'eating_window_responder',
    label: 'Eating-window responder',
    description:
      'Meal timing and eating-window compression produce a cleaner metabolic signal than most other levers.',
    category: 'metabolic',
  },
  {
    id: 'glucose_sensitive_alcohol',
    label: 'Glucose-sensitive to alcohol',
    description:
      'Alcohol produces a repeatable next-day glucose cost that is large enough to plan around.',
    category: 'metabolic',
  },
  {
    id: 'cycle_aware_metabolic_responder',
    label: 'Cycle-aware metabolic responder',
    description:
      'Cycle phase acts as a recurring moderator on glucose, sleep, or recovery response.',
    category: 'metabolic',
  },
  {
    id: 'insulin_resistant_athletic',
    label: 'Athletic but insulin-resistant',
    description:
      'Body composition and training load look fit, but fasting insulin / HOMA-IR sit above expected for the activity level.',
    category: 'metabolic',
  },

  // ─── Recovery / autonomic ──
  {
    id: 'high_variability_responder',
    label: 'High-variability responder',
    description:
      'HRV, sleep quality, or training markers swing more day-to-day than the cohort — interventions take longer to reach a clear signal.',
    category: 'recovery',
  },
  {
    id: 'rhythm_stable_hrv',
    label: 'Stable autonomic baseline',
    description:
      'Resting HR and HRV mean look average, but their day-to-day variability is unusually low — an unusually predictable nervous system.',
    category: 'recovery',
  },
  {
    id: 'fresh_but_under_slept',
    label: 'Fresh but under-slept',
    description:
      'Training stress balance is positive — bodies look unloaded — but sleep debt is rising. Recovery quality is masked by recent low load.',
    category: 'recovery',
  },
  {
    id: 'weekday_stress_autonomic_load',
    label: 'Weekday-stress autonomic load',
    description:
      'Autonomic markers degrade during workweek exposure and recover when the weekday stressor lifts.',
    category: 'recovery',
  },
  {
    id: 'inflammation_managed_athlete',
    label: 'Inflammation-managed athlete',
    description:
      'Inflammation markers have improved enough that the constraint has moved from inflammatory load to another system.',
    category: 'recovery',
  },
  {
    id: 'slow_autonomic_recovery',
    label: 'Slow autonomic recovery (48-hour window)',
    description:
      'Hard sessions require roughly two days before HRV or resting heart rate returns to baseline.',
    category: 'recovery',
  },

  // ─── Data quality (rendered in the data-gap state) ──
  {
    id: 'data_rich_biomarker',
    label: 'Data-rich biomarker profile',
    description:
      'Lab cadence is tight enough to support long-horizon biomarker personalization without leaning on cohort priors.',
    category: 'data_quality',
  },
  {
    id: 'wearable_rich_lab_sparse',
    label: 'Wearable-rich, lab-sparse',
    description:
      'Daily wearable streams are dense; biomarker draws are infrequent — quotidian outcomes are well-personalized, longevity outcomes still lean on priors.',
    category: 'data_quality',
  },
  {
    id: 'environment_observed',
    label: 'Environmentally-observed',
    description:
      'Weather, AQI, and travel context are rich enough to detect environmental sensitivity beyond what wearables alone reveal.',
    category: 'data_quality',
  },
  {
    id: 'baseline_still_forming',
    label: 'Baseline still forming',
    description:
      'Personalization is in early days — most edges still lean on cohort and literature priors. Repeat measurement (especially labs) would unlock the most.',
    category: 'data_quality',
  },
] as const satisfies readonly IdentityLabelSpec[]

const BY_ID: ReadonlyMap<string, IdentityLabelSpec> = new Map(
  IDENTITY_LABELS.map((l) => [l.id, l]),
)

export type IdentityLabelId = (typeof IDENTITY_LABELS)[number]['id']

export function getIdentityLabel(id: string): IdentityLabelSpec | undefined {
  return BY_ID.get(id)
}

export function isIdentityLabelId(id: string): id is IdentityLabelId {
  return BY_ID.has(id)
}
