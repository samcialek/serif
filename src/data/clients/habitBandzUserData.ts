// Habit Bandz User Detail Data
// Detailed habit tracking data for Marcus T. and Elena R.

import type { PersonalInsight } from './userData';

// ============================================================================
// Types for Habit Bandz User Detail Data
// ============================================================================

export interface HabitDefinition {
  id: string;
  name: string;
  category: string;
  emoji: string;
  targetFrequency: string;
  currentStreak: number;
  bestStreak: number;
  completionRate: number;
  avgCompletionTime: string;
  stackedWith?: string;
}

export interface DailyHabitLog {
  date: string;
  habitsCompleted: number;
  habitsTarget: number;
  completions: {
    habitId: string;
    completedAt: string;
    reminderResponseMin?: number;
  }[];
  sleepScorePriorNight: number;
  hrvMorning: number;
  motivationLevel?: number;
}

export interface HabitBandzUserDetail {
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
  habits: HabitDefinition[];
  dailyLogs: DailyHabitLog[];
  personalInsights: PersonalInsight[];
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
  weeklyStats: {
    week: string;
    completionRate: number;
    avgStreakLength: number;
    habitStackEvents: number;
    avgReminderResponse: number;
  }[];
}

// ============================================================================
// Helper: Generate Daily Habit Logs
// ============================================================================

function generateMarcusDailyLogs(): DailyHabitLog[] {
  const logs: DailyHabitLog[] = [];
  const baseDate = new Date('2025-01-20');

  for (let day = 44; day >= 0; day--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split('T')[0];

    // Marcus is a high performer - consistent morning person
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const sleepScore = 70 + Math.floor(Math.random() * 25);
    const hrvMorning = 42 + Math.floor(Math.random() * 18);

    // Completion probability based on patterns
    const baseCompletionProb = 0.92;
    const sleepPenalty = sleepScore < 70 ? 0.15 : 0;
    const completionProb = baseCompletionProb - sleepPenalty;

    const completions: DailyHabitLog['completions'] = [];

    // Workout - almost always done, early morning
    if (Math.random() < completionProb + 0.05) {
      const hour = isWeekend ? 7 + Math.random() * 1.5 : 6 + Math.random();
      completions.push({
        habitId: 'habit-workout',
        completedAt: `${dateStr}T${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}:00Z`,
        reminderResponseMin: Math.floor(Math.random() * 3) + 1,
      });
    }

    // Meditation - stacked after workout
    if (completions.length > 0 && Math.random() < completionProb) {
      const workoutTime = new Date(completions[0].completedAt);
      workoutTime.setMinutes(workoutTime.getMinutes() + 35 + Math.floor(Math.random() * 15));
      completions.push({
        habitId: 'habit-meditation',
        completedAt: workoutTime.toISOString(),
        reminderResponseMin: Math.floor(Math.random() * 2) + 1,
      });
    }

    // Reading - evening habit
    if (Math.random() < completionProb - 0.05) {
      completions.push({
        habitId: 'habit-reading',
        completedAt: `${dateStr}T${21 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
        reminderResponseMin: Math.floor(Math.random() * 8) + 2,
      });
    }

    logs.push({
      date: dateStr,
      habitsCompleted: completions.length,
      habitsTarget: 3,
      completions,
      sleepScorePriorNight: sleepScore,
      hrvMorning,
      motivationLevel: 7 + Math.floor(Math.random() * 3),
    });
  }

  return logs;
}

function generateElenaDailyLogs(): DailyHabitLog[] {
  const logs: DailyHabitLog[] = [];
  const baseDate = new Date('2025-01-20');

  for (let day = 20; day >= 0; day--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - day);
    const dateStr = date.toISOString().split('T')[0];

    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const sleepScore = 55 + Math.floor(Math.random() * 35);
    const hrvMorning = 35 + Math.floor(Math.random() * 20);

    // Elena struggles more - needs reminders, evening person
    const baseCompletionProb = 0.68;
    const sleepPenalty = sleepScore < 70 ? 0.25 : 0;
    const weekendBonus = isWeekend ? 0.1 : 0;
    const completionProb = baseCompletionProb - sleepPenalty + weekendBonus;

    const completions: DailyHabitLog['completions'] = [];

    // Journaling - evening, her best habit
    if (Math.random() < completionProb + 0.15) {
      completions.push({
        habitId: 'habit-journaling',
        completedAt: `${dateStr}T${20 + Math.floor(Math.random() * 2)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
        reminderResponseMin: Math.floor(Math.random() * 5) + 2,
      });
    }

    // Gratitude - stacked with journaling
    if (completions.some(c => c.habitId === 'habit-journaling') && Math.random() < 0.87) {
      const journalTime = new Date(completions.find(c => c.habitId === 'habit-journaling')!.completedAt);
      journalTime.setMinutes(journalTime.getMinutes() + 10 + Math.floor(Math.random() * 10));
      completions.push({
        habitId: 'habit-gratitude',
        completedAt: journalTime.toISOString(),
        reminderResponseMin: 1,
      });
    }

    // Stretching - inconsistent
    if (Math.random() < completionProb - 0.1) {
      completions.push({
        habitId: 'habit-stretching',
        completedAt: `${dateStr}T${18 + Math.floor(Math.random() * 3)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
        reminderResponseMin: Math.floor(Math.random() * 15) + 5,
      });
    }

    // Water intake - tracked but often missed
    if (Math.random() < completionProb - 0.15) {
      completions.push({
        habitId: 'habit-water',
        completedAt: `${dateStr}T${12 + Math.floor(Math.random() * 8)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00Z`,
        reminderResponseMin: Math.floor(Math.random() * 20) + 5,
      });
    }

    // Screen cutoff - hardest habit for her
    if (Math.random() < completionProb - 0.25) {
      completions.push({
        habitId: 'habit-screen-cutoff',
        completedAt: `${dateStr}T21:30:00Z`,
        reminderResponseMin: Math.floor(Math.random() * 10) + 3,
      });
    }

    logs.push({
      date: dateStr,
      habitsCompleted: completions.length,
      habitsTarget: 5,
      completions,
      sleepScorePriorNight: sleepScore,
      hrvMorning,
      motivationLevel: 5 + Math.floor(Math.random() * 4),
    });
  }

  return logs;
}

// ============================================================================
// User 1: Marcus T. - "The Streak Builder"
// ============================================================================

export const marcusTDetail: HabitBandzUserDetail = {
  userId: 'hb-user-001',
  name: 'Marcus T.',
  avatar: '💪',
  archetype: 'The Streak Builder',
  enrollmentDate: '2024-12-05',
  activeDays: 45,
  complianceRate: 92,
  currentPhase: 'Active Optimization',
  tags: ['fitness-focused', 'morning-person', 'apple-watch', 'high-performer'],
  dataSources: [
    { id: 'ds-apple', name: 'Apple Watch', icon: 'watch', connected: true, lastSync: '2025-01-20T08:00:00Z' },
    { id: 'ds-band', name: 'Habit Band', icon: 'target', connected: true, lastSync: '2025-01-20T07:15:00Z' },
    { id: 'ds-surveys', name: 'Weekly Surveys', icon: 'clipboard', connected: true, lastSync: '2025-01-19T20:00:00Z' },
  ],
  habits: [
    {
      id: 'habit-workout',
      name: 'Morning Workout',
      category: 'Fitness',
      emoji: '🏋️',
      targetFrequency: 'daily',
      currentStreak: 28,
      bestStreak: 28,
      completionRate: 96,
      avgCompletionTime: '6:45 AM',
    },
    {
      id: 'habit-meditation',
      name: 'Meditation',
      category: 'Mindfulness',
      emoji: '🧘',
      targetFrequency: 'daily',
      currentStreak: 28,
      bestStreak: 28,
      completionRate: 91,
      avgCompletionTime: '7:25 AM',
      stackedWith: 'habit-workout',
    },
    {
      id: 'habit-reading',
      name: 'Evening Reading',
      category: 'Learning',
      emoji: '📚',
      targetFrequency: 'daily',
      currentStreak: 12,
      bestStreak: 19,
      completionRate: 84,
      avgCompletionTime: '9:30 PM',
    },
  ],
  dailyLogs: generateMarcusDailyLogs(),
  personalInsights: [
    {
      id: 'ins-marcus-001',
      title: 'Early Bird Advantage',
      subtitle: 'Your workouts before 7 AM have 98% streak survival',
      xVariable: 'Workout completion time',
      yVariable: 'Streak survival',
      theta: { value: 7, unit: 'hour', displayValue: '7:00 AM' },
      betaBelow: { value: 0.98, description: '98% streak survival rate' },
      betaAbove: { value: -0.18, description: '-18% survival per hour after 7 AM' },
      currentValue: 6.75,
      currentUnit: 'hour',
      currentStatus: 'at_optimal',
      personalDataPct: 94,
      populationDataPct: 6,
      observations: 42,
      daysOfData: 45,
      curveType: 'plateau_down',
      actionableAdvice: 'Your 6:45 AM average is perfect. Keep protecting this window.',
    },
    {
      id: 'ins-marcus-002',
      title: 'Meditation Stack',
      subtitle: 'Stacking meditation after workout gives 3x streak survival',
      xVariable: 'Minutes after workout',
      yVariable: 'Meditation streak',
      theta: { value: 45, unit: 'min', displayValue: '45 min after workout' },
      betaBelow: { value: 3.0, description: '3x streak survival' },
      betaAbove: { value: -0.5, description: '-50% survival if delayed >45 min' },
      currentValue: 35,
      currentUnit: 'min',
      currentStatus: 'at_optimal',
      personalDataPct: 91,
      populationDataPct: 9,
      observations: 38,
      daysOfData: 45,
      curveType: 'plateau_down',
      actionableAdvice: 'Your habit stack is working perfectly. Meditation follows workout 91% of the time.',
    },
    {
      id: 'ins-marcus-003',
      title: 'Sleep-Recovery Link',
      subtitle: 'HRV below 45ms predicts skipped meditation',
      xVariable: 'Morning HRV',
      yVariable: 'Meditation completion',
      theta: { value: 45, unit: 'ms', displayValue: '45 ms RMSSD' },
      betaBelow: { value: -0.28, description: '-28% completion rate' },
      betaAbove: { value: 0.02, description: 'Minimal additional benefit' },
      currentValue: 52,
      currentUnit: 'ms',
      currentStatus: 'at_optimal',
      personalDataPct: 88,
      populationDataPct: 12,
      observations: 45,
      daysOfData: 45,
      curveType: 'plateau_up',
      actionableAdvice: 'Your average HRV is 52ms - well above threshold. Keep prioritizing recovery.',
    },
    {
      id: 'ins-marcus-004',
      title: 'Reading Timing',
      subtitle: 'Reading after 10 PM reduces next-day workout quality',
      xVariable: 'Reading completion time',
      yVariable: 'Next-day workout intensity',
      theta: { value: 22, unit: 'hour', displayValue: '10:00 PM' },
      betaBelow: { value: 0.85, description: '85% workout intensity maintained' },
      betaAbove: { value: -0.12, description: '-12% intensity per hour after 10 PM' },
      currentValue: 21.5,
      currentUnit: 'hour',
      currentStatus: 'at_optimal',
      personalDataPct: 78,
      populationDataPct: 22,
      observations: 35,
      daysOfData: 45,
      curveType: 'plateau_down',
      actionableAdvice: 'Your 9:30 PM average is great. Consider a hard stop at 10 PM.',
    },
  ],
  keyMetrics: [
    {
      id: 'km-streak',
      name: 'Current Streak',
      value: 28,
      unit: 'days',
      change: 7,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [14, 15, 18, 21, 24, 26, 28],
      period: '7-day',
    },
    {
      id: 'km-completion',
      name: 'Completion Rate',
      value: 92,
      unit: '%',
      change: 4,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [85, 87, 88, 90, 91, 91, 92],
      period: '7-day',
    },
    {
      id: 'km-consistency',
      name: 'Timing Consistency',
      value: 0.8,
      unit: 'hr std',
      change: -0.3,
      changeDirection: 'down',
      isGood: true,
      sparklineData: [1.4, 1.2, 1.1, 1.0, 0.9, 0.85, 0.8],
      period: '7-day',
    },
    {
      id: 'km-response',
      name: 'Avg Reminder Response',
      value: 2.1,
      unit: 'min',
      change: -0.8,
      changeDirection: 'down',
      isGood: true,
      sparklineData: [3.5, 3.2, 2.8, 2.5, 2.3, 2.2, 2.1],
      period: '7-day',
    },
  ],
  weeklyStats: [
    { week: '2025-W03', completionRate: 92, avgStreakLength: 26, habitStackEvents: 6, avgReminderResponse: 2.1 },
    { week: '2025-W02', completionRate: 90, avgStreakLength: 19, habitStackEvents: 6, avgReminderResponse: 2.5 },
    { week: '2025-W01', completionRate: 88, avgStreakLength: 12, habitStackEvents: 5, avgReminderResponse: 3.2 },
    { week: '2024-W52', completionRate: 85, avgStreakLength: 5, habitStackEvents: 4, avgReminderResponse: 4.1 },
  ],
};

// ============================================================================
// User 2: Elena R. - "The Habit Explorer"
// ============================================================================

export const elenaRDetail: HabitBandzUserDetail = {
  userId: 'hb-user-002',
  name: 'Elena R.',
  avatar: '🌱',
  archetype: 'The Habit Explorer',
  enrollmentDate: '2024-12-30',
  activeDays: 21,
  complianceRate: 68,
  currentPhase: 'Baseline',
  tags: ['new-user', 'multiple-habits', 'needs-reminders', 'evening-person'],
  dataSources: [
    { id: 'ds-fitbit', name: 'Fitbit', icon: 'watch', connected: true, lastSync: '2025-01-20T07:30:00Z' },
    { id: 'ds-band', name: 'Habit Band', icon: 'target', connected: true, lastSync: '2025-01-20T06:45:00Z' },
    { id: 'ds-surveys', name: 'Weekly Surveys', icon: 'clipboard', connected: true, lastSync: '2025-01-19T21:00:00Z' },
  ],
  habits: [
    {
      id: 'habit-journaling',
      name: 'Evening Journaling',
      category: 'Mindfulness',
      emoji: '📝',
      targetFrequency: 'daily',
      currentStreak: 5,
      bestStreak: 8,
      completionRate: 81,
      avgCompletionTime: '8:45 PM',
    },
    {
      id: 'habit-gratitude',
      name: 'Gratitude Practice',
      category: 'Mindfulness',
      emoji: '🙏',
      targetFrequency: 'daily',
      currentStreak: 5,
      bestStreak: 7,
      completionRate: 76,
      avgCompletionTime: '9:00 PM',
      stackedWith: 'habit-journaling',
    },
    {
      id: 'habit-stretching',
      name: 'Evening Stretching',
      category: 'Fitness',
      emoji: '🧘‍♀️',
      targetFrequency: 'daily',
      currentStreak: 2,
      bestStreak: 5,
      completionRate: 58,
      avgCompletionTime: '7:15 PM',
    },
    {
      id: 'habit-water',
      name: 'Water Intake (8 glasses)',
      category: 'Health',
      emoji: '💧',
      targetFrequency: 'daily',
      currentStreak: 1,
      bestStreak: 4,
      completionRate: 52,
      avgCompletionTime: '3:30 PM',
    },
    {
      id: 'habit-screen-cutoff',
      name: 'Screen Cutoff (9:30 PM)',
      category: 'Sleep',
      emoji: '📵',
      targetFrequency: 'daily',
      currentStreak: 0,
      bestStreak: 3,
      completionRate: 38,
      avgCompletionTime: '9:30 PM',
    },
  ],
  dailyLogs: generateElenaDailyLogs(),
  personalInsights: [
    {
      id: 'ins-elena-001',
      title: 'Journaling-Gratitude Stack',
      subtitle: 'When you journal first, gratitude completion is 87%',
      xVariable: 'Journaling completed',
      yVariable: 'Gratitude completion',
      theta: { value: 1, unit: 'boolean', displayValue: 'Journal first' },
      betaBelow: { value: 0.35, description: '35% gratitude completion alone' },
      betaAbove: { value: 0.87, description: '87% when stacked with journaling' },
      currentValue: 1,
      currentUnit: 'stack',
      currentStatus: 'at_optimal',
      personalDataPct: 86,
      populationDataPct: 14,
      observations: 17,
      daysOfData: 21,
      curveType: 'plateau_up',
      actionableAdvice: 'This stack is working! Consider dropping other habits to focus on this pair.',
    },
    {
      id: 'ins-elena-002',
      title: 'Sleep-Habit Correlation',
      subtitle: 'Sleep below 70% predicts 42% drop in next-day habits',
      xVariable: 'Prior night sleep score',
      yVariable: 'Next-day completion rate',
      theta: { value: 70, unit: '%', displayValue: '70% sleep score' },
      betaBelow: { value: -0.42, description: '-42% completion rate' },
      betaAbove: { value: 0.05, description: '+5% per 10 points above threshold' },
      currentValue: 62,
      currentUnit: '%',
      currentStatus: 'below_optimal',
      personalDataPct: 82,
      populationDataPct: 18,
      observations: 21,
      daysOfData: 21,
      curveType: 'plateau_up',
      actionableAdvice: 'Your avg sleep score is 62%. Improving sleep would boost all your habits.',
    },
    {
      id: 'ins-elena-003',
      title: 'Too Many Habits',
      subtitle: 'You complete 2.1 habits/day on average vs 5 target',
      xVariable: 'Number of active habits',
      yVariable: 'Per-habit completion rate',
      theta: { value: 3, unit: 'habits', displayValue: '3 habits max' },
      betaBelow: { value: 0.78, description: '78% completion per habit' },
      betaAbove: { value: -0.15, description: '-15% per additional habit' },
      currentValue: 5,
      currentUnit: 'habits',
      currentStatus: 'above_optimal',
      personalDataPct: 75,
      populationDataPct: 25,
      observations: 21,
      daysOfData: 21,
      curveType: 'plateau_down',
      actionableAdvice: 'Research shows 2-3 habits is optimal for new users. Consider pausing Water and Screen Cutoff.',
    },
  ],
  keyMetrics: [
    {
      id: 'km-streak',
      name: 'Best Active Streak',
      value: 5,
      unit: 'days',
      change: 2,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [2, 3, 0, 2, 4, 5, 5],
      period: '7-day',
    },
    {
      id: 'km-completion',
      name: 'Completion Rate',
      value: 68,
      unit: '%',
      change: 8,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [55, 58, 62, 60, 65, 68, 68],
      period: '7-day',
    },
    {
      id: 'km-stack-rate',
      name: 'Stack Success Rate',
      value: 87,
      unit: '%',
      change: 12,
      changeDirection: 'up',
      isGood: true,
      sparklineData: [70, 72, 78, 80, 82, 85, 87],
      period: '7-day',
    },
    {
      id: 'km-response',
      name: 'Avg Reminder Response',
      value: 6.8,
      unit: 'min',
      change: -2.1,
      changeDirection: 'down',
      isGood: true,
      sparklineData: [12, 10, 9, 8.5, 7.5, 7, 6.8],
      period: '7-day',
    },
  ],
  weeklyStats: [
    { week: '2025-W03', completionRate: 68, avgStreakLength: 4.2, habitStackEvents: 5, avgReminderResponse: 6.8 },
    { week: '2025-W02', completionRate: 62, avgStreakLength: 3.1, habitStackEvents: 4, avgReminderResponse: 8.5 },
    { week: '2025-W01', completionRate: 55, avgStreakLength: 2.0, habitStackEvents: 2, avgReminderResponse: 11.2 },
  ],
};

// ============================================================================
// Habit Bandz User Detail Data Index
// ============================================================================

export const habitBandzUserDetails: Record<string, HabitBandzUserDetail> = {
  'hb-user-001': marcusTDetail,
  'hb-user-002': elenaRDetail,
};

export function getHabitBandzUserDetail(userId: string): HabitBandzUserDetail | undefined {
  return habitBandzUserDetails[userId];
}
