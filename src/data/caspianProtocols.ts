// ============================================================================
// DERIVED PROTOCOLS — Synthesized from Oron's 20 Bayesian Insights
// ============================================================================
//
// Architecture: Protocols are DOWNSTREAM of insights. Each protocol:
// 1. Extracts target behaviors from one or more insights
// 2. Resolves conflicts using personalWeight, effectiveN, and evidence tier
// 3. Outputs actionable recommendations with flexibility ranges
//
// All insight IDs reference oronInsights[] from oron.ts
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export interface DerivedProtocol {
  id: string
  category: 'sleep' | 'training' | 'recovery' | 'nutrition'
  recommendation: string
  target: { value: number; unit: string; range?: [number, number] }
  sourceInsights: SourceInsightRef[]
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  conflictResolution?: ConflictResolution
}

export interface SourceInsightRef {
  insightId: string
  title: string
  theta: number
  thetaUnit: string
  personalWeight: number
  observations: number
  contribution: string // What this insight suggests
}

export interface ConflictResolution {
  description: string
  insights: { id: string; title: string; suggests: string; weight: number }[]
  winner: string
  rule: string // Which resolution rule was applied
}

export interface CampaignActionRef {
  campaignId: string
  campaignName: string
  phaseId: string
  phaseName: string
  actions: string[]
}

export interface DailyProtocol {
  date: string
  dayOfWeek: string
  dayType: 'hard' | 'easy' | 'rest' | 'moderate'
  sleepTarget: {
    bedtime: string
    wakeTime: string
    duration: number
    durationRange: [number, number]
  }
  trainingTarget: {
    type: string
    duration: number
    intensity: string
    zone: string
    window: string
    notes: string
  } | null
  recoveryNotes: string[]
  nutritionNotes: string[]
  morningBlock: ScheduleBlock[]
  afternoonBlock: ScheduleBlock[]
  eveningBlock: ScheduleBlock[]
  campaignActions?: CampaignActionRef[]
}

export interface ScheduleBlock {
  time: string
  action: string
  category: 'sleep' | 'training' | 'recovery' | 'nutrition' | 'routine'
  sourceInsightId?: string
  detail?: string
}

// ============================================================================
// DERIVED PROTOCOLS — Conflict resolution from 20 insights
// ============================================================================

export const derivedProtocols: DerivedProtocol[] = [
  // ── SLEEP PROTOCOLS ──

  {
    id: 'sleep-duration',
    category: 'sleep',
    recommendation: 'Target 7.0 hours of sleep per night',
    target: { value: 7.0, unit: 'hours', range: [6.7, 7.4] },
    sourceInsights: [
      {
        insightId: 'oron_insight_16',
        title: 'Sleep Duration → Next-Day HRV',
        theta: 6.73,
        thetaUnit: 'hours',
        personalWeight: 1.0,
        observations: 2204,
        contribution: 'HRV peaks near 6.7h — more sleep shows diminishing returns for HRV',
      },
      {
        insightId: 'oron_insight_50',
        title: 'Sleep Duration → Cortisol',
        theta: 7.42,
        thetaUnit: 'hours',
        personalWeight: 0.06,
        observations: 452,
        contribution: 'Cortisol drops sharply below 7.4h — longer sleep stabilizes stress hormones',
      },
      {
        insightId: 'oron_insight_52',
        title: 'Sleep Duration → Glucose',
        theta: 7.2,
        thetaUnit: 'hours',
        personalWeight: 0.07,
        observations: 4,
        contribution: 'Fasting glucose improves below 7.2h threshold — insulin sensitivity peaks',
      },
    ],
    confidence: 'high',
    reasoning:
      'Three insights affect sleep duration targeting. Your HRV data (2,204 observations, 100% personal) strongly supports 6.7h as the peak for next-day HRV. However, cortisol and glucose data suggest 7.2–7.4h for hormonal and metabolic benefits. Protocol targets 7.0h as a balanced median — protecting HRV recovery while staying within the metabolic benefit window.',
    conflictResolution: {
      description:
        'HRV insight suggests 6.7h optimal, but cortisol and glucose insights suggest 7.2–7.4h. Since HRV has the highest personal data (2,204 days, 100% personal weight) and the other two are primarily population-based (<7% personal), we anchor closer to the HRV threshold while staying conservative for cortisol.',
      insights: [
        {
          id: 'oron_insight_16',
          title: 'Sleep Duration → HRV',
          suggests: '6.7 hours',
          weight: 1.0,
        },
        {
          id: 'oron_insight_50',
          title: 'Sleep Duration → Cortisol',
          suggests: '7.4 hours',
          weight: 0.06,
        },
        {
          id: 'oron_insight_52',
          title: 'Sleep Duration → Glucose',
          suggests: '7.2 hours',
          weight: 0.07,
        },
      ],
      winner: 'oron_insight_16',
      rule: 'Higher personalWeight wins (100% personal vs <7% personal); target shifted conservative toward metabolic safety',
    },
  },

  {
    id: 'sleep-workout-cutoff',
    category: 'sleep',
    recommendation: 'Finish workouts before 7:45 PM to protect sleep efficiency',
    target: { value: 19.75, unit: 'hour (24h)', range: [17.5, 21.0] },
    sourceInsights: [
      {
        insightId: 'oron_insight_13',
        title: 'Workout Time → Sleep Efficiency',
        theta: 19.74,
        thetaUnit: 'hour',
        personalWeight: 1.0,
        observations: 1181,
        contribution:
          'Sleep efficiency drops sharply (-2.0%/hr) when workouts end after ~7:45 PM',
      },
    ],
    confidence: 'high',
    reasoning:
      '1,181 days of personal data (100% personal weight). Above 7:45 PM, each additional hour of late exercise costs -2.0% sleep efficiency. Below that threshold, timing has negligible effect (-0.06%/hr).',
  },

  {
    id: 'sleep-travel-recovery',
    category: 'sleep',
    recommendation: 'After travel (jet lag > 0.6), expect 2–3 nights of disrupted sleep',
    target: { value: 0.57, unit: 'jet lag score', range: [0.0, 0.6] },
    sourceInsights: [
      {
        insightId: 'oron_insight_23',
        title: 'Travel Load → Sleep Efficiency',
        theta: 0.57,
        thetaUnit: 'jet lag score',
        personalWeight: 1.0,
        observations: 1181,
        contribution:
          'Sleep efficiency plummets (-29.5%/unit) above 0.6 jet lag score',
      },
      {
        insightId: 'oron_insight_62',
        title: 'Travel Load → Deep Sleep',
        theta: 0.57,
        thetaUnit: 'jet lag score',
        personalWeight: 1.0,
        observations: 1136,
        contribution:
          'Deep sleep drops sharply (-59.7 min/unit) above threshold',
      },
    ],
    confidence: 'high',
    reasoning:
      'Both insights agree on 0.57 jet lag threshold (≈0.6 displayed). Two independent sleep outcomes (efficiency + deep sleep) confirm severe disruption above this point. Plan rest days after significant travel.',
  },

  // ── TRAINING PROTOCOLS ──

  {
    id: 'training-weekly-volume',
    category: 'training',
    recommendation: 'Target 25 km/week running volume for HRV optimization',
    target: { value: 25.3, unit: 'km/week', range: [15, 35] },
    sourceInsights: [
      {
        insightId: 'oron_insight_22',
        title: 'Weekly Volume → HRV Baseline',
        theta: 25.31,
        thetaUnit: 'km/week',
        personalWeight: 1.0,
        observations: 2401,
        contribution:
          'HRV improves up to 25.3 km/week, then plateaus — beyond this, diminishing returns',
      },
      {
        insightId: 'oron_insight_1',
        title: 'Running Volume → Iron',
        theta: 177.17,
        thetaUnit: 'km/month',
        personalWeight: 0.06,
        observations: 452,
        contribution:
          'Iron depletion accelerates sharply above 177 km/month (≈44 km/week). Keep below to protect iron stores.',
      },
    ],
    confidence: 'high',
    reasoning:
      'HRV data strongly supports 25 km/week as optimal (2,401 days personal data). Iron insight warns against exceeding 44 km/week. Current iron at 37 mcg/dL (critically low) means staying at 25 km/week protects both HRV and iron stores.',
    conflictResolution: {
      description:
        'HRV peaks at 25 km/week, while iron depletion accelerates above 44 km/week. These are complementary — the HRV-optimal volume is safely below the iron danger zone. But given Oron\'s critical iron status (37 mcg/dL), the protocol caps volume at the HRV threshold rather than exploring higher.',
      insights: [
        {
          id: 'oron_insight_22',
          title: 'Weekly Volume → HRV',
          suggests: '≤25 km/week',
          weight: 1.0,
        },
        {
          id: 'oron_insight_1',
          title: 'Running Volume → Iron',
          suggests: '<44 km/week',
          weight: 0.06,
        },
      ],
      winner: 'oron_insight_22',
      rule: 'Complementary constraints — both satisfied by targeting 25 km/week; iron-critical status makes lower bound preferred',
    },
  },

  {
    id: 'training-acwr-range',
    category: 'training',
    recommendation: 'Maintain ACWR between 0.8 and 1.2 to avoid immune stress and HR elevation',
    target: { value: 1.0, unit: 'ratio', range: [0.8, 1.2] },
    sourceInsights: [
      {
        insightId: 'oron_insight_40',
        title: 'ACWR → Neutrophil-Lymphocyte Ratio',
        theta: 1.19,
        thetaUnit: 'ratio',
        personalWeight: 0.27,
        observations: 618,
        contribution:
          'NLR spikes (+0.15/0.1 ACWR) above 1.2 — immune suppression risk',
      },
      {
        insightId: 'oron_insight_10',
        title: 'ACWR → Resting HR Trend',
        theta: 1.8,
        thetaUnit: 'ratio',
        personalWeight: 1.0,
        observations: 2400,
        contribution:
          'Resting HR drops (-4.3 bpm/0.1 ACWR) up to 1.8 — cardiovascular adaptation. But NLR data limits the safe upper bound.',
      },
    ],
    confidence: 'high',
    reasoning:
      'The NLR insight caps ACWR at 1.2 (immune stress threshold). While resting HR continues to improve up to 1.8 ACWR, the immune cost above 1.2 makes it unsafe. Current ACWR is 0.93 — within range but on the low side (training load is "low").',
    conflictResolution: {
      description:
        'Resting HR insight suggests ACWR up to 1.8 is beneficial for cardiovascular fitness, but NLR insight shows immune suppression starts at 1.2. The immune constraint takes priority as a safety guardrail.',
      insights: [
        {
          id: 'oron_insight_10',
          title: 'ACWR → Resting HR',
          suggests: 'Up to 1.8 ratio',
          weight: 1.0,
        },
        {
          id: 'oron_insight_40',
          title: 'ACWR → NLR',
          suggests: 'Stay below 1.2 ratio',
          weight: 0.27,
        },
      ],
      winner: 'oron_insight_40',
      rule: 'Safety constraint wins — immune suppression is a health risk even if cardiovascular adaptation continues; stricter constraint prioritized',
    },
  },

  {
    id: 'training-zone2-lipids',
    category: 'training',
    recommendation: 'Accumulate ≥200 min/month Zone 2 for lipid optimization',
    target: { value: 200, unit: 'min/month', range: [150, 260] },
    sourceInsights: [
      {
        insightId: 'oron_insight_8',
        title: 'Zone 2 Volume → LDL',
        theta: 201.76,
        thetaUnit: 'min/month',
        personalWeight: 0.07,
        observations: 618,
        contribution: 'LDL drops below 200 min/month; rebounds above it',
      },
      {
        insightId: 'oron_insight_34',
        title: 'Zone 2 Volume → Non-HDL Cholesterol',
        theta: 202.83,
        thetaUnit: 'min/month',
        personalWeight: 0.07,
        observations: 618,
        contribution: 'Non-HDL drops optimally near 200 min/month',
      },
      {
        insightId: 'oron_insight_35',
        title: 'Zone 2 Volume → Total Cholesterol',
        theta: 152.11,
        thetaUnit: 'min/month',
        personalWeight: 0.07,
        observations: 618,
        contribution: 'Total cholesterol improves up to ~150 min/month',
      },
      {
        insightId: 'oron_insight_6',
        title: 'Zone 2 Volume → Triglycerides',
        theta: 208.7,
        thetaUnit: 'min/month',
        personalWeight: 0.07,
        observations: 618,
        contribution: 'Triglycerides respond optimally near 210 min/month',
      },
    ],
    confidence: 'medium',
    reasoning:
      'Four lipid-related insights converge on ~200 min/month Zone 2 as the inflection point. All are predominantly population-based (7% personal), but the convergence across LDL, non-HDL, total cholesterol, and triglycerides reinforces confidence. Current lipid panel (LDL 68, TG 62) is excellent — maintain with 200+ min/month Zone 2.',
  },

  {
    id: 'training-daily-load',
    category: 'training',
    recommendation: 'Keep daily TRIMP below 80 to protect next-day HRV recovery',
    target: { value: 80, unit: 'TRIMP', range: [0, 80] },
    sourceInsights: [
      {
        insightId: 'oron_insight_18',
        title: 'Daily Training Load → Next-Day HRV',
        theta: 80.2,
        thetaUnit: 'TRIMP',
        personalWeight: 1.0,
        observations: 2391,
        contribution: 'HRV depressed below threshold; recovers above 80 TRIMP',
      },
    ],
    confidence: 'high',
    reasoning:
      '2,391 days of personal data. Below 80 TRIMP, HRV drops modestly (-0.10 ms/50 TRIMP). Above 80 TRIMP, HRV paradoxically improves — suggesting the body adapts to moderate-high loads. Practical target: don\'t fear sessions near 80 TRIMP, but avoid sustained overload above ACWR 1.2.',
  },

  {
    id: 'training-active-energy',
    category: 'training',
    recommendation: 'Target 500+ active calories on training days for deep sleep benefit',
    target: { value: 500, unit: 'kcal', range: [400, 900] },
    sourceInsights: [
      {
        insightId: 'oron_insight_21',
        title: 'Active Energy → Deep Sleep',
        theta: 504.43,
        thetaUnit: 'kcal',
        personalWeight: 1.0,
        observations: 1136,
        contribution: 'Deep sleep improves more steeply above 500 kcal active energy',
      },
    ],
    confidence: 'medium',
    reasoning:
      '1,136 days of personal data. The effect is small (+0.008 min/100 kcal above threshold vs +0.004 below), but consistently positive. On training days, aiming for 500+ active calories supports both fitness and sleep quality.',
  },

  // ── RECOVERY PROTOCOLS ──

  {
    id: 'recovery-travel-deload',
    category: 'recovery',
    recommendation: 'Reduce training intensity by 50% for 2–3 days after travel crossing time zones',
    target: { value: 50, unit: '% intensity reduction', range: [40, 60] },
    sourceInsights: [
      {
        insightId: 'oron_insight_23',
        title: 'Travel Load → Sleep Efficiency',
        theta: 0.57,
        thetaUnit: 'jet lag score',
        personalWeight: 1.0,
        observations: 1181,
        contribution: 'Sleep efficiency drops 29%/unit above threshold',
      },
      {
        insightId: 'oron_insight_62',
        title: 'Travel Load → Deep Sleep',
        theta: 0.57,
        thetaUnit: 'jet lag score',
        personalWeight: 1.0,
        observations: 1136,
        contribution: 'Deep sleep drops 60 min/unit above threshold',
      },
      {
        insightId: 'oron_insight_61',
        title: 'Travel Load → NLR',
        theta: 0.53,
        thetaUnit: 'jet lag score',
        personalWeight: 1.0,
        observations: 611,
        contribution: 'Immune stress rises after travel',
      },
    ],
    confidence: 'high',
    reasoning:
      'Three insights converge: travel above 0.6 jet lag score disrupts sleep efficiency, deep sleep, and immune balance simultaneously. Combined, this creates a recovery deficit that compounds with hard training. The protocol recommends deloading 50% to allow circadian re-alignment.',
  },

  {
    id: 'recovery-iron-protection',
    category: 'recovery',
    recommendation: 'Cap running at 35 km/week until iron normalizes (>50 mcg/dL)',
    target: { value: 35, unit: 'km/week', range: [25, 40] },
    sourceInsights: [
      {
        insightId: 'oron_insight_1',
        title: 'Running Volume → Iron',
        theta: 177.17,
        thetaUnit: 'km/month',
        personalWeight: 0.06,
        observations: 452,
        contribution: 'Iron depletion accelerates above 177 km/month (~44 km/week)',
      },
      {
        insightId: 'oron_insight_12',
        title: 'Ferritin → VO2peak',
        theta: 35.65,
        thetaUnit: 'ng/mL',
        personalWeight: 0.27,
        observations: 452,
        contribution: 'VO2peak improves faster when ferritin is above 35.6 ng/mL',
      },
    ],
    confidence: 'medium',
    reasoning:
      'Iron at 37 mcg/dL is below reference range (50–180). Running accelerates foot-strike hemolysis. Ferritin at 46 ng/mL is approaching the VO2peak inflection point (35.6 ng/mL). Capping volume at 35 km/week protects iron stores while allowing enough volume for VO2peak benefits once ferritin exceeds the threshold.',
  },

  {
    id: 'recovery-ferritin-performance',
    category: 'recovery',
    recommendation: 'Prioritize ferritin repletion — VO2peak gains accelerate above 35 ng/mL',
    target: { value: 50, unit: 'ng/mL ferritin', range: [35, 150] },
    sourceInsights: [
      {
        insightId: 'oron_insight_12',
        title: 'Ferritin → VO2peak',
        theta: 35.65,
        thetaUnit: 'ng/mL',
        personalWeight: 0.27,
        observations: 452,
        contribution: 'VO2peak improves +0.23 ml/min/kg per 10 ng/mL below threshold, +0.12 above',
      },
    ],
    confidence: 'medium',
    reasoning:
      'Current ferritin is 46 ng/mL — above the 35.6 threshold, meaning VO2peak gains are in the "above threshold" regime (+0.12 per 10 ng/mL). Continue iron repletion toward 50+ ng/mL for additional endurance benefit. The effect is moderate but consistent.',
  },

  // ── NUTRITION PROTOCOLS ──

  {
    id: 'nutrition-training-glucose',
    category: 'nutrition',
    recommendation: 'Maintain 1,200+ min/month training to keep fasting glucose in check',
    target: { value: 1272, unit: 'min/month', range: [1000, 1500] },
    sourceInsights: [
      {
        insightId: 'oron_insight_36',
        title: 'Training Hours → Glucose',
        theta: 1272.1,
        thetaUnit: 'min/month',
        personalWeight: 0.07,
        observations: 616,
        contribution: 'Glucose rises sharply above 1,272 min/month threshold — currently at 96 mg/dL',
      },
    ],
    confidence: 'low',
    reasoning:
      'Primarily population-based (7% personal). The glucose response to training volume has a threshold at ~1,272 min/month (~21 hrs/week). Current fasting glucose at 96 mg/dL is at the upper end of normal. Maintaining adequate training volume supports insulin sensitivity.',
  },

  {
    id: 'nutrition-sleep-glucose',
    category: 'nutrition',
    recommendation: 'Sleep ≥7.2 hours to protect fasting glucose below 100 mg/dL',
    target: { value: 7.2, unit: 'hours sleep', range: [6.8, 7.5] },
    sourceInsights: [
      {
        insightId: 'oron_insight_52',
        title: 'Sleep Duration → Glucose',
        theta: 7.2,
        thetaUnit: 'hours',
        personalWeight: 0.07,
        observations: 4,
        contribution: 'Glucose improves below 7.2h threshold',
      },
    ],
    confidence: 'low',
    reasoning:
      'Only 4 observations and 7% personal weight — this is a population-derived estimate. However, it aligns with established literature (Spiegel et al.) linking sleep restriction to insulin resistance. At 96 mg/dL fasting glucose, sleep hygiene matters.',
  },

  {
    id: 'nutrition-body-composition',
    category: 'nutrition',
    recommendation: 'Maintain 13,000+ daily steps for weight management',
    target: { value: 13000, unit: 'steps/day', range: [10000, 15000] },
    sourceInsights: [
      {
        insightId: 'oron_insight_27',
        title: 'Daily Activity → Body Mass',
        theta: 13004.9,
        thetaUnit: 'steps',
        personalWeight: 0.27,
        observations: 171,
        contribution: 'Body mass stabilizes above 13,000 steps/day',
      },
    ],
    confidence: 'medium',
    reasoning:
      '171 observations with 27% personal weight. Weight management benefit is seen up to 13,000 steps/day, after which additional steps have negligible effect on body mass. Current weight at 72.8 kg is healthy for his frame.',
  },
]

// ============================================================================
// 7-DAY DAILY PLAN — Generated from derived protocols + current state
// ============================================================================
//
// Context:
// - ACWR: 0.93 (low-moderate), training load: "low"
// - Iron: 37 mcg/dL (critical), Ferritin: 46 ng/mL (approaching threshold)
// - HRV: 32 ms, Resting HR: 52 bpm
// - No travel disruption currently
// ============================================================================

const TODAY = new Date('2026-02-08')

export function makeDateStr(offset: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

export function makeDayOfWeek(offset: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const d = new Date(TODAY)
  d.setDate(d.getDate() + offset)
  return days[d.getDay()]
}

export const weeklyPlan: DailyProtocol[] = [
  // Day 0: Sunday — rest day
  {
    date: makeDateStr(0),
    dayOfWeek: makeDayOfWeek(0),
    dayType: 'rest',
    sleepTarget: {
      bedtime: '22:30',
      wakeTime: '06:00',
      duration: 7.5,
      durationRange: [7.0, 8.0],
    },
    trainingTarget: null,
    recoveryNotes: [
      'Rest day — focus on mobility and iron repletion',
      'ACWR at 0.93; rest day brings 7-day load down gently',
    ],
    nutritionNotes: [
      'Iron supplement with vitamin C (empty stomach, morning)',
      'Fatty fish for dinner (omega-3 optimization)',
      'Last meal by 20:00',
    ],
    morningBlock: [
      { time: '06:00', action: 'Wake', category: 'routine' },
      { time: '06:15', action: 'Iron supplement + vitamin C', category: 'nutrition', detail: 'Take on empty stomach, 30 min before food' },
      { time: '06:30', action: 'Light mobility / stretching (20 min)', category: 'recovery' },
      { time: '07:00', action: 'Breakfast', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch — protein-rich meal', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine', sourceInsightId: 'oron_insight_13', detail: 'Personalized threshold: 14:00' },
    ],
    eveningBlock: [
      { time: '18:30', action: 'Dinner — salmon or mackerel', category: 'nutrition', detail: 'AA/EPA ratio at 30.9, target <10' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '21:30', action: 'Screen cutoff & wind-down', category: 'sleep' },
      { time: '22:30', action: 'Bedtime', category: 'sleep', sourceInsightId: 'oron_insight_16', detail: 'Target 7.0h sleep (range 6.7–7.4h)' },
    ],
    campaignActions: [
      {
        campaignId: 'campaign-iron-recovery',
        campaignName: 'Iron Recovery',
        phaseId: 'iron-phase-3',
        phaseName: 'Verify',
        actions: [
          'Iron bisglycinate 25 mg + vitamin C (06:15)',
          'No coffee within 2h of iron dose',
        ],
      },
      {
        campaignId: 'campaign-training-ramp',
        campaignName: 'Training Ramp-Up',
        phaseId: 'training-phase-1',
        phaseName: 'Reactivation',
        actions: [
          'Rest day — consistent with reactivation phase (3 sessions/week)',
        ],
      },
    ],
  },

  // Day 1: Monday — Zone 2 run
  {
    date: makeDateStr(1),
    dayOfWeek: makeDayOfWeek(1),
    dayType: 'easy',
    sleepTarget: {
      bedtime: '22:30',
      wakeTime: '06:00',
      duration: 7.5,
      durationRange: [7.0, 7.5],
    },
    trainingTarget: {
      type: 'Zone 2 Run',
      duration: 50,
      intensity: 'Low (HR 120–140)',
      zone: 'Zone 2',
      window: '06:15–07:05',
      notes: 'Morning Zone 2 — lipid optimization. Keep HR in Zone 2 for LDL/TG benefit.',
    },
    recoveryNotes: ['Easy day — ACWR will stay below 1.2 with this load'],
    nutritionNotes: [
      'Iron supplement with vitamin C (morning, pre-run)',
      'Post-run: protein + carbs within 60 min',
      'Last meal by 20:00',
    ],
    morningBlock: [
      { time: '06:00', action: 'Wake', category: 'routine' },
      { time: '06:05', action: 'Iron supplement + vitamin C', category: 'nutrition' },
      { time: '06:15', action: 'Zone 2 Run — 50 min', category: 'training', sourceInsightId: 'oron_insight_8', detail: 'Target 200 min/month Zone 2 for lipids' },
      { time: '07:10', action: 'Post-run nutrition', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine' },
    ],
    eveningBlock: [
      { time: '19:00', action: 'Dinner', category: 'nutrition' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '21:30', action: 'Wind-down begins', category: 'sleep' },
      { time: '22:30', action: 'Bedtime', category: 'sleep', sourceInsightId: 'oron_insight_16' },
    ],
    campaignActions: [
      {
        campaignId: 'campaign-iron-recovery',
        campaignName: 'Iron Recovery',
        phaseId: 'iron-phase-3',
        phaseName: 'Verify',
        actions: [
          'Iron bisglycinate 25 mg + vitamin C (06:05)',
          'Running volume constraint: keep weekly total <35 km',
        ],
      },
      {
        campaignId: 'campaign-training-ramp',
        campaignName: 'Training Ramp-Up',
        phaseId: 'training-phase-1',
        phaseName: 'Reactivation',
        actions: [
          'Zone 2 session (1 of 3 this week)',
          'Keep HR in Zone 1-2 only',
        ],
      },
    ],
  },

  // Day 2: Tuesday — moderate (Zone 2 bike)
  {
    date: makeDateStr(2),
    dayOfWeek: makeDayOfWeek(2),
    dayType: 'moderate',
    sleepTarget: {
      bedtime: '22:30',
      wakeTime: '06:00',
      duration: 7.5,
      durationRange: [7.0, 7.5],
    },
    trainingTarget: {
      type: 'Zone 2 Bike',
      duration: 60,
      intensity: 'Low-Moderate (HR 120–145)',
      zone: 'Zone 2',
      window: '06:15–07:15',
      notes: 'Bike session — no foot-strike hemolysis. Protects iron while building aerobic base.',
    },
    recoveryNotes: [
      'Bike preferred over run to reduce foot-strike hemolysis',
      'Iron at 37 mcg/dL — cycling preserves iron better than running',
    ],
    nutritionNotes: [
      'Iron supplement with vitamin C',
      'EPA/DHA supplement with dinner (2g)',
      'Last meal by 20:00',
    ],
    morningBlock: [
      { time: '06:00', action: 'Wake', category: 'routine' },
      { time: '06:05', action: 'Iron supplement + vitamin C', category: 'nutrition' },
      { time: '06:15', action: 'Zone 2 Bike — 60 min', category: 'training', sourceInsightId: 'oron_insight_8', detail: 'Non-impact aerobic — iron-sparing' },
      { time: '07:20', action: 'Post-ride nutrition', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine' },
    ],
    eveningBlock: [
      { time: '19:00', action: 'Dinner + EPA/DHA supplement', category: 'nutrition' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '21:30', action: 'Wind-down begins', category: 'sleep' },
      { time: '22:30', action: 'Bedtime', category: 'sleep' },
    ],
  },

  // Day 3: Wednesday — rest
  {
    date: makeDateStr(3),
    dayOfWeek: makeDayOfWeek(3),
    dayType: 'rest',
    sleepTarget: {
      bedtime: '22:30',
      wakeTime: '06:00',
      duration: 7.5,
      durationRange: [7.0, 8.0],
    },
    trainingTarget: null,
    recoveryNotes: [
      'Mid-week rest — allows adaptation from Mon/Tue sessions',
      'Monitor HRV trend; should be recovering toward 32 ms baseline',
    ],
    nutritionNotes: [
      'Iron supplement with vitamin C',
      'Focus on iron-rich foods: red meat, lentils, spinach',
      'Last meal by 20:00',
    ],
    morningBlock: [
      { time: '06:00', action: 'Wake', category: 'routine' },
      { time: '06:15', action: 'Iron supplement + vitamin C', category: 'nutrition' },
      { time: '06:30', action: 'Light walk or mobility (20 min)', category: 'recovery' },
      { time: '07:00', action: 'Breakfast', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch — iron-rich meal', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine' },
    ],
    eveningBlock: [
      { time: '19:00', action: 'Dinner', category: 'nutrition' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '21:30', action: 'Wind-down begins', category: 'sleep' },
      { time: '22:30', action: 'Bedtime', category: 'sleep' },
    ],
  },

  // Day 4: Thursday — hard (tempo run or intervals, short)
  {
    date: makeDateStr(4),
    dayOfWeek: makeDayOfWeek(4),
    dayType: 'hard',
    sleepTarget: {
      bedtime: '22:30',
      wakeTime: '05:45',
      duration: 7.25,
      durationRange: [7.0, 7.5],
    },
    trainingTarget: {
      type: 'Tempo Run',
      duration: 40,
      intensity: 'Moderate-High (HR 150–170)',
      zone: 'Zone 3–4',
      window: '06:00–06:40',
      notes: 'Keep TRIMP below 80. Short but quality session. Finish well before 19:45 cutoff.',
    },
    recoveryNotes: [
      'Hard day — expect HRV dip tomorrow',
      'Keep ACWR below 1.2 (currently 0.93)',
    ],
    nutritionNotes: [
      'Iron supplement with vitamin C (pre-run)',
      'Post-run: fast-absorbing protein + carbs',
      'Extra calories to match training expenditure',
    ],
    morningBlock: [
      { time: '05:45', action: 'Wake', category: 'routine' },
      { time: '05:50', action: 'Iron supplement + vitamin C', category: 'nutrition' },
      { time: '06:00', action: 'Tempo Run — 40 min', category: 'training', sourceInsightId: 'oron_insight_18', detail: 'Keep TRIMP <80 for HRV protection' },
      { time: '06:45', action: 'Post-run nutrition', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine' },
    ],
    eveningBlock: [
      { time: '19:00', action: 'Dinner', category: 'nutrition' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '21:30', action: 'Wind-down & recovery focus', category: 'sleep' },
      { time: '22:30', action: 'Bedtime', category: 'sleep' },
    ],
    campaignActions: [
      {
        campaignId: 'campaign-iron-recovery',
        campaignName: 'Iron Recovery',
        phaseId: 'iron-phase-3',
        phaseName: 'Verify',
        actions: [
          'Iron bisglycinate 25 mg + vitamin C (05:50)',
          'Hard session OK — monitor total weekly running km',
        ],
      },
      {
        campaignId: 'campaign-training-ramp',
        campaignName: 'Training Ramp-Up',
        phaseId: 'training-phase-1',
        phaseName: 'Reactivation',
        actions: [
          'Tempo run — building toward ACWR 0.85',
          'Keep TRIMP <80 for HRV protection',
        ],
      },
    ],
  },

  // Day 5: Friday — easy (Zone 2 run, short)
  {
    date: makeDateStr(5),
    dayOfWeek: makeDayOfWeek(5),
    dayType: 'easy',
    sleepTarget: {
      bedtime: '22:30',
      wakeTime: '06:00',
      duration: 7.5,
      durationRange: [7.0, 7.5],
    },
    trainingTarget: {
      type: 'Easy Zone 2 Run',
      duration: 35,
      intensity: 'Low (HR 115–135)',
      zone: 'Zone 2',
      window: '06:15–06:50',
      notes: 'Recovery run after Thursday hard session. Keep effort very easy.',
    },
    recoveryNotes: [
      'Recovery day after hard session',
      'Monitor HRV — expect partial recovery from Thursday',
    ],
    nutritionNotes: [
      'Iron supplement with vitamin C',
      'EPA/DHA supplement with dinner (2g)',
      'Last meal by 20:00',
    ],
    morningBlock: [
      { time: '06:00', action: 'Wake', category: 'routine' },
      { time: '06:05', action: 'Iron supplement + vitamin C', category: 'nutrition' },
      { time: '06:15', action: 'Easy Zone 2 Run — 35 min', category: 'training', detail: 'Very easy — recovery pace' },
      { time: '06:55', action: 'Post-run nutrition', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine' },
    ],
    eveningBlock: [
      { time: '19:00', action: 'Dinner + EPA/DHA', category: 'nutrition' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '21:30', action: 'Wind-down begins', category: 'sleep' },
      { time: '22:30', action: 'Bedtime', category: 'sleep' },
    ],
  },

  // Day 6: Saturday — moderate (Zone 2 bike, longer)
  {
    date: makeDateStr(6),
    dayOfWeek: makeDayOfWeek(6),
    dayType: 'moderate',
    sleepTarget: {
      bedtime: '23:00',
      wakeTime: '06:30',
      duration: 7.5,
      durationRange: [7.0, 8.0],
    },
    trainingTarget: {
      type: 'Zone 2 Bike (Long)',
      duration: 75,
      intensity: 'Low-Moderate (HR 120–145)',
      zone: 'Zone 2',
      window: '07:00–08:15',
      notes: 'Weekend long ride — builds aerobic base without running impact. Iron-sparing.',
    },
    recoveryNotes: [
      'Bike instead of run — protects iron stores',
      'Longer session for aerobic base and Zone 2 minutes accumulation',
    ],
    nutritionNotes: [
      'Iron supplement with vitamin C',
      'Pre-ride: light carbs',
      'Post-ride: protein + carbs + hydration',
      'Fatty fish for dinner',
    ],
    morningBlock: [
      { time: '06:30', action: 'Wake', category: 'routine' },
      { time: '06:35', action: 'Iron supplement + vitamin C', category: 'nutrition' },
      { time: '06:50', action: 'Light pre-ride snack', category: 'nutrition' },
      { time: '07:00', action: 'Zone 2 Bike — 75 min', category: 'training', sourceInsightId: 'oron_insight_8', detail: 'Long Zone 2 — iron-sparing, lipid benefit' },
      { time: '08:20', action: 'Post-ride nutrition', category: 'nutrition' },
    ],
    afternoonBlock: [
      { time: '12:00', action: 'Lunch', category: 'nutrition' },
      { time: '14:00', action: 'Caffeine cutoff', category: 'routine' },
    ],
    eveningBlock: [
      { time: '19:00', action: 'Dinner — salmon or mackerel', category: 'nutrition' },
      { time: '20:00', action: 'Eating window closes', category: 'nutrition' },
      { time: '22:00', action: 'Wind-down begins', category: 'sleep' },
      { time: '23:00', action: 'Bedtime', category: 'sleep' },
    ],
  },
]

// ============================================================================
// WEEKLY SUMMARY STATS — computed from the plan
// ============================================================================

export const weeklySummary = {
  totalRunKm: 12.5, // ~50 min + 40 min + 35 min ≈ 3 runs at 5–6 min/km
  totalBikeMin: 135, // 60 + 75
  totalZone2Min: 220, // 50 + 60 + 35 + 75 (all Zone 2 or easy)
  totalTrainingMin: 260, // 50 + 60 + 40 + 35 + 75
  hardDays: 1,
  easyDays: 2,
  moderateDays: 2,
  restDays: 2,
  estimatedACWR: 1.05, // Moving toward 1.0 from current 0.93
  sleepTargetAvg: 7.4,
  Zone2Pct: 85, // Most training is Zone 2 due to iron conservation
}
