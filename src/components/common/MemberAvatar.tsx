import { cn } from '@/utils/classNames'
import { User } from 'lucide-react'
import type { Persona } from '@/types'

const SIZE_CLASSES = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-lg',
}

const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-6 h-6',
  xl: 'w-10 h-10',
}

export type MemberAvatarSize = keyof typeof SIZE_CLASSES

export interface MemberAvatarProps {
  persona?: Persona | null
  displayName?: string
  size?: MemberAvatarSize
  shape?: 'rounded' | 'circle'
  className?: string
  /** "futuristic" adds a soft teal→indigo gradient ring + outer glow and
   * lets the portrait lightly scale past its frame. Defaults to true at
   * size="lg" / size="xl"; false at smaller sizes. */
  variant?: 'flat' | 'futuristic'
  /** When true (default for size="xl"), apply a PersonaPortrait-style
   * darken-blend + feather treatment so the photo reads as a head-
   * and-shoulders cutout against the page background — same look the
   * canonical Twin uses at its larger header size. */
  cleanBackground?: boolean
}

export function MemberAvatar({
  persona,
  displayName,
  size = 'md',
  shape = 'rounded',
  className,
  variant,
  cleanBackground,
}: MemberAvatarProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl'
  const sizeCls = SIZE_CLASSES[size]
  const iconCls = ICON_SIZES[size]
  const effectiveVariant =
    variant ?? (size === 'lg' || size === 'xl' ? 'futuristic' : 'flat')
  const effectiveCleanBg = cleanBackground ?? size === 'xl'

  if (persona?.avatar) {
    if (effectiveVariant === 'futuristic') {
      // cleanBackground strategy (matches PersonaPortrait in TwinV2):
      //   1. mix-blend-mode: darken   — bright sky/wall pixels drop out
      //      against the cream page, subject darks stay.
      //   2. object-position biased up — head-and-shoulders crop.
      //   3. radial feather mask      — softens leftover edge halos.
      //   4. saturation + contrast bump — subject pops against the
      //      now-empty backdrop.
      const featherMask =
        'radial-gradient(ellipse 70% 92% at 50% 38%, black 0%, black 60%, transparent 95%)'
      const imgTransform = effectiveCleanBg
        ? 'scale-[1.12] -translate-y-[4%]'
        : 'scale-[1.08] -translate-y-[6%]'

      return (
        <div
          className={cn(
            sizeCls,
            radius,
            'relative flex-shrink-0',
            'p-[1.5px] bg-gradient-to-br from-cyan-300 via-teal-400 to-indigo-500',
            'shadow-[0_4px_12px_-2px_rgba(99,102,241,0.35),0_2px_6px_-1px_rgba(6,182,212,0.25)]',
            className,
          )}
        >
          <div
            className={cn(
              radius,
              'w-full h-full overflow-hidden relative',
              effectiveCleanBg ? 'bg-slate-50' : 'bg-slate-900',
            )}
          >
            <img
              src={persona.avatar}
              alt={persona.name}
              className={cn(
                'w-full h-full object-cover object-top',
                imgTransform,
                effectiveCleanBg &&
                  'mix-blend-darken [filter:contrast(1.08)_saturate(1.05)]',
              )}
              style={
                effectiveCleanBg
                  ? {
                      WebkitMaskImage: featherMask,
                      maskImage: featherMask,
                    }
                  : undefined
              }
            />
            {!effectiveCleanBg && (
              <div
                className={cn(
                  'absolute inset-x-0 top-0 h-1/3 pointer-events-none',
                  'bg-gradient-to-b from-white/20 to-transparent',
                )}
                aria-hidden
              />
            )}
          </div>
        </div>
      )
    }

    return (
      <img
        src={persona.avatar}
        alt={persona.name}
        className={cn(
          sizeCls,
          radius,
          'object-cover border border-primary-100 flex-shrink-0',
          className,
        )}
      />
    )
  }

  const initial = (displayName ?? persona?.name ?? '').charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        sizeCls,
        radius,
        'bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0 font-semibold text-primary-600',
        className,
      )}
    >
      {initial || <User className={cn(iconCls, 'text-primary-500')} />}
    </div>
  )
}

export default MemberAvatar
