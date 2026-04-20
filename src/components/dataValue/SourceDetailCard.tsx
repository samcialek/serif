import { Card } from '@/components/common'
import {
  Watch, Moon, Map, TestTube2, Stethoscope,
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

export function SourceDetailCard({ source, className }: SourceDetailCardProps) {
  const Icon = iconMap[source.icon] ?? Watch

  return (
    <Card variant="outlined" padding="md" className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary-600" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 text-sm">{source.name}</p>
          <p className="text-xs text-slate-500">{source.category}</p>
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
    </Card>
  )
}
