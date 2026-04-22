/**
 * Marginal value computation engine.
 * Runs client-side, combining the static mechanism catalog with
 * dynamic pipeline results to score candidate data sources.
 */
import {
  DOSE_FAMILIES,
  RESPONSE_FAMILIES,
  MECHANISM_CATALOG,
  LATENT_NODES,
  DEVICE_TO_COLUMNS,
} from './mechanismCatalog'
import { CANDIDATE_DATA_SOURCES } from './candidateDataSources'
import type {
  EdgeResult,
  ExistingDataSource,
  MarginalValueScore,
  MechanismTestability,
  CandidateDataSource,
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────

/** Collect all columns currently available from Caspian's devices */
export function getAvailableColumns(): Set<string> {
  const cols = new Set<string>()
  for (const deviceCols of Object.values(DEVICE_TO_COLUMNS)) {
    for (const col of deviceCols) {
      cols.add(col)
    }
  }
  return cols
}

/** Check if a dose family has at least one column in the available set */
function hasDoseData(doseFamilyId: string, availableColumns: Set<string>): boolean {
  const fam = DOSE_FAMILIES[doseFamilyId]
  if (!fam) return false
  return fam.columns.some((c) => availableColumns.has(c))
}

/** Check if a response family has at least one column in the available set */
function hasResponseData(responseFamilyId: string, availableColumns: Set<string>): boolean {
  const fam = RESPONSE_FAMILIES[responseFamilyId]
  if (!fam) return false
  return fam.columns.some((c) => availableColumns.has(c))
}

// ─── Core: Testability Analysis ──────────────────────────────────

/** Classify all 65 mechanisms as testable or untestable given available columns */
export function getCurrentlyTestableEdges(
  availableColumns: Set<string>
): { testable: MechanismTestability[]; untestable: MechanismTestability[] } {
  const testable: MechanismTestability[] = []
  const untestable: MechanismTestability[] = []

  for (const mech of MECHANISM_CATALOG) {
    const doseOk = hasDoseData(mech.doseFamily, availableColumns)
    const responseOk = hasResponseData(mech.responseFamily, availableColumns)

    const entry: MechanismTestability = {
      mechanism: mech,
      testable: doseOk && responseOk,
      hasDoseData: doseOk,
      hasResponseData: responseOk,
      missingDoseFamilies: doseOk ? [] : [mech.doseFamily],
      missingResponseFamilies: responseOk ? [] : [mech.responseFamily],
    }

    if (entry.testable) {
      testable.push(entry)
    } else {
      untestable.push(entry)
    }
  }

  return { testable, untestable }
}

// ─── Core: Marginal Value Scoring ────────────────────────────────

/** Score a single candidate data source */
export function computeMarginalValue(
  candidate: CandidateDataSource,
  availableColumns: Set<string>,
  edgeResults: EdgeResult[]
): MarginalValueScore {
  // Simulate adding candidate's columns
  const augmentedColumns = new Set(availableColumns)
  for (const col of candidate.newColumns) {
    augmentedColumns.add(col)
  }
  // Also add columns from new dose/response families
  for (const dfId of candidate.newDoseFamilies) {
    const fam = DOSE_FAMILIES[dfId]
    if (fam) fam.columns.forEach((c) => augmentedColumns.add(c))
  }
  for (const rfId of candidate.newResponseFamilies) {
    const fam = RESPONSE_FAMILIES[rfId]
    if (fam) fam.columns.forEach((c) => augmentedColumns.add(c))
  }

  // 1. New edges unlocked
  const currentTestable = new Set(
    MECHANISM_CATALOG
      .filter((m) => hasDoseData(m.doseFamily, availableColumns) && hasResponseData(m.responseFamily, availableColumns))
      .map((m) => m.id)
  )
  const augmentedTestable = MECHANISM_CATALOG
    .filter((m) => hasDoseData(m.doseFamily, augmentedColumns) && hasResponseData(m.responseFamily, augmentedColumns))
  const newlyUnlocked = augmentedTestable.filter((m) => !currentTestable.has(m.id))
  const newEdgesUnlocked = newlyUnlocked.length
  const newEdgePoints = Math.min(40, newEdgesUnlocked * 15)

  // 2. Confounder resolution
  const resolvedLatentNodes: string[] = []
  for (const latent of LATENT_NODES) {
    // A latent node is "resolved" if the candidate provides a column that
    // could serve as a proxy for it
    const resolves = candidate.newColumns.some((col) => {
      const colLower = col.toLowerCase()
      const latentLower = latent.toLowerCase().replace(/_/g, '')
      return colLower.includes(latentLower) || latentLower.includes(colLower.replace(/_/g, ''))
    })
    if (resolves) {
      resolvedLatentNodes.push(latent)
    }
  }
  // Special cases for specific candidates
  if (candidate.id === 'body_temperature') {
    if (!resolvedLatentNodes.includes('core_temperature')) {
      resolvedLatentNodes.push('core_temperature')
    }
  }
  if (candidate.id === 'mood_stress') {
    // Stress/RPE data proxies for energy expenditure and helps disentangle
    // cortisol confounding (perceived stress → cortisol → testosterone)
    if (!resolvedLatentNodes.includes('energy_expenditure')) {
      resolvedLatentNodes.push('energy_expenditure')
    }
  }
  if (candidate.id === 'genetic_data') {
    // Genetic data resolves confounders via Mendelian randomization:
    // iron absorption PRS → iron pathway, LDL receptor PRS → lipid pathway
    if (!resolvedLatentNodes.includes('insulin_sensitivity')) {
      resolvedLatentNodes.push('insulin_sensitivity')
    }
    if (!resolvedLatentNodes.includes('lipoprotein_lipase')) {
      resolvedLatentNodes.push('lipoprotein_lipase')
    }
  }
  const confoundersResolved = resolvedLatentNodes.length
  const confounderPoints = Math.min(30, confoundersResolved * 15)

  // 3. Signal boost (more frequent data → higher eff_n)
  const boostedEdgeTitles: string[] = []
  if (candidate.id === 'monthly_labs') {
    // Monthly labs boost every edge that currently has low eff_n (< 20)
    for (const edge of edgeResults) {
      if (edge.eff_n < 20) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'dedicated_hrv') {
    // Better HRV accuracy boosts all HRV-based edges
    for (const edge of edgeResults) {
      if (edge.target.includes('hrv') || edge.source.includes('hrv')) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'cgm') {
    // CGM provides daily glucose data vs quarterly labs, boosting metabolic edges
    for (const edge of edgeResults) {
      if (
        edge.target.includes('glucose') || edge.source.includes('glucose') ||
        edge.target.includes('insulin') || edge.target.includes('hba1c')
      ) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'nutrition') {
    // Consistent nutrition tracking improves dietary edge signal
    for (const edge of edgeResults) {
      if (edge.source.includes('dietary') || edge.source.includes('protein')) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'blood_pressure') {
    // BP data enhances cardiovascular and recovery edges
    for (const edge of edgeResults) {
      if (
        edge.target.includes('resting_hr') || edge.target.includes('hr_7d') ||
        edge.title.toLowerCase().includes('cardio')
      ) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'mood_stress') {
    // Subjective data disambiguates recovery and sleep edges
    for (const edge of edgeResults) {
      if (
        edge.target.includes('cortisol') || edge.target.includes('testosterone') ||
        edge.title.toLowerCase().includes('sleep')
      ) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'respiratory_rate') {
    // Respiratory rate enhances recovery and sleep edges
    for (const edge of edgeResults) {
      if (edge.target.includes('hrv') || edge.target.includes('sleep')) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  if (candidate.id === 'body_temperature') {
    // Temperature data improves sleep onset and recovery edges
    for (const edge of edgeResults) {
      if (edge.target.includes('sleep') || edge.title.toLowerCase().includes('sleep')) {
        boostedEdgeTitles.push(edge.title)
      }
    }
  }
  const signalBoostEdges = boostedEdgeTitles.length
  const signalBoostPoints = Math.min(30, signalBoostEdges * 5)

  // Composite score
  const composite = Math.min(100, newEdgePoints + confounderPoints + signalBoostPoints)

  // Tier
  let tier: MarginalValueScore['tier']
  if (composite >= 70) tier = 'transformative'
  else if (composite >= 45) tier = 'high'
  else if (composite >= 20) tier = 'moderate'
  else tier = 'low'

  return {
    candidateId: candidate.id,
    composite,
    newEdgesUnlocked,
    newEdgePoints,
    confoundersResolved,
    confounderPoints,
    signalBoostEdges,
    signalBoostPoints,
    tier,
    unlockedMechanisms: newlyUnlocked,
    resolvedLatentNodes,
    boostedEdgeTitles,
  }
}

// ─── Rank all candidates ─────────────────────────────────────────

export function rankCandidates(
  availableColumns: Set<string>,
  edgeResults: EdgeResult[]
): Array<{ candidate: CandidateDataSource; score: MarginalValueScore }> {
  const results = CANDIDATE_DATA_SOURCES.map((candidate) => ({
    candidate,
    score: computeMarginalValue(candidate, availableColumns, edgeResults),
  }))

  // Sort descending by composite score
  results.sort((a, b) => b.score.composite - a.score.composite)
  return results
}

// ─── Build existing source roster ────────────────────────────────

// Connection health is demo state — in production we'd derive this from the
// device's last-refreshed timestamp and a per-device freshness SLA. For Caspian
// we hand-pick two states: Apple Watch is live, AutoSleep went stale in
// 2023, GPX is live but a recent uploader bug dropped heart-rate streams.
const EXISTING_SOURCES_META: Array<{
  id: string
  name: string
  icon: string
  category: string
  deviceKey: string
  status: 'syncing' | 'issue'
  statusDetail: string
}> = [
  { id: 'apple-watch', name: 'Apple Watch', icon: 'Watch', category: 'Wearable', deviceKey: 'apple-watch', status: 'syncing', statusDetail: 'Syncing · last packet 2h ago' },
  { id: 'autosleep', name: 'AutoSleep', icon: 'Moon', category: 'Sleep', deviceKey: 'autosleep', status: 'issue', statusDetail: 'Disconnected since 2023-05-24 — reauth needed' },
  { id: 'gpx', name: 'GPX / Training Logs', icon: 'Map', category: 'Training', deviceKey: 'gpx', status: 'issue', statusDetail: 'HR stream missing on last 3 uploads — check Strava pairing' },
  { id: 'bloodwork', name: 'Quest / Bloodwork', icon: 'TestTube2', category: 'Biomarkers', deviceKey: 'bloodwork', status: 'syncing', statusDetail: 'Syncing · last draw 2025-11-22' },
  { id: 'medix-cpet', name: 'MEDIX CPET', icon: 'Stethoscope', category: 'Clinical', deviceKey: 'medix-cpet', status: 'syncing', statusDetail: 'Syncing · last test 2025-12-10' },
]

export function buildExistingSourceRoster(
  edgeResults: EdgeResult[]
): ExistingDataSource[] {
  const _availableColumns = getAvailableColumns()

  return EXISTING_SOURCES_META.map((src) => {
    const deviceCols = DEVICE_TO_COLUMNS[src.deviceKey] ?? []
    const deviceColSet = new Set(deviceCols)

    // Count how many fitted edges use at least one column from this device
    let edgesParticipating = 0
    let totalPersonalPct = 0
    let totalEffN = 0
    let count = 0

    for (const edge of edgeResults) {
      const sourceInDevice = deviceColSet.has(edge.source)
      const targetInDevice = deviceColSet.has(edge.target)
      if (sourceInDevice || targetInDevice) {
        edgesParticipating++
        totalPersonalPct += edge.personal_pct
        totalEffN += edge.eff_n
        count++
      }
    }

    return {
      id: src.id,
      name: src.name,
      icon: src.icon,
      category: src.category,
      edgesParticipating,
      totalEdges: edgeResults.length,
      columns: deviceCols,
      avgPersonalPct: count > 0 ? Math.round(totalPersonalPct / count) : 0,
      avgEffN: count > 0 ? Math.round(totalEffN / count) : 0,
      status: src.status,
      statusDetail: src.statusDetail,
    }
  })
}

// ─── Summary statistics ──────────────────────────────────────────

export function computeSummaryStats(edgeResults: EdgeResult[]) {
  const availableColumns = getAvailableColumns()
  const { testable, untestable } = getCurrentlyTestableEdges(availableColumns)
  const totalMechanisms = MECHANISM_CATALOG.length
  const testedPct = Math.round((testable.length / totalMechanisms) * 100)

  const avgPersonalWeight =
    edgeResults.length > 0
      ? Math.round(edgeResults.reduce((s, e) => s + e.personal_pct, 0) / edgeResults.length)
      : 0

  return {
    totalMechanisms,
    testableCount: testable.length,
    untestableCount: untestable.length,
    testedPct,
    avgPersonalWeight,
    latentNodeCount: LATENT_NODES.length,
    fittedEdgeCount: edgeResults.length,
  }
}
