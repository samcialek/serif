/**
 * Unified active-participant hook. Reads `activePid` from the portal store
 * and overlays named-persona metadata for pids 1..5. Display name is
 * derived — pid-based data underneath is not mutated.
 */

import { useCallback, useMemo } from 'react'
import { usePortalStore } from '@/stores/portalStore'
import { usePersonaStore } from '@/stores/personaStore'
import { useParticipant } from './useParticipant'
import { getPersonaById } from '@/data/personas'
import {
  getDisplayName,
  getNamedPersonaId,
  getNamedPid,
} from '@/data/participantRegistry'
import type { Persona } from '@/types'

export type ParticipantKind = 'named' | 'pseudonym'

export interface ActiveParticipant {
  pid: number | null
  displayName: string
  kind: ParticipantKind
  namedPersonaId: string | null
  persona: Persona | null
  cohort: string | null
}

export function useActiveParticipant(): ActiveParticipant {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant } = useParticipant()

  return useMemo(() => {
    if (activePid == null) {
      return {
        pid: null,
        displayName: '—',
        kind: 'named',
        namedPersonaId: null,
        persona: null,
        cohort: null,
      }
    }
    const namedPersonaId = getNamedPersonaId(activePid)
    const persona = namedPersonaId ? getPersonaById(namedPersonaId) ?? null : null
    const cohort = participant?.cohort ?? null
    return {
      pid: activePid,
      displayName: getDisplayName(activePid, {
        personaName: persona?.name,
        cohort,
      }),
      kind: namedPersonaId ? 'named' : 'pseudonym',
      namedPersonaId,
      persona,
      cohort,
    }
  }, [activePid, participant])
}

export function useSetActiveParticipant(): (pid: number) => void {
  const setPid = usePortalStore((s) => s.setActivePid)
  const setPersona = usePersonaStore((s) => s.setActivePersona)
  return useCallback(
    (pid: number) => {
      setPid(pid)
      const personaId = getNamedPersonaId(pid)
      if (personaId) setPersona(personaId)
    },
    [setPid, setPersona],
  )
}

/**
 * Sync-on-mount: when the app boots, seed `activePid` from the legacy persona
 * store (usually `rajan` = pid 2). Call once at app root.
 */
export function useSeedActivePidFromPersona(): void {
  const activePid = usePortalStore((s) => s.activePid)
  const setPid = usePortalStore((s) => s.setActivePid)
  const activePersonaId = usePersonaStore((s) => s.activePersonaId)

  useMemo(() => {
    if (activePid == null && activePersonaId) {
      const pid = getNamedPid(activePersonaId)
      if (pid != null) setPid(pid)
    }
  }, [activePid, activePersonaId, setPid])
}
