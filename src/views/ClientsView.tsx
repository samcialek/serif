import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  Activity,
  Zap,
  Users,
  TrendingUp,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Workflow,
  Layers,
  Target,
  ChevronRight,
} from 'lucide-react';
import { PageLayout, Grid } from '@/components/layout';
import { Card, Button, Badge } from '@/components/common';
import {
  useClientStore,
  useClientSummaries,
  useActiveClient,
  useClientDataSources,
  useClientXVariables,
  useClientYVariables,
  useClientInsights,
  useDataPipelineStats,
} from '@/stores/clientStore';
import type { DataSource, XVariable, YVariable } from '@/types/client';

// ============================================================================
// Data Source Card Component
// ============================================================================

function DataSourceCard({ source }: { source: DataSource }) {
  const statusColors = {
    active: 'bg-green-100 text-green-700 border-green-200',
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    error: 'bg-red-100 text-red-700 border-red-200',
  };

  const statusIcons = {
    active: CheckCircle,
    pending: Clock,
    error: AlertCircle,
  };

  const StatusIcon = statusIcons[source.status];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary-50 rounded-lg">
            <Database className="w-4 h-4 text-primary-600" />
          </div>
          <div>
            <h4 className="font-medium text-gray-900 text-sm">{source.name}</h4>
            <p className="text-xs text-gray-500">{source.type}</p>
          </div>
        </div>
        <Badge className={statusColors[source.status]}>
          <StatusIcon className="w-3 h-3 mr-1" />
          {source.status}
        </Badge>
      </div>

      <p className="text-xs text-gray-600 mb-3 line-clamp-2">{source.description}</p>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-gray-500">
          <Layers className="w-3 h-3" />
          <span>{formatNumber(source.recordCount || 0)} records</span>
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <RefreshCw className="w-3 h-3" />
          <span>{source.cadence}</span>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400 font-mono truncate" title={source.pipeline}>
          {source.pipeline}
        </p>
      </div>
    </Card>
  );
}

// ============================================================================
// Variable Card Component
// ============================================================================

function VariableCard({
  variable,
  type,
}: {
  variable: XVariable | YVariable;
  type: 'x' | 'y';
}) {
  const isY = type === 'y';
  const yVar = variable as YVariable;

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
          isY ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}
      >
        {type.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">{variable.name}</p>
        <p className="text-xs text-gray-500 truncate">{variable.category}</p>
      </div>
      {!isY && (variable as XVariable).unit && (
        <Badge variant="outline" className="text-xs">
          {(variable as XVariable).unit}
        </Badge>
      )}
      {isY && (
        <Badge
          variant="outline"
          className={`text-xs ${
            yVar.targetDirection === 'increase'
              ? 'text-green-600 border-green-200'
              : yVar.targetDirection === 'decrease'
                ? 'text-red-600 border-red-200'
                : 'text-blue-600 border-blue-200'
          }`}
        >
          {yVar.targetDirection === 'increase' && '↑'}
          {yVar.targetDirection === 'decrease' && '↓'}
          {yVar.targetDirection === 'optimize' && '◎'}
          {yVar.targetDirection === 'maintain' && '→'}
        </Badge>
      )}
    </div>
  );
}


// ============================================================================
// Client Overview Card
// ============================================================================

function ClientOverviewCard({
  client,
  onSelect,
  isSelected,
}: {
  client: ReturnType<typeof useClientSummaries>[0];
  onSelect: () => void;
  isSelected: boolean;
}) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return (
    <Card
      className={`p-6 cursor-pointer transition-all ${
        isSelected
          ? 'ring-2 ring-primary-500 bg-primary-50/50'
          : 'hover:shadow-lg hover:border-primary-200'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{client.logo}</span>
          <div>
            <h3 className="text-xl font-bold text-gray-900">{client.name}</h3>
            <p className="text-sm text-gray-500">Enterprise Client</p>
          </div>
        </div>
        <ChevronRight
          className={`w-5 h-5 transition-transform ${isSelected ? 'rotate-90 text-primary-600' : 'text-gray-400'}`}
        />
      </div>

      <Grid columns={2} gap="sm" className="mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Database className="w-4 h-4" />
            <span className="text-xs">Data Sources</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{client.dataSourceCount}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Layers className="w-4 h-4" />
            <span className="text-xs">Total Records</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(client.totalRecords)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Mutable Actions</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{client.xVariableCount}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-600 mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs">Optimizable Outcomes</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{client.yVariableCount}</p>
        </div>
      </Grid>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <Zap className="w-4 h-4 text-primary-500" />
          <span>{client.insightCount} Active Insights</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <Users className="w-4 h-4" />
          <span>{client.userCount} Users</span>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Main View
// ============================================================================

export function ClientsView() {
  const clientSummaries = useClientSummaries();
  const activeClient = useActiveClient();
  const dataSources = useClientDataSources();
  const xVariables = useClientXVariables();
  const yVariables = useClientYVariables();
  const insights = useClientInsights();
  const pipelineStats = useDataPipelineStats();

  const { setActiveClient, activeClientId, viewMode, setViewMode } = useClientStore();

  const [showAllSources, setShowAllSources] = useState(false);
  const [showAllVariables, setShowAllVariables] = useState(false);

  // Auto-select first client if none selected
  useEffect(() => {
    if (!activeClientId && clientSummaries.length > 0) {
      setActiveClient(clientSummaries[0].id);
    }
  }, [activeClientId, clientSummaries, setActiveClient]);

  const visibleSources = showAllSources ? dataSources : dataSources.slice(0, 6);
  const visibleXVars = showAllVariables ? xVariables : xVariables.slice(0, 8);
  const visibleYVars = yVariables.slice(0, 5);

  return (
    <PageLayout
      title="Enterprise Clients"
      actions={
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm">
            <Workflow className="w-4 h-4 mr-1" />
            {clientSummaries.length} Active Clients
          </Badge>
        </div>
      }
    >
      {/* Client Selection */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Grid columns={2} gap="lg">
          {clientSummaries.map((client) => (
            <ClientOverviewCard
              key={client.id}
              client={client}
              onSelect={() => setActiveClient(client.id)}
              isSelected={activeClientId === client.id}
            />
          ))}
        </Grid>
      </motion.div>

      {/* Selected Client Details */}
      {activeClient && (
        <motion.div
          key={activeClient.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Client Header */}
          <Card className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <div className="flex items-center gap-4 mb-4">
              <span className="text-5xl">{activeClient.logo}</span>
              <div>
                <h2 className="text-2xl font-bold">{activeClient.name}</h2>
                <p className="text-gray-300">{activeClient.description}</p>
              </div>
            </div>

            {/* Pipeline Stats */}
            <div className="grid grid-cols-4 gap-4 mt-6">
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-3xl font-bold">{pipelineStats.totalSources}</p>
                <p className="text-sm text-gray-300">Data Sources</p>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-3xl font-bold">
                  {pipelineStats.totalRecords >= 1000000
                    ? `${(pipelineStats.totalRecords / 1000000).toFixed(1)}M`
                    : `${(pipelineStats.totalRecords / 1000).toFixed(0)}K`}
                </p>
                <p className="text-sm text-gray-300">Total Records</p>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-3xl font-bold">{pipelineStats.activeCount}</p>
                <p className="text-sm text-gray-300">Active Pipelines</p>
              </div>
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-3xl font-bold">{insights.length}</p>
                <p className="text-sm text-gray-300">Causal Insights</p>
              </div>
            </div>
          </Card>

          {/* Partner Value Dashboard - Serif Impact Metrics (Human Edge Only) */}
          {activeClientId === 'human-edge' && (
          <Card className="p-6 border-2 border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Serif Impact Dashboard</h3>
                  <p className="text-sm text-slate-500">Human Edge pilot metrics since integration (6 weeks)</p>
                </div>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                Live Pilot
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Daily Opens */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Daily Opens</span>
                <p className="text-4xl font-bold text-slate-800 mt-2">4.1</p>
                <p className="text-xs text-slate-500 mt-1">opens per user per day</p>
              </div>

              {/* 30-Day Retention */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">30-Day Retention</span>
                <p className="text-4xl font-bold text-slate-800 mt-2">92%</p>
                <p className="text-xs text-slate-500 mt-1">of cohort active at day 30</p>
              </div>
            </div>
          </Card>
          )}

          {/* Partner Value Dashboard - Serif Impact Metrics (Habit Bandz Only) */}
          {activeClientId === 'habit-bandz' && (
          <Card className="p-6 border-2 border-violet-200 bg-gradient-to-br from-violet-50/50 to-white">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Serif Impact Dashboard</h3>
                  <p className="text-sm text-slate-500">Habit Bandz pilot metrics since integration (3 weeks)</p>
                </div>
              </div>
              <Badge className="bg-violet-100 text-violet-700 border-violet-200">
                <Clock className="w-3 h-3 mr-1" />
                Early Pilot
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Avg Streak Length */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Avg Streak Length</span>
                <p className="text-4xl font-bold text-slate-800 mt-2">11 days</p>
                <p className="text-xs text-slate-500 mt-1">across active users</p>
              </div>

              {/* 30-Day Retention */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">30-Day Retention</span>
                <p className="text-4xl font-bold text-slate-800 mt-2">78%</p>
                <p className="text-xs text-slate-500 mt-1">of cohort active at day 30</p>
              </div>
            </div>
          </Card>
          )}

          {/* Data Sources */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-primary-600" />
                Data Sources & Pipelines
              </h3>
              {dataSources.length > 6 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllSources(!showAllSources)}
                >
                  {showAllSources ? 'Show Less' : `Show All (${dataSources.length})`}
                </Button>
              )}
            </div>
            <Grid columns={3} gap="md">
              {visibleSources.map((source) => (
                <DataSourceCard key={source.id} source={source} />
              ))}
            </Grid>
          </div>

          {/* Variables: X → Y */}
          <div className="grid grid-cols-2 gap-8">
            {/* X Variables */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                    X
                  </span>
                  Mutable Actions ({xVariables.length})
                </h3>
                {xVariables.length > 8 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllVariables(!showAllVariables)}
                  >
                    {showAllVariables ? 'Show Less' : `Show All`}
                  </Button>
                )}
              </div>
              <Card className="p-4">
                <div className="space-y-2">
                  {visibleXVars.map((v) => (
                    <VariableCard key={v.id} variable={v} type="x" />
                  ))}
                  {!showAllVariables && xVariables.length > 8 && (
                    <p className="text-xs text-gray-400 text-center py-2">
                      +{xVariables.length - 8} more variables
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {/* Y Variables */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
                  Y
                </span>
                Optimizable Outcomes ({yVariables.length})
              </h3>
              <Card className="p-4">
                <div className="space-y-2">
                  {visibleYVars.map((v) => (
                    <VariableCard key={v.id} variable={v} type="y" />
                  ))}
                </div>
              </Card>
            </div>
          </div>

        </motion.div>
      )}
    </PageLayout>
  );
}

export default ClientsView;
