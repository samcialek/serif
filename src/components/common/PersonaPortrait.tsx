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
}: PersonaPortraitProps) {
  const name = displayName ?? persona?.name ?? 'Member'
  const archetype = persona?.archetype
  const age = persona?.age

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative w-[72px] h-[72px] flex-shrink-0">
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
        {persona?.avatar ? (
          <img
            src={persona.avatar}
            alt={name}
            className="absolute inset-[5px] rounded-full object-cover"
          />
        ) : (
          <div className="absolute inset-[5px] rounded-full bg-primary-50 flex items-center justify-center text-lg font-semibold text-primary-600">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Soft pulse — signals the twin is "live". */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full ring-2 ring-sky-300"
          animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2.6, ease: 'easeOut', repeat: Infinity }}
        />
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
