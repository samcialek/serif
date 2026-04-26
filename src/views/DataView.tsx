import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Moon,
  Activity,
  Heart,
  FlaskConical,
  Scale,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Database,
  Gauge,
  CloudSun,
  Coffee,
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import {
  Card,
  DataModeToggle,
  EdgeEvidenceChip,
  GlossaryTerm,
  MetricCard,
  MemberAvatar,
  PainterlyPageHeader,
  ProvenanceBadge,
  provenanceFromSource,
} from '@/components/common'
import { DataCadenceChart } from '@/components/charts'
import { MetricSparkline } from '@/components/clients/MetricSparkline'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import type { InsightBayesian } from '@/data/portal/types'
import { useScopeStore } from '@/stores/scopeStore'
import { explorationBandFor, type ExplorationHorizonBand } from '@/utils/exploration'
import {
  evidenceCounts,
  median,
  prettyEdgeId,
  priorHeavyEdges,
  scopeBlurb,
  scopeLabel,
  scopedEdgesForRegime,
  weightedPersonalizationPct,
} from '@/utils/edgeEvidence'
import {
  caspianTimeSeries,
  caspianLabs,
  caspianPersona,
  LAB_METRICS,
  LAB_SUBCATEGORY_ORDER,
  computeStats,
  type TimeSeriesMetric,
  type LabMetricDef,
} from '@/data/caspianRawData'
import {
  sarahCausalStories,
  sarahDataStreams,
  sarahDataSummary,
  sarahLabs as sarahRichLabs,
  sarahMetrics,
  SARAH_RECORD_END,
  SARAH_RECORD_START,
  type SarahMetric,
  type SarahMetricCategory,
} from '@/data/sarahRichData'
import {
  EDGE_LIFECYCLE_STAGE_META,
  buildEdgeLifecycleSummary,
  formatEdgeLabel,
  type EdgeLifecycleBlocker,
  type EdgeLifecycleStage,
} from '@/utils/edgeLifecycle'
// LabResult type available from @/types if needed

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

type CategoryId =
  | 'overview'
  | 'sleep'
  | 'activity'
  | 'heart'
  | 'labs'
  | 'body'
  | 'lifestyle'
  | 'loads'
  | 'environment'

interface CategoryDef {
  id: CategoryId
  label: string
  icon: React.ElementType
  color: string
  metricCount: string
}

const CATEGORIES: CategoryDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, color: '#64748B', metricCount: 'Summary' },
  { id: 'sleep', label: 'Sleep', icon: Moon, color: '#b8aadd', metricCount: '4 metrics' },
  { id: 'activity', label: 'Activity & Training', icon: Activity, color: '#5ba8d4', metricCount: '4 metrics' },
  { id: 'heart', label: 'Heart & HRV', icon: Heart, color: '#e99bbe', metricCount: '4 metrics' },
  { id: 'labs', label: 'Lab Biomarkers', icon: FlaskConical, color: '#9182c4', metricCount: `${LAB_METRICS.length} markers` },
  { id: 'body', label: 'Body Composition', icon: Scale, color: '#5ba8d4', metricCount: '2 metrics' },
  { id: 'lifestyle', label: 'Lifestyle log', icon: Coffee, color: '#C76B4D', metricCount: '4 metrics · 90d' },
  { id: 'loads', label: 'Rolling loads', icon: Gauge, color: '#6366f1', metricCount: '8 metrics · 14d' },
  { id: 'environment', label: 'Environment', icon: CloudSun, color: '#f59e0b', metricCount: '5 metrics · 14d' },
]

type SarahCategoryId =
  | 'overview'
  | SarahMetricCategory
  | 'labs'
  | 'stories'

interface SarahCategoryDef {
  id: SarahCategoryId
  label: string
  icon: React.ElementType
  color: string
  metricCount: string
}

const SARAH_CATEGORIES: SarahCategoryDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, color: '#64748B', metricCount: 'Summary' },
  { id: 'metabolic', label: 'Metabolic', icon: Gauge, color: '#D4A857', metricCount: '2 daily metrics' },
  { id: 'cycle', label: 'Cycle', icon: Calendar, color: '#B88AC9', metricCount: '2 context streams' },
  { id: 'sleep', label: 'Sleep', icon: Moon, color: '#7C9F8B', metricCount: '3 wearable metrics' },
  { id: 'nutrition', label: 'Nutrition', icon: Coffee, color: '#C76B4D', metricCount: '3 food streams' },
  { id: 'activity', label: 'Movement', icon: Activity, color: '#5BA8D4', metricCount: '1 behavior stream' },
  { id: 'context', label: 'Environment', icon: CloudSun, color: '#F97316', metricCount: '2 context streams' },
  { id: 'body', label: 'Body', icon: Scale, color: '#5BA8D4', metricCount: '1 slow outcome' },
  { id: 'labs', label: 'Blood work', icon: FlaskConical, color: '#9182C4', metricCount: `${sarahDataSummary.labDraws} draws` },
  { id: 'stories', label: 'Causal stories', icon: Database, color: '#6366F1', metricCount: `${sarahCausalStories.length} contrasts` },
]

const CATEGORY_TO_TS: Record<string, TimeSeriesMetric['category']> = {
  sleep: 'sleep',
  activity: 'activity',
  heart: 'heart',
  body: 'body',
  lifestyle: 'lifestyle',
}

// Map heart category to both 'heart' and 'hrv' time series categories
function getMetricsForCategory(catId: CategoryId): TimeSeriesMetric[] {
  if (catId === 'heart') {
    return caspianTimeSeries.filter((m) => m.category === 'heart' || m.category === 'hrv')
  }
  const tsCat = CATEGORY_TO_TS[catId]
  if (!tsCat) return []
  return caspianTimeSeries.filter((m) => m.category === tsCat)
}

// ============================================================================
// SIDEBAR
// ============================================================================

function CategorySidebar({
  active,
  onChange,
}: {
  active: CategoryId
  onChange: (id: CategoryId) => void
}) {
  // Only labs has a meaningful freshness (latest draw date). Wearable streams
  // have no demo-level sync state, so we omit it rather than fabricate "X hours ago".
  const freshness: Record<string, string> = {
    overview: '',
    sleep: '',
    activity: '',
    heart: '',
    labs: caspianLabs[0]?.date ?? '',
    body: '',
    lifestyle: '',
    loads: '',
    environment: '',
  }

  return (
    <nav className="space-y-1 sticky top-4">
      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3 px-3">
        Data Categories
      </div>
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon
        const isActive = active === cat.id
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${
              isActive
                ? 'bg-white border border-slate-200 shadow-sm'
                : 'hover:bg-slate-50 border border-transparent'
            }`}
          >
            <div
              className="p-1.5 rounded-md flex-shrink-0"
              style={{ backgroundColor: isActive ? cat.color + '18' : 'transparent' }}
            >
              <Icon
                className="w-4 h-4"
                style={{ color: isActive ? cat.color : '#94a3b8' }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={`text-sm font-medium truncate ${
                  isActive ? 'text-slate-800' : 'text-slate-600'
                }`}
              >
                {cat.label}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">{cat.metricCount}</span>
                {freshness[cat.id] && (
                  <>
                    <span className="text-[10px] text-slate-300">|</span>
                    <span className="text-[10px] text-slate-400">{freshness[cat.id]}</span>
                  </>
                )}
              </div>
            </div>
            {isActive && (
              <div
                className="w-1.5 h-6 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}

// ============================================================================
// WEARABLE METRIC ROW CARD
// ============================================================================

function WearableMetricRow({ metric, color }: { metric: TimeSeriesMetric; color: string }) {
  const stats = computeStats(metric.data)
  const sparkData = metric.data.map((d) => d.value)

  return (
    <Card padding="sm" className="mb-3">
      <div className="flex items-center gap-4">
        {/* Left: Name + Current Value */}
        <div className="w-44 flex-shrink-0">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            {metric.name}
          </div>
          <div className="flex items-baseline mt-1">
            <span className="text-xl font-semibold font-mono text-slate-800">
              {stats.current}
            </span>
            <span className="ml-1.5 text-xs text-slate-400">{metric.unit}</span>
          </div>
        </div>

        {/* Sparkline */}
        <div className="flex-shrink-0">
          <MetricSparkline
            data={sparkData}
            width={200}
            height={36}
            color={color}
            showDots
          />
        </div>

        {/* Stats Row */}
        <div className="flex-1 flex items-center gap-4 justify-end">
          <StatPill label="7d avg" value={stats.avg7d} unit={metric.unit} />
          <StatPill label="30d avg" value={stats.avg30d} unit={metric.unit} />
          <StatPill
            label="range"
            value={`${stats.min}–${stats.max}`}
            unit={metric.unit}
          />
        </div>
      </div>

      {/* Source + reference range */}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
        <ProvenanceBadge
          kind={provenanceFromSource(metric.source)}
          label={metric.source}
        />
        {metric.referenceRange && (
          <span className="text-slate-400">
            Ref: {metric.referenceRange.low}–{metric.referenceRange.high} {metric.unit}
          </span>
        )}
      </div>
    </Card>
  )
}

function StatPill({
  label,
  value,
  unit,
}: {
  label: string
  value: number | string
  unit: string
}) {
  return (
    <div className="text-center px-2">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-medium text-slate-700">
        {value}
        <span className="text-[10px] text-slate-400 ml-0.5">{unit}</span>
      </div>
    </div>
  )
}

// ============================================================================
// LAB BIOMARKER CARD
// ============================================================================

function LabBiomarkerCard({ def }: { def: LabMetricDef }) {
  // Gather all values from caspianLabs for this key, chronologically
  const draws = caspianLabs
    .filter((lab) => lab[def.key] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((lab) => ({ date: lab.date, value: lab[def.key] as number }))

  if (draws.length === 0) return null

  const latest = draws[draws.length - 1]
  const prev = draws.length >= 2 ? draws[draws.length - 2] : null

  // Trend
  let trendIcon: React.ReactNode = <ArrowRight className="w-3 h-3 text-slate-500" />
  let trendLabel = 'stable'
  let trendColor = 'text-slate-500'
  if (prev) {
    const pctChange = ((latest.value - prev.value) / prev.value) * 100
    if (Math.abs(pctChange) > 5) {
      if (pctChange > 0) {
        trendIcon = <TrendingUp className="w-3 h-3 text-emerald-600" />
        trendLabel = `+${pctChange.toFixed(0)}%`
        trendColor = 'text-emerald-600'
      } else {
        trendIcon = <TrendingDown className="w-3 h-3 text-rose-600" />
        trendLabel = `${pctChange.toFixed(0)}%`
        trendColor = 'text-rose-600'
      }
    }
  }

  return (
    <Card padding="sm" className="mb-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-800">{def.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{def.description}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {trendIcon}
          <span className={`text-xs font-medium ${trendColor}`}>{trendLabel}</span>
        </div>
      </div>

      {/* Latest value */}
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-semibold font-mono text-slate-800">{latest.value}</span>
        <span className="text-sm text-slate-400">{def.unit}</span>
      </div>

      {/* Reference range bar */}
      <ReferenceRangeBar
        value={latest.value}
        referenceRange={def.referenceRange}
        optimalRange={def.optimalRange}
      />

      {/* Draw history */}
      {draws.length > 1 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
            Draw History
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {draws.map((d) => (
              <div key={d.date} className="flex items-baseline gap-1.5">
                <span className="text-[10px] text-slate-400">{formatLabDate(d.date)}</span>
                <span className="text-xs font-mono font-medium text-slate-700">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function formatLabDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

// ============================================================================
// REFERENCE RANGE BAR (SVG)
// ============================================================================

function ReferenceRangeBar({
  value,
  referenceRange,
  optimalRange,
}: {
  value: number
  referenceRange: { low: number; high: number }
  optimalRange?: [number, number]
}) {
  const barWidth = 260
  const barHeight = 16
  const padding = 4

  // Extend visual range 20% beyond reference on each side
  const span = referenceRange.high - referenceRange.low
  const vizLow = referenceRange.low - span * 0.2
  const vizHigh = referenceRange.high + span * 0.2

  const toX = (v: number) =>
    padding + ((v - vizLow) / (vizHigh - vizLow)) * (barWidth - padding * 2)

  const refLeftX = toX(referenceRange.low)
  const refRightX = toX(referenceRange.high)
  const optLeftX = optimalRange ? toX(optimalRange[0]) : refLeftX
  const optRightX = optimalRange ? toX(optimalRange[1]) : refRightX
  const markerX = Math.max(padding, Math.min(barWidth - padding, toX(value)))

  return (
    <div>
      <svg width={barWidth} height={barHeight + 18} className="overflow-visible">
        {/* Background (risk zone) */}
        <rect
          x={padding}
          y={2}
          width={barWidth - padding * 2}
          height={barHeight}
          rx={4}
          fill="#fecdd3"
          opacity={0.4}
        />

        {/* Reference range (attention zone) */}
        <rect
          x={refLeftX}
          y={2}
          width={refRightX - refLeftX}
          height={barHeight}
          rx={3}
          fill="#fde68a"
          opacity={0.5}
        />

        {/* Optimal zone */}
        {optimalRange && (
          <rect
            x={optLeftX}
            y={2}
            width={optRightX - optLeftX}
            height={barHeight}
            rx={3}
            fill="#bbf7d0"
            opacity={0.6}
          />
        )}

        {/* Marker dot */}
        <circle cx={markerX} cy={2 + barHeight / 2} r={5} fill="#1e293b" />
        <circle cx={markerX} cy={2 + barHeight / 2} r={3} fill="white" />

        {/* Labels */}
        <text x={refLeftX} y={barHeight + 14} fontSize="9" fill="#94a3b8" textAnchor="middle">
          {referenceRange.low}
        </text>
        <text x={refRightX} y={barHeight + 14} fontSize="9" fill="#94a3b8" textAnchor="middle">
          {referenceRange.high}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1">
        <span className="flex items-center gap-1 text-[9px] text-slate-400">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#bbf7d0' }} />
          Optimal
        </span>
        <span className="flex items-center gap-1 text-[9px] text-slate-400">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#fde68a' }} />
          Reference
        </span>
        <span className="flex items-center gap-1 text-[9px] text-slate-400">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#fecdd3' }} />
          Out of range
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// OVERVIEW SECTION
// ============================================================================

function OverviewSection() {
  const cm = caspianPersona.currentMetrics
  return (
    <div>
      {/* Summary MetricCards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Resting HR"
          value={cm.restingHr}
          unit="bpm"
          trend="stable"
          trendValue="30d avg"
          icon={<Heart className="w-4 h-4" />}
        />
        <MetricCard
          label="HRV (SDNN)"
          value={cm.hrv}
          unit="ms"
          trend="stable"
          trendValue="30d avg"
          icon={<Activity className="w-4 h-4" />}
        />
        <MetricCard
          label="Weight"
          value={cm.weight}
          unit="kg"
          trend="stable"
          trendValue="latest"
          icon={<Scale className="w-4 h-4" />}
        />
        <MetricCard
          label="Deep Sleep"
          value={cm.deepSleepMin}
          unit="min"
          trend="stable"
          trendValue="30d avg"
          icon={<Moon className="w-4 h-4" />}
        />
        <MetricCard
          label="REM Sleep"
          value={cm.remSleepMin}
          unit="min"
          trend="stable"
          trendValue="30d avg"
          icon={<Moon className="w-4 h-4" />}
        />
        <MetricCard
          label="Fasting Glucose"
          value={cm.fastingGlucose}
          unit="mg/dL"
          trend="stable"
          trendValue="last draw"
          icon={<FlaskConical className="w-4 h-4" />}
        />
      </div>

    </div>
  )
}

function DataCoverageCadenceCard() {
  return (
    <Card padding="none" className="overflow-hidden rounded-xl mb-6">
      <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Data Coverage & Cadence</h3>
            <p className="text-sm text-slate-300">
              Temporal coverage of Caspian's connected data sources — 4,000+ days across 8 streams
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 py-4">
        <DataCadenceChart />
        <div className="flex items-center gap-6 mt-3 text-[10px] text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-2 rounded-sm bg-emerald-500 opacity-80" />
            Daily stream
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-2 rounded-sm bg-amber-500 opacity-50" />
            Ad-hoc (density)
          </span>
          <span className="flex items-center gap-1.5">
            <svg width={10} height={10} viewBox="0 0 10 10">
              <polygon points="5,1 9,5 5,9 1,5" fill="#8B5CF6" />
            </svg>
            Episodic event
          </span>
        </div>
      </div>
    </Card>
  )
}

interface EvidenceMixBucket {
  key: string
  label: string
  edges: InsightBayesian[]
}

function EvidenceMixRow({ bucket }: { bucket: EvidenceMixBucket }) {
  const personalized = weightedPersonalizationPct(bucket.edges)
  const personalizedPct = Math.round(personalized * 100)
  const modelPct = 100 - personalizedPct
  const userN = bucket.edges.reduce((sum, edge) => sum + (edge.user_obs?.n ?? 0), 0)
  const medianSd = median(bucket.edges.map((edge) => edge.posterior?.sd ?? 0))
  const hover = [
    `${personalizedPct}% personalized / ${modelPct}% model`,
    `${bucket.edges.length} causal edges`,
    `total user n=${userN}`,
    `median posterior SD=${medianSd.toFixed(3)}`,
  ].join('\n')

  return (
    <div title={hover}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-sm font-semibold text-slate-800">{bucket.label}</div>
          <div className="text-[10px] text-slate-400 tabular-nums">
            {bucket.edges.length} edges · median SD {medianSd.toFixed(3)}
          </div>
        </div>
        <div className="text-xs tabular-nums text-slate-500">
          {personalizedPct}% / {modelPct}%
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${personalizedPct}%` }}
        />
        <div className="h-full flex-1 bg-slate-300" />
      </div>
    </div>
  )
}

function CausalEvidenceMixCard() {
  const { participant, isLoading } = useParticipant()
  const regime = useScopeStore((s) => s.regime)

  if (isLoading) {
    return (
      <Card padding="md" className="mb-6 text-sm text-slate-500">
        Loading causal evidence mix...
      </Card>
    )
  }
  if (!participant) return null

  const edges = participant.effects_bayesian
  const activeEdges = scopedEdgesForRegime(edges, regime)
  const byBand = (band: ExplorationHorizonBand) =>
    edges.filter((edge) => explorationBandFor(edge.outcome) === band)
  const activeBuckets: EvidenceMixBucket[] =
    regime === 'all'
      ? [
          { key: 'all', label: 'All causal edges', edges: activeEdges },
          { key: 'quotidian', label: 'Quotidian horizon', edges: byBand('quotidian') },
          {
            key: 'longevity',
            label: 'Longevity horizon',
            edges: [...byBand('monthly'), ...byBand('longterm')],
          },
        ]
      : regime === 'quotidian'
        ? [{ key: 'quotidian', label: 'Quotidian horizon', edges: activeEdges }]
        : [
            { key: 'longevity', label: 'Longevity horizon', edges: activeEdges },
            { key: 'monthly', label: 'Monthly biomarkers', edges: byBand('monthly') },
            { key: 'longterm', label: 'Long-term biomarkers', edges: byBand('longterm') },
          ]
  const buckets = activeBuckets.filter((bucket) => bucket.edges.length > 0)

  const activePersonalPct = Math.round(weightedPersonalizationPct(activeEdges) * 100)
  const counts = evidenceCounts(activeEdges)
  const priorHeavy = priorHeavyEdges(activeEdges, 6)

  return (
    <Card padding="none" className="overflow-hidden rounded-xl mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <h3 className="text-lg font-semibold text-slate-800">
                Causal evidence mix
              </h3>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Where Protocols' evidence bars come from: member-specific row
              coverage and posterior narrowing, compared with model-side support.
              Currently scoped to <span className="font-medium text-slate-700">{scopeLabel(regime)}</span>{' '}
              ({scopeBlurb(regime)}).
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-semibold text-emerald-700 tabular-nums">
              {activePersonalPct}%
            </div>
            <div
              className="text-[10px] uppercase tracking-wider text-slate-400"
              title="Magnitude-weighted member-specific evidence share across the edges in this scope. It combines row coverage and posterior narrowing."
            >
              weighted personalization
            </div>
            <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
              {activeEdges.length}/{edges.length} edges
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.15fr]">
        <div className="px-6 py-5 border-b xl:border-b-0 xl:border-r border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
            {[
              ['Personalized', counts.personal, 'text-emerald-700 bg-emerald-50'],
              ['Personalizing', counts.personalizing, 'text-indigo-700 bg-indigo-50'],
              ['Model-heavy', counts.priorHeavy, 'text-amber-700 bg-amber-50'],
              ['Blocked', counts.blocked, 'text-rose-700 bg-rose-50'],
            ].map(([label, value, tone]) => (
              <div key={label} className={`rounded-lg px-3 py-2 ${tone}`}>
                <div className="text-lg font-semibold tabular-nums">{value}</div>
                <div className="text-[10px] uppercase tracking-wider opacity-70">
                  {label}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mb-4 text-[10px] uppercase tracking-wider text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-2 rounded-sm bg-emerald-500" />
              Personalized
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-5 h-2 rounded-sm bg-slate-300" />
              Model
            </span>
          </div>
          <div className="space-y-4">
            {buckets.map((bucket) => (
              <EvidenceMixRow key={bucket.key} bucket={bucket} />
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-3">
            Model-heavy edges to unlock · {scopeLabel(regime)}
          </div>
          <div className="divide-y divide-slate-100">
            {priorHeavy.length === 0 && (
              <div className="py-4 text-sm text-slate-500">
                No model-heavy edges in this scope.
              </div>
            )}
            {priorHeavy.map((edge) => {
              const sd = edge.posterior?.sd ?? 0
              return (
                <div
                  key={`${edge.action}->${edge.outcome}`}
                  className="py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {prettyEdgeId(edge.action)} → {prettyEdgeId(edge.outcome)}
                      </div>
                      <div className="text-[10px] text-slate-400 tabular-nums">
                        n={edge.user_obs?.n ?? 0} · SD {sd.toFixed(3)} ·{' '}
                        {edge.horizon_days != null ? `${edge.horizon_days}d` : 'no horizon'}
                      </div>
                    </div>
                    <EdgeEvidenceChip edge={edge} variant="compact" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

const LIFECYCLE_VISIBLE_STAGES: EdgeLifecycleStage[] = [
  'recommended_edge',
  'personal_edge',
  'personalizing',
  'estimating',
  'needs_exposure_variation',
  'needs_outcome_cadence',
  'confounder_blocked',
  'positivity_limited',
  'population_prior',
]

const STAGE_TONE_CLASS: Record<EdgeLifecycleStage, string> = {
  population_prior: 'bg-slate-100 text-slate-700 border-slate-200',
  needs_exposure_variation: 'bg-amber-50 text-amber-800 border-amber-200',
  needs_outcome_cadence: 'bg-amber-50 text-amber-800 border-amber-200',
  confounder_blocked: 'bg-rose-50 text-rose-800 border-rose-200',
  positivity_limited: 'bg-rose-50 text-rose-800 border-rose-200',
  estimating: 'bg-blue-50 text-blue-800 border-blue-200',
  personalizing: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  personal_edge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  recommended_edge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  needs_refresh: 'bg-slate-100 text-slate-700 border-slate-200',
}

const BLOCKER_LABEL: Record<EdgeLifecycleBlocker, string> = {
  exposure_variation: 'Exposure variation',
  outcome_cadence: 'Outcome cadence',
  confounder_coverage: 'Confounder coverage',
  positivity: 'Positivity',
  posterior_contraction: 'Estimate still wide',
  direction_stability: 'Direction stability',
}

function EdgeLedAcquisitionCard() {
  const { participant, isLoading } = useParticipant()
  const regime = useScopeStore((s) => s.regime)
  const summary = useMemo(
    () => {
      if (!participant) return null
      return buildEdgeLifecycleSummary({
        ...participant,
        effects_bayesian: scopedEdgesForRegime(participant.effects_bayesian, regime),
      })
    },
    [participant, regime],
  )

  if (isLoading) {
    return (
      <Card padding="md" className="mb-6 text-sm text-slate-500">
        Loading edge lifecycle...
      </Card>
    )
  }
  if (!participant || !summary) return null

  const total = Math.max(1, summary.assessments.length)
  const personalPct = Math.round((summary.personalEdgeCount / total) * 100)
  const blockedPct = Math.round((summary.blockedEdgeCount / total) * 100)
  const topRecommendations = summary.recommendations.slice(0, 3)

  return (
    <Card padding="none" className="overflow-hidden rounded-xl mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-indigo-500" />
              <h3 className="text-lg font-semibold text-slate-800">
                Edge-led acquisition
              </h3>
            </div>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Each edge is staged by exposure variation, outcome cadence,
              confounder coverage, positivity, uncertainty reduction, and direction
              stability. Currently scoped to{' '}
              <span className="font-medium text-slate-700">{scopeLabel(regime)}</span>.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-2xl font-semibold text-slate-800 tabular-nums">
              {summary.assessments.length}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">
              edges tracked
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        <div className="px-6 py-4">
          <div className="text-2xl font-semibold text-emerald-700 tabular-nums">
            {personalPct}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            personalizing or better
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="text-2xl font-semibold text-amber-700 tabular-nums">
            {blockedPct}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            blocked by data design
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="text-2xl font-semibold text-slate-700 tabular-nums">
            {summary.priorOnlyCount}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            still model-only
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_1.4fr]">
        <div className="px-6 py-5 border-b xl:border-b-0 xl:border-r border-slate-100">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-3">
            Lifecycle mix
          </div>
          <div className="space-y-2.5">
            {LIFECYCLE_VISIBLE_STAGES.map((stage) => {
              const count = summary.stageCounts[stage]
              if (count === 0) return null
              const meta = EDGE_LIFECYCLE_STAGE_META[stage]
              const pct = Math.max(4, (count / total) * 100)
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between gap-3 text-xs mb-1">
                    <span className="text-slate-600">{meta.label}</span>
                    <span className="tabular-nums text-slate-400">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-slate-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-3">
            Next collection moves
          </div>
          <div className="divide-y divide-slate-100">
            {topRecommendations.map((rec) => (
              <div key={rec.blocker} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">
                        {rec.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[10px] text-slate-500">
                        {rec.sourceHint}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-snug">
                      {rec.rationale}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rec.examples.slice(0, 3).map((item) => (
                        <span
                          key={item.key}
                          className={`px-2 py-1 rounded-md border text-[10px] ${STAGE_TONE_CLASS[item.stage]}`}
                          title={item.nextStep}
                        >
                          {formatEdgeLabel(item.edge)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-semibold text-slate-800 tabular-nums">
                      {rec.edgeCount}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">
                      edges
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(Object.keys(BLOCKER_LABEL) as EdgeLifecycleBlocker[]).map((blocker) => {
              const count = summary.blockerCounts[blocker]
              if (count === 0) return null
              return (
                <span
                  key={blocker}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-white text-[10px] text-slate-500"
                >
                  <span className="font-medium text-slate-700">
                    {BLOCKER_LABEL[blocker]}
                  </span>
                  <span className="tabular-nums">{count}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// WEARABLE CATEGORY SECTION
// ============================================================================

function WearableCategorySection({
  categoryId,
  color,
}: {
  categoryId: CategoryId
  color: string
}) {
  const metrics = getMetricsForCategory(categoryId)
  if (metrics.length === 0) return null

  return (
    <div>
      {metrics.map((metric) => (
        <WearableMetricRow key={metric.id} metric={metric} color={color} />
      ))}
    </div>
  )
}

// ============================================================================
// ROLLING LOADS SECTION
// ============================================================================
//
// Loads come from participant.loads_history (14-day rolling series the
// engine computes from the raw lifestyle data — ACWR from TRIMP, SRI
// from bedtime SD, etc.). They're derived signals, not primary inputs,
// so they live separately from the wearable-signal categories.

interface DerivedSeriesSpec {
  key: string
  name: string
  unit: string
  format?: (v: number) => string
}

const LOAD_SERIES: DerivedSeriesSpec[] = [
  { key: 'acwr', name: 'ACWR', unit: '', format: (v) => v.toFixed(2) },
  { key: 'ctl', name: 'Chronic load (CTL)', unit: 'TRIMP', format: (v) => v.toFixed(0) },
  { key: 'atl', name: 'Acute load (ATL)', unit: 'TRIMP', format: (v) => v.toFixed(0) },
  { key: 'tsb', name: 'Training balance (TSB)', unit: 'TRIMP', format: (v) => v.toFixed(0) },
  { key: 'sleep_debt_14d', name: 'Sleep debt (14d)', unit: 'hours', format: (v) => v.toFixed(1) },
  { key: 'sri_7d', name: 'Sleep regularity (SRI)', unit: '', format: (v) => v.toFixed(0) },
  { key: 'training_monotony', name: 'Training monotony', unit: '', format: (v) => v.toFixed(2) },
  { key: 'training_consistency', name: 'Training consistency', unit: '', format: (v) => `${Math.round(v * 100)}%` },
]

const ENVIRONMENT_SERIES: DerivedSeriesSpec[] = [
  { key: 'temp_c', name: 'Temperature', unit: '°C', format: (v) => v.toFixed(1) },
  { key: 'humidity_pct', name: 'Humidity', unit: '%', format: (v) => v.toFixed(0) },
  { key: 'heat_index_c', name: 'Heat index', unit: '°C', format: (v) => v.toFixed(1) },
  { key: 'uv_index', name: 'UV index', unit: '', format: (v) => v.toFixed(1) },
  { key: 'aqi', name: 'Air quality (AQI)', unit: '', format: (v) => v.toFixed(0) },
]

function derivedRowStats(values: number[]): {
  current: number | null
  avg14d: number | null
  min: number | null
  max: number | null
  delta: number | null
} {
  if (values.length === 0)
    return { current: null, avg14d: null, min: null, max: null, delta: null }
  const current = values[values.length - 1]
  const avg14d = values.reduce((s, v) => s + v, 0) / values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const first = values[0]
  const delta = current - first
  return { current, avg14d, min, max, delta }
}

function DerivedSeriesRow({
  spec,
  values,
  color,
  source,
}: {
  spec: DerivedSeriesSpec
  values: number[]
  color: string
  source: string
}) {
  const stats = derivedRowStats(values)
  const fmt = spec.format ?? ((v: number) => v.toFixed(1))
  const unitStr = spec.unit ? ` ${spec.unit}` : ''

  return (
    <Card padding="sm" className="mb-3">
      <div className="flex items-center gap-4">
        <div className="w-44 flex-shrink-0">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            <GlossaryTerm termId={spec.key} display={spec.name} />
          </div>
          <div className="flex items-baseline mt-1">
            <span className="text-xl font-semibold font-mono text-slate-800">
              {stats.current != null ? fmt(stats.current) : '—'}
            </span>
            {spec.unit && (
              <span className="ml-1.5 text-xs text-slate-400">{spec.unit}</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          <MetricSparkline
            data={values}
            width={200}
            height={36}
            color={color}
            showDots
          />
        </div>

        <div className="flex-1 flex items-center gap-4 justify-end">
          <StatPill
            label="14d avg"
            value={stats.avg14d != null ? fmt(stats.avg14d) : '—'}
            unit={spec.unit}
          />
          <StatPill
            label="range"
            value={
              stats.min != null && stats.max != null
                ? `${fmt(stats.min)}–${fmt(stats.max)}`
                : '—'
            }
            unit={spec.unit}
          />
          <StatPill
            label="Δ 14d"
            value={
              stats.delta != null
                ? `${stats.delta >= 0 ? '+' : ''}${fmt(stats.delta)}${unitStr}`
                : '—'
            }
            unit=""
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
        <ProvenanceBadge
          kind={provenanceFromSource(source)}
          label={source}
        />
      </div>
    </Card>
  )
}

function LoadsSection({ color }: { color: string }) {
  const { participant, isLoading } = useParticipant()
  if (isLoading) {
    return <p className="text-xs text-slate-400">Loading…</p>
  }
  const history = participant?.loads_history
  if (!history || Object.keys(history).length === 0) {
    return (
      <Card padding="md" className="text-center text-slate-500 text-sm">
        No rolling-load history available for this participant.
      </Card>
    )
  }
  return (
    <div>
      {LOAD_SERIES.map((spec) => {
        const values = history[spec.key as keyof typeof history] ?? []
        if (!values || values.length === 0) return null
        return (
          <DerivedSeriesRow
            key={spec.key}
            spec={spec}
            values={values as number[]}
            color={color}
            source="Engine-derived · 14 days"
          />
        )
      })}
      <div className="mt-4 px-1 text-[10px] text-slate-400 leading-snug">
        Computed by the SCM engine from raw TRIMP / sleep / bedtime series
        (see backend/serif_scm/loads.py). Feeds the Protocols context panel
        and drives the Bayesian posterior gating.
      </div>
    </div>
  )
}

function EnvironmentSection({ color }: { color: string }) {
  const { participant, isLoading } = useParticipant()
  if (isLoading) {
    return <p className="text-xs text-slate-400">Loading…</p>
  }
  const today = participant?.weather_today
  const history = participant?.weather_history
  const location = participant?.weather_location_today
  const locationLabel = location?.city
    ? `${location.city}${location.country ? `, ${location.country}` : ''}`
    : 'Local weather'
  if (!history || Object.keys(history).length === 0) {
    return (
      <Card padding="md" className="text-center text-slate-500 text-sm">
        No environment data for this participant.
      </Card>
    )
  }
  return (
    <div>
      {ENVIRONMENT_SERIES.map((spec) => {
        const values = history[spec.key as keyof typeof history] ?? []
        if (!values || values.length === 0) return null
        return (
          <DerivedSeriesRow
            key={spec.key}
            spec={spec}
            values={values as number[]}
            color={color}
            source={`${locationLabel} · 14 days`}
          />
        )
      })}
      <div className="mt-4 px-1 text-[10px] text-slate-400 leading-snug">
        Recorded for {locationLabel}; feeds the Protocols
        context panel and the BART backdoor adjustment
        (CONFOUNDERS_BY_OUTCOME) so edge estimates condition on heat
        index, humidity, UV, and AQI where the literature supports it.
        {today != null && Object.keys(today).length > 0 && (
          <span className="block mt-1">
            Today: {today.temp_c != null && `${today.temp_c}°C`}
            {today.humidity_pct != null && ` · ${Math.round(today.humidity_pct)}% RH`}
            {today.heat_index_c != null && ` · heat ${today.heat_index_c}°C`}
            {today.aqi != null && ` · AQI ${Math.round(today.aqi)}`}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// LAB BIOMARKERS SECTION
// ============================================================================

function LabBiomarkersSection() {
  // Group by subcategory
  return (
    <div>
      {LAB_SUBCATEGORY_ORDER.map((subcat) => {
        const metricsInGroup = LAB_METRICS.filter((m) => m.subcategory === subcat.key)
        // Only show groups that have data
        const metricsWithData = metricsInGroup.filter((m) =>
          caspianLabs.some((lab) => lab[m.key] != null)
        )
        if (metricsWithData.length === 0) return null

        return (
          <div key={subcat.key} className="mb-6">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3 px-1">
              {subcat.label}
            </div>
            {metricsWithData.map((def) => (
              <LabBiomarkerCard key={def.key} def={def} />
            ))}
          </div>
        )
      })}

      {/* Last draw info */}
      <div className="mt-4 px-1 flex items-center gap-2 text-[10px] text-slate-400">
        <ProvenanceBadge kind="lab" label="Quest Labs" />
        <span>
          Last draw: {caspianLabs[0]?.date ?? 'N/A'} · {caspianPersona.labDraws} total
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN VIEW
// ============================================================================

function CaspianDataView() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('overview')
  const activeDef = CATEGORIES.find((c) => c.id === activeCategory)!

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Raw streams — wearable, lab, lifestyle, environmental, and engine-derived loads."
        hideHorizon
        actions={<DataModeToggle />}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <DataCoverageCadenceCard />
        <CausalEvidenceMixCard />
        <EdgeLedAcquisitionCard />
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className="flex-shrink-0" style={{ width: '240px' }}>
            <CategorySidebar active={activeCategory} onChange={setActiveCategory} />
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Section header */}
            {activeCategory !== 'overview' && (
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: activeDef.color + '18' }}
                >
                  <activeDef.icon className="w-5 h-5" style={{ color: activeDef.color }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{activeDef.label}</h2>
                  <p className="text-xs text-slate-400">{activeDef.metricCount}</p>
                </div>
              </div>
            )}

            {/* Category content */}
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeCategory === 'overview' && <OverviewSection />}
              {activeCategory === 'sleep' && (
                <WearableCategorySection categoryId="sleep" color="#b8aadd" />
              )}
              {activeCategory === 'activity' && (
                <WearableCategorySection categoryId="activity" color="#5ba8d4" />
              )}
              {activeCategory === 'heart' && (
                <WearableCategorySection categoryId="heart" color="#e99bbe" />
              )}
              {activeCategory === 'labs' && <LabBiomarkersSection />}
              {activeCategory === 'body' && (
                <WearableCategorySection categoryId="body" color="#5ba8d4" />
              )}
              {activeCategory === 'lifestyle' && (
                <WearableCategorySection categoryId="lifestyle" color="#C76B4D" />
              )}
              {activeCategory === 'loads' && <LoadsSection color="#6366f1" />}
              {activeCategory === 'environment' && (
                <EnvironmentSection color="#f59e0b" />
              )}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </PageLayout>
  )
}

function SarahCategorySidebar({
  active,
  onChange,
}: {
  active: SarahCategoryId
  onChange: (id: SarahCategoryId) => void
}) {
  return (
    <nav className="space-y-1 sticky top-4">
      <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3 px-3">
        Sarah's Data
      </div>
      {SARAH_CATEGORIES.map((cat) => {
        const Icon = cat.icon
        const isActive = active === cat.id
        return (
          <button
            key={cat.id}
            onClick={() => onChange(cat.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${
              isActive
                ? 'bg-white border border-slate-200 shadow-sm'
                : 'hover:bg-slate-50 border border-transparent'
            }`}
          >
            <div
              className="p-1.5 rounded-md flex-shrink-0"
              style={{ backgroundColor: isActive ? cat.color + '18' : 'transparent' }}
            >
              <Icon
                className="w-4 h-4"
                style={{ color: isActive ? cat.color : '#94a3b8' }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className={`text-sm font-medium truncate ${
                  isActive ? 'text-slate-800' : 'text-slate-600'
                }`}
              >
                {cat.label}
              </div>
              <div className="text-[10px] text-slate-400">{cat.metricCount}</div>
            </div>
            {isActive && (
              <div
                className="w-1.5 h-6 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}

function sarahMetricStats(metric: SarahMetric) {
  const values = metric.data.map((d) => d.value)
  const last7 = values.slice(-7)
  const last30 = values.slice(-30)
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((sum, value) => sum + value, 0) / arr.length : 0
  return {
    current: values[values.length - 1] ?? 0,
    avg7d: avg(last7),
    avg30d: avg(last30),
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function formatSarahMetricValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return 'N/A'
  if (unit === 'deg C' || unit === '0-10' || unit === '%') {
    return value.toFixed(1).replace(/\.0$/, '')
  }
  if (unit === 'count' || unit === 'day' || unit === 'mg/dL' || unit === 'min' || unit === 'ms' || unit === 'g') {
    return Math.round(value).toString()
  }
  return value.toFixed(1).replace(/\.0$/, '')
}

function SarahMetricRow({ metric, color }: { metric: SarahMetric; color: string }) {
  const stats = sarahMetricStats(metric)
  const sparkData = metric.data.map((d) => d.value)

  return (
    <Card padding="sm" className="mb-3">
      <div className="flex items-center gap-4">
        <div className="w-44 flex-shrink-0">
          <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
            {metric.name}
          </div>
          <div className="flex items-baseline mt-1">
            <span className="text-xl font-semibold font-mono text-slate-800">
              {formatSarahMetricValue(stats.current, metric.unit)}
            </span>
            <span className="ml-1.5 text-xs text-slate-400">{metric.unit}</span>
          </div>
        </div>

        <div className="flex-shrink-0">
          <MetricSparkline
            data={sparkData}
            width={200}
            height={36}
            color={color}
            showDots
          />
        </div>

        <div className="flex-1 flex items-center gap-4 justify-end">
          <StatPill
            label="7d avg"
            value={formatSarahMetricValue(stats.avg7d, metric.unit)}
            unit={metric.unit}
          />
          <StatPill
            label="30d avg"
            value={formatSarahMetricValue(stats.avg30d, metric.unit)}
            unit={metric.unit}
          />
          <StatPill
            label="range"
            value={`${formatSarahMetricValue(stats.min, metric.unit)}-${formatSarahMetricValue(stats.max, metric.unit)}`}
            unit={metric.unit}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
        <ProvenanceBadge
          kind={provenanceFromSource(metric.source)}
          label={metric.source}
        />
        <span>{metric.note}</span>
        {metric.referenceRange && (
          <span>
            Ref: {metric.referenceRange.low}-{metric.referenceRange.high} {metric.unit}
          </span>
        )}
      </div>
    </Card>
  )
}

function SarahMetricSection({
  categoryId,
  color,
}: {
  categoryId: SarahMetricCategory
  color: string
}) {
  const metrics = sarahMetrics.filter((metric) => metric.category === categoryId)
  if (metrics.length === 0) return null
  return (
    <div>
      {metrics.map((metric) => (
        <SarahMetricRow key={metric.id} metric={metric} color={color} />
      ))}
    </div>
  )
}

function SarahDataCoverageCard() {
  return (
    <Card padding="none" className="overflow-hidden rounded-xl mb-6">
      <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Data Coverage & Cadence</h3>
            <p className="text-sm text-slate-300">
              Multi-year record across endocrine, metabolic, sleep, food, movement, lab, and environment streams
            </p>
          </div>
        </div>
      </div>
      <div className="px-6 py-4">
        <DataCadenceChart
          streams={sarahDataStreams}
          timelineStartDate="2018-01-01"
          timelineEndDate="2026-06-01"
        />
        <div className="flex items-center gap-6 mt-3 text-[10px] text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-2 rounded-sm bg-emerald-500 opacity-80" />
            Daily stream
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-2 rounded-sm bg-amber-500 opacity-50" />
            High-density logging
          </span>
          <span className="flex items-center gap-1.5">
            <svg width={10} height={10} viewBox="0 0 10 10">
              <polygon points="5,1 9,5 5,9 1,5" fill="#8B5CF6" />
            </svg>
            Episodic event
          </span>
        </div>
      </div>
    </Card>
  )
}

function SarahOverviewTile({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: string
  detail: string
  icon: React.ReactNode
}) {
  return (
    <Card padding="sm">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-slate-50 text-slate-500 border border-slate-100">
          {icon}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
          <div className="text-xl font-semibold text-slate-800 tabular-nums mt-1">
            {value}
          </div>
          <div className="text-xs text-slate-500 mt-1 leading-snug">{detail}</div>
        </div>
      </div>
    </Card>
  )
}

function latestSarahMetric(id: string): SarahMetric | undefined {
  return sarahMetrics.find((metric) => metric.id === id)
}

function latestSarahValue(id: string): string {
  const metric = latestSarahMetric(id)
  if (!metric) return 'N/A'
  const current = metric.data[metric.data.length - 1]?.value ?? 0
  return `${formatSarahMetricValue(current, metric.unit)} ${metric.unit}`
}

function SarahOverviewSection() {
  return (
    <div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <SarahOverviewTile
          label="Record depth"
          value={`${sarahDataSummary.days.toLocaleString()} days`}
          detail={`${SARAH_RECORD_START} to ${SARAH_RECORD_END}`}
          icon={<Database className="w-4 h-4" />}
        />
        <SarahOverviewTile
          label="Glucose"
          value={latestSarahValue('fasting_glucose')}
          detail="CGM plus lab-confirmed metabolic trajectory"
          icon={<Gauge className="w-4 h-4" />}
        />
        <SarahOverviewTile
          label="Cycle context"
          value={`${sarahDataSummary.cycles} cycles`}
          detail="Recurring moderator for sleep and glucose"
          icon={<Calendar className="w-4 h-4" />}
        />
        <SarahOverviewTile
          label="Lab cadence"
          value={`${sarahDataSummary.labDraws} draws`}
          detail="Blood work confirms slower biomarker effects"
          icon={<FlaskConical className="w-4 h-4" />}
        />
      </div>

      <SarahCausalStoryGrid />
    </div>
  )
}

function SarahLabBiomarkerCard({ def }: { def: LabMetricDef }) {
  const draws = sarahRichLabs
    .filter((lab) => lab[def.key] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((lab) => ({ date: lab.date, value: lab[def.key] as number }))

  if (draws.length === 0) return null

  const latest = draws[draws.length - 1]
  const prev = draws.length >= 2 ? draws[draws.length - 2] : null
  const delta = prev ? latest.value - prev.value : 0

  return (
    <Card padding="sm" className="mb-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-medium text-slate-800">{def.name}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{def.description}</div>
        </div>
        {prev && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            {delta > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : delta < 0 ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <ArrowRight className="w-3 h-3" />
            )}
            <span>{delta >= 0 ? '+' : ''}{delta.toFixed(Math.abs(delta) < 2 ? 1 : 0)}</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-semibold font-mono text-slate-800">{latest.value}</span>
        <span className="text-sm text-slate-400">{def.unit}</span>
      </div>

      <ReferenceRangeBar
        value={latest.value}
        referenceRange={def.referenceRange}
        optimalRange={def.optimalRange}
      />

      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
          Draw History
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {draws.map((d) => (
            <div key={d.date} className="flex items-baseline gap-1.5">
              <span className="text-[10px] text-slate-400">{formatLabDate(d.date)}</span>
              <span className="text-xs font-mono font-medium text-slate-700">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function SarahLabBiomarkersSection() {
  return (
    <div>
      {LAB_SUBCATEGORY_ORDER.map((subcat) => {
        const metricsInGroup = LAB_METRICS.filter((m) => m.subcategory === subcat.key)
        const metricsWithData = metricsInGroup.filter((m) =>
          sarahRichLabs.some((lab) => lab[m.key] != null)
        )
        if (metricsWithData.length === 0) return null

        return (
          <div key={subcat.key} className="mb-6">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-3 px-1">
              {subcat.label}
            </div>
            {metricsWithData.map((def) => (
              <SarahLabBiomarkerCard key={def.key} def={def} />
            ))}
          </div>
        )
      })}

      <div className="mt-4 px-1 flex items-center gap-2 text-[10px] text-slate-400">
        <ProvenanceBadge kind="lab" label="Blood work" />
        <span>
          Last draw: {sarahRichLabs[sarahRichLabs.length - 1]?.date ?? 'N/A'} - {sarahDataSummary.labDraws} total
        </span>
      </div>
    </div>
  )
}

function SarahCausalStoryGrid() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {sarahCausalStories.map((story) => (
        <Card key={story.title} padding="sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] uppercase tracking-wider text-slate-500">
              {story.lever}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-300" />
            <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] uppercase tracking-wider text-emerald-700">
              {story.outcome}
            </span>
          </div>
          <div className="text-sm font-semibold text-slate-800">{story.title}</div>
          <p className="text-xs text-slate-500 mt-2 leading-snug">{story.evidence}</p>
          <p className="text-[11px] text-slate-400 mt-3 leading-snug">
            Contrast: {story.whyDifferentFromCaspian}
          </p>
        </Card>
      ))}
    </div>
  )
}

function SarahDataView() {
  const [activeCategory, setActiveCategory] = useState<SarahCategoryId>('overview')
  const activeDef = SARAH_CATEGORIES.find((c) => c.id === activeCategory) ?? SARAH_CATEGORIES[0]

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Raw streams - metabolic, endocrine, sleep, nutrition, environmental, episodic labs, and model-derived loads."
        hideHorizon
        actions={<DataModeToggle />}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <SarahDataCoverageCard />
        <CausalEvidenceMixCard />
        <EdgeLedAcquisitionCard />
        <div className="flex gap-6">
          <aside className="flex-shrink-0" style={{ width: '240px' }}>
            <SarahCategorySidebar active={activeCategory} onChange={setActiveCategory} />
          </aside>

          <div className="flex-1 min-w-0">
            {activeCategory !== 'overview' && (
              <div className="mb-4 flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: activeDef.color + '18' }}
                >
                  <activeDef.icon className="w-5 h-5" style={{ color: activeDef.color }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">{activeDef.label}</h2>
                  <p className="text-xs text-slate-400">{activeDef.metricCount}</p>
                </div>
              </div>
            )}

            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeCategory === 'overview' && <SarahOverviewSection />}
              {activeCategory === 'metabolic' && <SarahMetricSection categoryId="metabolic" color="#D4A857" />}
              {activeCategory === 'cycle' && <SarahMetricSection categoryId="cycle" color="#B88AC9" />}
              {activeCategory === 'sleep' && <SarahMetricSection categoryId="sleep" color="#7C9F8B" />}
              {activeCategory === 'nutrition' && <SarahMetricSection categoryId="nutrition" color="#C76B4D" />}
              {activeCategory === 'activity' && <SarahMetricSection categoryId="activity" color="#5BA8D4" />}
              {activeCategory === 'context' && <SarahMetricSection categoryId="context" color="#F97316" />}
              {activeCategory === 'body' && <SarahMetricSection categoryId="body" color="#5BA8D4" />}
              {activeCategory === 'labs' && <SarahLabBiomarkersSection />}
              {activeCategory === 'stories' && <SarahCausalStoryGrid />}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </PageLayout>
  )
}

function CohortDataPlaceholder() {
  const { participant, isLoading } = useParticipant()
  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="100-day timeseries · wearable + lifestyle signals"
        hideHorizon
        actions={<DataModeToggle />}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 mb-4">
            <Database className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-2">
            Raw data viewer coming soon
          </h3>
          <p className="text-sm text-slate-500 max-w-lg mx-auto mb-6">
            This participant's 100-day timeseries was used to produce the Bayesian insights
            and plans on the Protocols tab. A browsable raw-data view for the full
            {' '}1,188-participant cohort is in progress.
          </p>
          {isLoading ? (
            <p className="text-xs text-slate-400">Loading summary…</p>
          ) : participant ? (
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-left">
              <SummaryStat label="Cohort" value={participant.cohort.replace('cohort_', '').toUpperCase()} />
              <SummaryStat label="Age" value={participant.age != null ? String(participant.age) : '—'} />
              <SummaryStat label="Links tracked" value={String(participant.effects_bayesian.length)} />
            </div>
          ) : null}
        </Card>
      </motion.div>
    </PageLayout>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800 tabular-nums">{value}</span>
    </div>
  )
}

export function DataView() {
  const { namedPersonaId } = useActiveParticipant()
  if (namedPersonaId === 'caspian') return <CaspianDataView />
  if (namedPersonaId === 'sarah') return <SarahDataView />
  return <CohortDataPlaceholder />
}

export default DataView
