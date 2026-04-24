/**
 * RegimeGlyphs — inline row of icons showing which regime states
 * shaped a given protocol row. Reads from ProtocolItemContext's
 * active_regimes. One glyph ≈ a sentence of rationale.
 *
 * Icons are distinct from load icons to avoid cross-talk:
 *   sleep_deprivation_state → Bed      (the state, vs Moon = sleep debt)
 *   overreaching_state      → Flame    (training stress)
 *   inflammation_state      → HeartPulse
 *   iron_deficiency_state   → Droplet  (iron/blood)
 */

import { Bed, Droplet, Flame, HeartPulse, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/classNames'
import type { RegimeDriver } from '@/utils/dailyProtocol'
import type { RegimeKey } from '@/data/portal/types'

interface RegimeGlyphSpec {
  icon: LucideIcon
  color: string // tailwind text color class for foreground
  bg: string // tailwind bg class for the pill
  label: string
}

const REGIME_GLYPHS: Record<RegimeKey, RegimeGlyphSpec> = {
  sleep_deprivation_state: {
    icon: Bed,
    color: 'text-indigo-700',
    bg: 'bg-indigo-50 border-indigo-200',
    label: 'Sleep-deprived',
  },
  overreaching_state: {
    icon: Flame,
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    label: 'Overreaching',
  },
  inflammation_state: {
    icon: HeartPulse,
    color: 'text-rose-700',
    bg: 'bg-rose-50 border-rose-200',
    label: 'Inflamed',
  },
  iron_deficiency_state: {
    icon: Droplet,
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    label: 'Iron-deficient',
  },
}

interface Props {
  regimes: RegimeDriver[]
  /** "sm" = 14px icons in bare pills. "md" = 16px with value %. */
  size?: 'sm' | 'md'
}

export function RegimeGlyphs({ regimes, size = 'sm' }: Props) {
  if (regimes.length === 0) return null
  const iconPx = size === 'md' ? 16 : 14
  return (
    <span className="inline-flex items-center gap-1" aria-label="Active regimes">
      {regimes.map((r) => {
        const spec = REGIME_GLYPHS[r.key]
        if (!spec) return null
        const Icon = spec.icon
        return (
          <span
            key={r.key}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border',
              spec.bg,
              spec.color,
            )}
            title={`${spec.label} — ${Math.round(r.activation * 100)}%`}
          >
            <Icon
              width={iconPx}
              height={iconPx}
              aria-hidden
            />
            {size === 'md' && (
              <span className="text-[10px] tabular-nums font-semibold">
                {Math.round(r.activation * 100)}%
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

export default RegimeGlyphs
