import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronRight,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  FlaskConical,
  ListChecks,
  AlertTriangle,
} from 'lucide-react'
import { Card, SegmentedProgress } from '@/components/common'
import { CampaignTrajectoryChart } from './CampaignTrajectoryChart'
import { LoadStrategyBadge } from './LoadStrategyBadge'
import type { Campaign } from '@/types'

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: 'Active', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  planned: { label: 'Planned', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  completed: { label: 'Completed', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  paused: { label: 'Paused', color: 'text-amber-700', bgColor: 'bg-amber-50' },
}

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  high: { label: 'High Confidence', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  medium: { label: 'Medium Confidence', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  low: { label: 'Low Confidence', color: 'text-slate-600', bgColor: 'bg-slate-100' },
}

interface CampaignCardProps {
  campaign: Campaign
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const [expanded, setExpanded] = useState(false)
  const statusConfig = STATUS_CONFIG[campaign.status]
  const confidenceConfig = CONFIDENCE_CONFIG[campaign.confidence]

  const activePhase = campaign.phases.find((p) => p.id === campaign.activePhaseId)
  const progressPct =
    campaign.estimatedDurationWeeks > 0 && campaign.currentWeek !== undefined
      ? Math.min(100, Math.round((campaign.currentWeek / campaign.estimatedDurationWeeks) * 100))
      : 0

  const phaseSteps = campaign.phases.map((phase) => ({
    label: phase.name,
    completed: campaign.activePhaseId
      ? campaign.phases.findIndex((p) => p.id === campaign.activePhaseId) >
        campaign.phases.findIndex((p) => p.id === phase.id)
      : false,
    active: phase.id === campaign.activePhaseId,
  }))

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-3 border-b cursor-pointer hover:bg-slate-50/50 transition-colors"
        style={{ borderColor: '#5ba8d420' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold text-slate-800">{campaign.name}</h4>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusConfig.color} ${statusConfig.bgColor}`}
              >
                {statusConfig.label}
              </span>
              <LoadStrategyBadge strategy="recover" />
            </div>

            {/* Progress: currentValue → goalValue */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-semibold font-mono text-slate-800">
                {campaign.currentValue}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-lg font-semibold font-mono text-emerald-600">
                {campaign.goalValue}
              </span>
              <span className="text-xs text-slate-400">{campaign.currentUnit}</span>
              {campaign.currentWeek !== undefined && (
                <span className="text-[10px] text-slate-400 ml-2">
                  Week {campaign.currentWeek} of {campaign.estimatedDurationWeeks}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
              <div
                className="h-1.5 rounded-full bg-blue-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Phase timeline */}
            <SegmentedProgress steps={phaseSteps} size="sm" showLabels />

            <div className="flex items-center gap-3 mt-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${confidenceConfig.color} ${confidenceConfig.bgColor}`}
              >
                {confidenceConfig.label}
              </span>
              <span className="text-[10px] text-slate-400">
                {campaign.estimatedDurationWeeks} weeks | {campaign.phases.length} phases |{' '}
                {campaign.checkpoints.length} checkpoints
              </span>
            </div>
          </div>

          <ChevronRight
            className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 mt-1 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.15 }}
        >
          {/* Trajectory Chart */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
              Projected Trajectory
            </div>
            <CampaignTrajectoryChart
              trajectory={campaign.trajectory}
              goalValue={campaign.goalValue}
              currentWeek={campaign.currentWeek}
              currentUnit={campaign.currentUnit}
              height={180}
            />
          </div>

          {/* Active Phase Detail */}
          {activePhase && (
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                  Active Phase: {activePhase.name} (Weeks {activePhase.weekRange[0]}–{activePhase.weekRange[1]})
                </span>
              </div>
              <p className="text-sm text-slate-600 mb-3">{activePhase.goal}</p>

              {/* Daily Actions */}
              <div className="space-y-1.5">
                {activePhase.dailyActions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-slate-700">{action.action}</span>
                        <span className="text-[9px] text-slate-400">{action.frequency}</span>
                      </div>
                      {action.timing && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                          <Clock className="w-2 h-2" />
                          {action.timing}
                        </div>
                      )}
                      {action.detail && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{action.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Constraints */}
              {activePhase.constraints && activePhase.constraints.length > 0 && (
                <div className="mt-3 space-y-1">
                  {activePhase.constraints.map((constraint, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-[10px] text-amber-600"
                    >
                      <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />
                      {constraint}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All Phases Overview */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
              All Phases
            </div>
            <div className="space-y-1.5">
              {campaign.phases.map((phase) => {
                const isActive = phase.id === campaign.activePhaseId
                const isCompleted = campaign.activePhaseId
                  ? campaign.phases.findIndex((p) => p.id === campaign.activePhaseId) >
                    campaign.phases.findIndex((p) => p.id === phase.id)
                  : false
                return (
                  <div
                    key={phase.id}
                    className={`flex items-center gap-3 px-2.5 py-1.5 rounded-md text-xs ${
                      isActive
                        ? 'bg-blue-50 border border-blue-200'
                        : isCompleted
                        ? 'bg-emerald-50/50 border border-emerald-100'
                        : 'bg-white border border-slate-200'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    ) : isActive ? (
                      <div className="w-3 h-3 rounded-full bg-blue-400 ring-2 ring-blue-100 flex-shrink-0" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0" />
                    )}
                    <span className={`font-medium ${isActive ? 'text-blue-800' : isCompleted ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {phase.name}
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      Weeks {phase.weekRange[0]}–{phase.weekRange[1]}
                    </span>
                    <span className="text-slate-400 text-[10px] ml-auto">
                      {phase.goal.slice(0, 60)}{phase.goal.length > 60 ? '...' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Checkpoints */}
          <div className="px-5 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                Checkpoints
              </span>
            </div>
            <div className="space-y-1.5">
              {campaign.checkpoints.map((cp) => {
                const isPast = campaign.currentWeek !== undefined && cp.weekNumber <= campaign.currentWeek
                return (
                  <div
                    key={cp.id}
                    className={`flex items-start gap-2.5 p-2 rounded-lg ${
                      isPast ? 'bg-emerald-50/50' : 'bg-slate-50'
                    }`}
                  >
                    <FlaskConical
                      className={`w-3 h-3 mt-0.5 flex-shrink-0 ${
                        isPast ? 'text-emerald-500' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium text-slate-700">
                          Week {cp.weekNumber}: {cp.description}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {cp.metric}
                        {cp.targetValue !== undefined ? ` target: ${cp.targetValue}` : ''} |{' '}
                        {cp.action}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Reasoning */}
          <div className="px-5 py-3">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
              Reasoning
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{campaign.reasoning}</p>
          </div>
        </motion.div>
      )}
    </Card>
  )
}
