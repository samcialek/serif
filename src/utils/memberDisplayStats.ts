/**
 * Deterministic display stats for portal members.
 *
 * `days_of_data`, `last_sync_hours`, and `last_open_hours` are NOT in the
 * engine export — they're demo-surface concepts. We derive them deterministically
 * from pid + cohort so the roster shows stable values across reloads.
 */

import type { ParticipantSummary } from '@/data/portal/types'

export type MemberStatus = 'at_risk' | 'needs_attention' | 'on_track' | 'building_baseline'

export interface MemberDisplayStats {
  daysOfData: number
  lastSyncHours: number
  lastOpenHours: number
  status: MemberStatus
  insightCount: number
  regimeUrgency: number
}

// Simple xorshift-style hash; stable across sessions.
function hash32(seed: number): number {
  let x = (seed | 0) + 0x9e3779b9
  x = ((x ^ (x >>> 16)) * 0x85ebca6b) | 0
  x = ((x ^ (x >>> 13)) * 0xc2b2ae35) | 0
  x = (x ^ (x >>> 16)) >>> 0
  return x
}

function hashFloat(seed: number, salt: number): number {
  return hash32(seed * 0x100 + salt) / 0xffffffff
}

const COHORT_DAYS: Record<string, number> = {
  cohort_a: 180,
  cohort_b: 130,
  cohort_c: 70,
}

function daysOfDataFor(pid: number, cohort: string | undefined): number {
  const base = (cohort && COHORT_DAYS[cohort]) ?? 90
  const jitter = Math.round((hashFloat(pid, 1) - 0.5) * 60)
  return Math.max(8, base + jitter)
}

function lastSyncHoursFor(pid: number): number {
  // Exponential-ish distribution weighted toward recent (most members synced in last day)
  const u = hashFloat(pid, 2)
  if (u < 0.55) return Math.floor(u * 10) + 1 // 1-5h: 55%
  if (u < 0.85) return Math.floor((u - 0.55) * 100) + 6 // 6-35h: 30%
  return Math.floor((u - 0.85) * 400) + 36 // 36-95h: 15%
}

function lastOpenHoursFor(pid: number): number {
  const u = hashFloat(pid, 3)
  if (u < 0.4) return Math.floor(u * 15) + 1 // 1-6h: 40%
  if (u < 0.75) return Math.floor((u - 0.4) * 200) + 7 // 7-76h: 35%
  return Math.floor((u - 0.75) * 1000) + 77 // 77-327h: 25%
}

function statusFor(summary: ParticipantSummary, daysOfData: number): MemberStatus {
  if (daysOfData < 21) return 'building_baseline'
  if (summary.regime_urgency >= 0.7) return 'at_risk'
  if (summary.regime_urgency >= 0.4) return 'needs_attention'
  return 'on_track'
}

export function computeMemberStats(summary: ParticipantSummary): MemberDisplayStats {
  const daysOfData = daysOfDataFor(summary.pid, summary.cohort)
  return {
    daysOfData,
    lastSyncHours: lastSyncHoursFor(summary.pid),
    lastOpenHours: lastOpenHoursFor(summary.pid),
    status: statusFor(summary, daysOfData),
    insightCount: summary.exposed_count,
    regimeUrgency: summary.regime_urgency,
  }
}

export function formatTimeAgo(hours: number): string {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

export const STATUS_LABELS: Record<MemberStatus, string> = {
  at_risk: 'At risk',
  needs_attention: 'Needs attention',
  on_track: 'On track',
  building_baseline: 'Building baseline',
}

export const STATUS_COLOR: Record<MemberStatus, { dot: string; text: string; bg: string }> = {
  at_risk: { dot: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
  needs_attention: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  on_track: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  building_baseline: { dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' },
}
