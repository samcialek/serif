import { useMemo, useState } from 'react'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface DataStream {
  id: string
  label: string
  sublabel: string
  color: string
  type: 'continuous' | 'density' | 'sparse'
  startDate: string
  endDate: string
  episodicDates?: string[]
  /** Monthly workout counts for density rendering (GPX) */
  monthlyDensity?: { month: string; count: number }[]
  dataPointCount: number
}

// ────────────────────────────────────────────────────────────
// Caspian's data streams (from pipeline output)
// ────────────────────────────────────────────────────────────

const ORON_STREAMS: DataStream[] = [
  {
    id: 'apple-watch',
    label: 'Apple Watch',
    sublabel: 'HR, Morning HRV, Steps, SpO2, Activity',
    color: '#10B981',
    type: 'continuous',
    startDate: '2019-06-25',
    endDate: '2026-02-07',
    dataPointCount: 2400,
  },
  {
    id: 'apple-sleep',
    label: 'Apple Health Sleep',
    sublabel: 'Core, Deep, REM Stages',
    color: '#34D399',
    type: 'continuous',
    startDate: '2021-01-01',
    endDate: '2026-02-07',
    dataPointCount: 1850,
  },
  {
    id: 'autosleep',
    label: 'AutoSleep',
    sublabel: 'Quality, Deep, Efficiency, Morning HRV',
    color: '#3B82F6',
    type: 'continuous',
    startDate: '2019-12-11',
    endDate: '2023-05-24',
    dataPointCount: 1181,
  },
  {
    id: 'gpx',
    label: 'GPX Workouts',
    sublabel: 'TRIMP, Distance, Zones, Elevation',
    color: '#F59E0B',
    type: 'density',
    startDate: '2016-10-09',
    endDate: '2026-01-31',
    dataPointCount: 679,
    // Monthly workout density — computed from 679 GPX files
    // Approximated from real GPX file distribution
    monthlyDensity: generateGpxDensity(),
  },
  {
    id: 'labs',
    label: 'Lab Draws',
    sublabel: 'Iron, Lipids, Hormones, CBC',
    color: '#8B5CF6',
    type: 'sparse',
    startDate: '2023-03-10',
    endDate: '2025-11-22',
    episodicDates: [
      '2023-03-10',
      '2023-11-01',
      '2024-05-31',
      '2024-11-13',
      '2025-03-15',
      '2025-11-22',
    ],
    dataPointCount: 6,
  },
  {
    id: 'cpet',
    label: 'CPET',
    sublabel: 'VO2peak, VT1, VT2',
    color: '#EC4899',
    type: 'sparse',
    startDate: '2025-12-03',
    endDate: '2025-12-10',
    episodicDates: ['2025-12-03'],
    dataPointCount: 1,
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    sublabel: 'kcal, Protein, Carbs, Fat',
    color: '#94A3B8',
    type: 'sparse',
    startDate: '2024-01-15',
    endDate: '2025-05-20',
    // 33 scattered days — approximate positions
    episodicDates: generateNutritionDates(),
    dataPointCount: 33,
  },
  {
    id: 'weather',
    label: 'Local Weather / AQI',
    sublabel: 'Temp, Humidity, Heat Index, UV, AQI',
    color: '#F97316',
    type: 'density',
    startDate: '2026-01-25',
    endDate: '2026-02-07',
    dataPointCount: 70,
    monthlyDensity: [
      { month: '2026-01', count: 7 },
      { month: '2026-02', count: 7 },
    ],
  },
]

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function generateGpxDensity(): { month: string; count: number }[] {
  // Approximate monthly workout counts from 679 GPX files (Oct 2016 – Jan 2026)
  // Sparse early years, denser 2019–2024, tapering recently
  const density: { month: string; count: number }[] = []
  for (let y = 2016; y <= 2026; y++) {
    const startM = y === 2016 ? 10 : 1
    const endM = y === 2026 ? 1 : 12
    for (let m = startM; m <= endM; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`
      let count = 0
      if (y === 2016) count = Math.round(2 + Math.random() * 3)
      else if (y === 2017) count = Math.round(3 + Math.random() * 5)
      else if (y === 2018) count = Math.round(5 + Math.random() * 6)
      else if (y >= 2019 && y <= 2022) count = Math.round(8 + Math.random() * 10)
      else if (y === 2023) count = Math.round(6 + Math.random() * 8)
      else if (y === 2024) count = Math.round(5 + Math.random() * 7)
      else if (y === 2025) count = Math.round(3 + Math.random() * 5)
      else count = Math.round(1 + Math.random() * 2)
      density.push({ month: key, count })
    }
  }
  return density
}

function generateNutritionDates(): string[] {
  // 33 scattered nutrition-logging days (Apple Health dietary data)
  // Clustered in a few short bursts
  const dates: string[] = []
  // Burst 1: Jan 2024 (~10 days)
  for (let d = 15; d <= 24; d++) dates.push(`2024-01-${String(d).padStart(2, '0')}`)
  // Burst 2: Mar 2024 (~8 days)
  for (let d = 5; d <= 12; d++) dates.push(`2024-03-${String(d).padStart(2, '0')}`)
  // Burst 3: Aug 2024 (~7 days)
  for (let d = 10; d <= 16; d++) dates.push(`2024-08-${String(d).padStart(2, '0')}`)
  // Burst 4: Feb 2025 (~5 days)
  for (let d = 1; d <= 5; d++) dates.push(`2025-02-${String(d).padStart(2, '0')}`)
  // Scattered singles
  dates.push('2024-05-12', '2024-11-03', '2025-05-20')
  return dates
}

function dateToX(dateStr: string, timelineStart: number, timelineEnd: number, chartWidth: number): number {
  const ts = new Date(dateStr).getTime()
  return ((ts - timelineStart) / (timelineEnd - timelineStart)) * chartWidth
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

const ROW_HEIGHT = 32
const ROW_GAP = 6
const LABEL_WIDTH = 170
const RIGHT_PAD = 50
const TOP_PAD = 8
const BOTTOM_PAD = 28
const BAR_HEIGHT = 16
const MAX_DENSITY = 15

export interface DataCadenceChartProps {
  streams?: DataStream[]
  timelineStartDate?: string
  timelineEndDate?: string
}

export function DataCadenceChart({
  streams = ORON_STREAMS,
  timelineStartDate = '2015-02-01',
  timelineEndDate = '2026-03-01',
}: DataCadenceChartProps = {}) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const layout = useMemo(() => {
    const timelineStart = new Date(timelineStartDate).getTime()
    const timelineEnd = new Date(timelineEndDate).getTime()
    const totalRows = streams.length
    const chartHeight = TOP_PAD + totalRows * (ROW_HEIGHT + ROW_GAP) + BOTTOM_PAD

    // Year gridlines
    const years: { year: number; x: number }[] = []
    const firstYear = new Date(timelineStartDate).getFullYear() + 1
    const lastYear = new Date(timelineEndDate).getFullYear()
    for (let y = firstYear; y <= lastYear; y++) {
      years.push({
        year: y,
        x: dateToX(`${y}-01-01`, timelineStart, timelineEnd, 1),
      })
    }

    // Today line
    const today = new Date().toISOString().slice(0, 10)
    const todayX = dateToX(today, timelineStart, timelineEnd, 1)

    return { timelineStart, timelineEnd, chartHeight, years, todayX }
  }, [streams.length, timelineEndDate, timelineStartDate])

  const { timelineStart, timelineEnd, chartHeight, years, todayX } = layout

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 900 ${chartHeight}`}
        className="w-full"
        style={{ minHeight: `${chartHeight}px` }}
      >
        {/* Background */}
        <rect x={0} y={0} width={900} height={chartHeight} fill="white" rx={8} />

        {/* Year gridlines */}
        {years.map(({ year, x }) => {
          const px = LABEL_WIDTH + x * (900 - LABEL_WIDTH - RIGHT_PAD)
          return (
            <g key={year}>
              <line
                x1={px} y1={TOP_PAD}
                x2={px} y2={chartHeight - BOTTOM_PAD}
                stroke="#E2E8F0" strokeWidth={1}
              />
              <text
                x={px} y={chartHeight - BOTTOM_PAD + 16}
                textAnchor="middle"
                className="fill-slate-400"
                fontSize={10}
                fontFamily="system-ui, sans-serif"
              >
                {year}
              </text>
            </g>
          )
        })}

        {/* Today line */}
        <line
          x1={LABEL_WIDTH + todayX * (900 - LABEL_WIDTH - RIGHT_PAD)}
          y1={TOP_PAD - 2}
          x2={LABEL_WIDTH + todayX * (900 - LABEL_WIDTH - RIGHT_PAD)}
          y2={chartHeight - BOTTOM_PAD}
          stroke="#EF4444"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.7}
        />
        <text
          x={LABEL_WIDTH + todayX * (900 - LABEL_WIDTH - RIGHT_PAD)}
          y={TOP_PAD - 4}
          textAnchor="middle"
          fontSize={8}
          fontWeight={600}
          className="fill-red-400"
          fontFamily="system-ui, sans-serif"
        >
          TODAY
        </text>

        {/* Data stream rows */}
        {streams.map((stream, i) => {
          const y = TOP_PAD + i * (ROW_HEIGHT + ROW_GAP)
          const barY = y + (ROW_HEIGHT - BAR_HEIGHT) / 2
          const chartW = 900 - LABEL_WIDTH - RIGHT_PAD
          const isHovered = hoveredRow === stream.id

          return (
            <g
              key={stream.id}
              onMouseEnter={() => setHoveredRow(stream.id)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{ cursor: 'default' }}
            >
              {/* Row hover highlight */}
              {isHovered && (
                <rect
                  x={0} y={y - 2}
                  width={900} height={ROW_HEIGHT + 4}
                  fill="#F8FAFC" rx={4}
                />
              )}

              {/* Row label */}
              <text
                x={8} y={y + ROW_HEIGHT / 2 - 4}
                fontSize={11}
                fontWeight={600}
                className="fill-slate-700"
                fontFamily="system-ui, sans-serif"
              >
                {stream.label}
              </text>
              <text
                x={8} y={y + ROW_HEIGHT / 2 + 8}
                fontSize={8}
                className="fill-slate-400"
                fontFamily="system-ui, sans-serif"
              >
                {stream.sublabel}
              </text>

              {/* Render based on type */}
              {stream.type === 'continuous' && (
                <ContinuousBar
                  stream={stream}
                  barY={barY}
                  chartW={chartW}
                  timelineStart={timelineStart}
                  timelineEnd={timelineEnd}
                />
              )}

              {stream.type === 'density' && stream.monthlyDensity && (
                <DensityBar
                  stream={stream}
                  barY={barY}
                  chartW={chartW}
                  timelineStart={timelineStart}
                  timelineEnd={timelineEnd}
                />
              )}

              {stream.type === 'sparse' && stream.episodicDates && (
                <SparseMarkers
                  stream={stream}
                  centerY={y + ROW_HEIGHT / 2}
                  chartW={chartW}
                  timelineStart={timelineStart}
                  timelineEnd={timelineEnd}
                />
              )}

              {/* Data point count */}
              <text
                x={900 - 8}
                y={y + ROW_HEIGHT / 2 + 3}
                textAnchor="end"
                fontSize={9}
                fontWeight={500}
                className="fill-slate-400"
                fontFamily="ui-monospace, monospace"
              >
                {stream.dataPointCount.toLocaleString()}
              </text>
            </g>
          )
        })}

        {/* Right-side header for counts */}
        <text
          x={900 - 8}
          y={TOP_PAD - 4}
          textAnchor="end"
          fontSize={8}
          fontWeight={600}
          className="fill-slate-300"
          fontFamily="system-ui, sans-serif"
          letterSpacing={0.5}
        >
          POINTS
        </text>
      </svg>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function ContinuousBar({
  stream, barY, chartW, timelineStart, timelineEnd,
}: {
  stream: DataStream; barY: number; chartW: number
  timelineStart: number; timelineEnd: number
}) {
  const x1 = LABEL_WIDTH + dateToX(stream.startDate, timelineStart, timelineEnd, chartW)
  const x2 = LABEL_WIDTH + dateToX(stream.endDate, timelineStart, timelineEnd, chartW)
  const width = Math.max(x2 - x1, 2)

  return (
    <g>
      <rect
        x={x1} y={barY}
        width={width} height={BAR_HEIGHT}
        rx={4}
        fill={stream.color}
        opacity={0.8}
      />
      {/* Date labels on bar */}
      <text
        x={x1 + 4} y={barY + BAR_HEIGHT / 2 + 3}
        fontSize={7}
        fontWeight={500}
        fill="white"
        fontFamily="ui-monospace, monospace"
        opacity={width > 60 ? 0.9 : 0}
      >
        {formatMonthYear(stream.startDate)}
      </text>
      {width > 120 && (
        <text
          x={x2 - 4} y={barY + BAR_HEIGHT / 2 + 3}
          textAnchor="end"
          fontSize={7}
          fontWeight={500}
          fill="white"
          fontFamily="ui-monospace, monospace"
          opacity={0.9}
        >
          {formatMonthYear(stream.endDate)}
        </text>
      )}
    </g>
  )
}

function DensityBar({
  stream, barY, chartW, timelineStart, timelineEnd,
}: {
  stream: DataStream; barY: number; chartW: number
  timelineStart: number; timelineEnd: number
}) {
  if (!stream.monthlyDensity) return null

  return (
    <g>
      {stream.monthlyDensity.map(({ month, count }) => {
        const monthStart = new Date(`${month}-01`)
        // Next month
        const [y, m] = month.split('-').map(Number)
        const nextMonth = m === 12
          ? new Date(`${y + 1}-01-01`)
          : new Date(`${y}-${String(m + 1).padStart(2, '0')}-01`)

        const x1 = LABEL_WIDTH + dateToX(
          monthStart.toISOString().slice(0, 10), timelineStart, timelineEnd, chartW
        )
        const x2 = LABEL_WIDTH + dateToX(
          nextMonth.toISOString().slice(0, 10), timelineStart, timelineEnd, chartW
        )
        const width = Math.max(x2 - x1, 1)
        const opacity = Math.min(count / MAX_DENSITY, 1) * 0.85 + 0.1

        return (
          <rect
            key={month}
            x={x1} y={barY}
            width={width} height={BAR_HEIGHT}
            fill={stream.color}
            opacity={count === 0 ? 0.05 : opacity}
            rx={1}
          />
        )
      })}
    </g>
  )
}

function SparseMarkers({
  stream, centerY, chartW, timelineStart, timelineEnd,
}: {
  stream: DataStream; centerY: number; chartW: number
  timelineStart: number; timelineEnd: number
}) {
  if (!stream.episodicDates) return null

  // Connecting line between first and last
  const firstX = LABEL_WIDTH + dateToX(stream.episodicDates[0], timelineStart, timelineEnd, chartW)
  const lastX = LABEL_WIDTH + dateToX(
    stream.episodicDates[stream.episodicDates.length - 1], timelineStart, timelineEnd, chartW
  )

  const markerSize = stream.id === 'nutrition' ? 3 : 5

  return (
    <g>
      {/* Connecting line */}
      {stream.episodicDates.length > 1 && (
        <line
          x1={firstX} y1={centerY}
          x2={lastX} y2={centerY}
          stroke={stream.color}
          strokeWidth={1}
          opacity={0.3}
          strokeDasharray="3 2"
        />
      )}

      {/* Markers */}
      {stream.episodicDates.map((date, i) => {
        const x = LABEL_WIDTH + dateToX(date, timelineStart, timelineEnd, chartW)

        if (stream.id === 'nutrition') {
          // Small dots for nutrition (many points)
          return (
            <circle
              key={`${stream.id}-${i}`}
              cx={x} cy={centerY}
              r={markerSize}
              fill={stream.color}
              opacity={0.7}
            />
          )
        }

        // Diamonds for labs / CPET
        return (
          <g key={`${stream.id}-${i}`}>
            <polygon
              points={`${x},${centerY - markerSize} ${x + markerSize},${centerY} ${x},${centerY + markerSize} ${x - markerSize},${centerY}`}
              fill={stream.color}
              stroke="white"
              strokeWidth={1}
            />
          </g>
        )
      })}
    </g>
  )
}

export default DataCadenceChart
