/**
 * DataModeToggle — segmented control that switches the whole member
 * portal between "your data" (Bayesian posterior) and "your cohort"
 * (prior-only) modes.
 *
 * Reads from and writes to useDataModeStore (persisted to localStorage).
 * Lives in the PageLayout `actions` slot on every member-scoped tab:
 * Data, Devices, Insights, Exploration, Baseline, Twin, Protocols.
 */

import { User, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/classNames'
import { useDataModeStore, type DataMode } from '@/hooks/useDataMode'

interface SegmentDef {
  mode: DataMode
  label: string
  icon: LucideIcon
  tooltip: string
}

const SEGMENTS: SegmentDef[] = [
  {
    mode: 'personal',
    label: 'Your data',
    icon: User,
    tooltip:
      'Use your own data where we have it, fall back to the cohort prior where we don’t (default Bayesian posterior).',
  },
  {
    mode: 'cohort',
    label: 'Cohort',
    icon: Users,
    tooltip:
      'Use the cohort prior only — see what we’d recommend if you had no personal data yet.',
  },
]

export interface DataModeToggleProps {
  className?: string
  size?: 'sm' | 'md'
}

export function DataModeToggle({ className, size = 'md' }: DataModeToggleProps) {
  const mode = useDataModeStore((s) => s.mode)
  const setMode = useDataModeStore((s) => s.setMode)

  const iconPx = size === 'sm' ? 12 : 14
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'
  const textCls = size === 'sm' ? 'text-[10px]' : 'text-[11px]'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-slate-50',
        className,
      )}
      role="tablist"
      aria-label="Data source"
    >
      {SEGMENTS.map((seg) => {
        const active = mode === seg.mode
        const Icon = seg.icon
        return (
          <button
            key={seg.mode}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(seg.mode)}
            title={seg.tooltip}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
              padding,
              textCls,
              active
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <Icon width={iconPx} height={iconPx} aria-hidden />
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}

export default DataModeToggle
