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
import type { EvidenceTier, InsightBayesian, Pathway } from '@/data/portal/types'
import { formatOutcomeValue, formatRecommendedAction } from '@/utils/rounding'

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

// Left-border colour scales with personal_weight (how much of the
// estimate comes from user data) — slate when mostly cohort, emerald
// when mostly personal. Thickness scales with evidence tier.
function confidenceBorderColor(personalWeight: number): string {
  if (personalWeight >= 0.7) return '#059669'
  if (personalWeight >= 0.4) return '#4f46e5'
  if (personalWeight >= 0.15) return '#6366f1'
  return '#94a3b8'
}

const TIER_BORDER_WIDTH: Record<EvidenceTier, string> = {
  cohort_level: '2px',
  personal_emerging: '4px',
  personal_established: '6px',
}

interface InsightRowProps {
  insight: InsightBayesian
  currentValue?: number
  outcomeBaseline?: number
  density?: 'compact' | 'detailed'
}

export function InsightRow({
  insight,
  currentValue,
  outcomeBaseline,
  density = 'detailed',
}: InsightRowProps) {
  const [expanded, setExpanded] = useState(false)
  const {
    action,
    outcome,
    dose_multiplier,
    direction_conflict,
    posterior,
    gate,
    nominal_step,
    scaled_effect,
    horizon_display,
    supporting_data_description,
  } = insight
  const pathway: Pathway = insight.pathway ?? 'wearable'
  const evidenceTier: EvidenceTier = insight.evidence_tier ?? 'cohort_level'
  const meta = OUTCOME_META[outcome]
  const beneficial: BeneficialDir = meta?.beneficial ?? 'neutral'

  // actionDir: what the user should do (sign of signed dose).
  // outcomeDir: which way the outcome moves under the recommendation
  // (always beneficial direction for higher/lower outcomes).
  const actionDir: 1 | -1 | 0 = (() => {
    if (!Number.isFinite(scaled_effect) || scaled_effect === 0) return 0
    const s: 1 | -1 = scaled_effect > 0 ? 1 : -1
    if (beneficial === 'higher') return s
    if (beneficial === 'lower') return (s === 1 ? -1 : 1) as 1 | -1
    return s
  })()
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

  const signedDose = actionDir * Math.abs(dose_multiplier * nominal_step)
  const recommendedAction = formatRecommendedAction(
    action,
    currentValue ?? null,
    signedDose,
  )

  const personalWeight = Math.max(0, Math.min(1, posterior.contraction))
  const personalPct = Math.round(personalWeight * 100)
  const cohortPct = 100 - personalPct
  const borderColor = confidenceBorderColor(personalWeight)
  const borderWidth = TIER_BORDER_WIDTH[evidenceTier]

  const ArrowIcon = outcomeDir >= 0 ? ArrowUp : ArrowDown
  const arrowColor =
    actionDir === 0 || beneficial === 'neutral' ? 'text-slate-500' : 'text-emerald-600'
  const compactMagnitude = `${formatOutcomeValue(Math.abs(scaled_effect), outcome)}${
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
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${personalPct}%`, backgroundColor: borderColor }}
          />
        </div>
        <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
          {personalPct}% personal · {cohortPct}% cohort
        </span>
      </div>

      <div>
        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
          Expected benefit
        </p>
        <p className="text-sm font-semibold text-slate-800">
          ~{formatOutcomeValue(Math.abs(scaled_effect), outcome)}
          {meta?.unit ? ` ${meta.unit}` : ''} improvement in{' '}
          {meta?.noun ?? outcomeLabel.toLowerCase()}
        </p>
      </div>

      {recommendedAction && (
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            Recommended action
          </p>
          <p className="text-sm text-slate-700">{recommendedAction}</p>
        </div>
      )}

      {outcomeBaseline != null && Number.isFinite(outcomeBaseline) && (
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            Baseline → projection
          </p>
          <p className="text-sm text-slate-700 tabular-nums">
            {formatOutcomeValue(outcomeBaseline, outcome)} → ~
            {formatOutcomeValue(
              outcomeBaseline + Math.abs(scaled_effect) * outcomeDir,
              outcome,
            )}
            {meta?.unit ? ` ${meta.unit}` : ''}
          </p>
        </div>
      )}

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
        Posterior contraction {(posterior.contraction * 100).toFixed(0)}% · horizon{' '}
        {horizon_display ?? '—'}
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
          <TierBadge tier={gate.tier} />
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0 text-[10px] font-medium border rounded',
              EVIDENCE_TIER_STYLE[evidenceTier],
            )}
          >
            {EVIDENCE_TIER_LABELS[evidenceTier]}
          </span>
          <PathwayIcon
            className={cn(
              'w-3 h-3 flex-shrink-0',
              pathway === 'biomarker' ? 'text-rose-500' : 'text-sky-500',
            )}
          />
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: borderColor }}
            title={`${personalPct}% personal`}
          />
          <span className="ml-auto text-[11px] text-slate-500 tabular-nums flex-shrink-0 hidden md:inline">
            {personalPct}% yours
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 font-semibold tabular-nums text-[12px] flex-shrink-0',
              arrowColor,
            )}
          >
            <ArrowIcon className="w-3.5 h-3.5" />
            {compactMagnitude}
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
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <TierBadge tier={gate.tier} />
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium border rounded-full',
              PATHWAY_STYLE[pathway],
            )}
          >
            <PathwayIcon className="w-3 h-3" />
            {pathway === 'biomarker' ? 'Biomarker' : 'Wearable'}
          </span>
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 text-[10px] font-medium border rounded-full',
              EVIDENCE_TIER_STYLE[evidenceTier],
            )}
          >
            {EVIDENCE_TIER_LABELS[evidenceTier]}
          </span>
          {horizon_display && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full">
              <Clock className="w-3 h-3" />
              {horizon_display}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs flex-shrink-0">
          <span className="flex items-center gap-1.5 text-slate-500 tabular-nums">
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: borderColor }}
            />
            {personalPct}% yours
          </span>
          <span
            className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', arrowColor)}
          >
            <ArrowIcon className="w-3.5 h-3.5" />
            {compactMagnitude}
          </span>
        </div>
      </button>

      {expandedBody}
    </div>
  )
}

export default InsightRow
