import { useState, useRef, useEffect, forwardRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn, transitions } from '@/utils/classNames'

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  position?: TooltipPosition
  delay?: number
  disabled?: boolean
  className?: string
  maxWidth?: number
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      content,
      children,
      position = 'top',
      delay = 200,
      disabled = false,
      className,
      maxWidth = 200,
    },
    _ref
  ) => {
    const [isVisible, setIsVisible] = useState(false)
    const [coords, setCoords] = useState({ top: 0, left: 0 })
    const triggerRef = useRef<HTMLDivElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

    const calculatePosition = useCallback(() => {
      if (!triggerRef.current || !tooltipRef.current) return

      const trigger = triggerRef.current.getBoundingClientRect()
      const tooltip = tooltipRef.current.getBoundingClientRect()
      const scrollY = window.scrollY
      const scrollX = window.scrollX

      let top = 0
      let left = 0
      const gap = 8

      switch (position) {
        case 'top':
          top = trigger.top + scrollY - tooltip.height - gap
          left = trigger.left + scrollX + trigger.width / 2 - tooltip.width / 2
          break
        case 'bottom':
          top = trigger.bottom + scrollY + gap
          left = trigger.left + scrollX + trigger.width / 2 - tooltip.width / 2
          break
        case 'left':
          top = trigger.top + scrollY + trigger.height / 2 - tooltip.height / 2
          left = trigger.left + scrollX - tooltip.width - gap
          break
        case 'right':
          top = trigger.top + scrollY + trigger.height / 2 - tooltip.height / 2
          left = trigger.right + scrollX + gap
          break
      }

      // Keep within viewport
      const padding = 8
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltip.width - padding))
      top = Math.max(padding, Math.min(top, window.innerHeight + scrollY - tooltip.height - padding))

      setCoords({ top, left })
    }, [position])

    const showTooltip = useCallback(() => {
      if (disabled) return
      timeoutRef.current = setTimeout(() => {
        setIsVisible(true)
      }, delay)
    }, [disabled, delay])

    const hideTooltip = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      setIsVisible(false)
    }, [])

    useEffect(() => {
      if (isVisible) {
        // Use RAF to ensure tooltip is rendered before calculating position
        requestAnimationFrame(calculatePosition)
      }
    }, [isVisible, calculatePosition])

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
      }
    }, [])

    const arrowClasses = {
      top: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-t-gray-900 border-x-transparent border-b-transparent',
      bottom: 'top-0 left-1/2 -translate-x-1/2 -translate-y-full border-b-gray-900 border-x-transparent border-t-transparent',
      left: 'right-0 top-1/2 -translate-y-1/2 translate-x-full border-l-gray-900 border-y-transparent border-r-transparent',
      right: 'left-0 top-1/2 -translate-y-1/2 -translate-x-full border-r-gray-900 border-y-transparent border-l-transparent',
    }

    return (
      <>
        <div
          ref={triggerRef}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onFocus={showTooltip}
          onBlur={hideTooltip}
          className="inline-block"
        >
          {children}
        </div>
        {isVisible &&
          createPortal(
            <div
              ref={tooltipRef}
              className={cn(
                'fixed z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg',
                transitions.fast,
                'animate-in fade-in-0 zoom-in-95',
                className
              )}
              style={{
                top: coords.top,
                left: coords.left,
                maxWidth,
              }}
              role="tooltip"
            >
              {content}
              <span
                className={cn('absolute w-0 h-0 border-4', arrowClasses[position])}
              />
            </div>,
            document.body
          )}
      </>
    )
  }
)

Tooltip.displayName = 'Tooltip'

// Info Tooltip with icon
export interface InfoTooltipProps extends Omit<TooltipProps, 'children'> {
  iconSize?: number
}

export const InfoTooltip = forwardRef<HTMLDivElement, InfoTooltipProps>(
  ({ content, iconSize = 16, ...props }, _ref) => {
    return (
      <Tooltip content={content} {...props}>
        <button
          type="button"
          className="inline-flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            width={iconSize}
            height={iconSize}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 11V8M8 5.5V5" strokeLinecap="round" />
          </svg>
        </button>
      </Tooltip>
    )
  }
)

InfoTooltip.displayName = 'InfoTooltip'

// Popover (similar to tooltip but with more control)
export interface PopoverProps {
  trigger: React.ReactNode
  content: React.ReactNode
  position?: TooltipPosition
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export const Popover = forwardRef<HTMLDivElement, PopoverProps>(
  ({ trigger, content, position = 'bottom', isOpen: controlledOpen, onOpenChange, className }, _ref) => {
    const [internalOpen, setInternalOpen] = useState(false)
    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
    const triggerRef = useRef<HTMLDivElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const [coords, setCoords] = useState({ top: 0, left: 0 })

    const setOpen = useCallback(
      (open: boolean) => {
        if (onOpenChange) {
          onOpenChange(open)
        } else {
          setInternalOpen(open)
        }
      },
      [onOpenChange]
    )

    const calculatePosition = useCallback(() => {
      if (!triggerRef.current || !popoverRef.current) return

      const trigger = triggerRef.current.getBoundingClientRect()
      const popover = popoverRef.current.getBoundingClientRect()
      const scrollY = window.scrollY
      const scrollX = window.scrollX

      let top = 0
      let left = 0
      const gap = 8

      switch (position) {
        case 'top':
          top = trigger.top + scrollY - popover.height - gap
          left = trigger.left + scrollX + trigger.width / 2 - popover.width / 2
          break
        case 'bottom':
          top = trigger.bottom + scrollY + gap
          left = trigger.left + scrollX + trigger.width / 2 - popover.width / 2
          break
        case 'left':
          top = trigger.top + scrollY + trigger.height / 2 - popover.height / 2
          left = trigger.left + scrollX - popover.width - gap
          break
        case 'right':
          top = trigger.top + scrollY + trigger.height / 2 - popover.height / 2
          left = trigger.right + scrollX + gap
          break
      }

      setCoords({ top, left })
    }, [position])

    useEffect(() => {
      if (isOpen) {
        requestAnimationFrame(calculatePosition)
      }
    }, [isOpen, calculatePosition])

    // Close on outside click
    useEffect(() => {
      if (!isOpen) return

      const handleClickOutside = (e: MouseEvent) => {
        if (
          triggerRef.current &&
          !triggerRef.current.contains(e.target as Node) &&
          popoverRef.current &&
          !popoverRef.current.contains(e.target as Node)
        ) {
          setOpen(false)
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen, setOpen])

    // Close on escape
    useEffect(() => {
      if (!isOpen) return

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false)
        }
      }

      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, setOpen])

    return (
      <>
        <div ref={triggerRef} onClick={() => setOpen(!isOpen)} className="inline-block">
          {trigger}
        </div>
        {isOpen &&
          createPortal(
            <div
              ref={popoverRef}
              className={cn(
                'fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200',
                transitions.fast,
                'animate-in fade-in-0 zoom-in-95',
                className
              )}
              style={{
                top: coords.top,
                left: coords.left,
              }}
            >
              {content}
            </div>,
            document.body
          )}
      </>
    )
  }
)

Popover.displayName = 'Popover'

export default Tooltip
