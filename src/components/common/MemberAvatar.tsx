import { cn } from '@/utils/classNames'
import { User } from 'lucide-react'
import type { Persona } from '@/types'

const SIZE_CLASSES = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-sm',
  lg: 'w-14 h-14 text-base',
}

const ICON_SIZES = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-6 h-6',
}

export type MemberAvatarSize = keyof typeof SIZE_CLASSES

export interface MemberAvatarProps {
  persona?: Persona | null
  displayName?: string
  size?: MemberAvatarSize
  shape?: 'rounded' | 'circle'
  className?: string
  /** "futuristic" adds a soft teal→indigo gradient ring + outer glow and
   * lets the portrait lightly scale past its frame (an ~8% zoom inside
   * a thin inset border). Looks cleanest with a transparent-background
   * PNG — with a full-background image the effect is subtler but still
   * reads more "neon display" than "flat avatar". Defaults to true at
   * size="lg" since that's the hero profile use; false otherwise. */
  variant?: 'flat' | 'futuristic'
}

export function MemberAvatar({
  persona,
  displayName,
  size = 'md',
  shape = 'rounded',
  className,
  variant,
}: MemberAvatarProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl'
  const sizeCls = SIZE_CLASSES[size]
  const iconCls = ICON_SIZES[size]
  const effectiveVariant = variant ?? (size === 'lg' ? 'futuristic' : 'flat')

  if (persona?.avatar) {
    if (effectiveVariant === 'futuristic') {
      return (
        <div
          className={cn(
            sizeCls,
            radius,
            'relative flex-shrink-0',
            // Gradient-ring frame via a 1.5px outer conic gradient + inner
            // dark liner. The shadow gives a subtle "display" halo.
            'p-[1.5px] bg-gradient-to-br from-cyan-300 via-teal-400 to-indigo-500',
            'shadow-[0_4px_12px_-2px_rgba(99,102,241,0.35),0_2px_6px_-1px_rgba(6,182,212,0.25)]',
            className,
          )}
        >
          <div
            className={cn(
              radius,
              'w-full h-full overflow-hidden bg-slate-900 relative',
              // Inner dark ring — the "bezel"
            )}
          >
            <img
              src={persona.avatar}
              alt={persona.name}
              // Scale the portrait slightly larger than the frame so it
              // presses right up against the bezel edge. translate-y-[-6%]
              // biases toward showing more head/chest, less background.
              className={cn(
                'w-full h-full object-cover scale-[1.08] -translate-y-[6%]',
                // Subtle top-left highlight for the "futuristic display" feel.
              )}
            />
            {/* Soft top highlight gleam — reads as a thin "screen glass" reflection. */}
            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1/3 pointer-events-none',
                'bg-gradient-to-b from-white/20 to-transparent',
              )}
              aria-hidden
            />
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
