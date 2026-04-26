/**
 * Fingerprint — distinctive properties of a person's data, beyond
 * "what edge moves what outcome." See FingerprintView.tsx for the
 * product framing.
 */

export type FingerprintType =
  | 'outlier'
  | 'threshold'
  | 'sensitivity'
  | 'contradiction'
  | 'variability'
  | 'rare_combination'
  | 'behavior'
  | 'identity_label'
  | 'data_gap'

export type FingerprintComparison =
  | 'self_history'
  | 'cohort'
  | 'similar_members'
  | 'literature'
  | 'population_baseline'
  | 'clinical_range'
  | 'expected_physiology'
  | 'prior_baseline'

export type FingerprintStrength = 'weak' | 'moderate' | 'strong'

/** Reuses the painterly confidence palette: high/med/low/lit. */
export type FingerprintConfidence = 'low' | 'med' | 'high' | 'lit'

export type FingerprintStability =
  | 'emerging'
  | 'recurring'
  | 'stable'
  | 'seasonal'
  | 'recently_changed'

export type FingerprintActionability =
  | 'direct'
  | 'indirect'
  | 'watch_only'
  | 'measurement_gap'

export type FingerprintFinding =
  | 'likely_driver' // we have causal evidence
  | 'reliable_pattern' // consistent over time, not necessarily causal
  | 'unusual_baseline' // outlier vs comparison set
  | 'open_question' // suggestive but unresolved

/** Inline visualization payload — kept small + typed so the renderer
 *  can switch on `kind` without parsing free-form data. */
export type FingerprintEvidence =
  | { kind: 'sparkline'; values: number[]; label?: string; unit?: string }
  | {
      kind: 'cliff'
      knee: number
      knee_unit: string
      slope_before: number
      slope_after: number
      outcome_label: string
      outcome_unit?: string
    }
  | {
      kind: 'compare_pair'
      self: number
      cohort: number
      label: string
      unit?: string
      n?: number
      /** Direction of the metric — controls bar color. 'higher' means
       *  bigger-is-better (HRV, deep sleep, ferritin); 'lower' means
       *  smaller-is-better (hsCRP, RHR, sleep debt, glucose CV);
       *  'neutral' means there's no good/bad direction. When omitted,
       *  bars render in the neutral stone tone — the renderer never
       *  guesses. */
      beneficial?: 'higher' | 'lower' | 'neutral'
    }
  | {
      kind: 'lab_pair'
      labels: [string, string] // e.g. ["Ferritin", "Saturation"]
      values_first: { date: string; value: number; unit?: string }[]
      values_second: { date: string; value: number; unit?: string }[]
    }
  | {
      kind: 'scatter'
      points: Array<{ x: number; y: number }>
      x_label: string
      y_label: string
      x_unit?: string
      y_unit?: string
      knee?: number // optional break-line on x
    }
  | { kind: 'note'; body: string }

export interface Fingerprint {
  /** Stable id — used as anchor target for hero label clicks. */
  id: string
  type: FingerprintType
  /** Headline. For identity_label entries this is the controlled
   *  dictionary phrase; for everything else, a short claim title. */
  label: string
  /** 1-2 sentence claim. Generated/template-driven from evidence; voice
   *  guardrails apply ("Your data suggests…" not "You always…"). */
  claim: string
  evidence: FingerprintEvidence
  comparison: FingerprintComparison
  strength: FingerprintStrength
  confidence: FingerprintConfidence
  stability: FingerprintStability
  actionability: FingerprintActionability
  finding: FingerprintFinding
  /** Why it matters — one sentence. */
  implication: string
  /** What Serif should measure / test / watch next — one sentence. */
  next_question: string
  /** Cross-tab deep-link payload — outcomes / edges / streams this
   *  Fingerprint references. Drives the chip strip on each card. */
  links?: {
    outcomes?: string[]
    edges?: Array<{ action: string; outcome: string }>
    data_streams?: string[]
  }
  /** identity_label entries point at the supporting Fingerprint ids
   *  that justify the label. Hero pill click scrolls + highlights. */
  supports?: string[]
}

/** Output of a per-member compute pass — the View consumes this. */
export interface FingerprintBundle {
  participantPid: number
  /** All fingerprints for this member, including weak ones. */
  fingerprints: Fingerprint[]
  /** Render mode — driven by the count of moderate+strong items.
   *   - rich: 3+ → render the full page
   *   - forming: 1-2 → render those plus a prominent "still forming" banner
   *   - data_gap: 0 → first-class data-gap state with no findings yet
   */
  mode: 'rich' | 'forming' | 'data_gap'
}
