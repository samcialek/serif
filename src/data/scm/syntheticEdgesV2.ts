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

import type { InsightBayesian } from '@/data/portal/types'
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
// Bedroom-temperature edges sit before the resistance-training block.
// for the widget's [0, 180] min/wk range — i.e. 0 to ~6 sessions/wk

// Phase 1b.1 - bedroom temperature as a sleep-environment lever.
//
// This is intentionally a synthetic-prior example: if a participant has
// Ecobee/Nest/Eight Sleep/Oura ambient data, the same action key can be
// replaced by person-specific fitted edges. Until then it gives the Twin a
// biologically plausible prior with an optimal window around 21-22 C and a
// steeper heat penalty than cold penalty.

// Bedroom temperature: thermoneutral-window response with a flat
// plateau between 19.5 and 23.5 C and asymmetric quadratic roll-off
// outside it. Amplitudes are clinically defensible outcome-unit
// magnitudes — what one input plausibly accounts for in a multi-driver
// model. Earlier values inherited from the inverted_u math
// (slopeUp × peak ≈ 36 pp sleep_eff) were a visualizer convention,
// not a calibration in real outcome units.
//
// Recalibrated targets (peak-vs-extreme contributions of bedroom temp,
// holding everything else fixed):
//   sleep_efficiency  ±6 pp   (room temp is one of many drivers)
//   deep_sleep        ±18 min (typical literature: 10-25 min swing)
//   rem_sleep         ±10 min (REM less sensitive than SWS)
//   hrv_daily         ±4 ms   (one factor among many for HRV)
const BEDROOM_TEMPERATURE_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'bedroom_temp_c',
    outcome: 'sleep_efficiency',
    mean: 0.30,
    shape: {
      kind: 'thermoneutral_window',
      peakLow: 19.5, peakHigh: 23.5,
      amplitude: 6,
      halfBelow: 5.0, halfAbove: 3.5,
    },
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Bedroom temperature has a thermoneutral sleep window of roughly 19.5-23.5 C — inside it, sleep efficiency is essentially flat. Cooler rooms below the window modestly fragment sleep; warmer rooms impair nocturnal heat dissipation more steeply.',
  },
  {
    action: 'bedroom_temp_c',
    outcome: 'deep_sleep',
    mean: 0.28,
    shape: {
      kind: 'thermoneutral_window',
      peakLow: 19.5, peakHigh: 23.5,
      amplitude: 18,
      halfBelow: 5.0, halfAbove: 3.0,
    },
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Slow-wave sleep depends on the normal nocturnal core-temperature drop. The thermoneutral plateau covers the range over which the cooling phase proceeds normally; outside it the curve falls — heat side faster because it directly opposes cooling.',
  },
  {
    action: 'bedroom_temp_c',
    outcome: 'rem_sleep',
    mean: 0.22,
    shape: {
      kind: 'thermoneutral_window',
      peakLow: 19.5, peakHigh: 23.5,
      amplitude: 10,
      halfBelow: 5.0, halfAbove: 3.5,
    },
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'REM is sensitive to thermal stress because thermoregulation is blunted during REM. Inside the thermoneutral window the effect is flat; the curve falls faster on the warm side.',
  },
  {
    action: 'bedroom_temp_c',
    outcome: 'hrv_daily',
    mean: 0.20,
    shape: {
      kind: 'thermoneutral_window',
      peakLow: 19.5, peakHigh: 23.5,
      amplitude: 4,
      halfBelow: 5.5, halfAbove: 4.0,
    },
    pathway: 'wearable',
    horizonDays: 4,
    rationale:
      'Thermal sleep stress raises autonomic load overnight. The 19.5-23.5 C plateau models a wide recovery-optimal range; warm nights suppress next-day RMSSD more than mildly cool nights.',
  },
]

// Resistance training edges are sized for the widget's [0, 180] min/wk range.
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

// ─── Phase 1e · NEAT / daily walking (Zone 1) ───────────────────────
//
// Steps / NEAT (non-exercise activity thermogenesis) is the biggest
// missing longevity lever in the v1 set — it has no fitted edges in
// the cohort export despite being one of the strongest dose-response
// mortality predictors in the literature (Lee 2019 JAMA Internal
// Medicine, Paluch 2022 Lancet — risk falls through ~10k steps/d).
//
// Magnitudes calibrated for the lever's [0, 15000] step/d range.
// Smaller than Zone-2 / Zone-4-5 effects because walking is lower
// intensity — but real, and crucially the only effect available at
// Z1 levels of exertion.

// Quotidian sleep aids (binary evening protocol toggles). These are deliberately
// weak, wide priors: they are fast enough to simulate in the Quotidian Twin, but
// the true effect is highly timing-, phenotype-, and deficiency-dependent. The
// physical-unit `shape` drives Twin counterfactuals; normalized `mean` is only a
// visual prior. `nominalEffect` keeps Insights in outcome units.
const QUOTIDIAN_SUPPLEMENTATION_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'supp_melatonin',
    outcome: 'sleep_onset_latency',
    mean: -0.055,
    nominalEffect: -5.0,
    priorSd: 4.0,
    shape: { kind: 'linear', slope: -5.0 },
    pathway: 'wearable',
    horizonDays: 2,
    rationale:
      'Low-dose melatonin taken before bed has a modest average sleep-latency effect; centered near -5 min with wide uncertainty because timing, circadian delay, and light exposure dominate response.',
  },
  {
    action: 'supp_melatonin',
    outcome: 'sleep_efficiency',
    mean: 0.012,
    nominalEffect: 0.6,
    priorSd: 1.2,
    shape: { kind: 'linear', slope: 0.6 },
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Any efficiency gain should be small: melatonin mainly shifts sleep onset, with objective sleep-time/continuity effects often modest or absent.',
  },
  {
    action: 'supp_melatonin',
    outcome: 'hrv_daily',
    mean: 0.004,
    nominalEffect: 0.5,
    priorSd: 2.0,
    shape: { kind: 'linear', slope: 0.5 },
    pathway: 'wearable',
    horizonDays: 4,
    rationale:
      'HRV is modeled only as a tiny indirect downstream recovery prior, not a direct melatonin effect; personal wearable response should dominate quickly.',
  },
  {
    action: 'supp_l_theanine',
    outcome: 'sleep_onset_latency',
    mean: -0.017,
    nominalEffect: -1.5,
    priorSd: 3.0,
    shape: { kind: 'linear', slope: -1.5 },
    pathway: 'wearable',
    horizonDays: 2,
    rationale:
      'L-theanine has mixed human sleep evidence; centered as a very small latency benefit, most plausible in high-rumination or high-evening-arousal phenotypes.',
  },
  {
    action: 'supp_l_theanine',
    outcome: 'sleep_efficiency',
    mean: 0.004,
    nominalEffect: 0.2,
    priorSd: 1.0,
    shape: { kind: 'linear', slope: 0.2 },
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Sleep-efficiency evidence is weak and not consistently objective, so the prior is close to zero until personal nights accumulate.',
  },
  {
    action: 'supp_l_theanine',
    outcome: 'hrv_daily',
    mean: 0.002,
    nominalEffect: 0.3,
    priorSd: 2.0,
    shape: { kind: 'linear', slope: 0.3 },
    pathway: 'wearable',
    horizonDays: 4,
    rationale:
      'Modeled as a tiny indirect autonomic prior rather than a confident HRV intervention; uncertainty is intentionally wider than the mean.',
  },
  {
    action: 'supp_zinc',
    outcome: 'sleep_efficiency',
    mean: 0.005,
    nominalEffect: 0.25,
    priorSd: 1.2,
    shape: { kind: 'linear', slope: 0.25 },
    pathway: 'wearable',
    horizonDays: 28,
    rationale:
      'Zinc is a slow, likely deficiency-dependent sleep-quality prior, not an acute sleep aid; effect is near zero unless low-zinc/inflammatory context supports it.',
  },
  {
    action: 'supp_zinc',
    outcome: 'deep_sleep',
    mean: 0.006,
    nominalEffect: 1.0,
    priorSd: 5.0,
    shape: { kind: 'linear', slope: 1.0 },
    pathway: 'wearable',
    horizonDays: 28,
    rationale:
      'Any slow-wave sleep effect should be small, slow, and mostly repletion-mediated; the prior is intentionally broad and close to null.',
  },
  {
    action: 'supp_zinc',
    outcome: 'hrv_daily',
    mean: 0.001,
    nominalEffect: 0.2,
    priorSd: 2.0,
    shape: { kind: 'linear', slope: 0.2 },
    pathway: 'wearable',
    horizonDays: 28,
    rationale:
      'Only a trace indirect HRV prior is retained for possible recovery-load resolution in deficient users; otherwise this should wash out with personal data.',
  },
]

const NEAT_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'steps',
    outcome: 'triglycerides',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 56,
    rationale:
      'Daily walking activates skeletal-muscle LPL (Bey 2003); even non-exercise step volume lowers fasting TG over weeks (Murphy 2007 RCT).',
  },
  {
    action: 'steps',
    outcome: 'glucose',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 42,
    rationale:
      'Walking — especially post-meal — improves insulin sensitivity and lowers fasting glucose (Reynolds 2016 meta of 28 RCTs).',
  },
  {
    action: 'steps',
    outcome: 'insulin',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 42,
    rationale:
      'NEAT-level activity reduces fasting insulin via GLUT4-mediated muscle glucose uptake; effect emerges within 4-6 weeks (Healy 2008).',
  },
  {
    action: 'steps',
    outcome: 'hdl',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Sustained walking raises HDL via increased apoA-I synthesis; dose-response with daily volume (Kelley 2004 meta).',
  },
  {
    action: 'steps',
    outcome: 'apob',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Daily activity lowers ApoB-bearing VLDL output via reduced hepatic lipogenesis; smaller than Z2 effect but additive (Kraus 2002).',
  },
  {
    action: 'steps',
    outcome: 'body_fat_pct',
    mean: -0.35,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'NEAT contributes 15-50% of daily energy expenditure; chronic step elevation drives slow body-fat reduction (Levine 2007).',
  },
  {
    action: 'steps',
    outcome: 'hscrp',
    mean: -0.25,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'Daily walking lowers chronic inflammation via reduced visceral adiposity + improved endothelial function (Beavers 2010 meta).',
  },
  {
    action: 'steps',
    outcome: 'vo2_peak',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 84,
    rationale:
      'NEAT builds aerobic base in untrained individuals; smaller minute-for-minute than Z2 but cumulative volume matters (Tjønna 2008).',
  },
  {
    action: 'steps',
    outcome: 'cortisol',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Light daily activity normalizes HPA-axis diurnal rhythm and lowers morning cortisol (Hamer 2012).',
  },
  {
    action: 'steps',
    outcome: 'hrv_daily',
    mean: 0.15,
    pathway: 'wearable',
    horizonDays: 14,
    rationale:
      'NEAT improves parasympathetic tone via repeated low-intensity stimulation of vagal cardiac control (Soares-Miranda 2014).',
  },
]

/** All v2 synthetic edges. */
export const PHASE_2_EDGES: SyntheticEdgeSpec[] = [
  ...QUIET_OUTCOME_EDGES,
  ...SLEEP_QUALITY_EDGES,
  ...BEDROOM_TEMPERATURE_EDGES,
  ...RESISTANCE_EDGES,
  ...SUPPLEMENTATION_EDGES,
  ...QUOTIDIAN_SUPPLEMENTATION_EDGES,
  ...NEAT_EDGES,
]

/** Action ranges for v2-only canonical actions. Existing actions inherit
 *  ranges from `ACTION_SPAN` in `syntheticEdges.ts`.
 *
 *  Supplements are binary [0, 1] — the action is "are you taking it?". The
 *  expected physical effect is encoded on each edge's `shape`/`nominalEffect`,
 *  not through the action span. */
export const V2_ACTION_SPAN: Record<string, [number, number]> = {
  sleep_quality: [60, 100],
  bedroom_temp_c: [16, 27],
  resistance_training_minutes: [0, 180],
  supp_omega3: [0, 1],
  supp_magnesium: [0, 1],
  supp_vitamin_d: [0, 1],
  supp_b_complex: [0, 1],
  supp_creatine: [0, 1],
  supp_melatonin: [0, 1],
  supp_l_theanine: [0, 1],
  supp_zinc: [0, 1],
}

/** Outcome ranges for v2 outcomes the v1 OUTCOME_SPAN doesn't cover. */
export const V2_OUTCOME_SPAN: Record<string, [number, number]> = {
  uric_acid: [3, 10],
  homocysteine: [4, 20],
  magnesium_rbc: [3, 7],
}

function horizonDisplay(days: number): string {
  if (days <= 21) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  return `${Math.round(days / 30)} months`
}

/** Expand Phase-2 synthetic priors into Insight rows so they are visible as
 *  population/literature edges until enough personal data exists to replace
 *  them with fitted participant-specific edges. */
export function buildPhase2SyntheticEdges(): InsightBayesian[] {
  return PHASE_2_EDGES.map((spec) => {
    const effect = spec.nominalEffect ?? spec.mean
    const sd = spec.priorSd ?? 0.5
    return {
      action: spec.action,
      outcome: spec.outcome,
      pathway: spec.pathway,
      evidence_tier: 'cohort_level' as const,
      literature_backed: true,
      prior_provenance: 'synthetic+literature' as const,
      horizon_days: spec.horizonDays,
      horizon_display: horizonDisplay(spec.horizonDays),
      supporting_data_description: spec.rationale,
      nominal_step: 1,
      dose_multiplier: 1,
      dose_multiplier_raw: 1,
      direction_conflict: false,
      dose_bounded: false,
      unbounded_dose_multiplier: 1,
      unbounded_scaled_effect: effect,
      scaled_effect: effect,
      posterior: {
        mean: effect,
        variance: sd * sd,
        sd,
        contraction: 0.5,
        prior_mean: effect,
        prior_variance: sd * sd,
        source: 'literature' as const,
        lam_js: 0.5,
        n_cohort: 0,
        z_like: 0,
      },
      cohort_prior: null,
      user_obs: null,
      gate: { score: 0.5, tier: 'possible' as const },
    }
  })
}
