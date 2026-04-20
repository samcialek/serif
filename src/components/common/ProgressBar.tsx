import { forwardRef } from 'react'
import { cn, transitions } from '@/utils/classNames'
import { motion } from 'framer-motion'

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number // 0-100
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'gradient'
  showLabel?: boolean
  labelPosition?: 'inside' | 'outside' | 'tooltip'
  animated?: boolean
  striped?: boolean
  indeterminate?: boolean
}

const progressSizes = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
}

const progressColors = {
  default: 'bg-primary-600',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  gradient: 'bg-gradient-to-r from-primary-500 to-primary-700',
}

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      className,
      value,
      max = 100,
      size = 'md',
      variant = 'default',
      showLabel = false,
      labelPosition = 'outside',
      animated = true,
      striped = false,
      indeterminate = false,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100))

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {showLabel && labelPosition === 'outside' && (
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{Math.round(percentage)}%</span>
          </div>
        )}
        <div
          className={cn(
            'w-full rounded-full bg-gray-200 overflow-hidden',
            progressSizes[size]
          )}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        >
          {indeterminate ? (
            <motion.div
              className={cn('h-full rounded-full', progressColors[variant])}
              initial={{ x: '-100%', width: '30%' }}
              animate={{ x: '400%' }}
              transition={{
                repeat: Infinity,
                duration: 1.5,
                ease: 'easeInOut',
              }}
            />
          ) : (
            <motion.div
              className={cn(
                'h-full rounded-full',
                progressColors[variant],
                striped && 'bg-stripes',
                transitions.fast
              )}
              initial={animated ? { width: 0 } : { width: `${percentage}%` }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              {showLabel && labelPosition === 'inside' && size === 'lg' && (
                <span className="flex items-center justify-center h-full text-xs text-white font-medium">
                  {Math.round(percentage)}%
                </span>
              )}
            </motion.div>
          )}
        </div>
      </div>
    )
  }
)

ProgressBar.displayName = 'ProgressBar'

// Circular Progress
export interface CircularProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
  showLabel?: boolean
  label?: React.ReactNode
}

const circleColors = {
  default: 'stroke-primary-600',
  success: 'stroke-green-500',
  warning: 'stroke-amber-500',
  danger: 'stroke-red-500',
}

export const CircularProgress = forwardRef<HTMLDivElement, CircularProgressProps>(
  (
    {
      className,
      value,
      max = 100,
      size = 64,
      strokeWidth = 6,
      variant = 'default',
      showLabel = true,
      label,
      ...props
    },
    ref
  ) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100))
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (percentage / 100) * circumference

    return (
      <div
        ref={ref}
        className={cn('relative inline-flex items-center justify-center', className)}
        {...props}
      >
        <svg width={size} height={size} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-200"
          />
          {/* Progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={circleColors[variant]}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              strokeDasharray: circumference,
            }}
          />
        </svg>
        {showLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            {label !== undefined ? (
              label
            ) : (
              <span className="text-sm font-semibold text-gray-700">
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        )}
      </div>
    )
  }
)

CircularProgress.displayName = 'CircularProgress'

// Segmented Progress (for multi-step processes)
export interface SegmentedProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: { label: string; completed: boolean; active?: boolean }[]
  size?: 'sm' | 'md' | 'lg'
  showLabels?: boolean
}

export const SegmentedProgress = forwardRef<HTMLDivElement, SegmentedProgressProps>(
  ({ className, steps, size = 'md', showLabels = true, ...props }, ref) => {
    const dotSizes = {
      sm: 'w-2 h-2',
      md: 'w-3 h-3',
      lg: 'w-4 h-4',
    }

    const lineSizes = {
      sm: 'h-0.5',
      md: 'h-1',
      lg: 'h-1.5',
    }

    return (
      <div ref={ref} className={cn('', className)} {...props}>
        <div className="flex items-center">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center flex-1 last:flex-none">
              {/* Dot */}
              <div
                className={cn(
                  'rounded-full flex-shrink-0',
                  dotSizes[size],
                  step.completed
                    ? 'bg-primary-600'
                    : step.active
                    ? 'bg-primary-400 ring-4 ring-primary-100'
                    : 'bg-gray-300'
                )}
              />
              {/* Line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 mx-2 rounded-full',
                    lineSizes[size],
                    step.completed ? 'bg-primary-600' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>
        {showLabels && (
          <div className="flex mt-2">
            {steps.map((step, index) => (
              <div
                key={index}
                className={cn(
                  'flex-1 text-xs text-center last:text-right first:text-left',
                  step.completed || step.active ? 'text-gray-700' : 'text-gray-400'
                )}
              >
                {step.label}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
)

SegmentedProgress.displayName = 'SegmentedProgress'

// Sync Progress (animated stages)
export interface SyncProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  progress: number
  stage: string
  isComplete: boolean
}

export const SyncProgress = forwardRef<HTMLDivElement, SyncProgressProps>(
  ({ className, progress, stage, isComplete, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('space-y-2', className)} {...props}>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{stage}</span>
          <span className="text-gray-900 font-medium">{Math.round(progress)}%</span>
        </div>
        <ProgressBar
          value={progress}
          variant={isComplete ? 'success' : 'default'}
          animated
        />
      </div>
    )
  }
)

SyncProgress.displayName = 'SyncProgress'

export default ProgressBar
