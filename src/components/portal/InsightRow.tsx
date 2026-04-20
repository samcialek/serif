import { useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  FlaskConical,
  Watch,
} from 'lucide-react'
import { cn } from '@/utils/classNames'
import { TierBadge } from './TierBadge'
import { ResponseCurve } from './ResponseCurve'
import { InlineShapeGauge } from './InlineShapeGauge'
import type { EvidenceTier, InsightBayesian, Pathway } from '@/data/portal/types'
import { formatOutcomeValue } from '@/utils/rounding'
import { shapeFor } from '@/data/scm/doseShapes'
import { insightTierFor } from '@/utils/insightTier'

const ACTION_LABELS: Record<string, string> = {
  active_energy: 'Active energy',
  bedtime: 'Bedtime',
  running_volume: 'Running volume',
  sleep_duration: 'Sleep duration',
  training_load: 'Training load',
  training_volume: 'Training volume',
  zone2_volume: 'Zone 2 volume',
  steps: 'Steps',
  dietary_protein: 'Dietary protein',
  dietary_energy: 'Dietary energy',
  // Load actions — surfaced as insight sources but not as prescribable
  // protocols. Labels lead with the human concept, not the raw column.
  acwr: 'Acute:chronic load',
  sleep_debt: 'Sleep debt',
  travel_load: 'Travel load',
}

// Feasible 4–6 week behaviour-change shift per action. Used by the
// Insights tab to display effects at a realistic dose rather than at
// the engine's small nominal_step — many per-step effects round to
// ~0 when rendered in their native outcome unit. `amount` is the
// magnitude in the same unit as `nominal_step`; `label` is how we
// render it in copy.
export const FEASIBLE_SHIFT: Record<string, { amount: number; label: string }> = {
  active_energy: { amount: 300, label: '+300 kcal/day' },
  bedtime: { amount: 1, label: '1 hour earlier' },
  dietary_energy: { amount: 500, label: '500 kcal/day diet shift' },
  dietary_protein: { amount: 40, label: '+40 g/day protein' },
  running_volume: { amount: 40, label: '+40 km/week' },
  sleep_duration: { amount: 1, label: '1 hour more/night' },
  steps: { amount: 4000, label: '+4,000 steps/day' },
  training_load: { amount: 150, label: '+150 TRIMP/week' },
  training_volume: { amount: 300, label: '+5 hours/week' },
  zone2_volume: { amount: 120, label: '+2 hours/week' },
  // Load actions: labels describe a direction the user could steer toward
  // through their primary behaviours. doseShape handling flips the sign
  // for plateau_down / inverted_u cases at render time.
  acwr: { amount: 0.3, label: '+0.3 acute:chronic ratio' },
  sleep_debt: { amount: 5, label: '+5h accumulated 14d debt' },
  travel_load: { amount: 0.5, label: '+0.5 travel load' },
}

export function feasibleShiftFor(
  action: string,
  nominalStep: number,
): { amount: number; label: string } {
  const override = FEASIBLE_SHIFT[action]
  if (override) return override
  return { amount: Math.abs(nominalStep), label: `${Math.abs(nominalStep)}` }
}

// Load-agnostic effect the Insights tab actually renders: cohort-level
// per-step slope (posterior.mean) scaled to a feasible behaviour shift.
// Shared with the filter pipeline so "hide zero-effect" matches the
// number the user sees on the row.
export function feasibleEffectMagnitude(
  posteriorMean: number,
  action: string,
  nominalStep: number,
): number {
  const { amount } = feasibleShiftFor(action, nominalStep)
  const ratio = amount / Math.max(1e-9, Math.abs(nominalStep))
  return Math.abs(posteriorMean) * ratio
}

const OUTCOME_LABELS: Record<string, string> = {
  deep_sleep: 'Deep sleep',
  sleep_quality: 'Sleep quality',
  sleep_efficiency: 'Sleep efficiency',
  hrv_daily: 'HRV (daily)',
  resting_hr: 'Resting HR',
  ferritin: 'Ferritin',
  hemoglobin: 'Hemoglobin',
  iron_total: 'Iron (total)',
  rbc: 'RBC',
  mcv: 'MCV',
  rdw: 'RDW',
  magnesium_rbc: 'Magnesium (RBC)',
  zinc: 'Zinc',
  vo2_peak: 'VO2 peak',
  body_mass_kg: 'Body mass',
  body_fat_pct: 'Body fat %',
  hdl: 'HDL',
  ldl: 'LDL',
  apob: 'ApoB',
  non_hdl_cholesterol: 'Non-HDL cholesterol',
  total_cholesterol: 'Total cholesterol',
  triglycerides: 'Triglycerides',
  glucose: 'Glucose',
  insulin: 'Insulin',
  hscrp: 'hsCRP',
  cortisol: 'Cortisol',
  testosterone: 'Testosterone',
  estradiol: 'Estradiol',
  dhea_s: 'DHEA-S',
  shbg: 'SHBG',
  alt: 'ALT',
  ast: 'AST',
  homocysteine: 'Homocysteine',
  uric_acid: 'Uric acid',
  platelets: 'Platelets',
  wbc: 'WBC',
}

type BeneficialDir = 'higher' | 'lower' | 'neutral'

export interface OutcomeMeta {
  unit: string
  noun: string
  beneficial: BeneficialDir
}

export const OUTCOME_META: Record<string, OutcomeMeta> = {
  deep_sleep: { unit: 'min', noun: 'deep sleep', beneficial: 'higher' },
  sleep_quality: { unit: 'pts', noun: 'sleep quality', beneficial: 'higher' },
  sleep_efficiency: { unit: '%', noun: 'sleep efficiency', beneficial: 'higher' },
  hrv_daily: { unit: 'ms', noun: 'HRV', beneficial: 'higher' },
  resting_hr: { unit: 'bpm', noun: 'resting heart rate', beneficial: 'lower' },
  ferritin: { unit: 'ng/mL', noun: 'ferritin', beneficial: 'higher' },
  hemoglobin: { unit: 'g/dL', noun: 'hemoglobin', beneficial: 'higher' },
  iron_total: { unit: 'μg/dL', noun: 'iron', beneficial: 'higher' },
  rbc: { unit: 'M/μL', noun: 'red blood cells', beneficial: 'neutral' },
  mcv: { unit: 'fL', noun: 'MCV', beneficial: 'neutral' },
  rdw: { unit: '%', noun: 'RDW', beneficial: 'lower' },
  magnesium_rbc: { unit: 'mg/dL', noun: 'RBC magnesium', beneficial: 'higher' },
  zinc: { unit: 'μg/dL', noun: 'zinc', beneficial: 'higher' },
  vo2_peak: { unit: 'mL/kg/min', noun: 'VO2 peak', beneficial: 'higher' },
  body_mass_kg: { unit: 'kg', noun: 'body mass', beneficial: 'neutral' },
  body_fat_pct: { unit: '%', noun: 'body fat', beneficial: 'lower' },
  hdl: { unit: 'mg/dL', noun: 'HDL', beneficial: 'higher' },
  ldl: { unit: 'mg/dL', noun: 'LDL', beneficial: 'lower' },
  apob: { unit: 'mg/dL', noun: 'ApoB', beneficial: 'lower' },
  non_hdl_cholesterol: { unit: 'mg/dL', noun: 'non-HDL cholesterol', beneficial: 'lower' },
  total_cholesterol: { unit: 'mg/dL', noun: 'total cholesterol', beneficial: 'lower' },
  triglycerides: { unit: 'mg/dL', noun: 'triglycerides', beneficial: 'lower' },
  glucose: { unit: 'mg/dL', noun: 'glucose', beneficial: 'lower' },
  insulin: { unit: 'μIU/mL', noun: 'insulin', beneficial: 'lower' },
  hscrp: { unit: 'mg/L', noun: 'hsCRP', beneficial: 'lower' },
  cortisol: { unit: 'μg/dL', noun: 'cortisol', beneficial: 'neutral' },
  testosterone: { unit: 'ng/dL', noun: 'testosterone', beneficial: 'neutral' },
  estradiol: { unit: 'pg/mL', noun: 'estradiol', beneficial: 'neutral' },
  dhea_s: { unit: 'μg/dL', noun: 'DHEA-S', beneficial: 'neutral' },
  shbg: { unit: 'nmol/L', noun: 'SHBG', beneficial: 'neutral' },
  alt: { unit: 'U/L', noun: 'ALT', beneficial: 'lower' },
  ast: { unit: 'U/L', noun: 'AST', beneficial: 'lower' },
  homocysteine: { unit: 'μmol/L', noun: 'homocysteine', beneficial: 'lower' },
  uric_acid: { unit: 'mg/dL', noun: 'uric acid', beneficial: 'lower' },
  platelets: { unit: 'K/μL', noun: 'platelets', beneficial: 'neutral' },
  wbc: { unit: 'K/μL', noun: 'WBC', beneficial: 'neutral' },
  albumin: { unit: 'g/dL', noun: 'albumin', beneficial: 'higher' },
  creatinine: { unit: 'mg/dL', noun: 'creatinine', beneficial: 'neutral' },
  nlr: { unit: '', noun: 'NLR', beneficial: 'lower' },
}

// SCM DAG nodes carry suffixes like `_smoothed`, `_mean`, `_score`, `_pct`,
// `_min` that the Bayesian posterior export strips. Normalise to the
// OUTCOME_META key so lookups work for both sources.
const NODE_ID_ALIASES: Record<string, string> = {
  hrv_daily_mean: 'hrv_daily',
  hrv_7d_mean: 'hrv_daily',
  resting_hr_7d_mean: 'resting_hr',
  deep_sleep_min: 'deep_sleep',
  sleep_efficiency_pct: 'sleep_efficiency',
  sleep_quality_score: 'sleep_quality',
}

export function canonicalOutcomeKey(nodeId: string): string {
  if (NODE_ID_ALIASES[nodeId]) return NODE_ID_ALIASES[nodeId]
  if (nodeId.endsWith('_smoothed')) return nodeId.slice(0, -'_smoothed'.length)
  return nodeId
}

const EVIDENCE_TIER_LABELS: Record<EvidenceTier, string> = {
  cohort_level: 'Cohort-level',
  personal_emerging: 'Emerging',
  personal_established: 'Established',
}

const EVIDENCE_TIER_STYLE: Record<EvidenceTier, string> = {
  cohort_level: 'text-slate-600 bg-slate-100 border-slate-200',
  personal_emerging: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  personal_established: 'text-emerald-700 bg-emerald-50 border-emerald-200',
}

const PATHWAY_STYLE: Record<Pathway, string> = {
  wearable: 'text-sky-700 bg-sky-50 border-sky-200',
  biomarker: 'text-rose-700 bg-rose-50 border-rose-200',
}

// Left-border thickness scales with evidence tier: thicker = more
// personal-data-informed edge. Colour is tier-only; we don't encode
// personalisation-fraction here because the Insights tab is meant to
// surface causal edges load-agnostically (personalisation/contraction
// is a Protocol-tab concept).
const TIER_BORDER_WIDTH: Record<EvidenceTier, string> = {
  cohort_level: '2px',
  personal_emerging: '3px',
  personal_established: '4px',
}
const TIER_BORDER_COLOR: Record<EvidenceTier, string> = {
  cohort_level: '#cbd5e1',
  personal_emerging: '#818cf8',
  personal_established: '#059669',
}

interface InsightRowProps {
  insight: InsightBayesian
  density?: 'compact' | 'detailed'
}

export function InsightRow({
  insight,
  density = 'detailed',
}: InsightRowProps) {
  const [expanded, setExpanded] = useState(false)
  const {
    action,
    outcome,
    direction_conflict,
    posterior,
    nominal_step,
    scaled_effect,
    horizon_display,
    supporting_data_description,
  } = insight
  const pathway: Pathway = insight.pathway ?? 'wearable'
  const evidenceTier: EvidenceTier = insight.evidence_tier ?? 'cohort_level'
  const literatureBacked = insight.literature_backed === true
  const meta = OUTCOME_META[outcome]
  const beneficial: BeneficialDir = meta?.beneficial ?? 'neutral'

  // outcomeDir: which way the outcome moves under the beneficial
  // direction of this edge. Used for the arrow glyph. Load-agnostic.
  const outcomeDir: 1 | -1 | 0 =
    beneficial === 'higher'
      ? 1
      : beneficial === 'lower'
      ? -1
      : scaled_effect > 0
      ? 1
      : scaled_effect < 0
      ? -1
      : 0

  const borderColor = TIER_BORDER_COLOR[evidenceTier]
  const borderWidth = TIER_BORDER_WIDTH[evidenceTier]

  // Load-agnostic: the edge strength scaled to a feasible 4–6 week
  // behaviour-change shift (e.g. +40 km/week running, +1 hour sleep).
  // This is the population/cohort-level causal effect expressed at a
  // dose the user could realistically hit, rather than at the engine's
  // small nominal_step (where many effects round to ~0 in native units).
  // Protocol-level scaling (scaled_effect at actual dose_multiplier,
  // conditioned on today's load) belongs on the Protocols tab.
  const feasible = feasibleShiftFor(action, nominal_step)
  const feasibleEffect = feasibleEffectMagnitude(posterior.mean, action, nominal_step)

  // Insights tier is sign-probability based: promote an edge whenever
  // >=80% of posterior mass lies on one side of zero. This differs from
  // gate.tier, which is the published Protocols-tab rule (contraction ×
  // personalisation). An insight doesn't need the protocol dose to be
  // safe; it just needs the direction of the cohort-level effect to be
  // resolved.
  const tier = insightTierFor(insight)

  // Shape-aware rendering of the action-side shift. The feasible label
  // is written "as-if monotonic-up"; plateau_down means pulling *back*
  // from the action improves the outcome, inverted_u means moving
  // toward the sweet spot (direction depends on where the user is).
  const shape = shapeFor(action, outcome, scaled_effect, beneficial).shape
  const doseShiftText = (() => {
    const label = feasible.label
    if (shape === 'plateau_down') {
      if (label.startsWith('+')) return '−' + label.slice(1)
      if (/\bearlier\b/i.test(label)) return label.replace(/\bearlier\b/i, 'later')
      if (/\bmore\/night\b/i.test(label)) return label.replace(/\bmore\/night\b/i, 'less/night')
      return '−' + label
    }
    if (shape === 'inverted_u') {
      const stripped = label
        .replace(/^[+−-]\s?/, '')
        .replace(/\s+(earlier|later)\b/i, '')
        .replace(/\bmore\/night\b/i, '/night')
      return '±' + stripped
    }
    return label
  })()

  const ArrowIcon = outcomeDir >= 0 ? ArrowUp : ArrowDown
  const arrowColor =
    beneficial === 'neutral' || scaled_effect === 0 ? 'text-slate-500' : 'text-emerald-600'
  const compactMagnitude = `${formatOutcomeValue(feasibleEffect, outcome)}${
    meta?.unit ? ` ${meta.unit}` : ''
  }`
  const PathwayIcon = pathway === 'biomarker' ? FlaskConical : Watch
  const actionLabel = ACTION_LABELS[action] ?? action
  const outcomeLabel = OUTCOME_LABELS[outcome] ?? outcome

  const expandedBody = expanded ? (
    <div
      className={cn(
        'space-y-3',
        density === 'compact'
          ? 'px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/60'
          : 'px-4 pb-4 pt-3 border-t border-slate-100',
      )}
    >
      <ResponseCurve insight={insight} />

      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
          Effect at a feasible shift
        </p>
        <p className="text-sm font-semibold text-slate-800">
          ~{formatOutcomeValue(feasibleEffect, outcome)}
          {meta?.unit ? ` ${meta.unit}` : ''}{' '}
          <span className="font-normal text-slate-500">
            from {doseShiftText} of {actionLabel.toLowerCase()}
          </span>
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
          Cohort-level slope expressed at a realistic 4–6 week behaviour change,
          not today's operating point.
        </p>
      </div>

      {direction_conflict && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700">
              Your data differs from typical
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your personal response moves opposite to the cohort pattern — interpret with care.
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Horizon {horizon_display ?? '—'} · per-participant dose targeting lives in the Protocols tab.
      </p>

      {supporting_data_description && (
        <p className="text-xs text-slate-500 italic">{supporting_data_description}</p>
      )}
    </div>
  ) : null

  if (density === 'compact') {
    return (
      <div
        className="bg-white border border-slate-200 rounded-md overflow-hidden"
        style={{ borderLeftColor: borderColor, borderLeftWidth: borderWidth }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <span
            className="text-[13px] font-medium text-slate-800 w-32 flex-shrink-0 truncate"
            title={actionLabel}
          >
            {actionLabel}
          </span>
          <span className="text-slate-300 text-xs flex-shrink-0">→</span>
          <span
            className="text-[13px] font-medium text-slate-800 w-32 flex-shrink-0 truncate"
            title={outcomeLabel}
          >
            {outcomeLabel}
          </span>
          <InlineShapeGauge insight={insight} />
          <TierBadge tier={tier} />
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
              EVIDENCE_TIER_STYLE[evidenceTier],
            )}
          >
            {EVIDENCE_TIER_LABELS[evidenceTier]}
          </span>
          {literatureBacked && (
            <span
              className="inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded border-amber-200 bg-amber-50 text-amber-700"
              title="Direction of effect supported by established literature (RCTs or mechanistic studies)"
            >
              Lit
            </span>
          )}
          <PathwayIcon
            className={cn(
              'w-3 h-3 flex-shrink-0',
              pathway === 'biomarker' ? 'text-rose-500' : 'text-sky-500',
            )}
          />
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] flex-shrink-0 tabular-nums">
            <span className="text-slate-500 font-normal">{doseShiftText}</span>
            <span className="text-slate-300">→</span>
            <span className={cn('inline-flex items-center gap-0.5 font-semibold', arrowColor)}>
              <ArrowIcon className="w-3.5 h-3.5" />
              {compactMagnitude}
            </span>
          </span>
        </button>
        {expandedBody}
      </div>
    )
  }

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      style={{ borderLeftColor: borderColor, borderLeftWidth: borderWidth }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
      >
        <ChevronRight
          className={cn(
            'w-4 h-4 text-slate-400 flex-shrink-0 transition-transform',
            expanded && 'rotate-90',
          )}
        />
        {/* Fixed-width action column so arrows align vertically across rows */}
        <span
          className="text-sm font-semibold text-slate-800 w-40 flex-shrink-0 truncate"
          title={actionLabel}
        >
          {actionLabel}
        </span>
        <span className="text-slate-400 text-xs flex-shrink-0">→</span>
        <span
          className="text-sm font-semibold text-slate-800 w-36 flex-shrink-0 truncate"
          title={outcomeLabel}
        >
          {outcomeLabel}
        </span>
        <InlineShapeGauge insight={insight} />
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <TierBadge tier={tier} />
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 text-[10px] font-medium border rounded-full',
              EVIDENCE_TIER_STYLE[evidenceTier],
            )}
            title={supporting_data_description ?? undefined}
          >
            {EVIDENCE_TIER_LABELS[evidenceTier]}
          </span>
          {literatureBacked && (
            <span
              className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium border rounded-full border-amber-200 bg-amber-50 text-amber-700"
              title="Direction of effect supported by established literature (RCTs or mechanistic studies)"
            >
              Lit
            </span>
          )}
          <PathwayIcon
            className={cn(
              'w-3.5 h-3.5 flex-shrink-0',
              pathway === 'biomarker' ? 'text-rose-500' : 'text-sky-500',
            )}
            aria-label={pathway === 'biomarker' ? 'Biomarker' : 'Wearable'}
          />
          {horizon_display && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
              <Clock className="w-3 h-3" />
              {horizon_display}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs flex-shrink-0 tabular-nums">
          <span className="text-slate-500 font-normal">{doseShiftText}</span>
          <span className="text-slate-300">→</span>
          <span
            className={cn('inline-flex items-center gap-1 font-semibold', arrowColor)}
          >
            <ArrowIcon className="w-3.5 h-3.5" />
            {compactMagnitude}
          </span>
        </div>
      </button>

      {supporting_data_description && (
        <p className="px-3 pb-2 -mt-1 text-[11px] text-slate-500 italic leading-snug">
          {supporting_data_description}
        </p>
      )}

      {expandedBody}
    </div>
  )
}

export default InsightRow
