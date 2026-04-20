import { useState } from 'react'
import { Shield, Database } from 'lucide-react'
import { PageLayout, Section, Grid } from '@/components/layout'
import { Card, Button, Toggle, Slider } from '@/components/common'

export function AdminView() {
  const [certaintyThreshold, setCertaintyThreshold] = useState(50)
  const [notifications, setNotifications] = useState({
    insights: true,
    protocols: true,
    weeklyDigest: true,
    deviceAlerts: false,
  })

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
              value={certaintyThreshold}
              onChange={setCertaintyThreshold}
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
                checked={true}
                size="sm"
              />
              <Toggle
                label="Show confidence intervals"
                description="Display uncertainty ranges on predictions"
                checked={true}
                size="sm"
              />
              <Toggle
                label="Explain causal chains"
                description="Show how insights connect to outcomes"
                checked={false}
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
              onToggle={() => setNotifications(n => ({ ...n, insights: !n.insights }))}
              size="sm"
            />
            <Toggle
              label="Protocol reminders"
              description="Daily reminders for your active protocols"
              checked={notifications.protocols}
              onToggle={() => setNotifications(n => ({ ...n, protocols: !n.protocols }))}
              size="sm"
            />
            <Toggle
              label="Weekly digest"
              description="Summary of your progress and trends"
              checked={notifications.weeklyDigest}
              onToggle={() => setNotifications(n => ({ ...n, weeklyDigest: !n.weeklyDigest }))}
              size="sm"
            />
            <Toggle
              label="Device sync alerts"
              description="Notify when device sync fails or data is stale"
              checked={notifications.deviceAlerts}
              onToggle={() => setNotifications(n => ({ ...n, deviceAlerts: !n.deviceAlerts }))}
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
                checked={false}
                size="sm"
              />
              <Toggle
                label="Share with coach"
                description="Allow your coach to view your insights"
                checked={true}
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
