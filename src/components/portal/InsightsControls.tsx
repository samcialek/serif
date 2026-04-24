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
import { ArrowUpDown, Clock, Filter, Leaf, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/classNames'

export type InsightSort = 'effect' | 'horizon' | 'alpha'
export type InsightRegime = 'quotidian' | 'longevity' | 'all'

export interface InsightControlsState {
  regime: InsightRegime
  sort: InsightSort
  hideTrivial: boolean
  personalOnly: boolean
  /** When true, outcome cards append a non-actionable "Environmental
   * context" subsection listing the confounders for each outcome (season,
   * is_weekend, heat_index, etc.) with today's values — so the user
   * sees what else is shaping the outcome beyond their own actions. */
  showEnvironmental: boolean
}

const DEFAULT_STATE: InsightControlsState = {
  regime: 'quotidian',
  sort: 'effect',
  hideTrivial: false,
  personalOnly: false,
  showEnvironmental: false,
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
        parsed.regime === 'longevity' || parsed.regime === 'all'
          ? parsed.regime
          : 'quotidian',
      sort:
        parsed.sort === 'horizon' || parsed.sort === 'alpha' ? parsed.sort : 'effect',
      hideTrivial: parsed.hideTrivial === true,
      personalOnly: parsed.personalOnly === true,
      showEnvironmental: parsed.showEnvironmental === true,
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
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Regime — quotidian vs longevity (matches Twin) */}
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-indigo-200 bg-indigo-50/60"
        role="tablist"
        aria-label="Regime"
      >
        {REGIME_OPTIONS.map((opt) => {
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              onClick={() => onChange({ regime: opt.value })}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors',
                state.regime === opt.value
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
              role="tab"
              aria-selected={state.regime === opt.value}
            >
              {Icon && <Icon className="w-3 h-3" aria-hidden />}
              {opt.label}
            </button>
          )
        })}
      </div>

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
          label="environmental"
          title="Show non-actionable environmental/confounder edges beneath each outcome (season, weekend, heat, humidity, travel)"
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
