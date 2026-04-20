import type { CoachMember, MetricDelta, DiscussionPoint } from '@/types'

/**
 * Coach dashboard stats
 */
export interface CohortStats {
  totalMembers: number
  atRisk: number
  needsAttention: number
  onTrack: number
  insufficientData: number
  avgAdherence: number
  sessionsThisWeek: number
  sessionsCompleted: number
}

/**
 * Member filter options
 */
export interface MemberFilters {
  status?: CoachMember['status'] | CoachMember['status'][]
  hasFlags?: boolean
  searchQuery?: string
}

/**
 * Sort options for member list
 */
export type MemberSortField = 'name' | 'status' | 'nextSession' | 'lastSession'
export type SortDirection = 'asc' | 'desc'

export interface MemberSort {
  field: MemberSortField
  direction: SortDirection
}

/**
 * Status colors and labels
 */
export const MEMBER_STATUS_CONFIG: Record<
  CoachMember['status'],
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  'active': {
    label: 'Active',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  'inactive': {
    label: 'Inactive',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-200',
  },
  'at-risk': {
    label: 'At Risk',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  'needs-attention': {
    label: 'Needs Attention',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  'on-track': {
    label: 'On Track',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  'insufficient-data': {
    label: 'Insufficient Data',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
}

/**
 * Priority colors for discussion points
 */
export const DISCUSSION_PRIORITY_CONFIG: Record<
  DiscussionPoint['priority'],
  { label: string; color: string; bgColor: string }
> = {
  high: {
    label: 'High Priority',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  medium: {
    label: 'Medium Priority',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  low: {
    label: 'Low Priority',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
}

/**
 * Get trend icon and color for metric delta
 */
export function getTrendDisplay(delta: MetricDelta): {
  icon: 'up' | 'down' | 'stable'
  color: string
  label: string
} {
  const changePercent = ((delta.current - delta.previous) / delta.previous) * 100

  let icon: 'up' | 'down' | 'stable'
  if (Math.abs(changePercent) < 2) {
    icon = 'stable'
  } else if (delta.current > delta.previous) {
    icon = 'up'
  } else {
    icon = 'down'
  }

  const color = delta.isGood ? 'text-green-600' : 'text-red-600'
  const sign = delta.current > delta.previous ? '+' : ''
  const label = `${sign}${changePercent.toFixed(1)}%`

  return { icon, color, label }
}

/**
 * Format session date for display
 */
export function formatSessionDate(isoDate: string): string {
  const date = new Date(isoDate)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.toDateString() === today.toDateString()) {
    return 'Today'
  }
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow'
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Calculate time until next session
 */
export function getTimeUntilSession(isoDate: string): string {
  const sessionDate = new Date(isoDate)
  const now = new Date()
  const diffMs = sessionDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays < 7) return `In ${diffDays} days`
  return `In ${Math.ceil(diffDays / 7)} weeks`
}
