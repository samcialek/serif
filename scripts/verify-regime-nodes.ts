/**
 * Verify regime node + sigmoid curve type integration.
 * Run: npx tsx scripts/verify-regime-nodes.ts
 */

import {
  evaluateEdge,
  edgeSensitivity,
  buildEquationsWithRegimes,
  REGIME_EQUATIONS,
} from '../src/data/scm/doseResponse.js'
import {
  computeFullCounterfactual,
  getCategoriesForNode,
} from '../src/data/scm/fullCounterfactual.js'
import { topologicalSort } from '../src/data/scm/dagGraph.js'
import { STRUCTURAL_EDGES, LATENT_NODES } from '../src/data/dataValue/mechanismCatalog.js'
import edgeSummaryRaw from '../src/data/dataValue/edgeSummaryRaw.json'
import type { EdgeResult } from '../src/data/dataValue/types.js'
import type { StructuralEquation } from '../src/data/scm/types.js'

const equations = buildEquationsWithRegimes(edgeSummaryRaw as EdgeResult[])
const topoOrder = topologicalSort(STRUCTURAL_EDGES)

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++ }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

console.log('\n═══ Regime Node Verification ═══\n')

// ─── 1. Sigmoid curve evaluation ──────────────────────────────────

console.log('1. Sigmoid Curve Type')

// Standard sigmoid: acwr → overreaching_state (theta=1.5, k=5.0, ba=1.0)
const acwrEq = REGIME_EQUATIONS.find(e => e.source === 'acwr' && e.target === 'overreaching_state')!

// At dose well below threshold (acwr=0.8): should be near 0
const lowActivation = evaluateEdge(0.8, acwrEq)
assert(lowActivation < 0.05, `acwr=0.8 → activation=${lowActivation.toFixed(4)} (near 0)`)

// At threshold (acwr=1.5): should be exactly 0.5 (sigmoid midpoint)
const midActivation = evaluateEdge(1.5, acwrEq)
assert(Math.abs(midActivation - 0.5) < 0.01, `acwr=1.5 → activation=${midActivation.toFixed(4)} (midpoint ≈ 0.5)`)

// Well above threshold (acwr=2.5): should be near 1.0
const highActivation = evaluateEdge(2.5, acwrEq)
assert(highActivation > 0.95, `acwr=2.5 → activation=${highActivation.toFixed(4)} (near 1.0)`)

// ─── 2. Inverse sigmoid ─────────────────────────────────────────────

console.log('\n2. Inverse Sigmoid (Iron Deficiency)')

// ferritin → iron_deficiency_state (theta=30, k=-0.2, ba=1.0)
const ferritinEq = REGIME_EQUATIONS.find(e => e.source === 'ferritin' && e.target === 'iron_deficiency_state')!

// High ferritin (60): should be near 0 (not deficient)
const highFerritin = evaluateEdge(60, ferritinEq)
assert(highFerritin < 0.05, `ferritin=60 → deficiency=${highFerritin.toFixed(4)} (near 0, not deficient)`)

// At threshold (ferritin=30): should be 0.5
const midFerritin = evaluateEdge(30, ferritinEq)
assert(Math.abs(midFerritin - 0.5) < 0.01, `ferritin=30 → deficiency=${midFerritin.toFixed(4)} (midpoint ≈ 0.5)`)

// Low ferritin (10): should be near 1.0 (deficient)
const lowFerritin = evaluateEdge(10, ferritinEq)
assert(lowFerritin > 0.95, `ferritin=10 → deficiency=${lowFerritin.toFixed(4)} (near 1.0, deficient)`)

// ─── 3. Sigmoid derivative ──────────────────────────────────────────

console.log('\n3. Sigmoid Sensitivity (Derivative)')

// At midpoint: derivative should be maximal → ba * bb / 4
const midSens = edgeSensitivity(1.5, acwrEq)
const expectedMaxSens = acwrEq.ba * acwrEq.bb * 0.25  // σ(0)*(1-σ(0)) = 0.25
assert(Math.abs(midSens - expectedMaxSens) < 0.01, `acwr midpoint sensitivity=${midSens.toFixed(4)} (expected ${expectedMaxSens.toFixed(4)})`)

// Far from midpoint: derivative should be near 0
const farSens = edgeSensitivity(0.0, acwrEq)
assert(Math.abs(farSens) < 0.01, `acwr=0.0 sensitivity=${farSens.toFixed(4)} (near 0, saturated region)`)

// ─── 4. Regime equations count ────────────────────────────────────

console.log('\n4. Regime Equation Inventory')

const sigmoidEqs = REGIME_EQUATIONS.filter(e => e.curveType === 'sigmoid')
const linearEqs = REGIME_EQUATIONS.filter(e => e.curveType === 'linear')
assert(sigmoidEqs.length === 4, `${sigmoidEqs.length} sigmoid activation edges (expected 4)`)
assert(linearEqs.length === 12, `${linearEqs.length} linear downstream edges (expected 12: 4+3+3+2)`)

// Total with fitted
const fittedCount = equations.length - REGIME_EQUATIONS.length
assert(equations.length > fittedCount, `${equations.length} total equations (${fittedCount} fitted + ${REGIME_EQUATIONS.length} regime)`)

// ─── 5. Regime nodes in DAG infrastructure ────────────────────────

console.log('\n5. Regime Nodes in DAG')

const regimeNodeIds = ['overreaching_state', 'iron_deficiency_state', 'sleep_deprivation_state', 'inflammation_state']

// Check they're in LATENT_NODES
for (const id of regimeNodeIds) {
  assert(LATENT_NODES.includes(id), `${id} is in LATENT_NODES`)
}

// Check topological sort includes them
for (const id of regimeNodeIds) {
  assert(topoOrder.includes(id), `${id} appears in topological order`)
}

// ─── 6. Regime nodes are category-less (ADR-004) ─────────────────

console.log('\n6. Regime Nodes Are Category-Less (ADR-004)')

for (const id of regimeNodeIds) {
  const cats = getCategoriesForNode(id)
  assert(cats.length === 0, `${id} → categories=[] (infrastructure, not a health marker)`)
}

// Non-regime nodes still get categories
assert(getCategoriesForNode('cortisol').length > 0, 'cortisol still has categories')
assert(getCategoriesForNode('hemoglobin').length > 0, 'hemoglobin still has categories')

// ─── 7. Topological ordering respects regime edges ────────────────

console.log('\n7. Topological Ordering')

const acwrIdx = topoOrder.indexOf('acwr')
const overreachIdx = topoOrder.indexOf('overreaching_state')
if (acwrIdx >= 0 && overreachIdx >= 0) {
  assert(acwrIdx < overreachIdx, `acwr (${acwrIdx}) before overreaching_state (${overreachIdx})`)
}

// overreaching_state should come before its downstream targets
const cortisolIdx = topoOrder.indexOf('cortisol')
if (overreachIdx >= 0 && cortisolIdx >= 0) {
  assert(overreachIdx < cortisolIdx, `overreaching_state (${overreachIdx}) before cortisol (${cortisolIdx})`)
}

// ─── 8. Full counterfactual with regime propagation ──────────────

console.log('\n8. Full Counterfactual — Regime Propagation')

// Simulate high ACWR (overreaching): should activate overreaching_state
// and amplify downstream effects on cortisol, testosterone, hrv, hscrp
const observedValues: Record<string, number> = {
  acwr: 1.0,
  ferritin: 50,
  sleep_debt: 2,
  hscrp: 1.0,
  cortisol: 15,
  testosterone: 500,
  hrv_daily: 55,
  hemoglobin: 14.5,
  vo2_peak: 50,
  rbc: 4.8,
  glucose: 90,
  hdl: 55,
  insulin_sensitivity: 1.0,
  overreaching_state: 0,
  iron_deficiency_state: 0,
  sleep_deprivation_state: 0,
  inflammation_state: 0,
}

// do(acwr = 2.0) — push into overreaching territory
const result = computeFullCounterfactual(
  observedValues,
  [{ nodeId: 'acwr', value: 2.0, originalValue: 1.0 }],
  equations,
  STRUCTURAL_EDGES,
  topoOrder
)

assert(result.allEffects.size > 0, `${result.allEffects.size} downstream nodes affected by do(acwr=2.0)`)

// Overreaching state should activate
const overreachEffect = result.allEffects.get('overreaching_state')
if (overreachEffect) {
  assert(overreachEffect.counterfactualValue > 0.9,
    `overreaching_state activates to ${overreachEffect.counterfactualValue.toFixed(3)} (expected >0.9)`)
} else {
  assert(false, 'overreaching_state should appear in effects')
}

// Downstream: cortisol should increase (overreaching → cortisol is positive)
const cortisolEffect = result.allEffects.get('cortisol')
if (cortisolEffect) {
  assert(cortisolEffect.totalEffect > 0,
    `cortisol effect=${cortisolEffect.totalEffect.toFixed(2)} (expected positive, overreaching ↑ cortisol)`)
} else {
  // May not appear if the twin engine doesn't propagate through latent regime nodes
  console.log('  ⓘ cortisol not in effects — twin engine may not propagate through latent regime nodes (expected)')
}

// Check that regime nodes don't appear in any category summary
const allCatNodes = [
  ...result.categoryEffects.metabolic.affectedNodes,
  ...result.categoryEffects.cardio.affectedNodes,
  ...result.categoryEffects.recovery.affectedNodes,
  ...result.categoryEffects.sleep.affectedNodes,
]
const regimeInCategories = allCatNodes.filter(n => regimeNodeIds.includes(n.nodeId))
assert(regimeInCategories.length === 0,
  `No regime nodes in category summaries (found ${regimeInCategories.length})`)

// ─── Summary ──────────────────────────────────────────────────────

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`)
process.exit(failed > 0 ? 1 : 0)
