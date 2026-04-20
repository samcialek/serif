# Hierarchical Scale Test v2 — Findings (300 ppts, widened cohort priors)

**Date:** 2026-04-19
**Config:** 2 chains × (2000 warmup + 1000 samples), target_accept=0.95, non-centered, seed=0
**Change vs v1:** Cohort priors widened from scale-relative `HalfNormal(0.5 × pop_scale)` to **absolute** `HalfNormal(0.5)` for bb/ba and `HalfNormal(2.0 × pop_theta_scale)` for theta. Target accept raised 0.9 → 0.95, warmup doubled 1000 → 2000.
**Edges tested:** `sleep_duration → hrv_daily` (wearable), `running_volume → ferritin` (biomarker)

## Verdict

**Widening the prior made the wearable edge substantially worse.** The prior was not the binding constraint; the problem is **chain-level multimodality** on cohort location. Giving chains more room let them spread farther apart rather than converge.

Do NOT ship the v2 prior into the 44-edge build. **Next try must attack identifiability directly, not the prior scale.**

## Stop-condition scoreboard

| Condition | Wearable v1 | Wearable v2 | Biomarker v2 |
|---|---|---|---|
| Wall < 2 h / edge | PASS (21 min) | PASS (58 min) | PASS (25 min) |
| Divergences ≤ 10 | FAIL (12) | **FAIL (17, worse)** | PASS (0) |
| Max R-hat ≤ 1.05 all levels | FAIL (pop 1.85, cohort 3.60, indiv 5.00) | **FAIL (pop 1.59, cohort 51.09, indiv 51.22 — catastrophic)** | PASS (≤1.002) |
| sigma_individual p05 ≥ 0.1% of p50 | PASS (9.5% ratio) | PASS (bb ratio 12.2%) | PASS |

Pop-level R-hat modestly improved (1.85 → 1.59) because the worst param flipped from `sigma_bb_cohort` to `sigma_theta_individual`. Cohort and individual levels got catastrophically worse.

## The diagnostic signature of multimodality

**Cohort `bb` posterior means (v2 wearable):**

| cohort     | bb_mean | ba_mean |
|------------|--------:|--------:|
| abu_dhabi  |  +19.16 |  −17.80 |
| delhi      |   +6.57 |   +5.28 |
| remote     |  −21.99 |  +22.84 |

Spread across cohorts: **17.21** (up from 1.75 in v1). With only 2 chains, these numbers are averages over chain×sample. The fact that they balance (+19 − 22 ≈ −3, roughly centered around the pop mean +0.41) is the classic signature of chains occupying different modes with opposing signs — **label-swapping**, not a data-driven spread of 17 units.

Supporting evidence:
- Individual `bb` R-hat 51.2, min ESS 21 — the individual level is inheriting the cohort-mode instability (each participant's posterior bounces between "my cohort's bb is +19" and "my cohort's bb is −22" depending on the chain).
- Pop-level `mu_bb_pop = +0.41` *is* clean and matches v1's pop mean. The identifiability failure is **not at the population level**; it's in the cohort partition.
- Shrinkage z-score for individuals stays small (`mean_abs = 0.064`, `max_abs = 0.35`), which means individuals aren't pulling hard against their cohort — they're moving with it. When the cohort swaps, everyone swaps.

This isn't a geometry problem NUTS can solve with more warmup. It's structural: with only 3 cohorts × ~100 participants × ~88 rows/ppt, the data does not pin down cohort-level bb/ba strongly enough to rule out sign flips.

## Biomarker edge: still clean

- 1,480 s (25 min), 0 divergences, R-hat 1.001–1.002, ESS 938–1,186 across all levels.
- Cohort spread `bb = 0.56` looks real (no sign flips; delhi +0.03, abu_dhabi +0.56, remote +1.40 — monotonic ordering).
- Sparse design (300 rows, 1/ppt) carries enough information with the tight priors to avoid multimodality.

Biomarker edges are ready for the full build on current priors. **The blocker is only the wearable class.**

## Why "widen the prior" wasn't the right fix

v1 findings recommended widening cohort prior first because the 0.5×pop scaling left `sigma_bb_cohort ~ HalfNormal(0.025)` — clearly fighting a data-driven spread of 1.75. That diagnosis was correct *for v1's mode*. But widening to `HalfNormal(0.5)` removed the regularization that was previously hiding (or damping) the mode-swapping. Both chains found their own mode; the absolute prior accommodated both.

Remediation #4 in the v1 findings ("Check for mode-swapping directly") was the right instinct — it just wasn't the cheapest test, so we did #1 first. v2's result is the diagnostic for #4.

## Recommended remediation (ordered, cheapest first)

1. **Run 4+ chains with random inits and inspect per-chain cohort means.**
   If 2 chains reliably go +19 and 2 chains reliably go −22, that's frozen
   label-swapping — the only fix is to break the symmetry in the model.
   Cost: double the runtime.

2. **Order-constrain cohort locations.** Require `bb_cohort[0] ≤ bb_cohort[1] ≤ bb_cohort[2]` via a sorted-transform parameterization. This kills label-swapping by construction. Some information loss if the true ordering disagrees with intuition, but we have no ordering to defend — cohorts a/b/c are arbitrary labels.

3. **Pool cohort-level effects to pop directly** (drop the cohort level entirely for bb/ba, keep it only for theta). With 3 cohorts and weak between-cohort identification, the cohort layer may be adding more noise than signal for wearable edges. Biomarker would keep its current structure (which is working).

4. **Reduce individual-level free parameters.** v1 remediation #3. Individual theta at R-hat 51 is over-parameterized. Pool theta to cohort and let individuals deviate only on bb/ba.

5. **Sensitivity test: refit the biomarker edge with the v2 widened priors.** It converged with the original tight priors — we need to confirm the widening didn't silently break biomarker convergence too (the v2 biomarker log shows it's fine, but running both on the same prior config is the cleaner comparison).

Try (1) first. It's a one-flag change and it answers whether this is label-swapping or a different multimodal structure. If (1) confirms swapping, jump to (2).

## What v2 tells us about the full 44-edge build

- Biomarker edges (37 of 44) are low-risk. Runtime per edge ~25 min at this scale, but the design is so sparse that memory and mixing are both comfortable.
- Wearable edges (7 of 44) are blocked. Until we fix cohort identifiability on the sleep_duration → hrv_daily pilot, the full build will either fail convergence checks or silently produce garbage cohort-level parameters.
- Total runtime extrapolation is moot until the wearable class is green. At 58 min/wearable × 7 + 25 min/biomarker × 37 = 7 + 15 = **22 hours** at current config, which is workable if mixing is clean. Not workable if we need 4+ chains × sensitivity runs for every wearable edge.

## Files

- `backend/output/hierarchical_scale_test_v2.log` — runtime log (1:22:29 wall)
- `backend/output/hierarchical_scale_test_v2.json` — per-edge diagnostics
- `backend/serif_scm/hierarchical_model.py` — has the v2 prior widening in place; will need to revert or further modify for v3
