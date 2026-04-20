import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface HeroBlockProps {
  title: string
  subtitle?: string
  children?: ReactNode
  actions?: ReactNode
  variant?: 'navy' | 'cyan' | 'lavender' | 'pink'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const variantStyles = {
  navy: 'bg-navy-900 text-white',
  cyan: 'bg-gradient-to-r from-[#89CCF0] to-[#96b9d0] text-navy-900',
  lavender: 'bg-gradient-to-r from-[#b8aadd] to-[#d9d0ed] text-navy-900',
  pink: 'bg-gradient-to-r from-[#f8c8dc] to-[#fce4ee] text-navy-900',
}

const sizeStyles = {
  sm: 'py-4 px-6',
  md: 'py-6 px-6',
  lg: 'py-8 px-6',
}

export function HeroBlock({
  title,
  subtitle,
  children,
  actions,
  variant = 'navy',
  size = 'md',
  className = '',
}: HeroBlockProps) {
  const baseClass = 'rounded-xl ' + variantStyles[variant] + ' ' + sizeStyles[size] + ' ' + className
  const titleClass = 'font-bold ' + (size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-xl' : 'text-lg')
  const subtitleClass = 'mt-1 ' + (variant === 'navy' ? 'text-gray-300' : 'text-navy-700') + ' ' + (size === 'lg' ? 'text-base' : 'text-sm')
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={baseClass}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className={titleClass}>{title}</h1>
          {subtitle && <p className={subtitleClass}>{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </motion.div>
  )
}

interface StatBlockProps {
  icon: React.ElementType
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  color?: 'cyan' | 'lavender' | 'pink' | 'blue'
}

const colorStyles = {
  cyan: { bg: 'bg-[#89CCF0]/20', icon: 'text-[#5ba8d4]', border: 'border-[#89CCF0]' },
  lavender: { bg: 'bg-[#b8aadd]/20', icon: 'text-[#9182c4]', border: 'border-[#b8aadd]' },
  pink: { bg: 'bg-[#f8c8dc]/20', icon: 'text-[#e99bbe]', border: 'border-[#f8c8dc]' },
  blue: { bg: 'bg-[#96b9d0]/20', icon: 'text-[#6a95b3]', border: 'border-[#96b9d0]' },
}

export function StatBlock({ icon: Icon, label, value, unit, color = 'cyan' }: StatBlockProps) {
  const styles = colorStyles[color]
  const cardClass = 'bg-white rounded-xl p-4 border-l-4 ' + styles.border + ' shadow-card'
  const iconBgClass = 'p-2 rounded-lg ' + styles.bg
  const iconClass = 'w-5 h-5 ' + styles.icon
  
  return (
    <div className={cardClass}>
      <div className="flex items-center gap-3">
        <div className={iconBgClass}>
          <Icon className={iconClass} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">
            {value}
            {unit && <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>}
          </p>
        </div>
      </div>
    </div>
  )
}

export function SectionBlock({
  title,
  subtitle,
  icon: Icon,
  children,
  actions,
  color = 'cyan',
  className = '',
}: {
  title: string
  subtitle?: string
  icon?: React.ElementType
  children: ReactNode
  actions?: ReactNode
  color?: 'cyan' | 'lavender' | 'pink' | 'blue'
  className?: string
}) {
  const styles = colorStyles[color]
  const containerClass = 'bg-gray-50 rounded-xl p-5 ' + className
  const iconBgClass = 'p-2 rounded-lg ' + styles.bg
  const iconClass = 'w-5 h-5 ' + styles.icon
  
  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={iconBgClass}>
              <Icon className={iconClass} />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

export default HeroBlock
