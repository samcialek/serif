/**
 * Smoke tests for the Exploration math — ranking + principled narrow.
 *
 * Run:  npx tsx --tsconfig ./tsconfig.app.json src/utils/exploration.test.ts
 *
 * The --tsconfig flag is needed so tsx resolves the @/-aliased imports
 * the way Vite does. Not wired into a test runner — project doesn't
 * ship one. Exit 0 = pass, non-zero = fail. Mirrors the style of
 * src/data/scm/bartDraws.test.ts.
 */

import type { ExperimentSpec, ExplorationRecommendation, Pathway } from '@/data/portal/types'
import {
  enrichExplorationEdge,
  principledNarrow,
  rankExplorations,
  type ExplorationEdge,
} from './exploration'

let failures = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  PASS  ${msg}`)
  } else {
    console.error(`  FAIL  ${msg}`)
    failures += 1
    process.exitCode = 1
  }
}

function approxEq(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps
}

// ─── principledNarrow ───────────────────────────────────────────

console.log('\nprincipledNarrow — conjugate-Normal update:')

const spec14daily: ExperimentSpec = {
  action_range_delta: [-0.5, 0.5],
  cadence: 'daily',
  duration_days: 14,
  feasibility: 'ready',
}
const spec7daily: ExperimentSpec = {
  action_range_delta: [-0.5, 0.5],
  cadence: 'daily',
  duration_days: 7,
  feasibility: 'ready',
}
const specOneShot: ExperimentSpec = {
  action_range_delta: [0, 0],
  cadence: 'one_shot',
  duration_days: 56,
  feasibility: 'ready',
}
const specWeekly: ExperimentSpec = {
  action_range_delta: [0, 90],
  cadence: 'n_per_week',
  n_per_week: 3,
  duration_days: 21,
  feasibility: 'ready',
}

const wearable: Pathway = 'wearable'
const biomarker: Pathway = 'biomarker'

// 1. Monotonic in duration for daily cadence — more days = more narrow.
const n14 = principledNarrow(0.3, spec14daily, wearable)
const n7 = principledNarrow(0.3, spec7daily, wearable)
assert(n14 > n7, `14 daily > 7 daily (${n14.toFixed(3)} > ${n7.toFixed(3)})`)

// 2. Wearable > biomarker for the same duration (more obs per day).
const wearableNarrow = principledNarrow(0.3, spec14daily, wearable)
const biomarkerNarrow = principledNarrow(0.3, spec14daily, biomarker)
assert(
  wearableNarrow > biomarkerNarrow,
  `wearable daily > biomarker daily (${wearableNarrow.toFixed(3)} > ${biomarkerNarrow.toFixed(3)})`,
)

// 3. One-shot narrow is strictly bounded.
const oneShotNarrow = principledNarrow(0.3, specOneShot, biomarker)
assert(
  oneShotNarrow >= 0 && oneShotNarrow <= 1,
  `one-shot narrow in [0,1] (${oneShotNarrow.toFixed(3)})`,
)

// 4. Clamps to 0 when prior SD is effectively zero.
const zeroPrior = principledNarrow(1e-12, spec14daily, wearable)
assert(approxEq(zeroPrior, 0), `narrow with zero prior SD = 0 (got ${zeroPrior})`)

// 5. Weekly cadence < daily cadence same duration.
const dailyNarrow = principledNarrow(0.3, spec14daily, wearable)
const weeklyNarrow = principledNarrow(0.3, specWeekly, wearable)
assert(
  dailyNarrow > weeklyNarrow,
  `14 daily > 21 weekly@3 (${dailyNarrow.toFixed(3)} > ${weeklyNarrow.toFixed(3)})`,
)

// 6. Result is bounded by 1 even with huge n_eff.
const hugeSpec: ExperimentSpec = {
  action_range_delta: [-1, 1],
  cadence: 'daily',
  duration_days: 10_000,
  feasibility: 'ready',
}
const bounded = principledNarrow(0.3, hugeSpec, wearable)
assert(bounded <= 1, `narrow bounded above by 1 (got ${bounded.toFixed(3)})`)

// ─── rankExplorations ───────────────────────────────────────────

console.log('\nrankExplorations — sort keys:')

// Stub participant with zero fitted edges so enrichment uses fallbacks.
const stubParticipant = {
  pid: 1,
  cohort: 'cohort_test',
  age: 40,
  is_female: false,
  effects_bayesian: [],
  tier_counts: {} as Record<string, number>,
  exposed_count: 0,
  protocols: [],
  current_values: { bedtime: 23, sleep_duration: 7 },
  behavioral_sds: { bedtime: 0.5, sleep_duration: 0.8 },
} as unknown as Parameters<typeof enrichExplorationEdge>[1]

function makeRec(
  action: string,
  outcome: string,
  kind: 'vary_action' | 'repeat_measurement',
  pathway: Pathway,
  priorContraction: number,
  positivityFlag: string,
): ExplorationRecommendation {
  return {
    action,
    outcome,
    pathway,
    kind,
    rationale: `stub rationale for ${action} → ${outcome}`,
    prior_contraction: priorContraction,
    positivity_flag: positivityFlag,
    user_n: 20,
  }
}

const recs: ExplorationEdge[] = [
  makeRec('bedtime', 'hrv_daily', 'vary_action', 'wearable', 0.1, 'ok'),
  makeRec('caffeine_mg', 'sleep_quality', 'vary_action', 'wearable', 0.2, 'marginal'),
  makeRec('dietary_protein', 'ferritin', 'vary_action', 'biomarker', 0.3, 'insufficient'),
].map((r) => enrichExplorationEdge(r, stubParticipant))

// sort by horizon should go smallest-horizon first.
const byHorizon = rankExplorations(recs, 'horizon')
assert(
  byHorizon[0].computed.horizonDays <= byHorizon[byHorizon.length - 1].computed.horizonDays,
  `horizon sort ascending (first ${byHorizon[0].computed.horizonDays}d, last ${byHorizon[byHorizon.length - 1].computed.horizonDays}d)`,
)

// sort by feasibility should put 'ok' before 'insufficient'.
const byFeasibility = rankExplorations(recs, 'feasibility')
assert(
  byFeasibility[0].positivity_flag === 'ok',
  `feasibility sort puts 'ok' first (got '${byFeasibility[0].positivity_flag}')`,
)

// sort by infogain is stable descending.
const byGain = rankExplorations(recs, 'infogain')
for (let i = 1; i < byGain.length; i += 1) {
  assert(
    byGain[i - 1].computed.infoGain >= byGain[i].computed.infoGain,
    `infogain sort descending at i=${i} (${byGain[i - 1].computed.infoGain.toFixed(3)} >= ${byGain[i].computed.infoGain.toFixed(3)})`,
  )
}

// ─── Summary ────────────────────────────────────────────────────

if (failures === 0) {
  console.log('\nAll exploration smoke tests passed.')
} else {
  console.error(`\n${failures} test(s) failed.`)
}
