import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/utils/classNames';
import { MetricSparkline } from './MetricSparkline';

interface KeyMetricCardProps {
  name: string;
  value: number;
  unit: string;
  change: number;
  changeDirection: 'up' | 'down' | 'stable';
  isGood: boolean;
  sparklineData: number[];
  period: string;
  className?: string;
}

export function KeyMetricCard({
  name,
  value,
  unit,
  change,
  changeDirection,
  isGood,
  sparklineData,
  period,
  className,
}: KeyMetricCardProps) {
  const TrendIcon =
    changeDirection === 'up' ? TrendingUp : changeDirection === 'down' ? TrendingDown : Minus;

  const trendColor = isGood
    ? 'text-green-600 bg-green-50'
    : changeDirection === 'stable'
      ? 'text-gray-600 bg-gray-50'
      : 'text-red-600 bg-red-50';

  const sparklineColor = isGood ? '#10B981' : changeDirection === 'stable' ? '#6B7280' : '#EF4444';

  return (
    <div className={cn('bg-white rounded-xl p-4 border border-gray-100', className)}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-gray-500">{name}</span>
        <div className={cn('flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium', trendColor)}>
          <TrendIcon className="w-3 h-3" />
          {changeDirection !== 'stable' && (
            <span>
              {change > 0 ? '+' : ''}
              {typeof change === 'number' && change % 1 !== 0 ? change.toFixed(1) : change}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900">
            {typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}
          </span>
          <span className="text-sm text-gray-500 ml-1">{unit}</span>
        </div>
        <MetricSparkline data={sparklineData} color={sparklineColor} width={60} height={20} showDots />
      </div>

      <p className="text-xs text-gray-400 mt-2">{period} trend</p>
    </div>
  );
}

export default KeyMetricCard;
