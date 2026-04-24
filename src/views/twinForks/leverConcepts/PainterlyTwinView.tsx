/**
 * Painterly Twin — the chosen integration design pulled into its own page.
 *
 * Levers across the top, outcomes scattered along the bottom, watercolor
 * edges (stacked stroke layers + gaussian blur) flowing between them. A
 * regime toggle swaps the outcome layer + edge map between Quotidian
 * (wearable-class outcomes, day-scale) and Longevity (biomarkers,
 * weeks-to-months).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PageLayout } from '@/components/layout'
import { Loader2, RotateCcw } from 'lucide-react'
import {
  HR_THREE_BAND,
  ALCOHOL_SPEC,
  CAFFEINE_SPEC,
  SLEEP_SPEC,
  sleepDuration,
  quantizeBand,
} from './types'
import { trimpFor } from './HRDialVariants'
import { DecayCurveLever } from './ConsumableConcepts'
import { MinimalLine } from './SleepVariants'
import { cn } from '@/utils/classNames'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCM } from '@/hooks/useSCM'
import { PersonaPortrait } from '@/components/common'
import { buildObservedValues } from '@/views/twinForks/_shared'
import { outcomeStatesAt } from '@/views/twinForks/_graph'
import {
  CURATED_LONGEVITY_OUTCOMES,
  horizonBandFor,
} from '@/data/scm/outcomeHorizons'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import type { Intervention, StructuralEquation } from '@/data/scm/types'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import type { ParticipantPortal } from '@/data/portal/types'

// ─── Constants ─────────────────────────────────────────────────────

const BG = '#fefbf3'
const BORDER = '#f0e9d8'

const TONE_STROKE = {
  benefit: '#89CFF0', // baby blue
  harm: '#C76B4D', // cool terracotta
  neutral: '#B8AB94', // warm stone
} as const
const TONE_TEXT = {
  benefit: '#4A8AB5', // deeper baby blue
  harm: '#8B4830', // deeper terracotta
  neutral: '#847764', // deeper warm stone
} as const

type Tone = keyof typeof TONE_STROKE

// ─── Outcome model ────────────────────────────────────────────────

interface Outcome {
  id: string
  label: string
  baseline: number
  unit: string
  decimals: number
  /** Direction of benefit: 'higher' = up is good, 'lower' = down is good. */
  beneficial: 'higher' | 'lower'
  /** 10-20 word description shown on hover — why optimizing this matters. */
  description: string
}

// Today-band outcomes only — anything that can plausibly move within ~1 week
// of changing a routine. Per `outcomeHorizons.ts`, that's HRV (4d) and four
// sleep-architecture metrics (2-3d). Resting HR and VO₂ peak adapt over
// weeks/months and live in the Longevity regime instead.
// Outcome IDs the painterly view surfaces in each regime, by canonical key.
// Quotidian = today-band wearable outcomes (sleep_quality is suppressed as
// it's redundant with sleep_efficiency); Longevity = full curated set.
const QUOTIDIAN_OUTCOME_IDS = [
  'hrv_daily',
  'sleep_onset_latency',
  'deep_sleep',
  'rem_sleep',
  'sleep_efficiency',
] as const

const LONGEVITY_OUTCOME_IDS = [
  // Weeks band
  'cortisol', 'glucose', 'insulin', 'nlr', 'triglycerides', 'alt',
  'dhea_s', 'hscrp', 'testosterone', 'uric_acid',
  // Months band
  'ferritin', 'homocysteine', 'rdw', 'vo2_peak', 'hdl', 'apob',
  'body_fat_pct', 'hemoglobin', 'ldl', 'magnesium_rbc',
] as const

// Display label overrides — keep painterly's compact "REM"/"Sleep eff."
// instead of OUTCOME_META.noun where the canonical noun is too long.
const OUTCOME_LABEL_OVERRIDE: Record<string, string> = {
  hrv_daily: 'HRV',
  sleep_onset_latency: 'Sleep onset',
  deep_sleep: 'Deep sleep',
  rem_sleep: 'REM',
  sleep_efficiency: 'Sleep eff.',
  triglycerides: 'Triglycerides',
  body_fat_pct: 'Body fat',
  magnesium_rbc: 'Mg (RBC)',
  vo2_peak: 'VO₂ peak',
  uric_acid: 'Uric acid',
}

// 10-20 word descriptions — shown on hover; keyed by canonical outcome id.
const OUTCOME_DESCRIPTION: Record<string, string> = {
  hrv_daily:
    'Higher HRV reflects strong autonomic recovery and resilience to stress, signaling readiness to train and adapt.',
  sleep_onset_latency:
    'Falling asleep within ~20 minutes signals well-regulated sleep pressure and low pre-bed cognitive arousal.',
  deep_sleep:
    'Deep sleep drives growth hormone, immune function, and brain-waste clearance — essential for next-day recovery.',
  rem_sleep:
    'REM consolidates memory and processes emotion. Consistent REM supports learning, mood, and creative problem-solving.',
  sleep_efficiency:
    'Higher efficiency means more of your time in bed is restorative sleep, not fragmented wakefulness.',
  cortisol:
    'Lower morning cortisol indicates a calm HPA axis and reduced chronic-stress burden.',
  glucose:
    'Lower fasting glucose reflects insulin sensitivity and reduces diabetes and cardiovascular risk.',
  insulin:
    'Lower fasting insulin signals metabolic health and a lower long-term type-2 diabetes risk.',
  nlr:
    'A neutrophil-to-lymphocyte ratio under 2 reflects balanced immunity and low systemic inflammation.',
  triglycerides:
    'Lower triglycerides reduce cardiovascular risk and indicate good carbohydrate and alcohol handling.',
  alt:
    'Lower ALT indicates a healthier liver and reduced fatty-liver and metabolic-dysfunction risk.',
  dhea_s:
    'Higher DHEA-S supports hormonal balance, mood, immune function, and cognitive resilience with age.',
  hscrp:
    'Lower hsCRP means less chronic inflammation — a major driver of cardiovascular and metabolic disease.',
  testosterone:
    'Optimal testosterone supports muscle, mood, libido, and metabolic health across both sexes.',
  uric_acid:
    'Lower uric acid reduces gout, kidney-stone, and cardiovascular risk; high values flag metabolic stress.',
  ferritin:
    'Adequate ferritin reflects iron stores essential for oxygen transport, energy, and cognition.',
  homocysteine:
    'Lower homocysteine reduces cardiovascular and cognitive-decline risk; reflects B-vitamin status.',
  rdw:
    'Low red-cell distribution width indicates healthy erythropoiesis and predicts long-term survival.',
  vo2_peak:
    'Higher VO₂ peak is the single strongest fitness-related predictor of all-cause mortality and longevity.',
  hdl:
    'Higher HDL assists cholesterol clearance from arteries and lowers cardiovascular disease risk.',
  apob:
    'Lower ApoB (atherogenic particle count) is the most direct lipid driver of cardiovascular disease.',
  body_fat_pct:
    'Lower body fat improves insulin sensitivity, hormonal balance, and cardiovascular health.',
  hemoglobin:
    'Adequate hemoglobin sustains oxygen delivery to tissues; low values cause fatigue and cognitive impairment.',
  ldl:
    'Lower LDL reduces atherogenic burden and slows progression of cardiovascular disease.',
  magnesium_rbc:
    'Adequate red-cell magnesium supports cardiovascular rhythm, glucose control, and neuromuscular function.',
}

// Default decimals/units come from OUTCOME_META; some need a finer
// rendering than the canonical "0 decimals".
const OUTCOME_DECIMALS: Record<string, number> = {
  hrv_daily: 0,
  sleep_onset_latency: 0,
  deep_sleep: 0,
  rem_sleep: 0,
  sleep_efficiency: 0,
  cortisol: 1,
  glucose: 0,
  insulin: 1,
  nlr: 1,
  triglycerides: 0,
  alt: 0,
  dhea_s: 0,
  hscrp: 1,
  testosterone: 0,
  uric_acid: 1,
  ferritin: 0,
  homocysteine: 1,
  rdw: 1,
  vo2_peak: 1,
  hdl: 0,
  apob: 0,
  body_fat_pct: 1,
  hemoglobin: 1,
  ldl: 0,
  magnesium_rbc: 1,
}

// Build the regime's outcome list from real participant baselines + canonical
// metadata. Outcomes without a baseline are still surfaced (factual=null in
// the bubble), but in practice every curated outcome has a baseline.
function buildOutcomesForRegime(
  participant: ParticipantPortal | null,
  regime: 'quotidian' | 'longevity',
): Outcome[] {
  const ids: readonly string[] =
    regime === 'quotidian' ? QUOTIDIAN_OUTCOME_IDS : LONGEVITY_OUTCOME_IDS
  const baselines = participant?.outcome_baselines ?? {}
  return ids.map((id) => {
    const meta = OUTCOME_META[id]
    const beneficial: 'higher' | 'lower' =
      meta?.beneficial === 'lower' ? 'lower' : 'higher'
    return {
      id,
      label: OUTCOME_LABEL_OVERRIDE[id] ?? meta?.noun ?? id,
      baseline: typeof baselines[id] === 'number' ? (baselines[id] as number) : 0,
      unit: meta?.unit ?? '',
      decimals: OUTCOME_DECIMALS[id] ?? 0,
      beneficial,
      description: OUTCOME_DESCRIPTION[id] ?? '',
    }
  })
}

// Edges are now derived at render time from participant.effects_bayesian
// filtered by regime + active lever set. See `deriveEdgesForRegime` below.

// Full curated longevity set — all 20 from CURATED_LONGEVITY_OUTCOMES in
// `outcomeHorizons.ts`. Splits naturally into a weeks-band (top row) and
// months-band (bottom row) when rendered.
const LONGEVITY_OUTCOMES: Outcome[] = [
  // Weeks band (8-42d)
  {
    id: 'cortisol', label: 'Cortisol', baseline: 14, unit: 'µg/dL', decimals: 1, beneficial: 'lower',
    description: 'Lower morning cortisol indicates a calm HPA axis and reduced chronic-stress burden.',
  },
  {
    id: 'glucose', label: 'Glucose', baseline: 92, unit: 'mg/dL', decimals: 0, beneficial: 'lower',
    description: 'Lower fasting glucose reflects insulin sensitivity and reduces diabetes and cardiovascular risk.',
  },
  {
    id: 'insulin', label: 'Insulin', baseline: 9, unit: 'µIU/mL', decimals: 1, beneficial: 'lower',
    description: 'Lower fasting insulin signals metabolic health and a lower long-term type-2 diabetes risk.',
  },
  {
    id: 'nlr', label: 'NLR', baseline: 2.1, unit: '', decimals: 1, beneficial: 'lower',
    description: 'A neutrophil-to-lymphocyte ratio under 2 reflects balanced immunity and low systemic inflammation.',
  },
  {
    id: 'trigs', label: 'Triglycerides', baseline: 110, unit: 'mg/dL', decimals: 0, beneficial: 'lower',
    description: 'Lower triglycerides reduce cardiovascular risk and indicate good carbohydrate and alcohol handling.',
  },
  {
    id: 'alt', label: 'ALT', baseline: 22, unit: 'U/L', decimals: 0, beneficial: 'lower',
    description: 'Lower ALT indicates a healthier liver and reduced fatty-liver and metabolic-dysfunction risk.',
  },
  {
    id: 'dhea_s', label: 'DHEA-S', baseline: 220, unit: 'µg/dL', decimals: 0, beneficial: 'higher',
    description: 'Higher DHEA-S supports hormonal balance, mood, immune function, and cognitive resilience with age.',
  },
  {
    id: 'hscrp', label: 'hsCRP', baseline: 1.4, unit: 'mg/L', decimals: 1, beneficial: 'lower',
    description: 'Lower hsCRP means less chronic inflammation — a major driver of cardiovascular and metabolic disease.',
  },
  {
    id: 'testosterone', label: 'Testosterone', baseline: 580, unit: 'ng/dL', decimals: 0, beneficial: 'higher',
    description: 'Optimal testosterone supports muscle, mood, libido, and metabolic health across both sexes.',
  },
  {
    id: 'uric_acid', label: 'Uric acid', baseline: 5.4, unit: 'mg/dL', decimals: 1, beneficial: 'lower',
    description: 'Lower uric acid reduces gout, kidney-stone, and cardiovascular risk; high values flag metabolic stress.',
  },
  // Months band (≥43d)
  {
    id: 'ferritin', label: 'Ferritin', baseline: 145, unit: 'ng/mL', decimals: 0, beneficial: 'higher',
    description: 'Adequate ferritin reflects iron stores essential for oxygen transport, energy, and cognition.',
  },
  {
    id: 'homocysteine', label: 'Homocysteine', baseline: 9.5, unit: 'µmol/L', decimals: 1, beneficial: 'lower',
    description: 'Lower homocysteine reduces cardiovascular and cognitive-decline risk; reflects B-vitamin status.',
  },
  {
    id: 'rdw', label: 'RDW', baseline: 13.2, unit: '%', decimals: 1, beneficial: 'lower',
    description: 'Low red-cell distribution width indicates healthy erythropoiesis and predicts long-term survival.',
  },
  {
    id: 'vo2_peak', label: 'VO₂ peak', baseline: 42, unit: 'ml/kg', decimals: 1, beneficial: 'higher',
    description: 'Higher VO₂ peak is the single strongest fitness-related predictor of all-cause mortality and longevity.',
  },
  {
    id: 'hdl', label: 'HDL', baseline: 52, unit: 'mg/dL', decimals: 0, beneficial: 'higher',
    description: 'Higher HDL assists cholesterol clearance from arteries and lowers cardiovascular disease risk.',
  },
  {
    id: 'apob', label: 'ApoB', baseline: 95, unit: 'mg/dL', decimals: 0, beneficial: 'lower',
    description: 'Lower ApoB (atherogenic particle count) is the most direct lipid driver of cardiovascular disease.',
  },
  {
    id: 'body_fat_pct', label: 'Body fat', baseline: 22, unit: '%', decimals: 1, beneficial: 'lower',
    description: 'Lower body fat improves insulin sensitivity, hormonal balance, and cardiovascular health.',
  },
  {
    id: 'hemoglobin', label: 'Hemoglobin', baseline: 14.5, unit: 'g/dL', decimals: 1, beneficial: 'higher',
    description: 'Adequate hemoglobin sustains oxygen delivery to tissues; low values cause fatigue and cognitive impairment.',
  },
  {
    id: 'ldl', label: 'LDL', baseline: 120, unit: 'mg/dL', decimals: 0, beneficial: 'lower',
    description: 'Lower LDL reduces atherogenic burden and slows progression of cardiovascular disease.',
  },
  {
    id: 'magnesium_rbc', label: 'Mg (RBC)', baseline: 5.2, unit: 'mg/dL', decimals: 1, beneficial: 'higher',
    description: 'Adequate red-cell magnesium supports cardiovascular rhythm, glucose control, and neuromuscular function.',
  },
]

// Longevity-relevant levers only — cardio/HR, daily steps (NEAT), diet,
// and sleep. Caffeine and alcohol are quotidian-class lifestyle factors;
// they're omitted here even though they have small longevity effects.
// (Longevity edges derived dynamically from real data — see below.)

// ─── State ────────────────────────────────────────────────────────

type Regime = 'quotidian' | 'longevity'
type LeverId = 'hr' | 'caffeine' | 'alcohol' | 'diet' | 'sleep'

// Quotidian = 1-week horizon, so diet effects haven't accrued yet —
// drop the diet lever from quotidian and surface it only in longevity.
// Steps is also dropped from longevity — Zone 1 in the Activity dial
// already covers daily-movement intensity.
const QUOTIDIAN_LEVERS: LeverId[] = ['hr', 'caffeine', 'alcohol', 'sleep']
const LONGEVITY_LEVERS: LeverId[] = ['hr', 'diet', 'sleep']

interface AllState {
  hrValues: [number, number, number]
  caffeine: { amount: number; cutoff: number }
  alcohol: { amount: number; cutoff: number }
  /** bedtime + wake drive the Quotidian sleep widget; hours + quality
   *  drive the Longevity sleep widget. Both pairs are tracked so the
   *  user can switch regimes without losing state. */
  sleep: {
    bedtime: number
    wake: number
    hours: number
    quality: number
  }
  diet: { proteinG: number; totalKcal: number }
}

const DIET_DEFAULT_PROTEIN_G = 100
const DIET_DEFAULT_TOTAL_KCAL = 2500
const STEPS_DEFAULT = 8000
const STEPS_MIN = 0
const STEPS_MAX = 15000
const STEPS_STEP = 500

const SLEEP_HOURS_DEFAULT = 8
const SLEEP_QUALITY_DEFAULT = 80

function defaultState(): AllState {
  return {
    hrValues: [
      HR_THREE_BAND.bands[0].default,
      HR_THREE_BAND.bands[1].default,
      HR_THREE_BAND.bands[2].default,
    ],
    caffeine: {
      amount: CAFFEINE_SPEC.amount.default,
      cutoff: CAFFEINE_SPEC.cutoff.default,
    },
    alcohol: {
      amount: ALCOHOL_SPEC.amount.default,
      cutoff: ALCOHOL_SPEC.cutoff.default,
    },
    sleep: {
      bedtime: SLEEP_SPEC.xAxis.default,
      wake: SLEEP_SPEC.yAxis.default,
      hours: SLEEP_HOURS_DEFAULT,
      quality: SLEEP_QUALITY_DEFAULT,
    },
    diet: { proteinG: DIET_DEFAULT_PROTEIN_G, totalKcal: DIET_DEFAULT_TOTAL_KCAL },
  }
}

interface Contributions {
  hr: number
  caffeine: number
  alcohol: number
  sleep: number
  diet: number
}

interface OutcomeWithDelta extends Outcome {
  delta: number
  tone: Tone
  /** Per-lever contributions to this outcome's delta. Edge tones use
   *  these so dragging one lever only re-tones its own outgoing edges. */
  contributions: Contributions
}

function toneFor(out: Outcome, delta: number): Tone {
  const eps = Math.pow(10, -out.decimals - 1)
  if (Math.abs(delta) <= eps) return 'neutral'
  const improved = out.beneficial === 'higher' ? delta > 0 : delta < 0
  return improved ? 'benefit' : 'harm'
}

function buildOutcome(out: Outcome, c: Contributions): OutcomeWithDelta {
  const delta = c.hr + c.caffeine + c.alcohol + c.sleep + c.diet
  return { ...out, delta, tone: toneFor(out, delta), contributions: c }
}

function emptyContributions(): Contributions {
  return { hr: 0, caffeine: 0, alcohol: 0, sleep: 0, diet: 0 }
}

// ─── Lever → canonical action translation ────────────────────────────
//
// Each painterly lever maps to one or more canonical action IDs the SCM
// engine knows about (real Bayesian fits + literature-backed synthetic
// edges in `useSCM`). The values are converted to the units the engine
// expects.
//
// Known gap: the longevity Sleep widget exposes hours + quality, but
// there is no canonical `sleep_quality` action. We fold quality into
// effective sleep_duration here (hours × quality / 100). If you want
// quality as a true independent driver, add synthetic `sleep_quality`
// edges in syntheticEdges.ts and surface as a second action below.

interface LeverActionMapping {
  /** Canonical action node IDs this lever influences. */
  actions: string[]
  /** Compute the values to set for those actions given lever state. */
  valuesFor(state: AllState, regime: Regime): Record<string, number>
}

const LEVER_ACTIONS: Record<LeverId, LeverActionMapping> = {
  hr: {
    // Engine action IDs: the cohort export uses `zone2_volume` (hours)
    // but has no fitted edges for it; the literature-backed synthetic
    // equations (Helgerud, Plews, Kodama, Seiler) all key on
    // `zone2_minutes`. We use `zone2_minutes` so the engine actually
    // responds to Z2-3 changes.
    actions: ['steps', 'zone2_minutes', 'zone4_5_minutes'],
    valuesFor: (s) => ({
      // Z1 minutes/day → step count: ~100 steps per minute of light walking.
      steps: s.hrValues[0] * 100,
      // Z2-3 minutes/day passes through directly.
      zone2_minutes: s.hrValues[1],
      // Z4-5 minutes/day passes through directly.
      zone4_5_minutes: s.hrValues[2],
    }),
  },
  caffeine: {
    actions: ['caffeine_mg', 'caffeine_timing'],
    valuesFor: (s) => {
      // Lever stores cups/day; engine wants mg. ~95 mg per cup of brewed coffee.
      const mg = s.caffeine.amount * 95
      // Timing is meaningless when there's no consumption — abstaining
      // for the day means the cutoff has nothing to gate. Drop the
      // timing intervention so the engine only sees the dose change.
      return mg > 0
        ? { caffeine_mg: mg, caffeine_timing: s.caffeine.cutoff }
        : { caffeine_mg: 0 }
    },
  },
  alcohol: {
    actions: ['alcohol_units', 'alcohol_timing'],
    valuesFor: (s) => {
      const units = s.alcohol.amount
      return units > 0
        ? { alcohol_units: units, alcohol_timing: s.alcohol.cutoff }
        : { alcohol_units: 0 }
    },
  },
  diet: {
    actions: ['dietary_protein', 'dietary_energy'],
    valuesFor: (s) => ({
      dietary_protein: s.diet.proteinG,
      dietary_energy: s.diet.totalKcal,
    }),
  },
  sleep: {
    actions: ['bedtime', 'sleep_duration'],
    valuesFor: (s, regime) =>
      regime === 'longevity'
        ? {
            // Longevity: combine hours × quality into effective duration.
            sleep_duration: (s.sleep.hours * s.sleep.quality) / 100,
            // Bedtime not relevant in longevity — leave at baseline.
            bedtime: 22.5,
          }
        : {
            bedtime: s.sleep.bedtime,
            // Quotidian: derive duration from bedtime/wake.
            sleep_duration: sleepDuration(s.sleep.bedtime, s.sleep.wake),
          },
  },
}

const ALL_CANONICAL_ACTIONS: string[] = Array.from(
  new Set(Object.values(LEVER_ACTIONS).flatMap((m) => m.actions)),
)

/** Build the engine intervention list for a single lever (for per-lever
 *  attribution) or the full set (for the combined state). Only includes
 *  actions whose value differs from the participant's baseline. */
function buildInterventionsFor(
  state: AllState,
  regime: Regime,
  observedBaseline: Record<string, number>,
  leverIds: LeverId[],
): Intervention[] {
  const out: Intervention[] = []
  for (const leverId of leverIds) {
    const mapping = LEVER_ACTIONS[leverId]
    const values = mapping.valuesFor(state, regime)
    for (const action of mapping.actions) {
      const newValue = values[action]
      if (newValue == null) continue
      const baselineVal = observedBaseline[action]
      if (baselineVal == null || !Number.isFinite(baselineVal)) continue
      if (Math.abs(newValue - baselineVal) > 1e-6) {
        out.push({ nodeId: action, value: newValue, originalValue: baselineVal })
      }
    }
  }
  return out
}

/** Build the regime-specific edge list from the engine's structural
 *  equations — the SAME equations runFullCounterfactual will use. Edges
 *  that wouldn't move an outcome are omitted; edges that DO move an
 *  outcome are guaranteed to be drawn. */
function deriveEdgesFromEquations(
  equations: StructuralEquation[],
  leverSet: LeverId[],
  outcomeIdSet: Set<string>,
): Array<[LeverId, string]> {
  const actionToLever: Record<string, LeverId> = {}
  for (const leverId of leverSet) {
    for (const action of LEVER_ACTIONS[leverId].actions) {
      actionToLever[action] = leverId
    }
  }
  const seen = new Set<string>()
  const out: Array<[LeverId, string]> = []
  for (const eq of equations) {
    const leverId = actionToLever[eq.source]
    if (!leverId) continue
    const outcomeKey = canonicalOutcomeKey(eq.target)
    if (!outcomeIdSet.has(outcomeKey)) continue
    // Skip equations with no slope on either side of the threshold.
    if (Math.abs(eq.ba) < 1e-9 && Math.abs(eq.bb) < 1e-9) continue
    const key = `${leverId}|${outcomeKey}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push([leverId, outcomeKey])
  }
  return out
}

/** Engine-driven outcome compute: replaces the hand-coded coefficient
 *  functions. Runs the full counterfactual once for the combined state,
 *  then once per active lever (with only that lever's interventions) to
 *  recover per-lever attribution for edge tones. */
function computeOutcomesFromEngine(
  outcomes: Outcome[],
  state: AllState,
  regime: Regime,
  leverSet: LeverId[],
  observedBaseline: Record<string, number>,
  outcomeBaselines: Record<string, number>,
  atDays: number,
  runFullCounterfactual: (
    obs: Record<string, number>,
    interventions: Intervention[],
  ) => FullCounterfactualState,
): OutcomeWithDelta[] {
  const outcomeIdSet = new Set(outcomes.map((o) => o.id))

  // Combined state — all lever interventions in one engine call.
  const combinedInterventions = buildInterventionsFor(
    state,
    regime,
    observedBaseline,
    leverSet,
  )
  const combinedState =
    combinedInterventions.length > 0
      ? runFullCounterfactual(observedBaseline, combinedInterventions)
      : ({ allEffects: new Map() } as unknown as FullCounterfactualState)
  const combinedStates = outcomeStatesAt(
    combinedState,
    atDays,
    outcomeIdSet,
    outcomeBaselines,
  )

  // Per-lever states for attribution.
  const perLeverStates = new Map<LeverId, ReturnType<typeof outcomeStatesAt>>()
  for (const leverId of leverSet) {
    const justThis = buildInterventionsFor(state, regime, observedBaseline, [leverId])
    if (justThis.length === 0) {
      perLeverStates.set(leverId, new Map())
      continue
    }
    const s = runFullCounterfactual(observedBaseline, justThis)
    perLeverStates.set(
      leverId,
      outcomeStatesAt(s, atDays, outcomeIdSet, outcomeBaselines),
    )
  }

  return outcomes.map((out): OutcomeWithDelta => {
    const combined = combinedStates.get(out.id)
    const factual = combined?.factual ?? out.baseline
    const after = combined?.after ?? out.baseline
    const delta = combined?.delta ?? 0

    const c: Contributions = emptyContributions()
    for (const leverId of leverSet) {
      const perLever = perLeverStates.get(leverId)?.get(out.id)
      c[leverId] = perLever?.delta ?? 0
    }
    return {
      ...out,
      baseline: factual,
      delta,
      tone: toneFor(out, delta),
      contributions: c,
      // attach the engine-resolved "after" so the bubble can show it
      // (we override via baseline + delta below)
    } as OutcomeWithDelta & { factual?: number; after?: number }
  })
}

// (computeQuotidian and computeLongevity removed — outcomes now flow from
//  computeOutcomesFromEngine.)

function fmt(value: number, decimals = 0): string {
  return value.toFixed(decimals)
}
function signed(value: number, decimals = 0): string {
  if (Math.abs(value) < Math.pow(10, -decimals - 1)) return '—'
  const s = value > 0 ? '+' : '−'
  return `${s}${fmt(Math.abs(value), decimals)}`
}

// ─── Compact HR dial (no legend) ──────────────────────────────────

const SWEEP_START = 135
const SWEEP_RANGE = 270
const SWEEP_END = SWEEP_START + SWEEP_RANGE

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function arcPath(
  cx: number,
  cy: number,
  r: number,
  fromDeg: number,
  toDeg: number,
): string {
  const from = polar(cx, cy, r, fromDeg)
  const to = polar(cx, cy, r, toDeg)
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0
  const sweep = toDeg > fromDeg ? 1 : 0
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
}
function angleFromPointer(
  px: number,
  py: number,
  rect: DOMRect,
  cx: number,
  cy: number,
) {
  const dx = px - rect.left - cx
  const dy = py - rect.top - cy
  const radius = Math.sqrt(dx * dx + dy * dy)
  let raw = (Math.atan2(dy, dx) * 180) / Math.PI
  if (raw < 0) raw += 360
  let unwrapped: number
  if (raw >= SWEEP_START) unwrapped = raw
  else if (raw <= SWEEP_END - 360) unwrapped = raw + 360
  else {
    const distToStart = SWEEP_START - raw
    const distToEnd = raw - (SWEEP_END - 360)
    unwrapped = distToStart < distToEnd ? SWEEP_START : SWEEP_END
  }
  const frac = Math.max(0, Math.min(1, (unwrapped - SWEEP_START) / SWEEP_RANGE))
  return { frac, radius }
}

interface CompactHRDialProps {
  values: [number, number, number]
  onChange: (next: [number, number, number]) => void
  size?: number
}

/** Height (px) added below the dial for the per-zone legend. The
 *  PainterlyCanvas anchor calculation uses HR_LEGEND_H so edges still
 *  flow from below the legend rather than crossing through it. */
const HR_LEGEND_H = 36

function CompactHRDial({ values, onChange, size = 180 }: CompactHRDialProps) {
  const cx = size / 2
  const cy = size / 2
  const radii = [size * 0.42, size * 0.32, size * 0.22]
  const arcW = Math.max(7, size * 0.045)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<0 | 1 | 2 | null>(null)
  const trimp = trimpFor(values)

  const updateBand = useCallback(
    (idx: 0 | 1 | 2, frac: number) => {
      const band = HR_THREE_BAND.bands[idx]
      const raw = band.min + frac * (band.max - band.min)
      const next: [number, number, number] = [...values]
      next[idx] = quantizeBand(raw, band)
      onChange(next)
    },
    [values, onChange],
  )

  return (
    <div style={{ width: size }}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        onPointerDown={(e) => {
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const { radius, frac } = angleFromPointer(e.clientX, e.clientY, rect, cx, cy)
          const midpoints = [(radii[0] + radii[1]) / 2, (radii[1] + radii[2]) / 2]
          let target: 0 | 1 | 2 = 2
          if (radius >= midpoints[0]) target = 0
          else if (radius >= midpoints[1]) target = 1
          setDragging(target)
          ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
          updateBand(target, frac)
        }}
        onPointerMove={(e) => {
          if (dragging == null || !svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          const { frac } = angleFromPointer(e.clientX, e.clientY, rect, cx, cy)
          updateBand(dragging, frac)
        }}
        onPointerUp={(e) => {
          setDragging(null)
          ;(e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId)
        }}
        style={{
          cursor: dragging != null ? 'grabbing' : 'pointer',
          touchAction: 'none',
          display: 'block',
        }}
      >
        {HR_THREE_BAND.bands.map((band, idx) => {
          const r = radii[idx]
          const valueFrac = (values[idx] - band.min) / (band.max - band.min)
          const handleAngle = SWEEP_START + valueFrac * SWEEP_RANGE
          const hp = polar(cx, cy, r, handleAngle)
          return (
            <g key={band.id}>
              <path
                d={arcPath(cx, cy, r, SWEEP_START, SWEEP_END)}
                fill="none"
                stroke="#f5efe2"
                strokeWidth={arcW}
                strokeLinecap="round"
              />
              <path
                d={arcPath(cx, cy, r, SWEEP_START, handleAngle)}
                fill="none"
                stroke={band.color}
                strokeWidth={arcW}
                strokeLinecap="round"
              />
              <circle
                cx={hp.x}
                cy={hp.y}
                r={Math.max(4, size * 0.028)}
                fill="#fff"
                stroke={band.color}
                strokeWidth={2}
              />
            </g>
          )
        })}
        <text
          x={cx}
          y={cy + size * 0.025}
          textAnchor="middle"
          fontSize={size * 0.18}
          fontWeight={200}
          fill="#1c1917"
          style={{
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '-0.04em',
          }}
        >
          {trimp}
        </text>
        <text
          x={cx}
          y={cy + size * 0.115}
          textAnchor="middle"
          fontSize={size * 0.06}
          fill="#78716c"
          style={{
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          TRIMP
        </text>
      </svg>
      {/* Per-zone legend — name + minutes/day in the band's color */}
      <div
        className="grid grid-cols-3 gap-1 mt-1"
        style={{ height: HR_LEGEND_H }}
      >
        {HR_THREE_BAND.bands.map((band, idx) => (
          <div key={band.id} className="flex flex-col items-center justify-center">
            <span
              style={{
                fontSize: 10,
                color: '#78716c',
                fontFamily: 'Inter, sans-serif',
                lineHeight: 1.1,
              }}
            >
              {band.label}
            </span>
            <span
              style={{
                fontSize: 15,
                color: band.color,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
              }}
            >
              {Math.round(values[idx])}
              <span
                style={{
                  fontSize: 9,
                  color: '#a8a29e',
                  fontWeight: 400,
                  marginLeft: 2,
                }}
              >
                min
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Diet lever ───────────────────────────────────────────────────
//
// Bar-within-a-bar: outer fill = total energy, inner segment = protein.
//
//   ├──── protein ────┤── carbs + fat ──┤·······unused·······│
//   ↑                 ↑                  ↑                    ↑
//   0                 protein handle    total handle         max kcal
//
// Two grab handles: drag the inner divider to reallocate protein within
// the consumed energy; drag the right edge to grow/shrink total energy.

const DIET_W = 320
const DIET_BAR_H = 38
const DIET_BAR_PAD_X = 8
const DIET_BAR_INNER_W = DIET_W - DIET_BAR_PAD_X * 2

const DIET_TOTAL_KCAL_MIN = 1500
const DIET_TOTAL_KCAL_MAX = 3500
const DIET_TOTAL_KCAL_STEP = 100
const DIET_PROTEIN_G_MAX = 200
const DIET_PROTEIN_G_STEP = 5
const PROTEIN_KCAL_PER_G = 4

const DIET_TRACK_BG = '#f0e9d8'
const DIET_TOTAL_FILL = '#C9B187' // warm tan
const DIET_PROTEIN_FILL = '#8B6F2C' // deep ochre

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
function quantize(v: number, step: number, lo: number, hi: number) {
  return clamp(Math.round(v / step) * step, lo, hi)
}

function DietLever({
  proteinG,
  totalKcal,
  onChange,
}: {
  proteinG: number
  totalKcal: number
  onChange: (proteinG: number, totalKcal: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState<'protein' | 'total' | null>(null)

  const totalFrac = clamp(
    (totalKcal - DIET_TOTAL_KCAL_MIN) / (DIET_TOTAL_KCAL_MAX - DIET_TOTAL_KCAL_MIN),
    0,
    1,
  )
  const totalPx = totalFrac * DIET_BAR_INNER_W
  const proteinKcal = proteinG * PROTEIN_KCAL_PER_G
  const proteinFracOfTotal = totalKcal > 0 ? clamp(proteinKcal / totalKcal, 0, 1) : 0
  const proteinPx = proteinFracOfTotal * totalPx

  const apply = useCallback(
    (x: number, mode: 'protein' | 'total') => {
      const xClamped = clamp(x, 0, DIET_BAR_INNER_W)
      if (mode === 'total') {
        const frac = xClamped / DIET_BAR_INNER_W
        const newTotal = quantize(
          DIET_TOTAL_KCAL_MIN + frac * (DIET_TOTAL_KCAL_MAX - DIET_TOTAL_KCAL_MIN),
          DIET_TOTAL_KCAL_STEP,
          DIET_TOTAL_KCAL_MIN,
          DIET_TOTAL_KCAL_MAX,
        )
        // Don't let the protein segment exceed the new total.
        const cappedProteinKcal = Math.min(proteinG * PROTEIN_KCAL_PER_G, newTotal)
        const cappedProteinG = quantize(
          cappedProteinKcal / PROTEIN_KCAL_PER_G,
          DIET_PROTEIN_G_STEP,
          0,
          DIET_PROTEIN_G_MAX,
        )
        onChange(cappedProteinG, newTotal)
      } else {
        if (totalPx <= 0) return
        const protFracOfTotal = clamp(xClamped / totalPx, 0, 1)
        const newProteinKcal = protFracOfTotal * totalKcal
        const newProteinG = quantize(
          newProteinKcal / PROTEIN_KCAL_PER_G,
          DIET_PROTEIN_G_STEP,
          0,
          DIET_PROTEIN_G_MAX,
        )
        onChange(newProteinG, totalKcal)
      }
    },
    [onChange, proteinG, totalKcal, totalPx],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left - DIET_BAR_PAD_X
    // Choose handle by closer proximity, with a slight preference for the
    // protein divider so it doesn't get swallowed by the total handle.
    const target: 'protein' | 'total' =
      Math.abs(x - proteinPx) - 4 < Math.abs(x - totalPx) ? 'protein' : 'total'
    setDragging(target)
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    apply(x, target)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left - DIET_BAR_PAD_X
    apply(x, dragging)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(null)
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
  }

  const restKcal = totalKcal - proteinKcal

  return (
    <div className="select-none" style={{ width: DIET_W }}>
      {/* Internal readout */}
      <div className="flex items-baseline justify-end mb-3" style={{ width: DIET_W }}>
        <span
          className="text-[15px] text-stone-700"
          style={{
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {proteinG}g protein, {totalKcal.toLocaleString()} kcal
        </span>
      </div>

      {/* Bar */}
      <div
        ref={ref}
        className="relative touch-none"
        style={{
          width: DIET_W,
          height: DIET_BAR_H,
          cursor: dragging ? 'grabbing' : 'pointer',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Track background */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: DIET_BAR_PAD_X,
            top: 0,
            width: DIET_BAR_INNER_W,
            height: DIET_BAR_H,
            background: DIET_TRACK_BG,
            borderRadius: 5,
          }}
        />
        {/* Filled total */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: DIET_BAR_PAD_X,
            top: 0,
            width: totalPx,
            height: DIET_BAR_H,
            background: DIET_TOTAL_FILL,
            borderRadius: 5,
          }}
        />
        {/* Protein segment */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: DIET_BAR_PAD_X,
            top: 0,
            width: proteinPx,
            height: DIET_BAR_H,
            background: DIET_PROTEIN_FILL,
            borderTopLeftRadius: 5,
            borderBottomLeftRadius: 5,
            borderTopRightRadius: proteinPx >= totalPx ? 5 : 0,
            borderBottomRightRadius: proteinPx >= totalPx ? 5 : 0,
          }}
        />
        {/* Inner labels — protein number is shown in the header above; only
            label the rest-of-energy segment in-line. */}
        {totalPx - proteinPx > 60 && (
          <span
            className="absolute pointer-events-none"
            style={{
              left: DIET_BAR_PAD_X + proteinPx + 8,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10,
              color: '#fff',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 500,
              letterSpacing: '0.02em',
              opacity: 0.95,
            }}
          >
            {restKcal.toLocaleString()} kcal
          </span>
        )}

        {/* Protein divider handle */}
        <div
          className="absolute"
          style={{
            left: DIET_BAR_PAD_X + proteinPx - 3,
            top: -3,
            width: 6,
            height: DIET_BAR_H + 6,
            background: '#fff',
            border: `1.5px solid ${DIET_PROTEIN_FILL}`,
            borderRadius: 3,
            cursor: 'ew-resize',
            pointerEvents: 'none',
          }}
        />
        {/* Total right-edge handle */}
        <div
          className="absolute"
          style={{
            left: DIET_BAR_PAD_X + totalPx - 3,
            top: -3,
            width: 6,
            height: DIET_BAR_H + 6,
            background: '#fff',
            border: `1.5px solid #8B6F2C`,
            borderRadius: 3,
            cursor: 'ew-resize',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Axis */}
      <div
        className="flex justify-between mt-1.5"
        style={{
          marginLeft: DIET_BAR_PAD_X,
          marginRight: DIET_BAR_PAD_X,
          fontSize: 10,
          color: '#a8a29e',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <span>{DIET_TOTAL_KCAL_MIN.toLocaleString()}</span>
        <span>{DIET_TOTAL_KCAL_MAX.toLocaleString()} kcal/day</span>
      </div>
    </div>
  )
}

// ─── Basic slider — used by longevity-only levers (steps for now). ──
//
// Placeholder UX while the longevity-specific widgets get their own
// painterly redesign. Visual language matches Diet (warm tan track,
// pill handle) so it doesn't look out of place.

const STEPS_BAR_W = 320
const STEPS_BAR_H = 38
const STEPS_BAR_PAD_X = 8
const STEPS_BAR_INNER_W = STEPS_BAR_W - STEPS_BAR_PAD_X * 2
const STEPS_TRACK_BG = '#f0e9d8'
const STEPS_FILL = '#9CAE7B' // sage green for movement

function StepsLever({
  steps,
  onChange,
}: {
  steps: number
  onChange: (steps: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const valueFrac = clamp((steps - STEPS_MIN) / (STEPS_MAX - STEPS_MIN), 0, 1)
  const valuePx = valueFrac * STEPS_BAR_INNER_W

  const apply = useCallback(
    (x: number) => {
      const xClamped = clamp(x, 0, STEPS_BAR_INNER_W)
      const frac = xClamped / STEPS_BAR_INNER_W
      const newValue = quantize(
        STEPS_MIN + frac * (STEPS_MAX - STEPS_MIN),
        STEPS_STEP,
        STEPS_MIN,
        STEPS_MAX,
      )
      onChange(newValue)
    },
    [onChange],
  )

  return (
    <div className="select-none" style={{ width: STEPS_BAR_W }}>
      <div className="flex items-baseline justify-end mb-3" style={{ width: STEPS_BAR_W }}>
        <span
          className="text-[13px] text-stone-500"
          style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
        >
          {steps.toLocaleString()} steps
        </span>
      </div>
      <div
        ref={ref}
        className="relative touch-none"
        style={{
          width: STEPS_BAR_W,
          height: STEPS_BAR_H,
          cursor: dragging ? 'grabbing' : 'pointer',
        }}
        onPointerDown={(e) => {
          if (!ref.current) return
          const rect = ref.current.getBoundingClientRect()
          setDragging(true)
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          apply(e.clientX - rect.left - STEPS_BAR_PAD_X)
        }}
        onPointerMove={(e) => {
          if (!dragging || !ref.current) return
          const rect = ref.current.getBoundingClientRect()
          apply(e.clientX - rect.left - STEPS_BAR_PAD_X)
        }}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            left: STEPS_BAR_PAD_X,
            top: 0,
            width: STEPS_BAR_INNER_W,
            height: STEPS_BAR_H,
            background: STEPS_TRACK_BG,
            borderRadius: 5,
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            left: STEPS_BAR_PAD_X,
            top: 0,
            width: valuePx,
            height: STEPS_BAR_H,
            background: STEPS_FILL,
            borderRadius: 5,
          }}
        />
        <div
          className="absolute"
          style={{
            left: STEPS_BAR_PAD_X + valuePx - 3,
            top: -3,
            width: 6,
            height: STEPS_BAR_H + 6,
            background: '#fff',
            border: `1.5px solid ${STEPS_FILL}`,
            borderRadius: 3,
            cursor: 'ew-resize',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div
        className="flex justify-between mt-1.5"
        style={{
          marginLeft: STEPS_BAR_PAD_X,
          marginRight: STEPS_BAR_PAD_X,
          fontSize: 10,
          color: '#a8a29e',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <span>{STEPS_MIN.toLocaleString()}</span>
        <span>{STEPS_MAX.toLocaleString()} steps/day</span>
      </div>
    </div>
  )
}

// ─── Longevity sleep — 2D rectangle: width = hours, height = quality ─
//
//   ┌───────────────────────────────────────┐ ← max area (track)
//   │                                       │
//   │         ┌─────────────────┐  ←─top edge = quality
//   │         │                 │           │
//   │         │   filled rect   │           │
//   │         │  area = good    │           │
//   │         │   sleep hours   │           │
//   └─────────┴─────────────────┴───────────┘
//   ↑         ←─── width = hours ─→        ↑
//   4h                                    10h
//
// The filled rectangle's AREA represents effective sleep (hours × quality).
// Drag anywhere in the area; the X position sets hours and the Y position
// sets quality. A corner handle marks the current top-right.

const SLEEP_LONG_W = 320
const SLEEP_LONG_PAD_X = 8
const SLEEP_LONG_INNER_W = SLEEP_LONG_W - SLEEP_LONG_PAD_X * 2
const SLEEP_LONG_AREA_H = 64

const SLEEP_HOURS_MIN = 4
const SLEEP_HOURS_MAX = 10
const SLEEP_HOURS_STEP = 0.5
const SLEEP_QUALITY_MIN = 60
const SLEEP_QUALITY_MAX = 100
const SLEEP_QUALITY_STEP = 2

const SLEEP_LONG_TRACK = '#e3edf3'
const SLEEP_LONG_FILL = '#5B9FCC' // deeper painterly blue

function SleepLongevityLever({
  hours,
  quality,
  onChange,
}: {
  hours: number
  quality: number
  onChange: (hours: number, quality: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const hoursFrac = clamp(
    (hours - SLEEP_HOURS_MIN) / (SLEEP_HOURS_MAX - SLEEP_HOURS_MIN),
    0,
    1,
  )
  const qualityFrac = clamp(
    (quality - SLEEP_QUALITY_MIN) / (SLEEP_QUALITY_MAX - SLEEP_QUALITY_MIN),
    0,
    1,
  )
  const barW = hoursFrac * SLEEP_LONG_INNER_W
  const barH = qualityFrac * SLEEP_LONG_AREA_H

  const apply = useCallback(
    (clientX: number, clientY: number) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const x = clamp(clientX - rect.left - SLEEP_LONG_PAD_X, 0, SLEEP_LONG_INNER_W)
      const y = clamp(clientY - rect.top, 0, SLEEP_LONG_AREA_H)
      const hourFrac = x / SLEEP_LONG_INNER_W
      const qFrac = (SLEEP_LONG_AREA_H - y) / SLEEP_LONG_AREA_H
      const newHours = quantize(
        SLEEP_HOURS_MIN + hourFrac * (SLEEP_HOURS_MAX - SLEEP_HOURS_MIN),
        SLEEP_HOURS_STEP,
        SLEEP_HOURS_MIN,
        SLEEP_HOURS_MAX,
      )
      const newQuality = quantize(
        SLEEP_QUALITY_MIN + qFrac * (SLEEP_QUALITY_MAX - SLEEP_QUALITY_MIN),
        SLEEP_QUALITY_STEP,
        SLEEP_QUALITY_MIN,
        SLEEP_QUALITY_MAX,
      )
      onChange(newHours, newQuality)
    },
    [onChange],
  )

  const effectiveHours = (hours * quality) / 100

  return (
    <div className="select-none" style={{ width: SLEEP_LONG_W }}>
      <div className="flex items-baseline justify-end mb-3" style={{ width: SLEEP_LONG_W }}>
        <span
          className="text-[13px] text-stone-500"
          style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
        >
          {hours.toFixed(1)}h × {quality}%
          <span className="text-stone-400 ml-1.5">
            = {effectiveHours.toFixed(1)}h effective
          </span>
        </span>
      </div>

      <div
        ref={ref}
        className="relative touch-none"
        style={{
          width: SLEEP_LONG_W,
          height: SLEEP_LONG_AREA_H,
          cursor: dragging ? 'grabbing' : 'crosshair',
        }}
        onPointerDown={(e) => {
          setDragging(true)
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          apply(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => dragging && apply(e.clientX, e.clientY)}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
        }}
      >
        {/* Track (max possible area) */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: SLEEP_LONG_PAD_X,
            top: 0,
            width: SLEEP_LONG_INNER_W,
            height: SLEEP_LONG_AREA_H,
            background: SLEEP_LONG_TRACK,
            borderRadius: 5,
          }}
        />
        {/* Filled rectangle — bottom-aligned, grows right (hours) and up (quality) */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: SLEEP_LONG_PAD_X,
            top: SLEEP_LONG_AREA_H - barH,
            width: barW,
            height: barH,
            background: SLEEP_LONG_FILL,
            borderRadius: 5,
          }}
        />
        {/* Top-right corner marker — shows current (hours, quality) */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: SLEEP_LONG_PAD_X + barW - 5,
            top: SLEEP_LONG_AREA_H - barH - 5,
            width: 10,
            height: 10,
            background: '#fff',
            border: `1.5px solid ${SLEEP_LONG_FILL}`,
            borderRadius: 5,
          }}
        />
      </div>

      <div
        className="flex justify-between mt-1.5"
        style={{
          marginLeft: SLEEP_LONG_PAD_X,
          marginRight: SLEEP_LONG_PAD_X,
          fontSize: 10,
          color: '#a8a29e',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <span>{SLEEP_HOURS_MIN}h</span>
        <span>← hours · quality ↑ →</span>
        <span>{SLEEP_HOURS_MAX}h</span>
      </div>
    </div>
  )
}

// ─── Outcome bubble ───────────────────────────────────────────────

function OutcomeBubble({
  outcome,
  width = 120,
}: {
  outcome: OutcomeWithDelta
  width?: number
}) {
  const after = outcome.baseline + outcome.delta
  const hasDelta = Math.abs(outcome.delta) > Math.pow(10, -outcome.decimals - 1)
  const tc = TONE_TEXT[outcome.tone]
  return (
    <div
      title={outcome.description}
      style={{
        width,
        textAlign: 'center',
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 22,
        padding: '8px 10px',
        cursor: 'help',
      }}
    >
      <div
        className="leading-none"
        style={{
          fontSize: 11,
          color: '#78716c',
          fontFamily: 'Inter, sans-serif',
          marginBottom: 5,
        }}
      >
        {outcome.label}
      </div>
      {hasDelta ? (
        <>
          {/* Headline: the change. Larger, in tone color. */}
          <div
            className="leading-none"
            style={{
              fontSize: 26,
              color: tc,
              fontFamily: 'Inter, sans-serif',
              fontWeight: 300,
              letterSpacing: '-0.03em',
            }}
          >
            {signed(outcome.delta, outcome.decimals)}
            {outcome.unit && (
              <span
                style={{
                  fontSize: 11,
                  color: tc,
                  marginLeft: 3,
                  fontWeight: 400,
                  opacity: 0.75,
                }}
              >
                {outcome.unit}
              </span>
            )}
          </div>
          {/* Sub: the new value, smaller and muted. */}
          <div
            className="leading-none"
            style={{
              fontSize: 11,
              color: '#a8a29e',
              fontFamily: 'Inter, sans-serif',
              marginTop: 4,
            }}
          >
            {fmt(after, outcome.decimals)}
            {outcome.unit && <span style={{ marginLeft: 2 }}>{outcome.unit}</span>}
          </div>
        </>
      ) : (
        // Default state — no change yet, show baseline calmly.
        <div
          className="leading-none"
          style={{
            fontSize: 18,
            color: '#1c1917',
            fontFamily: 'Inter, sans-serif',
            fontWeight: 300,
            letterSpacing: '-0.03em',
          }}
        >
          {fmt(after, outcome.decimals)}
          {outcome.unit && (
            <span style={{ fontSize: 10, color: '#a8a29e', marginLeft: 3, fontWeight: 400 }}>
              {outcome.unit}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Scaled-widget wrapper ────────────────────────────────────────

function ScaledBox({
  width,
  height,
  scale,
  children,
}: {
  width: number
  height: number
  scale: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: width * scale,
        height: height * scale,
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width,
          height,
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Standardized category header for each lever ─────────────────

function LeverHeader({
  label,
  x,
  y,
}: {
  label: string
  x: number
  y: number
}) {
  return (
    <div
      className="absolute text-center"
      style={{
        left: x,
        top: y,
        transform: 'translateX(-50%)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 15,
        color: '#44403c',
        fontWeight: 400,
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  )
}

// ─── Lever row ───────────────────────────────────────────────────

type LeverPositions = Partial<Record<LeverId, number>>

interface LeverRowProps {
  state: AllState
  setState: React.Dispatch<React.SetStateAction<AllState>>
  leverSet: LeverId[]
  positions: LeverPositions
  topY: number
  hrSize: number
  decayScale: number
  sleepScale: number
  dietScale: number
  regime: Regime
}

function LeverRow({
  state,
  setState,
  leverSet,
  positions,
  topY,
  hrSize,
  decayScale,
  sleepScale,
  dietScale,
  regime,
}: LeverRowProps) {
  const decayW = 360 * decayScale
  const sleepW = 400 * sleepScale
  const dietW = DIET_W * dietScale
  const dietNaturalH = 80

  function renderLever(id: LeverId) {
    const x = positions[id]
    if (x == null) return null
    switch (id) {
      case 'hr':
        return (
          <div
            key={id}
            className="absolute"
            style={{ left: x - hrSize / 2, top: topY }}
          >
            <CompactHRDial
              values={state.hrValues}
              onChange={(v) => setState((s) => ({ ...s, hrValues: v }))}
              size={hrSize}
            />
          </div>
        )
      case 'caffeine':
        return (
          <div key={id} className="absolute" style={{ left: x - decayW / 2, top: topY }}>
            <ScaledBox width={360} height={170} scale={decayScale}>
              <DecayCurveLever
                spec={CAFFEINE_SPEC}
                amount={state.caffeine.amount}
                cutoff={state.caffeine.cutoff}
                onChange={(a, c) =>
                  setState((s) => ({ ...s, caffeine: { amount: a, cutoff: c } }))
                }
              />
            </ScaledBox>
          </div>
        )
      case 'alcohol':
        return (
          <div key={id} className="absolute" style={{ left: x - decayW / 2, top: topY }}>
            <ScaledBox width={360} height={170} scale={decayScale}>
              <DecayCurveLever
                spec={ALCOHOL_SPEC}
                amount={state.alcohol.amount}
                cutoff={state.alcohol.cutoff}
                onChange={(a, c) =>
                  setState((s) => ({ ...s, alcohol: { amount: a, cutoff: c } }))
                }
              />
            </ScaledBox>
          </div>
        )
      case 'diet':
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: x - dietW / 2,
              top: topY + (hrSize - dietNaturalH * dietScale) / 2,
            }}
          >
            <ScaledBox width={DIET_W} height={dietNaturalH} scale={dietScale}>
              <DietLever
                proteinG={state.diet.proteinG}
                totalKcal={state.diet.totalKcal}
                onChange={(p, kcal) =>
                  setState((s) => ({ ...s, diet: { proteinG: p, totalKcal: kcal } }))
                }
              />
            </ScaledBox>
          </div>
        )
      case 'sleep':
        if (regime === 'longevity') {
          const sleepLongNaturalH = 100
          const sleepLongW = SLEEP_LONG_W * sleepScale
          return (
            <div
              key={id}
              className="absolute"
              style={{
                left: x - sleepLongW / 2,
                top: topY + (hrSize - sleepLongNaturalH * sleepScale) / 2,
              }}
            >
              <ScaledBox
                width={SLEEP_LONG_W}
                height={sleepLongNaturalH}
                scale={sleepScale}
              >
                <SleepLongevityLever
                  hours={state.sleep.hours}
                  quality={state.sleep.quality}
                  onChange={(h, q) =>
                    setState((s) => ({
                      ...s,
                      sleep: { ...s.sleep, hours: h, quality: q },
                    }))
                  }
                />
              </ScaledBox>
            </div>
          )
        }
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: x - sleepW / 2,
              top: topY + (hrSize - 72 * sleepScale) / 2,
            }}
          >
            <ScaledBox width={400} height={72} scale={sleepScale}>
              <MinimalLine
                spec={SLEEP_SPEC}
                bedtime={state.sleep.bedtime}
                wake={state.sleep.wake}
                onChange={(b, w) =>
                  setState((s) => ({
                    ...s,
                    sleep: { ...s.sleep, bedtime: b, wake: w },
                  }))
                }
              />
            </ScaledBox>
          </div>
        )
    }
  }

  return <>{leverSet.map(renderLever)}</>
}

type LeverAnchors = Partial<Record<LeverId, { x: number; y: number }>>

function computeLeverAnchors(
  leverSet: LeverId[],
  positions: LeverPositions,
  topY: number,
  hrSize: number,
  decayScale: number,
  sleepScale: number,
  dietScale: number,
  regime: Regime,
): LeverAnchors {
  const dietNaturalH = 80
  const sleepNaturalH = regime === 'longevity' ? 100 : 72
  // Arrow origin sits this many px below the lever's visual bottom so
  // the edge stroke clears the lever shape instead of starting inside it.
  const ARROW_GAP = 14
  const out: LeverAnchors = {}
  for (const id of leverSet) {
    const x = positions[id]
    if (x == null) continue
    let y = topY + hrSize + HR_LEGEND_H + ARROW_GAP // dial + zone legend
    if (id === 'caffeine' || id === 'alcohol')
      y = topY + 170 * decayScale + ARROW_GAP
    else if (id === 'diet')
      y = topY + (hrSize + dietNaturalH * dietScale) / 2 + ARROW_GAP + 4
    else if (id === 'sleep')
      y = topY + (hrSize + sleepNaturalH * sleepScale) / 2 + ARROW_GAP + 4
    out[id] = { x, y }
  }
  return out
}

function leverPositionsFor(leverSet: LeverId[], W: number): LeverPositions {
  const out: LeverPositions = {}
  const N = leverSet.length
  if (N === 0) return out
  if (N === 1) {
    out[leverSet[0]] = W * 0.5
    return out
  }
  // Spread from 10% to 90% of W with even gaps.
  leverSet.forEach((id, i) => {
    out[id] = W * (0.1 + (i / (N - 1)) * 0.8)
  })
  return out
}

const LEVER_LABEL: Record<LeverId, string> = {
  hr: 'Activity',
  caffeine: 'Caffeine',
  alcohol: 'Alcohol',
  diet: 'Diet',
  sleep: 'Sleep',
}

// ─── Painterly canvas (for either regime) ─────────────────────────

interface PainterlyCanvasProps {
  state: AllState
  setState: React.Dispatch<React.SetStateAction<AllState>>
  regime: Regime
  participant: ParticipantPortal
  equations: StructuralEquation[]
  runFullCounterfactual: (
    observedValues: Record<string, number>,
    interventions: Intervention[],
  ) => FullCounterfactualState
}

function PainterlyCanvas({
  state,
  setState,
  regime,
  participant,
  equations,
  runFullCounterfactual,
}: PainterlyCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 1280, height: 660 })

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setSize({
        width: Math.max(900, Math.round(rect.width)),
        height: Math.max(540, Math.round(rect.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const W = size.width
  const H = size.height

  // Per-regime lever set — Quotidian shows 5 (with caffeine + alcohol);
  // Longevity shows 4 (steps replaces caffeine + alcohol since the latter
  // are quotidian-class lifestyle factors).
  const leverSet = regime === 'quotidian' ? QUOTIDIAN_LEVERS : LONGEVITY_LEVERS

  // Lever sizing scales with available width — slightly larger when there
  // are fewer levers to lay out.
  const HR_SIZE = Math.max(160, Math.min(220, W * (leverSet.length === 4 ? 0.14 : 0.13)))
  const SCALE = Math.max(0.55, Math.min(0.8, W / (leverSet.length === 4 ? 1700 : 2000)))
  const DECAY_SCALE = SCALE
  const SLEEP_SCALE = SCALE
  const DIET_SCALE = SCALE
  const HEADER_Y = 22
  const TOP = 56

  const positions = leverPositionsFor(leverSet, W)
  const anchors = computeLeverAnchors(
    leverSet,
    positions,
    TOP,
    HR_SIZE,
    DECAY_SCALE,
    SLEEP_SCALE,
    DIET_SCALE,
    regime,
  )

  // ─── Real engine pipeline ────────────────────────────────────────
  const observedBaseline = useMemo(() => {
    const base = buildObservedValues(participant)
    // For Longevity we project forward over months. Today's transient
    // load states (acwr, training_load, sleep_debt, travel_load) shouldn't
    // be locked in — strip them so the engine recomputes them from the
    // current action values when projecting.
    if (regime === 'longevity') {
      delete (base as Record<string, number>).acwr
      delete (base as Record<string, number>).training_load
      delete (base as Record<string, number>).sleep_debt
      delete (base as Record<string, number>).sleep_debt_14d
      delete (base as Record<string, number>).travel_load
    }
    // Seed canonical-action baselines for actions not present in
    // current_values / MANIPULABLE_NODES (e.g. zone2_minutes, caffeine_mg).
    // Use the value the seeded lever would emit so lever-at-startup
    // matches baseline (no phantom intervention), but any drag from
    // there generates a real delta.
    const seeded = seedStateFromParticipant(participant)
    for (const leverId of Object.keys(LEVER_ACTIONS) as LeverId[]) {
      const mapping = LEVER_ACTIONS[leverId]
      const v = mapping.valuesFor(seeded, regime)
      for (const action of mapping.actions) {
        const candidate = v[action]
        if (
          candidate != null &&
          Number.isFinite(candidate) &&
          (base[action] == null || !Number.isFinite(base[action]))
        ) {
          base[action] = candidate
        }
      }
    }
    return base
  }, [participant, regime])
  const baseOutcomes = useMemo(
    () => buildOutcomesForRegime(participant, regime),
    [participant, regime],
  )
  const outcomeBaselines = useMemo(() => {
    const ob: Record<string, number> = {}
    for (const o of baseOutcomes) ob[o.id] = o.baseline
    return ob
  }, [baseOutcomes])
  const atDays = regime === 'quotidian' ? 7 : 90
  const outcomes = useMemo(
    () =>
      computeOutcomesFromEngine(
        baseOutcomes,
        state,
        regime,
        leverSet,
        observedBaseline,
        outcomeBaselines,
        atDays,
        runFullCounterfactual,
      ),
    [baseOutcomes, state, regime, leverSet, observedBaseline, outcomeBaselines, atDays, runFullCounterfactual],
  )
  const outcomeIdSet = useMemo(
    () => new Set(baseOutcomes.map((o) => o.id)),
    [baseOutcomes],
  )
  const edges = useMemo(
    () => deriveEdgesFromEquations(equations, leverSet, outcomeIdSet),
    [equations, leverSet, outcomeIdSet],
  )

  // Lightweight DevTools diagnostic — logs once per (regime, leverSet)
  // change. Use to verify that an action like zone4_5_minutes actually
  // has equations in the engine for the current regime's outcomes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!(window as unknown as { __twinDebug?: boolean }).__twinDebug) return
    const byLever: Record<string, string[]> = {}
    for (const [lid, oid] of edges) {
      ;(byLever[lid] ??= []).push(oid)
    }
    // eslint-disable-next-line no-console
    console.log('[Painterly]', regime, 'edges:', byLever)
  }, [regime, edges])

  // Layout — Quotidian gets one row (≤5 outcomes); Longevity splits its
  // 20 across two rows (weeks band on top, months band on bottom) so
  // each chit has breathing room.
  const isLongevity = regime === 'longevity'
  const rowsCount = isLongevity ? 2 : 1
  const perRow = isLongevity ? Math.ceil(outcomes.length / 2) : outcomes.length
  const outcomeMargin = Math.max(70, W * 0.04)
  const yJitter = [0, 14, -10, 8, -14, 6, 0, -8, 12, -6]
  const outcomeBubbleW = isLongevity ? 110 : 130

  // Bottom row sits a fixed distance from the bottom; top row (if any)
  // sits a fixed gap above it.
  const ROW_GAP = 110
  const baseY = H - 110
  const outcomeXs: number[] = []
  const outcomeYs: number[] = []
  outcomes.forEach((_, i) => {
    const row = isLongevity ? Math.floor(i / perRow) : 0
    const colIdx = isLongevity ? i % perRow : i
    const colCount = perRow
    const x =
      outcomeMargin +
      (colIdx * (W - outcomeMargin * 2)) / Math.max(1, colCount - 1)
    const rowBaseY = baseY - (rowsCount - 1 - row) * ROW_GAP
    const y = rowBaseY + (yJitter[colIdx] ?? 0)
    outcomeXs.push(x)
    outcomeYs.push(y)
  })

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{
        height: 'calc(100vh - 220px)',
        minHeight: 580,
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 28,
      }}
    >
      <svg
        className="absolute inset-0 pointer-events-none"
        width={W}
        height={H}
      >
        <defs>
          <filter id="paint-blur">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        </defs>
        {edges.map(([leverId, outcomeId]) => {
          const a = anchors[leverId as LeverId]
          if (!a) return null  // lever not in this regime's active set
          const idx = outcomes.findIndex((o) => o.id === outcomeId)
          if (idx < 0) return null
          const o = outcomes[idx]
          // Tone this edge from *this lever's* contribution to the outcome —
          // so dragging HR doesn't re-tint caffeine/alcohol/sleep edges.
          const leverContribution = o.contributions[leverId as keyof Contributions]
          const edgeTone = toneFor(o, leverContribution)
          const b = { x: outcomeXs[idx], y: outcomeYs[idx] - 8 }
          const stroke = TONE_STROKE[edgeTone]
          const cy = (a.y + b.y) / 2
          const path = `M ${a.x} ${a.y} C ${a.x} ${cy}, ${b.x} ${cy}, ${b.x} ${b.y}`
          const isActive = edgeTone !== 'neutral'
          return (
            <g key={`${leverId}-${outcomeId}`}>
              {/* Wide soft halo */}
              <path
                d={path}
                stroke={stroke}
                strokeWidth={isActive ? 7 : 4}
                fill="none"
                opacity={isActive ? 0.18 : 0.08}
                filter="url(#paint-blur)"
              />
              {/* Mid stroke */}
              <path
                d={path}
                stroke={stroke}
                strokeWidth={isActive ? 2.5 : 1.5}
                fill="none"
                opacity={isActive ? 0.42 : 0.22}
              />
              {/* Inner crisp line */}
              <path
                d={path}
                stroke={stroke}
                strokeWidth={isActive ? 0.9 : 0.5}
                fill="none"
                opacity={isActive ? 0.95 : 0.5}
              />
            </g>
          )
        })}
      </svg>

      {leverSet.map((id) => {
        const x = positions[id]
        if (x == null) return null
        return (
          <LeverHeader key={id} label={LEVER_LABEL[id]} x={x} y={HEADER_Y} />
        )
      })}

      <LeverRow
        state={state}
        setState={setState}
        leverSet={leverSet}
        positions={positions}
        topY={TOP}
        hrSize={HR_SIZE}
        decayScale={DECAY_SCALE}
        sleepScale={SLEEP_SCALE}
        dietScale={DIET_SCALE}
        regime={regime}
      />

      {outcomes.map((o, i) => (
        <div
          key={o.id}
          className="absolute"
          style={{ left: outcomeXs[i] - outcomeBubbleW / 2, top: outcomeYs[i] }}
        >
          <OutcomeBubble outcome={o} width={outcomeBubbleW} />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────

/** Seed the painterly lever state from a participant's actual current
 *  values so the engine sees zero interventions at startup (lever ==
 *  baseline → no-op). Falls back to sensible defaults where the
 *  participant doesn't have a value for the underlying canonical action. */
function seedStateFromParticipant(participant: ParticipantPortal): AllState {
  const cv = (participant.current_values ?? {}) as Record<string, number>
  const f = (k: string, fallback: number) =>
    typeof cv[k] === 'number' && Number.isFinite(cv[k]) ? cv[k] : fallback
  // Inverse of the canonical-action mappings in LEVER_ACTIONS.
  const z1Min = f('steps', HR_THREE_BAND.bands[0].default * 100) / 100
  const z23Min = f('zone2_volume', HR_THREE_BAND.bands[1].default / 60) * 60
  const z45Min = HR_THREE_BAND.bands[2].default
  return {
    hrValues: [z1Min, z23Min, z45Min],
    caffeine: {
      amount: CAFFEINE_SPEC.amount.default,
      cutoff: CAFFEINE_SPEC.cutoff.default,
    },
    alcohol: {
      amount: ALCOHOL_SPEC.amount.default,
      cutoff: ALCOHOL_SPEC.cutoff.default,
    },
    sleep: {
      bedtime: f('bedtime', SLEEP_SPEC.xAxis.default),
      wake: SLEEP_SPEC.yAxis.default,
      hours: f('sleep_duration', SLEEP_HOURS_DEFAULT),
      quality: SLEEP_QUALITY_DEFAULT,
    },
    diet: {
      proteinG: f('dietary_protein', DIET_DEFAULT_PROTEIN_G),
      totalKcal: f('dietary_energy', DIET_DEFAULT_TOTAL_KCAL),
    },
  }
}

export function PainterlyTwinView() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual, equations } = useSCM()

  const [state, setState] = useState<AllState>(defaultState)
  const [regime, setRegime] = useState<Regime>('quotidian')

  // When the active participant changes, reseed the lever state so
  // levers start at the participant's actual baseline (no interventions).
  const lastSeededPid = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!participant) return
    if (lastSeededPid.current === participant.pid) return
    setState(seedStateFromParticipant(participant))
    lastSeededPid.current = participant.pid
  }, [participant])

  return (
    <PageLayout maxWidth="full">
      {/* Header strip — persona portrait + regime toggle + reset */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {pid != null && (
          <PersonaPortrait
            persona={persona}
            displayName={displayName}
            cohort={cohort}
            size={132}
            cleanBackground
            subtitle={
              regime === 'quotidian'
                ? 'Day-scale outcomes'
                : 'Months-scale biomarkers'
            }
            stats={(() => {
              const m = persona?.currentMetrics
              if (!m) return []
              const stats: Array<{ label: string; value: number; unit?: string }> = []
              if (m.hrv) stats.push({ label: 'HRV', value: m.hrv, unit: 'ms' })
              if (m.restingHr) stats.push({ label: 'RHR', value: m.restingHr, unit: 'bpm' })
              if (m.deepSleepMin)
                stats.push({ label: 'Deep', value: m.deepSleepMin, unit: 'min' })
              if (m.remSleepMin)
                stats.push({ label: 'REM', value: m.remSleepMin, unit: 'min' })
              return stats
            })()}
          />
        )}

        <div
          className="inline-flex items-center rounded-full p-1 ml-2"
          style={{ background: '#fff', border: `1px solid ${BORDER}` }}
        >
          <RegimeButton
            active={regime === 'quotidian'}
            onClick={() => setRegime('quotidian')}
          >
            Quotidian
          </RegimeButton>
          <RegimeButton
            active={regime === 'longevity'}
            onClick={() => setRegime('longevity')}
          >
            Longevity
          </RegimeButton>
        </div>

        <button
          onClick={() =>
            setState(
              participant ? seedStateFromParticipant(participant) : defaultState(),
            )
          }
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-700 px-2.5 py-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {pid == null ? (
        <EmptyParticipant message="Pick a member to open their twin." />
      ) : isLoading || !participant ? (
        <EmptyParticipant
          message={`Loading twin${displayName ? ' for ' + displayName : ''}…`}
          icon="loading"
        />
      ) : (
        <PainterlyCanvas
          state={state}
          setState={setState}
          regime={regime}
          participant={participant}
          equations={equations}
          runFullCounterfactual={runFullCounterfactual}
        />
      )}
    </PageLayout>
  )
}

function EmptyParticipant({
  message,
  icon,
}: {
  message: string
  icon?: 'loading'
}) {
  return (
    <div
      className="rounded-2xl flex items-center justify-center"
      style={{
        background: BG,
        border: `1px solid ${BORDER}`,
        padding: '64px 32px',
        color: '#78716c',
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
      }}
    >
      {icon === 'loading' && (
        <Loader2 className="w-4 h-4 animate-spin mr-2 text-stone-400" />
      )}
      {message}
    </div>
  )
}

function RegimeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-1.5 rounded-full transition-colors',
      )}
      style={{
        background: active ? BG : 'transparent',
        color: active ? '#1c1917' : '#78716c',
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </button>
  )
}

export default PainterlyTwinView
