# Architecture Decision Records — Serif SCM

## ADR-001: Additive vs Multiplicative Regime Effects

**Status:** Decided (2026-04-16)

**Context:** When a regime node (e.g., overreaching_state) affects a downstream biomarker, there are two ways to compose the effect with the existing direct causal edge:

- **Additive:** `Y = f_direct(X) + g_regime(R) + U`. The regime adds an independent term.
- **Multiplicative (mixture):** `Y = (1-R)·f_normal(X) + R·f_activated(X) + U`. The regime interpolates between two different structural equations.

**Decision:** Additive composition.

**Rationale:**
1. Works with the existing engine without modification. Regime nodes are just additional parents with linear or piecewise edges. No new equation types needed.
2. Identification is cleaner — each edge is independently identifiable via back-door/front-door criteria. Mixture equations create interaction terms that complicate identification.
3. Additive is a first-order approximation of the mixture. For moderate regime activations (R < 0.5), the two are nearly equivalent. The difference matters most at extreme activation (R → 1), which is exactly when the athlete should be intervening anyway.
4. Interpretability: "overreaching adds +1.8 to cortisol" is clearer than "overreaching shifts the training→cortisol curve from f_normal to f_activated."

**Consequence:** If empirical data shows strong interaction effects (the regime doesn't just add to the outcome but changes the slope of the direct relationship), we'll need to revisit and implement mixture equations. See [EXP-002](experiment-forks.md#exp-002).

**Alternative considered:** Multiplicative gating where `Y = f(X) · (1 + R · scale_factor)`. Rejected because it couples the regime effect to the baseline magnitude, which creates spurious amplification when the direct effect is already large.

---

## ADR-002: Sigmoid for Regime Activation (not Step Function)

**Status:** Decided (2026-04-16)

**Context:** Regime nodes activate when a cumulative quantity crosses a threshold. The activation function could be:
- Step function: R = 1 if X > θ, else 0
- Sigmoid: R = σ(k·(X − θ))
- Piecewise linear ramp: R = clamp((X − θ_low) / (θ_high − θ_low), 0, 1)

**Decision:** Sigmoid with tunable steepness (k parameter).

**Rationale:**
1. **Differentiability.** Required for NUTS in NumPyro. Step functions have zero gradient everywhere except at the discontinuity, which breaks gradient-based samplers.
2. **Biological realism.** Overreaching isn't binary. There's a gradual onset zone where the body is compensating but showing early signs. The sigmoid captures this graded activation.
3. **Steepness is learnable.** The k parameter controls how sharp the transition is. With enough data, NumPyro can infer whether overreaching onset is sharp (k=10, nearly binary) or gradual (k=2, wide transition zone). This is scientifically interesting.
4. **Subsumes the alternatives.** A sigmoid with k→∞ approximates a step function. With k≈1 it's nearly linear through the transition. One representation covers the spectrum.

**Consequence:** The TypeScript engine needs one new branch in `evaluateEdge` for the sigmoid curve type. The NumPyro backend uses `jax.nn.sigmoid` directly.

---

## ADR-003: Load Nodes as Exogenous vs Derived

**Status:** Deferred (2026-04-16)

**Context:** Quantities like `acwr`, `monotony`, and `training_consistency` already exist as dose families with pre-computed columns. They're treated as exogenous inputs — the DAG doesn't know how they're computed from training_volume.

Making them **derived nodes** within the DAG means:
- `training_volume → training_load_7d → acwr` would be explicit
- `do(training_volume = X)` would automatically update acwr
- The full causal chain is visible to the identification engine

Keeping them **exogenous** means:
- They're computed outside the DAG (in data preprocessing)
- `do(training_volume = X)` does NOT update acwr — you'd need a separate `do(acwr = Y)`
- Simpler DAG, fewer nodes to reason about

**Decision:** Deferred. Keep exogenous for the demo. Revisit when building the real data pipeline.

**Rationale:**
1. The temporal aggregation (rolling EMA) requires time-series data that the current demo SCM doesn't have — it operates on static snapshots.
2. Internalizing loads requires deciding on the aggregation function (EMA vs rolling sum vs exponential decay), window sizes, and how to handle missing data. These are empirical questions that should be answered with real data.
3. For the demo, manually setting `acwr = 1.7` in the observed values achieves the same end state as propagating `training_volume = 2000 → acwr = 1.7`.

**Revisit trigger:** When the NumPyro backend has access to Caspian's daily time series and can fit temporal aggregation parameters.

---

## ADR-004: Regime Nodes in the Category System

**Status:** Decided (2026-04-16)

**Context:** The four mechanism categories (metabolic, cardio, recovery, sleep) organize the 65 causal mechanisms. Where do regime nodes belong?

Options:
1. Each regime node gets its own category ("regime")
2. Regime nodes inherit categories from their downstream effects
3. Regime nodes are category-less (infrastructure nodes)

**Decision:** Option 3 — category-less. Regime nodes don't appear in category summaries. Their downstream *effects* appear in the appropriate categories.

**Rationale:** `overreaching_state` isn't metabolic or recovery — it's a state that affects both. Putting it in one category misleads. Its effects on cortisol show up in metabolic; its effects on HRV show up in recovery. The regime node itself is scaffolding.

**Consequence:** `getCategoriesForNode('overreaching_state')` returns `[]`. The node won't appear in category summaries but WILL appear in tradeoff detection (since its downstream effects span categories).

---

## ADR-005: Threshold Ownership — Edge vs Node

**Status:** Decided (2026-04-16)

**Context:** For each theta in the system, who owns it? Three patterns:

| Pattern | Theta lives in | Interventable? | Shared? |
|---------|---------------|----------------|---------|
| Edge parameter (current) | StructuralEquation.theta | No | No — each edge has its own |
| Regime node (new) | Sigmoid activation | Yes — via parents | Yes — one node gates multiple edges |
| Context-dependent (future) | Function of other nodes | Yes — via parents | Depends |

**Decision:** Both patterns coexist. Simple biological thresholds stay as edge parameters. Thresholds that are shared across multiple downstream effects OR that depend on other variables become regime nodes.

**Heuristic for choosing:**
- If the threshold affects exactly 1 edge → edge parameter
- If the threshold affects 2+ edges simultaneously → regime node
- If the threshold depends on other DAG variables → regime node (or context-dependent, see [OQ-003](open-questions.md#oq-003))
- If you want to ask "what if the threshold were different?" → regime node

---

## ADR-006: Regime Alert UX Pattern

**Status:** Proposed (2026-04-16)

**Context:** When a counterfactual triggers a regime activation (e.g., proposed training volume would put acwr above 1.5), the UI should communicate this clearly.

**Decision:** Three-tier alert in the WhatIfSimulator:

1. **Green (< 25% activation):** No alert. Regime node exists in the full state but doesn't surface.
2. **Amber (25-75% activation):** Warning banner: "Approaching overreaching threshold (X% activation). Consider monitoring hscrp and testosterone."
3. **Red (> 75% activation):** Alert with reversal suggestion: "Overreaching state active (X%). This amplifies negative effects on N markers. Reducing training_volume below Z would exit this regime."

The "reversal suggestion" requires inverse propagation — finding the intervention value that brings the regime node below 25%. This is a bisection search over `do(parent = x)` → `regime_node < 0.25`.

**Status:** Proposed — needs UX validation in the actual demo flow.
