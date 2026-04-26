/**
 * ExplorationOutcomeCard — wraps the experiments that could personalize
 * a single outcome.
 *
 * Three sub-sections (each only rendered when it has rows):
 *   Running   — experiments the coach has launched + not yet complete.
 *   Suggested — not launched, ranked by info-gain.
 *   Completed — finished experiments (Phase 5 links back to Insights).
 *
 * Expansion state is managed by the view: one row at a time across the
 * whole tab. Pass `expandedKey` + `onExpand`. That lets the sticky
 * ActiveExperimentsBar focus-scroll and open a specific row.
 */

import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ParticipantPortal } from '@/data/portal/types'
import type { ExplorationEdge } from '@/utils/exploration'
import {
  explorationKey,
  progressFor,
  useExplorationStore,
} from '@/stores/explorationStore'
import { ExplorationActionRow } from './ExplorationActionRow'
import { ExplorationActionDetail } from './ExplorationActionDetail'
import { GlossaryTerm } from '@/components/common'

interface Props {
  outcome: string
  edges: ExplorationEdge[]
  outcomeLabel: string
  participant: ParticipantPortal
  expandedKey: string | null
  onExpand: (key: string | null) => void
}

const TOP_N_DEFAULT = 5

type EdgeGroup = 'running' | 'suggested' | 'completed'

function groupFor(
  edge: ExplorationEdge,
  launched: Record<string, { started_at: number; duration_days: number; mock_progress_day: number }>,
): EdgeGroup {
  const entry = launched[explorationKey(edge.action, edge.outcome)]
  if (!entry) return 'suggested'
  const p = progressFor(entry)
  if (p?.isComplete) return 'completed'
  return 'running'
}

const GROUP_LABEL: Record<EdgeGroup, { title: string; tone: string }> = {
  running: { title: 'Running', tone: 'text-amber-800' },
  suggested: { title: 'Suggested', tone: 'text-slate-600' },
  completed: { title: 'Completed', tone: 'text-emerald-700' },
}

export function ExplorationOutcomeCard({
  outcome,
  edges,
  outcomeLabel,
  participant,
  expandedKey,
  onExpand,
}: Props) {
  const launched = useExplorationStore((s) => s.launched)

  const grouped = useMemo(() => {
    const g: Record<EdgeGroup, ExplorationEdge[]> = {
      running: [],
      suggested: [],
      completed: [],
    }
    for (const edge of edges) {
      g[groupFor(edge, launched)].push(edge)
    }
    return g
  }, [edges, launched])

  const suggestedVisible =
    grouped.suggested.length <= TOP_N_DEFAULT + 1
      ? grouped.suggested
      : grouped.suggested.slice(0, TOP_N_DEFAULT)

  const hasHidden = grouped.suggested.length > suggestedVisible.length
  const [showAll, setShowAll] = useShowAll(outcome)
  const renderSuggested = showAll ? grouped.suggested : suggestedVisible

  const bestNarrow = edges.length > 0 ? Math.max(...edges.map((e) => e.computed.narrow)) : 0
  const bestInfoGain = edges.length > 0 ? Math.max(...edges.map((e) => e.computed.infoGain)) : 0

  const totalRunning = grouped.running.length
  const totalCompleted = grouped.completed.length

  return (
    <section
      id={`exploration-outcome-${outcome}`}
      role="region"
      aria-label={`Exploration candidates for ${outcomeLabel}`}
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/60 flex items-center gap-3 flex-wrap">
        <h3 className="text-[13px] font-semibold text-slate-800">
          <GlossaryTerm termId={outcome} display={outcomeLabel} />
        </h3>
        <span className="text-[11px] text-slate-500">
          {edges.length} experiment{edges.length === 1 ? '' : 's'} could personalize this
          {totalRunning > 0 && (
            <span className="text-amber-700">
              {' · '}
              {totalRunning} running
            </span>
          )}
          {totalCompleted > 0 && (
            <span className="text-emerald-700">
              {' · '}
              {totalCompleted} complete
            </span>
          )}
        </span>
        {bestNarrow > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-indigo-700"
            title={`The strongest experiment here would eliminate ~${Math.round(bestNarrow * 100)}% of the remaining uncertainty on its slope.`}
          >
            <Sparkles className="w-3 h-3" aria-hidden />
            best narrow {Math.round(bestNarrow * 100)}% · best learn{' '}
            {bestInfoGain.toFixed(2)}σ
          </span>
        )}
      </div>

      {/* Running */}
      {grouped.running.length > 0 && (
        <EdgeGroupSection
          group="running"
          edges={grouped.running}
          participant={participant}
          expandedKey={expandedKey}
          onExpand={onExpand}
        />
      )}

      {/* Suggested */}
      {renderSuggested.length > 0 && (
        <EdgeGroupSection
          group="suggested"
          edges={renderSuggested}
          participant={participant}
          expandedKey={expandedKey}
          onExpand={onExpand}
          // hide header label if there aren't other groups to distinguish from
          suppressHeader={grouped.running.length === 0 && grouped.completed.length === 0}
        />
      )}

      {/* Show all */}
      {hasHidden && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 border-t border-slate-100"
        >
          {showAll
            ? 'Show top 5 suggested only'
            : `Show ${grouped.suggested.length - suggestedVisible.length} more suggested experiment${grouped.suggested.length - suggestedVisible.length === 1 ? '' : 's'}`}
        </button>
      )}

      {/* Completed */}
      {grouped.completed.length > 0 && (
        <EdgeGroupSection
          group="completed"
          edges={grouped.completed}
          participant={participant}
          expandedKey={expandedKey}
          onExpand={onExpand}
        />
      )}
    </section>
  )
}

/** Per-card "show top 5 only" state. Scoped to the card by outcome so
 *  collapsing one doesn't collapse the others. */
function useShowAll(outcome: string): [boolean, (updater: (v: boolean) => boolean) => void] {
  const key = `serif.explorationV2.showAll:${outcome}`
  const initial = (() => {
    try {
      return window.localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })()
  const [state, setState] = useState(initial)
  const updater = (fn: (v: boolean) => boolean): void => {
    setState((prev) => {
      const next = fn(prev)
      try {
        window.localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // ignore
      }
      return next
    })
  }
  return [state, updater]
}

interface SectionProps {
  group: EdgeGroup
  edges: ExplorationEdge[]
  participant: ParticipantPortal
  expandedKey: string | null
  onExpand: (key: string | null) => void
  suppressHeader?: boolean
}

function EdgeGroupSection({
  group,
  edges,
  participant,
  expandedKey,
  onExpand,
  suppressHeader = false,
}: SectionProps) {
  const { title, tone } = GROUP_LABEL[group]
  return (
    <div>
      {!suppressHeader && (
        <div
          className={cn(
            'px-3 py-1 text-[10px] uppercase tracking-wider font-semibold bg-slate-50/80 border-b border-slate-100',
            tone,
          )}
        >
          {title} · {edges.length}
        </div>
      )}
      {edges.map((edge) => {
        const key = explorationKey(edge.action, edge.outcome)
        const expanded = expandedKey === key
        return (
          <div
            key={key}
            id={`exploration-row-${key}`}
            className={cn(expanded && 'bg-slate-50/50')}
          >
            <ExplorationActionRow
              edge={edge}
              expanded={expanded}
              onToggle={() => onExpand(expanded ? null : key)}
            />
            {expanded && <ExplorationActionDetail edge={edge} participant={participant} />}
          </div>
        )
      })}
    </div>
  )
}

export default ExplorationOutcomeCard
