# DAG Extension Candidates

**Status:** 2026-04-22, Layer 0 weak-default priors now cover the full (action,
outcome) Cartesian grid. Layer 0 is a safety net, not a destination — these
pairs carry `provenance="weak_default"` with mean=0 and σ = 0.25 × pop_SD
until a real structural edge (or literature prior) replaces them.

This document flags structural gaps in `edgeSummaryRaw.json` worth wiring
into the DAG with a genuine mechanism. Each candidate explains why the gap
matters and what edge(s) would close it.

## Summary counts (grid = 13 actions × 43 outcomes = 559 pairs)

| Layer | Count | % of grid |
|-------|-------|-----------|
| Synthetic fit (has DAG path) | 91 | 16.3% |
| Weak default (Layer 0) | 468 | 83.7% |

Of the 91 synthetic fits, 7 are sleep/HR-path wearables with high coverage
(`resting_hr` hits 11 of 13 actions). Everything biomarker-side is thin.

## Tier 1 — orphan outcomes (0 actions fit)

Six outcomes have no DAG path from any action. Every recommendation
touching these is Layer 0.

| Outcome | Why it matters | Edges needed |
|---------|---------------|--------------|
| `hba1c` | Headline glycemic outcome — T2DM risk, clinical dashboard lives here. Users expect a personal HbA1c trajectory. | `steps → hba1c`, `zone2_volume → hba1c`, `dietary_energy → hba1c`. Mechanism: glucose integration over ~90d RBC window; derive from glucose edges if glucose_smoothed already exists. |
| `b12` | Meat-heavy diets affect plasma B12; vegan populations run low. Directly actionable. | `dietary_protein → b12` (animal-protein proxy). Plausible cohort-shared confounder is vegetarian status. |
| `folate` | Green-leafy intake drives folate. Interacts with homocysteine (which is in the DAG). | `dietary_protein → folate` is weak; `dietary_energy → folate` is also weak. The honest edge is leafy-veg intake, which we don't measure. Flag as **unsolvable without a new dietary signal.** |
| `omega3_index` | Diet-driven; fish oil / marine-protein pattern. | `dietary_protein → omega3_index` as a crude proxy, or wait until a dietary pattern signal exists. **Unsolvable without a new dietary signal.** |
| `albumin` | Protein status / hepatic synthesis / hydration. Slow-moving, rarely the binding outcome. | `dietary_protein → albumin` is the canonical mechanism. Low priority — albumin rarely drives recommendations. |
| `creatinine` | Muscle mass, kidney filtration, hydration. Elevated by training load. | `training_load → creatinine`, `training_volume → creatinine`. Mechanism: muscle-protein turnover; overlap with `body_mass_kg`. |

## Tier 2 — sparse biomarker panels

Lipid panel: 5 outcomes (apob, ldl, non_hdl_cholesterol, total_cholesterol,
triglycerides), only 1 action fit each. `hdl` gets 3. This is a failure of
the structural DAG, not the data — lifestyle actions have well-documented
lipid effects.

| Action group | Outcome group | Edges worth adding |
|--------------|---------------|--------------------|
| Aerobic volume (`steps`, `zone2_volume`, `running_volume`) | Lipids (`hdl`, `triglycerides`, `apob`) | Meta-analysis literature is strong. Start with `zone2_volume → hdl`, `zone2_volume → triglycerides`. |
| `dietary_energy` (caloric deficit) | `triglycerides`, `ldl`, `body_fat_pct` | Caloric restriction moves TG fastest (30-35d horizon). `dietary_energy → triglycerides` is the highest-yield single edge. |
| `dietary_protein` | `ldl`, `apob` (via satiety/substitution) | Weaker mechanism; saturated-fat displacement effect. Lower priority. |

Hormone panel: `dhea_s`, `estradiol`, `shbg` each fit by 1 action only.
`testosterone` and `cortisol` have 4. The sleep/training → cortisol axis
is well-covered; the sex-hormone axis is not.

| Action | Outcome | Rationale |
|--------|---------|-----------|
| `dietary_energy` | `testosterone` | Energy availability drives the HPG axis (Loucks, RED-S literature). |
| `training_volume` | `shbg` | Endurance volume raises SHBG. Documented in male runners. |
| `dietary_protein` | `shbg` | Already has a (currently `wrong_doi`) literature prior; YAML entry is flagged for verification. |

Iron / hematology: `ferritin`, `iron_total`, `hemoglobin`, `rbc`, `mcv`,
`rdw` — each 1 action fit. The iron pathway is one of the few places where
Serif has *real* causal structure (ferritin → vo2_peak, confounded by
latent `LPL`/iron). But only `running_volume` connects in.

| Action | Outcome | Rationale |
|--------|---------|-----------|
| `dietary_protein` | `ferritin`, `iron_total`, `hemoglobin` | Heme-iron bioavailability. Canonical nutritional epidemiology. |
| `training_load` | `ferritin` | Inflammation-driven hepcidin → iron sequestration. Already a known mechanism in the cohort model. |

## Tier 3 — underpowered actions

Two dietary actions each reach 1 outcome. That's the single biggest gap
in the DAG.

| Action | Current coverage | Target coverage |
|--------|------------------|-----------------|
| `dietary_protein` | 1 outcome (`testosterone` via YAML-wrong_doi) | 6-8 outcomes: lipids, SHBG, ferritin, body comp |
| `dietary_energy` | 1 outcome | 8-10 outcomes: lipids, glucose, HbA1c, body comp, hormones, hscrp |

The CSV generator doesn't persist `protein_g` or `dietary_kcal` columns
(see `user_observations.py:108-113`), so user OLS for these actions falls
back to zeros. Wiring DAG edges here is gated on **first fixing the
synthetic generator to persist dietary columns**.

## What Layer 0 doesn't fix

Layer 0 runs the Bayesian pipeline for every pair and lets user OLS update
the posterior. But for pairs with no DAG path, the user OLS has no causal
adjustment set — it's an unadjusted confounded slope. A user with high
zone2 and low triglycerides will see a recommendation for more zone2 that
reflects the population correlation, not a causal effect.

This is acceptable for ranking (we surface "your data shows this pattern")
but misleading as a causal claim. Two mitigations, not yet applied:

1. **UI badge**: frontend could render `prior_provenance=weak_default`
   recommendations with a "based on your data pattern, mechanism uncertain"
   caveat, separate from the literature-backed and structural-fit badges.
2. **Prior widening for Bucket C**: we could raise `SIGMA_WEAK_FRAC` from
   0.25 to e.g. 1.0 for pairs with no DAG path, making Layer 0 truly
   uninformative and forcing the user OLS to stand on its own. This pushes
   many current "possible" Layer-0 recommendations to "not_exposed" until
   the user has strong evidence.

Which mitigation (or both) makes sense is a UX call, not a structural fix.
The structural fix is to add the edges above.
