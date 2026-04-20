"""FastAPI server for Serif SCM backend.

Endpoints match the TypeScript SCMProvider interface:
  POST /api/v1/counterfactual/full  → FullCounterfactualState
  POST /api/v1/affordance/score     → InformationTheoreticScore
  GET  /api/v1/model/status         → ModelStatus
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .types import (
    CounterfactualRequest,
    AffordanceScoreRequest,
    FullCounterfactualState,
    InformationTheoreticScore,
    ModelStatus,
)

app = FastAPI(
    title="Serif SCM Backend",
    version="0.1.0",
    description="Bayesian causal inference for health analytics",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model state (initialized on startup)
_model_state: dict = {"fitted": False, "samples": None, "mcmc": None}


@app.get("/api/v1/model/status")
async def model_status() -> ModelStatus:
    return ModelStatus(
        fitted=_model_state["fitted"],
        numSamples=_model_state["samples"].shape[0] if _model_state.get("samples") is not None else 0,
        rhat=None,  # Computed from MCMC diagnostics when fitted
    )


@app.post("/api/v1/counterfactual/full")
async def counterfactual_full(request: CounterfactualRequest) -> dict:
    if not _model_state["fitted"]:
        raise HTTPException(
            status_code=503,
            detail="Model not yet fitted. POST to /api/v1/model/fit first.",
        )

    # TODO: Implement using counterfactual.compute_counterfactual()
    # with posterior samples from _model_state["samples"]
    raise HTTPException(status_code=501, detail="Not yet implemented")


@app.post("/api/v1/affordance/score")
async def affordance_score(request: AffordanceScoreRequest) -> dict:
    if not _model_state["fitted"]:
        raise HTTPException(
            status_code=503,
            detail="Model not yet fitted. POST to /api/v1/model/fit first.",
        )

    # TODO: Implement using affordance.py functions
    # with posterior samples from _model_state["samples"]
    raise HTTPException(status_code=501, detail="Not yet implemented")


@app.post("/api/v1/model/fit")
async def fit_model() -> dict:
    """Trigger MCMC fitting. Long-running — consider background task."""
    # TODO: Load edge summary, build topo order, run MCMC
    # Store results in _model_state
    return {"status": "not_implemented", "message": "MCMC fitting not yet wired up"}
