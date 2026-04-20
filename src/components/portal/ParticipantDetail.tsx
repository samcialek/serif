import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  User,
  Users,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  List,
  Rows,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { usePortalStore } from '@/stores/portalStore'
import { participantLoader } from '@/data/portal/participantLoader'
import { InsightRow, feasibleEffectMagnitude } from './InsightRow'
import { TierFilterChips } from './TierFilterChips'
import { ContextStrip } from './ContextStrip'
import {
  isBelowMinimumDose,
  isBelowMinimumOutcomeEffect,
  isProjectionOutsidePhysiologicalBounds,
  outcomeIncrement,
} from '@/utils/rounding'
import { insightTierCounts, insightTierFor } from '@/utils/insightTier'
import type {
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

// Load actions are rolling aggregates of behaviour, not directly
// prescribable. The Insights tab surfaces their downstream effects in a
// separate "Context drivers" section so the user doesn't confuse "what
// can I do?" (behavioural) with "what is my state doing to me?" (load).
const LOAD_ACTIONS = new Set(['acwr', 'sleep_debt', 'travel_load'])

function isLoadInsight(i: InsightBayesian): boolean {
  return LOAD_ACTIONS.has(i.action)
}

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
  const setActivePid = usePortalStore((s) => s.setActivePid)
  const tierFilter = usePortalStore((s) => s.tierFilter)
  const { participant, isLoading, error } = useParticipant()
  const { displayName, kind, persona } = useActiveParticipant()
  const [density, setDensity] = useState<'compact' | 'detailed'>('detailed')
  const [totalParticipants, setTotalParticipants] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    participantLoader
      .loadManifest()
      .then((m) => {
        if (!cancelled) setTotalParticipants(m.n_participants)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const goto = (offset: number) => {
    if (activePid == null || totalParticipants == null) return
    const next = activePid + offset
    if (next < 1 || next > totalParticipants) return
    setActivePid(next)
  }
  const canPrev = activePid != null && activePid > 1
  const canNext =
    activePid != null && totalParticipants != null && activePid < totalParticipants

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
    // Zero-effect rows are hidden everywhere (any tier): if the
    // feasible-shift effect we render rounds to 0 in the outcome's
    // native units, the row tells the user nothing actionable.
    const baselines = participant.outcome_baselines ?? {}
    // Actions must be directly mutable behaviors. training_load (TRIMP) is
    // a derived metric, not a user-controllable action — hide those rows.
    const NON_ACTIONABLE = new Set(['training_load'])
    const afterMin = participant.effects_bayesian.filter((i) => {
      if (NON_ACTIONABLE.has(i.action)) return false
      // Hide edges whose feasible-shift effect rounds below the outcome's
      // display increment (e.g. 0.013 bpm resting HR). The user sees "0" —
      // there is no story to tell.
      const feasEff = feasibleEffectMagnitude(i.posterior.mean, i.action, i.nominal_step)
      if (feasEff < outcomeIncrement(i.outcome)) return false
      // Extra unreachable-protocol gating only applies when the *published*
      // protocol-side gate already elevated this edge. Insights-tab sign
      // promotion (below) should not trigger dose/projection filters that
      // depend on today's operating point.
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
        : afterMin.filter((i) => tierFilter.has(insightTierFor(i)))
    return [...filtered].sort((a, b) => {
      const t = TIER_RANK[insightTierFor(a)] - TIER_RANK[insightTierFor(b)]
      if (t !== 0) return t
      return actionRank(a.action) - actionRank(b.action)
    })
  }, [participant, tierFilter])

  // Counts the chip row displays. Derived from the same sign-probability
  // rule used for filtering, not the published protocol-side gate.tier.
  const derivedTierCounts = useMemo(
    () => (participant ? insightTierCounts(participant.effects_bayesian) : undefined),
    [participant],
  )

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
    exposed_count,
    current_values,
    outcome_baselines,
  } = participant

  return (
    <div className="space-y-6">
      {/* Participant header */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {persona?.avatar ? (
              <img
                src={persona.avatar}
                alt={persona.name}
                className="w-12 h-12 rounded-xl object-cover border border-primary-100"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-100 flex items-center justify-center">
                <User className="w-6 h-6 text-primary-500" />
              </div>
            )}
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
            <SummaryStat
              label="Links"
              value={participant.effects_bayesian.length}
              hint="Action-to-outcome links the engine tracks"
            />
            <div className="flex items-center gap-1 pl-3 border-l border-slate-200">
              <button
                onClick={() => goto(-1)}
                disabled={!canPrev}
                title="Previous member"
                className={cn(
                  'p-1 rounded-md border',
                  canPrev
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed',
                )}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => goto(1)}
                disabled={!canNext}
                title="Next member"
                className={cn(
                  'p-1 rounded-md border',
                  canNext
                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    : 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed',
                )}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <Link
                to="/members"
                className="ml-1 text-[11px] font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded-md hover:bg-primary-50 transition-colors"
              >
                Switch
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Today's context (rolling loads) */}
      {participant.loads_today && (
        <ContextStrip loads={participant.loads_today} />
      )}

      {/* Tier filter chips */}
      <TierFilterChips counts={derivedTierCounts} />

      {/* Insights — behavioural actions first, then load-driven context */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Insights <span className="text-slate-400 font-normal">({insights.length})</span>
          </h3>
          <DensityToggle density={density} onChange={setDensity} />
        </div>
        {insights.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl">
            No insights match the current tier filter.
          </div>
        ) : (
          <InsightSections insights={insights} density={density} />
        )}
      </section>
    </div>
  )
}

// Top-level split between behavioural and load-driven insights, each of
// which still gets the wearable/biomarker sub-grouping the pathway header
// provides. Behavioural comes first because it's the actionable side;
// load-driven sits below as context — "here's what your rolling state is
// doing to you" — and is visually softer.
function InsightSections({
  insights,
  density,
}: {
  insights: InsightBayesian[]
  density: 'compact' | 'detailed'
}) {
  const behavioural = insights.filter((i) => !isLoadInsight(i))
  const loadDriven = insights.filter(isLoadInsight)

  return (
    <div className="space-y-8">
      {behavioural.length > 0 && (
        <InsightGroup
          title="Behavioural actions"
          hint="What you can do — direct levers"
          items={behavioural}
          density={density}
        />
      )}
      {loadDriven.length > 0 && (
        <InsightGroup
          title="Context drivers"
          hint="How today's rolling loads move your outcomes"
          items={loadDriven}
          density={density}
          muted
        />
      )}
    </div>
  )
}

function InsightGroup({
  title,
  hint,
  items,
  density,
  muted = false,
}: {
  title: string
  hint: string
  items: InsightBayesian[]
  density: 'compact' | 'detailed'
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        muted ? 'border-slate-100 bg-slate-50/40' : 'border-transparent bg-transparent p-0',
      )}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {title}
          </h4>
          <span className="text-[10px] text-slate-400 tabular-nums">{items.length}</span>
        </div>
        <span className="text-[10px] text-slate-400">{hint}</span>
      </div>
      <div className="space-y-6">
        {groupByPathway(items).map(({ pathway, items: pathItems }) => (
          <div key={pathway}>
            <div className="flex items-center gap-2 mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {PATHWAY_TITLES[pathway]}
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">
                {pathItems.length}
              </span>
            </div>
            <div className={density === 'compact' ? 'space-y-1' : 'space-y-3'}>
              {pathItems.map((insight) => (
                <InsightRow
                  key={`${insight.action}_${insight.outcome}`}
                  insight={insight}
                  density={density}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DensityToggle({
  density,
  onChange,
}: {
  density: 'compact' | 'detailed'
  onChange: (d: 'compact' | 'detailed') => void
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md border border-slate-200">
      <button
        onClick={() => onChange('compact')}
        title="Compact view"
        className={cn(
          'flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors',
          density === 'compact'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700',
        )}
      >
        <List className="w-3 h-3" />
        Compact
      </button>
      <button
        onClick={() => onChange('detailed')}
        title="Detailed view"
        className={cn(
          'flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors',
          density === 'detailed'
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700',
        )}
      >
        <Rows className="w-3 h-3" />
        Detailed
      </button>
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

export default ParticipantDetail
