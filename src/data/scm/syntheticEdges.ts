/**
 * Phase 1 synthetic edges — textbook causal arrows that fill gaps in
 * the cohort fit, either because the lever lacks sustained variation in
 * the real data or the target biomarker isn't sampled densely enough.
 *
 * These are first-class members of the SCM. Insights, Protocols, and
 * the Twin view treat them as peers of cohort-fit edges; the only
 * marker is `prior_provenance: 'synthetic+literature'` and the
 * `posterior.source: 'literature'` flag, which are provenance metadata,
 * not a tier of trust.
 *
 * The same spec drives:
 *   - InsightBayesian rows (via buildPhase1SyntheticEdges) — the
 *     normalized [-1, 1] `mean` carries direction + strength for the
 *     Twin view and Insights tooltip.
 *   - StructuralEquation entries (via buildSyntheticEquations) — `mean`
 *     converts to a physical-unit slope using action and outcome spans
 *     so the Twin engine produces real counterfactual deltas.
 *
 * DEMO ONLY. Do not use for prescribing.
 */

import type { InsightBayesian } from '@/data/portal/types'
import type { StructuralEquation, CurveType } from './types'
import type { StructuralEdge } from '../dataValue/types'

/**
 * Causal shape with physical units. The spec carries the actual literature
 * effect (e.g., "−2.5 min SOL per hour of caffeine cutoff, plateauing past
 * 6h") instead of a normalized [-1, 1] strength. The engine consumes these
 * directly via bb/ba/theta in the piecewise-linear equation; visual edge
 * weight in the Twin view is derived from the shape via `shapeToVisualMean`.
 *
 *   linear            — constant slope across the action's plausible range
 *   saturating        — steep slope until `knee`, then `slopeAfter` (default 0)
 *                       Two straight segments with a kink at the knee. Use
 *                       when the literature reports an actual breakpoint.
 *   smooth_saturating — Hill-style exponential approach to `asymptote` with
 *                       half-saturation at `halfDose` (EC50). Continuous
 *                       gradient — no kink, gentle diminishing returns.
 *                       Use when biology has a hard ceiling (receptor
 *                       saturation, finite arousal windows, depleted
 *                       suppressible pool) rather than a literature-reported
 *                       threshold.
 *   inverted_u        — peaks at `peak`. `slopeUp` (signed positive when
 *                       outcome rises up to peak) and `slopeDown` (signed
 *                       negative for outcome falling past peak) drive the
 *                       bb/ba split.
 */
export type SyntheticShape =
  | { kind: 'linear'; slope: number }
  | {
      kind: 'saturating'
      knee: number
      slope: number
      slopeAfter?: number
    }
  | {
      kind: 'smooth_saturating'
      /** Maximum signed effect as dose → ∞. */
      asymptote: number
      /** Dose at which f reaches half of asymptote (EC50). */
      halfDose: number
    }
  | {
      kind: 'inverted_u'
      peak: number
      slopeUp: number
      slopeDown: number
    }

interface SyntheticEdgeSpec {
  action: string
  outcome: string
  /** Causal shape with physical units. When present, this drives the engine
   *  equation directly — supersedes the legacy `mean × span` translation. */
  shape?: SyntheticShape
  /** Normalized [-1, 1] signed effect used for posterior.mean. Sign is
   *  what matters for Twin edge coloring; magnitude sets edge weight via
   *  the in-graph normalization. Edges with a `shape` derive visual weight
   *  from the shape; this field stays for legacy edges and as a tooltip
   *  fallback when shape is not yet calibrated. */
  mean: number
  pathway: 'wearable' | 'biomarker'
  horizonDays: number
  /** Short rationale — surfaced in InsightRow tooltips as the
   *  supporting_data_description. */
  rationale: string
}

/**
 * Population-median baselines for outcomes that participants typically don't
 * have a direct measurement of (sleep architecture, latency, daily HRV, etc.).
 * These anchor the abduction step: without them, SCM abduction sets a latent
 * outcome's factual value to `sum(parent contributions)`, which the linear
 * additive engine can drive negative for SOL or above 100% for SE.
 *
 * Anchored to typical adult resting-state references (sleep medicine textbooks,
 * Hirshkowitz 2015 NSF recommendations, Carskadon & Dement 2005 architecture
 * percentages, Shaffer 2017 HRV norms). These are *defaults*, not predictions —
 * any per-participant `outcome_baselines[outcome]` overrides them.
 */
export const POPULATION_BASELINES: Record<string, number> = {
  // Wearable / sleep architecture (minutes unless noted)
  sleep_onset_latency: 15,
  deep_sleep: 90,
  rem_sleep: 100,
  sleep_efficiency: 88,
  hrv_daily: 50,

  // Hormonal / inflammatory state
  cortisol: 14,
  hscrp: 1.0,
}

/**
 * Physically meaningful bounds for outcome values. The engine is linear-
 * additive per-edge and can occasionally drive a counterfactual past a
 * physical limit (negative SOL, sleep efficiency > 100, ferritin < 0).
 * These bounds clamp display values so the user never sees an impossible
 * number; the engine's raw delta is preserved upstream so we don't hide
 * calibration issues silently — only the rendered before/after pair gets
 * snapped to the physical envelope.
 */
export const OUTCOME_BOUNDS: Record<string, { min?: number; max?: number }> = {
  // Sleep — minutes/percent must stay non-negative; SE caps at 100
  sleep_onset_latency: { min: 0 },
  deep_sleep: { min: 0 },
  rem_sleep: { min: 0 },
  sleep_efficiency: { min: 0, max: 100 },

  // Wearable
  hrv_daily: { min: 0 },

  // Biomarkers — concentrations are non-negative
  cortisol: { min: 0 },
  hscrp: { min: 0 },
  triglycerides: { min: 0 },
  hdl: { min: 0 },
  ldl: { min: 0 },
  apob: { min: 0 },
  glucose: { min: 0 },
  ferritin: { min: 0 },
  hemoglobin: { min: 0 },
  iron_total: { min: 0 },
  vo2_peak: { min: 0 },
  alt: { min: 0 },
}

/** Clamp a value to its outcome's physical bounds, if any. */
export function applyOutcomeBound(outcome: string, value: number): number {
  const bound = OUTCOME_BOUNDS[outcome]
  if (!bound) return value
  let v = value
  if (bound.min != null && v < bound.min) v = bound.min
  if (bound.max != null && v > bound.max) v = bound.max
  return v
}

const PHASE_1_EDGES: SyntheticEdgeSpec[] = [
  // ── Training → VO2max (canonical aerobic adaptation) ───────────────
  { action: 'zone2_minutes',   outcome: 'vo2_peak',      mean:  0.80, pathway: 'biomarker', horizonDays: 84, rationale: 'Zone-2 mitochondrial adaptation → VO2max (Seiler 2010)' },
  { action: 'zone4_5_minutes', outcome: 'vo2_peak',      mean:  0.85, pathway: 'biomarker', horizonDays: 56, rationale: 'Minute-for-minute the strongest VO2max stimulus — 4×4-min Z4 intervals (Helgerud 2007 RCT) saturate central adaptations faster than Z2 volume.' },
  { action: 'training_volume', outcome: 'vo2_peak',      mean:  0.60, pathway: 'biomarker', horizonDays: 84, rationale: 'Total training volume → VO2max (Milanović 2015 meta-analysis)' },

  // ── Training → lipids (LPL clearance, body-composition pathway) ────
  { action: 'zone2_minutes',   outcome: 'triglycerides', mean: -0.50, pathway: 'biomarker', horizonDays: 60, rationale: 'Aerobic training activates LPL → TG clearance' },
  { action: 'zone2_minutes',   outcome: 'hdl',           mean:  0.40, pathway: 'biomarker', horizonDays: 90, rationale: 'Z2 raises HDL via apoA-I (Kodama 2007)' },
  { action: 'zone2_minutes',   outcome: 'apob',          mean: -0.30, pathway: 'biomarker', horizonDays: 90, rationale: 'Aerobic volume lowers apoB via LPL + body comp pathway.' },
  { action: 'zone4_5_minutes', outcome: 'apob',          mean: -0.25, pathway: 'biomarker', horizonDays: 60, rationale: 'HIIT lowers apoB via LDL receptor upregulation; smaller absolute effect than Z2 volume but compounds faster.' },

  // ── Training → inflammation + glycemic control ────────────────────
  { action: 'zone4_5_minutes', outcome: 'hscrp',         mean: -0.40, pathway: 'biomarker', horizonDays: 56, rationale: 'HIIT lowers chronic inflammation more efficiently per minute than Z2 — IL-6 myokine pulse → IL-10 anti-inflammatory cascade (Petersen 2005).' },
  { action: 'zone4_5_minutes', outcome: 'glucose',       mean: -0.35, pathway: 'biomarker', horizonDays: 28, rationale: 'Single HIIT bout boosts insulin sensitivity for 24-48h via GLUT4 translocation; sustained protocols lower fasting glucose (Little 2011 RCT).' },

  // ── Diet (protein) → iron status (heme pathway) ────────────────────
  { action: 'dietary_protein', outcome: 'ferritin',      mean:  0.50, pathway: 'biomarker', horizonDays: 90, rationale: 'Heme iron from animal protein → ferritin stores' },
  { action: 'dietary_protein', outcome: 'hemoglobin',    mean:  0.35, pathway: 'biomarker', horizonDays: 60, rationale: 'Protein supports erythropoiesis (iron + amino acids)' },
  { action: 'dietary_protein', outcome: 'iron_total',    mean:  0.40, pathway: 'biomarker', horizonDays: 60, rationale: 'Dietary heme iron → serum iron' },

  // ── Diet (protein) → lipids (sat-fat co-delivery) ──────────────────
  { action: 'dietary_protein', outcome: 'ldl',           mean:  0.35, pathway: 'biomarker', horizonDays: 60, rationale: 'Animal protein co-delivered with sat fat → LDL' },
  { action: 'dietary_protein', outcome: 'apob',          mean:  0.30, pathway: 'biomarker', horizonDays: 60, rationale: 'Animal protein → apoB (sat fat pathway)' },
  { action: 'dietary_protein', outcome: 'hdl',           mean:  0.20, pathway: 'biomarker', horizonDays: 90, rationale: 'Mixed-diet-quality effect on HDL (slight positive)' },

  // ── Diet (energy) → metabolic + lipids (caloric surplus) ───────────
  { action: 'dietary_energy',  outcome: 'glucose',       mean:  0.40, pathway: 'biomarker', horizonDays: 30, rationale: 'Caloric surplus → fasting glucose rise' },
  { action: 'dietary_energy',  outcome: 'triglycerides', mean:  0.55, pathway: 'biomarker', horizonDays: 30, rationale: 'Surplus → hepatic VLDL → TG' },
  { action: 'dietary_energy',  outcome: 'hdl',           mean: -0.30, pathway: 'biomarker', horizonDays: 60, rationale: 'Caloric surplus inversely associates with HDL' },
  { action: 'dietary_energy',  outcome: 'apob',          mean:  0.45, pathway: 'biomarker', horizonDays: 60, rationale: 'Surplus → hepatic apoB overproduction' },
  { action: 'dietary_energy',  outcome: 'ldl',           mean:  0.40, pathway: 'biomarker', horizonDays: 60, rationale: 'Surplus + composition → LDL' },

  // ── Sleep → lipids (circadian metabolic axis) ──────────────────────
  { action: 'sleep_duration',  outcome: 'triglycerides', mean: -0.30, pathway: 'biomarker', horizonDays: 60, rationale: 'Short sleep → insulin resistance → TG (Spiegel 2004)' },
  { action: 'sleep_duration',  outcome: 'hdl',           mean:  0.25, pathway: 'biomarker', horizonDays: 90, rationale: 'Adequate sleep associates with higher HDL' },
  { action: 'sleep_duration',  outcome: 'apob',          mean: -0.25, pathway: 'biomarker', horizonDays: 60, rationale: 'Sleep restriction → VLDL/apoB overproduction' },

  // ── Load → sleep architecture (overreaching pathway) ───────────────
  { action: 'acwr',            outcome: 'sleep_efficiency', mean: -0.40, pathway: 'wearable',  horizonDays: 7,  rationale: 'ACWR > 1.4 → sleep fragmentation (overreaching)' },
  { action: 'acwr',            outcome: 'deep_sleep',       mean: -0.35, pathway: 'wearable',  horizonDays: 7,  rationale: 'Acute overload suppresses slow-wave sleep' },
  { action: 'training_load',   outcome: 'sleep_efficiency', mean: -0.25, pathway: 'wearable',  horizonDays: 7,  rationale: 'High cumulative load disrupts sleep continuity' },
  { action: 'training_load',   outcome: 'deep_sleep',       mean: -0.20, pathway: 'wearable',  horizonDays: 7,  rationale: 'Chronic load → deep-sleep fragmentation' },

  // ─── Phase 2: quotidian dose-response, confounder-adjusted ────────
  // These edges target the wearable-day band (deep_sleep, rem_sleep,
  // sleep_efficiency, sleep_onset_latency, hrv_daily) which the CASPian
  // cohort under-samples. Each rationale calls out the confounders the
  // synthetic effect is *net of* — the magnitude is the within-person
  // causal effect that survives adjustment, not the naive correlation.

  // ── Caffeine dose: adenosine blockade saturates around habitual intake
  //    (~200 mg). Plasma half-life is ~5h, so timing-of-cutoff often
  //    dominates dose at the same intake. smooth_saturating with the
  //    EC50 (halfDose) tuned to the receptor-occupancy ramp from
  //    Landolt 1995 + Drake 2013 — continuous gradient, no kink at the
  //    habitual threshold (the biology has no actual breakpoint, just
  //    a smooth approach to receptor saturation).
  { action: 'caffeine_mg',     outcome: 'deep_sleep',          mean: -0.35,
    shape: { kind: 'smooth_saturating', asymptote: -35, halfDose: 140 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'SWS suppression approaches a ~35 min ceiling as adenosine A1/A2A occupancy saturates (EC50 ≈ 140 mg). 100mg → −14 min, 200mg → −22 min, 400mg → −29 min, 600mg → −33 min — diminishing returns past habitual intake (Landolt 1995, Drake 2013).' },
  { action: 'caffeine_mg',     outcome: 'sleep_efficiency',    mean: -0.30,
    shape: { kind: 'smooth_saturating', asymptote: -13, halfDose: 140 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'SE asymptotes ~−13 pp at high chronic intake; smooth approach with EC50 ≈ 140mg means most damage comes between 50–250mg. Late-night fragmentation accounts for most of the effect (Drake 2013).' },
  { action: 'caffeine_mg',     outcome: 'hrv_daily',           mean: -0.30,
    shape: { kind: 'smooth_saturating', asymptote: -35, halfDose: 140 },
    pathway: 'wearable', horizonDays: 4,
    rationale: 'RMSSD floor ~−35 ms as β-adrenergic stimulation saturates. Steepest drop through habitual range, then asymptotic — vagal tone has a finite suppressible reserve (Bowtell 2017, Hibino 1997).' },
  { action: 'caffeine_mg',     outcome: 'rem_sleep',           mean: -0.20,
    shape: { kind: 'smooth_saturating', asymptote: -20, halfDose: 220 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'REM more resistant than SWS — EC50 ≈ 220mg (much higher than SWS) reflects that only late-night plasma carryover trims the final REM cycles. 300mg → −12 min, 600mg → −17 min (Landolt 1995).' },
  { action: 'caffeine_mg',     outcome: 'sleep_onset_latency', mean:  0.40,
    shape: { kind: 'smooth_saturating', asymptote: 28, halfDose: 140 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'SOL approaches ~+28 min ceiling as receptor occupancy saturates (EC50 ≈ 140mg). 100mg → +11 min, 200mg → +18 min, 600mg → +27 min — exponential approach matches the dose-response shape in Drake 2013.' },

  // Caffeine timing — bigger than dose for the same intake because half-life
  // makes plasma at bedtime the dominant signal. smooth_saturating with
  // EC50 ≈ 2.8h reflects the 5h plasma half-life: each additional hour of
  // cutoff cuts bedtime plasma by ~13%, so benefit gradient is steepest in
  // the first few hours and flattens past 6–8h.
  { action: 'caffeine_timing', outcome: 'deep_sleep',          mean:  0.55,
    shape: { kind: 'smooth_saturating', asymptote: 38, halfDose: 2.8 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'SWS recovery asymptotes at ~+38 min as bedtime plasma → 0. EC50 ≈ 2.8h ≈ caffeine plasma half-life (5h × ln2/2h). 4h cutoff → +24 min, 6h → +29 min, 12h → +36 min (Drake 2013 crossover).' },
  { action: 'caffeine_timing', outcome: 'sleep_efficiency',    mean:  0.50,
    shape: { kind: 'smooth_saturating', asymptote: 11, halfDose: 2.8 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'SE recovery asymptotes ~+11 pp via shorter onset and fewer late-night arousals. Smooth exponential approach matches the plasma-clearance kinetics — biggest gains in first 6h of cutoff.' },
  { action: 'caffeine_timing', outcome: 'sleep_onset_latency', mean: -0.55,
    shape: { kind: 'smooth_saturating', asymptote: -18, halfDose: 2.8 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'SOL recovery asymptotes ~−18 min as bedtime plasma → 0. 4h cutoff → −11 min, 6h → −14 min, 12h → −17 min — Drake 2013 crossover (12–18 min reduction at full clearance).' },

  // ── Alcohol: dose acts on architecture in the second half of the night
  //    (REM/SWS rebound suppression). Timing matters because ethanol clears
  //    at ~0.015 BAC/hr; pre-bed gap restores architecture even at 2 units.
  //    The second-half-of-night arousal pattern is the canonical fingerprint.
  // All alcohol_units → sleep responses use smooth_saturating, not linear:
  // the biology has hard ceilings (only so much SWS/REM to suppress),
  // receptor saturation (sedation, vagal blunting), and finite arousal
  // windows. Hill-style continuous saturation matches both ends of the
  // dose curve without the kink artefact of a knee — at low doses you
  // already see the steepest gradient, with diminishing returns as the
  // suppressible architecture pool depletes. Asymptotes derived from
  // Ebrahim 2013 dose-stratified subgroups + Roehrs & Roth 2001 sedation
  // ceiling estimates; halfDose ≈ the dose at which 50% of the maximum
  // disruption is reached.
  { action: 'alcohol_units',   outcome: 'deep_sleep',          mean: -0.40,
    shape: { kind: 'smooth_saturating', asymptote: -50, halfDose: 2.3 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'SWS suppression approaches a ~50 min ceiling as the suppressible slow-wave pool depletes. EC50 ≈ 2.3 drinks. 1 unit → −12 min, 2 units → −22 min, 3 units → −30 min, 6 units → −42 min — gradient steepest at low doses (Ebrahim 2013 meta of 27 studies).' },
  { action: 'alcohol_units',   outcome: 'sleep_efficiency',    mean: -0.30,
    shape: { kind: 'smooth_saturating', asymptote: -15, halfDose: 2.5 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'SE asymptotes ~−15 pp as second-half arousal windows fill up. Smooth approach (EC50 ≈ 2.5 drinks) — first 1–2 units do the most damage; further intake adds proportionally less because awakening counts saturate (Ebrahim 2013).' },
  { action: 'alcohol_units',   outcome: 'hrv_daily',           mean: -0.30,
    shape: { kind: 'smooth_saturating', asymptote: -40, halfDose: 2.5 },
    pathway: 'wearable', horizonDays: 4,
    rationale: 'RMSSD floor ~−40 ms as parasympathetic tone bottoms out. EC50 ≈ 2.5 drinks; vagal blunting via GABA-A receptor saturation has a finite reserve (Spaak 2010, Sajadieh 2004).' },
  { action: 'alcohol_units',   outcome: 'rem_sleep',           mean: -0.55,
    shape: { kind: 'smooth_saturating', asymptote: -45, halfDose: 1.5 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'REM cap ≈ −45 min, EC50 ≈ 1.5 drinks (lowest of the architecture targets) — first-half REM episodes are short and easily abolished by even 1 drink. 2 units → −27 min, 6 units → −42 min — late-night REM partially preserved unless intake is very heavy (Ebrahim 2013).' },
  { action: 'alcohol_units',   outcome: 'sleep_onset_latency', mean: -0.20,
    shape: { kind: 'smooth_saturating', asymptote: -8, halfDose: 1.5 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'Sedation cap ≈ −8 min as GABA-A occupancy saturates. EC50 ≈ 1.5 drinks; additional intake doesn\'t accelerate sleep onset further. 2 units → −5 min, 6 units → −7.5 min (Roehrs & Roth 2001, Ebrahim 2013).' },

  // Alcohol timing — pre-bed clearance is the bigger lever. EC50 ≈ 1.6h
  // because ethanol clears at ~0.015 BAC/hr — even a short gap provides
  // measurable benefit, and 4–6h gap restores most architecture. Smooth
  // saturating reflects continuous BAC clearance, no biological breakpoint.
  { action: 'alcohol_timing',  outcome: 'deep_sleep',          mean:  0.55,
    shape: { kind: 'smooth_saturating', asymptote: 58, halfDose: 1.6 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'SWS recovery asymptotes ~+58 min as ethanol fully metabolizes pre-sleep. EC50 ≈ 1.6h. 2h gap → +26 min, 4h → +48 min, 6h → +54 min — diminishing returns past 4h because BAC near zero already (Ebrahim 2013).' },
  { action: 'alcohol_timing',  outcome: 'sleep_efficiency',    mean:  0.50,
    shape: { kind: 'smooth_saturating', asymptote: 11, halfDose: 1.6 },
    pathway: 'wearable', horizonDays: 2,
    rationale: 'SE recovery asymptotes ~+11 pp once second-half awakenings are prevented. Smooth pre-bed clearance curve — EC50 ≈ 1.6h matches BAC half-life under typical intake (Ebrahim 2013).' },
  { action: 'alcohol_timing',  outcome: 'hrv_daily',           mean:  0.45,
    shape: { kind: 'smooth_saturating', asymptote: 24, halfDose: 1.5 },
    pathway: 'wearable', horizonDays: 4,
    rationale: 'RMSSD recovery asymptotes ~+24 ms as vagal tone restores once ethanol metabolizes pre-sleep. EC50 ≈ 1.5h.' },
  { action: 'alcohol_timing',  outcome: 'rem_sleep',           mean:  0.50,
    shape: { kind: 'smooth_saturating', asymptote: 72, halfDose: 1.6 },
    pathway: 'wearable', horizonDays: 3,
    rationale: 'REM recovery asymptotes ~+72 min as late-night REM episodes restore once ethanol clears before onset. EC50 ≈ 1.6h. 4h gap → +59 min, 6h → +67 min (Ebrahim 2013).' },

  // ── Caffeine + alcohol: longer-horizon biomarker fingerprints ─────
  // The next-day sleep story is half the picture. Both substances
  // leave a weeks-band footprint in the blood that complements the
  // wearable signal.
  { action: 'caffeine_mg',     outcome: 'cortisol',         mean:  0.35, pathway: 'biomarker', horizonDays: 28, rationale: 'Chronic caffeine → tonically elevated cortisol, dose-linear in habitual users (Lovallo 2005).' },
  { action: 'alcohol_units',   outcome: 'triglycerides',    mean:  0.30, pathway: 'biomarker', horizonDays: 35, rationale: 'Ethanol → hepatic VLDL overproduction → fasting TG, dose-response above ~1 unit/day (Klatsky meta).' },
  { action: 'alcohol_units',   outcome: 'alt',              mean:  0.40, pathway: 'biomarker', horizonDays: 42, rationale: 'Hepatocellular stress marker rises within weeks of sustained intake above ~2 units/day; reverses on abstinence (Klatsky meta).' },

  // ── Training → quotidian (autonomic adaptation, week-scale) ────────
  { action: 'zone2_minutes',   outcome: 'hrv_daily',        mean:  0.45, pathway: 'wearable', horizonDays: 4, rationale: 'Endurance training raises parasympathetic tone (Plews 2013)' },
  { action: 'zone2_minutes',   outcome: 'sleep_efficiency', mean:  0.25, pathway: 'wearable', horizonDays: 2, rationale: 'Moderate aerobic exercise improves sleep (Kredlow 2015 meta)' },
  { action: 'zone4_5_minutes', outcome: 'hrv_daily',        mean: -0.20, pathway: 'wearable', horizonDays: 4, rationale: 'Opposite sign to Z2: HIIT triggers 24-48h sympathetic-dominance recovery debt — daily HRV drops on the day-after a high-intensity session (Stanley 2013, Bishop 2015).' },

  // ── Sleep duration → other quotidian outcomes ──────────────────────
  { action: 'sleep_duration',  outcome: 'sleep_efficiency', mean:  0.30, pathway: 'wearable', horizonDays: 2, rationale: 'Longer sleep opportunity supports consolidation' },
  { action: 'sleep_duration',  outcome: 'deep_sleep',       mean:  0.50, pathway: 'wearable', horizonDays: 3, rationale: 'More total sleep = more absolute SWS minutes' },
  { action: 'sleep_duration',  outcome: 'rem_sleep',        mean:  0.55, pathway: 'wearable', horizonDays: 3, rationale: 'REM cycles lengthen across the night — the last 90-min cycle is 50%+ REM, so cutting sleep short loses REM disproportionately (Carskadon 2005).' },
  { action: 'sleep_duration',  outcome: 'hrv_daily',        mean:  0.40, pathway: 'wearable', horizonDays: 4, rationale: 'Rested state → vagal recovery (Stein 2005)' },
]

function horizonDisplay(days: number): string {
  if (days <= 21) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  return `${Math.round(days / 30)} months`
}

/** Expand the Phase 1 spec into InsightBayesian shape so it can be merged
 *  into participant.effects_bayesian before buildGraph runs. */
export function buildPhase1SyntheticEdges(): InsightBayesian[] {
  return PHASE_1_EDGES.map((spec) => {
    const sd = 0.5
    return {
      action: spec.action,
      outcome: spec.outcome,
      pathway: spec.pathway,
      evidence_tier: 'cohort_level',
      literature_backed: true,
      // Frontend-injected edges all sit on a published mechanism + the
      // pretend-DAG, so they map to the backend's pooled tier.
      prior_provenance: 'synthetic+literature',
      horizon_days: spec.horizonDays,
      horizon_display: horizonDisplay(spec.horizonDays),
      supporting_data_description: spec.rationale,
      nominal_step: 1,
      dose_multiplier: 1,
      dose_multiplier_raw: 1,
      direction_conflict: false,
      dose_bounded: false,
      unbounded_dose_multiplier: 1,
      unbounded_scaled_effect: spec.mean,
      scaled_effect: spec.mean,
      posterior: {
        mean: spec.mean,
        variance: sd * sd,
        sd,
        contraction: 0.5,
        prior_mean: spec.mean,
        prior_variance: sd * sd,
        source: 'literature',
        lam_js: 0.5,
        n_cohort: 0,
        z_like: 0,
      },
      cohort_prior: null,
      user_obs: null,
      gate: { score: 0.5, tier: 'possible' },
    }
  })
}

/** Small helper so callers can tell at a glance whether an effect is one
 *  of the synthetic Phase 1 edges. */
export function isPhase1SyntheticEdge(e: InsightBayesian): boolean {
  return e.posterior?.source === 'literature' && e.literature_backed === true
}

// ─── Engine integration ────────────────────────────────────────────
//
// Convert each synthetic spec into a StructuralEquation + StructuralEdge
// so runFullCounterfactual treats these arrows the same as cohort-fit
// edges. The piecewise model uses bb = ba = physicalSlope (the theta
// changepoint is irrelevant when both segments share a slope).
//
// physicalSlope = mean × outcomeSpan / actionSpan
//   semantic: mean = ±1 means moving the action through its full
//   plausible span moves the outcome through its full plausible span.

const ACTION_SPAN: Record<string, [number, number]> = {
  // MANIPULABLE_NODES with an explicit fixedRange — kept in sync with
  // _shared.tsx so the slope semantic matches the lever's UI extent.
  zone2_minutes: [0, 120],
  zone4_5_minutes: [0, 30],
  caffeine_mg: [0, 600],
  caffeine_timing: [0, 14],
  alcohol_units: [0, 6],
  alcohol_timing: [0, 8],
  bedtime: [20, 28],
  // MANIPULABLE_NODES without fixedRange — typical-use spans.
  sleep_duration: [5, 10],
  training_volume: [0, 3],
  steps: [2000, 15000],
  active_energy: [200, 1500],
  dietary_protein: [50, 200],
  dietary_energy: [1500, 3500],
  // Loads / non-lever drivers — typical observed ranges in the cohort.
  acwr: [0.5, 2.0],
  training_load: [30, 200],
}

const OUTCOME_SPAN: Record<string, [number, number]> = {
  // Wearable / sleep
  hrv_daily: [10, 150],
  sleep_efficiency: [50, 100],
  deep_sleep: [20, 180],
  rem_sleep: [30, 180],
  sleep_onset_latency: [0, 90],
  // Lipids / metabolic
  triglycerides: [40, 500],
  hdl: [20, 120],
  ldl: [30, 250],
  apob: [30, 200],
  glucose: [50, 250],
  hscrp: [0, 15],
  // Iron panel
  ferritin: [5, 500],
  hemoglobin: [8, 19],
  iron_total: [30, 250],
  // Performance / hormones / liver
  vo2_peak: [30, 60],
  cortisol: [3, 30],
  alt: [10, 100],
}

function spanOf(table: Record<string, [number, number]>, key: string): number {
  const range = table[key]
  if (!range) return 1
  const span = range[1] - range[0]
  return span > 0 ? span : 1
}

function midOf(table: Record<string, [number, number]>, key: string): number {
  const range = table[key]
  if (!range) return 0
  return (range[0] + range[1]) / 2
}

interface SyntheticEngineBundle {
  equations: StructuralEquation[]
  structuralEdges: StructuralEdge[]
}

/**
 * Translate a SyntheticShape into engine parameters for evaluateEdge.
 *
 * Returns the curveType to use, plus bb / ba / theta. The piecewise
 * shapes (linear, saturating, inverted_u) all share `curveType: 'linear'`
 * because evaluateEdge's piecewise branch is the universal evaluator for
 * them. smooth_saturating uses its own curveType so evaluateEdge picks
 * the Hill-style branch.
 *
 * — linear:            bb = ba = slope; θ at midOf(action) keeps the
 *                      function linear over the action's plausible range.
 * — saturating:        first segment slope until knee, then `slopeAfter`
 *                      (defaults to 0) past it. Same shape captures
 *                      plateau-up (slope>0) and plateau-down (slope<0) —
 *                      sign in `slope` carries direction.
 * — smooth_saturating: bb = signed asymptote, theta = halfDose (EC50);
 *                      ba unused. Engine evaluates as
 *                      bb · (1 − 2^(−dose/theta)).
 * — inverted_u:        ascending slope until peak, descending after.
 *                      Sign of slopeUp/slopeDown chosen so the function
 *                      rises to peak and falls past it.
 */
function shapeToEquationParams(
  shape: SyntheticShape,
  actionMid: number,
): { curveType: CurveType; bb: number; ba: number; theta: number } {
  switch (shape.kind) {
    case 'linear':
      return { curveType: 'linear', bb: shape.slope, ba: shape.slope, theta: actionMid }
    case 'saturating':
      return { curveType: 'linear', bb: shape.slope, ba: shape.slopeAfter ?? 0, theta: shape.knee }
    case 'smooth_saturating':
      return { curveType: 'smooth_saturating', bb: shape.asymptote, ba: 0, theta: shape.halfDose }
    case 'inverted_u':
      return { curveType: 'linear', bb: shape.slopeUp, ba: shape.slopeDown, theta: shape.peak }
  }
}

/**
 * Build engine-consumable equations + DAG edges from PHASE_1_EDGES.
 *
 * Pass `existingEquationKeys` (a Set of "source→target" strings already
 * covered by fitted equations) to skip synthetic equations whose slope
 * would double-count an effect the cohort fit already estimates. The
 * structural-edge side is always emitted so the DAG knows the path
 * exists for descendant queries; duplicates are de-duped against
 * `existingEdgeKeys`.
 */
export function buildSyntheticEquations(
  existingEquationKeys: Set<string> = new Set(),
  existingEdgeKeys: Set<string> = new Set(),
): SyntheticEngineBundle {
  const equations: StructuralEquation[] = []
  const structuralEdges: StructuralEdge[] = []

  for (const spec of PHASE_1_EDGES) {
    const key = `${spec.action}→${spec.outcome}`

    if (!existingEquationKeys.has(key)) {
      let curveType: CurveType
      let bb: number
      let ba: number
      let theta: number

      if (spec.shape) {
        // Shape carries the literature physical effect directly; no need
        // to round-trip through normalized mean × span.
        const params = shapeToEquationParams(spec.shape, midOf(ACTION_SPAN, spec.action))
        curveType = params.curveType
        bb = params.bb
        ba = params.ba
        theta = params.theta
      } else {
        // Legacy edges still translate the [-1, 1] mean to a physical
        // slope via action/outcome spans.
        const actionSpan = spanOf(ACTION_SPAN, spec.action)
        const outcomeSpan = spanOf(OUTCOME_SPAN, spec.outcome)
        const slope = (spec.mean * outcomeSpan) / actionSpan
        curveType = 'linear'
        bb = slope
        ba = slope
        theta = midOf(ACTION_SPAN, spec.action)
      }

      equations.push({
        source: spec.action,
        target: spec.outcome,
        curveType,
        theta,
        bb,
        ba,
        effN: 0,
        personalPct: 0,
        provenance: 'literature',
      })
    }

    if (!existingEdgeKeys.has(key)) {
      structuralEdges.push({
        source: spec.action,
        target: spec.outcome,
        edgeType: 'causal',
      })
    }
  }

  return { equations, structuralEdges }
}
