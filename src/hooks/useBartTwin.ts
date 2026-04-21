/**
 * React hook — lazily load the BART manifest + draws bundle, expose an
 * MC counterfactual runner alongside the synchronous piecewise path.
 *
 * Shape:
 *   const { status, runMC, coverage } = useBartTwin()
 *   // status: 'idle' | 'loading' | 'ready' | 'unavailable'
 *   // runMC(obs, interventions) -> Promise<MCFullCounterfactualState | null>
 *   // coverage: string[]  // list of outcomes with BART fits
 *
 * Graceful degradation: if the manifest 404s (e.g. the backend sweep
 * hasn't been run for this build), status flips to 'unavailable' and
 * runMC resolves to null. Callers keep the point-estimate path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import edgeSummaryRaw from '@/data/dataValue/edgeSummaryRaw.json'
import type { EdgeResult } from '@/data/dataValue/types'
import type { Intervention } from '@/data/scm/types'
import type { MCFullCounterfactualState } from '@/data/scm/bartMonteCarlo'
import { BartTwinProvider } from '@/data/scm/bartTwinProvider'

export type BartStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export function useBartTwin() {
  const edgeResults = edgeSummaryRaw as EdgeResult[]
  const [status, setStatus] = useState<BartStatus>('idle')
  const [coverage, setCoverage] = useState<string[]>([])
  const providerRef = useRef<BartTwinProvider | null>(null)

  // Trigger load once — on mount. BART JSON bundle is ~10 MB gzipped for
  // 17 outcomes, so we fetch upfront for Twin interactions rather than
  // per-query. Each fetch itself is cached by the loader (bartDraws.ts).
  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    BartTwinProvider.create(edgeResults)
      .then((provider) => {
        if (cancelled) return
        providerRef.current = provider
        const cov = provider.bartCoverage
        setCoverage(cov)
        setStatus(cov.length > 0 ? 'ready' : 'unavailable')
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[useBartTwin] load failed:', err)
        setStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [edgeResults])

  const runMC = useCallback(
    async (
      observedValues: Record<string, number>,
      interventions: Intervention[],
    ): Promise<MCFullCounterfactualState | null> => {
      const provider = providerRef.current
      if (!provider) return null
      return provider.computeFullCounterfactualMC(observedValues, interventions)
    },
    [],
  )

  return useMemo(
    () => ({ status, runMC, coverage }),
    [status, runMC, coverage],
  )
}
