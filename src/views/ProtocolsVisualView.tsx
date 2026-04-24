/**
 * VisualSchedule — compact / timeline schedule body.
 *
 * Vertical spine with one row per protocol item. Each row shows the
 * time, icon, title, dose, tags, and an expandable details panel that
 * includes:
 *   - ProtocolMagnitude: day-axis bar with shift arrow / duration band.
 *   - Yesterday-diff pill when dose or time changed overnight.
 *   - Context chip + sparkline for the driving load.
 *   - Audit trail + suggestion options.
 *
 * Renders only the schedule — the participant load, page layout,
 * header, and shared top-of-card sections are owned by `ProtocolsView`.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Minimize2,
  Maximize2,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ParticipantPortal } from '@/data/portal/types'
import { CausalSparkline } from '@/components/portal/CausalSparkline'
import { ProtocolAuditTrail } from '@/components/portal/ProtocolAuditTrail'
import { ProtocolContextChip } from '@/components/portal/ProtocolContextChip'
import { ProtocolMagnitude } from '@/components/portal/ProtocolMagnitude'
import { RegimeGlyphs } from '@/components/portal/RegimeGlyphs'
import type { CandidateSchedule } from '@/utils/twinSem'
import {
  sourceLabel,
  tagColor,
  userConfoundersForItem,
} from '@/utils/dailyProtocol'
import type {
  MatchedProtocolItem,
  ProtocolItem,
} from '@/utils/dailyProtocol'

const SOURCE_DOT: Record<ProtocolItem['source'], string> = {
  twin_sem: 'bg-emerald-500',
  regime_driven: 'bg-amber-500',
  baseline: 'bg-slate-300',
}

function doseDiffers(today: ProtocolItem, yesterday: ProtocolItem): boolean {
  if (today.dose !== yesterday.dose) return true
  if (today.displayTime !== yesterday.displayTime) return true
  const t = (today.details ?? []).join('|')
  const y = (yesterday.details ?? []).join('|')
  return t !== y
}

const COLLAPSE_STORAGE_KEY = 'serif.protocols.visual.expandedTitles.v1'

function readExpandedFromStorage(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.filter((s) => typeof s === 'string'))
  } catch {
    // ignore
  }
  return new Set()
}

function writeExpandedToStorage(titles: Set<string>): void {
  try {
    window.localStorage.setItem(
      COLLAPSE_STORAGE_KEY,
      JSON.stringify(Array.from(titles)),
    )
  } catch {
    // ignore quota / disabled storage
  }
}

export interface VisualScheduleProps {
  matched: MatchedProtocolItem[]
  yesterdayByTitle: Map<string, ProtocolItem> | null
  participant: ParticipantPortal
  schedule: CandidateSchedule
  wakeTime: number
  chipVariant: 'minimal' | 'detailed'
}

export function VisualSchedule({
  matched,
  yesterdayByTitle,
  participant,
  schedule,
  wakeTime,
  chipVariant,
}: VisualScheduleProps) {
  const [expandedTitles, setExpandedTitles] = useState<Set<string>>(() =>
    readExpandedFromStorage(),
  )

  useEffect(() => {
    writeExpandedToStorage(expandedTitles)
  }, [expandedTitles])

  const toggleExpanded = (title: string): void => {
    setExpandedTitles((prev) => {
      const next = new Set(prev)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }
  const expandAll = (titles: string[]): void => {
    setExpandedTitles(new Set(titles))
  }
  const collapseAll = (): void => {
    setExpandedTitles(new Set())
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">
          Today's protocol
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => expandAll(matched.map((m) => m.real.title))}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Expand all rows"
          >
            <Maximize2 className="w-3 h-3" />
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Collapse all rows"
          >
            <Minimize2 className="w-3 h-3" />
            Collapse
          </button>
          <p className="text-[11px] text-slate-400 tabular-nums ml-1">
            {matched.length} actions
          </p>
        </div>
      </div>
      <div className="relative">
        <div className="absolute left-[22px] top-2 bottom-2 w-px bg-slate-200" />
        <ul className="space-y-2">
          {matched.map((m, i) => (
            <VisualProtocolRow
              key={i}
              matched={m}
              yesterdayItem={yesterdayByTitle?.get(m.real.title) ?? null}
              participant={participant}
              schedule={schedule}
              wakeTime={wakeTime}
              chipVariant={chipVariant}
              expanded={expandedTitles.has(m.real.title)}
              onToggleExpanded={() => toggleExpanded(m.real.title)}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

interface RowProps {
  matched: MatchedProtocolItem
  yesterdayItem: ProtocolItem | null
  participant: ParticipantPortal
  schedule: CandidateSchedule
  wakeTime: number
  chipVariant: 'minimal' | 'detailed'
  expanded: boolean
  onToggleExpanded: () => void
}

function VisualProtocolRow({
  matched,
  yesterdayItem,
  participant,
  schedule,
  wakeTime,
  chipVariant,
  expanded,
  onToggleExpanded,
}: RowProps) {
  const { real, neutral } = matched
  const [suggestOpen, setSuggestOpen] = useState<boolean>(false)
  const [auditOpen, setAuditOpen] = useState<boolean>(false)
  const hasSuggestions = real.suggestions && real.suggestions.length > 0

  const userConfounders = useMemo(
    () => userConfoundersForItem(real, participant.effects_bayesian),
    [real, participant.effects_bayesian],
  )
  const hasContext =
    real.context.active_regimes.length > 0 ||
    real.context.driving_loads.length > 0 ||
    real.context.confounders_adjusted.some((c) => c.value)
  const topLoad = real.context.driving_loads[0]
  const series = topLoad ? participant.loads_history?.[topLoad.key] ?? [] : []

  return (
    <li className="relative pl-12">
      <div className="absolute left-0 top-0.5 flex items-center gap-1.5 w-[44px]">
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-white relative z-10',
            SOURCE_DOT[real.source],
          )}
        />
      </div>

      {/* Clickable header — toggles expand/collapse */}
      <button
        onClick={onToggleExpanded}
        className={cn(
          'w-full flex items-center gap-2 flex-wrap text-left py-1 rounded group',
          'hover:bg-slate-50 -mx-1 px-1',
        )}
        aria-expanded={expanded}
      >
        <span className="text-[11px] font-medium tabular-nums text-slate-500 w-12 flex-shrink-0">
          {real.displayTime}
        </span>
        <span className="text-base leading-none flex-shrink-0">{real.icon}</span>
        <span className="text-sm font-semibold text-slate-800">{real.title}</span>
        <span className="text-xs text-slate-500">· {real.dose}</span>
        <RegimeGlyphs regimes={real.context.active_regimes} />
        {hasContext && !expanded && (
          <span className="ml-auto flex items-center gap-2">
            <ProtocolContextChip context={real.context} variant={chipVariant} />
            {topLoad && series.length >= 2 && (
              <CausalSparkline
                series={series}
                loadKey={topLoad.key}
                label={topLoad.label}
                severityOverride={topLoad.severity}
              />
            )}
          </span>
        )}
        <span
          className={cn(
            'ml-auto flex-shrink-0 text-slate-400 group-hover:text-slate-600 transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        >
          <ChevronDown className="w-4 h-4" />
        </span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {/* Magnitude visualization */}
          <div className="ml-[22px]">
            <ProtocolMagnitude
              item={real}
              participant={participant}
              schedule={schedule}
              wakeTime={wakeTime}
            />
          </div>

          {yesterdayItem && doseDiffers(real, yesterdayItem) && (
            <div className="ml-[22px] mb-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-[10px] leading-snug tabular-nums">
              <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
                Yesterday
              </span>
              <span>{yesterdayItem.displayTime}</span>
            </div>
          )}

          {hasContext && (
            <div className="ml-[22px] mb-1 flex items-center gap-2 flex-wrap">
              <ProtocolContextChip context={real.context} variant={chipVariant} />
              {topLoad && series.length >= 2 && (
                <CausalSparkline
                  series={series}
                  loadKey={topLoad.key}
                  label={topLoad.label}
                  severityOverride={topLoad.severity}
                />
              )}
            </div>
          )}

          <div className="ml-[22px] flex items-center gap-1.5 flex-wrap">
            {real.tags.map((t) => (
              <span
                key={t}
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded border tabular-nums',
                  tagColor(t),
                )}
              >
                {t}
              </span>
            ))}
            {hasSuggestions && (
              <button
                onClick={() => setSuggestOpen((v) => !v)}
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-expanded={suggestOpen}
              >
                <Lightbulb className="w-3 h-3" />
                {suggestOpen ? 'Hide options' : 'Suggest options'}
                {suggestOpen ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
            {hasContext && (
              <ProtocolAuditTrail
                real={real}
                neutral={neutral}
                userConfounders={userConfounders}
                placement="inline"
                open={auditOpen}
                onToggle={() => setAuditOpen((v) => !v)}
                onClose={() => setAuditOpen(false)}
              />
            )}
            <span className="text-[10px] text-slate-400 ml-auto">
              {sourceLabel(real.source)}
            </span>
          </div>

          {hasSuggestions && suggestOpen && (
            <div className="ml-[22px] mt-1.5 p-2 bg-slate-50 border border-dashed border-slate-300 rounded">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Non-engine suggestions
              </p>
              <ul className="space-y-0.5">
                {real.suggestions!.map((s, i) => (
                  <li key={i} className="text-[12px] text-slate-600 leading-snug">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export default VisualSchedule
