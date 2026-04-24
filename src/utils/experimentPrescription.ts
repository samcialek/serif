/**
 * Experiment prescriptions — deterministic "how to run this experiment"
 * specs per action. Keyed by the same action names as the rest of the
 * portal (bedtime, sleep_duration, caffeine_timing, etc.). Fills the
 * `experiment: ExperimentSpec` field on an ExplorationEdge when the
 * backend hasn't emitted one yet.
 *
 * Phase 2 computes these entirely client-side. Phase 3 optionally
 * mirrors them in backend Python for consistency, but the frontend
 * table is authoritative for demo purposes.
 */

import type {
  ExperimentFeasibility,
  ExperimentSpec,
  ParticipantPortal,
} from '@/data/portal/types'
import type { ExplorationEdge } from '@/utils/exploration'

// ─── Default prescription table ──────────────────────────────────

type PrescriptionBase = Omit<ExperimentSpec, 'feasibility' | 'feasibility_note'>

const VARY_ACTION_PRESCRIPTIONS: Record<string, PrescriptionBase> = {
  bedtime: {
    action_range_delta: [-0.5, 0.5],
    cadence: 'daily',
    duration_days: 14,
  },
  sleep_duration: {
    action_range_delta: [-0.75, 0.75],
    cadence: 'daily',
    duration_days: 14,
  },
  caffeine_timing: {
    action_range_delta: [-3, 0], // shift cutoff 0–3 hours earlier
    cadence: 'daily',
    duration_days: 10,
    washout_days: 2,
  },
  caffeine_mg: {
    action_range_delta: [-100, 0],
    cadence: 'daily',
    duration_days: 10,
  },
  alcohol_units: {
    action_range_delta: [-2, 0],
    cadence: 'daily',
    duration_days: 14,
  },
  alcohol_timing: {
    action_range_delta: [-2, 0],
    cadence: 'daily',
    duration_days: 10,
  },
  zone2_volume: {
    action_range_delta: [0, 90], // minutes added per session
    cadence: 'n_per_week',
    n_per_week: 3,
    duration_days: 21,
  },
  zone2_minutes: {
    action_range_delta: [0, 45],
    cadence: 'n_per_week',
    n_per_week: 3,
    duration_days: 21,
  },
  zone4_5_minutes: {
    action_range_delta: [0, 20],
    cadence: 'n_per_week',
    n_per_week: 2,
    duration_days: 28,
  },
  running_volume: {
    action_range_delta: [-4, 4],
    cadence: 'daily',
    duration_days: 21,
  },
  training_load: {
    action_range_delta: [-25, 25],
    cadence: 'daily',
    duration_days: 21,
  },
  training_volume: {
    action_range_delta: [-1.5, 1.5],
    cadence: 'daily',
    duration_days: 21,
  },
  steps: {
    action_range_delta: [-3000, 3000],
    cadence: 'daily',
    duration_days: 14,
  },
  active_energy: {
    action_range_delta: [-200, 200],
    cadence: 'daily',
    duration_days: 14,
  },
  dietary_protein: {
    action_range_delta: [0, 30], // +0 to +30 g/day
    cadence: 'daily',
    duration_days: 28,
  },
  dietary_energy: {
    action_range_delta: [-300, 300],
    cadence: 'daily',
    duration_days: 28,
  },
  acwr: {
    action_range_delta: [-0.2, 0.2],
    cadence: 'daily',
    duration_days: 21,
  },
  sleep_debt: {
    action_range_delta: [-2, 0],
    cadence: 'daily',
    duration_days: 14,
  },
}

/** Biomarker outcomes where a single follow-up draw is the right
 *  experiment, and the ideal interval between draws. Outcomes with
 *  short turnover (hsCRP) tolerate faster repeats; slow ones
 *  (ferritin, hemoglobin) need longer. */
const REPEAT_DRAW_INTERVAL_DAYS: Record<string, number> = {
  hscrp: 21,
  cortisol: 14,
  glucose: 28,
  insulin: 28,
  testosterone: 45,
  apob: 56,
  ldl: 56,
  hdl: 56,
  triglycerides: 42,
  ferritin: 56,
  hemoglobin: 56,
  iron_total: 42,
  zinc: 42,
  hba1c: 90,
  vo2_peak: 45,
}

const DEFAULT_REPEAT_DAYS = 56

// ─── Core API ───────────────────────────────────────────────────

export function prescriptionFor(
  edge: ExplorationEdge,
  participant: ParticipantPortal,
): ExperimentSpec {
  const pre = edge.experiment
  if (pre) return pre

  if (edge.kind === 'repeat_measurement') {
    const duration =
      REPEAT_DRAW_INTERVAL_DAYS[edge.outcome] ?? DEFAULT_REPEAT_DAYS
    const base: PrescriptionBase = {
      action_range_delta: [0, 0],
      cadence: 'one_shot',
      duration_days: duration,
    }
    return withFeasibility(edge, base, participant)
  }

  // vary_action — look up the table, fall back on a generic ±1 SD
  // daily-14-day design.
  const explicit = VARY_ACTION_PRESCRIPTIONS[edge.action]
  if (explicit) return withFeasibility(edge, explicit, participant)

  const sd = participant.behavioral_sds?.[edge.action] ?? 1
  const generic: PrescriptionBase = {
    action_range_delta: [-sd, sd],
    cadence: 'daily',
    duration_days: 14,
  }
  return withFeasibility(edge, generic, participant)
}

// ─── Feasibility ────────────────────────────────────────────────

function withFeasibility(
  edge: ExplorationEdge,
  base: PrescriptionBase,
  participant: ParticipantPortal,
): ExperimentSpec {
  const { feasibility, note } = feasibilityFor(edge, participant)
  return { ...base, feasibility, feasibility_note: note }
}

export function feasibilityFor(
  edge: ExplorationEdge,
  participant: ParticipantPortal,
): { feasibility: ExperimentFeasibility; note?: string } {
  // Blocked when the cohort prior itself is too flat to be worth
  // discovering — no amount of personal data will uncover a meaningful
  // effect.
  if (Math.abs(edge.computed.priorD) < 0.05) {
    return {
      feasibility: 'blocked',
      note:
        'Cohort prior shows almost no effect. Even a perfect experiment would add little.',
    }
  }

  // vary_action needs a baseline exposure to anchor the curve on, and
  // a user_n high enough to evaluate changes against.
  if (edge.kind === 'vary_action') {
    const hasCurrent = participant.current_values?.[edge.action] != null
    if (!hasCurrent) {
      return {
        feasibility: 'needs_baseline',
        note: `No current ${edge.action.replace(/_/g, ' ')} measurement — log a baseline first.`,
      }
    }
    if (edge.user_n < 3) {
      return {
        feasibility: 'needs_baseline',
        note: `Only ${edge.user_n} personal observation${edge.user_n === 1 ? '' : 's'}. Collect more baseline before varying.`,
      }
    }
    if (edge.positivity_flag === 'insufficient') {
      return {
        feasibility: 'ready',
        note:
          'Current variation is too flat for causal inference — this experiment fixes that.',
      }
    }
    return { feasibility: 'ready' }
  }

  // repeat_measurement — always feasible unless biomarker has never
  // been drawn.
  if (edge.user_n < 1) {
    return {
      feasibility: 'needs_baseline',
      note: `No baseline draw for ${edge.outcome.replace(/_/g, ' ')} — order the first one.`,
    }
  }
  return { feasibility: 'ready' }
}

// ─── Display helpers ────────────────────────────────────────────

const FEASIBILITY_STYLE: Record<ExperimentFeasibility, string> = {
  ready: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  needs_baseline: 'text-amber-700 bg-amber-50 border-amber-200',
  seasonal: 'text-sky-700 bg-sky-50 border-sky-200',
  blocked: 'text-slate-500 bg-slate-50 border-slate-200',
}

export function feasibilityStyle(f: ExperimentFeasibility): string {
  return FEASIBILITY_STYLE[f] ?? FEASIBILITY_STYLE.ready
}

const FEASIBILITY_LABEL: Record<ExperimentFeasibility, string> = {
  ready: 'Ready',
  needs_baseline: 'Needs baseline',
  seasonal: 'Seasonal',
  blocked: 'Blocked',
}

export function feasibilityLabel(f: ExperimentFeasibility): string {
  return FEASIBILITY_LABEL[f] ?? f
}

export function cadenceLabel(spec: ExperimentSpec): string {
  if (spec.cadence === 'one_shot') return 'One-shot draw'
  if (spec.cadence === 'daily') return 'Daily'
  return `${spec.n_per_week ?? 3}×/week`
}

export function durationLabel(spec: ExperimentSpec): string {
  const d = spec.duration_days
  if (d < 10) return `${d} days`
  if (d < 60) return `${Math.round(d / 7)} weeks`
  return `${Math.round(d / 30)} months`
}
