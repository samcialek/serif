/**
 * useDataMode — global preference for which evidence tier drives the UI.
 *
 *   'personal'  : default Bayesian posterior — use the user's own data
 *                 where we have it, fall back to the cohort prior where
 *                 we don't. This is what every Bayesian edge in the
 *                 export already computes (`posterior.mean`).
 *
 *   'cohort'    : cohort prior only — ignore the user's personal
 *                 observations and show what we'd say if they were a
 *                 fresh member. Engine consumers read
 *                 `posterior.prior_mean` instead of `posterior.mean`
 *                 when this mode is active.
 *
 * Persisted to localStorage so the choice sticks across sessions.
 *
 * Why a dedicated store: portalStore hydrates from URL query params on
 * mount (for deep-linkable participant / tier filters). dataMode is a
 * durable user preference rather than a shareable link state, so it
 * lives in its own store with localStorage persistence.
 */

import { create } from 'zustand'

export type DataMode = 'personal' | 'cohort'

const STORAGE_KEY = 'serif.dataMode.v1'

function readFromStorage(): DataMode {
  if (typeof window === 'undefined') return 'personal'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'cohort') return 'cohort'
  } catch {
    // ignore disabled / quota-exceeded storage
  }
  return 'personal'
}

function writeToStorage(mode: DataMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // ignore
  }
}

interface DataModeState {
  mode: DataMode
  setMode: (m: DataMode) => void
  toggleMode: () => void
}

export const useDataModeStore = create<DataModeState>((set, get) => ({
  mode: readFromStorage(),
  setMode: (m) => {
    writeToStorage(m)
    set({ mode: m })
  },
  toggleMode: () => {
    const next: DataMode = get().mode === 'personal' ? 'cohort' : 'personal'
    writeToStorage(next)
    set({ mode: next })
  },
}))

export const useDataMode = (): DataMode =>
  useDataModeStore((state) => state.mode)

/** True when we should compute using cohort-only (prior-mean) estimates. */
export const isCohortMode = (m: DataMode): boolean => m === 'cohort'
