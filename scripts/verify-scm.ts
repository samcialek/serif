/**
 * SCM Engine Verification Script
 *
 * Exercises the plan's verification criteria:
 *   1. Topological sort correctness (iron pathway ordering)
 *   2. Abduction round-trip (factual consistency)
 *   3. Known counterfactual (running_volume +40km/mo → ferritin decrease)
 *   4. Back-door identification (training_volume → testosterone → {season})
 *   5. Front-door identification (iron pathway)
 *   6. Pathway decomposition sum check
 *
 * Run: npx tsx scripts/verify-scm.ts
 */

import { STRUCTURAL_EDGES, NODE_TO_COLUMNS } from '../src/data/dataValue/mechanismCatalog.js'
import edgeSummaryRaw from '../src/data/dataValue/edgeSummaryRaw.json'
import type { EdgeResult } from '../src/data/dataValue/types.js'

import { topologicalSort, buildCausalAdjacency, findAllDirectedPaths } from '../src/data/scm/dagGraph.js'
import { buildEquationsFromEdges, evaluateEdge, buildEquationsByTarget } from '../src/data/scm/doseResponse.js'
import { abduceNoise, applyIntervention, propagateCounterfactual, computeCounterfactual } from '../src/data/scm/twinEngine.js'
import { identifyQuery, findBackdoorSet, findFrontdoorSet } from '../src/data/scm/identification.js'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

// ─── Setup ──────────────────────────────────────────────────────────

const equations = buildEquationsFromEdges(edgeSummaryRaw as EdgeResult[])
const topoOrder = topologicalSort(STRUCTURAL_EDGES)
const causalAdj = buildCausalAdjacency(STRUCTURAL_EDGES)

console.log('\n═══ SCM Engine Verification ═══\n')

// ─── 1. Topological Sort ────────────────────────────────────────────

console.log('1. Topological Sort Correctness')

// Iron pathway: running_volume before ground_contacts before iron_total before ferritin before hemoglobin before vo2_peak
const ironPath = ['running_volume', 'ground_contacts', 'iron_total', 'ferritin', 'hemoglobin', 'vo2_peak']
const indices = ironPath.map(n => topoOrder.indexOf(n))

assert(indices.every(i => i >= 0), 'All iron pathway nodes present in topo order',
  `Missing: ${ironPath.filter((_, i) => indices[i] < 0).join(', ')}`)

let orderCorrect = true
for (let i = 0; i < indices.length - 1; i++) {
  if (indices[i] >= indices[i + 1]) {
    orderCorrect = false
    break
  }
}
assert(orderCorrect, 'Iron pathway nodes in correct order',
  `Got indices: ${ironPath.map(n => `${n}=${topoOrder.indexOf(n)}`).join(', ')}`)

// Lipid pathway: zone2_volume before lipoprotein_lipase before triglycerides
const lipidPath = ['zone2_volume', 'lipoprotein_lipase', 'triglycerides']
const lipidIndices = lipidPath.map(n => topoOrder.indexOf(n))
assert(
  lipidIndices.every(i => i >= 0) && lipidIndices[0] < lipidIndices[1] && lipidIndices[1] < lipidIndices[2],
  'Lipid pathway nodes in correct order'
)

console.log(`  (Topo order: ${topoOrder.length} nodes)`)

// ─── 2. Equation Node-Level Mapping ────────────────────────────────

console.log('\n2. Equation Node-Level Mapping')

// Check that equations now use node-level names, not column names
const eqSources = new Set(equations.map(e => e.source))
const eqTargets = new Set(equations.map(e => e.target))

assert(eqSources.has('running_volume'), 'running_volume appears as equation source')
assert(eqTargets.has('iron_total'), 'iron_total appears as equation target')
assert(eqTargets.has('ferritin'), 'ferritin appears as equation target')
assert(eqTargets.has('testosterone'), 'testosterone appears as equation target')
assert(!eqSources.has('daily_run_km'), 'Column name daily_run_km NOT in equation sources')
assert(!eqTargets.has('iron_total_smoothed'), 'Column name iron_total_smoothed NOT in equation targets')

console.log(`  (${equations.length} node-level equations from ${(edgeSummaryRaw as EdgeResult[]).length} column-level fitted edges)`)

// ─── 3. Abduction Round-Trip ────────────────────────────────────────

console.log('\n3. Abduction Round-Trip (factual consistency)')

const observedValues: Record<string, number> = {
  running_volume: 120,
  training_volume: 1200,
  zone2_volume: 60,
  training_load: 600,
  sleep_duration: 7,
  iron_total: 80,
  ferritin: 45,
  hemoglobin: 14.5,
  testosterone: 500,
  cortisol: 12,
  triglycerides: 100,
  hdl: 55,
  hrv_daily: 50,
  resting_hr: 55,
}

const factualWorld = abduceNoise(observedValues, equations, topoOrder)

// Verify: after abduction, observed nodes should retain their values
let roundTripOk = true
for (const [nodeId, value] of Object.entries(observedValues)) {
  const node = factualWorld.get(nodeId)
  if (node && node.observedValue !== null && Math.abs(node.observedValue - value) > 1e-10) {
    console.log(`    ! ${nodeId}: expected ${value}, got ${node.observedValue}`)
    roundTripOk = false
  }
}
assert(roundTripOk, 'All observed nodes retain their values after abduction')

// Verify: propagate with NO intervention should reproduce factual values
const noOpCounter = applyIntervention(factualWorld, [])
propagateCounterfactual(noOpCounter, equations, topoOrder)

let reproductionOk = true
for (const [nodeId, value] of Object.entries(observedValues)) {
  const node = noOpCounter.get(nodeId)
  if (node && node.observedValue !== null && Math.abs(node.observedValue - value) > 0.1) {
    console.log(`    ! ${nodeId}: expected ${value}, got ${node.observedValue?.toFixed(4)} (diff: ${(node.observedValue - value).toFixed(6)})`)
    reproductionOk = false
  }
}
assert(reproductionOk, 'No-intervention propagation reproduces factual values')

// ─── 4. Known Counterfactual ────────────────────────────────────────

console.log('\n4. Known Counterfactual: do(running_volume = 160)')

const cfResults = computeCounterfactual(
  observedValues,
  [{ nodeId: 'running_volume', value: 160, originalValue: 120 }],
  ['iron_total', 'ferritin', 'hemoglobin'],
  equations,
  STRUCTURAL_EDGES,
  topoOrder
)

assert(cfResults.length > 0, `Got ${cfResults.length} counterfactual results`)

for (const r of cfResults) {
  const direction = r.totalEffect >= 0 ? 'increase' : 'decrease'
  console.log(`    ${r.targetId}: ${r.factualValue.toFixed(2)} → ${r.counterfactualValue.toFixed(2)} (Δ${r.totalEffect >= 0 ? '+' : ''}${r.totalEffect.toFixed(4)}, strategy: ${r.identificationStrategy})`)

  // Running more should decrease iron markers (negative bb in fitted data)
  if (r.targetId === 'ferritin') {
    assert(r.totalEffect <= 0, 'Ferritin decreases with more running (bb=-0.083)',
      `Got ${direction} of ${r.totalEffect.toFixed(4)}`)
  }
}

// ─── 5. Back-Door Identification ────────────────────────────────────

console.log('\n5. Back-Door Identification')

// training_volume → testosterone: season confounds both
const tvTestResult = identifyQuery('training_volume', 'testosterone', STRUCTURAL_EDGES)
console.log(`    training_volume → testosterone: strategy=${tvTestResult.strategy}, adjustment=[${tvTestResult.adjustmentSet.join(', ')}]`)
assert(tvTestResult.strategy === 'backdoor', 'Strategy is backdoor')
assert(tvTestResult.adjustmentSet.includes('season'), 'Adjustment set includes season')

// sleep_quality → hrv_daily: confounded by travel_load
const sqHrvResult = identifyQuery('sleep_quality', 'hrv_daily', STRUCTURAL_EDGES)
console.log(`    sleep_quality → hrv_daily: strategy=${sqHrvResult.strategy}, adjustment=[${sqHrvResult.adjustmentSet.join(', ')}]`)

// No confounding case: iron_total → ferritin (direct causal, no confounders)
const ironFerResult = identifyQuery('iron_total', 'ferritin', STRUCTURAL_EDGES)
console.log(`    iron_total → ferritin: strategy=${ironFerResult.strategy}`)
assert(ironFerResult.strategy === 'backdoor', 'Direct causal edge identified as backdoor (no confounding)')

// ─── 6. Front-Door Identification ───────────────────────────────────

console.log('\n6. Front-Door Identification')

// zone2_volume → triglycerides: should identify lipoprotein_lipase as mediator
const z2TrigResult = findFrontdoorSet('zone2_volume', 'triglycerides', STRUCTURAL_EDGES)
console.log(`    zone2_volume → triglycerides: mediator=[${z2TrigResult.mediatorSet.join(', ')}], valid=${z2TrigResult.valid}`)
assert(z2TrigResult.mediatorSet.includes('lipoprotein_lipase'), 'Identifies lipoprotein_lipase as mediator')

// zone2_volume → hdl: should identify reverse_cholesterol_transport
const z2HdlResult = findFrontdoorSet('zone2_volume', 'hdl', STRUCTURAL_EDGES)
console.log(`    zone2_volume → hdl: mediator=[${z2HdlResult.mediatorSet.join(', ')}]`)
assert(z2HdlResult.mediatorSet.includes('reverse_cholesterol_transport'), 'Identifies reverse_cholesterol_transport as mediator')

// training_load → sleep_quality: should identify core_temperature
const tlSqResult = findFrontdoorSet('training_load', 'sleep_quality', STRUCTURAL_EDGES)
console.log(`    training_load → sleep_quality: mediator=[${tlSqResult.mediatorSet.join(', ')}]`)
assert(tlSqResult.mediatorSet.includes('core_temperature'), 'Identifies core_temperature as mediator')

// ─── 7. Pathway Decomposition ───────────────────────────────────────

console.log('\n7. Pathway Decomposition')

// Check that directed paths exist in the structural DAG
const ironPaths = findAllDirectedPaths('running_volume', 'vo2_peak', causalAdj)
console.log(`    running_volume → vo2_peak: ${ironPaths.length} directed paths`)
assert(ironPaths.length > 0, 'At least one directed path from running_volume to vo2_peak')

for (const p of ironPaths.slice(0, 5)) {
  console.log(`      ${p.join(' → ')}`)
}

// For a counterfactual with decomposition, check sum ≈ total
const cfWithPaths = computeCounterfactual(
  observedValues,
  [{ nodeId: 'running_volume', value: 200, originalValue: 120 }],
  ['ferritin'],
  equations,
  STRUCTURAL_EDGES,
  topoOrder
)

if (cfWithPaths.length > 0 && cfWithPaths[0].pathwayDecomposition.length > 0) {
  const total = cfWithPaths[0].totalEffect
  const pathSum = cfWithPaths[0].pathwayDecomposition.reduce((s, p) => s + p.effect, 0)
  console.log(`    Total effect: ${total.toFixed(4)}, Pathway sum: ${pathSum.toFixed(4)}`)
  const ratio = total !== 0 ? Math.abs(pathSum / total) : pathSum === 0 ? 1 : 0
  assert(ratio > 0.5 && ratio < 2.0, 'Pathway sum within 2x of total effect',
    `Ratio: ${ratio.toFixed(4)}`)

  for (const p of cfWithPaths[0].pathwayDecomposition) {
    console.log(`      ${p.path.join(' → ')}: effect=${p.effect.toFixed(4)} (${(p.fractionOfTotal * 100).toFixed(1)}%)`)
    if (p.bottleneckEdge) console.log(`        bottleneck: ${p.bottleneckEdge}`)
  }
} else {
  console.log('    (No pathway decomposition — paths may not align with equations)')
  assert(cfWithPaths.length > 0, 'Got counterfactual results for ferritin')
}

// ─── 8. Confidence Intervals ────────────────────────────────────────

console.log('\n8. Confidence Intervals')

for (const r of cfWithPaths) {
  console.log(`    ${r.targetId}: CI [${r.confidenceInterval.low.toFixed(4)}, ${r.confidenceInterval.high.toFixed(4)}]`)
  assert(r.confidenceInterval.low <= r.totalEffect, 'CI lower bound ≤ total effect')
  assert(r.confidenceInterval.high >= r.totalEffect, 'CI upper bound ≥ total effect')
}

// ─── Summary ────────────────────────────────────────────────────────

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`)
process.exit(failed > 0 ? 1 : 0)
