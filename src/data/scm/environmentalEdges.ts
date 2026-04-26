/**
 * Environmental synthetic edges — literature-backed direct effects from
 * environmental exposures (heat, humidity, UV, air quality, travel load,
 * season, daylight) onto the standard outcome panel.
 *
 * These cover what the cohort fits don't: the participant's environment
 * as a *first-class causal driver*, not just a confounder used for
 * back-door adjustment in the action→outcome edges. Surfacing them in
 * Insights gives the coach the "what's being done to me by my context"
 * picture alongside "what I'm doing to myself."
 *
 * Conventions match `SyntheticEdgeSpec`:
 *   - `action` is the environmental driver column
 *     (heat_index_c, humidity_pct, uv_index, aqi, travel_load,
 *      daylight_hours, temp_c)
 *   - `mean` is the [-1, 1] normalized signed effect — moving the
 *     action through its plausible span produces `|mean| × outcome span`
 *     of effect.
 *   - `rationale` carries the citation so it surfaces in the InsightRow
 *     `supporting_data_description` tooltip.
 *
 * Spans for the env actions are added to `ENV_ACTION_SPAN` so the
 * SCM engine's `buildSyntheticEquations` can scale them.
 *
 * DEMO ONLY — magnitudes are calibrated to literature meta-effect sizes
 * but not validated against this app's specific cohort.
 */

import type { SyntheticEdgeSpec } from './syntheticEdges'
import type { InsightBayesian } from '@/data/portal/types'

// ─── HEAT INDEX (combined temp + humidity) ──────────────────────────
//
// Heat stress activates sympathetic nervous system, depletes plasma
// volume, and disrupts thermoregulation. Effects are immediate (HRV,
// sleep) and chronic (kidney function via uric acid).

const HEAT_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'heat_index_c',
    outcome: 'hrv_daily',
    mean: -0.45,
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Heat stress raises sympathetic tone and lowers RMSSD overnight; ~10-15 ms HRV reduction per 5°C above thermal-comfort zone (Bruce-Low 2006; Gisolfi & Mora 2000).',
  },
  {
    action: 'heat_index_c',
    outcome: 'sleep_efficiency',
    mean: -0.50,
    pathway: 'wearable',
    horizonDays: 2,
    rationale:
      'Bedroom heat above 24°C fragments sleep — wakefulness rises as core temp can\'t fall normally during NREM (Okamoto-Mizuno 2012 review of 25 studies).',
  },
  {
    action: 'heat_index_c',
    outcome: 'deep_sleep',
    mean: -0.40,
    pathway: 'wearable',
    horizonDays: 2,
    rationale:
      'Slow-wave sleep is particularly heat-sensitive; SWS suppression begins above 26°C ambient (Haskell 1981, Karaki 2011).',
  },
  {
    action: 'heat_index_c',
    outcome: 'rem_sleep',
    mean: -0.30,
    pathway: 'wearable',
    horizonDays: 2,
    rationale:
      'REM is the most thermoregulation-impaired sleep stage; high heat truncates late-night REM cycles (Kräuchi 2007).',
  },
  {
    action: 'heat_index_c',
    outcome: 'resting_hr',
    mean: 0.40,
    pathway: 'wearable',
    horizonDays: 5,
    rationale:
      'Heat acclimation period elevates RHR by 5-10 bpm during 5-7 days of new heat exposure (Périard 2015 review).',
  },
  {
    action: 'heat_index_c',
    outcome: 'cortisol',
    mean: 0.30,
    pathway: 'biomarker',
    horizonDays: 7,
    rationale:
      'Acute heat exposure elevates morning cortisol via HPA stress axis (Lim 2008; Follenius 1982).',
  },
  {
    action: 'heat_index_c',
    outcome: 'testosterone',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Chronic heat stress in male reproductive system depresses testicular T output (Setchell 1998; observed in occupational heat exposure).',
  },
  {
    action: 'heat_index_c',
    outcome: 'uric_acid',
    mean: 0.30,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'Heat-driven dehydration concentrates serum urate; Mesoamerican CKD epidemic in agricultural heat workers (Garcia-Trabanino 2015).',
  },
  {
    action: 'heat_index_c',
    outcome: 'vo2_peak',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'High ambient heat reduces session quality + adaptation rate; 5-10% VO2 performance loss per 5°C above thermoneutral (Galloway 1997).',
  },
  {
    action: 'heat_index_c',
    outcome: 'sleep_onset_latency',
    mean: 0.30,
    pathway: 'wearable',
    horizonDays: 1,
    rationale:
      'Hot bedrooms delay sleep onset by 5-15 minutes via thermoregulation interference (Okamoto-Mizuno 1999).',
  },
]

// ─── TEMPERATURE (cold + lipid seasonality) ─────────────────────────
//
// Cold exposure has its own physiology beyond what heat_index captures:
// brown adipose tissue activation, vasoconstriction, and a robust
// seasonal lipid pattern.

const TEMP_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'temp_c',
    outcome: 'ldl',
    mean: -0.25,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Lipid seasonality: LDL ~5-7 mg/dL higher in winter than summer across temperate cohorts (Robinson 1992; Ockene 2004 longitudinal n=517).',
  },
  {
    action: 'temp_c',
    outcome: 'apob',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Same winter ApoB elevation as LDL — driven by reduced outdoor activity, dietary shifts, and cold-vasoconstriction lipid handling (Tsai 2004).',
  },
  {
    action: 'temp_c',
    outcome: 'triglycerides',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Triglyceride seasonality follows LDL, slightly weaker; winter peak in temperate cohorts (Ockene 2004).',
  },
  {
    action: 'temp_c',
    outcome: 'hdl',
    mean: 0.15,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Modest summer HDL rise via warmer-weather activity + diet shifts (Kamezaki 2010 n=8,355).',
  },
  {
    action: 'temp_c',
    outcome: 'cortisol',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 7,
    rationale:
      'Cold exposure elevates cortisol acutely via HPA + sympathetic activation; chronic adaptation reduces the response (Leppäluoto 2008).',
  },
  {
    action: 'temp_c',
    outcome: 'hscrp',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Cold-season inflammation peak: hsCRP runs ~0.3-0.5 mg/L higher in winter (Crewe 2018, Dopico 2015).',
  },
]

// ─── HUMIDITY ───────────────────────────────────────────────────────
//
// High humidity blocks evaporative cooling, both during sleep and
// during exercise. Effects mostly stack on top of heat_index but
// remain identifiable on humidity alone.

const HUMIDITY_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'humidity_pct',
    outcome: 'sleep_efficiency',
    mean: -0.30,
    pathway: 'wearable',
    horizonDays: 2,
    rationale:
      'Bedroom RH above 60% impairs evaporative cooling during sleep; SE drops 3-5 points compared to 40-50% RH at the same temperature (Okamoto-Mizuno 1999).',
  },
  {
    action: 'humidity_pct',
    outcome: 'sleep_onset_latency',
    mean: 0.20,
    pathway: 'wearable',
    horizonDays: 1,
    rationale:
      'High humidity delays sleep onset by extending the time needed for core temp to fall (Okamoto-Mizuno 1999).',
  },
  {
    action: 'humidity_pct',
    outcome: 'vo2_peak',
    mean: -0.15,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'Humid air reduces sustainable session intensity; sweat-mediated cooling fails above ~70% RH at moderate heat (Maughan 2012).',
  },
  {
    action: 'humidity_pct',
    outcome: 'hrv_daily',
    mean: -0.15,
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Humidity-amplified heat stress lowers overnight HRV via residual sympathetic load (extends Bruce-Low 2006 heat data).',
  },
]

// ─── UV INDEX (sunlight exposure) ────────────────────────────────────
//
// Sunlight drives cutaneous vitamin D synthesis (endogenous), entrains
// circadian rhythm, and has direct anti-inflammatory effects via
// immune modulation. Vitamin D pathway is the dominant mechanism for
// hormonal/inflammatory effects.

const UV_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'uv_index',
    outcome: 'testosterone',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Higher UV → higher 25(OH)D → higher T in deficient men; seasonal T variation tracks UV with ~4-week lag (Wehr 2010; Andersson 2003).',
  },
  {
    action: 'uv_index',
    outcome: 'hscrp',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'UV exposure has anti-inflammatory effects via T-reg activation + vitamin D-mediated cytokine suppression (Krause 2015 review).',
  },
  {
    action: 'uv_index',
    outcome: 'cortisol',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 1,
    rationale:
      'Bright morning light boosts cortisol awakening response via SCN→PVN pathway (Petrowski 2019; Wright 2013).',
  },
  {
    action: 'uv_index',
    outcome: 'sleep_onset_latency',
    mean: -0.20,
    pathway: 'wearable',
    horizonDays: 7,
    rationale:
      'Daytime bright light advances circadian phase, shortening evening sleep onset by 5-10 min after a week of higher exposure (Wright 2013).',
  },
  {
    action: 'uv_index',
    outcome: 'hrv_daily',
    mean: 0.10,
    pathway: 'wearable',
    horizonDays: 14,
    rationale:
      'Higher seasonal UV correlates with higher HRV in temperate cohorts; mechanism likely via vitamin D modulation of vagal tone (Eckberg 2003 seasonal data).',
  },
  {
    action: 'uv_index',
    outcome: 'dhea_s',
    mean: 0.15,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Modest seasonal DHEA-S rise tracks UV / vitamin D status (Suzuki 2011).',
  },
]

// ─── AIR QUALITY (AQI / PM2.5) ──────────────────────────────────────
//
// Particulate matter is the most well-studied environmental driver of
// chronic disease — direct causal effects on inflammation, autonomic
// function, lipid handling, and insulin sensitivity. AHA scientific
// statement (Brook 2010) lists it as a CV risk factor on par with
// smoking for population-level exposure.

const AQI_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'aqi',
    outcome: 'hscrp',
    mean: 0.40,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'PM2.5 exposure raises systemic inflammation; ~0.5-1.0 mg/L hsCRP elevation per 10 μg/m³ chronic exposure (Pope 2004; Brook 2010 AHA scientific statement).',
  },
  {
    action: 'aqi',
    outcome: 'hrv_daily',
    mean: -0.35,
    pathway: 'wearable',
    horizonDays: 3,
    rationale:
      'Particulate exposure reduces RMSSD via autonomic dysregulation; effect emerges within hours and persists for days (Pieters 2012 meta of 33 studies).',
  },
  {
    action: 'aqi',
    outcome: 'resting_hr',
    mean: 0.25,
    pathway: 'wearable',
    horizonDays: 7,
    rationale:
      'Same autonomic pathway: PM2.5 raises RHR by 1-3 bpm per 10 μg/m³ chronic exposure (Liao 2004).',
  },
  {
    action: 'aqi',
    outcome: 'vo2_peak',
    mean: -0.30,
    pathway: 'biomarker',
    horizonDays: 28,
    rationale:
      'Acute and chronic PM exposure reduces aerobic capacity via airway inflammation + bronchoconstriction (Rundell 2012; Cutrufello 2012).',
  },
  {
    action: 'aqi',
    outcome: 'ldl',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Long-term PM2.5 exposure raises LDL via inflammation-driven hepatic lipid handling (Chuang 2010 n=1,061; Schwartz 2018).',
  },
  {
    action: 'aqi',
    outcome: 'apob',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'Same atherogenic-lipoprotein pathway as LDL — PM raises ApoB-bearing particle count chronically.',
  },
  {
    action: 'aqi',
    outcome: 'glucose',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'PM exposure linked to insulin resistance + raised fasting glucose (Chen 2016 meta of 23 studies; Wolf 2016 longitudinal).',
  },
  {
    action: 'aqi',
    outcome: 'insulin',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Same insulin-resistance pathway: chronic PM raises fasting insulin (Wolf 2016).',
  },
  {
    action: 'aqi',
    outcome: 'sleep_efficiency',
    mean: -0.25,
    pathway: 'wearable',
    horizonDays: 7,
    rationale:
      'Air pollution disrupts sleep via airway irritation + nocturnal arousals; 6% efficiency loss in highest-quartile PM2.5 (Liu 2020 review).',
  },
  {
    action: 'aqi',
    outcome: 'cortisol',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'PM exposure activates HPA axis via systemic inflammation; chronic exposure raises diurnal cortisol (Snow 2018).',
  },
  {
    action: 'aqi',
    outcome: 'alt',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 90,
    rationale:
      'PM2.5 contributes to NAFLD progression; small but consistent ALT elevation in highly-exposed cohorts (Kim 2018 longitudinal n=84,387).',
  },
  {
    action: 'aqi',
    outcome: 'nlr',
    mean: 0.30,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'Acute PM exposure raises neutrophil count and lowers lymphocyte count, elevating NLR within days (Tang 2019).',
  },
]

// ─── TRAVEL / JET LAG (travel_load) ─────────────────────────────────
//
// `travel_load` is a synthetic 0-10 score capturing recent time-zone
// crossings + sleep displacement (see backend/serif_scm/loads.py). Its
// effects are dominated by acute circadian disruption.

const TRAVEL_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'travel_load',
    outcome: 'cortisol',
    mean: 0.40,
    pathway: 'biomarker',
    horizonDays: 5,
    rationale:
      'Jet lag elevates morning cortisol via misaligned HPA axis; effect peaks 2-4 days post-flight then resolves over 7-10 days (Eastman 2005).',
  },
  {
    action: 'travel_load',
    outcome: 'sleep_efficiency',
    mean: -0.45,
    pathway: 'wearable',
    horizonDays: 5,
    rationale:
      'Time-zone displacement fragments sleep architecture, with eastward travel hitting hardest (Reilly 2007).',
  },
  {
    action: 'travel_load',
    outcome: 'hrv_daily',
    mean: -0.35,
    pathway: 'wearable',
    horizonDays: 5,
    rationale:
      'Circadian disruption suppresses parasympathetic tone; HRV recovery lags sleep recovery by ~3 days (Reilly 2007).',
  },
  {
    action: 'travel_load',
    outcome: 'nlr',
    mean: 0.30,
    pathway: 'biomarker',
    horizonDays: 7,
    rationale:
      'Acute circadian disruption shifts neutrophil/lymphocyte balance via cortisol-mediated immune cell margination (Brunner 2014).',
  },
  {
    action: 'travel_load',
    outcome: 'hscrp',
    mean: 0.25,
    pathway: 'biomarker',
    horizonDays: 7,
    rationale:
      'Travel-induced sleep disruption + immune dysregulation modestly raises hsCRP for ~1 week post-travel (Mullington 2010).',
  },
  {
    action: 'travel_load',
    outcome: 'glucose',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 5,
    rationale:
      'Misaligned circadian feeding raises postprandial and fasting glucose via melatonin-suppressed insulin secretion (Scheer 2009).',
  },
  {
    action: 'travel_load',
    outcome: 'testosterone',
    mean: -0.20,
    pathway: 'biomarker',
    horizonDays: 14,
    rationale:
      'Sleep displacement reduces overnight LH pulses; T runs ~10-15% below baseline for 5-7 days post-eastward travel (Leproult 2011 sleep-restriction analog).',
  },
]

// ─── DAYLIGHT HOURS (seasonal) ──────────────────────────────────────
//
// Photoperiod-driven endocrine + circadian effects beyond what UV
// captures (UV is intensity; daylight is duration).

const DAYLIGHT_EDGES: SyntheticEdgeSpec[] = [
  {
    action: 'daylight_hours',
    outcome: 'testosterone',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Photoperiod modulates HPG-axis pulsatility; long days correlate with higher T in temperate male cohorts (Andersson 2003).',
  },
  {
    action: 'daylight_hours',
    outcome: 'cortisol',
    mean: 0.20,
    pathway: 'biomarker',
    horizonDays: 7,
    rationale:
      'Earlier morning light advances cortisol awakening response and raises peak CAR (Wirz-Justice 2009).',
  },
  {
    action: 'daylight_hours',
    outcome: 'sleep_efficiency',
    mean: -0.10,
    pathway: 'wearable',
    horizonDays: 14,
    rationale:
      'Long days slightly compress sleep duration in evening chronotypes via delayed melatonin onset; small effect on SE (Roenneberg 2012).',
  },
  {
    action: 'daylight_hours',
    outcome: 'hscrp',
    mean: -0.15,
    pathway: 'biomarker',
    horizonDays: 60,
    rationale:
      'Seasonal hsCRP nadir tracks summer photoperiod; mediated through vitamin D + activity volume (Dopico 2015 longitudinal).',
  },
]

/** All environmental edges — flat array, ready to convert to engine
 *  equations or InsightBayesian rows. */
export const ENVIRONMENTAL_EDGES: SyntheticEdgeSpec[] = [
  ...HEAT_EDGES,
  ...TEMP_EDGES,
  ...HUMIDITY_EDGES,
  ...UV_EDGES,
  ...AQI_EDGES,
  ...TRAVEL_EDGES,
  ...DAYLIGHT_EDGES,
]

/** Action ranges for environmental drivers — matches the typical
 *  observed range in the Caspian / temperate cohort weather data. */
export const ENV_ACTION_SPAN: Record<string, [number, number]> = {
  heat_index_c: [10, 40],
  temp_c: [-10, 35],
  humidity_pct: [20, 95],
  uv_index: [0, 12],
  aqi: [0, 300],
  travel_load: [0, 10],
  daylight_hours: [8, 16],
}

// Outcome spans we don't get from v1 OUTCOME_SPAN — the env edges hit
// some quiet outcomes (testosterone, dhea_s, nlr, insulin, uric_acid)
// that need their own ranges so the engine slope translation works.
export const ENV_OUTCOME_SPAN: Record<string, [number, number]> = {
  testosterone: [200, 1000],
  dhea_s: [80, 400],
  nlr: [0.5, 6],
  insulin: [2, 25],
  resting_hr: [40, 90],
  uric_acid: [3, 10],
}

// ─── InsightBayesian builder ────────────────────────────────────────
//
// Convert the spec into the same shape as participant.effects_bayesian
// so the v2 Insights view can merge them in. Tier defaults to 'possible'
// (we have a literature mechanism but no per-participant fit) and
// evidence_tier to 'cohort_level'.

function horizonDisplay(days: number): string {
  if (days <= 21) return `${days} days`
  if (days < 60) return `${Math.round(days / 7)} weeks`
  return `${Math.round(days / 30)} months`
}

export function buildEnvironmentalSyntheticEdges(): InsightBayesian[] {
  return ENVIRONMENTAL_EDGES.map((spec) => {
    const sd = 0.5
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
      unbounded_scaled_effect: spec.mean,
      scaled_effect: spec.mean,
      posterior: {
        mean: spec.mean,
        variance: sd * sd,
        sd,
        contraction: 0.5,
        prior_mean: spec.mean,
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

/** Quick predicate for telling environmental edges apart from
 *  participant-fitted edges (e.g. for tagging in the UI). */
export function isEnvironmentalEdge(e: InsightBayesian): boolean {
  return ENV_ACTION_SPAN[e.action] != null
}
