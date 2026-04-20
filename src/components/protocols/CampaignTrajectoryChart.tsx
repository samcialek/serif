import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { CampaignTrajectoryPoint } from '@/types'

interface CampaignTrajectoryChartProps {
  trajectory: CampaignTrajectoryPoint[]
  goalValue: number
  currentWeek?: number
  currentUnit: string
  height?: number
}

export function CampaignTrajectoryChart({
  trajectory,
  goalValue,
  currentWeek,
  currentUnit,
  height = 200,
}: CampaignTrajectoryChartProps) {
  if (!trajectory || trajectory.length === 0) return null

  const data = trajectory.map((point) => ({
    week: point.weekNumber,
    expected: point.expectedValue,
    rangeLow: point.rangeLow,
    rangeHigh: point.rangeHigh,
    label: point.label,
    // For the area band
    range: [point.rangeLow, point.rangeHigh],
  }))

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            label={{ value: 'Week', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#94a3b8' }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            label={{ value: currentUnit, angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#94a3b8' }}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '11px',
              padding: '8px 12px',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'expected') return [`${value} ${currentUnit}`, 'Expected']
              if (name === 'rangeHigh') return [`${value} ${currentUnit}`, 'High']
              if (name === 'rangeLow') return [`${value} ${currentUnit}`, 'Low']
              return [value, name]
            }}
            labelFormatter={(label) => `Week ${label}`}
          />

          {/* Confidence band */}
          <Area
            type="monotone"
            dataKey="rangeHigh"
            stackId="range"
            stroke="none"
            fill="transparent"
          />
          <Area
            type="monotone"
            dataKey="rangeLow"
            stackId="range-base"
            stroke="none"
            fill="transparent"
          />
          {/* Custom confidence band using two overlapping areas */}
          <Area
            type="monotone"
            dataKey="rangeHigh"
            stroke="none"
            fill="#5ba8d4"
            fillOpacity={0.1}
          />
          <Area
            type="monotone"
            dataKey="rangeLow"
            stroke="none"
            fill="#ffffff"
            fillOpacity={0.8}
          />

          {/* Main trajectory line */}
          <Area
            type="monotone"
            dataKey="expected"
            stroke="#5ba8d4"
            strokeWidth={2}
            fill="#5ba8d4"
            fillOpacity={0.08}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, payload } = props as { cx: number; cy: number; payload: { label?: string } }
              if (!payload.label) return <circle key={`dot-${cx}`} cx={0} cy={0} r={0} fill="none" />
              return (
                <circle
                  key={`dot-${cx}`}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="#5ba8d4"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )
            }}
          />

          {/* Goal line */}
          <ReferenceLine
            y={goalValue}
            stroke="#10b981"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: `Goal: ${goalValue}`,
              position: 'right',
              fontSize: 10,
              fill: '#10b981',
            }}
          />

          {/* Current week indicator */}
          {currentWeek !== undefined && (
            <ReferenceLine
              x={currentWeek}
              stroke="#f59e0b"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: 'Now',
                position: 'top',
                fontSize: 10,
                fill: '#f59e0b',
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
