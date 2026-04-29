/**
 * Loader for Bayesian portal participant JSONs and the manifest.
 *
 * In production the loader uses `fetch()` against files served from
 * `public/portal_bayesian/`. Tests inject a custom fetcher that reads the
 * real files from disk, which exercises the same validation/cache path.
 */

import {
  EXPECTED_ENGINE_VERSION,
  type ParticipantPortal,
  type ParticipantSummaryFile,
  type PortalManifest,
} from './types'

export class ParticipantNotFoundError extends Error {
  constructor(public pid: number) {
    super(`Participant ${pid} not found in portal export`)
    this.name = 'ParticipantNotFoundError'
  }
}

export class SchemaMismatchError extends Error {
  constructor(public detail: string) {
    super(`Schema mismatch: ${detail}`)
    this.name = 'SchemaMismatchError'
  }
}

export class MalformedJsonError extends Error {
  constructor(public detail: string) {
    super(`Malformed JSON: ${detail}`)
    this.name = 'MalformedJsonError'
  }
}

export interface FetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

export type Fetcher = (url: string) => Promise<FetchResponse>

export interface ParticipantLoaderOptions {
  basePath?: string
  fetcher?: Fetcher
  expectedEngineVersion?: string
}

const REQUIRED_PARTICIPANT_FIELDS = [
  'pid',
  'cohort',
  'effects_bayesian',
  'tier_counts',
  'exposed_count',
  'protocols',
  'current_values',
  'behavioral_sds',
] as const

const REQUIRED_MANIFEST_FIELDS = [
  'engine_version',
  'n_participants',
  'supported_pairs',
  'tier_counts',
  'exposed_total',
  'gate_thresholds',
  'variance_floor_mode',
  'protocol_count_total',
] as const

export function validateParticipant(raw: unknown): ParticipantPortal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SchemaMismatchError('participant payload is not an object')
  }
  const obj = raw as Record<string, unknown>
  for (const f of REQUIRED_PARTICIPANT_FIELDS) {
    if (!(f in obj)) {
      throw new SchemaMismatchError(`participant missing field: ${f}`)
    }
  }
  if (!Array.isArray(obj.effects_bayesian)) {
    throw new SchemaMismatchError('effects_bayesian is not an array')
  }
  if (!Array.isArray(obj.protocols)) {
    throw new SchemaMismatchError('protocols is not an array')
  }
  if (typeof obj.pid !== 'number') {
    throw new SchemaMismatchError('pid is not a number')
  }
  return obj as unknown as ParticipantPortal
}

export function validateManifest(
  raw: unknown,
  expectedEngineVersion: string = EXPECTED_ENGINE_VERSION,
): PortalManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SchemaMismatchError('manifest payload is not an object')
  }
  const obj = raw as Record<string, unknown>
  for (const f of REQUIRED_MANIFEST_FIELDS) {
    if (!(f in obj)) {
      throw new SchemaMismatchError(`manifest missing field: ${f}`)
    }
  }
  if (obj.engine_version !== expectedEngineVersion) {
    throw new SchemaMismatchError(
      `engine_version mismatch: got "${String(obj.engine_version)}" expected "${expectedEngineVersion}"`,
    )
  }
  return obj as unknown as PortalManifest
}

function resolveBasePath(): string {
  // Vite inlines import.meta.env.BASE_URL at build. Under tsx/node it's undefined — callers
  // that need a non-default path should pass `basePath` explicitly.
  const env = (import.meta as { env?: { BASE_URL?: string } }).env
  const base = env?.BASE_URL ?? '/'
  return `${base.replace(/\/+$/, '')}/portal_bayesian`
}

async function defaultFetcher(url: string): Promise<FetchResponse> {
  const res = await fetch(url)
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
  }
}

export interface ParticipantLoader {
  loadManifest(): Promise<PortalManifest>
  loadParticipant(pid: number): Promise<ParticipantPortal>
  loadSummary(): Promise<ParticipantSummaryFile>
  getCached(pid: number): ParticipantPortal | undefined
  clearCache(): void
  cacheSize(): number
}

export function participantFilename(pid: number): string {
  return `participant_${String(pid).padStart(4, '0')}.json`
}

export function createParticipantLoader(
  options: ParticipantLoaderOptions = {},
): ParticipantLoader {
  const basePath = (options.basePath ?? resolveBasePath()).replace(/\/+$/, '')
  const fetcher = options.fetcher ?? defaultFetcher
  const expectedEngineVersion = options.expectedEngineVersion ?? EXPECTED_ENGINE_VERSION

  const cache = new Map<number, ParticipantPortal>()
  let manifestPromise: Promise<PortalManifest> | null = null
  let summaryPromise: Promise<ParticipantSummaryFile> | null = null

  async function parseJson(url: string, res: FetchResponse, label: string): Promise<unknown> {
    const text = await res.text()
    // Python's `json.dump` emits non-standard `NaN` / `Infinity` for
    // missing or unbounded values. Sanitize before JSON.parse rather
    // than re-export every payload through `allow_nan=False`.
    const sanitized = text
      .replace(/:\s*NaN\b/g, ': null')
      .replace(/:\s*-?Infinity\b/g, ': null')
    try {
      return JSON.parse(sanitized)
    } catch (e) {
      throw new MalformedJsonError(`${label} at ${url}: ${(e as Error).message}`)
    }
  }

  async function loadManifest(): Promise<PortalManifest> {
    if (!manifestPromise) {
      const url = `${basePath}/manifest.json`
      manifestPromise = (async () => {
        const res = await fetcher(url)
        if (!res.ok) {
          throw new SchemaMismatchError(`manifest fetch failed: HTTP ${res.status} at ${url}`)
        }
        const raw = await parseJson(url, res, 'manifest')
        return validateManifest(raw, expectedEngineVersion)
      })()
      manifestPromise.catch(() => {
        manifestPromise = null
      })
    }
    return manifestPromise
  }

  async function loadParticipant(pid: number): Promise<ParticipantPortal> {
    const cached = cache.get(pid)
    if (cached) return cached

    const url = `${basePath}/${participantFilename(pid)}`
    const res = await fetcher(url)
    if (res.status === 404) {
      throw new ParticipantNotFoundError(pid)
    }
    if (!res.ok) {
      throw new SchemaMismatchError(
        `participant ${pid} fetch failed: HTTP ${res.status} at ${url}`,
      )
    }
    const raw = await parseJson(url, res, `participant ${pid}`)
    const validated = validateParticipant(raw)
    cache.set(pid, validated)
    return validated
  }

  async function loadSummary(): Promise<ParticipantSummaryFile> {
    if (!summaryPromise) {
      const url = `${basePath}/participant_summary.json`
      summaryPromise = (async () => {
        const res = await fetcher(url)
        if (!res.ok) {
          throw new SchemaMismatchError(`summary fetch failed: HTTP ${res.status} at ${url}`)
        }
        const raw = await parseJson(url, res, 'summary')
        if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { participants?: unknown }).participants)) {
          throw new SchemaMismatchError('summary missing participants array')
        }
        return raw as ParticipantSummaryFile
      })()
      summaryPromise.catch(() => {
        summaryPromise = null
      })
    }
    return summaryPromise
  }

  return {
    loadManifest,
    loadParticipant,
    loadSummary,
    getCached: (pid) => cache.get(pid),
    clearCache: () => {
      cache.clear()
      manifestPromise = null
      summaryPromise = null
    },
    cacheSize: () => cache.size,
  }
}

export const participantLoader: ParticipantLoader = createParticipantLoader()
