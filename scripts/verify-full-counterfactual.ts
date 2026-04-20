/**
 * Verify full counterfactual engine with category grouping and tradeoffs.
 * Run: npx tsx scripts/verify-full-counterfactual.ts
 */

import { computeFullCounterfactual, getNodeCategoryMap } from '../src/data/scm/fullCounterfactual.js'
import { buildEquationsFromEdges } from '../src/data/scm/doseResponse.js'
import { topologicalSort } from '../src/data/scm/dagGraph.js'
import { STRUCTURAL_EDGES } from '../src/data/dataValue/mechanismCatalog.js'
import edgeSummaryRaw from '../src/data/dataValue/edgeSummaryRaw.json'
import type { EdgeResult } from '../src/data/dataValue/types.js'

const equations = buildEquationsFromEdges(edgeSummaryRaw as EdgeResult[])
const topoOrder = topologicalSort(STRUCTURAL_EDGES)

let passed = 0
let failed = 0

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) { console.log(`  ✓ ${label}`); passed++ }
  else { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++ }
}

console.log('\n═══ Full Counterfactual Verification ═══\n')

// ─── 1. Node-category mapping ─────────────────────────────────────

console.log('1. Node-Category Mapping')
const catMap = getNodeCategoryMap()
assert(catMap.size > 30, `${catMap.size} nodes have category assignments`)

const ironCats = catMap.get('iron_total')
assert(ironCats !== undefined && ironCats.has('metabolic'), 'iron_total → metabolic')

const trigCats = catMap.get('triglycerides')
assert(trigCats !== undefined && trigCats.has('cardio'), 'triglycerides → cardio')

const hrvCats = catMap.get('hrv_daily')
assert(hrvCats !== undefined && hrvCats.has('recovery'), 'hrv_daily → recovery')

const sleepCats = catMap.get('sleep_efficiency')
assert(sleepCats !== undefined && sleepCats.has('sleep'), 'sleep_efficiency → sleep')

// testosterone should be in BOTH metabolic (training_hrs_testosterone) and recovery (sleep_dur_testosterone)
const testoCats = catMap.get('testosterone')
assert(testoCats !== undefined && testoCats.has('metabolic') && testoCats.has('recovery'),
  'testosterone → metabolic + recovery (multi-category)',
  `Got: ${testoCats ? [...testoCats].join(', ') : 'none'}`)

// ─── 2. Single intervention, full propagation ─────────────────────

console.log('\n2. Single Intervention: do(running_volume = 200)')
const observed = {
  running_volume: 120,
  iron_total: 80,
  ferritin: 45,
  hemoglobin: 14.5,
  vo2_peak: 52,
  zinc: 80,
  magnesium_rbc: 5.0,
  rbc: 4.8,
}

const state = computeFullCounterfactual(
  observed,
  [{ nodeId: 'running_volume', value: 200, originalValue: 120 }],
  equations, STRUCTURAL_EDGES, topoOrder
)

assert(state.allEffects.size > 0, `${state.allEffects.size} nodes affected`)

// Check category breakdown
for (const [cat, summary] of Object.entries(state.categoryEffects)) {
  if (summary.affectedNodes.length > 0) {
    console.log(`    [${cat}] ${summary.affectedNodes.length} nodes, net signal: ${summary.netSignal.toFixed(3)}`)
    for (const n of summary.affectedNodes) {
      console.log(`      ${n.nodeId}: Δ${n.totalEffect >= 0 ? '+' : ''}${n.totalEffect.toFixed(3)} [${n.identification.strategy}]`)
    }
  }
}

const metabolicCount = state.categoryEffects.metabolic.affectedNodes.length
assert(metabolicCount > 0, `Metabolic category has ${metabolicCount} affected nodes`)

// Running volume should primarily affect metabolic markers
const metabolicNodes = state.categoryEffects.metabolic.affectedNodes.map(n => n.nodeId)
assert(metabolicNodes.includes('iron_total') || metabolicNodes.includes('ferritin'),
  'Iron pathway markers appear in metabolic category')

// ─── 3. Multi-intervention stacking ──────────────────────────────

console.log('\n3. Multi-Intervention: do(running_volume=200, sleep_duration=8)')
const observed2 = {
  ...observed,
  sleep_duration: 6.5,
  testosterone: 500,
  cortisol: 12,
  hrv_daily: 50,
  resting_hr: 55,
  wbc: 6.0,
  glucose: 90,
}

const state2 = computeFullCounterfactual(
  observed2,
  [
    { nodeId: 'running_volume', value: 200, originalValue: 120 },
    { nodeId: 'sleep_duration', value: 8, originalValue: 6.5 },
  ],
  equations, STRUCTURAL_EDGES, topoOrder
)

assert(state2.allEffects.size > state.allEffects.size,
  `Multi-intervention affects more nodes (${state2.allEffects.size} vs ${state.allEffects.size})`)

// Sleep duration should add recovery effects
const recoveryCount = state2.categoryEffects.recovery.affectedNodes.length
assert(recoveryCount > 0, `Recovery category has ${recoveryCount} affected nodes from sleep intervention`)

console.log(`    Total: ${state2.allEffects.size} nodes across all categories`)
for (const [cat, summary] of Object.entries(state2.categoryEffects)) {
  if (summary.affectedNodes.length > 0) {
    console.log(`    [${cat}] ${summary.affectedNodes.length} nodes, net: ${summary.netSignal.toFixed(3)}`)
  }
}

// ─── 4. Tradeoff detection ───────────────────────────────────────

console.log('\n4. Tradeoff Detection')
console.log(`    Single intervention tradeoffs: ${state.tradeoffs.length}`)
console.log(`    Multi-intervention tradeoffs: ${state2.tradeoffs.length}`)

if (state.tradeoffs.length > 0) {
  for (const t of state.tradeoffs) {
    console.log(`    ⚖ ${t.description}`)
  }
}
if (state2.tradeoffs.length > 0) {
  for (const t of state2.tradeoffs) {
    console.log(`    ⚖ ${t.description}`)
  }
}

// At least one of the two should have tradeoffs (running hurts iron but helps fitness)
assert(state.tradeoffs.length > 0 || state2.tradeoffs.length > 0,
  'At least one scenario produces cross-category tradeoffs')

// ─── 5. Empty intervention ────────────────────────────────────────

console.log('\n5. Edge Cases')
const emptyState = computeFullCounterfactual(observed, [], equations, STRUCTURAL_EDGES, topoOrder)
assert(emptyState.allEffects.size === 0, 'Empty intervention produces no effects')
assert(emptyState.tradeoffs.length === 0, 'Empty intervention produces no tradeoffs')

// ─── Summary ────────────────────────────────────────────────────

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`)
process.exit(failed > 0 ? 1 : 0)
