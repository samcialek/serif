"""Population-level Normal priors on per-edge slopes (bb, ba) and thresholds (theta).

Top layer of the pop → cohort → user hierarchy used in the Bayesian gating path.
Reads the master edge summary (`src/data/dataValue/edgeSummaryRaw.json`, 59
edges) and emits `backend/output/population_priors.json` keyed by
`(source, target)`.

Variance construction (per Sam's spec):

  Fitted edges (55):
      bb_pop    ~ Normal(bb,    4 * bb_ci_width^2)
      ba_pop    ~ Normal(ba,    4 * ba_ci_width^2)
      theta_pop ~ Normal(theta, 4 * theta_ci_width^2)

  Literature edges (4, all sleep_duration → biomarker):
      bb_pop ~ Normal(bb, (2 * |bb|)^2)   # SD = 2|bb|, very wide
      ba_pop ~ Normal(ba, (2 * |ba|)^2)
      theta_pop ~ Normal(theta, 4 * theta_ci_width^2)

  Variance inflation factor of 4 doubles the SD relative to the half-width of
  the reported CI — i.e. treats the published CI as optimistic about between-
  person applicability. Literature edges get an even looser SD=2|bb| because
  the estimates have unknown individual applicability in this population.

Caveat: `edgeSummaryRaw.json` has `theta_ci` but no `bb_ci` / `ba_ci` fields.
We derive a slope-SE proxy from `eff_n` (effective sample size used by the
fitter):

    bb_ci_width := |bb| / sqrt(max(eff_n, 2))

Logic: for a normalized regression slope, SE scales as 1/sqrt(n). The |bb|
multiplier calibrates width to the same units as the effect. At eff_n=2 the
width equals |bb| (extremely wide); at eff_n=100 it shrinks to |bb|/10. The
final prior SD after the 4x variance inflation is therefore 2|bb|/sqrt(eff_n)
— e.g. for eff_n=4 the prior SD is |bb|, so the prior is roughly Normal(bb,
bb^2), which is appropriately diffuse for small-n edges and correctly tightens
as the fit improves.

Both `bb` and `ba` use the same width when we can't separate them — the
slope-SE proxy is blind to which regime the fit came from.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import numpy as np

from .point_engine import SOURCE_COL_TO_NODE
from .synthetic.config import TARGET_COLUMN_MAP


VARIANCE_INFLATION = 4.0
LITERATURE_SD_MULTIPLIER = 2.0  # SD = 2|bb| => var = 4*bb^2


@dataclass(frozen=True)
class EdgePrior:
    """Population Normal prior on one edge's parameters."""
    edge_id: tuple[str, str]          # (source, target)
    title: str
    provenance: str                    # "fitted" | "literature"
    curve: str
    eff_n: int
    # Slope priors
    mean_slope_bb: float
    var_slope_bb: float
    mean_slope_ba: float
    var_slope_ba: float
    # Threshold prior
    mean_theta: Optional[float]
    var_theta: Optional[float]
    # Bookkeeping
    bb_ci_width_used: float
    ba_ci_width_used: float
    theta_ci_width_used: Optional[float]


def _parse_ci_string(ci: str | None) -> Optional[tuple[float, float]]:
    """Parse a theta_ci like '[132.37, 174.05]' into (lo, hi). Returns None on failure."""
    if not ci or not isinstance(ci, str):
        return None
    s = ci.strip().lstrip("[").rstrip("]")
    try:
        lo_s, hi_s = s.split(",")
        return float(lo_s), float(hi_s)
    except (ValueError, AttributeError):
        return None


def _half_width(ci: Optional[tuple[float, float]]) -> Optional[float]:
    """Half-width of a CI = (hi - lo) / 2. None if ci is None or zero-width."""
    if ci is None:
        return None
    hw = (ci[1] - ci[0]) / 2.0
    return abs(hw) if hw != 0 else None


def _slope_ci_width_from_eff_n(bb: float, eff_n: int) -> float:
    """Proxy for slope CI half-width when no direct bb_ci is available.

    |bb| / sqrt(max(eff_n, 2)). See module docstring for rationale.
    """
    n = max(int(eff_n), 2)
    return abs(bb) / np.sqrt(n)


def build_edge_prior(edge: dict) -> EdgePrior:
    """Construct a single EdgePrior from one raw edge dict.

    Source/target are normalized to DAG node names (e.g. 'daily_run_km' ->
    'running_volume', 'ferritin_smoothed' -> 'ferritin') so downstream lookups
    match the point engine's equation graph.
    """
    raw_source = str(edge["source"])
    raw_target = str(edge["target"])
    source = SOURCE_COL_TO_NODE.get(raw_source, raw_source)
    target = TARGET_COLUMN_MAP.get(raw_target, raw_target)
    bb = float(edge["bb"])
    ba = float(edge["ba"])
    theta = float(edge["theta"]) if edge.get("theta") is not None else None
    eff_n = int(edge.get("eff_n", 2))
    provenance = str(edge.get("provenance", "fitted"))

    theta_ci = _parse_ci_string(edge.get("theta_ci"))
    theta_hw = _half_width(theta_ci)

    # Proxies for slope CI widths (no bb_ci/ba_ci in source JSON).
    bb_hw = _slope_ci_width_from_eff_n(bb, eff_n)
    ba_hw = _slope_ci_width_from_eff_n(ba, eff_n)

    if provenance == "literature":
        # Very wide: SD = 2|bb|, var = 4 * bb^2. Same for ba.
        # Floor prevents zero-variance when bb==0 (rare but possible).
        floor_bb = max(abs(bb), 0.1)
        floor_ba = max(abs(ba), 0.1)
        var_bb = (LITERATURE_SD_MULTIPLIER * floor_bb) ** 2
        var_ba = (LITERATURE_SD_MULTIPLIER * floor_ba) ** 2
    else:
        var_bb = VARIANCE_INFLATION * bb_hw ** 2
        var_ba = VARIANCE_INFLATION * ba_hw ** 2
        # Guard against exact-zero variance (bb == 0 yields proxy width of 0).
        # Floor at (0.05)^2 so the prior remains a proper distribution — still
        # tight enough that non-null cohort/user evidence dominates.
        var_bb = max(var_bb, 0.05 ** 2)
        var_ba = max(var_ba, 0.05 ** 2)

    if theta is not None and theta_hw is not None:
        var_theta = VARIANCE_INFLATION * theta_hw ** 2
    else:
        var_theta = None

    return EdgePrior(
        edge_id=(source, target),
        title=str(edge.get("title", f"{source} -> {target}")),
        provenance=provenance,
        curve=str(edge.get("curve", "linear")),
        eff_n=eff_n,
        mean_slope_bb=bb,
        var_slope_bb=float(var_bb),
        mean_slope_ba=ba,
        var_slope_ba=float(var_ba),
        mean_theta=theta,
        var_theta=float(var_theta) if var_theta is not None else None,
        bb_ci_width_used=float(bb_hw),
        ba_ci_width_used=float(ba_hw),
        theta_ci_width_used=float(theta_hw) if theta_hw is not None else None,
    )


def build_all_priors(edge_json_path: str | Path) -> dict[tuple[str, str], EdgePrior]:
    """Load edgeSummaryRaw.json and return {edge_id: EdgePrior} for every edge."""
    with open(edge_json_path, "r", encoding="utf-8") as f:
        edges = json.load(f)
    priors: dict[tuple[str, str], EdgePrior] = {}
    for e in edges:
        p = build_edge_prior(e)
        priors[p.edge_id] = p
    return priors


def write_priors_json(
    priors: dict[tuple[str, str], EdgePrior],
    out_path: str | Path,
) -> None:
    """Serialize priors to a JSON file keyed by 'source|target' strings."""
    out = {}
    for (src, tgt), p in priors.items():
        d = asdict(p)
        d["edge_id"] = [src, tgt]  # tuples don't round-trip through JSON
        out[f"{src}|{tgt}"] = d
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)


def load_priors_json(path: str | Path) -> dict[tuple[str, str], EdgePrior]:
    """Inverse of write_priors_json."""
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    priors: dict[tuple[str, str], EdgePrior] = {}
    for _, d in raw.items():
        src, tgt = d.pop("edge_id")
        priors[(src, tgt)] = EdgePrior(edge_id=(src, tgt), **d)
    return priors


if __name__ == "__main__":
    import sys

    repo_root = Path(__file__).resolve().parents[2]
    edge_json = repo_root / "src" / "data" / "dataValue" / "edgeSummaryRaw.json"
    out_json = repo_root / "backend" / "output" / "population_priors.json"

    priors = build_all_priors(edge_json)
    write_priors_json(priors, out_json)

    n_fit = sum(1 for p in priors.values() if p.provenance == "fitted")
    n_lit = sum(1 for p in priors.values() if p.provenance == "literature")
    print(f"Wrote {len(priors)} edge priors to {out_json}")
    print(f"  fitted: {n_fit}, literature: {n_lit}")

    # Spot-check one of each.
    for tag in ("fitted", "literature"):
        sample = next((p for p in priors.values() if p.provenance == tag), None)
        if sample:
            print(
                f"  sample ({tag}): {sample.title} | "
                f"bb={sample.mean_slope_bb:.4g} (var={sample.var_slope_bb:.4g}), "
                f"ba={sample.mean_slope_ba:.4g} (var={sample.var_slope_ba:.4g}), "
                f"eff_n={sample.eff_n}"
            )
