# Platform Coherence Report

- Participants scanned: 1188
- Overall health: **FAIL — see failed checks below**
- Highest-priority fix: **Baseline + projection sensibility** (18 failures)

## Check summary

- **Direction consistency**: 3976/3976 pass (100.0%)
- **Baseline + projection sensibility**: 3958/3976 pass (99.5%)
- **Protocol <-> insight consistency**: 3745/3745 pass (100.0%)
- **Rounding correctness (post-Issue-7)**: 2324/2324 pass (100.0%) — UI-suppressed (Issue 7): 1652 insights
- **Tier assignment sanity**: 52272/52272 pass (100.0%)
- **Evidence tier distribution (biomarker@established flag)**: 3976/3976 pass (100.0%)

## Failed examples (first 5 per check)

### Baseline + projection sensibility — 18 failures

- pid 19  →hrv_daily   — baseline 10.89 outside [15, 150]
- pid 45  →hrv_daily   — baseline 11.46 outside [15, 150]
- pid 158  →hrv_daily   — baseline 13.09 outside [15, 150]
- pid 360  →hrv_daily   — baseline 10.93 outside [15, 150]
- pid 386  →hrv_daily   — baseline 14.78 outside [15, 150]

## Cross-participant diversity (Check 6)

- Exposed insights per participant: mean 3.35, median 3, range [2, 5]
- Recommended-tier per participant: mean 1.12, median 1, max 2

### Top 10 action→outcome pairs by participant coverage

| Action | Outcome | Participants | Coverage |
|---|---|---:|---:|
| training_load | hrv_daily | 1188 | 100.0% |
| training_load | resting_hr | 1188 | 100.0% |
| bedtime | sleep_quality | 1166 | 98.1% |
| steps | body_mass_kg | 396 | 33.3% |
| bedtime | deep_sleep | 38 | 3.2% |

### Dominant pairs (>80% of participants)

Suggests insufficient personalization — these surface for nearly everyone.

- bedtime → sleep_quality: 98.1% (1166/1188)
- training_load → hrv_daily: 100.0% (1188/1188)
- training_load → resting_hr: 100.0% (1188/1188)

## Evidence tier distribution (Check 7)

| Pathway | cohort_level | personal_emerging | personal_established |
|---|---:|---:|---:|
| wearable | 0 | 802 | 2778 |
| biomarker | 0 | 396 | 0 |
