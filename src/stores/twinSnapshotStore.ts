/**
 * Twin snapshot store — persisted list of "Save as Protocol" captures
 * from the v2 Twin canvas.
 *
 * Each snapshot is a frozen copy of the twin's lever configuration plus
 * the outcomes it predicted at save time. Used by ProtocolsView to
 * show the user's tuned protocols as cards alongside the canonical
 * algorithmic schedule.
 *
 * Persisted to localStorage keyed by `serif:twin-snapshots:v1` so a
 * page refresh doesn't lose state. The shape is intentionally narrow
 * (no functions, no React refs) so it round-trips cleanly through
 * JSON.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface TwinSnapshotOutcome {
  /** Canonical outcome id (e.g. "hrv_daily"). */
  id: string
  label: string
  unit: string
  /** Display decimals — preserved so re-rendered cards format identically. */
  decimals: number
  /** Pre-intervention factual value (engine-projected at atDays for
   *  longevity, observed for quotidian). */
  baseline: number
  /** Engine-projected delta at atDays under the saved interventions. */
  delta: number
  /** Tone of the delta (benefit / harm / neutral) at save time. */
  tone: 'benefit' | 'harm' | 'neutral'
  /** BART posterior half-spread, when available. */
  bandHalf?: number
}

export interface TwinSnapshotIntervention {
  /** Canonical action id (e.g. "zone2_minutes"). */
  nodeId: string
  /** Pre-intervention baseline. */
  originalValue: number
  /** Counterfactual value. */
  value: number
}

export interface TwinSnapshot {
  /** Stable id — used as React key and for delete. */
  id: string
  /** Human-given label. Defaults to "Tuned protocol — {date}". */
  label: string
  /** Free-form note from the user (currently unused). */
  notes?: string
  /** Participant this snapshot was tuned for. */
  participantPid: number
  participantName?: string
  /** "quotidian" | "longevity" — drives which outcomes the snapshot was scored against. */
  regime: 'quotidian' | 'longevity'
  /** Horizon the deltas were computed at (7 for quotidian, 90 for longevity). */
  atDays: number
  /** Unix ms when saved. */
  createdAt: number
  /** Engine-shape interventions list — the deltas applied to the
   *  participant's baseline that produced this snapshot's outcomes. */
  interventions: TwinSnapshotIntervention[]
  /** Outcomes the canvas was showing at save time. */
  outcomes: TwinSnapshotOutcome[]
  /** Optional opaque blob from the Twin v2 lever state — stored so the
   *  Twin can reload the exact lever positions. JSON-safe. */
  leverState?: Record<string, unknown>
}

interface TwinSnapshotStore {
  snapshots: TwinSnapshot[]
  add(snapshot: TwinSnapshot): void
  remove(id: string): void
  rename(id: string, label: string): void
  clear(): void
  /** Snapshots filtered by participant; sorted newest-first. */
  forParticipant(pid: number): TwinSnapshot[]
}

export const useTwinSnapshotStore = create<TwinSnapshotStore>()(
  persist(
    (set, get) => ({
      snapshots: [],
      add: (snapshot) =>
        set((s) => ({ snapshots: [snapshot, ...s.snapshots] })),
      remove: (id) =>
        set((s) => ({ snapshots: s.snapshots.filter((x) => x.id !== id) })),
      rename: (id, label) =>
        set((s) => ({
          snapshots: s.snapshots.map((x) => (x.id === id ? { ...x, label } : x)),
        })),
      clear: () => set({ snapshots: [] }),
      forParticipant: (pid) =>
        get()
          .snapshots.filter((s) => s.participantPid === pid)
          .sort((a, b) => b.createdAt - a.createdAt),
    }),
    {
      name: 'serif:twin-snapshots:v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)

/** Generate a stable id for a new snapshot. Does not collide across
 *  rapid clicks because Math.random adds entropy. */
export function newSnapshotId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
