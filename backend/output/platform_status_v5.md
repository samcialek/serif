# Serif — Platform Status (v5)

**As of 2026-04-17. Engine version: `v5-biomarker-widened`.**

Serif is a causal-inference platform that turns longitudinal health data
(wearables + blood draws + lifestyle logs) into personalized, Bayesian-gated
recommendations. A directed acyclic graph of 59 fitted edges over 18 source
nodes answers counterfactual queries of the form *"if you did more of X, what
happens to biomarker Y, with how much certainty, and when?"*

## What v5 ships

The Bayesian export (`output/portal_bayesian/`) fits three-layer posteriors
(population → cohort → user) on **44 (action, outcome) pairs**:

- **7 wearable pairs** — daily cadence, OLS slopes with confounder-adjusted
  design matrices.
- **37 biomarker pairs** — pre/post sparse draws (day 1, day 100) with
  cohort-median slope subtraction as confounder adjustment, `n_effective=1`
  per user, per-outcome `sigma_data = mean × lab_cv × 1.4`.

Every recommendation carries an **evidence tier** (`cohort_level`,
`personal_emerging`, `personal_established`) with pathway-specific thresholds,
a **time-to-signal horizon** from `intervention_horizons.py` (2-4 days for
wearable outcomes, 28-90 days for biomarkers), and a plain-English
supporting-data description. The frontend (`InsightRow` + `ParticipantDetail`)
groups insights into wearable and biomarker sections with pathway / evidence
/ horizon pills.

## Current exposure numbers (1,188 participants)

| | Wearable | Biomarker | Total |
|---|---:|---:|---:|
| Rows | 8,316 | 43,956 | 52,272 |
| Recommended | 1,333 | 307 | 1,640 |
| Possible | 3,222 | 2,248 | 5,470 |
| Not exposed | 3,761 | 41,401 | 45,162 |
| Evidence: cohort | 2,501 | 36,697 | 39,198 |
| Evidence: emerging | 2,080 | 7,259 | 9,339 |
| Evidence: established | 3,735 | **0** | 3,735 |

Per-participant exposed: min 2 / p50 6 / p90 9 / max 11. Protocol synthesis
produces mean 4.51 protocols per participant (p10/p50/p90 = 3/4/6).

## Known limitations

1. **6 MEDIUM-risk edges with 1 unresolved latent confounder** remain in
   the fit. None HIGH risk, 53 LOW. The six are:
   `training_volume → body_fat_pct` (energy_expenditure),
   `training_volume → insulin` (insulin_sensitivity),
   `workout_time → sleep_efficiency` (core_temperature),
   `zone2_volume → apob / hdl / non_hdl_cholesterol`
   (reverse_cholesterol_transport). Most are zero- or near-zero-slope
   edges that currently never surface as recommendations; left unwired
   after Phase 3 either by empirical over-parameterization signature
   (`reverse_cholesterol_transport`) or by data blocker (`core_temperature`
   needs `workout_end_hr` persisted, `energy_expenditure` needs
   generator columns that aren't written today). Full audit in
   `backend/output/confounding_audit.md`.

2. **No hierarchical fit yet.** The Bayesian layer is conjugate Normal-Normal
   on pre-computed total-effect priors. A NumPyro hierarchical model exists
   as scaffold but is not fit to the widened 44-pair set, and `sigma_obs`
   is still a single scalar (needs to be per-node before fitting).

3. **Synthetic data only.** The 1,188 participants come from a deterministic
   generator, so effect sizes are calibrated to the generator's assumed
   biology, not to real users. One immediate consequence: biomarker
   `personal_established` is structurally unreachable because each synthetic
   user has only 2 blood draws (`BIOMARKER_ESTABLISHED_MIN_N = 2` requires
   more). No real user data is in the pipeline.

## What's next and why

- **Hierarchical build (L)** — The hierarchical fit is the unlocks-everything
  item: correct per-node `sigma_obs`, cross-cohort pooling without the James-
  Stein approximation, and a posterior that actually carries the uncertainty
  structure v5 currently flattens. Blocks tighter gating and any real-user
  onboarding.
- **Release scheduler (M)** — `scheduler.py` currently emits three framing
  windows at fixed offsets. Biomarker releases should be horizon-aware so a
  ferritin follow-up lands at ~56 days and an HbA1c follow-up at ~90 days,
  not at the wearable cadence.
- **UI voice refinement (S)** — Once Sam smoke-tests the widened portal in
  browser, tighten biomarker copy based on the reader reaction.

Later: 3rd blood draw in the synthetic generator to unlock biomarker
`established`; BONG online updates; full-posterior MCID-based gating;
exploration recommendations; shift interventions.

## Pointers

- Current export: `backend/output/portal_bayesian/` (1,188 files + manifest).
- Previous export (backup): `backend/output/portal_bayesian_wearable_only/`.
- Pipeline entry point: `python -m serif_scm.export_portal_bayesian --all`.
- Module map: `serif_codebase_map.md` (memory).
- Engine lessons: `serif_engine_lessons.md` (memory).
- Task state: `TASKS.md` (repo root).
