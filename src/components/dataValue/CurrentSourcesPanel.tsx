import { SourceDetailCard } from './SourceDetailCard'
import type { ExistingDataSource } from '@/data/dataValue/types'

interface CurrentSourcesPanelProps {
  sources: ExistingDataSource[]
}

export function CurrentSourcesPanel({ sources }: CurrentSourcesPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Connected Data Sources</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          These are the data sources currently feeding Oron's causal inference engine.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sources.map((source) => (
          <SourceDetailCard key={source.id} source={source} />
        ))}
      </div>
    </div>
  )
}
