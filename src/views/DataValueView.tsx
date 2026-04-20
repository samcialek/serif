import { useState } from 'react'
import { motion } from 'framer-motion'
import { PageLayout } from '@/components/layout'
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/common/Tabs'
import { DataValueSummary, MarginalValuePanel, CurrentSourcesPanel } from '@/components/dataValue'
import { useDataValue } from '@/hooks/useDataValue'
import { cn } from '@/utils/classNames'
import type { MechanismTestability } from '@/data/dataValue/types'

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

export function DataValueView() {
  const {
    edgeResults,
    existingSources,
    rankedCandidates,
    rankedCandidatesIT,
    testableEdges,
    untestableEdges,
    totalMechanisms,
    testableCount,
    testedPct,
    avgPersonalWeight,
    latentNodeCount,
    fittedEdgeCount,
  } = useDataValue()

  const [activeTab, setActiveTab] = useState('connected')

  return (
    <PageLayout
      title="Devices"
      subtitle="Connected sources and evaluated additions"
    >
      {/* Hero stats */}
      <DataValueSummary
        totalMechanisms={totalMechanisms}
        testableCount={testableCount}
        testedPct={testedPct}
        avgPersonalWeight={avgPersonalWeight}
        latentNodeCount={latentNodeCount}
        fittedEdgeCount={fittedEdgeCount}
        className="mb-6"
      />

      {/* Internal tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} variant="underline">
        <TabList>
          <TabTrigger value="connected">Connected Devices</TabTrigger>
          <TabTrigger value="opportunities">Device Opportunities</TabTrigger>
          <TabTrigger value="coverage">Edge Coverage Map</TabTrigger>
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
            <MarginalValuePanel rankedCandidates={rankedCandidates} rankedCandidatesIT={rankedCandidatesIT} />
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
      </Tabs>
    </PageLayout>
  )
}
