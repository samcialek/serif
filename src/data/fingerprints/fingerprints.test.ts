/**
 * Smoke tests for the Fingerprint pipeline.
 *
 * Run:  npx tsx --tsconfig ./tsconfig.app.json src/data/fingerprints/fingerprints.test.ts
 *
 * Wired into `npm test`. Exit 0 = pass, non-zero = fail.
 *
 * Covers:
 *   - Each of the five named personas returns its hand-curated bundle
 *     (correct pid, correct mode, ≥3 cards).
 *   - Caspian's bundle has at least one identity_label with `supports`
 *     pointing at real ids in the same bundle.
 *   - The generic detector against a synthetic ParticipantPortal
 *     returns ≥1 fingerprint and the right bundle mode for the count.
 *   - reverseIndex helpers work end-to-end.
 */

import type { ParticipantPortal } from '@/data/portal/types'
import { computeFingerprints } from './computeFingerprints'
import {
  getFingerprintsForOutcome,
  hasFingerprintsForOutcome,
} from './reverseIndex'
import { getIdentityLabel } from './labelDictionary'

let failures = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
    failures += 1
  }
}

// ─── Synthetic ParticipantPortal builder ─────────────────────────

function makeSyntheticParticipant(pid: number): ParticipantPortal {
  // Minimal but realistic shape — enough to exercise outlier + regime
  // + load-variability + load-drift + weather-sensitivity detectors.
  const sleepDebt14 = [
    1.2, 1.4, 1.5, 1.7, 1.9, 2.0, 2.2, 2.5, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8,
  ]
  const acwr14 = [
    0.95, 0.96, 0.94, 0.95, 0.97, 0.96, 0.95, 0.94, 0.96, 0.95, 0.95, 0.96, 0.94, 0.95,
  ]
  const tempC14 = [
    18, 19, 21, 23, 25, 26, 27, 24, 22, 20, 19, 21, 24, 26,
  ]
  return {
    pid,
    cohort: 'cohort_b',
    age: 38,
    is_female: false,
    effects_bayesian: [],
    tier_counts: { recommended: 0, possible: 0, not_exposed: 0 },
    exposed_count: 0,
    protocols: [],
    current_values: {},
    behavioral_sds: {},
    outcome_baselines: {
      // Outlier: HRV at 18 against population baseline 50 → ratio 0.36
      // (well below the 0.65 outlier threshold)
      hrv_daily: 18,
      cortisol: 14,
      hscrp: 1.0,
    },
    regime_activations: {
      sleep_deprivation_state: 0.7, // above 0.5 → sensitivity detector fires
      overreaching_state: 0.1,
      iron_deficiency_state: 0.0,
      inflammation_state: 0.2,
    },
    loads_today: {
      sleep_debt_14d: { value: 3.8, baseline: 2.0, sd: 0.5, z: 3.6, ratio: 1.9 },
      acwr: { value: 0.95, baseline: 1.0, sd: 0.13, z: -0.4, ratio: 0.95 },
    },
    loads_history: {
      sleep_debt_14d: sleepDebt14,
      acwr: acwr14,
    },
    weather_history: {
      temp_c: tempC14,
    },
  } as unknown as ParticipantPortal
}

// ─── Tests ───────────────────────────────────────────────────────

console.log('\n[testNamedPersonasHaveCuratedBundles]')
for (const expected of [
  { pid: 1, name: 'Caspian', minCards: 10, expectedMode: 'rich' as const },
  { pid: 2, name: 'Rajan', minCards: 8, expectedMode: 'rich' as const },
  { pid: 3, name: 'Sarah', minCards: 8, expectedMode: 'rich' as const },
  { pid: 4, name: 'Marcus', minCards: 8, expectedMode: 'rich' as const },
  { pid: 5, name: 'Emma', minCards: 5, expectedMode: 'forming' as const },
]) {
  const stub = makeSyntheticParticipant(expected.pid)
  const bundle = computeFingerprints(stub)
  check(
    `${expected.name} bundle returns curated set (pid ${expected.pid})`,
    bundle.participantPid === expected.pid &&
      bundle.fingerprints.length >= expected.minCards,
    `got ${bundle.fingerprints.length} cards`,
  )
  check(
    `${expected.name} bundle mode = ${expected.expectedMode}`,
    bundle.mode === expected.expectedMode,
    `got "${bundle.mode}"`,
  )
}

console.log('\n[testCaspianIdentityLabelsHaveSupports]')
const caspian = computeFingerprints(makeSyntheticParticipant(1))
const identityLabels = caspian.fingerprints.filter(
  (f) => f.type === 'identity_label',
)
check(
  'Caspian has ≥1 identity_label',
  identityLabels.length >= 1,
  `got ${identityLabels.length}`,
)
const allCardIds = new Set(caspian.fingerprints.map((f) => f.id))
const danglingSupports: string[] = []
for (const label of identityLabels) {
  for (const supportId of label.supports ?? []) {
    if (!allCardIds.has(supportId)) danglingSupports.push(`${label.id}→${supportId}`)
  }
}
check(
  'Caspian identity_label.supports point at real card ids',
  danglingSupports.length === 0,
  danglingSupports.join(', '),
)

console.log('\n[testIdentityLabelsUseDictionary]')
for (const expected of [
  { pid: 1, name: 'Caspian' },
  { pid: 2, name: 'Rajan' },
  { pid: 3, name: 'Sarah' },
  { pid: 4, name: 'Marcus' },
  { pid: 5, name: 'Emma' },
]) {
  const bundle = computeFingerprints(makeSyntheticParticipant(expected.pid))
  const identityLabels = bundle.fingerprints.filter(
    (f) => f.type === 'identity_label',
  )
  check(
    `${expected.name} has >=1 identity_label`,
    identityLabels.length >= 1,
    `got ${identityLabels.length}`,
  )

  const dictionaryMismatches: string[] = []
  for (const label of identityLabels) {
    const spec = getIdentityLabel(label.identity_label_id)
    if (!spec) {
      dictionaryMismatches.push(`${label.id}: missing ${label.identity_label_id}`)
    } else if (spec.label !== label.label) {
      dictionaryMismatches.push(
        `${label.id}: ${label.identity_label_id} renders "${label.label}", expected "${spec.label}"`,
      )
    }
  }
  check(
    `${expected.name} identity labels come from dictionary`,
    dictionaryMismatches.length === 0,
    dictionaryMismatches.join(', '),
  )

  const supportIds = new Set(
    bundle.fingerprints
      .filter((f) => f.type !== 'identity_label')
      .map((f) => f.id),
  )
  const danglingSupportsForBundle: string[] = []
  for (const label of identityLabels) {
    for (const supportId of label.supports) {
      if (!supportIds.has(supportId)) {
        danglingSupportsForBundle.push(`${label.id}->${supportId}`)
      }
    }
  }
  check(
    `${expected.name} identity_label.supports point at real cards`,
    danglingSupportsForBundle.length === 0,
    danglingSupportsForBundle.join(', '),
  )
}

console.log('\n[testGenericDetectorOnPseudonym]')
const pseudonym = makeSyntheticParticipant(42) // not in CURATED_BUNDLES
const generic = computeFingerprints(pseudonym)
check(
  'Pseudonym pid 42 falls through to generic detector',
  generic.participantPid === 42,
)
check(
  'Generic detector emits ≥1 fingerprint on a high-signal synthetic',
  generic.fingerprints.length >= 1,
  `got ${generic.fingerprints.length}`,
)
const outlierFired = generic.fingerprints.some((f) => f.type === 'outlier')
const sensitivityFired = generic.fingerprints.some((f) => f.type === 'sensitivity')
const variabilityFired = generic.fingerprints.some((f) => f.type === 'variability')
const driftFired = generic.fingerprints.some((f) => f.type === 'behavior')
check('Outlier detector fires on out-of-range HRV', outlierFired)
check('Sensitivity detector fires on active sleep regime', sensitivityFired)
check(
  'Variability detector fires on high-CV sleep_debt or low-CV ACWR',
  variabilityFired,
)
check('Drift detector fires on rising sleep debt', driftFired)

console.log('\n[testReverseIndexHelpers]')
// Caspian's bundle has fingerprints with `links.outcomes` — pick a
// known one and assert the helpers find it.
const caspianStub = makeSyntheticParticipant(1)
const found = getFingerprintsForOutcome(caspianStub, 'sleep_efficiency')
check(
  'getFingerprintsForOutcome returns ≥1 card for sleep_efficiency',
  found.length >= 1,
  `got ${found.length}`,
)
check(
  'returned cards do NOT include identity_label entries',
  found.every((f) => f.type !== 'identity_label'),
)
check(
  'hasFingerprintsForOutcome returns true for an outcome with cards',
  hasFingerprintsForOutcome(caspianStub, 'sleep_efficiency'),
)
check(
  'hasFingerprintsForOutcome returns false for an unknown outcome',
  !hasFingerprintsForOutcome(caspianStub, 'this_outcome_does_not_exist'),
)

console.log('\nDone.')
process.exit(failures > 0 ? 1 : 0)
