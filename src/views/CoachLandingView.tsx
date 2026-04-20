import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Lightbulb,
  TrendingDown,
  ClipboardList,
  Clock,
  AlertCircle,
  ChevronRight,
  Target,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { PageLayout, Grid, Section } from '@/components/layout'
import { Card, Badge, Button } from '@/components/common'
import { getAllPersonas } from '@/data/personas'
import { getFilteredInsights } from '@/data/insights'
import { getProtocolsForPersona } from '@/data/protocols'
import { getSessionPreps, getCoachWeeklySummary } from '@/data/coach'

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function CoachLandingView() {
  const personas = getAllPersonas()
  const greeting = greetingForHour(new Date().getHours())

  const allInsightsData = personas.map(p => {
    const insights = getFilteredInsights({ personaId: p.id, minCertainty: 0.6 })
    const outsideSafeguards = insights.filter(i =>
      i.causalParams?.currentStatus && i.causalParams.currentStatus !== 'at_optimal'
    )
    return { personaId: p.id, insights, outsideSafeguards }
  })

  const totalInsights = allInsightsData.reduce((acc, d) => acc + d.insights.length, 0)
  const insightsOutsideSafeguards = allInsightsData.reduce((acc, d) => acc + d.outsideSafeguards.length, 0)

  const protocolsData = personas.map(p => {
    const protocols = getProtocolsForPersona(p.id)
    return {
      personaId: p.id,
      needsReview: protocols.filter(pr => pr.status === 'suggested' || !pr.status),
    }
  })

  const protocolsNeedingReview = protocolsData.reduce((acc, d) => acc + d.needsReview.length, 0)
  const patientsWithDeviations = allInsightsData.filter(d => d.outsideSafeguards.length > 0).length

  const sessionPrepsList = getSessionPreps()
  const digest = getCoachWeeklySummary()

  const summaryStats = [
    {
      icon: AlertTriangle,
      label: 'Outside Safeguards',
      value: insightsOutsideSafeguards,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-100',
      urgent: insightsOutsideSafeguards > 0
    },
    {
      icon: Lightbulb,
      label: 'Total Insights',
      value: totalInsights,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-100'
    },
    {
      icon: ClipboardList,
      label: 'Protocols to Review',
      value: protocolsNeedingReview,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
      borderColor: 'border-rose-100',
      urgent: protocolsNeedingReview > 0
    },
    {
      icon: TrendingDown,
      label: 'Patients Deviating',
      value: patientsWithDeviations,
      subtitle: `of ${personas.length}`,
      color: 'text-secondary-600',
      bgColor: 'bg-secondary-50',
      borderColor: 'border-secondary-100'
    },
  ]

  return (
    <PageLayout maxWidth="2xl" padding="lg">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-semibold text-slate-800 mb-1">{greeting}, Dr. Hoon</h1>
        <p className="text-slate-500">
          Coaching <span className="font-medium text-primary-600">{personas.length} patients</span>
          {insightsOutsideSafeguards > 0 && (
            <> · <span className="font-medium text-amber-600">{insightsOutsideSafeguards} insights</span> need review</>
          )}
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Grid columns={4} gap="md">
          {summaryStats.map((stat, index) => {
            const Icon = stat.icon
            const isUrgent = 'urgent' in stat && stat.urgent
            return (
              <Card
                key={index}
                className={`p-4 rounded-xl border transition-all ${
                  isUrgent
                    ? 'ring-1 ring-amber-200 bg-amber-50/30 border-amber-200'
                    : `bg-white/80 ${stat.borderColor}`
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${stat.bgColor} ${stat.borderColor}`}>
                    <Icon className={'w-5 h-5 ' + stat.color} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
                    <div className="flex items-baseline gap-1">
                      <p className={`text-2xl font-semibold ${isUrgent ? stat.color : 'text-slate-800'}`}>
                        {stat.value}
                      </p>
                      {'subtitle' in stat && stat.subtitle && (
                        <span className="text-sm text-slate-400">{stat.subtitle}</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </Grid>
      </motion.div>

      {/* Session Prep */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-8"
      >
        <Section
          title="Upcoming sessions"
          actions={
            <Link to="/members">
              <Button size="xs" variant="ghost">
                View all members
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2" data-tour="session-prep">
            {sessionPrepsList.map((prep) => (
              <Card key={prep.id} className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-bold text-base">
                      {prep.clientName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">{prep.clientName}</h3>
                      <p className="text-xs text-slate-500">{prep.focus}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={prep.urgency === 'high' ? 'warning' : 'default'}>
                      {prep.urgency} priority
                    </Badge>
                    <p className="text-xs text-slate-500 mt-1">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {prep.sessionTime}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  {prep.keyMetrics.slice(0, 3).map((metric, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-sm font-semibold text-slate-800">{metric.value}</div>
                      <div className="text-[10px] text-slate-500 truncate">{metric.label}</div>
                      {metric.trend && (
                        <div
                          className={`text-[10px] flex items-center justify-center gap-0.5 ${
                            metric.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {metric.trend.startsWith('+') ? (
                            <TrendingUp className="w-2.5 h-2.5" />
                          ) : (
                            <TrendingDown className="w-2.5 h-2.5" />
                          )}
                          {metric.trend}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mb-3 p-2.5 bg-primary-50 border border-primary-100 rounded-lg">
                  <h4 className="text-xs font-medium text-primary-800 mb-1 flex items-center gap-1.5">
                    <Target className="w-3 h-3" />
                    Suggested interventions
                  </h4>
                  <ul className="space-y-0.5">
                    {prep.discussionPoints.slice(0, 2).map((point, i) => (
                      <li key={i} className="text-xs text-primary-700">
                        • {typeof point === 'string' ? point : point.title}
                      </li>
                    ))}
                  </ul>
                </div>

                {prep.alerts && prep.alerts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
                    <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium">
                      <AlertCircle className="w-3 h-3" />
                      Attention needed
                    </div>
                    <ul className="mt-0.5 text-[11px] text-amber-600">
                      {prep.alerts.map((alert, i) => (
                        <li key={i}>• {alert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button size="sm" variant="outline" fullWidth>
                  View full prep
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Card>
            ))}
          </div>
        </Section>
      </motion.div>

      {/* Weekly Digest */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8"
      >
        <Section title="This week">
          <Grid columns={2} gap="md">
            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-500" />
                Activity
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Sessions</span>
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">{digest.totalSessions}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">New insights</span>
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">{digest.newInsights}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-sm text-slate-600">Protocols started</span>
                  <span className="text-lg font-semibold text-slate-800 tabular-nums">{digest.protocolsStarted}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Avg certainty</span>
                  <span className="text-lg font-semibold text-primary-600 tabular-nums">{digest.avgCertainty}%</span>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Members needing attention
              </h3>
              <div className="space-y-2">
                {digest.needsAttention.map((member, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg border border-amber-100"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-amber-200 rounded-full flex items-center justify-center text-amber-700 font-bold text-xs">
                        {member.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{member.name}</p>
                        <p className="text-[11px] text-amber-600 truncate">{member.reason}</p>
                      </div>
                    </div>
                    <Button size="xs" variant="outline">Review</Button>
                  </div>
                ))}
              </div>
            </Card>
          </Grid>

          <Section title="Top performing protocols" className="mt-6">
            <Grid columns={3} gap="md">
              {digest.topProtocols.map((protocol, i) => (
                <Card key={i} className="p-4 hover:border-primary-200 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="p-1 bg-green-100 rounded">
                      <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-800">{protocol.name}</span>
                  </div>
                  <p className="text-xs text-slate-500">{protocol.clients} members enrolled</p>
                  <p className="text-xs font-semibold text-green-600 mt-0.5">{protocol.improvement} avg improvement</p>
                </Card>
              ))}
            </Grid>
          </Section>
        </Section>
      </motion.div>
    </PageLayout>
  )
}

export default CoachLandingView
