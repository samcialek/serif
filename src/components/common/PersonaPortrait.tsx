import { motion } from 'framer-motion'
import type { Persona } from '@/types'
import { cn } from '@/utils/classNames'

export interface PersonaPortraitStat {
  label: string
  value: string | number
  unit?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}

export interface PersonaPortraitProps {
  persona?: Persona | null
  displayName?: string
  subtitle?: string
  cohort?: string | null
  stats?: PersonaPortraitStat[]
  className?: string
  /** Portrait diameter in px. Defaults to 72. */
  size?: number
  /** When true, skip the conic-gradient halo and feather the photo's
   *  edges to transparent via a radial mask — useful for placing the
   *  portrait against a textured backdrop without the photo's own
   *  background fighting the page (e.g. the painterly Twin canvas). */
  cleanBackground?: boolean
}

const TONE: Record<NonNullable<PersonaPortraitStat['tone']>, string> = {
  default: 'text-slate-700 bg-slate-50 border-slate-200',
  good: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warn: 'text-amber-700 bg-amber-50 border-amber-200',
  bad: 'text-rose-700 bg-rose-50 border-rose-200',
}

export function PersonaPortrait({
  persona,
  displayName,
  subtitle,
  cohort,
  stats = [],
  className,
  size = 72,
  cleanBackground = false,
}: PersonaPortraitProps) {
  const name = displayName ?? persona?.name ?? 'Member'
  const archetype = persona?.archetype
  const age = persona?.age

  // cleanBackground mode strategy:
  //   1. `mix-blend-mode: darken` — lets the photo's bright background
  //      pixels (bar lights, ceiling, walls) drop out by being lighter
  //      than the cream canvas backdrop, while preserving Caspian's
  //      darker tones (hair, eyes, clothing, skin shadows).
  //   2. `object-position` shifted up so the crop is head-and-shoulders
  //      rather than centered on chest.
  //   3. A soft radial feather still cleans up the edges where the
  //      darken result has faint halo artifacts.
  //   4. Mild contrast/saturation boost makes the subject pop against
  //      the now-empty backdrop.
  const featherMask =
    'radial-gradient(ellipse 70% 92% at 50% 38%, black 0%, black 60%, transparent 95%)'

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div
        className="relative flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {!cleanBackground && (
          <>
            {/* Animated plasma halo — slow conic-gradient rotation. */}
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, #38bdf8, #a855f7, #ec4899, #f59e0b, #38bdf8)',
                filter: 'blur(8px)',
                opacity: 0.55,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
            />
            {/* Sharp ring on top. */}
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'conic-gradient(from 0deg, #38bdf8, #a855f7, #ec4899, #f59e0b, #38bdf8)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
            />
            {/* Inner white plate so the portrait sits on the ring, not under it. */}
            <div className="absolute inset-[3px] rounded-full bg-white" />
          </>
        )}
        {persona?.avatar ? (
          <img
            src={persona.avatar}
            alt={name}
            className={cn(
              'absolute object-cover',
              cleanBackground ? 'inset-0' : 'inset-[5px] rounded-full',
            )}
            style={
              cleanBackground
                ? {
                    WebkitMaskImage: featherMask,
                    maskImage: featherMask,
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    mixBlendMode: 'darken',
                    objectPosition: '50% 28%',
                    filter: 'contrast(1.12) saturate(1.05)',
                  }
                : undefined
            }
          />
        ) : (
          <div
            className={cn(
              'absolute flex items-center justify-center font-semibold text-primary-600',
              cleanBackground
                ? 'inset-0 bg-transparent'
                : 'inset-[5px] rounded-full bg-primary-50 text-lg',
            )}
            style={cleanBackground ? { fontSize: size * 0.4 } : undefined}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        {!cleanBackground && (
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-sky-300"
            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.6, ease: 'easeOut', repeat: Infinity }}
          />
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="text-base font-semibold text-slate-900 leading-tight">
            {name}
          </div>
          {age != null && (
            <div className="text-xs text-slate-500 tabular-nums">{age}</div>
          )}
        </div>
        {(archetype || subtitle || cohort) && (
          <div className="text-[11px] text-slate-500 mt-0.5">
            {[
              archetype,
              cohort ? `Cohort ${cohort}` : null,
              subtitle,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
        {stats.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {stats.map((s) => (
              <span
                key={s.label}
                className={cn(
                  'inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md border text-[11px]',
                  TONE[s.tone ?? 'default'],
                )}
              >
                <span className="font-medium opacity-70">{s.label}</span>
                <span className="font-semibold tabular-nums">{s.value}</span>
                {s.unit && <span className="opacity-70">{s.unit}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default PersonaPortrait
