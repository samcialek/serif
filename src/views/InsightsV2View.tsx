/**
 * InsightsV2View — experimental fork of /insights at /insights-v2.
 *
 * Reframes from "list of edge rows" to "card per outcome." Each
 * card shows the actions that move that outcome, ranked by absolute
 * Cohen's d (or the user's chosen sort).
 *
 * Phase summary:
 *   1+2: outcome cards, slope-bars, standardized d, native units (shipped)
 *   3:   per-row expanded panel — real curve + Bayesian breakdown +
 *        confounders + suggested move (shipped)
 *   4:   real-curve in-row preview with tangent (shipped)
 *   5:   sort + filter + horizon grouping (this commit)
 */

import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, DataModeToggle, MemberAvatar } from '@/components/common'
import { InsightOutcomeCard } from '@/components/portal/InsightOutcomeCard'
import { StorylinePanel } from '@/components/portal'
import { buildEternalStory } from '@/utils/storyline'
import {
  InsightsControls,
  useInsightsControls,
  type InsightControlsState,
} from '@/components/portal/InsightsControls'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import { participantLoader } from '@/data/portal/participantLoader'
import { usePortalStore } from '@/stores/portalStore'
import { OBJECTIVE_ORON } from '@/utils/twinSem'
import { cohensD } from '@/utils/insightStandardization'
import type { InsightBayesian, ParticipantPortal } from '@/data/portal/types'
import { buildEnvironmentalSyntheticEdges } from '@/data/scm/environmentalEdges'
import { buildPhase2SyntheticEdges } from '@/data/scm/syntheticEdgesV2'
import { useScopeStore } from '@/stores/scopeStore'
import { PainterlyPageHeader } from '@/components/common'
import {
  hasPersonalPosterior,
  isExploratoryPriorEdge,
} from '@/utils/edgeProvenance'

/** Coarse horizon band per outcome — drives the grouping headers
 * and the "horizon" sort. Quotidian = wearable-day signals (HRV,
 * sleep architecture). Monthly = weeks-to-month biomarker turnover
 * (cortisol, glucose, hsCRP). Long-term = season+ biology (lipids,
 * iron, hormones, body comp). */
type HorizonBand = 'quotidian' | 'monthly' | 'longterm'

const OUTCOME_HORIZON: Record<string, HorizonBand> = {
  hrv_daily: 'quotidian',
  resting_hr: 'monthly',
  sleep_quality: 'quotidian',
  sleep_efficiency: 'quotidian',
  deep_sleep: 'quotidian',
  rem_sleep: 'quotidian',
  sleep_onset_latency: 'quotidian',
  cortisol: 'monthly',
  glucose: 'monthly',
  insulin: 'monthly',
  hba1c: 'longterm',
  hscrp: 'monthly',
  apob: 'longterm',
  ldl: 'longterm',
  hdl: 'longterm',
  triglycerides: 'longterm',
  ferritin: 'longterm',
  hemoglobin: 'longterm',
  iron_total: 'longterm',
  zinc: 'longterm',
  testosterone: 'longterm',
  vo2_peak: 'longterm',
  body_fat_pct: 'longterm',
}

const HORIZON_BAND_ORDER: HorizonBand[] = ['quotidian', 'monthly', 'longterm']
const HORIZON_BAND_LABEL: Record<HorizonBand, string> = {
  quotidian: 'Quotidian — see results within days',
  monthly: 'Monthly — see results in weeks',
  longterm: 'Long-term — see results in months to seasons',
}

function bandFor(outcome: string): HorizonBand {
  return OUTCOME_HORIZON[outcome] ?? 'longterm'
}

/** Map the user's regime selection to the set of horizon bands it includes.
 *
 *   quotidian : only outcomes that respond on the day-scale — HRV, sleep
 *               architecture. Matches the Twin "quotidian" regime.
 *   longevity : biomarker + body-comp + hormone outcomes (monthly +
 *               long-term bands). Matches the Twin "longevity" regime.
 *   all       : everything. Escape hatch for power users. */
function bandsForRegime(
  regime: 'quotidian' | 'longevity' | 'all',
): Set<HorizonBand> {
  if (regime === 'quotidian') return new Set<HorizonBand>(['quotidian'])
  if (regime === 'longevity') return new Set<HorizonBand>(['monthly', 'longterm'])
  return new Set<HorizonBand>(HORIZON_BAND_ORDER)
}

function medianHorizon(edges: InsightBayesian[]): number {
  const days = edges.map((e) => e.horizon_days ?? 999).sort((a, b) => a - b)
  if (days.length === 0) return 999
  return days[Math.floor(days.length / 2)]
}

/** Apply regime + filters + sort per the user's controls. Returns a
 * flat list of outcomes with (optional) band headers within the
 * selected regime — for 'all' we keep the horizon sub-bands; for
 * 'quotidian' or 'longevity' the whole list is one regime so the
 * band header is redundant. */
function passesFilters(
  edge: InsightBayesian,
  participant: ParticipantPortal,
  controls: InsightControlsState,
  allowedBands: Set<HorizonBand>,
): boolean {
  if (!allowedBands.has(bandFor(edge.outcome))) return false
  if (!controls.includeWeakDefault && isExploratoryPriorEdge(edge)) return false
  if (!controls.includeNotExposed && edge.gate.tier === 'not_exposed') return false
  if (controls.personalOnly && edge.evidence_tier === 'cohort_level') return false
  if (controls.hideTrivial) {
    const d = cohensD(edge, participant)
    if (Math.abs(d) < 0.2) return false
  }
  return true
}

function buildOrdering(
  participant: ParticipantPortal,
  edges: InsightBayesian[],
  controls: InsightControlsState,
): { sections: Array<{ band: HorizonBand | null; outcomes: string[] }>; total: number } {
  const allowedBands = bandsForRegime(controls.regime)
  // 1. Group raw edges by outcome with regime + filters applied.
  const grouped = new Map<string, InsightBayesian[]>()
  for (const edge of edges) {
    if (!passesFilters(edge, participant, controls, allowedBands)) continue
    const list = grouped.get(edge.outcome) ?? []
    list.push(edge)
    grouped.set(edge.outcome, list)
  }

  for (const [outcome, list] of grouped) {
    if (list.length === 0) grouped.delete(outcome)
  }

  const outcomeKeys = Array.from(grouped.keys())
  outcomeKeys.sort((a, b) => {
    if (controls.sort === 'alpha') {
      const la = OUTCOME_DISPLAY_ORDER.indexOf(a)
      const lb = OUTCOME_DISPLAY_ORDER.indexOf(b)
      return (la === -1 ? 999 : la) - (lb === -1 ? 999 : lb)
    }
    if (controls.sort === 'horizon') {
      return medianHorizon(grouped.get(a) ?? []) - medianHorizon(grouped.get(b) ?? [])
    }
    const bestD = (out: string) =>
      Math.max(
        ...((grouped.get(out) ?? []).map((e) => Math.abs(cohensD(e, participant)))),
        0,
      )
    return bestD(b) - bestD(a)
  })

  // When the regime is 'all', keep horizon sub-bands as section headers
  // for readability. When a specific regime is chosen, one flat list
  // reads cleaner (no headers inside an already-scoped view).
  if (controls.regime !== 'all') {
    return {
      sections: [{ band: null, outcomes: outcomeKeys }],
      total: outcomeKeys.length,
    }
  }
  const sectioned: Record<HorizonBand, string[]> = {
    quotidian: [],
    monthly: [],
    longterm: [],
  }
  for (const out of outcomeKeys) {
    sectioned[bandFor(out)].push(out)
  }
  return {
    sections: HORIZON_BAND_ORDER.filter((b) => sectioned[b].length > 0).map((b) => ({
      band: b,
      outcomes: sectioned[b],
    })),
    total: outcomeKeys.length,
  }
}

const OUTCOME_DISPLAY_ORDER: string[] = [
  ...OBJECTIVE_ORON.map((o) => o.outcome),
]

export function InsightsV2View() {
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName } = useActiveParticipant()
  const [rawControls, setControls] = useInsightsControls()
  // Regime is now owned by the cross-tab scope store. Project it onto
  // the controls state so the rest of the page (filtering, ordering)
  // can keep reading it from one object.
  const scopeRegime = useScopeStore((s) => s.regime)
  const controls = useMemo(
    () => ({ ...rawControls, regime: scopeRegime }),
    [rawControls, scopeRegime],
  )

  useEffect(() => {
    let mounted = true
    participantLoader
      .loadManifest()
      .then(() => {
        if (mounted && activePid == null) setActivePid(1)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [activePid, setActivePid])

  // Hash-scroll: /insights#outcome-X lands after the participant + cards
  // render, so native anchor scrolling misses the target on cold-load.
  // Poll briefly for the element after mount, then smooth-scroll.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    if (!participant) return
    const targetId = hash.startsWith('#') ? hash.slice(1) : hash
    let tries = 0
    const maxTries = 30
    const tick = () => {
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      tries += 1
      if (tries < maxTries) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [hash, participant])

  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      <DataModeToggle />
    </div>
  )

  // All edges = participant's fitted/prior edges + literature-backed
  // prior rows. Prior rows are de-duped behind participant rows
  // so personal/cohort fits always win when the same action->outcome exists.
  const envEdges = useMemo(() => buildEnvironmentalSyntheticEdges(), [])
  const phase2Edges = useMemo(() => buildPhase2SyntheticEdges(), [])
  const allEdges = useMemo<InsightBayesian[]>(() => {
    if (!participant) return []
    const out = [...participant.effects_bayesian]
    const seen = new Set(out.map((edge) => `${edge.action}->${edge.outcome}`))
    for (const edge of [...phase2Edges, ...envEdges]) {
      const key = `${edge.action}->${edge.outcome}`
      if (seen.has(key)) continue
      out.push(edge)
      seen.add(key)
    }
    return out
  }, [participant, phase2Edges, envEdges])

  const ordering = useMemo(() => {
    if (!participant) return { sections: [], total: 0 }
    return buildOrdering(participant, allEdges, controls)
  }, [participant, allEdges, controls])

  const edgesByOutcome = useMemo(() => {
    if (!participant) return new Map<string, InsightBayesian[]>()
    const allowedBands = bandsForRegime(controls.regime)
    const map = new Map<string, InsightBayesian[]>()
    for (const edge of allEdges) {
      if (!passesFilters(edge, participant, controls, allowedBands)) continue
      const list = map.get(edge.outcome) ?? []
      list.push(edge)
      map.set(edge.outcome, list)
    }
    return map
  }, [participant, allEdges, controls])

  // Aggregate counts so the user can see what's in / out at a glance —
  // total inventory, what passes the active filter set, and how many
  // are personally significant. The summary updates live as the user
  // toggles filters.
  const counts = useMemo(() => {
    if (!participant) {
      return {
        total: 0, visible: 0, significant: 0, personal: 0,
        weakDefault: 0, notExposed: 0, environmental: 0,
      }
    }
    const allowedBands = bandsForRegime(controls.regime)
    let total = 0
    let visible = 0
    let significant = 0
    let personal = 0
    let weakDefault = 0
    let notExposed = 0
    let environmental = 0
    for (const edge of allEdges) {
      total += 1
      if (isExploratoryPriorEdge(edge)) weakDefault += 1
      if (edge.gate.tier === 'not_exposed') notExposed += 1
      // Treat env-driver actions as "environmental" — heat_index_c,
      // humidity_pct, uv_index, aqi, travel_load, daylight_hours, temp_c.
      if (
        edge.action === 'heat_index_c' ||
        edge.action === 'humidity_pct' ||
        edge.action === 'uv_index' ||
        edge.action === 'aqi' ||
        edge.action === 'travel_load' ||
        edge.action === 'daylight_hours' ||
        edge.action === 'temp_c'
      ) {
        environmental += 1
      }
      if (!passesFilters(edge, participant, controls, allowedBands)) continue
      visible += 1
      const d = cohensD(edge, participant)
      if (Math.abs(d) >= 0.2) significant += 1
      if (hasPersonalPosterior(edge)) personal += 1
    }
    return { total, visible, significant, personal, weakDefault, notExposed, environmental }
  }, [participant, allEdges, controls])

  if (activePid == null) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Outcome-first causal map — every tested edge."
          actions={headerActions}
        />
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Select a member
          </h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Pick a member to see their per-outcome insights.
          </p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Outcome-first causal map — every tested edge."
          actions={headerActions}
        />
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Outcome-first causal map — every tested edge."
          actions={headerActions}
        />
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6 text-rose-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">
            Failed to load
          </h3>
          <p className="text-sm text-slate-500 font-mono">{error.message}</p>
        </Card>
      </PageLayout>
    )
  }

  if (!participant) return null

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Each outcome card lists the actions that move it, ranked by standardized effect."
        actions={headerActions}
      />

      {/* Insights-specific controls strip (sort + filter pills + Show all) */}
      <div className="mb-3 px-3 py-2 rounded-xl border border-stone-200 bg-white/70 flex items-center gap-2 flex-wrap">
        <InsightsControls state={controls} onChange={setControls} />
      </div>
      {/* Long-term story — three sentences on the biggest leverage
           points across outcomes plus environmental context. */}
      <div className="mb-4">
        <StorylinePanel story={buildEternalStory(participant)} mode="eternal" />
      </div>

      {/* All-else-equal disclosure */}
      <div className="mb-3 px-3 py-2 rounded-md border border-indigo-200 bg-indigo-50/50 text-[11px] text-indigo-900 leading-snug">
        <span className="font-semibold">All else equal.</span> Each card
        shows the marginal effect of one action on one outcome, holding
        every other variable at your average. The full nonlinear,
        regime-aware joint model lives in <span className="font-semibold">Twin</span>;
        Insights is the simplified per-edge view.
      </div>

      {/* Counts strip — shows the user the full edge inventory and how
           many pass the active filters. Helps answer "where's that edge?"
           without forcing them to open every card. */}
      <div className="mb-4 px-3 py-2 rounded-md border border-slate-200 bg-white/60 text-[11px] text-slate-700 flex items-center gap-3 flex-wrap">
        <span>
          <span className="font-semibold tabular-nums">{counts.visible}</span>
          <span className="text-slate-500"> / {counts.total} edges visible</span>
        </span>
        <span className="text-slate-300">·</span>
        <span>
          <span className="font-semibold tabular-nums text-emerald-700">{counts.significant}</span>
          <span className="text-slate-500"> significant <span className="font-mono">(|d|≥0.2)</span></span>
        </span>
        <span className="text-slate-300">·</span>
        <span>
          <span className="font-semibold tabular-nums text-indigo-700">{counts.personal}</span>
          <span className="text-slate-500"> with personal posterior</span>
        </span>
        <span className="text-slate-300">·</span>
        <span className="text-slate-500 tabular-nums">
          {counts.weakDefault} weak-default · {counts.notExposed} not exposed · {counts.environmental} environmental
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
            No insights match your current filters. Try toggling on
            "weak priors", "not exposed", or switching the regime to
            "All".
          </Card>
        ) : (
          ordering.sections.map((section, i) => (
            <section key={section.band ?? `flat-${i}`} className="space-y-3">
              {section.band && (
                <div className="flex items-baseline gap-3 px-1">
                  <h2 className="text-[11px] uppercase tracking-wider font-bold text-slate-700">
                    {HORIZON_BAND_LABEL[section.band].split(' — ')[0]}
                  </h2>
                  <span className="text-[10px] text-slate-500">
                    {HORIZON_BAND_LABEL[section.band].split(' — ')[1]}
                  </span>
                </div>
              )}
              {section.outcomes.map((outcome) => (
                <InsightOutcomeCard
                  key={outcome}
                  outcome={outcome}
                  edges={edgesByOutcome.get(outcome) ?? []}
                  participant={participant}
                  showEnvironmental={controls.showEnvironmental}
                />
              ))}
            </section>
          ))
        )}
      </motion.div>
    </PageLayout>
  )
}

export default InsightsV2View
