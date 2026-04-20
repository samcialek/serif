import { Card } from '@/components/common'
import { cn } from '@/utils/classNames'

interface DataValueSummaryProps {
  totalMechanisms: number
  testableCount: number
  testedPct: number
  avgPersonalWeight: number
  latentNodeCount: number
  fittedEdgeCount: number
  className?: string
}

interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string
  accent?: 'cyan' | 'pink' | 'lavender'
}

function StatCard({ label, value, subtitle, accent }: StatCardProps) {
  return (
    <Card variant="outlined" padding="md" accent={accent}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </Card>
  )
}

export function DataValueSummary({
  totalMechanisms,
  testableCount,
  testedPct,
  avgPersonalWeight,
  latentNodeCount,
  fittedEdgeCount,
  className,
}: DataValueSummaryProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4', className)}>
      <StatCard
        label="Mechanisms"
        value={totalMechanisms}
        subtitle="known biological edges"
        accent="cyan"
      />
      <StatCard
        label="Testable"
        value={testableCount}
        subtitle={`${testedPct}% coverage`}
        accent="cyan"
      />
      <StatCard
        label="Fitted"
        value={fittedEdgeCount}
        subtitle="edges with results"
      />
      <StatCard
        label="Avg Evidence"
        value={`${avgPersonalWeight}%`}
        subtitle="personal weight"
        accent="lavender"
      />
      <StatCard
        label="Latent Nodes"
        value={latentNodeCount}
        subtitle="unobserved confounders"
        accent="pink"
      />
      <StatCard
        label="Untestable"
        value={totalMechanisms - testableCount}
        subtitle="need new data"
      />
    </div>
  )
}
