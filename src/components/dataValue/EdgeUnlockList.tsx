import { cn } from '@/utils/classNames'
import type { MechanismDef } from '@/data/dataValue/types'

interface EdgeUnlockListProps {
  mechanisms: MechanismDef[]
  className?: string
}

const categoryColors: Record<string, { bg: string; text: string; dot: string }> = {
  metabolic: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  cardio: { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-400' },
  recovery: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  sleep: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400' },
}

export function EdgeUnlockList({ mechanisms, className }: EdgeUnlockListProps) {
  if (mechanisms.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
        New edges unlocked ({mechanisms.length})
      </p>
      {mechanisms.map((m) => {
        const colors = categoryColors[m.category] ?? categoryColors.metabolic
        return (
          <div
            key={m.id}
            className={cn(
              'flex items-center gap-2 px-2 py-1 rounded text-xs',
              colors.bg
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', colors.dot)} />
            <span className={cn('font-medium', colors.text)}>{m.name}</span>
          </div>
        )
      })}
    </div>
  )
}
