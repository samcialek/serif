import type { LabResult } from '@/types'
import { oronLabs, oronPersona } from '@/data/personas/oron'

// ============================================================================
// TYPES
// ============================================================================

export interface TimeSeriesMetric {
  id: string
  name: string
  unit: string
  category: 'sleep' | 'activity' | 'hrv' | 'heart' | 'body'
  data: { date: string; value: number }[]
  referenceRange?: { low: number; high: number }
  source: string
  lastUpdated: string
}

export interface LabMetricDef {
  name: string
  key: keyof LabResult
  unit: string
  subcategory: 'lipids' | 'inflammation' | 'metabolic' | 'iron' | 'hormones' | 'other'
  referenceRange: { low: number; high: number }
  optimalRange?: [number, number]
  description: string
}

// ============================================================================
// SEEDED PRNG — mulberry32 (deterministic, reproducible)
// ============================================================================

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ============================================================================
// 90-DAY TIME SERIES GENERATOR
// ============================================================================

interface MetricConfig {
  id: string
  name: string
  unit: string
  category: 'sleep' | 'activity' | 'hrv' | 'heart' | 'body'
  baseMin: number
  baseMax: number
  source: string
  referenceRange?: { low: number; high: number }
  // Day-of-week modifiers: [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
  dayMultipliers?: number[]
  // Probability of zero value (for workout-dependent metrics)
  zeroProb?: number
  // Smoothing: how much the previous day influences the next
  smoothing?: number
  // Number of decimal places
  decimals?: number
}

const METRIC_CONFIGS: MetricConfig[] = [
  // ── Sleep ──
  {
    id: 'sleep_duration',
    name: 'Sleep Duration',
    unit: 'hours',
    category: 'sleep',
    baseMin: 6.2,
    baseMax: 7.8,
    source: 'Apple Health',
    referenceRange: { low: 7, high: 9 },
    dayMultipliers: [1.08, 0.95, 0.96, 0.97, 0.95, 0.93, 1.06],
    smoothing: 0.3,
    decimals: 1,
  },
  {
    id: 'sleep_efficiency',
    name: 'Sleep Efficiency',
    unit: '%',
    category: 'sleep',
    baseMin: 80,
    baseMax: 93,
    source: 'Apple Health',
    referenceRange: { low: 85, high: 100 },
    dayMultipliers: [1.02, 0.98, 0.99, 1.0, 0.98, 0.97, 1.03],
    smoothing: 0.4,
    decimals: 0,
  },
  {
    id: 'deep_sleep',
    name: 'Deep Sleep',
    unit: 'min',
    category: 'sleep',
    baseMin: 35,
    baseMax: 75,
    source: 'Apple Health',
    referenceRange: { low: 45, high: 90 },
    smoothing: 0.2,
    decimals: 0,
  },
  {
    id: 'rem_sleep',
    name: 'REM Sleep',
    unit: 'min',
    category: 'sleep',
    baseMin: 65,
    baseMax: 115,
    source: 'Apple Health',
    referenceRange: { low: 80, high: 120 },
    smoothing: 0.2,
    decimals: 0,
  },
  // ── Activity ──
  {
    id: 'steps',
    name: 'Steps',
    unit: 'steps',
    category: 'activity',
    baseMin: 4000,
    baseMax: 26000,
    source: 'Apple Watch',
    referenceRange: { low: 7000, high: 15000 },
    dayMultipliers: [0.6, 1.1, 1.0, 1.1, 1.0, 0.9, 0.7],
    smoothing: 0.1,
    decimals: 0,
  },
  {
    id: 'active_calories',
    name: 'Active Calories',
    unit: 'kcal',
    category: 'activity',
    baseMin: 180,
    baseMax: 950,
    source: 'Apple Watch',
    dayMultipliers: [0.5, 1.1, 1.0, 1.1, 1.0, 0.9, 0.6],
    smoothing: 0.1,
    decimals: 0,
  },
  {
    id: 'workout_duration',
    name: 'Workout Duration',
    unit: 'min',
    category: 'activity',
    baseMin: 30,
    baseMax: 120,
    source: 'Apple Watch + GPX',
    zeroProb: 0.38,
    dayMultipliers: [0.4, 1.2, 1.0, 1.2, 1.0, 0.8, 0.5],
    smoothing: 0,
    decimals: 0,
  },
  {
    id: 'acwr',
    name: 'ACWR',
    unit: 'ratio',
    category: 'activity',
    baseMin: 0.5,
    baseMax: 1.5,
    source: 'Computed (GPX + Apple Watch)',
    referenceRange: { low: 0.8, high: 1.3 },
    smoothing: 0.7,
    decimals: 2,
  },
  // ── HRV ──
  {
    id: 'resting_hrv',
    name: 'Resting HRV',
    unit: 'ms',
    category: 'hrv',
    baseMin: 20,
    baseMax: 50,
    source: 'Apple Watch',
    referenceRange: { low: 25, high: 60 },
    smoothing: 0.35,
    decimals: 0,
  },
  {
    id: 'hrv_7d_trend',
    name: 'HRV 7-Day Trend',
    unit: 'ms',
    category: 'hrv',
    baseMin: 26,
    baseMax: 40,
    source: 'Apple Watch (computed)',
    referenceRange: { low: 25, high: 60 },
    smoothing: 0.85,
    decimals: 1,
  },
  // ── Heart ──
  {
    id: 'resting_hr',
    name: 'Resting Heart Rate',
    unit: 'bpm',
    category: 'heart',
    baseMin: 47,
    baseMax: 58,
    source: 'Apple Watch',
    referenceRange: { low: 40, high: 65 },
    smoothing: 0.5,
    decimals: 0,
  },
  {
    id: 'max_hr_workout',
    name: 'Max HR (Workout)',
    unit: 'bpm',
    category: 'heart',
    baseMin: 138,
    baseMax: 188,
    source: 'Apple Watch',
    zeroProb: 0.38,
    smoothing: 0,
    decimals: 0,
  },
  // ── Body ──
  {
    id: 'weight',
    name: 'Weight',
    unit: 'kg',
    category: 'body',
    baseMin: 71.0,
    baseMax: 74.5,
    source: 'Apple Health',
    smoothing: 0.85,
    decimals: 1,
  },
  {
    id: 'body_fat',
    name: 'Body Fat',
    unit: '%',
    category: 'body',
    baseMin: 12,
    baseMax: 16,
    source: 'Apple Health',
    smoothing: 0.9,
    decimals: 1,
  },
]

function generateTimeSeries(seed: number = 42): TimeSeriesMetric[] {
  const rand = mulberry32(seed)
  const today = new Date('2026-02-07')
  const metrics: TimeSeriesMetric[] = []

  for (const cfg of METRIC_CONFIGS) {
    const data: { date: string; value: number }[] = []
    let prevValue = (cfg.baseMin + cfg.baseMax) / 2

    for (let i = 89; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dayOfWeek = d.getDay()
      const dateStr = d.toISOString().split('T')[0]

      // Check for zero-value day (rest days)
      if (cfg.zeroProb && rand() < cfg.zeroProb) {
        data.push({ date: dateStr, value: 0 })
        continue
      }

      // Base random value in range
      let value = cfg.baseMin + rand() * (cfg.baseMax - cfg.baseMin)

      // Apply day-of-week multiplier
      if (cfg.dayMultipliers) {
        value *= cfg.dayMultipliers[dayOfWeek]
      }

      // Apply smoothing from previous value
      if (cfg.smoothing > 0) {
        value = prevValue * cfg.smoothing + value * (1 - cfg.smoothing)
      }

      // Clamp to reasonable range (allow 5% overshoot)
      const margin = (cfg.baseMax - cfg.baseMin) * 0.05
      value = Math.max(cfg.baseMin - margin, Math.min(cfg.baseMax + margin, value))

      const factor = Math.pow(10, cfg.decimals ?? 0)
      value = Math.round(value * factor) / factor

      prevValue = value
      data.push({ date: dateStr, value })
    }

    // Anchor the 30d average toward oronPersona.currentMetrics where applicable
    const anchorMap: Record<string, number | undefined> = {
      deep_sleep: oronPersona.currentMetrics.deepSleepMin,
      rem_sleep: oronPersona.currentMetrics.remSleepMin,
      resting_hrv: oronPersona.currentMetrics.hrv,
      resting_hr: oronPersona.currentMetrics.restingHr,
      weight: oronPersona.currentMetrics.weight,
    }

    const anchor = anchorMap[cfg.id]
    if (anchor && anchor > 0) {
      // Compute current 30d avg and shift
      const last30 = data.slice(-30)
      const avg30 = last30.reduce((s, d) => s + d.value, 0) / last30.length
      const shift = anchor - avg30
      // Apply shift to last 30 days, tapering into earlier data
      for (let j = 0; j < data.length; j++) {
        if (data[j].value === 0) continue
        const taperWeight = j < 60 ? j / 60 : 1
        const factor = Math.pow(10, cfg.decimals ?? 0)
        data[j].value = Math.round((data[j].value + shift * taperWeight) * factor) / factor
      }
    }

    metrics.push({
      id: cfg.id,
      name: cfg.name,
      unit: cfg.unit,
      category: cfg.category,
      data,
      referenceRange: cfg.referenceRange,
      source: cfg.source,
      lastUpdated: '2026-02-07T08:00:00Z',
    })
  }

  return metrics
}

// Singleton — generated once at import time
export const oronTimeSeries: TimeSeriesMetric[] = generateTimeSeries(42)

// ============================================================================
// LAB METRIC DEFINITIONS — 25 biomarkers with clinical reference ranges
// ============================================================================

export const LAB_METRICS: LabMetricDef[] = [
  // ── Iron Panel ──
  {
    name: 'Iron (Serum)',
    key: 'iron',
    unit: 'mcg/dL',
    subcategory: 'iron',
    referenceRange: { low: 50, high: 180 },
    optimalRange: [60, 170],
    description: 'Serum iron level; reflects circulating iron available for hemoglobin synthesis.',
  },
  {
    name: 'Ferritin',
    key: 'ferritin',
    unit: 'ng/mL',
    subcategory: 'iron',
    referenceRange: { low: 20, high: 345 },
    optimalRange: [50, 150],
    description: 'Iron storage protein; best single marker of total body iron stores.',
  },
  {
    name: 'TIBC',
    key: 'tibc',
    unit: 'mcg/dL',
    subcategory: 'iron',
    referenceRange: { low: 250, high: 425 },
    optimalRange: [260, 400],
    description: 'Total iron-binding capacity; elevated in iron deficiency.',
  },
  {
    name: 'Iron Saturation',
    key: 'ironSaturationPct',
    unit: '%',
    subcategory: 'iron',
    referenceRange: { low: 20, high: 50 },
    optimalRange: [20, 45],
    description: 'Percentage of transferrin bound with iron; <20% suggests iron deficiency.',
  },
  // ── Lipids ──
  {
    name: 'Total Cholesterol',
    key: 'totalCholesterol',
    unit: 'mg/dL',
    subcategory: 'lipids',
    referenceRange: { low: 125, high: 200 },
    optimalRange: [125, 180],
    description: 'Sum of LDL, HDL, and other lipoproteins.',
  },
  {
    name: 'LDL Cholesterol',
    key: 'ldl',
    unit: 'mg/dL',
    subcategory: 'lipids',
    referenceRange: { low: 0, high: 100 },
    optimalRange: [0, 70],
    description: 'Low-density lipoprotein; primary driver of atherosclerosis.',
  },
  {
    name: 'HDL Cholesterol',
    key: 'hdl',
    unit: 'mg/dL',
    subcategory: 'lipids',
    referenceRange: { low: 40, high: 100 },
    optimalRange: [50, 90],
    description: 'High-density lipoprotein; protective against cardiovascular disease.',
  },
  {
    name: 'Triglycerides',
    key: 'triglycerides',
    unit: 'mg/dL',
    subcategory: 'lipids',
    referenceRange: { low: 0, high: 150 },
    optimalRange: [0, 80],
    description: 'Blood fats; elevated by carbohydrate intake, alcohol, and inactivity.',
  },
  {
    name: 'ApoB',
    key: 'apob',
    unit: 'mg/dL',
    subcategory: 'lipids',
    referenceRange: { low: 40, high: 100 },
    optimalRange: [40, 70],
    description: 'Apolipoprotein B; one molecule per atherogenic particle. Best predictor of CVD risk.',
  },
  // ── Inflammation ──
  {
    name: 'hsCRP',
    key: 'hsCrp',
    unit: 'mg/L',
    subcategory: 'inflammation',
    referenceRange: { low: 0, high: 3.0 },
    optimalRange: [0, 1.0],
    description: 'High-sensitivity C-reactive protein; systemic inflammation marker.',
  },
  {
    name: 'Homocysteine',
    key: 'homocysteine',
    unit: 'umol/L',
    subcategory: 'inflammation',
    referenceRange: { low: 4, high: 15 },
    optimalRange: [5, 10],
    description: 'Amino acid linked to cardiovascular risk; elevated by B12/folate deficiency.',
  },
  // ── Metabolic ──
  {
    name: 'Fasting Glucose',
    key: 'fastingGlucose',
    unit: 'mg/dL',
    subcategory: 'metabolic',
    referenceRange: { low: 65, high: 100 },
    optimalRange: [72, 90],
    description: 'Blood sugar after 8+ hour fast; marker of metabolic health.',
  },
  {
    name: 'HbA1c',
    key: 'hba1c',
    unit: '%',
    subcategory: 'metabolic',
    referenceRange: { low: 4.0, high: 5.7 },
    optimalRange: [4.0, 5.2],
    description: 'Glycated hemoglobin; reflects average blood sugar over 2-3 months.',
  },
  {
    name: 'Insulin (Fasting)',
    key: 'insulin',
    unit: 'uIU/mL',
    subcategory: 'metabolic',
    referenceRange: { low: 2.0, high: 19.6 },
    optimalRange: [2.0, 8.0],
    description: 'Fasting insulin level; elevated values indicate insulin resistance.',
  },
  // ── Hormones ──
  {
    name: 'Testosterone (Total)',
    key: 'testosterone',
    unit: 'ng/dL',
    subcategory: 'hormones',
    referenceRange: { low: 264, high: 916 },
    optimalRange: [400, 700],
    description: 'Total testosterone; important for muscle recovery, energy, and bone density.',
  },
  {
    name: 'Cortisol (AM)',
    key: 'cortisol',
    unit: 'mcg/dL',
    subcategory: 'hormones',
    referenceRange: { low: 6.2, high: 19.4 },
    optimalRange: [8, 15],
    description: 'Morning cortisol; primary stress hormone. Chronically elevated values impair recovery.',
  },
  {
    name: 'TSH',
    key: 'tsh',
    unit: 'mIU/L',
    subcategory: 'hormones',
    referenceRange: { low: 0.45, high: 4.5 },
    optimalRange: [0.5, 2.5],
    description: 'Thyroid-stimulating hormone; screens for thyroid dysfunction.',
  },
  // ── Other ──
  {
    name: 'Vitamin D (25-OH)',
    key: 'vitaminD',
    unit: 'ng/mL',
    subcategory: 'other',
    referenceRange: { low: 30, high: 100 },
    optimalRange: [40, 60],
    description: 'Active vitamin D metabolite; crucial for bone health, immunity, and athletic performance.',
  },
  {
    name: 'Vitamin B12',
    key: 'b12',
    unit: 'pg/mL',
    subcategory: 'other',
    referenceRange: { low: 232, high: 1245 },
    optimalRange: [400, 800],
    description: 'Essential for nerve function and red blood cell formation.',
  },
  {
    name: 'EPA',
    key: 'epa',
    unit: '% of total FA',
    subcategory: 'other',
    referenceRange: { low: 0.5, high: 3.0 },
    optimalRange: [1.0, 2.5],
    description: 'Eicosapentaenoic acid; anti-inflammatory omega-3 fatty acid.',
  },
  {
    name: 'DHA',
    key: 'dha',
    unit: '% of total FA',
    subcategory: 'other',
    referenceRange: { low: 2.0, high: 6.0 },
    optimalRange: [3.0, 5.0],
    description: 'Docosahexaenoic acid; structural omega-3, critical for brain and heart health.',
  },
  {
    name: 'AA/EPA Ratio',
    key: 'aaEpaRatio',
    unit: 'ratio',
    subcategory: 'other',
    referenceRange: { low: 1.5, high: 15 },
    optimalRange: [1.5, 5.0],
    description: 'Arachidonic acid to EPA ratio; lower is better for inflammation balance.',
  },
]

// ============================================================================
// HELPER: compute stats from time series data
// ============================================================================

export function computeStats(data: { date: string; value: number }[]) {
  const nonZero = data.filter((d) => d.value > 0)
  if (nonZero.length === 0) return { avg7d: 0, avg30d: 0, min: 0, max: 0, current: 0 }

  const last7 = nonZero.slice(-7)
  const last30 = nonZero.slice(-30)

  const avg = (arr: { value: number }[]) =>
    arr.length > 0 ? arr.reduce((s, d) => s + d.value, 0) / arr.length : 0

  const allValues = nonZero.map((d) => d.value)
  return {
    current: nonZero[nonZero.length - 1]?.value ?? 0,
    avg7d: Math.round(avg(last7) * 10) / 10,
    avg30d: Math.round(avg(last30) * 10) / 10,
    min: Math.min(...allValues),
    max: Math.max(...allValues),
  }
}

// Re-export for convenience
export { oronLabs, oronPersona }

// ============================================================================
// LAB SUBCATEGORY ORDER
// ============================================================================

export const LAB_SUBCATEGORY_ORDER: { key: LabMetricDef['subcategory']; label: string }[] = [
  { key: 'iron', label: 'Iron Panel' },
  { key: 'lipids', label: 'Lipids' },
  { key: 'inflammation', label: 'Inflammation' },
  { key: 'metabolic', label: 'Metabolic' },
  { key: 'hormones', label: 'Hormones' },
  { key: 'other', label: 'Other' },
]
