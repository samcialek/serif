import { useMemo, useState } from 'react';
import { Target, Lightbulb, CheckCircle2, AlertCircle, Info, Code2 } from 'lucide-react';
import { cn } from '@/utils/classNames';
import type { PersonalInsight } from '@/data/clients/userData';
import { DataInspector } from './DataInspector';
import { getInsightInspectorData } from '@/data/clients/samplePayloads';

interface PersonalInsightCardProps {
  insight: PersonalInsight;
  compact?: boolean;
  className?: string;
}

// Color scheme for curve types
const curveColors = {
  plateau_up: { line: '#10B981', fill: 'rgba(16, 185, 129, 0.15)', bg: 'bg-green-50', text: 'text-green-700' },
  plateau_down: { line: '#EF4444', fill: 'rgba(239, 68, 68, 0.15)', bg: 'bg-red-50', text: 'text-red-700' },
  v_min: { line: '#06B6D4', fill: 'rgba(6, 182, 212, 0.15)', bg: 'bg-cyan-50', text: 'text-cyan-700' },
  v_max: { line: '#8B5CF6', fill: 'rgba(139, 92, 246, 0.15)', bg: 'bg-purple-50', text: 'text-purple-700' },
  linear: { line: '#6B7280', fill: 'rgba(107, 114, 128, 0.15)', bg: 'bg-gray-50', text: 'text-gray-700' },
};

// Generate mini curve SVG
function MiniDoseResponseCurve({
  curveType,
  currentXPercent,
  thetaXPercent = 0.5,
  color,
}: {
  curveType: PersonalInsight['curveType'];
  currentXPercent: number;
  thetaXPercent?: number;
  color: { line: string; fill: string };
}) {
  const width = 180;
  const height = 80;
  const padding = 12;

  const generatePath = () => {
    const w = width - padding * 2;
    const h = height - padding * 2;
    const startX = padding;
    const startY = height - padding;
    const endX = width - padding;
    const endY = padding;
    const midX = width / 2;

    switch (curveType) {
      case 'plateau_up':
        return `M ${startX} ${startY} Q ${startX + w * 0.3} ${startY - h * 0.3} ${midX} ${startY - h * 0.75} L ${endX} ${startY - h * 0.75}`;
      case 'plateau_down':
        return `M ${startX} ${endY + h * 0.25} L ${midX} ${endY + h * 0.25} Q ${midX + w * 0.2} ${endY + h * 0.35} ${endX} ${startY}`;
      case 'v_min':
        return `M ${startX} ${endY + h * 0.2} Q ${startX + w * 0.25} ${startY - h * 0.1} ${midX} ${startY - h * 0.1} Q ${midX + w * 0.25} ${startY - h * 0.1} ${endX} ${endY + h * 0.2}`;
      case 'v_max':
        return `M ${startX} ${startY - h * 0.2} Q ${startX + w * 0.25} ${endY + h * 0.1} ${midX} ${endY + h * 0.1} Q ${midX + w * 0.25} ${endY + h * 0.1} ${endX} ${startY - h * 0.2}`;
      default:
        return `M ${startX} ${startY} L ${endX} ${endY}`;
    }
  };

  const getYOnCurve = (xPct: number) => {
    const h = height - padding * 2;
    const startY = height - padding;
    const endY = padding;

    switch (curveType) {
      case 'plateau_up':
        return xPct < 0.5 ? startY - xPct * 2 * h * 0.75 : startY - h * 0.75;
      case 'plateau_down':
        return xPct < 0.5 ? endY + h * 0.25 : endY + h * 0.25 + (xPct - 0.5) * 2 * h * 0.5;
      case 'v_min': {
        const dist = Math.abs(xPct - 0.5) * 2;
        return startY - h * 0.1 - dist * h * 0.6;
      }
      case 'v_max': {
        const dist2 = Math.abs(xPct - 0.5) * 2;
        return endY + h * 0.1 + dist2 * h * 0.6;
      }
      default:
        return startY - xPct * h;
    }
  };

  const path = generatePath();
  const thetaX = padding + (width - padding * 2) * thetaXPercent;
  const thetaY = getYOnCurve(thetaXPercent);
  const currentX = padding + (width - padding * 2) * currentXPercent;
  const currentY = getYOnCurve(currentXPercent);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Fill */}
      <path
        d={`${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`}
        fill={color.fill}
      />
      {/* Line */}
      <path d={path} fill="none" stroke={color.line} strokeWidth="2" strokeLinecap="round" />
      {/* Threshold line */}
      <line
        x1={thetaX}
        y1={padding}
        x2={thetaX}
        y2={height - padding}
        stroke={color.line}
        strokeWidth="1"
        strokeDasharray="3 2"
        opacity={0.6}
      />
      {/* Threshold point */}
      <circle cx={thetaX} cy={thetaY} r="4" fill={color.line} />
      <circle cx={thetaX} cy={thetaY} r="2" fill="white" />
      {/* Current value marker */}
      <circle cx={currentX} cy={currentY} r="5" fill="#F59E0B" stroke="white" strokeWidth="2" />
    </svg>
  );
}

export function PersonalInsightCard({ insight, compact = false, className }: PersonalInsightCardProps) {
  const colors = curveColors[insight.curveType];
  const [showInspector, setShowInspector] = useState(false);

  // Get inspector data for this insight
  const inspectorData = useMemo(() => getInsightInspectorData(insight.id), [insight.id]);

  // Calculate current position as percentage of range
  const currentXPercent = useMemo(() => {
    const range = insight.theta.value * 0.6;
    const min = insight.theta.value - range;
    const max = insight.theta.value + range;
    const normalized = (insight.currentValue - min) / (max - min);
    return Math.max(0.05, Math.min(0.95, normalized));
  }, [insight.currentValue, insight.theta.value]);

  const statusConfig: Record<string, { icon: typeof AlertCircle; label: string; color: string }> = {
    below_optimal: {
      icon: AlertCircle,
      label: 'Below Optimal',
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    at_optimal: {
      icon: CheckCircle2,
      label: 'At Optimal',
      color: 'text-green-600 bg-green-50 border-green-200',
    },
    above_optimal: {
      icon: AlertCircle,
      label: 'Above Optimal',
      color: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    below_threshold: {
      icon: AlertCircle,
      label: 'Below θ',
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    above_threshold: {
      icon: AlertCircle,
      label: 'Above θ',
      color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
  };

  const status = statusConfig[insight.currentStatus] ?? statusConfig.at_optimal;
  const StatusIcon = status.icon;

  if (compact) {
    return (
      <div className={cn('bg-white rounded-lg border border-gray-100 p-4', className)}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h4 className="font-semibold text-gray-900">{insight.title}</h4>
            <p className="text-sm text-gray-500">{insight.subtitle}</p>
          </div>
          <div className={cn('px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1', status.color)}>
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Current:</span>
          <span className="font-mono font-medium">
            {insight.currentValue} {insight.currentUnit}
          </span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">
            {insight.personalDataPct}% your data
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', colors.bg)}>
              <Target className={cn('w-5 h-5', colors.text)} />
            </div>
            <div>
              <h4 className="font-semibold text-gray-900">{insight.title}</h4>
              <p className="text-sm text-primary-600">{insight.subtitle}</p>
            </div>
          </div>
          <div className={cn('px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border', status.color)}>
            <StatusIcon className="w-3.5 h-3.5" />
            {status.label}
          </div>
        </div>
      </div>

      {/* Curve + Parameters */}
      <div className="p-4 flex gap-4">
        <div className="flex-shrink-0">
          <MiniDoseResponseCurve
            curveType={insight.curveType}
            currentXPercent={currentXPercent}
            color={colors}
          />
        </div>
        <div className="flex-1 space-y-3">
          {/* Theta */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Your threshold (&#952;)</span>
            <span className={cn('font-mono font-semibold', colors.text)}>
              {insight.theta.displayValue}
            </span>
          </div>
          {/* Beta below */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Below &#952;</span>
            <span className="font-mono text-gray-700">{insight.betaBelow.description}</span>
          </div>
          {/* Beta above */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Above &#952;</span>
            <span className="font-mono text-gray-700">{insight.betaAbove.description}</span>
          </div>
          {/* Current */}
          <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
            <span className="text-gray-500">Current value</span>
            <span className="font-mono font-semibold text-amber-600">
              {insight.currentValue} {insight.currentUnit}
            </span>
          </div>
        </div>
      </div>

      {/* Evidence Bar */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-primary-500"
              style={{ width: `${insight.personalDataPct}%` }}
            />
            <div
              className="h-full bg-gray-300"
              style={{ width: `${insight.populationDataPct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            <strong>{insight.personalDataPct}%</strong> your data |{' '}
            <strong>{insight.populationDataPct}%</strong> population
          </span>
          <span>n = {insight.observations} observations</span>
        </div>
      </div>

      {/* Actionable Advice */}
      <div className="px-4 pb-4">
        <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
          <Lightbulb className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{insight.actionableAdvice}</p>
        </div>
      </div>

      {/* Footer with View Data button */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Info className="w-3 h-3" />
          <span>Based on {insight.daysOfData} days of your data</span>
        </div>
        {inspectorData && (
          <button
            onClick={() => setShowInspector(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-primary-600 bg-gray-50 hover:bg-primary-50 rounded-md border border-gray-200 hover:border-primary-200 transition-colors"
          >
            <Code2 className="w-3.5 h-3.5" />
            View Data
          </button>
        )}
      </div>

      {/* Data Inspector Modal */}
      {inspectorData && (
        <DataInspector
          isOpen={showInspector}
          onClose={() => setShowInspector(false)}
          data={inspectorData}
          title={insight.title}
        />
      )}
    </div>
  );
}

export default PersonalInsightCard;
