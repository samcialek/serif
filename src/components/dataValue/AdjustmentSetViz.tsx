/**
 * Badge display for causal identification adjustment/mediator sets.
 * Visual language matches ConfounderResolutionBadge.
 */

import { Shield, GitBranch, Eye } from 'lucide-react'

interface AdjustmentSetVizProps {
  strategy: 'backdoor' | 'frontdoor' | 'unidentified'
  adjustmentSet: string[]
  mediatorSet?: string[]
  className?: string
}

const friendlyNames: Record<string, string> = {
  season: 'Season',
  location: 'Location',
  travel_load: 'Travel / Jet Lag',
  is_weekend: 'Weekend',
  day_of_week: 'Day of Week',
  ground_contacts: 'Ground Contacts',
  lipoprotein_lipase: 'Lipoprotein Lipase',
  reverse_cholesterol_transport: 'Reverse Cholesterol Transport',
  core_temperature: 'Core Temperature',
  energy_expenditure: 'Energy Expenditure',
  insulin_sensitivity: 'Insulin Sensitivity',
  leptin: 'Leptin',
  sweat_iron_loss: 'Sweat Iron Loss',
  gi_iron_loss: 'GI Iron Loss',
}

export function AdjustmentSetViz({
  strategy,
  adjustmentSet,
  mediatorSet = [],
  className = '',
}: AdjustmentSetVizProps) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* Strategy icon */}
      {strategy === 'backdoor' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 rounded-full">
          <Shield className="w-2.5 h-2.5" />
          Back-door
        </span>
      )}
      {strategy === 'frontdoor' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
          <GitBranch className="w-2.5 h-2.5" />
          Front-door
        </span>
      )}
      {strategy === 'unidentified' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
          <Eye className="w-2.5 h-2.5" />
          Partial
        </span>
      )}

      {/* Adjustment set (observed confounders) */}
      {adjustmentSet.map((node) => (
        <span
          key={node}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 rounded-full"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {friendlyNames[node] ?? node}
        </span>
      ))}

      {/* Mediator set (front-door) */}
      {mediatorSet.map((node) => (
        <span
          key={node}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-full"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          {friendlyNames[node] ?? node}
        </span>
      ))}
    </div>
  )
}

export default AdjustmentSetViz
