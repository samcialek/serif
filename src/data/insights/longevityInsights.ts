// Longevity Insights - What wearables/CGM reveal that EHR can't see
// Designed for ~60 second scan by clinicians

export type InsightStatus = 'critical' | 'warning' | 'watch' | 'optimal'

export interface LongevityInsight {
  id: string
  status: InsightStatus
  headline: string
  explanation: string
  dataSources: string[]
  metric?: {
    value: string
    label: string
    trend?: 'up' | 'down' | 'stable'
  }
}

export interface PersonaLongevityInsights {
  personaId: string
  insights: LongevityInsight[]
}

export const STATUS_CONFIG: Record<InsightStatus, { emoji: string; color: string; bgColor: string; label: string }> = {
  critical: { emoji: '🔴', color: '#DC2626', bgColor: '#FEE2E2', label: 'Action Required' },
  warning: { emoji: '🟠', color: '#EA580C', bgColor: '#FFEDD5', label: 'Needs Attention' },
  watch: { emoji: '🟡', color: '#CA8A04', bgColor: '#FEF9C3', label: 'Monitor' },
  optimal: { emoji: '🟢', color: '#16A34A', bgColor: '#DCFCE7', label: 'On Track' },
}

export const LONGEVITY_INSIGHTS: Record<string, LongevityInsight[]> = {
  // Rajan - Tech Executive, 42
  'rajan': [
    {
      id: 'rajan-1',
      status: 'warning',
      headline: 'Sleep fragmentation spiking glucose',
      explanation: 'Nights with >3 wake events correlate with +18 mg/dL fasting glucose next morning. This pattern is invisible in annual labs but shows pre-diabetic dynamics.',
      dataSources: ['Oura Ring', 'Dexcom G7'],
      metric: { value: '+18', label: 'mg/dL on poor sleep nights', trend: 'up' }
    },
    {
      id: 'rajan-2',
      status: 'critical',
      headline: 'HRV declining 15% over 90 days',
      explanation: 'Resting HRV dropped from 52ms to 44ms despite no change in exercise. Often precedes burnout or immune dysfunction by 4-6 weeks.',
      dataSources: ['Whoop', 'Apple Watch'],
      metric: { value: '44ms', label: 'current vs 52ms baseline', trend: 'down' }
    },
    {
      id: 'rajan-3',
      status: 'watch',
      headline: 'Late meals blunting overnight recovery',
      explanation: 'Eating after 8pm correlates with 23% lower deep sleep and elevated overnight heart rate. Recovery scores drop significantly.',
      dataSources: ['Oura Ring', 'MyFitnessPal'],
      metric: { value: '-23%', label: 'deep sleep on late meals', trend: 'down' }
    },
    {
      id: 'rajan-4',
      status: 'optimal',
      headline: 'Zone 2 training improving glucose control',
      explanation: 'Days with 30+ min Zone 2 cardio show 12% tighter glucose variability. Current compliance: 4x/week.',
      dataSources: ['Garmin', 'Dexcom G7'],
      metric: { value: '4x', label: '/week Zone 2 sessions', trend: 'stable' }
    },
  ],

  // Sarah - Healthcare Worker, 35
  'sarah': [
    {
      id: 'sarah-1',
      status: 'critical',
      headline: 'Night shift recovery deficit accumulating',
      explanation: 'Post-night-shift HRV takes 72+ hours to normalize vs 24 hours baseline. Sleep debt now at ~14 hours over 2 weeks.',
      dataSources: ['Fitbit', 'Sleep Cycle'],
      metric: { value: '14h', label: 'accumulated sleep debt', trend: 'up' }
    },
    {
      id: 'sarah-2',
      status: 'warning',
      headline: 'Cortisol pattern inverted on shift days',
      explanation: 'Wearable stress markers peak at 3am (should be lowest). Associated with 2.3x higher afternoon fatigue scores.',
      dataSources: ['Garmin', 'Daylio mood tracker'],
      metric: { value: '2.3x', label: 'afternoon fatigue on shift days', trend: 'up' }
    },
    {
      id: 'sarah-3',
      status: 'watch',
      headline: 'Caffeine timing extending sleep latency',
      explanation: 'Coffee after 2pm correlates with +35 min sleep onset time. Current pattern: 3pm average last caffeine.',
      dataSources: ['Oura Ring', 'caffeine log'],
      metric: { value: '+35', label: 'min to fall asleep', trend: 'up' }
    },
    {
      id: 'sarah-4',
      status: 'optimal',
      headline: 'Recovery days showing strong adaptation',
      explanation: 'Off-shift recovery metrics (HRV, deep sleep) rebounding to baseline within 48h when properly scheduled.',
      dataSources: ['Whoop', 'Oura Ring'],
      metric: { value: '48h', label: 'to full recovery', trend: 'stable' }
    },
  ],

  // Marcus - Retired Teacher, 67
  'marcus': [
    {
      id: 'marcus-1',
      status: 'warning',
      headline: 'Morning glucose spikes despite medication',
      explanation: 'Dawn phenomenon causing +45 mg/dL spike between 5-7am. Metformin timing may need adjustment. EHR A1C looks controlled but misses this pattern.',
      dataSources: ['Freestyle Libre', 'medication log'],
      metric: { value: '+45', label: 'mg/dL dawn spike', trend: 'up' }
    },
    {
      id: 'marcus-2',
      status: 'watch',
      headline: 'Step count declining seasonally',
      explanation: 'Daily steps dropped from 8,200 to 5,100 over winter months. Correlates with +8 mmHg systolic BP and lower mood scores.',
      dataSources: ['Fitbit', 'Withings BP cuff'],
      metric: { value: '5,100', label: 'steps/day (was 8,200)', trend: 'down' }
    },
    {
      id: 'marcus-3',
      status: 'optimal',
      headline: 'Blood pressure well-controlled with activity',
      explanation: 'Days with 7,000+ steps show 12 mmHg lower evening BP. Current BP averaging 128/78 on active days vs 140/85 sedentary.',
      dataSources: ['Withings BP cuff', 'Apple Watch'],
      metric: { value: '128/78', label: 'BP on active days', trend: 'stable' }
    },
    {
      id: 'marcus-4',
      status: 'watch',
      headline: 'Sleep efficiency dropping with nocturia',
      explanation: '3+ bathroom trips/night correlating with 62% sleep efficiency (target >85%). May indicate need for evening fluid/medication review.',
      dataSources: ['Oura Ring', 'bathroom log'],
      metric: { value: '62%', label: 'sleep efficiency', trend: 'down' }
    },
  ],

  // Emma - College Athlete, 21
  'emma': [
    {
      id: 'emma-1',
      status: 'warning',
      headline: 'Overtraining pattern emerging',
      explanation: 'HRV suppressed >20% below baseline for 12 consecutive days. Performance may decline within 1-2 weeks without deload.',
      dataSources: ['Whoop', 'TrainingPeaks'],
      metric: { value: '12', label: 'days HRV suppressed', trend: 'up' }
    },
    {
      id: 'emma-2',
      status: 'critical',
      headline: 'RED-S risk indicators present',
      explanation: 'Low energy availability pattern: high training load + irregular eating + declining resting HR. Menstrual cycle tracking shows 45+ day gap.',
      dataSources: ['Garmin', 'Clue app', 'MyFitnessPal'],
      metric: { value: '45+', label: 'day cycle gap', trend: 'up' }
    },
    {
      id: 'emma-3',
      status: 'watch',
      headline: 'Sleep timing highly variable',
      explanation: 'Bedtime varies by 3+ hours between weekdays and weekends. Social jet lag correlating with Monday performance dips.',
      dataSources: ['Oura Ring', 'phone screen time'],
      metric: { value: '3h+', label: 'bedtime variability', trend: 'stable' }
    },
    {
      id: 'emma-4',
      status: 'optimal',
      headline: 'Hydration tracking showing good compliance',
      explanation: 'Urine SG averaging 1.012 (well-hydrated). Electrolyte intake adequate for training volume.',
      dataSources: ['smart water bottle', 'training log'],
      metric: { value: '1.012', label: 'avg urine SG', trend: 'stable' }
    },
  ],

  // Caspian - Endurance Athlete, 43
  'caspian': [
    {
      id: 'caspian-longevity-1',
      status: 'critical',
      headline: 'Iron stores critically low despite supplementation',
      explanation: 'Ferritin at 18 ng/mL — well below the 50+ target for endurance athletes. Foot-strike hemolysis from high running volume likely outpacing oral iron absorption. EHR shows "normal range" but misses athletic context.',
      dataSources: ['Blood labs', 'Garmin', 'training log'],
      metric: { value: '18', label: 'ng/mL ferritin', trend: 'down' }
    },
    {
      id: 'caspian-longevity-2',
      status: 'warning',
      headline: 'Sleep fragmentation blunting testosterone recovery',
      explanation: 'Nights with >2 wake events correlate with 12% lower morning testosterone. Current sleep efficiency 78% — below the 85% threshold for optimal hormonal recovery.',
      dataSources: ['Oura Ring', 'blood labs'],
      metric: { value: '78%', label: 'sleep efficiency', trend: 'down' }
    },
    {
      id: 'caspian-longevity-3',
      status: 'watch',
      headline: 'Travel load elevating inflammatory markers',
      explanation: 'CRP rises 0.4 mg/L within 48h of international travel. Jet lag disrupts circadian cortisol rhythm for 3+ days, compounding training stress.',
      dataSources: ['Oura Ring', 'blood labs', 'travel log'],
      metric: { value: '+0.4', label: 'mg/L CRP post-travel', trend: 'up' }
    },
    {
      id: 'caspian-longevity-4',
      status: 'optimal',
      headline: 'Zone 2 volume driving metabolic efficiency',
      explanation: 'Fat oxidation rate improving — 0.68 g/min at aerobic threshold, up from 0.52 three months ago. Glucose variability tightening on high-volume weeks.',
      dataSources: ['Garmin', 'Supersapiens CGM'],
      metric: { value: '0.68', label: 'g/min fat ox rate', trend: 'up' }
    },
  ],
}

export function getLongevityInsights(personaId: string): LongevityInsight[] {
  return LONGEVITY_INSIGHTS[personaId.toLowerCase()] || LONGEVITY_INSIGHTS['rajan']
}
