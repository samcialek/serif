/**
 * DAG node classification — operational class + system mapping.
 *
 * Two responsibilities:
 *   - classifyOperational(id, kind) — DOSE / LOAD / FIELD / CONSTANT / TARGET / MEDIATOR
 *   - systemFor(id, kind)           — which physiological system the node belongs to
 *
 * Both feed the layout (column assignment + within-band grouping) and the
 * UI (chips, badges, color tokens). Static maps are deliberate: classification
 * should be deterministic and reviewable, not inferred from graph structure.
 */

import type { CausalKind, OperationalClass, PhysSystem } from './dagTypes'

// ─── FIELD nodes ────────────────────────────────────────────────────
//
// Imposed by environment or external schedule. User can change exposure
// (when/where) but not the field itself.

const FIELD_NODES = new Set<string>([
  'temp_c',
  'heat_index_c',
  'humidity_pct',
  'aqi',
  'uv_index',
  'daylight_hours',
  'season',
  'location',
  'is_weekend',
  'travel_load',          // arises from travel decisions but acts as imposed once airborne
  'cycle_luteal_phase',   // cycle phase isn't chosen
  'luteal_symptom_score',
])

// ─── LOAD nodes ─────────────────────────────────────────────────────
//
// In the user's control over time, slow-onset, accumulate from many
// daily doses.

const LOAD_NODES = new Set<string>([
  'acwr',
  'training_consistency',
  'training_consistency_90d',
  'sleep_debt',
  'sleep_debt_14d',
  'training_load',
  'training_volume',
  'training_monotony',
  'monotony',
  'body_mass_kg',  // both load (user builds it) and target (measured) — classified as load
  'ctl',
  'atl',
  'tsb',
  'sri_7d',
])

// ─── MEDIATOR nodes ─────────────────────────────────────────────────
//
// Internal physiology between cause and target. Surface only via labs
// or are latent. Listed here to keep them out of the action column.

const MEDIATOR_NODES = new Set<string>([
  'ground_contacts',
  'sweat_iron_loss',
  'gi_iron_loss',
  'iron_total',          // appears as outcome too; we classify as mediator since it sits between intake and ferritin/hemoglobin
  'plasma_volume',
  'lipoprotein_lipase',
  'reverse_cholesterol_transport',
  'core_temperature',
  'insulin_sensitivity',
  'energy_expenditure',
  'leptin',
  'high_intensity',
  'hpg_axis',
])

// ─── CONSTANT nodes ─────────────────────────────────────────────────
//
// Fixed traits. Not currently rendered as DAG nodes — surfaced in a
// side card. Listed here so we can recognize and route them.

const CONSTANT_NODES = new Set<string>([
  'age',
  'is_female',
  'sex',
  'archetype',
  'cohort',
])

// ─── TARGET nodes ───────────────────────────────────────────────────
//
// Canonical outcomes — wearables + biomarkers. Must be listed explicitly
// because some (hrv_daily, ferritin, iron_total) have outgoing edges in
// the structural backbone and would otherwise be inferred as MEDIATOR.

const TARGET_NODES = new Set<string>([
  // Wearables
  'hrv_daily',
  'hrv_baseline',
  'resting_hr',
  'resting_hr_trend',
  'sleep_efficiency',
  'sleep_onset_latency',
  'sleep_quality',
  'deep_sleep',
  'rem_sleep',
  // Iron / hematology
  'ferritin',
  'hemoglobin',
  'rbc',
  'mcv',
  'rdw',
  // Lipids
  'ldl',
  'hdl',
  'apob',
  'triglycerides',
  'total_cholesterol',
  'non_hdl_cholesterol',
  // Hormones
  'testosterone',
  'cortisol',
  'estradiol',
  'shbg',
  'dhea_s',
  'free_t_ratio',
  // Inflammation / immune
  'hscrp',
  'nlr',
  'wbc',
  'platelets',
  // Metabolic / micronutrient
  'glucose',
  'insulin',
  'hba1c',
  'uric_acid',
  'zinc',
  'magnesium_rbc',
  'vitamin_d',
  'b12',
  'folate',
  'homocysteine',
  'omega3_index',
  'ast',
  'alt',
  'albumin',
  'creatinine',
  // Fitness / cardio
  'vo2_peak',
  'vo2peak',
  'systolic_bp',
  // Body composition
  'body_fat_pct',
  'body_mass',
  'core_temperature',
])

// ─── DOSE detection ─────────────────────────────────────────────────
//
// Anything not classified above and starts with `supp_` or matches the
// daily-mutable action list.

const DOSE_PREFIXES = ['supp_']

const DOSE_NODES = new Set<string>([
  'bedtime',
  'wake_time',
  'workout_time',
  'sleep_duration',
  'sleep_quality',  // can be both action (target you set) and outcome — DOSE here when treated as a knob
  'caffeine_mg',
  'caffeine_timing',
  'alcohol_units',
  'alcohol_timing',
  'dietary_protein',
  'dietary_energy',
  'carbohydrate_g',
  'fiber_g',
  'late_meal_count',
  'post_meal_walks',
  'active_energy',
  'bedroom_temp_c',
  'steps',
  'zone2_minutes',
  'zone4_5_minutes',
  'resistance_training_minutes',
])

/**
 * Operational class for a node. Priority order:
 *   1. CONSTANT (rare; off-graph)
 *   2. FIELD (environment / imposed)
 *   3. LOAD (slow-accumulating chosen)
 *   4. TARGET (canonical outcomes — checked before MEDIATOR because
 *             several outcomes like hrv_daily, ferritin, iron_total
 *             also have outgoing causal edges in the backbone)
 *   5. MEDIATOR (latent physiology)
 *   6. DOSE (daily-mutable chosen)
 *   7. fallback to causalKind-derived
 */
export function classifyOperational(
  id: string,
  causalKind: CausalKind,
): OperationalClass {
  if (CONSTANT_NODES.has(id)) return 'constant'
  if (FIELD_NODES.has(id)) return 'field'
  if (LOAD_NODES.has(id)) return 'load'
  if (TARGET_NODES.has(id)) return 'target'
  if (MEDIATOR_NODES.has(id)) return 'mediator'
  if (DOSE_NODES.has(id)) return 'dose'
  for (const prefix of DOSE_PREFIXES) {
    if (id.startsWith(prefix)) return 'dose'
  }
  // Fallbacks based on causal role
  if (causalKind === 'outcome') return 'target'
  if (causalKind === 'mediator') return 'mediator'
  if (causalKind === 'context') return 'field'
  if (causalKind === 'exposure') return 'load'
  return 'dose'
}

// ─── System map ─────────────────────────────────────────────────────
//
// One system per node. Used for within-band grouping in the layout
// and for color cues. Keep this in sync with new outcomes added to
// the cohort fit.

const SYSTEM_MAP: Record<string, PhysSystem> = {
  // Sleep architecture
  sleep_efficiency: 'sleep',
  sleep_onset_latency: 'sleep',
  sleep_quality: 'sleep',
  sleep_duration: 'sleep',
  deep_sleep: 'sleep',
  rem_sleep: 'sleep',
  bedtime: 'sleep',
  wake_time: 'sleep',
  bedroom_temp_c: 'sleep',
  core_temperature: 'sleep',
  sleep_debt: 'sleep',
  sleep_debt_14d: 'sleep',

  // Autonomic
  hrv_daily: 'autonomic',
  hrv_baseline: 'autonomic',
  resting_hr: 'autonomic',
  resting_hr_trend: 'autonomic',

  // Iron + erythropoiesis
  ferritin: 'iron',
  hemoglobin: 'iron',
  iron_total: 'iron',
  rbc: 'iron',
  mcv: 'iron',
  rdw: 'iron',
  ground_contacts: 'iron',
  sweat_iron_loss: 'iron',
  gi_iron_loss: 'iron',
  plasma_volume: 'iron',

  // Lipids
  ldl: 'lipids',
  hdl: 'lipids',
  apob: 'lipids',
  triglycerides: 'lipids',
  total_cholesterol: 'lipids',
  non_hdl_cholesterol: 'lipids',
  lipoprotein_lipase: 'lipids',
  reverse_cholesterol_transport: 'lipids',

  // Hormones
  testosterone: 'hormones',
  cortisol: 'hormones',
  estradiol: 'hormones',
  shbg: 'hormones',
  dhea_s: 'hormones',
  free_t_ratio: 'hormones',
  hpg_axis: 'hormones',

  // Inflammation / immune
  hscrp: 'inflammation',
  nlr: 'inflammation',
  wbc: 'inflammation',
  platelets: 'inflammation',

  // Metabolic / micronutrient
  glucose: 'metabolic',
  insulin: 'metabolic',
  hba1c: 'metabolic',
  uric_acid: 'metabolic',
  zinc: 'metabolic',
  magnesium_rbc: 'metabolic',
  vitamin_d: 'metabolic',
  b12: 'metabolic',
  folate: 'metabolic',
  homocysteine: 'metabolic',
  omega3_index: 'metabolic',
  insulin_sensitivity: 'metabolic',
  ast: 'metabolic',
  alt: 'metabolic',
  albumin: 'metabolic',

  // Cardio fitness
  vo2_peak: 'cardio',
  vo2peak: 'cardio',
  systolic_bp: 'cardio',

  // Body composition
  body_fat_pct: 'body_comp',
  body_mass: 'body_comp',
  body_mass_kg: 'body_comp',
  energy_expenditure: 'body_comp',
  leptin: 'body_comp',

  // Renal
  creatinine: 'renal',

  // Training-side actions group together
  zone2_minutes: 'training',
  zone4_5_minutes: 'training',
  training_volume: 'training',
  training_load: 'training',
  training_consistency: 'training',
  training_consistency_90d: 'training',
  training_monotony: 'training',
  monotony: 'training',
  acwr: 'training',
  ctl: 'training',
  atl: 'training',
  tsb: 'training',
  sri_7d: 'training',
  resistance_training_minutes: 'training',
  workout_time: 'training',
  steps: 'training',
  active_energy: 'training',
  high_intensity: 'training',

  // Diet actions
  dietary_protein: 'diet',
  dietary_energy: 'diet',
  carbohydrate_g: 'diet',
  fiber_g: 'diet',
  late_meal_count: 'diet',
  post_meal_walks: 'diet',
  caffeine_mg: 'diet',
  caffeine_timing: 'diet',
  alcohol_units: 'diet',
  alcohol_timing: 'diet',

  // Environment
  temp_c: 'environment',
  heat_index_c: 'environment',
  humidity_pct: 'environment',
  aqi: 'environment',
  uv_index: 'environment',
  daylight_hours: 'environment',
  season: 'environment',
  location: 'environment',
  is_weekend: 'environment',
  travel_load: 'environment',
  cycle_luteal_phase: 'environment',
  luteal_symptom_score: 'environment',
}

/** Returns the PhysSystem for a node id. Supplements route to their
 *  target system when the suffix matches a known biomarker. */
export function systemFor(id: string): PhysSystem {
  if (SYSTEM_MAP[id] != null) return SYSTEM_MAP[id]
  // Supplements: strip `supp_` and look up — `supp_iron` → iron, `supp_b_complex` → metabolic
  if (id.startsWith('supp_')) {
    const tail = id.slice('supp_'.length)
    if (SYSTEM_MAP[tail] != null) return SYSTEM_MAP[tail]
    // Common supplement → system shortcuts
    if (tail.includes('iron') || tail === 'ferrous') return 'iron'
    if (tail.includes('omega') || tail.includes('fish_oil')) return 'inflammation'
    if (tail.includes('melatonin') || tail.includes('theanine') || tail.includes('magnesium')) return 'sleep'
    if (tail.includes('creatine')) return 'training'
    if (tail.includes('zinc') || tail.includes('vitamin') || tail.includes('b_complex')) return 'metabolic'
  }
  return 'other'
}

// ─── Outcome → response horizon ─────────────────────────────────────
//
// Wearables resolve over a week. Biomarkers over a quarter. Mediators
// follow the downstream target.

const WEARABLE_OUTCOMES = new Set<string>([
  'hrv_daily',
  'hrv_baseline',
  'resting_hr',
  'resting_hr_trend',
  'sleep_efficiency',
  'sleep_onset_latency',
  'sleep_quality',
  'deep_sleep',
  'rem_sleep',
  'sleep_duration',
])

/** Returns the evaluation horizon for an outcome.
 *  Wearables resolve over the week; biomarkers over the quarter. */
export function horizonForOutcome(outcome: string): 'week' | 'quarter' {
  return WEARABLE_OUTCOMES.has(outcome) ? 'week' : 'quarter'
}

/** Pathway hint for an outcome (used when an edge spec doesn't carry one). */
export function pathwayForOutcome(
  outcome: string,
): 'wearable' | 'biomarker' | 'mediator' {
  if (WEARABLE_OUTCOMES.has(outcome)) return 'wearable'
  if (MEDIATOR_NODES.has(outcome)) return 'mediator'
  return 'biomarker'
}

// ─── Causal kind inference ──────────────────────────────────────────
//
// When a node only appears via STRUCTURAL_EDGES (no fitted edge or
// literature spec), classify based on its role in those structural
// edges. Used during assembly when we don't have an explicit kind.

export function inferCausalKind(
  id: string,
  appearances: { asSource: number; asTarget: number; asConfounder: number },
): CausalKind {
  if (FIELD_NODES.has(id)) return 'context'
  if (LOAD_NODES.has(id)) return 'exposure'
  if (MEDIATOR_NODES.has(id)) return 'mediator'
  if (DOSE_NODES.has(id) || id.startsWith('supp_')) return 'action'
  if (appearances.asConfounder > 0 && appearances.asSource === 0) return 'context'
  if (appearances.asTarget > 0 && appearances.asSource === 0) return 'outcome'
  if (appearances.asSource > 0 && appearances.asTarget === 0) return 'action'
  // Has both incoming and outgoing causal edges → mediator
  return 'mediator'
}
