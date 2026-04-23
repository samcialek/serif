/**
 * CausalPathExplorer — interactive display for causal paths between
 * a treatment and outcome, showing identification strategy and
 * pathway decomposition.
 */

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { Card, Badge, Tooltip } from '@/components/common'
import { AdjustmentSetViz } from './AdjustmentSetViz'
import { useSCM } from '@/hooks'

interface CausalPathExplorerProps {
  treatment: string
  outcome: string
  className?: string
}

const friendlyNodeName = (id: string): string => {
  const names: Record<string, string> = {
    running_volume: 'Running Volume',
    training_volume: 'Training Volume',
    zone2_volume: 'Zone 2 Volume',
    training_load: 'Training Load',
    ground_contacts: 'Ground Contacts',
    iron_total: 'Serum Iron',
    ferritin: 'Ferritin',
    hemoglobin: 'Hemoglobin',
    vo2_peak: 'VO2 Peak',
    cortisol: 'Cortisol',
    testosterone: 'Testosterone',
    triglycerides: 'Triglycerides',
    hdl: 'HDL',
    ldl: 'LDL',
    hscrp: 'hsCRP',
    sleep_duration: 'Sleep Duration',
    sleep_quality: 'Sleep Quality',
    sleep_efficiency: 'Sleep Efficiency',
    deep_sleep: 'Deep Sleep',
    hrv_daily: 'Overnight RMSSD',
    resting_hr: 'Resting HR',
    wbc: 'White Blood Cells',
    body_fat_pct: 'Body Fat %',
    glucose: 'Glucose',
    insulin: 'Insulin',
    core_temperature: 'Core Temperature',
    lipoprotein_lipase: 'Lipoprotein Lipase',
    reverse_cholesterol_transport: 'Rev. Cholesterol Transport',
    energy_expenditure: 'Energy Expenditure',
    insulin_sensitivity: 'Insulin Sensitivity',
  }
  return names[id] ?? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function CausalPathExplorer({ treatment, outcome, className = '' }: CausalPathExplorerProps) {
  const { identify } = useSCM()
  const [expanded, setExpanded] = useState(false)

  const identification = useMemo(
    () => identify(treatment, outcome),
    [identify, treatment, outcome]
  )

  const strategyColor = {
    backdoor: 'border-green-200 bg-green-50/50',
    frontdoor: 'border-blue-200 bg-blue-50/50',
    unidentified: 'border-amber-200 bg-amber-50/50',
  }[identification.strategy]

  return (
    <Card className={`p-4 ${strategyColor} ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-800">
            {friendlyNodeName(treatment)} → {friendlyNodeName(outcome)}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* Identification badges */}
      <div className="mt-2">
        <AdjustmentSetViz
          strategy={identification.strategy}
          adjustmentSet={identification.adjustmentSet}
          mediatorSet={identification.mediatorSet}
        />
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-gray-200"
          >
            {/* Rationale */}
            <p className="text-xs text-gray-600 mb-3">{identification.rationale}</p>

            {/* Blocked paths */}
            {identification.blockedPaths.length > 0 && (
              <div className="mb-3">
                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Blocked Non-Causal Paths
                </h4>
                {identification.blockedPaths.slice(0, 5).map((path, i) => (
                  <div key={i} className="text-xs text-gray-500 flex items-center gap-1 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    {path.map(friendlyNodeName).join(' → ')}
                  </div>
                ))}
                {identification.blockedPaths.length > 5 && (
                  <span className="text-[10px] text-gray-400">
                    +{identification.blockedPaths.length - 5} more
                  </span>
                )}
              </div>
            )}

            {/* Unblocked paths (warning) */}
            {identification.unblockedPaths.length > 0 && (
              <div>
                <h4 className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Unblocked Paths (confounding risk)
                </h4>
                {identification.unblockedPaths.slice(0, 3).map((path, i) => (
                  <div key={i} className="text-xs text-amber-600 flex items-center gap-1 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {path.map(friendlyNodeName).join(' → ')}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export default CausalPathExplorer
