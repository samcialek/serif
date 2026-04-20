import {
  Watch, Moon, Map, TestTube2, Stethoscope, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { ExistingDataSource } from '@/data/dataValue/types'

interface SourceDetailCardProps {
  source: ExistingDataSource
  className?: string
}

const iconMap: Record<string, React.ElementType> = {
  Watch, Moon, Map, TestTube2, Stethoscope,
}

// Outline colour = connection health. Blue when the source is live;
// amber when there's something actionable (disconnected, stale, partial
// stream). Keeps the panel scannable at a glance.
const STATUS_STYLE: Record<'syncing' | 'issue', { wrap: string; iconBg: string; icon: string; chipBg: string; chipText: string; label: string }> = {
  syncing: {
    wrap: 'border-2 border-blue-300 bg-white',
    iconBg: 'bg-blue-50',
    icon: 'text-blue-600',
    chipBg: 'bg-blue-50 border-blue-200',
    chipText: 'text-blue-700',
    label: 'Syncing',
  },
  issue: {
    wrap: 'border-2 border-amber-400 bg-white',
    iconBg: 'bg-amber-50',
    icon: 'text-amber-600',
    chipBg: 'bg-amber-50 border-amber-200',
    chipText: 'text-amber-700',
    label: 'Issue',
  },
}

export function SourceDetailCard({ source, className }: SourceDetailCardProps) {
  const Icon = iconMap[source.icon] ?? Watch
  const style = STATUS_STYLE[source.status]
  const StatusIcon = source.status === 'syncing' ? CheckCircle2 : AlertTriangle

  return (
    <div className={cn('rounded-lg p-4 flex flex-col gap-3', style.wrap, className)}>
      <div className="flex items-start gap-3">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', style.iconBg)}>
          <Icon className={cn('w-5 h-5', style.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800 text-sm truncate">{source.name}</p>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border rounded-full',
                style.chipBg,
                style.chipText,
              )}
            >
              <StatusIcon className="w-3 h-3" />
              {style.label}
            </span>
          </div>
          <p className="text-xs text-slate-500">{source.category}</p>
          {source.statusDetail && (
            <p className={cn('text-[11px] mt-1 leading-snug', style.chipText)}>
              {source.statusDetail}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">Edges</p>
          <p className="text-lg font-bold text-slate-800">
            {source.edgesParticipating}
            <span className="text-xs font-normal text-slate-400 ml-1">/ {source.totalEdges}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Avg Evidence</p>
          <p className="text-lg font-bold text-slate-800">{source.avgPersonalPct}%</p>
        </div>
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1">Columns ({source.columns.length})</p>
        <div className="flex flex-wrap gap-1">
          {source.columns.slice(0, 6).map((col) => (
            <span
              key={col}
              className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-600 rounded"
            >
              {col}
            </span>
          ))}
          {source.columns.length > 6 && (
            <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
              +{source.columns.length - 6} more
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
