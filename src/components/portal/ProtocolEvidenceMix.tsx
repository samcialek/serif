import { useState } from 'react'
import type { InsightBayesian } from '@/data/portal/types'
import type { ProtocolItem } from '@/utils/dailyProtocol'
import {
  evidenceSummaryForItem,
  type ProtocolEvidenceSummary,
} from '@/utils/dailyProtocol'

function pct(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100)
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 10) return value.toFixed(1)
  if (abs >= 1) return value.toFixed(2)
  return value.toFixed(3)
}

function hoverText(summary: ProtocolEvidenceSummary): string {
  const dom = summary.dominantEdge
  const parts = [
    `${pct(summary.personalPct)}% personalized / ${pct(summary.modelPct)}% model`,
    `${pct(summary.coveragePct)}% coverage / ${pct(summary.narrowingPct)}% narrowing`,
    `${summary.edgeCount} causal edge${summary.edgeCount === 1 ? '' : 's'} matched`,
  ]
  if (summary.userN > 0) parts.push(`user n=${summary.userN}`)
  if (dom) {
    parts.push(`dominant: ${dom.action} -> ${dom.outcome}`)
    parts.push(`posterior mean ${fmt(dom.mean)}, SD ${fmt(dom.sd)}`)
    parts.push(`90% CI [${fmt(dom.ci90[0])}, ${fmt(dom.ci90[1])}]`)
  }
  return parts.join('\n')
}

export function ProtocolEvidenceMix({
  item,
  effects,
  variant = 'compact',
}: {
  item: ProtocolItem
  effects: InsightBayesian[]
  variant?: 'compact' | 'detailed'
}) {
  const [hovered, setHovered] = useState(false)
  const summary = evidenceSummaryForItem(item, effects)
  if (!summary) return null

  const personal = pct(summary.personalPct)
  const model = pct(summary.modelPct)
  const coverage = pct(summary.coveragePct)
  const narrowing = pct(summary.narrowingPct)
  const hover = hoverText(summary)

  return (
    <span
      className="relative inline-flex items-center gap-1.5 text-[10px] text-slate-500"
      aria-label={`Evidence mix: ${personal}% personalized, ${model}% model`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="tabular-nums">Personalized {personal}%</span>
      <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-slate-200">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
          style={{ width: `${personal}%` }}
        />
      </span>
      {variant === 'detailed' && (
        <span className="tabular-nums">Model {model}%</span>
      )}
      {hovered && (
        <span
          role="tooltip"
          className="absolute pointer-events-none right-0 bottom-[calc(100%+8px)] z-50 w-64 rounded-xl border border-stone-100 bg-white px-3 py-2.5 text-left text-[10.5px] leading-relaxed text-stone-600 shadow-[0_12px_28px_rgba(28,25,23,0.14),0_2px_6px_rgba(28,25,23,0.06)]"
        >
          <span className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-stone-950">
              Personalized {personal}%
            </span>
            <span className="tabular-nums text-stone-400">model {model}%</span>
          </span>
          <span className="block">
            Coverage {coverage}% / narrowing {narrowing}%. This is the same
            member-specific evidence summary used in Insights and Data.
          </span>
          <span className="mt-1.5 block whitespace-pre-line text-stone-400">
            {hover}
          </span>
          <span
            aria-hidden
            className="absolute right-4 -bottom-1 h-2.5 w-2.5 rotate-45 border-b border-r border-stone-100 bg-white"
          />
        </span>
      )}
    </span>
  )
}

export default ProtocolEvidenceMix
