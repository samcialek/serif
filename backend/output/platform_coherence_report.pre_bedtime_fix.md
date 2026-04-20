# Platform Coherence Report

- Participants scanned: 1188
- Overall health: **FAIL — see failed checks below**
- Highest-priority fix: **Baseline + projection sensibility** (17 failures)

## Check summary

- **Direction consistency**: 2839/2839 pass (100.0%)
- **Baseline + projection sensibility**: 2822/2839 pass (99.4%)
- **Protocol <-> insight consistency**: 2541/2541 pass (100.0%)
- **Rounding correctness (post-Issue-7)**: 1941/1941 pass (100.0%) — UI-suppressed (Issue 7): 898 insights
- **Tier assignment sanity**: 52272/52272 pass (100.0%)
- **Evidence tier distribution (biomarker@established flag)**: 2839/2839 pass (100.0%)

## Failed examples (first 5 per check)

### Baseline + projection sensibility — 17 failures

- pid 19  →hrv_daily   — baseline 10.89 outside [15, 150]
- pid 45  →hrv_daily   — baseline 11.46 outside [15, 150]
- pid 158  →hrv_daily   — baseline 13.09 outside [15, 150]
- pid 360  →hrv_daily   — baseline 10.93 outside [15, 150]
- pid 386  →hrv_daily   — baseline 14.78 outside [15, 150]

## Cross-participant diversity (Check 6)

- Exposed insights per participant: mean 2.39, median 2, range [2, 4]
- Recommended-tier per participant: mean 1.03, median 1, max 2

### Top 10 action→outcome pairs by participant coverage

| Action | Outcome | Participants | Coverage |
|---|---|---:|---:|
| training_load | resting_hr | 1188 | 100.0% |
| training_load | hrv_daily | 1188 | 100.0% |
| steps | body_mass_kg | 396 | 33.3% |
| training_volume | cortisol | 67 | 5.6% |

### Dominant pairs (>80% of participants)

Suggests insufficient personalization — these surface for nearly everyone.

- training_load → resting_hr: 100.0% (1188/1188)
- training_load → hrv_daily: 100.0% (1188/1188)

## Evidence tier distribution (Check 7)

| Pathway | cohort_level | personal_emerging | personal_established |
|---|---:|---:|---:|
| wearable | 0 | 0 | 2376 |
| biomarker | 0 | 463 | 0 |
