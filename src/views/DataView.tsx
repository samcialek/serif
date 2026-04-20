import { useState } from 'react'
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
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, MetricCard } from '@/components/common'
import { DataCadenceChart } from '@/components/charts'
import { MetricSparkline } from '@/components/clients/MetricSparkline'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
import {
  oronTimeSeries,
  oronLabs,
  oronPersona,
  LAB_METRICS,
  LAB_SUBCATEGORY_ORDER,
  computeStats,
  type TimeSeriesMetric,
  type LabMetricDef,
} from '@/data/oronRawData'
// LabResult type available from @/types if needed

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

type CategoryId = 'overview' | 'sleep' | 'activity' | 'heart' | 'labs' | 'body'

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
]

const CATEGORY_TO_TS: Record<string, TimeSeriesMetric['category']> = {
  sleep: 'sleep',
  activity: 'activity',
  heart: 'heart',
  body: 'body',
}

// Map heart category to both 'heart' and 'hrv' time series categories
function getMetricsForCategory(catId: CategoryId): TimeSeriesMetric[] {
  if (catId === 'heart') {
    return oronTimeSeries.filter((m) => m.category === 'heart' || m.category === 'hrv')
  }
  const tsCat = CATEGORY_TO_TS[catId]
  if (!tsCat) return []
  return oronTimeSeries.filter((m) => m.category === tsCat)
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
    labs: oronLabs[0]?.date ?? '',
    body: '',
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
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-400">
        <span>{metric.source}</span>
        {metric.referenceRange && (
          <>
            <span>|</span>
            <span>
              Ref: {metric.referenceRange.low}–{metric.referenceRange.high} {metric.unit}
            </span>
          </>
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
  // Gather all values from oronLabs for this key, chronologically
  const draws = oronLabs
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
  const cm = oronPersona.currentMetrics
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
              Temporal coverage of Oron's connected data sources — 4,000+ days across 7 streams
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
          oronLabs.some((lab) => lab[m.key] != null)
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
      <div className="mt-4 px-1 text-[10px] text-slate-400">
        Last lab draw: {oronLabs[0]?.date ?? 'N/A'} | {oronPersona.labDraws} total draws | Source:
        Quest Labs
      </div>
    </div>
  )
}

// ============================================================================
// MAIN VIEW
// ============================================================================

function OronDataView() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('overview')
  const activeDef = CATEGORIES.find((c) => c.id === activeCategory)!

  return (
    <PageLayout
      title="Oron's Raw Data"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <DataCoverageCadenceCard />
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
            </motion.div>
          </div>
        </div>
      </motion.div>
    </PageLayout>
  )
}

function SyntheticDataPlaceholder({ displayName }: { displayName: string }) {
  const { participant, isLoading } = useParticipant()
  return (
    <PageLayout
      title={`${displayName}'s Data`}
      subtitle="Synthetic 100-day timeseries · wearable + lifestyle signals"
    >
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
            This participant's synthetic 100-day timeseries was used to produce the Bayesian
            insights and plans on the Protocols tab. A browsable raw-data view for the full
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
  const { namedPersonaId, displayName } = useActiveParticipant()
  if (namedPersonaId === 'oron') return <OronDataView />
  return <SyntheticDataPlaceholder displayName={displayName} />
}

export default DataView
