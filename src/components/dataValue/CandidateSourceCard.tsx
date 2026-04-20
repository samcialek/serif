import { Card } from '@/components/common'
import {
  Activity, Apple, Heart, Thermometer, Brain,
  TestTube, HeartPulse, Dna, Wind,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { ValueScoreGauge } from './ValueScoreGauge'
import { EdgeUnlockList } from './EdgeUnlockList'
import { ConfounderResolutionBadge } from './ConfounderResolutionBadge'
import type { CandidateDataSource, MarginalValueScore } from '@/data/dataValue/types'
import type { InformationTheoreticScore } from '@/data/dataValue/informationTheoreticScoring'

interface CandidateSourceCardProps {
  candidate: CandidateDataSource
  score: MarginalValueScore
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

      {/* Description */}
      <p className="text-xs text-slate-600 leading-relaxed">{candidate.description}</p>

      {/* Score breakdown */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-slate-800">{score.newEdgesUnlocked}</p>
          <p className="text-[10px] text-slate-500">New Edges</p>
          <p className="text-[10px] text-slate-400">{score.newEdgePoints} pts</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-slate-800">{score.confoundersResolved}</p>
          <p className="text-[10px] text-slate-500">Confounders</p>
          <p className="text-[10px] text-slate-400">{score.confounderPoints} pts</p>
        </div>
        <div className="bg-slate-50 rounded-lg py-2 px-1">
          <p className="text-lg font-bold text-slate-800">{score.signalBoostEdges}</p>
          <p className="text-[10px] text-slate-500">Signal Boost</p>
          <p className="text-[10px] text-slate-400">{score.signalBoostPoints} pts</p>
        </div>
      </div>

      {/* IT score breakdown (when available) */}
      {itScore && (
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { label: 'EIG', value: itScore.expectedInformationGain.normalized, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'Var Red', value: itScore.varianceReduction.normalized, color: 'text-violet-700', bg: 'bg-violet-50' },
            { label: 'Precision', value: itScore.precisionRatio.normalized, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'Testability', value: itScore.testabilityKL.normalized, color: 'text-amber-700', bg: 'bg-amber-50' },
          ].map(d => (
            <div key={d.label} className={cn('rounded-lg py-1.5 px-1', d.bg)}>
              <p className={cn('text-sm font-bold', d.color)}>{d.value.toFixed(1)}</p>
              <p className="text-[9px] text-slate-500">{d.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Key edge narratives */}
      {candidate.keyEdgeNarratives.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Key edges affected
          </p>
          <div className="space-y-2.5">
            {candidate.keyEdgeNarratives.map((item) => (
              <div key={item.edgeTitle} className="relative pl-3 border-l-2 border-indigo-200">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={cn(
                    'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded',
                    item.type === 'boost' && 'bg-blue-50 text-blue-600',
                    item.type === 'unlock' && 'bg-emerald-50 text-emerald-600',
                    item.type === 'confounder' && 'bg-violet-50 text-violet-600',
                  )}>
                    {item.type === 'boost' ? 'signal boost' : item.type === 'unlock' ? 'new edge' : 'confounder'}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">{item.edgeTitle}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">{item.narrative}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confounder badges */}
      {score.resolvedLatentNodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {score.resolvedLatentNodes.map((node) => (
            <ConfounderResolutionBadge key={node} nodeName={node} />
          ))}
        </div>
      )}

      {/* Unlocked mechanisms */}
      <EdgeUnlockList mechanisms={score.unlockedMechanisms} />

      {/* Signal boost edges */}
      {score.boostedEdgeTitles.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Signal boosted ({score.boostedEdgeTitles.length})
          </p>
          <div className="space-y-0.5">
            {score.boostedEdgeTitles.slice(0, 3).map((title) => (
              <p key={title} className="text-xs text-slate-600 pl-2 border-l-2 border-slate-200">
                {title}
              </p>
            ))}
            {score.boostedEdgeTitles.length > 3 && (
              <p className="text-xs text-slate-400 pl-2">
                +{score.boostedEdgeTitles.length - 3} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Example products */}
      <div className="pt-2 border-t border-slate-100">
        <p className="text-[10px] text-slate-400 mb-1">Example products</p>
        <p className="text-xs text-slate-500">{candidate.exampleProducts.join(', ')}</p>
      </div>
    </Card>
  )
}
