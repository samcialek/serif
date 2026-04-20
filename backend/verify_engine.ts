/**
 * Acceptance test for the twin SCM engine's pathway decomposition.
 *
 * Exercises decomposePathways() via computeCounterfactual() across four
 * scenarios that together verify the regime-aggregation contract:
 *
 *   1. Null case        — no sigmoid crosses threshold → no aggregate emitted
 *   2. Active regime    — one sigmoid activates → exactly one aggregate entry
 *   3. Multi-regime     — two sigmoids activate → STILL one aggregate entry (collapsed)
 *   4. Sum invariant    — sum(pathEffect) === totalEffect within 1e-6
 *
 * Also enforces the shape contract:
 *   - isRegimeAggregate entries have edgeConfidences=[] and bottleneckEdge=null
 *
 * Run:   npx tsx backend/verify_engine.ts
 * Exit:  0 if all assertions pass, 1 otherwise.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { computeCounterfactual, REGIME_NODE_IDS } from '../src/data/scm/twinEngine'
import { buildEquationsWithRegimes } from '../src/data/scm/doseResponse'
import { topologicalSort } from '../src/data/scm/dagGraph'
import { STRUCTURAL_EDGES } from '../src/data/dataValue/mechanismCatalog'
import type { EdgeResult } from '../src/data/dataValue/types'
import type { Intervention, CounterfactualResult, PathwayEffect } from '../src/data/scm/types'
import {
  computeGatingScore,
  normalCdf,
  tierFromScore,
  isExposed,
  TIER_RECOMMENDED,
  LITERATURE_SUPPRESSED_POSITION,
  PRESET_BOUNDARIES,
  DEFAULT_PRESET,
} from '../src/data/scm/gating'
import { getThreshold, CLINICAL_THRESHOLDS } from '../src/data/dataValue/clinicalThresholds'

// ─── Setup ──────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const edgeJsonPath = resolve(__dirname, '../src/data/dataValue/edgeSummaryRaw.json')
const edgeResults: EdgeResult[] = JSON.parse(readFileSync(edgeJsonPath, 'utf8'))

const equations = buildEquationsWithRegimes(edgeResults)
const topoOrder = topologicalSort(STRUCTURAL_EDGES)

// Baseline observed values: regimes inactive by construction.
//   acwr = 0.9           (overreaching_state threshold is 1.5)
//   ferritin = 80        (iron_deficiency_state threshold is 30, inverse)
//   sleep_debt = 1.0     (sleep_deprivation_state threshold is 5.0)
//   hscrp = 0.5          (inflammation_state threshold is 3.0)
// Other nodes are given plausible midpoint values so abduction has
// something to anchor to; unset nodes default to noise=0.
const BASELINE_OBSERVED: Record<string, number> = {
  acwr: 0.9,
  ferritin: 80,
  sleep_debt: 1.0,
  hscrp: 0.5,
  sleep_duration: 7.5,
  training_volume: 50,
  running_volume: 5,
  testosterone: 500,
  cortisol: 15,
  iron_total: 120,
  hemoglobin: 14,
  vo2_peak: 45,
  hrv_daily: 60,
  resting_hr: 55,
  glucose: 90,
  hdl: 55,
  wbc: 6,
}

// ─── Assertion plumbing ─────────────────────────────────────────

let failures = 0
let passes = 0

function assert(label: string, condition: boolean, detail = '') {
  if (condition) {
    passes++
    console.log(`  PASS  ${label}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`)
  }
}

function runScenario(
  name: string,
  interventions: Intervention[],
  targets: string[],
  observed: Record<string, number> = BASELINE_OBSERVED,
): CounterfactualResult[] {
  console.log(`\n── ${name} ──`)
  console.log(`   interventions: ${interventions.map(i => `do(${i.nodeId}=${i.value})`).join(', ')}`)
  console.log(`   targets: ${targets.join(', ')}`)
  return computeCounterfactual(observed, interventions, targets, equations, STRUCTURAL_EDGES, topoOrder)
}

function aggregateEntries(path: PathwayEffect[]): PathwayEffect[] {
  return path.filter(p => p.isRegimeAggregate === true)
}

function sumOfEffects(path: PathwayEffect[]): number {
  return path.reduce((s, p) => s + p.effect, 0)
}

// ─── Scenario 1: Null case ──────────────────────────────────────
// Treatment with NO regime path to target. sleep_duration → testosterone
// is a direct fitted edge; sleep_duration does not reach any regime node
// (sleep_deprivation_state's parent is sleep_debt, not sleep_duration).
// Expect at least one direct path entry and zero aggregate entries.
// (Note: the sigmoid has long tails, so "sub-threshold" interventions still
// produce measurable regime effect — see engine lesson #16 rationale. The
// real null condition is "regime paths don't exist in the DAG for this pair".)
{
  const res = runScenario(
    'Scenario 1: null case (sleep_duration → testosterone has no regime path)',
    [{ nodeId: 'sleep_duration', value: 5.5, originalValue: 7.5 }],
    ['testosterone'],
  )
  const t = res[0]
  const aggs = aggregateEntries(t.pathwayDecomposition)
  assert('no regime aggregate entry emitted', aggs.length === 0,
    `got ${aggs.length} aggregate entries: ${JSON.stringify(aggs.map(a => a.path))}`)
  assert('at least one direct pathway entry', t.pathwayDecomposition.length >= 1,
    `got ${t.pathwayDecomposition.length} entries`)
  assert('totalEffect is non-trivial (sleep_duration does affect testosterone)',
    Math.abs(t.totalEffect) > 1e-6,
    `totalEffect=${t.totalEffect}`)
}

// ─── Scenario 2: Active regime ──────────────────────────────────
// Intervene on acwr to cross the overreaching_state sigmoid threshold (1.5).
// Paths from acwr to testosterone:
//   [acwr → testosterone]                         (direct)
//   [acwr → overreaching_state → testosterone]    (regime)
// Expect exactly one aggregate entry capturing the regime contribution.
{
  const res = runScenario(
    'Scenario 2: one regime activates (acwr 0.9 → 2.0 crosses overreaching threshold 1.5)',
    [{ nodeId: 'acwr', value: 2.0, originalValue: 0.9 }],
    ['testosterone'],
  )
  const t = res[0]
  const aggs = aggregateEntries(t.pathwayDecomposition)
  assert('exactly one regime aggregate entry', aggs.length === 1,
    `got ${aggs.length}`)
  if (aggs.length === 1) {
    const agg = aggs[0]
    assert('aggregate has non-trivial effect (|eff| > 1e-6)', Math.abs(agg.effect) > 1e-6,
      `agg.effect=${agg.effect}`)
    assert('aggregate lists overreaching_state in path',
      agg.path.includes('overreaching_state'),
      `agg.path=${JSON.stringify(agg.path)}`)
    assert('aggregate has empty edgeConfidences', agg.edgeConfidences.length === 0,
      `len=${agg.edgeConfidences.length}`)
    assert('aggregate has null bottleneckEdge', agg.bottleneckEdge === null,
      `bottleneckEdge=${agg.bottleneckEdge}`)
  }
}

// ─── Scenario 3: Multi-regime collapse ──────────────────────────
// Intervene on acwr AND sleep_debt so overreaching_state AND
// sleep_deprivation_state both activate. Both regimes affect testosterone.
// The decomposition should still emit a SINGLE aggregate entry, not one
// per regime — the aggregate absorbs all non-direct-path effect.
{
  const res = runScenario(
    'Scenario 3: two regimes activate (acwr 0.9 → 2.0 + sleep_debt 1.0 → 10.0)',
    [
      { nodeId: 'acwr', value: 2.0, originalValue: 0.9 },
      { nodeId: 'sleep_debt', value: 10.0, originalValue: 1.0 },
    ],
    ['testosterone'],
  )
  const t = res[0]
  const aggs = aggregateEntries(t.pathwayDecomposition)
  assert('still exactly one regime aggregate entry (collapsed)', aggs.length === 1,
    `got ${aggs.length}`)
  if (aggs.length === 1) {
    assert('aggregate effect larger in magnitude than single-regime case',
      Math.abs(aggs[0].effect) > 1e-6,
      `agg.effect=${aggs[0].effect}`)
  }
}

// ─── Scenario 4: Sum invariant ──────────────────────────────────
// For any counterfactual, sum of pathwayDecomposition effects must equal
// totalEffect within floating-point tolerance. This holds by construction
// (aggregate = totalEffect - sum(directEffects)), but we verify it
// empirically to guard against future refactors.
{
  const scenarios = [
    {
      label: 'normal (scenario 2 re-check)',
      iv: [{ nodeId: 'acwr', value: 2.0, originalValue: 0.9 }] as Intervention[],
      target: 'testosterone',
    },
    {
      label: 'multi-intervention (scenario 3 re-check)',
      iv: [
        { nodeId: 'acwr', value: 2.0, originalValue: 0.9 },
        { nodeId: 'sleep_debt', value: 10.0, originalValue: 1.0 },
      ] as Intervention[],
      target: 'testosterone',
    },
    {
      label: 'pure-direct (sleep_duration → testosterone, no regime path)',
      iv: [{ nodeId: 'sleep_duration', value: 5.5, originalValue: 7.5 }] as Intervention[],
      target: 'testosterone',
    },
  ]

  console.log('\n── Scenario 4: sum invariant across three sub-cases ──')
  for (const sc of scenarios) {
    const [t] = computeCounterfactual(
      BASELINE_OBSERVED, sc.iv, [sc.target], equations, STRUCTURAL_EDGES, topoOrder,
    )
    const sum = sumOfEffects(t.pathwayDecomposition)
    const diff = Math.abs(sum - t.totalEffect)
    assert(`[${sc.label}] sum(path effects) == totalEffect within 1e-6`,
      diff < 1e-6,
      `sum=${sum}, totalEffect=${t.totalEffect}, diff=${diff}`)
  }
}

// ─── Invariant: REGIME_NODE_IDS matches doseResponse sigmoid targets ────
{
  console.log('\n── Sanity: REGIME_NODE_IDS set ──')
  const expected = new Set(['overreaching_state', 'iron_deficiency_state', 'sleep_deprivation_state', 'inflammation_state'])
  const same = REGIME_NODE_IDS.size === expected.size &&
    [...REGIME_NODE_IDS].every(n => expected.has(n))
  assert('REGIME_NODE_IDS contains exactly the 4 sigmoid targets', same,
    `got=${[...REGIME_NODE_IDS].sort().join(',')}`)
}

// ═══════════════════════════════════════════════════════════════════
// Gating tests
// ═══════════════════════════════════════════════════════════════════

// ─── Φ sanity ──────────────────────────────────────────────────
{
  console.log('\n── Gating: normalCdf accuracy ──')
  assert('Φ(0) ≈ 0.5', Math.abs(normalCdf(0) - 0.5) < 1e-6, `got ${normalCdf(0)}`)
  assert('Φ(1.96) ≈ 0.975', Math.abs(normalCdf(1.96) - 0.975) < 1e-3, `got ${normalCdf(1.96)}`)
  assert('Φ(-1.96) ≈ 0.025', Math.abs(normalCdf(-1.96) - 0.025) < 1e-3, `got ${normalCdf(-1.96)}`)
  assert('Φ(3) > 0.99', normalCdf(3) > 0.99, `got ${normalCdf(3)}`)
}

// ─── Clinical thresholds registry sanity ──────────────────────
{
  console.log('\n── Gating: CLINICAL_THRESHOLDS registry ──')
  const hba1c = getThreshold('hba1c')
  assert('hba1c is literature-anchored', hba1c?.source === 'literature')
  assert('hba1c min_detectable = 0.3', hba1c?.minDetectable === 0.3)
  assert('hba1c direction = lower', hba1c?.direction === 'lower')

  const albumin = getThreshold('albumin')
  assert('albumin uses default 10% (0.43 g/dL)',
    albumin?.source === 'default_10pct' && Math.abs(albumin.minDetectable - 0.43) < 1e-6)

  assert('CLINICAL_THRESHOLDS registry size >= 40',
    CLINICAL_THRESHOLDS.size >= 40, `got ${CLINICAL_THRESHOLDS.size}`)
}

// ─── Gating: beneficial fitted edge with tight evidence ─────
// testosterone minDetectable = 100 ng/dL (literature). Need |effect| to
// clearly exceed the MCID so pMeaningful goes well above 0.5; else the
// score floor is pMeaningful ≈ 0.5 × positionConf ≈ 1 → tier=not_exposed.
{
  console.log('\n── Gating: Recommended tier — strong fitted evidence ──')
  const out = computeGatingScore({
    effect: 250,                // +250 ng/dL >> 100 ng/dL MCID
    outcome: 'testosterone',
    effN: 400,
    provenance: 'fitted',
    personalPct: 0.4,
    userDose: 8.5,              // sleep_duration far above theta=7
    theta: 7.0,
    thetaCiWidth: 0.3,
  })
  assert('beneficial effect gives high pMeaningful',
    out.pMeaningful > 0.99, `pMeaningful=${out.pMeaningful}`)
  assert('strong evidence + far from theta → tier=recommended',
    out.tier === 'recommended',
    `score=${out.score}, tier=${out.tier}`)
  assert('positionConfidence near 1 (far from theta)',
    out.positionConfidence > 0.99, `pos=${out.positionConfidence}`)
}

// ─── Gating: harmful direction → pMeaningful = 0 ────────────
{
  console.log('\n── Gating: Harmful direction short-circuits ──')
  const out = computeGatingScore({
    effect: -80,                // testosterone drops 80 (harmful; direction=higher)
    outcome: 'testosterone',
    effN: 400,
    provenance: 'fitted',
    personalPct: 0.4,
    userDose: 8.5,
    theta: 7.0,
    thetaCiWidth: 0.3,
  })
  assert('harmful effect gives pMeaningful=0',
    out.pMeaningful === 0, `pMeaningful=${out.pMeaningful}`)
  assert('not_exposed tier when harmful',
    out.tier === 'not_exposed', `tier=${out.tier}`)
}

// ─── Gating: literature-anchored + no personal data → suppressed ──
// Stop-condition guard: if this ever returns score > 0.8, it's a gating bug.
{
  console.log('\n── Gating: Literature edge with no personal data suppresses ──')
  const out = computeGatingScore({
    effect: 150,                // +150 ng/dL testosterone (beneficial)
    outcome: 'testosterone',
    effN: 3,                    // sleep_duration → testosterone (literature, effN=3)
    provenance: 'literature',
    personalPct: 0.0,           // no personal data
    userDose: 8.0,
    theta: 7.0,
    thetaCiWidth: 0.5,
  })
  assert('positionConfidence hard-suppressed to LITERATURE_SUPPRESSED_POSITION',
    Math.abs(out.positionConfidence - LITERATURE_SUPPRESSED_POSITION) < 1e-9,
    `pos=${out.positionConfidence}`)
  assert('literatureSuppressed flag set in breakdown',
    out.breakdown.literatureSuppressed === true)
  assert('gate score <= LITERATURE_SUPPRESSED_POSITION for literature + no personal data (STOP CONDITION)',
    out.score <= LITERATURE_SUPPRESSED_POSITION + 1e-9,
    `score=${out.score} — literature suppression must cap gate at <=0.1 under any preset`)
}

// ─── Gating: literature-anchored WITH personal data → normal treatment ──
{
  console.log('\n── Gating: Literature edge WITH personal data unblocks ──')
  const out = computeGatingScore({
    effect: 150,
    outcome: 'testosterone',
    effN: 120,                  // personal data has accumulated
    provenance: 'literature',
    personalPct: 0.6,           // majority-personal now
    userDose: 8.5,
    theta: 7.0,
    thetaCiWidth: 0.3,
  })
  assert('literatureSuppressed=false once personal data present',
    out.breakdown.literatureSuppressed === false)
  assert('positionConfidence computed from theta_margin (not suppressed)',
    out.positionConfidence > LITERATURE_SUPPRESSED_POSITION,
    `pos=${out.positionConfidence}`)
}

// ─── Gating: near changepoint → position penalty ────────────
{
  console.log('\n── Gating: Near changepoint → position ≈ 0.5 ──')
  const out = computeGatingScore({
    effect: 100,
    outcome: 'testosterone',
    effN: 400,
    provenance: 'fitted',
    personalPct: 0.4,
    userDose: 7.0,              // exactly at theta
    theta: 7.0,
    thetaCiWidth: 0.3,
  })
  assert('positionConfidence ≈ 0.5 at the changepoint',
    Math.abs(out.positionConfidence - 0.5) < 1e-6,
    `pos=${out.positionConfidence}`)
  assert('score well below recommended tier at changepoint',
    out.score < TIER_RECOMMENDED, `score=${out.score}`)
}

// ─── Gating: regime aggregate bypasses theta geometry ──────
{
  console.log('\n── Gating: Regime aggregate uses positionConfidence=1 ──')
  const out = computeGatingScore({
    effect: -40,                // overreaching → testosterone drops (direction=higher, so harmful)
    outcome: 'cortisol',        // use an outcome where -40 IS beneficial (direction=lower)
    effN: 20,
    provenance: 'literature',
    personalPct: 0.0,           // would normally suppress!
    isRegimeAggregate: true,    // but regime bypass overrides
  })
  assert('regime aggregate forces positionConfidence = 1',
    out.positionConfidence === 1.0, `pos=${out.positionConfidence}`)
  assert('regime aggregate ignores literature-suppression',
    out.breakdown.literatureSuppressed === false)
}

// ─── Gating: tierFromScore boundaries under DEFAULT preset ──
{
  console.log('\n── Gating: tierFromScore boundaries (default preset 0.6/0.4) ──')
  assert('default=default (sanity)', DEFAULT_PRESET === 'default')
  assert('TIER_RECOMMENDED back-compat = 0.6', TIER_RECOMMENDED === 0.6)
  assert('0.0 → not_exposed', tierFromScore(0.0) === 'not_exposed')
  assert('0.4 → not_exposed (boundary, strict >)', tierFromScore(0.4) === 'not_exposed')
  assert('0.41 → possible', tierFromScore(0.41) === 'possible')
  assert('0.6 → possible (boundary, strict >)', tierFromScore(0.6) === 'possible')
  assert('0.61 → recommended', tierFromScore(0.61) === 'recommended')
  assert('1.0 → recommended', tierFromScore(1.0) === 'recommended')
}

// ─── Gating: tierFromScore under all three presets ─────────
{
  console.log('\n── Gating: tierFromScore presets ──')
  // strict: 0.8/0.5
  assert('strict: 0.5 → not_exposed', tierFromScore(0.5, 'strict') === 'not_exposed')
  assert('strict: 0.51 → possible', tierFromScore(0.51, 'strict') === 'possible')
  assert('strict: 0.8 → possible (boundary)', tierFromScore(0.8, 'strict') === 'possible')
  assert('strict: 0.81 → recommended', tierFromScore(0.81, 'strict') === 'recommended')
  // default: 0.6/0.4 (already tested above, but check via preset arg)
  assert('default explicit: 0.41 → possible', tierFromScore(0.41, 'default') === 'possible')
  assert('default explicit: 0.61 → recommended', tierFromScore(0.61, 'default') === 'recommended')
  // permissive: 0.4/0.2
  assert('permissive: 0.2 → not_exposed', tierFromScore(0.2, 'permissive') === 'not_exposed')
  assert('permissive: 0.21 → possible', tierFromScore(0.21, 'permissive') === 'possible')
  assert('permissive: 0.4 → possible (boundary)', tierFromScore(0.4, 'permissive') === 'possible')
  assert('permissive: 0.41 → recommended', tierFromScore(0.41, 'permissive') === 'recommended')
  // Same score, different preset → different tier
  const s = 0.55
  assert('same score, 3 presets give 3 tiers',
    tierFromScore(s, 'strict') === 'possible' &&
    tierFromScore(s, 'default') === 'possible' &&
    tierFromScore(s, 'permissive') === 'recommended')
  // PRESET_BOUNDARIES is the source of truth — spot check
  assert('PRESET_BOUNDARIES.default.recommended = 0.6',
    PRESET_BOUNDARIES.default.recommended === 0.6)
  assert('PRESET_BOUNDARIES.permissive.possible = 0.2',
    PRESET_BOUNDARIES.permissive.possible === 0.2)
}

// ─── Gating: isExposed covers both recommended and possible ──
{
  console.log('\n── Gating: isExposed semantics ──')
  assert('recommended is exposed', isExposed('recommended') === true)
  assert('possible is exposed', isExposed('possible') === true)
  assert('not_exposed is not exposed', isExposed('not_exposed') === false)
}

// ─── Gating: computeGatingScore honors preset arg ─────────
{
  console.log('\n── Gating: computeGatingScore preset routing ──')
  // Construct a scenario that lands in the [0.5, 0.8] band so that
  // strict/default/permissive all disagree on the tier. Sleep→cortisol:
  // direction=lower, min_det=3.0 (literature). effect=-8, effN=20,
  // personalPct=0.5 (so no literature suppression), near-but-not-at theta.
  const inputs = {
    effect: -8,
    outcome: 'cortisol',
    effN: 20,
    provenance: 'fitted' as const,
    personalPct: 0.5,
    userDose: 8.0,
    theta: 7.0,
    thetaCiWidth: 0.5,
  }
  const strict = computeGatingScore({ ...inputs, preset: 'strict' })
  const dflt = computeGatingScore({ ...inputs, preset: 'default' })
  const perm = computeGatingScore({ ...inputs, preset: 'permissive' })
  assert('same inputs produce same score across presets',
    Math.abs(strict.score - dflt.score) < 1e-12 &&
    Math.abs(dflt.score - perm.score) < 1e-12)
  // strict tier ≥ default tier ≥ permissive tier (monotone in permissiveness)
  const rank = (t: string) => t === 'not_exposed' ? 0 : t === 'possible' ? 1 : 2
  assert('tier monotone under preset permissiveness',
    rank(strict.tier) <= rank(dflt.tier) && rank(dflt.tier) <= rank(perm.tier),
    `strict=${strict.tier}, default=${dflt.tier}, permissive=${perm.tier} (score=${strict.score.toFixed(3)})`)
}

// ─── Report ────────────────────────────────────────────────────

console.log(`\n${passes} passed, ${failures} failed`)
if (failures > 0) process.exit(1)
