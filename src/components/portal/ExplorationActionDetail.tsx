/**
 * ExplorationActionDetail — expanded panel rendered when a user clicks
 * an ExplorationActionRow.
 *
 * Stacks the prior-curve visual, the experiment prescription card, the
 * backend-supplied rationale, and a button strip. The Launch button
 * is cosmetic in Phase 2 (disabled with an explanatory title) — Phase
 * 4 wires it to the exploration store.
 */

import { Sparkles } from 'lucide-react'
import type { ParticipantPortal } from '@/data/portal/types'
import type { ExplorationEdge } from '@/utils/exploration'
import { prescriptionFor } from '@/utils/experimentPrescription'
import { ExperimentPrescription } from './ExperimentPrescription'
import { PriorCurvePreview, PriorCurveLegend } from './PriorCurvePreview'

interface Props {
  edge: ExplorationEdge
  participant: ParticipantPortal
}

function whyThisMatters(edge: ExplorationEdge): string {
  const mag = Math.abs(edge.computed.priorD)
  const narrow = Math.round(edge.computed.narrow * 100)
  const horizon = edge.computed.horizonDays
  const horizonStr =
    horizon < 14
      ? 'within days'
      : horizon < 60
        ? 'in weeks'
        : 'over a few months'

  if (mag < 0.1) {
    return `Low-magnitude lead (${mag.toFixed(2)}σ) — a successful experiment would still cut ~${narrow}% of the slope uncertainty, but don't expect a big lift.`
  }
  if (mag < 0.3) {
    return `Moderate cohort signal (${mag.toFixed(2)}σ). If the personal effect tracks the cohort, you'd see a small-but-real change ${horizonStr} — and the experiment eliminates ~${narrow}% of the uncertainty.`
  }
  return `Strong cohort signal (${mag.toFixed(2)}σ). Running this experiment collapses ~${narrow}% of the slope uncertainty and surfaces the size of the personal effect ${horizonStr}.`
}

export function ExplorationActionDetail({ edge, participant }: Props) {
  const spec = prescriptionFor(edge, participant)
  const { priorD, priorDSD, narrow } = edge.computed

  const launchDisabled = spec.feasibility !== 'ready'
  const launchTitle =
    spec.feasibility === 'ready'
      ? 'Launch this experiment (coach preview — not sent to member)'
      : spec.feasibility_note ?? `Not launchable yet: ${spec.feasibility}`

  return (
    <div className="px-3 py-3 border-t border-slate-100 bg-slate-50/60 space-y-3">
      {/* Curve + legend */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            Expected learning
          </span>
          <PriorCurveLegend />
        </div>
        <PriorCurvePreview
          action={edge.action}
          outcome={edge.outcome}
          participant={participant}
          priorD={priorD}
          priorDSD={priorDSD}
          narrow={narrow}
          variant="detail"
          className="w-full"
        />
      </div>

      {/* Prescription */}
      <ExperimentPrescription edge={edge} spec={spec} participant={participant} />

      {/* Rationale + why this matters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-md border border-slate-200 bg-white p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">
            Why this test
          </p>
          <p className="text-slate-700 leading-snug">{edge.rationale}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" aria-hidden />
            What you'd learn
          </p>
          <p className="text-slate-700 leading-snug">{whyThisMatters(edge)}</p>
        </div>
      </div>

      {/* Footer stats + button */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
        <span>
          Current n:{' '}
          <span className="tabular-nums font-medium text-slate-700">
            {edge.user_n}
          </span>
        </span>
        <span>·</span>
        <span>
          Already personalized:{' '}
          <span className="tabular-nums font-medium text-slate-700">
            {Math.round(edge.prior_contraction * 100)}%
          </span>
        </span>
        <span>·</span>
        <span>
          Info gain:{' '}
          <span className="tabular-nums font-medium text-indigo-700">
            {edge.computed.infoGain.toFixed(2)}σ
          </span>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={launchDisabled}
            title={launchTitle}
            className={
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ' +
              (launchDisabled
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700')
            }
          >
            Launch experiment
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExplorationActionDetail
