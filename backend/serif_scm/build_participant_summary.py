"""Build a compact per-participant summary for fast filter/sort in the UI.

Scans `output/portal_bayesian/participant_*.json` and emits
`participant_summary.json` — a small file (~150KB) the frontend loads once
to drive roster-level controls (regime multi-select, sort by gate-score /
regime-urgency). Copied to `public/portal_bayesian/` so Vite serves it.

Usage:
    python -m serif_scm.build_participant_summary
    python -m serif_scm.build_participant_summary --out ./output/portal_bayesian
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path


def _summarize(record: dict) -> dict:
    effects = record.get("effects_bayesian") or []
    rec = pos = 0
    gate_score_sum = 0.0
    for e in effects:
        gate = e.get("gate") or {}
        tier = gate.get("tier")
        score = float(gate.get("score", 0.0) or 0.0)
        if tier == "recommended":
            rec += 1
            gate_score_sum += score
        elif tier == "possible":
            pos += 1
            gate_score_sum += score

    regime = record.get("regime_activations") or {}
    regime_max = max((float(v) for v in regime.values()), default=0.0)

    return {
        "pid": int(record["pid"]),
        "cohort": str(record.get("cohort", "")),
        "exposed_count": rec + pos,
        "recommended_count": rec,
        "possible_count": pos,
        "gate_score_sum": round(gate_score_sum, 4),
        "regime_activations": {k: round(float(v), 4) for k, v in regime.items()},
        "regime_urgency": round(regime_max, 4),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Build participant_summary.json")
    ap.add_argument("--out", default="./output/portal_bayesian")
    ap.add_argument("--public",
                    default="../public/portal_bayesian",
                    help="Also copy summary to this path (frontend public dir)")
    args = ap.parse_args()

    out_dir = Path(args.out)
    jsons = sorted(out_dir.glob("participant_*.json"))
    print(f"[summary] scanning {len(jsons)} participant JSONs...")

    t0 = time.time()
    summaries = []
    for jpath in jsons:
        record = json.loads(jpath.read_text())
        summaries.append(_summarize(record))

    summaries.sort(key=lambda s: s["pid"])

    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_participants": len(summaries),
        "participants": summaries,
    }

    dest = out_dir / "participant_summary.json"
    dest.write_text(json.dumps(payload, default=float))
    size_kb = dest.stat().st_size / 1024
    print(f"[summary] wrote {dest} ({size_kb:.1f} KB, {time.time()-t0:.1f}s)")

    public_dir = Path(args.public)
    if public_dir.exists():
        pub_dest = public_dir / "participant_summary.json"
        pub_dest.write_text(json.dumps(payload, default=float))
        print(f"[summary] mirrored to {pub_dest}")
    else:
        print(f"[summary] public dir {public_dir} not found; skipping mirror")


if __name__ == "__main__":
    main()
