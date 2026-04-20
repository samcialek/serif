# Bayesian Gating Path — Diagnostic Report

**Generated:** 2026-04-17
**Pipeline:** `export_portal_bayesian` (diagnostic mode — not overwriting production `output/portal/`)
**Engine version:** `v3-bayes-diagnostic`
**Output location:** `backend/output/portal_bayesian/` (1,188 JSON files + manifest)

## TL;DR

Full 1,188-participant run completes in 6.4s. Two stop conditions triggered:
  - **exposed_total = 1,188 < 5,000** (threshold)
  - **80.0% of dose multipliers at 0.5 floor**

Root cause is identifiable and well-isolated: the population-prior variance
proxy `|bb|/sqrt(eff_n)` (with a floor at `sd=0.05`) produces priors whose
absolute scale is decoupled from each edge's natural slope magnitude, so user
OLS observations either completely dominate (when |bb| is tiny, e.g. `steps ->
sleep_efficiency`) or are completely dominated (when |bb| is in natural
wearable units, e.g. `bedtime -> sleep_quality`).

**Recommendation:** do not ship this path as-is. Three concrete calibration
options listed at the end of this report; needs your direction before I
proceed further.

---

## Pipeline summary

**Pop -> cohort -> user chain (per edge, per participant):**

1. Population prior (all edges): Normal(bb_pop, 4·bb_ci_width²), floored
   at sd=0.05. Literature edges (4): Normal(bb, (2·|bb|)²).
2. Cohort prior from `k=20` Mahalanobis-NN cohort-mates on 8 baseline features
   (age, is_female, baseline ferritin/testosterone/HRV/sleep/training/hsCRP).
3. James-Stein blend: λ = n_cohort / (n_cohort + 75). For all three synthetic
   cohorts (delhi=534, abu_dhabi=416, remote=238) λ ≥ 0.76, so the blend is
   cohort-dominated in every case.
4. Normal-Normal conjugate update with per-user OLS slope on daily data.

**Supported wearable-target edges (5):**

| Action            | Outcome            | Source column  | n (users fit) |
|-------------------|--------------------|----------------|---------------|
| `bedtime`         | `sleep_quality`    | bedtime_hr     | 1,188         |
| `bedtime`         | `deep_sleep`       | bedtime_hr     | 1,188         |
| `sleep_duration`  | `hrv_daily`        | sleep_hrs      | 1,188         |
| `steps`           | `sleep_efficiency` | steps          | 1,188         |
| `running_volume`  | `hrv_daily`        | run_km         | 1,188         |

The remaining 54 population priors are excluded because either (a) target is
a biomarker (day-1 + day-100 draws only — slopes not identifiable) or (b)
source is a derived node (`acwr`, `sleep_debt_14d`, `daily_trimp`,
`active_energy_kcal`, `travel_load`) that is not a raw column in the daily
CSVs. Expanding to derived sources is tractable but not in this spec's
scope.

---

## Headline tier distribution

| Tier          | Count | % of 5,940 rows |
|---------------|-------|-----------------|
| recommended   | 1,188 | 20.0%           |
| possible      |     0 |  0.0%           |
| not_exposed   | 4,752 | 80.0%           |

All 1,188 "recommended" rows are `steps -> sleep_efficiency`. The other
four edges contribute zero exposed rows between them.

## Per-cohort

| Cohort     | Rows  | rec  | pos | c_mean | mult_mean | mult_at_floor | conflict_rate |
|------------|-------|------|-----|--------|-----------|---------------|---------------|
| delhi      | 2,670 |  534 |  0  | 0.200  | 0.700     | 80.0%         | 7.4%          |
| abu_dhabi  | 2,080 |  416 |  0  | 0.200  | 0.700     | 80.0%         | 5.9%          |
| remote     | 1,190 |  238 |  0  | 0.200  | 0.700     | 80.0%         | 9.7%          |

Remarkably flat across cohorts — n_cohort ≥ 238 for all, and the James-Stein
λ saturates near 1, so cohort-level differences don't propagate much further
than the slope means themselves.

## Per-edge

| Edge                         | c_mean | c_p90 | mult_mean | conflict_rate | Exposed |
|------------------------------|--------|-------|-----------|---------------|---------|
| `bedtime -> sleep_quality`   | 0.000  | 0.000 | 0.500     |  9.8%         |    0    |
| `bedtime -> deep_sleep`      | 0.000  | 0.000 | 0.500     | 26.9%         |    0    |
| `sleep_duration -> hrv_daily`| 0.000  | 0.000 | 0.500     |  0.0%         |    0    |
| `steps -> sleep_efficiency`  | 1.000  | 1.000 | 1.500     |  0.0%         | 1,188   |
| `running_volume -> hrv_daily`| 0.000  | 0.000 | 0.500     |  0.0%         |    0    |

The bimodality is total: every edge is either 100% at contraction ≈ 1 or 100%
at contraction ≈ 0. There is nothing in the `possible` band (0.3 ≤ score <
0.7).

## Posterior-source attribution

All 5,940 rows resolve to `source="pop+user"`. The cohort layer is firing but
its contribution to `var_blend` is numerically indistinguishable from the
(already tiny) `var_pop` — the precision-weighted blend converges to the
tighter of the two priors, which here is always var_pop (at its floor).

---

## Root cause — why the bimodality

The population-prior variance is computed as

    var_pop = max(4 · bb_ci_width²,  0.05²)
    where  bb_ci_width := |bb| / sqrt(max(eff_n, 2))

For every fitted wearable-target edge with eff_n ≥ 378, the proxy width is
tiny (≤ 0.0015), so the floor at 0.05² = 0.0025 kicks in. Every edge
receives the same **absolute** prior SD = 0.05, independent of whether the
slope is expressed in units like ng/dL/hr (|bb| ~ 15) or %/step (|bb| ~
7·10⁻⁷).

The user's OLS SE, in contrast, is computed correctly in the edge's native
units:

| Edge                         | pop SD | user SE (median) | Ratio            |
|------------------------------|--------|------------------|------------------|
| `bedtime -> sleep_quality`   | 0.050  | 0.43             | user 8.6× wider  |
| `bedtime -> deep_sleep`      | 0.050  | 0.71             | user 14× wider   |
| `sleep_duration -> hrv_daily`| 0.050  | 0.70             | user 14× wider   |
| `running_volume -> hrv_daily`| 0.050  | 0.26             | user 5.3× wider  |
| `steps -> sleep_efficiency`  | 0.050  | 0.0001           | user 500× tighter|

Precision-weighted updates therefore:
- Ignore the user when user SE >> pop SD  (contraction ≈ 0)
- Fully trust the user when user SE << pop SD  (contraction ≈ 1)

The first 4 edges fail the first way; the 5th fails the second way. The 5th
edge's "recommendation" is also misleading on its own merits: the slope mean
is ~7·10⁻⁷ %/step — a precisely-estimated but practically negligible effect.

---

## Direction-conflict observations

Whenever cohort info was loaded, we tracked the number of rows where the
user's posterior slope has the opposite sign as the population prior:

- `bedtime -> deep_sleep`: 26.9% conflict rate. bb_pop is +0.5 min/hr (later
  bedtime → more deep sleep, counterintuitive — probably captures that a
  narrower bedtime distribution correlates with better-regulated sleep
  overall). A quarter of users' OLS slopes disagree, which is plausible for
  individuals whose deep sleep is actually harmed by late bedtimes.
- `bedtime -> sleep_quality`: 9.8% conflict. Same bb_pop sign issue.
- `steps -> sleep_efficiency` and `running_volume -> hrv_daily`: 0% conflict,
  because the population bb magnitude is close to zero and our ε=1e-6 sign
  band swallows most disagreements.

Direction conflicts would matter more if priors were wider (since then user
data could actually push the posterior across zero).

---

## Validation tests — status

Unit-level smoke tests passed for all core modules (run inline during
development):
- `update_normal_normal`: N(0,1) + y=2.0 (sig=0.5) -> N(1.6, 0.2) ✓
- `posterior_contraction(1.0, 0.2)` = 0.8 ✓
- `james_stein_blend` λ-curve matches spec (heavy-pop at n=50 (λ=0.40),
  balanced at n=100 (λ=0.57), cohort-dominated at n≥200) ✓
- Direction-conflict guard collapses multiplier to 0.5 floor ✓
- Near-zero magnitudes don't trigger false conflicts ✓
- Cohort-mate selection via Mahalanobis NN excludes self, returns k=20 ✓
- Per-user OLS slope: 1,188 users × 5 edges fit in 0.5s, all slopes finite ✓

End-to-end tests (what the above reveals): the math is correct; the prior
*calibration* is the failure mode.

---

## Three calibration options (pick one before I proceed)

Listed in order of how invasive they are.

### Option 1 — Relative variance floor (smallest change)

Replace the absolute floor with one that scales with `|bb|`:

```python
var_pop = max(4 · bb_ci_width², (bb_sd_floor_frac · |bb|)²)
```

with `bb_sd_floor_frac` around 0.5 (prior SD never smaller than half the
slope magnitude). Keeps the pop prior sensibly wide for edges with natural
scale >> 0.05 but tight for edges where that scale is tiny. Quick to test.

### Option 2 — Switch to standardized slopes

Fit OLS on z-scored source and target so every edge has slope magnitudes in
the same units. `|bb|/sqrt(eff_n)` becomes a meaningful SE proxy. Users'
observations would also be z-scored. Larger refactor but produces a unit-
free Bayesian layer.

### Option 3 — Fetch real `bb_ci` from the fitter

The original fit probably computed slope CIs — they just weren't carried
into `edgeSummaryRaw.json`. Extending the fitter's export to include `bb_ci`
/ `ba_ci` gives honest prior widths and removes the need for any proxy.
Biggest effort; cleanest long-term answer.

Until one of these is applied, I don't think the Bayesian path produces
interpretable recommendations beyond `steps -> sleep_efficiency` (which is
itself a false positive in practical terms). The math, cohort matching, and
conjugate updates are all working as designed — the limitation is the
population prior's variance scale.

---

## Files in this run

Code:
- `backend/serif_scm/cohorts.py`
- `backend/serif_scm/population_priors.py`
- `backend/serif_scm/conjugate_priors.py`
- `backend/serif_scm/dose_multiplier.py`
- `backend/serif_scm/user_slopes.py`
- `backend/serif_scm/export_portal_bayesian.py`

Artifacts:
- `backend/output/population_priors.json`            (59 edges)
- `backend/output/portal_bayesian/participant_*.json` (1,188 files)
- `backend/output/portal_bayesian/manifest.json`
- `backend/output/bayesian_diagnostic.md`            (this file)

Production portal (`backend/output/portal/`) is untouched.
