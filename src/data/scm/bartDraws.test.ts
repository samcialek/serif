/**
 * Smoke test: load a BART JSON payload from disk, decode, run the MC
 * engine on hrv_daily, verify shapes + sanity.
 *
 * Run:  npx tsx src/data/scm/bartDraws.test.ts
 *
 * Not wired into a test runner — project doesn't ship one. This is a
 * one-shot validator for the M4 scaffolding. Exit 0 = pass, non-zero = fail.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { decodeBartDraws, type BartDrawsJson } from './bartDraws'
import {
  extractParentVector,
  findNearestGridIndex,
  evaluateAllDraws,
  quantileSummary,
} from './bartInterpolator'

// ── Harness ─────────────────────────────────────────────────────────

const BART_JSON_DIR = resolve(process.cwd(), 'public/data/bartDraws')
const MANIFEST_PATH = resolve(BART_JSON_DIR, 'manifest.json')

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

// ── Tests ───────────────────────────────────────────────────────────

function testManifestLoads(): void {
  console.log('\n[testManifestLoads]')
  assert(existsSync(MANIFEST_PATH), `manifest.json exists at ${MANIFEST_PATH}`)

  const manifest = loadJsonFromDisk<Record<string, { path: string; n_draws: number; n_grid: number }>>(MANIFEST_PATH)
  const outcomes = Object.keys(manifest)
  assert(outcomes.length >= 10, `manifest covers >=10 outcomes (got ${outcomes.length})`)
  assert('hrv_daily' in manifest, 'hrv_daily present in manifest')
  assert(manifest.hrv_daily.n_draws === 200, `hrv_daily has 200 draws (got ${manifest.hrv_daily.n_draws})`)
}

function testDecodeAndShape(): void {
  console.log('\n[testDecodeAndShape]')
  const json = loadJsonFromDisk<BartDrawsJson>(resolve(BART_JSON_DIR, 'hrv_daily.json'))
  const draws = decodeBartDraws(json)

  assert(draws.outcome === 'hrv_daily', 'outcome is hrv_daily')
  assert(draws.nParents === 9, `9 parents (got ${draws.nParents})`)
  assert(draws.nDraws === 200, `200 draws (got ${draws.nDraws})`)
  assert(draws.nGrid === 1188, `1188 grid points (got ${draws.nGrid})`)
  assert(draws.grid.length === draws.nGrid * draws.nParents,
    `grid flatsize = G*P (${draws.grid.length} vs ${draws.nGrid * draws.nParents})`)
  assert(draws.predictions.length === draws.nDraws * draws.nGrid,
    `predictions flatsize = K*G (${draws.predictions.length} vs ${draws.nDraws * draws.nGrid})`)
  assert(draws.sigma.length === draws.nDraws, `sigma length = K (${draws.sigma.length})`)

  // data_mean for HRV should be around 49 ms (cohort average from the M2b fit)
  assert(draws.dataMean > 40 && draws.dataMean < 60,
    `data_mean in plausible HRV range (got ${draws.dataMean.toFixed(2)} ms)`)

  // All predictions finite
  let nNonFinite = 0
  for (let i = 0; i < Math.min(10000, draws.predictions.length); i++) {
    if (!Number.isFinite(draws.predictions[i])) nNonFinite++
  }
  assert(nNonFinite === 0, `first 10k predictions are finite (${nNonFinite} non-finite)`)

  // Sigma positive
  let allSigmaPositive = true
  for (let k = 0; k < draws.nDraws; k++) {
    if (draws.sigma[k] <= 0) { allSigmaPositive = false; break }
  }
  assert(allSigmaPositive, 'all K sigma values positive')

  // Parent normalization sensible
  let allRangesPositive = true
  for (let p = 0; p < draws.nParents; p++) {
    if (draws.parentRange[p] <= 0) { allRangesPositive = false; break }
  }
  assert(allRangesPositive, 'all parent ranges > 0 (non-degenerate grid)')
}

function testParentExtractionAndLookup(): void {
  console.log('\n[testParentExtractionAndLookup]')
  const json = loadJsonFromDisk<BartDrawsJson>(resolve(BART_JSON_DIR, 'hrv_daily.json'))
  const draws = decodeBartDraws(json)

  console.log(`  parent names (9): ${draws.parentNames.join(', ')}`)

  // Pick a grid row and try to recover it — nearest-neighbor should find itself
  const g0 = 500 // arbitrary middle-of-cohort row
  const observed: Record<string, number> = {}
  for (let p = 0; p < draws.nParents; p++) {
    observed[draws.parentNames[p]] = draws.grid[g0 * draws.nParents + p]
  }
  const vec = extractParentVector(draws, observed)
  assert(vec !== null, 'parent vector extracts cleanly')

  const recoveredIdx = findNearestGridIndex(draws, vec!)
  assert(recoveredIdx === g0, `nearest-neighbor of grid[${g0}] = grid[${recoveredIdx}] (self-recovery)`)

  // All-draws evaluation
  const perDraw = evaluateAllDraws(draws, vec!)
  assert(perDraw.length === draws.nDraws, `evaluateAllDraws returns K values (${perDraw.length})`)

  // Posterior of HRV mean function at this point should span ~20 ms plausibly
  const summary = quantileSummary(new Float32Array(perDraw))
  console.log(`  grid[${g0}] posterior of E[hrv]: p05=${summary.p05.toFixed(2)}  p50=${summary.p50.toFixed(2)}  p95=${summary.p95.toFixed(2)}  mean=${summary.mean.toFixed(2)}`)
  assert(summary.p50 > 25 && summary.p50 < 75, `posterior median in plausible HRV range (${summary.p50.toFixed(1)} ms)`)
  assert(summary.p95 > summary.p05, 'p95 > p05 (non-degenerate posterior)')
}

function testMissingParentReturnsNull(): void {
  console.log('\n[testMissingParentReturnsNull]')
  const json = loadJsonFromDisk<BartDrawsJson>(resolve(BART_JSON_DIR, 'hrv_daily.json'))
  const draws = decodeBartDraws(json)

  // Leave out one parent on purpose
  const incomplete: Record<string, number> = {}
  for (const name of draws.parentNames.slice(0, -1)) incomplete[name] = 0
  const vec = extractParentVector(draws, incomplete)
  assert(vec === null, 'extraction returns null when a parent is missing')
}

// ── Main ────────────────────────────────────────────────────────────

console.log('Running BART draws smoke tests...')
testManifestLoads()
testDecodeAndShape()
testParentExtractionAndLookup()
testMissingParentReturnsNull()
console.log('\nDone.')
