import { forwardRef } from 'react'
import { cn, focusVisibleRing, transitions } from '@/utils/classNames'

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  description?: string
  size?: 'sm' | 'md' | 'lg'
  onToggle?: (checked: boolean) => void
}

const toggleSizes = {
  sm: {
    track: 'w-8 h-4',
    thumb: 'w-3 h-3',
    translate: 'translate-x-4',
  },
  md: {
    track: 'w-11 h-6',
    thumb: 'w-5 h-5',
    translate: 'translate-x-5',
  },
  lg: {
    track: 'w-14 h-7',
    thumb: 'w-6 h-6',
    translate: 'translate-x-7',
  },
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ className, label, description, size = 'md', checked, onChange, onToggle, disabled, id, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e)
      onToggle?.(e.target.checked)
    }

    const sizeConfig = toggleSizes[size]

    return (
      <label
        htmlFor={id}
        className={cn(
          'inline-flex items-center gap-3',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          className
        )}
      >
        <div className="relative">
          <input
            ref={ref}
            type="checkbox"
            id={id}
            checked={checked}
            onChange={handleChange}
            disabled={disabled}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'rounded-full bg-gray-200',
              transitions.colors,
              'peer-checked:bg-primary-600',
              'peer-disabled:bg-gray-100',
              focusVisibleRing,
              'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2',
              sizeConfig.track
            )}
          />
          <div
            className={cn(
              'absolute top-0.5 left-0.5 bg-white rounded-full shadow',
              transitions.transform,
              'peer-checked:' + sizeConfig.translate,
              sizeConfig.thumb
            )}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className={cn('font-medium text-gray-900', size === 'sm' ? 'text-sm' : 'text-base')}>
                {label}
              </span>
            )}
            {description && <span className="text-sm text-gray-500">{description}</span>}
          </div>
        )}
      </label>
    )
  }
)

Toggle.displayName = 'Toggle'

// Checkbox variant
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  description?: string
  size?: 'sm' | 'md' | 'lg'
  indeterminate?: boolean
}

const checkboxSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, size = 'md', indeterminate: _indeterminate, disabled, id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className={cn(
          'inline-flex items-start gap-3',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          className
        )}
      >
        <div className="relative flex items-center justify-center">
          <input
            ref={ref}
            type="checkbox"
            id={id}
            disabled={disabled}
            className={cn(
              'appearance-none rounded border-2 border-gray-300',
              'checked:bg-primary-600 checked:border-primary-600',
              'indeterminate:bg-primary-600 indeterminate:border-primary-600',
              transitions.colors,
              focusVisibleRing,
              checkboxSizes[size]
            )}
            {...props}
          />
          <svg
            className={cn(
              'absolute pointer-events-none text-white',
              'opacity-0',
              '[input:checked~&]:opacity-100',
              size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-3.5 h-3.5' : 'w-4 h-4'
            )}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M4 8L7 11L12 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className={cn('font-medium text-gray-900', size === 'sm' ? 'text-sm' : 'text-base')}>
                {label}
              </span>
            )}
            {description && <span className="text-sm text-gray-500">{description}</span>}
          </div>
        )}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'

// Radio variant
export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, size = 'md', disabled, id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className={cn(
          'inline-flex items-center gap-3',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          className
        )}
      >
        <div className="relative flex items-center justify-center">
          <input
            ref={ref}
            type="radio"
            id={id}
            disabled={disabled}
            className={cn(
              'appearance-none rounded-full border-2 border-gray-300',
              'checked:border-primary-600',
              transitions.colors,
              focusVisibleRing,
              checkboxSizes[size]
            )}
            {...props}
          />
          <div
            className={cn(
              'absolute rounded-full bg-primary-600',
              'scale-0 [input:checked~&]:scale-100',
              transitions.transform,
              size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3 h-3'
            )}
          />
        </div>
        {label && (
          <span className={cn('font-medium text-gray-900', size === 'sm' ? 'text-sm' : 'text-base')}>
            {label}
          </span>
        )}
      </label>
    )
  }
)

Radio.displayName = 'Radio'

// Radio Group
export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  value?: string
  onValueChange?: (value: string) => void
  orientation?: 'horizontal' | 'vertical'
}

export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, name: _name, value: _value, onValueChange: _onValueChange, orientation = 'vertical', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="radiogroup"
        className={cn('flex', orientation === 'vertical' ? 'flex-col gap-2' : 'flex-row gap-4', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

RadioGroup.displayName = 'RadioGroup'

export default Toggle
