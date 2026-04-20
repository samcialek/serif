# Serif SCM — Design Documents

## Current State (2026-04-16)

The Twin SCM engine is operational with:
- 54 structural edges across 6 causal pathways
- Piecewise-linear dose-response with 5 curve types
- Back-door/front-door identification
- Full (uncollapsed) counterfactual propagation with category grouping and tradeoff detection
- Information-theoretic affordance scoring (KL/EIG-based)
- Provider abstraction for TypeScript ↔ NumPyro backend swap
- NumPyro backend scaffold (model, curves, inference, counterfactual, API)

## Design Documents

| Document | Purpose |
|----------|---------|
| [regime-nodes-spec.md](regime-nodes-spec.md) | Full design spec for load nodes, regime nodes, new edges, engine changes |
| [decisions.md](decisions.md) | Architecture Decision Records — choices made and rationale |
| [open-questions.md](open-questions.md) | Unresolved questions requiring empirical data or further analysis |
| [experiment-forks.md](experiment-forks.md) | Concrete experiments to validate decisions and resolve questions |

## Quick Reference

### Regime Nodes (proposed)

| Node | Activates when | Affects |
|------|---------------|---------|
| overreaching_state | acwr > 1.5 | hscrp, cortisol, testosterone, hrv_daily |
| iron_deficiency_state | ferritin < 30 | hemoglobin, vo2_peak, rbc |
| sleep_deprivation_state | sleep_debt > 5 hrs | cortisol, testosterone, glucose |
| inflammation_state | hscrp > 3.0 | hdl, insulin_sensitivity |

### Key Decisions

| ADR | Decision | Status |
|-----|----------|--------|
| 001 | Additive (not multiplicative) regime composition | Decided |
| 002 | Sigmoid activation (not step function) | Decided |
| 003 | Load nodes stay exogenous for demo | Deferred |
| 004 | Regime nodes are category-less | Decided |
| 005 | Thresholds: edge param (1 edge) vs regime node (2+ edges) | Decided |
| 006 | Three-tier regime alert UX | Proposed |

### Implementation Dependencies

```
                EXP-001 (regime predictive value)
                    │
         ┌──────────┴──────────┐
         │                     │
    pass: implement       fail: abort
         │
    ┌────┴────┐
    │         │
  ADR-001   EXP-003 (sigmoid steepness)
  (additive)    │
    │      calibrate k
    │           │
  EXP-002    EXP-005 (identifiability)
  (additive     │
   vs mult)   ┌┴┐
              │  │
         identified  not identified
              │           │
         full impl   predictive only
```

## File Map

```
src/data/scm/
  types.ts                    # Core SCM types (StructuralEquation, Intervention, etc.)
  dagGraph.ts                 # DAG utilities (topo sort, paths, descendants)
  doseResponse.ts             # Curve evaluation, equation building
  twinEngine.ts               # Abduction → action → prediction
  identification.ts           # Back-door/front-door identification
  uncertainty.ts              # effN-based confidence intervals
  fullCounterfactual.ts       # Uncollapsed model, category grouping, tradeoffs
  provider.ts                 # SCMProvider interface + LocalTwinProvider + NumPyroProvider stub

src/data/dataValue/
  mechanismCatalog.ts         # 65 mechanisms, 54 structural edges, 8 latent nodes
  informationTheoreticScoring.ts  # KL/EIG-based affordance scoring

backend/serif_scm/
  model.py                    # NumPyro hierarchical model
  curves.py                   # JAX-differentiable dose-response
  inference.py                # MCMC/SVI runners
  counterfactual.py           # do-operator from posterior samples
  affordance.py               # Posterior-based EIG/KL
  api.py                      # FastAPI endpoints
  types.py                    # Pydantic models matching TS types
```
