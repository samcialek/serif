import { useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Copy, Check, Code, Terminal, Shield, Database, Layers, Lock, Server, Globe } from 'lucide-react'
import { PageLayout, Section, Grid } from '@/components/layout'
import { Card, Button, TabGroup, Badge } from '@/components/common'
import { JsonViewer, CodeBlock } from '@/components/common'
import { usePersona } from '@/hooks'
import { delay } from '@/utils/simulateDelay'

// Sample API responses
const sampleResponses = {
  insights: {
    endpoint: 'GET /api/v1/insights',
    description: 'Retrieve personalized insights for a user',
    response: {
      insights: [
        {
          id: 'ins_001',
          category: 'sleep',
          title: 'Caffeine significantly impacts your sleep quality',
          certainty: 0.87,
          evidenceWeight: 0.82,
          actionable: true,
          suggestedAction: 'Limit caffeine after 2:15 PM',
          causalChain: ['Caffeine intake', 'Adenosine blocking', 'Sleep latency', 'Sleep quality'],
        },
      ],
      meta: {
        total: 6,
        filtered: 4,
        certaintyThreshold: 0.5,
      },
    },
  },
  protocols: {
    endpoint: 'GET /api/v1/protocols',
    description: 'Get active and suggested protocols',
    response: {
      protocols: [
        {
          id: 'prot_001',
          category: 'sleep',
          title: 'Caffeine Timing Protocol',
          status: 'active',
          personalizedTiming: 'No caffeine after 2:15 PM',
          expectedImpact: '+8% sleep score',
          certainty: 0.87,
        },
      ],
      meta: {
        active: 2,
        suggested: 3,
      },
    },
  },
  simulate: {
    endpoint: 'POST /api/v1/simulate',
    description: 'Run what-if simulation',
    response: {
      simulation: {
        baseline: { sleepScore: 72, hrv: 45 },
        projected: { sleepScore: 78, hrv: 48 },
        change: { sleepScore: '+6', hrv: '+3' },
        certainty: 0.75,
        timeToEffect: '3-7 days',
        confidenceInterval: { low: 74, high: 82 },
      },
    },
  },
  metrics: {
    endpoint: 'GET /api/v1/metrics',
    description: 'Retrieve raw metrics data',
    response: {
      metrics: [
        {
          date: '2024-12-15',
          sleepScore: 72,
          sleepDuration: 420,
          hrv: 45,
          restingHr: 58,
          steps: 8500,
        },
      ],
      meta: {
        days: 45,
        lastSync: '2024-12-15T08:30:00Z',
      },
    },
  },
}

export function ApiView() {
  const { activePersona } = usePersona()
  const [activeEndpoint, setActiveEndpoint] = useState<keyof typeof sampleResponses>('insights')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<any>(sampleResponses.insights.response)
  const [copied, setCopied] = useState(false)

  const endpoints = Object.entries(sampleResponses).map(([key, value]) => ({
    value: key,
    label: value.endpoint.split(' ')[1].split('/').pop() || key,
  }))

  const handleRunRequest = async () => {
    setIsLoading(true)
    await delay(800)
    setResponse(sampleResponses[activeEndpoint].response)
    setIsLoading(false)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(response, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const currentEndpoint = sampleResponses[activeEndpoint]

  return (
    <PageLayout
      title="API Explorer"
      subtitle="Explore Serif's REST API endpoints"
    >
      <Grid columns={2} gap="lg">
        {/* Left: Endpoint selector */}
        <div>
          <Section title="Available Endpoints">
            <div className="space-y-2">
              {Object.entries(sampleResponses).map(([key, value]) => (
                <Card
                  key={key}
                  interactive
                  onClick={() => {
                    setActiveEndpoint(key as keyof typeof sampleResponses)
                    setResponse(value.response)
                  }}
                  className={`p-4 ${
                    activeEndpoint === key ? 'ring-2 ring-primary-500 border-primary-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={value.endpoint.startsWith('GET') ? 'success' : 'primary'}
                      size="sm"
                    >
                      {value.endpoint.split(' ')[0]}
                    </Badge>
                    <code className="text-sm font-mono text-gray-700">
                      {value.endpoint.split(' ')[1]}
                    </code>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">{value.description}</p>
                </Card>
              ))}
            </div>
          </Section>

          <Section title="Request" className="mt-6">
            <Card className="p-4 bg-gray-900">
              <div className="flex items-center gap-2 mb-3 text-gray-400 text-xs">
                <Terminal className="w-4 h-4" />
                <span>cURL</span>
              </div>
              <pre className="text-sm text-green-400 font-mono overflow-x-auto">
{`curl -X ${currentEndpoint.endpoint.split(' ')[0]} \\
  '${currentEndpoint.endpoint.split(' ')[1]}' \\
  -H 'Authorization: Bearer <token>' \\
  -H 'X-User-ID: ${activePersona?.id || 'user_123'}'`}
              </pre>
            </Card>
            <Button
              onClick={handleRunRequest}
              loading={isLoading}
              className="mt-4"
              fullWidth
            >
              <Play className="w-4 h-4 mr-2" />
              Run Request
            </Button>
          </Section>
        </div>

        {/* Right: Response */}
        <div data-tour="api-response">
          <Section
            title="Response"
            actions={
              <Button size="sm" variant="ghost" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            }
          >
            <JsonViewer
              data={response}
              theme="dark"
              expandLevel={3}
              className="max-h-[600px] overflow-auto"
            />
          </Section>

          <Section title="Response Schema" className="mt-6">
            <Card className="p-4">
              <div className="space-y-3 text-sm">
                {activeEndpoint === 'insights' && (
                  <>
                    <div>
                      <span className="font-mono text-primary-600">certainty</span>
                      <span className="text-gray-500 ml-2">float (0-1)</span>
                      <p className="text-gray-600 text-xs mt-1">
                        Confidence level based on personal data quality
                      </p>
                    </div>
                    <div>
                      <span className="font-mono text-primary-600">evidenceWeight</span>
                      <span className="text-gray-500 ml-2">float (0-1)</span>
                      <p className="text-gray-600 text-xs mt-1">
                        Balance between personal data vs population prior
                      </p>
                    </div>
                    <div>
                      <span className="font-mono text-primary-600">causalChain</span>
                      <span className="text-gray-500 ml-2">string[]</span>
                      <p className="text-gray-600 text-xs mt-1">
                        Causal path from action to outcome
                      </p>
                    </div>
                  </>
                )}
                {activeEndpoint === 'simulate' && (
                  <>
                    <div>
                      <span className="font-mono text-primary-600">confidenceInterval</span>
                      <span className="text-gray-500 ml-2">object</span>
                      <p className="text-gray-600 text-xs mt-1">
                        95% confidence bounds for projected outcome
                      </p>
                    </div>
                    <div>
                      <span className="font-mono text-primary-600">timeToEffect</span>
                      <span className="text-gray-500 ml-2">string</span>
                      <p className="text-gray-600 text-xs mt-1">
                        Expected duration to see results
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </Section>
        </div>
      </Grid>

      {/* Integration guide */}
      <Section title="Integration Guide" className="mt-8">
        <Card className="p-6">
          <Grid columns={3} gap="md">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">1. Authentication</h4>
              <p className="text-sm text-gray-600">
                Use API keys for server-to-server, OAuth for user-facing apps.
                All requests require Authorization header.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">2. Rate Limits</h4>
              <p className="text-sm text-gray-600">
                1000 requests/minute per API key. Insights cached for 5 minutes.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">3. Webhooks</h4>
              <p className="text-sm text-gray-600">
                Subscribe to insight.created, protocol.updated events.
                Retry with exponential backoff.
              </p>
            </div>
          </Grid>
        </Card>
      </Section>

      {/* Enterprise Architecture */}
      <Section title="Enterprise Architecture" className="mt-8">
        <Grid columns={2} gap="lg">
          {/* Multi-Tenant Data Isolation */}
          <Card className="p-6 border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Layers className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Multi-Tenant Isolation</h4>
                <p className="text-xs text-gray-500">Complete data separation per partner</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">Tenant-scoped encryption keys (AES-256)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">Isolated compute environments per partner</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">Partner data never co-mingled in storage</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-gray-700">Cross-platform learning uses anonymized aggregates only</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <code className="text-xs text-blue-800">X-Tenant-ID: partner_human_edge</code>
            </div>
          </Card>

          {/* FHIR Native */}
          <Card className="p-6 border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Database className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">FHIR R4 Native</h4>
                <p className="text-xs text-gray-500">Healthcare interoperability standard</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-gray-700">Native FHIR R4 resource support</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-gray-700">Observation, DiagnosticReport, Patient</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-gray-700">SMART on FHIR authentication</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-gray-700">Bulk FHIR export for analytics</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <code className="text-xs text-emerald-800">Content-Type: application/fhir+json</code>
            </div>
          </Card>
        </Grid>
      </Section>

      {/* Security & Compliance */}
      <Section title="Security & Compliance" className="mt-8">
        <Card className="p-6 border-2 border-violet-200 bg-gradient-to-r from-violet-50/30 to-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-violet-100 rounded-lg">
              <Shield className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">Enterprise-Grade Security</h4>
              <p className="text-xs text-gray-500">Built for healthcare data compliance</p>
            </div>
          </div>
          <Grid columns={4} gap="md">
            <div className="text-center p-4 bg-white rounded-lg border border-violet-100">
              <Lock className="w-6 h-6 text-violet-500 mx-auto mb-2" />
              <div className="text-sm font-semibold text-gray-900">HIPAA Ready</div>
              <div className="text-xs text-gray-500 mt-1">BAA available</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-violet-100">
              <Shield className="w-6 h-6 text-violet-500 mx-auto mb-2" />
              <div className="text-sm font-semibold text-gray-900">SOC 2 Type II</div>
              <div className="text-xs text-gray-500 mt-1">Planned</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-violet-100">
              <Server className="w-6 h-6 text-violet-500 mx-auto mb-2" />
              <div className="text-sm font-semibold text-gray-900">End-to-End Encryption</div>
              <div className="text-xs text-gray-500 mt-1">TLS 1.3 + AES-256</div>
            </div>
            <div className="text-center p-4 bg-white rounded-lg border border-violet-100">
              <Globe className="w-6 h-6 text-violet-500 mx-auto mb-2" />
              <div className="text-sm font-semibold text-gray-900">Data Residency</div>
              <div className="text-xs text-gray-500 mt-1">US, EU options</div>
            </div>
          </Grid>
        </Card>
      </Section>

      {/* SDK Examples */}
      <Section title="SDK Integration" className="mt-8">
        <Grid columns={2} gap="lg">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline">TypeScript</Badge>
              <span className="text-sm text-gray-500">Official SDK</span>
            </div>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
{`import { SerifClient } from '@serif/sdk';

const serif = new SerifClient({
  apiKey: process.env.SERIF_API_KEY,
  tenantId: 'partner_human_edge'
});

// Get personalized insights
const insights = await serif.insights.list({
  userId: 'user_123',
  category: 'sleep',
  minCertainty: 0.7
});

// Run what-if simulation
const simulation = await serif.simulate({
  userId: 'user_123',
  intervention: { caffeineCutoff: '14:00' }
});`}
            </pre>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline">Python</Badge>
              <span className="text-sm text-gray-500">Official SDK</span>
            </div>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
{`from serif import SerifClient

client = SerifClient(
    api_key=os.environ["SERIF_API_KEY"],
    tenant_id="partner_human_edge"
)

# Get personalized insights
insights = client.insights.list(
    user_id="user_123",
    category="sleep",
    min_certainty=0.7
)

# Subscribe to real-time updates
@client.on("insight.created")
def handle_insight(event):
    print(f"New insight: {event.data}")`}
            </pre>
          </Card>
        </Grid>
      </Section>

      {/* SLA & Support */}
      <Section title="Planned Enterprise SLA" className="mt-8">
        <Card className="p-6">
          <Grid columns={4} gap="md">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">99.9%</div>
              <div className="text-sm text-gray-500 mt-1">Uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">&lt;100ms</div>
              <div className="text-sm text-gray-500 mt-1">P95 Latency</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">24/7</div>
              <div className="text-sm text-gray-500 mt-1">Enterprise Support</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-600">6 weeks</div>
              <div className="text-sm text-gray-500 mt-1">Avg Integration Time</div>
            </div>
          </Grid>
        </Card>
      </Section>
    </PageLayout>
  )
}

export default ApiView
