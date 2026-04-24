/**
 * ExplorationControls — sort + filter controls for Exploration v2.
 *
 * Regime (quotidian / longevity / all) is owned by the cross-tab
 * `useScopeStore` and rendered inside the PainterlyPageHeader's
 * ScopeBar, so this component only owns the exploration-specific
 * knobs: sort key and feasibility/running filters. Persists to
 * localStorage.
 */

import { useEffect, useState } from 'react'
import {
  ArrowUpDown,
  Clock,
  Filter,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ExplorationSort } from '@/utils/exploration'

export interface ExplorationControlsState {
  sort: ExplorationSort
  /** Hide experiments whose feasibility is anything other than 'ready'. */
  hideInfeasible: boolean
  /** Only show experiments the coach has launched. */
  runningOnly: boolean
}

const DEFAULT_STATE: ExplorationControlsState = {
  sort: 'infogain',
  hideInfeasible: false,
  runningOnly: false,
}

const STORAGE_KEY = 'serif.explorationV2.controls.v1'

function readFromStorage(): ExplorationControlsState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<ExplorationControlsState>
    return {
      sort:
        parsed.sort === 'feasibility' || parsed.sort === 'horizon'
          ? parsed.sort
          : 'infogain',
      hideInfeasible: parsed.hideInfeasible === true,
      runningOnly: parsed.runningOnly === true,
    }
  } catch {
    return DEFAULT_STATE
  }
}

function writeToStorage(state: ExplorationControlsState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

export function useExplorationControls(): [
  ExplorationControlsState,
  (next: Partial<ExplorationControlsState>) => void,
] {
  const [state, setState] = useState<ExplorationControlsState>(() =>
    readFromStorage(),
  )
  useEffect(() => {
    writeToStorage(state)
  }, [state])
  const update = (next: Partial<ExplorationControlsState>): void => {
    setState((prev) => ({ ...prev, ...next }))
  }
  return [state, update]
}

interface SegmentDef<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

const SORT_OPTIONS: SegmentDef<ExplorationSort>[] = [
  { value: 'infogain', label: 'Info gain', icon: Sparkles },
  { value: 'feasibility', label: 'Ease', icon: Filter },
  { value: 'horizon', label: 'Horizon', icon: Clock },
]

interface Props {
  state: ExplorationControlsState
  onChange: (next: Partial<ExplorationControlsState>) => void
}

export function ExplorationControls({ state, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Sort */}
      <div
        className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-slate-50"
        role="tablist"
        aria-label="Sort by"
      >
        <span className="flex items-center gap-1 px-1.5 text-[10px] uppercase tracking-wider text-slate-400">
          <ArrowUpDown className="w-3 h-3" aria-hidden />
          Sort
        </span>
        {SORT_OPTIONS.map((seg) => {
          const active = state.sort === seg.value
          const Icon = seg.icon
          return (
            <button
              key={seg.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange({ sort: seg.value })}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors',
                active
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {Icon && <Icon className="w-3 h-3" aria-hidden />}
              {seg.label}
            </button>
          )
        })}
      </div>

      {/* Filter toggles */}
      <button
        type="button"
        onClick={() => onChange({ hideInfeasible: !state.hideInfeasible })}
        aria-pressed={state.hideInfeasible}
        title="Hide experiments that are not currently feasible (seasonal, need baseline, blocked)"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors',
          state.hideInfeasible
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
      >
        Ready only
      </button>
      <button
        type="button"
        onClick={() => onChange({ runningOnly: !state.runningOnly })}
        aria-pressed={state.runningOnly}
        title="Show only experiments you've launched"
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] transition-colors',
          state.runningOnly
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
      >
        Running only
      </button>
    </div>
  )
}

export default ExplorationControls
