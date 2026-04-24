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
import { ArrowUpDown, Filter, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/classNames'

export type InsightSort = 'effect' | 'horizon' | 'alpha'

export interface InsightControlsState {
  sort: InsightSort
  hideTrivial: boolean
  personalOnly: boolean
  groupByHorizon: boolean
}

const DEFAULT_STATE: InsightControlsState = {
  sort: 'effect',
  hideTrivial: false,
  personalOnly: false,
  groupByHorizon: true,
}

const STORAGE_KEY = 'serif.insightsV2.controls.v1'

function readFromStorage(): InsightControlsState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<InsightControlsState>
    return {
      sort:
        parsed.sort === 'horizon' || parsed.sort === 'alpha' ? parsed.sort : 'effect',
      hideTrivial: parsed.hideTrivial === true,
      personalOnly: parsed.personalOnly === true,
      groupByHorizon: parsed.groupByHorizon !== false,
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

interface Props {
  state: InsightControlsState
  onChange: (next: Partial<InsightControlsState>) => void
}

export function InsightsControls({ state, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {/* Grouping */}
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-slate-50"
        aria-label="Grouping"
      >
        <ToggleChip
          on={state.groupByHorizon}
          onClick={() => onChange({ groupByHorizon: !state.groupByHorizon })}
          label="group by horizon"
          title="Group outcome cards into quotidian / monthly / long-term sections"
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
