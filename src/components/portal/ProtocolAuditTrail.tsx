/**
 * ProtocolAuditTrail — three-block explanation of how one ProtocolItem
 * arrived at today's dose:
 *
 *   1. Baseline    — what this item would look like at neutral state
 *                    (regimes quiet, loads at personal baseline).
 *   2. Modifiers   — active regimes, off-baseline loads, and DAG confounders
 *                    that nudged the item away from baseline.
 *   3. Final       — today's realized dose + a one-sentence rationale.
 *
 * Two placements to pick between:
 *   Variant A ("inline"):  accordion expands in-place below the ProtocolRow,
 *                          shares the existing "Suggest options" disclosure
 *                          pattern — compact, timeline stays readable.
 *   Variant B ("modal"):   full-screen overlay with breathing room between
 *                          blocks — designed for dense dossier reading.
 */

import { useEffect } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Wrench,
  X,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import type {
  ConfounderDriver,
  LoadDriver,
  ProtocolItem,
  ProtocolItemContext,
  RegimeDriver,
  LoadSeverity,
} from '@/utils/dailyProtocol'

export type AuditPlacement = 'inline' | 'modal'

const SEVERITY_DOT: Record<LoadSeverity, string> = {
  good: 'bg-emerald-500',
  neutral: 'bg-slate-400',
  watch: 'bg-amber-500',
  elevated: 'bg-rose-500',
}

function loadValueStr(d: LoadDriver): string {
  if (d.key === 'acwr' || d.key === 'training_monotony') return d.value.toFixed(2)
  if (d.key === 'training_consistency') return `${Math.round(d.value * 100)}%`
  if (d.key === 'sleep_debt_14d') return `${d.value.toFixed(1)}h`
  if (d.key === 'sri_7d') return Math.round(d.value).toString()
  if (d.key === 'tsb') return d.value >= 0 ? `+${d.value.toFixed(0)}` : d.value.toFixed(0)
  return d.value.toFixed(1)
}

// ── Shared content blocks ───────────────────────────────────────────

function BaselineBlock({
  neutral,
  compact,
}: {
  neutral: ProtocolItem | null
  compact: boolean
}) {
  if (!neutral) {
    return (
      <div>
        <BlockLabel icon={<Info className="w-3 h-3" />} text="Baseline (neutral state)" />
        <p className={cn('text-slate-600 leading-snug', compact ? 'text-[11px]' : 'text-sm')}>
          Not recommended at neutral state — this item only appears when
          a regime is active.
        </p>
      </div>
    )
  }
  return (
    <div>
      <BlockLabel icon={<Info className="w-3 h-3" />} text="Baseline (neutral state)" />
      <div className={cn(compact ? 'text-[11px]' : 'text-sm')}>
        <p className="text-slate-700">
          <span className="font-semibold tabular-nums">{neutral.displayTime}</span>
          <span className="mx-1 text-slate-400">·</span>
          <span>{neutral.dose}</span>
        </p>
        {neutral.rationale && (
          <p className="italic text-slate-500 leading-snug mt-0.5">
            {neutral.rationale}
          </p>
        )}
      </div>
    </div>
  )
}

function LoadRow({ d }: { d: LoadDriver }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className={cn('w-1.5 h-1.5 rounded-full mt-1', SEVERITY_DOT[d.severity])} />
      <span className="font-medium text-slate-700 text-[12px]">
        {d.label} <span className="tabular-nums">{loadValueStr(d)}</span>
      </span>
      <span className="text-[11px] text-slate-500 italic">{d.hint}</span>
    </li>
  )
}

function RegimeRow({ r }: { r: RegimeDriver }) {
  return (
    <li className="flex items-baseline gap-2">
      <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5" />
      <span className="font-medium text-slate-700 text-[12px]">
        {r.label}{' '}
        <span className="tabular-nums text-amber-700">
          {Math.round(r.activation * 100)}% active
        </span>
      </span>
    </li>
  )
}

function ConfounderInline({ c }: { c: ConfounderDriver }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px]">
      <span className="font-medium">{c.label}</span>
      {c.value && <span className="tabular-nums">({c.value})</span>}
    </span>
  )
}

function ModifiersBlock({
  context,
  userConfounders,
  compact,
}: {
  context: ProtocolItemContext
  userConfounders: string[]
  compact: boolean
}) {
  const hasRegimes = context.active_regimes.length > 0
  const hasLoads = context.driving_loads.length > 0
  const hasConf = context.confounders_adjusted.length > 0
  if (!hasRegimes && !hasLoads && !hasConf) {
    return (
      <div>
        <BlockLabel icon={<Wrench className="w-3 h-3" />} text="Today's modifiers" />
        <p className={cn('text-slate-500 italic', compact ? 'text-[11px]' : 'text-sm')}>
          No regimes or loads off-baseline for this item today.
        </p>
      </div>
    )
  }
  return (
    <div>
      <BlockLabel icon={<Wrench className="w-3 h-3" />} text="Today's modifiers" />
      <ul className={cn('space-y-1', compact ? '' : 'space-y-1.5')}>
        {context.active_regimes.map((r) => (
          <RegimeRow key={r.key} r={r} />
        ))}
        {context.driving_loads.map((d) => (
          <LoadRow key={d.key} d={d} />
        ))}
      </ul>
      {hasConf && (
        <div className={cn('mt-2', compact ? 'text-[10px]' : 'text-[11px]')}>
          <p className="text-slate-500 mb-1">Adjusted for:</p>
          <div className="flex gap-1 flex-wrap">
            {context.confounders_adjusted.map((c) => (
              <ConfounderInline key={c.key} c={c} />
            ))}
          </div>
        </div>
      )}
      {userConfounders.length > 0 && (
        <details className={cn('mt-2', compact ? 'text-[10px]' : 'text-[11px]')}>
          <summary className="cursor-pointer text-slate-500">
            Regression covariates (advanced)
          </summary>
          <p className="text-slate-500 mt-1 font-mono leading-snug">
            {userConfounders.join(', ')}
          </p>
        </details>
      )}
    </div>
  )
}

function FinalBlock({ real, compact }: { real: ProtocolItem; compact: boolean }) {
  return (
    <div>
      <BlockLabel
        icon={<span className="text-emerald-600 font-bold text-[10px]">→</span>}
        text="Today's dose"
      />
      <div className={cn(compact ? 'text-[11px]' : 'text-sm')}>
        <p className="text-slate-800">
          <span className="font-semibold tabular-nums">{real.displayTime}</span>
          <span className="mx-1 text-slate-400">·</span>
          <span>{real.dose}</span>
        </p>
        {real.context.dose_rationale && (
          <p className="text-slate-600 italic leading-snug mt-0.5">
            {real.context.dose_rationale}
          </p>
        )}
      </div>
    </div>
  )
}

function BlockLabel({
  icon,
  text,
}: {
  icon: React.ReactNode
  text: string
}) {
  return (
    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-1">
      {icon}
      {text}
    </p>
  )
}

// ── Inline variant ──────────────────────────────────────────────────

interface InlineProps {
  real: ProtocolItem
  neutral: ProtocolItem | null
  userConfounders: string[]
  open: boolean
  onToggle: () => void
}

export function AuditTrailInline({
  real,
  neutral,
  userConfounders,
  open,
  onToggle,
}: InlineProps) {
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
        aria-expanded={open}
      >
        <Info className="w-3 h-3" />
        {open ? 'Hide context' : 'How we chose this'}
        {open ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      {open && (
        <div className="ml-[72px] mt-1.5 p-2.5 bg-slate-50 border border-dashed border-slate-300 rounded space-y-2.5">
          <BaselineBlock neutral={neutral} compact />
          <ModifiersBlock
            context={real.context}
            userConfounders={userConfounders}
            compact
          />
          <FinalBlock real={real} compact />
        </div>
      )}
    </>
  )
}

// ── Modal variant ───────────────────────────────────────────────────

interface ModalProps {
  real: ProtocolItem
  neutral: ProtocolItem | null
  userConfounders: string[]
  open: boolean
  onClose: () => void
}

export function AuditTrailModal({
  real,
  neutral,
  userConfounders,
  open,
  onClose,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              How we chose this
            </p>
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-1.5">
              <span>{real.icon}</span>
              {real.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 -m-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <BaselineBlock neutral={neutral} compact={false} />
          <div className="h-px bg-slate-100" />
          <ModifiersBlock
            context={real.context}
            userConfounders={userConfounders}
            compact={false}
          />
          <div className="h-px bg-slate-100" />
          <FinalBlock real={real} compact={false} />
        </div>
      </div>
    </div>
  )
}

// ── Convenience wrapper that picks by placement ─────────────────────

interface WrapperProps {
  real: ProtocolItem
  neutral: ProtocolItem | null
  userConfounders: string[]
  placement: AuditPlacement
  open: boolean
  onToggle: () => void
  onClose: () => void
}

export function ProtocolAuditTrail({
  real,
  neutral,
  userConfounders,
  placement,
  open,
  onToggle,
  onClose,
}: WrapperProps) {
  if (placement === 'inline') {
    return (
      <AuditTrailInline
        real={real}
        neutral={neutral}
        userConfounders={userConfounders}
        open={open}
        onToggle={onToggle}
      />
    )
  }
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
      >
        <Info className="w-3 h-3" />
        How we chose this
      </button>
      <AuditTrailModal
        real={real}
        neutral={neutral}
        userConfounders={userConfounders}
        open={open}
        onClose={onClose}
      />
    </>
  )
}

export default ProtocolAuditTrail
