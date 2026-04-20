import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Star, User, X } from 'lucide-react'
import { cn } from '@/utils/classNames'
import { usePortalStore, type RegimeChip } from '@/stores/portalStore'
import { participantLoader } from '@/data/portal/participantLoader'
import {
  NAMED_PERSONA_PIDS,
  getShortDisplayName,
  isNamedPid,
} from '@/data/participantRegistry'
import { getPersonaById } from '@/data/personas'
import type { ParticipantSummary, RegimeKey } from '@/data/portal/types'

const REGIME_ACTIVE_THRESHOLD = 0.5

function hasActiveRegime(summary: ParticipantSummary, regime: RegimeKey): boolean {
  const v = summary.regime_activations[regime]
  return typeof v === 'number' && v >= REGIME_ACTIVE_THRESHOLD
}

function matchesRegimeChip(
  summary: ParticipantSummary | undefined,
  chip: RegimeChip | null,
): boolean {
  if (chip === null) return true
  if (!summary) return false
  if (chip === 'optimal') return summary.regime_urgency < REGIME_ACTIVE_THRESHOLD
  return hasActiveRegime(summary, chip)
}

interface ParticipantSelectorProps {
  totalParticipants: number
}

export function ParticipantSelector({ totalParticipants }: ParticipantSelectorProps) {
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)
  const cohortFilter = usePortalStore((s) => s.cohortFilter)
  const regimeFilter = usePortalStore((s) => s.regimeFilter)

  const [summaryById, setSummaryById] = useState<Record<number, ParticipantSummary>>({})
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    participantLoader
      .loadSummary()
      .then((file) => {
        if (cancelled) return
        const map: Record<number, ParticipantSummary> = {}
        for (const s of file.participants) map[s.pid] = s
        setSummaryById(map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const filteredPids = useMemo(() => {
    const all: number[] = []
    for (let i = 1; i <= totalParticipants; i++) all.push(i)
    return all.filter((p) => {
      const s = summaryById[p]
      if (cohortFilter !== 'all') {
        if (!s || s.cohort !== cohortFilter) return false
      }
      if (regimeFilter !== null) {
        if (!matchesRegimeChip(s, regimeFilter)) return false
      }
      return true
    })
  }, [totalParticipants, cohortFilter, regimeFilter, summaryById])

  const searchedPids = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return filteredPids
    return filteredPids.filter((pid) => {
      if (String(pid).padStart(4, '0').includes(q)) return true
      if (String(pid) === q) return true
      const cohort = summaryById[pid]?.cohort ?? null
      const shortName = getShortDisplayName(pid, cohort).toLowerCase()
      return shortName.includes(q)
    })
  }, [filteredPids, query, summaryById])

  const currentIndex = activePid != null ? filteredPids.indexOf(activePid) : -1
  const canPrev = currentIndex > 0
  const canNext = currentIndex >= 0 && currentIndex < filteredPids.length - 1

  const goto = (offset: number) => {
    if (currentIndex < 0) {
      if (filteredPids.length > 0) setActivePid(filteredPids[0])
      return
    }
    const next = currentIndex + offset
    if (next < 0 || next >= filteredPids.length) return
    setActivePid(filteredPids[next])
  }

  const activeLabel = (() => {
    if (activePid == null) return 'Select participant'
    if (isNamedPid(activePid)) {
      const persona = getPersonaById(NAMED_PERSONA_PIDS[activePid])
      return persona?.name ?? NAMED_PERSONA_PIDS[activePid]
    }
    return getShortDisplayName(activePid, summaryById[activePid]?.cohort ?? null)
  })()

  const visibleList = searchedPids.slice(0, 80)

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <button
        onClick={() => goto(-1)}
        disabled={!canPrev}
        className={cn(
          'p-1 rounded-md border',
          canPrev
            ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed',
        )}
        title="Previous participant"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 min-w-[180px] justify-between',
          'text-[11px] font-medium rounded-md border transition-colors',
          open
            ? 'bg-primary-50 border-primary-300 text-primary-700'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {activePid != null && isNamedPid(activePid) ? (
            <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />
          ) : (
            <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
          )}
          <span className="truncate">{activeLabel}</span>
        </span>
        <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
          {currentIndex >= 0
            ? `${currentIndex + 1}/${filteredPids.length}`
            : filteredPids.length}
        </span>
      </button>
      <button
        onClick={() => goto(1)}
        disabled={!canNext}
        className={cn(
          'p-1 rounded-md border',
          canNext
            ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed',
        )}
        title="Next participant"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-[360px] bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="relative border-b border-slate-100">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or pid"
              className="w-full pl-8 pr-8 py-2 text-sm focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            )}
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {visibleList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No matches</div>
            ) : (
              <ul className="py-1">
                {visibleList.map((pid) => {
                  const isActive = pid === activePid
                  const isNamed = isNamedPid(pid)
                  const persona = isNamed ? getPersonaById(NAMED_PERSONA_PIDS[pid]) : null
                  const cohort = summaryById[pid]?.cohort ?? null
                  const label = isNamed
                    ? persona?.name ?? NAMED_PERSONA_PIDS[pid]
                    : getShortDisplayName(pid, cohort)
                  return (
                    <li key={pid}>
                      <button
                        onClick={() => {
                          setActivePid(pid)
                          setOpen(false)
                          setQuery('')
                        }}
                        className={cn(
                          'w-full px-3 py-1.5 text-left flex items-center gap-2 text-xs',
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {isNamed ? (
                          <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        ) : (
                          <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        )}
                        <span className="truncate flex-1">{label}</span>
                        {cohort && (
                          <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
                            {cohort.replace('cohort_', '').toUpperCase()}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {searchedPids.length > visibleList.length && (
            <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
              +{searchedPids.length - visibleList.length} more · refine search
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ParticipantSelector
