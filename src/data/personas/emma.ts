import type { Persona, Insight, DailyMetrics, LabResult, Protocol, DailyPlan } from '@/types'

export const emmaPersona: Persona = {
  id: 'emma',
  name: 'Emma L.',
  avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
  age: 28,
  archetype: 'The New Explorer',
  narrative: 'Recently started tracking; demonstrates Serif\'s value with limited data via population priors',
  daysOfData: 12,
  devices: ['oura', 'fitbit', 'mito-app', 'bloodwork', 'weather'],
  deviceConnections: [
    { deviceId: 'oura', isActive: false, firstConnected: undefined, lastRefreshed: undefined },
    { deviceId: 'fitbit', isActive: true, firstConnected: '2025-01-01', lastRefreshed: '2025-01-11T04:30:00Z' },
    { deviceId: 'mito-app', isActive: true, firstConnected: '2025-01-01', lastRefreshed: '2025-01-11T04:30:00Z' },
    { deviceId: 'bloodwork', isActive: false, firstConnected: undefined, lastRefreshed: undefined },
    { deviceId: 'weather', isActive: true, firstConnected: '2025-01-01', lastRefreshed: '2025-01-11T04:30:00Z' },
  ],
  hasBloodwork: false,
  labDraws: 0,
  thresholds: {
    caffeineCutoff: '14:00',      // Population default - not yet personalized
    workoutEndTime: '20:00',      // Population default
    bedroomTempCeiling: 20,       // Population default
    eatingWindowHours: 12,        // Not tracking yet
    minSleepHours: 7,
    maxAlcoholUnits: 2,
  },
  currentMetrics: {
    sleepScore: 71,
    deepSleepMin: 45,
    remSleepMin: 82,
    sleepLatencyMin: 15,
    hrv: 38,
    restingHr: 68,
    fastingGlucose: 0,            // No bloodwork
    weight: 135,
    trainingLoad: 'low',
  },
  loads: [
    {
      id: 'sleep-irregularity',
      label: 'Sleep Irregularity',
      kind: 'load',
      value: 74,
      trend: 'stable',
      status: 'high',
      unit: 'score',
      detail: 'Bedtime varies by 2.5+ hrs between weekdays and weekends — social jet lag pattern',
    },
    {
      id: 'screen-load',
      label: 'Screen Time Load',
      kind: 'load',
      value: 62,
      trend: 'rising',
      trendPositive: false,
      status: 'moderate',
      unit: 'hrs',
      detail: 'Avg 3.2 hrs screen time after 9 PM — correlating with +18 min sleep latency',
    },
    {
      id: 'hydration-load',
      label: 'Hydration Deficit',
      kind: 'load',
      value: 58,
      trend: 'rising',
      trendPositive: false,
      status: 'moderate',
      unit: 'score',
      detail: 'Avg 1.4L/day water intake — population target for her weight is 2.2L; RHR elevated on low days',
    },
    {
      id: 'social-jetlag',
      label: 'Social Jet Lag',
      kind: 'load',
      value: 82,
      trend: 'stable',
      status: 'high',
      unit: 'hrs',
      detail: 'Weekend wake time 2.5 hrs later than weekday — equivalent to flying 2 time zones every Monday',
    },
    {
      id: 'stress-load',
      label: 'Perceived Stress',
      kind: 'load',
      value: 52,
      trend: 'rising',
      trendPositive: false,
      status: 'moderate',
      unit: 'score',
      detail: 'Self-reported 6/10; exam season approaching — HRV suppression starting to appear',
    },
    {
      id: 'resting-hr',
      label: 'Resting HR',
      kind: 'marker',
      value: 60,
      trend: 'stable',
      status: 'moderate',
      unit: 'bpm',
      detail: 'RHR 68 bpm — higher than expected for age; limited data but tracking',
    },
    {
      id: 'hrv-baseline',
      label: 'HRV Baseline',
      kind: 'marker',
      value: 55,
      trend: 'stable',
      status: 'moderate',
      unit: 'ms',
      detail: 'HRV 38 ms — below population median of 45 ms for age group; only 12 days of data',
    },
    {
      id: 'sleep-efficiency',
      label: 'Sleep Efficiency',
      kind: 'marker',
      value: 62,
      trend: 'stable',
      status: 'moderate',
      unit: '%',
      detail: 'Sleep efficiency 79% — screen time and irregular schedule dragging it below 85% target',
    },
    {
      id: 'deep-sleep-pct',
      label: 'Deep Sleep %',
      kind: 'marker',
      value: 48,
      trend: 'falling',
      trendPositive: false,
      status: 'moderate',
      unit: '%',
      detail: 'Deep sleep 14% of total — population median for age is 20%; caffeine timing suspect',
    },
    {
      id: 'body-temp-deviation',
      label: 'Temp Deviation',
      kind: 'marker',
      value: 35,
      trend: 'stable',
      status: 'low',
      unit: '°C',
      detail: 'Overnight skin temp deviation +0.1°C — within normal; no illness signal detected',
    },
  ],
  tags: ['new-user', 'limited-data', 'population-priors'],
}

export const emmaInsights: Insight[] = [
  {
    id: 'emma-insight-001',
    personaId: 'emma',
    category: 'sleep',
    variableType: 'outcome',  // Sleep score is a daily outcome
    title: 'BEDTIME CONSISTENCY → SLEEP QUALITY',
    headline: 'Irregular bedtimes may be affecting your sleep',
    recommendation: 'Try a consistent 10:30 PM bedtime',
    explanation: 'Your bedtime variance is 90+ minutes—consistency helps',
    cause: {
      behavior: 'bedtime_consistency',
      threshold: 30,
      unit: 'minutes variance',
      direction: 'below',
    },
    outcome: {
      metric: 'sleep_score',
      effect: '+8 points with consistent bedtime',
      direction: 'positive',
    },
    certainty: 0.62,  // Lower certainty due to limited data
    evidence: {
      personalDays: 12,
      personalWeight: 0.35,
      populationWeight: 0.65,  // Heavy reliance on population data
      stability: 0.48,
    },
    dataSources: ['apple-watch'],
    comparison: {
      before: { value: 68, label: 'Variable bedtime' },
      after: { value: 76, label: 'Consistent bedtime (projected)' },
    },
    whyNow: 'We\'ve noticed significant bedtime variation in your first 12 days.',
    holdoutPreview: {
      metric: 'sleep_score',
      expectedChange: 6,
      unit: 'points',
      horizon: '14 days',
    },
    showWork: 'Based on 12 days of data, your bedtime ranges from 10 PM to 12:30 AM. Population research strongly supports bedtime consistency for sleep quality. As we collect more of your data, this recommendation will become more personalized to your specific patterns.',
  },
  {
    id: 'emma-insight-002',
    personaId: 'emma',
    category: 'recovery',
    variableType: 'outcome',  // Energy level is a daily outcome
    title: 'STEP COUNT → ENERGY LEVELS',
    headline: 'More movement may boost your daily energy',
    recommendation: 'Aim for 8,000+ steps daily',
    explanation: 'Population data shows strong energy correlation at this threshold',
    cause: {
      behavior: 'daily_steps',
      threshold: 8000,
      unit: 'steps',
      direction: 'above',
    },
    outcome: {
      metric: 'energy_level',
      effect: '+1.2 points on high-step days',
      direction: 'positive',
    },
    certainty: 0.58,
    evidence: {
      personalDays: 12,
      personalWeight: 0.28,
      populationWeight: 0.72,
      stability: 0.42,
    },
    dataSources: ['apple-watch'],
    comparison: {
      before: { value: 4.2, label: 'Under 5k steps' },
      after: { value: 5.4, label: '8k+ steps (projected)' },
    },
    whyNow: 'Your average step count is 5,200—below the optimal threshold.',
    showWork: 'Your data shows 4 days above 7,000 steps with slightly higher energy ratings. Population research strongly supports the 8,000 step threshold for energy and mood. We\'ll refine your personal threshold as more data comes in.',
  },
  {
    id: 'emma-insight-003',
    personaId: 'emma',
    category: 'sleep',
    variableType: 'outcome',  // Sleep latency is a daily outcome
    title: 'CAFFEINE TIMING → SLEEP ONSET',
    headline: 'Caffeine timing affects most people\'s sleep',
    recommendation: 'Try cutting caffeine after 2 PM',
    explanation: 'Population data suggests a 2 PM cutoff for optimal sleep',
    cause: {
      behavior: 'caffeine_cutoff',
      threshold: '14:00',
      unit: 'time',
      direction: 'before',
    },
    outcome: {
      metric: 'sleep_latency',
      effect: '-8 min average (population data)',
      direction: 'positive',
    },
    certainty: 0.55,  // Mostly population-based
    evidence: {
      personalDays: 12,
      personalWeight: 0.18,
      populationWeight: 0.82,
      stability: 0.38,
    },
    dataSources: ['apple-watch'],
    comparison: {
      before: { value: 18, label: 'Late caffeine (population avg)' },
      after: { value: 10, label: 'Early cutoff (population avg)' },
    },
    whyNow: 'This is a population-based recommendation while we learn your patterns.',
    showWork: 'We don\'t have enough data yet to determine your personal caffeine threshold. Population research shows the average person should cut caffeine by 2 PM for optimal sleep. Your personal threshold may be earlier or later—we\'ll know more in 3-4 weeks.',
  },
  // Higher certainty insights based on strong population evidence
  {
    id: 'emma-insight-004',
    personaId: 'emma',
    category: 'sleep',
    variableType: 'outcome',  // Sleep latency is a daily outcome
    title: 'SCREEN TIME → SLEEP ONSET',
    headline: 'Evening screen exposure delays sleep onset',
    recommendation: 'Reduce screens 1 hour before bed',
    explanation: 'Blue light suppresses melatonin—well established in research',
    causalParams: {
      source: 'screen_time_before_bed_min',
      target: 'sleep_latency_min',
      curveType: 'linear',
      theta: {
        value: 60,
        unit: 'minutes',
        low: 45,
        high: 75,
        displayValue: '60 min before bed',
      },
      betaBelow: {
        value: -0.15,
        unit: 'min',
        description: '-0.15 min latency per min less screen',
      },
      betaAbove: {
        value: 0.2,
        unit: 'min',
        description: '+0.2 min latency per min more screen',
      },
      observations: 12,
      completePct: 100,
      changepointProb: 0.88,
      sizeCategory: 'medium',
      currentValue: 45,
      currentStatus: 'below_optimal',
    },
    cause: {
      behavior: 'screen_time_before_bed',
      threshold: 60,
      unit: 'minutes',
      direction: 'below',
    },
    outcome: {
      metric: 'sleep_latency',
      effect: '-3 min per 15 min less screen time',
      direction: 'positive',
    },
    certainty: 0.78,
    evidence: {
      personalDays: 12,
      personalWeight: 0.25,
      populationWeight: 0.75,
      stability: 0.72,
    },
    dataSources: ['fitbit'],
    comparison: {
      before: { value: 18, label: 'With screens' },
      after: { value: 11, label: 'Screen-free hour' },
    },
    whyNow: 'Your early data shows correlation with late screen use.',
    holdoutPreview: {
      metric: 'sleep_latency',
      expectedChange: -5,
      unit: 'min',
      horizon: '7 days',
    },
    showWork: 'Blue light from screens suppresses melatonin production—this is one of the most robust findings in sleep research. Your 12 days of data shows 14-22 min sleep latency. Population research strongly supports a screen-free hour before bed for faster sleep onset.',
    actionable: true,
    priority: 1,
  },
  {
    id: 'emma-insight-005',
    personaId: 'emma',
    category: 'recovery',
    variableType: 'outcome',  // Next day HRV is a daily recovery outcome
    title: 'SLEEP DURATION → NEXT DAY HRV',
    headline: 'Sleep duration strongly predicts your recovery',
    recommendation: 'Aim for 7-8 hours of sleep',
    explanation: 'Each hour below 7 reduces next-day HRV by ~5ms',
    causalParams: {
      source: 'sleep_duration_hours',
      target: 'next_day_hrv_ms',
      curveType: 'plateau_up',
      theta: {
        value: 7,
        unit: 'hours',
        low: 6.5,
        high: 7.5,
        displayValue: '7 hours',
      },
      betaBelow: {
        value: 5,
        unit: 'ms',
        description: '+5 ms HRV per hour more sleep',
      },
      betaAbove: {
        value: 1,
        unit: 'ms',
        description: '+1 ms per hour (diminishing)',
      },
      observations: 12,
      completePct: 100,
      changepointProb: 0.92,
      sizeCategory: 'large',
      currentValue: 6.5,
      currentStatus: 'below_optimal',
    },
    cause: {
      behavior: 'sleep_duration',
      threshold: 7,
      unit: 'hours',
      direction: 'above',
    },
    outcome: {
      metric: 'hrv',
      effect: '+5 ms per hour toward 7 hours',
      direction: 'positive',
    },
    certainty: 0.82,
    evidence: {
      personalDays: 12,
      personalWeight: 0.30,
      populationWeight: 0.70,
      stability: 0.78,
    },
    dataSources: ['fitbit'],
    comparison: {
      before: { value: 35, label: '6 hours sleep' },
      after: { value: 42, label: '7+ hours sleep' },
    },
    whyNow: 'Your average sleep is 6.5 hours—below optimal for recovery.',
    holdoutPreview: {
      metric: 'hrv',
      expectedChange: 4,
      unit: 'ms',
      horizon: '7 days',
    },
    showWork: 'Sleep duration is one of the strongest predictors of HRV and recovery. Your 12 nights average 6.5 hours with HRV around 37ms. Population research shows 7+ hours optimizes recovery. This relationship is consistent across age groups and fitness levels.',
    actionable: true,
    priority: 1,
  },
  {
    id: 'emma-insight-006',
    personaId: 'emma',
    category: 'activity',
    variableType: 'outcome',  // Daily energy score is a daily outcome
    title: 'MORNING MOVEMENT → ENERGY LEVELS',
    headline: 'Morning activity boosts all-day energy',
    recommendation: 'Add 15-20 min morning walk or exercise',
    explanation: 'Morning movement elevates cortisol and energy for hours',
    causalParams: {
      source: 'morning_active_minutes',
      target: 'daily_energy_score',
      curveType: 'plateau_up',
      theta: {
        value: 20,
        unit: 'minutes',
        low: 15,
        high: 25,
        displayValue: '20 min',
      },
      betaBelow: {
        value: 0.15,
        unit: 'pts',
        description: '+0.15 energy per min activity',
      },
      betaAbove: {
        value: 0.03,
        unit: 'pts',
        description: '+0.03 per min (diminishing)',
      },
      observations: 12,
      completePct: 100,
      changepointProb: 0.85,
      sizeCategory: 'medium',
      currentValue: 8,
      currentStatus: 'below_optimal',
    },
    cause: {
      behavior: 'morning_activity',
      threshold: 20,
      unit: 'minutes',
      direction: 'above',
    },
    outcome: {
      metric: 'energy_score',
      effect: '+1.5 points with morning activity',
      direction: 'positive',
    },
    certainty: 0.76,
    evidence: {
      personalDays: 12,
      personalWeight: 0.28,
      populationWeight: 0.72,
      stability: 0.70,
    },
    dataSources: ['fitbit'],
    comparison: {
      before: { value: 5.2, label: 'No morning activity' },
      after: { value: 6.7, label: 'With morning activity' },
    },
    whyNow: 'Your morning activity averages 8 minutes—adding more could boost energy.',
    holdoutPreview: {
      metric: 'energy_score',
      expectedChange: 1,
      unit: 'pts',
      horizon: '7 days',
    },
    showWork: 'Morning exercise elevates cortisol at the optimal time, supporting natural circadian rhythms. Population research shows 15-20 minutes of morning movement significantly improves perceived energy. Your 3 mornings with activity showed higher energy ratings.',
    actionable: true,
    priority: 2,
  },
]

function generateEmmaMetrics(): DailyMetrics[] {
  const metrics: DailyMetrics[] = []
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 12)

  for (let i = 0; i < 12; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]

    // New user pattern: inconsistent, learning
    const bedtimeHour = 22 + Math.floor(Math.random() * 3)  // 10 PM to 1 AM
    const isWeekend = date.getDay() === 0 || date.getDay() === 6

    const metric: DailyMetrics = {
      date: dateStr,
      sleepScore: Math.round(65 + Math.random() * 15),
      sleepDuration: Math.round(360 + Math.random() * 120),
      deepSleep: Math.round(40 + Math.random() * 20),
      remSleep: Math.round(70 + Math.random() * 25),
      lightSleep: Math.round(180 + Math.random() * 60),
      sleepLatency: Math.round(10 + Math.random() * 15),
      sleepEfficiency: 0.78 + Math.random() * 0.12,
      bedtime: `${bedtimeHour}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
      wakeTime: `${7 + Math.floor(Math.random() * 2)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
      hrv: Math.round(35 + Math.random() * 10),
      restingHr: Math.round(65 + Math.random() * 8),
      respiratoryRate: 14 + Math.random() * 1.5,
      bodyTemp: Math.random() * 0.4 - 0.2,
      steps: Math.round(4000 + Math.random() * 6000),
      activeCalories: Math.round(200 + Math.random() * 200),
      moderateMinutes: Math.round(15 + Math.random() * 25),
      vigorousMinutes: Math.round(5 + Math.random() * 15),
      zone2Minutes: Math.round(10 + Math.random() * 20),
      trainingLoad: Math.round(30 + Math.random() * 30),
      caffeineCutoff: `${12 + Math.floor(Math.random() * 6)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
      alcoholUnits: isWeekend ? Math.floor(Math.random() * 3) : 0,
      eatingWindowStart: '08:00',
      eatingWindowEnd: '21:00',
      bedroomTemp: 20 + Math.random() * 3,
      workoutTime: Math.random() > 0.5 ? `${17 + Math.floor(Math.random() * 4)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}` : null,
      workoutType: Math.random() > 0.5 ? ['yoga', 'running', 'gym'][Math.floor(Math.random() * 3)] : null,
      mood: Math.round(4 + Math.random() * 2),
      energy: Math.round(4 + Math.random() * 2),
      focus: Math.round(4 + Math.random() * 2),
      stress: Math.round(3 + Math.random() * 2),
    }

    metrics.push(metric)
  }

  return metrics
}

export const emmaMetrics: DailyMetrics[] = generateEmmaMetrics()

export const emmaLabs: LabResult[] = []  // No bloodwork yet

export const emmaProtocols: Protocol[] = [
  {
    id: 'emma-protocol-sleep-foundation',
    personaId: 'emma',
    name: 'Sleep Foundation Protocol',
    description: 'Build consistent sleep habits for better quality',
    category: 'sleep',
    status: 'suggested',
    outcome: 'sleep_score',
    baseline: {
      value: 71,
      unit: 'score',
    },
    actions: [
      {
        id: 'action-consistent-bedtime',
        label: 'In bed by 10:30 PM',
        category: 'sleep',
        isActive: false,
        impact: 6,
        actionType: 'cutoff',
        time: '10:30 PM',
        linkedInsightId: 'emma-insight-001',
      },
      {
        id: 'action-caffeine-cutoff',
        label: 'No caffeine after 2:00 PM',
        category: 'sleep',
        isActive: false,
        impact: 3,
        actionType: 'cutoff',
        time: '2:00 PM',
        linkedInsightId: 'emma-insight-003',
      },
      {
        id: 'action-screen-free',
        label: 'Screen-free hour before bed',
        category: 'sleep',
        isActive: false,
        impact: 5,
        actionType: 'duration',
        linkedInsightId: 'emma-insight-004',
      },
      {
        id: 'action-sleep-7hrs',
        label: '7+ hours in bed',
        category: 'sleep',
        isActive: false,
        impact: 7,
        actionType: 'target',
        linkedInsightId: 'emma-insight-005',
      },
    ],
    states: [
      { id: 'state-weekend', label: 'Weekend', isActive: false },
    ],
    triggers: [
      {
        if: ['state-weekend'],
        then: ['action-consistent-bedtime'],
        reason: 'Maintain consistent bedtime even on weekends',
      },
    ],
    simulator: {
      deltas: {
        'action-consistent-bedtime': 6,
        'action-caffeine-cutoff': 3,
        'action-screen-free': 5,
        'action-sleep-7hrs': 7,
      },
    },
    evidenceLevel: 75,  // Lower because new user
    difficulty: 2,
  },
  {
    id: 'emma-protocol-energy',
    personaId: 'emma',
    name: 'Daily Energy Protocol',
    description: 'Boost energy through movement and recovery',
    category: 'activity',
    status: 'suggested',
    outcome: 'energy_score',
    baseline: {
      value: 5.2,
      unit: 'score',
    },
    actions: [
      {
        id: 'action-morning-movement',
        label: '20 min morning activity',
        category: 'activity',
        isActive: false,
        impact: 1.5,
        actionType: 'duration',
        linkedInsightId: 'emma-insight-006',
      },
      {
        id: 'action-8k-steps',
        label: '8,000+ steps daily',
        category: 'activity',
        isActive: false,
        impact: 1.2,
        actionType: 'target',
        linkedInsightId: 'emma-insight-002',
      },
      {
        id: 'action-sleep-quality',
        label: '7+ hours quality sleep',
        category: 'sleep',
        isActive: false,
        impact: 0.8,
        actionType: 'target',
        linkedInsightId: 'emma-insight-005',
      },
    ],
    states: [],
    triggers: [],
    simulator: {
      deltas: {
        'action-morning-movement': 1.5,
        'action-8k-steps': 1.2,
        'action-sleep-quality': 0.8,
      },
    },
    evidenceLevel: 72,
    difficulty: 2,
  },
  {
    id: 'emma-protocol-recovery',
    personaId: 'emma',
    name: 'HRV Improvement Protocol',
    description: 'Improve heart rate variability through sleep optimization',
    category: 'recovery',
    status: 'suggested',
    outcome: 'hrv',
    baseline: {
      value: 38,
      unit: 'ms',
    },
    actions: [
      {
        id: 'action-sleep-duration',
        label: '7-8 hours sleep nightly',
        category: 'sleep',
        isActive: false,
        impact: 5,
        actionType: 'target',
        linkedInsightId: 'emma-insight-005',
      },
      {
        id: 'action-bedtime-consistency',
        label: 'Consistent bedtime (within 30 min)',
        category: 'sleep',
        isActive: false,
        impact: 4,
        actionType: 'duration',
        linkedInsightId: 'emma-insight-001',
      },
      {
        id: 'action-morning-walk',
        label: '15-20 min morning walk',
        category: 'activity',
        isActive: false,
        impact: 3,
        actionType: 'duration',
        linkedInsightId: 'emma-insight-006',
      },
    ],
    states: [],
    triggers: [],
    simulator: {
      deltas: {
        'action-sleep-duration': 5,
        'action-bedtime-consistency': 4,
        'action-morning-walk': 3,
      },
    },
    evidenceLevel: 78,
    difficulty: 2,
  },
]

export const emmaDailyPlan: DailyPlan = {
  personaId: 'emma',
  date: new Date().toISOString().split('T')[0],
  greeting: 'Good morning, Emma! We\'re still learning your patterns—here are some science-backed suggestions.',
  priorities: {
    high: [
      {
        id: 'plan-001',
        text: 'Try going to bed at 10:30 PM tonight',
        explanation: 'Bedtime consistency is one of the highest-impact sleep factors',
        evidenceWeight: '35% your data, 65% population research',
        status: 'pending',
      },
    ],
    moderate: [
      {
        id: 'plan-002',
        text: 'Aim for 8,000+ steps today',
        explanation: 'Movement helps with energy and sleep quality',
        evidenceWeight: '28% your data, 72% population research',
        status: 'pending',
      },
      {
        id: 'plan-003',
        text: 'Cut caffeine after 2 PM',
        explanation: 'This is the population average—we\'ll find your threshold soon',
        evidenceWeight: '18% your data, 82% population research',
        status: 'pending',
      },
    ],
    maintain: [
      {
        id: 'plan-004',
        text: 'Keep wearing your Apple Watch to bed',
        explanation: 'More data = more personalized insights in 2-3 weeks',
        evidenceWeight: 'Data collection',
        status: 'pending',
      },
    ],
  },
  eveningCheckIn: {
    completed: [],
    pending: [],
    prediction: {
      sleepScore: 73,
      deepSleep: 48,
      sleepLatency: 12,
      confidence: 0.55,  // Lower confidence due to limited data
    },
  },
}
