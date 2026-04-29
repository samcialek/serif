/**
 * Smoke tests for the agency layer.
 *
 * Run: npx tsx --tsconfig ./tsconfig.app.json src/data/agency/agency.test.ts
 */

import type { ParticipantPortal } from '@/data/portal/types'
import { caspianAgencyGraph } from './caspianAgencyGraph'
import { explainAgencyRecommendation } from './explainAgency'
import { scoreAgencyGraph } from './scoreAgency'
import type { AgencyNode } from './types'

let failures = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    console.error(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`)
    failures += 1
    process.exitCode = 1
  }
}

function makeCaspianContext(): ParticipantPortal {
  return {
    pid: 1,
    cohort: 'cohort_a',
    age: 37,
    is_female: false,
    effects_bayesian: [],
    tier_counts: { recommended: 0, possible: 0, not_exposed: 0 },
    exposed_count: 0,
    protocols: [],
    current_values: {
      travel_load: 0.35,
    },
    behavioral_sds: {},
    regime_activations: {
      iron_deficiency_state: 0.65,
      sleep_deprivation_state: 0.75,
      overreaching_state: 0.03,
      inflammation_state: 0.05,
    },
    loads_today: {
      acwr: { value: 0.69, baseline: 0.93, sd: 0.15, z: -1.6, ratio: 0.74 },
      sleep_debt_14d: { value: 7.47, baseline: 8.64, sd: 1.2, z: -0.98, ratio: 0.86 },
    },
    weather_today: {
      temp_c: -10.2,
      humidity_pct: 69,
      uv_index: 2.2,
      aqi: 61,
    },
  } as unknown as ParticipantPortal
}

function nodeById(id: string): AgencyNode | undefined {
  return caspianAgencyGraph.nodes.find((node) => node.id === id)
}

console.log('\n[testGraphReferencesAreValid]')
const nodeIds = new Set(caspianAgencyGraph.nodes.map((node) => node.id))
const missingRefs: string[] = []
for (const edge of caspianAgencyGraph.edges) {
  for (const id of [edge.source, edge.target]) {
    if (!nodeIds.has(id)) missingRefs.push(`${edge.id}:${id}`)
  }
  for (const id of [
    ...edge.holdConstant,
    ...edge.watch,
    ...edge.substitutes,
    ...(edge.context ?? []),
  ]) {
    if (!nodeIds.has(id)) missingRefs.push(`${edge.id}:${id}`)
  }
}
check(
  'all edge endpoints and metadata references point at real nodes',
  missingRefs.length === 0,
  missingRefs.join(', '),
)

console.log('\n[testRespectNodesAreNotDirectActions]')
const plan = scoreAgencyGraph(caspianAgencyGraph, {
  participant: makeCaspianContext(),
  options: { horizon: 'today', maxPerGroup: 6 },
})
const respectInDo = plan.byGroup.do_today.filter(
  (rec) => rec.source.agencyKind === 'respect',
)
check(
  'respect/context nodes never appear in Do Today',
  respectInDo.length === 0,
  respectInDo.map((rec) => rec.source.id).join(', '),
)

console.log('\n[testCaspianKnownPrioritiesSurface]')
const topDoIds = plan.byGroup.do_today.map((rec) => rec.edge.id)
check(
  'late-workout sleep cutoff surfaces in Do Today',
  topDoIds.includes('e_late_workout_sleep_efficiency'),
  topDoIds.join(', '),
)
check(
  'long-horizon iron supplement timing does not dominate daily view',
  topDoIds.indexOf('e_iron_timing_ferritin') === -1,
  topDoIds.join(', '),
)

const weekPlan = scoreAgencyGraph(caspianAgencyGraph, {
  participant: makeCaspianContext(),
  options: { horizon: 'week', maxPerGroup: 10 },
})
const steerIds = weekPlan.byGroup.steer_this_week.map((rec) => rec.edge.id)
check(
  'run-volume iron pressure surfaces in Steer This Week',
  steerIds.includes('e_running_ferritin_pressure') ||
    steerIds.includes('e_running_saturation_pressure'),
  steerIds.join(', '),
)

console.log('\n[testEnvironmentalContextCreatesMitigation]')
const coldRec = plan.byGroup.respect_today.find(
  (rec) => rec.source.id === 'cold_temp',
)
check('cold context appears in Respect Today', coldRec != null)
check(
  'cold recommendation offers an indoor mitigation instead of controlling weather',
  Boolean(coldRec?.edge.substitutes.includes('indoor_zone2_substitution')),
  coldRec?.edge.substitutes.join(', '),
)
check(
  'cold node is classified as respect',
  nodeById('cold_temp')?.agencyKind === 'respect',
  nodeById('cold_temp')?.agencyKind,
)

console.log('\n[testExplanationLayer]')
const lateWorkout = plan.byGroup.do_today.find(
  (rec) => rec.edge.id === 'e_late_workout_sleep_efficiency',
)
const explanation = lateWorkout
  ? explainAgencyRecommendation(caspianAgencyGraph, lateWorkout)
  : null
check(
  'explanation includes hold-constant nodes',
  (explanation?.holdConstant.length ?? 0) >= 2,
)
check(
  'explanation includes watch nodes',
  (explanation?.watch.length ?? 0) >= 2,
)

console.log('\nDone.')
process.exit(failures > 0 ? 1 : 0)
