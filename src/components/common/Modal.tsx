import { forwardRef, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn, focusVisibleRing } from '@/utils/classNames'
import { X } from 'lucide-react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  className?: string
  overlayClassName?: string
}

const modalSizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      description,
      children,
      size = 'md',
      closeOnOverlayClick = true,
      closeOnEscape = true,
      showCloseButton = true,
      className,
      overlayClassName,
    },
    _ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)

    // Handle escape key
    useEffect(() => {
      if (!isOpen || !closeOnEscape) return

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }

      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, closeOnEscape, onClose])

    // Focus management
    useEffect(() => {
      if (isOpen) {
        previousFocusRef.current = document.activeElement as HTMLElement
        modalRef.current?.focus()
      } else if (previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }, [isOpen])

    // Lock body scroll
    useEffect(() => {
      if (isOpen) {
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
          document.body.style.overflow = originalOverflow
        }
      }
    }, [isOpen])

    const handleOverlayClick = useCallback(
      (e: React.MouseEvent) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          onClose()
        }
      },
      [closeOnOverlayClick, onClose]
    )

    return createPortal(
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={cn('absolute inset-0 bg-black/50', overlayClassName)}
              onClick={handleOverlayClick}
            />

            {/* Modal */}
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={cn(
                'relative w-full mx-4 bg-white rounded-xl shadow-xl',
                'max-h-[90vh] overflow-hidden flex flex-col',
                focusVisibleRing,
                modalSizes[size],
                className
              )}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              aria-describedby={description ? 'modal-description' : undefined}
            >
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-start justify-between px-6 pt-6 pb-4">
                  <div>
                    {title && (
                      <h2 id="modal-title" className="text-lg font-semibold text-gray-900">
                        {title}
                      </h2>
                    )}
                    {description && (
                      <p id="modal-description" className="mt-1 text-sm text-gray-500">
                        {description}
                      </p>
                    )}
                  </div>
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      className={cn(
                        'p-1 -mr-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors',
                        focusVisibleRing
                      )}
                    >
                      <X className="w-5 h-5" />
                      <span className="sr-only">Close</span>
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-auto px-6 pb-6">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )
  }
)

Modal.displayName = 'Modal'

// Modal Footer
export type ModalFooterProps = React.HTMLAttributes<HTMLDivElement>

export const ModalFooter = forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center justify-end gap-3 pt-4 mt-4 border-t border-gray-100',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

ModalFooter.displayName = 'ModalFooter'

// Confirmation Modal
export interface ConfirmModalProps extends Omit<ModalProps, 'children'> {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'primary' | 'danger'
  onConfirm: () => void
  isLoading?: boolean
}

export const ConfirmModal = forwardRef<HTMLDivElement, ConfirmModalProps>(
  (
    {
      message,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      confirmVariant = 'primary',
      onConfirm,
      onClose,
      isLoading = false,
      ...props
    },
    ref
  ) => {
    const confirmButtonClass =
      confirmVariant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-primary-600 text-white hover:bg-primary-700'

    return (
      <Modal ref={ref} size="sm" onClose={onClose} {...props}>
        <p className="text-gray-600">{message}</p>
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50',
              confirmButtonClass
            )}
          >
            {isLoading ? 'Loading...' : confirmLabel}
          </button>
        </ModalFooter>
      </Modal>
    )
  }
)

ConfirmModal.displayName = 'ConfirmModal'

// Drawer (slide-in panel)
export interface DrawerProps extends Omit<ModalProps, 'size'> {
  position?: 'left' | 'right'
  width?: string
}

export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(
  (
    {
      isOpen,
      onClose,
      title,
      children,
      position = 'right',
      width = '400px',
      closeOnOverlayClick = true,
      closeOnEscape = true,
      showCloseButton = true,
      className,
      overlayClassName,
    },
    ref
  ) => {
    useEffect(() => {
      if (!isOpen || !closeOnEscape) return

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }

      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, closeOnEscape, onClose])

    useEffect(() => {
      if (isOpen) {
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
          document.body.style.overflow = originalOverflow
        }
      }
    }, [isOpen])

    const handleOverlayClick = useCallback(
      (e: React.MouseEvent) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) {
          onClose()
        }
      },
      [closeOnOverlayClick, onClose]
    )

    const slideFrom = position === 'left' ? { x: '-100%' } : { x: '100%' }

    return createPortal(
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn('absolute inset-0 bg-black/50', overlayClassName)}
              onClick={handleOverlayClick}
            />

            {/* Drawer */}
            <motion.div
              ref={ref}
              initial={slideFrom}
              animate={{ x: 0 }}
              exit={slideFrom}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={cn(
                'absolute top-0 h-full bg-white shadow-xl flex flex-col',
                position === 'left' ? 'left-0' : 'right-0',
                className
              )}
              style={{ width }}
            >
              {/* Header */}
              {(title || showCloseButton) && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                  {title && <h2 className="text-lg font-semibold text-gray-900">{title}</h2>}
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-auto p-6">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    )
  }
)

Drawer.displayName = 'Drawer'

export default Modal
