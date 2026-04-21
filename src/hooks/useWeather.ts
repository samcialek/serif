/**
 * Live weather hook — pulls current conditions from Open-Meteo for the
 * active participant's residence. No API key required; free tier, global.
 *
 * The rest of the integrations catalog is dummy; this is the one that
 * actually fetches real data.
 */

import { useEffect, useState } from 'react'
import { useActiveParticipant } from './useActiveParticipant'

export interface WeatherSnapshot {
  temperatureC: number
  humidityPct: number
  pressureHpa: number
  uvIndex: number
  windKph: number
  weatherCode: number
  observedAt: string
  city?: string
  country?: string
}

interface UseWeatherState {
  data: WeatherSnapshot | null
  loading: boolean
  error: string | null
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export function useWeather(): UseWeatherState {
  const { persona } = useActiveParticipant()
  const residence = persona?.residence
  const [state, setState] = useState<UseWeatherState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!residence?.lat || !residence?.lon) {
      setState({ data: null, loading: false, error: 'No residence coords' })
      return
    }

    const ctrl = new AbortController()
    const url = new URL(ENDPOINT)
    url.searchParams.set('latitude', String(residence.lat))
    url.searchParams.set('longitude', String(residence.lon))
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,pressure_msl,uv_index,wind_speed_10m,weather_code',
    )
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('wind_speed_unit', 'kmh')

    setState((s) => ({ ...s, loading: true, error: null }))

    fetch(url.toString(), { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
        return res.json()
      })
      .then((json: {
        current: {
          time: string
          temperature_2m: number
          relative_humidity_2m: number
          pressure_msl: number
          uv_index: number | null
          wind_speed_10m: number
          weather_code: number
        }
      }) => {
        const c = json.current
        setState({
          data: {
            temperatureC: c.temperature_2m,
            humidityPct: c.relative_humidity_2m,
            pressureHpa: c.pressure_msl,
            uvIndex: c.uv_index ?? 0,
            windKph: c.wind_speed_10m,
            weatherCode: c.weather_code,
            observedAt: c.time,
            city: residence.city,
            country: residence.country,
          },
          loading: false,
          error: null,
        })
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setState({ data: null, loading: false, error: err.message })
      })

    return () => ctrl.abort()
  }, [residence?.lat, residence?.lon, residence?.city, residence?.country])

  return state
}

// WMO weather code → short label. Covers the common ones; others fall
// through to a generic "Mixed" bucket.
export function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Fog'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  if (code <= 99) return 'Thunderstorm'
  return 'Mixed'
}
