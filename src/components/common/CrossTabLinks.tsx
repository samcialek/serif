/**
 * CrossTabLinks — small router-link strip surfaced on outcome / lever
 * cards so the user can jump between the four tabs that all reason
 * about the same thing:
 *
 *   Twin     — pull a lever and see this outcome move
 *   Insights — see the per-edge marginal effects on this outcome
 *   Data     — see the raw streams that produced today's value
 *   Baseline — see today's anchored value the engine reasons from
 *
 * Each link is keyed by an `outcome` id (e.g. "hrv_daily") so the
 * destination view can deep-link to the right card. For now we just
 * navigate to the tab — deep-linking with query params is a follow-up.
 */

import { Link } from 'react-router-dom'
import {
  Network,
  Lightbulb,
  Database,
  TrendingUp,
  Fingerprint as FingerprintIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LINE, TEXT_MUTED } from '@/styles/painterlyTokens'

interface LinkSpec {
  to: string
  label: string
  icon: LucideIcon
  title: string
}

interface CrossTabLinksProps {
  /** Optional outcome id — deep-link payload (currently passed as
   *  `?outcome=` for downstream consumers; tabs that don't know what to
   *  do with it just ignore it). */
  outcome?: string
  /** Tabs to omit (e.g. don't show "Insights" link from inside Insights). */
  exclude?: Array<'twin' | 'insights' | 'data' | 'baseline' | 'fingerprint'>
  /** Compact mode — icon-only chips, hover for label. Use in dense
   *  grids (Twin chits). */
  compact?: boolean
  className?: string
}

const ALL_LINKS: Record<
  'twin' | 'insights' | 'data' | 'baseline' | 'fingerprint',
  LinkSpec
> = {
  twin: {
    to: '/twin',
    label: 'Twin',
    icon: Network,
    title: 'Open in Twin — pull a lever and see this outcome move',
  },
  insights: {
    to: '/insights',
    label: 'Insights',
    icon: Lightbulb,
    title: 'Open in Insights — per-edge marginal effects',
  },
  data: {
    to: '/data',
    label: 'Data',
    icon: Database,
    title: 'Open in Data — raw streams behind today’s value',
  },
  baseline: {
    to: '/baseline',
    label: 'Baseline',
    icon: TrendingUp,
    title: 'Open in Baseline — today’s anchored value',
  },
  fingerprint: {
    to: '/fingerprint',
    label: 'Fingerprint',
    icon: FingerprintIcon,
    title: 'Open in Fingerprint — what is distinctive about this member',
  },
}

const ORDER: Array<'twin' | 'insights' | 'data' | 'baseline' | 'fingerprint'> = [
  'twin',
  'insights',
  'fingerprint',
  'data',
  'baseline',
]

export function CrossTabLinks({
  outcome,
  exclude = [],
  compact = false,
  className,
}: CrossTabLinksProps) {
  const excludeSet = new Set(exclude)
  const links = ORDER.filter((k) => !excludeSet.has(k))
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {links.map((key) => {
        const spec = ALL_LINKS[key]
        const Icon = spec.icon
        const href = outcome ? `${spec.to}?outcome=${encodeURIComponent(outcome)}` : spec.to
        return (
          <Link
            key={key}
            to={href}
            title={spec.title}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: compact ? 0 : 4,
              padding: compact ? '3px' : '3px 7px 3px 6px',
              borderRadius: 999,
              border: `1px solid ${LINE}`,
              background: '#fff',
              color: TEXT_MUTED,
              fontSize: 10,
              textDecoration: 'none',
              transition: 'background 120ms ease, color 120ms ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#fefbf3'
              ;(e.currentTarget as HTMLAnchorElement).style.color = '#1c1917'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#fff'
              ;(e.currentTarget as HTMLAnchorElement).style.color = TEXT_MUTED
            }}
          >
            <Icon className="w-2.5 h-2.5" />
            {!compact && spec.label}
          </Link>
        )
      })}
    </div>
  )
}

export default CrossTabLinks
