/**
 * Portal loader verification script.
 *
 * Run: npx tsx scripts/verify-portal-loader.ts
 *
 * Exercises:
 *   1. Manifest validation (happy path + required-field + engine_version mismatch)
 *   2. Participant validation (happy path + rejection cases)
 *   3. Loader cache behavior (fetch count stays at 1 after hit)
 *   4. 404 → ParticipantNotFoundError
 *   5. Malformed JSON → MalformedJsonError
 *   6. parsePortalStateFromQuery for deep-linking
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  createParticipantLoader,
  MalformedJsonError,
  ParticipantNotFoundError,
  SchemaMismatchError,
  participantFilename,
  validateManifest,
  validateParticipant,
  type Fetcher,
  type FetchResponse,
} from '../src/data/portal/participantLoader.ts'
import { EXPECTED_ENGINE_VERSION } from '../src/data/portal/types.ts'
import { parsePortalStateFromQuery } from '../src/stores/portalStore.ts'

const REPO_ROOT = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const PORTAL_DIR = path.join(REPO_ROOT, 'public', 'portal_bayesian')

let passed = 0
let failed = 0

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failed++
  }
}

async function expectThrows<T>(
  fn: () => Promise<T> | T,
  errorCtor: new (...args: never[]) => Error,
  label: string,
) {
  try {
    await fn()
    assert(false, label, 'did not throw')
  } catch (e) {
    assert(e instanceof errorCtor, label, `threw ${(e as Error)?.name ?? typeof e}`)
  }
}

function makeFsFetcher(): { fetcher: Fetcher; callCount: () => number; reset: () => void } {
  let calls = 0
  const fetcher: Fetcher = async (url: string): Promise<FetchResponse> => {
    calls++
    const rel = url.replace(/^.*?\/portal_bayesian\//, '')
    const filePath = path.join(PORTAL_DIR, rel)
    try {
      const text = await readFile(filePath, 'utf-8')
      return { ok: true, status: 200, text: async () => text }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, status: 404, text: async () => '' }
      }
      throw e
    }
  }
  return { fetcher, callCount: () => calls, reset: () => (calls = 0) }
}

function makeTextFetcher(body: string, status = 200): Fetcher {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  })
}

async function main() {
  console.log('\n═══ Portal Loader Verification ═══\n')

  // ─── 1. Manifest validation ─────────────────────────────────────────
  console.log('1. Manifest validation')

  const manifestText = await readFile(path.join(PORTAL_DIR, 'manifest.json'), 'utf-8')
  const manifestRaw = JSON.parse(manifestText)

  const manifest = validateManifest(manifestRaw)
  assert(manifest.engine_version === EXPECTED_ENGINE_VERSION, 'manifest engine_version matches')
  assert(manifest.n_participants === 1188, `manifest n_participants=1188 (got ${manifest.n_participants})`)
  assert(manifest.exposed_total === 4555, `manifest exposed_total=4555 (got ${manifest.exposed_total})`)
  assert(manifest.variance_floor_mode === 'mean_scaled', 'manifest variance_floor_mode=mean_scaled')
  assert(manifest.protocol_count_total === 4330, `manifest protocol_count_total=4330 (got ${manifest.protocol_count_total})`)
  assert(manifest.warnings.length >= 1 && manifest.warnings[0].includes('exposed_total'), 'manifest carries exposed_total warning')

  try {
    validateManifest({ ...manifestRaw, engine_version: 'nope' })
    assert(false, 'manifest with wrong engine_version rejected')
  } catch (e) {
    assert(e instanceof SchemaMismatchError, 'manifest with wrong engine_version rejected',
      `got ${(e as Error)?.name ?? typeof e}`)
  }

  for (const drop of ['engine_version', 'gate_thresholds', 'variance_floor_mode', 'protocol_count_total']) {
    const broken = { ...manifestRaw }
    delete (broken as Record<string, unknown>)[drop]
    try {
      validateManifest(broken)
      assert(false, `manifest missing ${drop} rejected`)
    } catch (e) {
      assert(
        e instanceof SchemaMismatchError && (e as SchemaMismatchError).detail.includes(drop),
        `manifest missing ${drop} rejected`,
      )
    }
  }

  try {
    validateManifest(null)
    assert(false, 'manifest null rejected')
  } catch (e) {
    assert(e instanceof SchemaMismatchError, 'manifest null rejected')
  }

  try {
    validateManifest([1, 2, 3])
    assert(false, 'manifest array rejected')
  } catch (e) {
    assert(e instanceof SchemaMismatchError, 'manifest array rejected')
  }

  // ─── 2. Participant validation ──────────────────────────────────────
  console.log('\n2. Participant validation')

  const pidText = await readFile(path.join(PORTAL_DIR, 'participant_0001.json'), 'utf-8')
  const pidRaw = JSON.parse(pidText)
  const pid = validateParticipant(pidRaw)
  assert(pid.pid === 1, 'participant 0001 pid=1')
  assert(pid.effects_bayesian.length >= 1, 'participant has effects_bayesian entries')
  assert(Array.isArray(pid.protocols) && pid.protocols.length >= 1, 'participant has protocols array')
  assert(
    typeof pid.current_values?.bedtime === 'number',
    'participant has current_values.bedtime numeric',
  )
  assert(
    typeof pid.behavioral_sds?.training_load === 'number',
    'participant has behavioral_sds.training_load numeric',
  )
  assert(['recommended', 'possible', 'not_exposed'].includes(pid.effects_bayesian[0].gate.tier),
    'first insight tier is a valid GateTier')
  if (pid.protocols.length >= 1) {
    const p = pid.protocols[0]
    assert(typeof p.protocol_id === 'string' && p.protocol_id.length > 0, 'protocol has protocol_id')
    assert(
      ['single', 'collapsed', 'conservative', 'aggressive', 'up', 'down'].includes(p.option_label),
      'protocol option_label is valid',
    )
  }

  for (const drop of ['pid', 'effects_bayesian', 'protocols', 'current_values', 'behavioral_sds']) {
    const broken = { ...pidRaw }
    delete (broken as Record<string, unknown>)[drop]
    try {
      validateParticipant(broken)
      assert(false, `participant missing ${drop} rejected`)
    } catch (e) {
      assert(
        e instanceof SchemaMismatchError && (e as SchemaMismatchError).detail.includes(drop),
        `participant missing ${drop} rejected`,
      )
    }
  }

  try {
    validateParticipant({ ...pidRaw, effects_bayesian: 'oops' })
    assert(false, 'participant with non-array effects_bayesian rejected')
  } catch (e) {
    assert(e instanceof SchemaMismatchError, 'participant with non-array effects_bayesian rejected')
  }

  try {
    validateParticipant({ ...pidRaw, pid: 'abc' })
    assert(false, 'participant with non-numeric pid rejected')
  } catch (e) {
    assert(e instanceof SchemaMismatchError, 'participant with non-numeric pid rejected')
  }

  // ─── 3. Loader end-to-end + cache ───────────────────────────────────
  console.log('\n3. Loader end-to-end + cache')

  const { fetcher, callCount, reset } = makeFsFetcher()
  const loader = createParticipantLoader({
    basePath: '/portal_bayesian',
    fetcher,
  })

  const m = await loader.loadManifest()
  assert(m.engine_version === EXPECTED_ENGINE_VERSION, 'loader.loadManifest resolves')
  const m2 = await loader.loadManifest()
  assert(m === m2, 'loader.loadManifest returns same reference on second call (cached promise)')
  assert(callCount() === 1, `loadManifest called fetcher once (got ${callCount()})`)

  reset()
  const p1 = await loader.loadParticipant(1)
  assert(p1.pid === 1, 'loader.loadParticipant(1) resolves')
  assert(callCount() === 1, `first participant fetch called fetcher once (got ${callCount()})`)

  const p1b = await loader.loadParticipant(1)
  assert(p1b === p1, 'cached participant returns same object reference')
  assert(callCount() === 1, `cached fetch did not re-call fetcher (got ${callCount()})`)

  const p2 = await loader.loadParticipant(2)
  assert(p2.pid === 2, 'loader.loadParticipant(2) resolves')
  assert(callCount() === 2, `new pid triggered a second fetch (got ${callCount()})`)
  assert(loader.cacheSize() === 2, `cacheSize=2 (got ${loader.cacheSize()})`)

  loader.clearCache()
  assert(loader.cacheSize() === 0, 'clearCache resets cacheSize to 0')

  // ─── 4. 404 and malformed JSON ──────────────────────────────────────
  console.log('\n4. Error paths')

  await expectThrows(
    () => loader.loadParticipant(99999),
    ParticipantNotFoundError,
    'missing pid throws ParticipantNotFoundError',
  )

  const loaderBadJson = createParticipantLoader({
    basePath: '/portal_bayesian',
    fetcher: makeTextFetcher('{ this is not json'),
  })
  await expectThrows(
    () => loaderBadJson.loadManifest(),
    MalformedJsonError,
    'malformed manifest JSON throws MalformedJsonError',
  )
  await expectThrows(
    () => loaderBadJson.loadParticipant(1),
    MalformedJsonError,
    'malformed participant JSON throws MalformedJsonError',
  )

  const loaderBadSchema = createParticipantLoader({
    basePath: '/portal_bayesian',
    fetcher: makeTextFetcher('{"engine_version": "v0-wrong"}'),
  })
  await expectThrows(
    () => loaderBadSchema.loadManifest(),
    SchemaMismatchError,
    'manifest fetch with wrong engine_version throws SchemaMismatchError',
  )

  // Manifest failure allows a retry (manifestPromise is cleared on error)
  const flakyCount = { n: 0 }
  const flakyLoader = createParticipantLoader({
    basePath: '/portal_bayesian',
    fetcher: async () => {
      flakyCount.n++
      if (flakyCount.n === 1) return { ok: true, status: 200, text: async () => 'garbage' }
      return { ok: true, status: 200, text: async () => manifestText }
    },
  })
  await expectThrows(
    () => flakyLoader.loadManifest(),
    MalformedJsonError,
    'first flaky manifest call throws',
  )
  const flakyManifest = await flakyLoader.loadManifest()
  assert(flakyManifest.engine_version === EXPECTED_ENGINE_VERSION,
    'loader retries manifest load after failure')

  // ─── 5. URL deep-linking parse ──────────────────────────────────────
  console.log('\n5. Deep-link URL parsing')

  const s1 = parsePortalStateFromQuery('?pid=42')
  assert(s1.activePid === 42, 'pid=42 parsed to 42')
  assert(s1.regimeFilter.size === 0, 'regimeFilter empty when absent')
  assert(s1.tierFilter.size === 0, 'tierFilter empty when absent')

  const s2 = parsePortalStateFromQuery(
    '?pid=7&regime=sleep_deprivation,overreaching&tier=recommended,possible',
  )
  assert(s2.activePid === 7, 'pid=7 parsed')
  assert(s2.regimeFilter.has('sleep_deprivation'), 'regime sleep_deprivation present')
  assert(s2.regimeFilter.has('overreaching'), 'regime overreaching present')
  assert(s2.regimeFilter.size === 2, `regimeFilter size=2 (got ${s2.regimeFilter.size})`)
  assert(s2.tierFilter.has('recommended'), 'tier recommended present')
  assert(s2.tierFilter.has('possible'), 'tier possible present')

  const s3 = parsePortalStateFromQuery('?pid=abc&regime=bogus_regime&tier=not_a_tier')
  assert(s3.activePid === null, 'bad pid treated as null')
  assert(s3.regimeFilter.size === 0, 'unknown regimes dropped')
  assert(s3.tierFilter.size === 0, 'unknown tiers dropped')

  const s4 = parsePortalStateFromQuery('?pid=-5')
  assert(s4.activePid === null, 'negative pid treated as null')

  const s5 = parsePortalStateFromQuery('?regime=sleep_deprivation,not_a_tier,optimal')
  assert(s5.regimeFilter.size === 2, 'mixed regime list keeps valid entries only')

  // ─── 6. Filename helper ─────────────────────────────────────────────
  console.log('\n6. Filename helper')
  assert(participantFilename(1) === 'participant_0001.json', 'pid 1 → participant_0001.json')
  assert(participantFilename(42) === 'participant_0042.json', 'pid 42 → participant_0042.json')
  assert(participantFilename(1188) === 'participant_1188.json', 'pid 1188 → participant_1188.json')

  // ─── Summary ────────────────────────────────────────────────────────
  console.log(`\n═══ ${passed} passed, ${failed} failed ═══\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Unhandled error:', e)
  process.exit(2)
})
