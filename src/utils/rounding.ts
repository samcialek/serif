/**
 * Rounding helpers for Insights + Protocols display.
 *
 * Two concerns:
 *   - Display: round values to clinically meaningful increments so the UI
 *     doesn't show "shift bedtime by 24 seconds".
 *   - Suppression: if a recommended action rounds below its minimum
 *     meaningful increment, the insight should be dropped from the exposed
 *     surface at display time (no backend regeneration).
 *
 * Increment tables here are the single source of truth for both jobs.
 */

// Per-action minimum meaningful increment (also used as the display
// rounding step). Units match the action's native unit in the portal
// export: hours for time-of-day, hours for durations, km/day for
// volumes, load units/day for training load, /day for steps, g/day for
// protein, kcal/day for energy.
const ACTION_INCREMENT: Record<string, number> = {
  bedtime: 0.25,            // 15 min
  wake_time: 0.25,
  workout_time: 0.25,
  sleep_duration: 0.25,     // hours (15 min)
  training_volume: 0.25,    // hours
  running_volume: 0.25,     // km/day
  zone2_volume: 0.25,       // km/day
  training_load: 10,        // load units/day
  steps: 500,
  dietary_protein: 5,       // g/day
  dietary_energy: 100,      // kcal/day
  active_energy: 100,       // kcal/day
}

// Per-outcome clinical rounding step for display of effect sizes and
// projections. Defaults to 1 for unknown outcomes.
const OUTCOME_INCREMENT: Record<string, number> = {
  // wearables
  hrv_daily: 1,
  sleep_quality: 1,
  deep_sleep: 5,
  rem_sleep: 5,
  sleep_efficiency: 1,
  sleep_onset_latency: 1,
  // iron panel
  ferritin: 1,
  hemoglobin: 0.1,
  iron_total: 1,
  rbc: 0.1,
  mcv: 1,
  rdw: 0.1,
  // minerals
  magnesium_rbc: 0.1,
  zinc: 1,
  // lipids
  hdl: 1,
  ldl: 1,
  apob: 1,
  non_hdl_cholesterol: 1,
  total_cholesterol: 1,
  triglycerides: 1,
  // metabolic
  glucose: 1,
  insulin: 0.5,
  hscrp: 0.1,
  // hormones
  cortisol: 0.5,
  testosterone: 5,
  estradiol: 1,
  dhea_s: 5,
  shbg: 1,
  // liver
  alt: 1,
  ast: 1,
  // other labs
  homocysteine: 0.1,
  uric_acid: 0.1,
  platelets: 5,
  wbc: 0.1,
  // body composition
  body_fat_pct: 0.5,
  body_mass_kg: 0.5,
  vo2_peak: 0.5,
}

export function actionIncrement(action: string): number {
  return ACTION_INCREMENT[action] ?? 1
}

export function outcomeIncrement(outcome: string): number {
  return OUTCOME_INCREMENT[outcome] ?? 1
}

// Beneficial direction per outcome — authoritative source for deriving
// which way the outcome should move under a recommended action.
type BeneficialDir = 'higher' | 'lower' | 'neutral'
const OUTCOME_BENEFICIAL: Record<string, BeneficialDir> = {
  deep_sleep: 'higher',
  rem_sleep: 'higher',
  sleep_quality: 'higher',
  sleep_efficiency: 'higher',
  sleep_onset_latency: 'lower',
  hrv_daily: 'higher',
  ferritin: 'higher',
  hemoglobin: 'higher',
  iron_total: 'higher',
  rbc: 'neutral',
  mcv: 'neutral',
  rdw: 'lower',
  magnesium_rbc: 'higher',
  zinc: 'higher',
  vo2_peak: 'higher',
  body_mass_kg: 'neutral',
  body_fat_pct: 'lower',
  hdl: 'higher',
  ldl: 'lower',
  apob: 'lower',
  non_hdl_cholesterol: 'lower',
  total_cholesterol: 'lower',
  triglycerides: 'lower',
  glucose: 'lower',
  insulin: 'lower',
  hscrp: 'lower',
  cortisol: 'neutral',
  testosterone: 'neutral',
  estradiol: 'neutral',
  dhea_s: 'neutral',
  shbg: 'neutral',
  alt: 'lower',
  ast: 'lower',
  homocysteine: 'lower',
  uric_acid: 'lower',
  platelets: 'neutral',
  wbc: 'neutral',
}

export function beneficialDirection(outcome: string): BeneficialDir {
  return OUTCOME_BENEFICIAL[outcome] ?? 'neutral'
}

// Plausible physiological bounds per outcome. When the projected outcome
// value (baseline + beneficial-signed effect magnitude) falls outside
// these bounds, the underlying dose is likely physiologically
// unachievable and the insight should be suppressed from the exposed
// surface. Unknown outcomes are not bounded here and pass through.
type BoundsTuple = readonly [number, number]
const PHYSIOLOGICAL_BOUNDS: Record<string, BoundsTuple> = {
  hrv_daily: [10, 150],
  sleep_efficiency: [50, 100],
  deep_sleep: [20, 180],
  rem_sleep: [30, 180],
  sleep_onset_latency: [0, 90],
  sleep_quality: [0, 100],
  ferritin: [5, 500],
  hemoglobin: [8, 19],
  iron_total: [30, 250],
  apob: [30, 200],
  ldl: [30, 250],
  hdl: [20, 120],
  triglycerides: [40, 500],
  hba1c: [4, 12],
  glucose: [50, 250],
  cortisol: [3, 30],
}

export function physiologicalBounds(
  outcome: string,
  isFemale?: boolean,
): BoundsTuple | null {
  if (outcome === 'testosterone') {
    return isFemale ? [15, 80] : [100, 1200]
  }
  return PHYSIOLOGICAL_BOUNDS[outcome] ?? null
}

// True when baseline + (|scaled_effect| × beneficialDir) lies outside
// the plausible physiological range for the outcome. Suppression path
// for the bug where a posterior-scaled effect is derived from a dose
// the participant can't reach (e.g., "reduce running by 38 km/day"
// when current is 4 km/day, projecting hemoglobin to 22.8 g/dL).
export function isProjectionOutsidePhysiologicalBounds(
  baseline: number | undefined,
  scaledEffect: number,
  outcome: string,
  isFemale?: boolean,
): boolean {
  if (baseline == null || !Number.isFinite(baseline)) return false
  if (!Number.isFinite(scaledEffect)) return true
  const bounds = physiologicalBounds(outcome, isFemale)
  if (!bounds) return false
  const beneficial = beneficialDirection(outcome)
  const outcomeDir =
    beneficial === 'higher'
      ? 1
      : beneficial === 'lower'
      ? -1
      : scaledEffect > 0
      ? 1
      : scaledEffect < 0
      ? -1
      : 0
  const projection = baseline + Math.abs(scaledEffect) * outcomeDir
  const [min, max] = bounds
  return projection < min || projection > max
}

export function roundToIncrement(value: number, increment: number): number {
  if (!Number.isFinite(value) || increment <= 0) return value
  return Math.round(value / increment) * increment
}

export function roundForAction(value: number, action: string): number {
  return roundToIncrement(value, actionIncrement(action))
}

export function roundForOutcome(value: number, outcome: string): number {
  return roundToIncrement(value, outcomeIncrement(outcome))
}

// True when |value| rounds below the minimum meaningful step for this
// action — display layer should suppress.
export function isBelowMinimumDose(rawDose: number, action: string): boolean {
  const min = actionIncrement(action)
  const rounded = roundToIncrement(Math.abs(rawDose), min)
  return rounded < min
}

// True when |scaledEffect| rounds below the outcome's minimum display
// increment. Even when the action dose is meaningful, if the projected
// outcome change rounds to 0 in the user's units (e.g., "bedtime shift
// → 0 ms HRV improvement"), the insight provides no actionable value.
export function isBelowMinimumOutcomeEffect(
  scaledEffect: number,
  outcome: string,
): boolean {
  if (!Number.isFinite(scaledEffect)) return true
  const min = outcomeIncrement(outcome)
  const rounded = roundToIncrement(Math.abs(scaledEffect), min)
  return rounded < min
}

function decimalsFor(increment: number): number {
  if (increment >= 1) return 0
  if (increment >= 0.1) return 1
  if (increment >= 0.01) return 2
  return 3
}

export function formatOutcomeValue(value: number, outcome: string): string {
  if (!Number.isFinite(value)) return '—'
  const inc = outcomeIncrement(outcome)
  const rounded = roundToIncrement(value, inc)
  return rounded.toFixed(decimalsFor(inc))
}

// 22.42 → "10:25pm"; 6.5 → "6:30am"; handles pre-midnight wrap
export function formatClockTime(decimalHours: number): string {
  if (!Number.isFinite(decimalHours)) return '—'
  let total = decimalHours
  while (total >= 24) total -= 24
  while (total < 0) total += 24
  const hours = Math.floor(total)
  const minutes = Math.round((total - hours) * 60)
  // carry minute overflow
  let h = hours
  let m = minutes
  if (m >= 60) {
    h += 1
    m -= 60
  }
  if (h >= 24) h -= 24
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h
  const suffix = h >= 12 ? 'pm' : 'am'
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}${suffix}`
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '—'
  const rounded = roundToIncrement(hours, 0.25)
  const h = Math.floor(rounded)
  const m = Math.round((rounded - h) * 60)
  if (m === 0) return `${h}h`
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// Display-ready string for an action value at its natural unit and
// clinical rounding. Used by protocols and insights alike.
export function formatActionValue(value: number, action: string): string {
  if (!Number.isFinite(value)) return '—'
  const rounded = roundForAction(value, action)
  switch (action) {
    case 'bedtime':
    case 'wake_time':
    case 'workout_time':
      return formatClockTime(rounded)
    case 'sleep_duration':
    case 'training_volume':
      return formatHours(rounded)
    case 'running_volume':
    case 'zone2_volume':
      return `${rounded.toFixed(2)} km/day`
    case 'training_load':
      return `${rounded.toFixed(0)} load units/day`
    case 'steps':
      return `${Math.round(rounded).toLocaleString()}/day`
    case 'dietary_protein':
      return `${rounded.toFixed(0)} g/day`
    case 'dietary_energy':
    case 'active_energy':
      return `${rounded.toFixed(0)} kcal/day`
    default: {
      const prec = decimalsFor(actionIncrement(action))
      return rounded.toFixed(prec)
    }
  }
}

function actionPhrase(action: string): string {
  const labels: Record<string, string> = {
    bedtime: 'bedtime',
    wake_time: 'wake time',
    workout_time: 'workout time',
    sleep_duration: 'sleep',
    training_volume: 'training',
    running_volume: 'running',
    zone2_volume: 'Zone 2 volume',
    training_load: 'training load',
    steps: 'steps',
    dietary_protein: 'protein',
    dietary_energy: 'dietary energy',
    active_energy: 'active energy',
  }
  return labels[action] ?? action.replace(/_/g, ' ')
}

/**
 * Build the "Recommended action in natural units" string.
 *
 * `signedDose` semantics: positive = raise the action variable
 * (e.g., later bedtime, more km, more TRIMP); negative = lower.
 * Callers should resolve the sign from scaled_effect × beneficial
 * direction before calling so the phrasing agrees with what the
 * user should actually do.
 *
 * Returns '' if the dose rounds below the minimum (caller should
 * have already suppressed this insight).
 */
export function formatRecommendedAction(
  action: string,
  currentValue: number | null,
  signedDose: number,
): string {
  const magnitude = Math.abs(signedDose)
  const rounded = roundForAction(magnitude, action)
  if (rounded <= 0) return ''

  const raise = signedDose >= 0
  const verb = raise ? 'Increase' : 'Reduce'
  const noCurrent = currentValue == null || !Number.isFinite(currentValue)
  const applyDelta = (cv: number) => (raise ? cv + rounded : cv - rounded)

  if (action === 'bedtime' || action === 'wake_time' || action === 'workout_time') {
    if (noCurrent) {
      const dir = raise ? 'later' : 'earlier'
      return `Shift ${actionPhrase(action)} ~${formatHours(rounded)} ${dir}`
    }
    const target = applyDelta(currentValue as number)
    return `Shift ${actionPhrase(action)} to ${formatClockTime(target)}`
  }

  if (action === 'sleep_duration' || action === 'training_volume') {
    if (noCurrent) {
      return raise
        ? `Add ~${formatHours(rounded)} of ${actionPhrase(action)}`
        : `Reduce ${actionPhrase(action)} by ~${formatHours(rounded)}`
    }
    const target = Math.max(0, applyDelta(currentValue as number))
    return `${verb} ${actionPhrase(action)} to ${formatHours(target)}`
  }

  if (action === 'running_volume' || action === 'zone2_volume') {
    if (noCurrent) {
      return raise
        ? `Add ~${rounded.toFixed(2)} km/day of ${actionPhrase(action)}`
        : `Reduce ${actionPhrase(action)} by ~${rounded.toFixed(2)} km/day`
    }
    const target = roundForAction(Math.max(0, applyDelta(currentValue as number)), action)
    return `${verb} ${actionPhrase(action)} to ${target.toFixed(2)} km/day`
  }

  if (action === 'training_load') {
    if (noCurrent) {
      return raise
        ? `Add ~${rounded.toFixed(0)} load units/day of training load`
        : `Reduce training load by ~${rounded.toFixed(0)} load units/day`
    }
    const target = roundForAction(Math.max(0, applyDelta(currentValue as number)), action)
    return `${verb} training load to ${target.toFixed(0)} load units/day`
  }

  if (action === 'steps') {
    if (noCurrent) {
      return raise
        ? `Add ~${Math.round(rounded).toLocaleString()} steps/day`
        : `Reduce by ~${Math.round(rounded).toLocaleString()} steps/day`
    }
    const target = roundForAction(Math.max(0, applyDelta(currentValue as number)), action)
    return `${verb} to ${Math.round(target).toLocaleString()} steps/day`
  }

  if (action === 'dietary_protein') {
    if (noCurrent) {
      return raise
        ? `Add ~${rounded.toFixed(0)} g/day of protein`
        : `Reduce protein by ~${rounded.toFixed(0)} g/day`
    }
    const target = roundForAction(Math.max(0, applyDelta(currentValue as number)), action)
    return `${verb} protein to ${target.toFixed(0)} g/day`
  }

  if (action === 'dietary_energy' || action === 'active_energy') {
    if (noCurrent) {
      return raise
        ? `Add ~${rounded.toFixed(0)} kcal/day of ${actionPhrase(action)}`
        : `Reduce ${actionPhrase(action)} by ~${rounded.toFixed(0)} kcal/day`
    }
    const target = roundForAction(Math.max(0, applyDelta(currentValue as number)), action)
    return `${verb} ${actionPhrase(action)} to ${target.toFixed(0)} kcal/day`
  }

  return `${verb} ${actionPhrase(action)} by ~${formatActionValue(rounded, action)}`
}
