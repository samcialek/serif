/**
 * Portal store — active participant + filter state for the Bayesian portal.
 *
 * Initial state is hydrated from URL query params
 * (?pid=42&regime=sleep_deprivation_state&cohort=cohort_a&tier=recommended,possible)
 * to support deep-linking.
 */

import { create } from 'zustand'
import type { GateTier, RegimeKey } from '@/data/portal/types'

export type RegimeChip = RegimeKey | 'optimal'

export type CohortFilter = 'all' | 'cohort_a' | 'cohort_b' | 'cohort_c'

const REGIME_CHIP_VALUES: ReadonlySet<RegimeChip> = new Set<RegimeChip>([
  'overreaching_state',
  'sleep_deprivation_state',
  'iron_deficiency_state',
  'inflammation_state',
  'optimal',
])

const COHORT_VALUES: ReadonlySet<CohortFilter> = new Set<CohortFilter>([
  'all',
  'cohort_a',
  'cohort_b',
  'cohort_c',
])

const TIER_VALUES: ReadonlySet<GateTier> = new Set<GateTier>([
  'recommended',
  'possible',
  'not_exposed',
])

// Default view shows all real causal edges across all three tiers.
// "Exploratory" edges are real cohort-level causal links where the user
// either has insufficient action variation for personal identification or
// the posterior hasn't tightened enough to gate action — they still carry
// a meaningful feasible-shift signal and belong in the default view.
const DEFAULT_TIER_FILTER: ReadonlySet<GateTier> = new Set<GateTier>([
  'recommended',
  'possible',
  'not_exposed',
])

function defaultTierFilter(): Set<GateTier> {
  return new Set(DEFAULT_TIER_FILTER)
}

interface PortalState {
  activePid: number | null
  cohortFilter: CohortFilter
  regimeFilter: RegimeChip | null
  tierFilter: Set<GateTier>

  setActivePid: (pid: number | null) => void
  setCohortFilter: (filter: CohortFilter) => void
  setRegimeFilter: (filter: RegimeChip | null) => void
  setTierFilter: (filter: Iterable<GateTier>) => void
  toggleTierFilter: (tier: GateTier) => void
  reset: () => void
}

export interface InitialPortalState {
  activePid: number | null
  cohortFilter: CohortFilter
  regimeFilter: RegimeChip | null
  tierFilter: Set<GateTier>
}

export function parsePortalStateFromQuery(search: string): InitialPortalState {
  const params = new URLSearchParams(search)

  let activePid: number | null = null
  const pidRaw = params.get('pid')
  if (pidRaw) {
    const n = Number.parseInt(pidRaw, 10)
    if (Number.isInteger(n) && n > 0) activePid = n
  }

  let cohortFilter: CohortFilter = 'all'
  const cohortRaw = params.get('cohort')
  if (cohortRaw) {
    const c = cohortRaw.trim() as CohortFilter
    if (COHORT_VALUES.has(c)) cohortFilter = c
  }

  let regimeFilter: RegimeChip | null = null
  const regimeRaw = params.get('regime')
  if (regimeRaw) {
    const r = regimeRaw.trim() as RegimeChip
    if (REGIME_CHIP_VALUES.has(r)) regimeFilter = r
  }

  const tierRaw = params.get('tier')
  let tierFilter: Set<GateTier>
  if (tierRaw === null) {
    tierFilter = defaultTierFilter()
  } else {
    tierFilter = new Set()
    for (const v of tierRaw.split(',')) {
      const t = v.trim() as GateTier
      if (TIER_VALUES.has(t)) tierFilter.add(t)
    }
  }

  return { activePid, cohortFilter, regimeFilter, tierFilter }
}

function readInitialState(): InitialPortalState {
  if (typeof window === 'undefined') {
    return {
      activePid: null,
      cohortFilter: 'all',
      regimeFilter: null,
      tierFilter: defaultTierFilter(),
    }
  }
  return parsePortalStateFromQuery(window.location.search)
}

const initial = readInitialState()

export const usePortalStore = create<PortalState>((set, get) => ({
  activePid: initial.activePid,
  cohortFilter: initial.cohortFilter,
  regimeFilter: initial.regimeFilter,
  tierFilter: initial.tierFilter,

  setActivePid: (pid) => set({ activePid: pid }),

  setCohortFilter: (filter) => set({ cohortFilter: filter }),

  setRegimeFilter: (filter) => set({ regimeFilter: filter }),

  setTierFilter: (filter) => set({ tierFilter: new Set(filter) }),

  toggleTierFilter: (tier) => {
    const next = new Set(get().tierFilter)
    if (next.has(tier)) next.delete(tier)
    else next.add(tier)
    set({ tierFilter: next })
  },

  reset: () =>
    set({
      activePid: null,
      cohortFilter: 'all',
      regimeFilter: null,
      tierFilter: defaultTierFilter(),
    }),
}))

export const useActivePid = () => usePortalStore((state) => state.activePid)
export const useCohortFilter = () => usePortalStore((state) => state.cohortFilter)
export const useRegimeFilter = () => usePortalStore((state) => state.regimeFilter)
export const useTierFilter = () => usePortalStore((state) => state.tierFilter)
