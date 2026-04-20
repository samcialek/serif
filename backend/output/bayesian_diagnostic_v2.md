# Bayesian Gating Path — Diagnostic Report v2 (Total-Effect Priors)

**Generated:** 2026-04-17
**Pipeline:** `export_portal_bayesian` (v2, total-effect prior architecture)
**Engine version:** `v4-total-effect-bayes`
**Output location:** `backend/output/portal_bayesian/` (1,188 JSON files + manifest)

## TL;DR

Full 1,188-participant run completes in 4.9s. **One stop-condition warning**:
`exposed_total = 4,555 < 5,000` (a near-miss; 91% of target). Contraction and
multiplier distributions are now **continuous, not bimodal** — the architectural
fix succeeded:

| metric                       | v1 (edge slopes) | v2 (total effects) |
|------------------------------|:-----------------|:-------------------|
| contraction p10/p50/p90      | 0.000/0.000/1.000 | 0.000/0.456/0.910 |
| multiplier p10/p50/p90       | 0.500/0.500/1.500 | 0.500/0.741/1.322 |
| % multipliers at 0.5 floor   | 80.0%            | ~15%              |
| recommended / possible       | 1,188 / 0        | 1,452 / 3,103     |
| (action, outcome) surface    | 5 (edge-level)   | 7 (total-effect)  |

Bimodal contraction distribution (the v1 failure mode) is gone. Users' posteriors
now land across the full contraction range, and the tier split is meaningful.

---

## Architecture change

v1 fit Normal priors on individual edge slopes (`bb`, `ba`, `theta`) and
combined them through the structural DAG. A single absolute SD floor (0.05)
decoupled each prior from the edge's native slope magnitude — so the user's
OLS either dominated it completely (tiny-slope edges) or was dominated
completely (natural-scale edges).

v2 fits priors directly on `scaled_effect` for each `(action, outcome)` pair
— i.e., the engine's own counterfactual prediction at
`dose = MARGINAL_STEPS[action]`, collected across 1,188 participants and fit
to `Normal(μ, 2·σ²)`. Because the scaled effect is already expressed in the
outcome's native units, no absolute floor is needed and the prior scale is
automatically compatible with the user's observed slope.

Structural edges remain the computational layer. Posteriors live at the
input-output gateway.

## Modules

| Module                       | Role                                                   |
|------------------------------|--------------------------------------------------------|
| `cohorts.py` (extended)      | `get_cohort_members` added; rest reused from v1        |
| `total_effect_priors.py`     | Fit per-(action, outcome) Normal priors on 1,188 pids  |
| `user_observations.py`       | Per-user confounded OLS on daily CSVs                  |
| `conjugate_update.py`        | Sam's spec formula; JS blend; `compute_posterior`      |
| `dose_multiplier.py`         | Reused; contraction → `[0.5, 1.5]`                     |
| `export_portal_bayesian.py`  | Rewritten for total-effect surface                     |

---

## Pipeline

**Per (action, outcome) pair, per participant:**

1. **Population prior** (`total_effect_priors.py`): engine computes
   counterfactual `scaled_effect` for each of 1,188 participants at
   `dose = MARGINAL_STEPS[action]`. Fit `N(μ, 2·σ²)` across participants.
2. **Cohort prior**: same fit, restricted to cohort members (3 cohorts in
   synthetic data: `delhi`=534, `abu_dhabi`=416, `remote`=238).
3. **James-Stein blend**: `λ = n_cohort / (n_cohort + 75)`. Precision-weighted
   variance blend. For all three synthetic cohorts `λ ≥ 0.76`, so the blend
   is cohort-dominated — but per-cohort priors barely differ from pop
   (synthetic population homogeneous in causal parameters).
4. **User observation** (`user_observations.py`): confounded OLS on daily
   CSVs, `outcome_t ~ action_t + other_actions_t + trend + const`. Adjustment
   set: all 6 manipulable actions' native columns (lifestyle_app) *except*
   those the action-of-interest derives from (avoids perfect collinearity
   when an action is a linear combination of others, e.g., `training_load =
   1.78·training_min`).
5. **Normal-Normal conjugate update** (`conjugate_update.py`) using Sam's
   formula: `data_precision = obs_n / sigma_data²`. `sigma_data` comes from
   the measurement-model memory (per-outcome noise in absolute units). Using
   `sigma_data` rather than the OLS SE keeps the update stable when user n
   is small.

**Supported (action, outcome) pairs (7):**

| Action          | Outcome           | Pop mean    | Raw σ       | N contrib |
|-----------------|-------------------|-------------|-------------|-----------|
| active_energy   | deep_sleep        | +0.6922 min | 0.125       | 1,188     |
| bedtime         | deep_sleep        | +0.6072 min | 0.687       | 1,188     |
| bedtime         | sleep_quality     | +0.4608 pts | 0.666       | 1,188     |
| running_volume  | hrv_daily         | +0.1417 ms  | 0.388       | 1,188     |
| sleep_duration  | hrv_daily         | +0.1354 ms  | 0.034       | 1,188     |
| training_load   | hrv_daily         | −5.0562 ms  | 1.150       | 1,188     |
| training_load   | resting_hr        | +1.3053 bpm | 0.237       | 1,188     |

The remaining action-wearable DAG edges are excluded either because the edge
has zero slope (`steps → sleep_efficiency`: `bb=0.0`) or the action has no
DAG path to any wearable descendant (`training_volume`, `zone2_volume`,
`dietary_protein`, `dietary_energy`).

## Headline tier distribution

| Tier        | Count  | % of 8,316 rows |
|-------------|--------|------------------|
| recommended |  1,452 | 17.5% |
| possible    |  3,103 | 37.3% |
| not_exposed |  3,761 | 45.2% |

**Exposed total: 4,555** (mean **3.83** per participant). Stop-condition
warning (`< 5,000`) is a near-miss — see "remaining calibration concerns"
below.

## Per-edge tier breakdown

| Edge                            | rec | pos  | n_ex | c_mean | mult_mean | Comment                              |
|---------------------------------|----:|-----:|-----:|-------:|----------:|--------------------------------------|
| active_energy → deep_sleep      |   0 |    0 | 1188 | 0.015  | 0.515     | Prior too tight (see below)          |
| bedtime → deep_sleep            |   0 |   38 | 1150 | 0.248  | 0.748     | Moderate update; many small effects  |
| bedtime → sleep_quality         |   0 | 1166 |   22 | 0.475  | 0.966     | Broad moderate contraction           |
| running_volume → hrv_daily      |   0 |  975 |  213 | 0.561  | 0.868     | Wide prior + wide user SE; good      |
| sleep_duration → hrv_daily      |   0 |    0 | 1188 | 0.016  | 0.516     | Prior too tight (see below)          |
| training_load → hrv_daily       | 681 |  507 |    0 | 0.914  | 1.024     | Strong prior, users confirm          |
| training_load → resting_hr      | 771 |  417 |    0 | 0.794  | 1.022     | Strong prior, users confirm          |

## Per-cohort breakdown

| Cohort     | Rows  | rec | pos  | c_mean | mult_mean | conflict_rate |
|------------|------:|----:|-----:|-------:|----------:|--------------:|
| delhi      | 3,738 | 650 | 1460 | 0.455  | 0.825     | 16.5%         |
| abu_dhabi  | 2,912 | 528 | 1088 | 0.435  | 0.816     | 15.1%         |
| remote     | 1,666 | 274 |  555 | 0.373  | 0.757     | 17.1%         |

Consistent across cohorts, as expected — the synthetic population is
homogeneous in causal parameters (cohorts differ in adherence, compliance,
and logging rates but not in edge slopes or baseline state distributions).

---

## Contraction & multiplier distributions

| statistic       | v1 (edge slopes) | v2 (total effects) |
|-----------------|:-----------------|:-------------------|
| contraction p10 | 0.000            | 0.000              |
| contraction p50 | 0.000            | 0.456              |
| contraction p90 | 1.000            | 0.910              |
| contraction mean| 0.200            | 0.432              |
| multiplier p10  | 0.500            | 0.500              |
| multiplier p50  | 0.500            | 0.741              |
| multiplier p90  | 1.500            | 1.322              |
| multiplier mean | 0.700            | 0.808              |

The v1 bimodality (p10 = p50 = 0 or p10 = p50 = 1 per edge, nothing
in the middle) is gone. The v2 medians sit solidly inside the `[0, 1]`
interval, and the multiplier surface uses most of its range.

---

## Remaining calibration concerns

### 1. Two pairs with over-tight priors

`active_energy → deep_sleep` and `sleep_duration → hrv_daily` have prior
SDs (after 2× inflation) of 0.177 min and 0.048 ms respectively — so tight
that no user observation can move the posterior. They contribute zero
exposed rows.

Root cause: `scaled_effect` across 1,188 participants clusters very
narrowly for these pairs. The engine's output heterogeneity represents
*state variation*, not *causal parameter uncertainty*. Ideally:

- Keep the 2× inflation as a baseline, but
- Add a mean-scaled floor: `var_pop = max(2·σ²_raw, (frac · |μ|)²)` with
  `frac` ≈ 0.3–0.5, so the prior SD is always at least 30–50% of the mean
  effect magnitude.

This adds a minimum "we might be wrong by this much" band. Leaves the
existing behavior intact for pairs where empirical spread is already wide
enough. Easy one-line change in `total_effect_priors._fit_prior`.

### 2. `exposed_total = 4,555 < 5,000` stop condition

Only 91% of target. Almost entirely driven by the two zero-exposed pairs
above. With the mean-scaled floor fix (change 1), the two pairs should
produce some exposure and push `exposed_total` above 5,000.

### 3. Cohort layer is architecturally wired but empirically silent

In the synthetic data, cohorts differ only in adherence/compliance/logging,
not in causal parameters — so per-cohort means match `__all__` means within
~1%. The James-Stein blend fires (λ ≥ 0.76 for all three cohorts) but
doesn't actually shift the posterior. This is correct behavior given the
synthetic generator; the blend will do real work when applied to real data
with heterogeneous cohorts.

### 4. Nearest-neighbor matching (`k=20`) is not currently exercised

`cohorts.find_similar_within_cohort` exists (carried over from v1) but
`export_portal_bayesian.py` v2 uses the full-cohort empirical prior only.
Adding NN refinement would let us condition on 8-feature similarity inside
each cohort. Low priority until cohorts actually matter.

### 5. Direction-conflict rate 16.2%

Reasonable given wide priors and short observation windows. Highest on
`bedtime → deep_sleep` (the bb sign in the engine is +0.5 min/hr later
bedtime; a quarter of users' OLS slopes disagree, which is
physiologically plausible). The 0.5× gate discount on conflicting pairs
correctly prevents them from crossing the `recommended` bar.

---

## Files in this run

Code:
- `backend/serif_scm/cohorts.py` (extended with `get_cohort_members`)
- `backend/serif_scm/total_effect_priors.py` (new)
- `backend/serif_scm/user_observations.py` (new)
- `backend/serif_scm/conjugate_update.py` (new)
- `backend/serif_scm/export_portal_bayesian.py` (rewritten)
- `backend/serif_scm/dose_multiplier.py` (unchanged)

Tests:
- `backend/serif_scm/tests/test_total_effect_bayes.py` — 20/20 pass

Artifacts:
- `backend/output/total_effect_priors.json` — 28 priors (4 cohorts × 7 pairs)
- `backend/output/user_observations.json` — 1,188 users × 7 pairs
- `backend/output/portal_bayesian/participant_*.json` — 1,188 files
- `backend/output/portal_bayesian/manifest.json`
- `backend/output/bayesian_diagnostic_v2.md` (this file)

Production portal (`backend/output/portal/`) **untouched**.

---

## Next step — recommended

Apply calibration fix 1 (mean-scaled floor) to `total_effect_priors.py`
and re-run. Expected result:

- `active_energy → deep_sleep` and `sleep_duration → hrv_daily` start
  exposing 30-60% of users
- `exposed_total` crosses 5,000
- No other edges meaningfully affected (their SDs already dominate
  `frac · |μ|` for reasonable `frac`)

If Sam wants, I can implement as a one-line change behind a flag so the
current "engine-confidence-only" priors are still producible for
comparison.
