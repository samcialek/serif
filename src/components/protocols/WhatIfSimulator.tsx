import { forwardRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/utils/classNames'
import { Play, Plus, X, TrendingUp, TrendingDown, AlertCircle, GitBranch, Shield, Eye, Scale } from 'lucide-react'
import { Card, Button, Slider } from '@/components/common'
import { WaterfallChart } from '@/components/charts/WaterfallChart'
import { useSimulator, type SimulatorResultDisplay } from '@/hooks'
import type { MechanismCategory, FullCounterfactualState } from '@/data/scm/fullCounterfactual'

export interface WhatIfSimulatorProps extends React.HTMLAttributes<HTMLDivElement> {
  onClose?: () => void
}

const interventionOptions = [
  // Behavioral interventions
  { id: 'caffeine_cutoff', label: 'Caffeine Cutoff', unit: 'hour', min: 10, max: 20, default: 14, group: 'behavioral' },
  { id: 'exercise_time', label: 'Exercise Time', unit: 'hour', min: 6, max: 22, default: 17, group: 'behavioral' },
  { id: 'screen_cutoff', label: 'Screen Cutoff', unit: 'hour', min: 19, max: 24, default: 22, group: 'behavioral' },
  { id: 'alcohol_drinks', label: 'Alcohol (drinks)', unit: 'drinks', min: 0, max: 5, default: 0, group: 'behavioral' },
  { id: 'bedtime_variance', label: 'Bedtime Variance', unit: 'min', min: 0, max: 120, default: 30, group: 'behavioral' },
  // DAG-native interventions (SCM counterfactual)
  { id: 'running_volume', label: 'Running Volume', unit: 'km/mo', min: 0, max: 400, default: 120, group: 'causal' },
  { id: 'zone2_volume', label: 'Zone 2 Volume', unit: 'min/wk', min: 0, max: 300, default: 60, group: 'causal' },
  { id: 'training_load', label: 'Training Load', unit: 'TRIMP', min: 100, max: 1500, default: 600, group: 'causal' },
  { id: 'sleep_duration', label: 'Sleep Duration', unit: 'hrs', min: 4, max: 10, default: 7, group: 'causal' },
  { id: 'training_volume', label: 'Training Volume', unit: 'min/mo', min: 0, max: 3000, default: 1200, group: 'causal' },
]

const CATEGORY_CONFIG: Record<MechanismCategory, { label: string; bg: string; text: string; border: string; dot: string }> = {
  metabolic: { label: 'Metabolic', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' },
  cardio: { label: 'Cardio', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-400' },
  recovery: { label: 'Recovery', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-400' },
  sleep: { label: 'Sleep', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-400' },
}

const CategorySummaryBar = ({ fullState }: { fullState: FullCounterfactualState }) => {
  const categories = (['metabolic', 'cardio', 'recovery', 'sleep'] as const).filter(
    cat => fullState.categoryEffects[cat].affectedNodes.length > 0
  )

  if (categories.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {categories.map(cat => {
        const summary = fullState.categoryEffects[cat]
        const config = CATEGORY_CONFIG[cat]
        const direction = summary.netSignal > 0 ? '+' : summary.netSignal < 0 ? '' : '~'

        return (
          <div
            key={cat}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5',
              config.bg, config.text, config.border
            )}
          >
            <span className={cn('w-2 h-2 rounded-full', config.dot)} />
            {config.label}
            <span className="font-normal opacity-80">
              {summary.affectedNodes.length} markers, {direction}{Math.abs(summary.netSignal).toFixed(1)} net
            </span>
          </div>
        )
      })}
    </div>
  )
}

const formatTime = (hour: number) => {
  const h = Math.floor(hour)
  const m = Math.round((hour - h) * 60)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
  return m > 0 ? `${displayH}:${m.toString().padStart(2, '0')} ${period}` : `${displayH} ${period}`
}

export const WhatIfSimulator = forwardRef<HTMLDivElement, WhatIfSimulatorProps>(
  ({ className, onClose, ...props }, ref) => {
    const {
      inputs,
      results,
      fullState,
      isSimulating,
      hasRun,
      combinedImpact,
      setInput,
      addInput,
      removeInput,
      runSimulation,
      resetSimulation,
      loadPreset,
      availablePresets,
    } = useSimulator()

    // Group SCM results by category for grouped display
    const groupedResults = useMemo(() => {
      if (!fullState) return null

      const groups: Record<MechanismCategory, SimulatorResultDisplay[]> = {
        metabolic: [], cardio: [], recovery: [], sleep: [],
      }

      for (const result of results) {
        if (!result.usedSCM || !result.nodeId) continue
        const nodeEffect = fullState.allEffects.get(result.nodeId)
        if (!nodeEffect) continue
        for (const cat of nodeEffect.categories) {
          groups[cat].push(result)
        }
      }

      const hasGroups = Object.values(groups).some(g => g.length > 0)
      return hasGroups ? groups : null
    }, [results, fullState])

    const [showAddMenu, setShowAddMenu] = useState(false)

    // Get available interventions (not already added)
    const availableInterventions = interventionOptions.filter(
      opt => !inputs.some(input => input.intervention === opt.id)
    )

    const handleAddIntervention = (optionId: string) => {
      const option = interventionOptions.find(o => o.id === optionId)
      if (option) {
        addInput({
          intervention: option.id,
          currentValue: option.default,
          proposedValue: option.default,
          unit: option.unit,
        })
      }
      setShowAddMenu(false)
    }

    const getInterventionConfig = (id: string) => {
      return interventionOptions.find(o => o.id === id)
    }

    return (
      <Card
        ref={ref}
        className={cn('p-6', className)}
        data-tour="simulator"
        {...props}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">What-If Simulator</h2>
            <p className="text-sm text-gray-500">Test how changes might affect your outcomes</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <span className="text-xs text-gray-500 self-center mr-1">Presets:</span>
          {availablePresets.map((preset) => (
            <button
              key={preset}
              onClick={() => loadPreset(preset)}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
            >
              {preset.replace(/-/g, ' ')}
            </button>
          ))}
        </div>

        {/* Interventions */}
        <div className="space-y-4 mb-6">
          {inputs.map((input, index) => {
            const config = getInterventionConfig(input.intervention)
            if (!config) return null

            return (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-700">{config.label}</span>
                  <button
                    onClick={() => removeInput(index)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Current</label>
                    <div className="text-sm font-medium text-gray-600">
                      {config.unit === 'hour' ? formatTime(input.currentValue) : `${input.currentValue} ${config.unit}`}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Proposed</label>
                    <Slider
                      value={input.proposedValue}
                      min={config.min}
                      max={config.max}
                      step={config.unit === 'hour' ? 0.5 : 1}
                      onChange={(value) => setInput(index, { proposedValue: value })}
                      size="sm"
                    />
                    <div className="text-sm font-medium text-primary-600 mt-1">
                      {config.unit === 'hour' ? formatTime(input.proposedValue) : `${input.proposedValue} ${config.unit}`}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add intervention */}
        {availableInterventions.length > 0 && (
          <div className="relative mb-6">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Intervention
            </button>
            <AnimatePresence>
              {showAddMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
                >
                  {availableInterventions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleAddIntervention(option.id)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                    >
                      {option.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Run button */}
        <Button
          onClick={runSimulation}
          loading={isSimulating}
          disabled={inputs.length === 0}
          fullWidth
          size="lg"
        >
          <Play className="w-4 h-4 mr-2" />
          Run Simulation
        </Button>

        {/* Results */}
        <AnimatePresence>
          {hasRun && results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6"
            >
              <h3 className="font-medium text-gray-900 mb-4">Projected Impact</h3>

              {/* Category summary bar */}
              {fullState && <CategorySummaryBar fullState={fullState} />}

              {/* Tradeoff callout — cross-category conflicts */}
              {fullState && fullState.tradeoffs.length > 0 && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Scale className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Cross-Category Tradeoffs ({fullState.tradeoffs.length})
                      </p>
                      <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
                        {fullState.tradeoffs.map((t, i) => (
                          <li key={i}>{t.description}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Category-grouped results (when full state available) */}
              {groupedResults ? (
                <div className="space-y-5">
                  {(['metabolic', 'cardio', 'recovery', 'sleep'] as const).map(cat => {
                    const group = groupedResults[cat]
                    if (group.length === 0) return null
                    const config = CATEGORY_CONFIG[cat]
                    const summary = fullState!.categoryEffects[cat]

                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn('w-2 h-2 rounded-full', config.dot)} />
                          <span className={cn('text-sm font-medium', config.text)}>
                            {config.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {summary.netSignal > 0 ? 'net positive' : summary.netSignal < 0 ? 'net negative' : 'mixed'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {group.map((result, index) => (
                            <SimulatorResultCard key={`${cat}-${index}`} result={result} />
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Non-SCM fallback results (no category) */}
                  {results.some(r => !r.usedSCM) && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        <span className="text-sm font-medium text-gray-600">Behavioral</span>
                        <span className="text-xs text-gray-400">linear estimate</span>
                      </div>
                      <div className="space-y-2">
                        {results.filter(r => !r.usedSCM).map((result, index) => (
                          <SimulatorResultCard key={`fallback-${index}`} result={result} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Flat list fallback (no full state) */
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <SimulatorResultCard key={index} result={result} />
                  ))}
                </div>
              )}

              {/* Combined impact — non-tradeoff interactions */}
              {combinedImpact && combinedImpact.interactions.length > 0 && !fullState?.tradeoffs.length && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Interactions Detected</p>
                      <ul className="text-xs text-amber-700 mt-1">
                        {combinedImpact.interactions.map((interaction, i) => (
                          <li key={i}>• {interaction}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={resetSimulation}
                className="mt-4"
              >
                Reset Results
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    )
  }
)

WhatIfSimulator.displayName = 'WhatIfSimulator'

// Result card component — enhanced with SCM pathway decomposition
interface SimulatorResultCardProps {
  result: SimulatorResultDisplay
}

const identificationBadge = (strategy?: string, adjustmentSet?: string[]) => {
  if (!strategy) return null

  const configs: Record<string, { icon: typeof Shield; color: string; bg: string; label: string }> = {
    backdoor: {
      icon: Shield,
      color: 'text-green-700',
      bg: 'bg-green-50 border-green-200',
      label: adjustmentSet?.length
        ? `Back-door adjusted for ${adjustmentSet.join(', ')}`
        : 'No confounding detected',
    },
    frontdoor: {
      icon: GitBranch,
      color: 'text-blue-700',
      bg: 'bg-blue-50 border-blue-200',
      label: 'Front-door via mediator',
    },
    unidentified: {
      icon: Eye,
      color: 'text-amber-700',
      bg: 'bg-amber-50 border-amber-200',
      label: 'Partially identified — unobserved confounders',
    },
  }

  const config = configs[strategy]
  if (!config) return null
  const Icon = config.icon

  return (
    <div className={cn('mt-2 px-2 py-1 rounded border text-xs flex items-center gap-1.5', config.bg, config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </div>
  )
}

const SimulatorResultCard = ({ result }: SimulatorResultCardProps) => {
  const [showPathways, setShowPathways] = useState(false)
  const isPositive = result.change >= 0
  const changeColor = isPositive ? 'text-green-600' : 'text-red-600'
  const TrendIcon = isPositive ? TrendingUp : TrendingDown
  const hasPathways = result.pathwayDecomposition && result.pathwayDecomposition.length > 0

  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{result.metric}</span>
          {result.usedSCM && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 rounded">
              SCM
            </span>
          )}
        </div>
        <span className={cn('text-sm font-semibold flex items-center gap-1', changeColor)}>
          <TrendIcon className="w-3 h-3" />
          {isPositive ? '+' : ''}{result.change.toFixed(1)}
          <span className="text-gray-400 text-xs">({result.changePercent.toFixed(1)}%)</span>
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>From: {result.baseline.toFixed(1)}</span>
        <span>→</span>
        <span className="font-medium text-gray-700">To: {result.projected.toFixed(1)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          Confidence: {Math.round(result.certainty * 100)}%
        </span>
        <span className="text-gray-500">
          Time to effect: {result.timeToEffect}
        </span>
      </div>

      {/* Confidence interval */}
      <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
        <div
          className="absolute h-full bg-primary-200"
          style={{
            left: `${Math.max(0, ((result.confidenceInterval.low - result.baseline) / (Math.abs(result.confidenceInterval.high - result.confidenceInterval.low) + Math.abs(result.baseline) + 1)) * 100)}%`,
            width: `${Math.min(100, ((result.confidenceInterval.high - result.confidenceInterval.low) / (Math.abs(result.baseline) + 1)) * 100)}%`,
          }}
        />
        <div
          className="absolute h-full w-1 bg-primary-600"
          style={{
            left: `${Math.max(0, Math.min(100, ((result.projected - result.confidenceInterval.low) / (result.confidenceInterval.high - result.confidenceInterval.low + 0.01)) * 100))}%`,
          }}
        />
      </div>

      {/* Identification badge */}
      {identificationBadge(result.identificationStrategy, result.adjustmentSet)}

      {/* Pathway decomposition toggle */}
      {hasPathways && (
        <button
          onClick={() => setShowPathways(!showPathways)}
          className="mt-2 text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1"
        >
          <GitBranch className="w-3 h-3" />
          {showPathways ? 'Hide' : 'Show'} pathway decomposition ({result.pathwayDecomposition!.length} paths)
        </button>
      )}

      {/* Pathway waterfall */}
      <AnimatePresence>
        {showPathways && hasPathways && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <WaterfallChart
              items={[
                { label: 'Baseline', value: result.baseline, type: 'baseline' as const },
                ...result.pathwayDecomposition!.map((p) => ({
                  label: p.path.length > 3
                    ? `${p.path[0]} → ... → ${p.path[p.path.length - 1]}`
                    : p.path.join(' → '),
                  value: Number(p.effect.toFixed(2)),
                  type: (p.effect >= 0 ? 'positive' : 'negative') as 'positive' | 'negative',
                })),
                { label: 'Counterfactual', value: result.projected, type: 'total' as const },
              ]}
              title="Effect Decomposition by Pathway"
              unit=""
              className="!p-3 !bg-white"
            />
            {/* Bottleneck warning */}
            {result.pathwayDecomposition!.some((p) => p.bottleneckEdge) && (
              <div className="mt-2 text-[10px] text-amber-600">
                Weakest link: {result.pathwayDecomposition!.find((p) => p.bottleneckEdge)?.bottleneckEdge}
                {' '}(low evidence — consider adding data sources)
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default WhatIfSimulator
