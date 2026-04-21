/**
 * Live weather panel. Pulled from Open-Meteo for the active participant's
 * residence. This is the only integration in the catalog that actually
 * fetches real external data.
 */

import { CloudSun, Thermometer, Droplets, Gauge, Sun, Wind } from 'lucide-react'
import { cn } from '@/utils/classNames'
import { useWeather, weatherCodeLabel } from '@/hooks/useWeather'

interface WeatherWidgetProps {
  className?: string
}

export function WeatherWidget({ className }: WeatherWidgetProps) {
  const { data, loading, error } = useWeather()

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-sky-300 bg-gradient-to-br from-sky-50 to-white p-4',
        className,
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
          <CloudSun className="w-5 h-5 text-sky-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800 text-sm">Weather</p>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Open-Meteo · {data?.city ?? 'residence'}
            {data?.country ? `, ${data.country}` : ''}
          </p>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-500">Fetching current conditions…</p>
      )}

      {error && (
        <p className="text-xs text-rose-600">Could not reach Open-Meteo: {error}</p>
      )}

      {data && (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-bold text-slate-800 tabular-nums">
              {Math.round(data.temperatureC)}°C
            </span>
            <span className="text-sm text-slate-500">{weatherCodeLabel(data.weatherCode)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat
              icon={<Thermometer className="w-3.5 h-3.5 text-rose-500" />}
              label="Feels"
              value={`${Math.round(data.temperatureC)}°`}
            />
            <Stat
              icon={<Droplets className="w-3.5 h-3.5 text-blue-500" />}
              label="Humidity"
              value={`${Math.round(data.humidityPct)}%`}
            />
            <Stat
              icon={<Gauge className="w-3.5 h-3.5 text-slate-500" />}
              label="Pressure"
              value={`${Math.round(data.pressureHpa)} hPa`}
            />
            <Stat
              icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
              label="UV"
              value={data.uvIndex.toFixed(1)}
            />
            <Stat
              icon={<Wind className="w-3.5 h-3.5 text-emerald-500" />}
              label="Wind"
              value={`${Math.round(data.windKph)} km/h`}
            />
          </div>

          <p className="text-[10px] text-slate-400 mt-3">
            Observed {new Date(data.observedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 bg-white/60 border border-sky-100 rounded px-2 py-1.5">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 leading-none">{label}</p>
        <p className="text-[13px] font-semibold text-slate-800 tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  )
}
