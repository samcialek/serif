/**
 * React hook that subscribes to the active pid in the portal store and
 * resolves the corresponding ParticipantPortal payload via the loader
 * (with caching). No UI is wired to this yet.
 */

import { useEffect, useRef, useState } from 'react'

import { participantLoader } from '@/data/portal/participantLoader'
import type { ParticipantLoader } from '@/data/portal/participantLoader'
import { usePortalStore } from '@/stores/portalStore'
import type { ParticipantPortal } from '@/data/portal/types'

export interface UseParticipantReturn {
  participant: ParticipantPortal | null
  isLoading: boolean
  error: Error | null
}

function resolveInitial(loader: ParticipantLoader, pid: number | null): ParticipantPortal | null {
  if (pid == null) return null
  return loader.getCached(pid) ?? null
}

export function useParticipant(
  loader: ParticipantLoader = participantLoader,
): UseParticipantReturn {
  const activePid = usePortalStore((state) => state.activePid)

  const [participant, setParticipant] = useState<ParticipantPortal | null>(() =>
    resolveInitial(loader, activePid),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const requestIdRef = useRef(0)

  useEffect(() => {
    if (activePid == null) {
      setParticipant(null)
      setIsLoading(false)
      setError(null)
      return
    }

    const cached = loader.getCached(activePid)
    if (cached) {
      setParticipant(cached)
      setIsLoading(false)
      setError(null)
      return
    }

    const reqId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)

    loader
      .loadParticipant(activePid)
      .then((p) => {
        if (reqId !== requestIdRef.current) return
        setParticipant(p)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (reqId !== requestIdRef.current) return
        setParticipant(null)
        setIsLoading(false)
        setError(err instanceof Error ? err : new Error(String(err)))
      })
  }, [activePid, loader])

  return { participant, isLoading, error }
}

export default useParticipant
