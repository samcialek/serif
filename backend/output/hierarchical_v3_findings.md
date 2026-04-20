# Hierarchical v3 — root cause found, Sam decision needed

**Date:** 2026-04-19  
**Status:** Stopped per brief after 3rd attempt. Fix identified but not authorized.

## TL;DR

The `sleep_duration → hrv_daily` edge cannot converge because **`sigma_bb_individual` prior is 29× too tight**. Chains are mode-jumping, not label-swapping. Tightening cohort priors doesn't help because the cohort prior is already the right scale.

## Attempts

| Attempt | Change | Pop R-hat | Cohort R-hat | Verdict |
|---------|--------|-----------|--------------|---------|
| 1a | 4-chain `init_to_sample` random init, priors unchanged | 2.71 | 28.3 | Chains ±30 apart |
| 1b (skipped) | Sorted-order cohort constraint | — | — | Diagnosis: wouldn't help mode-jumping |
| 1c | `sigma_bb_cohort ~ HalfNormal(0.15)` instead of 0.5 | 1.58 | 25.7 | Same pathology |

## Per-chain `bb_cohort` means — sleep_duration|hrv_daily

### 1a (wide cohort prior)
```
abu_dhabi  [-14.2, -12.5, -11.3, +31.4]
delhi      [+18.8, -23.2, +38.6, +23.2]
remote     [+11.8, +10.8, -27.0, -14.7]
```

### 1c (tight cohort prior, HalfNormal(0.15))
```
abu_dhabi  [-4.7, -9.5, +24.2, +23.6]
delhi      [+23.8, -21.0, -14.8, -17.0]
remote     [+9.0, -20.4, -12.8, +9.3]
```

The cohort-level posterior spread dropped slightly (6.69 vs 8.37) but chains still disagree by ±25.

## Root cause

| Level | Current prior | Prior mean | Empirical SD | Ratio |
|-------|---------------|-----------:|-------------:|------:|
| cohort | `HalfNormal(0.15)` | 0.12 | 0.117 | **1.0×** (correct) |
| individual | `HalfNormal(0.5 × pop_bb_scale)` = `HalfNormal(0.025)` | 0.02 | 0.576 | **29× too tight** |

Empirical SD measured via per-participant OLS slope of `hrv_daily ~ sleep_duration`, within-cohort SD of those slopes. Sleep→HRV has genuine individual heterogeneity — some participants respond 1 ms/hr, others -0.5 ms/hr.

With `sigma_bb_individual` capped near 0.025, the sampler cannot place the empirical 0.576 ms/hr individual variation at the individual level. It spills into `sigma_bb_cohort`, which then becomes 10-100× wider than its prior allows — creating the high-sigma-cohort mode that collides with the tight-sigma mode the data also supports.

`running_volume|ferritin` doesn't hit this pathology because it has only 90 rows (one biomarker per participant) — individual slopes aren't identified, so the prior binds harmlessly. Wearable edges with 7.9k panel rows have much stronger individual-level signal.

## Proposed fix (Sam decision)

Widen `sigma_bb_individual` to match data scale:

```python
# Current
sigma_bb_individual = numpyro.sample(
    "sigma_bb_individual", dist.HalfNormal(0.5 * pop_bb_scale)
)
# Proposed
sigma_bb_individual = numpyro.sample(
    "sigma_bb_individual", dist.HalfNormal(0.75)  # ~1.3× empirical 0.576
)
```

Same for `sigma_ba_individual`. `sigma_theta_individual` is likely already fine (cohort_theta spread is well-identified).

This is a **semantic change** — we're saying individuals can have bb in a ±0.75 range around their cohort mean. The old prior said ±0.025 range. If Sam believes individual heterogeneity is real (reasonable for sleep→HRV), widen it; if cohort-level homogeneity is assumed, leave it and drop the hierarchical individual level entirely.

## Files

- `output/hierarchical_v3_task1a.json` — wide-prior fit (failed)
- `output/hierarchical_v3_task1a.log` — log with per-chain diagnostic
- `output/hierarchical_v3_task1c.json` — tight-cohort-prior fit (failed, same pathology)
- `output/hierarchical_v3_task1c.log` — log with per-chain diagnostic
- `serif_scm/hierarchical_model.py:152-163` — current prior definitions
