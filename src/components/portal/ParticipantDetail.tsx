import { useMemo } from 'react'
import { User, Users, AlertCircle, Loader2, Microscope, Activity } from 'lucide-react'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import { InsightRow } from './InsightRow'
import { ProtocolCard } from './ProtocolCard'
import { TierFilterChips } from './TierFilterChips'
import {
  formatActionValue,
  isBelowMinimumDose,
  isBelowMinimumOutcomeEffect,
  isProjectionOutsidePhysiologicalBounds,
} from '@/utils/rounding'
import type {
  ExplorationRecommendation,
  GateTier,
  InsightBayesian,
  Pathway,
} from '@/data/portal/types'

const ACTION_ORDER = [
  'bedtime',
  'sleep_duration',
  'running_volume',
  'training_load',
  'training_volume',
  'zone2_volume',
  'active_energy',
  'steps',
  'dietary_protein',
  'dietary_energy',
]

function actionRank(a: string): number {
  const i = ACTION_ORDER.indexOf(a)
  return i === -1 ? ACTION_ORDER.length : i
}

const TIER_RANK: Record<GateTier, number> = {
  recommended: 0,
  possible: 1,
  not_exposed: 2,
}

const PATHWAY_TITLES: Record<Pathway, string> = {
  wearable: 'Daily signals (wearable)',
  biomarker: 'Lab signals (biomarker)',
}
const PATHWAY_ORDER: Pathway[] = ['wearable', 'biomarker']

function groupByPathway(
  insights: InsightBayesian[],
): Array<{ pathway: Pathway; items: InsightBayesian[] }> {
  const groups = new Map<Pathway, InsightBayesian[]>()
  for (const ins of insights) {
    const p: Pathway = ins.pathway ?? 'wearable'
    const arr = groups.get(p) ?? []
    arr.push(ins)
    groups.set(p, arr)
  }
  return PATHWAY_ORDER
    .filter((p) => (groups.get(p) ?? []).length > 0)
    .map((p) => ({ pathway: p, items: groups.get(p)! }))
}

export function ParticipantDetail() {
  const activePid = usePortalStore((s) => s.activePid)
  const tierFilter = usePortalStore((s) => s.tierFilter)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, kind } = useActiveParticipant()

  const insights = useMemo(() => {
    if (!participant) return []
    // Suppress actionable insights with no user-meaningful display:
    //   - dose rounds below the minimum action increment ("shift bedtime
    //     12 seconds"), OR
    //   - scaled effect rounds below the outcome increment ("0 ms HRV
    //     improvement"), so baseline → projection would read "49 → ~49", OR
    //   - projection falls outside plausible physiology (e.g., hemoglobin
    //     14.55 → 22.81 when the implied dose is 10× the participant's
    //     current running volume). These derive from posteriors scaled by
    //     doses the user can't actually reach.
    // Not_exposed insights are always retained (the tier itself is the
    // signal that no action is recommended).
    const baselines = participant.outcome_baselines ?? {}
    const afterMin = participant.effects_bayesian.filter((i) => {
      if (i.gate.tier !== 'recommended' && i.gate.tier !== 'possible') return true
      if (isBelowMinimumDose(i.dose_multiplier * i.nominal_step, i.action)) return false
      if (isBelowMinimumOutcomeEffect(i.scaled_effect, i.outcome)) return false
      if (
        isProjectionOutsidePhysiologicalBounds(
          baselines[i.outcome],
          i.scaled_effect,
          i.outcome,
          participant.is_female,
        )
      )
        return false
      return true
    })
    const filtered =
      tierFilter.size === 0
        ? afterMin
        : afterMin.filter((i) => tierFilter.has(i.gate.tier))
    return [...filtered].sort((a, b) => {
      const t = TIER_RANK[a.gate.tier] - TIER_RANK[b.gate.tier]
      if (t !== 0) return t
      return actionRank(a.action) - actionRank(b.action)
    })
  }, [participant, tierFilter])

  const protocolsByAction = useMemo(() => {
    if (!participant) return [] as { action: string; protocols: typeof participant.protocols }[]
    const groups = new Map<string, typeof participant.protocols>()
    for (const p of participant.protocols) {
      const arr = groups.get(p.action) ?? []
      arr.push(p)
      groups.set(p.action, arr)
    }
    return Array.from(groups.entries())
      .map(([action, protocols]) => ({
        action,
        protocols: [...protocols].sort((a, b) => a.option_index - b.option_index),
      }))
      .sort((a, b) => actionRank(a.action) - actionRank(b.action))
  }, [participant])

  if (activePid == null) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
          <Users className="w-6 h-6 text-primary-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 mb-1">Select a participant</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Pick a pid from the browser to view their insights and synthesized protocols.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mb-2" />
        <span className="text-sm">Loading {displayName}…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6 text-rose-500" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 mb-1">Failed to load</h3>
        <p className="text-sm text-slate-500 font-mono">{error.message}</p>
      </div>
    )
  }

  if (!participant) return null

  const {
    cohort,
    age,
    is_female,
    tier_counts,
    exposed_count,
    protocols,
    current_values,
    behavioral_sds,
    outcome_baselines,
  } = participant

  return (
    <div className="space-y-6">
      {/* Participant header */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
              <User className="w-6 h-6 text-primary-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {displayName}
              </h2>
              <p className="text-sm text-slate-500">
                {kind === 'named' ? 'Named persona · ' : ''}
                {cohort}{age != null ? ` · ${age} yrs` : ''}{is_female ? ' · F' : ' · M'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <SummaryStat
              label="Active"
              value={exposed_count}
              hint="Recommendations with enough evidence to act on"
            />
            <SummaryStat label="Plans" value={protocols.length} hint="Concrete action plans" />
            <SummaryStat
              label="Links"
              value={participant.effects_bayesian.length}
              hint="Action-to-outcome links the engine tracks"
            />
          </div>
        </div>
      </div>

      {/* Tier filter chips */}
      <TierFilterChips counts={tier_counts} />

      {/* Protocols */}
      {protocolsByAction.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            Protocols <span className="text-slate-400 font-normal">({protocols.length})</span>
          </h3>
          <div className="space-y-4">
            {protocolsByAction.map(({ action, protocols: ps }) => (
              <div key={action}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {action.replace(/_/g, ' ')}
                  </div>
                  {current_values[action] != null && (
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      current ~ {formatActionValue(current_values[action], action)}
                      {behavioral_sds[action] != null && ` (σ ${behavioral_sds[action].toFixed(2)})`}
                    </span>
                  )}
                </div>
                <div className={ps.length > 1 ? 'grid md:grid-cols-2 gap-3' : ''}>
                  {ps.map((p) => (
                    <ProtocolCard key={p.protocol_id} protocol={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data Worth Adding — exploration recommendations for not_exposed rows
          that could be rescued with more data (varying the action, or a second
          biomarker draw). */}
      {participant.exploration_recommendations &&
        participant.exploration_recommendations.length > 0 && (
          <ExplorationSection items={participant.exploration_recommendations} />
        )}

      {/* Insights — grouped by pathway */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Insights <span className="text-slate-400 font-normal">({insights.length})</span>
        </h3>
        {insights.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl">
            No insights match the current tier filter.
          </div>
        ) : (
          <div className="space-y-6">
            {groupByPathway(insights).map(({ pathway, items }) => (
              <div key={pathway}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {PATHWAY_TITLES[pathway]}
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.map((insight) => (
                    <InsightRow
                      key={`${insight.action}_${insight.outcome}`}
                      insight={insight}
                      currentValue={current_values[insight.action]}
                      outcomeBaseline={outcome_baselines?.[insight.outcome]}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryStat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col items-end" title={hint}>
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-lg font-semibold text-slate-800 tabular-nums">{value}</span>
    </div>
  )
}

const EXPLORATION_KIND_LABEL: Record<ExplorationRecommendation['kind'], string> = {
  vary_action: 'Vary this action',
  repeat_measurement: 'Repeat this biomarker',
}

const EXPLORATION_VISIBLE_LIMIT = 8

function ExplorationSection({ items }: { items: ExplorationRecommendation[] }) {
  // Sort: vary_action first (actionable by the participant), then by prior
  // contraction descending — stronger prior signal = better payoff from
  // collecting more data.
  const sorted = [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'vary_action' ? -1 : 1
    return b.prior_contraction - a.prior_contraction
  })
  const visible = sorted.slice(0, EXPLORATION_VISIBLE_LIMIT)
  const hiddenCount = sorted.length - visible.length
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">
        Data worth adding{' '}
        <span className="text-slate-400 font-normal">({sorted.length})</span>
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        These action–outcome links fell below the evidence threshold, but the
        gap is one the participant can close. Not advice — just where more
        data would unlock insight.
      </p>
      <div className="space-y-2">
        {visible.map((rec) => {
          const Icon = rec.kind === 'repeat_measurement' ? Microscope : Activity
          return (
            <div
              key={`${rec.action}_${rec.outcome}_${rec.kind}`}
              className="p-3 bg-sky-50/50 border border-sky-100 rounded-lg flex gap-3"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-sky-200 flex items-center justify-center">
                <Icon className="w-4 h-4 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-700">
                    {rec.action.replace(/_/g, ' ')} → {rec.outcome.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-sky-700">
                    {EXPLORATION_KIND_LABEL[rec.kind]}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {rec.rationale}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          +{hiddenCount} more exploration candidates hidden. Showing top{' '}
          {EXPLORATION_VISIBLE_LIMIT} by signal strength.
        </p>
      )}
    </section>
  )
}

export default ParticipantDetail
