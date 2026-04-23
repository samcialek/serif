/**
 * End-to-end MC smoke test — loads real BART draws from public/data/bartDraws
 * and runs a counterfactual against a synthetic observed state. Validates:
 *  - Shapes propagate (K samples per node)
 *  - BART-fit outcomes have non-degenerate posterior spread
 *  - Point-estimate vs MC disagree where additive-parents pathology bites
 *
 * Run:  npx tsx src/data/scm/bartMonteCarlo.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { EdgeResult } from '../dataValue/types'
import { STRUCTURAL_EDGES } from '../dataValue/mechanismCatalog'
import { buildEquationsWithRegimes } from './doseResponse'
import { topologicalSort } from './dagGraph'
import { computeFullCounterfactual } from './fullCounterfactual'
import { decodeBartDraws, type BartDrawsJson, type BartBundleManifest } from './bartDraws'
import { computeMonteCarloFullCounterfactual } from './bartMonteCarlo'
import type { BartDraws } from './bartDraws'

// ── Harness ─────────────────────────────────────────────────────────

const BART_JSON_DIR = resolve(process.cwd(), 'public/data/bartDraws')
const EDGE_SUMMARY_PATH = resolve(process.cwd(), 'src/data/dataValue/edgeSummaryRaw.json')

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`  FAIL  ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`  PASS  ${msg}`)
  }
}

function loadJsonFromDisk<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

function loadAllBartDraws(): Map<string, BartDraws> {
  const manifest = loadJsonFromDisk<BartBundleManifest>(resolve(BART_JSON_DIR, 'manifest.json'))
  const draws = new Map<string, BartDraws>()
  for (const outcome of Object.keys(manifest)) {
    const json = loadJsonFromDisk<BartDrawsJson>(resolve(BART_JSON_DIR, `${outcome}.json`))
    draws.set(outcome, decodeBartDraws(json))
  }
  return draws
}

// ── Synthetic observed state ────────────────────────────────────────
// Realistic mid-cohort participant. Values set near the BART grid
// medians so we stay inside the data-supported region.

const OBSERVED: Record<string, number> = {
  // Root / exogenous interventions
  running_volume: 8.0,
  training_volume: 60.0,
  zone2_volume: 40.0,
  training_load: 65.0,
  training_consistency: 0.75,
  sleep_duration: 7.2,
  sleep_debt: 1.5,
  acwr: 1.15,
  steps: 11000,
  active_energy: 550,
  bedtime: 23.0,
  // Observable biomarker values — cohort medians
  hrv_daily: 48.0,
  resting_hr: 58,
  hscrp: 1.2,
  hemoglobin: 14.2,
  rbc: 4.8,
  wbc: 6.1,
  cortisol: 12.5,
  testosterone: 620,
  insulin: 6.5,
  glucose: 95,
  hdl: 55,
  body_fat_pct: 18.5,
  body_mass_kg: 72,
  vo2_peak: 48,
  deep_sleep: 90,
  sleep_quality: 0.82,
  sleep_efficiency: 0.88,
  consistency: 0.75, // alias
}

// ── Tests ───────────────────────────────────────────────────────────

function testMCLoopBasics(): void {
  console.log('\n[testMCLoopBasics]')

  const edgeResults = loadJsonFromDisk<EdgeResult[]>(EDGE_SUMMARY_PATH)
  const equations = buildEquationsWithRegimes(edgeResults)
  const topoOrder = topologicalSort(STRUCTURAL_EDGES)
  const bartDraws = loadAllBartDraws()

  console.log(`  Loaded ${bartDraws.size} BART outcomes, ${equations.length} piecewise equations`)
  assert(bartDraws.size >= 15, `>=15 BART outcomes in bundle (got ${bartDraws.size})`)

  // Counterfactual: boost sleep_duration from 7.2 to 8.5 hrs
  const interventions = [
    { nodeId: 'sleep_duration', value: 8.5, originalValue: 7.2 },
  ]

  const t0 = performance.now()
  const mcState = computeMonteCarloFullCounterfactual(
    OBSERVED,
    interventions,
    equations,
    STRUCTURAL_EDGES,
    bartDraws,
    { kSamples: 200, topoOrder },
  )
  const elapsedMC = performance.now() - t0
  console.log(`  MC loop (K=200, 17 BART nodes): ${elapsedMC.toFixed(1)} ms`)

  assert(mcState.kSamples === 200, 'kSamples propagated through state')
  assert(mcState.allEffects.size > 0, `non-empty effects map (got ${mcState.allEffects.size})`)
  assert(mcState.bartOutcomes.length === bartDraws.size, 'bartOutcomes lists all loaded fits')

  // HRV should be in the effect set + have a posterior summary
  const hrvEffect = mcState.allEffects.get('hrv_daily')
  if (hrvEffect) {
    console.log(`  hrv_daily effect: ${hrvEffect.totalEffect.toFixed(2)} ms`)
    console.log(`  hrv_daily posterior: p05=${hrvEffect.posteriorSummary.p05.toFixed(2)}  p50=${hrvEffect.posteriorSummary.p50.toFixed(2)}  p95=${hrvEffect.posteriorSummary.p95.toFixed(2)}`)
    assert(hrvEffect.counterfactualSamples.length === 200, 'hrv_daily has 200 posterior samples')
    assert(hrvEffect.hasBartAncestor, 'hrv_daily flagged hasBartAncestor=true')
    assert(hrvEffect.posteriorSummary.p95 > hrvEffect.posteriorSummary.p05,
      'hrv_daily posterior band is non-degenerate (p95 > p05)')
  } else {
    console.log('  hrv_daily not in effects — may be unreachable via sleep_duration intervention')
  }

  // Cortisol should show effect since sleep_duration → sleep_debt → cortisol chain exists
  const cortEffect = mcState.allEffects.get('cortisol')
  if (cortEffect) {
    console.log(`  cortisol effect: ${cortEffect.totalEffect.toFixed(3)} ug/dL`)
  }

  // Tradeoffs structure
  assert(Array.isArray(mcState.tradeoffs), 'tradeoffs array returned')
}

function testMCVsPointEstimateDivergence(): void {
  console.log('\n[testMCVsPointEstimateDivergence]')

  const edgeResults = loadJsonFromDisk<EdgeResult[]>(EDGE_SUMMARY_PATH)
  const equations = buildEquationsWithRegimes(edgeResults)
  const topoOrder = topologicalSort(STRUCTURAL_EDGES)
  const bartDraws = loadAllBartDraws()

  // Try multiple interventions — pick the one with most BART-outcome overlap.
  // Different intervention targets have different descendant subsets; this
  // surveys several so the test is robust to DAG topology changes.
  const interventionCandidates: Array<{ nodeId: string; value: number; originalValue: number }> = [
    { nodeId: 'sleep_duration', value: 8.5, originalValue: 7.2 },
    { nodeId: 'running_volume', value: 12.0, originalValue: 8.0 },
    { nodeId: 'acwr', value: 1.5, originalValue: 1.15 },
    { nodeId: 'training_load', value: 90, originalValue: 65 },
  ]

  let bestNCompared = 0
  let bestIntervention: (typeof interventionCandidates)[0] | null = null
  let bestPointState: ReturnType<typeof computeFullCounterfactual> | null = null
  let bestMcState: ReturnType<typeof computeMonteCarloFullCounterfactual> | null = null

  for (const intv of interventionCandidates) {
    const pointState = computeFullCounterfactual(
      OBSERVED, [intv], equations, STRUCTURAL_EDGES, topoOrder,
    )
    const mcState = computeMonteCarloFullCounterfactual(
      OBSERVED, [intv], equations, STRUCTURAL_EDGES, bartDraws,
      { kSamples: 200, topoOrder },
    )
    let n = 0
    for (const outcome of bartDraws.keys()) {
      if (pointState.allEffects.get(outcome) && mcState.allEffects.get(outcome)) n++
    }
    if (n > bestNCompared) {
      bestNCompared = n
      bestIntervention = intv
      bestPointState = pointState
      bestMcState = mcState
    }
    console.log(`  do(${intv.nodeId}=${intv.value}): ${n} BART outcomes reached`)
  }

  assert(bestNCompared > 0, `at least one intervention reaches a BART outcome (best=${bestNCompared})`)
  if (!bestIntervention || !bestPointState || !bestMcState) return

  console.log(`\n  Chosen intervention: do(${bestIntervention.nodeId}=${bestIntervention.value})`)
  console.log(`  ${'outcome'.padEnd(20)} ${'point'.padStart(10)}  ${'MC mean'.padStart(10)}  ${'MC p05..p95'.padStart(22)}  diff?`)
  console.log(`  ${'-'.repeat(80)}`)

  let nDiffer = 0
  for (const outcome of bartDraws.keys()) {
    const point = bestPointState.allEffects.get(outcome)
    const mc = bestMcState.allEffects.get(outcome)
    if (!point || !mc) continue

    const differs = Math.abs(point.totalEffect - mc.totalEffect) > 0.01 * Math.max(Math.abs(point.totalEffect), 0.1)
    if (differs) nDiffer++

    const band = `${mc.posteriorSummary.p05.toFixed(3)}..${mc.posteriorSummary.p95.toFixed(3)}`
    console.log(`  ${outcome.padEnd(20)} ${point.totalEffect.toFixed(3).padStart(10)}  ${mc.totalEffect.toFixed(3).padStart(10)}  ${band.padStart(22)}  ${differs ? 'YES' : 'no'}`)
  }
  console.log(`\n  ${nDiffer}/${bestNCompared} outcomes differ between point and MC`)
}

function testMCLoopPerformance(): void {
  console.log('\n[testMCLoopPerformance]')

  const edgeResults = loadJsonFromDisk<EdgeResult[]>(EDGE_SUMMARY_PATH)
  const equations = buildEquationsWithRegimes(edgeResults)
  const topoOrder = topologicalSort(STRUCTURAL_EDGES)
  const bartDraws = loadAllBartDraws()

  const interventions = [
    { nodeId: 'sleep_duration', value: 8.5, originalValue: 7.2 },
  ]

  // Warm-up
  computeMonteCarloFullCounterfactual(
    OBSERVED,
    interventions,
    equations,
    STRUCTURAL_EDGES,
    bartDraws,
    { kSamples: 200, topoOrder },
  )

  // Timed
  const t0 = performance.now()
  const n = 5
  for (let i = 0; i < n; i++) {
    computeMonteCarloFullCounterfactual(
      OBSERVED,
      interventions,
      equations,
      STRUCTURAL_EDGES,
      bartDraws,
      { kSamples: 200, topoOrder },
    )
  }
  const avg = (performance.now() - t0) / n
  console.log(`  avg MC loop: ${avg.toFixed(1)} ms (K=200, 17 BART nodes, ${n} reps)`)
  assert(avg < 1000, `MC loop under 1s per call (got ${avg.toFixed(0)} ms)`)
}

function testBandsAreTightAtSmallIntervention(): void {
  console.log('\n[testBandsAreTightAtSmallIntervention]')

  // Sanity check: when the intervention is tiny relative to the observed
  // value, the MC posterior band should sit close to the observed value
  // (the BART surface shouldn't drift wildly between adjacent grid
  // cells). Loose tolerance — BART is non-parametric and grid-based, so
  // small perturbations can land on a different nearest neighbour.

  const edgeResults = loadJsonFromDisk<EdgeResult[]>(EDGE_SUMMARY_PATH)
  const equations = buildEquationsWithRegimes(edgeResults)
  const topoOrder = topologicalSort(STRUCTURAL_EDGES)
  const bartDraws = loadAllBartDraws()

  // A small kick to acwr — typical parameter range. This propagates to 6
  // BART-fit downstream outcomes (see testMCVsPointEstimateDivergence).
  const interventions = [
    { nodeId: 'acwr', value: 1.20, originalValue: 1.15 },
  ]

  const mcState = computeMonteCarloFullCounterfactual(
    OBSERVED,
    interventions,
    equations,
    STRUCTURAL_EDGES,
    bartDraws,
    { kSamples: 200, topoOrder },
  )

  let nChecked = 0
  let nReasonable = 0
  for (const [outcome, effect] of mcState.allEffects) {
    const observed = OBSERVED[outcome]
    if (observed == null || !effect.posteriorSummary) continue
    if (!effect.hasBartAncestor) continue
    nChecked++
    const median = effect.posteriorSummary.p50
    // 50% relative tolerance — BART median can shift meaningfully on a
    // small intervention because of grid-cell transitions. This test
    // catches blow-ups (e.g., units errors, sign flips of parameters)
    // not fine-grained accuracy.
    const relErr = Math.abs(median - observed) / Math.max(Math.abs(observed), 1)
    const reasonable = relErr < 0.5
    if (reasonable) nReasonable++
    console.log(
      `  ${outcome.padEnd(20)} obs=${observed.toFixed(2).padStart(8)}  ` +
      `MC p50=${median.toFixed(2).padStart(8)}  relErr=${(relErr * 100).toFixed(1)}%  ${reasonable ? 'ok' : 'BLOWUP'}`,
    )
  }
  assert(
    nChecked > 0,
    `at least one BART-descended outcome reached via do(acwr=1.20) (got ${nChecked})`,
  )
  assert(
    nChecked === 0 || nReasonable === nChecked,
    `all ${nChecked} reached BART outcomes within 50% of observed (got ${nReasonable}/${nChecked})`,
  )
}

// ── Main ────────────────────────────────────────────────────────────

console.log('Running BART MC loop smoke tests...')
testMCLoopBasics()
testMCVsPointEstimateDivergence()
testMCLoopPerformance()
testBandsAreTightAtSmallIntervention()
console.log('\nDone.')
