"""Pydantic models matching TypeScript SCM types.

Field names are kept identical to the TypeScript interfaces
so JSON serialization is zero-transform.
"""

from __future__ import annotations
from pydantic import BaseModel
from typing import Literal


class Intervention(BaseModel):
    nodeId: str
    value: float
    originalValue: float


class PathwayEffect(BaseModel):
    path: list[str]
    effect: float
    bottleneckEdge: str | None = None
    bottleneckEffN: float | None = None


class IdentificationResult(BaseModel):
    strategy: Literal["backdoor", "frontdoor", "unidentified"]
    adjustmentSet: list[str]
    mediatorSet: list[str]
    blockedPaths: list[list[str]]
    unblockedPaths: list[list[str]]
    rationale: str


class NodeEffect(BaseModel):
    nodeId: str
    factualValue: float
    counterfactualValue: float
    totalEffect: float
    confidenceInterval: dict[str, float]  # {"low": ..., "high": ...}
    categories: list[Literal["metabolic", "cardio", "recovery", "sleep"]]
    pathways: list[PathwayEffect]
    identification: IdentificationResult


class CategorySummary(BaseModel):
    category: Literal["metabolic", "cardio", "recovery", "sleep"]
    affectedNodes: list[NodeEffect]
    netSignal: float
    topBenefit: NodeEffect | None = None
    topCost: NodeEffect | None = None
    avgIdentificationQuality: float


class Tradeoff(BaseModel):
    benefitNode: str
    benefitCategory: Literal["metabolic", "cardio", "recovery", "sleep"]
    benefitEffect: float
    costNode: str
    costCategory: Literal["metabolic", "cardio", "recovery", "sleep"]
    costEffect: float
    sharedInterventions: list[str]
    description: str


class FullCounterfactualState(BaseModel):
    interventions: list[Intervention]
    allEffects: dict[str, NodeEffect]
    categoryEffects: dict[str, CategorySummary]
    tradeoffs: list[Tradeoff]
    timestamp: float


class CounterfactualRequest(BaseModel):
    observedValues: dict[str, float]
    interventions: list[Intervention]


class AffordanceScoreRequest(BaseModel):
    candidateId: str


class ModelStatus(BaseModel):
    fitted: bool
    numSamples: int
    rhat: float | None = None


# ── IT Scoring Types ─────────────────────────────────────────

class EdgeGainDetail(BaseModel):
    edgeTitle: str
    source: str
    target: str
    priorVariance: float
    expectedPosteriorVariance: float
    kl: float


class ConfounderDetail(BaseModel):
    latentNode: str
    confoundingVariance: float
    affectedEdgeCount: int


class PrecisionDetail(BaseModel):
    edgeTitle: str
    source: str
    target: str
    currentEffN: float
    projectedEffN: float
    ratio: float


class TestabilityDetail(BaseModel):
    edgeTitle: str
    personalPct: float
    kl: float


class DimensionScore(BaseModel):
    raw: float
    normalized: float


class InformationTheoreticScore(BaseModel):
    candidateId: str
    composite: float
    expectedInformationGain: DimensionScore
    varianceReduction: DimensionScore
    precisionRatio: DimensionScore
    testabilityKL: DimensionScore
    tier: Literal["transformative", "high", "moderate", "low"]
    posteriorSource: Literal["closed_form_approximation", "numpyro_posterior"]
