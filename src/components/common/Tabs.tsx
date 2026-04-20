import { createContext, useContext, useState, forwardRef, useCallback } from 'react'
import { cn, focusVisibleRing, transitions } from '@/utils/classNames'
import { motion } from 'framer-motion'

// Context for tabs
interface TabsContextValue {
  activeTab: string
  setActiveTab: (value: string) => void
  variant: 'default' | 'pills' | 'underline'
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tab components must be used within a Tabs component')
  }
  return context
}

// Tabs Root
export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  variant?: 'default' | 'pills' | 'underline'
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ className, value, defaultValue, onValueChange, variant = 'default', children, ...props }, ref) => {
    const [internalValue, setInternalValue] = useState(defaultValue ?? '')
    const activeTab = value !== undefined ? value : internalValue

    const setActiveTab = useCallback(
      (newValue: string) => {
        if (value === undefined) {
          setInternalValue(newValue)
        }
        onValueChange?.(newValue)
      },
      [value, onValueChange]
    )

    return (
      <TabsContext.Provider value={{ activeTab, setActiveTab, variant }}>
        <div ref={ref} className={cn('', className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)

Tabs.displayName = 'Tabs'

// Tab List
export type TabListProps = React.HTMLAttributes<HTMLDivElement>

export const TabList = forwardRef<HTMLDivElement, TabListProps>(
  ({ className, children, ...props }, ref) => {
    const { variant } = useTabsContext()

    const listStyles = {
      default: 'border-b border-gray-200',
      pills: 'bg-gray-100 p-1 rounded-lg',
      underline: 'border-b border-gray-200',
    }

    return (
      <div
        ref={ref}
        role="tablist"
        className={cn('flex', listStyles[variant], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

TabList.displayName = 'TabList'

// Tab Trigger
export interface TabTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
  icon?: React.ReactNode
}

export const TabTrigger = forwardRef<HTMLButtonElement, TabTriggerProps>(
  ({ className, value, icon, children, disabled, ...props }, ref) => {
    const { activeTab, setActiveTab, variant } = useTabsContext()
    const isActive = activeTab === value

    const baseStyles = 'relative inline-flex items-center justify-center font-medium transition-colors'

    const variantStyles = {
      default: cn(
        'px-4 py-2 text-sm -mb-px',
        isActive
          ? 'text-primary-600 border-b-2 border-primary-600'
          : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
      ),
      pills: cn(
        'px-4 py-2 text-sm rounded-md',
        isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
      ),
      underline: cn(
        'px-4 py-3 text-sm',
        isActive ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'
      ),
    }

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={`panel-${value}`}
        disabled={disabled}
        onClick={() => setActiveTab(value)}
        className={cn(
          baseStyles,
          variantStyles[variant],
          focusVisibleRing,
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {icon && <span className="mr-2">{icon}</span>}
        {children}
        {variant === 'underline' && isActive && (
          <motion.div
            layoutId="tab-underline"
            className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
      </button>
    )
  }
)

TabTrigger.displayName = 'TabTrigger'

// Tab Content
export interface TabContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  forceMount?: boolean
}

export const TabContent = forwardRef<HTMLDivElement, TabContentProps>(
  ({ className, value, forceMount = false, children, ...props }, ref) => {
    const { activeTab } = useTabsContext()
    const isActive = activeTab === value

    if (!isActive && !forceMount) return null

    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`panel-${value}`}
        aria-labelledby={`tab-${value}`}
        hidden={!isActive}
        className={cn('mt-4', transitions.fast, !isActive && 'hidden', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

TabContent.displayName = 'TabContent'

// Simple Tab Button (standalone)
export interface TabButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  variant?: 'default' | 'pill'
}

export const TabButton = forwardRef<HTMLButtonElement, TabButtonProps>(
  ({ className, active = false, variant = 'default', children, ...props }, ref) => {
    const styles = {
      default: cn(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'text-primary-600 border-primary-600'
          : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
      ),
      pill: cn(
        'px-4 py-2 text-sm font-medium rounded-full transition-colors',
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      ),
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn(styles[variant], focusVisibleRing, className)}
        {...props}
      >
        {children}
      </button>
    )
  }
)

TabButton.displayName = 'TabButton'

// Tab Group (simple tabs without context)
export interface TabGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: { value: string; label: string; icon?: React.ReactNode; count?: number }[]
  activeTab: string
  onTabChange: (value: string) => void
  variant?: 'default' | 'pills' | 'underline'
}

export const TabGroup = forwardRef<HTMLDivElement, TabGroupProps>(
  ({ className, tabs, activeTab, onTabChange, variant = 'default', ...props }, ref) => {
    const containerStyles = {
      default: 'border-b border-gray-200',
      pills: 'bg-gray-100 p-1 rounded-lg inline-flex',
      underline: 'border-b border-gray-200',
    }

    const buttonStyles = (isActive: boolean) => ({
      default: cn(
        'px-4 py-2 text-sm font-medium -mb-px transition-colors',
        isActive
          ? 'text-primary-600 border-b-2 border-primary-600'
          : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
      ),
      pills: cn(
        'px-4 py-2 text-sm font-medium rounded-md transition-colors',
        isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
      ),
      underline: cn(
        'px-4 py-3 text-sm font-medium transition-colors',
        isActive ? 'text-primary-600 border-b-2 border-primary-600 -mb-px' : 'text-gray-500 hover:text-gray-700'
      ),
    })

    return (
      <div ref={ref} className={cn('flex', containerStyles[variant], className)} {...props}>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              'inline-flex items-center',
              buttonStyles(activeTab === tab.value)[variant],
              focusVisibleRing
            )}
          >
            {tab.icon && <span className="mr-2">{tab.icon}</span>}
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }
)

TabGroup.displayName = 'TabGroup'

export default Tabs
