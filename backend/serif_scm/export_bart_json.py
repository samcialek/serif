"""Bundle BART posterior npz files to browser-friendly JSON for the TS Twin.

Reads `output/bart_draws/{outcome}.npz` + `manifest.json`, subsamples the
posterior draw axis down to a browser-sized K (default 200), and writes
per-outcome JSON files plus a bundle manifest to `public/data/bartDraws/`
(served statically by Vite at `/data/bartDraws/*`).

Two-stage pipeline so we can iterate on the TS-side consumer without
re-running MCMC:

    # 1. Expensive: run MCMC, write npz
    python -m serif_scm.export_bart_draws --n-draws 800 --n-chains 1

    # 2. Cheap: read npz, subsample, write JSON for TS
    python -m serif_scm.export_bart_json

Output layout:
    public/data/bartDraws/
        manifest.json          {outcome: {path, parent_names, n_draws, ...}}
        hrv_daily.json          compact BartPosteriorDraws payload
        ...

The JSON schema mirrors `BartPosteriorDraws.to_json_compact()` — see
`bart_fit.py` for the canonical shape.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .bart_fit import BartPosteriorDraws


DEFAULT_NPZ_DIR = Path("./output/bart_draws")
# Matches the Serif demo build: TS imports JSON from this tree.
DEFAULT_JSON_DIR = Path("../public/data/bartDraws")


def bundle_npz_to_json(
    npz_dir: Path,
    json_dir: Path,
    *,
    target_k: int = 200,
    seed: int = 0,
) -> dict[str, dict]:
    """Convert every ok outcome npz in `npz_dir` to compact JSON in `json_dir`.

    Returns a bundle manifest keyed by outcome, containing path + the
    BART fit's provenance block from the original manifest.
    """
    npz_dir = Path(npz_dir)
    json_dir = Path(json_dir)
    json_dir.mkdir(parents=True, exist_ok=True)

    src_manifest_path = npz_dir / "manifest.json"
    if not src_manifest_path.exists():
        raise FileNotFoundError(
            f"Expected {src_manifest_path}. Run export_bart_draws.py first."
        )
    src_manifest: dict[str, dict] = json.loads(src_manifest_path.read_text())

    bundle: dict[str, dict] = {}

    for outcome, entry in sorted(src_manifest.items()):
        if entry.get("status") != "ok":
            print(f"  SKIP {outcome} (status={entry.get('status')})")
            continue

        npz_path = npz_dir / entry["path"]
        if not npz_path.exists():
            print(f"  SKIP {outcome} (missing {npz_path.name})")
            continue

        draws = BartPosteriorDraws.load_npz(npz_path)
        json_path = json_dir / f"{outcome}.json"
        draws.to_json_compact(json_path, target_k=target_k, seed=seed)

        # effective K = min(n_draws, target_k)
        k_effective = min(draws.n_draws, target_k)
        size_bytes = json_path.stat().st_size

        bundle[outcome] = {
            "path": json_path.name,
            "parent_names": draws.parent_names,
            "n_parents": draws.n_parents,
            "n_grid": draws.n_grid,
            "n_draws": k_effective,
            "n_training": draws.n_training,
            "n_trees": draws.n_trees,
            "data_mean": float(draws.data_mean),
            "size_bytes": size_bytes,
        }
        print(
            f"  OK   {outcome:<22s} K={k_effective:>3d}  G={draws.n_grid:>4d}  "
            f"P={draws.n_parents}  {size_bytes/1024:>6.1f} KB"
        )

    bundle_manifest_path = json_dir / "manifest.json"
    bundle_manifest_path.write_text(
        json.dumps(bundle, indent=2, sort_keys=True)
    )
    print(f"\nWrote bundle manifest: {bundle_manifest_path}")
    print(f"Total outcomes bundled: {len(bundle)}")
    total_bytes = sum(b["size_bytes"] for b in bundle.values())
    print(f"Total JSON size: {total_bytes/1024/1024:.2f} MB (uncompressed)")

    return bundle


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bundle BART npz posterior draws to browser-friendly JSON"
    )
    parser.add_argument(
        "--npz-dir",
        default=str(DEFAULT_NPZ_DIR),
        help="Input directory with {outcome}.npz + manifest.json from export_bart_draws",
    )
    parser.add_argument(
        "--json-dir",
        default=str(DEFAULT_JSON_DIR),
        help="Output directory for {outcome}.json + manifest.json (consumed by TS)",
    )
    parser.add_argument(
        "--target-k",
        type=int,
        default=200,
        help="Subsample posterior to this many draws per outcome (default: 200)",
    )
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    npz_dir = Path(args.npz_dir)
    json_dir = Path(args.json_dir)

    if not npz_dir.exists():
        print(f"Error: {npz_dir} not found.", file=sys.stderr)
        sys.exit(1)

    print(f"Reading npz from:  {npz_dir}")
    print(f"Writing JSON to:   {json_dir}")
    print(f"Target K:          {args.target_k} draws per outcome\n")

    bundle_npz_to_json(
        npz_dir,
        json_dir,
        target_k=args.target_k,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
