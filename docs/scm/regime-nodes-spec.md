# Regime Nodes & Cumulative Loads — Design Specification

## Problem Statement

The current DAG represents dose-response relationships as piecewise-linear edge equations with a fixed threshold (theta). This captures "slope changes at a point" but misses two important causal structures:

1. **Cumulative loads** — quantities like training fatigue, iron balance, and sleep debt that accumulate over time and have different causal effects than their instantaneous components. "Yesterday's run" ≠ "three weeks of overreaching."

2. **Regime switches** — qualitative state changes where crossing a threshold doesn't just change the slope but fundamentally alters which downstream mechanisms are active. An athlete in an overreached state has a different causal graph than a fresh one.

The existing theta-in-the-edge approach works for static biological constants (VO2 plateau). It breaks down when:
- The threshold depends on other DAG variables (iron depletion threshold depends on dietary iron)
- One threshold gates multiple downstream effects simultaneously (overreaching affects iron, testosterone, cortisol, HRV)
- You want to intervene on the threshold itself ("what if I could raise my overreaching threshold by sleeping more?")

## Architecture

### Three Node Types

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OBSERVED / EXOGENOUS                        │
│  training_volume, running_volume, sleep_duration, ferritin, ...     │
│  (directly measured or externally computed)                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────────┐
│    LOAD NODES        │         │   REGIME NODES           │
│  (deterministic      │         │  (sigmoid activation)    │
│   temporal agg.)     │         │                          │
│                      │         │  overreaching_state      │
│  training_load_7d    │────────▶│  iron_deficiency_state   │
│  training_load_28d   │         │  sleep_deprivation_state │
│  iron_balance        │         │  inflammation_state      │
│  cumulative_run_28d  │         └───────────┬─────────────┘
└──────────────────────┘                     │
                                             │ moderates downstream
                                             ▼
                               ┌─────────────────────────┐
                               │   BIOMARKER OUTCOMES     │
                               │  hscrp, cortisol,        │
                               │  testosterone, hrv, ...  │
                               └─────────────────────────┘
```

### Load Nodes

Deterministic derived quantities computed from time-series data before the engine runs. They are **not stochastic** — given the input time series, their value is fixed.

| Node | Computation | Window | Parents |
|------|------------|--------|---------|
| `training_load_7d` | EMA of daily TRIMP, α = 2/8 | 7 days | training_load (daily) |
| `training_load_28d` | EMA of daily TRIMP, α = 2/29 | 28 days | training_load (daily) |
| `cumulative_run_28d` | Rolling sum of daily run km | 28 days | running_volume |
| `iron_balance` | depletion(cumulative_run_28d) − absorption(dietary_iron) | rolling | cumulative_run_28d, dietary_iron |

**Note:** `acwr`, `monotony`, and `training_consistency` already exist as dose families with computed columns. They stay as exogenous inputs for now. See [ADR-003](decisions.md#adr-003) for the decision on whether to internalize them.

### Regime Nodes

Soft activation nodes that represent qualitative physiological states. Computed via sigmoid during DAG propagation.

| Node | Activation | θ (midpoint) | k (steepness) | Parents |
|------|-----------|--------------|---------------|---------|
| `overreaching_state` | σ(k·(acwr − θ)) | 1.5 | 5.0 | acwr |
| `iron_deficiency_state` | σ(k·(θ − ferritin)) | 30 ng/mL | 0.2 | ferritin |
| `sleep_deprivation_state` | σ(k·(sleep_debt − θ)) | 5 hrs | 1.0 | sleep_debt |
| `inflammation_state` | σ(k·(hscrp − θ)) | 3.0 mg/L | 2.0 | hscrp |

The **inverse sigmoid** for iron_deficiency_state (note θ − ferritin, not ferritin − θ) means activation increases as ferritin drops below 30.

### Downstream Regime Effects

Regime nodes enter downstream structural equations as additive parents. When `overreaching_state ≈ 0`, its contribution is zero. When `≈ 1`, it adds the full regime effect.

```
Y = Σ f_piecewise(parent_i) + Σ g_regime(regime_j) + U_Y
```

where `g_regime(R) = effect_coefficient × R` (a linear edge from regime node to outcome).

## New Structural Edges

### Load Node Edges (4 new)

```typescript
// Load computation (derived from temporal aggregation)
{ source: 'running_volume',     target: 'cumulative_run_28d',  edgeType: 'causal' },
{ source: 'cumulative_run_28d', target: 'iron_balance',        edgeType: 'causal' },
{ source: 'dietary_iron',       target: 'iron_balance',        edgeType: 'causal' },
{ source: 'training_load',      target: 'training_load_7d',    edgeType: 'causal' },
```

### Regime Activation Edges (4 new, sigmoid curve type)

```typescript
// Regime activation (sigmoid structural equations)
{ source: 'acwr',       target: 'overreaching_state',       edgeType: 'causal' },
{ source: 'ferritin',   target: 'iron_deficiency_state',    edgeType: 'causal' },
{ source: 'sleep_debt', target: 'sleep_deprivation_state',  edgeType: 'causal' },
{ source: 'hscrp',      target: 'inflammation_state',       edgeType: 'causal' },
```

### Regime → Outcome Edges (12 new)

```typescript
// Overreaching effects
{ source: 'overreaching_state', target: 'hscrp',        edgeType: 'causal' },
{ source: 'overreaching_state', target: 'cortisol',     edgeType: 'causal' },
{ source: 'overreaching_state', target: 'testosterone',  edgeType: 'causal' },
{ source: 'overreaching_state', target: 'hrv_daily',    edgeType: 'causal' },

// Iron deficiency effects
{ source: 'iron_deficiency_state', target: 'hemoglobin', edgeType: 'causal' },
{ source: 'iron_deficiency_state', target: 'vo2_peak',   edgeType: 'causal' },
{ source: 'iron_deficiency_state', target: 'rbc',        edgeType: 'causal' },

// Sleep deprivation effects
{ source: 'sleep_deprivation_state', target: 'cortisol',     edgeType: 'causal' },
{ source: 'sleep_deprivation_state', target: 'testosterone',  edgeType: 'causal' },
{ source: 'sleep_deprivation_state', target: 'glucose',       edgeType: 'causal' },

// Inflammation cascade
{ source: 'inflammation_state', target: 'hdl',          edgeType: 'causal' },
{ source: 'inflammation_state', target: 'insulin_sensitivity', edgeType: 'causal' },
```

### Total: 20 new edges (4 load + 4 activation + 12 downstream)

Current: 54 edges → New: 74 edges

## Engine Changes Required

### 1. Add `sigmoid` curve type

In `src/data/scm/doseResponse.ts`:

```typescript
type CurveType = 'linear' | 'plateau_up' | 'plateau_down' | 'v_min' | 'v_max' | 'sigmoid'

function evaluateEdge(dose: number, eq: StructuralEquation): number {
  if (eq.curveType === 'sigmoid') {
    // ba = max activation level (usually 1.0)
    // bb = steepness (k), can be negative for inverse sigmoid
    // theta = midpoint
    return eq.ba / (1 + Math.exp(-eq.bb * (dose - eq.theta)))
  }
  // ... existing piecewise logic
}
```

### 2. Register regime nodes in mechanism catalog

New entries in `STRUCTURAL_EDGES`, `LATENT_NODES` (since regime states aren't directly observed), and `NODE_TO_COLUMNS` (empty arrays for regime nodes).

### 3. No changes to the twin engine

The propagation logic (`propagateCounterfactual`) already:
- Walks topological order ✓
- Evaluates all incoming edges via `evaluateEdge` ✓
- Sums parent contributions ✓
- Adds exogenous noise ✓

Since regime nodes are just nodes with sigmoid incoming edges and linear outgoing edges, the engine handles them without modification. The sigmoid is evaluated during the forward pass like any other edge.

### 4. Smooth curves for NumPyro

The `backend/serif_scm/curves.py` already has `soft_piecewise`. Add:

```python
def sigmoid_activation(dose, theta, steepness, max_activation=1.0):
    return max_activation * jax.nn.sigmoid(steepness * (dose - theta))
```

JAX sigmoid is already smooth and differentiable — no approximation needed.

## Concrete Example: do(training_volume = 2000 min/month)

### Without regime nodes (current)
```
training_volume = 2000
  → cortisol: +2.1 (piecewise, above θ=1354)
  → testosterone: -45 (piecewise, above θ=1354)
  → wbc: +0.8
  → ast: +5.2
```
These are independent edge effects with no interaction.

### With regime nodes (proposed)
```
training_volume = 2000
  → acwr: 1.7 (externally computed)
  → overreaching_state: σ(5·(1.7-1.5)) = 0.73

  → cortisol: +2.1 (direct piecewise)
              +1.8 (overreaching regime × 0.73)
              = +3.9 total

  → testosterone: -45 (direct piecewise)
                  -25 (overreaching regime × 0.73)
                  = -70 total

  → hrv_daily: -2.1 (via sleep chain)
               -4.5 (overreaching regime × 0.73)
               = -6.6 total

  → hscrp: +0.5 (direct)
           +1.2 (overreaching regime × 0.73)
           = +1.7 total → inflammation_state: σ(2·(1.7-3.0)) = 0.07 (not yet activated)
```

The regime node amplifies the overreaching signal across multiple outcomes simultaneously, which the independent edge model can't capture.

## Visualization

The WhatIfSimulator category summary would show:

```
[Metabolic] 8 markers, -35.2 net    ⚠ OVERREACHING (73%)
[Cardio]    2 markers, -1.4 net
[Recovery]  4 markers, -12.8 net    ⚠ OVERREACHING (73%)
[Sleep]     1 marker,  -0.3 net

⚖ Tradeoffs:
  Training increases VO2 potential (+1.2) but overreaching degrades
  testosterone (-70), cortisol (+3.9), HRV (-6.6)

🔴 Regime alert: Overreaching state at 73% activation
   → Consider reducing training_volume below 1500 min/month to exit regime
```

## Implementation Order

| Step | Description | Depends on |
|------|------------|-----------|
| 1 | Add `sigmoid` to CurveType and evaluateEdge | — |
| 2 | Add regime and load node entries to STRUCTURAL_EDGES | step 1 |
| 3 | Add regime structural equations (sigmoid params) to edgeSummaryRaw or inline | step 2 |
| 4 | Update fullCounterfactual category mapping for regime nodes | step 2 |
| 5 | Add regime alert to WhatIfSimulator UI | step 4 |
| 6 | Add sigmoid to NumPyro curves.py | — |
| 7 | Validate with verification script: do(training_volume=2000) triggers overreaching | steps 1-3 |
