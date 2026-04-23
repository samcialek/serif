/**
 * Phase 1 synthetic edges — textbook causal arrows that fill gaps in
 * the cohort fit, either because the lever lacks sustained variation in
 * the real data or the target biomarker isn't sampled densely enough.
 *
 * These are first-class members of the SCM. Insights, Protocols, and
 * the LivingGraph treat them as peers of cohort-fit edges; the only
 * marker is `prior_provenance: 'synthetic+literature'` and the
 * `posterior.source: 'literature'` flag, which are provenance metadata,
 * not a tier of trust.
 *
 * The same spec drives:
 *   - InsightBayesian rows (via buildPhase1SyntheticEdges) — the
 *     normalized [-1, 1] `mean` carries direction + strength for the
 *     LivingGraph and Insights tooltip.
 *   - StructuralEquation entries (via buildSyntheticEquations) — `mean`
 *     converts to a physical-unit slope using action and outcome spans
 *     so the Twin engine produces real counterfactual deltas.
 *
 * DEMO ONLY. Do not use for prescribing.
 */

import type { InsightBayesian } from '@/data/portal/types'
import type { StructuralEquation } from './types'
import type { StructuralEdge } from '../dataValue/types'

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

  // ── Caffeine: timing dominates dose (5h half-life means an afternoon
  //    coffee still has ~30% plasma at bedtime). Both edges call out the
  //    confounded naive correlation explicitly so the user can see
  //    Serif's adjustment story, not just the residual coefficient.
  { action: 'caffeine_mg',     outcome: 'deep_sleep',       mean: -0.35, pathway: 'wearable', horizonDays: 3, rationale: 'Naive caffeine↔poor-sleep is ~50% confounded — tired people drink more coffee AND sleep worse. Within-person, the residual adenosine-blockade effect still halves SWS density (Landolt 1995 RCT).' },
  { action: 'caffeine_mg',     outcome: 'sleep_efficiency', mean: -0.30, pathway: 'wearable', horizonDays: 2, rationale: 'After pulling out next-day-fatigue confounding, ~60% of the naive correlation persists — caffeine still delays onset and fragments late sleep (Drake 2013).' },
  { action: 'caffeine_mg',     outcome: 'hrv_daily',        mean: -0.30, pathway: 'wearable', horizonDays: 4, rationale: 'Net of training_load: caffeine → sympathetic tone → HRV suppression (Bowtell 2017).' },
  { action: 'caffeine_mg',     outcome: 'rem_sleep',        mean: -0.20, pathway: 'wearable', horizonDays: 3, rationale: 'Modest REM suppression — caffeine hits SWS harder than REM, but late-night plasma still trims the late-cycle REM episodes (Landolt 1995).' },
  { action: 'caffeine_mg',     outcome: 'sleep_onset_latency', mean:  0.40, pathway: 'wearable', horizonDays: 2, rationale: 'Adenosine blockade → longer time-to-sleep, dose-linear within habitual users. ~10 min penalty per 100mg above habitual baseline (Drake 2013).' },
  // Caffeine timing — bigger than dose because half-life makes plasma
  // level at bedtime the dominant signal.
  { action: 'caffeine_timing', outcome: 'deep_sleep',       mean:  0.55, pathway: 'wearable', horizonDays: 3, rationale: 'Timing dominates dose because of 5h half-life — 6h vs 0h pre-bed cutoff doubles SWS rebound at the same total intake (Drake 2013 crossover).' },
  { action: 'caffeine_timing', outcome: 'sleep_efficiency', mean:  0.50, pathway: 'wearable', horizonDays: 2, rationale: 'Within-person dose-vs-timing experiments give timing ~60% of caffeine\'s SE penalty — onset latency is the dominant signal.' },
  { action: 'caffeine_timing', outcome: 'sleep_onset_latency', mean: -0.55, pathway: 'wearable', horizonDays: 2, rationale: 'Timing dominates onset — at 0h pre-bed, plasma is ~75% peak; at 6h, ~30%. Six-hour cutoff cuts onset latency by 12-18 min vs none (Drake 2013 crossover).' },

  // ── Alcohol: same story — late drinking devastates more than total
  //    units do at the same intake. Late nights and big dinners explain
  //    ~30% of the naive alcohol↔poor-sleep link; the residual is direct
  //    ethanol pharmacology.
  { action: 'alcohol_units',   outcome: 'deep_sleep',       mean: -0.40, pathway: 'wearable', horizonDays: 3, rationale: 'Naive alcohol↔poor-sleep is ~30% confounded by late nights and heavy meals. The residual REM/SWS suppression is direct pharmacology, dose-linear (Ebrahim 2013 meta of 27 studies).' },
  { action: 'alcohol_units',   outcome: 'sleep_efficiency', mean: -0.30, pathway: 'wearable', horizonDays: 2, rationale: 'After holding bedtime constant, alcohol still drives mid-sleep awakenings above ~1 unit — the second-half-of-night arousal pattern is the hallmark (Ebrahim 2013).' },
  { action: 'alcohol_units',   outcome: 'hrv_daily',        mean: -0.30, pathway: 'wearable', horizonDays: 4, rationale: 'Net of exercise and intake: alcohol blunts vagal tone for 24h post-drink (Spaak 2010).' },
  { action: 'alcohol_units',   outcome: 'rem_sleep',        mean: -0.55, pathway: 'wearable', horizonDays: 3, rationale: 'Signature alcohol footprint — REM suppressed 30-40% in the first half of the night, dose-linear above 1 unit. Less rebound than SWS suppression, so the deficit is real (Ebrahim 2013 meta of 27 studies).' },
  { action: 'alcohol_units',   outcome: 'sleep_onset_latency', mean: -0.20, pathway: 'wearable', horizonDays: 2, rationale: 'Alcohol shortens onset (sedation) by 5-10 min — the only sleep stage it "improves." But the second-half disruption to architecture more than offsets, so this is a known false-positive lever.' },
  // Alcohol timing — pre-bed clearance is the bigger lever than dose.
  { action: 'alcohol_timing',  outcome: 'deep_sleep',       mean:  0.55, pathway: 'wearable', horizonDays: 3, rationale: 'Ethanol clears at ~0.015 BAC/hr — a 4h pre-bed gap restores SWS architecture even at 2-unit doses. Timing > dose for the same total intake.' },
  { action: 'alcohol_timing',  outcome: 'sleep_efficiency', mean:  0.50, pathway: 'wearable', horizonDays: 2, rationale: '2 units at 6pm vs 10pm differ by ~10pp in SE — pre-bed clearance prevents the second-half awakenings entirely (Ebrahim 2013).' },
  { action: 'alcohol_timing',  outcome: 'hrv_daily',        mean:  0.45, pathway: 'wearable', horizonDays: 4, rationale: 'Pre-bed clearance preserves overnight vagal recovery — early drinking with metabolism completed before sleep keeps HRV near baseline.' },
  { action: 'alcohol_timing',  outcome: 'rem_sleep',        mean:  0.50, pathway: 'wearable', horizonDays: 3, rationale: 'REM is concentrated in the second half of the night — clearance before sleep onset preserves the late-night REM episodes that ethanol otherwise wipes out (Ebrahim 2013).' },

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

    const actionSpan = spanOf(ACTION_SPAN, spec.action)
    const outcomeSpan = spanOf(OUTCOME_SPAN, spec.outcome)
    const slope = (spec.mean * outcomeSpan) / actionSpan

    if (!existingEquationKeys.has(key)) {
      equations.push({
        source: spec.action,
        target: spec.outcome,
        curveType: 'linear',
        theta: midOf(ACTION_SPAN, spec.action),
        bb: slope,
        ba: slope,
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
