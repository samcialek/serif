/**
 * Dev-affordance toggle for comparing the two chip prototypes and the two
 * audit-trail placements side-by-side. Shown at the top of the Protocols
 * tab during prototype review; the selection is persisted to localStorage
 * so navigating away and back keeps the same view.
 *
 * Once the team picks a variant, this component can be removed and the
 * chosen values hardcoded into OptimalSchedule.
 */

/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ChipVariant } from './ProtocolContextChip'
import type { AuditPlacement } from './ProtocolAuditTrail'

const STORAGE_KEY = 'serif.protocols.contextVariants.v1'

export interface ContextVariants {
  chip: ChipVariant
  audit: AuditPlacement
}

const DEFAULT_VARIANTS: ContextVariants = {
  chip: 'detailed',
  audit: 'inline',
}

function readFromStorage(): ContextVariants {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VARIANTS
    const parsed = JSON.parse(raw) as Partial<ContextVariants>
    return {
      chip: parsed.chip ?? DEFAULT_VARIANTS.chip,
      audit: parsed.audit ?? DEFAULT_VARIANTS.audit,
    }
  } catch {
    return DEFAULT_VARIANTS
  }
}

function writeToStorage(v: ContextVariants): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
  } catch {
    // ignore quota / disabled storage
  }
}

export function useContextVariants(): [
  ContextVariants,
  (next: Partial<ContextVariants>) => void,
] {
  const [variants, setVariants] = useState<ContextVariants>(() =>
    readFromStorage(),
  )

  const update = (next: Partial<ContextVariants>): void => {
    setVariants((prev) => {
      const merged: ContextVariants = { ...prev, ...next }
      writeToStorage(merged)
      return merged
    })
  }

  return [variants, update]
}

interface ToggleProps {
  variants: ContextVariants
  onChange: (next: Partial<ContextVariants>) => void
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 text-[11px] font-medium rounded transition-colors',
        active
          ? 'bg-white text-slate-800 shadow-sm'
          : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {children}
    </button>
  )
}

export function ProtocolContextVariantToggle({
  variants,
  onChange,
}: ToggleProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50"
        aria-expanded={open}
      >
        <Settings2 className="w-3 h-3" />
        <span className="tabular-nums">
          chip: {variants.chip} · audit: {variants.audit}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-72">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
            Context chip prototype
          </p>
          <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded mb-1">
            <SegmentButton
              active={variants.chip === 'minimal'}
              onClick={() => onChange({ chip: 'minimal' })}
            >
              Minimal
            </SegmentButton>
            <SegmentButton
              active={variants.chip === 'detailed'}
              onClick={() => onChange({ chip: 'detailed' })}
            >
              Detailed
            </SegmentButton>
          </div>
          <p className="text-[10px] text-slate-500 leading-snug mb-3">
            <span className="font-medium">Minimal:</span> muted one-line text,
            2 drivers max.{' '}
            <span className="font-medium">Detailed:</span> colour-coded chips
            with severity dots, values, "+ N more".
          </p>

          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
            Audit-trail placement
          </p>
          <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded mb-1">
            <SegmentButton
              active={variants.audit === 'inline'}
              onClick={() => onChange({ audit: 'inline' })}
            >
              Inline
            </SegmentButton>
            <SegmentButton
              active={variants.audit === 'modal'}
              onClick={() => onChange({ audit: 'modal' })}
            >
              Modal
            </SegmentButton>
          </div>
          <p className="text-[10px] text-slate-500 leading-snug">
            <span className="font-medium">Inline:</span> accordion expands
            below the timeline row.{' '}
            <span className="font-medium">Modal:</span> click opens overlay
            with more breathing room.
          </p>
        </div>
      )}
    </div>
  )
}

export default ProtocolContextVariantToggle
