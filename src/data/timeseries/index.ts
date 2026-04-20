// Types
export type {
  TimeRange,
  TimeRangePreset,
  MetricKey,
  MetricSummary,
  ChartDataPoint,
  MultiMetricChartData,
  LabTrend,
} from './types'

export {
  METRIC_CONFIG,
  LAB_MARKER_CONFIG,
  getTimeRangeDates,
  calculateTrend,
} from './types'

// Rajan-specific time series functions
export {
  rajanMetrics,
  rajanLabs,
  getRajanMetricsInRange,
  getRajanChartData,
  getRajanMetricSummary,
  getRajanSleepNarrativePoints,
  getRajanWorkoutSleepCorrelation,
  getRajanLabTrends,
} from './rajanMetrics'

// Generic time series utilities
import type { DailyMetrics } from '@/types'
import type { TimeRange, ChartDataPoint, MetricSummary } from './types'
import { METRIC_CONFIG, calculateTrend } from './types'
import { getMetricsForPersona } from '@/data/personas'

/**
 * Get metrics for any persona within a time range
 */
export function getMetricsInRange(personaId: string, range: TimeRange): DailyMetrics[] {
  const metrics = getMetricsForPersona(personaId)
  return metrics.filter(m => m.date >= range.start && m.date <= range.end)
}

/**
 * Get chart data for any persona
 */
export function getChartData(
  personaId: string,
  metricKey: keyof DailyMetrics,
  range?: TimeRange
): ChartDataPoint[] {
  let metrics = getMetricsForPersona(personaId)

  if (range) {
    metrics = metrics.filter(m => m.date >= range.start && m.date <= range.end)
  }

  return metrics.map(m => ({
    date: m.date,
    value: m[metricKey] as number,
    event: m.events?.[0],
  }))
}

/**
 * Get metric summary for any persona
 */
export function getMetricSummary(personaId: string, metricKey: keyof DailyMetrics): MetricSummary {
  const metrics = getMetricsForPersona(personaId)
  const values = metrics
    .map(m => m[metricKey] as number)
    .filter(v => typeof v === 'number' && !isNaN(v))

  const config = METRIC_CONFIG[metricKey] || { label: metricKey, unit: '', decimals: 0, goodDirection: 'stable' }
  const current = values[values.length - 1] || 0
  const average = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const trend = calculateTrend(values)

  const recent = values.slice(-7)
  const previous = values.slice(-14, -7)
  const recentAvg = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0
  const previousAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : recentAvg
  const trendPercent = previousAvg !== 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0

  return {
    key: metricKey,
    label: config.label,
    unit: config.unit,
    current,
    average,
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    trend,
    trendPercent,
  }
}

/**
 * Get multiple metrics for chart overlay
 */
export function getMultipleMetrics(
  personaId: string,
  metricKeys: (keyof DailyMetrics)[],
  range?: TimeRange
): { date: string; [key: string]: number | string }[] {
  let metrics = getMetricsForPersona(personaId)

  if (range) {
    metrics = metrics.filter(m => m.date >= range.start && m.date <= range.end)
  }

  return metrics.map(m => {
    const point: { date: string; [key: string]: number | string } = { date: m.date }
    metricKeys.forEach(key => {
      const value = m[key as keyof DailyMetrics]
      const keyStr = key as string
      if (typeof value === 'number') {
        point[keyStr] = value
      } else if (typeof value === 'string') {
        point[keyStr] = value
      } else {
        point[keyStr] = 0
      }
    })
    return point
  })
}
