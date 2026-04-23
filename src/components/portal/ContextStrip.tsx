/**
 * Today's-context strip — rolling-load values (ACWR, sleep debt, SRI,
 * consistency) alongside the person's own 28-day baseline. Used on its
 * own above the Insights list, and embedded (via <LoadGrid />) inside
 * the unified TodayContext panel on the Protocols tab.
 */

import type { LoadKey, LoadValue } from '@/data/portal/types'

type StatusBand = 'good' | 'neutral' | 'watch' | 'elevated'

const BAND_STYLES: Record<StatusBand, { chip: string; label: string }> = {
  good: { chip: 'bg-emerald-50 border-emerald-200 text-emerald-900', label: 'text-emerald-700' },
  neutral: { chip: 'bg-slate-50 border-slate-200 text-slate-900', label: 'text-slate-600' },
  watch: { chip: 'bg-amber-50 border-amber-200 text-amber-900', label: 'text-amber-700' },
  elevated: { chip: 'bg-rose-50 border-rose-200 text-rose-900', label: 'text-rose-700' },
}

interface LoadSpec {
  key: LoadKey
  label: string
  format: (v: number) => string
  band: (v: number) => StatusBand
  hint: (v: LoadValue) => string | null
}

const LOAD_SPECS: LoadSpec[] = [
  {
    key: 'acwr',
    label: 'ACWR',
    format: (v) => v.toFixed(2),
    band: (v) => (v < 0.8 ? 'watch' : v > 1.3 ? 'elevated' : 'good'),
    hint: (lv) => {
      if (lv.value < 0.8) return 'detraining — acute load < 80% of chronic'
      if (lv.value > 1.5) return 'danger zone — injury risk elevated'
      if (lv.value > 1.3) return 'high — monitor fatigue'
      return 'balanced acute vs chronic load'
    },
  },
  {
    key: 'sleep_debt_14d',
    label: 'Sleep debt (14d)',
    format: (v) => `${v.toFixed(1)}h`,
    band: (v) => (v < 3 ? 'good' : v < 7 ? 'watch' : 'elevated'),
    hint: (lv) => {
      if (lv.value < 3) return 'within normal range'
      if (lv.value < 7) return 'moderate accumulated deficit'
      return 'substantial deficit — HRV & immunity impacted'
    },
  },
  {
    key: 'sri_7d',
    label: 'Sleep regularity',
    format: (v) => Math.round(v).toString(),
    band: (v) => (v >= 85 ? 'good' : v >= 70 ? 'neutral' : 'watch'),
    hint: (lv) => {
      if (lv.value >= 85) return 'consistent schedule'
      if (lv.value >= 70) return 'some day-to-day drift'
      return 'irregular — circadian alignment at risk'
    },
  },
  {
    key: 'tsb',
    label: 'Training balance',
    format: (v) => (v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0)),
    band: (v) => (v > -10 && v < 15 ? 'good' : v < -25 ? 'elevated' : 'neutral'),
    hint: (lv) => {
      if (lv.value < -25) return 'highly fatigued — taper soon'
      if (lv.value < -10) return 'productive fatigue'
      if (lv.value > 25) return 'very fresh — detraining risk'
      return 'balanced CTL vs ATL'
    },
  },
  {
    key: 'training_consistency',
    label: 'Consistency',
    format: (v) => `${Math.round(v * 100)}%`,
    band: (v) => (v >= 0.7 ? 'good' : v >= 0.4 ? 'neutral' : 'watch'),
    hint: (lv) => {
      if (lv.value >= 0.7) return 'trained most days (90d window)'
      if (lv.value >= 0.4) return 'moderate training frequency'
      return 'low frequency — adaptation stalled'
    },
  },
]

function formatDeviation(lv: LoadValue, key: LoadKey): string | null {
  // Ratio for multiplicative loads, z for additive ones.
  const useRatio: LoadKey[] = ['acwr', 'training_monotony', 'training_consistency']
  if (useRatio.includes(key)) {
    const delta = lv.ratio - 1
    if (Math.abs(delta) < 0.02) return null
    const pct = Math.round(delta * 100)
    return `${pct > 0 ? '+' : ''}${pct}% vs base`
  }
  if (Math.abs(lv.z) < 0.3) return null
  const arrow = lv.z > 0 ? '↑' : '↓'
  return `${arrow} ${Math.abs(lv.z).toFixed(1)}σ`
}

/** Just the load-chip grid, without an outer card. Used on its own
 * inside TodayContext (Protocols tab) and wrapped with a card header
 * by ContextStrip (Insights tab). */
export function LoadGrid({
  loads,
}: {
  loads: Partial<Record<LoadKey, LoadValue>>
}) {
  const entries = LOAD_SPECS.map((spec) => ({ spec, lv: loads[spec.key] })).filter(
    (e): e is { spec: LoadSpec; lv: LoadValue } => e.lv !== undefined,
  )
  if (entries.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {entries.map(({ spec, lv }) => {
        const band = spec.band(lv.value)
        const styles = BAND_STYLES[band]
        const dev = formatDeviation(lv, spec.key)
        const hint = spec.hint(lv)
        return (
          <div
            key={spec.key}
            className={`rounded-lg border px-2.5 py-2 ${styles.chip}`}
            title={hint ?? undefined}
          >
            <div className={`text-[10px] uppercase tracking-wide font-semibold ${styles.label}`}>
              {spec.label}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-base font-semibold tabular-nums">
                {spec.format(lv.value)}
              </div>
              {dev && (
                <div className={`text-[10px] ${styles.label} tabular-nums`}>{dev}</div>
              )}
            </div>
            {hint && (
              <div className={`mt-0.5 text-[10px] leading-tight ${styles.label}`}>{hint}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ContextStrip({
  loads,
}: {
  loads: Partial<Record<LoadKey, LoadValue>>
}) {
  const entries = LOAD_SPECS.map((spec) => loads[spec.key]).filter(Boolean)
  if (entries.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white">
      <div className="px-3 py-2 border-b border-slate-100 flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Today's context
        </div>
        <div className="text-[10px] text-slate-400">
          rolling loads · personal baseline
        </div>
      </div>
      <div className="p-3">
        <LoadGrid loads={loads} />
      </div>
    </div>
  )
}
