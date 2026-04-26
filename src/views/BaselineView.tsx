/**
 * Baseline — the factual state the Twin reasons from.
 *
 * Twin answers "what if I changed X?" — that framing only makes sense
 * when the user can see what their current state *is*. Baseline is the
 * companion view: today's loads, active regimes, outcomes at baseline,
 * and the actions the engine is tracking. Read-only.
 *
 * Load baselines come from `loads_today[key].baseline` (28-day rolling
 * mean). Biomarker and wearable baselines come from `outcome_baselines`
 * (most-recent draw for biomarkers, 14-day trailing mean for wearables).
 * Actions show today's value with `behavioral_sds[action]` as volatility.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  FlaskConical,
  Heart,
  Layers,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { PageLayout } from '@/components/layout'
import {
  DataModeToggle,
  MemberAvatar,
  PainterlyPageHeader,
  ProvenanceBadge,
} from '@/components/common'
import { Card } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { OUTCOME_META, canonicalOutcomeKey } from '@/components/portal/InsightRow'
import { formatOutcomeValue, formatClockTime } from '@/utils/rounding'
import type { LoadKey, RegimeKey } from '@/data/portal/types'

// ─── Labels ──────────────────────────────────────────────────────────

const LOAD_LABEL: Record<LoadKey, { label: string; unit: string; blurb: string }> = {
  acwr: { label: 'Acute:chronic ratio', unit: '', blurb: '7-day load ÷ 28-day load. >1.5 is a spike.' },
  ctl: { label: 'Chronic load', unit: '', blurb: '42-day training stress rolling mean.' },
  atl: { label: 'Acute load', unit: '', blurb: '7-day training stress rolling mean.' },
  tsb: { label: 'Training stress balance', unit: '', blurb: 'CTL − ATL. Negative = under strain.' },
  sleep_debt_14d: { label: 'Sleep debt (14d)', unit: 'hrs', blurb: 'Cumulative shortfall vs personal target.' },
  sri_7d: { label: 'Sleep regularity (7d)', unit: '', blurb: 'How consistent bed/wake times are.' },
  training_monotony: { label: 'Training monotony', unit: '', blurb: 'Weekly load mean ÷ SD. >2 is monotonous.' },
  training_consistency: { label: 'Training consistency', unit: '', blurb: 'Share of days with training.' },
}

const REGIME_LABEL: Record<RegimeKey, { label: string; color: string }> = {
  overreaching_state: { label: 'Overreaching', color: 'rose' },
  iron_deficiency_state: { label: 'Iron-deficient', color: 'amber' },
  sleep_deprivation_state: { label: 'Sleep-deprived', color: 'indigo' },
  inflammation_state: { label: 'Inflamed', color: 'orange' },
}

// Consumer/clinical split — drives the outcome tabs.
// Consumer = legible to a healthy adult (wearable metrics, mainstream labs).
// Clinical = specialist panel the user should see via a coach/physician.
const CONSUMER_OUTCOMES = new Set<string>([
  'hrv_daily', 'resting_hr', 'deep_sleep', 'sleep_quality', 'sleep_efficiency',
  'vo2_peak', 'body_fat_pct', 'body_mass_kg',
  'ldl', 'hdl', 'total_cholesterol', 'triglycerides', 'glucose', 'hba1c',
  'ferritin', 'hemoglobin', 'iron_total', 'b12', 'folate',
  'hscrp', 'testosterone', 'estradiol', 'cortisol',
])

// Action labels — mirror MANIPULABLE_NODES in Twin.
const ACTION_LABEL: Record<string, { label: string; unit: string; isClock?: boolean }> = {
  sleep_duration: { label: 'Sleep duration', unit: 'hrs' },
  running_volume: { label: 'Running volume', unit: 'km/day' },
  zone2_volume: { label: 'Zone 2 volume', unit: 'km/day' },
  training_volume: { label: 'Training volume', unit: 'hrs/day' },
  training_load: { label: 'Training load', unit: 'au' },
  steps: { label: 'Daily steps', unit: 'steps' },
  active_energy: { label: 'Active energy', unit: 'kcal/day' },
  dietary_protein: { label: 'Dietary protein', unit: 'g/day' },
  dietary_energy: { label: 'Dietary energy', unit: 'kcal/day' },
  bedtime: { label: 'Bedtime', unit: '', isClock: true },
}

// ─── Formatting helpers ──────────────────────────────────────────────

function formatLoadValue(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '—'
  const digits = Math.abs(value) >= 10 ? 1 : 2
  const rounded = value.toFixed(digits)
  return unit ? `${rounded} ${unit}` : rounded
}

function formatActionValueLocal(value: number, action: string): string {
  const meta = ACTION_LABEL[action]
  if (!meta) return value.toFixed(1)
  if (meta.isClock) return formatClockTime(value)
  if (action === 'steps') return Math.round(value).toLocaleString()
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2
  return value.toFixed(digits)
}

function formatOutcomeCanonical(value: number, outcomeKey: string): string {
  const canon = canonicalOutcomeKey(outcomeKey)
  return formatOutcomeValue(value, canon)
}

function zColor(z: number): string {
  const abs = Math.abs(z)
  if (abs < 0.5) return 'text-slate-500'
  if (abs < 1.5) return 'text-amber-600'
  return 'text-rose-600'
}

function ZBadge({ z }: { z: number }) {
  if (!Number.isFinite(z)) return null
  const abs = Math.abs(z)
  const Icon = abs < 0.5 ? ArrowRight : z > 0 ? ArrowUp : ArrowDown
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums', zColor(z))}>
      <Icon className="w-3 h-3" />
      {z >= 0 ? '+' : ''}{z.toFixed(1)}σ
    </span>
  )
}

// ─── Section components ──────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, blurb }: { icon: React.ElementType; title: string; blurb?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-slate-500" />
      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</div>
      {blurb && <div className="text-[11px] text-slate-400 truncate">{blurb}</div>}
    </div>
  )
}

interface LoadRowData {
  key: LoadKey
  value: number
  baseline: number
  sd: number
  z: number
  label: string
  unit: string
  blurb: string
}

function LoadsSection({ loads }: { loads: Partial<Record<LoadKey, LoadRowData>> }) {
  const rows = useMemo(
    () =>
      (Object.keys(LOAD_LABEL) as LoadKey[])
        .map((key) => loads[key])
        .filter((v): v is LoadRowData => v !== undefined),
    [loads],
  )

  if (rows.length === 0) {
    return (
      <Card>
        <div className="p-4">
          <SectionHeader icon={Layers} title="Active loads" />
          <div className="text-sm text-slate-400 italic">No load history available for this member.</div>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionHeader
            icon={Layers}
            title="Active loads"
            blurb="Today's value vs personal 28-day baseline."
          />
          <ProvenanceBadge kind="fitted" label="engine-derived" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
          {rows.map((r) => (
            <div key={r.key} className="rounded-md border border-slate-200 bg-white p-2.5">
              <div className="flex items-start justify-between gap-1 mb-1">
                <div className="text-[11px] font-semibold text-slate-700 truncate" title={r.blurb}>
                  {r.label}
                </div>
                <ZBadge z={r.z} />
              </div>
              <div className="flex items-baseline gap-1.5 tabular-nums">
                <div className="text-lg font-semibold text-slate-800">
                  {formatLoadValue(r.value, r.unit)}
                </div>
                <div className="text-[11px] text-slate-400">
                  vs {formatLoadValue(r.baseline, r.unit)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function RegimesSection({ activations }: { activations: Partial<Record<RegimeKey, number>> }) {
  const entries = useMemo(
    () =>
      (Object.keys(REGIME_LABEL) as RegimeKey[]).map((key) => ({
        key,
        prob: activations[key] ?? 0,
        meta: REGIME_LABEL[key],
      })),
    [activations],
  )

  const colorClass = (color: string, active: boolean) => {
    if (!active) return 'bg-slate-50 border-slate-200 text-slate-500'
    switch (color) {
      case 'rose':
        return 'bg-rose-50 border-rose-200 text-rose-800'
      case 'amber':
        return 'bg-amber-50 border-amber-200 text-amber-800'
      case 'indigo':
        return 'bg-indigo-50 border-indigo-200 text-indigo-800'
      case 'orange':
        return 'bg-orange-50 border-orange-200 text-orange-800'
      default:
        return 'bg-slate-50 border-slate-200 text-slate-600'
    }
  }

  return (
    <Card>
      <div className="p-4">
        <SectionHeader
          icon={Activity}
          title="Active regimes"
          blurb="Confounder states that shift what's recommended today."
        />
        <div className="flex flex-wrap gap-2">
          {entries.map(({ key, prob, meta }) => {
            const active = prob >= 0.5
            return (
              <div
                key={key}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                  colorClass(meta.color, active),
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    active ? 'bg-current' : 'bg-slate-300',
                  )}
                />
                {meta.label}
                <span className="tabular-nums opacity-70">
                  {(prob * 100).toFixed(0)}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

interface OutcomeCellData {
  key: string
  value: number
  noun: string
  unit: string
}

function OutcomesSection({
  baselines,
}: {
  baselines: Record<string, number>
}) {
  const [tab, setTab] = useState<'consumer' | 'clinical'>('consumer')

  const { consumer, clinical } = useMemo(() => {
    const cons: OutcomeCellData[] = []
    const clin: OutcomeCellData[] = []
    for (const [rawKey, value] of Object.entries(baselines)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      const key = canonicalOutcomeKey(rawKey)
      const meta = OUTCOME_META[key]
      if (!meta) continue
      const cell: OutcomeCellData = { key, value, noun: meta.noun, unit: meta.unit }
      if (CONSUMER_OUTCOMES.has(key)) cons.push(cell)
      else clin.push(cell)
    }
    const byNoun = (a: OutcomeCellData, b: OutcomeCellData) => a.noun.localeCompare(b.noun)
    cons.sort(byNoun)
    clin.sort(byNoun)
    return { consumer: cons, clinical: clin }
  }, [baselines])

  const rows = tab === 'consumer' ? consumer : clinical
  const otherCount = tab === 'consumer' ? clinical.length : consumer.length

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-slate-500" />
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Outcomes at baseline
            </div>
            <div className="text-[11px] text-slate-400">
              Wearables: 14-day mean · Biomarkers: most recent draw.
            </div>
          </div>
          <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[11px]">
            <button
              onClick={() => setTab('consumer')}
              className={cn(
                'px-2.5 py-1 transition-colors',
                tab === 'consumer'
                  ? 'bg-primary-50 text-primary-700'
                  : 'bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              Consumer · {consumer.length}
            </button>
            <button
              onClick={() => setTab('clinical')}
              className={cn(
                'px-2.5 py-1 transition-colors border-l border-slate-200',
                tab === 'clinical'
                  ? 'bg-primary-50 text-primary-700'
                  : 'bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              Clinical · {clinical.length}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-slate-400 italic py-2">
            {tab === 'consumer'
              ? `No consumer-panel baselines yet. ${otherCount} clinical values available.`
              : `No clinical-panel baselines yet. ${otherCount} consumer values available.`}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            {rows.map((cell) => {
              // Wearable outcomes (HRV, RHR, sleep architecture) come from
              // 14-day means; biomarkers come from lab draws. The split
              // mirrors the consumer/clinical sort.
              const provKind = CONSUMER_OUTCOMES.has(cell.key)
                ? cell.key.startsWith('sleep_') ||
                  cell.key === 'hrv_daily' ||
                  cell.key === 'resting_hr' ||
                  cell.key === 'vo2_peak'
                  ? 'wearable'
                  : 'lab'
                : 'lab'
              return (
                <div
                  key={cell.key}
                  className="rounded-md border border-stone-200 bg-white p-2"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div
                      className="text-[10px] text-slate-500 uppercase tracking-wide truncate"
                      title={cell.noun}
                    >
                      {cell.noun}
                    </div>
                    <ProvenanceBadge kind={provKind} dotOnly />
                  </div>
                  <div className="flex items-baseline gap-1 tabular-nums mt-0.5">
                    <div className="text-base font-semibold text-slate-800">
                      {formatOutcomeCanonical(cell.value, cell.key)}
                    </div>
                    {cell.unit && (
                      <div className="text-[10px] text-slate-400">{cell.unit}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

interface ActionRowData {
  key: string
  value: number
  sd: number | null
  label: string
  unit: string
  isClock: boolean
}

function ActionsSection({ rows }: { rows: ActionRowData[] }) {
  if (rows.length === 0) return null
  return (
    <Card>
      <div className="p-4">
        <SectionHeader
          icon={SlidersHorizontal}
          title="Today's actions"
          blurb="Current value · typical day-to-day variation."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {rows.map((r) => (
            <div key={r.key} className="rounded-md border border-slate-200 bg-white p-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide truncate">
                {r.label}
              </div>
              <div className="flex items-baseline gap-1 tabular-nums mt-0.5">
                <div className="text-base font-semibold text-slate-800">
                  {formatActionValueLocal(r.value, r.key)}
                </div>
                {r.unit && !r.isClock && <div className="text-[10px] text-slate-400">{r.unit}</div>}
              </div>
              {r.sd != null && r.sd > 0 && (
                <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                  ± {formatActionValueLocal(r.sd, r.key)} typical
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Today's state — loads, regimes, and outcomes your Twin reasons from."
        hideHorizon
      />
      <Card>
        <div className="p-8 text-center text-sm text-slate-500">
          Select a member to see their baseline.
        </div>
      </Card>
    </PageLayout>
  )
}

// ─── Main view ───────────────────────────────────────────────────────

export function BaselineView() {
  const { pid, displayName, cohort, persona } = useActiveParticipant()
  const { participant, isLoading } = useParticipant()

  const loadRows = useMemo<Partial<Record<LoadKey, LoadRowData>>>(() => {
    if (!participant?.loads_today) return {}
    const out: Partial<Record<LoadKey, LoadRowData>> = {}
    for (const key of Object.keys(LOAD_LABEL) as LoadKey[]) {
      const load = participant.loads_today[key]
      if (!load) continue
      const meta = LOAD_LABEL[key]
      out[key] = {
        key,
        value: load.value,
        baseline: load.baseline,
        sd: load.sd,
        z: load.z,
        label: meta.label,
        unit: meta.unit,
        blurb: meta.blurb,
      }
    }
    return out
  }, [participant])

  const actionRows = useMemo<ActionRowData[]>(() => {
    if (!participant) return []
    const out: ActionRowData[] = []
    for (const [key, meta] of Object.entries(ACTION_LABEL)) {
      const value = participant.current_values?.[key]
      if (typeof value !== 'number') continue
      const sd = participant.behavioral_sds?.[key]
      out.push({
        key,
        value,
        sd: typeof sd === 'number' ? sd : null,
        label: meta.label,
        unit: meta.unit,
        isClock: !!meta.isClock,
      })
    }
    return out
  }, [participant])

  if (pid == null) return <EmptyState />
  if (isLoading || !participant) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Today's state — loads, regimes, and outcomes your Twin reasons from."
          hideHorizon
        />
        <Card>
          <div className="p-8 flex items-center justify-center text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading baseline for {displayName}
          </div>
        </Card>
      </PageLayout>
    )
  }

  const baselines = participant.outcome_baselines ?? {}
  const activations = participant.regime_activations ?? {}

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Today's state — what Twin reasons from when you pull levers."
        hideHorizon
        actions={<DataModeToggle />}
      />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-3"
      >
        <LoadsSection loads={loadRows} />
        <RegimesSection activations={activations} />
        <OutcomesSection baselines={baselines} />
        <ActionsSection rows={actionRows} />

        <div className="pt-1 flex items-center gap-2 text-[11px] text-slate-400">
          <Heart className="w-3.5 h-3.5" />
          Baseline is read-only. To simulate a different state, use Twin.
        </div>
      </motion.div>
    </PageLayout>
  )
}

export default BaselineView
