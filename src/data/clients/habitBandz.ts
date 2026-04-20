// Habit Bandz Client Data Model
// Habit tracking platform with companion wearable band
// Focus: Behavioral habit formation, streak optimization, habit stacking

import type {
  ClientConfig,
  DataSource,
  XVariable,
  YVariable,
  ClientInsight,
  ClientUser,
} from '@/types/client';

// ============================================================================
// Data Sources Configuration
// ============================================================================

export const habitBandzDataSources: DataSource[] = [
  {
    id: 'hb-ds-habits',
    type: 'self-report',
    name: 'Habit Tracker Core',
    description:
      'Primary habit logging via band tap + app confirmation. Captures completion timestamps, streak data, habit metadata, and contextual notes.',
    cadence: 'real-time',
    pipeline:
      'Band BLE tap → Mobile SDK → Firebase Realtime → Cloud Function → BigQuery habit_completions',
    lastSync: '2025-01-20T08:15:00Z',
    status: 'active',
    recordCount: 12450,
  },
  {
    id: 'hb-ds-terra',
    type: 'terra-api',
    name: 'Wearables (Terra API)',
    description:
      'Apple Watch, Fitbit, Garmin integration for sleep quality, HRV, steps, and activity correlation with habit success.',
    cadence: 'continuous',
    pipeline:
      'User OAuth → Terra webhook → GCP Pub/Sub → BigQuery raw_wearable → daily ETL join with habits',
    lastSync: '2025-01-20T06:00:00Z',
    status: 'active',
    recordCount: 245000,
  },
  {
    id: 'hb-ds-surveys',
    type: 'self-report',
    name: 'Weekly Check-ins',
    description:
      'Motivation score, habit difficulty ratings, mood, life events. Used for confounding control in causal models.',
    cadence: 'weekly',
    pipeline: 'App survey modal → Firestore → Cloud Function → BigQuery weekly_surveys',
    lastSync: '2025-01-19T20:00:00Z',
    status: 'active',
    recordCount: 890,
  },
  {
    id: 'hb-ds-engagement',
    type: 'engagement',
    name: 'App Engagement Telemetry',
    description:
      'Notification delivery/response times, app opens, screen views, feature usage, reminder interactions.',
    cadence: 'real-time',
    pipeline: 'Firebase Analytics + Cloud Messaging → BigQuery engagement_events',
    lastSync: '2025-01-20T08:20:00Z',
    status: 'active',
    recordCount: 78500,
  },
];

// ============================================================================
// X Variables (Predictors/Features)
// ============================================================================

export const habitBandzXVariables: XVariable[] = [
  // Timing Variables
  {
    id: 'x-completion-hour',
    name: 'Habit Completion Hour',
    category: 'Timing',
    dataSource: 'self-report',
    unit: 'hour (0-23)',
    description: 'Hour of day when habit was completed',
    sampleRate: 'per-completion',
  },
  {
    id: 'x-day-of-week',
    name: 'Day of Week',
    category: 'Timing',
    dataSource: 'self-report',
    unit: '1-7',
    description: 'Day of week (1=Monday, 7=Sunday)',
    sampleRate: 'daily',
  },
  {
    id: 'x-days-since-start',
    name: 'Days Since Habit Started',
    category: 'Timing',
    dataSource: 'self-report',
    unit: 'days',
    description: 'Number of days since habit was created',
    sampleRate: 'daily',
  },
  // Behavioral Variables
  {
    id: 'x-current-streak',
    name: 'Current Streak Length',
    category: 'Behavior',
    dataSource: 'self-report',
    unit: 'days',
    description: 'Consecutive days habit completed without break',
    sampleRate: 'daily',
  },
  {
    id: 'x-reminder-response-time',
    name: 'Reminder Response Time',
    category: 'Behavior',
    dataSource: 'engagement',
    unit: 'minutes',
    description: 'Time between reminder notification and habit completion',
    sampleRate: 'per-completion',
  },
  {
    id: 'x-habit-stack-count',
    name: 'Habit Stack Count',
    category: 'Behavior',
    dataSource: 'self-report',
    unit: 'count',
    description: 'Number of habits completed within 30-min window (stacking)',
    sampleRate: 'per-completion',
  },
  {
    id: 'x-previous-day-completed',
    name: 'Previous Day Completion',
    category: 'Behavior',
    dataSource: 'self-report',
    unit: 'boolean (0/1)',
    description: 'Whether habit was completed the previous day',
    sampleRate: 'daily',
  },
  // Context Variables (from Wearables)
  {
    id: 'x-sleep-score',
    name: 'Prior Night Sleep Score',
    category: 'Context',
    dataSource: 'terra-api',
    unit: '0-100',
    description: 'Sleep quality score from previous night',
    sampleRate: 'daily',
  },
  {
    id: 'x-morning-hrv',
    name: 'Morning HRV',
    category: 'Context',
    dataSource: 'terra-api',
    unit: 'ms RMSSD',
    description: 'Heart rate variability upon waking',
    sampleRate: 'daily',
  },
  {
    id: 'x-prior-day-steps',
    name: 'Prior Day Steps',
    category: 'Context',
    dataSource: 'terra-api',
    unit: 'steps',
    description: 'Total steps from previous day',
    sampleRate: 'daily',
  },
  // Engagement Variables
  {
    id: 'x-app-opens',
    name: 'Daily App Opens',
    category: 'Engagement',
    dataSource: 'engagement',
    unit: 'count',
    description: 'Number of times app opened that day',
    sampleRate: 'daily',
  },
  {
    id: 'x-time-in-app',
    name: 'Time in App',
    category: 'Engagement',
    dataSource: 'engagement',
    unit: 'minutes',
    description: 'Total time spent in app that day',
    sampleRate: 'daily',
  },
  {
    id: 'x-notification-tap-rate',
    name: 'Notification Tap Rate',
    category: 'Engagement',
    dataSource: 'engagement',
    unit: '%',
    description: '7-day rolling average of notification tap rate',
    sampleRate: 'daily',
  },
  // Self-Report Variables
  {
    id: 'x-motivation-score',
    name: 'Weekly Motivation Score',
    category: 'Self-Report',
    dataSource: 'self-report',
    unit: '1-10',
    description: 'Self-reported motivation level from weekly survey',
    sampleRate: 'weekly',
  },
  {
    id: 'x-perceived-difficulty',
    name: 'Perceived Habit Difficulty',
    category: 'Self-Report',
    dataSource: 'self-report',
    unit: '1-5',
    description: 'How hard the habit feels to complete',
    sampleRate: 'weekly',
  },
];

// ============================================================================
// Y Variables (Outcomes)
// ============================================================================

export const habitBandzYVariables: YVariable[] = [
  {
    id: 'y-completion-rate',
    name: 'Daily Habit Completion Rate',
    category: 'Habit Success',
    description: 'Percentage of target habits completed each day - target 80%+',
    targetDirection: 'increase',
    unit: '%',
  },
  {
    id: 'y-streak-survival',
    name: 'Streak Survival Days',
    category: 'Habit Success',
    description: 'Number of days until streak is broken - higher is better',
    targetDirection: 'increase',
    unit: 'days',
  },
  {
    id: 'y-weekly-consistency',
    name: 'Weekly Completion Consistency',
    category: 'Habit Success',
    description: 'Consistency of completion times across the week (lower variance = better)',
    targetDirection: 'optimize',
    unit: 'std dev (hours)',
  },
  {
    id: 'y-automaticity',
    name: 'Habit Automaticity Score',
    category: 'Habit Formation',
    description: 'Self-reported ease of habit (SRHI scale) - target 5+',
    targetDirection: 'increase',
    unit: '1-7 scale',
  },
  {
    id: 'y-retention',
    name: '30-Day User Retention',
    category: 'Engagement',
    description: 'Whether user is still active after 30 days',
    targetDirection: 'increase',
    unit: 'boolean',
  },
];

// ============================================================================
// Sample Users
// ============================================================================

export const habitBandzUsers: ClientUser[] = [
  {
    id: 'hb-user-001',
    name: 'Marcus T.',
    avatar: '💪',
    enrollmentDate: '2024-12-05',
    activeDays: 45,
    complianceRate: 92,
    currentPhase: 'Active Optimization',
    tags: ['fitness-focused', 'morning-person', 'apple-watch', 'high-performer'],
    dataSources: ['Apple Watch', 'Habit Band', 'Weekly Surveys'],
    insightCount: 4,
  },
  {
    id: 'hb-user-002',
    name: 'Elena R.',
    avatar: '🌱',
    enrollmentDate: '2024-12-30',
    activeDays: 21,
    complianceRate: 68,
    currentPhase: 'Baseline',
    tags: ['new-user', 'multiple-habits', 'needs-reminders', 'evening-person'],
    dataSources: ['Fitbit', 'Habit Band', 'Weekly Surveys'],
    insightCount: 3,
  },
];

// ============================================================================
// Sample Insights (X → Y Causal Relationships)
// ============================================================================

export const habitBandzInsights: ClientInsight[] = [
  {
    id: 'hb-insight-001',
    title: 'Morning Magic Window',
    description:
      'Habits completed before 8 AM have 2.3x higher streak survival than those completed later. Early completion creates psychological "win" that reinforces the habit loop.',
    xVariables: ['x-completion-hour', 'x-sleep-score'],
    yVariable: 'y-streak-survival',
    modelType: 'causal',
    confidence: 0.87,
    theta: 8, // 8 AM threshold
    beta: 2.3, // 2.3x multiplier
    recommendation:
      'Set habit reminders for 6:30-7:30 AM. Complete highest-priority habit before breakfast.',
    linkedResources: ['habit-log-001', 'wearable-sleep-001'],
  },
  {
    id: 'hb-insight-002',
    title: 'Habit Stacking Multiplier',
    description:
      'Completing a new habit immediately after an existing routine increases completion rate by 47%. Anchoring to established behaviors reduces friction.',
    xVariables: ['x-habit-stack-count', 'x-previous-day-completed'],
    yVariable: 'y-completion-rate',
    modelType: 'causal',
    confidence: 0.82,
    theta: 1, // at least 1 stacked habit
    beta: 0.47, // 47% increase
    recommendation:
      'Pair new habits with existing routines: meditation after morning coffee, stretching after brushing teeth.',
    linkedResources: ['habit-stack-001'],
  },
  {
    id: 'hb-insight-003',
    title: 'Sleep-Habit Connection',
    description:
      'Sleep quality below 70% predicts a 35% drop in next-day habit completion. Poor sleep depletes willpower reserves needed for habit execution.',
    xVariables: ['x-sleep-score', 'x-morning-hrv'],
    yVariable: 'y-completion-rate',
    modelType: 'causal',
    confidence: 0.79,
    theta: 70, // 70% sleep score threshold
    beta: -0.35, // 35% decrease
    recommendation:
      'On low-sleep days, reduce habit targets to essentials only. Protect sleep as the foundation.',
    linkedResources: ['wearable-sleep-002', 'habit-log-002'],
  },
  {
    id: 'hb-insight-004',
    title: 'Reminder Response Window',
    description:
      'Responding to habit reminders within 5 minutes correlates with 89% completion rate. Delayed response drops completion to 34%.',
    xVariables: ['x-reminder-response-time', 'x-notification-tap-rate'],
    yVariable: 'y-completion-rate',
    modelType: 'causal',
    confidence: 0.91,
    theta: 5, // 5 minute threshold
    beta: 0.89, // 89% completion rate
    recommendation:
      'Act immediately when reminder fires. Set reminders for moments of low friction (post-meal, transitions).',
    linkedResources: ['engagement-001'],
  },
];

// ============================================================================
// Client Configuration Export
// ============================================================================

export const habitBandzConfig: ClientConfig = {
  id: 'habit-bandz',
  name: 'Habit Bandz',
  logo: '🎯',
  description:
    'Habit tracking platform with companion wearable band. Focus on behavioral habit formation, streak optimization, and habit stacking. 2 pilot users in early beta.',
  dataSources: habitBandzDataSources,
  xVariables: habitBandzXVariables,
  yVariables: habitBandzYVariables,
  insights: habitBandzInsights,
  users: habitBandzUsers,
};

export default habitBandzConfig;
