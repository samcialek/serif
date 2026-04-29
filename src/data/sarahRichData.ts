import type { LabResult } from '@/types'
import type { DataStream } from '@/components/charts/DataCadenceChart'

export type SarahMetricCategory =
  | 'sleep'
  | 'metabolic'
  | 'cycle'
  | 'nutrition'
  | 'activity'
  | 'context'
  | 'body'

export interface SarahMetric {
  id: string
  name: string
  unit: string
  category: SarahMetricCategory
  source: string
  data: Array<{ date: string; value: number }>
  referenceRange?: { low: number; high: number }
  note: string
}

export interface SarahCausalStory {
  title: string
  lever: string
  outcome: string
  evidence: string
  whyDifferentFromCaspian: string
}

export const SARAH_RECORD_START = '2018-11-05'
export const SARAH_RECORD_END = '2026-04-25'

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(33441)

function dateAt(start: string, dayOffset: number): Date {
  const d = new Date(`${start}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return d
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() -
      new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  )
}

const SARAH_TOTAL_DAYS = daysBetween(SARAH_RECORD_START, SARAH_RECORD_END)

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 0): number {
  const m = 10 ** digits
  return Math.round(value * m) / m
}

function seasonalTemp(dayOfYear: number): number {
  return 18 + 8 * Math.sin(((dayOfYear - 175) / 365) * Math.PI * 2)
}

interface SarahDayContext {
  cycleDay: number
  isLuteal: boolean
  lateMeals: number
  postMealWalks: number
}

const SARAH_DAY_CONTEXT: SarahDayContext[] = (() => {
  const r = mulberry32(90417)
  const out: SarahDayContext[] = []
  let cycleStart = 0
  let cycleIndex = 0
  let cycleLength = 28
  for (let i = 0; i <= SARAH_TOTAL_DAYS; i += 1) {
    if (i >= cycleStart + cycleLength) {
      cycleStart += cycleLength
      cycleIndex += 1
      cycleLength = clamp(
        Math.round(28 + Math.sin(cycleIndex * 1.7) * 2 + (r() - 0.5) * 5),
        25,
        34,
      )
    }
    const d = dateAt(SARAH_RECORD_START, i)
    const weekday = d.getUTCDay()
    const dayInCycle = Math.max(1, i - cycleStart + 1)
    const luteal = dayInCycle >= 18 && dayInCycle <= Math.min(cycleLength, 30)
    const baseLate = weekday === 5 || weekday === 6 ? 0.55 : 0.18
    const stressBurst = i % 91 > 62 && i % 91 < 75 ? 0.3 : 0
    const lateMeals = r() < baseLate + stressBurst ? (r() < 0.18 ? 2 : 1) : 0
    const adoption = clamp((i - 680) / 600, 0, 1)
    const postMealWalks = clamp(Math.round(1 + adoption * 2 + (r() - 0.35) * 2), 0, 4)
    out.push({
      cycleDay: dayInCycle,
      isLuteal: luteal,
      lateMeals,
      postMealWalks,
    })
  }
  return out
})()

function dayContext(dayIndex: number): SarahDayContext {
  return SARAH_DAY_CONTEXT[Math.max(0, Math.min(SARAH_DAY_CONTEXT.length - 1, dayIndex))]
}

function cycleDay(dayIndex: number): number {
  return dayContext(dayIndex).cycleDay
}

function isLuteal(dayIndex: number): boolean {
  return dayContext(dayIndex).isLuteal
}

function lateMealCount(dayIndex: number): number {
  return dayContext(dayIndex).lateMeals
}

function postMealWalks(dayIndex: number): number {
  return dayContext(dayIndex).postMealWalks
}

function generateMetric(
  id: string,
  name: string,
  unit: string,
  category: SarahMetricCategory,
  source: string,
  note: string,
  valueAt: (dayIndex: number, d: Date) => number,
  referenceRange?: { low: number; high: number },
): SarahMetric {
  const data = Array.from({ length: SARAH_TOTAL_DAYS + 1 }, (_, dayIndex) => {
    const d = dateAt(SARAH_RECORD_START, dayIndex)
    return { date: isoDate(d), value: valueAt(dayIndex, d) }
  })
  return { id, name, unit, category, source, data, referenceRange, note }
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  return Math.floor((d.getTime() - start) / 86_400_000)
}

export const sarahMetrics: SarahMetric[] = [
  generateMetric(
    'fasting_glucose',
    'Fasting glucose',
    'mg/dL',
    'metabolic',
    'CGM + labs',
    'Improves as eating window, post-meal walks, and fiber adherence accumulate.',
    (i) => {
      const trend = 118 - clamp(i / 1400, 0, 1) * 26
      const luteal = isLuteal(i) ? 4 : 0
      const late = lateMealCount(i) * 5
      const walks = postMealWalks(i) * -2.2
      return round(clamp(trend + luteal + late + walks + (rand() - 0.5) * 5, 82, 130), 0)
    },
    { low: 70, high: 99 },
  ),
  generateMetric(
    'glucose_cv',
    'Glucose variability',
    '%',
    'metabolic',
    'CGM',
    'The clearest metabolic response signal: late meals and luteal phase widen the band.',
    (i) => {
      const trend = 24 - clamp(i / 1500, 0, 1) * 9
      return round(clamp(trend + (isLuteal(i) ? 2.4 : 0) + lateMealCount(i) * 1.5 + (rand() - 0.5) * 2, 10, 29), 1)
    },
    { low: 0, high: 18 },
  ),
  generateMetric(
    'sleep_efficiency',
    'Sleep efficiency',
    '%',
    'sleep',
    'Oura Ring',
    'Mostly strong, but heat and luteal symptoms produce visible dips.',
    (i, d) => {
      const heat = Math.max(0, seasonalTemp(dayOfYear(d)) - 23) * -1.4
      return round(clamp(88 + heat + (isLuteal(i) ? -3.2 : 0) + (rand() - 0.5) * 5, 72, 96), 0)
    },
    { low: 85, high: 100 },
  ),
  generateMetric(
    'deep_sleep',
    'Deep sleep',
    'min',
    'sleep',
    'Oura Ring',
    'Bedroom heat moves this more than training does.',
    (i, d) => {
      const heat = Math.max(0, seasonalTemp(dayOfYear(d)) - 23) * -4
      return round(clamp(62 + heat + (isLuteal(i) ? -5 : 0) + (rand() - 0.5) * 14, 25, 92), 0)
    },
    { low: 45, high: 90 },
  ),
  generateMetric(
    'hrv',
    'Morning HRV',
    'ms',
    'sleep',
    'Oura Ring',
    'Autonomic signal is sensitive to alcohol, poor sleep, and luteal-phase symptoms.',
    (i) => round(clamp(54 + (isLuteal(i) ? -5 : 0) - lateMealCount(i) * 2 + (rand() - 0.5) * 10, 28, 72), 0),
    { low: 35, high: 75 },
  ),
  generateMetric(
    'cycle_day',
    'Cycle day',
    'day',
    'cycle',
    'Menstrual app',
    'Acts as a moderator rather than a prescription target.',
    (i) => cycleDay(i),
  ),
  generateMetric(
    'luteal_symptom_score',
    'Luteal symptom score',
    '0-10',
    'cycle',
    'Menstrual app',
    'A recurrent moderator of sleep efficiency, HRV, cravings, and glucose variability.',
    (i) => {
      const score = isLuteal(i) ? 4.8 + (rand() - 0.5) * 2.8 : 1.1 + rand() * 1.4
      return round(clamp(score, 0, 10), 1)
    },
    { low: 0, high: 3 },
  ),
  generateMetric(
    'fiber_g',
    'Fiber',
    'g',
    'nutrition',
    'Food log',
    'Higher-fiber days blunt postprandial spikes and improve next-day glucose.',
    (i) => {
      const adoption = clamp((i - 760) / 700, 0, 1)
      return round(clamp(17 + adoption * 13 + (rand() - 0.45) * 8, 8, 42), 0)
    },
    { low: 25, high: 45 },
  ),
  generateMetric(
    'carbohydrate_g',
    'Carbohydrates',
    'g',
    'nutrition',
    'Food log',
    'Meal composition is visible because glucose cadence is dense.',
    (i) => round(clamp(165 + lateMealCount(i) * 28 + (isLuteal(i) ? 18 : 0) + (rand() - 0.5) * 40, 75, 270), 0),
  ),
  generateMetric(
    'late_meals',
    'Late meals',
    'count',
    'nutrition',
    'Food log',
    'The strongest mutable daily trigger in Sarahs glucose model.',
    (i) => lateMealCount(i),
    { low: 0, high: 0 },
  ),
  generateMetric(
    'post_meal_walks',
    'Post-meal walks',
    'count',
    'activity',
    'Apple Watch + food log',
    'A small repeated behavior with a clean glucose effect.',
    (i) => postMealWalks(i),
    { low: 2, high: 4 },
  ),
  generateMetric(
    'bedroom_temp',
    'Bedroom temperature',
    'deg C',
    'context',
    'Thermostat',
    'The sleep edge has a tight upper threshold around 19 deg C.',
    (_i, d) => round(clamp(19.2 + Math.max(0, seasonalTemp(dayOfYear(d)) - 21) * 0.2 + (rand() - 0.5) * 1.6, 16.5, 24.5), 1),
    { low: 17, high: 19 },
  ),
  generateMetric(
    'ambient_temp',
    'Outdoor temperature',
    'deg C',
    'context',
    'Weather',
    'Used as a confounder for sleep, activity, and glucose variability.',
    (_i, d) => round(seasonalTemp(dayOfYear(d)) + (rand() - 0.5) * 4, 1),
  ),
  generateMetric(
    'body_fat_pct',
    'Body fat',
    '%',
    'body',
    'DEXA + smart scale',
    'Slow-moving outcome that follows insulin sensitivity and strength consistency.',
    (i) => round(clamp(35 - clamp((i - 500) / 1700, 0, 1) * 7 + (rand() - 0.5) * 1.8, 25, 37), 1),
  ),
]

function monthlyDensity(
  start: string,
  end: string,
  countForMonth: (year: number, month: number) => number,
): Array<{ month: string; count: number }> {
  const out: Array<{ month: string; count: number }> = []
  const cursor = new Date(`${start}T00:00:00Z`)
  cursor.setUTCDate(1)
  const stop = new Date(`${end}T00:00:00Z`)
  while (cursor <= stop) {
    const y = cursor.getUTCFullYear()
    const m = cursor.getUTCMonth() + 1
    out.push({
      month: `${y}-${String(m).padStart(2, '0')}`,
      count: countForMonth(y, m),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return out
}

const labDates = [
  '2020-01-17',
  '2020-07-22',
  '2021-02-12',
  '2021-08-19',
  '2022-02-24',
  '2022-08-18',
  '2023-02-10',
  '2023-07-28',
  '2024-01-19',
  '2024-04-15',
  '2024-07-10',
  '2024-10-05',
  '2025-01-08',
  '2025-04-18',
  '2025-07-25',
  '2025-10-17',
  '2026-01-23',
  '2026-03-28',
]

export const sarahDataStreams: DataStream[] = [
  {
    id: 'oura',
    label: 'Oura Ring',
    sublabel: 'Sleep stages, HRV, temperature deviation',
    color: '#7C9F8B',
    type: 'continuous',
    startDate: '2019-09-14',
    endDate: SARAH_RECORD_END,
    dataPointCount: 2416,
  },
  {
    id: 'apple-watch',
    label: 'Apple Watch',
    sublabel: 'HR, steps, post-meal walks, activity energy',
    color: '#89CFF0',
    type: 'continuous',
    startDate: '2020-02-02',
    endDate: SARAH_RECORD_END,
    dataPointCount: 2276,
  },
  {
    id: 'cgm',
    label: 'CGM / glucose',
    sublabel: 'Fasting, variability, meal response windows',
    color: '#D4A857',
    type: 'density',
    startDate: '2021-04-05',
    endDate: '2026-04-21',
    dataPointCount: 529_920,
    monthlyDensity: monthlyDensity('2021-04-01', '2026-04-01', (y, m) =>
      y < 2023 ? (m % 3 === 0 ? 12 : 4) : y === 2024 ? 24 : 18,
    ),
  },
  {
    id: 'food-log',
    label: 'Food log',
    sublabel: 'Meal timing, carbs, fiber, protein, alcohol',
    color: '#C76B4D',
    type: 'density',
    startDate: '2021-06-01',
    endDate: SARAH_RECORD_END,
    dataPointCount: 1248,
    monthlyDensity: monthlyDensity('2021-06-01', SARAH_RECORD_END, (y, m) =>
      y < 2023 ? 8 + (m % 4) : y === 2024 ? 24 : 20,
    ),
  },
  {
    id: 'cycle',
    label: 'Menstrual app',
    sublabel: 'Cycle day, luteal symptoms, flow, cravings',
    color: '#B88AC9',
    type: 'density',
    startDate: SARAH_RECORD_START,
    endDate: SARAH_RECORD_END,
    dataPointCount: SARAH_TOTAL_DAYS + 1,
    monthlyDensity: monthlyDensity(SARAH_RECORD_START, SARAH_RECORD_END, (_y, m) =>
      m % 2 === 0 ? 18 : 24,
    ),
  },
  {
    id: 'labs',
    label: 'Blood work',
    sublabel: 'Glucose, insulin, lipids, hormones, inflammation',
    color: '#9182C4',
    type: 'sparse',
    startDate: labDates[0],
    endDate: labDates[labDates.length - 1],
    episodicDates: labDates,
    dataPointCount: labDates.length,
  },
  {
    id: 'dexa',
    label: 'DEXA',
    sublabel: 'Body fat, lean mass, visceral fat',
    color: '#5BA8D4',
    type: 'sparse',
    startDate: '2021-05-12',
    endDate: '2026-02-20',
    episodicDates: ['2021-05-12', '2022-06-16', '2024-03-22', '2025-02-14', '2026-02-20'],
    dataPointCount: 5,
  },
  {
    id: 'bp',
    label: 'Home BP',
    sublabel: 'Morning BP and pulse pressure',
    color: '#E99BBE',
    type: 'density',
    startDate: '2022-05-02',
    endDate: SARAH_RECORD_END,
    dataPointCount: 612,
    monthlyDensity: monthlyDensity('2022-05-01', SARAH_RECORD_END, (_y, m) => 8 + (m % 3) * 2),
  },
  {
    id: 'thermostat',
    label: 'Bedroom climate',
    sublabel: 'Temperature, humidity, cooling runtime',
    color: '#60A5FA',
    type: 'continuous',
    startDate: '2022-06-10',
    endDate: SARAH_RECORD_END,
    dataPointCount: 1416,
  },
  {
    id: 'weather',
    label: 'Weather / AQI',
    sublabel: 'Temperature, humidity, heat index, UV, AQI',
    color: '#F97316',
    type: 'continuous',
    startDate: SARAH_RECORD_START,
    endDate: SARAH_RECORD_END,
    dataPointCount: SARAH_TOTAL_DAYS + 1,
  },
]

export const sarahLabs: LabResult[] = labDates.map((date, idx) => {
  const progress = idx / (labDates.length - 1)
  return {
    date,
    fastingGlucose: round(118 - progress * 25 + (rand() - 0.5) * 5, 0),
    hba1c: round(6.1 - progress * 0.7 + (rand() - 0.5) * 0.08, 1),
    insulin: round(14.2 - progress * 6.5 + (rand() - 0.5) * 1.4, 1),
    triglycerides: round(198 - progress * 58 + (rand() - 0.5) * 16, 0),
    hdl: round(42 + progress * 11 + (rand() - 0.5) * 5, 0),
    ldl: round(126 - progress * 18 + (rand() - 0.5) * 12, 0),
    apob: round(96 - progress * 14 + (rand() - 0.5) * 8, 0),
    hsCrp: round(2.6 - progress * 0.8 + (rand() - 0.5) * 0.5, 1),
    cortisol: round(15.5 - progress * 1.4 + (idx % 4 === 1 ? 2 : 0), 1),
    tsh: round(2.1 + Math.sin(idx * 0.9) * 0.25, 2),
    vitaminD: round(28 + progress * 16 + (rand() - 0.5) * 4, 0),
    ferritin: round(58 - progress * 4 + (rand() - 0.5) * 8, 0),
    b12: round(510 + progress * 90 + (rand() - 0.5) * 80, 0),
  }
})

export const sarahCausalStories: SarahCausalStory[] = [
  {
    title: 'Late meals produce a next-morning glucose cliff',
    lever: 'Meal timing',
    outcome: 'Fasting glucose',
    evidence: 'Meals after 7pm repeatedly add about 10-12 mg/dL the next morning, especially in luteal days.',
    whyDifferentFromCaspian: 'Caspian is constrained by training load and iron; Sarah is constrained by meal timing and glucose cadence.',
  },
  {
    title: 'Cycle phase moderates sleep and metabolic response',
    lever: 'Cycle context',
    outcome: 'Sleep efficiency, HRV, glucose variability',
    evidence: 'Luteal symptom score is a recurring modifier, not a target. Protocols should become more forgiving during high-symptom windows.',
    whyDifferentFromCaspian: 'This introduces a recurring endocrine context stream that Caspian does not have.',
  },
  {
    title: 'Bedroom heat is a direct sleep architecture risk',
    lever: 'Bedroom temperature',
    outcome: 'Sleep efficiency and deep sleep',
    evidence: 'Above roughly 19 deg C, sleep efficiency and deep sleep fall together even when bedtime is stable.',
    whyDifferentFromCaspian: 'Caspian uses weather mainly as a confounder; Sarah has a home-environment lever that can be prescribed.',
  },
  {
    title: 'Post-meal walks blunt glucose excursions',
    lever: 'Post-meal movement',
    outcome: 'Glucose variability and insulin',
    evidence: 'Two to three short walks per day reduce CGM variability and track with lower fasting insulin over repeated labs.',
    whyDifferentFromCaspian: 'The primary training signal is low-intensity timing, not endurance volume.',
  },
  {
    title: 'Fiber is a slow but reliable metabolic lever',
    lever: 'Fiber intake',
    outcome: 'Triglycerides, glucose variability, body fat',
    evidence: 'As fiber moved from the high teens into the high twenties, glucose variability and triglycerides improved over months.',
    whyDifferentFromCaspian: 'Nutrition is not just calories/protein here; micronutrient and meal-composition structure matters.',
  },
]

export const sarahDataSummary = {
  days: SARAH_TOTAL_DAYS + 1,
  streams: sarahDataStreams.length,
  labDraws: sarahLabs.length,
  cycles: 96,
  cgmReadings: 529_920,
}
