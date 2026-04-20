# Hierarchical Scale Test — Findings (300 ppts)

**Date:** 2026-04-19
**Config:** 2 chains × (1000 warmup + 1000 samples), target_accept=0.9, non-centered, seed=0
**Edges tested:** sleep_duration → hrv_daily (wearable), running_volume → ferritin (biomarker)

## Verdict

**Do NOT commit to the full 44-edge build.** The wearable edge broke catastrophically at 300-ppt scale. The biomarker edge converged cleanly. The sampler geometry, not the runtime, is the blocker.

## Stop-condition scoreboard

| Condition | Wearable | Biomarker |
|---|---|---|
| Wall < 2 h / edge | PASS (1267 s = 21 min) | PASS (131 s = 2 min) |
| Divergences ≤ 10 | **FAIL (12)** | PASS (1) |
| Max R-hat ≤ 1.05 (all levels) | **FAIL (pop 1.85, cohort 3.60, individual 5.00)** | PASS (1.000–1.002) |
| sigma_individual p05 ≥ 0.1% of p50 | PASS (bb ratio ~9.5%) | PASS |

Two of four conditions failed, both on the wearable edge.

## Wearable edge: what broke

- **n_rows** = 26,431 (vs. 300 for biomarker)
- **min ESS 22** on individual level (want 400+)
- **Cohort spread bb** jumped **0.0003 → 1.75** going from 30 → 300 ppts. Chains are finding different modes for cohort locations — classic label-swapping / multimodal posterior.
- **sigma_bb_cohort** is the worst pop-level parameter (R-hat 1.85). Its HalfNormal prior = 0.5 × pop_bb_scale = HalfNormal(0.025), probably too tight relative to the data-driven between-cohort variance.
- **individual theta** diverged most (R-hat 5.00). Too many degrees of freedom per participant given ~88 rows/ppt.

Runtime of 1267 s itself is fine. Problem is the posterior, not the clock.

## Biomarker edge: clean

- 131 s, 1 divergence, R-hat 1.000–1.002, ESS 2000 (i.e. ideal mixing with the 2000 draws).
- Sparse design (1 row/ppt) plus tight prior from baseline means the hierarchy collapses gracefully.

## Memory & runtime extrapolation

- Peak RSS: **1.84 GB** (single edge, single process)
- Total wall for the 2 edges: 23.3 min
- Avg per edge: 699 s → naive 40-edge extrapolation: **466 min ≈ 7.8 h**

But the extrapolation is moot until the wearable geometry is fixed.

## Recommended remediation (ordered, cheapest first)

1. **Widen cohort-level sigma priors.** `sigma_bb_cohort ~ HalfNormal(0.025)` is fighting an actual between-cohort spread ~1.75. Bump the multiplier (currently 0.5) to 2.0–3.0, or make the prior HalfCauchy.
2. **Raise target_accept → 0.95**, warmup → 2000. Slows each sample ~2× but should kill divergences on a well-specified geometry.
3. **Pool theta at cohort level only.** Individual-level theta is over-parameterized given ~88 rows/ppt; let individuals deviate only on bb/ba.
4. **Check for mode-swapping** directly: inspect per-chain cohort_bb means. If chain 0 puts cohort_a at +18 and chain 1 puts cohort_a at –18, that's an identifiability failure, not a prior problem.

Try (1) first — it's a one-line change and the data is telling you the cohort variance is ~70× the prior.

## What this does NOT tell us

- Whether the full 44-edge build will memory-OOM when run in parallel (1.8 GB × N processes).
- Whether edges denser than 26 k rows (e.g., hrv_daily/rhr_daily pairs with years of data) behave worse.
- Whether fitting on real (non-synthetic) participant data reproduces these pathologies.
