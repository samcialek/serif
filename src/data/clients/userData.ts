// User Detail Data for Serif Platform
// Detailed time series and personal insights for individual users

// ============================================================================
// Types for User Detail Data
// ============================================================================

export interface CGMReading {
  timestamp: string;
  glucose: number;
  trend: 'rising_fast' | 'rising' | 'stable' | 'falling' | 'falling_fast';
}

export interface DailyMetric {
  date: string;
  sleepScore: number;
  sleepDuration: number; // minutes
  deepSleep: number; // minutes
  remSleep: number; // minutes
  hrv: number; // ms
  restingHR: number; // bpm
  steps: number;
  activeEnergy: number; // kcal
  zone2Minutes: number;
  stressScore: number; // 0-100
}

export interface LabReading {
  date: string;
  value: number;
}

export interface LabHistory {
  biomarker: string;
  code: string;
  unit: string;
  readings: LabReading[];
  trend: 'improving' | 'stable' | 'worsening';
  targetRange: { low: number; high: number };
  currentInterpretation: 'optimal' | 'normal' | 'borderline' | 'high' | 'low';
}

export interface PersonalInsight {
  id: string;
  title: string;
  subtitle: string;
  xVariable: string;
  yVariable: string;
  theta: {
    value: number;
    unit: string;
    displayValue: string;
  };
  betaBelow: {
    value: number;
    description: string;
  };
  betaAbove: {
    value: number;
    description: string;
  };
  currentValue: number;
  currentUnit: string;
  currentStatus: 'below_optimal' | 'at_optimal' | 'above_optimal';
  personalDataPct: number;
  populationDataPct: number;
  observations: number;
  daysOfData: number;
  curveType: 'plateau_up' | 'plateau_down' | 'v_min' | 'v_max' | 'linear';
  actionableAdvice: string;
}

export interface UserIntervention {
  code: string;
  name: string;
  category: string;
  startDate: string;
  targetMetric: string;
  compliance: number; // percentage
  lastCompleted?: string;
  streak: number; // days
}

export interface DailyProtocolItem {
  priority: number;
  code: string;
  action: string;
  reason: string;
  linkedInsightId?: string;
  timeOfDay?: string;
  completed?: boolean;
}

export interface HumanEdgeUserDetail {
  userId: string;
  name: string;
  avatar: string;
  archetype: string;
  enrollmentDate: string;
  activeDays: number;
  complianceRate: number;
  currentPhase: string;
  tags: string[];
  dataSources: {
    id: string;
    name: string;
    icon: string;
    connected: boolean;
    lastSync?: string;
  }[];
  cgmReadings: CGMReading[];
  dailyMetrics: DailyMetric[];
  labHistory: LabHistory[];
  personalInsights: PersonalInsight[];
  interventions: UserIntervention[];
  dailyProtocol: DailyProtocolItem[];
  keyMetrics: {
    id: string;
    name: string;
    value: number;
    unit: string;
    change: number;
    changeDirection: 'up' | 'down' | 'stable';
    isGood: boolean;
    sparklineData: number[];
    period: string;
  }[];
}

// ============================================================================
// Human Edge User: Arjun K. (The Optimizing Executive)
// ============================================================================

// Generate 7 days of CGM readings (96 readings/day = 672 total)
function generateCGMReadings(): CGMReading[] {
  const readings: CGMReading[] = [];
  const baseDate = new Date('2025-01-20T00:00:00Z');

  for (let day = 6; day >= 0; day--) {
    for (let reading = 0; reading < 96; reading++) {
      const timestamp = new Date(baseDate);
      timestamp.setDate(timestamp.getDate() - day);
      timestamp.setMinutes(reading * 15);

      const hour = Math.floor((reading * 15) / 60);
      let baseGlucose = 95;

      // Simulate daily patterns
      if (hour >= 7 && hour < 9) {
        baseGlucose = 105 + Math.sin((hour - 7) * Math.PI) * 25; // Breakfast spike
      } else if (hour >= 12 && hour < 14) {
        baseGlucose = 110 + Math.sin((hour - 12) * Math.PI) * 35; // Lunch spike
      } else if (hour >= 19 && hour < 21) {
        baseGlucose = 115 + Math.sin((hour - 19) * Math.PI) * 45; // Dinner spike
      } else if (hour >= 4 && hour < 7) {
        baseGlucose = 98 + (hour - 4) * 3; // Dawn phenomenon
      }

      // Add noise
      const noise = (Math.random() - 0.5) * 15;
      const glucose = Math.round(Math.max(70, Math.min(180, baseGlucose + noise)));

      // Determine trend
      let trend: CGMReading['trend'] = 'stable';
      if (readings.length > 0) {
        const diff = glucose - readings[readings.length - 1].glucose;
        if (diff > 10) trend = 'rising_fast';
        else if (diff > 3) trend = 'rising';
        else if (diff < -10) trend = 'falling_fast';
        else if (diff < -3) trend = 'falling';
      }

      readings.push({
        timestamp: timestamp.toISOString(),
        glucose,
        trend,
      });
    }
  }

  return readings;
}

// Generate 30 days of daily metrics
function generateDailyMetrics(): DailyMetric[] {
  const metrics: DailyMetric[] = [];
  const baseDate = new Date('2025-01-20');

  for (let day = 29; day >= 0; day--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - day);

    // Simulate improving trends over time
    const improvementFactor = 1 - day / 60; // Gradual improvement

    metrics.push({
      date: date.toISOString().split('T')[0],
      sleepScore: Math.round(72 + improvementFactor * 10 + (Math.random() - 0.5) * 8),
      sleepDuration: Math.round(390 + improvementFactor * 30 + (Math.random() - 0.5) * 40),
      deepSleep: Math.round(60 + improvementFactor * 15 + (Math.random() - 0.5) * 15),
      remSleep: Math.round(85 + improvementFactor * 10 + (Math.random() - 0.5) * 20),
      hrv: Math.round(38 + improvementFactor * 8 + (Math.random() - 0.5) * 8),
      restingHR: Math.round(62 - improvementFactor * 4 + (Math.random() - 0.5) * 4),
      steps: Math.round(7000 + improvementFactor * 2000 + (Math.random() - 0.5) * 3000),
      activeEnergy: Math.round(350 + improvementFactor * 100 + (Math.random() - 0.5) * 100),
      zone2Minutes: Math.round(15 + improvementFactor * 20 + Math.random() * 15),
      stressScore: Math.round(45 - improvementFactor * 10 + (Math.random() - 0.5) * 15),
    });
  }

  return metrics;
}

export const arjunKDetail: HumanEdgeUserDetail = {
  userId: 'he-user-001',
  name: 'Arjun K.',
  avatar: '/avatars/arjun.jpg',
  archetype: 'The Optimizing Executive',
  enrollmentDate: '2024-07-15',
  activeDays: 180,
  complianceRate: 94,
  currentPhase: 'Optimization',
  tags: ['prediabetes', 'tech-professional', 'apple-watch', 'cgm-user'],
  dataSources: [
    { id: 'ds-apple', name: 'Apple Watch', icon: 'watch', connected: true, lastSync: '2025-01-20T08:00:00Z' },
    { id: 'ds-cgm', name: 'Libre CGM', icon: 'activity', connected: true, lastSync: '2025-01-20T07:45:00Z' },
    { id: 'ds-thyrocare', name: 'Thyrocare Labs', icon: 'flask', connected: true, lastSync: '2025-01-10T00:00:00Z' },
    { id: 'ds-withings', name: 'Withings Scale', icon: 'scale', connected: true, lastSync: '2025-01-20T06:30:00Z' },
    { id: 'ds-omron', name: 'Omron BP', icon: 'heart', connected: true, lastSync: '2025-01-19T20:00:00Z' },
  ],
  cgmReadings: generateCGMReadings(),
  dailyMetrics: generateDailyMetrics(),
  labHistory: [
    {
      biomarker: 'HbA1c',
      code: '4548-4',
      unit: '%',
      readings: [
        { date: '2024-07-15', value: 6.2 },
        { date: '2024-10-15', value: 5.9 },
        { date: '2025-01-10', value: 5.6 },
      ],
      trend: 'improving',
      targetRange: { low: 4.0, high: 5.6 },
      currentInterpretation: 'optimal',
    },
    {
      biomarker: 'Fasting Glucose',
      code: '2339-0',
      unit: 'mg/dL',
      readings: [
        { date: '2024-07-15', value: 118 },
        { date: '2024-10-15', value: 108 },
        { date: '2025-01-10', value: 98 },
      ],
      trend: 'improving',
      targetRange: { low: 70, high: 100 },
      currentInterpretation: 'optimal',
    },
    {
      biomarker: 'Fasting Insulin',
      code: '2484-4',
      unit: 'mIU/L',
      readings: [
        { date: '2024-07-15', value: 18.2 },
        { date: '2024-10-15', value: 14.5 },
        { date: '2025-01-10', value: 10.8 },
      ],
      trend: 'improving',
      targetRange: { low: 2.6, high: 11.0 },
      currentInterpretation: 'normal',
    },
    {
      biomarker: 'hs-CRP',
      code: '1988-5',
      unit: 'mg/L',
      readings: [
        { date: '2024-07-15', value: 3.8 },
        { date: '2024-10-15', value: 2.4 },
        { date: '2025-01-10', value: 1.6 },
      ],
      trend: 'improving',
      targetRange: { low: 0, high: 1.0 },
      currentInterpretation: 'borderline',
    },
    {
      biomarker: 'Vitamin D',
      code: '1989-3',
      unit: 'ng/mL',
      readings: [
        { date: '2024-07-15', value: 22 },
        { date: '2024-10-15', value: 32 },
        { date: '2025-01-10', value: 45 },
      ],
      trend: 'improving',
      targetRange: { low: 40, high: 80 },
      currentInterpretation: 'optimal',
    },
    {
      biomarker: 'ApoB',
      code: '1884-6',
      unit: 'mg/dL',
      readings: [
        { date: '2024-07-15', value: 112 },
        { date: '2024-10-15', value: 102 },
        { date: '2025-01-10', value: 94 },
      ],
      trend: 'improving',
      targetRange: { low: 0, high: 90 },
      currentInterpretation: 'borderline',
    },
  ],
  personalInsights: [
    {
      id: 'ins-001',
      title: 'Post-Dinner Walk',
      subtitle: 'Reduces your glucose spike by 22%',
      xVariable: 'Post-meal steps',
      yVariable: 'Glucose spike',
      theta: { value: 1200, unit: 'steps', displayValue: '1,200 steps' },
      betaBelow: { value: -0.22, description: '-22% glucose spike reduction' },
      betaAbove: { value: 0.03, description: '+3% minimal additional benefit' },
      currentValue: 1847,
      currentUnit: 'steps',
      currentStatus: 'at_optimal',
      personalDataPct: 89,
      populationDataPct: 11,
      observations: 142,
      daysOfData: 156,
      curveType: 'plateau_down',
      actionableAdvice: 'Keep this up! Your post-meal walks are working well.',
    },
    {
      id: 'ins-002',
      title: 'Bedtime Threshold',
      subtitle: 'Your sleep efficiency drops after 10:15 PM',
      xVariable: 'Bedtime',
      yVariable: 'Sleep efficiency',
      theta: { value: 22.25, unit: 'hour', displayValue: '10:15 PM' },
      betaBelow: { value: 0.85, description: '85% sleep efficiency' },
      betaAbove: { value: -0.023, description: '-2.3% per hour after threshold' },
      currentValue: 22.5,
      currentUnit: 'hour',
      currentStatus: 'above_optimal',
      personalDataPct: 92,
      populationDataPct: 8,
      observations: 168,
      daysOfData: 180,
      curveType: 'plateau_down',
      actionableAdvice: 'Try winding down 30 minutes earlier tonight.',
    },
    {
      id: 'ins-003',
      title: 'Zone 2 Training',
      subtitle: 'Optimal at 150+ minutes/week for your HRV',
      xVariable: 'Weekly Zone 2 minutes',
      yVariable: 'HRV (RMSSD)',
      theta: { value: 150, unit: 'min/week', displayValue: '150 min/week' },
      betaBelow: { value: 0.12, description: '+12% HRV per 30 min added' },
      betaAbove: { value: 0.02, description: '+2% diminishing returns' },
      currentValue: 135,
      currentUnit: 'min/week',
      currentStatus: 'below_optimal',
      personalDataPct: 78,
      populationDataPct: 22,
      observations: 24,
      daysOfData: 168,
      curveType: 'plateau_up',
      actionableAdvice: 'Add one more 30-min easy walk this week to hit your threshold.',
    },
    {
      id: 'ins-004',
      title: 'Caffeine Cutoff',
      subtitle: 'Your deep sleep improves with 2 PM cutoff',
      xVariable: 'Last caffeine time',
      yVariable: 'Deep sleep %',
      theta: { value: 14, unit: 'hour', displayValue: '2:00 PM' },
      betaBelow: { value: 0.18, description: '18% deep sleep' },
      betaAbove: { value: -0.015, description: '-1.5% per hour after 2 PM' },
      currentValue: 15,
      currentUnit: 'hour',
      currentStatus: 'above_optimal',
      personalDataPct: 85,
      populationDataPct: 15,
      observations: 89,
      daysOfData: 120,
      curveType: 'plateau_down',
      actionableAdvice: 'Your afternoon coffee at 3 PM is costing you ~12 min of deep sleep.',
    },
  ],
  interventions: [
    {
      code: 'INT-Z2-001',
      name: 'Zone 2 Cardio Protocol',
      category: 'exercise',
      startDate: '2024-08-01',
      targetMetric: 'VO2max, hs-CRP',
      compliance: 88,
      lastCompleted: '2025-01-19',
      streak: 12,
    },
    {
      code: 'INT-TRE-001',
      name: 'Time-Restricted Eating (16:8)',
      category: 'nutrition',
      startDate: '2024-09-15',
      targetMetric: 'Fasting glucose, TIR',
      compliance: 92,
      lastCompleted: '2025-01-20',
      streak: 28,
    },
    {
      code: 'INT-VITD-001',
      name: 'Vitamin D3 5000 IU',
      category: 'supplement',
      startDate: '2024-07-20',
      targetMetric: 'Vitamin D level',
      compliance: 98,
      lastCompleted: '2025-01-20',
      streak: 45,
    },
    {
      code: 'INT-SLEEP-001',
      name: 'Sleep Hygiene Protocol',
      category: 'sleep',
      startDate: '2024-10-01',
      targetMetric: 'Deep sleep %, HRV',
      compliance: 76,
      lastCompleted: '2025-01-19',
      streak: 5,
    },
  ],
  dailyProtocol: [
    {
      priority: 1,
      code: 'PROTO_POSTMEAL_WALK',
      action: '15-min walk after dinner',
      reason: 'Reduces your glucose spike by 22%',
      linkedInsightId: 'ins-001',
      timeOfDay: 'After dinner',
    },
    {
      priority: 2,
      code: 'SUPP_VITAMIN_D',
      action: 'Take Vitamin D with breakfast',
      reason: 'Maintaining your level at 45 ng/mL',
      timeOfDay: 'Morning',
    },
    {
      priority: 3,
      code: 'CARDIO_ZONE2',
      action: 'Zone 2 cardio: 30 min easy pace',
      reason: '2 more sessions this week to hit 150 min target',
      linkedInsightId: 'ins-003',
      timeOfDay: 'Anytime',
    },
    {
      priority: 4,
      code: 'PROTO_BEDTIME_ROUTINE',
      action: 'Wind down by 10:00 PM',
      reason: 'Your sleep efficiency drops 2.3%/hr after 10:15 PM',
      linkedInsightId: 'ins-002',
      timeOfDay: 'Evening',
    },
    {
      priority: 5,
      code: 'NUTRITION_CAFFEINE',
      action: 'No caffeine after 2 PM',
      reason: 'Protects your deep sleep',
      linkedInsightId: 'ins-004',
      timeOfDay: 'Afternoon',
    },
  ],
  keyMetrics: [
    {
      id: 'km-tir',
      name: 'Time in Range',
      value: 85,
      unit: '%',
      change: 8,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [72, 74, 78, 76, 80, 82, 85],
      period: '7-day',
    },
    {
      id: 'km-hba1c',
      name: 'HbA1c',
      value: 5.6,
      unit: '%',
      change: -0.3,
      changeDirection: 'down',
      isGood: true,
      sparklineData: [6.2, 5.9, 5.6],
      period: 'quarterly',
    },
    {
      id: 'km-hrv',
      name: 'HRV',
      value: 45,
      unit: 'ms',
      change: 7,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [38, 40, 42, 41, 44, 43, 45],
      period: '7-day',
    },
    {
      id: 'km-deep',
      name: 'Deep Sleep',
      value: 78,
      unit: 'min',
      change: 12,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [62, 68, 70, 72, 75, 74, 78],
      period: '7-day',
    },
    {
      id: 'km-steps',
      name: 'Avg Steps',
      value: 9234,
      unit: 'steps',
      change: 1850,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [7200, 8100, 8900, 9500, 8800, 9400, 9234],
      period: '7-day',
    },
    {
      id: 'km-crp',
      name: 'hs-CRP',
      value: 1.6,
      unit: 'mg/L',
      change: -0.8,
      changeDirection: 'down',
      isGood: true,
      sparklineData: [3.8, 2.4, 1.6],
      period: 'quarterly',
    },
  ],
};

// ============================================================================
// User Detail Data Index
// ============================================================================

export const humanEdgeUserDetails: Record<string, HumanEdgeUserDetail> = {
  'he-user-001': arjunKDetail,
};

export function getHumanEdgeUserDetail(userId: string): HumanEdgeUserDetail | undefined {
  return humanEdgeUserDetails[userId];
}

// Import Habit Bandz user data
import { getHabitBandzUserDetail, type HabitBandzUserDetail } from './habitBandzUserData';

export type { HabitBandzUserDetail };

export function getUserDetail(
  clientId: string,
  userId: string
): HumanEdgeUserDetail | HabitBandzUserDetail | undefined {
  if (clientId === 'human-edge') {
    return getHumanEdgeUserDetail(userId);
  }
  if (clientId === 'habit-bandz') {
    return getHabitBandzUserDetail(userId);
  }
  return undefined;
}
