import type { InsightBayesian } from '@/data/portal/types'
import {
  hasPersonalPosterior,
  isExploratoryPriorEdge,
  isLiteratureEdge,
  metricProvenanceFromSource,
  posteriorKindForEdge,
  provenanceSortRank,
} from './edgeProvenance'

let failures = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  PASS  ${msg}`)
  } else {
    console.error(`  FAIL  ${msg}`)
    failures += 1
    process.exitCode = 1
  }
}

type EdgeOverrides = Omit<
  Partial<InsightBayesian>,
  'posterior' | 'gate' | 'cohort_prior' | 'user_obs'
> & {
  posterior?: Partial<InsightBayesian['posterior']> & { kind?: string | null }
  gate?: Partial<InsightBayesian['gate']>
  cohort_prior?: InsightBayesian['cohort_prior']
  user_obs?: InsightBayesian['user_obs']
}

function makeEdge(overrides: EdgeOverrides = {}): InsightBayesian {
  const { posterior, gate, ...rest } = overrides
  return {
    action: 'bedtime',
    outcome: 'hrv_daily',
    pathway: 'wearable',
    evidence_tier: 'cohort_level',
    prior_provenance: 'synthetic',
    nominal_step: 1,
    dose_multiplier: 1,
    dose_multiplier_raw: 1,
    direction_conflict: false,
    scaled_effect: 0.1,
    posterior: {
      mean: 0.1,
      variance: 0.04,
      sd: 0.2,
      contraction: 0.4,
      prior_mean: 0.05,
      prior_variance: 0.1,
      source: 'cohort_fit',
      lam_js: 0.5,
      n_cohort: 100,
      z_like: 1,
      ...posterior,
    },
    cohort_prior: null,
    user_obs: null,
    gate: {
      tier: 'possible',
      score: 0.5,
      ...gate,
    },
    ...rest,
  }
}

console.log('\nedgeProvenance - posterior adapter:')

const personal = makeEdge({
  evidence_tier: 'personal_established',
  posterior: { source: 'user_timeseries' },
})
assert(posteriorKindForEdge(personal) === 'personal', 'personal tier maps to personal')
assert(hasPersonalPosterior(personal), 'hasPersonalPosterior recognizes personal edges')

const weakDefaultWithMemberData = makeEdge({
  prior_provenance: 'weak_default',
  evidence_tier: 'personal_established',
  posterior: { source: 'user_ols' },
  user_obs: {
    slope: 0.01,
    se: 0.02,
    n: 60,
    at_nominal_step: 0.1,
    se_at_step: 0.2,
    residual_sd: 1,
    sigma_data_used: 0,
    pathway: 'wearable',
    confounders_adjusted: [],
  },
})
assert(
  posteriorKindForEdge(weakDefaultWithMemberData) === 'personal',
  'weak-default row with member observations maps to personal',
)
assert(
  !isExploratoryPriorEdge(weakDefaultWithMemberData),
  'weak-default row with member observations is not exploratory',
)
assert(
  hasPersonalPosterior(weakDefaultWithMemberData),
  'weak-default row with member observations counts as personal posterior',
)

const exploratory = makeEdge({
  prior_provenance: 'weak_default',
  evidence_tier: 'cohort_level',
  posterior: { source: 'pop' },
})
assert(
  posteriorKindForEdge(exploratory) === 'model_prior',
  'prior-only weak default maps to model prior',
)
assert(isExploratoryPriorEdge(exploratory), 'exploratory prior helper recognizes prior-only rows')
assert(!hasPersonalPosterior(exploratory), 'prior-only weak default does not count as personal')

const literature = makeEdge({
  literature_backed: true,
  prior_provenance: 'synthetic+literature',
  posterior: { source: 'literature' },
})
assert(posteriorKindForEdge(literature) === 'literature', 'literature-backed edge maps to literature')
assert(isLiteratureEdge(literature), 'literature helper recognizes literature-backed edge')

const personalWithLiterature = makeEdge({
  evidence_tier: 'personal_emerging',
  literature_backed: true,
  posterior: { source: 'user_timeseries' },
})
assert(
  posteriorKindForEdge(personalWithLiterature) === 'personal',
  'personal fit remains primary kind even when literature-backed',
)
assert(
  isLiteratureEdge(personalWithLiterature),
  'literature helper preserves the literature badge for personalized edges',
)

const cohort = makeEdge({
  evidence_tier: 'cohort_level',
  posterior: { source: 'engine_derived' },
})
assert(posteriorKindForEdge(cohort) === 'cohort', 'cohort fit maps to cohort')

assert(
  provenanceSortRank(literature) < provenanceSortRank(cohort) &&
    provenanceSortRank(cohort) < provenanceSortRank(exploratory),
  'sort rank orders literature, fitted, then exploratory prior',
)

console.log('\nedgeProvenance - metric source adapter:')

assert(metricProvenanceFromSource('Quest Labs') === 'lab', 'Quest source maps to lab')
assert(metricProvenanceFromSource('MyFitnessPal log') === 'logged', 'food log source maps to logged')
assert(metricProvenanceFromSource('engine-derived') === 'fitted', 'engine source maps to fitted')
assert(metricProvenanceFromSource('Apple Watch') === 'wearable', 'device source maps to wearable')

if (failures === 0) {
  console.log('\nAll edgeProvenance smoke tests passed.')
} else {
  console.error(`\n${failures} test(s) failed.`)
}
