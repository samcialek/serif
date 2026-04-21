/**
 * Phase 1 + Phase 2 integration catalog for the data-moat roadmap.
 *
 * Items correspond to the top-ranked external sources that would expand
 * the engine's testable-edge surface. Every item except Open-Meteo is
 * wiring-only (dummy Connect) — they exist to make the roadmap legible
 * inside the product. Open-Meteo is the one live integration.
 */

export type IntegrationPhase = 1 | 2
export type IntegrationStatus = 'connected' | 'available' | 'coming_soon'

export interface PhasedIntegration {
  id: string
  name: string
  vendor: string
  category: 'ehr' | 'cgm' | 'wearable' | 'biomarker' | 'environment' | 'genetic' | 'research' | 'sdoh'
  phase: IntegrationPhase
  rank: number
  score: number // 0–10, from the ranking memo
  status: IntegrationStatus
  description: string
  whyItMatters: string
  unlockEdges: string[]
  icon: string // lucide name
  accent: string // tailwind color token, e.g. 'blue' | 'amber' | ...
  live?: boolean // true for Open-Meteo
}

export const PHASED_INTEGRATIONS: PhasedIntegration[] = [
  // ————— Phase 1 (0–3 months) —————
  {
    id: 'open_meteo',
    name: 'Weather',
    vendor: 'Open-Meteo',
    category: 'environment',
    phase: 1,
    rank: 5,
    score: 7.6,
    status: 'connected',
    description: 'Free global weather API: temperature, humidity, pressure, UV at any lat/lon.',
    whyItMatters:
      'Heat load shifts sleep, HRV, and zone-2 HR drift. Ambient pressure shifts affect migraine and vagal tone. No key required.',
    unlockEdges: ['ambient_temp → sleep_efficiency', 'ambient_temp → hrv', 'pressure → headache_incidence'],
    icon: 'CloudSun',
    accent: 'sky',
    live: true,
  },
  {
    id: 'vim_ehr',
    name: 'EHR Snapshot',
    vendor: 'Vim',
    category: 'ehr',
    phase: 1,
    rank: 1,
    score: 9.2,
    status: 'available',
    description: 'Real-time clinical snapshot (labs, meds, problems) at point of care via Vim’s EHR overlay.',
    whyItMatters:
      'Grounds protocols in the participant’s actual clinical record — current meds, lab trends, ICD-coded problems — instead of self-report.',
    unlockEdges: ['medication → biomarker slopes', 'diagnosis → baseline priors'],
    icon: 'Stethoscope',
    accent: 'indigo',
  },
  {
    id: 'dexcom_cgm',
    name: 'Continuous Glucose',
    vendor: 'Dexcom G7',
    category: 'cgm',
    phase: 1,
    rank: 2,
    score: 9.0,
    status: 'available',
    description: '5-minute interstitial glucose traces with 14-day sensor life.',
    whyItMatters:
      'Only way to measure postprandial dynamics and overnight glycemia in free-living conditions. Anchors the glucose sub-graph.',
    unlockEdges: ['meal_composition → glucose_auc', 'sleep_debt → dawn_glucose', 'zone2 → fasting_glucose'],
    icon: 'Activity',
    accent: 'rose',
  },
  {
    id: 'garmin_bbi',
    name: 'Beat-to-Beat Intervals',
    vendor: 'Garmin Health',
    category: 'wearable',
    phase: 1,
    rank: 3,
    score: 8.6,
    status: 'available',
    description: 'Raw R-R intervals (not just HRV summary) from Garmin watches and chest straps.',
    whyItMatters:
      'Raw BBI unlocks true RMSSD, HF-power, and DFA-α1 — the bread and butter of autonomic-state inference. Summary HRV alone is lossy.',
    unlockEdges: ['training_load → autonomic_state', 'alcohol → vagal_tone', 'sleep_stage → rmssd'],
    icon: 'HeartPulse',
    accent: 'red',
  },
  {
    id: 'mimic_iv',
    name: 'MIMIC-IV Priors',
    vendor: 'PhysioNet',
    category: 'research',
    phase: 1,
    rank: 4,
    score: 8.2,
    status: 'available',
    description: 'De-identified ICU records for 300K+ admissions — used to strengthen cohort priors on rare edges.',
    whyItMatters:
      'Borrows strength from a large labeled corpus to tighten priors on edges where we have sparse user data (e.g. acute electrolyte shifts).',
    unlockEdges: ['cohort priors on low-n biomarker edges'],
    icon: 'Database',
    accent: 'slate',
  },
  {
    id: 'airnow_aq',
    name: 'Air Quality',
    vendor: 'AirNow / OpenAQ',
    category: 'environment',
    phase: 1,
    rank: 6,
    score: 7.3,
    status: 'available',
    description: 'Real-time PM2.5, ozone, and AQI by geolocation.',
    whyItMatters:
      'PM2.5 spikes degrade overnight recovery and VO2 on outdoor workouts. Adds a confounder the engine currently can’t see.',
    unlockEdges: ['pm25 → vo2_drift', 'pm25 → sleep_latency'],
    icon: 'Wind',
    accent: 'emerald',
  },

  // ————— Phase 2 (3–6 months) —————
  {
    id: 'function_health',
    name: 'Quarterly Biomarker Panel',
    vendor: 'Function Health',
    category: 'biomarker',
    phase: 2,
    rank: 7,
    score: 8.1,
    status: 'coming_soon',
    description: '100+ biomarkers drawn 2–4x per year with structured trend delivery.',
    whyItMatters:
      'Cadenced multi-panel draws are exactly the input shape the biomarker-pathway engine is built for — many pre/post pairs across a stable panel.',
    unlockEdges: ['nutrition → lipid_panel', 'training → ferritin / crp', 'sleep → cortisol / dhea'],
    icon: 'FlaskConical',
    accent: 'amber',
  },
  {
    id: 'polar_ecg',
    name: 'Single-Lead ECG',
    vendor: 'Polar H10 SDK',
    category: 'wearable',
    phase: 2,
    rank: 8,
    score: 7.9,
    status: 'coming_soon',
    description: 'Medical-grade ECG at 130 Hz for a fraction of Holter cost.',
    whyItMatters:
      'QT interval and ectopy visibility on-demand — used for training-stress quantification and drug-effect monitoring.',
    unlockEdges: ['caffeine → ectopy_burden', 'training_state → qt_interval'],
    icon: 'HeartPulse',
    accent: 'red',
  },
  {
    id: 'terra_ring',
    name: 'Oura / WHOOP',
    vendor: 'Terra API',
    category: 'wearable',
    phase: 2,
    rank: 9,
    score: 7.6,
    status: 'coming_soon',
    description: 'Unified API for ring- and strap-form wearables — sleep stages, skin temp, strain.',
    whyItMatters:
      'Skin-temp deviation is the single best proxy we have for illness onset and menstrual phase. Both matter for conditioning-on-state.',
    unlockEdges: ['illness_latent → recovery', 'cycle_phase → training_response'],
    icon: 'Watch',
    accent: 'purple',
  },
  {
    id: 'genotype_upload',
    name: 'Genotype Upload',
    vendor: '23andMe / AncestryDNA',
    category: 'genetic',
    phase: 2,
    rank: 10,
    score: 7.4,
    status: 'coming_soon',
    description: 'User-uploaded raw genotype files. Extracts ~20 actionable SNPs (APOE, MTHFR, FTO, CYP1A2…).',
    whyItMatters:
      'A handful of SNPs move slopes on caffeine half-life, saturated-fat response, and B-vitamin metabolism. One-shot personalization input.',
    unlockEdges: ['cyp1a2 → caffeine half-life', 'apoe → ldl response', 'mthfr → b-vitamin dosing'],
    icon: 'Dna',
    accent: 'fuchsia',
  },
  {
    id: 'sdoh_place',
    name: 'Neighborhood SDOH',
    vendor: 'Census + PLACES',
    category: 'sdoh',
    phase: 2,
    rank: 11,
    score: 7.0,
    status: 'coming_soon',
    description: 'Census-tract-level social determinants of health (income, food access, walkability, air).',
    whyItMatters:
      'Adds a structural confounder for behavior edges where access and environment are doing much of the work that looks like "discipline".',
    unlockEdges: ['walkability → step_volume', 'food_access → diet_quality'],
    icon: 'MapPin',
    accent: 'teal',
  },
]

export function integrationsByPhase(): Record<IntegrationPhase, PhasedIntegration[]> {
  const p1: PhasedIntegration[] = []
  const p2: PhasedIntegration[] = []
  for (const i of PHASED_INTEGRATIONS) {
    if (i.phase === 1) p1.push(i)
    else p2.push(i)
  }
  p1.sort((a, b) => a.rank - b.rank)
  p2.sort((a, b) => a.rank - b.rank)
  return { 1: p1, 2: p2 }
}
