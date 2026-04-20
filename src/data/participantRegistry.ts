/**
 * Participant registry — bridges the legacy named-persona system (5 IDs)
 * with the Bayesian portal pid-based system (1..1188).
 *
 * Named personas occupy pids 1..5. Pseudonyms for pids 6..N are derived
 * at display time from cohort + pid; underlying pid-based data is not
 * modified.
 */

import { getPersonaById } from '@/data/personas'

export const NAMED_PERSONA_PIDS: Record<number, string> = {
  1: 'oron',
  2: 'rajan',
  3: 'sarah',
  4: 'marcus',
  5: 'emma',
}

export const PERSONA_ID_TO_PID: Record<string, number> = {
  oron: 1,
  rajan: 2,
  sarah: 3,
  marcus: 4,
  emma: 5,
}

export const NAMED_PIDS: ReadonlySet<number> = new Set(
  Object.keys(NAMED_PERSONA_PIDS).map((k) => Number(k)),
)

export function getNamedPersonaId(pid: number): string | null {
  return NAMED_PERSONA_PIDS[pid] ?? null
}

export function getNamedPid(personaId: string): number | null {
  return PERSONA_ID_TO_PID[personaId] ?? null
}

export function isNamedPid(pid: number): boolean {
  return NAMED_PIDS.has(pid)
}

const COHORT_PREFIX: Record<string, string> = {
  cohort_a: 'A',
  cohort_b: 'B',
  cohort_c: 'C',
}

export interface DisplayNameOpts {
  personaName?: string
  cohort?: string | null
}

export function getDisplayName(pid: number, opts: DisplayNameOpts = {}): string {
  const namedId = getNamedPersonaId(pid)
  if (namedId) {
    if (opts.personaName) return opts.personaName
    const persona = getPersonaById(namedId)
    if (persona?.name) return persona.name
    return namedId.charAt(0).toUpperCase() + namedId.slice(1)
  }
  const prefix = opts.cohort ? COHORT_PREFIX[opts.cohort] : undefined
  const padded = String(pid).padStart(4, '0')
  return prefix ? `${prefix}-${padded}` : `P-${padded}`
}

export function getShortDisplayName(pid: number, cohort?: string | null): string {
  const namedId = getNamedPersonaId(pid)
  if (namedId) {
    const persona = getPersonaById(namedId)
    return persona?.name ?? namedId
  }
  const prefix = cohort ? COHORT_PREFIX[cohort] : undefined
  const padded = String(pid).padStart(4, '0')
  return prefix ? `${prefix}-${padded}` : `P-${padded}`
}
