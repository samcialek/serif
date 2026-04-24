/**
 * InsightsV2View — experimental fork of /insights at /insights-v2.
 *
 * Reframes from "list of edge rows" to "card per outcome." Each
 * card shows the actions that move that outcome, ranked by absolute
 * Cohen's d. Goal: give the user a fast, comparable read on which
 * input matters how much for which output, with the full Bayesian
 * detail one click away.
 *
 * v1 (this commit): outcome cards + ranked action rows + slope-bar
 * + Cohen's d + native-units. Phase 3 will add per-edge expanded
 * detail (curve shape, posterior bell, conditional-on chips).
 *
 * Default outcome list = OBJECTIVE_ORON (the same 9 outcomes Twin /
 * Protocols score against), so the demo story stays coherent across
 * tabs.
 */

import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Loader2, Users } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, DataModeToggle, MemberAvatar } from '@/components/common'
import { InsightOutcomeCard } from '@/components/portal/InsightOutcomeCard'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import { participantLoader } from '@/data/portal/participantLoader'
import { usePortalStore } from '@/stores/portalStore'
import { OBJECTIVE_ORON } from '@/utils/twinSem'
import type { InsightBayesian } from '@/data/portal/types'

export function InsightsV2View() {
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, persona } = useActiveParticipant()

  // If we landed on /insights-v2 cold (no activePid), seed pid=1 the
  // same way PortalView does so the demo always has Caspian loaded.
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

  const titleAccessory = (
    <MemberAvatar persona={persona} displayName={displayName} size="lg" />
  )
  const actions = <DataModeToggle />

  const grouped = useMemo(() => {
    if (!participant) return new Map<string, InsightBayesian[]>()
    // Filter to non-weak-default exposed edges so we're showing real
    // structural fits, not Layer 0 placeholders. Group by outcome.
    const map = new Map<string, InsightBayesian[]>()
    for (const edge of participant.effects_bayesian) {
      if (edge.prior_provenance === 'weak_default') continue
      if (edge.gate.tier === 'not_exposed') continue
      const list = map.get(edge.outcome) ?? []
      list.push(edge)
      map.set(edge.outcome, list)
    }
    return map
  }, [participant])

  // Order outcomes by OBJECTIVE_ORON priority, then any extras at the end.
  const orderedOutcomes = useMemo(() => {
    const objectiveKeys = OBJECTIVE_ORON.map((o) => o.outcome)
    const seen = new Set<string>()
    const out: string[] = []
    for (const k of objectiveKeys) {
      if (grouped.has(k) && !seen.has(k)) {
        out.push(k)
        seen.add(k)
      }
    }
    for (const k of grouped.keys()) {
      if (!seen.has(k)) out.push(k)
    }
    return out
  }, [grouped])

  if (activePid == null) {
    return (
      <PageLayout title="Insights v2" subtitle="Reframed insights — outcome-first.">
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
      <PageLayout
        title={`${displayName} — insights v2`}
        titleAccessory={titleAccessory}
        actions={actions}
      >
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout
        title={`${displayName} — insights v2`}
        titleAccessory={titleAccessory}
        actions={actions}
      >
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
    <PageLayout
      title={`${displayName} — insights v2`}
      titleAccessory={titleAccessory}
      actions={actions}
      subtitle="Each outcome card lists the actions that move it, ranked by standardized effect."
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-4"
      >
        {orderedOutcomes.length === 0 ? (
          <Card padding="md" className="text-center text-sm text-slate-500 py-8">
            No exposed edges for this participant yet.
          </Card>
        ) : (
          orderedOutcomes.map((outcome) => (
            <InsightOutcomeCard
              key={outcome}
              outcome={outcome}
              edges={grouped.get(outcome) ?? []}
              participant={participant}
            />
          ))
        )}
      </motion.div>
    </PageLayout>
  )
}

export default InsightsV2View
