# Literature-backed population priors

Living doc. Tracks the plan to replace parts of Serif's synthetic-only
priors with population estimates harvested from published UK Biobank,
All of Us, and large-cohort meta-analyses — without paying access fees.

## Why

Today `backend/serif_scm/total_effect_priors.py` fits prior means and
variances from a 1,188-participant synthetic cohort. These priors drive
every Bayesian update in the engine. They are architecturally correct
but externally ungrounded. Published UKB/AoU slopes ground them in
real-world between-person data on 10K–500K humans, typically at 10×
the statistical precision of the synthetic estimates.

## What we're NOT doing (yet)

- Pulling raw UKB data (£3K fee + 10–16w review, deferred)
- Running our own AoU Workbench queries (requires Sam to register; tracked
  separately). Once Sam is in the Workbench, we can fit Fitbit × EHR-lab
  slopes directly — much stronger than literature-harvested numbers for
  the edges AoU covers.
- Running two-sample Mendelian Randomization (possible future phase;
  publicly-available summary stats from Pan-UKB / IEU OpenGWAS / FinnGen
  would let us identify causal slopes for free)

## What we ARE doing

1. `backend/data/literature_priors.yaml` — canonical store of
   literature-derived prior estimates. One row per `(cohort, action,
   outcome)` with mean, SE, sample size, DOI, and unit-conversion notes.
2. `backend/serif_scm/literature_priors.py` — loader that parses the YAML,
   converts study-reported betas into Serif's `scaled_effect` space,
   returns the prior as a `LiteraturePrior` dataclass matching the
   existing `TotalEffectPrior` shape.
3. `backend/serif_scm/blend_priors.py` — precision-weighted Gaussian
   pooling of synthetic + literature priors. Uses the same conjugate-
   Gaussian math as `conjugate_update.py`. Output: blended `TotalEffectPrior`
   with `provenance = "synthetic+literature"`.
4. Wiring into `total_effect_priors.py` — after the synthetic fit,
   blend any edge with a literature entry. `literature_backed: true`
   flag on blended entries (matches the Phase A loads convention).

## Edge priorities (where published UKB slopes are strongest)

| Priority | Edge family | Published sources | Expected lift |
|---|---|---|---|
| P0 | Activity × lipids (steps/MVPA → LDL/HDL/ApoB/TG) | Strain 2024 *Lancet PH*, Doherty 2024 *JAMA*, Ritchie 2023 *Nat Metab* | 3–5× SE reduction |
| P0 | Sleep duration × hsCRP / RHR | Irwin meta 2016 *Biol Psychiatry*, Leng 2015 *Eur Heart J* | 2–4× |
| P0 | Activity × HbA1c / fasting glucose | Celis-Morales 2017 UKB *BMJ Open*, Dempsey 2022 *Eur Heart J* | 3–5× |
| P1 | Dietary protein × SHBG / testosterone | Whittaker 2023 meta, Allen 2002 EPIC | 2–3× |
| P1 | MVPA × resting HR | Jefferis 2019 UKB *BJSM* | 2–3× |
| P1 | Zone2 / cardio fitness × VO2 peak | Ross 2016 *AHA Circ*, UKB ergometer outputs | 2× |
| P2 | Accelerometer × NMR metabolomics | Ritchie 2023 *Nat Metab* (UKB Nightingale) | hard-to-unit-convert; defer |
| P2 | Diet protein × body mass | UKB WebQ publications; measurement error high | 1.5× |
| Skip | Hormones (cortisol, DHEA-S, estradiol M) | UKB doesn't measure at scale | — |
| Skip | Zinc, magnesium RBC, homocysteine | Not in UKB/AoU at scale | — |
| Skip | Skin-temp / circadian outputs | No population-scale source | — |

## Unit-conversion discipline

Published papers report slopes in whatever units the authors chose:
- "per 1,000 steps/day", "per 10 min/day MVPA", "per 1 SD activity" → need
  conversion to Serif's `MARGINAL_STEPS[action]` nominal step
- "per hour sleep" (self-report) vs Serif's `sleep_duration_hrs` (accelerometer
  or wearable). Self-report attenuates by ~0.6–0.8; inflate variance accordingly
- log-transformed outcomes (log(hsCRP), log(HOMA-IR)) → back-transform at
  cohort-median outcome anchor
- `transportability_inflation` ≥ 1.0 on variance: UKB healthy-volunteer bias
  vs Serif users (athletes/optimizers). Default 2.0; document per-entry if
  we override.

## Status

- [x] Scaffolding files (this doc, YAML, loader, blender, wiring plan)
- [x] Seed YAML with 8–12 entries from memory
- [x] Loader tested round-trip
- [x] Blender unit-tested on synthetic + literature
- [ ] Wire into `total_effect_priors.py` via `--blend-literature` CLI flag
- [ ] Add `literature_backed` badge to portal InsightRow (TS side)
- [ ] Sam kicks off AoU Registered Tier application (parallel, async)
- [ ] Phase 2: replace literature priors with direct AoU Workbench fits
  where they overlap (~3 months out)

## Session log

**2026-04-21** — Initial scaffold. Created YAML + loader + blender skeleton.
Seeded with 10 edges across activity × lipids/HbA1c, sleep × CRP, diet × SHBG.
All entries marked `citation_status: "needs_verification"` until DOIs are pulled
and betas verified against the source papers.

**Next session:**
1. Pull actual DOI + exact β±SE from each seed paper (one session of WebFetch
   work across the 10 seed papers)
2. Add unit-conversion test cases
3. Wire the blend into `total_effect_priors.py` CLI
4. Verify on one edge end-to-end — print the synthetic prior, the literature
   prior, the blended output, and show how the SE narrowed

## Dependencies

- `pyyaml` (YAML parsing) — add to `pyproject.toml` if not present
- No new dependencies for blending (pure numpy, already in use)
