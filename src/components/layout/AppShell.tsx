import { forwardRef, useEffect } from 'react'
import { cn } from '@/utils/classNames'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { ToastContainer } from '@/components/common'
import { usePortalStore } from '@/stores/portalStore'

function useSeedActivePid() {
  const activePid = usePortalStore((s) => s.activePid)
  const setActivePid = usePortalStore((s) => s.setActivePid)

  // Cold-start default is pid 1 (Caspian). In-session, activePid lives in memory
  // across route changes, so switching coach → patient → coach preserves
  // whatever patient the user last selected.
  useEffect(() => {
    if (activePid == null) setActivePid(1)
  }, [activePid, setActivePid])
}

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
  showSidebar?: boolean
  showHeader?: boolean
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(
  ({ className, showSidebar = true, showHeader = true, children, ...props }, ref) => {
    useSeedActivePid()
    return (
      <div
        ref={ref}
        className={cn('min-h-screen bg-white flex', className)}
        {...props}
      >
        {/* Sidebar */}
        {showSidebar && <Sidebar />}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          {showHeader && <Header />}

          {/* Page Content */}
          <main className="flex-1 overflow-auto bg-gray-100">
            {children || <Outlet />}
          </main>
        </div>

        {/* Toast Container */}
        <ToastContainer position="bottom-right" />
      </div>
    )
  }
)

AppShell.displayName = 'AppShell'

// Page Layout wrapper - BRUTALIST VERSION
export interface PageLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const maxWidthStyles = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-7xl',
  full: 'max-w-full',
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

export const PageLayout = forwardRef<HTMLDivElement, PageLayoutProps>(
  (
    {
      className,
      title,
      subtitle,
      actions,
      maxWidth = '2xl',
      padding = 'md',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn('mx-auto w-full', maxWidthStyles[maxWidth], paddingStyles[padding], className)}
        {...props}
      >
        {/* Page Header - BRUTALIST */}
        {(title || actions) && (
          <div className="mb-8">
            <div className="flex items-start justify-between">
              <div>
                {title && (
                  <h1 className="text-3xl font-black text-black uppercase tracking-tight">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="mt-2 text-sm font-medium text-gray-600 uppercase tracking-wider">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && (
                <div className="flex items-center gap-3">{actions}</div>
              )}
            </div>
            {/* BRUTALIST: Horizontal rule under header */}
            <div className="h-0.5 bg-black mt-4" />
          </div>
        )}

        {/* Page Content */}
        {children}
      </div>
    )
  }
)

PageLayout.displayName = 'PageLayout'

// Section wrapper - BRUTALIST VERSION
export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, title, subtitle, actions, children, ...props }, ref) => {
    return (
      <section ref={ref} className={cn('mb-8', className)} {...props}>
        {(title || actions) && (
          <div className="flex items-start justify-between mb-4">
            <div>
              {title && (
                <h2 className="text-xl font-black text-black uppercase tracking-tight">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-1 text-xs font-bold text-gray-500 uppercase tracking-widest">
                  {subtitle}
                </p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </section>
    )
  }
)

Section.displayName = 'Section'

// Grid Layout
export interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 1 | 2 | 3 | 4 | 5 | 6
  gap?: 'none' | 'sm' | 'md' | 'lg'
}

const columnStyles = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 md:grid-cols-3 lg:grid-cols-6',
}

const gapStyles = {
  none: '',
  sm: 'gap-3',
  md: 'gap-4',
  lg: 'gap-6',
}

export const Grid = forwardRef<HTMLDivElement, GridProps>(
  ({ className, columns = 3, gap = 'md', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('grid', columnStyles[columns], gapStyles[gap], className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Grid.displayName = 'Grid'

// Split Layout (sidebar + content)
export interface SplitLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  sidebar: React.ReactNode
  sidebarWidth?: string
  sidebarPosition?: 'left' | 'right'
}

export const SplitLayout = forwardRef<HTMLDivElement, SplitLayoutProps>(
  (
    { className, sidebar, sidebarWidth = '280px', sidebarPosition = 'left', children, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn('flex gap-6', sidebarPosition === 'right' && 'flex-row-reverse', className)}
        {...props}
      >
        <aside className="flex-shrink-0" style={{ width: sidebarWidth }}>
          {sidebar}
        </aside>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    )
  }
)

SplitLayout.displayName = 'SplitLayout'

// Empty State - BRUTALIST VERSION
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center justify-center py-12 px-4 text-center',
          'border-2 border-dashed border-gray-300',
          className
        )}
        {...props}
      >
        {icon && (
          <div className="mb-4 text-gray-400">{icon}</div>
        )}
        <h3 className="text-lg font-black text-black uppercase tracking-tight mb-2">
          {title}
        </h3>
        {description && (
          <p className="text-sm text-gray-500 mb-4 max-w-sm">{description}</p>
        )}
        {action}
      </div>
    )
  }
)

EmptyState.displayName = 'EmptyState'

export default AppShell
