/**
 * Exploration store — local-only state for coach-visualized experiments.
 *
 * Phase 4 wires this to the Launch / Cancel buttons so an experiment
 * can move from "suggested" to "running" to "completed" without any
 * backend write. Phase 1 stands the store up with empty initial state
 * so components can wire the selector hooks now.
 *
 * Keyed by `${action}::${outcome}`. `mock_progress_day` is an
 * offset-from-start the UI can advance via dev-only controls for
 * demoing progression without waiting real wall-clock time.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface LaunchedExperiment {
  started_at: number
  duration_days: number
  /** Extra days beyond real-time since start — lets the UI demo
   *  progression. Defaults to 0. */
  mock_progress_day: number
}

interface ExplorationState {
  launched: Record<string, LaunchedExperiment>
  launch: (key: string, durationDays: number) => void
  cancel: (key: string) => void
  advanceMockTime: (key: string, days: number) => void
  advanceMockTimeAll: (days: number) => void
}

export const useExplorationStore = create<ExplorationState>()(
  persist(
    (set, get) => ({
      launched: {},
      launch: (key, durationDays) => {
        set((s) => ({
          launched: {
            ...s.launched,
            [key]: {
              started_at: Date.now(),
              duration_days: durationDays,
              mock_progress_day: 0,
            },
          },
        }))
      },
      cancel: (key) => {
        const next = { ...get().launched }
        delete next[key]
        set({ launched: next })
      },
      advanceMockTime: (key, days) => {
        set((s) => {
          const cur = s.launched[key]
          if (!cur) return s
          return {
            launched: {
              ...s.launched,
              [key]: { ...cur, mock_progress_day: cur.mock_progress_day + days },
            },
          }
        })
      },
      advanceMockTimeAll: (days) => {
        set((s) => {
          const next: Record<string, LaunchedExperiment> = {}
          for (const [k, v] of Object.entries(s.launched)) {
            next[k] = { ...v, mock_progress_day: v.mock_progress_day + days }
          }
          return { launched: next }
        })
      },
    }),
    {
      name: 'serif:explorationV2:launched:v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)

/** Stable key for an (action, outcome) pair. */
export function explorationKey(action: string, outcome: string): string {
  return `${action}::${outcome}`
}

export interface ExperimentProgress {
  daysElapsed: number
  daysTotal: number
  fraction: number
  isRunning: boolean
  isComplete: boolean
}

/** Compute progress from a launched experiment + now. Exported for
 *  use in UI selectors. */
export function progressFor(
  launched: LaunchedExperiment | undefined,
  now: number = Date.now(),
): ExperimentProgress | null {
  if (!launched) return null
  const elapsedMs = now - launched.started_at
  const elapsedRealDays = Math.max(0, elapsedMs / (1000 * 60 * 60 * 24))
  const daysElapsed = Math.min(
    launched.duration_days,
    elapsedRealDays + launched.mock_progress_day,
  )
  const fraction = launched.duration_days > 0 ? daysElapsed / launched.duration_days : 0
  return {
    daysElapsed,
    daysTotal: launched.duration_days,
    fraction: Math.min(1, Math.max(0, fraction)),
    isRunning: fraction < 1,
    isComplete: fraction >= 1,
  }
}
