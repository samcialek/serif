"""Python point-estimate SCM engine.

Port of the TypeScript twin engine (twinEngine.ts) for running
counterfactual queries without MCMC posteriors. Uses the same
abduction-action-prediction pattern with point estimates.

This is the engine that runs the synthetic data through the SCM
to produce per-participant causal effects.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from collections import defaultdict

from .synthetic.config import (
    DOSE_COLUMN_MAP, TARGET_COLUMN_MAP,
    BIOMARKER_PRIORS, WEARABLE_PRIORS,
)
from .synthetic.generator import load_edges, evaluate_edge, REGIME_EDGE_DEFS


# ── Edge loading and normalization ─────────────────────────────────

# Maps edge source/target column names -> node names
# (Mirrors the TypeScript COLUMN_TO_NODE / resolveNodeId logic)

SOURCE_COL_TO_NODE: dict[str, str] = {
    "daily_run_km":          "running_volume",
    "daily_duration_min":    "training_volume",
    "daily_zone2_min":       "zone2_volume",
    "daily_trimp":           "training_load",
    "steps":                 "steps",
    "active_energy_kcal":    "active_energy",
    "sleep_duration_hrs":    "sleep_duration",
    "bedtime_hour":          "bedtime",
    "last_workout_end_hour": "workout_time",
    "sleep_debt_14d":        "sleep_debt",
    "acwr":                  "acwr",
    "training_consistency":  "training_consistency",
    "travel_load":           "travel_load",
    "dietary_protein_g":     "dietary_protein",
    "dietary_energy_kcal":   "dietary_energy",
    "ferritin_smoothed":     "ferritin",
    "omega3_index_derived":  "omega3_index",
    "homocysteine_smoothed": "homocysteine",
    # Regime sources (already node names)
    "ferritin":              "ferritin",
    "hscrp":                 "hscrp",
    "sleep_debt":            "sleep_debt",
    # Regime states (already node names)
    "overreaching_state":       "overreaching_state",
    "iron_deficiency_state":    "iron_deficiency_state",
    "sleep_deprivation_state":  "sleep_deprivation_state",
    "inflammation_state":       "inflammation_state",
}


def resolve_source(col: str) -> str:
    return SOURCE_COL_TO_NODE.get(col, col)


def resolve_target(col: str) -> str:
    return TARGET_COLUMN_MAP.get(col, col)


# ── Structural equation representation ─────────────────────────────

class Equation:
    """One structural equation: source -> target with dose-response parameters."""
    __slots__ = ("source", "target", "curve", "theta", "bb", "ba", "eff_n", "personal_pct")

    def __init__(self, source: str, target: str, curve: str,
                 theta: float, bb: float, ba: float,
                 eff_n: float = 1, personal_pct: float = 0):
        self.source = source
        self.target = target
        self.curve = curve
        self.theta = theta
        self.bb = bb
        self.ba = ba
        self.eff_n = eff_n
        self.personal_pct = personal_pct

    def evaluate(self, dose: float) -> float:
        return evaluate_edge(dose, self.theta, self.bb, self.ba, self.curve)

    def sensitivity(self, dose: float) -> float:
        """Local derivative at the given dose."""
        if self.curve == "sigmoid":
            sig = 1.0 / (1.0 + math.exp(-self.bb * (dose - self.theta)))
            return self.ba * self.bb * sig * (1.0 - sig)
        return self.bb if dose <= self.theta else self.ba

    def __repr__(self) -> str:
        return f"Eq({self.source}->{self.target}, {self.curve}, theta={self.theta})"


def build_equations() -> list[Equation]:
    """Load fitted edges + regime equations, resolve to node-level, deduplicate."""
    raw_edges = load_edges()
    seen: dict[str, Equation] = {}

    for e in raw_edges:
        src = resolve_source(e["source"])
        tgt = resolve_target(e["target"])
        key = f"{src}->{tgt}"

        eq = Equation(
            source=src, target=tgt,
            curve=e.get("curve", "linear"),
            theta=e.get("theta", 0),
            bb=e.get("bb", 0),
            ba=e.get("ba", 0),
            eff_n=e.get("eff_n", 1),
            personal_pct=e.get("personal_pct", 0),
        )

        existing = seen.get(key)
        if existing is None or eq.eff_n > existing.eff_n:
            seen[key] = eq

    return list(seen.values())


def build_equations_by_target(equations: list[Equation]) -> dict[str, list[Equation]]:
    by_target: dict[str, list[Equation]] = defaultdict(list)
    for eq in equations:
        by_target[eq.target].append(eq)
    return dict(by_target)


# ── Topological sort ───────────────────────────────────────────────

def topological_sort(equations: list[Equation]) -> list[str]:
    """Kahn's algorithm for topological ordering of the DAG."""
    # Collect all nodes
    all_nodes: set[str] = set()
    children: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = defaultdict(int)

    for eq in equations:
        all_nodes.add(eq.source)
        all_nodes.add(eq.target)
        children[eq.source].append(eq.target)
        in_degree[eq.target] = in_degree.get(eq.target, 0) + 1

    # Initialize in-degree for root nodes
    for node in all_nodes:
        if node not in in_degree:
            in_degree[node] = 0

    # Kahn's BFS
    queue = sorted([n for n in all_nodes if in_degree[n] == 0])
    order = []

    while queue:
        node = queue.pop(0)
        order.append(node)
        for child in sorted(set(children.get(node, []))):
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    return order


def get_descendants(node: str, equations: list[Equation]) -> set[str]:
    """All nodes reachable downstream from node in the DAG."""
    children: dict[str, set[str]] = defaultdict(set)
    for eq in equations:
        children[eq.source].add(eq.target)

    visited: set[str] = set()
    stack = list(children.get(node, set()))
    while stack:
        n = stack.pop()
        if n in visited:
            continue
        visited.add(n)
        stack.extend(children.get(n, set()))
    return visited


# ── Abduction-Action-Prediction ────────────────────────────────────

def abduce_noise(
    observed: dict[str, float],
    equations: list[Equation],
    topo_order: list[str],
) -> dict[str, float]:
    """Step 1: Infer exogenous noise U_j for each node.

    U_j = observed_j - SUM(parent contributions)
    Root nodes: U_j = observed_j
    Unobserved nodes: U_j = 0
    """
    eq_by_target = build_equations_by_target(equations)
    world: dict[str, float] = {}
    noise: dict[str, float] = {}

    for node in topo_order:
        parent_eqs = eq_by_target.get(node, [])

        if not parent_eqs:
            # Root node
            val = observed.get(node, 0.0)
            world[node] = val
            noise[node] = val
            continue

        # Compute parent contribution
        parent_sum = 0.0
        for eq in parent_eqs:
            parent_val = world.get(eq.source, observed.get(eq.source, 0.0))
            parent_sum += eq.evaluate(parent_val)

        obs_val = observed.get(node)
        if obs_val is not None:
            world[node] = obs_val
            noise[node] = obs_val - parent_sum
        else:
            # Latent node: no observation to anchor
            world[node] = parent_sum
            noise[node] = 0.0

    return noise


def propagate_counterfactual(
    interventions: dict[str, float],
    noise: dict[str, float],
    observed: dict[str, float],
    equations: list[Equation],
    topo_order: list[str],
) -> dict[str, float]:
    """Steps 2+3: Apply do(X=x') and propagate through counter world.

    Intervened nodes get their fixed value (incoming edges severed).
    All others recompute from (possibly changed) parents + abduced noise.
    """
    eq_by_target = build_equations_by_target(equations)
    cf_world: dict[str, float] = {}

    for node in topo_order:
        if node in interventions:
            # Action: fixed by do-operator
            cf_world[node] = interventions[node]
            continue

        parent_eqs = eq_by_target.get(node, [])

        if not parent_eqs:
            # Root node: unchanged from factual
            cf_world[node] = noise.get(node, observed.get(node, 0.0))
            continue

        # Prediction: structural equation + abduced noise
        parent_sum = 0.0
        for eq in parent_eqs:
            parent_val = cf_world.get(eq.source, observed.get(eq.source, 0.0))
            parent_sum += eq.evaluate(parent_val)

        cf_world[node] = parent_sum + noise.get(node, 0.0)

    return cf_world


# ── Main counterfactual query ──────────────────────────────────────

class NodeEffect:
    """Result for one downstream node."""
    __slots__ = ("node_id", "factual", "counterfactual", "effect",
                 "scaled_effect", "temporal_factor",
                 "ci_low", "ci_high", "eff_n_bottleneck",
                 "identification", "tau_days")

    def __init__(self, node_id: str, factual: float, counterfactual: float,
                 eff_n_bottleneck: float = 1.0,
                 identification: str = "unidentified",
                 tau_days: float = 45.0,
                 days: int = 100):
        self.node_id = node_id
        self.factual = factual
        self.counterfactual = counterfactual
        self.effect = counterfactual - factual  # equilibrium (infinite-time) effect
        self.eff_n_bottleneck = eff_n_bottleneck
        self.identification = identification
        self.tau_days = tau_days
        # Temporal accumulation: match the generator's discrete dynamics
        # Generator: new = current + (1/tau) * (equilibrium - current)
        # After T days: delta = effect * (1 - (1 - 1/tau)^T)
        rate = 1.0 / max(tau_days, 1.0)
        self.temporal_factor = 1.0 - (1.0 - rate) ** days
        self.scaled_effect = self.effect * self.temporal_factor
        # CI based on time-scaled effect
        se = abs(self.scaled_effect) / max(math.sqrt(eff_n_bottleneck), 1.0)
        self.ci_low = self.scaled_effect - 1.96 * se
        self.ci_high = self.scaled_effect + 1.96 * se


def compute_counterfactual(
    observed: dict[str, float],
    interventions: dict[str, float],
    equations: list[Equation] | None = None,
    topo_order: list[str] | None = None,
) -> dict[str, NodeEffect]:
    """Run a full counterfactual query.

    Parameters
    ----------
    observed : dict[node_id, current_value]
        All known node values for this participant.
    interventions : dict[node_id, new_value]
        do(node = value) for each intervention.

    Returns
    -------
    effects : dict[node_id, NodeEffect]
        Causal effect on every downstream node.
    """
    if equations is None:
        equations = build_equations()
    if topo_order is None:
        topo_order = topological_sort(equations)

    eq_by_target = build_equations_by_target(equations)

    # Step 1: Abduction
    noise = abduce_noise(observed, equations, topo_order)

    # Build factual world (for reference)
    factual_world: dict[str, float] = {}
    for node in topo_order:
        parent_eqs = eq_by_target.get(node, [])
        if not parent_eqs:
            factual_world[node] = observed.get(node, noise.get(node, 0.0))
        else:
            parent_sum = sum(
                eq.evaluate(factual_world.get(eq.source, observed.get(eq.source, 0.0)))
                for eq in parent_eqs
            )
            obs_val = observed.get(node)
            factual_world[node] = obs_val if obs_val is not None else parent_sum + noise.get(node, 0.0)

    # Steps 2+3: Intervention + Prediction
    cf_world = propagate_counterfactual(
        interventions, noise, observed, equations, topo_order
    )

    # Find all downstream nodes
    all_descendants: set[str] = set()
    for intv_node in interventions:
        all_descendants |= get_descendants(intv_node, equations)

    # Build effects
    effects: dict[str, NodeEffect] = {}
    for node_id in all_descendants:
        factual_val = factual_world.get(node_id, observed.get(node_id, 0.0))
        cf_val = cf_world.get(node_id, factual_val)
        delta = cf_val - factual_val

        if abs(delta) < 1e-10:
            continue

        # Find bottleneck effN on paths from any intervention to this target
        min_eff_n = float("inf")
        for eq in equations:
            if eq.target == node_id:
                min_eff_n = min(min_eff_n, eq.eff_n)
        if min_eff_n == float("inf"):
            min_eff_n = 1.0

        # Temporal response from priors
        prior = BIOMARKER_PRIORS.get(node_id) or WEARABLE_PRIORS.get(node_id)
        tau = prior.tau_days if prior else 45.0

        effects[node_id] = NodeEffect(
            node_id=node_id,
            factual=factual_val,
            counterfactual=cf_val,
            eff_n_bottleneck=min_eff_n,
            tau_days=tau,
        )

    return effects


# ── Marginal effects for all actions ───────────────────────────────

MANIPULABLE_NODES = {
    "running_volume",
    "training_volume",
    "zone2_volume",
    "training_load",
    "sleep_duration",
    "bedtime",
    "steps",
    "active_energy",
    "dietary_protein",
    "dietary_energy",
}

# Step sizes for marginal effect computation (meaningful behavioral changes)
MARGINAL_STEPS: dict[str, float] = {
    "running_volume":   30.0,    # +30 km/month
    "training_volume":  150.0,   # +150 min/month (~5 min/day)
    "zone2_volume":     60.0,    # +60 min/month (~15 min/week)
    "training_load":    100.0,   # +100 TRIMP
    "sleep_duration":   0.5,     # +30 min/night
    "bedtime":          -0.5,    # 30 min earlier (bedtime_hr decreases = earlier)
    "steps":            2000.0,  # +2000 steps/day
    "active_energy":    100.0,   # +100 kcal/day
    "dietary_protein":  20.0,    # +20 g/day
    "dietary_energy":   -200.0,  # -200 kcal/day (deficit)
}


def compute_marginal_effects(
    observed: dict[str, float],
    equations: list[Equation] | None = None,
    topo_order: list[str] | None = None,
) -> dict[str, dict[str, NodeEffect]]:
    """Compute the marginal effect of each manipulable action.

    For each action, applies a one-step change and returns all
    downstream effects.

    Returns
    -------
    dict[action_node, dict[target_node, NodeEffect]]
    """
    if equations is None:
        equations = build_equations()
    if topo_order is None:
        topo_order = topological_sort(equations)

    results: dict[str, dict[str, NodeEffect]] = {}

    for action, step in MARGINAL_STEPS.items():
        current_val = observed.get(action, 0.0)
        new_val = current_val + step

        effects = compute_counterfactual(
            observed,
            {action: new_val},
            equations=equations,
            topo_order=topo_order,
        )

        if effects:
            results[action] = effects

    return results
