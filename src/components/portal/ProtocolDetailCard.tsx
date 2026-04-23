/**
 * ProtocolDetailCard — detail panel rendered below the horizontal day
 * bar. Shows the selected protocol's full content: title, dose, details,
 * rationale, context chip, sparkline, suggestions, tags, audit trail.
 *
 * This is the "depth" half of the bar-view's overview-+-depth pattern.
 * Reuses the same chip and audit-trail components as the vertical spine
 * so the two routes stay in sync on what each protocol "knows about"
 * itself — only the layout differs.
 */

import { useMemo, useState } from 'react'
import { Info, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { MatchedProtocolItem, ProtocolItem } from '@/utils/dailyProtocol'
import { sourceLabel, tagColor, userConfoundersForItem } from '@/utils/dailyProtocol'
import type { ParticipantPortal } from '@/data/portal/types'
import { ProtocolContextChip } from './ProtocolContextChip'
import { CausalSparkline } from './CausalSparkline'
import { ProtocolAuditTrail } from './ProtocolAuditTrail'

const SOURCE_DOT: Record<ProtocolItem['source'], string> = {
  twin_sem: 'bg-emerald-500',
  regime_driven: 'bg-amber-500',
  baseline: 'bg-slate-300',
}

interface Props {
  matched: MatchedProtocolItem
  yesterdayItem: ProtocolItem | null
  participant: ParticipantPortal
}

export function ProtocolDetailCard({ matched, yesterdayItem, participant }: Props) {
  const { real, neutral } = matched
  const [suggestOpen, setSuggestOpen] = useState<boolean>(false)
  const [auditOpen, setAuditOpen] = useState<boolean>(false)

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
  const hasSuggestions = real.suggestions && real.suggestions.length > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-white flex-shrink-0',
            real.source === 'twin_sem'
              ? 'bg-emerald-50'
              : real.source === 'regime_driven'
                ? 'bg-amber-50'
                : 'bg-slate-50',
          )}
          style={{
            boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.04)',
          }}
        >
          <span className="text-xl leading-none">{real.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[12px] font-medium tabular-nums text-slate-500">
              {real.displayTime}
            </span>
            <h3 className="text-base font-semibold text-slate-800">
              {real.title}
            </h3>
          </div>
          <p className="text-sm text-slate-700 mt-0.5">{real.dose}</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span
            className={cn('w-2 h-2 rounded-full', SOURCE_DOT[real.source])}
          />
          {sourceLabel(real.source)}
        </div>
      </div>

      {/* Details */}
      {real.details && real.details.length > 0 && (
        <ul className="space-y-0.5 mb-2">
          {real.details.map((d, i) => (
            <li key={i} className="text-[12px] text-slate-600 leading-snug">
              · {d}
            </li>
          ))}
        </ul>
      )}

      {/* Rationale */}
      {real.rationale && (
        <p className="text-[12px] text-slate-500 italic leading-snug mb-2">
          {real.rationale}
        </p>
      )}

      {/* Yesterday diff */}
      {yesterdayItem && doseDiffers(real, yesterdayItem) && (
        <div className="mb-2">
          <YesterdayInline today={real} yesterday={yesterdayItem} />
        </div>
      )}

      {/* Context chip + sparkline */}
      {hasContext && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <ProtocolContextChip context={real.context} variant="detailed" />
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

      {/* Tags + buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
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
      </div>

      {/* Suggestions */}
      {hasSuggestions && suggestOpen && (
        <div className="mt-2 p-2 bg-slate-50 border border-dashed border-slate-300 rounded">
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
          <p className="mt-1 text-[10px] text-slate-400 leading-snug">
            These ideas are outside the engine’s scope — pick what suits you.
          </p>
        </div>
      )}
    </div>
  )
}

function doseDiffers(today: ProtocolItem, yesterday: ProtocolItem): boolean {
  if (today.dose !== yesterday.dose) return true
  if (today.displayTime !== yesterday.displayTime) return true
  const t = (today.details ?? []).join('|')
  const y = (yesterday.details ?? []).join('|')
  return t !== y
}

function YesterdayInline({
  today,
  yesterday,
}: {
  today: ProtocolItem
  yesterday: ProtocolItem
}) {
  const timeChanged = today.displayTime !== yesterday.displayTime
  const doseChanged = today.dose !== yesterday.dose
  const diffDetail: string | null = (() => {
    const tList = today.details ?? []
    const yList = yesterday.details ?? []
    const max = Math.max(tList.length, yList.length)
    for (let i = 0; i < max; i++) {
      if (tList[i] !== yList[i]) return yList[i] ?? null
    }
    return null
  })()
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-[11px] leading-snug">
      <Info className="w-3 h-3 text-amber-600 flex-shrink-0" />
      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">
        Yesterday
      </span>
      {(timeChanged || doseChanged) && (
        <span className="tabular-nums">
          <span className="font-semibold">{yesterday.displayTime}</span>
          <span className="mx-1 text-amber-400">·</span>
          <span className="line-through decoration-amber-400">
            {yesterday.dose}
          </span>
        </span>
      )}
      {!timeChanged && !doseChanged && diffDetail && (
        <span className="tabular-nums">{diffDetail}</span>
      )}
    </div>
  )
}

export default ProtocolDetailCard
