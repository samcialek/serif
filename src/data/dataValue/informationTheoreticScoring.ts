/**
 * Information-theoretic affordance scoring.
 *
 * Replaces heuristic point-based scoring (×15 per edge, ×5 per boost)
 * with closed-form Normal-approximation KL divergences and expected
 * information gains using existing effN and personal_pct data.
 *
 * Four dimensions:
 * 1. Expected Information Gain (EIG) — value of unlocking new edges
 * 2. Variance Reduction — value of resolving latent confounders
 * 3. Precision Ratio — value of boosting sample size on existing edges
 * 4. Testability KL — how informative existing data has been (diminishing returns)
 *
 * All formulas use:
 *   KL(N(μ₁, σ₁²) ‖ N(μ₀, σ₀²)) = ½(σ₀²/σ₁² + (μ₁-μ₀)²/σ₀² - 1 + ln(σ₁²/σ₀²))
 *
 * where per-edge SE σ = |slope| / √effN.
 */

import {
  DOSE_FAMILIES,
  RESPONSE_FAMILIES,
  MECHANISM_CATALOG,
  LATENT_NODES,
  STRUCTURAL_EDGES,
  DEVICE_TO_COLUMNS,
} from './mechanismCatalog'
import { CANDIDATE_DATA_SOURCES } from './candidateDataSources'
import type {
  EdgeResult,
  CandidateDataSource,
  MechanismDef,
} from './types'

// ─── Types ──────────────────────────────────────────────────────

export interface EdgeGainDetail {
  edgeTitle: string
  source: string
  target: string
  priorVariance: number
  expectedPosteriorVariance: number
  kl: number
}

export interface ConfounderDetail {
  latentNode: string
  confoundingVariance: number
  affectedEdgeCount: number
}

export interface PrecisionDetail {
  edgeTitle: string
  source: string
  target: string
  currentEffN: number
  projectedEffN: number
  ratio: number
}

export interface TestabilityDetail {
  edgeTitle: string
  personalPct: number
  kl: number
}

export interface InformationTheoreticScore {
  candidateId: string
  composite: number  // 0-100
  expectedInformationGain: { raw: number; normalized: number; details: EdgeGainDetail[] }
  varianceReduction: { raw: number; normalized: number; details: ConfounderDetail[] }
  precisionRatio: { raw: number; normalized: number; details: PrecisionDetail[] }
  testabilityKL: { raw: number; normalized: number; details: TestabilityDetail[] }
  tier: 'transformative' | 'high' | 'moderate' | 'low'
  posteriorSource: 'closed_form_approximation' | 'numpyro_posterior'
}

// ─── KL divergence for Normal distributions ─────────────────────

/**
 * KL(N(μ₁, σ₁²) ‖ N(μ₀, σ₀²))
 * When μ₁ = μ₀ (no location shift, just precision gain):
 *   = ½(σ₀²/σ₁² - 1 - ln(σ₀²/σ₁²))
 */
function klNormal(sigma0Sq: number, sigma1Sq: number): number {
  if (sigma1Sq <= 0 || sigma0Sq <= 0) return 0
  const ratio = sigma0Sq / sigma1Sq
  return 0.5 * (ratio - 1 - Math.log(ratio))
}

/**
 * Full KL with location shift:
 *   KL(N(μ₁, σ₁²) ‖ N(μ₀, σ₀²)) = ½(σ₀²/σ₁² + (μ₁-μ₀)²/σ₀² - 1 + ln(σ₁²/σ₀²))
 */
function klNormalFull(mu0: number, sigma0Sq: number, mu1: number, sigma1Sq: number): number {
  if (sigma1Sq <= 0 || sigma0Sq <= 0) return 0
  return 0.5 * (
    sigma0Sq / sigma1Sq +
    (mu1 - mu0) ** 2 / sigma0Sq -
    1 +
    Math.log(sigma1Sq / sigma0Sq)
  )
}

/** Per-edge variance: σ² = slope² / effN */
function edgeVariance(slope: number, effN: number): number {
  if (effN <= 0) return Infinity
  return slope * slope / effN
}

/** Dominant slope for an edge (largest absolute effect) */
function dominantSlope(edge: EdgeResult): number {
  return Math.max(Math.abs(edge.bb), Math.abs(edge.ba))
}

// ─── Helpers ────────────────────────────────────────────────────

function getAvailableColumns(): Set<string> {
  const cols = new Set<string>()
  for (const deviceCols of Object.values(DEVICE_TO_COLUMNS)) {
    for (const col of deviceCols) cols.add(col)
  }
  return cols
}

function hasDoseData(doseFamilyId: string, cols: Set<string>): boolean {
  const fam = DOSE_FAMILIES[doseFamilyId]
  return fam ? fam.columns.some(c => cols.has(c)) : false
}

function hasResponseData(responseFamilyId: string, cols: Set<string>): boolean {
  const fam = RESPONSE_FAMILIES[responseFamilyId]
  return fam ? fam.columns.some(c => cols.has(c)) : false
}

/** Get the fitted edge matching a mechanism (if any) */
function findEdgeForMechanism(
  mech: MechanismDef,
  edgeResults: EdgeResult[]
): EdgeResult | undefined {
  // Try matching by dose/response family columns
  const doseFam = DOSE_FAMILIES[mech.doseFamily]
  const respFam = RESPONSE_FAMILIES[mech.responseFamily]
  if (!doseFam || !respFam) return undefined

  return edgeResults.find(e =>
    doseFam.columns.includes(e.source) && respFam.columns.includes(e.target)
  )
}

/** Estimate how many new observations a candidate would add per month */
function estimateNewObservations(candidate: CandidateDataSource): number {
  switch (candidate.frequency) {
    case 'Continuous (288+ readings/day)': return 200  // daily aggregates over ~7 months
    case 'Daily logging':
    case 'Daily self-report':
    case 'Daily (AM/PM)':
    case 'Daily 2-min morning reading':
    case 'Continuous overnight':
      return 150  // ~5 months of daily data
    case 'Monthly blood draws': return 12  // 12 monthly draws
    case 'One-time test': return 1  // static genetic data (used as instrument)
    default: return 30
  }
}

// ─── Dimension 1: Expected Information Gain ─────────────────────

function computeEIG(
  candidate: CandidateDataSource,
  availableColumns: Set<string>,
  edgeResults: EdgeResult[]
): { raw: number; details: EdgeGainDetail[] } {
  const augmented = new Set(availableColumns)
  for (const col of candidate.newColumns) augmented.add(col)
  for (const dfId of candidate.newDoseFamilies) {
    DOSE_FAMILIES[dfId]?.columns.forEach(c => augmented.add(c))
  }
  for (const rfId of candidate.newResponseFamilies) {
    RESPONSE_FAMILIES[rfId]?.columns.forEach(c => augmented.add(c))
  }

  const details: EdgeGainDetail[] = []
  let totalKL = 0

  // Check which mechanisms become newly testable
  const currentlyTestable = new Set(
    MECHANISM_CATALOG
      .filter(m => hasDoseData(m.doseFamily, availableColumns) && hasResponseData(m.responseFamily, availableColumns))
      .map(m => m.id)
  )

  for (const mech of MECHANISM_CATALOG) {
    if (currentlyTestable.has(mech.id)) continue
    const nowTestable = hasDoseData(mech.doseFamily, augmented) && hasResponseData(mech.responseFamily, augmented)
    if (!nowTestable) continue

    // This mechanism becomes newly testable
    // Find a similar existing edge to estimate slope magnitude (use median if no match)
    const similarEdge = findEdgeForMechanism(mech, edgeResults)
    const slope = similarEdge ? dominantSlope(similarEdge) : 0.05  // conservative default

    const expectedNewEffN = estimateNewObservations(candidate)

    // Prior: population-only (effN = 1)
    const priorVariance = edgeVariance(slope, 1)
    // Posterior: with expected new data
    const posteriorVariance = edgeVariance(slope, Math.max(1, expectedNewEffN))

    const kl = klNormal(priorVariance, posteriorVariance)

    details.push({
      edgeTitle: mech.name,
      source: mech.doseFamily,
      target: mech.responseFamily,
      priorVariance,
      expectedPosteriorVariance: posteriorVariance,
      kl,
    })

    totalKL += kl
  }

  return { raw: totalKL, details }
}

// ─── Dimension 2: Variance Reduction ────────────────────────────

function computeVarianceReduction(
  candidate: CandidateDataSource,
  edgeResults: EdgeResult[]
): { raw: number; details: ConfounderDetail[] } {
  const details: ConfounderDetail[] = []
  let totalVarianceReduction = 0

  // Which latent nodes does this candidate resolve?
  const resolvedLatents: string[] = []

  for (const latent of LATENT_NODES) {
    const resolves = candidate.newColumns.some(col => {
      const colLower = col.toLowerCase()
      const latentLower = latent.toLowerCase().replace(/_/g, '')
      return colLower.includes(latentLower) || latentLower.includes(colLower.replace(/_/g, ''))
    })
    if (resolves) resolvedLatents.push(latent)
  }

  // Special cases (matching marginalValueEngine logic)
  if (candidate.id === 'body_temperature' && !resolvedLatents.includes('core_temperature')) {
    resolvedLatents.push('core_temperature')
  }
  if (candidate.id === 'mood_stress' && !resolvedLatents.includes('energy_expenditure')) {
    resolvedLatents.push('energy_expenditure')
  }
  if (candidate.id === 'genetic_data') {
    if (!resolvedLatents.includes('insulin_sensitivity')) resolvedLatents.push('insulin_sensitivity')
    if (!resolvedLatents.includes('lipoprotein_lipase')) resolvedLatents.push('lipoprotein_lipase')
  }

  for (const latent of resolvedLatents) {
    // Find structural edges through this latent node
    const confoundingEdges = STRUCTURAL_EDGES.filter(
      e => e.edgeType === 'confounds' && (e.source === latent || e.target === latent)
    )

    // Sum confounding variance from fitted edges through these paths
    let confoundingVariance = 0
    let affectedCount = 0

    for (const se of confoundingEdges) {
      // Find the fitted edge that corresponds to this structural path
      const fittedEdge = edgeResults.find(e => {
        const srcMatch = e.source.includes(se.source) || se.source.includes(e.source.split('_')[0])
        const tgtMatch = e.target.includes(se.target) || se.target.includes(e.target.split('_')[0])
        return srcMatch || tgtMatch
      })

      if (fittedEdge) {
        const slope = dominantSlope(fittedEdge)
        const variance = edgeVariance(slope, fittedEdge.eff_n)
        confoundingVariance += variance
        affectedCount++
      }
    }

    // Also count causal edges where the latent is a mediator
    const mediatorEdges = STRUCTURAL_EDGES.filter(
      e => e.edgeType === 'causal' && (e.source === latent || e.target === latent)
    )

    for (const se of mediatorEdges) {
      const fittedEdge = edgeResults.find(e =>
        e.source.includes(se.source) || e.target.includes(se.target)
      )
      if (fittedEdge) {
        const slope = dominantSlope(fittedEdge)
        // Unresolved latent contributes uncertainty proportional to (1 - personal_pct)
        confoundingVariance += edgeVariance(slope, fittedEdge.eff_n) * (1 - fittedEdge.personal_pct / 100)
        affectedCount++
      }
    }

    if (confoundingVariance > 0) {
      details.push({
        latentNode: latent,
        confoundingVariance,
        affectedEdgeCount: affectedCount,
      })
      totalVarianceReduction += confoundingVariance
    }
  }

  return { raw: totalVarianceReduction, details }
}

// ─── Dimension 3: Precision Ratio ───────────────────────────────

function computePrecisionRatio(
  candidate: CandidateDataSource,
  edgeResults: EdgeResult[]
): { raw: number; details: PrecisionDetail[] } {
  const details: PrecisionDetail[] = []
  let totalRatio = 0

  const expectedNew = estimateNewObservations(candidate)

  // Find edges that this candidate would boost
  for (const edge of edgeResults) {
    let boosts = false

    // CGM: glucose/insulin edges
    if (candidate.id === 'cgm' && (
      edge.target.includes('glucose') || edge.source.includes('glucose') ||
      edge.target.includes('insulin') || edge.target.includes('hba1c')
    )) boosts = true

    // Monthly labs: any edge with low effN (labs provide more blood draws)
    if (candidate.id === 'monthly_labs' && edge.eff_n < 20) boosts = true

    // Dedicated HRV: HRV-related edges
    if (candidate.id === 'dedicated_hrv' && (
      edge.target.includes('hrv') || edge.source.includes('hrv')
    )) boosts = true

    // Nutrition: dietary edges
    if (candidate.id === 'nutrition' && (
      edge.source.includes('dietary') || edge.source.includes('protein')
    )) boosts = true

    // Blood pressure: cardiovascular and HR edges
    if (candidate.id === 'blood_pressure' && (
      edge.target.includes('resting_hr') || edge.target.includes('hr_7d')
    )) boosts = true

    // Mood/stress: cortisol, testosterone, sleep edges
    if (candidate.id === 'mood_stress' && (
      edge.target.includes('cortisol') || edge.target.includes('testosterone')
    )) boosts = true

    // Body temperature: sleep edges
    if (candidate.id === 'body_temperature' && (
      edge.target.includes('sleep') || edge.source.includes('sleep')
    )) boosts = true

    // Respiratory rate: HRV and sleep edges
    if (candidate.id === 'respiratory_rate' && (
      edge.target.includes('hrv') || edge.target.includes('sleep')
    )) boosts = true

    if (!boosts) continue

    const currentEffN = edge.eff_n
    const projectedEffN = currentEffN + expectedNew
    const ratio = (projectedEffN - currentEffN) / Math.max(1, currentEffN)

    details.push({
      edgeTitle: edge.title,
      source: edge.source,
      target: edge.target,
      currentEffN,
      projectedEffN,
      ratio,
    })

    totalRatio += ratio
  }

  return { raw: totalRatio, details }
}

// ─── Dimension 4: Testability KL ────────────────────────────────

/**
 * For edges that already have data, measure how far the posterior
 * has moved from the prior. High KL = data was informative (diminishing
 * returns on more). Low KL = data didn't help (maybe need different source).
 *
 * This is an INVERSE signal: candidates that would boost LOW-KL edges
 * score higher (more room for information gain).
 */
function computeTestabilityKL(
  candidate: CandidateDataSource,
  edgeResults: EdgeResult[]
): { raw: number; details: TestabilityDetail[] } {
  const details: TestabilityDetail[] = []
  let totalInverseKL = 0

  for (const edge of edgeResults) {
    // Only consider edges this candidate would affect
    let relevant = false
    if (candidate.id === 'cgm' && (edge.target.includes('glucose') || edge.target.includes('insulin'))) relevant = true
    if (candidate.id === 'monthly_labs' && edge.eff_n < 20) relevant = true
    if (candidate.id === 'dedicated_hrv' && (edge.target.includes('hrv') || edge.source.includes('hrv'))) relevant = true
    if (candidate.id === 'nutrition' && (edge.source.includes('dietary') || edge.source.includes('protein'))) relevant = true
    if (candidate.id === 'blood_pressure' && edge.target.includes('resting_hr')) relevant = true
    if (candidate.id === 'mood_stress' && (edge.target.includes('cortisol') || edge.target.includes('testosterone'))) relevant = true
    if (candidate.id === 'body_temperature' && edge.target.includes('sleep')) relevant = true
    if (candidate.id === 'respiratory_rate' && (edge.target.includes('hrv') || edge.target.includes('sleep'))) relevant = true

    if (!relevant) continue

    const slope = dominantSlope(edge)
    if (slope === 0) continue

    const personalPct = edge.personal_pct / 100
    // Prior: population-only (effN=1)
    const priorVariance = edgeVariance(slope, 1)
    // Current posterior: with existing data
    const posteriorVariance = edgeVariance(slope, edge.eff_n)

    // KL(posterior ‖ prior) — how much the data has already taught us
    const kl = klNormal(priorVariance, posteriorVariance)

    details.push({
      edgeTitle: edge.title,
      personalPct: edge.personal_pct,
      kl,
    })

    // Inverse: edges where current KL is LOW have more room for improvement
    // Score = 1/(1 + kl) so low-KL edges contribute more
    totalInverseKL += 1 / (1 + kl)
  }

  return { raw: totalInverseKL, details }
}

// ─── Composite scoring ──────────────────────────────────────────

/**
 * Rank-normalize raw scores across candidates.
 * Maps to 0-25 per dimension (max composite = 100).
 */
function rankNormalize(
  rawScores: number[],
  maxPerDimension: number = 25
): number[] {
  if (rawScores.length === 0) return []
  if (rawScores.length === 1) return [rawScores[0] > 0 ? maxPerDimension : 0]

  // Sort indices by raw score
  const indexed = rawScores.map((v, i) => ({ v, i }))
  indexed.sort((a, b) => a.v - b.v)

  // Assign ranks (handle ties by averaging)
  const ranks = new Array<number>(rawScores.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j < indexed.length && indexed[j].v === indexed[i].v) j++
    const avgRank = (i + j - 1) / 2
    for (let k = i; k < j; k++) {
      ranks[indexed[k].i] = avgRank
    }
    i = j
  }

  // Normalize to 0-maxPerDimension
  const maxRank = rawScores.length - 1
  return ranks.map(r => maxRank > 0 ? (r / maxRank) * maxPerDimension : 0)
}

// ─── Public API ─────────────────────────────────────────────────

export function computeInformationTheoreticScore(
  candidate: CandidateDataSource,
  availableColumns: Set<string>,
  edgeResults: EdgeResult[]
): InformationTheoreticScore {
  const eig = computeEIG(candidate, availableColumns, edgeResults)
  const vr = computeVarianceReduction(candidate, edgeResults)
  const pr = computePrecisionRatio(candidate, edgeResults)
  const tk = computeTestabilityKL(candidate, edgeResults)

  // Placeholder — normalized scores are computed in rankAllCandidates
  return {
    candidateId: candidate.id,
    composite: 0,
    expectedInformationGain: { raw: eig.raw, normalized: 0, details: eig.details },
    varianceReduction: { raw: vr.raw, normalized: 0, details: vr.details },
    precisionRatio: { raw: pr.raw, normalized: 0, details: pr.details },
    testabilityKL: { raw: tk.raw, normalized: 0, details: tk.details },
    tier: 'low',
    posteriorSource: 'closed_form_approximation',
  }
}

/**
 * Score and rank all candidates with cross-candidate normalization.
 */
export function rankCandidatesIT(
  edgeResults: EdgeResult[]
): Array<{ candidate: CandidateDataSource; score: InformationTheoreticScore }> {
  const availableColumns = getAvailableColumns()

  // Compute raw scores for all candidates
  const rawResults = CANDIDATE_DATA_SOURCES.map(candidate => ({
    candidate,
    score: computeInformationTheoreticScore(candidate, availableColumns, edgeResults),
  }))

  // Cross-candidate rank normalization for each dimension
  const eigRaw = rawResults.map(r => r.score.expectedInformationGain.raw)
  const vrRaw = rawResults.map(r => r.score.varianceReduction.raw)
  const prRaw = rawResults.map(r => r.score.precisionRatio.raw)
  const tkRaw = rawResults.map(r => r.score.testabilityKL.raw)

  const eigNorm = rankNormalize(eigRaw)
  const vrNorm = rankNormalize(vrRaw)
  const prNorm = rankNormalize(prRaw)
  const tkNorm = rankNormalize(tkRaw)

  // Apply normalized scores and compute composites
  for (let i = 0; i < rawResults.length; i++) {
    const s = rawResults[i].score
    s.expectedInformationGain.normalized = eigNorm[i]
    s.varianceReduction.normalized = vrNorm[i]
    s.precisionRatio.normalized = prNorm[i]
    s.testabilityKL.normalized = tkNorm[i]
    s.composite = Math.round(eigNorm[i] + vrNorm[i] + prNorm[i] + tkNorm[i])

    if (s.composite >= 70) s.tier = 'transformative'
    else if (s.composite >= 45) s.tier = 'high'
    else if (s.composite >= 20) s.tier = 'moderate'
    else s.tier = 'low'
  }

  // Sort descending by composite
  rawResults.sort((a, b) => b.score.composite - a.score.composite)
  return rawResults
}
