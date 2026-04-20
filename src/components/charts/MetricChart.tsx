import { forwardRef, useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts'
import { cn } from '@/utils/classNames'
import { formatDate, formatDateShort } from '@/utils/formatters'

export interface MetricChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: { date: string; value: number; event?: string }[]
  height?: number
  color?: string
  showGrid?: boolean
  showDots?: boolean
  showArea?: boolean
  showEvents?: boolean
  referenceValue?: number
  referenceLabel?: string
  yAxisDomain?: [number | 'auto', number | 'auto']
  valueFormatter?: (value: number) => string
  dateFormatter?: (date: string) => string
}

const CustomTooltip = ({
  active,
  payload,
  valueFormatter,
}: {
  active?: boolean
  payload?: any[]
  valueFormatter?: (value: number) => string
}) => {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  const value = data.value

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-900">
        {valueFormatter ? valueFormatter(value) : value}
      </p>
      <p className="text-gray-500">{formatDate(data.date)}</p>
      {data.event && (
        <p className="text-xs text-amber-600 mt-1">{data.event}</p>
      )}
    </div>
  )
}

export const MetricChart = forwardRef<HTMLDivElement, MetricChartProps>(
  (
    {
      className,
      data,
      height = 200,
      color = '#6366f1',
      showGrid = true,
      showDots = false,
      showArea = false,
      showEvents = true,
      referenceValue,
      referenceLabel,
      yAxisDomain = ['auto', 'auto'],
      valueFormatter,
      dateFormatter = formatDateShort,
      ...props
    },
    ref
  ) => {
    // Process data to add event markers
    const processedData = useMemo(() => {
      return data.map((d) => ({
        ...d,
        hasEvent: showEvents && !!d.event,
      }))
    }, [data, showEvents])

    // Calculate domain with padding
    const domain = useMemo(() => {
      const values = data.map((d) => d.value).filter((v) => !isNaN(v))
      const min = Math.min(...values)
      const max = Math.max(...values)
      const padding = (max - min) * 0.1

      return [
        yAxisDomain[0] === 'auto' ? Math.floor(min - padding) : yAxisDomain[0],
        yAxisDomain[1] === 'auto' ? Math.ceil(max + padding) : yAxisDomain[1],
      ]
    }, [data, yAxisDomain])

    const ChartComponent = showArea ? ComposedChart : LineChart

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        <ResponsiveContainer width="100%" height={height}>
          <ChartComponent data={processedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            )}
            <XAxis
              dataKey="date"
              tickFormatter={dateFormatter}
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              domain={domain}
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={valueFormatter}
            />
            <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} />} />

            {referenceValue !== undefined && (
              <ReferenceLine
                y={referenceValue}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: referenceLabel || `Target: ${referenceValue}`,
                  position: 'right',
                  fill: '#f59e0b',
                  fontSize: 11,
                }}
              />
            )}

            {showArea && (
              <Area
                type="monotone"
                dataKey="value"
                fill={color}
                fillOpacity={0.1}
                stroke="none"
              />
            )}

            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={showDots ? { fill: color, r: 3 } : false}
              activeDot={{ fill: color, r: 5, strokeWidth: 2, stroke: '#fff' }}
            />

            {/* Event markers */}
            {showEvents &&
              processedData
                .filter((d) => d.hasEvent)
                .map((d, i) => (
                  <ReferenceLine
                    key={i}
                    x={d.date}
                    stroke="#f59e0b"
                    strokeDasharray="2 2"
                    strokeOpacity={0.5}
                  />
                ))}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    )
  }
)

MetricChart.displayName = 'MetricChart'

// Mini sparkline variant
export interface SparklineProps extends React.HTMLAttributes<HTMLDivElement> {
  data: number[]
  color?: string
  height?: number
  showRange?: boolean
}

export const Sparkline = forwardRef<HTMLDivElement, SparklineProps>(
  ({ className, data, color = '#6366f1', height = 40, showRange = false, ...props }, ref) => {
    const chartData = useMemo(() => {
      return data.map((value, index) => ({ index, value }))
    }, [data])

    const min = Math.min(...data)
    const max = Math.max(...data)

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {showRange && (
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{min}</span>
            <span>{max}</span>
          </div>
        )}
      </div>
    )
  }
)

Sparkline.displayName = 'Sparkline'

// Multi-metric overlay chart
export interface MultiMetricChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: { date: string; [key: string]: number | string }[]
  metrics: { key: string; color: string; label: string }[]
  height?: number
}

export const MultiMetricChart = forwardRef<HTMLDivElement, MultiMetricChartProps>(
  ({ className, data, metrics, height = 250, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateShort}
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload) return null
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                    <p className="text-xs text-gray-500 mb-2">
                      {formatDate(payload[0]?.payload?.date)}
                    </p>
                    {payload.map((entry: any) => {
                      const metric = metrics.find((m) => m.key === entry.dataKey)
                      return (
                        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-gray-600">{metric?.label}:</span>
                          <span className="font-medium">{entry.value}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              }}
            />
            {metrics.map((metric) => (
              <Line
                key={metric.key}
                type="monotone"
                dataKey={metric.key}
                stroke={metric.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-center gap-2 text-sm">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: metric.color }}
              />
              <span className="text-gray-600">{metric.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
)

MultiMetricChart.displayName = 'MultiMetricChart'

export default MetricChart
