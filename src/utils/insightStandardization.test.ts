/**
 * Regression tests for the standardization helpers.
 *
 * Run:  npx tsx --tsconfig ./tsconfig.app.json src/utils/insightStandardization.test.ts
 *
 * Not wired into a test runner — project doesn't ship one. Mirrors
 * the style of src/data/scm/bartDraws.test.ts and
 * src/utils/exploration.test.ts. Exit 0 = pass, non-zero = fail.
 *
 * Primary purpose: lock in the optimization-direction sign-flip so the
 * Twin solver can never regress to "maximize cortisol delta" (a class
 * of bug that, before being fixed, would have produced harmful
 * recommendations because raising cortisol scores the same as raising
 * HRV in raw native-unit deltas).
 */

import { optimizationScore } from './insightStandardization'

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

// ─── optimizationScore — sign convention regression ──────────────

console.log('\noptimizationScore — sign convention:')

// "Higher is better" outcomes: HRV, sleep_quality, deep_sleep, etc.
// A positive delta should score positive (good), a negative delta should
// score negative (bad). Sign passes through unchanged.
assert(
  optimizationScore(5, 'higher') === 5,
  '+5 delta on "higher better" → +5 (good)',
)
assert(
  optimizationScore(-5, 'higher') === -5,
  '−5 delta on "higher better" → −5 (bad)',
)

// "Lower is better" outcomes: cortisol, apoB, glucose, hsCRP, LDL, etc.
// A positive delta means the outcome went UP, which is BAD for lower-is-
// better. Score should be negative. The sign-flip is the entire point.
assert(
  optimizationScore(5, 'lower') === -5,
  '+5 delta on "lower better" → −5 (bad — outcome got worse)',
)
assert(
  optimizationScore(-5, 'lower') === 5,
  '−5 delta on "lower better" → +5 (good — outcome dropped)',
)

// Zero is zero in either direction.
assert(
  optimizationScore(0, 'higher') === 0,
  'zero delta on "higher better" → 0',
)
assert(
  optimizationScore(0, 'lower') === 0,
  'zero delta on "lower better" → 0',
)

// ─── Integration regression: cortisol-up-is-bad scenario ─────────

console.log('\noptimizationScore — Twin solver regression (cortisol):')

// Simulates the canonical bug: a counterfactual that raises cortisol by
// 3 µg/dL must score *negative* so coordinate descent rejects it. If
// someone removes the sign-flip, this assertion fires.
const cortisolDelta = 3.0 // µg/dL (cortisol going UP)
const cortisolScore = optimizationScore(cortisolDelta, 'lower')
assert(
  cortisolScore < 0,
  `raising cortisol by +${cortisolDelta} scores < 0 (got ${cortisolScore})`,
)

// And the inverse: dropping cortisol by 3 µg/dL must score positive.
const cortisolDrop = -3.0
const cortisolDropScore = optimizationScore(cortisolDrop, 'lower')
assert(
  cortisolDropScore > 0,
  `dropping cortisol by ${cortisolDrop} scores > 0 (got ${cortisolDropScore})`,
)

// Symmetric check on HRV — raising HRV by 5 ms must score positive.
const hrvBump = 5
const hrvScore = optimizationScore(hrvBump, 'higher')
assert(
  hrvScore > 0,
  `raising HRV by +${hrvBump} scores > 0 (got ${hrvScore})`,
)

// And dropping HRV by 5 ms must score negative.
const hrvDrop = -5
const hrvDropScore = optimizationScore(hrvDrop, 'higher')
assert(
  hrvDropScore < 0,
  `dropping HRV by ${hrvDrop} scores < 0 (got ${hrvDropScore})`,
)

// ─── Comparator: cortisol-down should beat HRV-up of equal raw delta ─

console.log('\noptimizationScore — comparator behaviour:')

// Construct a scenario where two trial schedules produce equal-magnitude
// raw deltas but on different outcomes. Without the sign-flip, both
// "raise cortisol +3" and "raise HRV +3" would tie. With it, raising
// cortisol scores negative and raising HRV scores positive — the solver
// correctly picks the HRV move.
const trialA = optimizationScore(3, 'higher') // HRV +3 (good)
const trialB = optimizationScore(3, 'lower')  // cortisol +3 (bad)
assert(
  trialA > trialB,
  `HRV+3 (${trialA}) ranks above cortisol+3 (${trialB})`,
)

// ─── Summary ─────────────────────────────────────────────────────

if (failures === 0) {
  console.log('\nAll insightStandardization regression tests passed.')
} else {
  console.error(`\n${failures} test(s) failed.`)
}
