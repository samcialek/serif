/**
 * Re-export Rajan's metrics from persona data
 * This file exists for organizational purposes and to add any
 * time-series specific utilities for Rajan's data
 */

import { rajanMetrics, rajanLabs } from '@/data/personas/rajan'
import type { DailyMetrics } from '@/types'
import type { ChartDataPoint, MetricSummary, TimeRange } from './types'
import { METRIC_CONFIG, calculateTrend } from './types'

export { rajanMetrics, rajanLabs }

/**
 * Get metrics within a time range
 */
export function getRajanMetricsInRange(range: TimeRange): DailyMetrics[] {
  return rajanMetrics.filter(m => m.date >= range.start && m.date <= range.end)
}

/**
 * Get chart data for a specific metric
 */
export function getRajanChartData(
  metricKey: keyof DailyMetrics,
  range?: TimeRange
): ChartDataPoint[] {
  let metrics = rajanMetrics

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
 * Get metric summary for Rajan
 */
export function getRajanMetricSummary(metricKey: keyof DailyMetrics): MetricSummary {
  const values = rajanMetrics
    .map(m => m[metricKey] as number)
    .filter(v => typeof v === 'number' && !isNaN(v))

  const config = METRIC_CONFIG[metricKey] || { label: metricKey, unit: '', decimals: 0, goodDirection: 'stable' }
  const current = values[values.length - 1] || 0
  const average = values.reduce((a, b) => a + b, 0) / values.length
  const trend = calculateTrend(values)

  // Calculate trend percent (last 7 days vs previous 7 days)
  const recent = values.slice(-7)
  const previous = values.slice(-14, -7)
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
  const previousAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : recentAvg
  const trendPercent = previousAvg !== 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0

  return {
    key: metricKey,
    label: config.label,
    unit: config.unit,
    current,
    average,
    min: Math.min(...values),
    max: Math.max(...values),
    trend,
    trendPercent,
  }
}

/**
 * Get sleep narrative data points for Rajan
 * (dates where sleep was notably affected)
 */
export function getRajanSleepNarrativePoints(): { date: string; event: string; sleepScore: number }[] {
  return rajanMetrics
    .filter(m => m.events && m.events.length > 0)
    .map(m => ({
      date: m.date,
      event: m.events![0],
      sleepScore: m.sleepScore,
    }))
}

/**
 * Get workout timing correlation data
 */
export function getRajanWorkoutSleepCorrelation(): { workoutTime: string | null; sleepLatency: number; date: string }[] {
  return rajanMetrics.map(m => ({
    date: m.date,
    workoutTime: m.workoutTime,
    sleepLatency: m.sleepLatency,
  }))
}

/**
 * Get lab trend data for visualization
 */
export function getRajanLabTrends(): { marker: string; data: { date: string; value: number }[] }[] {
  const markers = ['fastingGlucose', 'triglycerides', 'hdl', 'hsCrp', 'testosterone', 'vitaminD'] as const

  return markers.map(marker => ({
    marker,
    data: rajanLabs.map(lab => ({
      date: lab.date,
      value: lab[marker] as number,
    })).filter(d => d.value !== undefined),
  }))
}
