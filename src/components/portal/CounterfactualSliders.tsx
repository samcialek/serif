/**
 * CounterfactualSliders — "what if" probe for the twin-SEM pick.
 *
 * The twin-SEM picker reads regime_activations directly (for penalty
 * terms), and buildDailyProtocol reads them to gate items (iron-support,
 * anti-inflammatory) and tweak offsets (caffeine cutoff). These four
 * knobs are the only ones that actually reshape the protocol, so the
 * slider panel exposes them directly.
 *
 * State shape:
 *   overrides = { regime_key: number } — only entries the user has moved.
 *   Empty overrides ⇒ no counterfactual active; real picks render.
 *   Any entry set ⇒ effectiveParticipant is participant with regimes
 *   merged from overrides; pickOptimalSchedule reruns against that.
 *
 * Load sliders are intentionally NOT in v1. Loads feed regimes upstream
 * in the backend DAG but the load→regime mapping isn't mirrored in TS
 * yet; a regime slider is a direct effect on the pick, which is the
 * right primitive for this first cut.
 */

import { RotateCcw } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { RegimeKey } from '@/data/portal/types'

export type RegimeOverrides = Partial<Record<RegimeKey, number>>

interface RegimeSpec {
  key: RegimeKey
  label: string
  hint: string
}

const REGIME_SPECS: RegimeSpec[] = [
  {
    key: 'sleep_deprivation_state',
    label: 'Sleep-deprived',
    hint: 'Drives caffeine-cutoff offset, wind-down emphasis, bedtime penalty.',
  },
  {
    key: 'overreaching_state',
    label: 'Overreaching',
    hint: 'Penalises high-TRIMP sessions in the twin-SEM pick.',
  },
  {
    key: 'inflammation_state',
    label: 'Inflamed',
    hint: 'Gates the anti-inflammatory emphasis item ≥ 30%.',
  },
  {
    key: 'iron_deficiency_state',
    label: 'Iron-deficient',
    hint: 'Gates the iron-support window ≥ 20%; penalises run volume.',
  },
]

interface SliderProps {
  spec: RegimeSpec
  baseline: number
  override: number | undefined
  onChange: (value: number | undefined) => void
}

function RegimeSlider({ spec, baseline, override, onChange }: SliderProps) {
  const current = override ?? baseline
  const isChanged = override !== undefined && Math.abs(override - baseline) > 0.005
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2.5 transition-colors',
        isChanged
          ? 'bg-indigo-50 border-indigo-200'
          : 'bg-white border-slate-200',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-600">
            {spec.label}
          </span>
          {isChanged && (
            <span className="text-[10px] text-indigo-700 tabular-nums whitespace-nowrap">
              {Math.round(baseline * 100)}% → {Math.round(current * 100)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'text-sm font-semibold tabular-nums',
              isChanged ? 'text-indigo-700' : 'text-slate-700',
            )}
          >
            {Math.round(current * 100)}%
          </span>
          {isChanged && (
            <button
              onClick={() => onChange(undefined)}
              className="text-slate-400 hover:text-slate-700 p-0.5"
              title="Revert to baseline"
              aria-label={`Revert ${spec.label} to baseline`}
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="relative">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={current}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={cn(
            'w-full h-1.5 rounded-full appearance-none cursor-pointer',
            'bg-slate-200',
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3.5',
            '[&::-webkit-slider-thumb]:h-3.5',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-indigo-600',
            '[&::-webkit-slider-thumb]:shadow',
            '[&::-moz-range-thumb]:w-3.5',
            '[&::-moz-range-thumb]:h-3.5',
            '[&::-moz-range-thumb]:rounded-full',
            '[&::-moz-range-thumb]:bg-indigo-600',
            '[&::-moz-range-thumb]:border-0',
          )}
        />
        {/* Baseline marker */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-slate-500 rounded"
          style={{ left: `calc(${baseline * 100}% - 1px)` }}
          title={`Baseline ${Math.round(baseline * 100)}%`}
        />
      </div>
      <p className="text-[10px] text-slate-500 leading-snug mt-1">{spec.hint}</p>
    </div>
  )
}

interface Props {
  /** Real regime activations from the participant export. */
  baselines: Partial<Record<RegimeKey, number>>
  /** Current override map (empty ⇒ no counterfactual). */
  overrides: RegimeOverrides
  /** Called with full override map after any slider change. */
  onOverridesChange: (next: RegimeOverrides) => void
}

export function CounterfactualSliders({
  baselines,
  overrides,
  onOverridesChange,
}: Props) {
  const setOne = (key: RegimeKey, value: number | undefined): void => {
    const next: RegimeOverrides = { ...overrides }
    if (value === undefined) {
      delete next[key]
    } else {
      next[key] = value
    }
    onOverridesChange(next)
  }
  const resetAll = (): void => onOverridesChange({})
  const changedCount = Object.keys(overrides).length

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-3 py-2 border-b border-slate-100 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Counterfactual: what if…
          </div>
          <div className="text-[10px] text-slate-400">
            drag a regime activation, watch today's protocol re-pick
          </div>
        </div>
        {changedCount > 0 && (
          <button
            onClick={resetAll}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
          >
            <RotateCcw className="w-3 h-3" />
            Reset {changedCount}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
        {REGIME_SPECS.map((spec) => (
          <RegimeSlider
            key={spec.key}
            spec={spec}
            baseline={baselines[spec.key] ?? 0}
            override={overrides[spec.key]}
            onChange={(v) => setOne(spec.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

export default CounterfactualSliders
