import { Shield, Target } from 'lucide-react'

interface LoadStrategyBadgeProps {
  strategy: 'maintain' | 'recover'
  className?: string
}

export function LoadStrategyBadge({ strategy, className = '' }: LoadStrategyBadgeProps) {
  if (strategy === 'maintain') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50 ${className}`}
      >
        <Shield className="w-2.5 h-2.5" />
        Maintain
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-orange-700 bg-orange-50 ${className}`}
    >
      <Target className="w-2.5 h-2.5" />
      Recover
    </span>
  )
}
