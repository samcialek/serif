/**
 * Fingerprint — "what is unusually true about this person?"
 *
 * Layout:
 *   1. Identity hero — 2-3 controlled-dictionary labels at the top.
 *      Click a pill → scroll + highlight the supporting Fingerprint cards.
 *   2. Sectioned scroll: Thresholds → Contradictions → Outliers →
 *      Sensitivities → Behaviors → Variability → Rare combinations →
 *      Data fingerprints. Each section is a card grid.
 *   3. "Show early signals" toggle in the actions slot when weak
 *      Fingerprints exist. They stay off by default.
 *
 * Modes:
 *   - rich    (3+ moderate/strong) → full page
 *   - forming (1-2)                → those + a "still forming" banner
 *   - data_gap (0 meaningful)      → first-class data-gap state
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Users, Sparkles, Eye, EyeOff } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { Card, PainterlyPageHeader, CrossTabLinks } from '@/components/common'
import { useParticipant } from '@/hooks/useParticipant'
import { useActiveParticipant } from '@/hooks/useActiveParticipant'
import { computeFingerprints } from '@/data/fingerprints/computeFingerprints'
import { getFingerprintsForOutcome } from '@/data/fingerprints/reverseIndex'
import type {
  Fingerprint,
  FingerprintActionability,
  FingerprintBundle,
  FingerprintConfidence,
  FingerprintEvidence,
  FingerprintFinding,
  FingerprintStability,
  FingerprintStrength,
  FingerprintType,
} from '@/data/fingerprints/types'
import {
  ACCENT_GOLD,
  ACCENT_SAGE,
  ACCENT_TERRACOTTA,
  BG_CARD,
  BG_CARD_WARM,
  CONF_COLORS,
  LINE,
  TEXT_BODY,
  TEXT_FAINT,
  TEXT_INK,
  TEXT_MUTED,
  TONE_TEXT,
} from '@/styles/painterlyTokens'

// ─── Type metadata ────────────────────────────────────────────────

const TYPE_META: Record<
  FingerprintType,
  { label: string; section: string; order: number; icon: string }
> = {
  threshold: { label: 'Threshold', section: 'Thresholds & cliffs', order: 1, icon: '⛰' },
  contradiction: { label: 'Contradiction', section: 'Contradictions', order: 2, icon: '⚖' },
  outlier: { label: 'Outlier', section: 'Outliers', order: 3, icon: '✦' },
  sensitivity: { label: 'Sensitivity', section: 'Context sensitivities', order: 4, icon: '☂' },
  behavior: { label: 'Behavior', section: 'Behavioral patterns', order: 5, icon: '↻' },
  variability: { label: 'Variability', section: 'Variability signatures', order: 6, icon: '∿' },
  rare_combination: { label: 'Rare combo', section: 'Rare combinations', order: 7, icon: '✜' },
  data_gap: { label: 'Data', section: 'What we can and can\'t see', order: 8, icon: '◌' },
  identity_label: { label: 'Identity', section: '', order: 0, icon: '🫆' },
}

const STRENGTH_TONE: Record<FingerprintStrength, string> = {
  strong: ACCENT_SAGE,
  moderate: ACCENT_GOLD,
  weak: TEXT_FAINT,
}

const STABILITY_LABEL: Record<FingerprintStability, string> = {
  stable: 'stable',
  recurring: 'recurring',
  emerging: 'emerging',
  seasonal: 'seasonal',
  recently_changed: 'recently changed',
}

const ACTIONABILITY_LABEL: Record<FingerprintActionability, string> = {
  direct: 'directly actionable',
  indirect: 'indirectly actionable',
  watch_only: 'watch-only',
  measurement_gap: 'measurement gap',
}

const FINDING_LABEL: Record<FingerprintFinding, string> = {
  likely_driver: 'likely driver',
  reliable_pattern: 'reliable pattern',
  unusual_baseline: 'unusual baseline',
  open_question: 'open question',
}

const CONF_LABEL: Record<FingerprintConfidence, string> = {
  high: 'high confidence',
  med: 'moderate confidence',
  low: 'low confidence',
  lit: 'literature-only',
}

// ─── Page ─────────────────────────────────────────────────────────

export function FingerprintView() {
  const { participant, isLoading } = useParticipant()
  const { pid, displayName } = useActiveParticipant()
  const [showWeak, setShowWeak] = useState(false)
  const [searchParams] = useSearchParams()
  const focusOutcome = searchParams.get('outcome')

  const bundle: FingerprintBundle | null = useMemo(
    () => (participant ? computeFingerprints(participant) : null),
    [participant],
  )
  const hasWeakFingerprints = Boolean(
    bundle?.fingerprints.some((f) => f.strength === 'weak'),
  )

  // Deep-link scroll: when arriving via /fingerprint?outcome=hrv_daily
  // (or similar), scroll to and briefly highlight the first Fingerprint
  // touching that outcome. Fires once per outcome param so re-renders
  // don't re-scroll if the user has navigated away from the anchor.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  useEffect(() => {
    if (!focusOutcome || !participant) return
    const matches = getFingerprintsForOutcome(participant, focusOutcome)
    if (matches.length === 0) return
    const target = matches[0]
    setHighlightId(target.id)
    // Defer the scroll until the cards have laid out.
    const t = window.setTimeout(() => {
      const el = document.getElementById(`fingerprint-supports-${target.id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    // Drop the highlight after a few seconds so the page returns to normal.
    const t2 = window.setTimeout(() => setHighlightId(null), 3200)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
    }
  }, [focusOutcome, participant])

  useEffect(() => {
    if (!hasWeakFingerprints && showWeak) setShowWeak(false)
  }, [hasWeakFingerprints, showWeak])

  const actions = hasWeakFingerprints ? (
    <button
      type="button"
      onClick={() => setShowWeak((v) => !v)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors"
      style={{
        background: showWeak ? '#fefbf3' : '#fff',
        border: `1px solid ${LINE}`,
        color: showWeak ? TEXT_INK : TEXT_MUTED,
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        cursor: 'pointer',
      }}
      title={
        showWeak
          ? 'Hide weak Fingerprints — show only strong + moderate'
          : 'Show weak Fingerprints (early signals + exploratory patterns)'
      }
    >
      {showWeak ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      {showWeak ? 'Hide early signals' : 'Show early signals'}
    </button>
  ) : undefined

  if (pid == null) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Personal pattern profile — what is distinctively true about this member."
          hideHorizon
        />
        <Card padding="md" className="flex flex-col items-center text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-primary-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">Select a member</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Pick a member to see their Fingerprint — the pattern profile of distinctive findings.
          </p>
        </Card>
      </PageLayout>
    )
  }

  if (isLoading || !participant || !bundle) {
    return (
      <PageLayout maxWidth="2xl">
        <PainterlyPageHeader
          subtitle="Personal pattern profile."
          hideHorizon
          actions={actions}
        />
        <Card padding="md" className="flex flex-col items-center text-slate-500 py-12">
          <Loader2 className="w-5 h-5 animate-spin mb-2" />
          <span className="text-sm">Loading Fingerprint for {displayName}…</span>
        </Card>
      </PageLayout>
    )
  }

  const filtered = bundle.fingerprints.filter(
    (f) => showWeak || f.strength !== 'weak',
  )
  const identityLabels = filtered.filter((f) => f.type === 'identity_label')
  const cardItems = filtered.filter((f) => f.type !== 'identity_label')

  return (
    <PageLayout maxWidth="2xl">
      <PainterlyPageHeader
        subtitle="Personal pattern profile — what is distinctively true about this member."
        hideHorizon
        actions={actions}
      />

      {bundle.mode === 'data_gap' && (
        <DataGapBanner displayName={displayName} />
      )}
      {bundle.mode === 'forming' && (
        <FormingBanner
          displayName={displayName}
          count={cardItems.filter((f) => f.strength !== 'weak').length}
        />
      )}

      {identityLabels.length > 0 && (
        <IdentityHero
          labels={identityLabels}
          onSupportClick={(supportId) => {
            // Briefly halo the destination card so the click feels
            // acknowledged — same affordance as deep-link arrival.
            setHighlightId(supportId)
            window.setTimeout(() => setHighlightId(null), 3000)
          }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="space-y-6"
      >
        {sectionsForCards(cardItems).map((section) => (
          <FingerprintSection
            key={section.section}
            section={section}
            highlightId={highlightId}
          />
        ))}
      </motion.div>
    </PageLayout>
  )
}

// ─── Identity hero ────────────────────────────────────────────────

function IdentityHero({
  labels,
  onSupportClick,
}: {
  labels: Fingerprint[]
  onSupportClick?: (supportId: string) => void
}) {
  const scrollTo = (id: string) => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(`fingerprint-supports-${id}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <div
      className="mb-6 rounded-2xl px-5 py-4"
      style={{ background: BG_CARD_WARM, border: `1px solid ${LINE}` }}
    >
      <div
        className="flex items-center gap-2 mb-2"
        style={{ color: TEXT_MUTED, fontFamily: 'Inter, sans-serif', fontSize: 11 }}
      >
        <Sparkles className="w-3.5 h-3.5" style={{ color: ACCENT_SAGE }} />
        <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Identity
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {labels.map((label) => (
          <button
            key={label.id}
            type="button"
            onClick={() => {
              // Card anchors are keyed by SUPPORTING fingerprint id,
              // not by the identity-label id. Scroll to the first
              // supporting card rather than the label itself
              // (which has no rendered anchor).
              const first = label.supports?.[0]
              if (first) {
                scrollTo(first)
                onSupportClick?.(first)
              }
            }}
            className="inline-flex items-center px-3 py-1.5 rounded-full transition-all"
            style={{
              background: '#fff',
              border: `1px solid ${ACCENT_SAGE}`,
              color: TEXT_INK,
              fontFamily: 'Inter, sans-serif',
              fontSize: 13,
              fontWeight: 500,
              cursor: label.supports && label.supports.length > 0 ? 'pointer' : 'default',
              boxShadow: '0 2px 8px rgba(124, 159, 139, 0.18)',
            }}
            title={
              label.supports && label.supports.length > 0
                ? 'Click to see the Fingerprints that support this label'
                : undefined
            }
          >
            {label.label}
          </button>
        ))}
      </div>
      {labels.length > 0 && (
        <p
          className="leading-relaxed"
          style={{
            color: TEXT_BODY,
            fontFamily: 'Inter, sans-serif',
            fontSize: 12,
            maxWidth: 720,
          }}
        >
          {labels[0].claim}
        </p>
      )}
    </div>
  )
}

// ─── Sections + cards ────────────────────────────────────────────

interface SectionGroup {
  section: string
  order: number
  cards: Fingerprint[]
}

function sectionsForCards(cards: Fingerprint[]): SectionGroup[] {
  const byKey = new Map<string, SectionGroup>()
  for (const card of cards) {
    const meta = TYPE_META[card.type]
    if (!meta || !meta.section) continue
    if (!byKey.has(meta.section)) {
      byKey.set(meta.section, {
        section: meta.section,
        order: meta.order,
        cards: [],
      })
    }
    byKey.get(meta.section)!.cards.push(card)
  }
  // Within each section, strong-first then moderate then weak.
  const strengthRank: Record<FingerprintStrength, number> = {
    strong: 0,
    moderate: 1,
    weak: 2,
  }
  for (const group of byKey.values()) {
    group.cards.sort(
      (a, b) => strengthRank[a.strength] - strengthRank[b.strength],
    )
  }
  return Array.from(byKey.values()).sort((a, b) => a.order - b.order)
}

function FingerprintSection({
  section,
  highlightId,
}: {
  section: SectionGroup
  highlightId: string | null
}) {
  return (
    <section className="space-y-3">
      <div
        className="flex items-baseline gap-2 px-1"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        <h2
          className="text-[13px] font-semibold"
          style={{ color: TEXT_INK, letterSpacing: '-0.01em' }}
        >
          {section.section}
        </h2>
        <span style={{ color: TEXT_FAINT, fontSize: 11 }}>
          · {section.cards.length}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {section.cards.map((card) => (
          <FingerprintCard
            key={card.id}
            card={card}
            highlighted={highlightId === card.id}
          />
        ))}
      </div>
    </section>
  )
}

function FingerprintCard({
  card,
  highlighted,
}: {
  card: Fingerprint
  highlighted: boolean
}) {
  const meta = TYPE_META[card.type]
  const strengthColor = STRENGTH_TONE[card.strength]
  const confidenceColor = CONF_COLORS[card.confidence]
  return (
    <div
      id={`fingerprint-supports-${card.id}`}
      className="rounded-xl scroll-mt-6"
      style={{
        background: BG_CARD,
        border: `1px solid ${highlighted ? ACCENT_SAGE : LINE}`,
        padding: 16,
        fontFamily: 'Inter, sans-serif',
        boxShadow: highlighted
          ? '0 0 0 3px rgba(124,159,139,0.20), 0 4px 16px rgba(124,159,139,0.18)'
          : 'none',
        transition: 'box-shadow 280ms ease, border-color 280ms ease',
      }}
    >
      {/* Top row — type chip + strength + stability */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{
            background: '#faf6ec',
            border: `1px solid ${LINE}`,
            color: TEXT_MUTED,
            fontSize: 10,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span aria-hidden>{meta.icon}</span>
          {meta.label}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            title={`Strength: ${card.strength}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full"
            style={{
              background: `${strengthColor}1f`,
              border: `1px solid ${strengthColor}55`,
              color: strengthColor,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}
          >
            {card.strength}
          </span>
          <span
            title={`Stability: ${STABILITY_LABEL[card.stability]}`}
            className="inline-flex items-center px-1.5 py-0.5 rounded-full"
            style={{
              background: '#fafaf9',
              border: '1px solid #e7e5e4',
              color: TEXT_MUTED,
              fontSize: 9,
              letterSpacing: '0.02em',
            }}
          >
            {STABILITY_LABEL[card.stability]}
          </span>
        </div>
      </div>

      {/* Headline + claim */}
      <h3
        className="leading-snug mb-1.5"
        style={{
          color: TEXT_INK,
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        }}
      >
        {card.label}
      </h3>
      <p
        style={{
          color: TEXT_BODY,
          fontSize: 12,
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        {card.claim}
      </p>

      {/* Evidence */}
      <EvidenceRender evidence={card.evidence} />

      {/* Bottom strip — comparison + finding + confidence + actionability */}
      <div
        className="mt-3 pt-2.5 flex flex-wrap gap-x-3 gap-y-1"
        style={{ borderTop: `1px solid ${LINE}` }}
      >
        <span style={{ color: TEXT_FAINT, fontSize: 10 }}>
          vs <span style={{ color: TEXT_BODY }}>{prettyComparison(card.comparison)}</span>
        </span>
        <span style={{ color: TEXT_FAINT, fontSize: 10 }}>
          · <span style={{ color: TEXT_BODY }}>{FINDING_LABEL[card.finding]}</span>
        </span>
        <span style={{ color: TEXT_FAINT, fontSize: 10 }}>
          ·{' '}
          <span title={CONF_LABEL[card.confidence]} style={{ color: confidenceColor }}>
            {CONF_LABEL[card.confidence]}
          </span>
        </span>
        <span style={{ color: TEXT_FAINT, fontSize: 10 }}>
          · <span style={{ color: TEXT_BODY }}>{ACTIONABILITY_LABEL[card.actionability]}</span>
        </span>
      </div>

      {/* Implication + next-question */}
      <div className="mt-3 space-y-1.5">
        <p
          style={{
            color: TEXT_BODY,
            fontSize: 11.5,
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: TEXT_FAINT, marginRight: 4 }}>→</span>
          {card.implication}
        </p>
        <p
          style={{
            color: TEXT_MUTED,
            fontSize: 11,
            lineHeight: 1.5,
            fontStyle: 'italic',
          }}
        >
          <span style={{ color: TEXT_FAINT, marginRight: 4 }}>?</span>
          {card.next_question}
        </p>
      </div>

      {/* Cross-tab links — exclude fingerprint since we're already on
          this tab; nothing useful in linking the user back to the page
          they're reading. */}
      {card.links && (card.links.outcomes?.length || card.links.edges?.length) && (
        <div className="mt-3 pt-2.5" style={{ borderTop: `1px solid ${LINE}` }}>
          <CrossTabLinks
            outcome={card.links.outcomes?.[0]}
            exclude={['fingerprint']}
            compact={false}
          />
        </div>
      )}
    </div>
  )
}

// ─── Evidence renderers ──────────────────────────────────────────

function EvidenceRender({ evidence }: { evidence: FingerprintEvidence }) {
  switch (evidence.kind) {
    case 'sparkline':
      return <Sparkline values={evidence.values} label={evidence.label} unit={evidence.unit} />
    case 'cliff':
      return <CliffViz e={evidence} />
    case 'compare_pair':
      return <ComparePair e={evidence} />
    case 'lab_pair':
      return <LabPair e={evidence} />
    case 'scatter':
      return <ScatterPlot e={evidence} />
    case 'note':
      return null
  }
}

function Sparkline({
  values,
  label,
  unit,
}: {
  values: number[]
  label?: string
  unit?: string
}) {
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 200
  const h = 36
  const stepX = w / Math.max(1, values.length - 1)
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(1)}`)
    .join(' ')
  return (
    <div className="rounded-lg p-2.5" style={{ background: '#faf6ec', border: `1px solid ${LINE}` }}>
      <div className="flex items-baseline justify-between mb-1">
        {label && (
          <span style={{ color: TEXT_MUTED, fontSize: 10 }}>{label}</span>
        )}
        <span
          className="tabular-nums"
          style={{ color: TEXT_BODY, fontSize: 10, fontWeight: 500 }}
        >
          {values[values.length - 1].toFixed(1)}
          {unit ? ' ' + unit : ''}
        </span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <polyline
          points={points}
          fill="none"
          stroke={ACCENT_SAGE}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

function CliffViz({
  e,
}: {
  e: Extract<FingerprintEvidence, { kind: 'cliff' }>
}) {
  // Visualization respects slope sign: negative slopes drop after the
  // knee, positive slopes rise. Stroke color reflects direction
  // (terracotta = falling outcome, sage = rising outcome). The knee
  // marker, dashed reference line, and outcome label stay neutral.
  const w = 200
  const h = 56
  const kneeX = w * 0.5
  // Anchor the "before" line in the vertical middle so a positive
  // slope has room to climb and a negative slope has room to fall.
  const beforeY = h * 0.5
  // Scale the slope visually but cap it so extreme slopes don't run
  // off the SVG. SVG y is inverted (smaller y = higher), so a
  // negative slope adds to y, a positive slope subtracts.
  const visualMagnitude = Math.min(h * 0.45, Math.abs(e.slope_after) * 0.6)
  const afterY =
    e.slope_after < 0
      ? beforeY + visualMagnitude // outcome falls past knee → line slopes down
      : beforeY - visualMagnitude // outcome rises past knee → line slopes up
  const afterStroke = e.slope_after < 0 ? ACCENT_TERRACOTTA : ACCENT_SAGE
  return (
    <div className="rounded-lg p-2.5" style={{ background: '#faf6ec', border: `1px solid ${LINE}` }}>
      <div className="flex items-baseline justify-between mb-1">
        <span style={{ color: TEXT_MUTED, fontSize: 10 }}>
          Knee at {e.knee} {e.knee_unit}
        </span>
        <span
          className="tabular-nums"
          style={{
            color: e.slope_after < 0 ? TONE_TEXT.harm : TONE_TEXT.benefit,
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          {e.slope_after > 0 ? '+' : ''}
          {e.slope_after.toFixed(1)}
          {e.outcome_unit ? ' ' + e.outcome_unit : ''} past knee
        </span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line
          x1={0}
          y1={beforeY}
          x2={kneeX}
          y2={beforeY}
          stroke={TEXT_FAINT}
          strokeWidth={1.5}
        />
        <line
          x1={kneeX}
          y1={beforeY}
          x2={w}
          y2={Math.max(2, Math.min(h - 2, afterY))}
          stroke={afterStroke}
          strokeWidth={1.5}
        />
        <line
          x1={kneeX}
          y1={4}
          x2={kneeX}
          y2={h - 4}
          stroke={TEXT_FAINT}
          strokeWidth={0.75}
          strokeDasharray="2 3"
        />
        <text
          x={kneeX + 4}
          y={h - 4}
          fontSize={9}
          fill={TEXT_MUTED}
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {e.outcome_label}
        </text>
      </svg>
    </div>
  )
}

function ComparePair({
  e,
}: {
  e: Extract<FingerprintEvidence, { kind: 'compare_pair' }>
}) {
  const max = Math.max(Math.abs(e.self), Math.abs(e.cohort), 1)
  const selfPct = (Math.abs(e.self) / max) * 100
  const cohortPct = (Math.abs(e.cohort) / max) * 100
  // Bar color now requires explicit direction metadata. Without it
  // (e.g. raw counts, neutral metrics, asymmetric panels), bars stay
  // neutral stone instead of asserting a meaning the data doesn't
  // carry. "Higher = green" is wrong for hsCRP, RHR, sleep debt,
  // glucose CV, and many others.
  const selfTone = (() => {
    if (!e.beneficial || e.beneficial === 'neutral') return TEXT_FAINT
    const isBetter =
      e.beneficial === 'higher' ? e.self > e.cohort : e.self < e.cohort
    return isBetter ? ACCENT_SAGE : ACCENT_TERRACOTTA
  })()
  return (
    <div className="rounded-lg p-2.5" style={{ background: '#faf6ec', border: `1px solid ${LINE}` }}>
      <div className="flex items-baseline justify-between mb-2">
        <span style={{ color: TEXT_MUTED, fontSize: 10 }}>
          {e.label}
          {e.n != null ? ` · n=${e.n}` : ''}
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span
            className="text-right tabular-nums flex-shrink-0"
            style={{ width: 50, color: TEXT_INK, fontSize: 10, fontWeight: 600 }}
          >
            {e.self.toFixed(1)}
            {e.unit ? '' : ''}
          </span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: '#f0e9d8' }}>
            <div
              className="h-full"
              style={{ width: `${selfPct}%`, background: selfTone }}
            />
          </div>
          <span style={{ color: TEXT_MUTED, fontSize: 9, width: 36 }}>you</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-right tabular-nums flex-shrink-0"
            style={{ width: 50, color: TEXT_MUTED, fontSize: 10 }}
          >
            {e.cohort.toFixed(1)}
            {e.unit ? '' : ''}
          </span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: '#f0e9d8' }}>
            <div
              className="h-full"
              style={{ width: `${cohortPct}%`, background: TEXT_FAINT }}
            />
          </div>
          <span style={{ color: TEXT_MUTED, fontSize: 9, width: 36 }}>cohort</span>
        </div>
      </div>
      {e.unit && (
        <div className="text-right mt-1" style={{ color: TEXT_FAINT, fontSize: 9 }}>
          {e.unit}
        </div>
      )}
    </div>
  )
}

function LabPair({
  e,
}: {
  e: Extract<FingerprintEvidence, { kind: 'lab_pair' }>
}) {
  // Two parallel sparklines with labels.
  const renderLine = (
    series: { date: string; value: number; unit?: string }[],
    label: string,
    color: string,
  ) => {
    if (series.length === 0) return null
    const min = Math.min(...series.map((s) => s.value))
    const max = Math.max(...series.map((s) => s.value))
    const range = max - min || 1
    const w = 180
    const h = 32
    const stepX = w / Math.max(1, series.length - 1)
    const points = series
      .map((s, i) => `${(i * stepX).toFixed(1)},${(h - ((s.value - min) / range) * (h - 4) - 2).toFixed(1)}`)
      .join(' ')
    const first = series[0]
    const last = series[series.length - 1]
    return (
      <div>
        <div className="flex items-baseline justify-between mb-0.5">
          <span style={{ color: TEXT_MUTED, fontSize: 10 }}>{label}</span>
          <span
            className="tabular-nums"
            style={{ color: TEXT_BODY, fontSize: 10 }}
          >
            {first.value} → {last.value}
            {last.unit ? ' ' + last.unit : ''}
          </span>
        </div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </svg>
      </div>
    )
  }
  return (
    <div className="rounded-lg p-2.5 space-y-2" style={{ background: '#faf6ec', border: `1px solid ${LINE}` }}>
      {renderLine(e.values_first, e.labels[0], ACCENT_SAGE)}
      {renderLine(e.values_second, e.labels[1], ACCENT_TERRACOTTA)}
    </div>
  )
}

function ScatterPlot({
  e,
}: {
  e: Extract<FingerprintEvidence, { kind: 'scatter' }>
}) {
  if (e.points.length === 0) return null
  const xs = e.points.map((p) => p.x)
  const ys = e.points.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1
  const w = 200
  const h = 60
  const padX = 6
  const padY = 4
  return (
    <div className="rounded-lg p-2.5" style={{ background: '#faf6ec', border: `1px solid ${LINE}` }}>
      <div className="flex items-baseline justify-between mb-1">
        <span style={{ color: TEXT_MUTED, fontSize: 10 }}>
          {e.x_label} × {e.y_label}
        </span>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {e.knee != null && (
          <line
            x1={padX + ((e.knee - xMin) / xRange) * (w - padX * 2)}
            y1={2}
            x2={padX + ((e.knee - xMin) / xRange) * (w - padX * 2)}
            y2={h - 2}
            stroke={TEXT_FAINT}
            strokeWidth={0.75}
            strokeDasharray="2 3"
          />
        )}
        {e.points.map((p, i) => (
          <circle
            key={i}
            cx={padX + ((p.x - xMin) / xRange) * (w - padX * 2)}
            cy={h - padY - ((p.y - yMin) / yRange) * (h - padY * 2)}
            r={2}
            fill={ACCENT_SAGE}
            opacity={0.7}
          />
        ))}
      </svg>
    </div>
  )
}

// ─── Banners + helpers ────────────────────────────────────────────

function FormingBanner({
  displayName,
  count,
}: {
  displayName: string
  count: number
}) {
  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 flex items-start gap-3"
      style={{
        background: '#fefbf3',
        border: `1px solid ${LINE}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: ACCENT_GOLD }} />
      <div>
        <div style={{ color: TEXT_INK, fontSize: 12, fontWeight: 500 }}>
          Fingerprint is still forming for {displayName}
        </div>
        <div style={{ color: TEXT_MUTED, fontSize: 11, marginTop: 2, lineHeight: 1.5 }}>
          {count === 1
            ? 'One distinctive pattern has emerged so far'
            : `${count} distinctive patterns have emerged so far`}
          . As more data accumulates, more should surface — see "What we can and can't see" below for what would unlock the most.
        </div>
      </div>
    </div>
  )
}

function DataGapBanner({ displayName }: { displayName: string }) {
  return (
    <div
      className="mb-6 rounded-xl px-5 py-5"
      style={{
        background: BG_CARD_WARM,
        border: `1px solid ${LINE}`,
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        className="flex items-center gap-2 mb-2"
        style={{ color: TEXT_MUTED, fontSize: 11 }}
      >
        <Sparkles className="w-3.5 h-3.5" style={{ color: ACCENT_GOLD }} />
        <span style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Data Fingerprint
        </span>
      </div>
      <h2
        style={{
          color: TEXT_INK,
          fontFamily: 'Inter, sans-serif',
          fontSize: 18,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          marginBottom: 4,
        }}
      >
        Not enough signal yet to draw a Fingerprint for {displayName}.
      </h2>
      <p style={{ color: TEXT_BODY, fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}>
        Serif hasn't yet seen enough exposure variation, outcome cadence, or
        contextual data to identify what is distinctively true about this
        member. That is itself a finding — the page below shows what we can
        currently see, and which next measurement would unlock the most
        personalization.
      </p>
    </div>
  )
}

function prettyComparison(c: Fingerprint['comparison']): string {
  switch (c) {
    case 'self_history': return 'your own history'
    case 'cohort': return 'the cohort'
    case 'similar_members': return 'similar members'
    case 'literature': return 'literature priors'
    case 'population_baseline': return 'population baseline'
    case 'clinical_range': return 'clinical reference range'
    case 'expected_physiology': return 'expected physiology'
    case 'prior_baseline': return 'your prior baseline'
  }
}

export default FingerprintView
