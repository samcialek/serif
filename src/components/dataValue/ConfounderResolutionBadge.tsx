import { cn } from '@/utils/classNames'

interface ConfounderResolutionBadgeProps {
  nodeName: string
  className?: string
}

const friendlyNames: Record<string, string> = {
  sweat_iron_loss: 'Sweat Iron Loss',
  gi_iron_loss: 'GI Iron Loss',
  lipoprotein_lipase: 'Lipoprotein Lipase',
  reverse_cholesterol_transport: 'Reverse Cholesterol Transport',
  core_temperature: 'Core Temperature',
  energy_expenditure: 'Energy Expenditure',
  leptin: 'Leptin',
  insulin_sensitivity: 'Insulin Sensitivity',
}

export function ConfounderResolutionBadge({ nodeName, className }: ConfounderResolutionBadgeProps) {
  const label = friendlyNames[nodeName] ?? nodeName.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
        'bg-violet-50 text-violet-700 border border-violet-200',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
      {label}
    </span>
  )
}
