import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, RefreshCw, Eye, ArrowUpDown } from 'lucide-react'
import { cn } from '@/utils/classNames'
import { usePortalStore } from '@/stores/portalStore'
import { participantLoader } from '@/data/portal/participantLoader'
import { getShortDisplayName, isNamedPid } from '@/data/participantRegistry'
import {
  computeMemberStats,
  formatTimeAgo,
  STATUS_LABELS,
  STATUS_COLOR,
  type MemberStatus,
  type MemberDisplayStats,
} from '@/utils/memberDisplayStats'
import type { ParticipantSummary } from '@/data/portal/types'

type SortKey = 'pid' | 'last_sync' | 'last_open' | 'insights' | 'urgency'

const STATUS_FILTERS: ReadonlyArray<[MemberStatus | 'all', string]> = [
  ['all', 'All'],
  ['at_risk', 'At risk'],
  ['needs_attention', 'Needs attention'],
  ['on_track', 'On track'],
  ['building_baseline', 'Building baseline'],
]

const COHORT_FILTERS: ReadonlyArray<[string, string]> = [
  ['all', 'All cohorts'],
  ['cohort_a', 'Cohort A'],
  ['cohort_b', 'Cohort B'],
  ['cohort_c', 'Cohort C'],
]

const PAGE_SIZE = 40

interface Row {
  summary: ParticipantSummary
  stats: MemberDisplayStats
  displayName: string
  isNamed: boolean
}

export function MemberRoster() {
  const navigate = useNavigate()
  const setActivePid = usePortalStore((s) => s.setActivePid)

  const [summaries, setSummaries] = useState<ParticipantSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [cohort, setCohort] = useState<string>('all')
  const [status, setStatus] = useState<MemberStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('urgency')
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    participantLoader
      .loadSummary()
      .then((file) => {
        if (cancelled) return
        setSummaries(file.participants)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rows: Row[] = useMemo(() => {
    return summaries.map((s) => ({
      summary: s,
      stats: computeMemberStats(s),
      displayName: getShortDisplayName(s.pid, s.cohort),
      isNamed: isNamedPid(s.pid),
    }))
  }, [summaries])

  const filtered: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (cohort !== 'all' && r.summary.cohort !== cohort) return false
      if (status !== 'all' && r.stats.status !== status) return false
      if (q) {
        if (r.displayName.toLowerCase().includes(q)) return true
        if (String(r.summary.pid).padStart(4, '0').includes(q)) return true
        return false
      }
      return true
    })
    const sorted = out.slice()
    switch (sortKey) {
      case 'pid':
        sorted.sort((a, b) => a.summary.pid - b.summary.pid)
        break
      case 'last_sync':
        sorted.sort((a, b) => a.stats.lastSyncHours - b.stats.lastSyncHours)
        break
      case 'last_open':
        sorted.sort((a, b) => a.stats.lastOpenHours - b.stats.lastOpenHours)
        break
      case 'insights':
        sorted.sort((a, b) => b.stats.insightCount - a.stats.insightCount)
        break
      case 'urgency':
      default:
        sorted.sort((a, b) => b.stats.regimeUrgency - a.stats.regimeUrgency)
        break
    }
    return sorted
  }, [rows, query, cohort, status, sortKey])

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0)
  }, [query, cohort, status, sortKey])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const statusCounts = useMemo(() => {
    const counts: Record<MemberStatus | 'all', number> = {
      all: rows.length,
      at_risk: 0,
      needs_attention: 0,
      on_track: 0,
      building_baseline: 0,
    }
    for (const r of rows) counts[r.stats.status]++
    return counts
  }, [rows])

  const onRowClick = (pid: number) => {
    setActivePid(pid)
    navigate('/insights')
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-3 text-slate-500 p-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading roster…</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter + search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or pid…"
            className={cn(
              'w-full pl-9 pr-3 py-2 text-sm',
              'bg-white border border-slate-200 rounded-lg',
              'focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400',
              'placeholder:text-slate-400',
            )}
          />
        </div>

        <select
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-300"
        >
          {COHORT_FILTERS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 ml-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-300"
          >
            <option value="urgency">Urgency ↓</option>
            <option value="last_sync">Last sync ↑</option>
            <option value="last_open">Last open ↑</option>
            <option value="insights">Insights ↓</option>
            <option value="pid">PID ↑</option>
          </select>
        </div>
      </div>

      {/* Status chip filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_FILTERS.map(([v, label]) => {
          const isActive = status === v
          const count = statusCounts[v]
          const color = v === 'all' ? null : STATUS_COLOR[v as MemberStatus]
          return (
            <button
              key={v}
              onClick={() => setStatus(v)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors',
                isActive
                  ? 'bg-primary-50 border-primary-300 text-primary-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              {color && <span className={cn('w-1.5 h-1.5 rounded-full', color.dot)} />}
              <span>{label}</span>
              <span className="text-slate-400 tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Count line */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-800 tabular-nums">{filtered.length}</span>
          {filtered.length === rows.length ? ' members' : ` of ${rows.length.toLocaleString()}`}
          {totalPages > 1 && (
            <span className="text-slate-400">
              {' · '}page {safePage + 1}/{totalPages}
            </span>
          )}
        </span>
      </div>

      {/* Table header */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[minmax(0,2fr)_70px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_32px] gap-3 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          <div>Member</div>
          <div className="text-right">Days</div>
          <div className="text-right">Insights</div>
          <div>Last sync</div>
          <div>Last open</div>
          <div>Status</div>
          <div />
        </div>

        {visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">No matches</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((row) => (
              <MemberRow key={row.summary.pid} row={row} onClick={() => onRowClick(row.summary.pid)} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border',
              safePage === 0
                ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
            )}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs text-slate-500 tabular-nums">
            Showing {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} of {filtered.length}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border',
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

function MemberRow({ row, onClick }: { row: Row; onClick: () => void }) {
  const { summary, stats, displayName, isNamed } = row
  const color = STATUS_COLOR[stats.status]
  const cohortLabel =
    summary.cohort === 'cohort_a' ? 'A' : summary.cohort === 'cohort_b' ? 'B' : summary.cohort === 'cohort_c' ? 'C' : '—'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full grid grid-cols-[minmax(0,2fr)_70px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_32px] gap-3 px-4 py-2.5',
        'items-center text-left hover:bg-slate-50 transition-colors',
      )}
    >
      {/* Member name + cohort */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={cn(
            'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold',
            isNamed
              ? 'bg-amber-100 text-amber-700'
              : 'bg-slate-100 text-slate-600',
          )}
        >
          {displayName.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-800 truncate">{displayName}</div>
          <div className="text-[10px] text-slate-400">
            Cohort {cohortLabel} · pid {summary.pid}
          </div>
        </div>
      </div>

      {/* Days of data */}
      <div className="text-sm tabular-nums text-slate-700 text-right">{stats.daysOfData}</div>

      {/* Insights */}
      <div className="text-sm tabular-nums text-slate-700 text-right">
        {stats.insightCount}
        <span className="text-slate-400 text-xs ml-0.5">insights</span>
      </div>

      {/* Last sync */}
      <div className="text-xs text-slate-500">{formatTimeAgo(stats.lastSyncHours)}</div>

      {/* Last open */}
      <div className="text-xs text-slate-500">{formatTimeAgo(stats.lastOpenHours)}</div>

      {/* Status */}
      <div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium',
            color.bg,
            color.text,
          )}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', color.dot)} />
          {STATUS_LABELS[stats.status]}
        </span>
      </div>

      <Eye className="w-3.5 h-3.5 text-slate-300" />
    </button>
  )
}

export default MemberRoster
