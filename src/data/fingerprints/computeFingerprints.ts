/**
 * Generic Fingerprint detector — runs over a `ParticipantPortal` to
 * produce a `FingerprintBundle` for any pseudonym pid.
 *
 * Caspian (pid 1) bypasses this and uses the hand-curated bundle in
 * `caspian.ts` — those findings depend on legacy lab data and behavioral
 * patterns that don't live in the generated portal JSON.
 *
 * The detectors here are intentionally simple and conservative. Each
 * one fires from a single participant-data signal and returns at most
 * one Fingerprint. Voice guardrails are followed for every claim
 * sentence — "Your data suggests…" / "appears to be…" / "is consistent
 * with…" — never identity overreach.
 */

import type { ParticipantPortal } from '@/data/portal/types'
import type { Fingerprint, FingerprintBundle } from './types'
import { caspianFingerprintBundle } from './caspian'
import { rajanFingerprintBundle } from './rajan'
import { sarahFingerprintBundle } from './sarah'
import { marcusFingerprintBundle } from './marcus'
import { emmaFingerprintBundle } from './emma'
import { POPULATION_BASELINES } from '@/data/scm/syntheticEdges'

/** Hand-curated bundles — the five named personas (pids 1-5) get
 *  bespoke Fingerprint sets that depend on legacy persona data not
 *  present in the generated portal JSON. Other pids fall through to
 *  the generic detector. */
const CURATED_BUNDLES: Record<number, FingerprintBundle> = {
  [caspianFingerprintBundle.participantPid]: caspianFingerprintBundle,
  [rajanFingerprintBundle.participantPid]: rajanFingerprintBundle,
  [sarahFingerprintBundle.participantPid]: sarahFingerprintBundle,
  [marcusFingerprintBundle.participantPid]: marcusFingerprintBundle,
  [emmaFingerprintBundle.participantPid]: emmaFingerprintBundle,
}

// ─── Detectors ────────────────────────────────────────────────────

/** Outliers — outcomes that sit far from POPULATION_BASELINES. */
function detectOutcomeOutliers(p: ParticipantPortal): Fingerprint[] {
  const out: Fingerprint[] = []
  const baselines = p.outcome_baselines ?? {}
  for (const [outcome, value] of Object.entries(baselines)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const reference = POPULATION_BASELINES[outcome]
    if (typeof reference !== 'number' || reference === 0) continue
    const ratio = value / reference
    if (ratio < 0.65 || ratio > 1.6) {
      const direction = ratio > 1 ? 'higher' : 'lower'
      out.push({
        id: `auto_outlier_${outcome}`,
        type: 'outlier',
        label: `${prettyOutcome(outcome)} runs ${direction} than typical`,
        claim: `${prettyOutcome(outcome)} sits at ${value.toFixed(1)} versus a population reference around ${reference.toFixed(1)} — ${(Math.abs(ratio - 1) * 100).toFixed(0)}% ${direction === 'higher' ? 'above' : 'below'}.`,
        evidence: {
          kind: 'compare_pair',
          self: value,
          cohort: reference,
          label: prettyOutcome(outcome),
        },
        comparison: 'population_baseline',
        strength: Math.abs(ratio - 1) > 0.4 ? 'strong' : 'moderate',
        confidence: 'med',
        stability: 'recurring',
        actionability: 'indirect',
        finding: 'unusual_baseline',
        implication: `Worth understanding what's keeping ${prettyOutcome(outcome)} at this level — could be an opportunity or a constraint.`,
        next_question: `Is the deviation persistent across draws, or is the latest value an outlier itself?`,
        links: { outcomes: [outcome] },
      })
    }
  }
  return out
}

/** Active regimes → sensitivity Fingerprints (paired with the real
 *  underlying load metric, so the chip reads "ACWR 1.6" not "100%"). */
function detectRegimeSensitivities(p: ParticipantPortal): Fingerprint[] {
  const out: Fingerprint[] = []
  const regimes = p.regime_activations ?? {}
  const loads = p.loads_today ?? {}
  for (const [key, activation] of Object.entries(regimes)) {
    if (typeof activation !== 'number' || activation < 0.5) continue
    const meta = REGIME_META[key]
    if (!meta) continue
    const loadValue = loads[meta.load_key]?.value
    out.push({
      id: `auto_regime_${key}`,
      type: 'sensitivity',
      label: meta.label,
      claim:
        loadValue != null
          ? `Currently sitting at ${meta.load_label} ${loadValue.toFixed(meta.decimals)} ${meta.load_unit} — above the personal threshold that triggers this regime.`
          : `Currently flagged as an active recovery regime affecting today's plan.`,
      evidence:
        loadValue != null
          ? {
              kind: 'compare_pair',
              self: loadValue,
              cohort: meta.cohort_typical,
              label: meta.load_label,
              unit: meta.load_unit,
            }
          : { kind: 'note', body: 'Regime activation without a single underlying load value.' },
      comparison: 'self_history',
      strength: activation > 0.85 ? 'strong' : 'moderate',
      confidence: 'high',
      stability: 'recently_changed',
      actionability: 'direct',
      finding: 'likely_driver',
      implication: meta.implication,
      next_question: meta.next_question,
      links: { outcomes: meta.linked_outcomes },
    })
  }
  return out
}

/** Variability — flag loads with unusually low or high coefficient of
 *  variation (CV) across their 14-day rolling history. Cohort norms
 *  are hand-tuned from the population; tighter loads = "stable
 *  baseline", wider loads = "high-variability responder". */
function detectLoadVariability(p: ParticipantPortal): Fingerprint[] {
  const out: Fingerprint[] = []
  const history = p.loads_history ?? {}
  for (const [key, spec] of Object.entries(VARIABILITY_TARGETS)) {
    const series = (history as Record<string, number[] | undefined>)[key]
    if (!Array.isArray(series) || series.length < 7) continue
    const clean = series.filter((v) => Number.isFinite(v))
    if (clean.length < 7) continue
    const mean = clean.reduce((s, v) => s + v, 0) / clean.length
    if (Math.abs(mean) < 1e-6) continue
    const variance =
      clean.reduce((s, v) => s + (v - mean) * (v - mean), 0) / clean.length
    const cv = Math.sqrt(variance) / Math.abs(mean)
    if (cv < spec.lowCv) {
      out.push({
        id: `auto_var_low_${key}`,
        type: 'variability',
        label: `${spec.label} unusually stable`,
        claim: `${spec.label} has held within a tight ±${(cv * 100).toFixed(0)}% band over the last 14 days — well below the cohort-typical ${(spec.cohortCv * 100).toFixed(0)}% range. ${spec.lowImplication}`,
        evidence: {
          kind: 'sparkline',
          values: clean,
          label: `${spec.label} (14d)`,
          unit: spec.unit,
        },
        comparison: 'cohort',
        strength: 'moderate',
        confidence: 'med',
        stability: 'stable',
        actionability: 'watch_only',
        finding: 'reliable_pattern',
        implication: spec.lowImplication,
        next_question: spec.next_question,
      })
    } else if (cv > spec.highCv) {
      out.push({
        id: `auto_var_high_${key}`,
        type: 'variability',
        label: `${spec.label} swings widely`,
        claim: `${spec.label} has varied ±${(cv * 100).toFixed(0)}% over the last 14 days — substantially wider than the cohort-typical ${(spec.cohortCv * 100).toFixed(0)}% band. ${spec.highImplication}`,
        evidence: {
          kind: 'sparkline',
          values: clean,
          label: `${spec.label} (14d)`,
          unit: spec.unit,
        },
        comparison: 'cohort',
        strength: 'moderate',
        confidence: 'med',
        stability: 'recurring',
        actionability: 'indirect',
        finding: 'reliable_pattern',
        implication: spec.highImplication,
        next_question: spec.next_question,
      })
    }
  }
  return out
}

/** Behavior — detect monotonic drift in a key load over the 14-day
 *  window. Rising sleep debt or rising ACWR is a "recently changed"
 *  behavioral fingerprint, not just a today-snapshot outlier. */
function detectLoadDrift(p: ParticipantPortal): Fingerprint[] {
  const out: Fingerprint[] = []
  const history = p.loads_history ?? {}
  for (const [key, spec] of Object.entries(DRIFT_TARGETS)) {
    const series = (history as Record<string, number[] | undefined>)[key]
    if (!Array.isArray(series) || series.length < 10) continue
    const clean = series.filter((v) => Number.isFinite(v))
    if (clean.length < 10) continue
    const firstHalfMean =
      clean.slice(0, Math.floor(clean.length / 2)).reduce((s, v) => s + v, 0) /
      Math.floor(clean.length / 2)
    const secondHalfMean =
      clean.slice(Math.ceil(clean.length / 2)).reduce((s, v) => s + v, 0) /
      Math.ceil(clean.length / 2)
    const delta = secondHalfMean - firstHalfMean
    if (Math.abs(delta) < spec.minDelta) continue
    const rising = delta > 0
    const concerning = rising === spec.risingIsBad
    out.push({
      id: `auto_drift_${key}_${rising ? 'rising' : 'falling'}`,
      type: 'behavior',
      label: `${spec.label} is ${rising ? 'rising' : 'falling'}`,
      claim: `${spec.label} ${rising ? 'rose' : 'fell'} from ~${firstHalfMean.toFixed(spec.decimals)} ${spec.unit} (week 1) to ~${secondHalfMean.toFixed(spec.decimals)} ${spec.unit} (week 2) — a ${concerning ? 'concerning' : 'positive'} 14-day trajectory.`,
      evidence: {
        kind: 'sparkline',
        values: clean,
        label: `${spec.label} (14d)`,
        unit: spec.unit,
      },
      comparison: 'self_history',
      strength: Math.abs(delta) > spec.minDelta * 1.5 ? 'strong' : 'moderate',
      confidence: 'high',
      stability: 'recently_changed',
      actionability: concerning ? 'direct' : 'watch_only',
      finding: 'reliable_pattern',
      implication: concerning
        ? spec.concerningImplication
        : spec.positiveImplication,
      next_question: spec.next_question,
      links: { data_streams: [key] },
    })
  }
  return out
}

/** Weather sensitivity — when 14-day weather data correlates strongly
 *  with sleep_debt or training-load shifts. */
function detectWeatherSensitivity(p: ParticipantPortal): Fingerprint[] {
  const out: Fingerprint[] = []
  const wHist = p.weather_history ?? {}
  const lHist = p.loads_history ?? {}
  const tempSeries = wHist.temp_c
  const sleepDebt = lHist.sleep_debt_14d
  if (
    Array.isArray(tempSeries) &&
    Array.isArray(sleepDebt) &&
    tempSeries.length === sleepDebt.length &&
    tempSeries.length >= 10
  ) {
    const r = pearsonR(tempSeries, sleepDebt)
    if (Math.abs(r) > 0.5) {
      const positive = r > 0
      out.push({
        id: 'auto_weather_temp_sleep',
        type: 'sensitivity',
        label: `Sleep debt tracks ${positive ? 'warmer' : 'cooler'} days`,
        claim: `Across the last 14 days, this member's sleep debt correlates with ambient temperature (r=${r.toFixed(2)}). ${positive ? 'Hotter' : 'Cooler'} days have been associated with worse sleep restoration — a contextual sensitivity worth watching as the season shifts.`,
        evidence: { kind: 'note', body: `Pearson r = ${r.toFixed(2)} between temp_c and sleep_debt_14d.` },
        comparison: 'self_history',
        strength: Math.abs(r) > 0.7 ? 'strong' : 'moderate',
        confidence: 'med',
        stability: 'seasonal',
        actionability: 'indirect',
        finding: 'open_question',
        implication: positive
          ? 'Heat appears to be costing recovery — bedroom climate control may be a higher-leverage intervention than current protocols suggest.'
          : 'Cold days may be costing recovery via reduced outdoor activity or cold-stress arousal during sleep.',
        next_question: positive
          ? 'Does the relationship hold below 24 °C, or only above a threshold?'
          : 'Does the relationship reflect cold itself, or shorter daylight?',
        links: { outcomes: ['sleep_efficiency'], data_streams: ['temp_c', 'sleep_debt_14d'] },
      })
    }
  }
  return out
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n === 0) return 0
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom > 0 ? num / denom : 0
}

interface VariabilitySpec {
  label: string
  unit: string
  /** CV below this = unusually stable. */
  lowCv: number
  /** CV above this = unusually variable. */
  highCv: number
  /** Cohort-typical CV — used for the comparison narrative. */
  cohortCv: number
  lowImplication: string
  highImplication: string
  next_question: string
}

const VARIABILITY_TARGETS: Record<string, VariabilitySpec> = {
  acwr: {
    label: 'Training load (ACWR)',
    unit: '',
    lowCv: 0.05,
    highCv: 0.25,
    cohortCv: 0.13,
    lowImplication:
      'Training periodization is unusually consistent. Recovery markers should respond predictably to changes.',
    highImplication:
      'Training load swings make it harder to attribute recovery shifts to single sessions. Cumulative load matters more than today\'s value.',
    next_question:
      'Does the variability cluster (3-day blocks of training, then off) or alternate?',
  },
  sleep_debt_14d: {
    label: 'Sleep debt',
    unit: 'h',
    lowCv: 0.10,
    highCv: 0.40,
    cohortCv: 0.22,
    lowImplication:
      'Sleep restoration sits in a tight personal envelope — protocols can rely on the sleep channel for recovery dosing.',
    highImplication:
      'Sleep restoration swings widely — recovery scoring should weight the trailing 7-day mean, not today\'s value.',
    next_question:
      'Are the bad nights random, or clustered around weekday/weekend transitions?',
  },
}

interface DriftSpec {
  label: string
  unit: string
  decimals: number
  /** Min absolute delta (week2 mean - week1 mean) to flag. */
  minDelta: number
  /** When true, rising = bad direction. */
  risingIsBad: boolean
  concerningImplication: string
  positiveImplication: string
  next_question: string
}

const DRIFT_TARGETS: Record<string, DriftSpec> = {
  sleep_debt_14d: {
    label: 'Sleep debt',
    unit: 'h',
    decimals: 1,
    minDelta: 1.0,
    risingIsBad: true,
    concerningImplication:
      'Sleep debt is accumulating without weekend recovery — bedtime drift, not single bad nights.',
    positiveImplication:
      'Sleep restoration is improving — keep the bedtime anchor in place; the trajectory is what you want.',
    next_question:
      'Does the trend hold for another 7 days, or reverse on the next regime shift?',
  },
  acwr: {
    label: 'ACWR (training load ratio)',
    unit: '',
    decimals: 2,
    minDelta: 0.15,
    risingIsBad: true,
    concerningImplication:
      'Acute training load is rising relative to chronic — overreaching risk window opening.',
    positiveImplication:
      'Training load is normalizing back toward 1.0 — recovery should follow within 5-10 days.',
    next_question:
      'Does the next planned recovery week land in time to reverse the trend?',
  },
}

/** Data-quality fingerprints — wearable coverage, lab cadence, etc. */
function detectDataQuality(p: ParticipantPortal): Fingerprint[] {
  const out: Fingerprint[] = []
  const fittedEdges = p.effects_bayesian.filter(
    (e) => e.evidence_tier !== 'cohort_level',
  ).length
  const totalEdges = p.effects_bayesian.length
  if (totalEdges === 0) return out
  const personalPct = (fittedEdges / totalEdges) * 100
  if (personalPct < 15) {
    out.push({
      id: 'auto_data_baseline_forming',
      type: 'data_gap',
      label: 'Baseline still forming',
      claim: `Only ${personalPct.toFixed(0)}% of edges have a personal posterior right now — most are leaning on cohort and literature priors. Personalization will sharpen as more weeks of data accumulate.`,
      evidence: {
        kind: 'compare_pair',
        self: personalPct,
        cohort: 35,
        label: 'Personalized edges',
        unit: '%',
      },
      comparison: 'cohort',
      strength: 'strong',
      confidence: 'high',
      stability: 'emerging',
      actionability: 'measurement_gap',
      finding: 'unusual_baseline',
      implication:
        'Insight-style recommendations should be read as cohort-typical, not person-specific, until exposure variation grows.',
      next_question:
        'Which streams (wearable, lab, lifestyle log) would most quickly cross the personalization threshold?',
    })
  }
  return out
}

// ─── Pretty-print + regime metadata ────────────────────────────────

function prettyOutcome(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\bhrv\b/g, 'HRV')
    .replace(/\bhscrp\b/g, 'hsCRP')
    .replace(/\brhr\b/g, 'RHR')
    .replace(/\bldl\b/g, 'LDL')
    .replace(/\bhdl\b/g, 'HDL')
    .replace(/\bapob\b/g, 'ApoB')
    .replace(/^\w/, (c) => c.toUpperCase())
}

interface RegimeMeta {
  label: string
  load_key: 'acwr' | 'sleep_debt_14d' | 'training_load'
  load_label: string
  load_unit: string
  decimals: number
  cohort_typical: number
  linked_outcomes: string[]
  implication: string
  next_question: string
}

const REGIME_META: Record<string, RegimeMeta> = {
  overreaching_state: {
    label: 'Acute training overload',
    load_key: 'acwr',
    load_label: 'ACWR',
    load_unit: '',
    decimals: 2,
    cohort_typical: 1.0,
    linked_outcomes: ['hrv_daily', 'resting_hr', 'sleep_efficiency'],
    implication:
      'Recent weeks have spiked relative to the trailing chronic load — recovery markers should be watched closely until ACWR returns toward 1.0.',
    next_question:
      'Does the spike resolve naturally with the next planned recovery week, or persist?',
  },
  sleep_deprivation_state: {
    label: 'Sleep debt above personal threshold',
    load_key: 'sleep_debt_14d',
    load_label: 'Sleep debt (14d)',
    load_unit: 'h',
    decimals: 1,
    cohort_typical: 2.0,
    linked_outcomes: ['hrv_daily', 'cortisol', 'glucose'],
    implication:
      'Sustained shortfall versus personal target — the autonomic and metabolic signals will carry the cost first.',
    next_question:
      'Is the debt accumulating from late bedtimes, early wakes, or fragmented nights?',
  },
}

// ─── Bundle assembly ──────────────────────────────────────────────

function modeFor(fingerprints: Fingerprint[]): FingerprintBundle['mode'] {
  const meaningful = fingerprints.filter(
    (f) => f.strength !== 'weak' && f.type !== 'data_gap',
  ).length
  if (meaningful >= 3) return 'rich'
  if (meaningful >= 1) return 'forming'
  return 'data_gap'
}

export function computeFingerprints(p: ParticipantPortal): FingerprintBundle {
  // Hand-curated bundle for the five named personas — these depend on
  // legacy persona data not present in the generated portal JSON.
  const curated = CURATED_BUNDLES[p.pid]
  if (curated) return curated

  const fingerprints: Fingerprint[] = [
    ...detectOutcomeOutliers(p),
    ...detectRegimeSensitivities(p),
    ...detectLoadVariability(p),
    ...detectLoadDrift(p),
    ...detectWeatherSensitivity(p),
    ...detectDataQuality(p),
  ]

  return {
    participantPid: p.pid,
    fingerprints,
    mode: modeFor(fingerprints),
  }
}
