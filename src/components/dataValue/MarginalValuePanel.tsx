import { CandidateSourceCard } from './CandidateSourceCard'
import type { CandidateDataSource, MarginalValueScore } from '@/data/dataValue/types'
import type { InformationTheoreticScore } from '@/data/dataValue/informationTheoreticScoring'

interface MarginalValuePanelProps {
  rankedCandidates: Array<{ candidate: CandidateDataSource; score: MarginalValueScore }>
  rankedCandidatesIT?: Array<{ candidate: CandidateDataSource; score: InformationTheoreticScore }>
}

export function MarginalValuePanel({ rankedCandidates, rankedCandidatesIT }: MarginalValuePanelProps) {
  // Build IT score lookup by candidate ID
  const itScoreMap = new Map(
    rankedCandidatesIT?.map(r => [r.candidate.id, r.score]) ?? []
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Device Opportunities</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Each candidate scored 0-100 across four dimensions: expected information gain, variance reduction, precision ratio, and testability.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rankedCandidates.map(({ candidate, score }) => (
          <CandidateSourceCard
            key={candidate.id}
            candidate={candidate}
            score={score}
            itScore={itScoreMap.get(candidate.id)}
          />
        ))}
      </div>
    </div>
  )
}
