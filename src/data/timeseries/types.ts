import type { DailyMetrics, LabResult } from '@/types'

/**
 * Time range for filtering metrics
 */
export interface TimeRange {
  start: string  // ISO date
  end: string    // ISO date
}

/**
 * Predefined time ranges
 */
export type TimeRangePreset = '7d' | '14d' | '30d' | '60d' | '90d' | 'all'

/**
 * Metric key for selection
 */
export type MetricKey = keyof DailyMetrics

/**
 * Aggregated metric summary
 */
export interface MetricSummary {
  key: MetricKey
  label: string
  unit: string
  current: number
  average: number
  min: number
  max: number
  trend: 'up' | 'down' | 'stable'
  trendPercent: number
}

/**
 * Chart data point
 */
export interface ChartDataPoint {
  date: string
  value: number
  label?: string
  event?: string
}

/**
 * Multi-metric chart data
 */
export interface MultiMetricChartData {
  date: string
  [key: string]: number | string
}

/**
 * Lab result trend
 */
export interface LabTrend {
  marker: keyof LabResult
  label: string
  unit: string
  values: { date: string; value: number }[]
  trend: 'improving' | 'stable' | 'worsening'
  latestValue: number
  optimalRange?: { min: number; max: number }
}

/**
 * Metric display configuration
 */
export const METRIC_CONFIG: Record<string, { label: string; unit: string; decimals: number; goodDirection: 'up' | 'down' | 'stable' }> = {
  sleepScore: { label: 'Sleep Score', unit: '', decimals: 0, goodDirection: 'up' },
  sleepDuration: { label: 'Sleep Duration', unit: 'min', decimals: 0, goodDirection: 'up' },
  deepSleep: { label: 'Deep Sleep', unit: 'min', decimals: 0, goodDirection: 'up' },
  remSleep: { label: 'REM Sleep', unit: 'min', decimals: 0, goodDirection: 'up' },
  sleepLatency: { label: 'Sleep Latency', unit: 'min', decimals: 0, goodDirection: 'down' },
  sleepEfficiency: { label: 'Sleep Efficiency', unit: '%', decimals: 1, goodDirection: 'up' },
  hrv: { label: 'HRV', unit: 'ms', decimals: 0, goodDirection: 'up' },
  restingHr: { label: 'Resting HR', unit: 'bpm', decimals: 0, goodDirection: 'down' },
  steps: { label: 'Steps', unit: '', decimals: 0, goodDirection: 'up' },
  activeCalories: { label: 'Active Calories', unit: 'cal', decimals: 0, goodDirection: 'up' },
  zone2Minutes: { label: 'Zone 2', unit: 'min', decimals: 0, goodDirection: 'up' },
  mood: { label: 'Mood', unit: '', decimals: 1, goodDirection: 'up' },
  energy: { label: 'Energy', unit: '', decimals: 1, goodDirection: 'up' },
  stress: { label: 'Stress', unit: '', decimals: 1, goodDirection: 'down' },
}

/**
 * Lab marker configuration
 */
export const LAB_MARKER_CONFIG: Record<string, { label: string; unit: string; optimalRange: { min: number; max: number }; goodDirection: 'down' | 'up' }> = {
  fastingGlucose: { label: 'Fasting Glucose', unit: 'mg/dL', optimalRange: { min: 70, max: 100 }, goodDirection: 'down' },
  hba1c: { label: 'HbA1c', unit: '%', optimalRange: { min: 4.0, max: 5.6 }, goodDirection: 'down' },
  totalCholesterol: { label: 'Total Cholesterol', unit: 'mg/dL', optimalRange: { min: 0, max: 200 }, goodDirection: 'down' },
  ldl: { label: 'LDL', unit: 'mg/dL', optimalRange: { min: 0, max: 100 }, goodDirection: 'down' },
  hdl: { label: 'HDL', unit: 'mg/dL', optimalRange: { min: 40, max: 100 }, goodDirection: 'up' },
  triglycerides: { label: 'Triglycerides', unit: 'mg/dL', optimalRange: { min: 0, max: 150 }, goodDirection: 'down' },
  hsCrp: { label: 'hs-CRP', unit: 'mg/L', optimalRange: { min: 0, max: 1.0 }, goodDirection: 'down' },
  vitaminD: { label: 'Vitamin D', unit: 'ng/mL', optimalRange: { min: 30, max: 80 }, goodDirection: 'up' },
  testosterone: { label: 'Testosterone', unit: 'ng/dL', optimalRange: { min: 300, max: 1000 }, goodDirection: 'up' },
}

/**
 * Get time range dates from preset
 */
export function getTimeRangeDates(preset: TimeRangePreset): TimeRange {
  const end = new Date()
  const start = new Date()

  switch (preset) {
    case '7d':
      start.setDate(start.getDate() - 7)
      break
    case '14d':
      start.setDate(start.getDate() - 14)
      break
    case '30d':
      start.setDate(start.getDate() - 30)
      break
    case '60d':
      start.setDate(start.getDate() - 60)
      break
    case '90d':
      start.setDate(start.getDate() - 90)
      break
    case 'all':
      start.setDate(start.getDate() - 365)
      break
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

/**
 * Calculate trend from array of values
 */
export function calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
  if (values.length < 2) return 'stable'

  const firstHalf = values.slice(0, Math.floor(values.length / 2))
  const secondHalf = values.slice(Math.floor(values.length / 2))

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length

  const percentChange = ((secondAvg - firstAvg) / firstAvg) * 100

  if (percentChange > 3) return 'up'
  if (percentChange < -3) return 'down'
  return 'stable'
}
