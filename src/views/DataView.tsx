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
  Gauge,
  CloudSun,
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, MetricCard, MemberAvatar } from '@/components/common'
import { DataCadenceChart } from '@/components/charts'
import { MetricSparkline } from '@/components/clients/MetricSparkline'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { useParticipant } from '@/hooks/useParticipant'
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
  { id: 'loads', label: 'Rolling loads', icon: Gauge, color: '#6366f1', metricCount: '8 metrics · 14d' },
  { id: 'environment', label: 'Environment', icon: CloudSun, color: '#f59e0b', metricCount: '5 metrics · 14d' },
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
              Temporal coverage of Caspian's connected data sources — 4,000+ days across 7 streams
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
            {spec.name}
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
        <span>{source}</span>
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
            source="Synthetic · cohort-keyed weather model · 14 days"
          />
        )
      })}
      <div className="mt-4 px-1 text-[10px] text-slate-400 leading-snug">
        Synthetic placeholder — deterministic sinusoidal model keyed on
        cohort region (Delhi / Abu Dhabi / temperate) modulated by day-of-year.
        The shape is production-ready: swap
        backend/serif_scm/loads.py:weather_for_day for a real weather API
        and the exports, UI, and BART confounder adjustment
        (CONFOUNDERS_BY_OUTCOME) all keep working unchanged.
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
      <div className="mt-4 px-1 text-[10px] text-slate-400">
        Last lab draw: {caspianLabs[0]?.date ?? 'N/A'} | {caspianPersona.labDraws} total draws | Source:
        Quest Labs
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
    <PageLayout
      title="Caspian's Raw Data"
      titleAccessory={
        <MemberAvatar persona={caspianPersona} displayName={caspianPersona.name} size="lg" />
      }
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

function SyntheticDataPlaceholder({ displayName }: { displayName: string }) {
  const { persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()
  return (
    <PageLayout
      title={`${displayName}'s Data`}
      titleAccessory={
        <MemberAvatar persona={persona} displayName={displayName} size="lg" />
      }
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
  if (namedPersonaId === 'caspian') return <CaspianDataView />
  return <SyntheticDataPlaceholder displayName={displayName} />
}

export default DataView
