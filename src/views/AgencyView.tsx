import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  CalendarRange,
  CloudSun,
  Eye,
  Gauge,
  Loader2,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, PainterlyPageHeader } from '@/components/common'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import {
  caspianAgencyGraph,
  compactEvidenceLabel,
  explainAgencyRecommendation,
  scoreAgencyGraph,
  type AgencyObservation,
  type AgencyPlan,
  type AgencyRecommendation,
  type AgencyRecommendationGroup,
  type AgencyViewHorizon,
} from '@/data/agency'
import {
  ACCENT_BABY_BLUE,
  ACCENT_GOLD,
  ACCENT_SAGE,
  ACCENT_TERRACOTTA,
  BG_CARD,
  BG_CARD_WARM,
  BG_TRACK,
  LINE,
  TEXT_BODY,
  TEXT_FAINT,
  TEXT_INK,
  TEXT_MUTED,
} from '@/styles/painterlyTokens'

const GROUP_META: Record<
  AgencyRecommendationGroup,
  { label: string; icon: typeof Target; color: string; bg: string }
> = {
  do_today: {
    label: 'Do today',
    icon: Target,
    color: ACCENT_SAGE,
    bg: '#f2f7f4',
  },
  steer_this_week: {
    label: 'Steer this week',
    icon: Gauge,
    color: ACCENT_BABY_BLUE,
    bg: '#eef7fb',
  },
  respect_today: {
    label: 'Respect today',
    icon: CloudSun,
    color: ACCENT_GOLD,
    bg: '#fff8e8',
  },
  observe_recheck: {
    label: 'Observe / recheck',
    icon: Eye,
    color: ACCENT_TERRACOTTA,
    bg: '#fff1ec',
  },
}

const HORIZON_LABEL: Record<AgencyViewHorizon, string> = {
  today: 'Today',
  week: 'Week',
  quarter: 'Quarter',
}

export function AgencyView() {
  const { participant, isLoading } = useParticipant()
  const { pid, displayName } = useActiveParticipant()
  const [horizon, setHorizon] = useState<AgencyViewHorizon>('today')

  const plan = useMemo<AgencyPlan | null>(() => {
    if (!participant || participant.pid !== caspianAgencyGraph.participantPid) {
      return null
    }
    return scoreAgencyGraph(caspianAgencyGraph, {
      participant,
      options: { horizon, maxPerGroup: 4 },
    })
  }, [participant, horizon])

  const actions = (
    <div
      className="inline-flex items-center rounded-full p-0.5"
      style={{ border: `1px solid ${LINE}`, background: BG_CARD_WARM }}
    >
      {(Object.keys(HORIZON_LABEL) as AgencyViewHorizon[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setHorizon(key)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
          style={{
            background: horizon === key ? BG_CARD : 'transparent',
            color: horizon === key ? TEXT_INK : TEXT_MUTED,
            fontFamily: 'Inter, sans-serif',
            fontSize: 11,
            boxShadow:
              horizon === key ? '0 1px 5px rgba(28,25,23,0.08)' : 'none',
          }}
        >
          <CalendarRange className="w-3 h-3" />
          {HORIZON_LABEL[key]}
        </button>
      ))}
    </div>
  )

  if (pid == null) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          title="Agency"
          subtitle="Decision layer for what can be done, steered, respected, and watched."
          hideHorizon
          actions={actions}
        />
        <Card padding="md" className="py-12 text-center">
          <p className="text-sm text-slate-500">Select a member.</p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Decision layer for what can be done, steered, respected, and watched."
          hideHorizon
          actions={actions}
        />
        <Card padding="md" className="flex flex-col items-center py-12 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading Agency for {displayName}...</span>
        </Card>
      </PageLayout>
    )
  }

  if (!participant || !plan) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Decision layer for what can be done, steered, respected, and watched."
          hideHorizon
          actions={actions}
        />
        <div
          className="rounded-2xl px-5 py-5"
          style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
        >
          <h2
            className="text-base font-medium mb-1"
            style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
          >
            Caspian's agency graph is the first curated graph.
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: TEXT_BODY, fontFamily: 'Inter, sans-serif' }}
          >
            The current member is {displayName}. This surface is ready to extend
            once their own agency graph is curated.
          </p>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Decision layer for what can be done, steered, respected, and watched."
        hideHorizon
        actions={actions}
      />

      <AgencySummary plan={plan} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RecommendationLane
          group="do_today"
          recommendations={plan.byGroup.do_today}
          plan={plan}
        />
        <RecommendationLane
          group="steer_this_week"
          recommendations={plan.byGroup.steer_this_week}
          plan={plan}
        />
        <RecommendationLane
          group="respect_today"
          recommendations={plan.byGroup.respect_today}
          plan={plan}
        />
        <ObservationLane observations={plan.observations} />
      </div>
    </PageLayout>
  )
}

function AgencySummary({ plan }: { plan: AgencyPlan }) {
  const stats = [
    { label: 'Nodes', value: plan.graph.nodes.length },
    { label: 'Edges', value: plan.graph.edges.length },
    { label: 'Top moves', value: plan.recommendations.length },
    { label: 'Watchlist', value: plan.observations.length },
  ]
  return (
    <div
      className="mb-5 rounded-2xl px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3"
      style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
    >
      {stats.map((stat) => (
        <div key={stat.label}>
          <div
            className="text-[10px] uppercase"
            style={{
              color: TEXT_FAINT,
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '0.06em',
            }}
          >
            {stat.label}
          </div>
          <div
            className="mt-1 text-xl font-medium tabular-nums"
            style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function RecommendationLane({
  group,
  recommendations,
  plan,
}: {
  group: AgencyRecommendationGroup
  recommendations: AgencyRecommendation[]
  plan: AgencyPlan
}) {
  const meta = GROUP_META[group]
  const Icon = meta.icon
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: meta.bg, color: meta.color }}
          >
            <Icon className="w-4 h-4" />
          </div>
          <h2
            className="text-sm font-medium"
            style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
          >
            {meta.label}
          </h2>
        </div>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: TEXT_FAINT, fontFamily: 'Inter, sans-serif' }}
        >
          {recommendations.length}
        </span>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec) => (
          <RecommendationCard key={rec.id} rec={rec} plan={plan} />
        ))}
      </div>
    </section>
  )
}

function RecommendationCard({
  rec,
  plan,
}: {
  rec: AgencyRecommendation
  plan: AgencyPlan
}) {
  const explanation = explainAgencyRecommendation(plan.graph, rec)
  const meta = GROUP_META[rec.group]
  return (
    <article
      className="rounded-xl p-3"
      style={{ background: BG_CARD_WARM, border: `1px solid ${LINE}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="text-sm font-medium leading-snug"
            style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
          >
            {rec.title}
          </h3>
          <div
            className="mt-1 flex items-center gap-1.5 text-[11px]"
            style={{ color: TEXT_MUTED, fontFamily: 'Inter, sans-serif' }}
          >
            <span className="truncate">{rec.source.label}</span>
            <ArrowRight className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{rec.target.label}</span>
          </div>
        </div>
        <div
          className="px-2 py-1 rounded-full text-[10px] tabular-nums flex-shrink-0"
          style={{
            background: meta.bg,
            color: meta.color,
            border: `1px solid ${meta.color}44`,
            fontFamily: 'Inter, sans-serif',
          }}
          title="Relative intervention priority"
        >
          {Math.round(rec.score * 100)}
        </div>
      </div>

      <p
        className="mt-2 text-xs leading-relaxed"
        style={{ color: TEXT_BODY, fontFamily: 'Inter, sans-serif' }}
      >
        {explanation.because}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <InfoChip icon={<Activity className="w-3 h-3" />} label={rec.horizonLabel} />
        <InfoChip icon={<ShieldCheck className="w-3 h-3" />} label={compactEvidenceLabel(rec)} />
        {rec.priorityReasons.slice(0, 2).map((reason) => (
          <InfoChip key={reason} icon={<Gauge className="w-3 h-3" />} label={reason} />
        ))}
      </div>

      <NodeChipRow label="Hold" nodes={explanation.holdConstant} />
      <NodeChipRow label="Watch" nodes={explanation.watch} />
      <NodeChipRow label="Substitute" nodes={explanation.substitutes} />

      {explanation.tradeoffs.length > 0 && (
        <p
          className="mt-2 text-[11px] leading-relaxed"
          style={{ color: TEXT_MUTED, fontFamily: 'Inter, sans-serif' }}
        >
          {explanation.tradeoffs[0]}
        </p>
      )}
    </article>
  )
}

function ObservationLane({ observations }: { observations: AgencyObservation[] }) {
  const meta = GROUP_META.observe_recheck
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: BG_CARD, border: `1px solid ${LINE}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: meta.bg, color: meta.color }}
          >
            <Eye className="w-4 h-4" />
          </div>
          <h2
            className="text-sm font-medium"
            style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
          >
            {meta.label}
          </h2>
        </div>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: TEXT_FAINT, fontFamily: 'Inter, sans-serif' }}
        >
          {observations.length}
        </span>
      </div>

      <div className="space-y-3">
        {observations.map((obs) => (
          <article
            key={obs.id}
            className="rounded-xl p-3"
            style={{ background: BG_CARD_WARM, border: `1px solid ${LINE}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  className="text-sm font-medium"
                  style={{ color: TEXT_INK, fontFamily: 'Inter, sans-serif' }}
                >
                  {obs.node.label}
                </h3>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: TEXT_BODY, fontFamily: 'Inter, sans-serif' }}
                >
                  {obs.reason}
                </p>
              </div>
              <span
                className="px-2 py-1 rounded-full text-[10px]"
                style={{
                  background: meta.bg,
                  color: meta.color,
                  border: `1px solid ${meta.color}44`,
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {obs.horizonLabel}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {obs.drivenBy.slice(0, 3).map((label) => (
                <span
                  key={label}
                  className="px-2 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: BG_CARD,
                    color: TEXT_MUTED,
                    border: `1px solid ${LINE}`,
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function NodeChipRow({
  label,
  nodes,
}: {
  label: string
  nodes: Array<{ id: string; label: string }>
}) {
  if (nodes.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span
        className="text-[10px] uppercase"
        style={{
          color: TEXT_FAINT,
          fontFamily: 'Inter, sans-serif',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      {nodes.slice(0, 4).map((node) => (
        <span
          key={node.id}
          className="px-2 py-0.5 rounded-full text-[10px]"
          style={{
            background: BG_CARD,
            color: TEXT_MUTED,
            border: `1px solid ${LINE}`,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {node.label}
        </span>
      ))}
    </div>
  )
}

function InfoChip({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
      style={{
        background: BG_TRACK,
        color: TEXT_MUTED,
        border: `1px solid ${LINE}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

export default AgencyView
