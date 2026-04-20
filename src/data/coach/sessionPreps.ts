import type { SessionPrep, WeeklyDigest } from '@/types'

/**
 * Pre-generated session preps for demo
 */
export const sessionPreps: Record<string, SessionPrep> = {
  'member-rajan': {
    memberId: 'member-rajan',
    memberName: 'Rajan P.',
    sessionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sessionDuration: 30,
    prepTimeSaved: '45 minutes',
    discussionPoints: [
      {
        title: 'Sleep Regression',
        priority: 'high',
        priorityColor: '#EF4444',
        whatIsHappening: [
          'Sleep score dropped from 78 to 65 over 2 weeks',
          'Sleep latency increased from 12 to 22 minutes',
          'Deep sleep declined by 18 minutes',
        ],
        rootCause: 'Workout timing shifted from 6:30 PM to 8:15 PM average over the past 2 weeks, likely due to work deadline pressure.',
        suggestedIntervention: 'Discuss schedule constraints and explore morning workout option. If evenings are required, recommend finishing by 7 PM.',
        expectedImpact: '-10 min sleep latency, +12 deep sleep minutes within 7 days',
        talkingPoints: [
          'Ask about current work situation and schedule pressures',
          'Explore feasibility of morning workouts',
          'Discuss the 7 PM threshold and why it matters for him specifically',
          'Set a realistic goal for this week',
        ],
      },
      {
        title: 'HRV Suppression',
        priority: 'high',
        priorityColor: '#EF4444',
        whatIsHappening: [
          'HRV dropped from 48ms to 42ms',
          'Coincides with later caffeine consumption',
          'Resting HR elevated by 4 bpm',
        ],
        rootCause: 'Caffeine consumption shifted from before 2 PM to 3-4 PM, suppressing overnight autonomic recovery.',
        suggestedIntervention: 'Reinforce 2:15 PM caffeine cutoff. Consider switching to decaf for afternoon energy.',
        expectedImpact: '+6ms HRV within 10 days if caffeine cutoff is maintained',
        talkingPoints: [
          'Review his current caffeine habits',
          'Explain the HRV-caffeine connection in his data',
          'Suggest alternatives for afternoon energy dips',
          'Consider sleep debt as root cause of afternoon fatigue',
        ],
      },
      {
        title: 'Zone 2 Success (Positive)',
        priority: 'low',
        priorityColor: '#3B82F6',
        whatIsHappening: [
          'Triglycerides dropped from 156 to 131 mg/dL',
          'Consistent 185 min/week Zone 2 training',
          'Testosterone improved 26% over 3 months',
        ],
        rootCause: 'Sustained Zone 2 cardiovascular training is improving metabolic markers.',
        suggestedIntervention: 'Celebrate this win! Encourage continuation of Zone 2 focus.',
        expectedImpact: 'Continued improvement if maintained',
        talkingPoints: [
          'Acknowledge his consistency with Zone 2',
          'Share the triglyceride improvement data',
          'Discuss how this proves the system works when he follows it',
          'Use as motivation for sleep/caffeine changes',
        ],
      },
    ],
    metrics: [
      { name: 'Sleep Score', previous: 78, current: 65, unit: 'score', trend: 'down', isGood: false },
      { name: 'HRV', previous: 48, current: 42, unit: 'ms', trend: 'down', isGood: false },
      { name: 'Sleep Latency', previous: 12, current: 22, unit: 'min', trend: 'up', isGood: false },
      { name: 'Deep Sleep', previous: 58, current: 40, unit: 'min', trend: 'down', isGood: false },
      { name: 'Fasting Glucose', previous: 95, current: 104, unit: 'mg/dL', trend: 'up', isGood: false },
      { name: 'Triglycerides', previous: 142, current: 131, unit: 'mg/dL', trend: 'down', isGood: true },
    ],
    lastSessionNotes: 'Discussed Zone 2 progress and set goal of maintaining 175+ min/week. Rajan mentioned increased work pressure but committed to keeping workouts before 7 PM. Follow up on this commitment.',
    adherence: [
      { category: 'Workout Timing', percentage: 42 },
      { category: 'Caffeine Cutoff', percentage: 58 },
      { category: 'Bedroom Temp', percentage: 35 },
      { category: 'Zone 2 Training', percentage: 92 },
    ],
  },
  'member-sarah': {
    memberId: 'member-sarah',
    memberName: 'Sarah M.',
    sessionDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sessionDuration: 30,
    prepTimeSaved: '40 minutes',
    discussionPoints: [
      {
        title: 'Metabolic Transformation (Celebrate!)',
        priority: 'low',
        priorityColor: '#3B82F6',
        whatIsHappening: [
          'Fasting glucose dropped from 118 to 94 mg/dL (20% improvement)',
          'HbA1c improved from 5.9% to 5.3%',
          'Time in range increased from 72% to 87%',
        ],
        rootCause: 'Consistent adherence to 8-hour eating window and post-meal walks for 90 days.',
        suggestedIntervention: 'Celebrate this major milestone! Discuss what made her successful and how to maintain.',
        expectedImpact: 'Continued improvement toward optimal ranges',
        talkingPoints: [
          'Share the transformation data visually',
          'Ask what helped her stay consistent',
          'Discuss her long-term goals now that pre-diabetes is reversed',
          'Explore any new health goals she wants to pursue',
        ],
      },
      {
        title: 'Next Phase Planning',
        priority: 'medium',
        priorityColor: '#F59E0B',
        whatIsHappening: [
          'Core metabolic goals largely achieved',
          'Sleep and energy are stable',
          'Ready for optimization phase',
        ],
        rootCause: 'Foundation phase complete—time to introduce new optimization targets.',
        suggestedIntervention: 'Introduce secondary goals like fitness performance or stress management.',
        expectedImpact: 'Expanded health optimization beyond metabolic markers',
        talkingPoints: [
          'Explore her interest areas (fitness, stress, longevity)',
          'Discuss potential new wearable additions (CGM retention?)',
          'Set 90-day goals for next phase',
        ],
      },
    ],
    metrics: [
      { name: 'Fasting Glucose', previous: 102, current: 94, unit: 'mg/dL', trend: 'down', isGood: true },
      { name: 'HbA1c', previous: 5.5, current: 5.3, unit: '%', trend: 'down', isGood: true },
      { name: 'Time in Range', previous: 78, current: 87, unit: '%', trend: 'up', isGood: true },
      { name: 'Sleep Score', previous: 78, current: 82, unit: 'score', trend: 'up', isGood: true },
      { name: 'HRV', previous: 48, current: 52, unit: 'ms', trend: 'up', isGood: true },
    ],
    lastSessionNotes: 'Sarah expressed excitement about her glucose improvements. Wants to eventually reduce CGM usage and maintain gains without continuous monitoring. Discussed transition plan.',
    adherence: [
      { category: 'Eating Window', percentage: 95 },
      { category: 'Post-Meal Walks', percentage: 88 },
      { category: 'Sleep Schedule', percentage: 82 },
      { category: 'Protein First', percentage: 71 },
    ],
  },
  'member-marcus': {
    memberId: 'member-marcus',
    memberName: 'Marcus J.',
    sessionDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sessionDuration: 45,
    prepTimeSaved: '50 minutes',
    discussionPoints: [
      {
        title: 'Overtraining Risk',
        priority: 'high',
        priorityColor: '#EF4444',
        whatIsHappening: [
          'HRV dropped from 62 to 52ms (16% decline)',
          'Recovery score at 58% (down from 68%)',
          '3 consecutive high-strain days last week',
        ],
        rootCause: 'Insufficient recovery time between high-intensity sessions. Training load exceeding recovery capacity.',
        suggestedIntervention: 'Implement mandatory 48-hour spacing between high-intensity workouts. Add dedicated recovery days.',
        expectedImpact: '+8ms HRV and 70%+ recovery score within 7 days',
        talkingPoints: [
          'Review his training log and strain patterns',
          'Explain the 48-hour HRV recovery window in his data',
          'Discuss his competition/training goals',
          'Create a realistic training schedule together',
        ],
      },
      {
        title: 'Inflammation Progress (Positive)',
        priority: 'medium',
        priorityColor: '#F59E0B',
        whatIsHappening: [
          'hsCRP dropped from 2.8 to 1.6 mg/L (43% improvement)',
          'Zero alcohol maintained for 60 days',
          'Cold exposure protocol consistent',
        ],
        rootCause: 'Alcohol elimination and consistent recovery practices are reducing systemic inflammation.',
        suggestedIntervention: 'Reinforce the alcohol-inflammation connection and encourage continuation.',
        expectedImpact: 'Target hsCRP below 1.0 with continued protocol',
        talkingPoints: [
          'Celebrate the inflammation improvement',
          'Discuss any challenges with alcohol abstinence',
          'Review cold exposure routine and benefits',
          'Consider adding omega-3 or other anti-inflammatory support',
        ],
      },
    ],
    metrics: [
      { name: 'Recovery Score', previous: 68, current: 58, unit: '%', trend: 'down', isGood: false },
      { name: 'HRV', previous: 62, current: 52, unit: 'ms', trend: 'down', isGood: false },
      { name: 'hsCRP', previous: 2.8, current: 1.6, unit: 'mg/L', trend: 'down', isGood: true },
      { name: 'Deep Sleep', previous: 58, current: 62, unit: 'min', trend: 'up', isGood: true },
      { name: 'Resting HR', previous: 54, current: 52, unit: 'bpm', trend: 'down', isGood: true },
    ],
    lastSessionNotes: 'Marcus committed to maintaining zero alcohol and was excited about inflammation improvements. Discussed potential return to competitive events in Q1. Need to balance training intensity with recovery.',
    adherence: [
      { category: 'Training Spacing', percentage: 45 },
      { category: 'Cold Exposure', percentage: 85 },
      { category: 'No Alcohol', percentage: 100 },
      { category: 'Caffeine Cutoff', percentage: 78 },
    ],
  },
}

/**
 * Weekly digest templates
 */
export const weeklyDigests: Record<string, WeeklyDigest> = {
  'member-rajan': {
    memberId: 'member-rajan',
    weekOf: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    wins: [
      'Maintained Zone 2 training at 185 min/week',
      'Triglycerides continue to improve',
      'No alcohol consumption this week',
    ],
    regressions: [
      'Sleep score dropped to 65 average (was 78)',
      'HRV declined 12% from baseline',
      'Workout timing shifted 90 minutes later',
    ],
    likelyCauses: [
      'Work deadline pressure leading to late workouts',
      'Increased afternoon caffeine consumption',
      'Possible sleep debt accumulation',
    ],
    recommendedNextSteps: [
      'Discuss schedule constraints and find workout time solution',
      'Reinforce 2:15 PM caffeine cutoff',
      'Consider morning workout experiment',
    ],
    confidenceNote: 'High confidence in sleep-workout timing relationship (89% personal data). Moderate confidence in caffeine-HRV connection (84% personal data).',
  },
}

/**
 * Get all session preps as an array (for list views)
 */
export function getAllSessionPreps() {
  return Object.values(sessionPreps).map(prep => {
    const discussionPoints = prep.discussionPoints || []
    const firstPoint = discussionPoints[0]
    return {
      ...prep,
      id: prep.memberId,
      clientName: prep.memberName,
      focus: (typeof firstPoint === 'object' && firstPoint?.title) || 'General coaching',
      urgency: discussionPoints.some(d => typeof d === 'object' && d.priority === 'high') ? 'high' as const : 'medium' as const,
      sessionTime: prep.sessionDate,
      keyMetrics: prep.metrics.slice(0, 4).map(m => ({
        label: m.name,
        value: `${m.current}${m.unit}`,
        trend: m.trend === 'up' ? (m.isGood ? '+' : '-') : m.trend === 'down' ? (m.isGood ? '-' : '+') : '',
      })),
      alerts: discussionPoints
        .filter(d => typeof d === 'object' && d.priority === 'high')
        .map(d => typeof d === 'object' ? d.whatIsHappening?.[0] : d),
    }
  })
}

/**
 * Get session prep by member ID
 */
export function getSessionPrep(memberId: string): SessionPrep | undefined {
  return sessionPreps[memberId]
}

/**
 * Get weekly digest by member ID
 */
export function getWeeklyDigest(memberId: string): WeeklyDigest | undefined {
  return weeklyDigests[memberId]
}

/**
 * Generate digest text for export
 */
export function generateDigestText(digest: WeeklyDigest, memberName: string): string {
  return `
WEEKLY DIGEST: ${memberName}
Week of ${digest.weekOf}
Generated by Serif AI

WINS THIS WEEK:
${digest.wins.map(w => `• ${w}`).join('\n')}

AREAS OF CONCERN:
${digest.regressions.map(r => `• ${r}`).join('\n')}

LIKELY CAUSES:
${digest.likelyCauses.map(c => `• ${c}`).join('\n')}

RECOMMENDED NEXT STEPS:
${digest.recommendedNextSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

${digest.confidenceNote}
  `.trim()
}

/**
 * Get coach weekly summary (for dashboard overview)
 */
export function getCoachWeeklySummary() {
  const preps = getAllSessionPreps()
  return {
    totalSessions: preps.length,
    newInsights: 24,
    protocolsStarted: 8,
    avgCertainty: 76,
    needsAttention: [
      { name: 'Rajan P.', reason: 'Sleep regression - workout timing shifted' },
      { name: 'Marcus J.', reason: 'Overtraining risk - HRV declining' },
    ],
    topProtocols: [
      { name: 'Zone 2 Training', clients: 8, improvement: '+12% cardio' },
      { name: 'Caffeine Cutoff', clients: 6, improvement: '+8ms HRV' },
      { name: 'Time-Restricted Eating', clients: 5, improvement: '-8 mg/dL glucose' },
    ],
  }
}
