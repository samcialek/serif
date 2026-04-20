"""Do-operator and counterfactual computation from posterior samples.

Implements the twin-world approach:
1. Abduction: infer noise terms U from factual world + posterior parameters
2. Action: replace structural equations for intervened nodes with fixed values
3. Prediction: propagate through modified SCM using inferred noise

This gives a full posterior predictive distribution over counterfactual outcomes.
"""

from __future__ import annotations

import jax.numpy as jnp
import numpyro.distributions as dist

from .curves import soft_piecewise


def compute_counterfactual(
    posterior_samples: dict[str, jnp.ndarray],
    observed_data: dict[str, jnp.ndarray],
    interventions: dict[str, float],
    topo_order: list[str],
    parent_edges: dict[str, list[dict]],
) -> dict[str, jnp.ndarray]:
    """Compute counterfactual distribution using posterior samples.

    For each posterior sample:
    1. Abduce: U_node = observed_value - structural_equation(parents)
    2. Intervene: fix intervened nodes to their do() values
    3. Predict: forward-propagate using posterior params + abduced noise

    Parameters
    ----------
    posterior_samples : dict[str, ndarray]
        MCMC samples. Keys are parameter names (bb_{edge}, ba_{edge}, etc.).
        Each value has shape (num_samples,) or (num_samples, ...).
    observed_data : dict[str, ndarray]
        Factual observed values for each node.
    interventions : dict[str, float]
        {node_id: do_value} for each intervention.
    topo_order : list[str]
        Topologically sorted node IDs.
    parent_edges : dict[str, list[dict]]
        Parent edge structure (same as model.py).

    Returns
    -------
    counterfactual_world : dict[str, ndarray]
        Posterior predictive samples for each node under the intervention.
        Shape (num_samples,) per node.
    """
    num_samples = next(iter(posterior_samples.values())).shape[0]
    sigma_obs = posterior_samples.get("sigma_obs", jnp.ones(num_samples))

    # Step 1 + 3 combined: walk topo order, abduce noise, then predict
    factual_world: dict[str, jnp.ndarray] = {}
    cf_world: dict[str, jnp.ndarray] = {}

    for node in topo_order:
        edges = parent_edges.get(node, [])
        obs = observed_data.get(node)

        # ── Factual world: compute structural equation ──
        if len(edges) == 0:
            factual_world[node] = jnp.broadcast_to(
                obs if obs is not None else jnp.array(0.0),
                (num_samples,)
            )
        else:
            factual_mu = jnp.zeros(num_samples)
            for e in edges:
                parent_val = factual_world.get(e["source"], jnp.zeros(num_samples))
                bb = posterior_samples.get(f"bb_{e['edge_key']}", jnp.zeros(num_samples))
                ba = posterior_samples.get(f"ba_{e['edge_key']}", jnp.zeros(num_samples))
                theta = posterior_samples.get(f"theta_{e['edge_key']}", jnp.zeros(num_samples))
                factual_mu = factual_mu + soft_piecewise(parent_val, theta, bb, ba)

            if obs is not None:
                factual_world[node] = jnp.broadcast_to(obs, (num_samples,))
            else:
                factual_world[node] = factual_mu

        # ── Abduce noise ──
        if obs is not None and len(edges) > 0:
            factual_mu_for_noise = jnp.zeros(num_samples)
            for e in edges:
                parent_val = factual_world.get(e["source"], jnp.zeros(num_samples))
                bb = posterior_samples.get(f"bb_{e['edge_key']}", jnp.zeros(num_samples))
                ba = posterior_samples.get(f"ba_{e['edge_key']}", jnp.zeros(num_samples))
                theta = posterior_samples.get(f"theta_{e['edge_key']}", jnp.zeros(num_samples))
                factual_mu_for_noise = factual_mu_for_noise + soft_piecewise(parent_val, theta, bb, ba)
            noise = jnp.broadcast_to(obs, (num_samples,)) - factual_mu_for_noise
        else:
            noise = jnp.zeros(num_samples)

        # ── Counterfactual world ──
        if node in interventions:
            # Action: fix to intervention value
            cf_world[node] = jnp.full(num_samples, interventions[node])
        elif len(edges) == 0:
            cf_world[node] = factual_world[node]
        else:
            # Predict: structural equation with counterfactual parents + abduced noise
            cf_mu = jnp.zeros(num_samples)
            for e in edges:
                cf_parent = cf_world.get(e["source"], jnp.zeros(num_samples))
                bb = posterior_samples.get(f"bb_{e['edge_key']}", jnp.zeros(num_samples))
                ba = posterior_samples.get(f"ba_{e['edge_key']}", jnp.zeros(num_samples))
                theta = posterior_samples.get(f"theta_{e['edge_key']}", jnp.zeros(num_samples))
                cf_mu = cf_mu + soft_piecewise(cf_parent, theta, bb, ba)
            cf_world[node] = cf_mu + noise

    return cf_world
