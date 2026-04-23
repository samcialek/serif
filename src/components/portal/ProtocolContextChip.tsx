/**
 * ProtocolContextChip — per-ProtocolRow summary of what drove today's dose.
 *
 * Two prototypes to pick between:
 *   Variant A ("minimal"): muted one-line text, up to 2 drivers, no colour —
 *     designed to stay visually quiet so the timeline reads cleanly.
 *   Variant B ("detailed"): colour-coded severity chips with values and an
 *     "+ N more" affordance; designed to make the driving context obvious
 *     at a glance even on a dense day.
 *
 * Signal selection (both variants):
 *   1. Active regimes — if any, they win (these changed the item's shape).
 *   2. Elevated loads — numeric off-baseline load values.
 *   3. Watch-level loads — secondary but worth surfacing on quiet days.
 *   4. Primary confounder — date-derived (weekend, season) for items whose
 *      outcomes have known DAG confounders.
 * Hides entirely if nothing worth showing.
 */

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type {
  LoadDriver,
  ProtocolItemContext,
  RegimeDriver,
  ConfounderDriver,
  LoadSeverity,
} from '@/utils/dailyProtocol'

export type ChipVariant = 'minimal' | 'detailed'

const SEVERITY_STYLES: Record<
  LoadSeverity,
  { chip: string; dot: string }
> = {
  good: {
    chip: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    dot: 'bg-emerald-500',
  },
  neutral: {
    chip: 'bg-slate-50 border-slate-200 text-slate-700',
    dot: 'bg-slate-400',
  },
  watch: {
    chip: 'bg-amber-50 border-amber-200 text-amber-800',
    dot: 'bg-amber-500',
  },
  elevated: {
    chip: 'bg-rose-50 border-rose-200 text-rose-800',
    dot: 'bg-rose-500',
  },
}

function loadValueStr(d: LoadDriver): string {
  if (d.key === 'acwr' || d.key === 'training_monotony') return d.value.toFixed(2)
  if (d.key === 'training_consistency') return `${Math.round(d.value * 100)}%`
  if (d.key === 'sleep_debt_14d') return `${d.value.toFixed(1)}h`
  if (d.key === 'sri_7d') return Math.round(d.value).toString()
  if (d.key === 'tsb') return d.value >= 0 ? `+${d.value.toFixed(0)}` : d.value.toFixed(0)
  return d.value.toFixed(1)
}

function pickPrimaryConfounder(list: ConfounderDriver[]): ConfounderDriver | null {
  // is_weekend wins when true (it's the most day-specific); then travel_load;
  // then season. Skip anything without an observed value — a confounder we
  // "adjusted for" but can't show a live value for doesn't belong in the
  // chip (it belongs in the audit trail detail).
  const isWeekend = list.find(
    (c) => c.key === 'is_weekend' && c.value === 'weekend',
  )
  if (isWeekend) return isWeekend
  const travel = list.find((c) => c.key === 'travel_load' && c.value)
  if (travel) return travel
  const season = list.find((c) => c.key === 'season' && c.value)
  return season ?? null
}

// ── Minimal variant ─────────────────────────────────────────────────

function MinimalChip({ context }: { context: ProtocolItemContext }) {
  const parts: string[] = []
  for (const r of context.active_regimes.slice(0, 1)) {
    parts.push(`${r.label.toLowerCase()} ${Math.round(r.activation * 100)}%`)
  }
  for (const d of context.driving_loads.slice(0, 2 - parts.length)) {
    parts.push(`${d.label.toLowerCase()} ${loadValueStr(d)}`)
  }
  if (parts.length < 2) {
    const conf = pickPrimaryConfounder(context.confounders_adjusted)
    if (conf && parts.length < 2) {
      parts.push(`${conf.label.toLowerCase()}${conf.value ? `: ${conf.value}` : ''}`)
    }
  }
  if (parts.length === 0) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 tabular-nums">
      <span
        className="w-1 h-1 rounded-full bg-slate-400"
        aria-hidden
      />
      {parts.join(' · ')}
    </span>
  )
}

// ── Detailed variant ────────────────────────────────────────────────

function LoadChipDetailed({ d }: { d: LoadDriver }) {
  const styles = SEVERITY_STYLES[d.severity]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] tabular-nums',
        styles.chip,
      )}
      title={d.hint}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', styles.dot)} aria-hidden />
      <span className="font-medium">{d.label}</span>
      <span>{loadValueStr(d)}</span>
    </span>
  )
}

function RegimeChipDetailed({ r }: { r: RegimeDriver }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-900 text-[10px] tabular-nums">
      <AlertTriangle className="w-2.5 h-2.5" aria-hidden />
      <span className="font-medium">{r.label}</span>
      <span>{Math.round(r.activation * 100)}%</span>
    </span>
  )
}

function ConfounderChipDetailed({ c }: { c: ConfounderDriver }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-800 text-[10px]">
      <span className="font-medium">{c.label}</span>
      {c.value && <span className="tabular-nums">{c.value}</span>}
    </span>
  )
}

function DetailedChip({ context }: { context: ProtocolItemContext }) {
  const primaryConf = pickPrimaryConfounder(context.confounders_adjusted)
  const regimeSlots = context.active_regimes.slice(0, 2)
  const loadSlots = context.driving_loads.slice(
    0,
    Math.max(0, 4 - regimeSlots.length - (primaryConf ? 1 : 0)),
  )
  const totalShown = regimeSlots.length + loadSlots.length + (primaryConf ? 1 : 0)
  const totalAvailable =
    context.active_regimes.length +
    context.driving_loads.length +
    context.confounders_adjusted.filter((c) => c.value).length
  const more = Math.max(0, totalAvailable - totalShown)

  if (totalShown === 0) return null
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {regimeSlots.map((r) => (
        <RegimeChipDetailed key={r.key} r={r} />
      ))}
      {loadSlots.map((d) => (
        <LoadChipDetailed key={d.key} d={d} />
      ))}
      {primaryConf && <ConfounderChipDetailed c={primaryConf} />}
      {more > 0 && (
        <span className="text-[10px] text-slate-500 tabular-nums">
          + {more} more
        </span>
      )}
    </div>
  )
}

// ── Public component ────────────────────────────────────────────────

export function ProtocolContextChip({
  context,
  variant,
}: {
  context: ProtocolItemContext
  variant: ChipVariant
}) {
  if (
    context.active_regimes.length === 0 &&
    context.driving_loads.length === 0 &&
    context.confounders_adjusted.filter((c) => c.value).length === 0
  ) {
    return null
  }
  return variant === 'minimal' ? (
    <MinimalChip context={context} />
  ) : (
    <DetailedChip context={context} />
  )
}

export default ProtocolContextChip
