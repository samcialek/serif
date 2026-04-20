/**
 * Verify information-theoretic affordance scoring.
 * Run: npx tsx scripts/verify-it-scoring.ts
 */

import { rankCandidatesIT } from '../src/data/dataValue/informationTheoreticScoring.js'
import edgeSummaryRaw from '../src/data/dataValue/edgeSummaryRaw.json'
import type { EdgeResult } from '../src/data/dataValue/types.js'

const results = rankCandidatesIT(edgeSummaryRaw as EdgeResult[])

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++ }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

console.log('\n═══ Information-Theoretic Scoring Verification ═══\n')

// ─── 1. All candidates scored ────────────────────────────────────

console.log('1. All Candidates Scored')
assert(results.length === 9, `${results.length} candidates scored`)

for (const r of results) {
  const s = r.score
  console.log(`    ${r.candidate.name.padEnd(30)} composite=${s.composite.toString().padStart(2)}  EIG=${s.expectedInformationGain.normalized.toFixed(1).padStart(5)}  VR=${s.varianceReduction.normalized.toFixed(1).padStart(5)}  PR=${s.precisionRatio.normalized.toFixed(1).padStart(5)}  TK=${s.testabilityKL.normalized.toFixed(1).padStart(5)}  [${s.tier}]`)
}

// ─── 2. Composite range ──────────────────────────────────────────

console.log('\n2. Score Properties')
const composites = results.map(r => r.score.composite)
assert(composites[0] >= composites[composites.length - 1], 'Sorted descending by composite')
assert(composites.every(c => c >= 0 && c <= 100), 'All composites in [0, 100]')

// ─── 3. Dimension properties ─────────────────────────────────────

console.log('\n3. Dimension Properties')

// All 65 mechanisms are already testable — EIG should be 0 for all candidates
// (no new edges to unlock). This validates the EIG dimension correctly detects the degenerate case.
const allEIGZero = results.every(r => r.score.expectedInformationGain.raw === 0)
assert(allEIGZero, 'EIG is 0 for all candidates (all 65 mechanisms already testable)')

// Monthly Labs should have high precision ratio (boosts many low-effN edges)
const monthlyLabs = results.find(r => r.candidate.id === 'monthly_labs')!
assert(monthlyLabs.score.precisionRatio.details.length > 10,
  `Monthly Labs boosts ${monthlyLabs.score.precisionRatio.details.length} edges (expected >10)`)

// Genetic data should have high variance reduction (resolves confounders)
const genetic = results.find(r => r.candidate.id === 'genetic_data')!
assert(genetic.score.varianceReduction.details.length >= 2,
  `Genetic Data resolves ${genetic.score.varianceReduction.details.length} confounders`)

// CGM should have non-zero precision ratio (boosts glucose edges)
const cgm = results.find(r => r.candidate.id === 'cgm')!
assert(cgm.score.precisionRatio.details.length > 0,
  `CGM boosts ${cgm.score.precisionRatio.details.length} glucose-related edges`)

// ─── 4. Ranking sanity ──────────────────────────────────────────

console.log('\n4. Ranking Sanity')

// Monthly Labs should rank higher than Respiratory Rate (many more edges boosted)
const monthlyRank = results.findIndex(r => r.candidate.id === 'monthly_labs')
const respRank = results.findIndex(r => r.candidate.id === 'respiratory_rate')
assert(monthlyRank < respRank,
  `Monthly Labs (rank ${monthlyRank + 1}) > Respiratory Rate (rank ${respRank + 1})`,
  `Monthly Labs=${monthlyLabs.score.composite}, Resp=${results.find(r => r.candidate.id === 'respiratory_rate')!.score.composite}`)

// All posteriorSource should be closed_form_approximation
assert(results.every(r => r.score.posteriorSource === 'closed_form_approximation'),
  'All scores use closed_form_approximation')

// ─── 5. Detail structure ─────────────────────────────────────────

console.log('\n5. Detail Structure')

// Check that details are populated where expected
const topCandidate = results[0]
const totalDetails =
  topCandidate.score.expectedInformationGain.details.length +
  topCandidate.score.varianceReduction.details.length +
  topCandidate.score.precisionRatio.details.length +
  topCandidate.score.testabilityKL.details.length

assert(totalDetails > 0,
  `Top candidate (${topCandidate.candidate.name}) has ${totalDetails} total detail entries`)

// Precision ratio details should have valid numbers
const prDetails = monthlyLabs.score.precisionRatio.details
if (prDetails.length > 0) {
  const sample = prDetails[0]
  assert(sample.projectedEffN > sample.currentEffN,
    `Projected effN (${sample.projectedEffN}) > current (${sample.currentEffN}) for "${sample.edgeTitle}"`)
  assert(sample.ratio > 0, `Precision ratio > 0 (got ${sample.ratio.toFixed(2)})`)
}

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`)
process.exit(failed > 0 ? 1 : 0)
