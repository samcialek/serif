/**
 * InsightsControls — sort + filter + grouping controls for /insights-v2.
 *
 * Persists to localStorage so the user's preferences stick. Lives in
 * the page-header `actions` slot alongside the DataModeToggle.
 *
 * Sort options:
 *   |effect|     — by absolute Cohen's d (default)
 *   horizon      — quickest-acting first
 *   alphabetical — by action name
 *
 * Filters:
 *   non-trivial  — hide edges with |d| < 0.2 (the "trivial" band)
 *   personal-only — hide cohort_level edges (only show personally
 *                   established or emerging)
 *
 * Grouping:
 *   group        — group outcome cards by quotidian / monthly /
 *                  long-term horizon bands (shared section headers)
 */

import { useEffect, useState } from 'react'
import { ArrowUpDown, Clock, Eye, Filter, Leaf, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/classNames'

export type InsightSort = 'effect' | 'horizon' | 'alpha'
export type InsightRegime = 'quotidian' | 'longevity' | 'all'

export interface InsightControlsState {
  /** Regime now lives in the cross-tab `useScopeStore`. This field is
   *  retained on the controls state for downstream consumers (filtering
   *  helpers) but is no longer rendered as its own toggle in the header
   *  — the unified ScopeBar owns that UI. */
  regime: InsightRegime
  sort: InsightSort
  hideTrivial: boolean
  personalOnly: boolean
  /** When true, outcome cards append a non-actionable "Environmental
   * context" subsection listing the confounders for each outcome (season,
   * is_weekend, heat_index, etc.) with today's values — so the user
   * sees what else is shaping the outcome beyond their own actions. */
  showEnvironmental: boolean
  /** When true, layer-0 weak-default prior edges are included. Off by
   *  default since these are the un-tightened "we'd expect a small
   *  effect" priors that fill the Cartesian grid; turning them on
   *  shows the full causal coverage. Defaults to ON now per the
   *  "show every edge by default" mandate. */
  includeWeakDefault: boolean
  /** When true, edges where the participant has no exposure (the
   *  action node hasn't varied enough to identify the link) are still
   *  shown. They surface as "tested but null" / "no signal yet" rather
   *  than being silently dropped. */
  includeNotExposed: boolean
}

const DEFAULT_STATE: InsightControlsState = {
  regime: 'all',
  sort: 'effect',
  hideTrivial: false,
  personalOnly: false,
  showEnvironmental: false,
  includeWeakDefault: true,
  includeNotExposed: true,
}

const STORAGE_KEY = 'serif.insightsV2.controls.v1'

function readFromStorage(): InsightControlsState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<InsightControlsState>
    return {
      regime:
        parsed.regime === 'longevity' || parsed.regime === 'quotidian'
          ? parsed.regime
          : 'all',
      sort:
        parsed.sort === 'horizon' || parsed.sort === 'alpha' ? parsed.sort : 'effect',
      hideTrivial: parsed.hideTrivial === true,
      personalOnly: parsed.personalOnly === true,
      showEnvironmental: parsed.showEnvironmental === true,
      // Default to true — the user explicitly wants the full set visible
      // unless they opt out.
      includeWeakDefault: parsed.includeWeakDefault !== false,
      includeNotExposed: parsed.includeNotExposed !== false,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function writeToStorage(state: InsightControlsState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

/** Hook backing the controls — pair with `<InsightsControls />`. */
export function useInsightsControls(): [
  InsightControlsState,
  (next: Partial<InsightControlsState>) => void,
] {
  const [state, setState] = useState<InsightControlsState>(() => readFromStorage())
  useEffect(() => {
    writeToStorage(state)
  }, [state])
  const update = (next: Partial<InsightControlsState>): void => {
    setState((prev) => ({ ...prev, ...next }))
  }
  return [state, update]
}

interface SegmentDef<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

const SORT_OPTIONS: SegmentDef<InsightSort>[] = [
  { value: 'effect', label: '|effect|' },
  { value: 'horizon', label: 'horizon' },
  { value: 'alpha', label: 'A–Z' },
]

const REGIME_OPTIONS: SegmentDef<InsightRegime>[] = [
  { value: 'quotidian', label: 'Quotidian', icon: Clock },
  { value: 'longevity', label: 'Longevity', icon: Leaf },
  { value: 'all', label: 'All' },
]

interface Props {
  state: InsightControlsState
  onChange: (next: Partial<InsightControlsState>) => void
}

export function InsightsControls({ state, onChange }: Props) {
  // "Show all" computes the maximally-inclusive state: regime=all, every
  // hide-filter off, every include-toggle on. Lets the user wipe whatever
  // narrow scope they accidentally landed in with one click.
  const isShowingAll =
    state.regime === 'all' &&
    !state.hideTrivial &&
    !state.personalOnly &&
    state.includeWeakDefault &&
    state.includeNotExposed
  const onShowAll = () => {
    onChange({
      regime: 'all',
      hideTrivial: false,
      personalOnly: false,
      includeWeakDefault: true,
      includeNotExposed: true,
    })
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Show all — one-click reset to the maximally-inclusive view.
          Highlighted when already in that state so the user can see
          they're already looking at everything. */}
      <button
        type="button"
        onClick={onShowAll}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-colors',
          isShowingAll
            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
            : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50',
        )}
        title="Reset to the full view: every regime, every prior, every edge"
      >
        <Eye className="w-3 h-3" aria-hidden />
        {isShowingAll ? 'Showing all' : 'Show all'}
      </button>

      {/* Regime is now owned by the unified ScopeBar in the page header.
           The controls strip starts with sort + filters. */}

      {/* Sort */}
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-slate-50"
        role="tablist"
        aria-label="Sort actions"
      >
        <span className="px-1.5 text-slate-500" aria-hidden>
          <ArrowUpDown className="w-3 h-3" />
        </span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange({ sort: opt.value })}
            className={cn(
              'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
              state.sort === opt.value
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
            role="tab"
            aria-selected={state.sort === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-slate-50"
        aria-label="Filters"
      >
        <span className="px-1.5 text-slate-500" aria-hidden>
          <Filter className="w-3 h-3" />
        </span>
        <ToggleChip
          on={state.hideTrivial}
          onClick={() => onChange({ hideTrivial: !state.hideTrivial })}
          label="non-trivial"
          title="Hide edges with |Cohen's d| < 0.2"
        />
        <ToggleChip
          on={state.personalOnly}
          onClick={() => onChange({ personalOnly: !state.personalOnly })}
          label="personal"
          title="Hide cohort-level edges; show only personally-tightened"
        />
        <ToggleChip
          on={state.showEnvironmental}
          onClick={() => onChange({ showEnvironmental: !state.showEnvironmental })}
          label="context chips"
          title="Show today's observed confounder chips beneath each outcome (season, weekend, heat, humidity, travel)"
        />
        <ToggleChip
          on={state.includeWeakDefault}
          onClick={() =>
            onChange({ includeWeakDefault: !state.includeWeakDefault })
          }
          label="weak priors"
          title="Include layer-0 weak-default priors (the un-tightened Cartesian-grid priors covering action × outcome pairs with no fitted edge yet)"
        />
        <ToggleChip
          on={state.includeNotExposed}
          onClick={() =>
            onChange({ includeNotExposed: !state.includeNotExposed })
          }
          label="not exposed"
          title="Include edges where this member has no exposure variation yet (tested but null in their personal data)"
        />
      </div>
    </div>
  )
}

function ToggleChip({
  on,
  onClick,
  label,
  title,
}: {
  on: boolean
  onClick: () => void
  label: string
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
        on
          ? 'bg-white text-slate-800 shadow-sm'
          : 'text-slate-500 hover:text-slate-700',
      )}
      aria-pressed={on}
    >
      {label}
    </button>
  )
}

export default InsightsControls
