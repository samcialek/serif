import type { CandidateDataSource } from './types'

/**
 * 9 candidate data sources that could unlock new causal edges.
 *
 * Each spec lists:
 *   - newDoseFamilies   — dose families the device adds (registered in
 *                         DOSE_FAMILIES). Each family unlocks every
 *                         mechanism that targets it.
 *   - newResponseFamilies — same idea for outcomes (e.g. systolic_bp).
 *   - newColumns        — raw columns added on top, used for confounder-
 *                         resolution scoring.
 *
 * Narratives intentionally trimmed to one short sentence per edge —
 * the card surfaces the headline + signal-boost number, not a paragraph.
 */
export const CANDIDATE_DATA_SOURCES: CandidateDataSource[] = [
  {
    id: 'cgm',
    name: 'Continuous Glucose Monitor',
    icon: 'Activity',
    category: 'Metabolic',
    description:
      'Real-time interstitial glucose every 1-5 min — adds variability, time-in-range, and dawn-effect metrics.',
    exampleProducts: ['Dexcom G7', 'Abbott Libre 3', 'Levels'],
    newDoseFamilies: ['cgm_variability'],
    newResponseFamilies: ['glucose', 'hba1c'],
    newColumns: [
      'cgm_mean_glucose',
      'cgm_glucose_variability_cv',
      'cgm_time_in_range_pct',
      'cgm_time_above_140',
      'cgm_time_above_180',
      'cgm_dawn_effect',
    ],
    frequency: 'Continuous (288+ readings/day)',
    keyEdgeNarratives: [
      { edgeTitle: 'Glucose Variability → hsCRP', type: 'unlock', narrative: 'Direct test of variability-driven inflammation.' },
      { edgeTitle: 'Time-in-Range → VO₂peak', type: 'unlock', narrative: 'Tests whether glycemic control supports aerobic capacity.' },
      { edgeTitle: 'Training Hours → Glucose', type: 'boost', narrative: 'eff_n 4 → ~100 with daily readings.' },
    ],
  },
  {
    id: 'nutrition',
    name: 'Nutrition Tracker',
    icon: 'Apple',
    category: 'Nutrition',
    description:
      'Daily macros + micros — adds carbs, fat, fiber, sodium streams Apple Health doesn\'t provide.',
    exampleProducts: ['Cronometer', 'MacroFactor', 'MyFitnessPal'],
    newDoseFamilies: ['dietary_carbs', 'dietary_fat', 'dietary_fiber', 'dietary_sodium'],
    newResponseFamilies: [],
    newColumns: [
      'dietary_carbs_g',
      'dietary_fat_g',
      'dietary_fiber_g',
      'dietary_sodium_mg',
    ],
    frequency: 'Daily logging',
    keyEdgeNarratives: [
      { edgeTitle: 'Carbs → Glucose / TG', type: 'unlock', narrative: 'Direct dietary lever for glycemic + lipid response.' },
      { edgeTitle: 'Fiber → hsCRP / LDL', type: 'unlock', narrative: 'Microbiome + bile-acid pathway not currently measured.' },
      { edgeTitle: 'Protein → Body Fat', type: 'boost', narrative: 'Lifts eff_n on the existing protein edge.' },
    ],
  },
  {
    id: 'blood_pressure',
    name: 'Blood Pressure Monitor',
    icon: 'Heart',
    category: 'Cardiovascular',
    description:
      'Daily BP — links sodium, training spikes, sleep, and travel to vascular health.',
    exampleProducts: ['Withings BPM Connect', 'Omron Evolv', 'QardioArm'],
    newDoseFamilies: [],
    newResponseFamilies: ['systolic_bp'],
    newColumns: [
      'systolic_bp',
      'diastolic_bp',
      'mean_arterial_pressure',
      'pulse_pressure',
    ],
    frequency: 'Daily (AM/PM)',
    keyEdgeNarratives: [
      { edgeTitle: 'Sodium → BP', type: 'unlock', narrative: 'New cardiovascular outcome paired with the sodium lever.' },
      { edgeTitle: 'ACWR / Sleep Debt / Travel → BP', type: 'unlock', narrative: 'Tests vascular consequences of existing load drivers.' },
      { edgeTitle: 'ACWR → Resting HR', type: 'boost', narrative: 'BP pairs with HR to flag sympathetic-driven hypertension risk.' },
    ],
  },
  {
    id: 'body_temperature',
    name: 'Body Temperature Sensor',
    icon: 'Thermometer',
    category: 'Recovery',
    description:
      'Continuous skin/core temperature — circadian, illness, and recovery monitoring.',
    exampleProducts: ['Oura Ring', 'WHOOP 4.0', 'TempDrop'],
    newDoseFamilies: ['body_temperature'],
    newResponseFamilies: ['core_temperature'],
    newColumns: [
      'skin_temp_deviation',
      'core_temp_est',
      'nocturnal_temp_min',
    ],
    frequency: 'Continuous overnight',
    keyEdgeNarratives: [
      { edgeTitle: 'Core Temp → Deep Sleep / SE', type: 'unlock', narrative: 'Resolves thermoregulation as a sleep mediator.' },
      { edgeTitle: 'Training → Core Temp', type: 'unlock', narrative: 'Quantifies post-session core-temp elevation.' },
      { edgeTitle: 'core_temperature (latent)', type: 'confounder', narrative: 'Resolves the latent core-temperature node in the DAG.' },
    ],
  },
  {
    id: 'mood_stress',
    name: 'Mood / Stress Tracker',
    icon: 'Brain',
    category: 'Subjective',
    description:
      'Daily ratings for mood, stress, energy, motivation, and session RPE.',
    exampleProducts: ['Daylio', 'How We Feel', 'Bearable'],
    newDoseFamilies: ['subjective_stress', 'perceived_exertion'],
    newResponseFamilies: [],
    newColumns: [
      'mood_score',
      'stress_score',
      'energy_score',
      'motivation_score',
      'perceived_exertion_rpe',
    ],
    frequency: 'Daily self-report',
    keyEdgeNarratives: [
      { edgeTitle: 'Stress → Cortisol / Testosterone / HRV', type: 'unlock', narrative: 'Disentangles psychological stress from training load.' },
      { edgeTitle: 'RPE → Next-Day HRV', type: 'unlock', narrative: 'Captures the central-fatigue dimension TRIMP misses.' },
      { edgeTitle: 'energy_expenditure (latent)', type: 'confounder', narrative: 'RPE proxies for total energy expenditure.' },
    ],
  },
  {
    id: 'monthly_labs',
    name: 'Monthly Lab Testing',
    icon: 'TestTube',
    category: 'Biomarkers',
    description:
      'Quarterly → monthly draws — boosts eff_n on every marker-based edge.',
    exampleProducts: ['Quest Direct', 'InsideTracker', 'Function Health'],
    newDoseFamilies: [],
    newResponseFamilies: [],
    newColumns: [],
    frequency: 'Monthly blood draws',
    keyEdgeNarratives: [
      { edgeTitle: 'Running → Iron / Ferritin', type: 'boost', narrative: 'eff_n 2 → 30+: crosses the prior/personal inflection.' },
      { edgeTitle: 'Training → Testosterone', type: 'boost', narrative: 'Tests the inverted-U curve against personal HPA response.' },
    ],
  },
  {
    id: 'dedicated_hrv',
    name: 'Dedicated HRV Monitor',
    icon: 'HeartPulse',
    category: 'Recovery',
    description:
      'Chest-strap HRV — adds RMSSD, pNN50, and LF/HF frequency-domain metrics.',
    exampleProducts: ['Polar H10', 'Elite HRV', 'Corsense'],
    newDoseFamilies: ['hrv_advanced'],
    newResponseFamilies: ['hrv_daily', 'hrv_baseline'],
    newColumns: [
      'hrv_rmssd_morning',
      'hrv_pnn50',
      'hrv_lf_hf_ratio',
    ],
    frequency: 'Daily 2-min morning reading',
    keyEdgeNarratives: [
      { edgeTitle: 'LF/HF → VO₂peak', type: 'unlock', narrative: 'Sympathovagal balance as a fitness-adaptation marker.' },
      { edgeTitle: 'pNN50 → Resting HR Trend', type: 'unlock', narrative: 'Vagal-tone proxy beyond wrist-based HRV noise.' },
      { edgeTitle: 'TRIMP → Next-Day HRV', type: 'boost', narrative: 'Cleaner measurement on the strongest recovery edge.' },
    ],
  },
  {
    id: 'genetic_data',
    name: 'Genetic Data',
    icon: 'Dna',
    category: 'Genomics',
    description:
      'SNP data for Mendelian randomization and gene × environment interactions.',
    exampleProducts: ['23andMe', 'AncestryDNA + Promethease', 'SelfDecode'],
    newDoseFamilies: [],
    newResponseFamilies: [],
    newColumns: [
      'iron_absorption_prs',
      'vitd_metabolism_prs',
      'ldl_receptor_prs',
      'caffeine_metabolism_cyp1a2',
      'apoe_genotype',
    ],
    frequency: 'One-time test',
    keyEdgeNarratives: [
      { edgeTitle: 'Iron PRS (instrument)', type: 'confounder', narrative: 'Mendelian randomization for iron absorption.' },
      { edgeTitle: 'LDL receptor PRS', type: 'confounder', narrative: 'Resolves lipoprotein-lipase confounder on Z2 → LDL.' },
      { edgeTitle: 'insulin_sensitivity (latent)', type: 'confounder', narrative: 'Time-invariant instrument for HOMA-IR.' },
    ],
  },
  {
    id: 'respiratory_rate',
    name: 'Respiratory Rate Monitor',
    icon: 'Wind',
    category: 'Recovery',
    description:
      'Nocturnal respiratory rate + variability — early marker of overreaching, illness, autonomic stress.',
    exampleProducts: ['WHOOP', 'Oura Gen3', 'Garmin (select models)'],
    newDoseFamilies: ['respiratory_rate'],
    newResponseFamilies: [],
    newColumns: [
      'respiratory_rate_sleep',
      'respiratory_rate_variability',
    ],
    frequency: 'Continuous overnight',
    keyEdgeNarratives: [
      { edgeTitle: 'Nocturnal RR → HRV / SE', type: 'unlock', narrative: 'Independent autonomic-stress signal beyond HRV.' },
      { edgeTitle: 'TRIMP → Next-Day HRV', type: 'boost', narrative: 'RR disambiguates cardiac vs respiratory fatigue.' },
    ],
  },
]
