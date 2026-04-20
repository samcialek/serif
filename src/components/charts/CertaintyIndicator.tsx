import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/utils/classNames'
import { InfoTooltip } from '@/components/common'
import { useAnimatedValue } from '@/hooks'

export interface CertaintyIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number // 0-1 or 0-100
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  showTooltip?: boolean
  animated?: boolean
  variant?: 'bar' | 'arc' | 'ring' | 'badge'
}

// Normalize value to 0-100
const normalizeValue = (value: number) => (value > 1 ? value : value * 100)

// Get certainty level info
const getCertaintyLevel = (value: number) => {
  const normalized = normalizeValue(value)
  if (normalized >= 85) return { label: 'Very High', color: 'green', description: 'Strong personal evidence' }
  if (normalized >= 70) return { label: 'High', color: 'primary', description: 'Good personal evidence' }
  if (normalized >= 50) return { label: 'Moderate', color: 'blue', description: 'Mixed evidence' }
  if (normalized >= 30) return { label: 'Low', color: 'amber', description: 'Limited personal data' }
  return { label: 'Exploratory', color: 'gray', description: 'Based mostly on population data' }
}

const colorClasses = {
  green: {
    bg: 'bg-green-500',
    text: 'text-green-600',
    light: 'bg-green-100',
    ring: 'ring-green-500',
  },
  primary: {
    bg: 'bg-primary-500',
    text: 'text-primary-600',
    light: 'bg-primary-100',
    ring: 'ring-primary-500',
  },
  blue: {
    bg: 'bg-blue-500',
    text: 'text-blue-600',
    light: 'bg-blue-100',
    ring: 'ring-blue-500',
  },
  amber: {
    bg: 'bg-amber-500',
    text: 'text-amber-600',
    light: 'bg-amber-100',
    ring: 'ring-amber-500',
  },
  gray: {
    bg: 'bg-gray-400',
    text: 'text-gray-600',
    light: 'bg-gray-100',
    ring: 'ring-gray-400',
  },
}

const sizeConfig = {
  sm: { bar: 'h-1.5', text: 'text-xs', ring: 32, stroke: 3 },
  md: { bar: 'h-2', text: 'text-sm', ring: 48, stroke: 4 },
  lg: { bar: 'h-3', text: 'text-base', ring: 64, stroke: 5 },
}

export const CertaintyIndicator = forwardRef<HTMLDivElement, CertaintyIndicatorProps>(
  (
    {
      className,
      value,
      size = 'md',
      showLabel = true,
      showTooltip = true,
      animated = true,
      variant = 'bar',
      ...props
    },
    ref
  ) => {
    const normalized = normalizeValue(value)
    const level = getCertaintyLevel(normalized)
    const colors = colorClasses[level.color as keyof typeof colorClasses]
    const config = sizeConfig[size]
    const animatedValue = useAnimatedValue(normalized, { duration: animated ? 500 : 0 })

    if (variant === 'badge') {
      return (
        <div ref={ref} className={cn('inline-flex items-center gap-1.5', className)} {...props}>
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full font-medium',
              colors.light,
              colors.text,
              config.text
            )}
          >
            {Math.round(normalized)}%
            {showLabel && <span className="ml-1 opacity-75">{level.label}</span>}
          </span>
          {showTooltip && (
            <InfoTooltip content={level.description} />
          )}
        </div>
      )
    }

    if (variant === 'ring') {
      const ringSize = config.ring
      const radius = (ringSize - config.stroke * 2) / 2
      const circumference = 2 * Math.PI * radius
      const offset = circumference - (animatedValue / 100) * circumference

      return (
        <div ref={ref} className={cn('relative inline-flex', className)} {...props}>
          <svg width={ringSize} height={ringSize} className="-rotate-90">
            {/* Background */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              strokeWidth={config.stroke}
              className="stroke-gray-200"
            />
            {/* Progress */}
            <motion.circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              strokeWidth={config.stroke}
              strokeLinecap="round"
              className={colors.ring.replace('ring-', 'stroke-')}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: animated ? 0.5 : 0 }}
              style={{ strokeDasharray: circumference }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('font-bold', colors.text, config.text)}>
              {Math.round(animatedValue)}%
            </span>
          </div>
          {showTooltip && (
            <div className="absolute -top-1 -right-1">
              <InfoTooltip content={`${level.label}: ${level.description}`} iconSize={12} />
            </div>
          )}
        </div>
      )
    }

    if (variant === 'arc') {
      const arcSize = config.ring * 1.5
      const radius = arcSize / 2 - config.stroke
      const startAngle = -135
      const endAngle = 135
      const range = endAngle - startAngle
      const progressAngle = startAngle + (animatedValue / 100) * range

      const polarToCartesian = (angle: number) => {
        const rad = (angle * Math.PI) / 180
        return {
          x: arcSize / 2 + radius * Math.cos(rad),
          y: arcSize / 2 + radius * Math.sin(rad),
        }
      }

      const start = polarToCartesian(startAngle)
      const end = polarToCartesian(endAngle)
      const progress = polarToCartesian(progressAngle)

      const bgPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`
      const progressPath = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${animatedValue > 50 ? 1 : 0} 1 ${progress.x} ${progress.y}`

      return (
        <div ref={ref} className={cn('relative inline-flex flex-col items-center', className)} {...props}>
          <svg width={arcSize} height={arcSize * 0.7}>
            {/* Background arc */}
            <path
              d={bgPath}
              fill="none"
              strokeWidth={config.stroke}
              strokeLinecap="round"
              className="stroke-gray-200"
            />
            {/* Progress arc */}
            <motion.path
              d={progressPath}
              fill="none"
              strokeWidth={config.stroke}
              strokeLinecap="round"
              className={colors.ring.replace('ring-', 'stroke-')}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: animated ? 0.5 : 0 }}
            />
          </svg>
          <div className="absolute bottom-0 flex flex-col items-center">
            <span className={cn('font-bold', colors.text, size === 'lg' ? 'text-xl' : 'text-lg')}>
              {Math.round(animatedValue)}%
            </span>
            {showLabel && (
              <span className="text-xs text-gray-500">{level.label}</span>
            )}
          </div>
        </div>
      )
    }

    // Default: bar variant
    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {showLabel && (
          <div className="flex justify-between items-center mb-1">
            <span className={cn('font-medium', colors.text, config.text)}>
              {Math.round(normalized)}% {level.label}
            </span>
            {showTooltip && <InfoTooltip content={level.description} />}
          </div>
        )}
        <div className={cn('w-full rounded-full bg-gray-200 overflow-hidden', config.bar)}>
          <motion.div
            className={cn('h-full rounded-full', colors.bg)}
            initial={{ width: 0 }}
            animate={{ width: `${animatedValue}%` }}
            transition={{ duration: animated ? 0.5 : 0 }}
          />
        </div>
      </div>
    )
  }
)

CertaintyIndicator.displayName = 'CertaintyIndicator'

// Evidence Weight indicator (personal vs population)
export interface EvidenceWeightProps extends React.HTMLAttributes<HTMLDivElement> {
  personalWeight: number // 0-1
  showLabels?: boolean
  animated?: boolean
}

export const EvidenceWeight = forwardRef<HTMLDivElement, EvidenceWeightProps>(
  ({ className, personalWeight, showLabels = true, animated = true, ...props }, ref) => {
    const personal = normalizeValue(personalWeight)
    const _population = 100 - personal
    const animatedPersonal = useAnimatedValue(personal, { duration: animated ? 500 : 0 })

    return (
      <div ref={ref} className={cn('w-full', className)} data-tour="evidence-weight" {...props}>
        {showLabels && (
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Your Data ({Math.round(animatedPersonal)}%)</span>
            <span>Population ({Math.round(100 - animatedPersonal)}%)</span>
          </div>
        )}
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden flex">
          <motion.div
            className="h-full bg-primary-500"
            initial={{ width: 0 }}
            animate={{ width: `${animatedPersonal}%` }}
            transition={{ duration: animated ? 0.5 : 0 }}
          />
          <div className="h-full bg-gray-300 flex-1" />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-primary-600 font-medium">Personal evidence</span>
          <span className="text-gray-500">Population prior</span>
        </div>
      </div>
    )
  }
)

EvidenceWeight.displayName = 'EvidenceWeight'

export default CertaintyIndicator
