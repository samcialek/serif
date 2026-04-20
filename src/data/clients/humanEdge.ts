// Human Edge Client Data Model
// Comprehensive health optimization platform with ~78 biomarkers, wearables, CGM, etc.

import type {
  ClientConfig,
  DataSource,
  XVariable,
  YVariable,
  ClientInsight,
  ClientUser,
  LabBiomarker,
  WearableMetric,
  MedicalDeviceReading,
  Intervention,
} from '@/types/client';

// ============================================================================
// Data Sources Configuration
// ============================================================================

export const humanEdgeDataSources: DataSource[] = [
  {
    id: 'he-ds-labs',
    type: 'pathology-lab',
    name: 'Partner Pathology Labs',
    description:
      'Thyrocare, Metropolis - ~78 biomarkers via PDF/HL7. OCR pipeline (Google Vision + regex) → BigQuery blood_results',
    cadence: 'quarterly',
    pipeline:
      'Lab PDF → Portal/Email → OCR (Vision/Textract) → Validation → BigQuery',
    lastSync: '2025-01-15T08:30:00Z',
    status: 'active',
    recordCount: 15420,
  },
  {
    id: 'he-ds-terra',
    type: 'terra-api',
    name: 'Terra API Aggregator',
    description:
      'Apple Watch, Fitbit, Garmin, Oura - steps, HR, HRV, sleep stages, workouts, stress',
    cadence: 'continuous',
    pipeline:
      'User OAuth → Terra webhook → GCP Pub/Sub → Kafka → BigQuery raw_wearable → daily ETL',
    lastSync: '2025-01-20T06:00:00Z',
    status: 'active',
    recordCount: 2847000,
  },
  {
    id: 'he-ds-cgm',
    type: 'ble-device',
    name: 'CGM (Abbott FreeStyle Libre)',
    description:
      'Continuous glucose monitoring - interstitial glucose every 15 min, TIR/TAR metrics',
    cadence: 'continuous',
    pipeline: 'LibreView Cloud → Terra pull → webhook → BigQuery cgm_readings',
    lastSync: '2025-01-20T05:45:00Z',
    status: 'active',
    recordCount: 892000,
  },
  {
    id: 'he-ds-bp',
    type: 'ble-device',
    name: 'BP Monitor (Omron Connect)',
    description: 'Blood pressure readings - SBP/DBP, HR',
    cadence: 'event-based',
    pipeline: 'Omron Cloud → Terra → BigQuery bp_readings',
    lastSync: '2025-01-19T19:30:00Z',
    status: 'active',
    recordCount: 8450,
  },
  {
    id: 'he-ds-scale',
    type: 'ble-device',
    name: 'Body Composition Scale (Withings)',
    description: 'Weight, body fat %, muscle mass, bone mass, water %',
    cadence: 'event-based',
    pipeline: 'Withings Health Cloud → Terra → BigQuery weight_readings',
    lastSync: '2025-01-20T07:15:00Z',
    status: 'active',
    recordCount: 4200,
  },
  {
    id: 'he-ds-profile',
    type: 'self-report',
    name: 'Profile & Lifestyle Forms',
    description:
      'Demographics, diet, caffeine/alcohol, goals, medications, surgeries',
    cadence: 'event-based',
    pipeline:
      'React-Native form → Firestore user_profile → Cloud Function → BigQuery',
    lastSync: '2025-01-18T14:00:00Z',
    status: 'active',
    recordCount: 1250,
  },
  {
    id: 'he-ds-surveys',
    type: 'self-report',
    name: 'Weekly Micro-Surveys',
    description:
      'Sleep quality, stress, energy, mood - subjective wellbeing tracking',
    cadence: 'weekly',
    pipeline: 'App survey → Firestore → BigQuery survey_responses',
    lastSync: '2025-01-19T20:00:00Z',
    status: 'active',
    recordCount: 18500,
  },
  {
    id: 'he-ds-interventions',
    type: 'intervention',
    name: 'Intervention Catalogue',
    description:
      '1,200 clinician-vetted intervention codes (nutrition, Zone-2, supplements, sleep hygiene)',
    cadence: 'event-based',
    pipeline:
      'PostgreSQL CMS → REST API → BigQuery intervention_events',
    lastSync: '2025-01-20T02:00:00Z',
    status: 'active',
    recordCount: 32000,
  },
  {
    id: 'he-ds-compliance',
    type: 'compliance',
    name: 'Compliance & Behavior Logs',
    description:
      'Adherence tracking - passive detection from wearables + manual confirmations',
    cadence: 'daily',
    pipeline:
      'Compliance micro-service evaluates sensors vs. goal → compliance_log at 02:00 local',
    lastSync: '2025-01-20T02:00:00Z',
    status: 'active',
    recordCount: 156000,
  },
  {
    id: 'he-ds-environment',
    type: 'environment',
    name: 'Environmental Context',
    description: 'Weather (temp, humidity), AQI, daylight hours - nightly pull',
    cadence: 'daily',
    pipeline:
      'OpenWeatherMap/BreezoMeter APIs → nightly cron → BigQuery environment_context',
    lastSync: '2025-01-20T00:00:00Z',
    status: 'active',
    recordCount: 45000,
  },
  {
    id: 'he-ds-engagement',
    type: 'engagement',
    name: 'Engagement & UX Telemetry',
    description: 'Push delivery, open/click rates, screen views',
    cadence: 'real-time',
    pipeline: 'Firebase Cloud Messaging + Analytics → BigQuery eng_events',
    lastSync: '2025-01-20T07:59:00Z',
    status: 'active',
    recordCount: 4250000,
  },
];

// ============================================================================
// X Variables (Predictors/Features)
// ============================================================================

export const humanEdgeXVariables: XVariable[] = [
  // Wearables - Activity
  {
    id: 'x-steps',
    name: 'Daily Steps',
    category: 'Activity',
    dataSource: 'terra-api',
    unit: 'steps',
    description: 'Total daily step count from wearable',
    sampleRate: 'daily',
  },
  {
    id: 'x-active-energy',
    name: 'Active Energy',
    category: 'Activity',
    dataSource: 'terra-api',
    unit: 'kcal',
    description: 'Calories burned through activity',
    sampleRate: 'daily',
  },
  {
    id: 'x-zone2-minutes',
    name: 'Zone 2 Training Minutes',
    category: 'Exercise',
    dataSource: 'terra-api',
    unit: 'minutes',
    description: 'Time spent in aerobic zone (60-70% max HR)',
    sampleRate: 'daily',
  },
  {
    id: 'x-workout-frequency',
    name: 'Workout Frequency',
    category: 'Exercise',
    dataSource: 'terra-api',
    unit: 'sessions/week',
    description: 'Number of logged workouts per week',
    sampleRate: 'weekly',
  },
  // Wearables - Sleep
  {
    id: 'x-sleep-duration',
    name: 'Sleep Duration',
    category: 'Sleep',
    dataSource: 'terra-api',
    unit: 'hours',
    description: 'Total time asleep',
    sampleRate: 'daily',
  },
  {
    id: 'x-deep-sleep',
    name: 'Deep Sleep',
    category: 'Sleep',
    dataSource: 'terra-api',
    unit: 'minutes',
    description: 'Time in deep/slow-wave sleep',
    sampleRate: 'daily',
  },
  {
    id: 'x-rem-sleep',
    name: 'REM Sleep',
    category: 'Sleep',
    dataSource: 'terra-api',
    unit: 'minutes',
    description: 'Time in REM sleep stage',
    sampleRate: 'daily',
  },
  {
    id: 'x-sleep-latency',
    name: 'Sleep Latency',
    category: 'Sleep',
    dataSource: 'terra-api',
    unit: 'minutes',
    description: 'Time to fall asleep',
    sampleRate: 'daily',
  },
  // Wearables - Heart/HRV
  {
    id: 'x-hrv',
    name: 'Heart Rate Variability',
    category: 'Recovery',
    dataSource: 'terra-api',
    unit: 'ms RMSSD',
    description: 'Overnight HRV - parasympathetic tone indicator',
    sampleRate: 'daily',
  },
  {
    id: 'x-resting-hr',
    name: 'Resting Heart Rate',
    category: 'Recovery',
    dataSource: 'terra-api',
    unit: 'bpm',
    description: 'Lowest sustained HR during sleep',
    sampleRate: 'daily',
  },
  {
    id: 'x-stress-score',
    name: 'Stress Score',
    category: 'Recovery',
    dataSource: 'terra-api',
    unit: '0-100',
    description: 'Garmin/Fitbit stress index',
    sampleRate: 'daily',
  },
  // CGM
  {
    id: 'x-avg-glucose',
    name: 'Average Glucose',
    category: 'Metabolic',
    dataSource: 'ble-device',
    unit: 'mg/dL',
    description: 'Mean interstitial glucose over 24h',
    sampleRate: '96/day',
  },
  {
    id: 'x-glucose-variability',
    name: 'Glucose Variability',
    category: 'Metabolic',
    dataSource: 'ble-device',
    unit: 'CV%',
    description: 'Coefficient of variation in glucose',
    sampleRate: 'daily',
  },
  {
    id: 'x-time-in-range',
    name: 'Time in Range',
    category: 'Metabolic',
    dataSource: 'ble-device',
    unit: '%',
    description: 'Percentage of time glucose 70-140 mg/dL',
    sampleRate: 'daily',
  },
  {
    id: 'x-dawn-effect',
    name: 'Dawn Phenomenon',
    category: 'Metabolic',
    dataSource: 'ble-device',
    unit: 'mg/dL rise',
    description: 'Morning glucose spike (4-8am)',
    sampleRate: 'daily',
  },
  // Blood Pressure
  {
    id: 'x-systolic',
    name: 'Systolic BP',
    category: 'Cardiovascular',
    dataSource: 'ble-device',
    unit: 'mmHg',
    description: 'Systolic blood pressure',
    sampleRate: 'event-based',
  },
  {
    id: 'x-diastolic',
    name: 'Diastolic BP',
    category: 'Cardiovascular',
    dataSource: 'ble-device',
    unit: 'mmHg',
    description: 'Diastolic blood pressure',
    sampleRate: 'event-based',
  },
  // Body Composition
  {
    id: 'x-weight',
    name: 'Body Weight',
    category: 'Body Composition',
    dataSource: 'ble-device',
    unit: 'kg',
    description: 'Morning fasted weight',
    sampleRate: 'event-based',
  },
  {
    id: 'x-body-fat',
    name: 'Body Fat Percentage',
    category: 'Body Composition',
    dataSource: 'ble-device',
    unit: '%',
    description: 'Bioimpedance-estimated body fat',
    sampleRate: 'event-based',
  },
  // Labs
  {
    id: 'x-hba1c',
    name: 'HbA1c',
    category: 'Metabolic Lab',
    dataSource: 'pathology-lab',
    unit: '%',
    description: 'Glycated hemoglobin - 3mo glucose average',
    sampleRate: 'quarterly',
  },
  {
    id: 'x-fasting-insulin',
    name: 'Fasting Insulin',
    category: 'Metabolic Lab',
    dataSource: 'pathology-lab',
    unit: 'mIU/L',
    description: 'Insulin resistance marker',
    sampleRate: 'quarterly',
  },
  {
    id: 'x-apob',
    name: 'ApoB',
    category: 'Lipid Lab',
    dataSource: 'pathology-lab',
    unit: 'mg/dL',
    description: 'Atherogenic particle count',
    sampleRate: 'quarterly',
  },
  {
    id: 'x-hscrp',
    name: 'hs-CRP',
    category: 'Inflammatory Lab',
    dataSource: 'pathology-lab',
    unit: 'mg/L',
    description: 'High-sensitivity C-reactive protein',
    sampleRate: 'quarterly',
  },
  {
    id: 'x-vitamin-d',
    name: 'Vitamin D (25-OH)',
    category: 'Vitamin Lab',
    dataSource: 'pathology-lab',
    unit: 'ng/mL',
    description: 'Vitamin D status',
    sampleRate: 'quarterly',
  },
  // Environment
  {
    id: 'x-aqi',
    name: 'Air Quality Index',
    category: 'Environment',
    dataSource: 'environment',
    unit: 'AQI',
    description: 'Local air quality from BreezoMeter',
    sampleRate: 'daily',
  },
  {
    id: 'x-temp',
    name: 'Ambient Temperature',
    category: 'Environment',
    dataSource: 'environment',
    unit: '°C',
    description: 'Local weather temperature',
    sampleRate: 'daily',
  },
  {
    id: 'x-daylight',
    name: 'Daylight Hours',
    category: 'Environment',
    dataSource: 'environment',
    unit: 'hours',
    description: 'Hours of daylight',
    sampleRate: 'daily',
  },
  // Self-Report
  {
    id: 'x-caffeine',
    name: 'Caffeine Intake',
    category: 'Lifestyle',
    dataSource: 'self-report',
    unit: 'units/day',
    description: 'Self-reported caffeine consumption',
    sampleRate: 'weekly',
  },
  {
    id: 'x-alcohol',
    name: 'Alcohol Intake',
    category: 'Lifestyle',
    dataSource: 'self-report',
    unit: 'units/week',
    description: 'Self-reported alcohol consumption',
    sampleRate: 'weekly',
  },
  {
    id: 'x-subjective-stress',
    name: 'Subjective Stress',
    category: 'Wellbeing',
    dataSource: 'self-report',
    unit: '1-5',
    description: 'Weekly self-reported stress level',
    sampleRate: 'weekly',
  },
];

// ============================================================================
// Y Variables (Outcomes)
// ============================================================================

export const humanEdgeYVariables: YVariable[] = [
  {
    id: 'y-hba1c',
    name: 'HbA1c',
    category: 'Metabolic',
    description: 'Glycemic control - target <5.7%',
    targetDirection: 'decrease',
    unit: '%',
  },
  {
    id: 'y-fasting-glucose',
    name: 'Fasting Glucose',
    category: 'Metabolic',
    description: 'Morning fasted blood glucose - target 70-100 mg/dL',
    targetDirection: 'optimize',
    unit: 'mg/dL',
  },
  {
    id: 'y-time-in-range',
    name: 'Time in Range',
    category: 'Metabolic',
    description: 'CGM time 70-140 mg/dL - target >90%',
    targetDirection: 'increase',
    unit: '%',
  },
  {
    id: 'y-apob',
    name: 'ApoB',
    category: 'Cardiovascular',
    description: 'Atherogenic burden - target <90 mg/dL',
    targetDirection: 'decrease',
    unit: 'mg/dL',
  },
  {
    id: 'y-hscrp',
    name: 'hs-CRP',
    category: 'Inflammation',
    description: 'Systemic inflammation - target <1.0 mg/L',
    targetDirection: 'decrease',
    unit: 'mg/L',
  },
  {
    id: 'y-body-fat',
    name: 'Body Fat Percentage',
    category: 'Body Composition',
    description: 'Target: men <20%, women <28%',
    targetDirection: 'decrease',
    unit: '%',
  },
  {
    id: 'y-vo2max',
    name: 'VO2 Max',
    category: 'Fitness',
    description: 'Cardiorespiratory fitness - target age-appropriate percentile',
    targetDirection: 'increase',
    unit: 'mL/kg/min',
  },
  {
    id: 'y-hrv',
    name: 'HRV (RMSSD)',
    category: 'Recovery',
    description: 'Autonomic balance - higher is generally better',
    targetDirection: 'increase',
    unit: 'ms',
  },
  {
    id: 'y-sleep-efficiency',
    name: 'Sleep Efficiency',
    category: 'Sleep',
    description: 'Time asleep / time in bed - target >85%',
    targetDirection: 'increase',
    unit: '%',
  },
  {
    id: 'y-deep-sleep-pct',
    name: 'Deep Sleep Percentage',
    category: 'Sleep',
    description: 'Restorative sleep proportion - target 15-20%',
    targetDirection: 'optimize',
    unit: '%',
  },
];

// ============================================================================
// Sample Users
// ============================================================================

export const humanEdgeUsers: ClientUser[] = [
  {
    id: 'he-user-001',
    name: 'Arjun K.',
    avatar: '👨‍💼',
    enrollmentDate: '2024-07-15',
    activeDays: 180,
    complianceRate: 94,
    currentPhase: 'Optimization',
    tags: ['prediabetes', 'tech-professional', 'apple-watch', 'cgm-user'],
  },
  {
    id: 'he-user-002',
    name: 'Priya M.',
    avatar: '👩‍⚕️',
    enrollmentDate: '2024-09-01',
    activeDays: 135,
    complianceRate: 88,
    currentPhase: 'Active Intervention',
    tags: ['metabolic-syndrome', 'physician', 'garmin', 'high-engagement'],
  },
  {
    id: 'he-user-003',
    name: 'Vikram S.',
    avatar: '🧑‍💻',
    enrollmentDate: '2024-06-01',
    activeDays: 225,
    complianceRate: 91,
    currentPhase: 'Maintenance',
    tags: ['diabetes-reversal', 'entrepreneur', 'oura', 'cgm-user', 'star-performer'],
  },
  {
    id: 'he-user-004',
    name: 'Anita R.',
    avatar: '👩‍🏫',
    enrollmentDate: '2024-10-15',
    activeDays: 95,
    complianceRate: 76,
    currentPhase: 'Baseline',
    tags: ['weight-management', 'educator', 'fitbit', 'new-user'],
  },
];

// ============================================================================
// Sample Insights (X → Y Causal Relationships)
// ============================================================================

export const humanEdgeInsights: ClientInsight[] = [
  {
    id: 'he-insight-001',
    title: 'Post-Dinner Walk Improves Glucose Response',
    description:
      'A 15-minute walk within 30 minutes after dinner reduces glucose spike by 18% on average',
    xVariables: ['x-steps', 'x-avg-glucose'],
    yVariable: 'y-time-in-range',
    modelType: 'causal',
    confidence: 0.89,
    theta: 1500, // steps threshold
    beta: 0.18, // 18% reduction
    recommendation:
      'Schedule a 15-minute walk after your largest meal of the day',
    linkedResources: ['cgm-reading-001', 'wearable-001'],
  },
  {
    id: 'he-insight-002',
    title: 'Sleep Duration Correlates with HRV',
    description:
      'Each additional hour of sleep above 6h increases next-day HRV by ~8ms',
    xVariables: ['x-sleep-duration', 'x-deep-sleep'],
    yVariable: 'y-hrv',
    modelType: 'causal',
    confidence: 0.82,
    theta: 6, // hours threshold
    beta: 8, // ms per hour
    recommendation: 'Prioritize 7-8 hours of sleep for optimal recovery',
    linkedResources: ['wearable-sleep-001'],
  },
  {
    id: 'he-insight-003',
    title: 'Zone 2 Training Reduces hs-CRP',
    description:
      '≥150 min/week of Zone 2 cardio associated with 22% lower hs-CRP at 90 days',
    xVariables: ['x-zone2-minutes', 'x-workout-frequency'],
    yVariable: 'y-hscrp',
    modelType: 'causal',
    confidence: 0.78,
    theta: 150, // minutes/week
    beta: -0.22, // 22% reduction
    recommendation:
      'Build to 150+ minutes of Zone 2 training weekly (walking, easy cycling)',
    linkedResources: ['lab-crp-001', 'wearable-workout-001'],
  },
  {
    id: 'he-insight-004',
    title: 'Caffeine Cutoff Improves Deep Sleep',
    description:
      'No caffeine after 2pm increases deep sleep duration by 12 minutes on average',
    xVariables: ['x-caffeine', 'x-sleep-latency'],
    yVariable: 'y-deep-sleep-pct',
    modelType: 'causal',
    confidence: 0.75,
    theta: 14, // 2pm cutoff (14:00)
    beta: 12, // minutes gained
    recommendation: 'Avoid caffeine after 2pm to protect deep sleep',
    linkedResources: ['survey-001', 'wearable-sleep-002'],
  },
  {
    id: 'he-insight-005',
    title: 'Fasting Insulin Predicts Glucose Variability',
    description:
      'Fasting insulin >10 mIU/L associated with 35% higher glucose CV',
    xVariables: ['x-fasting-insulin'],
    yVariable: 'y-time-in-range',
    modelType: 'predictive',
    confidence: 0.85,
    theta: 10, // mIU/L threshold
    beta: 0.35, // 35% increase in CV
    recommendation:
      'Focus on insulin sensitizing interventions: time-restricted eating, strength training',
    linkedResources: ['lab-insulin-001', 'cgm-summary-001'],
  },
  {
    id: 'he-insight-006',
    title: 'Dawn Phenomenon Mitigation via Evening Routine',
    description:
      'Completing sleep hygiene protocol reduces morning glucose spike by 15 mg/dL',
    xVariables: ['x-dawn-effect', 'x-sleep-duration', 'x-sleep-latency'],
    yVariable: 'y-fasting-glucose',
    modelType: 'causal',
    confidence: 0.72,
    theta: 0, // protocol completion
    beta: -15, // mg/dL reduction
    recommendation:
      'Follow evening wind-down: dim lights 9pm, no screens 10pm, bedroom 18°C',
    linkedResources: ['cgm-dawn-001', 'compliance-001'],
  },
];

// ============================================================================
// Sample Lab Biomarkers (for one user)
// ============================================================================

export const sampleLabBiomarkers: LabBiomarker[] = [
  // Metabolic Panel
  {
    id: 'lab-hba1c-001',
    code: '4548-4',
    name: 'HbA1c',
    category: 'metabolic',
    value: 5.8,
    unit: '%',
    referenceRange: { low: 4.0, high: 5.6 },
    interpretation: 'borderline',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  {
    id: 'lab-glucose-001',
    code: '2339-0',
    name: 'Fasting Glucose',
    category: 'metabolic',
    value: 102,
    unit: 'mg/dL',
    referenceRange: { low: 70, high: 100 },
    interpretation: 'borderline',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  {
    id: 'lab-insulin-001',
    code: '2484-4',
    name: 'Fasting Insulin',
    category: 'metabolic',
    value: 12.5,
    unit: 'mIU/L',
    referenceRange: { low: 2.6, high: 11.0 },
    interpretation: 'high',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  // Lipid Panel
  {
    id: 'lab-apob-001',
    code: '1884-6',
    name: 'Apolipoprotein B',
    category: 'lipid',
    value: 98,
    unit: 'mg/dL',
    referenceRange: { low: 0, high: 90 },
    interpretation: 'borderline',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  {
    id: 'lab-ldl-001',
    code: '2089-1',
    name: 'LDL Cholesterol',
    category: 'lipid',
    value: 118,
    unit: 'mg/dL',
    referenceRange: { low: 0, high: 100 },
    interpretation: 'borderline',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  {
    id: 'lab-hdl-001',
    code: '2085-9',
    name: 'HDL Cholesterol',
    category: 'lipid',
    value: 52,
    unit: 'mg/dL',
    referenceRange: { low: 40, high: 200 },
    interpretation: 'normal',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  {
    id: 'lab-trig-001',
    code: '2571-8',
    name: 'Triglycerides',
    category: 'lipid',
    value: 145,
    unit: 'mg/dL',
    referenceRange: { low: 0, high: 150 },
    interpretation: 'normal',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  // Inflammatory
  {
    id: 'lab-crp-001',
    code: '1988-5',
    name: 'hs-CRP',
    category: 'inflammatory',
    value: 2.8,
    unit: 'mg/L',
    referenceRange: { low: 0, high: 1.0 },
    interpretation: 'high',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  // Vitamins
  {
    id: 'lab-vitd-001',
    code: '1989-3',
    name: 'Vitamin D (25-OH)',
    category: 'vitamin',
    value: 28,
    unit: 'ng/mL',
    referenceRange: { low: 30, high: 100 },
    interpretation: 'low',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  {
    id: 'lab-b12-001',
    code: '2132-9',
    name: 'Vitamin B12',
    category: 'vitamin',
    value: 485,
    unit: 'pg/mL',
    referenceRange: { low: 200, high: 900 },
    interpretation: 'normal',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
  // Thyroid
  {
    id: 'lab-tsh-001',
    code: '3016-3',
    name: 'TSH',
    category: 'thyroid',
    value: 2.1,
    unit: 'mIU/L',
    referenceRange: { low: 0.4, high: 4.0 },
    interpretation: 'normal',
    collectionDate: '2025-01-10',
    source: 'Thyrocare Labs',
  },
];

// ============================================================================
// Sample Wearable Metrics (7 days)
// ============================================================================

export const sampleWearableMetrics: WearableMetric[] = [
  {
    id: 'wearable-001',
    timestamp: '2025-01-19T00:00:00Z',
    source: 'apple_watch',
    metrics: {
      steps: 8542,
      activeEnergy: 420,
      workoutMinutes: 45,
      workoutType: 'Walking',
      sleepDuration: 428,
      deepSleep: 72,
      remSleep: 98,
      lightSleep: 238,
      awakeTime: 20,
      sleepScore: 78,
      restingHR: 58,
      hrv: 42,
      avgHR: 72,
      stress: 35,
    },
  },
  {
    id: 'wearable-002',
    timestamp: '2025-01-18T00:00:00Z',
    source: 'apple_watch',
    metrics: {
      steps: 12104,
      activeEnergy: 580,
      workoutMinutes: 65,
      workoutType: 'Running',
      sleepDuration: 398,
      deepSleep: 65,
      remSleep: 85,
      lightSleep: 228,
      awakeTime: 20,
      sleepScore: 72,
      restingHR: 56,
      hrv: 38,
      avgHR: 78,
      stress: 42,
    },
  },
  {
    id: 'wearable-003',
    timestamp: '2025-01-17T00:00:00Z',
    source: 'apple_watch',
    metrics: {
      steps: 6234,
      activeEnergy: 310,
      workoutMinutes: 0,
      sleepDuration: 462,
      deepSleep: 82,
      remSleep: 110,
      lightSleep: 250,
      awakeTime: 20,
      sleepScore: 85,
      restingHR: 54,
      hrv: 48,
      avgHR: 68,
      stress: 28,
    },
  },
];

// ============================================================================
// Sample CGM Readings
// ============================================================================

export const sampleCgmReadings: MedicalDeviceReading[] = [
  {
    id: 'cgm-001',
    deviceType: 'cgm',
    timestamp: '2025-01-19T23:00:00Z',
    source: 'abbott_libre',
    readings: {
      glucose: 112,
      glucoseTrend: 'stable',
      timeInRange: 82,
      timeAboveRange: 15,
      timeBelowRange: 3,
    },
  },
  {
    id: 'cgm-002',
    deviceType: 'cgm',
    timestamp: '2025-01-19T22:00:00Z',
    source: 'abbott_libre',
    readings: {
      glucose: 138,
      glucoseTrend: 'falling',
    },
  },
  {
    id: 'cgm-003',
    deviceType: 'cgm',
    timestamp: '2025-01-19T21:00:00Z',
    source: 'abbott_libre',
    readings: {
      glucose: 165,
      glucoseTrend: 'rising',
    },
  },
];

// ============================================================================
// Sample Interventions
// ============================================================================

export const sampleInterventions: Intervention[] = [
  {
    code: 'INT-Z2-001',
    category: 'exercise',
    name: 'Zone 2 Cardio Protocol',
    description:
      'Sustained aerobic activity at 60-70% max HR for mitochondrial health',
    intensity: 'moderate',
    targetBiomarkers: ['y-vo2max', 'y-hscrp', 'y-time-in-range'],
    duration: '12 weeks',
    frequency: '5x/week, 30-45 min',
  },
  {
    code: 'INT-TRE-001',
    category: 'nutrition',
    name: 'Time-Restricted Eating (16:8)',
    description: 'Eating window limited to 8 hours daily',
    intensity: 'moderate',
    targetBiomarkers: ['y-fasting-glucose', 'y-time-in-range', 'y-body-fat'],
    duration: '8 weeks',
    frequency: 'daily',
  },
  {
    code: 'INT-VITD-001',
    category: 'supplement',
    name: 'Vitamin D3 Supplementation',
    description: '5000 IU daily with fat-containing meal',
    intensity: 'low',
    targetBiomarkers: ['x-vitamin-d'],
    duration: '12 weeks',
    frequency: 'daily',
  },
  {
    code: 'INT-SLEEP-001',
    category: 'sleep',
    name: 'Sleep Hygiene Protocol',
    description:
      'Comprehensive sleep optimization: temp, light, timing, wind-down routine',
    intensity: 'moderate',
    targetBiomarkers: ['y-deep-sleep-pct', 'y-hrv', 'y-fasting-glucose'],
    duration: 'ongoing',
    frequency: 'daily',
  },
];

// ============================================================================
// Client Configuration Export
// ============================================================================

export const humanEdgeConfig: ClientConfig = {
  id: 'human-edge',
  name: 'Human Edge',
  logo: '🏃‍♂️',
  description:
    'Comprehensive metabolic health optimization platform with ~78 biomarkers, continuous wearable data, CGM, and clinician-guided interventions',
  dataSources: humanEdgeDataSources,
  xVariables: humanEdgeXVariables,
  yVariables: humanEdgeYVariables,
  insights: humanEdgeInsights,
  users: humanEdgeUsers,
};

export default humanEdgeConfig;
