import { useMemo } from 'react'
import edgeSummaryRaw from '@/data/dataValue/edgeSummaryRaw.json'
import {
  getAvailableColumns,
  getCurrentlyTestableEdges,
  rankCandidates,
  buildExistingSourceRoster,
  computeSummaryStats,
} from '@/data/dataValue/marginalValueEngine'
import { rankCandidatesIT } from '@/data/dataValue/informationTheoreticScoring'
import type { EdgeResult } from '@/data/dataValue/types'

export function useDataValue() {
  const edgeResults = edgeSummaryRaw as EdgeResult[]
  const availableColumns = useMemo(() => getAvailableColumns(), [])

  const { testable: testableEdges, untestable: untestableEdges } = useMemo(
    () => getCurrentlyTestableEdges(availableColumns),
    [availableColumns]
  )

  const rankedCandidates = useMemo(
    () => rankCandidates(availableColumns, edgeResults),
    [availableColumns, edgeResults]
  )

  /** Information-theoretic scoring (KL/EIG-based, replaces heuristic for ranking) */
  const rankedCandidatesIT = useMemo(
    () => rankCandidatesIT(edgeResults),
    [edgeResults]
  )

  const existingSources = useMemo(
    () => buildExistingSourceRoster(edgeResults),
    [edgeResults]
  )

  const summary = useMemo(
    () => computeSummaryStats(edgeResults),
    [edgeResults]
  )

  return {
    edgeResults,
    existingSources,
    rankedCandidates,
    rankedCandidatesIT,
    testableEdges,
    untestableEdges,
    ...summary,
  }
}
