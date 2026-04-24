/**
 * Shared iconography for rolling loads. Each load gets one lucide icon
 * used throughout the portal — ContextStrip tiles, ProtocolContextChip
 * chips, ProtocolAuditTrail rows, CausalSparkline labels — so the user
 * learns the symbol once and reads it everywhere.
 *
 * Why these picks:
 *   ACWR              → Gauge       (a ratio/dial reading)
 *   Sleep debt (14d)  → Moon        (sleep)
 *   Sleep regularity  → Repeat      (same schedule, over and over)
 *   Training balance  → Scale       (CTL vs ATL equilibrium)
 *   Consistency       → CalendarCheck (fraction of days trained)
 *   Monotony          → AlignJustify  (uniform, same-same)
 *   Chronic load      → LineChart   (slow upward curve over weeks)
 *   Acute load        → Zap         (sharp recent spike)
 *
 * A short symbol (e.g. "ACWR") accompanies each icon — used in places
 * where the icon alone would be ambiguous (a 3-icon chip strip wants
 * disambiguating glyphs at small sizes).
 */

import {
  AlignJustify,
  CalendarCheck,
  Gauge,
  LineChart,
  Moon,
  Repeat,
  Scale,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { LoadKey } from '@/data/portal/types'

interface LoadIconSpec {
  icon: LucideIcon
  /** Short human label (2-3 words). */
  label: string
  /** Terse symbol for dense displays (e.g. "ACWR"). */
  symbol: string
  /** Hover tooltip — one-sentence explanation. */
  tooltip: string
}

export const LOAD_ICONS: Record<LoadKey, LoadIconSpec> = {
  acwr: {
    icon: Gauge,
    label: 'ACWR',
    symbol: 'ACWR',
    tooltip: 'Acute:Chronic Workload Ratio (last 7d / last 28d)',
  },
  sleep_debt_14d: {
    icon: Moon,
    label: 'Sleep debt',
    symbol: 'DEBT',
    tooltip: 'Cumulative hours below 7.5h target over the last 14 days',
  },
  sri_7d: {
    icon: Repeat,
    label: 'Regularity',
    symbol: 'SRI',
    tooltip: 'Sleep Regularity Index — how stable your bedtime has been',
  },
  tsb: {
    icon: Scale,
    label: 'Balance',
    symbol: 'TSB',
    tooltip: 'Training Stress Balance — CTL minus ATL (fitness vs fatigue)',
  },
  training_consistency: {
    icon: CalendarCheck,
    label: 'Consistency',
    symbol: 'CONS',
    tooltip: 'Fraction of days with any training in the last 90 days',
  },
  training_monotony: {
    icon: AlignJustify,
    label: 'Monotony',
    symbol: 'MONO',
    tooltip: 'Mean/SD of training load — higher = less variation',
  },
  ctl: {
    icon: LineChart,
    label: 'Chronic',
    symbol: 'CTL',
    tooltip: 'Chronic Training Load — 42-day exponentially-weighted TRIMP',
  },
  atl: {
    icon: Zap,
    label: 'Acute',
    symbol: 'ATL',
    tooltip: 'Acute Training Load — 7-day exponentially-weighted TRIMP',
  },
}

export function loadIcon(key: LoadKey): LoadIconSpec {
  return LOAD_ICONS[key]
}
