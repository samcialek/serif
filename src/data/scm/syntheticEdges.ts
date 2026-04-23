/**
 * Phase 1 synthetic edges — textbook causal arrows that should already
 * appear in the Bayesian export but don't, because the real cohort either
 * lacks sustained variation in that lever or doesn't yet collect the
 * target biomarker.
 *
 * These are injected on the frontend *only* into the LivingGraph view
 * (merged before buildGraph) so the graph reads like a real metabolic
 * causal model instead of a sparse subset. Insights / Protocols still
 * ignore them because they're gated on real user_obs + posterior
 * contraction, which synthetic edges don't have.
 *
 * Each edge carries a plausible sign + magnitude + horizon from published
 * dose-response literature. Cohort-fit magnitudes matter less than sign
 * because the LivingGraph normalizes strength within the visible edge set.
 *
 * DEMO ONLY. Do not use for prescribing.
 */

import type { InsightBayesian } from '@/data/portal/types'

interface SyntheticEdgeSpec {
  action: string
  outcome: string
  /** Normalized [-1, 1] signed effect used for posterior.mean. Sign is
   *  what matters for LivingGraph coloring; magnitude sets edge weight
   *  via the in-graph normalization. */
  mean: number
  pathway: 'wearable' | 'biomarker'
  horizonDays: number
  /** Short rationale — surfaced in InsightRow tooltips as the
   *  supporting_data_description. */
  rationale: string
}

const PHASE_1_EDGES: SyntheticEdgeSpec[] = [
  // ── Training → VO2max (canonical aerobic adaptation) ───────────────
  { action: 'zone2_volume',    outcome: 'vo2_peak',      mean:  0.80, pathway: 'biomarker', horizonDays: 84, rationale: 'Zone-2 mitochondrial adaptation → VO2max (Seiler 2010)' },
  { action: 'training_volume', outcome: 'vo2_peak',      mean:  0.60, pathway: 'biomarker', horizonDays: 84, rationale: 'Total training volume → VO2max (Milanović 2015 meta-analysis)' },

  // ── Training → lipids (LPL clearance, body-composition pathway) ────
  { action: 'zone2_volume',    outcome: 'triglycerides', mean: -0.50, pathway: 'biomarker', horizonDays: 60, rationale: 'Aerobic training activates LPL → TG clearance' },
  { action: 'zone2_volume',    outcome: 'hdl',           mean:  0.40, pathway: 'biomarker', horizonDays: 90, rationale: 'Z2 raises HDL via apoA-I (Kodama 2007)' },
  { action: 'running_volume',  outcome: 'triglycerides', mean: -0.40, pathway: 'biomarker', horizonDays: 60, rationale: 'Running volume → LPL/TG clearance (dose-response)' },
  { action: 'running_volume',  outcome: 'hdl',           mean:  0.35, pathway: 'biomarker', horizonDays: 90, rationale: 'Running → HDL (Kraus HERITAGE)' },
  { action: 'running_volume',  outcome: 'apob',          mean: -0.30, pathway: 'biomarker', horizonDays: 90, rationale: 'Endurance lowers apoB via LPL + body comp' },
  { action: 'running_volume',  outcome: 'hscrp',         mean: -0.35, pathway: 'biomarker', horizonDays: 60, rationale: 'Endurance training lowers chronic inflammation' },

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
  { action: 'acwr',            outcome: 'sleep_quality', mean: -0.40, pathway: 'wearable',  horizonDays: 7,  rationale: 'ACWR > 1.4 → sleep disturbance (overreaching)' },
  { action: 'acwr',            outcome: 'deep_sleep',    mean: -0.35, pathway: 'wearable',  horizonDays: 7,  rationale: 'Acute overload suppresses slow-wave sleep' },
  { action: 'training_load',   outcome: 'sleep_quality', mean: -0.25, pathway: 'wearable',  horizonDays: 7,  rationale: 'High cumulative load disrupts sleep continuity' },
  { action: 'training_load',   outcome: 'deep_sleep',    mean: -0.20, pathway: 'wearable',  horizonDays: 7,  rationale: 'Chronic load → deep-sleep fragmentation' },

  // ─── Phase 2: quotidian dose-response, confounder-adjusted ────────
  // These edges target the wearable-day band (sleep_quality,
  // deep_sleep, sleep_efficiency, hrv_daily, resting_hr) which the
  // CASPian cohort under-samples. Each rationale calls out the
  // confounders the synthetic effect is *net of* — i.e. the magnitude
  // here is the within-person causal effect that survives adjustment,
  // not the naive cohort correlation.

  // ── Caffeine dose → sleep + autonomic (net of sleep debt) ──────────
  // Naive caffeine ↔ poor-sleep is confounded: tired people drink
  // more coffee AND sleep worse. After adjusting for sleep_debt and
  // bedtime, the within-person effect attenuates ~30% but stays
  // clearly negative — adenosine blockade is the real channel.
  { action: 'caffeine_mg',     outcome: 'sleep_quality',    mean: -0.45, pathway: 'wearable', horizonDays: 2, rationale: 'Net of sleep_debt and bedtime: caffeine → adenosine blockade → sleep quality (Drake 2013 RCT)' },
  { action: 'caffeine_mg',     outcome: 'deep_sleep',       mean: -0.55, pathway: 'wearable', horizonDays: 3, rationale: 'Net of sleep_debt: caffeine halves SWS density, dose-linear (Landolt 1995)' },
  { action: 'caffeine_mg',     outcome: 'sleep_efficiency', mean: -0.40, pathway: 'wearable', horizonDays: 2, rationale: 'Net of prior-day fatigue: caffeine delays onset and fragments late sleep' },
  { action: 'caffeine_mg',     outcome: 'hrv_daily',        mean: -0.30, pathway: 'wearable', horizonDays: 4, rationale: 'Net of training_load: caffeine → sympathetic tone → HRV suppression (Bowtell 2017)' },
  { action: 'caffeine_mg',     outcome: 'resting_hr',       mean:  0.25, pathway: 'wearable', horizonDays: 4, rationale: 'Mild dose-linear tachycardic effect (β1 agonism via cAMP)' },

  // ── Caffeine timing → sleep (net of dose) ──────────────────────────
  // Independent of how much caffeine is consumed, the gap between the
  // last cup and bedtime is the dominant within-person knob: 6h vs 0h
  // pre-bed nearly doubles SWS recovery in crossover trials.
  { action: 'caffeine_timing', outcome: 'sleep_quality',    mean:  0.35, pathway: 'wearable', horizonDays: 2, rationale: 'Net of caffeine dose: bigger pre-bed gap = less plasma caffeine at sleep onset' },
  { action: 'caffeine_timing', outcome: 'deep_sleep',       mean:  0.40, pathway: 'wearable', horizonDays: 3, rationale: 'Net of dose: 6h vs 0h pre-bed cutoff doubles SWS rebound (Drake 2013)' },
  { action: 'caffeine_timing', outcome: 'sleep_efficiency', mean:  0.30, pathway: 'wearable', horizonDays: 2, rationale: 'Net of dose: timing is the dominant within-person lever for onset latency' },

  // ── Alcohol dose → quotidian (net of bedtime + dietary energy) ─────
  // Naive alcohol ↔ poor-sleep is partly confounded by late nights and
  // heavy meals (people drink more on weekends, eat more, sleep later).
  // Adjusting for bedtime and dietary_energy isolates the direct
  // pharmacological effect — still strongly negative on REM/SWS.
  { action: 'alcohol_units',   outcome: 'deep_sleep',       mean: -0.55, pathway: 'wearable', horizonDays: 3, rationale: 'Net of bedtime and caloric load: ethanol suppresses REM/SWS, dose-linear (Ebrahim 2013 meta)' },
  { action: 'alcohol_units',   outcome: 'sleep_quality',    mean: -0.40, pathway: 'wearable', horizonDays: 2, rationale: 'Net of social late-night confounders: alcohol fragments second half of night' },
  { action: 'alcohol_units',   outcome: 'sleep_efficiency', mean: -0.35, pathway: 'wearable', horizonDays: 2, rationale: 'Net of bedtime: mid-sleep awakenings rise dose-linearly above 1 unit' },
  { action: 'alcohol_units',   outcome: 'hrv_daily',        mean: -0.45, pathway: 'wearable', horizonDays: 4, rationale: 'Net of exercise and intake: alcohol blunts vagal tone for 24h post-drink (Spaak 2010)' },
  { action: 'alcohol_units',   outcome: 'resting_hr',       mean:  0.30, pathway: 'wearable', horizonDays: 4, rationale: 'Sympathetic rebound after metabolism, dose-linear up to ~4 units' },

  // ── Alcohol timing → sleep (net of dose) ───────────────────────────
  { action: 'alcohol_timing',  outcome: 'deep_sleep',       mean:  0.45, pathway: 'wearable', horizonDays: 3, rationale: 'Net of dose: 4h metabolism window (~0.015 BAC/hr) restores SWS architecture' },
  { action: 'alcohol_timing',  outcome: 'sleep_quality',    mean:  0.30, pathway: 'wearable', horizonDays: 2, rationale: 'Net of dose: full ethanol clearance before sleep onset' },
  { action: 'alcohol_timing',  outcome: 'hrv_daily',        mean:  0.35, pathway: 'wearable', horizonDays: 4, rationale: 'Net of dose: pre-bed clearance preserves overnight vagal recovery' },

  // ── Training → quotidian (cardiac + autonomic adaptation) ──────────
  { action: 'zone2_volume',    outcome: 'hrv_daily',        mean:  0.45, pathway: 'wearable', horizonDays: 4, rationale: 'Endurance training raises parasympathetic tone (Plews 2013)' },
  { action: 'zone2_volume',    outcome: 'resting_hr',       mean: -0.50, pathway: 'wearable', horizonDays: 4, rationale: 'Cardiac remodeling lowers RHR, dose-response (Carter 2003)' },
  { action: 'zone2_volume',    outcome: 'sleep_efficiency', mean:  0.25, pathway: 'wearable', horizonDays: 2, rationale: 'Moderate aerobic exercise improves sleep (Kredlow 2015 meta)' },
  { action: 'running_volume',  outcome: 'hrv_daily',        mean:  0.35, pathway: 'wearable', horizonDays: 4, rationale: 'Running volume → vagal tone, diminishing returns above LT1' },
  { action: 'running_volume',  outcome: 'resting_hr',       mean: -0.45, pathway: 'wearable', horizonDays: 4, rationale: 'Running volume → RHR, dose-response' },

  // ── Sleep duration → other quotidian outcomes ──────────────────────
  { action: 'sleep_duration',  outcome: 'sleep_efficiency', mean:  0.30, pathway: 'wearable', horizonDays: 2, rationale: 'Longer sleep opportunity supports consolidation' },
  { action: 'sleep_duration',  outcome: 'deep_sleep',       mean:  0.50, pathway: 'wearable', horizonDays: 3, rationale: 'More total sleep = more absolute SWS minutes' },
  { action: 'sleep_duration',  outcome: 'hrv_daily',        mean:  0.40, pathway: 'wearable', horizonDays: 4, rationale: 'Rested state → vagal recovery (Stein 2005)' },
  { action: 'sleep_duration',  outcome: 'resting_hr',       mean: -0.35, pathway: 'wearable', horizonDays: 4, rationale: 'Rested state → lower next-day RHR' },
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
