/**
 * CausalSparkline — inline 14-day trend of a single load driving a
 * ProtocolItem. Tiny, wordless, picks up a severity tint from today's
 * band so the eye reads "rising into elevated" vs "steady in good".
 *
 * Inputs come from participant.loads_history; the caller picks the
 * driving load (first of ProtocolItemContext.driving_loads, by severity
 * rank). Hidden by the caller when no history is available.
 */

import { useMemo } from 'react'
import { cn } from '@/utils/classNames'
import type { LoadKey } from '@/data/portal/types'
import { loadSeverity } from '@/utils/dailyProtocol'
import type { LoadSeverity } from '@/utils/dailyProtocol'
import { LOAD_ICONS } from '@/utils/loadIcons'

interface Props {
  series: number[]
  loadKey: LoadKey
  /** Rendered width in pixels. Height is derived (≈ 1:3.5 ratio). */
  width?: number
  /** Label prefix shown before the value — e.g. "ACWR". */
  label?: string
  /** Optional: override severity for the today dot + line tint. */
  severityOverride?: LoadSeverity
}

const STROKE: Record<LoadSeverity, string> = {
  good: '#10b981', // emerald-500
  neutral: '#64748b', // slate-500
  watch: '#f59e0b', // amber-500
  elevated: '#f43f5e', // rose-500
}

const FILL: Record<LoadSeverity, string> = {
  good: '#d1fae5', // emerald-100
  neutral: '#e2e8f0', // slate-200
  watch: '#fef3c7', // amber-100
  elevated: '#ffe4e6', // rose-100
}

function formatValue(key: LoadKey, value: number): string {
  switch (key) {
    case 'acwr':
    case 'training_monotony':
      return value.toFixed(2)
    case 'training_consistency':
      return `${Math.round(value * 100)}%`
    case 'sleep_debt_14d':
      return `${value.toFixed(1)}h`
    case 'sri_7d':
      return Math.round(value).toString()
    case 'tsb':
      return value >= 0 ? `+${value.toFixed(0)}` : value.toFixed(0)
    default:
      return value.toFixed(1)
  }
}

export function CausalSparkline({
  series,
  loadKey,
  width = 56,
  label,
  severityOverride,
}: Props) {
  const height = Math.round(width / 3.5)
  const padding = 2

  const geom = useMemo(() => {
    if (series.length < 2) return null
    const min = Math.min(...series)
    const max = Math.max(...series)
    const range = max - min
    const n = series.length

    // If flat, draw a centered horizontal line so the user sees stability.
    if (range < 1e-9) {
      const y = height / 2
      return {
        path: `M ${padding} ${y} L ${width - padding} ${y}`,
        area: '',
        points: series.map((_, i) => ({
          x: padding + ((width - padding * 2) * i) / Math.max(1, n - 1),
          y,
        })),
      }
    }

    const xFor = (i: number): number =>
      padding + ((width - padding * 2) * i) / Math.max(1, n - 1)
    const yFor = (v: number): number => {
      const norm = (v - min) / range
      return height - padding - norm * (height - padding * 2)
    }

    const points = series.map((v, i) => ({ x: xFor(i), y: yFor(v) }))
    const path = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')
    const area = `${path} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`
    return { path, area, points }
  }, [series, width, height])

  if (!geom || series.length < 2) return null

  const todayValue = series[series.length - 1]
  const severity = severityOverride ?? loadSeverity(loadKey, todayValue)
  const stroke = STROKE[severity]
  const fill = FILL[severity]
  const todayPoint = geom.points[geom.points.length - 1]
  const iconSpec = LOAD_ICONS[loadKey]
  const Icon = iconSpec.icon
  const tooltip = `${label ?? iconSpec.label}: ${formatValue(loadKey, todayValue)} (14d trend)`

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[10px] tabular-nums text-slate-600',
      )}
      title={tooltip}
    >
      <Icon className="w-3 h-3 flex-shrink-0 text-slate-600" aria-hidden />
      <svg
        width={width}
        height={height}
        className="flex-shrink-0"
        aria-hidden
      >
        <path d={geom.area} fill={fill} opacity={0.6} />
        <path
          d={geom.path}
          stroke={stroke}
          strokeWidth={1.25}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={todayPoint.x}
          cy={todayPoint.y}
          r={1.75}
          fill={stroke}
          stroke="white"
          strokeWidth={0.75}
        />
      </svg>
      <span>{formatValue(loadKey, todayValue)}</span>
    </span>
  )
}

export default CausalSparkline
