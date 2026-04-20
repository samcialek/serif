# Confounding Audit — 8 Latent Confounders × 59 Fitted Edges

**Generated:** audit-only, no model changes.

**Sources:**
- `backend/output/population_priors.json` — 59 fitted edges (55 fitted + 4 literature)
- `memory/serif_confounding_structure.md` — latent → edge spec
- `src/data/dataValue/mechanismCatalog.ts` — `STRUCTURAL_EDGES`, `LATENT_NODES`
- `backend/output/portal_bayesian/` — 1189 participant files

## Wiring status of the 8 latents (post-Phase-3)

**TS DAG (`STRUCTURAL_EDGES`):** no latents wired as confounders. Some appear as mediators on causal paths (`zone2_volume → lipoprotein_lipase → triglycerides`) but none tagged `edgeType: 'confounds'`.

**NumPyro model (`serif_scm/model.py`):** Phase 2 wired 3 priority latents; Phase 3 added `insulin_sensitivity` on 2 edges. Three remaining latents (`reverse_cholesterol_transport`, `core_temperature`, `energy_expenditure`) were evaluated but not wired — see notes column. `fit_confounded_priors.py` jointly identifies `U_C`, `λ_C_action`, `λ_C_outcome`, `σ_C`, and edge slopes (`bb`, `ba`, `θ`) from cross-equation covariance across 1,188 participants.

| Latent | Spec'd edges | Wired in NumPyro | Wired in TS DAG | Notes |
|---|---:|---|---|---|
| lipoprotein_lipase | 5 | **partial** (3/5) | no | Phase 2 — all three `zone2→lipid` edges fitted; triglycerides attenuated ~60%. |
| reverse_cholesterol_transport | 3 | no | no | Phase 3 — **dropped from model**. Fit moved `zone2→apob` and `zone2→non_hdl_cholesterol` *away* from zero, with |λ_action|~3 vs |λ_outcome|<0.3 (over-parameterization). LPL alone is the functional confounder on zone2→lipid in this synthetic data. Spec retained for real-user reference. |
| core_temperature | 3 | no | no | Deferred — `workout_end_hr` not persisted in `lifestyle_app.csv` (generator keeps in memory only). `training_load` pairs carry no signal (|r|<0.02). Blocked on synthetic-data regen. |
| energy_expenditure | 4 | no | no | Phase 3 — `training_volume→body_fat_pct` dropped (17 divergences, near-zero slope). Other spec'd pairs are intentional-gaps: `steps→body_mass` renamed, `active_energy→testosterone` and `running→leptin` not in generator. |
| leptin | 3 | no | no | No fitted edges to contaminate — all three spec'd pairs (`body_fat_pct→*`, `dietary_energy→inflammation`) are biomarker-as-source or generator-gaps. |
| insulin_sensitivity | 4 | **partial** (2/4) | no | Phase 3 — wired on `zone2→TG` and `training→glucose`. `training→insulin` dropped (26 divergences, near-zero causal slope); `training→hba1c` absent from fit (no signal, r~-0.01). |
| sweat_iron_loss | 3 | **partial** (2/3) | no | Phase 2 — both spec'd edges fitted; bb attenuated ~30% on ferritin/iron_total. |
| gi_iron_loss | 3 | **yes** (3/3) | no | Phase 2 — all three spec'd edges fitted with clean convergence. |

## Bias-risk summary across 59 fitted edges

Risk is driven by the count of **unresolved** (unwired) latents touching each edge. Post-Phase-3 wiring: `sweat_iron_loss`, `gi_iron_loss`, `lipoprotein_lipase` on all their spec'd edges; `insulin_sensitivity` on 2 of 4 spec'd edges.

- **HIGH** (≥2 unresolved latents): **0** edges  *(pre-Phase-2: 4)*
- **MEDIUM** (1 unresolved latent): **6** edges  *(pre-Phase-2: 8)*
- **LOW** (0 unresolved): **53** edges  *(pre-Phase-2: 47)*

## HIGH-risk edges (≥2 unresolved latent confounders)

| source → target | bb | ba | effN | latent confounders |
|---|---:|---:|---:|---|

## MEDIUM-risk edges (1 unresolved latent)

| source → target | bb | ba | effN | unresolved latent |
|---|---:|---:|---:|---|
| training_volume → body_fat_pct | -0.000 | -0.001 | 20 | energy_expenditure |
| training_volume → insulin | -0.001 | -0.001 | 4 | insulin_sensitivity |
| workout_time → sleep_efficiency | -0.015 | -2.192 | 393 | core_temperature |
| zone2_volume → apob | -0.125 | -0.037 | 2 | reverse_cholesterol_transport |
| zone2_volume → hdl | +0.032 | +0.055 | 4 | reverse_cholesterol_transport |
| zone2_volume → non_hdl_cholesterol | -0.011 | -0.125 | 4 | reverse_cholesterol_transport |

## Full 59-edge table

| source → target | bb | ba | effN | n_latents | latents | wired? | risk |
|---|---:|---:|---:|---:|---|---|---|
| active_energy → deep_sleep | +0.005 | +0.008 | 378 | 0 | — | — | LOW |
| acwr → hscrp | -0.019 | +0.100 | 4 | 0 | — | — | LOW |
| acwr → nlr | -0.020 | +0.104 | 20 | 0 | — | — | LOW |
| acwr → resting_hr | -0.717 | +2.118 | 342 | 0 | — | — | LOW |
| acwr → wbc | +0.020 | -0.050 | 4 | 0 | — | — | LOW |
| bedtime → deep_sleep | +0.338 | -2.644 | 378 | 0 | — | — | LOW |
| bedtime → sleep_quality | +0.339 | -2.587 | 393 | 0 | — | — | LOW |
| dietary_energy → body_mass_kg | +0.000 | +0.002 | 20 | 0 | — | — | LOW |
| dietary_protein → body_fat_pct | +0.000 | -0.005 | 20 | 0 | — | — | LOW |
| ferritin → vo2_peak | +0.245 | +0.126 | 20 | 0 | — | — | LOW |
| homocysteine → hscrp | +0.004 | +0.020 | 4 | 0 | — | — | LOW |
| omega3_index → hscrp | -0.024 | -0.010 | 4 | 0 | — | — | LOW |
| running_volume → ferritin | -0.058 | -0.433 | 2 | 2 | sweat_iron_loss, gi_iron_loss | all wired: sweat_iron_loss, gi_iron_loss | LOW |
| running_volume → hemoglobin | +0.013 | -0.032 | 4 | 1 | gi_iron_loss | all wired: gi_iron_loss | LOW |
| running_volume → hrv_daily | +0.198 | +0.002 | 343 | 0 | — | — | LOW |
| running_volume → iron_total | -0.034 | -0.202 | 2 | 2 | sweat_iron_loss, gi_iron_loss | all wired: sweat_iron_loss, gi_iron_loss | LOW |
| running_volume → magnesium_rbc | -0.001 | -0.011 | 2 | 0 | — | — | LOW |
| running_volume → mcv | +0.009 | -0.067 | 4 | 0 | — | — | LOW |
| running_volume → rbc | -0.001 | -0.005 | 4 | 0 | — | — | LOW |
| running_volume → rdw | -0.001 | -0.002 | 4 | 0 | — | — | LOW |
| running_volume → zinc | -0.026 | -0.327 | 3 | 0 | — | — | LOW |
| sleep_debt → resting_hr | +0.046 | +0.187 | 393 | 0 | — | — | LOW |
| sleep_duration → cortisol | -1.000 | -0.200 | 2 | 0 | — | — | LOW |
| sleep_duration → glucose | -2.000 | -0.300 | 4 | 0 | — | — | LOW |
| sleep_duration → hrv_daily | +0.413 | +0.223 | 745 | 0 | — | — | LOW |
| sleep_duration → testosterone | +15.000 | +3.000 | 3 | 0 | — | — | LOW |
| sleep_duration → wbc | +0.030 | +0.050 | 4 | 0 | — | — | LOW |
| steps → body_mass_kg | -0.001 | -0.000 | 20 | 0 | — | — | LOW |
| steps → sleep_efficiency | +0.000 | -0.000 | 393 | 0 | — | — | LOW |
| training_consistency → vo2_peak | +11.285 | +1.024 | 20 | 0 | — | — | LOW |
| training_load → hrv_daily | +0.003 | -0.060 | 797 | 0 | — | — | LOW |
| training_load → resting_hr | +0.002 | +0.015 | 790 | 0 | — | — | LOW |
| training_volume → albumin | +0.000 | +0.000 | 4 | 0 | — | — | LOW |
| training_volume → alt | +0.001 | +0.004 | 4 | 0 | — | — | LOW |
| training_volume → ast | +0.000 | +0.008 | 4 | 0 | — | — | LOW |
| training_volume → body_fat_pct | -0.000 | -0.001 | 20 | 1 | energy_expenditure | none wired as confounder | MEDIUM |
| training_volume → cortisol | -0.002 | +0.008 | 2 | 0 | — | — | LOW |
| training_volume → creatinine | +0.000 | +0.000 | 4 | 0 | — | — | LOW |
| training_volume → dhea_s | +0.011 | -0.021 | 3 | 0 | — | — | LOW |
| training_volume → estradiol | +0.000 | -0.004 | 3 | 0 | — | — | LOW |
| training_volume → glucose | -0.004 | +0.004 | 4 | 1 | insulin_sensitivity | all wired: insulin_sensitivity | LOW |
| training_volume → homocysteine | -0.000 | -0.001 | 3 | 0 | — | — | LOW |
| training_volume → insulin | -0.001 | -0.001 | 4 | 1 | insulin_sensitivity | none wired as confounder | MEDIUM |
| training_volume → platelets | +0.004 | +0.021 | 4 | 0 | — | — | LOW |
| training_volume → shbg | +0.000 | +0.006 | 1 | 0 | — | — | LOW |
| training_volume → testosterone | +0.009 | -0.063 | 3 | 0 | — | — | LOW |
| training_volume → uric_acid | -0.000 | -0.001 | 2 | 0 | — | — | LOW |
| travel_load → deep_sleep | -1.946 | -4.962 | 378 | 0 | — | — | LOW |
| travel_load → hrv_daily | -0.200 | -2.340 | 794 | 0 | — | — | LOW |
| travel_load → nlr | +0.011 | +0.060 | 87 | 0 | — | — | LOW |
| travel_load → resting_hr | +0.213 | +1.088 | 788 | 0 | — | — | LOW |
| travel_load → sleep_efficiency | -1.491 | -8.631 | 393 | 0 | — | — | LOW |
| workout_time → sleep_efficiency | -0.015 | -2.192 | 393 | 1 | core_temperature | none wired as confounder | MEDIUM |
| zone2_volume → apob | -0.125 | -0.037 | 2 | 1 | reverse_cholesterol_transport | none wired as confounder | MEDIUM |
| zone2_volume → hdl | +0.032 | +0.055 | 4 | 2 | lipoprotein_lipase, reverse_cholesterol_transport | partial: lipoprotein_lipase wired; reverse_cholesterol_transport unresolved | MEDIUM |
| zone2_volume → ldl | -0.009 | -0.072 | 4 | 1 | lipoprotein_lipase | all wired: lipoprotein_lipase | LOW |
| zone2_volume → non_hdl_cholesterol | -0.011 | -0.125 | 4 | 1 | reverse_cholesterol_transport | none wired as confounder | MEDIUM |
| zone2_volume → total_cholesterol | -0.015 | -0.075 | 4 | 0 | — | — | LOW |
| zone2_volume → triglycerides | -0.005 | -0.138 | 4 | 2 | lipoprotein_lipase, insulin_sensitivity | all wired: lipoprotein_lipase, insulin_sensitivity | LOW |

## Phase 1 — Spec'd confounding pairs with NO fitted edge

Each missing pair classified against the synthetic dataset:
- **renamed**: fitted under a node-name alias
- **intentional**: generator routes the effect elsewhere, or source/target absent
- **gap**: both nodes exist; spec says mechanism should be present; generator produces r ≈ 0

| spec pair | latent(s) | classification | evidence |
|---|---|---|---|
| active_energy → testosterone | energy_expenditure | **gap** | r=+0.023 (n=1188); generator omits this pathway |
| body_fat_pct → cortisol | leptin | **intentional** | biomarker-as-source — fitter only considers action→biomarker |
| body_fat_pct → testosterone | leptin | **intentional** | biomarker-as-source — fitter only considers action→biomarker |
| dietary_energy → inflammation | leptin | **gap** | aliased to `hscrp`; r=-0.008; generator omits |
| running_volume → leptin | energy_expenditure | **intentional** | `leptin` not in `blood_draws.csv`; not simulated |
| steps → body_mass | energy_expenditure | **renamed** | fitted as `steps → body_mass_kg`; populator strips `_kg` suffix |
| training_load → deep_sleep | core_temperature | **gap** | r=+0.004; core-temp-disrupts-sleep not wired in generator |
| training_load → sleep_quality | core_temperature | **gap** | r=-0.014; same as deep_sleep |
| training_volume → hba1c | insulin_sensitivity | **gap** | `hba1c` exists (n=2376); r=-0.010; generator omits |
| training_volume → hdl | lipoprotein_lipase | **intentional** | generator routes HDL through `zone2_volume` only |
| training_volume → iron_total | sweat_iron_loss | **intentional** | iron loss routed through `running_volume` only |
| training_volume → triglycerides | lipoprotein_lipase | **intentional** | generator routes TG through `zone2_volume` only |

**Implication:** the `gap` pairs carry no signal in the current synthetic data, so they transmit no confounding bias regardless of wiring. Same for `intentional` pairs. No additional edges need adding before completing Phase 2.

## Portal-bayesian recommendation tiers by bias-risk class

Counts summed across all participant files. Each cell is (edge, participant) pairs.

| risk class | recommended | possible | not_exposed | total |
|---|---:|---:|---:|---:|
| HIGH | 0 | 0 | 0 | 0 |
| MEDIUM | 0 | 0 | 0 | 0 |
| LOW | 1333 | 3222 | 3761 | 8316 |

## Contaminated edges currently exposed in the portal

No HIGH or MEDIUM risk edges currently appear at `recommended` or `possible` tier in the portal export.

## Phase 3 — slope shifts after wiring confounders (all 7 stable edges)

Posterior means from `fit_confounded_priors.py` (NUTS, 500 warmup + 500 samples, 1188 participants). Priors are sourced from `population_priors_v1_unconfounded.json` so this fit is a fresh refit against original unadjusted priors, not compounded on Phase 2. Shifts are (posterior - prior). Shifts TOWARD zero indicate the unadjusted fit was biased by participant-level confounding.

| edge | prior bb | post bb | Δbb | prior ba | post ba | Δba | divergences |
|---|---:|---:|---:|---:|---:|---:|---:|
| running_volume → ferritin | -0.0830 | -0.0582 | +0.0248 | -0.4470 | -0.4325 | +0.0145 | 0 |
| running_volume → iron_total | -0.0500 | -0.0344 | +0.0156 | -0.2030 | -0.2017 | +0.0013 | 2 |
| running_volume → hemoglobin | -0.0030 | +0.0130 | +0.0160 | -0.0350 | -0.0323 | +0.0027 | 0 |
| zone2_volume → triglycerides | -0.0130 | -0.0053 | +0.0077 | -0.2500 | -0.1382 | +0.1118 | 4 |
| zone2_volume → hdl | +0.0400 | +0.0317 | -0.0083 | +0.0500 | +0.0549 | +0.0049 | 3 |
| zone2_volume → ldl | -0.0100 | -0.0085 | +0.0015 | -0.0750 | -0.0724 | +0.0026 | 0 |
| training_volume → glucose | -0.0040 | -0.0035 | +0.0005 | -0.0010 | +0.0039 | +0.0049 | 0 |

**Latent coupling coefficients** (posterior means — action-side λ couples U to the 100-day action mean; outcome-side λ couples U to the day-100 biomarker):

| edge | latent | λ_action | λ_outcome | σ_U |
|---|---|---:|---:|---:|
| running_volume → ferritin | sweat_iron_loss | +0.534 | +0.075 | 0.665 |
| running_volume → ferritin | gi_iron_loss | +0.637 | +1.572 | 2.805 |
| running_volume → iron_total | sweat_iron_loss | -0.380 | +0.119 | 1.115 |
| running_volume → iron_total | gi_iron_loss | +0.627 | +0.824 | 1.688 |
| running_volume → hemoglobin | gi_iron_loss | -0.089 | -0.490 | 0.497 |
| zone2_volume → triglycerides | lipoprotein_lipase | +2.997 | +1.640 | 2.917 |
| zone2_volume → triglycerides | insulin_sensitivity | +0.290 | -0.026 | 1.084 |
| zone2_volume → hdl | lipoprotein_lipase | -3.534 | +1.034 | 2.413 |
| zone2_volume → ldl | lipoprotein_lipase | +3.258 | -0.151 | 2.637 |
| training_volume → glucose | insulin_sensitivity | +4.680 | +0.026 | 3.984 |

## Phase 3 decisions — dropped edges, unwired latents, deferred work

Phase 3 aimed to wire the 4 remaining latents (`reverse_cholesterol_transport`, `insulin_sensitivity`, `core_temperature`, `energy_expenditure`) on 5 new edges. Empirical fits produced stop-condition failures on 4 of those edges, leading to the following decisions:

### Edges dropped from the fitted model

| Edge | Latent | Divergences | Posterior bb | Rationale |
|---|---|---:|---:|---|
| training_volume → insulin | insulin_sensitivity | 26 | −0.002 | Over-param: σ_U=4.91, λ_action=+3.77, λ_outcome tiny, causal slope near zero. Treated as zero-slope edge — latent captures action variance with no outcome signal. Kept in population_priors at original unconfounded value. |
| training_volume → body_fat_pct | energy_expenditure | 17 | +0.002 | Over-param: σ_U=3.64, λ_action=+5.12, λ_outcome tiny. Same signature as above. Treated as zero-slope edge. |
| zone2_volume → apob | reverse_cholesterol_transport | 0 | −0.140 (away from zero) | Fit moved slope *away* from zero rather than toward it — opposite of the attenuation pattern on real confounded pathways. λ_action=−3.08 vs λ_outcome=−0.14. RCT does not behave as a functional confounder in this synthetic data. |
| zone2_volume → non_hdl_cholesterol | reverse_cholesterol_transport | 0 | −0.013 (away from zero) | Same pattern: λ_action=+3.13 vs λ_outcome=−0.25. |
| workout_time → sleep_efficiency | core_temperature | — | — | **Data-blocked** — `workout_end_hr` is in-memory only in `synthetic/generator.py:assemble_lifestyle()` and not written to `lifestyle_app.csv`. Fit not attempted; needs synthetic-data regen. |

### Latents specified but not wired into the model

- **`reverse_cholesterol_transport`** — retained in `serif_confounding_structure.md` for real-user reference (the domain-knowledge pathway is well-attested in literature). In this synthetic data, LPL alone handles zone2→lipid confounding, so RCT is left unwired. Empirical fit diverged from theoretical expectation — an example of why synthetic-data confounding structure may be narrower than domain knowledge suggests.
- **`core_temperature`** — cannot be wired until `workout_end_hr` is persisted. Spec retained.
- **`energy_expenditure`** — effectively unwired (only spec'd edge with fit-capable data was `training→body_fat_pct`, which over-parameterized). Spec retained.
- **`leptin`** — no fitted edges to contaminate (all three spec'd pairs are biomarker-as-source or generator-gaps).

### MEDIUM-risk edges: by-design vs pending-data

All 6 remaining MEDIUM edges are known-and-accepted post-Phase-3 state:

| Edge | Category | Disposition |
|---|---|---|
| training_volume → insulin | by-design | Near-zero causal slope; over-param on fit. |
| training_volume → body_fat_pct | by-design | Near-zero causal slope; over-param on fit. |
| zone2_volume → hdl | by-design | LPL wired; RCT left unwired per empirical finding. |
| zone2_volume → apob | by-design | RCT left unwired per empirical finding. |
| zone2_volume → non_hdl_cholesterol | by-design | RCT left unwired per empirical finding. |
| workout_time → sleep_efficiency | pending-data | Synthetic-data regen needed to persist workout_end_hr. |

## Key findings

1. Post-Phase-3: **0** HIGH-risk + **6** MEDIUM-risk fitted edges — 6 of 59 (10%) still carry unresolved latent confounding. Pre-Phase-2 the count was 4 HIGH + 8 MEDIUM = 12 (20%).
2. **0** of 4555 recommended|possible portal exposures (0.0%) come from contaminated edges. (Portal export is pre-Phase-2; exposures are all LOW-risk regardless.)
3. NumPyro model wires 4 latents across 7 edges: `sweat_iron_loss` and `gi_iron_loss` on all iron edges; `lipoprotein_lipase` on all three `zone2→lipid` edges; `insulin_sensitivity` on `zone2→triglycerides` and `training→glucose`. `STRUCTURAL_EDGES` in the TS DAG remains degenerate — 0 latents as confounders — which matters for the identification engine downstream but not for the NumPyro fit.
4. **12** spec'd confounding pairs have no corresponding fitted edge; Phase 1 analysis classified them as 1 renamed / 6 intentional / 5 generator-gap. None carry signal in the current synthetic dataset (|r| < 0.03).
5. Remaining MEDIUM edges reflect three intentional decisions: (a) `training_volume→insulin` + `training_volume→body_fat_pct` dropped from the fit as zero-slope + over-parameterized when their sole latent was wired; (b) `reverse_cholesterol_transport` unwired on `zone2→apob`/`zone2→non_hdl_cholesterol`/`zone2→hdl` after identifiability collapsed in Phase 3; (c) `workout_time→sleep_efficiency` deferred pending synthetic-data regen to persist `workout_end_hr`.
