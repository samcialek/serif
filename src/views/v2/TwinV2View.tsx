/**
 * Twin v2 — fork of the canonical Painterly Twin (now at `/twin`).
 *
 * Goals of this fork:
 *   1. Richer modeling — sleep_quality + resistance_training as real
 *      drivers, plus literature-backed edges for ALT / uric_acid /
 *      homocysteine / hemoglobin / Mg.
 *   2. Actionable — Save-as-Protocol pipeline + solver mode.
 *   3. UX polish — outcome detail panel on click, per-zone HR edge
 *      anchoring, confidence badges, horizon scrubber.
 *   4. Modeling honesty — data-freshness pills, confidence-weighted
 *      edge opacity, "what we don't know" caveats.
 *
 * Uses `useSCMv2` so the engine pulls from `PHASE_1_EDGES` ∪
 * `PHASE_2_EDGES`. v1 routes (`/twin`, `/protocols`) are unaffected.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PageLayout } from '@/components/layout'
import {
  CloudSun,
  Droplets,
  Loader2,
  RotateCcw,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
  X,
  Check,
  Save,
  type LucideIcon,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  useTwinSnapshotStore,
  newSnapshotId,
  type TwinSnapshot,
} from '@/stores/twinSnapshotStore'
import { useSearchParams } from 'react-router-dom'
import { useScopeStore } from '@/stores/scopeStore'
import { PainterlyPageHeader, CrossTabLinks, GlossaryTerm } from '@/components/common'
import {
  HR_THREE_BAND,
  ALCOHOL_SPEC,
  CAFFEINE_SPEC,
  SLEEP_SPEC,
  sleepDuration,
  quantizeBand,
} from '@/views/twinForks/leverConcepts/types'
import { trimpFor } from '@/views/twinForks/leverConcepts/HRDialVariants'
import { DecayCurveLever } from '@/views/twinForks/leverConcepts/ConsumableConcepts'
import { MinimalLine } from '@/views/twinForks/leverConcepts/SleepVariants'
import { optimizationScore } from '@/utils/insightStandardization'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useSCMv2 as useSCM } from '@/hooks/useSCMv2'
import { useBartTwin } from '@/hooks/useBartTwin'
import { mergeBandsFromMC } from '@/views/twinForks/_graph'
import type { MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
import { StorylinePanel } from '@/components/portal'
import { buildTodaysStory } from '@/utils/storyline'
import { buildObservedValues } from '@/views/twinForks/_shared'
import { outcomeStatesAt } from '@/views/twinForks/_graph'
import { edgeWeight, personalizationForEdge } from '@/utils/edgeEvidence'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { PHASE_1_EDGES } from '@/data/scm/syntheticEdges'
import { PHASE_2_EDGES as PHASE_2_EDGES_REF } from '@/data/scm/syntheticEdgesV2'
import type { Intervention, StructuralEquation } from '@/data/scm/types'
import type { FullCounterfactualState } from '@/data/scm/fullCounterfactual'
import type { ParticipantPortal, WeatherKey } from '@/data/portal/types'

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

const TWIN_BENEFICIAL_OVERRIDE: Partial<Record<string, 'higher' | 'lower'>> = {
  cortisol: 'lower',
  dhea_s: 'higher',
  testosterone: 'higher',
}

function beneficialDirectionForOutcome(
  id: string,
  meta: (typeof OUTCOME_META)[string] | undefined,
): 'higher' | 'lower' {
  const override = TWIN_BENEFICIAL_OVERRIDE[id]
  if (override) return override
  return meta?.beneficial === 'lower' ? 'lower' : 'higher'
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
    const beneficial = beneficialDirectionForOutcome(id, meta)
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

// (Hand-rolled longevity-outcome metadata removed — runtime list flows
//  through `buildOutcomesForRegime` against canonical `OUTCOME_META` +
//  `LONGEVITY_OUTCOME_IDS` instead.)

// Longevity-relevant levers only — cardio/HR, daily steps (NEAT), diet,
// and sleep. Caffeine and alcohol are quotidian-class lifestyle factors;
// they're omitted here even though they have small longevity effects.
// (Longevity edges derived dynamically from real data — see below.)

// ─── State ────────────────────────────────────────────────────────

type Regime = 'quotidian' | 'longevity'
type LeverId =
  | 'hr'
  | 'caffeine'
  | 'alcohol'
  | 'diet'
  | 'sleep'
  | 'sleep_supplementation'
  | 'resistance'
  | 'supplementation'

// Quotidian = 1-week horizon, so diet + resistance + longevity
// supplementation effects haven't accrued yet. Sleep aids are modeled
// separately because their effects can plausibly move wearable sleep
// outcomes within days.
const QUOTIDIAN_LEVERS: LeverId[] = ['hr', 'caffeine', 'alcohol', 'sleep', 'sleep_supplementation']
const LONGEVITY_LEVERS: LeverId[] = [
  'hr',
  'resistance',
  'diet',
  'sleep',
  'supplementation',
]

// ─── Supplementation set ──────────────────────────────────────────
//
// Each entry maps to one binary canonical action (`supp_*`). Doses are
// fixed (encoded in the synthetic-edge rationale strings) — the lever is
// "are you taking it?" not "how much?".

interface SupplementSpec<TId extends string = string> {
  id: TId
  action: string
  label: string
  /** Short dose text shown next to the toggle. */
  dose: string
}

const SUPPLEMENTS: SupplementSpec<keyof SupplementationState>[] = [
  { id: 'omega3', action: 'supp_omega3', label: 'Omega-3', dose: '2 g EPA+DHA' },
  { id: 'magnesium', action: 'supp_magnesium', label: 'Magnesium', dose: '400 mg' },
  { id: 'vitaminD', action: 'supp_vitamin_d', label: 'Vitamin D', dose: '2000 IU' },
  { id: 'bComplex', action: 'supp_b_complex', label: 'B-complex', dose: 'B12+B6+folate' },
  { id: 'creatine', action: 'supp_creatine', label: 'Creatine', dose: '5 g' },
]

const QUOTIDIAN_SUPPLEMENTS: SupplementSpec<keyof SleepSupplementationState>[] = [
  { id: 'melatonin', action: 'supp_melatonin', label: 'Melatonin', dose: '0.3-1 mg' },
  { id: 'lTheanine', action: 'supp_l_theanine', label: 'L-theanine', dose: '200 mg' },
  { id: 'zinc', action: 'supp_zinc', label: 'Zinc', dose: '15 mg' },
]

interface SupplementationState {
  omega3: boolean
  magnesium: boolean
  vitaminD: boolean
  bComplex: boolean
  creatine: boolean
}

interface SleepSupplementationState {
  melatonin: boolean
  lTheanine: boolean
  zinc: boolean
}

function defaultSupplementation(): SupplementationState {
  return {
    omega3: false,
    magnesium: false,
    vitaminD: false,
    bComplex: false,
    creatine: false,
  }
}

function defaultSleepSupplementation(): SleepSupplementationState {
  return {
    melatonin: false,
    lTheanine: false,
    zinc: false,
  }
}

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
    bedroomTempC: number
  }
  diet: { proteinG: number; totalKcal: number }
  /** Weekly resistance-training minutes. Longevity-only lever. */
  resistanceMin: number
  /** Supplementation toggles. Longevity-only lever. */
  supp: SupplementationState
  /** Fast-acting sleep-aid toggles. Quotidian-only lever. */
  sleepSupp: SleepSupplementationState
}

const DIET_DEFAULT_PROTEIN_G = 100
const DIET_DEFAULT_TOTAL_KCAL = 2500

const SLEEP_HOURS_DEFAULT = 8
const SLEEP_QUALITY_DEFAULT = 80
const BEDROOM_TEMP_C_DEFAULT = 21.5
const BEDROOM_TEMP_C_MIN = 16
const BEDROOM_TEMP_C_MAX = 27
const BEDROOM_TEMP_C_STEP = 0.5
const QUOTIDIAN_SLEEP_NATURAL_H = 118

// Sessions/week is the user-facing unit; the engine still consumes
// resistance_training_minutes. We use 30 min/session as the conversion
// — a typical compact compound-lift session that fits 0..6 sessions/wk
// into the 0-180 min span the literature edges are calibrated to.
const RESISTANCE_MIN_PER_SESSION = 30
const RESISTANCE_SETS_PER_SESSION = 8
const RESISTANCE_MIN_DEFAULT = 60 // weekly minutes — 2 sessions baseline
const RESISTANCE_MIN_MIN = 0
const RESISTANCE_MIN_MAX = 180
const RESISTANCE_MIN_STEP = RESISTANCE_MIN_PER_SESSION

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
      bedroomTempC: BEDROOM_TEMP_C_DEFAULT,
    },
    diet: { proteinG: DIET_DEFAULT_PROTEIN_G, totalKcal: DIET_DEFAULT_TOTAL_KCAL },
    resistanceMin: RESISTANCE_MIN_DEFAULT,
    supp: defaultSupplementation(),
    sleepSupp: defaultSleepSupplementation(),
  }
}

interface Contributions {
  hr: number
  caffeine: number
  alcohol: number
  sleep: number
  sleep_supplementation: number
  diet: number
  resistance: number
  supplementation: number
}

interface OutcomeWithDelta extends Outcome {
  delta: number
  tone: Tone
  /** Per-lever contributions to this outcome's delta. Edge tones use
   *  these so dragging one lever only re-tones its own outgoing edges. */
  contributions: Contributions
  /** BART posterior band (when available) — afterLow / afterHigh are
   *  the 5/95 quantiles around `after`, scaled by the same horizon
   *  fraction as the point estimate. `bandHalf` is the convenience
   *  half-spread for ± display. */
  afterLow?: number
  afterHigh?: number
  bandHalf?: number
}

function toneFor(out: Outcome, delta: number): Tone {
  const eps = Math.pow(10, -out.decimals - 1)
  if (Math.abs(delta) <= eps) return 'neutral'
  const improved = out.beneficial === 'higher' ? delta > 0 : delta < 0
  return improved ? 'benefit' : 'harm'
}

// (`buildOutcome` removed — outcomes now flow through
//  `computeOutcomesFromEngine`, not the legacy direct constructor.)

function emptyContributions(): Contributions {
  return {
    hr: 0,
    caffeine: 0,
    alcohol: 0,
    sleep: 0,
    sleep_supplementation: 0,
    diet: 0,
    resistance: 0,
    supplementation: 0,
  }
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
  resistance: {
    actions: ['resistance_training_minutes'],
    valuesFor: (s) => ({
      resistance_training_minutes: s.resistanceMin,
    }),
  },
  supplementation: {
    // Each toggle maps 1:1 to its binary canonical action. Edges live in
    // syntheticEdgesV2.ts (omega-3 → triglycerides/hsCRP/HDL, magnesium →
    // glucose/insulin/Mg(RBC)/sleep_quality, vit-D → testosterone/hsCRP,
    // B-complex → homocysteine, creatine → testosterone/vo2_peak).
    actions: SUPPLEMENTS.map((s) => s.action),
    valuesFor: (s) => {
      const out: Record<string, number> = {}
      for (const spec of SUPPLEMENTS) {
        out[spec.action] = s.supp[spec.id] ? 1 : 0
      }
      return out
    },
  },
  sleep_supplementation: {
    actions: QUOTIDIAN_SUPPLEMENTS.map((s) => s.action),
    valuesFor: (s) => {
      const out: Record<string, number> = {}
      for (const spec of QUOTIDIAN_SUPPLEMENTS) {
        out[spec.action] = s.sleepSupp[spec.id] ? 1 : 0
      }
      return out
    },
  },
  sleep: {
    // v2: longevity emits sleep_duration AND sleep_quality as
    // independent engine inputs. The Phase-2 synthetic edges
    // (sleep_quality → cortisol, hsCRP, insulin, glucose, dhea_s,
    // hrv_daily, testosterone) make quality a real driver instead
    // of a multiplier on duration.
    actions: ['bedtime', 'sleep_duration', 'sleep_quality', 'bedroom_temp_c'],
    valuesFor: (s, regime) =>
      regime === 'longevity'
        ? {
            sleep_duration: s.sleep.hours,
            sleep_quality: s.sleep.quality,
            bedtime: 22.5,
          }
        : {
            bedtime: s.sleep.bedtime,
            sleep_duration: sleepDuration(s.sleep.bedtime, s.sleep.wake),
            bedroom_temp_c: s.sleep.bedroomTempC,
          },
  },
}

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

/** Edge in the painterly DAG. `action` is the canonical action node id
 *  (e.g. zone2_minutes) so the renderer can offset the anchor per-action
 *  within a multi-action lever like HR. */
interface DerivedEdge {
  leverId: LeverId
  action: string
  outcomeId: string
  /** 'fitted' if any backing equation came from cohort data, else
   *  'literature' (synthetic prior only). Drives the subtle opacity
   *  reduction for lit-only edges in the painterly canvas. */
  provenance: 'fitted' | 'literature'
}

/** Build the regime-specific edge list from the engine's structural
 *  equations — the SAME equations runFullCounterfactual will use. Edges
 *  that wouldn't move an outcome are omitted; edges that DO move an
 *  outcome are guaranteed to be drawn. */
function deriveEdgesFromEquations(
  equations: StructuralEquation[],
  leverSet: LeverId[],
  outcomeIdSet: Set<string>,
): DerivedEdge[] {
  const actionToLever: Record<string, LeverId> = {}
  for (const leverId of leverSet) {
    for (const action of LEVER_ACTIONS[leverId].actions) {
      actionToLever[action] = leverId
    }
  }
  // De-dupe at the (action, outcome) level so the same canonical edge
  // doesn't render twice when a lever has multiple synonymous actions.
  // First pass collects all matching equations per (action, outcome) so
  // we can promote the edge's provenance to 'fitted' whenever ANY of the
  // underlying equations are cohort-fitted.
  const byKey = new Map<string, { leverId: LeverId; action: string; outcomeId: string; provenance: 'fitted' | 'literature' }>()
  for (const eq of equations) {
    const leverId = actionToLever[eq.source]
    if (!leverId) continue
    const outcomeKey = canonicalOutcomeKey(eq.target)
    if (!outcomeIdSet.has(outcomeKey)) continue
    if (Math.abs(eq.ba) < 1e-9 && Math.abs(eq.bb) < 1e-9) continue
    const key = `${eq.source}|${outcomeKey}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        leverId,
        action: eq.source,
        outcomeId: outcomeKey,
        provenance: eq.provenance === 'fitted' ? 'fitted' : 'literature',
      })
    } else if (eq.provenance === 'fitted') {
      existing.provenance = 'fitted'
    }
  }
  return Array.from(byKey.values())
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
  mcState: MCFullCounterfactualState | null,
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
  const pointStates = outcomeStatesAt(
    combinedState,
    atDays,
    outcomeIdSet,
    outcomeBaselines,
  )
  // Merge BART posterior bands into the point estimates (when available).
  const combinedStates = mergeBandsFromMC(pointStates, mcState, atDays, outcomeIdSet)

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
    const delta = combined?.delta ?? 0
    const afterLow = combined?.afterLow
    const afterHigh = combined?.afterHigh
    const bandHalf =
      afterLow != null && afterHigh != null
        ? Math.max(0, (afterHigh - afterLow) / 2)
        : undefined

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
      afterLow,
      afterHigh,
      bandHalf,
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
  /** Quotidian = daily TRIMP (raw score from daily minutes); Longevity =
   *  weekly TRIMP (×7). The HR zone values themselves are still
   *  minutes/day — only the center-of-dial readout is regime-scaled. */
  regime?: Regime
}

/** Height (px) added below the dial for the per-zone legend. The
 *  PainterlyCanvas anchor calculation uses HR_LEGEND_H so edges still
 *  flow from below the legend rather than crossing through it. */
const HR_LEGEND_H = 36

function CompactHRDial({ values, onChange, size = 180, regime = 'quotidian' }: CompactHRDialProps) {
  const cx = size / 2
  const cy = size / 2
  const radii = [size * 0.42, size * 0.32, size * 0.22]
  const arcW = Math.max(7, size * 0.045)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [dragging, setDragging] = useState<0 | 1 | 2 | null>(null)
  const isWeekly = regime === 'longevity'
  const trimp = Math.round(trimpFor(values) * (isWeekly ? 7 : 1))

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
        {/* TRIMP score — the label is rendered as the lever header above
            the dial (LEVER_LABEL.hr), so the dial center is just the
            number. Visually centered using `dominant-baseline` so the
            number reads as anchored regardless of digit count. Font
            scales down for 4+ digit values (Longevity weekly TRIMP
            routinely lands in the 1000-9999 range, occasionally above)
            so the number doesn't outgrow the dial center. */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * (trimp >= 10000 ? 0.15 : trimp >= 1000 ? 0.18 : 0.22)}
          fontWeight={200}
          fill="#1c1917"
          style={{
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '-0.04em',
          }}
        >
          {trimp}
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
    // Zone-based hit testing so the calorie (total) handle is grabbable
    // from anywhere right of the protein divider, not just at the edge:
    //   - x ≤ proteinPx + 8px (protein segment + small grab zone) → drag protein
    //   - everywhere else (rest-of-energy + empty headroom) → drag total
    const target: 'protein' | 'total' =
      x <= proteinPx + 8 ? 'protein' : 'total'
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

function BedroomTemperatureLever({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const pct = clamp(
    (value - BEDROOM_TEMP_C_MIN) / (BEDROOM_TEMP_C_MAX - BEDROOM_TEMP_C_MIN),
    0,
    1,
  )
  const sweetSpotLeft =
    ((21 - BEDROOM_TEMP_C_MIN) / (BEDROOM_TEMP_C_MAX - BEDROOM_TEMP_C_MIN)) * 100
  const sweetSpotWidth =
    ((22 - 21) / (BEDROOM_TEMP_C_MAX - BEDROOM_TEMP_C_MIN)) * 100

  return (
    <div className="select-none px-2 pt-2" style={{ width: 400 }}>
      <div
        className="flex items-baseline justify-between"
        style={{
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <span className="text-[10px] uppercase text-stone-400">
          Bedroom temp
        </span>
        <span className="text-[12px] text-stone-700">
          {value.toFixed(1)} C
        </span>
      </div>
      <div className="relative h-7 mt-1">
        <div
          className="absolute left-0 right-0 top-3 h-1.5 rounded-full"
          style={{ background: '#f0e9d8' }}
        />
        <div
          className="absolute top-3 h-1.5 rounded-full"
          style={{
            left: `${sweetSpotLeft}%`,
            width: `${sweetSpotWidth}%`,
            background: '#89CFF0',
            opacity: 0.75,
          }}
        />
        <div
          className="absolute top-1.5 w-3.5 h-3.5 rounded-full border bg-white"
          style={{
            left: `calc(${pct * 100}% - 7px)`,
            borderColor: '#4A8AB5',
            boxShadow: '0 1px 4px rgba(74, 138, 181, 0.25)',
          }}
        />
        <input
          aria-label="Bedroom temperature"
          type="range"
          min={BEDROOM_TEMP_C_MIN}
          max={BEDROOM_TEMP_C_MAX}
          step={BEDROOM_TEMP_C_STEP}
          value={value}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          className="absolute inset-0 h-7 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}

// (StepsLever removed — Z1 minutes/day flows through CompactHRDial's
//  outer ring instead of a standalone slider. Its constants went with it.)

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

// ─── Resistance training lever (v2 — longevity only) ─────────────
//
// Sessions/week as the primary unit (the volume metric the literature
// actually keys on). The bar snaps to discrete sessions; under the hood
// each session converts to RESISTANCE_MIN_PER_SESSION minutes for the
// engine action. Sets per session are surfaced as fine print so the
// user can see what we're assuming.

const RES_W = 280
const RES_BAR_H = 38
const RES_PAD_X = 8
const RES_INNER_W = RES_W - RES_PAD_X * 2
const RES_TRACK = '#efe6d6'
const RES_FILL = '#80604A' // warm umber — distinct from gold/terracotta

function ResistanceLever({
  minutes,
  onChange,
}: {
  minutes: number
  onChange: (m: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const valueFrac = clamp(
    (minutes - RESISTANCE_MIN_MIN) / (RESISTANCE_MIN_MAX - RESISTANCE_MIN_MIN),
    0,
    1,
  )
  const valuePx = valueFrac * RES_INNER_W

  const apply = useCallback(
    (x: number) => {
      const xClamped = clamp(x, 0, RES_INNER_W)
      const frac = xClamped / RES_INNER_W
      const m = quantize(
        RESISTANCE_MIN_MIN + frac * (RESISTANCE_MIN_MAX - RESISTANCE_MIN_MIN),
        RESISTANCE_MIN_STEP,
        RESISTANCE_MIN_MIN,
        RESISTANCE_MIN_MAX,
      )
      onChange(m)
    },
    [onChange],
  )

  const sessions = Math.round(minutes / RESISTANCE_MIN_PER_SESSION)
  const sets = sessions * RESISTANCE_SETS_PER_SESSION

  return (
    <div className="select-none" style={{ width: RES_W }}>
      <div className="flex items-baseline justify-end mb-3" style={{ width: RES_W }}>
        <span
          className="text-[15px] text-stone-700"
          style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
        >
          {sessions === 0 ? 'No training' : `${sessions} session${sessions === 1 ? '' : 's'}/wk`}
          {sessions > 0 && (
            <span className="text-stone-400 ml-1.5 text-[12px]">
              ≈ {RESISTANCE_MIN_PER_SESSION} min · {sets} sets total
            </span>
          )}
        </span>
      </div>
      <div
        ref={ref}
        className="relative touch-none"
        style={{
          width: RES_W,
          height: RES_BAR_H,
          cursor: dragging ? 'grabbing' : 'pointer',
        }}
        onPointerDown={(e) => {
          if (!ref.current) return
          const rect = ref.current.getBoundingClientRect()
          setDragging(true)
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
          apply(e.clientX - rect.left - RES_PAD_X)
        }}
        onPointerMove={(e) => {
          if (!dragging || !ref.current) return
          apply(e.clientX - ref.current.getBoundingClientRect().left - RES_PAD_X)
        }}
        onPointerUp={(e) => {
          setDragging(false)
          ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            left: RES_PAD_X,
            top: 0,
            width: RES_INNER_W,
            height: RES_BAR_H,
            background: RES_TRACK,
            borderRadius: 5,
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            left: RES_PAD_X,
            top: 0,
            width: valuePx,
            height: RES_BAR_H,
            background: RES_FILL,
            borderRadius: 5,
          }}
        />
        {/* Tick marks at session boundaries — one tick per session.
            Hides the first/last (covered by track edge / handle). */}
        {Array.from(
          { length: Math.floor(RESISTANCE_MIN_MAX / RESISTANCE_MIN_PER_SESSION) - 1 },
          (_, i) => (i + 1) * RESISTANCE_MIN_PER_SESSION,
        ).map((t) => {
          const px = (t / RESISTANCE_MIN_MAX) * RES_INNER_W
          return (
            <div
              key={t}
              className="absolute pointer-events-none"
              style={{
                left: RES_PAD_X + px - 0.5,
                top: 4,
                width: 1,
                height: RES_BAR_H - 8,
                background: t <= minutes ? 'rgba(255,255,255,0.55)' : 'rgba(168,162,158,0.4)',
              }}
            />
          )
        })}
        <div
          className="absolute"
          style={{
            left: RES_PAD_X + valuePx - 3,
            top: -3,
            width: 6,
            height: RES_BAR_H + 6,
            background: '#fff',
            border: `1.5px solid ${RES_FILL}`,
            borderRadius: 3,
            cursor: 'ew-resize',
            pointerEvents: 'none',
          }}
        />
      </div>
      <div
        className="flex justify-between mt-1.5"
        style={{
          marginLeft: RES_PAD_X,
          marginRight: RES_PAD_X,
          fontSize: 10,
          color: '#a8a29e',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <span>0</span>
        <span>
          {Math.round(RESISTANCE_MIN_MAX / RESISTANCE_MIN_PER_SESSION)} sessions/wk
        </span>
      </div>
    </div>
  )
}

// ─── Supplementation lever (v2 — longevity only) ─────────────────
//
// Stack of toggle pills, one per supplement. Each emits a binary
// engine action (`supp_*`). Doses are fixed (encoded in the synthetic
// edges' rationale strings) — the user is just deciding what protocol
// to layer in.

const SUPP_W = 280
const SUPP_PILL_H = 30
const SUPP_PILL_GAP = 6
// Painterly palette — distinct supplement-style sage so it doesn't fight
// resistance (umber) or diet (gold).
const SUPP_FILL = '#7C9F8B' // muted sage
const SUPP_TRACK = '#eef2ec'
const SUPP_BORDER = '#d8e0d4'

function SupplementationLever<TId extends string>({
  supp,
  specs,
  onChange,
}: {
  supp: Record<TId, boolean>
  specs: readonly SupplementSpec<TId>[]
  onChange: (next: Record<TId, boolean>) => void
}) {
  const activeCount = specs.filter((s) => supp[s.id]).length

  return (
    <div className="select-none" style={{ width: SUPP_W }}>
      <div
        className="flex items-baseline justify-end mb-2"
        style={{ width: SUPP_W }}
      >
        <span
          className="text-[13px] text-stone-500"
          style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
        >
          {activeCount === 0 ? 'none' : `${activeCount} active`}
        </span>
      </div>
      <div className="flex flex-col" style={{ gap: SUPP_PILL_GAP }}>
        {specs.map((spec) => {
          const on = supp[spec.id]
          return (
            <button
              key={spec.id}
              type="button"
              onClick={() =>
                onChange({ ...supp, [spec.id]: !on } as Record<TId, boolean>)
              }
              className="relative flex items-center justify-between cursor-pointer transition-colors"
              style={{
                width: SUPP_W,
                height: SUPP_PILL_H,
                background: on ? SUPP_FILL : SUPP_TRACK,
                border: `1px solid ${on ? SUPP_FILL : SUPP_BORDER}`,
                borderRadius: 6,
                padding: '0 12px',
                fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: on ? '#fff' : '#44403c',
                  letterSpacing: '-0.005em',
                }}
              >
                {spec.label}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: on ? 'rgba(255,255,255,0.85)' : '#a8a29e',
                  letterSpacing: '0.01em',
                }}
              >
                {spec.dose}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Solver — find lever values that best move a chosen outcome ──
//
// Coordinate descent over the active lever set's canonical actions.
// Runs `runFullCounterfactual` once per candidate move per iteration,
// picks the best signed-delta move on the goal outcome, and keeps going
// until no move improves things.
//
// All operations are on a flat `actionValues: Record<string, number>`
// dict in canonical-action space, so the solver doesn't need to know
// about LeverId structure. We translate AllState → action dict to
// initialize, and action dict → AllState (`applyActionsToState`) when
// the solver finishes.

interface ActionRangeSpec {
  min: number
  max: number
  step: number
}

const ACTION_RANGES: Record<string, ActionRangeSpec> = {
  // Steps (Z1 NEAT) — solver bounds. The standalone StepsLever was
  // removed; Z1 minutes/day flows through CompactHRDial's outer ring.
  steps: { min: 0, max: 15000, step: 500 },
  zone2_minutes: { min: 0, max: 90, step: 5 },
  zone4_5_minutes: { min: 0, max: 30, step: 2 },
  caffeine_mg: { min: 0, max: 400, step: 25 },
  caffeine_timing: { min: 0, max: 14, step: 0.5 },
  alcohol_units: { min: 0, max: 5, step: 0.5 },
  alcohol_timing: { min: 0, max: 8, step: 0.5 },
  dietary_protein: { min: 50, max: DIET_PROTEIN_G_MAX, step: DIET_PROTEIN_G_STEP },
  dietary_energy: {
    min: DIET_TOTAL_KCAL_MIN,
    max: DIET_TOTAL_KCAL_MAX,
    step: DIET_TOTAL_KCAL_STEP,
  },
  bedtime: { min: 20, max: 26, step: 0.25 },
  sleep_duration: { min: SLEEP_HOURS_MIN, max: SLEEP_HOURS_MAX, step: SLEEP_HOURS_STEP },
  sleep_quality: {
    min: SLEEP_QUALITY_MIN,
    max: SLEEP_QUALITY_MAX,
    step: SLEEP_QUALITY_STEP,
  },
  bedroom_temp_c: {
    min: BEDROOM_TEMP_C_MIN,
    max: BEDROOM_TEMP_C_MAX,
    step: BEDROOM_TEMP_C_STEP,
  },
  resistance_training_minutes: {
    min: RESISTANCE_MIN_MIN,
    max: RESISTANCE_MIN_MAX,
    step: RESISTANCE_MIN_STEP,
  },
  // Supplements are binary — solver flips between 0 and 1.
  supp_omega3: { min: 0, max: 1, step: 1 },
  supp_magnesium: { min: 0, max: 1, step: 1 },
  supp_vitamin_d: { min: 0, max: 1, step: 1 },
  supp_b_complex: { min: 0, max: 1, step: 1 },
  supp_creatine: { min: 0, max: 1, step: 1 },
  supp_melatonin: { min: 0, max: 1, step: 1 },
  supp_l_theanine: { min: 0, max: 1, step: 1 },
  supp_zinc: { min: 0, max: 1, step: 1 },
}

/** Inverse of LEVER_ACTIONS.valuesFor — given a flat action dict, fold
 *  the values back into AllState shape. Only updates fields whose
 *  controlling action is present in `actions`. */
function applyActionsToState(
  state: AllState,
  actions: Record<string, number>,
  regime: Regime,
): AllState {
  const next: AllState = {
    ...state,
    hrValues: [...state.hrValues] as [number, number, number],
    caffeine: { ...state.caffeine },
    alcohol: { ...state.alcohol },
    sleep: { ...state.sleep },
    diet: { ...state.diet },
    supp: { ...state.supp },
    sleepSupp: { ...state.sleepSupp },
  }
  if ('steps' in actions) next.hrValues[0] = actions.steps / 100
  if ('zone2_minutes' in actions) next.hrValues[1] = actions.zone2_minutes
  if ('zone4_5_minutes' in actions) next.hrValues[2] = actions.zone4_5_minutes
  if ('caffeine_mg' in actions) next.caffeine.amount = actions.caffeine_mg / 95
  if ('caffeine_timing' in actions) next.caffeine.cutoff = actions.caffeine_timing
  if ('alcohol_units' in actions) next.alcohol.amount = actions.alcohol_units
  if ('alcohol_timing' in actions) next.alcohol.cutoff = actions.alcohol_timing
  if ('dietary_protein' in actions) next.diet.proteinG = actions.dietary_protein
  if ('dietary_energy' in actions) next.diet.totalKcal = actions.dietary_energy
  if ('resistance_training_minutes' in actions)
    next.resistanceMin = actions.resistance_training_minutes
  if (regime === 'longevity') {
    if ('sleep_duration' in actions) next.sleep.hours = actions.sleep_duration
    if ('sleep_quality' in actions) next.sleep.quality = actions.sleep_quality
  } else {
    if ('bedtime' in actions) next.sleep.bedtime = actions.bedtime
    if ('bedroom_temp_c' in actions) next.sleep.bedroomTempC = actions.bedroom_temp_c
    // sleep_duration in quotidian == wake - bedtime; recover wake.
    if ('sleep_duration' in actions) {
      next.sleep.wake = (next.sleep.bedtime + actions.sleep_duration) % 24
    }
  }
  for (const spec of SUPPLEMENTS) {
    if (spec.action in actions) {
      next.supp[spec.id] = actions[spec.action] >= 0.5
    }
  }
  for (const spec of QUOTIDIAN_SUPPLEMENTS) {
    if (spec.action in actions) {
      next.sleepSupp[spec.id] = actions[spec.action] >= 0.5
    }
  }
  return next
}

interface SolverState {
  goalOutcomeId: string
  isRunning: boolean
  /** Cached AllState snapshot taken when the solver was launched, so
   *  Cancel / Exit can restore it cleanly. */
  preSolveState: AllState
}

// ─── Hover card for outcome chits ────────────────────────────────
//
// Painterly tooltip rendered above the chit on hover. Replaces the
// native browser title with a structured panel: header (label + tone
// pill + confidence pill) → divider → outcome description → optional
// posterior-band footer. Includes a tiny ▼ pointer below the panel so
// the eye sticks to the chit it's annotating.

function OutcomeHoverCard({
  outcome,
  conf,
  confColor,
  confTitle,
  showBand,
}: {
  outcome: OutcomeWithDelta
  conf: 'high' | 'med' | 'low' | 'lit'
  confColor: string
  confTitle: string
  showBand: boolean
}) {
  const tc = TONE_TEXT[outcome.tone]
  const eps = Math.pow(10, -outcome.decimals - 1)
  const hasDelta = Math.abs(outcome.delta) > eps
  const after = outcome.baseline + outcome.delta
  const beneficialLabel = outcome.beneficial === 'higher' ? 'higher is better' : 'lower is better'
  const confLabel: Record<typeof conf, string> = {
    high: 'Tight posterior',
    med: 'Partial posterior',
    low: 'Wide posterior',
    lit: 'Prior only',
  }
  return (
    <div
      role="tooltip"
      className="absolute pointer-events-none"
      style={{
        bottom: 'calc(100% + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 280,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 14,
        boxShadow:
          '0 12px 28px rgba(28, 25, 23, 0.14), 0 2px 6px rgba(28, 25, 23, 0.06)',
        padding: '12px 14px 13px',
        textAlign: 'left',
        fontFamily: 'Inter, sans-serif',
        zIndex: 50,
      }}
    >
      {/* Header: label + beneficial-direction pill */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#1c1917',
            letterSpacing: '-0.01em',
          }}
        >
          {outcome.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: '#a8a29e',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {beneficialLabel}
        </span>
      </div>

      {/* Current → projected snippet (only if there's actually movement) */}
      {hasDelta && (
        <div
          className="flex items-baseline gap-2 mb-2 tabular-nums"
          style={{ fontSize: 11, color: '#78716c' }}
        >
          <span>
            {fmt(outcome.baseline, outcome.decimals)}
            {outcome.unit && ' ' + outcome.unit}
          </span>
          <span style={{ color: '#d6d3d1' }}>→</span>
          <span style={{ color: tc, fontWeight: 500 }}>
            {fmt(after, outcome.decimals)}
            {outcome.unit && ' ' + outcome.unit}
          </span>
          <span style={{ color: tc, marginLeft: 'auto', fontWeight: 500 }}>
            {signed(outcome.delta, outcome.decimals)}
            {outcome.unit && (
              <span style={{ fontSize: 9, marginLeft: 1, opacity: 0.7 }}>
                {outcome.unit}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, #ede5d2, transparent)',
          marginBottom: 9,
        }}
      />

      {/* Description body */}
      <div
        style={{
          fontSize: 11,
          color: '#5b524a',
          lineHeight: 1.55,
        }}
      >
        {outcome.description}
      </div>

      {/* Footer pills — confidence + posterior band */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        <span
          title={confTitle}
          className="inline-flex items-center gap-1 rounded-full"
          style={{
            background: conf === 'lit' ? '#fafaf9' : `${confColor}1f`,
            border: `1px solid ${conf === 'lit' ? '#e7e5e4' : confColor + '55'}`,
            padding: '2px 8px',
            fontSize: 9.5,
            color: conf === 'lit' ? '#78716c' : confColor,
            fontWeight: 500,
            letterSpacing: '0.01em',
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{
              width: 5,
              height: 5,
              background: conf === 'lit' ? 'transparent' : confColor,
              border: conf === 'lit' ? `1px dashed ${confColor}` : 'none',
            }}
          />
          {confLabel[conf]}
        </span>
        {showBand && outcome.afterLow != null && outcome.afterHigh != null && (
          <span
            className="inline-flex items-center rounded-full tabular-nums"
            style={{
              background: '#f5f0e3',
              border: '1px solid #ebe2cb',
              padding: '2px 8px',
              fontSize: 9.5,
              color: '#7a6b48',
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            BART 90% · {fmt(outcome.afterLow, outcome.decimals)}–
            {fmt(outcome.afterHigh, outcome.decimals)}
            {outcome.unit ? ' ' + outcome.unit : ''}
          </span>
        )}
      </div>

      {/* Cross-tab navigation — pointer-events:auto so the link chips
          remain clickable even though the card itself is pointer-events:
          none. */}
      <div
        className="mt-2 pt-2 border-t border-stone-100"
        style={{ pointerEvents: 'auto' }}
      >
        <CrossTabLinks outcome={outcome.id} exclude={['twin']} compact />
      </div>

      {/* Pointer ▼ stitched onto the bottom of the card so it visually
          points at the chit underneath. */}
      <div
        aria-hidden
        className="absolute"
        style={{
          left: '50%',
          bottom: -6,
          transform: 'translateX(-50%) rotate(45deg)',
          width: 10,
          height: 10,
          background: '#fff',
          borderRight: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
        }}
      />
    </div>
  )
}

function OutcomeBubble({
  outcome,
  width = 120,
  onOptimize,
  isOptimizing = false,
  isGoal = false,
  isHighlighted = false,
  onClick,
  isSelected = false,
}: {
  outcome: OutcomeWithDelta
  width?: number
  onOptimize?: (outcomeId: string) => void
  /** When true, the spinner replaces the optimize icon. */
  isOptimizing?: boolean
  /** When true, this is the outcome the active solver is targeting —
   *  bubble draws a soft halo so the user can see what's being moved. */
  isGoal?: boolean
  /** When true, the chit was deep-linked to (e.g. arrived via
   *  `/twin?outcome=hrv_daily` from Insights or Fingerprint) — same
   *  sage halo as `isGoal`, but applied transiently as a deep-link
   *  acknowledgement rather than as an active solver target. */
  isHighlighted?: boolean
  /** Click handler — opens the per-outcome detail panel. */
  onClick?: (outcomeId: string) => void
  /** True when this is the chit the detail panel is currently open for. */
  isSelected?: boolean
}) {
  const after = outcome.baseline + outcome.delta
  const hasDelta = Math.abs(outcome.delta) > Math.pow(10, -outcome.decimals - 1)
  const tc = TONE_TEXT[outcome.tone]
  // Only surface the BART band when it's wider than the displayed
  // precision — sub-precision spreads would render as ±0 and just add
  // noise.
  const eps = Math.pow(10, -outcome.decimals - 1)
  const showBand =
    outcome.bandHalf != null && outcome.bandHalf > eps
  const optimizeVerb = outcome.beneficial === 'lower' ? 'Lower' : 'Raise'

  // ─── Confidence classification ──
  // Tight band relative to the delta = "this prediction is well
  // identified". We bucket into 3 levels so the badge stays scannable.
  // No band → literature-only edges (no per-participant posterior). We
  // mark those distinctly so the user knows the difference.
  const conf: 'high' | 'med' | 'low' | 'lit' = (() => {
    if (outcome.bandHalf == null) return 'lit'
    if (!hasDelta) return outcome.bandHalf < eps * 5 ? 'high' : 'med'
    const ratio = outcome.bandHalf / Math.max(eps, Math.abs(outcome.delta))
    if (ratio < 0.5) return 'high'
    if (ratio < 1.0) return 'med'
    return 'low'
  })()
  const confColor: Record<typeof conf, string> = {
    high: '#7C9F8B', // sage — confident
    med: '#D4A857', // serif gold — partial
    low: '#C76B4D', // terracotta — wide band
    lit: '#9CA3AF', // stone — literature-only
  }
  const confTitle: Record<typeof conf, string> = {
    high: 'Tight posterior band relative to projected delta',
    med: 'Partial posterior: band overlaps roughly half the projected delta',
    low: 'Wide posterior band relative to projected delta',
    lit: 'Prior-only: no per-participant posterior yet',
  }
  // ─── Hover tooltip state ──
  // Suppressed when the detail panel is open for this chit (isSelected)
  // or when the solver is targeting this outcome (isGoal) — both states
  // already surface richer info that the hover would just duplicate.
  const [hovered, setHovered] = useState(false)
  const showTooltip = hovered && !isSelected && !isGoal

  return (
    <div
      onClick={onClick ? () => onClick(outcome.id) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width,
        textAlign: 'center',
        background: '#fff',
        border: `1px solid ${
          isSelected
            ? '#5C7B6B'
            : isGoal || isHighlighted
              ? '#7C9F8B'
              : BORDER
        }`,
        borderRadius: 22,
        padding: '8px 10px',
        cursor: onClick ? 'pointer' : 'help',
        position: 'relative',
        boxShadow: isSelected
          ? '0 0 0 3px rgba(92,123,107,0.22), 0 4px 16px rgba(92,123,107,0.18)'
          : isGoal || isHighlighted
            ? '0 0 0 3px rgba(124,159,139,0.18), 0 4px 16px rgba(124,159,139,0.18)'
            : 'none',
        transition: 'box-shadow 200ms ease, border-color 200ms ease',
      }}
    >
      {showTooltip && (
        <OutcomeHoverCard
          outcome={outcome}
          conf={conf}
          confColor={confColor[conf]}
          confTitle={confTitle[conf]}
          showBand={showBand}
        />
      )}
      {/* Confidence dot — top-left. Uses BART posterior bandwidth
          relative to the projected delta to bucket high/med/low; falls
          back to "lit" (literature-only) when no band is available. */}
      <div
        className="absolute"
        style={{
          top: 6,
          left: 6,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: conf === 'lit' ? 'transparent' : confColor[conf],
          border: conf === 'lit' ? `1px dashed ${confColor[conf]}` : 'none',
        }}
      />
      {/* Optimize trigger — small sparkle in the top-right corner.
          Replaced by a spinner while the solver is iterating on this
          outcome. */}
      {onOptimize && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOptimize(outcome.id)
          }}
          title={`${optimizeVerb} ${outcome.label}`}
          className="absolute"
          style={{
            top: 4,
            right: 4,
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isGoal ? 'rgba(124,159,139,0.12)' : 'transparent',
            border: 'none',
            borderRadius: 11,
            cursor: 'pointer',
            color: isGoal ? '#5C7B6B' : '#a8a29e',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background =
              'rgba(124,159,139,0.18)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#5C7B6B'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = isGoal
              ? 'rgba(124,159,139,0.12)'
              : 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = isGoal
              ? '#5C7B6B'
              : '#a8a29e'
          }}
        >
          {isOptimizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
        </button>
      )}
      <div
        className="leading-none"
        style={{
          fontSize: 11,
          color: '#78716c',
          fontFamily: 'Inter, sans-serif',
          marginBottom: 5,
        }}
      >
        <GlossaryTerm termId={outcome.id} display={outcome.label} />
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
          {/* Sub: the new value + posterior band when available. */}
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
            {showBand && (
              <span style={{ marginLeft: 4, opacity: 0.85 }}>
                ± {fmt(outcome.bandHalf!, outcome.decimals)}
              </span>
            )}
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
              regime={regime}
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
      case 'resistance': {
        const resNaturalH = 80
        const resW = RES_W * dietScale
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: x - resW / 2,
              top: topY + (hrSize - resNaturalH * dietScale) / 2,
            }}
          >
            <ScaledBox width={RES_W} height={resNaturalH} scale={dietScale}>
              <ResistanceLever
                minutes={state.resistanceMin}
                onChange={(m) =>
                  setState((s) => ({ ...s, resistanceMin: m }))
                }
              />
            </ScaledBox>
          </div>
        )
      }
      case 'supplementation': {
        // Stack height: header readout + 5 pills + 4 gaps.
        const suppNaturalH =
          24 + SUPPLEMENTS.length * SUPP_PILL_H + (SUPPLEMENTS.length - 1) * SUPP_PILL_GAP
        const suppW = SUPP_W * dietScale
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: x - suppW / 2,
              top: topY + (hrSize - suppNaturalH * dietScale) / 2,
            }}
          >
            <ScaledBox width={SUPP_W} height={suppNaturalH} scale={dietScale}>
              <SupplementationLever
                supp={state.supp}
                specs={SUPPLEMENTS}
                onChange={(next) => setState((s) => ({ ...s, supp: next }))}
              />
            </ScaledBox>
          </div>
        )
      }
      case 'sleep_supplementation': {
        const sleepSuppNaturalH =
          24 + QUOTIDIAN_SUPPLEMENTS.length * SUPP_PILL_H +
          (QUOTIDIAN_SUPPLEMENTS.length - 1) * SUPP_PILL_GAP
        const suppW = SUPP_W * dietScale
        return (
          <div
            key={id}
            className="absolute"
            style={{
              left: x - suppW / 2,
              top: topY + (hrSize - sleepSuppNaturalH * dietScale) / 2,
            }}
          >
            <ScaledBox width={SUPP_W} height={sleepSuppNaturalH} scale={dietScale}>
              <SupplementationLever
                supp={state.sleepSupp}
                specs={QUOTIDIAN_SUPPLEMENTS}
                onChange={(next) =>
                  setState((s) => ({ ...s, sleepSupp: next }))
                }
              />
            </ScaledBox>
          </div>
        )
      }
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
              top: topY + (hrSize - QUOTIDIAN_SLEEP_NATURAL_H * sleepScale) / 2,
            }}
          >
            <ScaledBox width={400} height={QUOTIDIAN_SLEEP_NATURAL_H} scale={sleepScale}>
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
              <BedroomTemperatureLever
                value={state.sleep.bedroomTempC}
                onChange={(bedroomTempC) =>
                  setState((s) => ({
                    ...s,
                    sleep: { ...s.sleep, bedroomTempC },
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

interface AnchorPoint {
  x: number
  y: number
}

interface LeverAnchorInfo {
  /** Center anchor — used by any edge whose action doesn't have a sub-anchor. */
  center: AnchorPoint
  /** Per-canonical-action sub-anchors. Populated for HR (three zone
   *  columns) so each zone's edges fan out from their legend cell. */
  perAction?: Record<string, AnchorPoint>
}

type LeverAnchors = Partial<Record<LeverId, LeverAnchorInfo>>

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
  const sleepNaturalH = regime === 'longevity' ? 100 : QUOTIDIAN_SLEEP_NATURAL_H
  const suppNaturalH =
    24 + SUPPLEMENTS.length * SUPP_PILL_H + (SUPPLEMENTS.length - 1) * SUPP_PILL_GAP
  const sleepSuppNaturalH =
    24 + QUOTIDIAN_SUPPLEMENTS.length * SUPP_PILL_H +
    (QUOTIDIAN_SUPPLEMENTS.length - 1) * SUPP_PILL_GAP
  const out: LeverAnchors = {}
  for (const id of leverSet) {
    const x = positions[id]
    if (x == null) continue
    let y = topY + hrSize + HR_LEGEND_H - 4 // dial + zone legend
    if (id === 'caffeine' || id === 'alcohol') y = topY + 170 * decayScale - 4
    else if (id === 'diet') y = topY + (hrSize + dietNaturalH * dietScale) / 2 + 4
    else if (id === 'resistance')
      y = topY + (hrSize + 80 * dietScale) / 2 + 4
    else if (id === 'supplementation')
      y = topY + (hrSize + suppNaturalH * dietScale) / 2 + 4
    else if (id === 'sleep_supplementation')
      y = topY + (hrSize + sleepSuppNaturalH * dietScale) / 2 + 4
    else if (id === 'sleep')
      y = topY + (hrSize + sleepNaturalH * sleepScale) / 2 + 4

    const info: LeverAnchorInfo = { center: { x, y } }

    // HR: three zone columns in the legend row, each ~hrSize/3 wide.
    // Give each zone's canonical action its own anchor at the center of
    // its legend cell so edges fan out from distinct origins.
    if (id === 'hr') {
      const colW = hrSize / 3
      const left = x - hrSize / 2
      info.perAction = {
        steps: { x: left + colW * 0.5, y },
        zone2_minutes: { x: left + colW * 1.5, y },
        zone4_5_minutes: { x: left + colW * 2.5, y },
      }
    }
    out[id] = info
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
  sleep_supplementation: 'Sleep aids',
  resistance: 'Resistance',
  supplementation: 'Supplements',
}

/** Per-regime label override — currently only HR shifts (TRIMP / day vs
 *  TRIMP / wk so the score in the dial center reads in the same unit
 *  the heading promises). All other levers stay regime-agnostic. */
function leverLabelFor(id: LeverId, regime: Regime): string {
  if (id === 'hr') return regime === 'longevity' ? 'TRIMP / wk' : 'TRIMP / day'
  return LEVER_LABEL[id]
}

// ─── Painterly canvas (for either regime) ─────────────────────────

interface PainterlyCanvasProps {
  state: AllState
  setState: React.Dispatch<React.SetStateAction<AllState>>
  regime: Regime
  participant: ParticipantPortal
  /** Human label for the participant — passed through to saved snapshots
   *  so the protocols list renders names instead of pids. */
  participantLabel?: string | null
  equations: StructuralEquation[]
  runFullCounterfactual: (
    observedValues: Record<string, number>,
    interventions: Intervention[],
  ) => FullCounterfactualState
  /** Outcome id to highlight transiently — set when the user arrives
   *  via /twin?outcome=<id> from another tab. Cleared by the parent
   *  after a few seconds. */
  highlightOutcomeId?: string | null
}

function PainterlyCanvas({
  state,
  setState,
  regime,
  participant,
  participantLabel,
  equations,
  runFullCounterfactual,
  highlightOutcomeId,
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

  // Horizon comes from the cross-tab scope store — set in the page
  // header's ScopeBar. The scope store snaps the horizon to a regime-
  // appropriate default whenever the user changes regime, so the Twin
  // doesn't need its own snap-back effect.
  const atDays = useScopeStore((s) => s.atDays)

  // ─── BART posterior bands ─────────────────────────────────────
  // Async MC pass: when bands are ready they get folded into the
  // outcome chits as ± half-spread. Solver / point estimates ignore
  // bands so behavior stays deterministic.
  const { status: bartStatus, runMC: runBartMC } = useBartTwin()
  const [mcState, setMcState] = useState<MCFullCounterfactualState | null>(null)
  const interventionsForBart = useMemo(
    () => buildInterventionsFor(state, regime, observedBaseline, leverSet),
    [state, regime, observedBaseline, leverSet],
  )
  useEffect(() => {
    if (bartStatus !== 'ready' || interventionsForBart.length === 0) {
      setMcState(null)
      return
    }
    let cancelled = false
    runBartMC(observedBaseline, interventionsForBart)
      .then((result) => {
        if (cancelled) return
        setMcState(result)
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[TwinV2] BART MC failed:', err)
        setMcState(null)
      })
    return () => {
      cancelled = true
    }
  }, [bartStatus, observedBaseline, interventionsForBart, runBartMC])

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
        mcState,
      ),
    [baseOutcomes, state, regime, leverSet, observedBaseline, outcomeBaselines, atDays, runFullCounterfactual, mcState],
  )

  // ─── Solver state ─────────────────────────────────────────────────
  const [solver, setSolver] = useState<SolverState | null>(null)
  // Cancellation token: bumped every time the solver should stop early
  // (cancel button, regime switch, participant change). The async loop
  // checks this between iterations.
  const solverGenRef = useRef(0)

  const baseOutcomesById = useMemo(() => {
    const m: Record<string, Outcome> = {}
    for (const o of baseOutcomes) m[o.id] = o
    return m
  }, [baseOutcomes])

  /** Run the engine once and return the *signed* projected delta on the
   *  goal outcome — positive means "improvement in the desired direction".
   *  This is the score the coordinate-descent loop maximizes. */
  const scoreFor = useCallback(
    (trial: AllState, goalOutcomeId: string): number => {
      const interventions = buildInterventionsFor(
        trial,
        regime,
        observedBaseline,
        leverSet,
      )
      let delta = 0
      if (interventions.length > 0) {
        const cf = runFullCounterfactual(observedBaseline, interventions)
        const states = outcomeStatesAt(
          cf,
          atDays,
          new Set([goalOutcomeId]),
          outcomeBaselines,
        )
        delta = states.get(goalOutcomeId)?.delta ?? 0
      }
      const goal = baseOutcomesById[goalOutcomeId]
      if (!goal) return 0
      // Flip sign for "lower is better" so we always maximize. See
      // optimizationScore + insightStandardization.test.ts for the
      // regression guard against the "cortisol pushed UP" bug class.
      return optimizationScore(delta, goal.beneficial)
    },
    [
      regime,
      observedBaseline,
      leverSet,
      runFullCounterfactual,
      atDays,
      outcomeBaselines,
      baseOutcomesById,
    ],
  )

  /** Coordinate descent over the active lever set's canonical actions.
   *  At each iteration: try moving every action by ±step, pick the move
   *  with the largest score gain, commit it, render via setState, then
   *  yield to the event loop so the user sees the lever animate. Stops
   *  when no move improves things or after maxIter iterations. */
  const startSolve = useCallback(
    async (goalOutcomeId: string) => {
      // Cancel any prior solve in flight.
      solverGenRef.current += 1
      const myGen = solverGenRef.current

      const preSolveState = state
      setSolver({ goalOutcomeId, isRunning: true, preSolveState })

      // Active actions = union of every action emitted by the active
      // levers, intersected with our ACTION_RANGES table. (Skips the few
      // legacy actions like `bedtime` in longevity mode.)
      const activeActions: string[] = []
      for (const lever of leverSet) {
        for (const action of LEVER_ACTIONS[lever].actions) {
          if (!ACTION_RANGES[action]) continue
          if (regime === 'longevity' && action === 'bedtime') continue
          if (regime === 'longevity' && action === 'bedroom_temp_c') continue
          if (regime === 'quotidian' && action === 'sleep_quality') continue
          activeActions.push(action)
        }
      }

      let current = state
      let bestScore = scoreFor(current, goalOutcomeId)
      const maxIter = 30

      for (let iter = 0; iter < maxIter; iter++) {
        if (solverGenRef.current !== myGen) return // cancelled

        let bestMove: { action: string; value: number } | null = null
        let bestGain = 0
        const stepScale = 1 + Math.floor(iter / 8)

        // Build the trial action dict for `current` once; then perturb
        // one entry at a time.
        const currentActions: Record<string, number> = {}
        for (const lever of leverSet) {
          const vals = LEVER_ACTIONS[lever].valuesFor(current, regime)
          for (const [k, v] of Object.entries(vals)) {
            currentActions[k] = v
          }
        }

        for (const action of activeActions) {
          const range = ACTION_RANGES[action]
          if (!range) continue
          const cv = currentActions[action] ?? 0
          for (const dir of [-1, 1] as const) {
            const candidate = Math.max(
              range.min,
              Math.min(range.max, cv + dir * range.step * stepScale),
            )
            if (Math.abs(candidate - cv) < 1e-9) continue
            const trialActions = { ...currentActions, [action]: candidate }
            const trial = applyActionsToState(current, trialActions, regime)
            const trialScore = scoreFor(trial, goalOutcomeId)
            const gain = trialScore - bestScore
            // Tiny travel-cost tiebreaker, scaled to action range so
            // binary supplements aren't disproportionately penalized.
            const travelCost =
              Math.abs(candidate - cv) / Math.max(1e-9, range.max - range.min)
            const adjusted = gain - travelCost * 0.001
            if (adjusted > bestGain) {
              bestGain = adjusted
              bestMove = { action, value: candidate }
            }
          }
        }

        if (!bestMove) break
        const nextActions = { ...currentActions, [bestMove.action]: bestMove.value }
        current = applyActionsToState(current, nextActions, regime)
        bestScore += bestGain

        // Push to the parent so the canvas animates the new lever
        // values in real time. Yield so React paints between iters.
        setState(current)
        await new Promise((r) => setTimeout(r, 50))
      }

      if (solverGenRef.current === myGen) {
        setSolver((s) => (s ? { ...s, isRunning: false } : s))
      }
    },
    [state, leverSet, regime, scoreFor, setState],
  )

  const cancelSolve = useCallback(() => {
    solverGenRef.current += 1
    if (solver) {
      setState(solver.preSolveState)
      setSolver(null)
    }
  }, [solver, setState])

  const acceptSolve = useCallback(() => {
    solverGenRef.current += 1
    setSolver(null)
  }, [])

  // Cancel any in-flight solve when regime / participant changes.
  useEffect(() => {
    solverGenRef.current += 1
    setSolver(null)
    setSelectedOutcomeId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regime, participant.pid])

  // ─── Outcome detail panel state ──────────────────────────────────
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null)
  const selectedOutcome = useMemo(
    () => outcomes.find((o) => o.id === selectedOutcomeId) ?? null,
    [outcomes, selectedOutcomeId],
  )

  // ─── Methodology pill state ──────────────────────────────────────
  // (Stats computed below, after `edges` is declared.)
  const [methodologyOpen, setMethodologyOpen] = useState(false)

  // ─── Snapshot capture ────────────────────────────────────────────
  const addSnapshot = useTwinSnapshotStore((s) => s.add)
  const navigate = useNavigate()
  const [saveFlash, setSaveFlash] = useState<string | null>(null)
  const saveSnapshot = useCallback(() => {
    const interventions = buildInterventionsFor(
      state,
      regime,
      observedBaseline,
      leverSet,
    )
    if (interventions.length === 0) {
      setSaveFlash('Tune at least one lever before saving.')
      window.setTimeout(() => setSaveFlash(null), 2400)
      return
    }
    const dateStr = new Date().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    const snapshot: TwinSnapshot = {
      id: newSnapshotId(),
      label: `${regime === 'longevity' ? 'Longevity' : 'Quotidian'} protocol — ${dateStr}`,
      participantPid: participant.pid,
      participantName: participantLabel ?? undefined,
      regime,
      atDays,
      createdAt: Date.now(),
      interventions: interventions.map((iv) => ({
        nodeId: iv.nodeId,
        originalValue: iv.originalValue,
        value: iv.value,
      })),
      outcomes: outcomes
        .filter((o) => Math.abs(o.delta) > Math.pow(10, -o.decimals - 1))
        .map((o) => ({
          id: o.id,
          label: o.label,
          unit: o.unit,
          decimals: o.decimals,
          baseline: o.baseline,
          delta: o.delta,
          tone: o.tone,
          bandHalf: o.bandHalf,
        })),
      // Store a JSON-safe lever-state copy so a future "Load this protocol"
      // can rehydrate the canvas exactly. (Reload UX is Phase 2c+.)
      leverState: JSON.parse(JSON.stringify(state)) as Record<string, unknown>,
    }
    addSnapshot(snapshot)
    setSaveFlash(`Saved → ${snapshot.outcomes.length} outcome${snapshot.outcomes.length === 1 ? '' : 's'} captured`)
    window.setTimeout(() => setSaveFlash(null), 2400)
  }, [
    state,
    regime,
    observedBaseline,
    leverSet,
    participant,
    atDays,
    outcomes,
    addSnapshot,
  ])
  const outcomeIdSet = useMemo(
    () => new Set(baseOutcomes.map((o) => o.id)),
    [baseOutcomes],
  )
  const edges = useMemo(
    () => deriveEdgesFromEquations(equations, leverSet, outcomeIdSet),
    [equations, leverSet, outcomeIdSet],
  )

  // ─── Methodology pill stats (depends on `edges`) ────────────────
  const evidenceStats = useMemo(() => {
    const fittedEdges = edges.filter((e) => e.provenance === 'fitted').length
    const literatureEdges = edges.length - fittedEdges
    const evidenceByKey = new Map<string, { personalization: number; weight: number }>()
    for (const edge of participant.effects_bayesian ?? []) {
      evidenceByKey.set(
        `${edge.action}|${canonicalOutcomeKey(edge.outcome)}`,
        {
          personalization: personalizationForEdge(edge),
          weight: edgeWeight(edge),
        },
      )
    }
    let personalizationWeighted = 0
    let weightSum = 0
    for (const edge of edges) {
      const evidence = evidenceByKey.get(`${edge.action}|${edge.outcomeId}`)
      if (!evidence) continue
      personalizationWeighted += evidence.personalization * evidence.weight
      weightSum += evidence.weight
    }
    const personalPct = weightSum > 0 ? Math.round((personalizationWeighted / weightSum) * 100) : 0
    const drivenIds = new Set(edges.map((e) => e.outcomeId))
    const undriven = outcomes
      .filter((o) => !drivenIds.has(o.id))
      .map((o) => o.label)
    return { fittedEdges, literatureEdges, personalPct, undriven }
  }, [edges, outcomes, participant.effects_bayesian])

  // Lightweight DevTools diagnostic — logs once per (regime, leverSet)
  // change. Use to verify that an action like zone4_5_minutes actually
  // has equations in the engine for the current regime's outcomes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!(window as unknown as { __twinDebug?: boolean }).__twinDebug) return
    const byLever: Record<string, string[]> = {}
    for (const { leverId, action, outcomeId } of edges) {
      ;(byLever[leverId] ??= []).push(`${action}→${outcomeId}`)
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
        {edges.map(({ leverId, action, outcomeId, provenance }) => {
          const info = anchors[leverId]
          if (!info) return null  // lever not in this regime's active set
          // Per-action sub-anchor when available (HR zones); fall back
          // to the lever center for everyone else.
          const a = info.perAction?.[action] ?? info.center
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
          // Literature-only edges get a slight opacity discount —
          // they're real evidence but weaker than per-cohort fits.
          const provFactor = provenance === 'fitted' ? 1 : 0.78
          return (
            <g key={`${leverId}-${action}-${outcomeId}`}>
              {/* Wide soft halo */}
              <path
                d={path}
                stroke={stroke}
                strokeWidth={isActive ? 7 : 4}
                fill="none"
                opacity={(isActive ? 0.18 : 0.08) * provFactor}
                filter="url(#paint-blur)"
              />
              {/* Mid stroke */}
              <path
                d={path}
                stroke={stroke}
                strokeWidth={isActive ? 2.5 : 1.5}
                fill="none"
                opacity={(isActive ? 0.42 : 0.22) * provFactor}
              />
              {/* Inner crisp line — literature-only edges use a dashed
                  pattern so the user can read provenance straight from
                  the canvas without a legend. */}
              <path
                d={path}
                stroke={stroke}
                strokeWidth={isActive ? 0.9 : 0.5}
                fill="none"
                opacity={(isActive ? 0.95 : 0.5) * provFactor}
                strokeDasharray={provenance === 'fitted' ? undefined : '3 3'}
              />
            </g>
          )
        })}
      </svg>

      {leverSet.map((id) => {
        const x = positions[id]
        if (x == null) return null
        return (
          <LeverHeader
            key={id}
            label={leverLabelFor(id, regime)}
            x={x}
            y={HEADER_Y}
          />
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
          <OutcomeBubble
            outcome={o}
            width={outcomeBubbleW}
            onOptimize={solver?.isRunning ? undefined : startSolve}
            isOptimizing={solver?.isRunning && solver.goalOutcomeId === o.id}
            isGoal={solver != null && solver.goalOutcomeId === o.id}
            isHighlighted={
              highlightOutcomeId === o.id && solver?.goalOutcomeId !== o.id
            }
            onClick={(id) =>
              setSelectedOutcomeId((prev) => (prev === id ? null : id))
            }
            isSelected={selectedOutcomeId === o.id}
          />
        </div>
      ))}

      {selectedOutcome && (
        <OutcomeDetailPanel
          outcome={selectedOutcome}
          equations={equations}
          atDays={atDays}
          leverSet={leverSet}
          onClose={() => setSelectedOutcomeId(null)}
        />
      )}

      <MethodologyPill
        fittedEdges={evidenceStats.fittedEdges}
        literatureEdges={evidenceStats.literatureEdges}
        personalPct={evidenceStats.personalPct}
        undrivenOutcomes={evidenceStats.undriven}
        regime={regime}
        atDays={atDays}
        open={methodologyOpen}
        onToggle={() => setMethodologyOpen((v) => !v)}
      />

      {solver && (
        <SolverBanner
          goalLabel={baseOutcomesById[solver.goalOutcomeId]?.label ?? solver.goalOutcomeId}
          isRunning={solver.isRunning}
          goalOutcome={
            outcomes.find((o) => o.id === solver.goalOutcomeId) ?? null
          }
          onApply={acceptSolve}
          onCancel={cancelSolve}
        />
      )}

      {/* Save → Protocol — top-right corner */}
      <div
        className="absolute flex items-center gap-2"
        style={{ top: 14, right: 16 }}
      >
        {saveFlash && (
          <div
            className="text-[12px] px-3 py-1.5 rounded-full"
            style={{
              background: '#fff',
              border: `1px solid ${BORDER}`,
              color: '#44403c',
              fontFamily: 'Inter, sans-serif',
              boxShadow: '0 4px 12px rgba(28, 25, 23, 0.06)',
            }}
          >
            {saveFlash}
          </div>
        )}
        <button
          type="button"
          onClick={saveSnapshot}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
          style={{
            background: '#fff',
            border: `1px solid ${BORDER}`,
            color: '#44403c',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            cursor: 'pointer',
          }}
          title="Save current Twin configuration as a protocol"
        >
          <Save className="w-3 h-3" />
          Save as protocol
        </button>
        <button
          type="button"
          onClick={() => navigate('/protocols-v2')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
          style={{
            background: 'transparent',
            border: `1px solid ${BORDER}`,
            color: '#78716c',
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            cursor: 'pointer',
          }}
          title="Open protocols view"
        >
          View protocols →
        </button>
      </div>
    </div>
  )
}

// ─── Solver banner ───────────────────────────────────────────────
//
// Floats above the canvas while a solve is in progress or just finished.
// Shows the goal, live signed delta on the goal, and Apply / Cancel.

function SolverBanner({
  goalLabel,
  isRunning,
  goalOutcome,
  onApply,
  onCancel,
}: {
  goalLabel: string
  isRunning: boolean
  goalOutcome: OutcomeWithDelta | null
  onApply: () => void
  onCancel: () => void
}) {
  const tone = goalOutcome?.tone ?? 'neutral'
  const delta = goalOutcome?.delta ?? 0
  const decimals = goalOutcome?.decimals ?? 1
  const unit = goalOutcome?.unit ?? ''
  const tc = TONE_TEXT[tone]
  const goalVerb = goalOutcome?.beneficial === 'lower' ? 'lower' : 'raise'
  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#fff',
        border: `1px solid ${tone === 'benefit' ? '#7C9F8B' : BORDER}`,
        borderRadius: 999,
        padding: '7px 8px 7px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 24px rgba(28, 25, 23, 0.10)',
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        color: '#44403c',
      }}
    >
      <Sparkles className="w-3.5 h-3.5" style={{ color: '#7C9F8B' }} />
      <span>
        {isRunning ? 'Solving to' : 'Solved to'} {goalVerb}{' '}
        <span style={{ fontWeight: 500, color: '#1c1917' }}>{goalLabel}</span>
      </span>
      {goalOutcome && (
        <span
          style={{
            color: tc,
            fontWeight: 500,
            fontSize: 13,
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 3,
          }}
        >
          {signed(delta, decimals)}
          {unit && (
            <span style={{ fontSize: 11, opacity: 0.75 }}>{unit}</span>
          )}
        </span>
      )}
      {isRunning && (
        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#a8a29e' }} />
      )}
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid #e7e5e4',
          color: '#78716c',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          cursor: 'pointer',
        }}
        title="Revert to your previous values"
      >
        <X className="w-3 h-3" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={isRunning}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
        style={{
          background: isRunning ? '#e7e5e4' : '#7C9F8B',
          border: `1px solid ${isRunning ? '#e7e5e4' : '#7C9F8B'}`,
          color: '#fff',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          cursor: isRunning ? 'not-allowed' : 'pointer',
          opacity: isRunning ? 0.55 : 1,
        }}
        title="Keep these values"
      >
        <Check className="w-3 h-3" />
        Apply
      </button>
    </div>
  )
}

// ─── Methodology pill ────────────────────────────────────────────
//
// Bottom-right corner pill that summarises evidence quality + opens a
// caveats popover. Surfaces the things every coach should keep in mind
// when looking at a Twin projection: which outcomes are literature-only,
// which have no driver at all, and the cumulative-effect assumption.

function MethodologyPill({
  fittedEdges,
  literatureEdges,
  personalPct,
  undrivenOutcomes,
  regime,
  atDays,
  open,
  onToggle,
}: {
  fittedEdges: number
  literatureEdges: number
  personalPct: number
  undrivenOutcomes: string[]
  regime: Regime
  atDays: number
  open: boolean
  onToggle: () => void
}) {
  const cohortPct = 100 - personalPct
  return (
    <div
      className="absolute pointer-events-auto"
      style={{ bottom: 14, right: 16 }}
    >
      {open && (
        <div
          className="absolute"
          style={{
            bottom: 38,
            right: 0,
            width: 320,
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            boxShadow: '0 12px 32px rgba(28, 25, 23, 0.12)',
            padding: '14px 16px',
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            color: '#44403c',
            lineHeight: 1.5,
          }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <span
              className="text-[12px] font-medium"
              style={{ color: '#1c1917' }}
            >
              Modeling honesty
            </span>
            <button
              onClick={onToggle}
              className="text-stone-400 hover:text-stone-700"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <ul className="space-y-2">
            <li>
              <span style={{ color: '#1c1917', fontWeight: 500 }}>
                {fittedEdges} posterior-backed
              </span>{' '}
              + {literatureEdges} prior-only edges
              <span className="text-stone-500">
                {' '}
                are driving the {regime} regime at the {atDays}d horizon.
                Dashed strokes mark edges that are still carried by external
                priors.
              </span>
            </li>
            <li>
              <span style={{ color: '#1c1917', fontWeight: 500 }}>
                Average personalization: {personalPct}% (prior weight {cohortPct}%).
              </span>
              <span className="text-stone-500">
                {' '}
                Magnitude-weighted uncertainty reduction across the edges
                drawn here. This is a personalization proxy, not a literal
                data-vs-prior split. Hover any outcome chit for its posterior
                width.
              </span>
            </li>
            <li>
              <span style={{ color: '#1c1917', fontWeight: 500 }}>
                Cumulative-effect projection.
              </span>
              <span className="text-stone-500">
                {' '}
                Edge horizons (typically 28–90d) define when an effect
                fully accrues; values at shorter horizons are the
                fraction reached so far. Past full horizon, effects
                plateau.
              </span>
            </li>
            <li>
              <span style={{ color: '#1c1917', fontWeight: 500 }}>
                Prior-only edges treat similar members the same.
              </span>
              <span className="text-stone-500">
                {' '}
                They become individual-specific only after exposure, outcome,
                and confounder coverage are sufficient.
              </span>
            </li>
            {undrivenOutcomes.length > 0 && (
              <li>
                <span style={{ color: '#1c1917', fontWeight: 500 }}>
                  No active driver:
                </span>
                <span className="text-stone-500">
                  {' '}
                  {undrivenOutcomes.slice(0, 6).join(', ')}
                  {undrivenOutcomes.length > 6
                    ? ` (+${undrivenOutcomes.length - 6} more)`
                    : ''}
                  . These outcomes have no edge from any active lever in
                  this regime, so the Twin can't move them.
                </span>
              </li>
            )}
            <li className="text-stone-400 italic pt-1">
              Demo predictions only — not medical advice.
            </li>
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors"
        style={{
          background: '#fff',
          border: `1px solid ${BORDER}`,
          color: '#78716c',
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
          cursor: 'pointer',
        }}
        title={
          // Pip color encodes the personalization mix at a glance:
          // sage = mostly personalized; gold = partial; stone = mostly prior.
          `Personalized ${personalPct}% — ` +
          (personalPct >= 65
            ? 'most edges are tightening on this person'
            : personalPct >= 30
              ? 'partial personalization; many edges still leaning on priors'
              : 'mostly prior-driven; needs more personal exposure to tighten')
        }
      >
        <span
          className="inline-block rounded-full"
          style={{
            width: 6,
            height: 6,
            background:
              personalPct >= 65
                ? '#7C9F8B' // sage — well-personalized
                : personalPct >= 30
                  ? '#D4A857' // gold — middling
                  : '#9CA3AF', // stone — mostly prior
          }}
        />
        Personalized {personalPct}% · {literatureEdges} prior-only
        {undrivenOutcomes.length > 0 && (
          <span className="text-stone-400">
            · {undrivenOutcomes.length} undriven
          </span>
        )}
      </button>
    </div>
  )
}

// ─── Horizon scrubber ────────────────────────────────────────────
//
// Compact pill of preset horizons (1d → 1y) — clicking jumps `atDays`
// to that preset, which re-runs the engine with the new horizon and
// re-projects every outcome's delta along its cumulative-effect curve.
//
// Presets cap at 365d because the synthetic edge horizons are calibrated
// for that range; values beyond that just plateau on the cumulative
// curve so they're not interesting.

const TWIN_WEATHER_METRICS: Array<{
  key: WeatherKey
  label: string
  icon: LucideIcon
  format: (value: number) => string
  band: (value: number) => 'good' | 'watch' | 'elevated'
}> = [
  {
    key: 'heat_index_c',
    label: 'Heat index',
    icon: Thermometer,
    format: (value) => `${Math.round(value)}°C`,
    band: (value) => (value >= 35 ? 'elevated' : value >= 30 ? 'watch' : 'good'),
  },
  {
    key: 'temp_c',
    label: 'Temp',
    icon: CloudSun,
    format: (value) => `${Math.round(value)}°C`,
    band: (value) => (value >= 32 || value <= -5 ? 'watch' : 'good'),
  },
  {
    key: 'humidity_pct',
    label: 'Humidity',
    icon: Droplets,
    format: (value) => `${Math.round(value)}%`,
    band: (value) => (value >= 75 ? 'watch' : 'good'),
  },
  {
    key: 'uv_index',
    label: 'UV',
    icon: Sun,
    format: (value) => value.toFixed(1),
    band: (value) => (value >= 8 ? 'watch' : 'good'),
  },
  {
    key: 'aqi',
    label: 'AQI',
    icon: Wind,
    format: (value) => Math.round(value).toString(),
    band: (value) => (value >= 150 ? 'elevated' : value >= 100 ? 'watch' : 'good'),
  },
]

const TWIN_WEATHER_BAND_STYLE: Record<
  'good' | 'watch' | 'elevated',
  { border: string; background: string; icon: string; text: string }
> = {
  good: {
    border: '#e7e5e4',
    background: '#fff',
    icon: '#78716c',
    text: '#44403c',
  },
  watch: {
    border: '#f3d68b',
    background: '#fff8e5',
    icon: '#b7791f',
    text: '#7c4a03',
  },
  elevated: {
    border: '#f0b6a4',
    background: '#fff1ed',
    icon: '#b4533d',
    text: '#7f3326',
  },
}

function TwinWeatherPanel({ participant }: { participant: ParticipantPortal }) {
  const weather = participant.weather_today
  const metrics = TWIN_WEATHER_METRICS.flatMap((spec) => {
    const raw = weather?.[spec.key]
    return typeof raw === 'number' && Number.isFinite(raw)
      ? [{ spec, value: raw }]
      : []
  })

  const elevatedCount = metrics.filter(({ spec, value }) => spec.band(value) !== 'good').length

  return (
    <div
      className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
      style={{
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        padding: '12px 14px',
        boxShadow: '0 8px 22px rgba(28, 25, 23, 0.04)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center"
          style={{
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            color: '#7C9F8B',
          }}
        >
          <CloudSun className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div
            className="text-[13px] font-medium"
            style={{ color: '#1c1917', fontFamily: 'Inter, sans-serif' }}
          >
            Weather context
          </div>
          <div
            className="text-[11px]"
            style={{ color: '#78716c', fontFamily: 'Inter, sans-serif' }}
          >
            {metrics.length === 0
              ? 'No weather data for this participant today'
              : elevatedCount > 0
                ? `${elevatedCount} context flag${elevatedCount === 1 ? '' : 's'} active`
                : 'All observed weather confounders in normal range'}
          </div>
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-end">
          {metrics.map(({ spec, value }) => {
            const Icon = spec.icon
            const style = TWIN_WEATHER_BAND_STYLE[spec.band(value)]
            return (
              <div
                key={spec.key}
                className="flex items-center gap-2"
                style={{
                  minWidth: 112,
                  background: style.background,
                  border: `1px solid ${style.border}`,
                  borderRadius: 10,
                  padding: '8px 10px',
                }}
                title={`${spec.label}: ${spec.format(value)}`}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: style.icon }} />
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-semibold tabular-nums leading-none"
                    style={{ color: style.text, fontFamily: 'Inter, sans-serif' }}
                  >
                    {spec.format(value)}
                  </div>
                  <div
                    className="mt-1 text-[9px] uppercase tracking-wide"
                    style={{ color: '#a8a29e', fontFamily: 'Inter, sans-serif' }}
                  >
                    {spec.label}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// (HorizonScrubber removed — horizon is owned by ScopeBar in the
//  PainterlyPageHeader, which writes through useScopeStore.)

// ─── Outcome detail panel ────────────────────────────────────────
//
// Slide-up panel rendered at the bottom of the canvas when an outcome
// chit is clicked. Surfaces:
//   1. Per-lever contribution breakdown — how much each active lever
//      moved this outcome (signed deltas, sorted by magnitude).
//   2. Engine evidence — pulls rationale strings from the synthetic
//      literature edges that drive each contributing lever→outcome pair.
//      Cohort-fitted edges show "fitted from N members" instead.

const PHASE_EDGES_ALL = [...PHASE_1_EDGES, ...PHASE_2_EDGES_REF]

function rationalesForLeverOutcome(
  leverId: LeverId,
  outcomeId: string,
): { source: string; provenance: 'literature' | 'fitted'; rationale: string }[] {
  const actions = LEVER_ACTIONS[leverId]?.actions ?? []
  const out: { source: string; provenance: 'literature' | 'fitted'; rationale: string }[] = []
  const outKey = canonicalOutcomeKey(outcomeId)
  for (const action of actions) {
    for (const edge of PHASE_EDGES_ALL) {
      if (edge.action !== action) continue
      if (canonicalOutcomeKey(edge.outcome) !== outKey) continue
      out.push({
        source: action,
        provenance: 'literature',
        rationale: edge.rationale,
      })
    }
  }
  return out
}

function OutcomeDetailPanel({
  outcome,
  equations,
  atDays,
  leverSet,
  onClose,
}: {
  outcome: OutcomeWithDelta
  equations: StructuralEquation[]
  atDays: number
  leverSet: LeverId[]
  onClose: () => void
}) {
  const tc = TONE_TEXT[outcome.tone]
  const after = outcome.baseline + outcome.delta
  const eps = Math.pow(10, -outcome.decimals - 1)
  const horizonText =
    atDays >= 30 ? `${Math.round(atDays / 30)} mo` : `${atDays} d`

  // Active lever contributions — only show levers that actually moved
  // the outcome, sorted by absolute contribution.
  const activeContribs = leverSet
    .map((id) => ({ id, value: outcome.contributions[id] ?? 0 }))
    .filter((x) => Math.abs(x.value) > eps)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const sumAbs = activeContribs.reduce((s, c) => s + Math.abs(c.value), 0)

  // Cohort-fit count: how many fitted equations support each lever.
  const fittedCountByLever = new Map<LeverId, number>()
  for (const lever of leverSet) {
    let n = 0
    for (const action of LEVER_ACTIONS[lever]?.actions ?? []) {
      for (const eq of equations) {
        if (eq.source === action && canonicalOutcomeKey(eq.target) === canonicalOutcomeKey(outcome.id)) {
          if (eq.provenance === 'fitted') n += 1
        }
      }
    }
    fittedCountByLever.set(lever, n)
  }

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: 16,
        right: 16,
        bottom: 16,
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        boxShadow: '0 12px 32px rgba(28, 25, 23, 0.10)',
        padding: '14px 18px 16px',
        fontFamily: 'Inter, sans-serif',
        maxHeight: '46%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header row */}
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div
            className="text-[12px] uppercase tracking-wider text-stone-500"
            style={{ marginBottom: 2 }}
          >
            Outcome detail · {horizonText} horizon
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="text-[19px] font-medium"
              style={{ color: '#1c1917', letterSpacing: '-0.01em' }}
            >
              <GlossaryTerm termId={outcome.id} display={outcome.label} />
            </span>
            <span className="text-[14px] tabular-nums text-stone-500">
              {fmt(outcome.baseline, outcome.decimals)}
              {outcome.unit && ' ' + outcome.unit}
              <span className="mx-1.5 text-stone-300">→</span>
              <span style={{ color: tc, fontWeight: 500 }}>
                {fmt(after, outcome.decimals)}
                {outcome.unit && ' ' + outcome.unit}
              </span>
            </span>
            <span
              className="text-[16px] tabular-nums"
              style={{ color: tc, fontWeight: 500 }}
            >
              {signed(outcome.delta, outcome.decimals)}
              {outcome.unit && (
                <span style={{ fontSize: 11, marginLeft: 2, opacity: 0.75 }}>
                  {outcome.unit}
                </span>
              )}
            </span>
            {outcome.bandHalf != null && outcome.bandHalf > eps && (
              <span
                className="text-[11px] text-stone-500 tabular-nums"
                title="BART posterior 90% credible band (half-spread)"
              >
                ± {fmt(outcome.bandHalf, outcome.decimals)} (BART)
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-stone-500 mt-1.5 leading-relaxed max-w-[760px]">
            {outcome.description}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-700 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Contribution + evidence */}
      <div className="flex-1 overflow-auto">
        {activeContribs.length === 0 ? (
          <div className="text-[13px] text-stone-500 italic py-4">
            No active levers are moving this outcome. Drag a lever (or use the
            ⚡ optimize button) to see contribution attribution.
          </div>
        ) : (
          <div className="space-y-3">
            {activeContribs.map((c) => {
              const pct = sumAbs > 0 ? (Math.abs(c.value) / sumAbs) * 100 : 0
              const contribTone = toneFor(outcome, c.value)
              const stroke = TONE_STROKE[contribTone]
              const text = TONE_TEXT[contribTone]
              const rationales = rationalesForLeverOutcome(c.id, outcome.id)
              const fittedN = fittedCountByLever.get(c.id) ?? 0
              return (
                <div
                  key={c.id}
                  className="rounded-lg p-3"
                  style={{ background: '#faf6ec', border: `1px solid ${BORDER}` }}
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-[14px] font-medium"
                        style={{ color: '#44403c' }}
                      >
                        {LEVER_LABEL[c.id]}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {pct.toFixed(0)}% of total movement
                      </span>
                    </div>
                    <span
                      className="text-[14px] tabular-nums"
                      style={{ color: text, fontWeight: 500 }}
                    >
                      {signed(c.value, outcome.decimals)}
                      {outcome.unit && (
                        <span
                          style={{ fontSize: 11, marginLeft: 2, opacity: 0.75 }}
                        >
                          {outcome.unit}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Contribution bar */}
                  <div
                    className="relative rounded-full mb-2"
                    style={{ background: '#efe6d6', height: 5 }}
                  >
                    <div
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{ width: `${pct}%`, background: stroke, opacity: 0.85 }}
                    />
                  </div>
                  {/* Evidence list */}
                  {rationales.length > 0 ? (
                    <ul className="text-[12.5px] text-stone-600 space-y-1 pl-3">
                      {rationales.slice(0, 3).map((r, i) => (
                        <li key={i} className="leading-relaxed">
                          <span className="text-stone-400 mr-1">·</span>
                          <span style={{ color: '#5b524a' }}>
                            <span className="text-[11px] uppercase tracking-wider text-stone-400 mr-1.5">
                              {r.source.replace(/_/g, ' ')}
                            </span>
                            {r.rationale}
                          </span>
                        </li>
                      ))}
                      {rationales.length > 3 && (
                        <li className="text-stone-400 text-[11px] italic">
                          + {rationales.length - 3} more literature edge
                          {rationales.length - 3 === 1 ? '' : 's'}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <div className="text-[12.5px] text-stone-500 italic pl-3">
                      Cohort-fitted edge
                      {fittedN > 0
                        ? ` · ${fittedN} fitted equation${fittedN === 1 ? '' : 's'}`
                        : ''}
                      .
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
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
  const ob = (participant.outcome_baselines ?? {}) as Record<string, number>
  const f = (k: string, fallback: number) =>
    typeof cv[k] === 'number' && Number.isFinite(cv[k]) ? cv[k] : fallback
  // Inverse of the canonical-action mappings in LEVER_ACTIONS.
  const z1Min = f('steps', HR_THREE_BAND.bands[0].default * 100) / 100
  const z23Min = f('zone2_volume', HR_THREE_BAND.bands[1].default / 60) * 60
  const z45Min = HR_THREE_BAND.bands[2].default
  // Sleep quality lives in outcome_baselines (it's wearable-derived);
  // clamp into the lever's display range so the seed is reachable.
  const seededQuality =
    typeof ob.sleep_quality === 'number' && Number.isFinite(ob.sleep_quality)
      ? Math.max(60, Math.min(100, Math.round(ob.sleep_quality / 2) * 2))
      : SLEEP_QUALITY_DEFAULT
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
      quality: seededQuality,
      bedroomTempC: f('bedroom_temp_c', BEDROOM_TEMP_C_DEFAULT),
    },
    diet: {
      proteinG: f('dietary_protein', DIET_DEFAULT_PROTEIN_G),
      totalKcal: f('dietary_energy', DIET_DEFAULT_TOTAL_KCAL),
    },
    resistanceMin: f('resistance_training_minutes', RESISTANCE_MIN_DEFAULT),
    supp: defaultSupplementation(),
    sleepSupp: defaultSleepSupplementation(),
  }
}

export function TwinV2View() {
  const { pid, displayName } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  const { runFullCounterfactual, equations } = useSCM()

  const [state, setState] = useState<AllState>(defaultState)
  // Twin needs a binary regime (the lever set + outcome set differ).
  // When the cross-tab scope is set to "all", we render the longevity
  // view since it covers more ground.
  const scopeRegime = useScopeStore((s) => s.regime)
  const regime: Regime = scopeRegime === 'quotidian' ? 'quotidian' : 'longevity'

  // Deep-link acknowledgement — when arriving via /twin?outcome=hrv_daily
  // (from Insights / Fingerprint / etc.), pulse the matching chit sage
  // for ~3s so the click feels acknowledged. Twin is a fixed-viewport
  // canvas, so we can't scrollIntoView meaningfully — the halo is the
  // affordance.
  const [searchParams] = useSearchParams()
  const focusOutcome = searchParams.get('outcome')
  const [highlightOutcomeId, setHighlightOutcomeId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusOutcome) {
      setHighlightOutcomeId(null)
      return
    }
    setHighlightOutcomeId(focusOutcome)
    const t = window.setTimeout(() => setHighlightOutcomeId(null), 3200)
    return () => window.clearTimeout(t)
  }, [focusOutcome])

  // When the active participant changes, reseed the lever state so
  // levers start at the participant's actual baseline (no interventions).
  const lastSeededPid = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!participant) return
    if (lastSeededPid.current === participant.pid) return
    setState(seedStateFromParticipant(participant))
    lastSeededPid.current = participant.pid
  }, [participant])

  const headerActions = (
    <button
      onClick={() =>
        setState(
          participant ? seedStateFromParticipant(participant) : defaultState(),
        )
      }
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: 'transparent',
        border: '1px solid #e7e5e4',
        color: '#78716c',
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        cursor: 'pointer',
      }}
      title="Reset levers to baseline"
    >
      <RotateCcw className="w-3 h-3" />
      Reset
    </button>
  )

  return (
    <PageLayout maxWidth="full">
      <PainterlyPageHeader
        subtitle={
          regime === 'quotidian'
            ? 'Day-scale outcomes — wearable signals respond within a week'
            : 'Months-scale biomarkers — projected with literature edges'
        }
        actions={headerActions}
        sticky={false}
      />

      {pid == null ? (
        <EmptyParticipant message="Pick a member to open their twin." />
      ) : isLoading || !participant ? (
        <EmptyParticipant
          message={`Loading twin${displayName ? ' for ' + displayName : ''}…`}
          icon="loading"
        />
      ) : (
        <>
          {/* Today's story — three sentences framing what's active
               today and why the twin's default schedule looks like it
               does. Cream variant to blend with the painterly canvas. */}
          <div className="mb-4">
            <StorylinePanel
              story={buildTodaysStory(participant)}
              mode="today"
              variant="cream"
            />
          </div>
          {regime === 'quotidian' && (
            <div className="mb-4">
              <TwinWeatherPanel participant={participant} />
            </div>
          )}
          <PainterlyCanvas
            state={state}
            setState={setState}
            regime={regime}
            participant={participant}
            participantLabel={displayName}
            equations={equations}
            runFullCounterfactual={runFullCounterfactual}
            highlightOutcomeId={highlightOutcomeId}
          />
        </>
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

// (RegimeButton removed — regime now lives in the unified ScopeBar.)

export default TwinV2View
