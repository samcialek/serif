import { useEffect, useMemo, useState } from 'react'
import { Search, User, ChevronLeft, ChevronRight, Star, ArrowUpDown } from 'lucide-react'
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

interface ParticipantBrowserProps {
  /** Total participants known from manifest — determines pid range 1..total */
  totalParticipants: number
  pageSize?: number
}

type SortKey = 'pid' | 'gate_score_desc' | 'regime_urgency_desc'

const REGIME_ACTIVE_THRESHOLD = 0.5

function hasActiveRegime(summary: ParticipantSummary, regime: RegimeKey): boolean {
  const v = summary.regime_activations[regime]
  return typeof v === 'number' && v >= REGIME_ACTIVE_THRESHOLD
}

function isOptimal(summary: ParticipantSummary): boolean {
  return summary.regime_urgency < REGIME_ACTIVE_THRESHOLD
}

function matchesRegimeChip(
  summary: ParticipantSummary | undefined,
  chip: RegimeChip | null,
): boolean {
  if (chip === null) return true
  if (!summary) return false
  if (chip === 'optimal') return isOptimal(summary)
  return hasActiveRegime(summary, chip)
}

export function ParticipantBrowser({
  totalParticipants,
  pageSize = 60,
}: ParticipantBrowserProps) {
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)
  const cohortFilter = usePortalStore((s) => s.cohortFilter)
  const regimeFilter = usePortalStore((s) => s.regimeFilter)

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('pid')

  const [summaryById, setSummaryById] = useState<Record<number, ParticipantSummary>>({})
  const [summaryLoaded, setSummaryLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    participantLoader
      .loadSummary()
      .then((file) => {
        if (cancelled) return
        const map: Record<number, ParticipantSummary> = {}
        for (const s of file.participants) map[s.pid] = s
        setSummaryById(map)
        setSummaryLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setSummaryLoaded(true) // fail open — browser still usable by pid
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Reset pagination when upstream filters change
  useEffect(() => {
    setPage(0)
  }, [cohortFilter, regimeFilter])

  const matchesQuery = (pid: number): boolean => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    if (String(pid).padStart(4, '0').includes(q)) return true
    if (String(pid) === q) return true
    const cohort = summaryById[pid]?.cohort ?? null
    const shortName = getShortDisplayName(pid, cohort).toLowerCase()
    if (shortName.includes(q)) return true
    return false
  }

  const pids = useMemo(() => {
    const all: number[] = []
    for (let i = 1; i <= totalParticipants; i++) all.push(i)
    const filtered = all.filter((p) => {
      if (!matchesQuery(p)) return false
      const s = summaryById[p]
      if (cohortFilter !== 'all') {
        if (!s || s.cohort !== cohortFilter) return false
      }
      if (regimeFilter !== null) {
        if (!matchesRegimeChip(s, regimeFilter)) return false
      }
      return true
    })
    if (sortKey === 'pid') return filtered
    return filtered.slice().sort((a, b) => {
      const sa = summaryById[a]
      const sb = summaryById[b]
      if (!sa && !sb) return a - b
      if (!sa) return 1
      if (!sb) return -1
      const key = sortKey === 'gate_score_desc' ? 'gate_score_sum' : 'regime_urgency'
      const diff = (sb[key] as number) - (sa[key] as number)
      return diff !== 0 ? diff : a - b
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalParticipants, query, cohortFilter, regimeFilter, sortKey, summaryById])

  const totalPages = Math.max(1, Math.ceil(pids.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const visible = pids.slice(safePage * pageSize, (safePage + 1) * pageSize)

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(0)
          }}
          placeholder="Search by name or pid (e.g. Rajan, 42, A-0123)"
          className={cn(
            'w-full pl-9 pr-3 py-2 text-sm',
            'bg-white border border-slate-200 rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400',
            'placeholder:text-slate-400',
          )}
        />
      </div>

      {/* Sort + count row */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey)
              setPage(0)
            }}
            disabled={!summaryLoaded && sortKey !== 'pid'}
            className={cn(
              'text-[11px] bg-white border border-slate-200 rounded-md px-1.5 py-0.5',
              'focus:outline-none focus:ring-1 focus:ring-primary-300',
            )}
          >
            <option value="pid">Sort: pid ↑</option>
            <option value="gate_score_desc" disabled={!summaryLoaded}>
              Sort: gate score ↓
            </option>
            <option value="regime_urgency_desc" disabled={!summaryLoaded}>
              Sort: regime urgency ↓
            </option>
          </select>
        </div>
        <span className="text-xs text-slate-500">
          <span className="font-semibold text-slate-800">{pids.length}</span>
          {pids.length === totalParticipants ? ' participants' : ` of ${totalParticipants}`}
          {totalPages > 1 && (
            <span className="text-slate-400">
              {' · '}pg {safePage + 1}/{totalPages}
            </span>
          )}
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No matches</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-2">
            {visible.map((pid) => {
              const isActive = pid === activePid
              const isNamed = isNamedPid(pid)
              const persona = isNamed ? getPersonaById(NAMED_PERSONA_PIDS[pid]) : null
              const cohort = summaryById[pid]?.cohort ?? null
              const label = isNamed
                ? persona?.name ?? NAMED_PERSONA_PIDS[pid]
                : getShortDisplayName(pid, cohort)
              return (
                <button
                  key={pid}
                  onClick={() => setActivePid(pid)}
                  title={isNamed ? `${label} (pid ${pid})` : label}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium',
                    'border transition-colors text-left min-w-0',
                    isActive
                      ? 'bg-primary-50 border-primary-300 text-primary-700 ring-1 ring-primary-200'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300',
                  )}
                >
                  {isNamed ? (
                    <Star
                      className={cn(
                        'w-3 h-3 flex-shrink-0',
                        isActive ? 'text-primary-500' : 'text-amber-400',
                      )}
                    />
                  ) : (
                    <User
                      className={cn(
                        'w-3.5 h-3.5 flex-shrink-0',
                        isActive ? 'text-primary-500' : 'text-slate-400',
                      )}
                    />
                  )}
                  <span className="truncate tabular-nums">{label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border',
              safePage === 0
                ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
            )}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border',
              safePage >= totalPages - 1
                ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
            )}
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export default ParticipantBrowser
