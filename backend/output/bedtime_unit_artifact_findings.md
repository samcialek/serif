# Bedtime unit artifact — investigation findings

**Date:** 2026-04-19
**Task:** Task 2 of autonomous run — bedtime positivity 100% insufficient
**Conclusion:** Confirmed unit artifact. Fix is *positivity-gating logic*, not display-layer. **Stopping per brief's stop condition** — user decision required on three options below.

## What the raw numbers look like

From 5 spot-checked pids (raw `bedtime_hr` in `output/lifestyle_app.csv`):

| pid | n   | mean (h) | std (h) | range (h) | cv      | rf     |
|-----|-----|---------:|--------:|----------:|--------:|-------:|
| 1   | 66  | 23.08    | 0.504   | 2.100     | 0.0218  | 0.0910 |
| 2   | 72  | 22.22    | 0.449   | 2.400     | 0.0202  | 0.1080 |
| 3   | 54  | 22.28    | 0.500   | 2.100     | 0.0224  | 0.0943 |
| 4   | 62  | 21.92    | 0.300   | 1.400     | 0.0137  | 0.0639 |
| 5   | 56  | 22.97    | 0.451   | 2.200     | 0.0196  | 0.0958 |

After 100-day ffill/bfill (what the engine actually fits on): nearly identical metrics — `std ≈ 0.3-0.5h`, `cv ≈ 0.02`, `rf ≈ 0.07-0.11`.

All five fail both `INSUFFICIENT_CV=0.05` and `INSUFFICIENT_RANGE_FRAC=0.20`. Flag: **insufficient** for all.

## Why this is an artifact, not a real positivity failure

A 30-minute standard deviation in bedtime is **substantial** identifying variation for a causal fit — it tells the engine "this person slept at 22:00 ±30min", which is a 1-hour support window. But:

- `bedtime_hr` is on a shifted-clock scale (21-23h typical).
- `cv = std/|mean| = 0.5/22 ≈ 0.023` — tiny, purely because the mean is ~22 (not ~0).
- `range_fraction = 2h/22 ≈ 0.09` — tiny for the same reason.

cv and range_fraction both **scale with the offset of the mean from zero**. For a scale-free quantity like `run_km` (mean ≈ 5, std ≈ 2), cv ≈ 0.4 naturally. For `bedtime_hr` (mean ≈ 22, std ≈ 0.5), cv ≈ 0.023 **regardless of how much bedtime actually varies**.

Contrast with `sleep_hrs`: mean ≈ 7, std ≈ 0.4, cv ≈ 0.06 — closer to the threshold but still often flagged. Sleep is a less extreme version of the same issue (tight distribution + non-zero mean).

This is a scale-defect of the cv/rf metric, not a data problem.

## What the engine actually fits on

The hierarchical fit (and the point-estimate engine) fits `y ~ bb * bedtime_hr + ba` on the **raw** `bedtime_hr` column. So the fitted slope (`bb`) is in units of `Δy per Δh`, where `Δh` is interpreted on the 21-23h scale. A slope like `bb = -0.1` means "each additional hour of bedtime reduces y by 0.1", which is correct — the scale offset doesn't affect the slope, only the intercept.

**Implication:** the scale issue lives *only* in the positivity-metric layer. The fitted slopes are already right. Whatever fix we apply only changes which insights get suppressed, not the effect sizes.

## Three fix options (Sam to decide)

### Option 1 — per-action absolute-std thresholds

Add an override dict in `positivity.py`:

```python
_ABSOLUTE_STD_OVERRIDE: dict[str, tuple[float, float]] = {
    # action: (insufficient_std, marginal_std)  — both in the action's native units
    "bedtime": (0.15, 0.30),  # 9-min / 18-min bedtime jitter
}
```

When an action has an override, use `std < insufficient_std` instead of the cv+rf rule. Cost: ~15 LOC, localized.

**Pros:** Clean, targeted, doesn't touch the model. The bedtime slope fits fine — we just gate it correctly.
**Cons:** Every new scale-anchored action needs a hand-tuned threshold. If we later add `wake_time_hr` or `workout_start_hr`, they'll need overrides too.

### Option 2 — scale transform (hours-from-midnight)

Change `_ACTION_TO_DAILY["bedtime"]` to emit `bedtime_hr - 24` when ≥ 12, giving 22:00 → −2.0. Mean near 0 → cv and rf become large and pass the check.

**Pros:** No threshold tuning. Semantically reasonable (hours-past-midnight is a natural parameterization for late-night bedtimes).
**Cons:** Only affects positivity, **not the fit** — the fit still sees 22, so this is purely cosmetic (positivity passes, but nothing about the causal math changes). Risk: confusing mental model, reviewers will expect the fit to also see the transformed value.

### Option 3 — drop bedtime from supported_pairs

Remove `bedtime` from the action list in `SUPPORTED_ACTIONS` / `export_portal_bayesian.py`.

**Pros:** Simplest. Removes the pathology entirely.
**Cons:** Loses a potentially real actionable signal. Sleep scientists care about bedtime, not just duration.

## Recommendation

**Option 1** — per-action absolute-std thresholds. It is the smallest, most honest change: the metric is broken for shifted-clock units, so we fix the metric for those units. Option 2 is superficial (positivity passes, but the fit is unchanged so nothing improves downstream). Option 3 is premature (we haven't yet checked whether bedtime→* slopes carry real signal; suppressing the pathway removes evidence we'd need to make that call).

Estimated work for Option 1: ~20 LOC in `positivity.py`, one export regeneration, one coherence check. ~30 minutes.

## Stop condition triggered

Brief said: "If fix is in display layer only, ship. If it requires model surgery, stop and report."

This fix is **neither** — it's engine-layer positivity-gating logic (not display, not model). Per the spirit of the stop condition (don't unilaterally change engine behavior), stopping.

## Files

- `backend/serif_scm/positivity.py` — current thresholds (`INSUFFICIENT_CV=0.05`, `INSUFFICIENT_RANGE_FRAC=0.20`)
- `backend/output/positivity_findings.md` — prior bedtime writeup (100% insufficient noted)
