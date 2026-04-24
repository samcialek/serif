/**
 * Tuned-from-Twin protocols — horizontal strip of cards rendered above
 * the algorithmic schedule. Each card is a TwinSnapshot saved from the
 * Twin's "Save as protocol" button: the lever interventions become
 * chips, and the predicted outcomes become signed-delta pills so the
 * coach can compare proposals at a glance.
 *
 * Lives in components/portal because both Protocols layouts (lanes +
 * visual) need to render it identically.
 */

import { Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { TwinSnapshot } from '@/stores/twinSnapshotStore'

const ACTION_LABEL: Record<string, string> = {
  steps: 'Steps',
  zone2_minutes: 'Z2-3',
  zone4_5_minutes: 'Z4-5',
  caffeine_mg: 'Caffeine',
  caffeine_timing: 'Caf cutoff',
  alcohol_units: 'Alcohol',
  alcohol_timing: 'Alc cutoff',
  dietary_protein: 'Protein',
  dietary_energy: 'Calories',
  bedtime: 'Bedtime',
  sleep_duration: 'Sleep hrs',
  sleep_quality: 'Sleep qual',
  resistance_training_minutes: 'Resistance',
  supp_omega3: 'Omega-3',
  supp_magnesium: 'Magnesium',
  supp_vitamin_d: 'Vitamin D',
  supp_b_complex: 'B-complex',
  supp_creatine: 'Creatine',
}

const ACTION_UNIT: Record<string, string> = {
  steps: '',
  zone2_minutes: 'min',
  zone4_5_minutes: 'min',
  caffeine_mg: 'mg',
  caffeine_timing: 'h',
  alcohol_units: 'u',
  alcohol_timing: 'h',
  dietary_protein: 'g',
  dietary_energy: 'kcal',
  bedtime: '',
  sleep_duration: 'h',
  sleep_quality: '%',
  resistance_training_minutes: 'min/wk',
}

function formatActionDelta(
  nodeId: string,
  value: number,
  originalValue: number,
): string {
  const label = ACTION_LABEL[nodeId] ?? nodeId
  if (nodeId.startsWith('supp_')) {
    if (value >= 0.5 && originalValue < 0.5) return `+ ${label}`
    if (value < 0.5 && originalValue >= 0.5) return `- ${label}`
    return label
  }
  const unit = ACTION_UNIT[nodeId] ?? ''
  const fmt = (v: number) =>
    Math.abs(v) >= 100 ? Math.round(v).toString() : v.toFixed(1)
  const arrow = value > originalValue ? '↑' : value < originalValue ? '↓' : '·'
  return `${label} ${arrow} ${fmt(value)}${unit ? ' ' + unit : ''}`
}

export function TunedProtocolsSection({
  snapshots,
  onRemove,
}: {
  snapshots: TwinSnapshot[]
  onRemove: (id: string) => void
}) {
  if (snapshots.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-4 flex items-center gap-3"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <Sparkles className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-slate-700">
            No tuned protocols yet
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Open the{' '}
            <Link to="/twin" className="text-sky-600 hover:underline">
              Twin
            </Link>
            , drag a few levers (or use ⚡ Optimize), then click{' '}
            <span className="font-medium">Save as protocol</span>.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3
          className="text-[13px] font-medium text-slate-700 flex items-center gap-1.5"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
          Tuned protocols ({snapshots.length})
        </h3>
        <Link
          to="/twin"
          className="text-[11px] text-sky-600 hover:underline"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          Tune another →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {snapshots.map((snap) => (
          <TunedProtocolCard key={snap.id} snap={snap} onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}

function TunedProtocolCard({
  snap,
  onRemove,
}: {
  snap: TwinSnapshot
  onRemove: (id: string) => void
}) {
  const date = new Date(snap.createdAt)
  const horizonText = snap.atDays >= 30 ? `${Math.round(snap.atDays / 30)}-mo` : `${snap.atDays}-d`
  const chipCap = 6
  const visibleInterventions = snap.interventions.slice(0, chipCap)
  const overflow = snap.interventions.length - visibleInterventions.length
  const visibleOutcomes = snap.outcomes.slice(0, 4)
  return (
    <div
      className="rounded-xl bg-white p-4 hover:shadow-sm transition-shadow"
      style={{
        border: '1px solid #f0e9d8',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-800 truncate">
            {snap.label}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
            {snap.regime === 'longevity' ? 'Longevity' : 'Quotidian'} · {horizonText}{' '}
            horizon · {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </div>
        </div>
        <button
          onClick={() => onRemove(snap.id)}
          className="text-slate-300 hover:text-rose-500 transition-colors"
          title="Delete this snapshot"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {visibleInterventions.map((iv) => (
          <span
            key={iv.nodeId}
            className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md text-[10px] tabular-nums"
            style={{
              background: '#f8f5ed',
              border: '1px solid #efe6d6',
              color: '#5b524a',
            }}
          >
            {formatActionDelta(iv.nodeId, iv.value, iv.originalValue)}
          </span>
        ))}
        {overflow > 0 && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] text-slate-500"
            style={{ background: '#f5f5f4' }}
          >
            +{overflow} more
          </span>
        )}
      </div>

      {visibleOutcomes.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2 border-t border-slate-100">
          {visibleOutcomes.map((o) => {
            const tc =
              o.tone === 'benefit'
                ? '#4A8AB5'
                : o.tone === 'harm'
                  ? '#8B4830'
                  : '#847764'
            const sign = o.delta > 0 ? '+' : '−'
            const eps = Math.pow(10, -o.decimals - 1)
            const display =
              Math.abs(o.delta) <= eps
                ? '—'
                : `${sign}${Math.abs(o.delta).toFixed(o.decimals)}`
            return (
              <div
                key={o.id}
                className="flex flex-col leading-tight"
                style={{ minWidth: 56 }}
              >
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">
                  {o.label}
                </span>
                <span
                  className="text-[12px] tabular-nums"
                  style={{ color: tc, fontWeight: 500 }}
                >
                  {display}
                  {o.unit && (
                    <span className="text-[9px] ml-0.5 opacity-75">{o.unit}</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-100">
          No outcome deltas captured.
        </div>
      )}
    </div>
  )
}

export default TunedProtocolsSection
