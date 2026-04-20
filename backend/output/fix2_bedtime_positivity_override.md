# Fix 2 — Bedtime positivity override (shipped)

**Date:** 2026-04-19
**Status:** Code + portal + coherence complete.

## What changed

`backend/serif_scm/positivity.py`:

1. New constant `_ABSOLUTE_STD_OVERRIDE: dict[str, tuple[float, float]]`
   with one entry: `"bedtime": (0.15, 0.30)` — tuple is
   `(insufficient_std, marginal_std)` in hours.
2. `compute_positivity(series, action=None)` gains an optional `action`
   kwarg. Before the cv/range_fraction check, it consults the override
   dict: if the action is there, the flag is assigned from the raw std
   (`insufficient` if `std < 0.15`, `marginal` if `std < 0.30`, `ok`
   otherwise). Override takes precedence.
3. `compute_action_positivity` passes `action=action` into
   `compute_positivity` so the override applies in the batch path used
   by the export.

No other callers of `compute_positivity` pass `action`, so every
non-bedtime action keeps the original cv/rf rule.

## Impact on positivity distribution

| Flag | pre-override | post-override | delta |
|------|-------------:|--------------:|------:|
| ok | 39,699 | 41,961 | +2,262 |
| marginal | 7,527 | 7,641 | +114 |
| insufficient | 5,046 | 2,670 | **−2,376** |

The −2,376 insufficient delta exactly matches the 2×1,188 = 2,376
bedtime rows: every bedtime row was insufficient before the override,
and after it they redistribute to ok/marginal by per-participant
bedtime std. Of the 2,376 reclassified rows, 2,262 (95.2%) are `ok`
(std ≥ 0.30 h), 114 (4.8%) are `marginal` (0.15 ≤ std < 0.30), and
zero remain `insufficient` — the synthetic bedtime distribution is
wider than the 9-minute floor for every participant.

## Impact on exposed insights

| Tier | pre | post | delta |
|------|----:|-----:|------:|
| recommended | 1,218 | 1,262 | +44 |
| possible | 1,621 | 3,477 | +1,856 |
| not_exposed | 49,433 | 47,533 | −1,900 |
| **exposed_total** | 2,839 | **4,739** | **+1,900** |

Bedtime now contributes 1,900 exposed insights (all bedtime → *
pairs). Most of these land in `possible` rather than `recommended`
because the bedtime prior mean-effect is moderate (possible-gate
threshold 0.4, recommended threshold 0.6 in default preset).

`bedtime` appears for the first time as a protocol action:

- pre: `{training_load: 2145, steps: 396}`
- post: `{bedtime: 1900, training_load: 2145, steps: 396}`

Release schedule also scales with the extra insights: mean
releases-per-participant rises from 6.4 → 11.2 (p10/p50/p90
`[3,6,9] → [9,12,15]`).

## Coherence check — post-override

| check | pre-positivity | post-positivity (no override) | post-override | delta vs baseline |
|-------|:--------------:|:----------------------------:|:-------------:|:-----------------:|
| Direction consistency | 3976/3976 | 2772/2772 | 4739/4739 | +100% |
| Baseline + projection sensibility | 3958/3976 | 2755/2772 | **4721/4739 (99.6%)** | +1 failure vs post-positivity (17 → 18), **same as pre-positivity baseline (18)** |
| Protocol ↔ insight consistency | 3745/3745 | 2541/2541 | 4441/4441 | 100% |
| Rounding correctness | 2324/2324 | 1888/1888 | 2377/2377 | 100% |
| Tier assignment sanity | 52272/52272 | 52272/52272 | 52272/52272 | 100% |
| Evidence tier distribution | 3976/3976 | 2772/2772 | 4739/4739 | 100% |

**No regression.** 18 baseline+projection failures exactly matches the
pre-positivity baseline — all 18 were present in the original
pre-positivity run. The bedtime rows re-add roughly the same structural
failures they contributed before.

## Secondary observation — dominant-pair collapse re-emerges

Pre-positivity, `bedtime → sleep_quality` was the dominant insight for
1,166/1,188 participants (98.1%). Positivity (without override) killed
that. With the override, `bedtime → sleep_quality` is back to
1,181/1,188 (99.4%) dominant.

This is **not** a positivity problem — bedtime positivity per se is
real (std ≥ 0.15 h for every participant in synthetic data). It's a
**signal-strength / data-generating-process** problem: the synthetic
generator has an unusually strong bedtime → sleep_quality coupling so
the bedtime edge dominates the ranking whenever it is exposed. Options
for Sam to consider (out of scope for this fix):

1. **Tier-weighted ranking** — promote insight diversity in the
   recommendation rollup so one dominant edge can't surface for 99% of
   participants.
2. **Synthetic generator calibration** — reduce the bedtime edge
   effect magnitude or add participant-level heterogeneity so it does
   not pattern-dominate.
3. **Leave as-is** — synthetic bias, will not persist on real data.

The coherence checker's "insufficient personalization" flag will fire
on bedtime post-override just as it did pre-positivity. Whether that
flag matters depends on the downstream use case — for an investor
demo, the uniform bedtime recommendation is arguably a feature not a
bug (everyone gets a "go to bed 15 min earlier" card).

## Files changed

- `backend/serif_scm/positivity.py` — +15 lines: dict + override branch + kwarg plumbing
- `backend/output/portal_bayesian/*.json` — 1,188 files regenerated
- `backend/output/portal_bayesian/manifest.json` — positivity block reflects new distribution
- `public/portal_bayesian/*.json` — synced from backend output
- `backend/output/platform_coherence_report.md` — regenerated (18 failures, matches pre-positivity baseline)
- `backend/output/platform_coherence_report.post_bedtime_fix.md` — snapshot
- `backend/output/manifest.pre_bedtime_fix.json` — pre-fix snapshot for diffing
- `backend/output/platform_coherence_report.pre_bedtime_fix.md` — pre-fix snapshot
- `backend/output/export_bedtime_fix.log`, `coherence_bedtime_fix.log` — run logs

## Stop conditions

| condition | threshold | observed | verdict |
|-----------|-----------|----------|---------|
| insufficient override count | exactly 2,376 rows reclassified | 2,376 | **PASS** |
| coherence regression vs pre-positivity | > 0 extra failures | 18 == 18 | **PASS** |
| bedtime override fires only on bedtime | no other actions affected | confirmed via per_edge_insufficient_rate | **PASS** |
| recommended dose reachable for bedtime | any bedtime insights at `recommended` tier | 44 recommended | **PASS** |
