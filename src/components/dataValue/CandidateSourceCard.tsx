import { Card } from '@/components/common'
import {
  Activity, Apple, Heart, Thermometer, Brain,
  TestTube, HeartPulse, Dna, Wind,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { ValueScoreGauge } from './ValueScoreGauge'
import { ConfounderResolutionBadge } from './ConfounderResolutionBadge'
import type { CandidateDataSource, MarginalValueScore } from '@/data/dataValue/types'
import type { InformationTheoreticScore } from '@/data/dataValue/informationTheoreticScoring'

interface CandidateSourceCardProps {
  candidate: CandidateDataSource
  score: MarginalValueScore
  /** Reserved for the future IT-score expanded view; not rendered in the
   *  compact card. */
  itScore?: InformationTheoreticScore
  className?: string
}

const iconMap: Record<string, React.ElementType> = {
  Activity, Apple, Heart, Thermometer, Brain,
  TestTube, HeartPulse, Dna, Wind,
}

const tierBadgeStyles = {
  transformative: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  high: 'bg-blue-50 text-blue-700 border-blue-200',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-gray-50 text-gray-500 border-gray-200',
}

const tierLabels = {
  transformative: 'Transformative',
  high: 'High Value',
  moderate: 'Moderate',
  low: 'Low Impact',
}

export function CandidateSourceCard({ candidate, score, itScore, className }: CandidateSourceCardProps) {
  const Icon = iconMap[candidate.icon] ?? Activity

  return (
    <Card variant="outlined" padding="md" className={cn('flex flex-col gap-4', className)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-slate-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{candidate.name}</p>
            <span
              className={cn(
                'px-2 py-0.5 text-[10px] font-medium rounded-full border',
                tierBadgeStyles[score.tier]
              )}
            >
              {tierLabels[score.tier]}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{candidate.category} &middot; {candidate.frequency}</p>
        </div>
        <ValueScoreGauge score={score.composite} tier={score.tier} size={64} />
      </div>

      {/* Score breakdown — three big numbers, no point footnote. */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg py-2 px-1">
          <p className="text-xl font-bold text-emerald-700 tabular-nums">{score.newEdgesUnlocked}</p>
          <p className="text-[10px] text-emerald-700 font-medium">new edges</p>
        </div>
        <div className="bg-violet-50 border border-violet-100 rounded-lg py-2 px-1">
          <p className="text-xl font-bold text-violet-700 tabular-nums">{score.confoundersResolved}</p>
          <p className="text-[10px] text-violet-700 font-medium">confounders</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg py-2 px-1">
          <p className="text-xl font-bold text-blue-700 tabular-nums">{score.signalBoostEdges}</p>
          <p className="text-[10px] text-blue-700 font-medium">signal boost</p>
        </div>
      </div>

      {/* Key edges — one line per item: tag + headline + super-short
          single-sentence narrative. */}
      {candidate.keyEdgeNarratives.length > 0 && (
        <ul className="space-y-1">
          {candidate.keyEdgeNarratives.map((item) => (
            <li key={item.edgeTitle} className="flex items-baseline gap-2 text-[11px]">
              <span className={cn(
                'flex-shrink-0 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded tabular-nums',
                item.type === 'boost' && 'bg-blue-50 text-blue-700',
                item.type === 'unlock' && 'bg-emerald-50 text-emerald-700',
                item.type === 'confounder' && 'bg-violet-50 text-violet-700',
              )}>
                {item.type === 'boost' ? 'boost' : item.type === 'unlock' ? 'new' : 'conf'}
              </span>
              <span className="font-medium text-slate-700">{item.edgeTitle}</span>
              <span className="text-slate-500 leading-snug">— {item.narrative}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Confounder badges (compact row) */}
      {score.resolvedLatentNodes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {score.resolvedLatentNodes.map((node) => (
            <ConfounderResolutionBadge key={node} nodeName={node} />
          ))}
        </div>
      )}

      {/* Example products — single line under everything else */}
      <p className="pt-1 text-[10px] text-slate-400 truncate">
        e.g. {candidate.exampleProducts.join(', ')}
      </p>
    </Card>
  )
}
