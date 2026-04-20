import { forwardRef } from 'react'
import { cn } from '@/utils/classNames'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circular' | 'rectangular'
  animation?: 'pulse' | 'wave' | 'none'
  width?: string | number
  height?: string | number
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = 'default', animation = 'pulse', width, height, style, ...props }, ref) => {
    const variantStyles = {
      default: 'rounded-md',
      circular: 'rounded-full',
      rectangular: 'rounded-none',
    }

    const animationStyles = {
      pulse: 'animate-pulse',
      wave: 'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]',
      none: '',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'bg-gray-200',
          variantStyles[variant],
          animationStyles[animation],
          className
        )}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
          ...style,
        }}
        {...props}
      />
    )
  }
)

Skeleton.displayName = 'Skeleton'

// Skeleton Text (for text lines)
export interface SkeletonTextProps extends Omit<SkeletonProps, 'height'> {
  lines?: number
  lineHeight?: string
  lastLineWidth?: string
}

export const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ className, lines = 3, lineHeight = '1rem', lastLineWidth = '60%', ...props }, ref) => {
    return (
      <div ref={ref} className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            height={lineHeight}
            width={i === lines - 1 ? lastLineWidth : '100%'}
            {...props}
          />
        ))}
      </div>
    )
  }
)

SkeletonText.displayName = 'SkeletonText'

// Skeleton Card
export interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hasImage?: boolean
  imageHeight?: string
  hasHeader?: boolean
  hasFooter?: boolean
}

export const SkeletonCard = forwardRef<HTMLDivElement, SkeletonCardProps>(
  ({ className, hasImage = false, imageHeight = '200px', hasHeader = true, hasFooter = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('bg-white border border-gray-200 rounded-lg overflow-hidden', className)}
        {...props}
      >
        {hasImage && <Skeleton height={imageHeight} variant="rectangular" />}
        <div className="p-4 space-y-3">
          {hasHeader && (
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div className="flex-1 space-y-2">
                <Skeleton height="0.875rem" width="60%" />
                <Skeleton height="0.75rem" width="40%" />
              </div>
            </div>
          )}
          <SkeletonText lines={2} />
        </div>
        {hasFooter && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between">
            <Skeleton height="2rem" width="80px" />
            <Skeleton height="2rem" width="80px" />
          </div>
        )}
      </div>
    )
  }
)

SkeletonCard.displayName = 'SkeletonCard'

// Skeleton Avatar
export interface SkeletonAvatarProps extends Omit<SkeletonProps, 'variant'> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
}

const avatarSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
}

export const SkeletonAvatar = forwardRef<HTMLDivElement, SkeletonAvatarProps>(
  ({ className, size = 'md', ...props }, ref) => {
    const dimension = avatarSizes[size]
    return (
      <Skeleton
        ref={ref}
        variant="circular"
        width={dimension}
        height={dimension}
        className={className}
        {...props}
      />
    )
  }
)

SkeletonAvatar.displayName = 'SkeletonAvatar'

// Skeleton List Item
export interface SkeletonListItemProps extends React.HTMLAttributes<HTMLDivElement> {
  hasAvatar?: boolean
  hasAction?: boolean
}

export const SkeletonListItem = forwardRef<HTMLDivElement, SkeletonListItemProps>(
  ({ className, hasAvatar = true, hasAction = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex items-center gap-3 p-3', className)}
        {...props}
      >
        {hasAvatar && <SkeletonAvatar size="md" />}
        <div className="flex-1 space-y-2">
          <Skeleton height="0.875rem" width="70%" />
          <Skeleton height="0.75rem" width="50%" />
        </div>
        {hasAction && <Skeleton height="2rem" width="60px" />}
      </div>
    )
  }
)

SkeletonListItem.displayName = 'SkeletonListItem'

// Skeleton Table
export interface SkeletonTableProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number
  columns?: number
}

export const SkeletonTable = forwardRef<HTMLDivElement, SkeletonTableProps>(
  ({ className, rows = 5, columns = 4, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('', className)} {...props}>
        {/* Header */}
        <div className="flex gap-4 pb-3 border-b border-gray-200">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} height="1rem" className="flex-1" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex gap-4 py-3 border-b border-gray-100 last:border-0"
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                height="0.875rem"
                className="flex-1"
                width={colIndex === 0 ? '80%' : '100%'}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }
)

SkeletonTable.displayName = 'SkeletonTable'

// Skeleton Chart
export interface SkeletonChartProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: 'line' | 'bar' | 'pie'
}

export const SkeletonChart = forwardRef<HTMLDivElement, SkeletonChartProps>(
  ({ className, type = 'line', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('bg-gray-50 rounded-lg p-4', className)}
        {...props}
      >
        {type === 'line' && (
          <div className="space-y-4">
            {/* Y-axis labels */}
            <div className="flex">
              <div className="w-12 space-y-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} height="0.75rem" width="2rem" />
                ))}
              </div>
              {/* Chart area */}
              <div className="flex-1 h-48 flex items-end justify-between gap-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="flex-1"
                    height={`${30 + Math.random() * 70}%`}
                  />
                ))}
              </div>
            </div>
            {/* X-axis labels */}
            <div className="flex gap-2 pl-12">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height="0.75rem" className="flex-1" />
              ))}
            </div>
          </div>
        )}
        {type === 'bar' && (
          <div className="h-48 flex items-end justify-around gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <Skeleton
                  className="w-full"
                  height={`${30 + Math.random() * 70}%`}
                />
                <Skeleton height="0.75rem" width="2rem" />
              </div>
            ))}
          </div>
        )}
        {type === 'pie' && (
          <div className="flex items-center justify-center">
            <Skeleton variant="circular" width={180} height={180} />
          </div>
        )}
      </div>
    )
  }
)

SkeletonChart.displayName = 'SkeletonChart'

// Skeleton Insight Card (specific to Serif)
export const SkeletonInsightCard = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('bg-white border border-gray-200 rounded-lg p-4 space-y-3', className)}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Skeleton width={60} height="1.25rem" className="rounded-full" />
            <Skeleton width={80} height="1.25rem" className="rounded-full" />
          </div>
          <Skeleton width={40} height="1rem" />
        </div>
        <Skeleton height="1.25rem" width="85%" />
        <SkeletonText lines={2} lineHeight="0.875rem" />
        <div className="flex gap-2 pt-2">
          <Skeleton height="2rem" width="100px" className="rounded-md" />
          <Skeleton height="2rem" width="80px" className="rounded-md" />
        </div>
      </div>
    )
  }
)

SkeletonInsightCard.displayName = 'SkeletonInsightCard'

export default Skeleton
