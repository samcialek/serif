import { format, formatDistanceToNow, parseISO, isToday, isTomorrow, isYesterday } from 'date-fns'

// ============================================================
// DATE FORMATTERS
// ============================================================

/**
 * Format date to readable string
 * @example formatDate('2024-12-15') => 'Dec 15, 2024'
 */
export function formatDate(date: string | Date, formatStr: string = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, formatStr)
}

/**
 * Format date to short format
 * @example formatDateShort('2024-12-15') => 'Dec 15'
 */
export function formatDateShort(date: string | Date): string {
  return formatDate(date, 'MMM d')
}

/**
 * Format time from 24hr to 12hr
 * @example formatTime('14:30') => '2:30 PM'
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Format time to short format (no minutes if :00)
 * @example formatTimeShort('14:00') => '2 PM'
 * @example formatTimeShort('14:30') => '2:30 PM'
 */
export function formatTimeShort(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  if (minutes === 0) {
    return `${displayHours} ${period}`
  }
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Get relative date string
 * @example getRelativeDate('2024-12-15') => 'Today' | 'Tomorrow' | 'Yesterday' | 'Dec 15'
 */
export function getRelativeDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date

  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'

  return formatDateShort(d)
}

/**
 * Get time ago string
 * @example getTimeAgo('2024-12-15T10:00:00') => '2 hours ago'
 */
export function getTimeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return formatDistanceToNow(d, { addSuffix: true })
}

// ============================================================
// NUMBER FORMATTERS
// ============================================================

/**
 * Format number with thousands separator
 * @example formatNumber(12345) => '12,345'
 */
export function formatNumber(value: number, decimals: number = 0): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Format number as compact (K, M, B)
 * @example formatCompact(12345) => '12.3K'
 */
export function formatCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toString()
}

/**
 * Format as percentage
 * @example formatPercent(0.892) => '89.2%'
 * @example formatPercent(89.2, false) => '89%'
 */
export function formatPercent(value: number, isDecimal: boolean = true, decimals: number = 0): string {
  const pct = isDecimal ? value * 100 : value
  return `${pct.toFixed(decimals)}%`
}

/**
 * Format as delta (with + sign for positive)
 * @example formatDelta(5.2) => '+5.2'
 * @example formatDelta(-3.1) => '-3.1'
 */
export function formatDelta(value: number, decimals: number = 1): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}`
}

/**
 * Format as delta percentage
 * @example formatDeltaPercent(0.12) => '+12%'
 */
export function formatDeltaPercent(value: number, isDecimal: boolean = true): string {
  const pct = isDecimal ? value * 100 : value
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

// ============================================================
// DURATION FORMATTERS
// ============================================================

/**
 * Format minutes to hours and minutes
 * @example formatDuration(125) => '2h 5m'
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

/**
 * Format minutes to hours with decimal
 * @example formatHours(90) => '1.5 hrs'
 */
export function formatHours(minutes: number): string {
  const hours = minutes / 60
  return `${hours.toFixed(1)} hrs`
}

/**
 * Format seconds to readable duration
 * @example formatSeconds(125) => '2m 5s'
 */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60

  if (secs === 0) return `${minutes}m`
  return `${minutes}m ${secs}s`
}

// ============================================================
// METRIC FORMATTERS
// ============================================================

/**
 * Format metric value with appropriate unit
 */
export function formatMetricValue(value: number, unit: string, decimals: number = 0): string {
  if (unit === '%' || unit === 'efficiency') {
    return formatPercent(value, value <= 1, decimals)
  }
  if (unit === 'min' || unit === 'minutes') {
    return formatDuration(value)
  }
  return `${formatNumber(value, decimals)}${unit ? ` ${unit}` : ''}`
}

/**
 * Format certainty level
 * @example formatCertainty(0.89) => '89%'
 */
export function formatCertainty(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * Format evidence weight
 * @example formatEvidenceWeight(0.89) => '89% your data, 11% population'
 */
export function formatEvidenceWeight(personalWeight: number): string {
  const personal = Math.round(personalWeight * 100)
  const population = 100 - personal
  return `${personal}% your data, ${population}% population`
}

// ============================================================
// TEMPERATURE FORMATTERS
// ============================================================

/**
 * Format temperature with unit
 * @example formatTemp(20, 'C') => '20°C'
 */
export function formatTemp(value: number, unit: 'C' | 'F' = 'C'): string {
  return `${value.toFixed(1)}°${unit}`
}

/**
 * Convert Celsius to Fahrenheit
 */
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

/**
 * Format temperature with both units
 * @example formatTempBoth(20) => '20°C (68°F)'
 */
export function formatTempBoth(celsius: number): string {
  const fahrenheit = celsiusToFahrenheit(celsius)
  return `${celsius.toFixed(1)}°C (${fahrenheit.toFixed(0)}°F)`
}
