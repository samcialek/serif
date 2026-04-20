import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/utils/classNames';
import type { CGMReading } from '@/data/clients/userData';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';

interface CGMDayChartProps {
  readings: CGMReading[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
  className?: string;
}

interface DaySummary {
  date: string;
  readings: CGMReading[];
  avgGlucose: number;
  tir: number; // Time in range (70-140)
  cv: number; // Coefficient of variation
  min: number;
  max: number;
}

export function CGMDayChart({ readings, selectedDate: _selectedDate, onDateChange: _onDateChange, className }: CGMDayChartProps) {
  // Group readings by day
  const dayData = useMemo(() => {
    const byDay = new Map<string, CGMReading[]>();
    readings.forEach((r) => {
      const day = r.timestamp.split('T')[0];
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(r);
    });

    const summaries: DaySummary[] = [];
    byDay.forEach((dayReadings, date) => {
      const values = dayReadings.map((r) => r.glucose);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const inRange = values.filter((v) => v >= 70 && v <= 140).length;
      const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length);

      summaries.push({
        date,
        readings: dayReadings.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        avgGlucose: Math.round(avg),
        tir: Math.round((inRange / values.length) * 100),
        cv: Math.round((stdDev / avg) * 100),
        min: Math.min(...values),
        max: Math.max(...values),
      });
    });

    return summaries.sort((a, b) => b.date.localeCompare(a.date));
  }, [readings]);

  const [currentDayIndex, setCurrentDayIndex] = useState(0);
  const currentDay = dayData[currentDayIndex];

  if (!currentDay) {
    return (
      <div className={cn('bg-white rounded-xl border border-gray-100 p-6', className)}>
        <p className="text-gray-500 text-center">No CGM data available</p>
      </div>
    );
  }

  // Format for chart
  const chartData = currentDay.readings.map((r) => {
    const time = new Date(r.timestamp);
    return {
      time: time.getHours() + time.getMinutes() / 60,
      timeLabel: time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      glucose: r.glucose,
      trend: r.trend,
    };
  });

  const formattedDate = new Date(currentDay.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const canGoBack = currentDayIndex < dayData.length - 1;
  const canGoForward = currentDayIndex > 0;

  const getGlucoseColor = (glucose: number) => {
    if (glucose < 70) return '#EF4444'; // Low - red
    if (glucose > 140) return '#F59E0B'; // High - amber
    return '#10B981'; // In range - green
  };

  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Glucose Trace</h3>
              <p className="text-sm text-gray-500">{formattedDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDayIndex((i) => i + 1)}
              disabled={!canGoBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <span className="text-sm text-gray-500 min-w-[100px] text-center">
              Day {dayData.length - currentDayIndex} of {dayData.length}
            </span>
            <button
              onClick={() => setCurrentDayIndex((i) => i - 1)}
              disabled={!canGoForward}
              className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">TIR:</span>
          <span
            className={cn(
              'font-semibold',
              currentDay.tir >= 70 ? 'text-green-600' : currentDay.tir >= 50 ? 'text-amber-600' : 'text-red-600'
            )}
          >
            {currentDay.tir}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Avg:</span>
          <span className="font-semibold text-gray-900">{currentDay.avgGlucose} mg/dL</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">CV:</span>
          <span
            className={cn('font-semibold', currentDay.cv <= 36 ? 'text-green-600' : 'text-amber-600')}
          >
            {currentDay.cv}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Range:</span>
          <span className="font-semibold text-gray-900">
            {currentDay.min}-{currentDay.max} mg/dL
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366F1" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => `${Math.floor(v)}:00`}
              ticks={[0, 6, 12, 18, 24]}
              domain={[0, 24]}
              fontSize={12}
              stroke="#9CA3AF"
            />
            <YAxis domain={[50, 200]} ticks={[70, 100, 140, 180]} fontSize={12} stroke="#9CA3AF" />
            {/* Target range */}
            <ReferenceArea y1={70} y2={140} fill="#10B981" fillOpacity={0.1} />
            {/* Reference lines */}
            <ReferenceLine y={70} stroke="#10B981" strokeDasharray="3 3" />
            <ReferenceLine y={140} stroke="#10B981" strokeDasharray="3 3" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload[0]) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-white p-2 rounded-lg shadow-lg border border-gray-100 text-sm">
                    <p className="font-medium text-gray-900">{data.timeLabel}</p>
                    <p style={{ color: getGlucoseColor(data.glucose) }}>
                      <strong>{data.glucose}</strong> mg/dL
                    </p>
                    <p className="text-gray-500 text-xs capitalize">{data.trend.replace('_', ' ')}</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="glucose"
              stroke="#6366F1"
              strokeWidth={2}
              fill="url(#glucoseGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#6366F1', stroke: 'white', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-4 pb-4 flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-100 border border-green-300" />
          <span>Target range (70-140 mg/dL)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-primary-500" />
          <span>Glucose level</span>
        </div>
      </div>
    </div>
  );
}

export default CGMDayChart;
