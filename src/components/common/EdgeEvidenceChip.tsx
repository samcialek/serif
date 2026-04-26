import { useState } from 'react'
import type { InsightBayesian } from '@/data/portal/types'
import { cn } from '@/utils/classNames'
import { observationCoverageForEdge, personalizationForEdge } from '@/utils/edgeEvidence'

type EdgeEvidenceChipVariant = 'default' | 'compact'

function pct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.max(0, Math.min(100, value)))
}

function toneFor(personalPct: number): string {
  if (personalPct >= 65) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (personalPct > 0) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-500'
}

export function EdgeEvidenceChip({
  edge,
  variant = 'default',
  className,
}: {
  edge: InsightBayesian
  variant?: EdgeEvidenceChipVariant
  className?: string
}) {
  const [hovered, setHovered] = useState(false)
  const personalPct = pct(personalizationForEdge(edge) * 100)
  const modelPct = pct(edge.personalization?.model_pct ?? 100 - personalPct)
  const coveragePct = pct(
    edge.personalization?.coverage_pct ?? observationCoverageForEdge(edge) * 100,
  )
  const narrowingPct = pct(
    edge.personalization?.narrowing_pct ?? (edge.posterior?.contraction ?? 0) * 100,
  )
  const sd = edge.posterior?.sd ?? 0
  const n = edge.personalization?.observations ?? edge.user_obs?.n ?? 0
  const source = edge.posterior?.source ?? 'model'

  return (
    <span
      className={cn('relative flex-shrink-0', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => event.stopPropagation()}
    >
      <span
        className={cn(
          'inline-block rounded border px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums cursor-help',
          variant === 'compact' ? 'w-24' : 'w-24',
          toneFor(personalPct),
        )}
      >
        Personalized {personalPct}%
      </span>
      {hovered && (
        <span
          role="tooltip"
          className="absolute pointer-events-none"
          style={{
            bottom: 'calc(100% + 8px)',
            right: 0,
            width: 240,
            background: '#fff',
            border: '1px solid #f0e9d8',
            borderRadius: 12,
            boxShadow:
              '0 12px 28px rgba(28, 25, 23, 0.14), 0 2px 6px rgba(28, 25, 23, 0.06)',
            padding: '10px 12px 11px',
            textAlign: 'left',
            fontFamily: 'Inter, sans-serif',
            zIndex: 50,
          }}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: '#1c1917',
                letterSpacing: 0,
              }}
            >
              Personalized {personalPct}%
            </span>
            <span className="text-[10px] tabular-nums text-stone-400">
              model {modelPct}%
            </span>
          </div>

          <div
            style={{
              fontSize: 10.5,
              color: '#5b524a',
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            Estimated member-specific share. It combines usable days or draws
            with posterior narrowing; the split is a practical evidence summary,
            not a literal likelihood weight.
          </div>

          <div
            style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, #ede5d2, transparent)',
              marginBottom: 8,
            }}
          />

          <div className="grid grid-cols-3 gap-2 text-[10px] tabular-nums">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-stone-400">
                Post SD
              </div>
              <div className="font-medium text-stone-950">{sd.toFixed(3)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-stone-400">
                n
              </div>
              <div className="font-medium text-stone-950">{n}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-stone-400">
                Coverage
              </div>
              <div className="font-medium text-stone-950">{coveragePct}%</div>
            </div>
            <div className="col-span-3 flex items-baseline justify-between pt-1">
              <span className="text-[9px] uppercase tracking-wider text-stone-400">
                Narrowing
              </span>
              <span className="font-medium text-stone-950">
                {narrowingPct}% - {source}
              </span>
            </div>
          </div>

          <span
            aria-hidden
            className="absolute"
            style={{
              right: 16,
              bottom: -5,
              transform: 'rotate(45deg)',
              width: 9,
              height: 9,
              background: '#fff',
              borderRight: '1px solid #f0e9d8',
              borderBottom: '1px solid #f0e9d8',
            }}
          />
        </span>
      )}
    </span>
  )
}
