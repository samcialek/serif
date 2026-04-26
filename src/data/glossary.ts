/**
 * Glossary — definitions for acronyms and biomarkers shown across the app.
 *
 * Keys are the canonical IDs used by the data layer (e.g. `hrv_daily`,
 * `hscrp`, `acwr`). The `<GlossaryTerm termId="...">` component looks up
 * the entry and renders an inline (i) icon next to the display text;
 * hovering the icon opens a structured popover with Full name, What it
 * is, and (when applicable) a Typical-range / Optimal line.
 *
 * Aliases keyed by alternate spellings (`hs-CRP`, `vo2_peak`, `ApoB`)
 * resolve to the same canonical entry so callers can pass whichever id
 * is most natural at the call site.
 */

export interface GlossaryEntry {
  /** Canonical short form shown in headers / labels (e.g. "HRV"). */
  term: string
  /** Spelled-out name (e.g. "Heart Rate Variability"). */
  fullName: string
  /** One-sentence definition — what it is + why it matters. */
  definition: string
  /** Optional reference range / sweet spot / threshold. */
  typical?: string
}

const ENTRIES: Record<string, GlossaryEntry> = {
  // ─── Cardio / autonomic ─────────────────────────────────────────
  hrv_daily: {
    term: 'HRV',
    fullName: 'Heart Rate Variability',
    definition:
      'Beat-to-beat variation in heart interval. Higher reflects stronger autonomic recovery.',
    typical: '30–80 ms (varies by age + fitness)',
  },
  resting_hr: {
    term: 'RHR',
    fullName: 'Resting Heart Rate',
    definition:
      'Heart rate at full rest, typically measured first thing in the morning. Lower generally reflects better cardiovascular fitness.',
    typical: '50–70 bpm for most adults; <50 in trained endurance athletes',
  },
  vo2_peak: {
    term: 'VO₂ peak',
    fullName: 'Maximal oxygen uptake',
    definition:
      'Highest measured rate of oxygen use during max effort. The single strongest fitness predictor of all-cause mortality.',
    typical: '40+ ml/kg/min is good; 50+ excellent for trained adults',
  },

  // ─── Sleep ──────────────────────────────────────────────────────
  sleep_efficiency: {
    term: 'Sleep efficiency',
    fullName: 'Sleep Efficiency',
    definition:
      'Percentage of time in bed actually spent asleep. Captures fragmentation that total sleep time misses.',
    typical: '85%+ is healthy; below 80% suggests fragmentation',
  },
  deep_sleep: {
    term: 'Deep sleep',
    fullName: 'Slow-wave sleep (N3)',
    definition:
      'Deepest non-REM stage. Drives physical recovery, growth-hormone release, and memory consolidation.',
    typical: '60–120 min/night; declines with age',
  },
  rem_sleep: {
    term: 'REM',
    fullName: 'Rapid Eye Movement sleep',
    definition:
      'Dreaming stage. Critical for emotional processing and memory; concentrated in the second half of the night.',
    typical: '90–120 min/night; ~20–25% of total sleep',
  },
  sleep_onset_latency: {
    term: 'Sleep onset latency',
    fullName: 'Sleep Onset Latency',
    definition:
      'Time from getting into bed to actually falling asleep. Shortens with sleep pressure, lengthens with caffeine, light, and stress.',
    typical: '5–20 min; >30 min consistently can suggest poor sleep pressure or arousal',
  },

  // ─── Metabolic ──────────────────────────────────────────────────
  glucose: {
    term: 'Glucose',
    fullName: 'Fasting blood glucose',
    definition:
      'Blood sugar after an overnight fast. Tracks the metabolic system\'s ability to clear glucose at rest.',
    typical: '<100 mg/dL optimal; 100–125 = pre-diabetic; ≥126 = diabetic',
  },
  hba1c: {
    term: 'HbA1c',
    fullName: 'Glycated hemoglobin',
    definition:
      'Average blood glucose over the prior 2–3 months, captured by glycation of hemoglobin in red blood cells.',
    typical: '<5.7% optimal; 5.7–6.4% pre-diabetic; ≥6.5% diabetic',
  },
  insulin: {
    term: 'Insulin',
    fullName: 'Fasting insulin',
    definition:
      'Insulin level after an overnight fast. Elevated values suggest the pancreas is compensating for insulin resistance.',
    typical: '<10 μIU/mL optimal; >15 suggests insulin resistance',
  },
  cortisol: {
    term: 'Cortisol',
    fullName: 'Cortisol',
    definition:
      'Primary stress hormone. Follows a strong diurnal rhythm — highest in the morning, lowest at night.',
    typical: '6–23 μg/dL morning; pattern matters more than single value',
  },

  // ─── Inflammation ───────────────────────────────────────────────
  hscrp: {
    term: 'hs-CRP',
    fullName: 'High-sensitivity C-reactive protein',
    definition:
      'Systemic inflammation marker. Tracks chronic, low-grade inflammation rather than acute infection.',
    typical: '<1.0 mg/L optimal; 1–3 moderate; >3 elevated cardiovascular risk',
  },

  // ─── Lipids ─────────────────────────────────────────────────────
  apob: {
    term: 'ApoB',
    fullName: 'Apolipoprotein B',
    definition:
      'Counts atherogenic particles in blood (one ApoB per LDL/VLDL/Lp(a) particle). More predictive of cardiovascular risk than LDL-C.',
    typical: '<80 mg/dL optimal; <60 for high-risk profiles; >100 elevated',
  },
  ldl: {
    term: 'LDL',
    fullName: 'Low-density lipoprotein cholesterol',
    definition:
      'Cholesterol carried by LDL particles. Long-standing cardiovascular risk marker, though particle count (ApoB) is more precise.',
    typical: '<100 mg/dL optimal; <70 for high-risk; ≥160 elevated',
  },
  hdl: {
    term: 'HDL',
    fullName: 'High-density lipoprotein cholesterol',
    definition:
      'Cholesterol carried by HDL particles. Higher generally protective, but the relationship plateaus and isn\'t purely linear.',
    typical: '40+ men, 50+ women; 60+ associated with lower cardiovascular risk',
  },
  triglycerides: {
    term: 'Triglycerides',
    fullName: 'Triglycerides',
    definition:
      'Circulating fat molecules. Elevated values are tightly linked to insulin resistance and metabolic dysfunction.',
    typical: '<100 mg/dL optimal; <150 normal; ≥200 high',
  },

  // ─── Iron / hematology ──────────────────────────────────────────
  ferritin: {
    term: 'Ferritin',
    fullName: 'Ferritin',
    definition:
      'Iron-storage protein. The best single measure of iron stores, though it also rises with inflammation.',
    typical: '50–150 ng/mL athletes; <30 suggests deficiency; <15 frank deficiency',
  },
  iron_total: {
    term: 'Iron',
    fullName: 'Serum iron',
    definition:
      'Iron currently circulating in blood, not the same as stored iron (ferritin). Can be normal even when stores are depleted.',
    typical: '60–170 μg/dL adult range',
  },
  hemoglobin: {
    term: 'Hemoglobin',
    fullName: 'Hemoglobin',
    definition:
      'Oxygen-carrying protein in red blood cells. Often the last iron-related marker to fall in deficiency.',
    typical: '13.5–17.5 g/dL men; 12.0–15.5 g/dL women',
  },
  hepcidin: {
    term: 'Hepcidin',
    fullName: 'Hepcidin',
    definition:
      'Master regulator of iron absorption + release. Spikes after intense exercise, blocking iron uptake for ~6 hours.',
  },

  // ─── Hormones / micronutrients ──────────────────────────────────
  testosterone: {
    term: 'Testosterone',
    fullName: 'Total testosterone',
    definition:
      'Primary androgen. Affects muscle mass, libido, and recovery. Levels naturally decline ~1%/year after 30.',
    typical: '300–1000 ng/dL men; 15–70 ng/dL women',
  },
  zinc: {
    term: 'Zinc',
    fullName: 'Zinc',
    definition:
      'Essential trace mineral involved in immune function, wound healing, and testosterone synthesis.',
    typical: '70–120 μg/dL serum range',
  },
  vitamin_d: {
    term: 'Vitamin D',
    fullName: '25-hydroxyvitamin D',
    definition:
      'Storage form of vitamin D. Reflects accumulated sun exposure + supplementation over the prior 2–3 weeks.',
    typical: '30+ ng/mL adequate; 40–60 optimal; <20 deficient',
  },

  // ─── Training load ─────────────────────────────────────────────
  acwr: {
    term: 'ACWR',
    fullName: 'Acute:Chronic Workload Ratio',
    definition:
      'Last 7 days of training load divided by last 28. Quantifies sudden vs accumulated training stress.',
    typical: '0.8–1.3 sweet spot; >1.5 = overreaching risk',
  },
  trimp: {
    term: 'TRIMP',
    fullName: 'Training Impulse',
    definition:
      'Heart-rate-weighted volume score; quantifies internal training load. The score weights time spent at higher heart rates more heavily.',
    typical: 'Daily TRIMP 50–150 typical; weekly 300–4000+ depending on training phase',
  },
  tsb: {
    term: 'TSB',
    fullName: 'Training Stress Balance',
    definition:
      '"Form" — the difference between chronic training load and recent acute load. Positive means well-rested; negative means accumulated fatigue.',
    typical: '+5 to −10 typical; >+10 = peaking; <−20 = high fatigue',
  },
  zone2_minutes: {
    term: 'Z2',
    fullName: 'Zone 2 (training)',
    definition:
      'Aerobic exercise where conversation is still possible — roughly 60–70% of max heart rate. Drives mitochondrial adaptations.',
    typical: '2–4 sessions of 45–90 min/week is a common target',
  },
  zone2_volume: {
    term: 'Z2 volume',
    fullName: 'Zone 2 volume (weekly)',
    definition:
      'Total weekly minutes in aerobic Zone 2 — conversational pace, ~60–70% of max heart rate. Drives mitochondrial adaptations.',
    typical: '90–360 min/week for adaptive load',
  },

  // ─── Body composition ───────────────────────────────────────────
  body_fat_pct: {
    term: 'Body fat %',
    fullName: 'Body fat percentage',
    definition:
      'Fraction of total body mass that is adipose tissue. DEXA is the reference standard; bioimpedance is a rough proxy.',
    typical: '8–20% men, 18–30% women considered healthy',
  },

  // ─── Methodology / measurement ──────────────────────────────────
  bart: {
    term: 'BART',
    fullName: 'Bayesian Additive Regression Trees',
    definition:
      'Non-parametric Bayesian model used in Serif to fit complex outcome curves and produce posterior credible bands (uncertainty ranges).',
  },
  cgm: {
    term: 'CGM',
    fullName: 'Continuous Glucose Monitor',
    definition:
      'Wearable device that samples blood glucose every few minutes, capturing post-meal spikes and overnight stability.',
  },
  neat: {
    term: 'NEAT',
    fullName: 'Non-Exercise Activity Thermogenesis',
    definition:
      'Energy burned in everyday movement (walking, fidgeting, posture) outside of structured exercise. Often a larger contributor to daily energy than workouts.',
  },
  cohens_d: {
    term: "Cohen's d",
    fullName: "Cohen's d",
    definition:
      'Effect size in standard-deviation units. Lets you compare effects on different outcomes on the same scale. ~0.2 small, ~0.5 medium, ~0.8 large.',
  },
}

/** Aliases — alternate keys that resolve to the same canonical entry. */
const ALIASES: Record<string, string> = {
  hrv: 'hrv_daily',
  rhr: 'resting_hr',
  'hs-crp': 'hscrp',
  hs_crp: 'hscrp',
  crp: 'hscrp',
  vo2: 'vo2_peak',
  vo2peak: 'vo2_peak',
  apoB: 'apob',
  apoBeta: 'apob',
  iron: 'iron_total',
  ironsaturationpct: 'iron_total',
  hb: 'hemoglobin',
  z2: 'zone2_minutes',
  zone2: 'zone2_minutes',
  vitamind: 'vitamin_d',
  bodyfat: 'body_fat_pct',
}

export function getGlossaryEntry(termId: string): GlossaryEntry | null {
  if (!termId) return null
  const direct = ENTRIES[termId]
  if (direct) return direct
  const aliased = ALIASES[termId.toLowerCase()]
  if (aliased) return ENTRIES[aliased] ?? null
  return null
}

export const GLOSSARY = ENTRIES
