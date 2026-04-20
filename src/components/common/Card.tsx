import { forwardRef } from 'react'
import { cn } from '@/utils/classNames'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated' | 'ghost'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
  /** Subtle accent stripe color */
  accent?: 'cyan' | 'pink' | 'lavender' | 'muted' | 'success' | 'warning'
  /** Header text for accent stripe */
  accentLabel?: string
}

// SERIF CLINICAL PRECISION: Subtle borders, soft shadows, rounded corners
const cardVariants = {
  default: 'bg-white border border-slate-200 shadow-sm',
  outlined: 'bg-white border border-slate-200',
  elevated: 'bg-white border border-slate-100 shadow-md',
  ghost: 'bg-slate-50/50 border border-slate-100',
}

const cardPadding = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

const accentColors = {
  cyan: 'border-l-serif-cyan bg-gradient-to-r from-primary-50/30 to-transparent',
  pink: 'border-l-serif-pink bg-gradient-to-r from-accent-50/30 to-transparent',
  lavender: 'border-l-serif-lavender bg-gradient-to-r from-secondary-50/30 to-transparent',
  muted: 'border-l-serif-blue bg-gradient-to-r from-muted-50/30 to-transparent',
  success: 'border-l-emerald-400 bg-gradient-to-r from-emerald-50/30 to-transparent',
  warning: 'border-l-amber-400 bg-gradient-to-r from-amber-50/30 to-transparent',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({
    className,
    variant = 'default',
    padding = 'md',
    interactive = false,
    accent,
    accentLabel,
    children,
    ...props
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-xl', // Clinical Precision: Soft rounded corners
          cardVariants[variant],
          cardPadding[padding],
          accent && 'border-l-[3px]',
          accent && accentColors[accent],
          interactive && 'cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-slate-300',
          className
        )}
        {...props}
      >
        {/* Accent label when present */}
        {accent && accentLabel && (
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-3">
            {accentLabel}
          </p>
        )}
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

// Card Header - Clinical Precision version
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  action?: React.ReactNode
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, title, subtitle, action, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-start justify-between mb-4', className)}
        {...props}
      >
        {(title || subtitle) ? (
          <div>
            {title && (
              <h3 className="text-base font-semibold text-slate-800 tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        ) : children}
        {action && <div className="ml-4 flex-shrink-0">{action}</div>}
      </div>
    )
  }
)

CardHeader.displayName = 'CardHeader'

// Card Content
export type CardContentProps = React.HTMLAttributes<HTMLDivElement>

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('', className)} {...props}>
        {children}
      </div>
    )
  }
)

CardContent.displayName = 'CardContent'

// Card Footer - Clinical Precision version
export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'mt-4 pt-4 border-t border-slate-100 flex items-center justify-between',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CardFooter.displayName = 'CardFooter'

// Metric Card - Clinical Precision version
export interface MetricCardProps extends CardProps {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  trendValue?: string
  icon?: React.ReactNode
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ label, value, unit, trend, trendValue, icon, className, ...props }, ref) => {
    const trendColors = {
      up: 'text-emerald-600 bg-emerald-50',
      down: 'text-rose-600 bg-rose-50',
      stable: 'text-slate-600 bg-slate-50',
    }

    const trendIcons = {
      up: '↑',
      down: '↓',
      stable: '→',
    }

    return (
      <Card ref={ref} className={cn('', className)} {...props}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              {label}
            </p>
            <div className="flex items-baseline mt-2">
              <span className="text-2xl font-semibold text-slate-800">{value}</span>
              {unit && (
                <span className="ml-1.5 text-sm text-slate-400">
                  {unit}
                </span>
              )}
            </div>
            {trend && trendValue && (
              <p className={cn(
                'inline-flex items-center text-xs font-medium mt-2 px-2 py-0.5 rounded-full',
                trendColors[trend]
              )}>
                {trendIcons[trend]} {trendValue}
              </p>
            )}
          </div>
          {icon && (
            <div className="p-2.5 bg-primary-50 text-primary-500 rounded-lg">
              {icon}
            </div>
          )}
        </div>
      </Card>
    )
  }
)

MetricCard.displayName = 'MetricCard'

export default Card
