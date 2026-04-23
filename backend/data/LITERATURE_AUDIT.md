# Literature Prior Audit — 2026-04-22

Audit of the two literature systems in Serif:
1. **YAML quantitative priors** — `backend/data/literature_priors.yaml` (11 entries, 8 unique sources)
2. **Hardcoded boolean flags** — `LITERATURE_BACKED` set in `backend/serif_scm/export_portal_bayesian.py` (18 `(action, outcome)` pairs, 8 cited sources in comments)

**Audit method:** for each citation, resolve the DOI, check that the paper exists and matches the topic we're claiming, and note whether the β/SE we encoded plausibly appears in the paper. No attempt was made to recompute β — that requires paper PDF access.

**Headline finding:** of the 8 YAML sources, only **1** passes a clean DOI-plus-topic check (Irwin 2016). The rest are some mix of fabricated DOI, wrong DOI pointing at an unrelated paper, or real paper on the wrong topic to produce the β we encoded. The hardcoded flag citations fare better — most point to real papers whose direction matches — but several are aspirationally attributed (specific biomarker slopes that aren't actually in the cited paper).

Until this is resolved, **`literature_priors.py` is already gating** on `citation_status: verified` and refusing to load entries. Nothing in YAML is currently fed into the blend pipeline. The hardcoded flags, however, **do** emit a "literature-backed" badge in the UI regardless of the above — that badge is currently overclaiming.

---

## YAML quantitative priors

### 1. Strain 2024 UKB accelerometer — `steps → ldl_smoothed`, `steps → hscrp_smoothed`

- **DOI:** `https://doi.org/10.1016/S2468-2667(24)00022-4`
- **Status:** ❌ **FABRICATED / UNRESOLVABLE**
- **Finding:** DOI returns 404. No Strain 2024 Lancet Public Health paper with that DOI exists. Multiple targeted searches on "Strain 2024 UKB accelerometer lipid" / "Strain 2024 steps LDL" returned nothing matching.
- **Recommended action:** remove both entries (LDL and hsCRP). If we want UKB step × lipid priors, use a verifiable Dempsey / Doherty / Strain paper with the real DOI, or replace with a weakly-informative Normal(0, large) default.

### 2. Ekelund 2019 UKB MVPA — `zone2_volume → hdl_smoothed`, `zone2_volume → triglycerides_smoothed`

- **DOI:** `https://doi.org/10.1136/bmj.l4570`
- **Status:** ❌ **REAL PAPER, WRONG TOPIC**
- **Finding:** DOI resolves to Ekelund et al. 2019 BMJ "Dose-response associations between accelerometry measured physical activity and sedentary time and all cause mortality: systematic review and harmonised meta-analysis of data from 8 population based cohorts." Topic is **mortality**, not HDL or triglycerides. The β = +0.6 mg/dL HDL and −1.5 mg/dL TG per 60 min/mo zone2 cannot come from this paper.
- **Recommended action:** rename source, swap DOI. Probable intended source is Mora 2007 / Kodama 2007 meta-analyses on MVPA × lipids, but neither is UKB. If we want a UKB-based HDL/TG slope, the correct paper is Pinto Pereira 2020 or Ahmadi 2022, not Ekelund 2019.

### 3. Dempsey 2022 UKB accelerometer — `steps → glucose_smoothed`

- **DOI:** `https://doi.org/10.1093/eurheartj/ehac613`
- **Status:** ❌ **REAL PAPER, WRONG TOPIC**
- **Finding:** DOI resolves to Dempsey et al. 2022 Eur Heart J "Physical activity volume, intensity, and incident cardiovascular disease." Topic is **incident CVD**, not fasting glucose. No glucose slope in this paper.
- **Recommended action:** remove or swap. A real Dempsey paper on accelerometer × glucose exists (Dempsey 2017 Diabetes Care on sedentary-interruption × glycaemia), but it's not the same as an UKB population slope.

### 4. Irwin 2016 meta-analysis sleep × inflammation — `sleep_duration → hscrp_smoothed`

- **DOI:** `https://doi.org/10.1016/j.biopsych.2015.05.014`
- **Status:** ✅ **VERIFIED (topic match)**
- **Finding:** Resolves to Irwin, Olmstead & Carroll 2016 Biological Psychiatry "Sleep Disturbance, Sleep Duration, and Inflammation: A Systematic Review and Meta-Analysis of Cohort Studies and Experimental Sleep Deprivation." Topic matches exactly — short sleep elevates CRP.
- **Caveat:** β = −0.05 mg/L per 30 min sleep was reconstructed from agent summary — the paper reports effect sizes on log(CRP) from pooled-analysis, and the conversion to mg/L per-30-min hasn't been back-checked against the paper text. Topic is verified; magnitude is not.
- **Recommended action:** flip `citation_status` to `verified_topic_only` (or keep as `needs_verification` with a note that the paper exists and is on-topic).

### 5. Jefferis 2019 UKB accelerometer — `sleep_duration → resting_hr`, `steps → resting_hr`

- **DOI:** `https://doi.org/10.1136/bjsports-2018-100237`
- **Status:** ❌ **FABRICATED (DOI + cohort framing)**
- **Finding:** DOI returns 404. The real Jefferis 2019 papers use the **British Regional Heart Study (BRHS)** cohort of older men, not UK Biobank. Those papers focus on accelerometer-measured activity × cardiovascular mortality / incident CVD, not resting HR dose-response with N=103,000.
- **Recommended action:** remove both entries. If we want a population prior on steps/sleep → RHR, we don't have a clean UKB-based source; the closest honest alternative is Quer 2020 Nature Medicine (Fitbit wearable data), but N is ~200k and the RHR-change metric is self-change over time, not a between-person slope.

### 6. Whittaker 2023 meta-analysis protein × testosterone — `dietary_protein → testosterone_smoothed`

- **DOI:** `https://doi.org/10.1016/j.jsbmb.2023.106344`
- **Status:** ❌ **WRONG DOI → UNRELATED PAPER**
- **Finding:** The DOI resolves to Li et al. 2023 Journal of Steroid Biochemistry and Molecular Biology, "Platelet-derived growth factor BB...Leydig cell function in male rats" — unrelated to protein × testosterone in humans. The real Whittaker paper is "High-protein diets and testosterone" in Nutrition and Health 2022, DOI `10.1177/02601060221132922`.
- **Recommended action:** correct the DOI and year (2022, not 2023). Topic of the real Whittaker paper matches the claim. Note that the real paper's headline is that **high-protein diets *lower* testosterone** (opposite sign to what we encoded, β = +1.5 ng/dL per +20 g/day). So fixing the DOI also requires re-examining the sign.

### 7. Allen 2002 EPIC-Oxford protein × SHBG — `dietary_protein → shbg_smoothed`

- **DOI:** `https://doi.org/10.1038/sj.bjc.6600159`
- **Status:** ❌ **WRONG DOI**
- **Finding:** `10.1038/sj.bjc.6600159` is in British Journal of Cancer, which is not where Allen's EPIC-Oxford androgens-nutrition papers were published. The real Allen 2002 EPIC-Oxford paper on nutrition × sex hormones is "The associations of diet with serum insulin-like growth factor I and its main binding proteins in 292 women meat-eaters, vegetarians, and vegans" (Cancer Epidemiol Biomarkers Prev 2002) or the related Allen 2000 Br J Cancer vegans/omnivores × hormones. None map cleanly to a β of −0.8 nmol/L SHBG per +20 g/day protein in N=4100.
- **Recommended action:** replace or remove. The directional claim (protein ↑ → SHBG ↓) has some literature support (Longcope 2000, Pasquali 1997), but we don't have a clean N=4100 slope from Allen.

### 8. Ross 2016 AHA zone2 × CRF — `zone2_volume → vo2_peak_smoothed`

- **DOI:** `https://doi.org/10.1161/CIR.0000000000000461`
- **Status:** ❌ **REAL PAPER, WRONG CLAIM**
- **Finding:** Resolves to the AHA Scientific Statement "Importance of Assessing Cardiorespiratory Fitness in Clinical Practice" Circulation 2016. It's a position statement on **why** CRF matters clinically, not a meta-analysis producing a slope β for zone2 volume → VO2peak. Our encoded β = +0.15 mL/kg/min per +60 min/mo is not in this paper.
- **Recommended action:** swap source. The honest source for a zone2-volume × VO2peak dose-response is Milanović 2015 (HIIT vs MICT meta-analysis) or Bouchard 2011 HERITAGE Family Study follow-ups, not the AHA statement.

---

## Hardcoded `LITERATURE_BACKED` boolean flags

These pairs emit a "literature-backed" badge in the UI regardless of cohort data. The comments in `export_portal_bayesian.py:253-277` cite 8 sources across 4 mechanism clusters. Audit per cluster:

### Cluster 1 — ACWR → recovery biomarkers (5 pairs)
- **Pairs:** `acwr → {hrv_daily, resting_hr, hscrp, cortisol, testosterone}`
- **Comment cites:** Gabbett 2016, Malone 2017, Hulin 2014

| Citation | Real paper | Topic match |
|---|---|---|
| Gabbett 2016 | "The training-injury prevention paradox: should athletes be training smarter and harder?" BJSM 2016;50:273-280, DOI `10.1136/bjsports-2015-095788` | Directionally supports ACWR framework. Paper's outcome is **injury**, not HRV/RHR/CRP/cortisol/testosterone. |
| Malone 2017 | "Protection Against Spikes in Workload With Aerobic Fitness and Playing Experience: The Role of the Acute:Chronic Workload Ratio on Injury Risk in Elite Gaelic Football" IJSPP 2017;12(3):393-401 | Same issue — outcome is injury. |
| Hulin 2014 | Hulin et al. 2014 BJSM (cricket) introduced ACWR; rugby work was Hulin 2016 BJSM. | Same — outcome is injury. |

- **Verdict:** ⚠️ **PARTIAL**. All three papers are real and well-cited. But they establish ACWR → *injury risk*, not ACWR → HRV/RHR/hsCRP/cortisol/testosterone. The directional bet that a high ACWR is "worse for recovery" is defensible on mechanistic grounds, but the UI badge currently implies a biomarker-specific slope the literature doesn't report.
- **Recommended action:** either weaken the badge copy ("mechanism-plausible" rather than "literature-backed"), or narrow the flag set to pairs actually studied (ACWR × injury isn't a Serif outcome; the closest is `hrv_daily` via Gabbett's informal HRV discussion, but that's not a pooled effect).

### Cluster 2 — Sleep debt → HPA/metabolic (4 pairs)
- **Pairs:** `sleep_debt → {cortisol, glucose, resting_hr, testosterone}`
- **Comment cites:** Van Cauter 1997, Leproult & Van Cauter 2011

| Citation | Real paper | Topic match |
|---|---|---|
| Van Cauter 1997 | Van Cauter et al. 1997 Horm Res 49:147-152 "Roles of circadian rhythmicity and sleep in human glucose regulation"; also Spiegel/Van Cauter 1999 Lancet on sleep-debt × glucose/HPA | Sleep restriction ↑ cortisol and ↓ glucose tolerance. Matches `sleep_debt → cortisol` and `sleep_debt → glucose`. |
| Leproult & Van Cauter 2011 | JAMA 2011;305(21):2173-2174 "Effect of 1 week of sleep restriction on testosterone levels in young healthy men" | Sleep <5h × 1 week → T −10–15%. Matches `sleep_debt → testosterone` exactly. |

- **Verdict:** ✅ **VERIFIED** for cortisol, glucose, testosterone. `sleep_debt → resting_hr` is not directly covered by either paper — there's separate literature (Tobaldini 2014, Sauvet 2010) on sleep deprivation × autonomic tone that could be cited, but neither Van Cauter paper is it.
- **Recommended action:** add RHR-specific citation (Tobaldini 2014 Auton Neurosci) or drop `sleep_debt → resting_hr` from the flag set.

### Cluster 3 — Travel load / circadian misalignment → sleep & autonomic (4 pairs)
- **Pairs:** `travel_load → {deep_sleep, hrv_daily, sleep_efficiency, resting_hr}`
- **Comment cites:** Kolla 2016, Burgess 2003

| Citation | Real paper | Topic match |
|---|---|---|
| Kolla 2016 | No Kolla 2016 alcohol/sleep-architecture meta-analysis found. Real Kolla paper is 2018 (Kolla BP et al. 2018 *Sleep Med Rev*, impact of alcohol on sleep-breathing parameters — AHI, SpO2). | Unclear what the `Kolla 2016` label was intended to cite. Kolla 2018 is about alcohol and sleep breathing, not circadian misalignment. |
| Burgess 2003 | Burgess et al. 2003 *J Biol Rhythms* "Preflight adjustment to eastward travel: 3 days of advancing sleep with and without morning bright light" | Matches — eastward travel causes circadian advance demand, bright light modifies. Supports `travel_load → {deep_sleep, sleep_efficiency}` direction. |

- **Verdict:** ⚠️ **PARTIAL**. Burgess 2003 backs the jet-lag → sleep-architecture direction. Kolla 2016 appears mis-cited — if intended as a jet-lag / circadian reference, the canonical alternatives are Waterhouse 2007 or Sack 2009 AASM practice parameters.
- **Recommended action:** remove Kolla 2016 citation, add Waterhouse 2007 or Sack 2009.

### Cluster 4 — Aerobic training → VO2 (3 pairs)
- **Pairs:** `{running_volume, zone2_volume, training_volume} → vo2_peak`
- **Comment cites:** Bassett 2000

| Citation | Real paper | Topic match |
|---|---|---|
| Bassett 2000 | Bassett & Howley 2000 *Med Sci Sports Exerc* 32(1):70-84 "Limiting factors for maximum oxygen uptake and determinants of endurance performance" | Real and well-cited. But the paper is a **review of physiological ceilings on VO2max**, not a dose-response of volume → VO2peak. |

- **Verdict:** ⚠️ **PARTIAL**. The comment ("decades of exercise physiology") is correct in spirit, but Bassett 2000 specifically is about *why* VO2max has limits, not how much it moves per additional training hour. The real dose-response literature is Milanović 2015 (HIIT vs MICT meta) and Bouchard 2011 (HERITAGE).
- **Recommended action:** swap citation.

### Cluster 5 — Sleep duration → hormones (2 pairs)
- **Pairs:** `sleep_duration → {cortisol, testosterone}`
- **Comment cites:** "well-established restriction studies" (no specific citation)

- **Verdict:** ✅ **TOPIC VERIFIED** by Leproult 2011 (testosterone) and Van Cauter 1997 / Spiegel 1999 (cortisol). The comment is accurate but the specific papers aren't named.
- **Recommended action:** name the citations in the comment to match the sleep_debt cluster's.

---

## Summary table

| Source | DOI valid? | Topic match? | β verifiable from paper? | Status |
|---|---|---|---|---|
| Strain 2024 (×2) | ❌ | — | — | **fabricated** |
| Ekelund 2019 (×2) | ✅ | ❌ (mortality, not lipids) | ❌ | **wrong-topic** |
| Dempsey 2022 | ✅ | ❌ (CVD, not glucose) | ❌ | **wrong-topic** |
| Irwin 2016 | ✅ | ✅ | ⚠️ (not back-checked) | **verified (topic)** |
| Jefferis 2019 (×2) | ❌ | — (BRHS, not UKB) | — | **fabricated** |
| Whittaker 2023 | ⚠️ (wrong DOI) | ✅ (after fix, 2022) | ⚠️ (sign likely wrong) | **correct-DOI-and-re-check** |
| Allen 2002 | ⚠️ (wrong DOI) | ⚠️ | ❌ | **correct-DOI-and-re-check** |
| Ross 2016 | ✅ | ❌ (AHA statement, not meta) | ❌ | **wrong-source-for-claim** |
| Gabbett 2016 / Malone 2017 / Hulin 2014 | ✅ | ⚠️ (injury not biomarker) | — | **partial** |
| Van Cauter 1997 | ✅ | ✅ | — | **verified** |
| Leproult 2011 | ✅ | ✅ | — | **verified** |
| Kolla 2016 | ❌ (likely mis-cited) | — | — | **cannot locate** |
| Burgess 2003 | ✅ | ✅ | — | **verified** |
| Bassett 2000 | ✅ | ⚠️ (physiology review, not dose-response) | — | **partial** |

---

## Recommended next steps

1. **Immediate (safety):** flip the YAML `citation_status` values to reflect audit findings. Use new status values:
   - `verified` — DOI resolves, paper exists, topic matches, β plausibly derivable.
   - `verified_topic_only` — paper exists and is on-topic, but encoded β hasn't been back-checked against the paper text.
   - `wrong_doi` — DOI needs fixing; paper exists under different DOI.
   - `wrong_topic` — DOI resolves but paper doesn't support the claim.
   - `fabricated` — DOI unresolvable and no matching paper found.
2. **Before any YAML entry is wired into production blending:** either fix to `verified` or remove. Current gating in `literature_priors.py` already refuses `needs_verification`, so no live engine impact yet — but the YAML file is also an external artifact seen by researchers/collaborators and shouldn't sit in this state.
3. **UI badge:** soften copy from "literature-backed" to "mechanism-plausible" for the partial-match clusters (ACWR × biomarkers, zone2 × VO2peak), or narrow the `LITERATURE_BACKED` set to the 4 pairs that cleanly verify: `sleep_debt → {cortisol, glucose, testosterone}` and `travel_load → {deep_sleep, sleep_efficiency}`.
4. **If real literature priors are wanted:** commission a proper bibliography pass with paper PDF access, not agent reconstruction. Two Ekelund-era UKB accelerometer papers that probably *do* have usable slopes are Strain 2024 *Nat Med* "Wearable-device-measured physical activity and future health risk" (different DOI — `10.1038/s41591-023-02813-7`) and Ahmadi 2022 *Eur Heart J* "Vigorous physical activity, incident heart disease, and cancer" — either may replace several YAML entries after verification.
