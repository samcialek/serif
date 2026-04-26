import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { PageLayout } from '@/components/layout'
import {
  Card,
  DataModeToggle,
  EdgeEvidenceChip,
  PainterlyPageHeader,
} from '@/components/common'
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/common/Tabs'
import { CurrentSourcesPanel } from '@/components/dataValue'
import { IntegrationsPanel } from '@/components/integration/IntegrationsPanel'
import { useDataValue } from '@/hooks/useDataValue'
import { useParticipant } from '@/hooks/useParticipant'
import type { InsightBayesian } from '@/data/portal/types'
import type {
  CandidateDataSource,
  MarginalValueScore,
  MechanismTestability,
} from '@/data/dataValue/types'
import { useScopeStore } from '@/stores/scopeStore'
import { cn } from '@/utils/classNames'
import {
  edgeWeight,
  personalizationForEdge,
  prettyEdgeId,
  scopeBlurb,
  scopeLabel,
  scopedEdgesForRegime,
  weightedPersonalizationPct,
} from '@/utils/edgeEvidence'

const categoryColors: Record<string, { bg: string; text: string }> = {
  metabolic: { bg: 'bg-amber-100', text: 'text-amber-800' },
  cardio: { bg: 'bg-rose-100', text: 'text-rose-800' },
  recovery: { bg: 'bg-blue-100', text: 'text-blue-800' },
  sleep: { bg: 'bg-indigo-100', text: 'text-indigo-800' },
}

function EdgeCoverageMap({
  testableEdges,
  untestableEdges,
}: {
  testableEdges: MechanismTestability[]
  untestableEdges: MechanismTestability[]
}) {
  const allEdges = [
    ...testableEdges.map((e) => ({ ...e, testable: true })),
    ...untestableEdges.map((e) => ({ ...e, testable: false })),
  ]

  // Group by category
  const grouped: Record<string, typeof allEdges> = {}
  for (const entry of allEdges) {
    const cat = entry.mechanism.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(entry)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Mechanism Coverage Matrix</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          All {allEdges.length} mechanisms color-coded by testability. Green = testable with current data. Gray = needs new data source.
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300" />
          Testable ({testableEdges.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
          Untestable ({untestableEdges.length})
        </span>
      </div>

      {['metabolic', 'cardio', 'recovery', 'sleep'].map((cat) => {
        const edges = grouped[cat] ?? []
        if (edges.length === 0) return null
        const colors = categoryColors[cat]
        const testableCount = edges.filter((e) => e.testable).length

        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('px-2 py-0.5 text-xs font-medium rounded', colors.bg, colors.text)}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </span>
              <span className="text-xs text-slate-400">
                {testableCount}/{edges.length} testable
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {edges.map((entry) => (
                <div
                  key={entry.mechanism.id}
                  className={cn(
                    'px-3 py-2 rounded text-xs border',
                    entry.testable
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{entry.mechanism.name}</span>
                    {!entry.testable && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        {entry.hasDoseData ? 'no response' : 'no dose'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface ScopedCandidateValue {
  candidate: CandidateDataSource
  score: MarginalValueScore
  matchedEdges: InsightBayesian[]
  priorHeavyEdges: InsightBayesian[]
  topEdges: InsightBayesian[]
  expectedPersonalGain: number
  rankingScore: number
  averagePersonalPct: number
}

const CANDIDATE_TERMS: Record<string, { action?: string[]; outcome?: string[]; any?: string[] }> = {
  cgm: {
    action: ['carb', 'glucose', 'meal', 'dietary_energy', 'calorie'],
    outcome: ['glucose', 'insulin', 'hba1c', 'triglyceride'],
  },
  nutrition: {
    action: [
      'diet',
      'protein',
      'carb',
      'fat',
      'fiber',
      'sodium',
      'calorie',
      'energy',
      'meal',
      'omega',
      'polyphenol',
      'supplement',
      'zinc',
      'melatonin',
      'theanine',
    ],
    outcome: ['glucose', 'triglyceride', 'hscrp', 'body_fat', 'apob', 'ldl', 'hdl'],
  },
  blood_pressure: {
    action: ['sodium', 'sleep_debt', 'acwr', 'training', 'travel', 'caffeine'],
    outcome: ['blood_pressure', 'systolic', 'diastolic', 'resting_hr', 'cortisol'],
  },
  body_temperature: {
    action: ['temperature', 'temp', 'bedroom'],
    outcome: ['sleep', 'deep_sleep', 'hrv', 'resting_hr', 'recovery'],
  },
  mood_stress: {
    action: ['stress', 'rpe', 'travel', 'sleep_debt', 'training_monotony'],
    outcome: ['mood', 'energy', 'cortisol', 'testosterone', 'hrv', 'sleep', 'resting_hr'],
  },
  monthly_labs: {
    outcome: [
      'apob',
      'ldl',
      'hdl',
      'triglyceride',
      'hscrp',
      'ferritin',
      'iron',
      'cortisol',
      'testosterone',
      'glucose',
      'vitamin',
      'hormone',
    ],
  },
  dedicated_hrv: {
    action: ['training', 'sleep', 'alcohol', 'caffeine'],
    outcome: ['hrv', 'resting_hr', 'sleep', 'recovery'],
  },
  genetic_data: {
    any: [
      'ferritin',
      'iron',
      'apob',
      'ldl',
      'hdl',
      'triglyceride',
      'glucose',
      'testosterone',
      'vitamin_d',
      'caffeine',
      'insulin',
    ],
  },
  respiratory_rate: {
    outcome: ['respiratory', 'hrv', 'resting_hr', 'sleep', 'recovery'],
  },
}

function containsAny(value: string, terms: string[] = []): boolean {
  return terms.some((term) => value.includes(term))
}

function candidateMatchesEdge(candidateId: string, edge: InsightBayesian): boolean {
  if (candidateId === 'monthly_labs' && edge.pathway === 'biomarker') return true
  if (candidateId === 'genetic_data' && edge.pathway === 'biomarker' && personalizationForEdge(edge) < 0.5) {
    return true
  }

  const terms = CANDIDATE_TERMS[candidateId]
  if (!terms) return false

  const action = edge.action.toLowerCase()
  const outcome = edge.outcome.toLowerCase()
  const both = `${action} ${outcome}`
  return (
    containsAny(action, terms.action) ||
    containsAny(outcome, terms.outcome) ||
    containsAny(both, terms.any)
  )
}

/**
 * Devices-tab candidate ranking weights.
 *
 *   expectedPersonalGain  — DOMINATES. Σ (1 − personalization) × |effect|.
 *                           Headline metric: how much posterior tightening
 *                           this device can buy you, weighted by edge size.
 *   priorHeavyCount       — small breadth bonus: more priors to unlock.
 *   matchedCount          — tiny relevance bonus per matched edge.
 *   confoundersResolved   — moderate: resolving a latent (e.g. core_temp,
 *                           insulin_sensitivity) unblocks identifiability
 *                           on multiple downstream edges.
 *   legacyComposite       — near-zero. The original IT score (EIG + variance
 *                           reduction + precision + testability KL) is kept
 *                           only as a tiebreaker. The edge-led metrics above
 *                           are the canonical scoring path.
 */
const RANKING_WEIGHTS = {
  expectedPersonalGain: 120,
  priorHeavyCount: 4,
  matchedCount: 1.5,
  confoundersResolved: 8,
  legacyComposite: 0.2,
}

function scoreScopedCandidate(
  candidate: CandidateDataSource,
  score: MarginalValueScore,
  activeEdges: InsightBayesian[],
): ScopedCandidateValue {
  const matchedEdges = activeEdges.filter((edge) => candidateMatchesEdge(candidate.id, edge))
  const priorHeavyEdges = matchedEdges.filter((edge) => personalizationForEdge(edge) < 0.25)
  const expectedPersonalGain = matchedEdges.reduce(
    (sum, edge) => sum + (1 - personalizationForEdge(edge)) * edgeWeight(edge),
    0,
  )
  const topEdges = [...matchedEdges]
    .sort((a, b) => {
      const aGain = (1 - personalizationForEdge(a)) * edgeWeight(a)
      const bGain = (1 - personalizationForEdge(b)) * edgeWeight(b)
      return bGain - aGain
    })
    .slice(0, 3)
  const averagePersonalPct = Math.round(weightedPersonalizationPct(matchedEdges) * 100)
  const rankingScore =
    expectedPersonalGain * RANKING_WEIGHTS.expectedPersonalGain +
    priorHeavyEdges.length * RANKING_WEIGHTS.priorHeavyCount +
    matchedEdges.length * RANKING_WEIGHTS.matchedCount +
    score.confoundersResolved * RANKING_WEIGHTS.confoundersResolved +
    score.composite * RANKING_WEIGHTS.legacyComposite

  return {
    candidate,
    score,
    matchedEdges,
    priorHeavyEdges,
    topEdges,
    expectedPersonalGain,
    rankingScore,
    averagePersonalPct,
  }
}

function ScopedOpportunityCard({ value }: { value: ScopedCandidateValue }) {
  // Gain score = expected personalization gain ÷ ceiling, where the ceiling is
  // the gain you'd see if every matched edge was 0% personalized today.
  // Normalizing this way:
  //   1. gives a true 0-100 scale per device (no arbitrary ×100 + clip),
  //   2. is comparable across devices with very different edge counts,
  //   3. reads naturally as "this device captures N% of the personalization
  //      headroom available across the edges it touches".
  // When the device matches no scoped edges (ceiling = 0), we show 0.
  const ceiling = value.matchedEdges.reduce(
    (sum, edge) => sum + edgeWeight(edge),
    0,
  )
  const gainScore =
    ceiling > 0 ? Math.round((value.expectedPersonalGain / ceiling) * 100) : 0
  const firstExample = value.candidate.exampleProducts[0]
  const hover = [
    `Gain score = (Σ (1 − personalization) × |effect|) ÷ ceiling.`,
    `Ceiling = sum of |effect| across matched edges.`,
    ``,
    `${value.matchedEdges.length} scoped edges matched`,
    `${value.priorHeavyEdges.length} model-heavy edges would tighten first`,
    `${value.score.confoundersResolved} latent confounders/proxies from the source catalog`,
  ].join('\n')

  return (
    <Card variant="outlined" padding="md" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-slate-800">
              {value.candidate.name}
            </h4>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {value.candidate.frequency}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            {value.candidate.description}
          </p>
        </div>
        <div className="text-right flex-shrink-0" title={hover}>
          <div className="text-2xl font-semibold text-emerald-700 tabular-nums">
            {gainScore}
            <span className="text-base font-normal text-emerald-600 ml-0.5">
              /100
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            gain score
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-2">
          <div className="text-lg font-semibold text-emerald-700 tabular-nums">
            {value.matchedEdges.length}
          </div>
          <div className="text-[10px] text-emerald-700">scoped edges</div>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-2">
          <div className="text-lg font-semibold text-amber-700 tabular-nums">
            {value.priorHeavyEdges.length}
          </div>
          <div className="text-[10px] text-amber-700">model-heavy</div>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-2">
          <div className="text-lg font-semibold text-indigo-700 tabular-nums">
            {value.averagePersonalPct}%
          </div>
          <div
            className="text-[10px] text-indigo-700"
            title="Magnitude-weighted member-specific evidence share across edges this device would touch."
          >
            personalized now
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {value.topEdges.length === 0 ? (
          <p className="text-xs text-slate-500">
            No direct current edges in this scope; value comes from new mechanism
            coverage and confounder proxies.
          </p>
        ) : (
          value.topEdges.map((edge) => {
            return (
              <div
                key={`${value.candidate.id}:${edge.action}->${edge.outcome}`}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate font-medium text-slate-700">
                  {prettyEdgeId(edge.action)} {'->'} {prettyEdgeId(edge.outcome)}
                </span>
                <EdgeEvidenceChip edge={edge} variant="compact" />
              </div>
            )
          })
        )}
      </div>

      <p className="text-[10px] text-slate-400 truncate">
        Example: {firstExample ?? value.candidate.category}
      </p>
    </Card>
  )
}

function ScopedDeviceOpportunitiesPanel({
  rankedCandidates,
  participantEdges,
  isLoading,
}: {
  rankedCandidates: Array<{ candidate: CandidateDataSource; score: MarginalValueScore }>
  participantEdges: InsightBayesian[]
  isLoading: boolean
}) {
  const regime = useScopeStore((s) => s.regime)
  const activeEdges = useMemo(
    () => scopedEdgesForRegime(participantEdges, regime),
    [participantEdges, regime],
  )
  const values = useMemo(
    () =>
      rankedCandidates
        .map(({ candidate, score }) => scoreScopedCandidate(candidate, score, activeEdges))
        .sort((a, b) => b.rankingScore - a.rankingScore),
    [activeEdges, rankedCandidates],
  )
  const topValues = values.slice(0, 6)
  const totalMatched = new Set(
    values.flatMap((value) =>
      value.matchedEdges.map((edge) => `${edge.action}->${edge.outcome}`),
    ),
  ).size
  const totalPriorHeavy = new Set(
    values.flatMap((value) =>
      value.priorHeavyEdges.map((edge) => `${edge.action}->${edge.outcome}`),
    ),
  ).size

  if (isLoading) {
    return (
      <Card padding="md" className="text-sm text-slate-500">
        Loading edge-led device opportunities...
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Edge-Led Device Opportunities
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
            Ranked by the current participant's model-heavy and partially personalized
            edges. Currently scoped to{' '}
            <span className="font-medium text-slate-700">{scopeLabel(regime)}</span>{' '}
            ({scopeBlurb(regime)}).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-right flex-shrink-0">
          <div>
            <div className="text-xl font-semibold text-slate-800 tabular-nums">
              {totalMatched}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              matched
            </div>
          </div>
          <div>
            <div className="text-xl font-semibold text-amber-700 tabular-nums">
              {totalPriorHeavy}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              model-heavy
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {topValues.map((value) => (
          <ScopedOpportunityCard key={value.candidate.id} value={value} />
        ))}
      </div>
    </div>
  )
}

export function DataValueView() {
  const {
    existingSources,
    rankedCandidates,
    testableEdges,
    untestableEdges,
  } = useDataValue()
  const { participant, isLoading } = useParticipant()

  const [activeTab, setActiveTab] = useState('connected')

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Which next data source would most reduce uncertainty in this member's recommendations."
        hideHorizon
        actions={<DataModeToggle />}
      />
      {/* Internal tabs — pills variant inside a tinted container for visibility */}
      <Tabs value={activeTab} onValueChange={setActiveTab} variant="pills">
        <TabList className="!bg-stone-50 border border-stone-200 mb-5 shadow-sm">
          <TabTrigger value="connected">Connected Devices</TabTrigger>
          <TabTrigger value="opportunities">Device Opportunities</TabTrigger>
          <TabTrigger value="coverage">Edge Coverage Map</TabTrigger>
          <TabTrigger value="integrations">Integrations</TabTrigger>
        </TabList>

        <TabContent value="connected">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <CurrentSourcesPanel sources={existingSources} />
          </motion.div>
        </TabContent>

        <TabContent value="opportunities">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ScopedDeviceOpportunitiesPanel
              rankedCandidates={rankedCandidates}
              participantEdges={participant?.effects_bayesian ?? []}
              isLoading={isLoading}
            />
          </motion.div>
        </TabContent>

        <TabContent value="coverage">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <EdgeCoverageMap
              testableEdges={testableEdges}
              untestableEdges={untestableEdges}
            />
          </motion.div>
        </TabContent>

        <TabContent value="integrations">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <IntegrationsPanel />
          </motion.div>
        </TabContent>
      </Tabs>
    </PageLayout>
  )
}
