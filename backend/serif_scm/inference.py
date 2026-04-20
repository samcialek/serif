"""MCMC and SVI inference runners for the Serif SCM."""

from __future__ import annotations

import jax
import jax.random as random
import numpyro
from numpyro.infer import MCMC, NUTS, SVI, Trace_ELBO, autoguide


def run_mcmc(
    model_fn,
    model_args: dict,
    num_warmup: int = 500,
    num_samples: int = 1000,
    num_chains: int = 1,
    seed: int = 0,
) -> MCMC:
    """Run NUTS MCMC on the Serif SCM.

    Parameters
    ----------
    model_fn : callable
        The NumPyro model function (serif_scm).
    model_args : dict
        Keyword arguments passed to model_fn.
    num_warmup : int
        Number of warmup (burn-in) steps.
    num_samples : int
        Number of posterior samples to draw.
    num_chains : int
        Number of independent chains.
    seed : int
        PRNG seed.

    Returns
    -------
    mcmc : MCMC
        Fitted MCMC object. Access samples via mcmc.get_samples().
    """
    rng_key = random.PRNGKey(seed)
    kernel = NUTS(model_fn)
    mcmc = MCMC(kernel, num_warmup=num_warmup, num_samples=num_samples, num_chains=num_chains)
    mcmc.run(rng_key, **model_args)
    return mcmc


def run_svi(
    model_fn,
    model_args: dict,
    num_steps: int = 5000,
    lr: float = 0.005,
    seed: int = 0,
) -> tuple[dict, list[float]]:
    """Run Stochastic Variational Inference for fast approximate posterior.

    Uses an AutoNormal guide (mean-field approximation).
    Suitable for quick iteration; MCMC gives exact posteriors.

    Returns
    -------
    params : dict
        Variational parameters (location, scale per latent).
    losses : list[float]
        ELBO loss trace for convergence monitoring.
    """
    rng_key = random.PRNGKey(seed)
    guide = autoguide.AutoNormal(model_fn)
    optimizer = numpyro.optim.Adam(lr)
    svi = SVI(model_fn, guide, optimizer, loss=Trace_ELBO())

    svi_result = svi.run(rng_key, num_steps, **model_args)
    params = svi_result.params
    losses = [float(svi_result.losses[i]) for i in range(num_steps)]

    return params, losses
