import { forwardRef } from 'react'
import { cn, focusVisibleRing } from '@/utils/classNames'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
}

// SERIF CLINICAL PRECISION: Soft corners, subtle shadows, refined transitions
const buttonVariants = {
  primary:
    'bg-primary-500 text-white border border-primary-500 hover:bg-primary-600 hover:border-primary-600 active:bg-primary-700 disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-400 shadow-sm hover:shadow',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 shadow-sm',
  outline:
    'bg-transparent text-primary-600 border border-primary-200 hover:bg-primary-50 hover:border-primary-300 active:bg-primary-100 disabled:text-slate-400 disabled:border-slate-200',
  ghost:
    'bg-transparent text-slate-600 border border-transparent hover:bg-slate-50 hover:text-slate-800 active:bg-slate-100 disabled:text-slate-400',
  danger:
    'bg-rose-500 text-white border border-rose-500 hover:bg-rose-600 hover:border-rose-600 active:bg-rose-700 disabled:bg-rose-200 disabled:border-rose-200 shadow-sm',
  success:
    'bg-emerald-500 text-white border border-emerald-500 hover:bg-emerald-600 hover:border-emerald-600 active:bg-emerald-700 disabled:bg-emerald-200 disabled:border-emerald-200 shadow-sm',
}

const buttonSizes = {
  xs: 'px-2.5 py-1 text-xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

const iconSizes = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        className={cn(
          // Clinical Precision: Soft edges, refined typography
          'inline-flex items-center justify-center',
          'font-medium',
          'rounded-lg', // Soft rounded corners
          'transition-all duration-200', // Smooth transition
          focusVisibleRing,
          buttonVariants[variant],
          buttonSizes[size],
          fullWidth && 'w-full',
          isDisabled && 'cursor-not-allowed',
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className={cn('animate-spin', iconSizes[size], children && 'mr-2')} />
        ) : (
          leftIcon && <span className={cn(iconSizes[size], 'mr-2')}>{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && <span className={cn(iconSizes[size], 'ml-2')}>{rightIcon}</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'

// Icon Button - Clinical Precision version
export interface IconButtonProps extends Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'fullWidth'> {
  icon: React.ReactNode
  'aria-label': string
}

const iconButtonSizes = {
  xs: 'p-1',
  sm: 'p-1.5',
  md: 'p-2',
  lg: 'p-2.5',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'md', loading = false, icon, disabled, ...props }, ref) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center',
          'rounded-lg', // Clinical Precision: Soft rounded corners
          'transition-all duration-200',
          focusVisibleRing,
          buttonVariants[variant],
          iconButtonSizes[size],
          isDisabled && 'cursor-not-allowed',
          className
        )}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <Loader2 className={cn('animate-spin', iconSizes[size])} />
        ) : (
          <span className={iconSizes[size]}>{icon}</span>
        )}
      </button>
    )
  }
)

IconButton.displayName = 'IconButton'

// Button Group - Clinical Precision version
export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  attached?: boolean
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, attached = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex',
          // Clinical Precision: Attached buttons share borders smoothly
          attached && '[&>button]:rounded-none [&>button:first-child]:rounded-l-lg [&>button:last-child]:rounded-r-lg [&>button:not(:last-child)]:border-r-0',
          !attached && 'gap-2',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ButtonGroup.displayName = 'ButtonGroup'

export default Button
