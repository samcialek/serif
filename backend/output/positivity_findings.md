# Positivity check — findings

Implementation shipped to `backend/serif_scm/positivity.py` (new) and wired
into `backend/serif_scm/export_portal_bayesian.py`. Thresholds per spec:
`insufficient` if cv<0.05 AND range_fraction<0.2; `marginal` if cv<0.10 AND
range_fraction<0.4; `ok` otherwise (AND on both metrics).

## Flag distribution (52,272 rows across 1,188 participants × 44 pairs)

| Flag         |     n | share |
|--------------|------:|------:|
| ok           | 39,699 | 75.9% |
| marginal     |  7,527 | 14.4% |
| insufficient |  5,046 |  9.7% |

## Tier impact

- Rows forced to `not_exposed` (insufficient → suppressed): **5,046** (9.7%)
- Rows capped below `recommended` (marginal → at most `possible`): **7,527** (14.4%)
- Exposed total (rec+pos): **3,976 → 2,772** = −1,204 (−30.3%)

The 30% exposed-count drop exceeds the spec's 5-15% expected band. The
overshoot is concentrated in two edge clusters, both mechanical:

## Edges with highest insufficient-rate

| Edge                         |   n  |  ok | marg |  ins  | ins% |
|------------------------------|-----:|----:|-----:|------:|-----:|
| bedtime→deep_sleep           | 1188 |   0 |    0 | 1188  | 100.0 |
| bedtime→sleep_quality        | 1188 |   0 |    0 | 1188  | 100.0 |
| sleep_duration→cortisol      | 1188 |   1 |  657 |  530  |  44.6 |
| sleep_duration→glucose       | 1188 |   1 |  657 |  530  |  44.6 |
| sleep_duration→hrv_daily     | 1188 |   1 |  657 |  530  |  44.6 |
| sleep_duration→testosterone  | 1188 |   1 |  657 |  530  |  44.6 |
| sleep_duration→wbc           | 1188 |   1 |  657 |  530  |  44.6 |

### Bedtime (100% insufficient) — unit artifact

`bedtime_hr` is measured on a shifted clock scale (21-23h range, mean ≈
22.5). cv = std/|mean| is intrinsically ≤ ~0.03 even for meaningful
variation: a participant with bedtime varying 21:30 → 00:00 (2.5-hour
window, which is real variation) still has cv ≈ 0.033 and range_fraction ≈
0.11. Both thresholds fail for every participant.

This is the **Bayesian-prior-scale-must-match-user-obs-scale** pattern from
the engine-lessons memory playing out at the positivity layer: fixed
thresholds on a shifted-origin variable pathologically fire. Options for
follow-up (not implemented — kept to spec):

1. Per-action threshold override: allow bedtime to use absolute-hour
   variation (e.g., `std > 0.5` instead of cv < 0.05).
2. Scale transform: shift bedtime to hours-from-midnight (or use a 0-origin
   proxy) so cv is well-behaved.
3. Drop bedtime from supported_pairs entirely if synthetic data truly
   doesn't move it.

### Sleep duration (44.6% insufficient) — tight synthetic distribution

Synthetic sleep durations have cv in the 0.03-0.06 band and range_fraction
0.15-0.3 for most participants — right at the insufficient/marginal
border. Real-world sleep varies more; this is likely a synthetic-data
characteristic, not a permanent signal.

## Coherence check

| check                            | pre-positivity | post-positivity | delta |
|----------------------------------|:--------------:|:---------------:|:-----:|
| Direction consistency            | 3976/3976      | 2772/2772       | 100% → 100% |
| Baseline + projection sensibility | 3958/3976 (99.5%) | 2755/2772 (99.4%) | 18 → 17 failures |
| Protocol↔insight consistency     | 3745/3745      | 2541/2541       | 100% → 100% |
| Rounding correctness             | 2324/2324      | 1888/1888       | 100% → 100% |
| Tier assignment sanity           | 52272/52272    | 52272/52272     | 100% → 100% |
| Evidence tier distribution       | 3976/3976      | 2772/2772       | 100% → 100% |

No regressions. One fewer baseline-projection failure in the new run (the
dropped pid was using `bedtime→sleep_quality`, which positivity suppressed).

**Dominant-pair collapse (good):** pre-positivity, `bedtime→sleep_quality`
surfaced for 98.1% of participants (1166/1188), which the coherence checker
already flagged as suggesting insufficient personalization. Post-positivity,
only training_load→{hrv_daily, resting_hr} remain in the >80% dominant list.

## Stop conditions

| condition | threshold | observed | verdict |
|-----------|-----------|----------|---------|
| suppression rate | > 20% | 9.7% | **PASS** |
| any edge 100% insufficient | none | 2 edges (bedtime→*) | **TRIPPED** but explainable |
| coherence regression | any | slightly improved | **PASS** |

## pid 20 running_volume spot check (requested)

All 10 running_volume rows for pid 20: **flag=ok**, cv=0.255, rf=1.061, 37
distinct values over 100 days, mean=4.24 km/day. Positivity is NOT blocking
any running_volume insight for pid 20.

The `not_exposed` tier on these rows is due to **dose-feasibility bounding**
(pid 20 runs ~4.24 km/day, so +MARGINAL_STEP km is partly infeasible),
which scales gate_raw by `|bounded|/|original|` (≈0.074). Unrelated to
positivity.

## Files changed

- `backend/serif_scm/positivity.py` — **new**, 206 lines
- `backend/serif_scm/export_portal_bayesian.py` — +~80 lines: import,
  gate constants, `_row`/`_export_one` signatures, main-loop positivity
  computation, tracking, stop-condition checks, manifest fields
- `backend/output/portal_bayesian/*.json` — regenerated (1,188 files)
- `backend/output/portal_bayesian/manifest.json` — adds `positivity` block
- `public/portal_bayesian/*.json` — synced from backend output for
  frontend consumption
- `backend/output/platform_coherence_report.md` — regenerated
- `backend/output/coherence_positivity.log`, `backend/output/export_positivity_v1.log` — run logs

## Commit

Working dir `Serif_Demo/serif-demo/` is not a git repo (parent ignores
`/Serif_Demo/`). The frontend deploy repo at `/Downloads/serif-demo/` is
frontend-only and does not carry `backend/`. No commit landed — the
implementation is saved to disk at the path above but would need a source
repo for `serif-demo` (or to be tracked in whatever repo you push
`backend/` from) to honor the "feat: positivity check for action support"
commit request.
