/**
 * ExplorationV2View — outcome-first fork of /exploration at
 * /exploration-v2.
 *
 * Phase 1: reframes the flat list into outcome cards ranked by
 * expected learned magnitude (prior_cohens_d × expected_narrow).
 * Uses heuristic defaults when the backend hasn't emitted the
 * Phase-2/3 fields. Mirrors InsightsV2View's structure — same
 * PainterlyPageHeader, same regime scope from useScopeStore, same
 * horizon-band grouping — so the two tabs feel like siblings.
 *
 * Phase 2 will wire per-row expanded detail (prior curve +
 * ExperimentPrescription). Phase 3 replaces heuristics with backend
 * conjugate-update math. Phase 4 adds the ActiveExperimentsBar +
 * Launch/Cancel wiring. Phase 6 renames this to ExplorationView and
 * retires the old flat-list view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { AlertCircle, Compass, FastForward, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, DataModeToggle, PainterlyPageHeader } from '@/components/common'
import { ExplorationOutcomeCard } from '@/components/portal/ExplorationOutcomeCard'
import { ActiveExperimentsBar } from '@/components/portal/ActiveExperimentsBar'
import {
  ExplorationControls,
  useExplorationControls,
} from '@/components/portal/ExplorationControls'
import { OUTCOME_LABELS } from '@/components/portal/InsightRow'
import { useParticipant } from '@/hooks/useParticipant'
import { usePortalStore } from '@/stores/portalStore'
import { useScopeStore } from '@/stores/scopeStore'
import { useExplorationStore, progressFor } from '@/stores/explorationStore'
import type { ParticipantPortal } from '@/data/portal/types'
import {
  bandsForRegime,
  EXPLORATION_BAND_LABEL,
  EXPLORATION_BAND_ORDER,
  enrichExplorationEdge,
  rankExplorations,
  type ExplorationEdge,
  type ExplorationHorizonBand,
} from '@/utils/exploration'

function outcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome.replace(/_/g, ' ')
}

interface Section {
  band: ExplorationHorizonBand | null
  /** Outcomes in display order for this band. */
  outcomes: string[]
}

function buildOrdering(
  participant: ParticipantPortal,
  controls: ReturnType<typeof useExplorationControls>[0],
  regime: 'quotidian' | 'longevity' | 'all',
  launched: Record<string, unknown>,
): { sections: Section[]; total: number; edgesByOutcome: Map<string, ExplorationEdge[]> } {
  const allowed = bandsForRegime(regime)
  const recs = participant.exploration_recommendations ?? []
  const enriched = recs.map((r) => enrichExplorationEdge(r, participant))

  // Filter
  const filtered = enriched.filter((e) => {
    if (!allowed.has(e.computed.band)) return false
    if (controls.hideInfeasible && e.positivity_flag !== 'ok') return false
    if (controls.runningOnly) {
      const key = `${e.action}::${e.outcome}`
      if (!(key in launched)) return false
    }
    return true
  })

  // Group by outcome + rank within each
  const grouped = new Map<string, ExplorationEdge[]>()
  for (const e of filtered) {
    const list = grouped.get(e.outcome) ?? []
    list.push(e)
    grouped.set(e.outcome, list)
  }
  for (const [outcome, list] of grouped) {
    grouped.set(outcome, rankExplorations(list, controls.sort))
  }

  const outcomeKeys = Array.from(grouped.keys())
  // Sort outcomes by best infoGain in descending order
  outcomeKeys.sort((a, b) => {
    const ba = Math.max(...(grouped.get(a) ?? []).map((e) => e.computed.infoGain), 0)
    const bb = Math.max(...(grouped.get(b) ?? []).map((e) => e.computed.infoGain), 0)
    return bb - ba
  })

  // Section by band — only when regime === 'all'
  if (regime !== 'all') {
    return {
      sections: [{ band: null, outcomes: outcomeKeys }],
      total: outcomeKeys.length,
      edgesByOutcome: grouped,
    }
  }
  const sectioned: Record<ExplorationHorizonBand, string[]> = {
    quotidian: [],
    monthly: [],
    longterm: [],
  }
  for (const out of outcomeKeys) {
    const band = (grouped.get(out) ?? [])[0]?.computed.band ?? 'longterm'
    sectioned[band].push(out)
  }
  const sections: Section[] = EXPLORATION_BAND_ORDER.filter(
    (b) => sectioned[b].length > 0,
  ).map((b) => ({ band: b, outcomes: sectioned[b] }))
  return { sections, total: outcomeKeys.length, edgesByOutcome: grouped }
}

export function ExplorationV2View() {
  const activePid = usePortalStore((s) => s.activePid)
  const { participant, isLoading, error } = useParticipant()
  const [controls, setControls] = useExplorationControls()
  const regime = useScopeStore((s) => s.regime)
  const launched = useExplorationStore((s) => s.launched)
  const advanceMockTimeAll = useExplorationStore((s) => s.advanceMockTimeAll)

  // One expanded row at a time across the whole tab — lets the
  // ActiveExperimentsBar drive row focus when a chip is clicked.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const focusExperimentRow = useCallback((key: string) => {
    setExpandedKey(key)
    // Scroll after the expansion paints so the row is in the layout.
    requestAnimationFrame(() => {
      const el = document.getElementById(`exploration-row-${key}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  // Deep-link handling: /exploration-v2?edge=action::outcome auto-opens
  // the matching row when someone clicks "Run an experiment →" in
  // Insights. Clears the param after focus so a page reload doesn't
  // keep re-focusing the same row.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (!participant) return
    const edgeParam = searchParams.get('edge')
    if (!edgeParam) return
    focusExperimentRow(edgeParam)
    const next = new URLSearchParams(searchParams)
    next.delete('edge')
    setSearchParams(next, { replace: true })
  }, [participant, searchParams, setSearchParams, focusExperimentRow])

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      <DataModeToggle />
      <ExplorationControls state={controls} onChange={setControls} />
    </div>
  )

  const ordering = useMemo(() => {
    if (!participant) {
      return {
        sections: [] as Section[],
        total: 0,
        edgesByOutcome: new Map<string, ExplorationEdge[]>(),
      }
    }
    return buildOrdering(participant, controls, regime, launched)
  }, [participant, controls, regime, launched])

  /** Enriched edges for all recs — used by the ActiveExperimentsBar
   *  regardless of filters, so launched experiments remain visible even
   *  when filters would otherwise hide them. */
  const allEnrichedEdges = useMemo<ExplorationEdge[]>(() => {
    if (!participant) return []
    return (participant.exploration_recommendations ?? []).map((r) =>
      enrichExplorationEdge(r, participant),
    )
  }, [participant])

  // Running count for the subtitle
  const runningCount = useMemo(() => {
    let n = 0
    for (const entry of Object.values(launched)) {
      const p = progressFor(entry as { started_at: number; duration_days: number; mock_progress_day: number })
      if (p?.isRunning) n += 1
    }
    return n
  }, [launched])

  const subtitle =
    runningCount > 0
      ? `Experiments that could personalize the engine · ${runningCount} running`
      : 'Experiments that could personalize the engine'

  if (activePid == null) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader subtitle={subtitle} actions={headerActions} hideHorizon />
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Select a member
          </h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Pick a member from the sidebar to review their exploration queue.
          </p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader subtitle={subtitle} actions={headerActions} hideHorizon />
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading exploration queue…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error || !participant) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader subtitle={subtitle} actions={headerActions} hideHorizon />
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <AlertCircle className="w-6 h-6 text-rose-500 mb-3" />
          <div className="font-semibold text-slate-800 mb-1">
            Couldn’t load this member
          </div>
          <div className="text-sm text-slate-500">
            {error?.message ?? 'Unknown error'}
          </div>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader subtitle={subtitle} actions={headerActions} hideHorizon />

      {/* Active experiments strip — only renders when the coach has
           launched something. Chips jump-scroll to + open the matching
           row. */}
      <ActiveExperimentsBar
        edges={allEnrichedEdges}
        onChipClick={focusExperimentRow}
      />

      {/* Framing blurb */}
      <div className="mb-4 px-3 py-2 rounded-md border border-indigo-200 bg-indigo-50/50 text-[11px] text-indigo-900 leading-snug">
        <span className="font-semibold flex items-center gap-1">
          <Compass className="w-3 h-3" aria-hidden />
          Exploration, not exploitation.
        </span>
        <span>
          Each row is an experiment the engine doesn't have enough personal
          data to answer. Bar shows how much uncertainty would collapse if
          the experiment succeeded. Click Launch on any ready row to see
          it appear in the Active strip above.
        </span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-6"
      >
        {ordering.total === 0 ? (
          <Card padding="md" className="text-center text-sm text-slate-500 py-8">
            No experiments match your current filters. Loosen "Ready only"
            or "Running only" to see the rest of the queue.
          </Card>
        ) : (
          ordering.sections.map((section, i) => (
            <section key={section.band ?? `flat-${i}`} className="space-y-3">
              {section.band && (
                <div className="flex items-baseline gap-3 px-1">
                  <h2 className="text-[11px] uppercase tracking-wider font-bold text-slate-700">
                    {EXPLORATION_BAND_LABEL[section.band].title}
                  </h2>
                  <span className="text-[10px] text-slate-500">
                    {EXPLORATION_BAND_LABEL[section.band].blurb}
                  </span>
                </div>
              )}
              {section.outcomes.map((outcome) => (
                <ExplorationOutcomeCard
                  key={outcome}
                  outcome={outcome}
                  outcomeLabel={outcomeLabel(outcome)}
                  edges={ordering.edgesByOutcome.get(outcome) ?? []}
                  participant={participant}
                  expandedKey={expandedKey}
                  onExpand={setExpandedKey}
                />
              ))}
            </section>
          ))
        )}
      </motion.div>

      {/* Dev-only: advance mock progress across all running experiments
           so demos can step through "14 days from now" without waiting. */}
      {import.meta.env.DEV && Object.keys(launched).length > 0 && (
        <div className="mt-6 px-3 py-2 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            Dev · advance mock time
          </span>
          {[3, 7, 14].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => advanceMockTimeAll(d)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <FastForward className="w-3 h-3" aria-hidden />
              +{d} days (all)
            </button>
          ))}
        </div>
      )}
    </PageLayout>
  )
}

export default ExplorationV2View
