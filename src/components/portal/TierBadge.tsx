import { cn } from '@/utils/classNames'
import type { GateTier } from '@/data/portal/types'

const tierStyles: Record<GateTier, { bg: string; text: string; border: string; label: string }> = {
  recommended: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Recommended',
  },
  possible: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'Possible',
  },
  not_exposed: {
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    border: 'border-slate-200',
    label: 'Not exposed',
  },
}

interface TierBadgeProps {
  tier: GateTier
  size?: 'sm' | 'md'
  className?: string
}

export function TierBadge({ tier, size = 'sm', className }: TierBadgeProps) {
  const s = tierStyles[tier]
  const sizeCls = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        s.bg,
        s.text,
        s.border,
        sizeCls,
        className,
      )}
    >
      {s.label}
    </span>
  )
}

export { tierStyles }
