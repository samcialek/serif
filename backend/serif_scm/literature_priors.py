"""Loader for literature-backed total-effect priors.

Reads `backend/data/literature_priors.yaml` and returns LiteraturePrior
records keyed the same way as the synthetic TotalEffectPrior fits
(`(cohort, action, outcome)`). Shape-compatible with the blender.

Gate: entries with `citation_status != "verified"` are skipped by default.
Pass `include_drafts=True` to opt in while iterating. This is deliberate —
draft entries have betas reconstructed from memory / agent summaries and
must be checked against the source paper before going live.

See `backend/data/LITERATURE_PRIORS.md` for the process and seeding plan.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import yaml


DEFAULT_YAML_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "literature_priors.yaml"
)

VALID_STATUSES = {"verified", "needs_verification", "draft"}


@dataclass(frozen=True)
class LiteraturePrior:
    """Population prior on scaled_effect from published literature.

    Shape mirrors TotalEffectPrior's identifying tuple and its
    (mean, variance, n) triple so the blender can treat both uniformly.
    """
    cohort: str          # usually "__all__"
    action: str
    outcome: str
    mean: float          # slope per one MARGINAL_STEPS[action] step, outcome units
    variance: float      # SE**2 * transportability_inflation
    raw_se: float        # reported SE before inflation
    n: int
    source: str
    doi: str
    year: int
    reported_units: str
    conversion_note: str
    transportability_inflation: float
    citation_status: str
    notes: str = ""

    @property
    def inflated_std(self) -> float:
        return self.variance ** 0.5


def load_literature_priors(
    yaml_path: Path | str | None = None,
    include_drafts: bool = False,
) -> dict[tuple[str, str, str], LiteraturePrior]:
    """Parse the literature-priors YAML and return a dict keyed by
    (cohort, action, outcome).

    Parameters
    ----------
    yaml_path : optional override; defaults to `backend/data/literature_priors.yaml`.
    include_drafts : if False (default), skip entries whose citation_status
        is not "verified". If True, include needs_verification + draft too.
    """
    path = Path(yaml_path) if yaml_path else DEFAULT_YAML_PATH
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    default_inflation = float(raw.get("default_transportability_inflation", 2.0))
    entries = raw.get("entries", []) or []

    out: dict[tuple[str, str, str], LiteraturePrior] = {}
    for entry in entries:
        _validate_entry(entry)
        status = entry.get("citation_status", "draft")
        if not include_drafts and status != "verified":
            continue
        inflation = float(
            entry.get("transportability_inflation", default_inflation)
        )
        se = float(entry["se"])
        variance = (se ** 2) * inflation

        prior = LiteraturePrior(
            cohort=str(entry["cohort"]),
            action=str(entry["action"]),
            outcome=str(entry["outcome"]),
            mean=float(entry["mean"]),
            variance=variance,
            raw_se=se,
            n=int(entry["n"]),
            source=str(entry["source"]),
            doi=str(entry["doi"]),
            year=int(entry["year"]),
            reported_units=str(entry.get("reported_units", "")),
            conversion_note=str(entry.get("conversion_note", "")),
            transportability_inflation=inflation,
            citation_status=status,
            notes=str(entry.get("notes", "")),
        )
        out[(prior.cohort, prior.action, prior.outcome)] = prior

    return out


def _validate_entry(entry: dict) -> None:
    """Fail loudly on missing required fields — better to error at load
    than silently pool a malformed prior into the blend."""
    required = {"action", "outcome", "cohort", "mean", "se", "n", "source", "doi", "year"}
    missing = required - set(entry.keys())
    if missing:
        raise ValueError(f"literature_priors entry missing fields: {sorted(missing)}")
    status = entry.get("citation_status", "draft")
    if status not in VALID_STATUSES:
        raise ValueError(
            f"literature_priors entry has invalid citation_status: {status!r} "
            f"(must be one of {sorted(VALID_STATUSES)})"
        )


def summarize(priors: Iterable[LiteraturePrior]) -> str:
    """Human-readable table for CLI / debug. One line per prior."""
    lines = []
    for p in priors:
        lines.append(
            f"{p.cohort:10s} {p.action:18s} -> {p.outcome:28s} "
            f"b={p.mean:+.3f} SE={p.raw_se:.3f} n={p.n:>6d} "
            f"infl={p.transportability_inflation:.1f}x [{p.citation_status}]"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Dump literature priors.")
    parser.add_argument("--include-drafts", action="store_true",
                        help="Include entries with citation_status != verified")
    args = parser.parse_args()

    priors = load_literature_priors(include_drafts=args.include_drafts)
    if not priors:
        print("(no literature priors loaded — use --include-drafts to see drafts)")
    else:
        print(summarize(priors.values()))
