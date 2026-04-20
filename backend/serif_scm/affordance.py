"""Information-theoretic affordance scoring from MCMC posteriors.

When a NumPyro posterior is available, these functions replace the
closed-form Normal approximations with sample-based estimates:

- EIG: I(data_new; params) = H(params) - H(params | data_new)
- Variance Reduction: posterior CI width with/without conditioning
- Precision Ratio: posterior CI width with/without additional observations
- Testability KL: KL(posterior || prior) via KDE on samples
"""

from __future__ import annotations

import jax.numpy as jnp
import numpy as np


def entropy_from_samples(samples: np.ndarray, n_bins: int = 50) -> float:
    """Estimate entropy from MCMC samples using histogram method.

    Parameters
    ----------
    samples : ndarray, shape (n_samples,)
        1D array of posterior samples.
    n_bins : int
        Number of histogram bins.

    Returns
    -------
    entropy : float
        Estimated differential entropy in nats.
    """
    hist, bin_edges = np.histogram(samples, bins=n_bins, density=True)
    bin_width = bin_edges[1] - bin_edges[0]
    # Avoid log(0)
    mask = hist > 0
    return -float(np.sum(hist[mask] * np.log(hist[mask]) * bin_width))


def kl_from_samples(
    posterior_samples: np.ndarray,
    prior_samples: np.ndarray,
    n_bins: int = 50,
) -> float:
    """Estimate KL(posterior || prior) from samples using histograms.

    Parameters
    ----------
    posterior_samples : ndarray, shape (n_samples,)
    prior_samples : ndarray, shape (n_samples,)
    n_bins : int

    Returns
    -------
    kl : float
        Estimated KL divergence in nats.
    """
    # Use shared bin edges
    all_samples = np.concatenate([posterior_samples, prior_samples])
    edges = np.linspace(all_samples.min(), all_samples.max(), n_bins + 1)

    p_hist, _ = np.histogram(posterior_samples, bins=edges, density=True)
    q_hist, _ = np.histogram(prior_samples, bins=edges, density=True)

    bin_width = edges[1] - edges[0]

    # Mask where both are positive
    mask = (p_hist > 0) & (q_hist > 0)
    kl = float(np.sum(p_hist[mask] * np.log(p_hist[mask] / q_hist[mask]) * bin_width))
    return max(0.0, kl)


def posterior_ci_width(samples: np.ndarray, level: float = 0.90) -> float:
    """Compute central credible interval width from samples.

    Parameters
    ----------
    samples : ndarray, shape (n_samples,)
    level : float
        Credible level (0.90 = 90% CI).

    Returns
    -------
    width : float
        CI upper - CI lower.
    """
    alpha = 1.0 - level
    lo = float(np.percentile(samples, 100 * alpha / 2))
    hi = float(np.percentile(samples, 100 * (1 - alpha / 2)))
    return hi - lo


def compute_eig_from_posterior(
    prior_entropy: float,
    posterior_entropy: float,
) -> float:
    """Expected information gain = prior entropy - posterior entropy.

    Positive EIG means the data was informative.
    """
    return max(0.0, prior_entropy - posterior_entropy)


def compute_variance_reduction_from_posterior(
    full_ci_width: float,
    conditioned_ci_width: float,
) -> float:
    """Variance reduction ratio when conditioning on a resolved latent.

    Returns the fractional reduction: (full - conditioned) / full.
    """
    if full_ci_width <= 0:
        return 0.0
    return (full_ci_width - conditioned_ci_width) / full_ci_width


def compute_precision_ratio_from_posterior(
    current_ci_width: float,
    augmented_ci_width: float,
) -> float:
    """Precision improvement ratio from additional observations.

    Returns current / augmented (>1 means improvement).
    """
    if augmented_ci_width <= 0:
        return 1.0
    return current_ci_width / augmented_ci_width
