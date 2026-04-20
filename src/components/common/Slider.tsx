import { forwardRef, useCallback, useRef, useState, useEffect } from 'react'
import { cn, focusVisibleRing, transitions } from '@/utils/classNames'

export interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  showValue?: boolean
  showLabels?: boolean
  minLabel?: string
  maxLabel?: string
  formatValue?: (value: number) => string
  onChange?: (value: number) => void
  onChangeEnd?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'certainty'
}

const trackSizes = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

const thumbSizes = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      value,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      showValue = false,
      showLabels = false,
      minLabel,
      maxLabel,
      formatValue = (v) => String(v),
      onChange,
      onChangeEnd,
      size = 'md',
      variant = 'default',
      ...props
    },
    ref
  ) => {
    const trackRef = useRef<HTMLDivElement>(null)
    const [isDragging, setIsDragging] = useState(false)

    const percentage = ((value - min) / (max - min)) * 100

    const calculateValue = useCallback(
      (clientX: number) => {
        if (!trackRef.current) return value

        const rect = trackRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const rawValue = min + percent * (max - min)
        const steppedValue = Math.round(rawValue / step) * step
        return Math.max(min, Math.min(max, steppedValue))
      },
      [min, max, step, value]
    )

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (disabled) return
        e.preventDefault()
        setIsDragging(true)
        const newValue = calculateValue(e.clientX)
        onChange?.(newValue)
      },
      [disabled, calculateValue, onChange]
    )

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (disabled) return
        setIsDragging(true)
        const touch = e.touches[0]
        const newValue = calculateValue(touch.clientX)
        onChange?.(newValue)
      },
      [disabled, calculateValue, onChange]
    )

    useEffect(() => {
      if (!isDragging) return

      const handleMouseMove = (e: MouseEvent) => {
        const newValue = calculateValue(e.clientX)
        onChange?.(newValue)
      }

      const handleTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0]
        const newValue = calculateValue(touch.clientX)
        onChange?.(newValue)
      }

      const handleEnd = () => {
        setIsDragging(false)
        onChangeEnd?.(value)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleEnd)
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleEnd)
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleEnd)
      }
    }, [isDragging, calculateValue, onChange, onChangeEnd, value])

    // Handle keyboard
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return

        let newValue = value
        switch (e.key) {
          case 'ArrowLeft':
          case 'ArrowDown':
            newValue = Math.max(min, value - step)
            break
          case 'ArrowRight':
          case 'ArrowUp':
            newValue = Math.min(max, value + step)
            break
          case 'Home':
            newValue = min
            break
          case 'End':
            newValue = max
            break
          default:
            return
        }
        e.preventDefault()
        onChange?.(newValue)
        onChangeEnd?.(newValue)
      },
      [disabled, value, min, max, step, onChange, onChangeEnd]
    )

    // Certainty gradient colors
    const certaintyGradient = 'bg-gradient-to-r from-gray-300 via-amber-400 to-green-500'

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {showLabels && (
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{minLabel ?? min}</span>
            {showValue && (
              <span className="font-medium text-gray-900">{formatValue(value)}</span>
            )}
            <span>{maxLabel ?? max}</span>
          </div>
        )}
        {!showLabels && showValue && (
          <div className="text-center text-sm font-medium text-gray-900 mb-2">
            {formatValue(value)}
          </div>
        )}
        <div
          ref={trackRef}
          className={cn(
            'relative w-full rounded-full cursor-pointer',
            variant === 'certainty' ? certaintyGradient : 'bg-gray-200',
            trackSizes[size],
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* Filled track (only for default variant) */}
          {variant === 'default' && (
            <div
              className={cn(
                'absolute top-0 left-0 h-full rounded-full bg-primary-600',
                transitions.fast
              )}
              style={{ width: `${percentage}%` }}
            />
          )}
          {/* Thumb */}
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
              'rounded-full bg-white border-2 border-primary-600 shadow',
              transitions.fast,
              focusVisibleRing,
              thumbSizes[size],
              isDragging && 'scale-110',
              disabled && 'border-gray-400'
            )}
            style={{ left: `${percentage}%` }}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-disabled={disabled}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    )
  }
)

Slider.displayName = 'Slider'

// Certainty Slider with labels
export interface CertaintySliderProps extends Omit<SliderProps, 'variant' | 'min' | 'max'> {
  showCertaintyLabel?: boolean
}

export const CertaintySlider = forwardRef<HTMLDivElement, CertaintySliderProps>(
  ({ showCertaintyLabel = true, formatValue, ...props }, ref) => {
    const getCertaintyLabel = (value: number) => {
      if (value >= 85) return 'Very High'
      if (value >= 70) return 'High'
      if (value >= 50) return 'Moderate'
      if (value >= 30) return 'Low'
      return 'Exploratory'
    }

    const defaultFormat = (value: number) => {
      if (showCertaintyLabel) {
        return `${value}% (${getCertaintyLabel(value)})`
      }
      return `${value}%`
    }

    return (
      <div ref={ref}>
        <Slider
          min={0}
          max={100}
          step={5}
          variant="certainty"
          showValue
          formatValue={formatValue ?? defaultFormat}
          {...props}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>More insights</span>
          <span>Higher confidence</span>
        </div>
      </div>
    )
  }
)

CertaintySlider.displayName = 'CertaintySlider'

// Range Slider (dual thumb)
export interface RangeSliderProps extends Omit<SliderProps, 'value' | 'onChange' | 'onChangeEnd'> {
  value: [number, number]
  onChange?: (value: [number, number]) => void
  onChangeEnd?: (value: [number, number]) => void
}

export const RangeSlider = forwardRef<HTMLDivElement, RangeSliderProps>(
  (
    {
      className,
      value,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      showLabels = false,
      formatValue = (v) => String(v),
      onChange,
      onChangeEnd,
      size = 'md',
      ...props
    },
    ref
  ) => {
    const trackRef = useRef<HTMLDivElement>(null)
    const [activeThumb, setActiveThumb] = useState<0 | 1 | null>(null)

    const percentages = value.map((v) => ((v - min) / (max - min)) * 100)

    const calculateValue = useCallback(
      (clientX: number) => {
        if (!trackRef.current) return value[0]

        const rect = trackRef.current.getBoundingClientRect()
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        const rawValue = min + percent * (max - min)
        return Math.round(rawValue / step) * step
      },
      [min, max, step, value]
    )

    const handleTrackClick = useCallback(
      (e: React.MouseEvent) => {
        if (disabled) return
        const clickValue = calculateValue(e.clientX)
        // Move closest thumb
        const distToMin = Math.abs(clickValue - value[0])
        const distToMax = Math.abs(clickValue - value[1])
        const newValue: [number, number] =
          distToMin < distToMax ? [clickValue, value[1]] : [value[0], clickValue]
        onChange?.(newValue)
      },
      [disabled, calculateValue, value, onChange]
    )

    useEffect(() => {
      if (activeThumb === null) return

      const handleMouseMove = (e: MouseEvent) => {
        const newVal = calculateValue(e.clientX)
        const newValue: [number, number] =
          activeThumb === 0
            ? [Math.min(newVal, value[1] - step), value[1]]
            : [value[0], Math.max(newVal, value[0] + step)]
        onChange?.(newValue)
      }

      const handleEnd = () => {
        setActiveThumb(null)
        onChangeEnd?.(value)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleEnd)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleEnd)
      }
    }, [activeThumb, calculateValue, onChange, onChangeEnd, value, step])

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {showLabels && (
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{formatValue(value[0])}</span>
            <span>{formatValue(value[1])}</span>
          </div>
        )}
        <div
          ref={trackRef}
          className={cn(
            'relative w-full rounded-full bg-gray-200 cursor-pointer',
            trackSizes[size],
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          onClick={handleTrackClick}
        >
          <div
            className="absolute top-0 h-full rounded-full bg-primary-600"
            style={{
              left: `${percentages[0]}%`,
              width: `${percentages[1] - percentages[0]}%`,
            }}
          />
          {[0, 1].map((i) => (
            <div
              key={i}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
                'rounded-full bg-white border-2 border-primary-600 shadow cursor-grab',
                transitions.fast,
                thumbSizes[size],
                activeThumb === i && 'scale-110 cursor-grabbing'
              )}
              style={{ left: `${percentages[i]}%` }}
              onMouseDown={(e) => {
                e.stopPropagation()
                if (!disabled) setActiveThumb(i as 0 | 1)
              }}
            />
          ))}
        </div>
      </div>
    )
  }
)

RangeSlider.displayName = 'RangeSlider'

export default Slider
