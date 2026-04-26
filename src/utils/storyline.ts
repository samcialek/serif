/**
 * Storyline builders — three-sentence paragraphs that sit at the top
 * of Protocols / Twin (today's story) and Insights (eternal story).
 *
 * Deterministic templates for v1. Same participant state in → same
 * paragraph out. When an LLM is available these functions can be
 * swapped for a call that takes the same structured context and
 * returns prose — the rest of the UI doesn't care.
 *
 * Today's story (Protocols + Twin):
 *   S1 — what's active today: top regime + headline load deviation.
 *   S2 — environmental / yesterday-vs-today modulation.
 *   S3 — what that concentrates on (or what to explore in Twin).
 *
 * Eternal story (Insights):
 *   S1 — the biggest levers under the member's control (top |d|
 *        actionable edges across outcomes).
 *   S2 — environmental/contextual influences that shape the
 *        outcomes regardless of action.
 *   S3 — where the long-term opportunity is concentrated.
 */

import type { InsightBayesian, ParticipantPortal, RegimeKey } from '@/data/portal/types'
import { cohensD, isBeneficial } from '@/utils/insightStandardization'
import { isExploratoryPriorEdge } from '@/utils/edgeProvenance'

const REGIME_LABEL: Record<RegimeKey, string> = {
  overreaching_state: 'overreaching',
  iron_deficiency_state: 'iron-deficient',
  sleep_deprivation_state: 'sleep-deprived',
  inflammation_state: 'inflamed',
}

const REGIME_NARRATIVE: Record<RegimeKey, string> = {
  sleep_deprivation_state:
    'pulling HRV, testosterone, and focus downward via accumulated sleep debt',
  overreaching_state:
    'sitting in the overreaching zone — acute load ahead of chronic, recovery lagging',
  inflammation_state:
    'running elevated inflammatory tone — hsCRP and recovery markers dragging',
  iron_deficiency_state:
    'iron-deficient — ferritin + hemoglobin under-supporting oxygen delivery',
}

const ACTION_LABEL: Record<string, string> = {
  bedtime: 'bedtime',
  sleep_duration: 'sleep duration',
  running_volume: 'running volume',
  steps: 'daily step count',
  training_load: 'training load',
  active_energy: 'active energy',
  zone2_volume: 'zone-2 volume',
  zone2_minutes: 'zone-2 minutes',
  zone4_5_minutes: 'zone-4/5 intervals',
  training_volume: 'total training volume',
  dietary_protein: 'dietary protein',
  dietary_energy: 'caloric intake',
  caffeine_mg: 'caffeine dose',
  caffeine_timing: 'caffeine timing',
  alcohol_units: 'alcohol intake',
  alcohol_timing: 'alcohol timing',
  acwr: 'training-load ratio (ACWR)',
  sleep_debt: 'sleep debt',
}

const OUTCOME_LABEL: Record<string, string> = {
  hrv_daily: 'HRV',
  resting_hr: 'resting heart rate',
  sleep_quality: 'sleep quality',
  sleep_efficiency: 'sleep efficiency',
  deep_sleep: 'deep sleep',
  rem_sleep: 'REM sleep',
  cortisol: 'cortisol',
  glucose: 'glucose',
  apob: 'apoB',
  ferritin: 'ferritin',
  hemoglobin: 'hemoglobin',
  iron_total: 'iron',
  zinc: 'zinc',
  testosterone: 'testosterone',
  hscrp: 'hs-CRP',
  hba1c: 'HbA1c',
  vo2_peak: 'VO₂ peak',
}

export interface Story {
  headline: string
  body: string
  footnote?: string
}

function activeRegimes(p: ParticipantPortal): Array<[RegimeKey, number]> {
  const regs = p.regime_activations ?? {}
  return (Object.entries(regs) as Array<[RegimeKey, number]>)
    .filter(([, v]) => v >= 0.3)
    .sort((a, b) => b[1] - a[1])
}

function topOffBaselineLoad(
  p: ParticipantPortal,
): { key: string; value: number; band: 'watch' | 'elevated' } | null {
  const loads = p.loads_today ?? {}
  for (const [key, lv] of Object.entries(loads)) {
    if (!lv) continue
    // ACWR
    if (key === 'acwr' && (lv.value < 0.8 || lv.value > 1.3)) {
      return { key, value: lv.value, band: lv.value > 1.5 ? 'elevated' : 'watch' }
    }
    if (key === 'sleep_debt_14d' && lv.value >= 3) {
      return { key, value: lv.value, band: lv.value >= 7 ? 'elevated' : 'watch' }
    }
    if (key === 'tsb' && lv.value < -25) {
      return { key, value: lv.value, band: 'elevated' }
    }
    if (key === 'training_monotony' && lv.value > 2) {
      return { key, value: lv.value, band: 'elevated' }
    }
  }
  return null
}

function notableWeather(p: ParticipantPortal): string | null {
  const w = p.weather_today
  if (!w) return null
  const bits: string[] = []
  if (w.heat_index_c != null && w.heat_index_c >= 32) {
    bits.push(`heat index at ${Math.round(w.heat_index_c)}°C`)
  }
  if (w.aqi != null && w.aqi >= 150) {
    bits.push(`AQI elevated at ${Math.round(w.aqi)}`)
  }
  if (w.humidity_pct != null && w.humidity_pct >= 75) {
    bits.push(`humidity up at ${Math.round(w.humidity_pct)}%`)
  }
  if (w.uv_index != null && w.uv_index >= 8) {
    bits.push(`UV index ${w.uv_index.toFixed(1)}`)
  }
  if (bits.length === 0) return null
  if (bits.length === 1) return bits[0]
  if (bits.length === 2) return `${bits[0]} and ${bits[1]}`
  return `${bits.slice(0, -1).join(', ')}, and ${bits[bits.length - 1]}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildTodaysStory(p: ParticipantPortal): Story {
  const regs = activeRegimes(p)
  const topRegime = regs[0] ?? null
  const load = topOffBaselineLoad(p)
  const weather = notableWeather(p)

  // S1 — what's active today.
  let s1: string
  if (topRegime) {
    const [key, act] = topRegime
    const pct = Math.round(act * 100)
    s1 = `Today, they're ${REGIME_LABEL[key]} (${pct}%) — ${REGIME_NARRATIVE[key]}.`
  } else if (load) {
    s1 = `Today, they're off-baseline on ${load.key.replace(/_/g, ' ')} (${load.value.toFixed(1)}, ${load.band}).`
  } else {
    s1 = `Today, their loads and regimes are all within normal range — a clean baseline day.`
  }

  // S2 — environmental / modulating factor.
  let s2: string
  if (weather && topRegime) {
    s2 = `On top of that, ${weather} is an extra stressor the engine is adjusting for.`
  } else if (weather) {
    s2 = `Environmental context: ${weather}.`
  } else if (regs.length >= 2) {
    const [k2, act2] = regs[1]
    s2 = `A secondary ${REGIME_LABEL[k2]} signal (${Math.round(act2 * 100)}%) is also active.`
  } else if (load && topRegime) {
    s2 = `Load context: ${load.key.replace(/_/g, ' ')} is ${load.value.toFixed(1)}.`
  } else {
    s2 = `No notable environmental or secondary drivers flagged.`
  }

  // S3 — implication.
  let s3: string
  if (topRegime) {
    const [key] = topRegime
    if (key === 'sleep_deprivation_state') {
      s3 = `Today's protocol emphasizes protecting tonight's recovery — earlier caffeine cutoff, firm wind-down — because sleep is the biggest lever left.`
    } else if (key === 'overreaching_state') {
      s3 = `Today's protocol reduces training load and prioritizes autonomic recovery; Twin will flag sessions that push ACWR back into the danger zone.`
    } else if (key === 'inflammation_state') {
      s3 = `Today's protocol adds anti-inflammatory emphasis and moderates load; Twin's recovery outcomes are down-weighted while hsCRP is elevated.`
    } else if (key === 'iron_deficiency_state') {
      s3 = `Today's protocol adds iron-support timing and reduces run volume — rebuilding ferritin is a weeks-scale project.`
    } else {
      s3 = `Today's protocol is tuned to the active regime.`
    }
  } else {
    s3 = `Today is a good day to explore — no active regime pulling the schedule off baseline.`
  }

  return { headline: capitalize(s1), body: `${s2} ${s3}` }
}

export function buildEternalStory(p: ParticipantPortal): Story {
  // Rank actionable edges by |d| at baseline, grouped by action so the
  // user sees "levers that matter," not "outcomes that respond."
  const perAction = new Map<string, number[]>()
  for (const e of p.effects_bayesian ?? []) {
    if (isExploratoryPriorEdge(e)) continue
    if (e.gate.tier === 'not_exposed') continue
    const d = Math.abs(cohensD(e, p))
    if (!Number.isFinite(d) || d < 0.1) continue
    const list = perAction.get(e.action) ?? []
    list.push(d)
    perAction.set(e.action, list)
  }

  // Score per-action = sum of absolute d's (total leverage across
  // surfaces it touches). Pick top 3.
  const rankedActions = Array.from(perAction.entries())
    .map(([a, ds]) => ({ action: a, total: ds.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  // Pick the top outcome each of the top actions moves, for S1 color.
  const topEdgePerAction = new Map<string, InsightBayesian | null>()
  for (const e of p.effects_bayesian ?? []) {
    if (isExploratoryPriorEdge(e)) continue
    if (e.gate.tier === 'not_exposed') continue
    const prior = topEdgePerAction.get(e.action)
    if (
      !prior ||
      Math.abs(cohensD(e, p)) > Math.abs(cohensD(prior, p))
    ) {
      topEdgePerAction.set(e.action, e)
    }
  }

  const primary = rankedActions[0]
  const secondary = rankedActions[1]
  const tertiary = rankedActions[2]

  // S1 — where leverage is concentrated.
  let s1: string
  if (primary && topEdgePerAction.get(primary.action)) {
    const edge = topEdgePerAction.get(primary.action)!
    const actLbl = ACTION_LABEL[primary.action] ?? primary.action.replace(/_/g, ' ')
    const outLbl = OUTCOME_LABEL[edge.outcome] ?? edge.outcome.replace(/_/g, ' ')
    const direction = isBeneficial(edge) ? 'lifts' : 'weighs on'
    s1 = `Long-term, their biggest controllable lever is ${actLbl} — it ${direction} ${outLbl} more than any other action they can change.`
  } else {
    s1 = `Long-term, no single action is pulling hard enough to be the headline — they're in a relatively balanced state.`
  }

  // S2 — environmental context that shapes outcomes regardless of action.
  const weather = notableWeather(p)
  const cohort = p.cohort?.replace('cohort_', '').toUpperCase()
  let s2: string
  if (weather) {
    s2 = `Environmentally, ${weather} — conditions the engine adjusts for when interpreting their data, since those shape outcomes independent of what they do.`
  } else if (cohort) {
    s2 = `Their ${cohort} cohort setting (seasonality, location baseline) is a passive modulator the engine adjusts for on the biomarker side.`
  } else {
    s2 = `The engine is actively adjusting for season, weekend effects, and travel load when reading their biomarker data — those context factors shape outcomes without being something they can act on.`
  }

  // S3 — the long-term opportunity.
  let s3: string
  if (secondary && tertiary) {
    const s = ACTION_LABEL[secondary.action] ?? secondary.action.replace(/_/g, ' ')
    const t = ACTION_LABEL[tertiary.action] ?? tertiary.action.replace(/_/g, ' ')
    s3 = `After that, ${s} and ${t} are the next two places to spend attention — compound effects across multiple outcomes each.`
  } else if (secondary) {
    const s = ACTION_LABEL[secondary.action] ?? secondary.action.replace(/_/g, ' ')
    s3 = `The next best target is ${s} — meaningful effect size with room to calibrate from personal data.`
  } else {
    s3 = `The best next step is to accumulate more personal data so the engine can tighten the cohort estimates into personal ones.`
  }

  return { headline: capitalize(s1), body: `${s2} ${s3}` }
}

/** Story for the Exploration tab — three sentences framing "what the
 *  coach could learn by running experiments this quarter." Ranked by
 *  the same info-gain heuristic the tab uses (priorD × narrow). */
export function buildExplorationStory(p: ParticipantPortal): Story {
  const recs = p.exploration_recommendations ?? []
  if (recs.length === 0) {
    return {
      headline:
        "There's nothing outstanding for the engine to learn — every exposed edge is already personalized.",
      body:
        'When new actions get tried or new biomarkers drawn, exploration candidates will appear here with their expected learning gain.',
    }
  }

  const enriched = recs
    .map((r) => {
      const match = (p.effects_bayesian ?? []).find(
        (e) => e.action === r.action && e.outcome === r.outcome,
      )
      const priorD = match ? Math.abs(cohensD(match, p)) : 0
      // Rough narrow estimate mirroring the principled-formula's scale
      // per (kind, pathway). Storyline is descriptive — the cards show
      // the exact number.
      const kindWeight =
        r.kind === 'vary_action'
          ? r.pathway === 'wearable'
            ? 0.6
            : 0.45
          : r.pathway === 'biomarker'
            ? 0.4
            : 0.3
      return { rec: r, priorD, narrow: kindWeight, infoGain: priorD * kindWeight }
    })
    .sort((a, b) => b.infoGain - a.infoGain)

  const primary = enriched[0]
  const secondary = enriched[1]
  const tertiary = enriched[2]
  const weather = notableWeather(p)

  const actLbl = (a: string): string =>
    ACTION_LABEL[a] ?? a.replace(/_/g, ' ')
  const outLbl = (o: string): string =>
    OUTCOME_LABEL[o] ?? o.replace(/_/g, ' ')

  const pAct = actLbl(primary.rec.action)
  const pOut = outLbl(primary.rec.outcome)
  const pNarrow = Math.round(primary.narrow * 100)
  const kindPhrase =
    primary.rec.kind === 'vary_action' ? `vary ${pAct}` : `repeat a ${pOut} draw`

  // S1 — the single best experiment.
  const s1 =
    primary.priorD < 0.05
      ? `The engine has no strong experimental lead right now — every remaining candidate has a cohort prior too flat to be worth running.`
      : `The biggest single learning available is to ${kindPhrase} — it would collapse roughly ${pNarrow}% of the uncertainty on ${pOut}'s slope.`

  // S2 — environmental / pathway framing.
  const wearableCount = enriched.filter((e) => e.rec.pathway === 'wearable').length
  const biomarkerCount = enriched.length - wearableCount
  let s2: string
  if (weather) {
    s2 = `Environmentally, ${weather} — the engine adjusts for that when reading their data, so experimental designs stay valid.`
  } else if (biomarkerCount > wearableCount) {
    s2 = `Most open candidates are biomarker-pathway (${biomarkerCount} of ${enriched.length}) — repeat-draw experiments contract posteriors slower than daily wearable variation.`
  } else if (wearableCount > 0) {
    s2 = `${wearableCount} of ${enriched.length} candidates are wearable-pathway — daily observations collapse uncertainty fastest.`
  } else {
    s2 = `The candidate queue is small — most of the engine's causal map is already personalized enough to act on.`
  }

  // S3 — longer-horizon portfolio.
  let s3: string
  if (secondary && tertiary) {
    const s = actLbl(secondary.rec.action)
    const t = actLbl(tertiary.rec.action)
    const totalNarrow = Math.round(
      (primary.narrow + secondary.narrow + tertiary.narrow) * 100,
    )
    s3 = `Running the top three — ${pAct}, ${s}, ${t} — would contract ~${totalNarrow}% of the slope uncertainty across those edges combined.`
  } else if (secondary) {
    const s = actLbl(secondary.rec.action)
    s3 = `After that, ${s} is the next-best play; running both would be roughly a full quarter's exploration budget.`
  } else {
    s3 = `Once the top experiment completes it flows back into Insights as a personalized edge — that's the feedback loop.`
  }

  return { headline: capitalize(s1), body: `${s2} ${s3}` }
}
