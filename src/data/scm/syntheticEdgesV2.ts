/**
 * V2 fork: additive synthetic edges that extend the Phase-1 literature
 * priors in `syntheticEdges.ts`. Loaded only by `useSCMv2`, so the
 * canonical engine in `useSCM` stays untouched.
 *
 * Edges follow the canonical `SyntheticEdgeSpec` shape and feed through
 * the same `buildSyntheticEquations` machinery — `useSCMv2` unions the
 * two lists before deduping against fitted cohort equations.
 *
 * Phase 1a: literature-backed edges for the seven quiet longevity
 * outcomes (ALT, uric_acid, homocysteine, hemoglobin, mg_rbc).
 *
 * Phase 1b will add `sleep_quality` as an independent action.
 * Phase 1c will add `resistance_training_minutes`.
 */

import type { SyntheticEdgeSpec } from './syntheticEdges'

// ─── Phase 1a · Quiet-outcome edges ────────────────────────────────
//
// Conventions match PHASE_1_EDGES: `mean` is on a [-1, 1] normalized
// scale (sign matters for tone, magnitude scaled by action × outcome
// span at translation time).

const QUIET_OUTCOME_EDGES: SyntheticEdgeSpec[] = [
  // ─── ALT (alanine aminotransferase) — liver stress ──
  {
    action: 'alcohol_units',
    outcome: 'alt',
    mean: 0.55,
    pathway: 'biomarker',
    horizonDays: 42,
    rationale:
      'Hepatocellular stress marker rises within weeks of sustained intake above ~2 units/day; reverses on abstinence (Klatsky 2003 meta).',
  },
  {
    action: 'dietary_energy',
    outcome: 'alt',
    mean: 0.30,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Caloric surplus drives hepatic steatosis (NAFLD) → ALT elevation independent of alcohol (Younossi 2018).',
  },

  // ─── Uric acid — purine metabolism + renal handling ──
  {
    action: 'alcohol_units',
    outcome: 'uric_acid',
    mean: 0.45,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Beer + spirits raise serum urate via purine load + lactate-driven renal urate retention; dose-response (Choi 2004, NHANES-III).',
  },
  {
    action: 'dietary_protein',
    outcome: 'uric_acid',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Animal protein contributes purines (especially organ meats, seafood); modest effect at typical intakes (Choi 2004).',
  },
  {
    action: 'caffeine_mg',
    outcome: 'uric_acid',
    mean: -0.15,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Long-term coffee intake associates with lower serum urate via xanthine-oxidase inhibition by chlorogenic acids (Towiwat 2015 meta).',
  },

  // ─── Homocysteine — B-vitamin status proxy ──
  {
    action: 'dietary_protein',
    outcome: 'homocysteine',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Adequate animal protein is a proxy for B12/B6/folate cofactor status that drives homocysteine remethylation (Selhub 1995).',
  },
  {
    action: 'alcohol_units',
    outcome: 'homocysteine',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 42,
    rationale:
      'Chronic alcohol impairs folate absorption + methionine synthase activity → homocysteine accumulation (Halsted 2002).',
  },

  // ─── Hemoglobin — training adaptation + iron status ──
  {
    action: 'zone2_minutes',
    outcome: 'hemoglobin',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Aerobic training expands plasma volume initially (relative hemodilution) but stimulates erythropoiesis over weeks; net positive for total Hb mass (Schmidt 2008).',
  },
  {
    action: 'dietary_protein',
    outcome: 'hemoglobin',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Iron-rich animal protein (heme iron) is the strongest dietary determinant of hemoglobin; matters most when stores are marginal (Hurrell 2010).',
  },
  {
    action: 'zone4_5_minutes',
    outcome: 'hemoglobin',
    mean: -0.10,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'High-intensity training can transiently lower hemoglobin via hepcidin-mediated iron sequestration after sessions (Peeling 2008).',
  },

  // ─── Magnesium (RBC) — intake proxy ──
  {
    action: 'dietary_energy',
    outcome: 'magnesium_rbc',
    mean: 0.15,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Higher overall food intake correlates with magnesium sufficiency in mixed diets; intake-driven, slow turnover (Costello 2016).',
  },
  {
    action: 'alcohol_units',
    outcome: 'magnesium_rbc',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Alcohol increases urinary magnesium excretion; sustained intake depletes intracellular Mg stores (Vormann 2013).',
  },
]

// NLR (neutrophil-to-lymphocyte ratio) and RDW left intentionally
// unaddressed: NLR is acute-stress-driven (no clean lever-level driver
// in our manipulable set); RDW is dominated by erythropoiesis kinetics
// + B12/folate status that don't map to a single lever cleanly.

// ─── Phase 1b · sleep_quality as an independent driver ─────────────
//
// v1 folded quality into effective sleep_duration (`hours × quality / 100`).
// v2 splits them — sleep_quality becomes its own canonical action with
// its own downstream effects. The 2D Sleep widget in TwinV2 emits BOTH
// sleep_duration (raw hours) and sleep_quality (%) as engine inputs.
//
// Magnitudes are calibrated for the [60, 100] % range we expose in the
// widget: a 10-point quality drop ≈ 0.25 of the action span.

const SLEEP_QUALITY_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'sleep_quality',
    outcome: 'cortisol',
    mean: -0.45,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Fragmented / shallow sleep elevates morning cortisol via HPA axis disinhibition (Vgontzas 2007); restorative sleep normalises diurnal rhythm.',
  },
  {
    action: 'sleep_quality',
    outcome: 'hscrp',
    mean: -0.35,
    pathway: 'biomarker',
    horizonDays: 42,
    rationale:
      'Poor sleep quality drives systemic inflammation independently of duration (Irwin 2015 meta of 72 studies; effect persists controlling for total sleep time).',
  },
  {
    action: 'sleep_quality',
    outcome: 'insulin',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Slow-wave sleep suppression (lower quality) impairs insulin sensitivity within 3 nights (Tasali 2008 RCT).',
  },
  {
    action: 'sleep_quality',
    outcome: 'glucose',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Same insulin-sensitivity pathway pushes fasting glucose; effect smaller than duration but additive (Rao 2015).',
  },
  {
    action: 'sleep_quality',
    outcome: 'dhea_s',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Restorative sleep supports adrenal androgen output; chronic poor sleep compresses DHEA-S/cortisol ratio (van Cauter 1991).',
  },
  {
    action: 'sleep_quality',
    outcome: 'hrv_daily',
    mean: 0.40,
    pathway: 'wearable',
    horizonDays: 4,
    rationale:
      'Higher overnight quality (longer slow-wave + REM proportion) → higher next-day RMSSD (Stein 2012).',
  },
  {
    action: 'sleep_quality',
    outcome: 'testosterone',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Total sleep restriction drops T by ~15% per week; quality matters as much as duration (Leproult 2011 RCT).',
  },
]

// ─── Phase 1c · Resistance training ─────────────────────────────────
//
// `resistance_training_minutes` (per week) is the biggest longevity
// lever absent from the canonical action set. Edges below are sized
// for the widget's [0, 180] min/wk range — i.e. 0 to ~6 sessions/wk
// of moderate strength training.

const RESISTANCE_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'resistance_training_minutes',
    outcome: 'body_fat_pct',
    mean: -0.50,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Heavy resistance training increases lean mass + resting metabolic rate; effect compounds over months (Westcott 2012 review).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'glucose',
    mean: -0.35,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Skeletal-muscle hypertrophy expands glucose disposal; lowers fasting glucose (Cauza 2005 RCT in T2DM).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'insulin',
    mean: -0.40,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Resistance training improves insulin sensitivity within 8 weeks; comparable to aerobic effect (Ishii 1998 RCT).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'testosterone',
    mean: 0.30,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Compound multi-joint training raises basal T in untrained individuals; smaller effect in already-trained (Vingren 2010 review).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'vo2_peak',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Modest VO2 contribution via central + peripheral adaptations; smaller than Z2 / Z4-5 but real (Steele 2012 meta).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'hdl',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Resistance training raises HDL via lipoprotein lipase activation; effect smaller than aerobic (Mann 2014 meta).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'apob',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Improved lean mass + insulin sensitivity reduces ApoB-bearing lipoproteins; smaller than aerobic effect.',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'hemoglobin',
    mean: 0.15,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Resistance training stimulates erythropoiesis indirectly via testosterone + IGF-1 axis (Ferrando 2002).',
  },
  {
    action: 'resistance_training_minutes',
    outcome: 'hscrp',
    mean: -0.25,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Lowers chronic inflammation via reduced visceral adiposity; effect emerges over 12 weeks (Fedewa 2017 meta).',
  },
]

// ─── Phase 1d · Supplementation ─────────────────────────────────────
//
// Each supplement is modeled as a binary action (0 = not taken, 1 = taken
// at the typical efficacious dose noted in the rationale). Magnitudes
// scaled to the action's [0, 1] span — i.e. a `mean` of 0.40 means a
// supplemented vs. unsupplemented participant differs by 0.40 of the
// outcome's span at full horizon.
//
// Doses encoded in the rationale, not the spec — they're the targets a
// coach would prescribe, not free-floating sliders. Use the toggle widget
// in TwinV2 to flip them on/off.

const SUPPLEMENTATION_EDGES: SyntheticEdgeSpec[] = [
  // ─── Omega-3 (EPA/DHA, ~2g/d combined) ──
  {
    action: 'supp_omega3',
    outcome: 'triglycerides',
    mean: -0.45,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'EPA/DHA at 2-4g/d lowers triglycerides 15-30% via reduced hepatic VLDL synthesis (Skulas-Ray 2019 AHA scientific statement).',
  },
  {
    action: 'supp_omega3',
    outcome: 'hscrp',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Omega-3s reduce systemic inflammation via SPM-mediated resolution; 0.5-1.0 mg/L hsCRP drop typical (Li 2014 meta of 68 RCTs).',
  },
  {
    action: 'supp_omega3',
    outcome: 'hdl',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Modest HDL rise (3-5 mg/dL) at 2-4 g/d EPA/DHA; effect smaller than triglyceride drop (Bernstein 2012 meta).',
  },

  // ─── Magnesium (400-500 mg glycinate or citrate) ──
  {
    action: 'supp_magnesium',
    outcome: 'magnesium_rbc',
    mean: 0.55,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Daily oral Mg supplementation reliably raises RBC Mg in repleted-status individuals over 8 weeks (Schuette 1994).',
  },
  {
    action: 'supp_magnesium',
    outcome: 'glucose',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Mg supplementation improves fasting glucose modestly in deficient/insulin-resistant cohorts (Veronese 2016 meta).',
  },
  {
    action: 'supp_magnesium',
    outcome: 'insulin',
    mean: -0.25,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Mg cofactors for tyrosine-kinase activity in the insulin receptor; supplementation lowers fasting insulin (Simental-Mendía 2016 meta).',
  },
  {
    action: 'supp_magnesium',
    outcome: 'sleep_quality',
    mean: 0.20,
    pathway: 'wearable',
    horizonDays: 21,
    rationale:
      'Mg glycinate improves PSQI scores in adults with poor sleep within 3 weeks (Abbasi 2012 RCT).',
  },

  // ─── Vitamin D (2000 IU/d cholecalciferol) ──
  {
    action: 'supp_vitamin_d',
    outcome: 'testosterone',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Vitamin D supplementation raises total T in deficient men (~25% bump if baseline 25-OH-D < 30 ng/mL); flat effect if replete (Pilz 2011 RCT).',
  },
  {
    action: 'supp_vitamin_d',
    outcome: 'hscrp',
    mean: -0.15,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Modest hsCRP reduction in deficient cohorts; effect smaller in replete individuals (Chen 2014 meta).',
  },

  // ─── B-complex (B12 + B6 + folate at RDA × 2-3) ──
  {
    action: 'supp_b_complex',
    outcome: 'homocysteine',
    mean: -0.55,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'B12 + folate + B6 cofactors for homocysteine remethylation + transsulfuration; reliably lowers Hcy 25-30% (Homocysteine Lowering Trialists 2005 meta of 25 RCTs).',
  },

  // ─── Creatine (3-5 g/d monohydrate) ──
  {
    action: 'supp_creatine',
    outcome: 'testosterone',
    mean: 0.10,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Small T elevation when paired with resistance training; effect inconsistent in untrained controls (Cook 2011 RCT).',
  },
  {
    action: 'supp_creatine',
    outcome: 'vo2_peak',
    mean: 0.12,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Improves work capacity + lactate threshold via PCr-mediated ATP buffering; modest VO₂ kinetics improvement (Cooke 2008 review).',
  },
]

/** All v2 synthetic edges. */
export const PHASE_2_EDGES: SyntheticEdgeSpec[] = [
  ...QUIET_OUTCOME_EDGES,
  ...SLEEP_QUALITY_EDGES,
  ...RESISTANCE_EDGES,
  ...SUPPLEMENTATION_EDGES,
]

/** Action ranges for v2-only canonical actions. Existing actions inherit
 *  ranges from `ACTION_SPAN` in `syntheticEdges.ts`.
 *
 *  Supplements are binary [0, 1] — the action is "are you taking it?". The
 *  efficacious dose is encoded in the edge `mean` magnitude, not the span. */
export const V2_ACTION_SPAN: Record<string, [number, number]> = {
  sleep_quality: [60, 100],
  resistance_training_minutes: [0, 180],
  supp_omega3: [0, 1],
  supp_magnesium: [0, 1],
  supp_vitamin_d: [0, 1],
  supp_b_complex: [0, 1],
  supp_creatine: [0, 1],
}

/** Outcome ranges for v2 outcomes the v1 OUTCOME_SPAN doesn't cover. */
export const V2_OUTCOME_SPAN: Record<string, [number, number]> = {
  uric_acid: [3, 10],
  homocysteine: [4, 20],
  magnesium_rbc: [3, 7],
}
