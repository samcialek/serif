# Experiment Forks — Serif SCM

Concrete experiments to validate design decisions and resolve open questions. Each experiment has a clear hypothesis, methodology, and success criterion.

---

## EXP-001: Regime Node Predictive Improvement

**Tests:** Do regime nodes improve counterfactual accuracy?  
**Related:** [OQ-006](open-questions.md#oq-006), [OQ-007](open-questions.md#oq-007)

### Hypothesis
The regime model (with overreaching_state, iron_deficiency_state) produces more accurate counterfactual predictions than the flat model (current, no regime nodes) when the athlete crosses a physiological threshold.

### Method
1. Split Oron's time series into train (first 80%) and test (last 20%).
2. Fit both models (flat, regime) on the training set.
3. For each week in the test set:
   - Use factual observed values at t-1 to predict biomarkers at t.
   - Compare predictions to actual values.
4. Stratify by regime activation: compare error specifically during periods where acwr > 1.3.

### Success Criterion
Regime model has lower RMSE on biomarker predictions during high-acwr periods, with no worse performance during normal periods. Specifically:
- Δ RMSE(hscrp) > 0.2 mg/L improvement during overreaching periods
- Δ RMSE(testosterone) > 20 ng/dL improvement during overreaching periods
- < 5% RMSE degradation on all markers during normal periods

### Fork
- If success: keep all 4 regime nodes, proceed to implementation.
- If regime model helps for overreaching but not iron deficiency: keep overreaching_state, drop iron_deficiency_state until more lab data available.
- If no improvement: abort regime nodes entirely, keep thresholds as edge parameters.

---

## EXP-002: Additive vs Multiplicative Regime Composition

**Tests:** [ADR-001](decisions.md#adr-001) — is additive composition sufficient?  
**Related:** [OQ-004](open-questions.md#oq-004)

### Hypothesis
Additive regime effects (`Y = f(X) + g(R) + U`) produce predictions within 10% of multiplicative (`Y = (1-R)·f_normal(X) + R·f_activated(X) + U`) for regime activations below 75%.

### Method
1. Implement both composition modes in the NumPyro backend (branch off `model.py`).
2. Generate synthetic data from the multiplicative (ground truth) model with known parameters.
3. Fit the additive model to the synthetic data.
4. Compare recovered counterfactual effects at various regime activation levels (R = 0.1, 0.25, 0.5, 0.75, 0.9).

### Success Criterion
Additive model's counterfactual predictions are within 10% relative error of the multiplicative ground truth for R < 0.75. Beyond R = 0.75, document the divergence.

### Fork
- If < 10% error at R < 0.75: ADR-001 stands, keep additive.
- If > 10% error even at R < 0.5: implement multiplicative. This requires a new equation type in the engine.
- If the divergence only matters at R > 0.9 (extreme regime): keep additive but add a UI warning at high activation.

---

## EXP-003: Sigmoid Steepness Calibration

**Tests:** What steepness (k) values produce realistic regime transitions?  
**Related:** [ADR-002](decisions.md#adr-002)

### Hypothesis
The biologically appropriate steepness for overreaching_state is between k=3 and k=8 (transition zone of roughly ±0.3 acwr units around the threshold).

### Method
1. Collect published overreaching biomarker data from Meeusen et al. 2013, Halson & Jeukendrup 2004, and Cadegiani & Kater 2017.
2. Plot acwr (or training load proxy) against biomarker deviations.
3. Fit sigmoid to the observed transition pattern.
4. Compare different k values against the empirical transition width.

### Success Criterion
The fitted k produces a transition zone that matches the literature's observed "gray zone" where some athletes show overreaching symptoms and others don't. This is typically acwr 1.3-1.8 (±0.25 around θ=1.5).

### Fork
- If k = 3-5: gradual transition, consistent with individual variation in resilience.
- If k = 8-15: sharp transition, suggesting overreaching is more binary than expected. Consider step function approximation for the TS demo (keep sigmoid for NumPyro).
- If no consistent k across studies: make k athlete-specific (learnable parameter in NumPyro).

---

## EXP-004: Internalized vs Exogenous Load Nodes

**Tests:** [ADR-003](decisions.md#adr-003) — does internalizing acwr as a derived node improve counterfactual coherence?  
**Related:** [OQ-005](open-questions.md#oq-005)

### Hypothesis
When training_volume is intervened on (`do(training_volume = X)`), the model with internalized acwr (`training_volume → acwr`) produces more coherent multi-target counterfactuals than the exogenous model (acwr unchanged).

### Method
1. **Exogenous model:** `do(training_volume = 2000)` with acwr held at its observed value.
2. **Internalized model:** `do(training_volume = 2000)` with acwr recomputed as `acwr = f(training_volume_7d, training_volume_28d)`.
3. Run both models. Compare:
   - Whether overreaching_state activates appropriately
   - Whether hscrp, cortisol, testosterone predictions are physiologically consistent
   - Whether the internalized model produces a single coherent "story" vs the exogenous model's disconnected predictions

### Success Criterion
Qualitative: does an endurance sports physiologist reviewing the two sets of predictions identify the internalized model as more physiologically coherent? (Expert evaluation, not a statistical test.)

### Fork
- If coherence clearly better: internalize acwr and monotony as derived nodes. Requires temporal aggregation in the engine.
- If similar: keep exogenous (simpler). The demo can manually set acwr to match the training_volume intervention.
- If internalized model is worse (propagation errors accumulate): investigate whether the temporal aggregation function is wrong, not the architecture.

---

## EXP-005: Regime Node Identifiability from Observational Data

**Tests:** [OQ-006](open-questions.md#oq-006) — can we distinguish regime effects from edge-parameter effects?  
**Related:** [OQ-003](open-questions.md#oq-003)

### Hypothesis
Given 12+ months of daily data with at least 2 excursions above the overreaching threshold, the NumPyro model can recover the regime parameters (θ, k, and downstream effect sizes) with posterior credible intervals that exclude zero.

### Method
1. Generate synthetic data from a known regime model (θ=1.5, k=5, overreaching effects on 4 markers).
2. Fit the NumPyro regime model. Check parameter recovery.
3. Fit a no-regime model (just piecewise edges). Compare ELPD.
4. Repeat with Oron's actual data. Check whether posterior θ and k are identifiable (credible intervals don't span the entire prior range).

### Success Criterion
- Synthetic: parameters recovered within 20% of ground truth.
- Real data: posterior for θ_overreaching has 90% CI width < 0.5 acwr units.
- ELPD comparison favors regime model by > 2 standard errors.

### Fork
- If identifiable: regime nodes are causally grounded. Proceed with full implementation.
- If θ is identifiable but k isn't: fix k at a literature-derived value, learn only θ.
- If neither identifiable: regime nodes are at best predictive scaffolding, not causal. Document this honestly in the UI — show regime predictions but label them as "hypothesized, not causally identified."

---

## EXP-006: Iron Deficiency Regime vs Continuous Ferritin Effect

**Tests:** Does iron_deficiency_state add value beyond the existing ferritin → hemoglobin → vo2_peak chain?

### Hypothesis
Below ferritin=30, the relationship between ferritin and downstream markers is qualitatively different (steeper, affecting more targets) than above 30. A regime node captures this better than a single piecewise curve.

### Method
1. From Oron's bloodwork, split data points into ferritin < 30 and ferritin ≥ 30.
2. Fit separate piecewise models for each group.
3. Compare: are the slopes (bb, ba) statistically different between groups?
4. Fit the regime model and compare ELPD against the no-regime model.

### Success Criterion
The piecewise slopes differ by > 50% between the two groups for at least 2 downstream markers (hemoglobin, vo2_peak, rbc).

### Fork
- If slopes clearly differ: iron_deficiency_state captures real nonlinearity. Keep it.
- If slopes are similar: the existing continuous piecewise model is sufficient. Remove iron_deficiency_state — it adds complexity without accuracy.
- If too few data points below 30 to tell: defer until monthly labs provide more low-ferritin observations. Flag this as a reason monthly labs are high-value (connects to IT scoring).

---

## EXP-007: Multi-Regime Counterfactual Coherence

**Tests:** When multiple regimes are active simultaneously, are the combined predictions physiologically plausible?

### Hypothesis
An athlete who is simultaneously overreaching (acwr > 1.5) and sleep-deprived (debt > 5 hrs) should show compounding negative effects on cortisol, testosterone, and HRV that are worse than either regime alone.

### Method
1. Run counterfactual: `do(training_volume=2000, sleep_duration=5)` — should activate both overreaching and sleep deprivation.
2. Run single-regime counterfactuals separately.
3. Check: combined effects ≥ max(single regime effects) for shared targets (cortisol, testosterone).
4. Review with sports medicine literature on combined stressors (Meeusen 2013, Halson 2014).

### Success Criterion
- Combined cortisol effect is at least 80% of sum of individual regime effects.
- No markers show paradoxical improvement when both regimes are active.
- Literature review confirms the direction and approximate magnitude of combined effects.

### Fork
- If coherent: additive composition is sufficient for multi-regime scenarios.
- If paradoxical results: need interaction terms ([OQ-004](open-questions.md#oq-004)).
- If magnitudes are unrealistic (effects too large): need ceiling effects or saturation in regime edges.
