import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Lightbulb,
  Link2,
  ListChecks,
  Users,
  TrendingUp,
  Moon,
  Heart,
  Zap,
} from 'lucide-react'
import { PageLayout, Grid } from '@/components/layout'
import { Card, Button } from '@/components/common'
import { usePersona } from '@/hooks'

const features = [
  {
    icon: Lightbulb,
    title: 'Personalized Insights',
    description: 'Discover what actually works for YOUR body based on causal AI analysis',
    path: '/insights',
    color: 'text-amber-500',
    bgColor: 'bg-amber-50',
  },
  {
    icon: ListChecks,
    title: 'Actionable Protocols',
    description: 'Turn insights into specific, personalized recommendations',
    path: '/protocols',
    color: 'text-green-500',
    bgColor: 'bg-green-50',
  },
  {
    icon: Link2,
    title: 'Data Integration',
    description: 'Connect any wearable or health data source seamlessly',
    path: '/integration',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    icon: Users,
    title: 'Coach Dashboard',
    description: 'Empower practitioners with client-ready session prep',
    path: '/coach',
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
  },
]

export function LandingView() {
  const navigate = useNavigate()
  const { activePersona } = usePersona()

  // User's current metrics summary
  const todaysSummary = [
    { icon: Moon, label: 'Sleep Score', value: activePersona?.currentMetrics?.sleepScore ?? 72, unit: '', color: 'text-purple-600', bgColor: 'bg-purple-50' },
    { icon: Heart, label: 'HRV', value: activePersona?.currentMetrics?.hrv ?? 45, unit: 'ms', color: 'text-rose-600', bgColor: 'bg-rose-50' },
    { icon: Zap, label: 'Readiness', value: 78, unit: '%', color: 'text-amber-600', bgColor: 'bg-amber-50' },
    { icon: TrendingUp, label: 'Trend', value: '+5', unit: '%', color: 'text-green-600', bgColor: 'bg-green-50' },
  ]

  return (
    <PageLayout maxWidth="2xl" padding="lg">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Good morning{activePersona ? `, ${activePersona.name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-lg text-gray-600">
          Here's your personalized health overview for today.
        </p>
      </motion.div>

      {/* Today's Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <Grid columns={4} gap="md">
          {todaysSummary.map((metric, index) => {
            const Icon = metric.icon
            return (
              <Card key={index} className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${metric.bgColor}`}>
                    <Icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                  <span className="text-sm text-gray-600">{metric.label}</span>
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {metric.value}{metric.unit}
                </div>
              </Card>
            )
          })}
        </Grid>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <Grid columns={2} gap="md">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card
                key={index}
                interactive
                className="p-5"
                onClick={() => navigate(feature.path)}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${feature.bgColor}`}>
                    <Icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-600">{feature.description}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                </div>
              </Card>
            )
          })}
        </Grid>
      </motion.div>

      {/* Current Profile Context */}
      {activePersona && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-primary-900 mb-1">
                  Your Profile
                </h3>
                <p className="text-sm text-primary-700">
                  {activePersona.dataContext?.daysOfData ?? activePersona.daysOfData} days of data •{' '}
                  {Math.round((activePersona.dataContext?.evidenceWeight ?? 0.7) * 100)}% personal evidence weight
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/integration')}
                className="border-primary-300 text-primary-700 hover:bg-primary-100"
              >
                Manage Devices
              </Button>
            </div>
          </Card>
        </motion.div>
      )}
    </PageLayout>
  )
}

export default LandingView
