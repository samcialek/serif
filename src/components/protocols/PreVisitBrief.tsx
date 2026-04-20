// Pre-Visit Brief Component
// 30-second scannable summary for providers before seeing a patient
// Designed for Vim integration - pulls from causal insights and protocols

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  Zap,
  Target,
  MessageSquare,
  Stethoscope,
  ArrowRight,
  Minus,
} from 'lucide-react'
import { Card, Badge } from '@/components/common'
import { usePersona, useInsights, useProtocols } from '@/hooks'
import type { Insight, Protocol } from '@/types'

interface RiskFlag {
  id: string
  label: string
  status: 'alert' | 'warning' | 'good'
  value: string
  change?: string
  changeDirection?: 'up' | 'down' | 'stable'
}

interface TopFiveThing {
  id: string
  number: number
  category: 'alert' | 'trend' | 'insight' | 'adherence' | 'threshold'
  label: string
  value: string
  detail: string
  severity: 'critical' | 'important' | 'notable'
}

interface DiscussionPoint {
  id: string
  priority: 'high' | 'medium' | 'low'
  topic: string
  reason: string
  linkedInsightId?: string
}

// Generate risk flags from persona metrics
function generateRiskFlags(persona: any): RiskFlag[] {
  if (!persona) return []

  const flags: RiskFlag[] = []
  const metrics = persona.currentMetrics

  // Fasting glucose
  if (metrics?.fastingGlucose) {
    const glucose = metrics.fastingGlucose
    flags.push({
      id: 'glucose',
      label: 'Fasting Glucose',
      status: glucose > 100 ? 'warning' : glucose > 125 ? 'alert' : 'good',
      value: `${glucose} mg/dL`,
      change: glucose < 100 ? '-24 from baseline' : undefined,
      changeDirection: 'down',
    })
  }

  // HRV
  if (metrics?.hrv) {
    flags.push({
      id: 'hrv',
      label: 'HRV Trend',
      status: metrics.hrv > 45 ? 'good' : metrics.hrv > 35 ? 'warning' : 'alert',
      value: `${metrics.hrv} ms`,
      change: '+8 ms (30d)',
      changeDirection: 'up',
    })
  }

  // Sleep
  if (metrics?.sleepScore) {
    flags.push({
      id: 'sleep',
      label: 'Sleep Quality',
      status: metrics.sleepScore >= 80 ? 'good' : metrics.sleepScore >= 70 ? 'warning' : 'alert',
      value: `${metrics.sleepScore}/100`,
      change: metrics.sleepScore >= 80 ? 'Stable' : '-5 pts this week',
      changeDirection: metrics.sleepScore >= 80 ? 'stable' : 'down',
    })
  }

  // Deep sleep
  if (metrics?.deepSleepMin) {
    flags.push({
      id: 'deep-sleep',
      label: 'Deep Sleep',
      status: metrics.deepSleepMin >= 50 ? 'good' : metrics.deepSleepMin >= 40 ? 'warning' : 'alert',
      value: `${metrics.deepSleepMin} min`,
      changeDirection: 'stable',
    })
  }

  return flags
}

// Generate discussion points from insights and protocols
function generateDiscussionPoints(insights: Insight[], _protocols: Protocol[]): DiscussionPoint[] {
  const points: DiscussionPoint[] = []

  // Find insights where patient is not at optimal
  insights.slice(0, 5).forEach((insight, idx) => {
    const causalParams = insight.causalParams
    if (causalParams && causalParams.currentStatus !== 'at_optimal') {
      points.push({
        id: `discuss-${idx}`,
        priority: idx === 0 ? 'high' : 'medium',
        topic: insight.title.split('→')[0].trim(),
        reason: insight.recommendation || insight.headline,
        linkedInsightId: insight.id,
      })
    }
  })

  // Add celebration points for good adherence
  const goodInsights = insights.filter(i => i.causalParams?.currentStatus === 'at_optimal')
  if (goodInsights.length > 0) {
    points.push({
      id: 'celebrate',
      priority: 'low',
      topic: 'Celebrate Progress',
      reason: `${goodInsights.length} behaviors at optimal - reinforce consistency`,
    })
  }

  // If no specific points, add general ones
  if (points.length === 0) {
    points.push({
      id: 'general-1',
      priority: 'medium',
      topic: 'Review Protocol Adherence',
      reason: 'Check compliance with active interventions',
    })
  }

  return points.slice(0, 4)
}

// Generate EHS-friendly "Top 5 Things to Know" for 30-second scan
function generateTopFiveThings(
  persona: any,
  insights: Insight[],
  protocols: Protocol[],
  riskFlags: RiskFlag[]
): TopFiveThing[] {
  const things: TopFiveThing[] = []
  let counter = 1

  // 1. Critical alerts first (any red/alert status)
  const criticalFlags = riskFlags.filter(f => f.status === 'alert')
  if (criticalFlags.length > 0) {
    const flag = criticalFlags[0]
    things.push({
      id: 'alert-1',
      number: counter++,
      category: 'alert',
      label: flag.label,
      value: flag.value,
      detail: 'Requires immediate attention',
      severity: 'critical',
    })
  }

  // 2. Significant recent trend changes
  const warningFlags = riskFlags.filter(f => f.status === 'warning' && f.change)
  if (warningFlags.length > 0 && things.length < 5) {
    const flag = warningFlags[0]
    things.push({
      id: 'trend-1',
      number: counter++,
      category: 'trend',
      label: `${flag.label} Trend`,
      value: flag.change || flag.value,
      detail: 'Monitor for continued change',
      severity: 'important',
    })
  }

  // 3. Top actionable causal insight
  const actionableInsight = insights.find(i =>
    i.causalParams?.currentStatus !== 'at_optimal' && i.certainty && i.certainty > 0.75
  )
  if (actionableInsight && things.length < 5) {
    const [cause] = actionableInsight.title.split('→').map(s => s.trim())
    things.push({
      id: 'insight-1',
      number: counter++,
      category: 'insight',
      label: cause,
      value: `${Math.round((actionableInsight.certainty || 0) * 100)}% confidence`,
      detail: actionableInsight.recommendation?.slice(0, 60) + '...' || 'Causal relationship identified',
      severity: 'important',
    })
  }

  // 4. Protocol adherence issue (if any below 80%)
  const lowAdherence = protocols.find(p => {
    const activeActions = p.actions.filter(a => a.isActive).length
    const totalActions = p.actions.length
    return totalActions > 0 && (activeActions / totalActions) < 0.8
  })
  if (lowAdherence && things.length < 5) {
    const activeActions = lowAdherence.actions.filter(a => a.isActive).length
    const totalActions = lowAdherence.actions.length
    const pct = Math.round((activeActions / totalActions) * 100)
    things.push({
      id: 'adherence-1',
      number: counter++,
      category: 'adherence',
      label: lowAdherence.name.replace(' Protocol', ''),
      value: `${pct}% adherence`,
      detail: 'Discuss barriers to compliance',
      severity: pct < 50 ? 'critical' : 'important',
    })
  }

  // 5. Personal threshold differs from population (key differentiator)
  if (persona?.thresholds && things.length < 5) {
    const caffeineCutoff = persona.thresholds.caffeineCutoff
    if (caffeineCutoff && caffeineCutoff !== '2:00 PM') {
      things.push({
        id: 'threshold-1',
        number: counter++,
        category: 'threshold',
        label: 'Personal Caffeine Cutoff',
        value: caffeineCutoff,
        detail: 'Population avg: 2:00 PM — patient is different',
        severity: 'notable',
      })
    }
  }

  // Fill remaining slots with positive signals
  if (things.length < 5) {
    const goodFlags = riskFlags.filter(f => f.status === 'good')
    goodFlags.slice(0, 5 - things.length).forEach(flag => {
      things.push({
        id: `good-${flag.id}`,
        number: counter++,
        category: 'trend',
        label: flag.label,
        value: flag.value,
        detail: 'On track — reinforce',
        severity: 'notable',
      })
    })
  }

  // If still under 5, add general context
  while (things.length < 5) {
    things.push({
      id: `context-${things.length}`,
      number: counter++,
      category: 'insight',
      label: 'Data Collection',
      value: `${persona?.daysOfData || 0} days`,
      detail: 'Sufficient for personalized insights',
      severity: 'notable',
    })
  }

  return things.slice(0, 5)
}

export function PreVisitBrief() {
  const { activePersona } = usePersona()
  const { allInsights } = useInsights()
  const { protocolsByStatus } = useProtocols()

  const riskFlags = generateRiskFlags(activePersona)
  const discussionPoints = generateDiscussionPoints(allInsights, protocolsByStatus.active)
  const topFiveThings = generateTopFiveThings(activePersona, allInsights, protocolsByStatus.active, riskFlags)

  // Calculate overall protocol adherence
  const activeProtocols = protocolsByStatus.active
  const _totalActions = activeProtocols.reduce((sum, p) => sum + p.actions.filter(a => a.isActive).length, 0)
  const _completedActions = activeProtocols.reduce((sum, p) => sum + p.actions.filter(a => a.isActive).length, 0)

  // Get top 3 most relevant causal insights
  const topInsights = allInsights
    .filter(i => i.certainty && i.certainty > 0.75)
    .slice(0, 3)

  const statusColors = {
    alert: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500' },
    warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' },
    good: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' },
  }

  const priorityColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  }

  const topFiveColors = {
    critical: { badge: 'bg-red-500', border: 'border-red-300', bg: 'bg-red-50' },
    important: { badge: 'bg-amber-500', border: 'border-amber-300', bg: 'bg-amber-50' },
    notable: { badge: 'bg-primary-500', border: 'border-primary-300', bg: 'bg-primary-50' },
  }

  const categoryIcons = {
    alert: AlertTriangle,
    trend: TrendingUp,
    insight: Zap,
    adherence: Target,
    threshold: Activity,
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Header Banner */}
      <Card className="p-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white border-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <Stethoscope className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{activePersona?.name || 'Patient'}</h2>
                <Badge className="bg-white/20 text-white border-white/30">
                  {activePersona?.age || 41}F
                </Badge>
                {activePersona?.tags?.slice(0, 2).map(tag => (
                  <Badge key={tag} className="bg-primary-500/30 text-primary-100 border-primary-400/30">
                    {tag.replace('-', ' ')}
                  </Badge>
                ))}
              </div>
              <p className="text-slate-300 text-sm mt-1">
                {activePersona?.narrative || 'Pre-diabetic turned success story'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{activePersona?.daysOfData || 90}</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">Days of Data</div>
          </div>
        </div>
      </Card>

      {/* TOP 5 THINGS TO KNOW - EHS-friendly 30-second scan */}
      <Card className="p-4 border-2 border-slate-300 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center">
            <Stethoscope className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">5 Things to Know</h3>
          <Badge variant="outline" size="sm" className="ml-2 bg-white">30-Second Scan</Badge>
        </div>
        <div className="grid grid-cols-5 gap-3">
          {topFiveThings.map((thing) => {
            const colors = topFiveColors[thing.severity]
            const IconComponent = categoryIcons[thing.category]
            return (
              <div
                key={thing.id}
                className={`p-3 rounded-lg border-2 ${colors.border} ${colors.bg} relative`}
              >
                {/* Number badge */}
                <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full ${colors.badge} text-white flex items-center justify-center text-xs font-bold shadow-sm`}>
                  {thing.number}
                </div>
                {/* Category icon */}
                <div className="flex items-center gap-1.5 mb-2 mt-1">
                  <IconComponent className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {thing.category}
                  </span>
                </div>
                {/* Main content */}
                <div className="text-sm font-semibold text-slate-800 leading-tight">
                  {thing.label}
                </div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {thing.value}
                </div>
                <div className="text-[10px] text-slate-500 mt-1.5 leading-tight">
                  {thing.detail}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            Prioritized by clinical relevance • Combines wearable + lab + behavioral data
          </span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Critical
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Important
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary-500" />
              Notable
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* Left Column: Risk Flags + Protocol Adherence */}
        <div className="space-y-4">
          {/* Risk Flags */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Key Metrics</h3>
            </div>
            <div className="space-y-2">
              {riskFlags.map((flag) => {
                const colors = statusColors[flag.status]
                return (
                  <div
                    key={flag.id}
                    className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${colors.text}`}>{flag.label}</span>
                      {flag.status === 'alert' && <AlertTriangle className={`w-4 h-4 ${colors.icon}`} />}
                      {flag.status === 'warning' && <AlertTriangle className={`w-4 h-4 ${colors.icon}`} />}
                      {flag.status === 'good' && <CheckCircle className={`w-4 h-4 ${colors.icon}`} />}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-lg font-bold ${colors.text}`}>{flag.value}</span>
                      {flag.change && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          {flag.changeDirection === 'up' && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                          {flag.changeDirection === 'down' && <TrendingDown className="w-3 h-3 text-emerald-500" />}
                          {flag.changeDirection === 'stable' && <Minus className="w-3 h-3 text-slate-400" />}
                          {flag.change}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Protocol Adherence */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Protocol Adherence</h3>
            </div>
            <div className="space-y-3">
              {activeProtocols.slice(0, 3).map((protocol) => {
                const activeActions = protocol.actions.filter(a => a.isActive).length
                const totalActions = protocol.actions.length
                const pct = Math.round((activeActions / totalActions) * 100)
                const isLow = pct < 70

                return (
                  <div key={protocol.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 truncate">{protocol.name.replace(' Protocol', '')}</span>
                      <span className={`text-sm font-medium ${isLow ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {isLow && (
                      <span className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" />
                        Discuss barriers
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Middle Column: Causal Insights */}
        <div className="col-span-1">
          <Card className="p-4 h-full">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-primary-500" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Causal Insights</h3>
              <Badge variant="outline" size="sm" className="ml-auto">Validated</Badge>
            </div>
            <div className="space-y-3">
              {topInsights.map((insight, idx) => {
                const [cause, effect] = insight.title.split('→').map(s => s.trim())
                const certaintyPct = Math.round((insight.certainty || 0) * 100)

                return (
                  <div
                    key={insight.id}
                    className="p-3 bg-gradient-to-r from-primary-50/50 to-white rounded-lg border border-primary-100"
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-sm font-medium text-slate-800">
                          <span className="text-primary-600">{cause}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700">{effect}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {insight.headline}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary-400 rounded-full"
                                style={{ width: `${certaintyPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500">{certaintyPct}%</span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {insight.evidence?.personalDays || 0}d data
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 italic">
                Insights ranked by confidence and relevance to current protocols
              </p>
            </div>
          </Card>
        </div>

        {/* Right Column: Discussion Points */}
        <div>
          <Card className="p-4 h-full border-2 border-violet-200 bg-gradient-to-br from-violet-50/50 to-white">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-violet-500" />
              <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Discussion Points</h3>
            </div>
            <div className="space-y-3">
              {discussionPoints.map((point, _idx) => (
                <div
                  key={point.id}
                  className="flex items-start gap-3"
                >
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${priorityColors[point.priority]}`}>
                    {point.priority === 'high' ? '!' : point.priority === 'medium' ? '•' : '✓'}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-slate-800">{point.topic}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">{point.reason}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="mt-4 pt-3 border-t border-violet-100">
              <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Quick Reference</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-white rounded border border-slate-200 text-center">
                  <div className="text-lg font-bold text-slate-800">
                    {activePersona?.thresholds?.caffeineCutoff || '4:30 PM'}
                  </div>
                  <div className="text-[10px] text-slate-500">Caffeine Cutoff</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200 text-center">
                  <div className="text-lg font-bold text-slate-800">
                    {activePersona?.thresholds?.eatingWindowHours || 8}h
                  </div>
                  <div className="text-[10px] text-slate-500">Eating Window</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Footer with timestamp */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Brief generated {new Date().toLocaleTimeString()} | {new Date().toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            Good
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            Monitor
          </span>
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            Alert
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default PreVisitBrief
