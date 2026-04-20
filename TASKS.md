# Serif — Tasks

Current engine version: `v5-biomarker-widened`. Last updated: 2026-04-17.

Scope: **S** ≈ afternoon, **M** ≈ 1-2 days, **L** ≈ week+.

## Active

_(none — biomarker widening shipped, next round not yet picked up)_

## Ready

- **Hierarchical build** — Scope **L**. Wire the widened 44-pair prior set into
  a NumPyro hierarchical model (population → cohort → individual). Fix
  `sigma_obs` to be per-node (currently single scalar; blocker carried from
  `serif_architecture.md`). Run SVI on synthetic data; compare posterior
  contractions against the conjugate-update output as a sanity check before
  wiring to the export.
- **Release scheduler** — Scope **M**. `scheduler.py` emits 3 framing windows
  (initial / adherence-check / reinforcement) per protocol at fixed offsets.
  Make the windows horizon-aware: biomarker releases should land around their
  `horizon_days` (e.g., ferritin at ~56 days, HbA1c at ~90 days), wearable
  releases keep the tight short-horizon cadence. Manifest already surfaces
  `release_count_distribution` — compare before/after.
- **UI voice refinement post-smoke-test** — Scope **S**. After Sam walks
  through the widened portal in-browser, tighten the biomarker copy in
  `InsightRow.tsx` and `_SUPPORTING_DATA_DESCRIPTIONS` in
  `export_portal_bayesian.py`. Expected adjustments: wording on
  "Emerging personal evidence from 2 lab draws…" once the reader reaction
  is known, plus pathway-pill label choices.

## Recently completed

- **Biomarker widening (Tasks A-F, 2026-04-17)** — 7 → 44 supported pairs (7
  wearable + 37 biomarker). New `intervention_horizons.py` registry; sparse
  pre/post slope fitter with cohort-median confounder subtraction;
  per-pathway evidence tiers with `BIOMARKER_ESTABLISHED_MIN_N=2` cap;
  cohort rename at export layer only. Engine version bumped to
  `v5-biomarker-widened`. Backup of prior export at
  `output/portal_bayesian_wearable_only/`.
- **Frontend biomarker integration (Tasks G-H, 2026-04-17)** — `types.ts`
  extended with `Pathway` / `EvidenceTier`; `InsightRow` shows pathway +
  evidence-tier + horizon pills; `ParticipantDetail` groups insights into
  wearable / biomarker sections. `tsc` + `vite build` clean.
- **Confounder-adjusted priors (Phase 2/3, earlier in 2026-04)** — 4 of 8
  latents wired (LPL, iron ×2, insulin_sensitivity partial). See
  `serif_confounding_structure.md`.
- **Gating v2.5 + preset system (2026-04)** — Two-term gate with
  default/strict/permissive presets. See `serif_gating_formula.md`.

## Backlog / later

- **Real-biomarker repeat-draw simulation** — Add a 3rd blood draw (~day 200)
  to the synthetic generator so biomarker `personal_established` becomes
  structurally reachable. Today it's blocked by `user_n >= 2`.
- **Online updates (BONG)** — Conjugate Normal-Normal is wired; BONG is the
  next layer for real-time daily updating as new wearable rows land.
- **Certainty-gated exposure, full posterior** — Filter by
  `P(|effect| > MCID ∧ beneficial) > 0.8` plus positivity/support check.
- **Exploration recommendations** — EIG-driven behavioral suggestions on safe
  nodes.
- **Shift interventions** — Replace `do(X=x)` with `do(X ~ distribution)` for
  continuous actions.

## How to maintain this file

Update when tasks move state. Each entry should be self-contained so someone
walking in cold can read one bullet and act. When marking something
"completed," keep the entry for one cycle then prune once superseded.
