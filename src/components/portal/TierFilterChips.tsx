import { cn } from '@/utils/classNames'
import { usePortalStore } from '@/stores/portalStore'
import { tierStyles } from './TierBadge'
import type { GateTier } from '@/data/portal/types'

const ALL_TIERS: GateTier[] = ['recommended', 'possible', 'not_exposed']

interface TierFilterChipsProps {
  /** Optional counts to display per tier (from participant.tier_counts) */
  counts?: Record<GateTier, number>
}

export function TierFilterChips({ counts }: TierFilterChipsProps) {
  const tierFilter = usePortalStore((s) => s.tierFilter)
  const toggle = usePortalStore((s) => s.toggleTierFilter)
  const setFilter = usePortalStore((s) => s.setTierFilter)

  // Empty filter == show all; otherwise only selected tiers shown
  const isShowAll = tierFilter.size === 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-slate-400 uppercase tracking-wider mr-1">
        Tier:
      </span>
      <button
        onClick={() => setFilter([])}
        className={cn(
          'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
          isShowAll
            ? 'bg-primary-50 border-primary-200 text-primary-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
        )}
      >
        All
      </button>
      {ALL_TIERS.map((tier) => {
        const selected = tierFilter.has(tier)
        const s = tierStyles[tier]
        const count = counts?.[tier]
        return (
          <button
            key={tier}
            onClick={() => toggle(tier)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              selected
                ? cn(s.bg, s.text, s.border, 'ring-1 ring-offset-0')
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', {
              'bg-emerald-500': tier === 'recommended',
              'bg-amber-500': tier === 'possible',
              'bg-slate-400': tier === 'not_exposed',
            })} />
            {s.label}
            {count !== undefined && (
              <span className={cn(
                'px-1.5 py-0.5 text-[10px] font-semibold rounded-full tabular-nums',
                selected ? 'bg-white/70' : 'bg-slate-100 text-slate-500',
              )}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default TierFilterChips
