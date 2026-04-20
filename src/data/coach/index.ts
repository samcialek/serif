// Types
export type {
  CohortStats,
  MemberFilters,
  MemberSortField,
  SortDirection,
  MemberSort,
} from './types'

export {
  MEMBER_STATUS_CONFIG,
  DISCUSSION_PRIORITY_CONFIG,
  getTrendDisplay,
  formatSessionDate,
  getTimeUntilSession,
} from './types'

// Members
export {
  coachMembers,
  getAllMembers,
  getAllMembers as getCoachMembers,
  getMemberById,
  getMemberByPersonaId,
  getMembersByStatus,
  getMembersWithFlags,
  sortMembersByPriority,
  searchMembers,
} from './members'

// Session preps
export {
  sessionPreps,
  getAllSessionPreps,
  getAllSessionPreps as getSessionPreps,
  weeklyDigests,
  getSessionPrep,
  getWeeklyDigest,
  getCoachWeeklySummary,
  getCoachWeeklySummary as getWeeklySummary,
  generateDigestText,
} from './sessionPreps'

// Computed helpers
import { coachMembers } from './members'
import type { CohortStats } from './types'

/**
 * Calculate cohort statistics
 */
export function getCohortStats(): CohortStats {
  const members = coachMembers

  const atRisk = members.filter(m => m.status === 'at-risk').length
  const needsAttention = members.filter(m => m.status === 'needs-attention').length
  const onTrack = members.filter(m => m.status === 'on-track').length
  const insufficientData = members.filter(m => m.status === 'insufficient-data').length

  // Calculate average adherence (mock calculation)
  const avgAdherence = 72 // This would be calculated from actual adherence data

  // Sessions this week (mock)
  const sessionsThisWeek = 4
  const sessionsCompleted = 2

  return {
    totalMembers: members.length,
    atRisk,
    needsAttention,
    onTrack,
    insufficientData,
    avgAdherence,
    sessionsThisWeek,
    sessionsCompleted,
  }
}
