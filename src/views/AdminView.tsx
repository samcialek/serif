import { Shield, Database } from 'lucide-react'
import { PageLayout, Section, Grid } from '@/components/layout'
import { Card, Button, Toggle, Slider } from '@/components/common'
import { useSettingsStore } from '@/stores/settingsStore'

export function AdminView() {
  const insights = useSettingsStore((s) => s.insights)
  const notifications = useSettingsStore((s) => s.notifications)
  const privacy = useSettingsStore((s) => s.privacy)
  const setInsight = useSettingsStore((s) => s.setInsight)
  const setNotification = useSettingsStore((s) => s.setNotification)
  const setPrivacy = useSettingsStore((s) => s.setPrivacy)

  return (
    <PageLayout
      title="Settings"
      subtitle="Manage your preferences and account settings"
    >
      {/* Insight Preferences */}
      <Section title="Insight Preferences" subtitle="Control how insights are displayed">
        <Grid columns={2} gap="md">
          <Card className="p-5">
            <h4 className="font-medium text-gray-900 mb-4">Certainty Threshold</h4>
            <p className="text-sm text-gray-500 mb-4">
              Minimum certainty level for showing insights. Lower values show more exploratory insights.
            </p>
            <Slider
              value={insights.certaintyThreshold}
              onChange={(v) => setInsight('certaintyThreshold', v)}
              min={0}
              max={100}
              step={5}
              showValue
              showLabels
              minLabel="Exploratory"
              maxLabel="High Confidence"
              variant="certainty"
            />
          </Card>

          <Card className="p-5">
            <h4 className="font-medium text-gray-900 mb-4">Evidence Display</h4>
            <div className="space-y-4">
              <Toggle
                label="Show evidence breakdown"
                description="Display personal vs population data contribution"
                checked={insights.showEvidenceBreakdown}
                onToggle={() =>
                  setInsight('showEvidenceBreakdown', !insights.showEvidenceBreakdown)
                }
                size="sm"
              />
              <Toggle
                label="Show confidence intervals"
                description="Display uncertainty ranges on predictions"
                checked={insights.showConfidenceIntervals}
                onToggle={() =>
                  setInsight('showConfidenceIntervals', !insights.showConfidenceIntervals)
                }
                size="sm"
              />
              <Toggle
                label="Explain causal chains"
                description="Show how insights connect to outcomes"
                checked={insights.explainCausalChains}
                onToggle={() =>
                  setInsight('explainCausalChains', !insights.explainCausalChains)
                }
                size="sm"
              />
            </div>
          </Card>
        </Grid>
      </Section>

      {/* Notifications */}
      <Section title="Notifications" subtitle="Choose what updates you receive" className="mt-8">
        <Card className="p-5">
          <div className="space-y-4">
            <Toggle
              label="New insights"
              description="Get notified when new high-certainty insights are discovered"
              checked={notifications.insights}
              onToggle={() => setNotification('insights', !notifications.insights)}
              size="sm"
            />
            <Toggle
              label="Protocol reminders"
              description="Daily reminders for your active protocols"
              checked={notifications.protocols}
              onToggle={() => setNotification('protocols', !notifications.protocols)}
              size="sm"
            />
            <Toggle
              label="Weekly digest"
              description="Summary of your progress and trends"
              checked={notifications.weeklyDigest}
              onToggle={() =>
                setNotification('weeklyDigest', !notifications.weeklyDigest)
              }
              size="sm"
            />
            <Toggle
              label="Device sync alerts"
              description="Get notified when a device fails to sync or its data goes stale"
              checked={notifications.deviceAlerts}
              onToggle={() =>
                setNotification('deviceAlerts', !notifications.deviceAlerts)
              }
              size="sm"
            />
          </div>
        </Card>
      </Section>

      {/* Privacy & Data */}
      <Section title="Privacy & Data" subtitle="Manage your data and privacy settings" className="mt-8">
        <Grid columns={2} gap="md">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-50">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Data Management</h4>
                <p className="text-sm text-gray-500">Control your health data</p>
              </div>
            </div>
            <div className="space-y-3">
              <Button variant="outline" size="sm" fullWidth>
                Export All Data
              </Button>
              <Button variant="outline" size="sm" fullWidth>
                Download Insights Report
              </Button>
              <Button variant="outline" size="sm" fullWidth className="text-red-600 hover:bg-red-50">
                Delete All Data
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-green-50">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Privacy Controls</h4>
                <p className="text-sm text-gray-500">Manage data sharing</p>
              </div>
            </div>
            <div className="space-y-4">
              <Toggle
                label="Contribute to research"
                description="Allow anonymized data for health research"
                checked={privacy.contributeToResearch}
                onToggle={() =>
                  setPrivacy('contributeToResearch', !privacy.contributeToResearch)
                }
                size="sm"
              />
              <Toggle
                label="Share with coach"
                description="Allow your coach to view your insights"
                checked={privacy.shareWithCoach}
                onToggle={() =>
                  setPrivacy('shareWithCoach', !privacy.shareWithCoach)
                }
                size="sm"
              />
            </div>
          </Card>
        </Grid>
      </Section>

      {/* Connected Accounts */}
      <Section title="Connected Accounts" subtitle="Manage linked services" className="mt-8">
        <Card className="p-5">
          <div className="space-y-4">
            {[
              { name: 'Apple Health', connected: true, lastSync: '2 hours ago' },
              { name: 'Oura Ring', connected: true, lastSync: '30 minutes ago' },
              { name: 'Mito Labs', connected: true, lastSync: '3 days ago' },
              { name: 'Garmin Connect', connected: false },
            ].map((account) => (
              <div key={account.name} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${account.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{account.name}</p>
                    {account.connected && (
                      <p className="text-xs text-gray-500">Last synced: {account.lastSync}</p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  {account.connected ? 'Disconnect' : 'Connect'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </Section>
    </PageLayout>
  )
}

export default AdminView
