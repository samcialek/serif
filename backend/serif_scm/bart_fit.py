"""BART response-surface fits for Serif Twin nodes.

Replaces the per-edge (bb, ba, theta) piecewise-linear fit with a
per-node non-parametric surface over the joint parent vector. Captures
interactions natively — no additive-parents assumption — and exports K
joint posterior draws for the TS Twin's Monte-Carlo propagation.

Scope:
  * Per-outcome-node fit. Input is X of shape (n_obs, n_parents) and y
    of shape (n_obs,).
  * Output is `BartPosteriorDraws` — K posterior-predictive draws of the
    response surface at a caller-supplied grid (or the unique training
    points), plus per-draw observation sigma.
  * No on-line abduction here. The Twin's MC loop does abduction per
    draw in TS by taking `observed_y - mean_k(X_observed)` as the noise
    residual for that draw, then propagates through interventions.

Stack: PyMC + pymc-bart. Installed via the `bart` optional extra in
pyproject.toml — imports are deferred so the rest of the backend does
not require pymc.

Design decisions (2026-04-21):
  * Export predictions at a grid rather than serialising BART trees.
    Grid interpolation in TS is trivial; tree re-implementation is not.
  * Grid defaults to unique training X. Callers can pass a denser grid
    for outcomes with 2–3 parents where the product-grid is tractable.
  * Save posterior draws verbatim (no moment summaries) — the whole
    point of the refactor is to stop discarding the distribution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    import arviz as az


# ─── Exported object ───────────────────────────────────────────────


@dataclass
class BartPosteriorDraws:
    """K posterior-predictive draws of a per-node response surface.

    Attributes
    ----------
    outcome : str
        Outcome node ID (e.g., "hrv_daily").
    parent_names : list[str]
        Parent node IDs in the column order of `parent_grid`.
    parent_grid : ndarray, shape (G, P)
        Evaluation points in parent space. G rows, P = len(parent_names).
    predictions : ndarray, shape (K, G)
        K posterior draws of the BART mean function evaluated at
        `parent_grid`. Units match `y` as fit.
    sigma : ndarray, shape (K,)
        Per-draw posterior sample of the observation SD. Combined with
        `predictions` to sample the posterior predictive at grid points.
    data_mean : float
        Intercept used at fit time (subtracted from y before BART fit,
        added back on prediction). Matches the existing NumPyro model's
        use of `data_means[node]` as a fixed intercept — BART captures
        only the departure from that baseline.
    n_training : int
        Number of observations the BART surface was fit on.
    n_trees : int
        BART tree count. Stored for provenance.
    """

    outcome: str
    parent_names: list[str]
    parent_grid: np.ndarray
    predictions: np.ndarray
    sigma: np.ndarray
    data_mean: float
    n_training: int
    n_trees: int
    metadata: dict[str, str] = field(default_factory=dict)

    @property
    def n_draws(self) -> int:
        return self.predictions.shape[0]

    @property
    def n_grid(self) -> int:
        return self.parent_grid.shape[0]

    @property
    def n_parents(self) -> int:
        return len(self.parent_names)

    def save_npz(self, path: Path) -> None:
        """Save as compressed npz. Metadata stored as a json sidecar."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            path,
            outcome=np.array(self.outcome),
            parent_names=np.array(self.parent_names),
            parent_grid=self.parent_grid,
            predictions=self.predictions,
            sigma=self.sigma,
            data_mean=np.array(self.data_mean),
            n_training=np.array(self.n_training),
            n_trees=np.array(self.n_trees),
        )

    @classmethod
    def load_npz(cls, path: Path) -> BartPosteriorDraws:
        path = Path(path)
        with np.load(path, allow_pickle=False) as z:
            return cls(
                outcome=str(z["outcome"]),
                parent_names=[str(n) for n in z["parent_names"]],
                parent_grid=z["parent_grid"],
                predictions=z["predictions"],
                sigma=z["sigma"],
                data_mean=float(z["data_mean"]),
                n_training=int(z["n_training"]),
                n_trees=int(z["n_trees"]),
            )

    def to_json_compact(
        self,
        path: Path,
        *,
        target_k: int = 200,
        seed: int = 0,
    ) -> None:
        """Write a browser-friendly JSON with K subsampled down to target_k.

        The full grid is preserved (parent-space coverage matters for the
        TS-side interpolator); only the draw axis is subsampled. Floats
        are rounded for gzip friendliness. At K=200 on ~1k grid rows,
        gzipped payload is ~500 kB per outcome.
        """
        import json

        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        if self.n_draws > target_k:
            rng = np.random.default_rng(seed)
            idx = rng.choice(self.n_draws, size=target_k, replace=False)
            preds = self.predictions[idx]
            sigma = self.sigma[idx]
        else:
            preds = self.predictions
            sigma = self.sigma

        payload = {
            "outcome": self.outcome,
            "parent_names": self.parent_names,
            # round for gzip: parent ranges span ~4 orders of magnitude
            # (steps 1k-20k vs acwr 0.5-2), so fixed 3 dp is a reasonable
            # compromise.
            "parent_grid": np.asarray(self.parent_grid, dtype=np.float32)
            .round(3)
            .tolist(),
            "predictions": np.asarray(preds, dtype=np.float32).round(2).tolist(),
            "sigma": np.asarray(sigma, dtype=np.float32).round(3).tolist(),
            "data_mean": round(float(self.data_mean), 4),
            "n_training": int(self.n_training),
            "n_trees": int(self.n_trees),
            "n_draws_effective": int(len(sigma)),
        }
        path.write_text(json.dumps(payload, separators=(",", ":")))


# ─── Fit entry point ───────────────────────────────────────────────


def fit_node_bart(
    outcome: str,
    X: np.ndarray,
    y: np.ndarray,
    parent_names: list[str],
    *,
    grid: np.ndarray | None = None,
    n_draws: int = 1500,
    n_chains: int = 2,
    n_tune: int = 500,
    n_trees: int = 50,
    seed: int = 42,
) -> BartPosteriorDraws:
    """Fit a per-node BART surface and return K posterior-predictive draws.

    Parameters
    ----------
    outcome : str
        Outcome node ID.
    X : ndarray, shape (n_obs, n_parents)
        Joint parent values (one row per observation).
    y : ndarray, shape (n_obs,)
        Observed outcome values.
    parent_names : list[str]
        Parent node IDs matching X columns.
    grid : ndarray, optional
        Evaluation grid in parent space. If None, uses unique rows of X.
        For small n_parents (<=3), passing a dense product grid gives a
        much smoother TS-side interpolation surface.
    n_draws : int
        Posterior draws per chain. Total draws = n_draws * n_chains.
        Default 1500/chain × 2 chains = 3000; subsample to K=1500 on
        export.
    n_chains : int
        MCMC chains.
    n_tune : int
        Warm-up iterations.
    n_trees : int
        BART tree count. Default 50 is pymc-bart's standard.
    seed : int
        RNG seed.

    Returns
    -------
    BartPosteriorDraws
        K joint posterior draws of the response surface at `grid`.
    """
    # Deferred imports so the rest of serif_scm does not require pymc.
    import pymc as pm
    import pymc_bart as pmb

    X = np.asarray(X, dtype=float)
    y = np.asarray(y, dtype=float)
    if X.ndim != 2:
        raise ValueError(f"X must be 2D, got shape {X.shape}")
    if y.ndim != 1 or y.shape[0] != X.shape[0]:
        raise ValueError(
            f"y shape {y.shape} incompatible with X shape {X.shape}"
        )
    if X.shape[1] != len(parent_names):
        raise ValueError(
            f"X has {X.shape[1]} columns but parent_names has "
            f"{len(parent_names)} entries"
        )

    # Absorb the intercept once, so BART captures only the departure
    # from baseline — matches model.py's `data_means[node]` convention.
    data_mean = float(np.mean(y))
    y_centered = y - data_mean

    if grid is None:
        # Default: unique training rows. Cheap export, matches the
        # data-supported region exactly.
        grid = np.unique(X, axis=0)
    else:
        grid = np.asarray(grid, dtype=float)
        if grid.ndim != 2 or grid.shape[1] != X.shape[1]:
            raise ValueError(
                f"grid shape {grid.shape} incompatible with parent count "
                f"{X.shape[1]}"
            )

    with pm.Model() as model:
        # Shared data so we can evaluate at `grid` after fit.
        X_shared = pm.Data("X", X)

        # BART mean function. alpha/beta are the standard pymc-bart tree
        # prior; leaving defaults keeps posteriors comparable across
        # outcomes unless a specific outcome needs tighter regularisation.
        mu = pmb.BART("mu", X=X_shared, Y=y_centered, m=n_trees)

        # Per-draw observation sigma. HalfNormal mirrors the NumPyro
        # model's per-node sigma prior.
        sigma = pm.HalfNormal("sigma", sigma=float(np.std(y_centered) + 1e-6))

        pm.Normal("y_obs", mu=mu, sigma=sigma, observed=y_centered)

        idata = pm.sample(
            draws=n_draws,
            tune=n_tune,
            chains=n_chains,
            random_seed=seed,
            progressbar=False,
        )

        # Evaluate posterior-predictive mean function at the grid.
        pm.set_data({"X": grid})
        ppc = pm.sample_posterior_predictive(
            idata,
            var_names=["mu"],
            return_inferencedata=True,
            predictions=True,
            progressbar=False,
        )

    # Stack chain × draw → flat K, then take predictions on grid.
    # Shape out: (K, G).
    preds = (
        ppc.predictions["mu"]
        .stack(sample=("chain", "draw"))
        .transpose("sample", ...)
        .values
    )
    sigma_draws = (
        idata.posterior["sigma"]
        .stack(sample=("chain", "draw"))
        .values.astype(float)
    )

    # Add the intercept back in. Grid predictions are in original units.
    preds = preds + data_mean

    return BartPosteriorDraws(
        outcome=outcome,
        parent_names=list(parent_names),
        parent_grid=grid,
        predictions=preds.astype(np.float32),
        sigma=sigma_draws.astype(np.float32),
        data_mean=data_mean,
        n_training=int(X.shape[0]),
        n_trees=int(n_trees),
    )


# ─── Convenience: build a product grid ─────────────────────────────


def product_grid(
    parent_ranges: list[tuple[float, float, int]],
) -> np.ndarray:
    """Build a dense product grid over parent space.

    Parameters
    ----------
    parent_ranges : list of (low, high, n_bins)
        One tuple per parent, in the same order as parent_names.

    Returns
    -------
    ndarray, shape (prod(n_bins), len(parent_ranges))
        Row-major product grid. Callers should keep n_parents <= 3 in
        practice — the grid explodes exponentially.
    """
    axes = [np.linspace(lo, hi, n) for lo, hi, n in parent_ranges]
    mesh = np.meshgrid(*axes, indexing="ij")
    return np.stack([m.ravel() for m in mesh], axis=-1)
