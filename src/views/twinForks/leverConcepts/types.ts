/**
 * Shared spec for the four combined-lever prototypes.
 *
 * Each "group" merges two (occasionally derived) Twin levers into one widget:
 *   - alcohol:  units/day (y) + cutoff hrs pre-bed (x)
 *   - caffeine: mg/day (y)    + cutoff hrs pre-bed (x)
 *   - hr:       Zone 2 min/day (x) + Zone 4-5 min/day (y)
 *   - sleep:    bedtime (x)   + wake (y)  [duration derived]
 *
 * Concepts read `LeverPairSpec` so the same 4 groups can be rendered 4 ways
 * without touching the domain data.
 */

export interface AxisSpec {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  default: number
  /** How to format the value in readouts. */
  format?: 'clock' | 'hoursBeforeBed' | 'default'
}

export interface LeverPairSpec {
  id: 'alcohol' | 'caffeine' | 'hr' | 'sleep'
  domainLabel: string
  accent: string
  highlight: string
  xAxis: AxisSpec
  yAxis: AxisSpec
  /** Optional composite readout label (e.g. duration for sleep). */
  derivedLabel?: string
  derivedFn?: (x: number, y: number) => string
}

/** Decimal-hours → "10:30 PM". */
export function formatClock(decimalHours: number): string {
  const raw = ((decimalHours % 24) + 24) % 24
  const h = Math.floor(raw)
  const m = Math.round((raw - h) * 60)
  const ampm = h < 12 ? 'AM' : 'PM'
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function formatAxisValue(axis: AxisSpec, value: number): string {
  if (axis.format === 'clock') return formatClock(value)
  if (axis.format === 'hoursBeforeBed') {
    if (value <= 0) return 'at bedtime'
    const rounded = Math.abs(value) < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value))
    return `${rounded}h pre-bed`
  }
  const abs = Math.abs(value)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2
  const rounded = value.toFixed(digits).replace(/\.00?$/, '')
  return `${rounded} ${axis.unit}`
}

export function sleepDuration(bedtime: number, wake: number): number {
  // bedtime in [20, 28] (8 PM → 4 AM the next morning)
  // wake in [4, 12]
  return wake + 24 - bedtime
}

export function formatDuration(decimalHours: number): string {
  const h = Math.floor(decimalHours)
  const m = Math.round((decimalHours - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export const LEVER_GROUPS: LeverPairSpec[] = [
  {
    id: 'alcohol',
    domainLabel: 'Alcohol',
    accent: '#a855f7',
    highlight: '#f0abfc',
    xAxis: {
      id: 'alcohol_timing',
      label: 'cutoff',
      unit: 'h pre-bed',
      min: 0,
      max: 8,
      step: 0.5,
      default: 3,
      format: 'hoursBeforeBed',
    },
    yAxis: {
      id: 'alcohol_units',
      label: 'amount',
      unit: 'units/day',
      min: 0,
      max: 6,
      step: 0.5,
      default: 1,
    },
  },
  {
    id: 'caffeine',
    domainLabel: 'Caffeine',
    accent: '#f59e0b',
    highlight: '#fde68a',
    xAxis: {
      id: 'caffeine_timing',
      label: 'cutoff',
      unit: 'h pre-bed',
      min: 0,
      max: 14,
      step: 0.5,
      default: 8,
      format: 'hoursBeforeBed',
    },
    yAxis: {
      id: 'caffeine_mg',
      label: 'amount',
      unit: 'mg/day',
      min: 0,
      max: 600,
      step: 25,
      default: 200,
    },
  },
  {
    id: 'hr',
    domainLabel: 'HR intensity',
    accent: '#ef4444',
    highlight: '#fca5a5',
    xAxis: {
      id: 'zone2_minutes',
      label: 'Zone 2',
      unit: 'min/day',
      min: 0,
      max: 120,
      step: 5,
      default: 30,
    },
    yAxis: {
      id: 'zone4_5_minutes',
      label: 'Zone 4-5',
      unit: 'min/day',
      min: 0,
      max: 30,
      step: 1,
      default: 5,
    },
  },
  {
    id: 'sleep',
    domainLabel: 'Sleep window',
    accent: '#06b6d4',
    highlight: '#67e8f9',
    xAxis: {
      id: 'bedtime',
      label: 'bedtime',
      unit: 'hr',
      min: 20,
      max: 28,
      step: 0.25,
      default: 22.5,
      format: 'clock',
    },
    yAxis: {
      id: 'wake',
      label: 'wake',
      unit: 'hr',
      min: 4,
      max: 12,
      step: 0.25,
      default: 6.5,
      format: 'clock',
    },
    derivedLabel: 'duration',
    derivedFn: (bed, wake) => formatDuration(sleepDuration(bed, wake)),
  },
]

/** Quantize to a step, clamped to [min, max]. */
export function quantize(value: number, axis: AxisSpec): number {
  const steps = Math.round((value - axis.min) / axis.step)
  const snapped = axis.min + steps * axis.step
  return Math.max(axis.min, Math.min(axis.max, snapped))
}

// ─── Three-band spec (HR intensity) ─────────────────────────────────

export interface BandSpec {
  id: string
  label: string
  color: string
  min: number
  max: number
  step: number
  default: number
  unit: string
}

export interface ThreeBandSpec {
  id: string
  domainLabel: string
  bands: [BandSpec, BandSpec, BandSpec] // outer, middle, inner
}

export const HR_THREE_BAND: ThreeBandSpec = {
  id: 'hr3',
  domainLabel: 'HR intensity',
  bands: [
    {
      id: 'zone1',
      label: 'Zone 1',
      color: '#89CFF0', // baby blue
      min: 0,
      max: 240,
      step: 5,
      default: 120,
      unit: 'min/day',
    },
    {
      id: 'zone23',
      label: 'Zone 2-3',
      color: '#D4A857', // warm gold
      min: 0,
      max: 120,
      step: 5,
      default: 30,
      unit: 'min/day',
    },
    {
      id: 'zone45',
      label: 'Zone 4-5',
      color: '#C76B4D', // cool terracotta
      min: 0,
      max: 30,
      step: 1,
      default: 5,
      unit: 'min/day',
    },
  ],
}

export function quantizeBand(value: number, band: BandSpec): number {
  const steps = Math.round((value - band.min) / band.step)
  const snapped = band.min + steps * band.step
  return Math.max(band.min, Math.min(band.max, snapped))
}

// ─── Consumable spec (alcohol / caffeine) ───────────────────────────

export interface ConsumableSpec {
  id: 'alcohol' | 'caffeine'
  label: string
  unitNoun: string // "drink", "cup"
  accent: string
  highlight: string
  amount: AxisSpec
  cutoff: AxisSpec
  /** Half-life in hours, used by decay-curve concept. */
  halfLifeHours: number
  /** Lucide icon name for cup-stack concept. */
  glyph: 'wine' | 'coffee'
}

export const ALCOHOL_SPEC: ConsumableSpec = {
  id: 'alcohol',
  label: 'Alcohol',
  unitNoun: 'drink',
  accent: '#C76B4D', // cool terracotta
  highlight: '#9C5238', // deeper terracotta
  halfLifeHours: 5,
  glyph: 'wine',
  amount: {
    id: 'alcohol_units',
    label: 'amount',
    unit: 'drinks',
    min: 0,
    max: 6,
    step: 1,
    default: 1,
  },
  cutoff: {
    id: 'alcohol_timing',
    label: 'cutoff',
    unit: 'h pre-bed',
    min: 0,
    max: 8,
    step: 0.5,
    default: 3,
    format: 'hoursBeforeBed',
  },
}

export const CAFFEINE_SPEC: ConsumableSpec = {
  id: 'caffeine',
  label: 'Caffeine',
  unitNoun: 'cup',
  accent: '#D4A857', // warm gold
  highlight: '#A6843C', // deeper gold
  halfLifeHours: 5,
  glyph: 'coffee',
  amount: {
    id: 'caffeine_cups',
    label: 'amount',
    unit: 'cups',
    min: 0,
    max: 6,
    step: 1,
    default: 2,
  },
  cutoff: {
    id: 'caffeine_timing',
    label: 'cutoff',
    unit: 'h pre-bed',
    min: 0,
    max: 14,
    step: 0.5,
    default: 8,
    format: 'hoursBeforeBed',
  },
}

export const CONSUMABLES: ConsumableSpec[] = [ALCOHOL_SPEC, CAFFEINE_SPEC]

// ─── Sleep spec ─────────────────────────────────────────────────────

export const SLEEP_SPEC = LEVER_GROUPS.find((g) => g.id === 'sleep')!
