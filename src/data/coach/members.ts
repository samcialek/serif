import type { CoachMember } from '@/types'

/**
 * Coach member roster - linked to personas
 */
export const coachMembers: CoachMember[] = [
  {
    id: 'member-rajan',
    personaId: 'rajan',
    name: 'Rajan P.',
    avatar: '/assets/avatars/rajan.jpg',
    focus: 'Sleep & metabolic health',
    daysOfData: 67,
    insightCount: 23,
    activeProtocols: 3,
    adherence: 68,
    lastSyncHours: 3,
    status: 'at-risk',
    statusReason: 'Sleep declining, glucose trending up',
    flags: ['sleep_regression', 'late_workouts', 'glucose_creep'],
    lastSession: '2024-12-20',
    nextSession: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    keyMetrics: [
      {
        name: 'Sleep Score',
        previous: 78,
        current: 65,
        unit: 'score',
        trend: 'down',
        isGood: false,
      },
      {
        name: 'HRV',
        previous: 48,
        current: 42,
        unit: 'ms',
        trend: 'down',
        isGood: false,
      },
      {
        name: 'Fasting Glucose',
        previous: 95,
        current: 104,
        unit: 'mg/dL',
        trend: 'up',
        isGood: false,
      },
      {
        name: 'Triglycerides',
        previous: 142,
        current: 131,
        unit: 'mg/dL',
        trend: 'down',
        isGood: true,
      },
    ],
    topDrivers: [
      { driver: 'Late workout timing', direction: 'negative', certainty: 0.89 },
      { driver: 'Afternoon caffeine', direction: 'negative', certainty: 0.84 },
      { driver: 'Zone 2 training', direction: 'positive', certainty: 0.91 },
    ],
    todayReco: [
      { text: 'Finish workout before 7 PM', certainty: 0.89 },
      { text: 'No caffeine after 2:15 PM', certainty: 0.84 },
      { text: 'Lower bedroom temp to 19°C', certainty: 0.76 },
    ],
    coachMessage: `Hi Rajan, I noticed your sleep has been declining over the past two weeks. Looking at your data, it seems like your workout times have shifted later—which correlates strongly with your increased sleep latency. Can we chat about your current schedule and find a time that works better for your body?`,
  },
  {
    id: 'member-sarah',
    personaId: 'sarah',
    name: 'Sarah M.',
    avatar: '/assets/avatars/sarah.png?v=1',
    focus: 'Metabolic health',
    daysOfData: 124,
    insightCount: 41,
    activeProtocols: 2,
    adherence: 93,
    lastSyncHours: 1,
    status: 'on-track',
    statusReason: 'Glucose improving, great adherence',
    flags: [],
    lastSession: '2024-12-18',
    nextSession: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    keyMetrics: [
      {
        name: 'Fasting Glucose',
        previous: 102,
        current: 94,
        unit: 'mg/dL',
        trend: 'down',
        isGood: true,
      },
      {
        name: 'Time in Range',
        previous: 78,
        current: 87,
        unit: '%',
        trend: 'up',
        isGood: true,
      },
      {
        name: 'HbA1c',
        previous: 5.5,
        current: 5.3,
        unit: '%',
        trend: 'down',
        isGood: true,
      },
      {
        name: 'Sleep Score',
        previous: 78,
        current: 82,
        unit: 'score',
        trend: 'up',
        isGood: true,
      },
    ],
    topDrivers: [
      { driver: '8-hour eating window', direction: 'positive', certainty: 0.93 },
      { driver: 'Post-meal walks', direction: 'positive', certainty: 0.88 },
      { driver: 'Sleep consistency', direction: 'positive', certainty: 0.86 },
    ],
    todayReco: [
      { text: 'Maintain 10 AM - 6 PM eating window', certainty: 0.93 },
      { text: '15-min walk after lunch', certainty: 0.88 },
      { text: 'Continue 7.5+ hrs sleep', certainty: 0.86 },
    ],
    coachMessage: `Sarah, your progress over the past 3 months has been incredible! Your fasting glucose dropped from 118 to 94—that's a 20% improvement. Your consistency with the eating window and post-meal walks is really paying off. Let's talk about what's next in our upcoming session.`,
  },
  {
    id: 'member-marcus',
    personaId: 'marcus',
    name: 'Marcus J.',
    avatar: '/assets/avatars/marcus.jpg',
    focus: 'Recovery & performance',
    daysOfData: 89,
    insightCount: 29,
    activeProtocols: 4,
    adherence: 81,
    lastSyncHours: 6,
    status: 'needs-attention',
    statusReason: 'High strain, recovery lagging',
    flags: ['overtraining_risk', 'hrv_suppressed'],
    lastSession: '2024-12-15',
    nextSession: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    keyMetrics: [
      {
        name: 'Recovery Score',
        previous: 68,
        current: 58,
        unit: '%',
        trend: 'down',
        isGood: false,
      },
      {
        name: 'HRV',
        previous: 62,
        current: 52,
        unit: 'ms',
        trend: 'down',
        isGood: false,
      },
      {
        name: 'hsCRP',
        previous: 2.8,
        current: 1.6,
        unit: 'mg/L',
        trend: 'down',
        isGood: true,
      },
      {
        name: 'Deep Sleep',
        previous: 58,
        current: 62,
        unit: 'min',
        trend: 'up',
        isGood: true,
      },
    ],
    topDrivers: [
      { driver: 'Training spacing', direction: 'negative', certainty: 0.91 },
      { driver: 'Cold exposure', direction: 'positive', certainty: 0.74 },
      { driver: 'Zero alcohol', direction: 'positive', certainty: 0.87 },
    ],
    todayReco: [
      { text: 'No high-intensity today', certainty: 0.91 },
      { text: 'Cold shower post-activity', certainty: 0.74 },
      { text: 'Early caffeine cutoff (noon)', certainty: 0.83 },
    ],
    coachMessage: `Marcus, I see you've had 3 high-strain days back-to-back. Your HRV is showing signs of overreaching—it dropped from 62 to 52. Let's discuss adjusting your training schedule to include more recovery days. The good news: your inflammation markers (hsCRP) continue to improve!`,
  },
  {
    id: 'member-emma',
    personaId: 'emma',
    name: 'Emma L.',
    avatar: '/assets/avatars/emma.jpg',
    focus: 'Building baseline',
    daysOfData: 12,
    insightCount: 4,
    activeProtocols: 1,
    adherence: 76,
    lastSyncHours: 2,
    status: 'insufficient-data',
    statusReason: 'Only 12 days of data—building baseline',
    flags: ['new_user', 'irregular_bedtime'],
    lastSession: '2024-12-22',
    nextSession: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    keyMetrics: [
      {
        name: 'Sleep Score',
        previous: 68,
        current: 71,
        unit: 'score',
        trend: 'up',
        isGood: true,
      },
      {
        name: 'Steps',
        previous: 4800,
        current: 5200,
        unit: 'steps',
        trend: 'up',
        isGood: true,
      },
      {
        name: 'HRV',
        previous: 36,
        current: 38,
        unit: 'ms',
        trend: 'up',
        isGood: true,
      },
    ],
    topDrivers: [
      { driver: 'Bedtime consistency', direction: 'negative', certainty: 0.62 },
      { driver: 'Step count', direction: 'positive', certainty: 0.58 },
    ],
    todayReco: [
      { text: 'Try 10:30 PM bedtime', certainty: 0.62 },
      { text: 'Aim for 8,000 steps', certainty: 0.58 },
      { text: 'Keep wearing Apple Watch to bed', certainty: 1.0 },
    ],
    coachMessage: `Hi Emma! Welcome to your second week of tracking. I'm seeing some interesting patterns already—your bedtime varies by about 90 minutes, which might be affecting your sleep quality. Let's experiment with a consistent bedtime this week and see how your data responds.`,
  },
]

/**
 * Get all coach members
 */
export function getAllMembers(): CoachMember[] {
  return coachMembers
}

/**
 * Get member by ID
 */
export function getMemberById(id: string): CoachMember | undefined {
  return coachMembers.find(m => m.id === id)
}

/**
 * Get member by persona ID
 */
export function getMemberByPersonaId(personaId: string): CoachMember | undefined {
  return coachMembers.find(m => m.personaId === personaId)
}

/**
 * Get members by status
 */
export function getMembersByStatus(status: CoachMember['status']): CoachMember[] {
  return coachMembers.filter(m => m.status === status)
}

/**
 * Get members with flags
 */
export function getMembersWithFlags(): CoachMember[] {
  return coachMembers.filter(m => m.flags.length > 0)
}

/**
 * Sort members by status priority
 */
export function sortMembersByPriority(members: CoachMember[]): CoachMember[] {
  const statusPriority: Record<CoachMember['status'], number> = {
    'at-risk': 0,
    'needs-attention': 1,
    'insufficient-data': 2,
    'on-track': 3,
    'active': 4,
    'inactive': 5,
  }

  return [...members].sort((a, b) => statusPriority[a.status] - statusPriority[b.status])
}

/**
 * Search members by name
 */
export function searchMembers(query: string): CoachMember[] {
  const lowerQuery = query.toLowerCase()
  return coachMembers.filter(m =>
    m.name.toLowerCase().includes(lowerQuery)
  )
}
