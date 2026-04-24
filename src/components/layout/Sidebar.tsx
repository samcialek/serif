import { forwardRef, useState, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/utils/classNames'
import {
  Home,
  Building2,
  Link2,
  Lightbulb,
  ListChecks,
  Users,
  Code,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Database,
  Compass,
  TrendingUp,
  Network,
  type LucideIcon,
} from 'lucide-react'

export type SidebarProps = React.HTMLAttributes<HTMLElement>

type NavItem = {
  to?: string
  icon: LucideIcon
  label: string
  exact?: boolean
  children?: NavLeaf[]
}

type NavLeaf = {
  to: string
  icon: LucideIcon
  label: string
  exact?: boolean
}

const navItems: NavItem[] = [
  { to: '/', icon: Home, label: 'Home', exact: true },
  { to: '/clients', icon: Building2, label: 'Clients' },
  {
    to: '/members',
    icon: Users,
    label: 'Members',
    children: [
      { to: '/data', icon: Database, label: 'Data', exact: true },
      { to: '/integration', icon: Link2, label: 'Devices' },
      { to: '/insights', icon: Lightbulb, label: 'Insights' },
      { to: '/exploration', icon: Compass, label: 'Exploration' },
      { to: '/baseline', icon: TrendingUp, label: 'Baseline' },
      { to: '/twin', icon: Network, label: 'Twin' },
      { to: '/protocols', icon: ListChecks, label: 'Protocols' },
      { to: '/protocols-visual', icon: ListChecks, label: 'Protocols (visual)' },
    ],
  },
  { to: '/api', icon: Code, label: 'API' },
  { to: '/admin', icon: Settings, label: 'Settings' },
]

function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  return leaf.exact ? pathname === leaf.to : pathname.startsWith(leaf.to)
}

function isGroupActive(item: NavItem, pathname: string): boolean {
  if (!item.children) return false
  return item.children.some((c) => isLeafActive(c, pathname))
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ className, ...props }, ref) => {
    const location = useLocation()

    // Group starts expanded if a child is active; otherwise user-togglable.
    const autoOpenGroups = useMemo(() => {
      const s = new Set<string>()
      for (const item of navItems) {
        if (item.children && isGroupActive(item, location.pathname)) {
          s.add(item.label)
        }
      }
      return s
    }, [location.pathname])

    const [openGroups, setOpenGroups] = useState<Set<string>>(
      () => new Set(['Members']),
    )

    const effectiveOpen = useMemo(() => {
      const merged = new Set(openGroups)
      for (const g of autoOpenGroups) merged.add(g)
      return merged
    }, [openGroups, autoOpenGroups])

    const toggleGroup = (label: string) => {
      setOpenGroups((prev) => {
        const next = new Set(prev)
        if (next.has(label)) next.delete(label)
        else next.add(label)
        return next
      })
    }

    return (
      <aside
        ref={ref}
        className={cn(
          // CLINICAL PRECISION: Clean, subtle, professional
          'w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0',
          className,
        )}
        {...props}
      >
        {/* Logo - Clinical Precision with Serif branding */}
        <div className="h-24 flex items-center px-5 border-b border-slate-100">
          <NavLink to="/" className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}serif_shine.png`}
              alt="Serif"
              className="w-[72px] h-[72px] object-contain"
            />
            <span className="font-semibold text-xl text-slate-800 tracking-tight">
              Serif
            </span>
          </NavLink>
        </div>

        {/* Navigation - Clinical Precision */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              if (item.children) {
                const Icon = item.icon
                const isOpen = effectiveOpen.has(item.label)
                const groupActive = isGroupActive(item, location.pathname)
                const selfActive =
                  item.to != null && location.pathname === item.to
                return (
                  <li key={item.label}>
                    <div
                      className={cn(
                        'flex items-center rounded-lg',
                        'transition-all duration-200',
                        selfActive
                          ? 'bg-primary-50 text-primary-600 border-l-2 border-l-serif-cyan'
                          : groupActive
                            ? 'text-slate-900 border-l-2 border-l-transparent'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-l-transparent',
                      )}
                    >
                      {item.to ? (
                        <NavLink
                          to={item.to}
                          className="flex-1 flex items-center gap-3 px-4 py-2.5 text-sm font-medium"
                        >
                          <Icon
                            className={cn(
                              'w-[18px] h-[18px]',
                              selfActive || groupActive
                                ? 'text-primary-500'
                                : 'text-slate-400',
                            )}
                          />
                          <span>{item.label}</span>
                        </NavLink>
                      ) : (
                        <div className="flex-1 flex items-center gap-3 px-4 py-2.5 text-sm font-medium">
                          <Icon
                            className={cn(
                              'w-[18px] h-[18px]',
                              groupActive
                                ? 'text-primary-500'
                                : 'text-slate-400',
                            )}
                          />
                          <span>{item.label}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleGroup(item.label)}
                        aria-label={`Toggle ${item.label}`}
                        className="px-3 py-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <ChevronDown
                          className={cn(
                            'w-4 h-4 transition-transform duration-200',
                            !isOpen && '-rotate-90',
                          )}
                        />
                      </button>
                    </div>
                    {isOpen && (
                      <ul className="mt-0.5 space-y-0.5">
                        {item.children.map((leaf) => {
                          const LeafIcon = leaf.icon
                          const isActive = isLeafActive(leaf, location.pathname)
                          return (
                            <li key={leaf.to}>
                              <NavLink
                                to={leaf.to}
                                className={cn(
                                  'flex items-center gap-3 pl-10 pr-4 py-2 text-sm font-medium rounded-lg',
                                  'transition-all duration-200',
                                  isActive
                                    ? 'bg-primary-50 text-primary-600 border-l-2 border-l-serif-cyan'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-l-transparent',
                                )}
                              >
                                <LeafIcon
                                  className={cn(
                                    'w-[16px] h-[16px]',
                                    isActive
                                      ? 'text-primary-500'
                                      : 'text-slate-400',
                                  )}
                                />
                                {leaf.label}
                              </NavLink>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              }

              const Icon = item.icon
              const isActive = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to ?? '')

              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to!}
                    className={cn(
                      // Clinical Precision: Subtle, rounded, soft transitions
                      'flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg',
                      'transition-all duration-200',
                      isActive
                        ? 'bg-primary-50 text-primary-600 border-l-2 border-l-serif-cyan'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-l-transparent',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-[18px] h-[18px]',
                        isActive ? 'text-primary-500' : 'text-slate-400',
                      )}
                    />
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Subtle footer */}
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-medium tracking-wide">
            Personalized Health Intelligence
          </p>
        </div>
      </aside>
    )
  },
)

Sidebar.displayName = 'Sidebar'

// Collapsible Sidebar variant - Clinical Precision
export interface CollapsibleSidebarProps extends SidebarProps {
  isCollapsed?: boolean
  onToggle?: () => void
}

export const CollapsibleSidebar = forwardRef<
  HTMLElement,
  CollapsibleSidebarProps
>(({ className, isCollapsed = false, onToggle, ...props }, ref) => {
  const location = useLocation()

  const autoOpenGroups = useMemo(() => {
    const s = new Set<string>()
    for (const item of navItems) {
      if (item.children && isGroupActive(item, location.pathname)) {
        s.add(item.label)
      }
    }
    return s
  }, [location.pathname])

  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(['Members']),
  )

  const effectiveOpen = useMemo(() => {
    const merged = new Set(openGroups)
    for (const g of autoOpenGroups) merged.add(g)
    return merged
  }, [openGroups, autoOpenGroups])

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <aside
      ref={ref}
      className={cn(
        // Clinical Precision: Clean, subtle
        'bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0',
        'transition-all duration-200',
        isCollapsed ? 'w-[72px]' : 'w-64',
        className,
      )}
      {...props}
    >
      {/* Logo */}
      <div className="h-24 flex items-center justify-between px-3 border-b border-slate-100">
        <NavLink to="/" className="flex items-center gap-2">
          <img
            src={`${import.meta.env.BASE_URL}serif_shine.png`}
            alt="Serif"
            className="w-[72px] h-[72px] object-contain flex-shrink-0"
          />
          {!isCollapsed && (
            <span className="font-semibold text-lg text-slate-800 tracking-tight">
              Serif
            </span>
          )}
        </NavLink>
        <button
          onClick={onToggle}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            if (item.children) {
              const Icon = item.icon
              const isOpen = effectiveOpen.has(item.label)
              const groupActive = isGroupActive(item, location.pathname)

              const selfActive =
                item.to != null && location.pathname === item.to

              // When collapsed, render group header as a link (if navigable)
              // or a visual indicator, and render all children as icons below.
              if (isCollapsed) {
                return (
                  <li key={item.label}>
                    {item.to ? (
                      <NavLink
                        to={item.to}
                        title={item.label}
                        className={cn(
                          'flex items-center justify-center px-3 py-2.5 rounded-lg',
                          'transition-all duration-200',
                          selfActive
                            ? 'bg-primary-50 text-primary-600'
                            : groupActive
                              ? 'text-primary-500'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                      </NavLink>
                    ) : (
                      <div
                        className={cn(
                          'flex items-center justify-center px-3 py-2.5 rounded-lg',
                          groupActive ? 'text-primary-500' : 'text-slate-400',
                        )}
                        title={item.label}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                      </div>
                    )}
                    <ul className="space-y-0.5">
                      {item.children.map((leaf) => {
                        const LeafIcon = leaf.icon
                        const isActive = isLeafActive(leaf, location.pathname)
                        return (
                          <li key={leaf.to}>
                            <NavLink
                              to={leaf.to}
                              className={cn(
                                'flex items-center justify-center px-3 py-2.5 rounded-lg',
                                'transition-all duration-200',
                                isActive
                                  ? 'bg-primary-50 text-primary-600'
                                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                              )}
                              title={leaf.label}
                            >
                              <LeafIcon
                                className={cn(
                                  'w-[18px] h-[18px] flex-shrink-0',
                                  isActive
                                    ? 'text-primary-500'
                                    : 'text-slate-400',
                                )}
                              />
                            </NavLink>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              }

              return (
                <li key={item.label}>
                  <div
                    className={cn(
                      'flex items-center rounded-lg',
                      'transition-all duration-200',
                      selfActive
                        ? 'bg-primary-50 text-primary-600'
                        : groupActive
                          ? 'text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    )}
                  >
                    {item.to ? (
                      <NavLink
                        to={item.to}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5"
                      >
                        <Icon
                          className={cn(
                            'w-[18px] h-[18px] flex-shrink-0',
                            selfActive || groupActive
                              ? 'text-primary-500'
                              : 'text-slate-400',
                          )}
                        />
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                      </NavLink>
                    ) : (
                      <div className="flex-1 flex items-center gap-3 px-3 py-2.5">
                        <Icon
                          className={cn(
                            'w-[18px] h-[18px] flex-shrink-0',
                            groupActive
                              ? 'text-primary-500'
                              : 'text-slate-400',
                          )}
                        />
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.label)}
                      aria-label={`Toggle ${item.label}`}
                      className="px-2 py-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 transition-transform duration-200',
                          !isOpen && '-rotate-90',
                        )}
                      />
                    </button>
                  </div>
                  {isOpen && (
                    <ul className="mt-0.5 space-y-0.5">
                      {item.children.map((leaf) => {
                        const LeafIcon = leaf.icon
                        const isActive = isLeafActive(leaf, location.pathname)
                        return (
                          <li key={leaf.to}>
                            <NavLink
                              to={leaf.to}
                              className={cn(
                                'flex items-center gap-3 pl-10 pr-3 py-2 rounded-lg',
                                'transition-all duration-200',
                                isActive
                                  ? 'bg-primary-50 text-primary-600'
                                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                              )}
                            >
                              <LeafIcon
                                className={cn(
                                  'w-[16px] h-[16px] flex-shrink-0',
                                  isActive
                                    ? 'text-primary-500'
                                    : 'text-slate-400',
                                )}
                              />
                              <span className="text-sm font-medium">
                                {leaf.label}
                              </span>
                            </NavLink>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            }

            const Icon = item.icon
            const isActive = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to ?? '')

            return (
              <li key={item.to}>
                <NavLink
                  to={item.to!}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                    'transition-all duration-200',
                    isCollapsed && 'justify-center',
                    isActive
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon
                    className={cn(
                      'w-[18px] h-[18px] flex-shrink-0',
                      isActive ? 'text-primary-500' : 'text-slate-400',
                    )}
                  />
                  {!isCollapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
})

CollapsibleSidebar.displayName = 'CollapsibleSidebar'

export default Sidebar
