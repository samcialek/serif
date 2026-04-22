import { cn } from '@/utils/classNames'
import { User } from 'lucide-react'
import type { Persona } from '@/types'

const SIZE_CLASSES = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
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
}

export function MemberAvatar({
  persona,
  displayName,
  size = 'md',
  shape = 'rounded',
  className,
}: MemberAvatarProps) {
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-lg'
  const sizeCls = SIZE_CLASSES[size]
  const iconCls = ICON_SIZES[size]

  if (persona?.avatar) {
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
