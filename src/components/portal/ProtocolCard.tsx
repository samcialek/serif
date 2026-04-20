import { useState } from 'react'
import { ArrowRight, Clock, ChevronDown, Target } from 'lucide-react'
import { cn } from '@/utils/classNames'
import { TierBadge } from './TierBadge'
import { formatActionValue } from '@/utils/rounding'
import type { Protocol, ProtocolOptionLabel } from '@/data/portal/types'

// Target-prominent protocol card: the rounded target value is the hero,
// current is a subtitle. Supporting insights collapse into a disclosure.

const OPTION_STYLES: Record<
  ProtocolOptionLabel,
  { bg: string; text: string; border: string; label: string }
> = {
  single: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', label: 'Single option' },
  collapsed: {
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    label: 'Collapsed',
  },
  conservative: {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
    label: 'Conservative',
  },
  aggressive: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    label: 'Aggressive',
  },
  up: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Up' },
  down: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', label: 'Down' },
}

interface ProtocolCardProps {
  protocol: Protocol
}

export function ProtocolCard({ protocol }: ProtocolCardProps) {
  const [supportingOpen, setSupportingOpen] = useState(false)
  const style = OPTION_STYLES[protocol.option_label]

  return (
    <div className="p-4 bg-white border border-slate-200 rounded-xl">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border',
            style.bg,
            style.text,
            style.border,
          )}
        >
          {style.label}
        </span>
        <TierBadge tier={protocol.gate_tier} />
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          {protocol.horizon_days}d horizon
        </span>
      </div>

      {/* Hero: target value */}
      <div className="flex items-end gap-3 mb-1">
        <Target className="w-5 h-5 text-serif-cyan flex-shrink-0 mb-1.5" />
        <div className="min-w-0">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            {protocol.action.replace(/_/g, ' ')} target
          </p>
          <p className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
            {formatActionValue(protocol.target_value, protocol.action)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            from {formatActionValue(protocol.current_value, protocol.action)} today
          </p>
        </div>
      </div>

      <p className="text-sm text-slate-700 mt-3">{protocol.rationale}</p>

      {protocol.supporting_insight_ids.length > 0 && (
        <button
          type="button"
          onClick={() => setSupportingOpen((v) => !v)}
          className="mt-3 flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ChevronDown
            className={cn(
              'w-3 h-3 transition-transform',
              supportingOpen && 'rotate-180',
            )}
          />
          {protocol.supporting_insight_ids.length} supporting insight
          {protocol.supporting_insight_ids.length === 1 ? '' : 's'}
        </button>
      )}
      {supportingOpen && (
        <div className="mt-2 flex flex-wrap gap-1">
          {protocol.supporting_insight_ids.map((id) => (
            <code
              key={id}
              className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-mono text-[10px]"
            >
              {id}
            </code>
          ))}
        </div>
      )}

      {protocol.outcomes_served.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <ArrowRight className="w-3 h-3" />
          <span>
            Serves{' '}
            {protocol.outcomes_served.map((o, i) => (
              <span key={o}>
                <span className="text-slate-700 font-medium">{o.replace(/_/g, ' ')}</span>
                {i < protocol.outcomes_served.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}

export default ProtocolCard
