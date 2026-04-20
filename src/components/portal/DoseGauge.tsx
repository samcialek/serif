import { cn } from '@/utils/classNames'
import { shapeFor, type DoseShape } from '@/data/scm/doseShapes'
import { formatActionValue } from '@/utils/rounding'

export type GaugeVariant = 'linear' | 'curve' | 'segmented' | 'minimal'

interface DoseGaugeProps {
  action: string
  currentValue: number
  nominalStep: number
  doseMultiplier: number
  doseBounded?: boolean
  variant: GaugeVariant
  /** When true, beneficial direction is achieved by a lower action value. */
  reverseAxis?: boolean
}

// Geometry helpers — map the engine's linear slope + sigmoid dose_multiplier
// onto a gauge position where 0 = current, 1 = "useful edge" for the shape.

function positionsFor(shape: DoseShape, dm: number, bounded: boolean) {
  // Clamp dose_multiplier to [0,1] defensively.
  const d = Math.max(0, Math.min(1, dm))

  if (shape === 'plateau_up') {
    // High dm ⇒ recommendation is early on the curve (still in linear zone).
    // Low  dm ⇒ recommendation has already saturated. Place rec accordingly.
    const recFrac = 0.25 + (1 - d) * 0.5 // 0.25 → 0.75
    const edgeFrac = 0.8 // knee / diminishing returns
    return { recFrac, edgeFrac, pastEdge: 'diminishing' as const, peakFrac: null as null | number }
  }
  if (shape === 'inverted_u') {
    // Engine recommends *toward* the peak; assume rec lands at the peak.
    return { recFrac: 0.5, edgeFrac: 0.5, pastEdge: 'reversing' as const, peakFrac: 0.5 as null | number }
  }
  // threshold
  return {
    recFrac: bounded ? 0.75 : 0.55,
    edgeFrac: 0.82,
    pastEdge: 'cliff' as const,
    peakFrac: null as null | number,
  }
}

export function DoseGauge(props: DoseGaugeProps) {
  switch (props.variant) {
    case 'linear':
      return <LinearBar {...props} />
    case 'curve':
      return <MiniCurve {...props} />
    case 'segmented':
      return <Segmented {...props} />
    case 'minimal':
      return <Minimal {...props} />
  }
}

// ── Variant A: linear bar with shaded zones ───────────────────────────────
function LinearBar({
  action,
  currentValue,
  nominalStep,
  doseMultiplier,
  doseBounded,
}: DoseGaugeProps) {
  const info = shapeFor(action)
  const { recFrac, edgeFrac, pastEdge, peakFrac } = positionsFor(
    info.shape,
    doseMultiplier,
    doseBounded ?? false,
  )
  const recValue = currentValue + nominalStep

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Dose-effect map</span>
        <span title={info.description} className="text-slate-500">
          {info.edgeLabel}
        </span>
      </div>
      <div className="relative h-8 rounded-md bg-slate-100 overflow-hidden">
        {/* Useful zone */}
        <div
          className="absolute inset-y-0 left-0 bg-emerald-200/60"
          style={{ width: `${edgeFrac * 100}%` }}
        />
        {/* Past-useful zone */}
        <div
          className={cn(
            'absolute inset-y-0',
            pastEdge === 'cliff'
              ? 'bg-rose-200/60'
              : pastEdge === 'reversing'
              ? 'bg-amber-200/60'
              : 'bg-slate-200/80',
          )}
          style={{ left: `${edgeFrac * 100}%`, right: 0 }}
        />
        {/* Peak marker (inverted-u) */}
        {peakFrac != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-emerald-600"
            style={{ left: `${peakFrac * 100}%` }}
            title="Optimal"
          />
        )}
        {/* Current dot at left edge */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-600 border-2 border-white shadow"
          style={{ left: '2px' }}
          title={`You are here: ${formatActionValue(currentValue, action)}`}
        />
        {/* Recommended dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary-600 border-2 border-white shadow"
          style={{ left: `calc(${recFrac * 100}% - 7px)` }}
          title={`Recommended: ${formatActionValue(recValue, action)}`}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-slate-600 mr-1 align-middle" />
          now {formatActionValue(currentValue, action)}
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-primary-600 mr-1 align-middle" />
          target {formatActionValue(recValue, action)}
        </span>
        <span className="text-slate-400">
          {pastEdge === 'cliff'
            ? 'past: threshold'
            : pastEdge === 'reversing'
            ? 'past: reverses'
            : 'past: flat'}
        </span>
      </div>
    </div>
  )
}

// ── Variant B: mini SVG curve of the actual shape ─────────────────────────
function MiniCurve({
  action,
  currentValue,
  nominalStep,
  doseMultiplier,
  doseBounded,
}: DoseGaugeProps) {
  const info = shapeFor(action)
  const { recFrac, peakFrac } = positionsFor(info.shape, doseMultiplier, doseBounded ?? false)
  const recValue = currentValue + nominalStep

  // Build a normalized curve y(x) on [0,1].
  const points: Array<[number, number]> = []
  const N = 40
  for (let i = 0; i <= N; i++) {
    const x = i / N
    let y: number
    if (info.shape === 'plateau_up') {
      // Sigmoid knee near 0.8
      y = Math.min(1, (2 / Math.PI) * Math.atan((x / 0.3) * 1.5))
    } else if (info.shape === 'inverted_u') {
      // Bell centered at 0.5
      const d = (x - 0.5) / 0.3
      y = Math.exp(-d * d)
    } else {
      // Threshold: linear rise then cliff fall
      y = x < 0.82 ? x / 0.82 : Math.max(0, 1 - (x - 0.82) * 4)
    }
    points.push([x, y])
  }
  const W = 160
  const H = 44
  const path = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(x * W).toFixed(1)},${((1 - y) * (H - 8) + 4).toFixed(1)}`)
    .join(' ')
  const yAt = (frac: number) => {
    const p = points[Math.round(frac * N)]
    return (1 - p[1]) * (H - 8) + 4
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Response curve</span>
        <span className="text-slate-500">{info.edgeLabel}</span>
      </div>
      <svg width={W} height={H} className="block">
        {/* Axis */}
        <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="#e2e8f0" strokeWidth="1" />
        <path d={path} fill="none" stroke="#6366f1" strokeWidth="1.75" />
        {/* Fill under curve */}
        <path d={`${path} L${W},${H - 2} L0,${H - 2} Z`} fill="#6366f1" fillOpacity="0.08" />
        {/* Peak marker for inverted_u */}
        {peakFrac != null && (
          <line
            x1={peakFrac * W}
            y1="0"
            x2={peakFrac * W}
            y2={H - 2}
            stroke="#059669"
            strokeWidth="1"
            strokeDasharray="2,2"
          />
        )}
        {/* Current dot at 0 */}
        <circle cx="2" cy={yAt(0)} r="3.5" fill="#475569" stroke="white" strokeWidth="1.5" />
        {/* Recommended dot */}
        <circle cx={recFrac * W} cy={yAt(recFrac)} r="4" fill="#4f46e5" stroke="white" strokeWidth="1.5" />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
        <span>now {formatActionValue(currentValue, action)}</span>
        <span className="text-primary-700">
          target {formatActionValue(recValue, action)}
        </span>
      </div>
    </div>
  )
}

// ── Variant C: segmented 4-zone bar (battery indicator) ───────────────────
function Segmented({
  action,
  currentValue,
  nominalStep,
  doseMultiplier,
  doseBounded,
}: DoseGaugeProps) {
  const info = shapeFor(action)
  const { recFrac } = positionsFor(info.shape, doseMultiplier, doseBounded ?? false)
  const recValue = currentValue + nominalStep

  // 5 segments: ramping / useful / knee / diminishing / flat
  const segments = [
    { label: 'Ramping', color: 'bg-emerald-300' },
    { label: 'Useful', color: 'bg-emerald-500' },
    { label: 'Knee', color: 'bg-amber-400' },
    { label: 'Diminishing', color: 'bg-amber-300' },
    { label: info.shape === 'inverted_u' ? 'Reversing' : info.shape === 'threshold' ? 'Harm' : 'Flat', color: info.shape === 'inverted_u' || info.shape === 'threshold' ? 'bg-rose-300' : 'bg-slate-300' },
  ]
  const segActive = Math.min(4, Math.floor(recFrac * segments.length))

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>Effect zone</span>
        <span className="text-slate-500">{info.edgeLabel}</span>
      </div>
      <div className="flex gap-1 h-6">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              'flex-1 rounded-sm flex items-center justify-center text-[9px] font-medium',
              i === segActive ? s.color + ' text-slate-900' : 'bg-slate-100 text-slate-400',
            )}
            title={s.label}
          >
            {i === segActive && s.label}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
        <span>now {formatActionValue(currentValue, action)}</span>
        <span>→ target {formatActionValue(recValue, action)}</span>
      </div>
    </div>
  )
}

// ── Variant D: minimal icon + text, no bar ────────────────────────────────
function Minimal({ action, currentValue, nominalStep, doseMultiplier, doseBounded }: DoseGaugeProps) {
  const info = shapeFor(action)
  const { recFrac } = positionsFor(info.shape, doseMultiplier, doseBounded ?? false)
  const recValue = currentValue + nominalStep

  const position =
    recFrac < 0.4
      ? 'early in useful range'
      : recFrac < 0.7
      ? 'approaching the ' + (info.shape === 'inverted_u' ? 'peak' : 'knee')
      : 'near the edge of useful range'

  const ShapeIcon = () => {
    if (info.shape === 'plateau_up') {
      return (
        <svg viewBox="0 0 24 16" className="w-8 h-5">
          <path d="M1,15 Q6,14 10,8 T22,2" fill="none" stroke="#4f46e5" strokeWidth="1.5" />
        </svg>
      )
    }
    if (info.shape === 'inverted_u') {
      return (
        <svg viewBox="0 0 24 16" className="w-8 h-5">
          <path d="M1,15 Q6,1 12,1 T22,15" fill="none" stroke="#4f46e5" strokeWidth="1.5" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 16" className="w-8 h-5">
        <path d="M1,15 L17,3 L17,15 L22,15" fill="none" stroke="#dc2626" strokeWidth="1.5" />
      </svg>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5">
        <ShapeIcon />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-400">{info.edgeLabel}</p>
        <p className="text-xs text-slate-700 leading-snug">
          <span className="font-medium">{formatActionValue(currentValue, action)}</span>{' '}
          <span className="text-slate-400">→</span>{' '}
          <span className="font-medium text-primary-700">{formatActionValue(recValue, action)}</span>
          <span className="text-slate-500"> — {position}</span>
        </p>
      </div>
    </div>
  )
}

export default DoseGauge
