"""Smoke tests for the BART fit scaffolding.

Run:  python -m serif_scm.tests.test_bart_fit

Tests are skipped cleanly if `pymc` / `pymc_bart` are not installed — the
`bart` extra in pyproject.toml carries them, and the rest of the backend
does not require PyMC. Install with:

    pip install -e '.[bart]'

The fits here deliberately use tiny draw/tune budgets. The goal is shape /
invariant / round-trip coverage, not MCMC quality.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np


def _pymc_available() -> bool:
    try:
        import pymc  # noqa: F401
        import pymc_bart  # noqa: F401
        return True
    except Exception:
        return False


# ── Fixtures ───────────────────────────────────────────────────────


def _make_synthetic(n: int = 80, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """Two-parent non-additive surface with Gaussian noise.

    y = 2*x0 + 0.5*x1 + 3*x0*x1 + N(0, 0.5)

    Deliberately includes an interaction term so a successful BART fit
    recovers more signal than a parent-additive model could.
    """
    rng = np.random.default_rng(seed)
    x0 = rng.uniform(-1.0, 1.0, size=n)
    x1 = rng.uniform(-1.0, 1.0, size=n)
    y = 2.0 * x0 + 0.5 * x1 + 3.0 * x0 * x1 + rng.normal(0.0, 0.5, size=n)
    return np.stack([x0, x1], axis=1), y


# ── Pure-numpy tests (no PyMC dependency) ──────────────────────────


def test_posterior_draws_dataclass_shapes():
    from ..bart_fit import BartPosteriorDraws

    draws = BartPosteriorDraws(
        outcome="hrv_daily",
        parent_names=["sleep_duration", "acwr"],
        parent_grid=np.zeros((10, 2), dtype=float),
        predictions=np.zeros((50, 10), dtype=np.float32),
        sigma=np.ones(50, dtype=np.float32),
        data_mean=42.0,
        n_training=200,
        n_trees=50,
    )
    assert draws.n_draws == 50
    assert draws.n_grid == 10
    assert draws.n_parents == 2


def test_posterior_draws_roundtrip_npz():
    from ..bart_fit import BartPosteriorDraws

    grid = np.linspace(-1, 1, 12).reshape(-1, 1)
    preds = np.random.default_rng(1).normal(size=(20, 12)).astype(np.float32)
    sigma = np.full(20, 0.3, dtype=np.float32)
    original = BartPosteriorDraws(
        outcome="hrv_daily",
        parent_names=["sleep_duration"],
        parent_grid=grid,
        predictions=preds,
        sigma=sigma,
        data_mean=50.5,
        n_training=300,
        n_trees=50,
        metadata={"note": "roundtrip"},
    )

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "hrv_daily.npz"
        original.save_npz(path)
        loaded = BartPosteriorDraws.load_npz(path)

    assert loaded.outcome == original.outcome
    assert loaded.parent_names == original.parent_names
    np.testing.assert_array_equal(loaded.parent_grid, original.parent_grid)
    np.testing.assert_array_equal(loaded.predictions, original.predictions)
    np.testing.assert_array_equal(loaded.sigma, original.sigma)
    assert loaded.data_mean == original.data_mean
    assert loaded.n_training == original.n_training
    assert loaded.n_trees == original.n_trees


def test_product_grid_shape_and_ordering():
    from ..bart_fit import product_grid

    g = product_grid([(0.0, 1.0, 3), (0.0, 10.0, 2)])
    # 3 × 2 = 6 rows, 2 columns
    assert g.shape == (6, 2)
    # First column cycles slow (ij ordering): 0,0, 0.5,0.5, 1,1
    col0 = sorted(set(g[:, 0].tolist()))
    col1 = sorted(set(g[:, 1].tolist()))
    assert col0 == [0.0, 0.5, 1.0]
    assert col1 == [0.0, 10.0]


# ── PyMC-backed tests (skipped if pymc missing) ────────────────────


def test_fit_node_bart_runs_end_to_end():
    if not _pymc_available():
        print("SKIP test_fit_node_bart_runs_end_to_end — pymc/pymc_bart not installed")
        return

    from ..bart_fit import fit_node_bart

    X, y = _make_synthetic(n=80, seed=0)
    draws = fit_node_bart(
        outcome="synthetic_y",
        X=X,
        y=y,
        parent_names=["x0", "x1"],
        n_draws=50,
        n_chains=1,
        n_tune=50,
        n_trees=20,
        seed=0,
    )

    assert draws.outcome == "synthetic_y"
    assert draws.parent_names == ["x0", "x1"]
    assert draws.n_parents == 2
    # Grid defaults to unique(X). Unique rows will be == n when doses are
    # drawn from a continuous uniform, so G == 80 here.
    assert draws.parent_grid.shape == (draws.n_grid, 2)
    # Draws: K = n_chains × n_draws = 50
    assert draws.predictions.shape == (50, draws.n_grid)
    assert draws.sigma.shape == (50,)
    assert np.isfinite(draws.predictions).all()
    assert (draws.sigma > 0).all()

    # Intercept absorbed separately — data_mean should equal mean(y)
    assert abs(draws.data_mean - float(np.mean(y))) < 1e-6
    # Mean prediction at the training grid should be in the ballpark of y
    pred_mean = draws.predictions.mean(axis=0)
    bias = float(np.mean(pred_mean) - np.mean(y))
    assert abs(bias) < 2.0, f"predicted mean too far from y mean: bias={bias:.3f}"


def test_fit_node_bart_custom_grid():
    if not _pymc_available():
        print("SKIP test_fit_node_bart_custom_grid — pymc/pymc_bart not installed")
        return

    from ..bart_fit import fit_node_bart, product_grid

    X, y = _make_synthetic(n=60, seed=1)
    grid = product_grid([(-1.0, 1.0, 5), (-1.0, 1.0, 5)])  # 25 rows

    draws = fit_node_bart(
        outcome="synthetic_y",
        X=X,
        y=y,
        parent_names=["x0", "x1"],
        grid=grid,
        n_draws=40,
        n_chains=1,
        n_tune=40,
        n_trees=20,
        seed=1,
    )

    assert draws.parent_grid.shape == (25, 2)
    assert draws.predictions.shape == (40, 25)


# ── Test runner ────────────────────────────────────────────────────


def _run(tests: list) -> None:
    failed: list[tuple[str, str]] = []
    for fn in tests:
        name = fn.__name__
        try:
            fn()
            print(f"  PASS  {name}")
        except AssertionError as exc:
            print(f"  FAIL  {name}: {exc}")
            failed.append((name, str(exc)))
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR {name}: {type(exc).__name__}: {exc}")
            failed.append((name, f"{type(exc).__name__}: {exc}"))
    print()
    if failed:
        print(f"FAILED {len(failed)}/{len(tests)}")
        for n, err in failed:
            print(f"  - {n}: {err}")
        raise SystemExit(1)
    print(f"OK {len(tests)}/{len(tests)}")


if __name__ == "__main__":
    print("Running BART fit smoke tests...\n")
    _run([
        test_posterior_draws_dataclass_shapes,
        test_posterior_draws_roundtrip_npz,
        test_product_grid_shape_and_ordering,
        test_fit_node_bart_runs_end_to_end,
        test_fit_node_bart_custom_grid,
    ])
