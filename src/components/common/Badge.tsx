import { forwardRef } from 'react'
import { cn } from '@/utils/classNames'
import { X } from 'lucide-react'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
  removable?: boolean
  onRemove?: () => void
}

// SERIF CLINICAL PRECISION: Soft rounded edges, subtle colors, refined typography
const badgeVariants = {
  default: 'bg-slate-100 text-slate-600 border border-slate-200',
  primary: 'bg-primary-50 text-primary-600 border border-primary-100',
  success: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  warning: 'bg-amber-50 text-amber-600 border border-amber-100',
  danger: 'bg-rose-50 text-rose-600 border border-rose-100',
  info: 'bg-sky-50 text-sky-600 border border-sky-100',
  outline: 'bg-transparent border border-slate-300 text-slate-600',
}

const badgeSizes = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
}

const dotColors = {
  default: 'bg-slate-400',
  primary: 'bg-primary-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  outline: 'bg-slate-400',
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      dot = false,
      removable = false,
      onRemove,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(
          // Clinical Precision: Soft rounded edges, refined typography
          'inline-flex items-center font-medium',
          'rounded-full', // Pill shape
          badgeVariants[variant],
          badgeSizes[size],
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn('w-1.5 h-1.5 rounded-full mr-1.5', dotColors[variant])}
          />
        )}
        {children}
        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove?.()
            }}
            className="ml-1.5 -mr-0.5 p-0.5 hover:bg-slate-200/50 rounded-full transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

// Category Badge - Clinical Precision version with Serif colors
export interface CategoryBadgeProps extends Omit<BadgeProps, 'variant'> {
  category: 'sleep' | 'metabolic' | 'recovery' | 'cognitive' | 'activity' | 'stress' | 'nutrition' | 'cardio' | 'mood'
}

// Serif palette: Soft, light backgrounds with matching text
const categoryColors: Record<string, string> = {
  sleep: 'bg-secondary-50 text-secondary-600 border border-secondary-100',
  metabolic: 'bg-accent-50 text-accent-600 border border-accent-100',
  recovery: 'bg-primary-50 text-primary-600 border border-primary-100',
  cognitive: 'bg-secondary-100 text-secondary-700 border border-secondary-200',
  activity: 'bg-primary-100 text-primary-700 border border-primary-200',
  stress: 'bg-accent-100 text-accent-700 border border-accent-200',
  nutrition: 'bg-primary-50 text-primary-600 border border-primary-100',
  cardio: 'bg-accent-50 text-accent-600 border border-accent-100',
  mood: 'bg-muted-50 text-muted-600 border border-muted-100',
}

export const CategoryBadge = forwardRef<HTMLSpanElement, CategoryBadgeProps>(
  ({ category, className, size = 'sm', children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium capitalize',
          'rounded-full', // Clinical Precision: Pill shape
          categoryColors[category] || categoryColors.sleep,
          badgeSizes[size],
          className
        )}
        {...props}
      >
        {children ?? category}
      </span>
    )
  }
)

CategoryBadge.displayName = 'CategoryBadge'

// Status Badge - Clinical Precision version
export interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: 'active' | 'inactive' | 'pending' | 'completed' | 'suggested' | 'paused'
}

const statusConfig: Record<StatusBadgeProps['status'], { color: string; dot: boolean }> = {
  active: { color: 'bg-emerald-50 text-emerald-600 border border-emerald-100', dot: true },
  inactive: { color: 'bg-slate-50 text-slate-500 border border-slate-200', dot: false },
  pending: { color: 'bg-amber-50 text-amber-600 border border-amber-100', dot: true },
  completed: { color: 'bg-primary-50 text-primary-600 border border-primary-100', dot: false },
  suggested: { color: 'bg-secondary-50 text-secondary-600 border border-secondary-100', dot: true },
  paused: { color: 'bg-slate-100 text-slate-500 border border-slate-200', dot: true },
}

const statusDotColors: Record<StatusBadgeProps['status'], string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-slate-400',
  pending: 'bg-amber-500 animate-pulse',
  completed: 'bg-primary-500',
  suggested: 'bg-secondary-500',
  paused: 'bg-slate-400',
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, size = 'sm', children, ...props }, ref) => {
    const config = statusConfig[status]

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium capitalize',
          'rounded-full', // Clinical Precision
          config.color,
          badgeSizes[size],
          className
        )}
        {...props}
      >
        {config.dot && (
          <span className={cn('w-1.5 h-1.5 rounded-full mr-1.5', statusDotColors[status])} />
        )}
        {children ?? status}
      </span>
    )
  }
)

StatusBadge.displayName = 'StatusBadge'

// Certainty Badge - Clinical Precision version
export interface CertaintyBadgeProps extends Omit<BadgeProps, 'variant'> {
  certainty: number // 0-100 or 0-1
}

export const CertaintyBadge = forwardRef<HTMLSpanElement, CertaintyBadgeProps>(
  ({ certainty, className, size = 'sm', ...props }, ref) => {
    // Normalize to 0-100
    const normalized = certainty > 1 ? certainty : certainty * 100

    let colorClass = 'bg-slate-50 text-slate-500 border border-slate-200'
    let label = ''

    if (normalized >= 85) {
      colorClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100'
      label = 'Very High'
    } else if (normalized >= 70) {
      colorClass = 'bg-primary-50 text-primary-600 border border-primary-100'
      label = 'High'
    } else if (normalized >= 50) {
      colorClass = 'bg-sky-50 text-sky-600 border border-sky-100'
      label = 'Moderate'
    } else if (normalized >= 30) {
      colorClass = 'bg-amber-50 text-amber-600 border border-amber-100'
      label = 'Low'
    } else {
      colorClass = 'bg-slate-50 text-slate-500 border border-slate-200'
      label = 'Exploratory'
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium',
          'rounded-full',
          colorClass,
          badgeSizes[size],
          className
        )}
        {...props}
      >
        {Math.round(normalized)}% {label}
      </span>
    )
  }
)

CertaintyBadge.displayName = 'CertaintyBadge'

// Trend Badge - Clinical Precision version
export interface TrendBadgeProps extends Omit<BadgeProps, 'variant'> {
  trend: 'up' | 'down' | 'stable'
  value?: string | number
  goodDirection?: 'up' | 'down' | 'stable'
}

export const TrendBadge = forwardRef<HTMLSpanElement, TrendBadgeProps>(
  ({ trend, value, goodDirection = 'up', className, size = 'sm', ...props }, ref) => {
    const isGood =
      trend === goodDirection || (goodDirection === 'stable' && trend === 'stable')

    let colorClass = 'bg-slate-50 text-slate-500 border border-slate-200'
    if (isGood) {
      colorClass = 'bg-emerald-50 text-emerald-600 border border-emerald-100'
    } else if (trend !== 'stable') {
      colorClass = 'bg-rose-50 text-rose-600 border border-rose-100'
    }

    const icons = {
      up: '↑',
      down: '↓',
      stable: '→',
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium',
          'rounded-full',
          colorClass,
          badgeSizes[size],
          className
        )}
        {...props}
      >
        {icons[trend]}
        {value && <span className="ml-1">{value}</span>}
      </span>
    )
  }
)

TrendBadge.displayName = 'TrendBadge'

export default Badge
