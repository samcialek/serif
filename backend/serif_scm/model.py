"""NumPyro structural causal model for Serif.

One joint model — pathways share nodes (cortisol feeds both hormone
and immune chains). Hierarchical priors per edge come from the
fitted edgeSummaryRaw population estimates.
"""

from __future__ import annotations

import jax.numpy as jnp
import numpyro
import numpyro.distributions as dist

from .curves import soft_piecewise, sigmoid_activation


def serif_scm(
    topo_order: list[str],
    parent_edges: dict[str, list[dict]],
    observed_data: dict[str, jnp.ndarray] | None = None,
    pop_priors: dict[str, dict] | None = None,
    data_means: dict[str, float] | None = None,
    latent_confounders: dict[str, list[str]] | None = None,
    n_participants: int | None = None,
    participant_idx: jnp.ndarray | None = None,
):
    """Joint NumPyro model over the full Serif DAG.

    Parameters
    ----------
    topo_order : list[str]
        Topologically sorted node IDs.
    parent_edges : dict[str, list[dict]]
        For each node, list of incoming edges with keys:
        {source, edge_key, pop_bb, pop_ba, pop_theta, pop_bb_scale, pop_ba_scale, pop_theta_scale}
    observed_data : dict[str, ndarray] or None
        Observed time series for each node. None for latent nodes.
    pop_priors : dict[str, dict] or None
        Population-level prior hyperparameters per edge.
    data_means : dict[str, float] or None
        Empirical mean of each observed node. Used two ways:
          (1) intercept for each child node's mu
          (2) center parent values before feeding into the dose-response curve
        Treated as a fixed pre-computed constant (not a learnable parameter).
    latent_confounders : dict[str, list[str]] or None
        Map of latent confounder name -> list of node names the latent touches.
        For each latent C with nodes [N1, N2, ...]:
          - U_C ~ Normal(0, sigma_C)  sampled per participant (shape n_participants)
          - lambda_C_Ni ~ Normal(0, 1) per affected node
          - mu[Ni] += lambda_C_Ni * U_C[participant_idx]
        If n_participants is None or 1, U_C is a scalar (degenerate — only meaningful
        with multi-participant data).
    n_participants : int or None
        Number of distinct participants in observed_data. Required if latent_confounders
        is set and you want U to be a per-participant random effect.
    participant_idx : ndarray or None
        Per-observation participant index (0..n_participants-1), same length as each
        observed array. Used to broadcast U_C to the right rows.
    """
    pop_priors = pop_priors or {}
    observed_data = observed_data or {}
    data_means = data_means or {}
    latent_confounders = latent_confounders or {}

    # Latent confounders: shared participant-level noise that touches multiple nodes.
    # Identifiability requires multi-participant data; with n_participants=1 the
    # latent degenerates to a free intercept and should be disabled upstream.
    latent_u: dict[str, jnp.ndarray] = {}
    latent_lambda: dict[str, dict[str, jnp.ndarray]] = {}
    for c_name, affected_nodes in latent_confounders.items():
        sigma_c = numpyro.sample(
            f"sigma_latent_{c_name}", dist.HalfNormal(1.0)
        )
        if n_participants is not None and n_participants > 1:
            with numpyro.plate(f"plate_{c_name}", n_participants):
                u = numpyro.sample(f"U_{c_name}", dist.Normal(0.0, sigma_c))
            latent_u[c_name] = u
        else:
            u = numpyro.sample(f"U_{c_name}", dist.Normal(0.0, sigma_c))
            latent_u[c_name] = u

        latent_lambda[c_name] = {}
        for node in affected_nodes:
            lam = numpyro.sample(
                f"lambda_{c_name}_{node}", dist.Normal(0.0, 1.0)
            )
            latent_lambda[c_name][node] = lam

    # Per-edge hierarchical parameters
    edge_params = {}
    all_edge_keys = [
        ek
        for edges in parent_edges.values()
        for ek in [e["edge_key"] for e in edges]
    ]

    for edge_key in all_edge_keys:
        prior = pop_priors.get(edge_key, {})
        bb = numpyro.sample(
            f"bb_{edge_key}",
            dist.Normal(prior.get("pop_bb", 0.0), prior.get("pop_bb_scale", 1.0)),
        )
        ba = numpyro.sample(
            f"ba_{edge_key}",
            dist.Normal(prior.get("pop_ba", 0.0), prior.get("pop_ba_scale", 1.0)),
        )
        theta = numpyro.sample(
            f"theta_{edge_key}",
            dist.Normal(
                prior.get("pop_theta", 0.0), prior.get("pop_theta_scale", 10.0)
            ),
        )
        sigma_p = numpyro.sample(
            f"sigma_p_{edge_key}",
            dist.HalfNormal(prior.get("sigma_p_scale", 1.0)),
        )
        edge_params[edge_key] = {
            "bb": bb,
            "ba": ba,
            "theta": theta,
            "sigma_p": sigma_p,
        }

    def latent_contribution(node: str) -> jnp.ndarray | float:
        """Sum of λ_C * U_C[participant_idx] over all latents touching this node."""
        total = 0.0
        for c_name, affected in latent_confounders.items():
            if node not in affected:
                continue
            u = latent_u[c_name]
            if n_participants is not None and n_participants > 1 and participant_idx is not None:
                u = u[participant_idx]
            total = total + latent_lambda[c_name][node] * u
        return total

    # Topological forward pass
    world: dict[str, jnp.ndarray] = {}

    for node in topo_order:
        edges = parent_edges.get(node, [])

        if len(edges) == 0:
            # Root node — use data directly, optionally add latent confounder
            # contribution to a sampled observation model.
            if node in observed_data:
                if latent_confounders and any(
                    node in affected for affected in latent_confounders.values()
                ):
                    # Observed root with latent confounder: model the observed
                    # action as mean + λ·U + noise so U couples to the target
                    # through cross-equation covariance.
                    mu_root = data_means.get(node, 0.0) + latent_contribution(node)
                    sigma_root = numpyro.sample(
                        f"sigma_{node}", dist.HalfNormal(1.0)
                    )
                    numpyro.sample(
                        f"obs_{node}",
                        dist.Normal(mu_root, sigma_root),
                        obs=observed_data[node],
                    )
                world[node] = observed_data[node]
            else:
                world[node] = numpyro.sample(
                    f"root_{node}", dist.Normal(0.0, 10.0)
                )
            continue

        # Compute structural equation: intercept + sum of parent contributions
        # evaluated against the parent mean baseline. Theta stays in absolute
        # parent coordinates (bedtime hrs, sleep hrs) so the literature/fitted
        # priors apply as-is. data_means[node] acts as the intercept so sigma
        # absorbs only residual variance, not the node's baseline level.
        # data_means is a fixed pre-computed constant, not a learnable param.
        mu = jnp.zeros_like(
            next(
                (world[e["source"]] for e in edges if e["source"] in world),
                jnp.array(0.0),
            )
        )
        mu = mu + data_means.get(node, 0.0)
        for e in edges:
            parent_val = world.get(e["source"])
            if parent_val is None:
                continue
            parent_mean = data_means.get(e["source"], 0.0)
            params = edge_params[e["edge_key"]]
            if e.get("curve_type") == "sigmoid":
                contribution = sigmoid_activation(
                    parent_val, params["theta"], params["bb"], params["ba"]
                ) - sigmoid_activation(
                    parent_mean, params["theta"], params["bb"], params["ba"]
                )
            else:
                contribution = soft_piecewise(
                    parent_val, params["theta"], params["bb"], params["ba"]
                ) - soft_piecewise(
                    parent_mean, params["theta"], params["bb"], params["ba"]
                )
            mu = mu + contribution

        # Latent confounder contribution: adds λ_C · U_C[participant_idx]
        # for every wired latent that touches this node.
        mu = mu + latent_contribution(node)

        # Per-node residual SD — observation noise for observed nodes,
        # structural noise for latents. Scales differ wildly across nodes
        # (ferritin ng/mL vs HRV ms vs sleep_quality 0–1), so a single global
        # sigma would be dominated by the largest-variance node.
        sigma_scale = pop_priors.get(f"sigma_node_{node}", {}).get("scale", 1.0)
        sigma_node = numpyro.sample(
            f"sigma_{node}", dist.HalfNormal(sigma_scale)
        )

        if node in observed_data:
            numpyro.sample(
                f"obs_{node}",
                dist.Normal(mu, sigma_node),
                obs=observed_data[node],
            )
            world[node] = observed_data[node]
        else:
            noise = numpyro.sample(f"U_{node}", dist.Normal(0.0, sigma_node))
            world[node] = mu + noise

    return world
