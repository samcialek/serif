/**
 * ScopeBar — the cross-tab regime + horizon selector.
 *
 * Renders as a compact pill that sits next to the member avatar in the
 * unified page header. When a tab doesn't meaningfully support one of
 * the axes (horizon for Labs, Devices) it can pass `showHorizon={false}`
 * and the pill collapses to regime only.
 *
 * Uses the painterly Twin palette (cream background, warm stone border,
 * sage highlight on active) so it reads as part of the same system.
 */

import { Clock, Leaf, Layers } from 'lucide-react'
import { cn } from '@/utils/classNames'
import {
  useScopeStore,
  type ScopeRegime,
  defaultHorizonFor,
} from '@/stores/scopeStore'

const BG = '#fefbf3'
const BG_ACTIVE = '#7C9F8B'
const BORDER = '#f0e9d8'

interface ScopeBarProps {
  /** Drop the horizon selector — useful for tabs with no natural horizon
   *  (labs, devices, baseline snapshots). */
  showHorizon?: boolean
  /** Drop the regime selector — useful when a tab is intrinsically tied
   *  to one regime. Rare; default is to show both. */
  showRegime?: boolean
  className?: string
}

const REGIME_OPTIONS: Array<{
  value: ScopeRegime
  label: string
  icon: React.ComponentType<{ className?: string }>
}> = [
  { value: 'quotidian', label: 'Quotidian', icon: Clock },
  { value: 'longevity', label: 'Longevity', icon: Leaf },
  { value: 'all', label: 'All', icon: Layers },
]

const HORIZON_PRESETS: Array<{ days: number; label: string }> = [
  { days: 1, label: '1d' },
  { days: 7, label: '1w' },
  { days: 30, label: '1mo' },
  { days: 90, label: '3mo' },
  { days: 180, label: '6mo' },
  { days: 365, label: '1y' },
]

export function ScopeBar({
  showHorizon = true,
  showRegime = true,
  className,
}: ScopeBarProps) {
  const regime = useScopeStore((s) => s.regime)
  const atDays = useScopeStore((s) => s.atDays)
  const setRegime = useScopeStore((s) => s.setRegime)
  const setAtDays = useScopeStore((s) => s.setAtDays)

  return (
    <div
      className={cn('inline-flex items-center gap-2 flex-wrap', className)}
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      {showRegime && (
        <div
          className="inline-flex items-center rounded-full p-0.5"
          style={{ background: '#fff', border: `1px solid ${BORDER}` }}
          role="tablist"
          aria-label="Regime"
        >
          {REGIME_OPTIONS.map((opt) => {
            const active = regime === opt.value
            const Icon = opt.icon
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRegime(opt.value)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition-colors"
                style={{
                  background: active ? BG : 'transparent',
                  color: active ? '#1c1917' : '#78716c',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon className="w-3 h-3" />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      {showHorizon && (
        <div
          className="inline-flex items-center rounded-full p-0.5"
          style={{ background: '#fff', border: `1px solid ${BORDER}` }}
          aria-label="Horizon"
        >
          <span
            className="inline-block"
            style={{
              padding: '3px 8px 3px 10px',
              color: '#a8a29e',
              fontSize: 9,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Horizon
          </span>
          {HORIZON_PRESETS.map((p) => {
            const active = atDays === p.days
            return (
              <button
                key={p.days}
                type="button"
                onClick={() => setAtDays(p.days)}
                className="px-2 py-1 rounded-full transition-colors"
                style={{
                  background: active ? BG : 'transparent',
                  color: active ? '#1c1917' : '#78716c',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Hook returning a sage-highlighted "reset to regime default" button
 *  that callers can drop into their toolbar when they want an obvious
 *  "undo my horizon override" affordance. */
export function useHorizonIsOverride(): boolean {
  const regime = useScopeStore((s) => s.regime)
  const atDays = useScopeStore((s) => s.atDays)
  return atDays !== defaultHorizonFor(regime)
}

export default ScopeBar

void BG_ACTIVE // exported-for-theme-use symbol — kept to avoid tree-shake cleanup
