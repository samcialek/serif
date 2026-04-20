# Open Questions — Serif SCM

## OQ-001: Regime Transition Hysteresis

**Priority:** High  
**Affects:** Regime node design, counterfactual accuracy

Biological regime transitions often exhibit hysteresis — it's easier to enter an overreached state than to exit it. The current sigmoid model is symmetric: activation at acwr=1.7 is the same whether you're ramping up or recovering.

Real physiology: it might take acwr > 1.5 to enter overreaching, but acwr < 1.2 to fully recover (the body doesn't snap back at 1.5). This is a state-dependent threshold.

**Options:**
1. Ignore hysteresis in the demo. The sigmoid is a reasonable first approximation.
2. Model hysteresis with a history-dependent activation: `R_t = max(R_{t-1} - decay, σ(k·(X_t - θ)))`. The regime persists with exponential decay even after the trigger subsides.
3. Two-threshold model: `R_enter = σ(k·(X - θ_enter))`, `R_exit = σ(k·(θ_exit - X))`, `R = R_enter AND NOT R_exit`.

**Current lean:** Option 1 for the demo, Option 2 for NumPyro backend (the decay rate becomes a learnable parameter).

**Blocked on:** Need empirical data on overreaching recovery timelines. Meeusen et al. 2013 suggests functional overreaching resolves in days-weeks, non-functional overreaching in weeks-months. The decay rate captures this.

---

## OQ-002: Iron Balance as a Running Counter

**Priority:** Medium  
**Affects:** Load node implementation, iron pathway accuracy

Iron depletion is cumulative — each high-mileage week draws down iron stores. But the current model treats `running_volume → iron_total` as a static dose-response. A 200 km/month runner who just started has different iron dynamics than one who's been at 200 km/month for a year.

An `iron_balance` load node would track:
```
iron_balance_t = iron_balance_{t-1} + absorption(diet_t) - depletion(running_t) - menstrual_loss - ...
```

**Questions:**
- What's the depletion rate per km? Literature suggests 0.3-0.5 mg/day for female runners (Sim et al. 2019), but this varies enormously with foot-strike pattern, surface, and shoe cushioning.
- How does iron_balance relate to ferritin? Ferritin is a biomarker of iron stores, not iron balance itself. The mapping is nonlinear — ferritin drops slowly until stores are depleted, then crashes.
- Should iron_balance be a latent node or a derived node? It's not directly observed (no blood test for total body iron), but it could be inferred from sequential ferritin measurements.

**Current lean:** Keep as a latent node estimated by NumPyro from the ferritin time series. Too much uncertainty for a deterministic derived node.

---

## OQ-003: Context-Dependent Thresholds

**Priority:** Medium  
**Affects:** Regime node design, DAG structure

The regime-nodes-spec treats thresholds as fixed (overreaching at acwr=1.5). But thresholds vary between individuals and even within an individual over time:
- An elite athlete might tolerate acwr=1.8 before overreaching
- Sleep deprivation lowers the overreaching threshold
- Iron-deficient athletes overreach at lower loads

This means θ itself is a function of other DAG variables:
```
θ_overreaching = f(sleep_quality, iron_status, age, training_age)
```

**Options:**
1. Fixed θ per athlete, calibrated from their data. Simple, interpretable.
2. θ as a deterministic function of other nodes. Adds edges to the DAG.
3. θ as a latent variable with its own prior in NumPyro. The posterior gives the athlete's personal threshold with uncertainty.

**Current lean:** Option 1 for the TypeScript demo. Option 3 for NumPyro — let the model learn each athlete's personal threshold from their data. This is one of the most valuable outputs the Bayesian backend can provide.

---

## OQ-004: Regime Interaction Effects

**Priority:** Low (theoretical)  
**Affects:** Long-term model architecture

Can two regime states interact? For example:
- Overreaching AND sleep-deprived simultaneously might be worse than the sum of their independent effects
- Iron-deficient AND overreaching creates a vicious cycle (overreaching depletes iron faster, iron deficiency lowers the overreaching threshold)

The current additive model (ADR-001) doesn't capture these interactions. A multiplicative interaction term would:
```
Y = f(X) + g_R1(R1) + g_R2(R2) + h(R1, R2) + U
```

where h(R1, R2) is the interaction term.

**Current lean:** Don't model regime interactions in the demo. The additive approximation is sufficient. If NumPyro posterior predictive checks show systematic residuals when multiple regimes are active, add interaction terms then.

**Evidence needed:** At least one case where the additive model makes a clinically wrong prediction that the interaction model would correct.

---

## OQ-005: Temporal Resolution for Load Computation

**Priority:** Medium  
**Affects:** Load node implementation

Load nodes require temporal aggregation. But what temporal resolution?

- **Daily aggregates** (current demo): rolling averages over daily summaries. Good for training load, sleep debt.
- **Intra-day dynamics**: acute cortisol response to a single workout, glucose spikes after meals. Required for CGM data.
- **Multi-week trends**: ferritin depletion, fitness adaptation, body composition change.

The DAG currently operates at one temporal scale (daily snapshots). Load nodes implicitly introduce multiple scales (7-day, 28-day windows). This creates a mismatch — a "28-day training load" can't be updated by a single day's intervention.

**Options:**
1. Pre-compute all load nodes before the engine runs. The engine operates on a single time slice with pre-aggregated loads. (Current approach)
2. Multi-scale engine: separate DAGs for different time horizons, with load nodes as bridges.
3. State-space model: the DAG has memory, with each node's value depending on its own history plus parent contributions.

**Current lean:** Option 1 for the demo. Option 3 is the real answer — NumPyro can model state-space dynamics natively with `scan` over time.

---

## OQ-006: Regime Node Identification

**Priority:** High  
**Affects:** Causal credibility of regime effects

How do we identify the causal effect of a regime node? The regime itself isn't randomly assigned — it's determined by the load that triggers it. This is the fundamental problem of endogeneity in regime models.

Strategies:
1. **Natural experiments:** Training camps or injuries create sharp transitions in training load. If biomarkers shift at the predicted acwr threshold, that's supporting evidence.
2. **Mendelian randomization:** Genetic instruments for iron absorption create exogenous variation in iron_balance, allowing causal identification of iron_deficiency_state effects.
3. **Regression discontinuity:** If the athlete hovers near the threshold, compare outcomes just above vs just below acwr=1.5.
4. **Posterior predictive checks:** If the regime model predicts biomarker trajectories better than the no-regime model (measured by ELPD or WAIC), that's model-selection evidence — not causal identification, but useful.

**Current lean:** Strategy 4 for the demo (model comparison). Strategies 1-3 require more data and specific experimental setups.

---

## OQ-007: How Many Regime Nodes?

**Priority:** Medium  
**Affects:** Model complexity, interpretability

The spec proposes 4 regime nodes. But the space of possible regimes is larger:
- Glycogen depletion state (low carbs + high training)
- Dehydration state (high training + low fluid intake)
- Circadian disruption state (jet lag + irregular bedtime)
- Vitamin D deficiency state (winter + indoor training)
- Relative Energy Deficiency in Sport (RED-S)

**Criteria for adding a regime node:**
1. Must gate 2+ downstream edges simultaneously (ADR-005)
2. Must have a plausible biological threshold with literature support
3. Must be identifiable from available data (observed or inferable from biomarkers)
4. Must change the model's predictive accuracy (posterior predictive check)

**Current lean:** Start with 4. Add more only when the NumPyro model comparison shows the additional regime improves predictions.
