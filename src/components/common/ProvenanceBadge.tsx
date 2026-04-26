/**
 * ProvenanceBadge — small "where does this number come from?" pill.
 *
 * Five conceptual states (mapped onto four colors via the painterly
 * confidence palette):
 *
 *   fitted          → sage  · cohort-fitted edge with personal posterior
 *   wearable        → sage  · raw signal pulled from a worn device
 *   lab             → blue  · clinical lab draw
 *   literature      → stone (dashed) · RCT prior, no per-person fit
 *   logged          → gold  · manually logged or imported user record
 *
 * Renders as a 6-8px dot + optional source string. Used in:
 *   - Data tab: each metric card shows its `source` field as a badge
 *   - Baseline tab: each load/outcome carries a provenance pill
 *   - Insights/Twin: the existing confidence dot is the same shape
 *     (this component re-exports the styling so they stay in sync)
 *
 * Lives in components/common because it's used across every tab.
 */

import { cn } from '@/utils/classNames'
import {
  ACCENT_BABY_BLUE,
  CONF_COLORS,
} from '@/styles/painterlyTokens'
import {
  metricProvenanceFromSource,
  type MetricProvenanceKind,
} from '@/utils/edgeProvenance'

export type ProvenanceKind = MetricProvenanceKind

interface ProvenanceMeta {
  color: string
  /** When true, render as a dashed-ring rather than a filled dot. Marks
   *  literature-only / "no per-person evidence" sources. */
  dashed: boolean
  label: string
  /** Used as the title attribute for tooltip. */
  title: string
}

const META: Record<ProvenanceKind, ProvenanceMeta> = {
  fitted: {
    color: CONF_COLORS.high,
    dashed: false,
    label: 'fitted',
    title: 'Cohort-fitted edge with a per-participant posterior',
  },
  wearable: {
    color: CONF_COLORS.high,
    dashed: false,
    label: 'wearable',
    title: 'Raw signal pulled directly from a worn device',
  },
  lab: {
    color: ACCENT_BABY_BLUE,
    dashed: false,
    label: 'lab',
    title: 'Clinical lab draw',
  },
  literature: {
    color: CONF_COLORS.lit,
    dashed: true,
    label: 'lit',
    title:
      'Literature-backed prior — no per-person posterior; effect from RCT meta',
  },
  logged: {
    color: CONF_COLORS.med,
    dashed: false,
    label: 'logged',
    title: 'Manually logged or imported user record',
  },
}

interface ProvenanceBadgeProps {
  kind: ProvenanceKind
  /** Override the rendered label (e.g. "Apple Watch" instead of
   *  "wearable"). Tooltip still uses the canonical title. */
  label?: string
  /** Show only the dot, no label text. Use in dense tables. */
  dotOnly?: boolean
  /** Smaller pill for in-row use. */
  size?: 'sm' | 'md'
  className?: string
}

export function ProvenanceBadge({
  kind,
  label,
  dotOnly = false,
  size = 'sm',
  className,
}: ProvenanceBadgeProps) {
  const meta = META[kind]
  const dotPx = size === 'md' ? 8 : 6
  const fontPx = size === 'md' ? 10 : 9
  const padX = size === 'md' ? 7 : 6
  return (
    <span
      title={meta.title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full',
        className,
      )}
      style={{
        background: dotOnly ? 'transparent' : `${meta.color}1f`,
        border: dotOnly
          ? 'none'
          : `1px solid ${meta.color}55`,
        padding: dotOnly ? 0 : `2px ${padX}px`,
        color: meta.color,
        fontSize: fontPx,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        letterSpacing: '0.01em',
      }}
    >
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={{
          width: dotPx,
          height: dotPx,
          background: meta.dashed ? 'transparent' : meta.color,
          border: meta.dashed ? `1px dashed ${meta.color}` : 'none',
        }}
      />
      {!dotOnly && (label ?? meta.label)}
    </span>
  )
}

/** Map a free-form `source` string from the wearable/lab metric data to
 *  a canonical provenance kind. Falls back to 'wearable'. */
export function provenanceFromSource(source: string | undefined | null): ProvenanceKind {
  return metricProvenanceFromSource(source)
}

export default ProvenanceBadge
