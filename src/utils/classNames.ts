import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines clsx and tailwind-merge for optimal class name handling.
 * - clsx: Handles conditional classes, arrays, objects
 * - twMerge: Intelligently merges Tailwind classes (e.g., p-2 + p-4 = p-4)
 *
 * @example
 * cn('px-2 py-1', isActive && 'bg-blue-500', { 'opacity-50': isDisabled })
 * cn('p-2', 'p-4') // => 'p-4' (twMerge dedupes)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Type-safe variant helper for component variants
 *
 * @example
 * const buttonVariants = variants({
 *   base: 'px-4 py-2 rounded',
 *   variants: {
 *     intent: {
 *       primary: 'bg-primary-500 text-white',
 *       secondary: 'bg-gray-200 text-gray-800',
 *     },
 *     size: {
 *       sm: 'text-sm',
 *       md: 'text-base',
 *       lg: 'text-lg',
 *     },
 *   },
 *   defaultVariants: {
 *     intent: 'primary',
 *     size: 'md',
 *   },
 * })
 */
export function variants<
  V extends Record<string, Record<string, string>>,
  D extends { [K in keyof V]?: keyof V[K] }
>(config: {
  base?: string
  variants: V
  defaultVariants?: D
}) {
  return (props?: { [K in keyof V]?: keyof V[K] }) => {
    const { base = '', variants, defaultVariants = {} } = config
    const classes: string[] = [base]

    for (const variantKey of Object.keys(variants)) {
      const defaultValue = (defaultVariants as Record<string, string>)[variantKey]
      const variantValue =
        props?.[variantKey as keyof typeof props] ?? defaultValue

      if (variantValue && variants[variantKey][variantValue as string]) {
        classes.push(variants[variantKey][variantValue as string])
      }
    }

    return cn(...classes)
  }
}

/**
 * Focus ring styles for accessibility
 */
export const focusRing = 'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'

/**
 * Focus visible ring (only shows on keyboard focus)
 */
export const focusVisibleRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2'

/**
 * Common transition classes
 */
export const transitions = {
  fast: 'transition-all duration-150 ease-in-out',
  normal: 'transition-all duration-300 ease-in-out',
  slow: 'transition-all duration-500 ease-in-out',
  colors: 'transition-colors duration-200',
  transform: 'transition-transform duration-200',
  opacity: 'transition-opacity duration-200',
}

/**
 * Common shadow classes
 */
export const shadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
  inner: 'shadow-inner',
  none: 'shadow-none',
}

/**
 * Animation enter/exit classes for Framer Motion
 */
export const animations = {
  fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
  },
  slideDown: {
    initial: { opacity: 0, y: -10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 },
  },
  slideRight: {
    initial: { opacity: 0, x: -10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -10 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
}
