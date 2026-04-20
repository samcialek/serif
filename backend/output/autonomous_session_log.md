# Autonomous Session Log — 2026-04-17 overnight

## Task A — Mean-scaled variance floor fix

**Status:** Completed with **stop condition hit** (exposed_total did not cross 5,000).

### What was changed
- `total_effect_priors.py`: added `--variance-floor-mode {absolute, mean_scaled}` flag.
  Default changed to `mean_scaled`.
- New constant `MEAN_SCALED_FRAC = 0.4`.
- `_fit_prior` now computes `variance = max(2·σ²_raw, (0.4·|μ|)²)` under
  `mean_scaled`; falls back to the v2 `2·σ²_raw` under `absolute`.
- `TotalEffectPrior` gained three diagnostic fields: `floor_mode`,
  `floor_applied`, `mean_scaled_std`. Backwards-compatible load (defaults
  preserve existing JSON).
- `export_portal_bayesian.py`: threads flag through; cached priors are
  mode-tagged (`total_effect_priors_absolute.json` vs
  `total_effect_priors.json`) so A/B runs don't clobber each other. Manifest
  now carries `variance_floor_mode`, `mean_scaled_frac`, `var_inflation`.
- Preserved v2 artifacts: `output/total_effect_priors_absolute.json`,
  `output/portal_bayesian/manifest_v2_absolute.json`.

### Floor application — where the 0.4·|μ| term dominated

| pair                         | mean    | raw_sd  | final_sd | mean_scaled_std | floored |
|------------------------------|--------:|--------:|---------:|----------------:|:-------:|
| active_energy → deep_sleep   | +0.6922 | 0.1254  | 0.2769   | 0.2769          | ✅ |
| bedtime → deep_sleep         | +0.6072 | 0.6873  | 0.9719   | 0.2429          | — |
| bedtime → sleep_quality      | +0.4608 | 0.6659  | 0.9418   | 0.1843          | — |
| running_volume → hrv_daily   | +0.1417 | 0.3883  | 0.5491   | 0.0567          | — |
| sleep_duration → hrv_daily   | +0.1354 | 0.0336  | 0.0542   | 0.0542          | ✅ |
| training_load → hrv_daily    | −5.0562 | 1.1502  | 2.0225   | 2.0225          | ✅ |
| training_load → resting_hr   | +1.3053 | 0.2373  | 0.5221   | 0.5221          | ✅ |

Four of seven pop priors triggered the floor; the two "zero-exposed" pairs
from v2 both had the floor dominate as intended.

### Tier distribution — v2 absolute vs v3 mean_scaled

| metric                       | v2 (absolute) | v3 (mean_scaled) | Δ      |
|------------------------------|--------------:|-----------------:|:-------|
| recommended                  |         1,452 |            1,333 | −119   |
| possible                     |         3,103 |            3,222 | +119   |
| not_exposed                  |         3,761 |            3,761 |   0    |
| **exposed_total**            |     **4,555** |        **4,555** | **0**  |
| contraction p10/p50/p90      | .000/.456/.910|  .013/.456/.940  | slightly broader |
| contraction mean             |         0.432 |            0.452 | +0.020 |
| multiplier p10/p50/p90       | .500/.741/1.322|  .500/.730/1.414 | wider  |
| multiplier mean              |         0.808 |            0.808 |   0    |
| direction-conflict rate      |         16.2% |            17.7% | +1.5pp |

### Per-edge comparison

| Edge                         | v2 rec/pos | v3 rec/pos | n_ex v2→v3 |
|------------------------------|:----------:|:----------:|:----------:|
| active_energy → deep_sleep   |   0/0      |   0/0      | 1188→1188  |
| bedtime → deep_sleep         |   0/38     |   0/38     | 1150→1150  |
| bedtime → sleep_quality      |   0/1166   |   0/1166   |   22→22    |
| running_volume → hrv_daily   |   0/975    |   0/975    |  213→213   |
| sleep_duration → hrv_daily   |   0/0      |   0/0      | 1188→1188  |
| training_load → hrv_daily    | 681/507    | 652/536    |   0→0      |
| training_load → resting_hr   | 771/417    | 681/507    |   0→0      |

Net: exactly zero change in exposed_total. Two training_load edges lost
~29 and ~90 users from `recommended` to `possible` (wider prior → more
users' observations disagreed in sign → more direction-conflict discounts).
The two zero-exposed pairs stayed zero-exposed.

### Root cause (revised)

The mean-scaled floor was **not the right fix** for the two zero-exposed
pairs. It widens the prior, but the user update remains data-precision
limited:

**sleep_duration → hrv_daily**
- prior SD after floor: 0.054 ms (prior_precision ≈ 341)
- sigma_data(hrv_daily) = 3.5 ms, typical n ≈ 90 → data_precision ≈ 7.3
- contraction = 1 − 341/(341+7.3) ≈ **0.021** (observed: 0.012)

**active_energy → deep_sleep**
- prior SD after floor: 0.277 min (prior_precision ≈ 13)
- sigma_data(deep_sleep) = 12 min, typical n ≈ 60 → data_precision ≈ 0.42
- contraction ≈ 0.031 (observed: 0.026)

For these pairs the engine-predicted effect is small relative to the
measurement noise on the outcome. No prior-variance trick can extract a
signal that isn't there at daily resolution. The real fix would be one of:

1. **Longer observation window or aggregation** (e.g., weekly means divide
   sigma_data by √7; would roughly 2.6× the data_precision).
2. **Outcome-specific measurement-model re-examination**: sigma_data for
   deep_sleep (12 min) is taken from total nightly noise; if a specific
   outcome like "deep-sleep minutes averaged over a 4-day window" had
   smaller reliability-adjusted noise, contraction would recover.
3. **Exclude these pairs from the short-horizon surface** and only surface
   them on longer review cadences (2-week retrospectives).

Per spec, stopping rather than tuning `frac` up. Filed for morning review.

### Bimodality check

Not bimodal (spec-required sanity gate). v3 contraction p10/p50/p90 =
0.013/0.456/0.940 — continuous, matching v2 shape. Multiplier distribution
also continuous.

### Recommendation

Keep `mean_scaled` as the default — conceptually sound and preferred per
the `feedback_bayesian_prior_scale` memory — but don't expect it to recover
the zero-exposed pairs. The two pairs need a measurement/aggregation fix,
not a prior fix.

---

## Task C — Protocol synthesis module

**Status:** Completed. All 22 tests pass. Export regenerated with protocols
attached to every participant JSON.

### What was built

- `backend/serif_scm/protocols.py` (~300 lines): `Protocol` dataclass,
  `synthesize_protocols(pid, insights, currents, sds)`, plus helpers
  `compute_current_values`, `compute_behavioral_sds`, and template
  renderers.
- Registries:
  - `HORIZON_DAYS_BY_OUTCOME`: hrv_daily=4, resting_hr=4, sleep_quality=2,
    sleep_efficiency=2, deep_sleep=3.
  - `ACTION_UNITS`: hour-of-day, hours, km/day, steps/day, TRIMP/day,
    kcal/day.
  - `COLLAPSE_FRAC = 0.15`, `MAX_OPTIONS = 2`, `SIGN_EPS = 1e-6`.
- `export_portal_bayesian.py`: loads the lifestyle CSV, computes per-pid
  current values and behavioral SDs, calls `synthesize_protocols` for
  each participant, and emits the `protocols` array on every JSON file.
  Manifest now carries `protocol_count_total`,
  `protocols_per_participant_mean` / `_p10_p50_p90`,
  `protocol_option_labels`, `protocol_action_counts`.
- `backend/serif_scm/tests/test_protocols.py` (22 tests) — assertion-based
  pattern matching the existing test files. 22/22 pass.

### Logic recap (per action per participant)

1. Filter to insights with `gate.tier ∈ {recommended, possible}`.
2. Zero → skip action.
3. One → single protocol using that target.
4. Multiple same-direction:
   - `span = max(target) - min(target)`
   - If `span ≤ COLLAPSE_FRAC × behavioral_sd[action]` → single
     "collapsed" protocol at the smallest-|delta| target.
   - Else → split at the largest gap; emit "conservative" (smaller-|delta|
     cluster) and "aggressive" (larger-|delta| cluster) protocols.
5. Multiple conflicting-direction: emit "down" and "up" protocols split by
   sign. (Not reachable by current pipeline — multiplier ∈ [0.5, 1.5]
   cannot flip action sign; kept for safety.)
6. Hard cap at `MAX_OPTIONS = 2` per action.

### Output stats across 1,188 participants

| metric                             | value  |
|------------------------------------|-------:|
| total protocols                    | 4,330  |
| mean protocols / participant       | 3.64   |
| p10 / p50 / p90                    | 3/4/4  |
| actions producing protocols        | 3      |

Option-label distribution:

| option_label  | count |
|---------------|------:|
| single        | 2,103 |
| conservative  | 1,001 |
| aggressive    | 1,001 |
| collapsed     |   225 |

Action distribution:

| action         | protocols |
|----------------|----------:|
| bedtime        | 1,204     |
| running_volume |   975     |
| training_load  | 2,151     |

`active_energy` and `sleep_duration` produce no protocols because their
upstream edges are in the zero-exposed set (Task A finding).

### Stop-condition check

- Mean protocols per participant: **3.64** — inside the `[3, 20]` healthy
  range. No auto-tuning triggered.
- No `WARN` for protocol volume; the only active warning remains
  `exposed_total 4555 < 5000` from Task A.

### Sample output (pid=0001)

```
[single]        bedtime         22.93 → 22.42 hr         tier=possible    horizon=2d
                Shift bedtime earlier to 10:25pm — Optimizes sleep quality
[single]        running_volume   6.24 → 7.37 km/day      tier=possible    horizon=4d
                Increase daily running to 7.4 km/day — Optimizes HRV
[conservative]  training_load   66.16 → 116.16 TRIMP/day tier=possible    horizon=4d
                Target training load ~116 TRIMP/day — Optimizes resting HR
[aggressive]    training_load   66.16 → 211.40 TRIMP/day tier=recommended horizon=4d
                Target training load ~211 TRIMP/day — Optimizes HRV
```

The training_load split correctly reflects that the HRV-optimal and
resting-HR-optimal doses diverge enough to emit both options.

---

## Task B — Frontend portal loader infrastructure

**Status:** Completed. 62/62 verification assertions pass. No UI wired.

### What was built

- `src/data/portal/types.ts` — TS types matching the emitted JSON schema:
  `GateTier`, `ProtocolOptionLabel`, `Posterior`, `CohortPrior`, `UserObs`,
  `GateInfo`, `InsightBayesian`, `Protocol`, `ParticipantPortal`,
  `PortalManifest`. Exports `EXPECTED_ENGINE_VERSION = 'v4-total-effect-bayes'`.
- `src/data/portal/participantLoader.ts`:
  - `validateManifest(raw, expectedEngineVersion?)` and
    `validateParticipant(raw)` — required-field + engine_version checks; throw
    `SchemaMismatchError` with field-named detail.
  - Typed errors: `ParticipantNotFoundError` (404),
    `SchemaMismatchError` (missing field, engine_version mismatch, non-JSON-obj),
    `MalformedJsonError` (invalid JSON).
  - `createParticipantLoader({ basePath?, fetcher?, expectedEngineVersion? })`
    — factory producing an in-memory cache keyed by pid, plus a shared
    `manifestPromise`. Manifest promise is cleared on error so a flaky fetch
    can be retried. Default `basePath` reads `import.meta.env.BASE_URL` +
    `/portal_bayesian`.
  - Exported singleton `participantLoader` for production use.
  - Helper `participantFilename(pid)` → `participant_NNNN.json`.
- `src/stores/portalStore.ts` (zustand):
  - State: `activePid: number | null`, `regimeFilter: Set<RegimeState>`,
    `tierFilter: Set<GateTier>`.
  - Actions: `setActivePid`, `setRegimeFilter`, `toggleRegimeFilter`,
    `setTierFilter`, `toggleTierFilter`, `reset`.
  - `parsePortalStateFromQuery(search)` exported for testability. Initial
    state hydrates from `window.location.search` at module load when
    `window` is defined (SSR/tsx-safe).
  - URL format: `?pid=42&regime=sleep_deprivation,overreaching&tier=recommended,possible`.
    Unknown regime/tier values are dropped; non-positive-integer pids → null.
  - Selector hooks: `useActivePid`, `useRegimeFilter`, `useTierFilter`.
- `src/hooks/useParticipant.ts`:
  - Returns `{ participant, isLoading, error }`. Subscribes to `activePid`
    via `usePortalStore` selector; re-fetches on pid change; reads cached
    value synchronously in the initial state when present.
  - Request-id guard prevents stale promises from resolving after pid switch.
  - Accepts an injectable `ParticipantLoader` for testing.
- `scripts/verify-portal-loader.ts` (62 assertions, all pass):
  - Manifest happy-path + required-field coverage + engine_version mismatch
    + null/array rejection.
  - Participant happy-path + 5 required-field rejections + non-array /
    non-numeric-pid rejections.
  - Loader end-to-end against real files via a filesystem-backed fetcher,
    verifying fetch-call counts for cache hits.
  - Error paths: 404 → `ParticipantNotFoundError`, malformed JSON →
    `MalformedJsonError`, wrong engine_version via network →
    `SchemaMismatchError`, manifest retry after failure.
  - URL deep-link parsing across 14 cases (good, bad, mixed).
  - Filename helper zero-padding.

### Serving the JSONs

Copied `backend/output/portal_bayesian/` → `public/portal_bayesian/` (1
manifest + 1,188 participant files, 1,189 total). Vite's `base: '/serif-demo/'`
combined with `import.meta.env.BASE_URL` means the default `participantLoader`
hits `/serif-demo/portal_bayesian/...` in prod and `/portal_bayesian/...` in
dev, both resolving to the copied public files.

### TypeScript check

`npx tsc -b --noEmit` — new files compile clean. One pre-existing error in
`src/views/InsightsView.tsx:138` (`Calendar` name) unrelated to this work.

### Stop-condition check

- No manifest changes: engine_version still `v4-total-effect-bayes`, no
  UI wiring, no routing touched, persona loader untouched.
- Scope respected: only new files in `src/data/portal/`, `src/stores/`,
  `src/hooks/`, `scripts/`, and `public/portal_bayesian/`. No existing
  views or components modified.

### Wiring note for follow-up

`useParticipant` is ready to consume but not yet called from any view.
Tasks #6/#7 remain blocked per the morning-review gate.

---

## Overnight summary

| Task | Status | Key result |
|------|--------|-----------|
| A — variance-floor fix | Completed; stop condition hit | Floor applied on 4/7 priors; exposed_total unchanged (4,555 < 5,000). Zero-exposed pairs need measurement-horizon fix, not prior fix. |
| B — frontend loader | Completed | Types, loader, store, hook, 62/62 tests. No UI wired. JSONs copied to `public/portal_bayesian/`. |
| C — protocol synthesis | Completed | 4,330 protocols / 1,188 participants, mean 3.64 (inside [3,20]). 22/22 tests pass. |

Active warnings in manifest: `exposed_total 4555 < 5000` (from Task A).
No new auto-tuning triggered. All three tasks stopped at their intended
scope; none exceeded hard limits.

---

## Phase 2 + Phase 3 Confounder Work (2026-04-17 evening)

### Summary

11 confounded edge-fits run through NumPyro (1,188 participants, NUTS MCMC
with 2 chains × 1500 samples). 7 fits kept, 4 dropped per user decisions.
All 8 latent confounders characterized as either wired, unwired (empirical),
deferred (data-blocked), or rejected (over-parameterized).

### Final wired state

| Latent | Status | Edges wired |
|---|---|---|
| lipoprotein_lipase | ✅ wired | zone2→triglycerides, zone2→hdl, zone2→ldl |
| sweat_iron_loss | ✅ wired | running→ferritin, running→iron_total |
| gi_iron_loss | ✅ wired | running→ferritin, running→iron_total, running→hemoglobin |
| insulin_sensitivity | 🟡 partial | training→glucose, zone2→triglycerides |
| reverse_cholesterol_transport | ❌ unwired | empirical; LPL sufficient |
| core_temperature | ⏸ deferred | workout_end_hr not persisted |
| energy_expenditure | ❌ unwired | over-param on training→body_fat_pct |
| leptin | ❌ unwired | no fitted edges available |

### Attenuation magnitudes (7 kept fits)

| Edge | Confounders wired | bb pre | bb post | Attenuation |
|---|---|---:|---:|---:|
| zone2_volume → triglycerides | LPL + IS | −0.013 | −0.005 | ~60% |
| zone2_volume → hdl | LPL | +0.040 | +0.032 | ~20% |
| zone2_volume → ldl | LPL | −0.010 | −0.009 | ~10% |
| running_volume → ferritin | sweat + GI iron | −0.083 | −0.058 | ~30% |
| running_volume → iron_total | sweat + GI iron | −0.050 | −0.034 | ~30% |
| running_volume → hemoglobin | GI iron | −0.003 | +0.013 | sign flip (near-zero) |
| training_volume → glucose | insulin_sensitivity | −0.004 | −0.003 | ~25% (near-zero) |

### Dropped fits (over-param signature — σ_U large, λ_action large, λ_outcome tiny)

| Edge | σ_U | λ_action | λ_outcome | Divergences | Reason |
|---|---:|---:|---:|---:|---|
| training_volume → insulin | 4.91 | +3.77 | ≈0 | 26 | insulin_sensitivity unidentifiable at near-zero slope |
| training_volume → body_fat_pct | 3.64 | +5.12 | ≈0 | 17 | energy_expenditure unidentifiable at near-zero slope |
| zone2_volume → apob | — | −3.08 | −0.14 | 0 | RCT moved slope *away* from zero |
| zone2_volume → non_hdl_cholesterol | — | similar | similar | 0 | RCT same pattern |

### Post-Phase-3 audit

| Tier | Pre-Phase-2 | Post-Phase-3 |
|---|---:|---:|
| HIGH (≥2 unresolved latents) | 4 | **0** |
| MEDIUM (1 unresolved) | 8 | 6 |
| LOW (fully resolved) | 47 | **53** |

All 6 remaining MEDIUM are intentional:
- 3 × zone2 → lipid edges with RCT unresolved (empirical: LPL sufficient)
- training_volume → insulin, training_volume → body_fat_pct (dropped, zero-slope)
- workout_time → sleep_efficiency (data-blocked on workout_end_hr)

### Propagation pipeline

1. `population_priors.json` — merged 7 confounded fits + 52 unchanged (byte-verified)
2. `edgeSummaryRaw.json` — 7 edges updated with `provenance: "fitted_confounded"`,
   `latents_wired: [...]`, new bb/ba/theta/theta_ci. 52 unchanged. Backup at
   `edgeSummaryRaw.pre_confounded.json`.
3. `total_effect_priors.json` — deleted + refit from engine output. Backup at
   `.pre_confounded.json`.
4. `portal_bayesian/` — regenerated. Backup at `portal_bayesian_pre_confounded/`.

### Portal regeneration pre/post comparison

**Tier counts (identical):**

| Tier | Pre | Post |
|---|---:|---:|
| recommended | 1,333 | 1,333 |
| possible | 3,222 | 3,222 |
| not_exposed | 3,761 | 3,761 |
| **exposed_total** | **4,555** | **4,555** |

**Per-edge tier counts:** identical for all 7 supported pairs.

**Participant files:** 1,188/1,189 differ byte-for-byte. The only field
that changed is `cohort` (pre: `cohort_a`/`cohort_b`/`cohort_c`; post:
`delhi`/`abu_dhabi`/`remote`). Numerical values unchanged.

### Architectural finding — confounder work is downstream of portal_bayesian scope

All 7 confounder-adjusted edges have biomarker outcomes (ferritin, iron_total,
hemoglobin, triglycerides, hdl, ldl, glucose). `portal_bayesian` exports
only wearable-outcome edges via `SUPPORTED_PAIRS` in `user_observations.py`:

    ('active_energy', 'deep_sleep'), ('bedtime', 'deep_sleep'),
    ('bedtime', 'sleep_quality'), ('running_volume', 'hrv_daily'),
    ('sleep_duration', 'hrv_daily'), ('training_load', 'hrv_daily'),
    ('training_load', 'resting_hr')

Zero overlap. The Phase 3 work is correctly propagated in
`edgeSummaryRaw.json` (the engine's structural source of truth) and in
`total_effect_priors.json` cohort-level fits, but invisible in this export
scope. To observe portal-level effects of confounder adjustment, the
export would need to widen `SUPPORTED_PAIRS` to include biomarker outcomes
— which has its own measurement-model implications (sparse blood draws,
larger SD per observation).

### Manifest updates

`portal_bayesian/manifest.json`:
- `engine_version`: `v4-total-effect-bayes` → `v4.1-total-effect-bayes-confounded`
- `confounder_adjustment`: new block documenting `latents_wired`,
  `edges_wired_count: 7`, `audit_tier_counts: {HIGH: 0, MEDIUM: 6, LOW: 53}`,
  `edges_at_medium`, and the scope-mismatch note.

### Stop-conditions check

- `exposed_total`: pre 4,555 = post 4,555 ✅ (never dropped below 3,000)
- No participant went from >0 to 0 exposed ✅ (1,188 identical)
- No gate score on adjusted edges moved UP (none moved at all, as the
  adjusted edges aren't in SUPPORTED_PAIRS) ✅
- No regeneration of `user_observations.json` ✅
