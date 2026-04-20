import { forwardRef, useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/classNames'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useDemoStore } from '@/stores/demoStore'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastProps {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  onClose?: () => void
}

const toastIcons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const toastStyles = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
}

const toastIconStyles = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

export const Toast = forwardRef<HTMLDivElement, ToastProps>(
  ({ type, title, message, duration = 5000, onClose }, ref) => {
    const Icon = toastIcons[type]

    const handleClose = useCallback(() => {
      onClose?.()
    }, [onClose])

    useEffect(() => {
      if (duration > 0) {
        const timer = setTimeout(handleClose, duration)
        return () => clearTimeout(timer)
      }
    }, [duration, handleClose])

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex items-start gap-3 p-4 rounded-lg border shadow-lg max-w-sm',
          toastStyles[type]
        )}
      >
        <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', toastIconStyles[type])} />
        <div className="flex-1">
          <p className="text-sm font-medium">{title}</p>
          {message && <p className="text-xs mt-1 opacity-80">{message}</p>}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    )
  }
)

Toast.displayName = 'Toast'

// Toast Container
export interface ToastContainerProps {
  position?: 'top-left' | 'top-right' | 'top-center' | 'bottom-left' | 'bottom-right' | 'bottom-center'
}

const positionStyles = {
  'top-left': 'top-4 left-4 items-start',
  'top-right': 'top-4 right-4 items-end',
  'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-left': 'bottom-4 left-4 items-start',
  'bottom-right': 'bottom-4 right-4 items-end',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
}

export const ToastContainer = forwardRef<HTMLDivElement, ToastContainerProps>(
  ({ position = 'bottom-right' }, ref) => {
    const { toasts, removeToast } = useDemoStore()

    return createPortal(
      <div
        ref={ref}
        className={cn(
          'fixed z-[100] flex flex-col gap-2 pointer-events-none',
          positionStyles[position]
        )}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <Toast
                {...toast}
                onClose={() => removeToast(toast.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>,
      document.body
    )
  }
)

ToastContainer.displayName = 'ToastContainer'

// Hook for imperative toast usage (alternative to store)
export function useToast() {
  const { addToast, removeToast } = useDemoStore()

  const toast = useCallback(
    (title: string, type: ToastType = 'info', message?: string) => {
      addToast({ title, type, message })
    },
    [addToast]
  )

  const success = useCallback(
    (title: string, message?: string) => toast(title, 'success', message),
    [toast]
  )

  const error = useCallback(
    (title: string, message?: string) => toast(title, 'error', message),
    [toast]
  )

  const warning = useCallback(
    (title: string, message?: string) => toast(title, 'warning', message),
    [toast]
  )

  const info = useCallback(
    (title: string, message?: string) => toast(title, 'info', message),
    [toast]
  )

  return {
    toast,
    success,
    error,
    warning,
    info,
    dismiss: removeToast,
  }
}

// Simple Notification Banner (for persistent messages)
export interface NotificationBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: ToastType
  message: string
  action?: {
    label: string
    onClick: () => void
  }
  dismissible?: boolean
  onDismiss?: () => void
}

export const NotificationBanner = forwardRef<HTMLDivElement, NotificationBannerProps>(
  ({ className, type = 'info', message, action, dismissible = true, onDismiss, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(true)
    const Icon = toastIcons[type]

    if (!isVisible) return null

    const handleDismiss = () => {
      setIsVisible(false)
      onDismiss?.()
    }

    return (
      <div
        ref={ref}
        className={cn('px-4 py-3 border-b', toastStyles[type], className)}
        {...props}
      >
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          <Icon className={cn('w-5 h-5 flex-shrink-0', toastIconStyles[type])} />
          <p className="flex-1 text-sm">{message}</p>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="text-sm font-medium underline hover:no-underline"
            >
              {action.label}
            </button>
          )}
          {dismissible && (
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }
)

NotificationBanner.displayName = 'NotificationBanner'

export default Toast
