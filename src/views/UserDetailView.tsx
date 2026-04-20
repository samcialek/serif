import { useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCw, Download, FlaskConical, Lightbulb } from 'lucide-react';
import { PageLayout, Section, Grid } from '@/components/layout';
import { Card, Button, Badge } from '@/components/common';
import {
  UserProfileHeader,
  PersonalInsightCard,
  CGMDayChart,
  DailyProtocol,
  KeyMetricCard,
} from '@/components/clients';
import {
  useClientStore,
  useUserDetail,
  useUserDetailLoading,
  isHumanEdgeUserDetail,
} from '@/stores/clientStore';
import { getClientById } from '@/data/clients';

export function UserDetailView() {
  const { clientId, userId } = useParams<{ clientId: string; userId: string }>();
  const navigate = useNavigate();

  const loadUserDetail = useClientStore((s) => s.loadUserDetail);
  const clearUserDetail = useClientStore((s) => s.clearUserDetail);
  const userDetail = useUserDetail();
  const loading = useUserDetailLoading();

  const client = clientId ? getClientById(clientId) : null;

  useEffect(() => {
    if (clientId && userId) {
      loadUserDetail(clientId, userId);
    }
    return () => {
      clearUserDetail();
    };
  }, [clientId, userId, loadUserDetail, clearUserDetail]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!userDetail || !client) {
    return (
      <PageLayout>
        <Card className="p-12 text-center">
          <p className="text-gray-500 mb-4">User not found</p>
          <Button variant="outline" onClick={() => navigate('/clients')}>
            Back to Clients
          </Button>
        </Card>
      </PageLayout>
    );
  }

  const isHumanEdge = isHumanEdgeUserDetail(userDetail);

  return (
    <PageLayout
      title={userDetail.name}
      maxWidth="2xl"
      actions={
        <div className="flex items-center gap-3">
          <Link to="/clients">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Clients
            </Button>
          </Link>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            Export Report
          </Button>
        </div>
      }
    >
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <UserProfileHeader
          name={userDetail.name}
          avatar={userDetail.avatar}
          archetype={userDetail.archetype}
          clientName={client.name}
          clientLogo={client.logo}
          enrollmentDate={userDetail.enrollmentDate}
          activeDays={userDetail.activeDays}
          complianceRate={userDetail.complianceRate}
          currentPhase={userDetail.currentPhase}
          tags={userDetail.tags}
          dataSources={userDetail.dataSources}
          additionalStats={[{ label: 'insights', value: userDetail.personalInsights.length }]}
        />
      </motion.div>

      {/* Key Metrics Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <Section title="Key Metrics">
          <Grid columns={3} gap="md">
            {userDetail.keyMetrics.map((metric) => (
              <KeyMetricCard
                key={metric.id}
                name={metric.name}
                value={metric.value}
                unit={metric.unit}
                change={metric.change}
                changeDirection={metric.changeDirection}
                isGood={metric.isGood}
                sparklineData={metric.sparklineData}
                period={metric.period}
              />
            ))}
          </Grid>
        </Section>
      </motion.div>

      {/* Two-column layout for main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Charts and Data */}
        <div className="lg:col-span-2 space-y-6">
          {/* Human Edge: CGM Chart */}
          {isHumanEdge && userDetail.cgmReadings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <CGMDayChart readings={userDetail.cgmReadings} />
            </motion.div>
          )}

          {/* Personal Insights */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Section
              title="Personal Insights"
              actions={
                <Badge variant="outline" className="text-primary-600 border-primary-200">
                  <Lightbulb className="w-3 h-3 mr-1" />
                  {userDetail.personalInsights.length} insights
                </Badge>
              }
            >
              <div className="space-y-4">
                {userDetail.personalInsights.map((insight) => (
                  <PersonalInsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </Section>
          </motion.div>

          {/* Human Edge: Lab Trends */}
          {isHumanEdge && userDetail.labHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Section
                title="Lab Trends"
                subtitle="Biomarker progress over time"
                actions={
                  <Badge variant="outline" className="text-rose-600 border-rose-200">
                    <FlaskConical className="w-3 h-3 mr-1" />
                    {userDetail.labHistory.length} markers
                  </Badge>
                }
              >
                <div className="grid grid-cols-2 gap-4">
                  {userDetail.labHistory.map((lab) => {
                    const latestValue = lab.readings[lab.readings.length - 1]?.value;
                    const prevValue = lab.readings[lab.readings.length - 2]?.value;
                    const change = prevValue ? latestValue - prevValue : 0;

                    return (
                      <Card key={lab.biomarker} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium text-gray-900">{lab.biomarker}</h4>
                            <p className="text-xs text-gray-500">Target: {lab.targetRange.low}-{lab.targetRange.high} {lab.unit}</p>
                          </div>
                          <Badge
                            variant={
                              lab.trend === 'improving'
                                ? 'success'
                                : lab.trend === 'worsening'
                                  ? 'danger'
                                  : 'outline'
                            }
                          >
                            {lab.trend}
                          </Badge>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-gray-900">{latestValue}</span>
                          <span className="text-sm text-gray-500">{lab.unit}</span>
                          {change !== 0 && (
                            <span
                              className={
                                lab.trend === 'improving' ? 'text-green-600 text-sm' : 'text-red-600 text-sm'
                              }
                            >
                              {change > 0 ? '+' : ''}{change.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex gap-1">
                          {lab.readings.map((r, i) => (
                            <div
                              key={i}
                              className="flex-1 h-1 rounded"
                              style={{
                                backgroundColor:
                                  r.value >= lab.targetRange.low && r.value <= lab.targetRange.high
                                    ? '#10B981'
                                    : '#F59E0B',
                              }}
                              title={`${r.date}: ${r.value} ${lab.unit}`}
                            />
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </Section>
            </motion.div>
          )}

        </div>

        {/* Right column - Protocol and Interventions */}
        <div className="space-y-6">
          {/* Daily Protocol (Human Edge only) */}
          {isHumanEdge && userDetail.dailyProtocol && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <DailyProtocol items={userDetail.dailyProtocol} clientId={clientId} />
            </motion.div>
          )}

          {/* Human Edge: Active Interventions */}
          {isHumanEdge && userDetail.interventions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <Card className="overflow-hidden">
                <div className="p-4 border-b border-gray-50">
                  <h3 className="font-semibold text-gray-900">Active Interventions</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {userDetail.interventions.map((intervention) => (
                    <div key={intervention.code} className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">{intervention.name}</h4>
                          <p className="text-xs text-gray-500">{intervention.category}</p>
                        </div>
                        <Badge
                          variant={
                            intervention.compliance >= 90
                              ? 'success'
                              : intervention.compliance >= 70
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {intervention.compliance}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>Target: {intervention.targetMetric}</span>
                        <span>Streak: {intervention.streak} days</span>
                      </div>
                      {/* Compliance bar */}
                      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${intervention.compliance}%`,
                            backgroundColor:
                              intervention.compliance >= 90
                                ? '#10B981'
                                : intervention.compliance >= 70
                                  ? '#F59E0B'
                                  : '#EF4444',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default UserDetailView;
