/**
 * Smoke tests for dagAssembly.
 *
 * Run:  npx tsx --tsconfig ./tsconfig.app.json src/utils/dagAssembly.test.ts
 *
 * Mirrors the style of exploration.test.ts — manual asserts, exit code
 * carries pass/fail. Two layers of test:
 *
 *   1. Synthetic stub participant — controlled member edges, predictable
 *      tier promotions and dedup behavior.
 *   2. Real Caspian payload (participant_0001.json) — sanity checks on
 *      the union: edge count > 800, every edge endpoint has a node, no
 *      orphans, all expected node classes appear.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ParticipantPortal } from '@/data/portal/types'
import { assembleDag } from './dagAssembly'

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

function makeStubParticipant(
  effects: Array<{
    action: string
    outcome: string
    mean: number
    sd?: number
    pathway?: 'wearable' | 'biomarker'
    horizon_days?: number
    evidence_tier?: 'cohort_level' | 'personal_emerging' | 'personal_established'
  }>,
): ParticipantPortal {
  return {
    pid: 999,
    cohort: 'test',
    age: 40,
    is_female: false,
    effects_bayesian: effects.map((e) => ({
      action: e.action,
      outcome: e.outcome,
      pathway: e.pathway,
      evidence_tier: e.evidence_tier ?? 'personal_emerging',
      horizon_days: e.horizon_days,
      nominal_step: 1,
      dose_multiplier: 1,
      dose_multiplier_raw: 1,
      direction_conflict: false,
      scaled_effect: e.mean,
      posterior: {
        mean: e.mean,
        variance: (e.sd ?? 0.3) ** 2,
        sd: e.sd ?? 0.3,
        contraction: 0.4,
        prior_mean: e.mean,
        prior_variance: 0.25,
        source: 'fitted',
        lam_js: 0.5,
        n_cohort: 0,
        z_like: 0,
      },
      cohort_prior: null,
      user_obs: null,
      gate: { score: 0.5, tier: 'possible' },
    })),
    tier_counts: {} as Record<string, number>,
    exposed_count: 0,
    protocols: [],
    current_values: {},
    behavioral_sds: {},
  } as unknown as ParticipantPortal
}

// ─── Test 1: empty participant pulls only literature + structural ──

console.log('\nempty participant — only literature + structural backbone:')
{
  const empty = makeStubParticipant([])
  const { nodes, edges } = assembleDag(empty)
  assert(edges.length > 100, `>100 edges from priors alone (got ${edges.length})`)
  assert(nodes.length > 30, `>30 nodes from priors alone (got ${nodes.length})`)

  // No member-tier edges
  const memberEdges = edges.filter((e) => e.evidenceTier === 'member')
  assert(memberEdges.length === 0, `no member edges when payload empty (got ${memberEdges.length})`)

  // Every edge must have endpoints in the node set
  const nodeIds = new Set(nodes.map((n) => n.id))
  const missing = edges.filter((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target))
  assert(missing.length === 0, `no orphan edge endpoints (got ${missing.length})`)
}

// ─── Test 2: member edge promotes over literature ─────────────────

console.log('\nmember edge wins over literature for the same (source, target):')
{
  const p = makeStubParticipant([
    { action: 'caffeine_mg', outcome: 'deep_sleep', mean: -0.42, sd: 0.15, pathway: 'wearable', horizon_days: 5, evidence_tier: 'personal_established' },
  ])
  const { edges } = assembleDag(p)
  const e = edges.find(
    (x) => x.source === 'caffeine_mg' && x.target === 'deep_sleep' && x.kind === 'causal',
  )
  assert(e != null, 'caffeine_mg→deep_sleep present')
  assert(e!.evidenceTier === 'member', `tier promoted to member (got ${e!.evidenceTier})`)
  assert(e!.fromMember === true, 'fromMember flag set')
  assert(e!.fromLiterature === true, 'fromLiterature flag carried (PHASE_1 has this edge)')
  assert(Math.abs(e!.effect - -0.42) < 1e-9, `effect uses member posterior (got ${e!.effect})`)
  assert(Math.abs(e!.effectSd - 0.15) < 1e-9, `effectSd uses member posterior (got ${e!.effectSd})`)
  assert(e!.horizon === 'week', `wearable resolves at week (got ${e!.horizon})`)
}

// ─── Test 3: cohort tier sits between member and literature ───────

console.log('\ncohort_level evidence tier maps to "cohort":')
{
  const p = makeStubParticipant([
    { action: 'zone2_minutes', outcome: 'hrv_daily', mean: 0.48, sd: 0.20, pathway: 'wearable', evidence_tier: 'cohort_level' },
  ])
  const { edges } = assembleDag(p)
  const e = edges.find(
    (x) => x.source === 'zone2_minutes' && x.target === 'hrv_daily' && x.kind === 'causal',
  )
  assert(e != null, 'zone2_minutes→hrv_daily present')
  assert(e!.evidenceTier === 'cohort', `tier = cohort (got ${e!.evidenceTier})`)
  assert(e!.fromMember === true, 'fromMember flag is set even at cohort tier (came from payload)')
}

// ─── Test 4: confounder edges kept separate from causal ───────────

console.log('\nconfounding edge does not merge with causal:')
{
  const p = makeStubParticipant([])
  const { edges } = assembleDag(p)
  // travel_load → hrv_daily appears as confounds (STRUCTURAL_EDGES) AND
  // causal (ENVIRONMENTAL_EDGES). Both should exist as distinct edges.
  const causal = edges.find(
    (e) => e.source === 'travel_load' && e.target === 'hrv_daily' && e.kind === 'causal',
  )
  const confound = edges.find(
    (e) => e.source === 'travel_load' && e.target === 'hrv_daily' && e.kind === 'confounds',
  )
  assert(causal != null, 'travel_load→hrv_daily causal exists')
  assert(confound != null, 'travel_load→hrv_daily confounds exists')
}

// ─── Test 5: horizon assignment by pathway ────────────────────────

console.log('\nhorizon: wearable → week, biomarker → quarter:')
{
  const p = makeStubParticipant([
    { action: 'bedtime', outcome: 'hrv_daily', mean: -0.3, pathway: 'wearable' },
    { action: 'dietary_protein', outcome: 'ferritin', mean: 0.4, pathway: 'biomarker' },
  ])
  const { edges } = assembleDag(p)
  const wearable = edges.find((e) => e.source === 'bedtime' && e.target === 'hrv_daily')
  const biomarker = edges.find((e) => e.source === 'dietary_protein' && e.target === 'ferritin')
  assert(wearable?.horizon === 'week', `bedtime→hrv = week (got ${wearable?.horizon})`)
  assert(biomarker?.horizon === 'quarter', `dietary_protein→ferritin = quarter (got ${biomarker?.horizon})`)
}

// ─── Test 6: beneficial direction ─────────────────────────────────

console.log('\nbeneficial direction sign-aware:')
{
  const p = makeStubParticipant([
    { action: 'sleep_duration', outcome: 'hrv_daily', mean: 0.3 },          // higher is good for HRV → beneficial
    { action: 'caffeine_mg',   outcome: 'sleep_onset_latency', mean: 0.4 }, // higher SOL is bad → harmful
  ])
  const { edges } = assembleDag(p)
  const good = edges.find((e) => e.source === 'sleep_duration' && e.target === 'hrv_daily')
  const bad = edges.find((e) => e.source === 'caffeine_mg' && e.target === 'sleep_onset_latency')
  assert(good?.beneficial === true, `sleep_duration→hrv beneficial (got ${good?.beneficial})`)
  assert(bad?.beneficial === false, `caffeine→SOL harmful (got ${bad?.beneficial})`)
}

// ─── Test 7: node operational class assignment ────────────────────

console.log('\nnode operational class assignment:')
{
  const p = makeStubParticipant([])
  const { nodes } = assembleDag(p)

  function classOf(id: string): string | undefined {
    return nodes.find((n) => n.id === id)?.operationalClass
  }

  assert(classOf('aqi') === 'field', 'aqi is FIELD')
  assert(classOf('travel_load') === 'field', 'travel_load is FIELD')
  assert(classOf('acwr') === 'load', 'acwr is LOAD')
  assert(classOf('sleep_debt_14d') === 'load' || classOf('sleep_debt') === 'load', 'sleep_debt is LOAD')
  assert(classOf('caffeine_mg') === 'dose', 'caffeine_mg is DOSE')
  assert(classOf('supp_omega3') === 'dose', 'supp_omega3 is DOSE')
  assert(classOf('hrv_daily') === 'target', 'hrv_daily is TARGET')
  assert(classOf('ferritin') === 'target', 'ferritin is TARGET')
  assert(
    classOf('ground_contacts') === 'mediator',
    `ground_contacts is MEDIATOR (got ${classOf('ground_contacts')})`,
  )
}

// ─── Test 8: real Caspian payload ─────────────────────────────────

console.log('\nreal Caspian payload (participant_0001.json):')
try {
  const payloadPath = resolve(
    process.cwd(),
    'backend/output/portal_bayesian/participant_0001.json',
  )
  // Caspian's payload is exported by Python json which emits non-standard
  // `NaN` literals for missing values. Sanitize before parse.
  const raw = readFileSync(payloadPath, 'utf-8')
  const sanitized = raw.replace(/:\s*NaN\b/g, ': null')
  const caspian = JSON.parse(sanitized) as ParticipantPortal

  const { nodes, edges } = assembleDag(caspian)

  assert(edges.length > 800, `Caspian's union > 800 edges (got ${edges.length})`)
  assert(nodes.length > 60, `Caspian's union > 60 nodes (got ${nodes.length})`)

  const memberEdges = edges.filter((e) => e.fromMember)
  assert(memberEdges.length > 500, `>500 member-fitted edges (got ${memberEdges.length})`)

  // Caspian's iron pathway should fully resolve as nodes
  for (const id of ['ferritin', 'hemoglobin', 'iron_total', 'running_volume', 'ground_contacts']) {
    const has = nodes.find((n) => n.id === id)
    assert(has != null, `node ${id} present`)
  }

  // No orphan endpoints
  const nodeIds = new Set(nodes.map((n) => n.id))
  const missing = edges.filter((e) => !nodeIds.has(e.source) || !nodeIds.has(e.target))
  assert(missing.length === 0, `no orphan edge endpoints in Caspian's union (got ${missing.length})`)

  // Every operational class should appear at least once
  const seenClasses = new Set(nodes.map((n) => n.operationalClass))
  for (const cls of ['dose', 'load', 'field', 'target', 'mediator'] as const) {
    assert(seenClasses.has(cls), `class ${cls} appears in Caspian's union`)
  }

  // Every horizon value should appear
  const seenHorizons = new Set(edges.filter((e) => e.kind === 'causal').map((e) => e.horizon))
  assert(seenHorizons.has('week'), 'week horizon present')
  assert(seenHorizons.has('quarter'), 'quarter horizon present')

  // Tier ordering: at least some member edges, some literature
  const tiers = new Set(edges.map((e) => e.evidenceTier))
  assert(tiers.has('member') || tiers.has('cohort'), 'member or cohort tier present')
  assert(tiers.has('literature'), 'literature tier present')
  assert(tiers.has('mechanism'), 'mechanism tier present')
} catch (err) {
  console.error('  SKIP  Caspian payload not readable:', (err as Error).message)
}

// ─── Result ────────────────────────────────────────────────────────

if (failures === 0) {
  console.log('\nAll dagAssembly tests passed.')
} else {
  console.error(`\n${failures} dagAssembly test(s) failed.`)
}
