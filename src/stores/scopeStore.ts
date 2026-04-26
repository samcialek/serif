/**
 * Scope store — the cross-tab "what am I looking at?" selection.
 *
 * Tabs that show outcomes or interventions (Twin, Insights, Protocols,
 * Data, Baseline, Devices) all share the same two-dimensional scope:
 *
 *   - regime: quotidian = day-scale wearables; longevity = weeks/months
 *             biomarkers. `all` shows everything (default).
 *   - atDays: horizon the twin/insights engines project over. Default
 *             matches the regime (7d for quotidian, 90d for longevity,
 *             30d for "all").
 *
 * Persisted to localStorage so a coach's scope sticks across reloads.
 * Individual tabs can still override if they genuinely don't support a
 * dimension (e.g. labs have no meaningful horizon) — they just ignore
 * the store.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ScopeRegime = 'quotidian' | 'longevity' | 'all'

interface ScopeState {
  regime: ScopeRegime
  atDays: number
  setRegime: (regime: ScopeRegime) => void
  setAtDays: (days: number) => void
  /** Reset atDays to the regime's natural default. Called after regime
   *  changes so the horizon tracks unless explicitly customized. */
  resetHorizon: () => void
}

export function defaultHorizonFor(regime: ScopeRegime): number {
  if (regime === 'quotidian') return 7
  if (regime === 'longevity') return 90
  return 30
}

export const useScopeStore = create<ScopeState>()(
  persist(
    (set, get) => ({
      regime: 'all',
      atDays: 30,
      setRegime: (regime) => {
        // When the user explicitly switches regime, snap the horizon
        // back to the new default so the Twin re-projects sensibly.
        set({ regime, atDays: defaultHorizonFor(regime) })
      },
      setAtDays: (days) => set({ atDays: days }),
      resetHorizon: () => set({ atDays: defaultHorizonFor(get().regime) }),
    }),
    {
      name: 'serif:scope:v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
