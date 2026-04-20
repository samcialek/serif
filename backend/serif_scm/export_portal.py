"""Per-participant portal export.

Runs the SCM engine on each participant, applies v2.5 certainty gating, and
writes a JSON file per participant that the frontend can load directly.

Output layout (under --out, default ./output/portal):
    participant_{pid}.json   per-participant causal effects + gating
    manifest.json            SHA-256 of upstream artifacts + export metadata

Usage:
    python -m serif_scm.export_portal --data-dir ./output --out ./output/portal
    python -m serif_scm.export_portal --all                (default: all 1,188)
    python -m serif_scm.export_portal -n 10                (first 10 for testing)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
import time
from dataclasses import asdict
from pathlib import Path

from .transform import build_all_participants, build_observed_values
from .point_engine import (
    build_equations,
    topological_sort,
    get_descendants,
    compute_marginal_effects,
    MANIPULABLE_NODES,
    MARGINAL_STEPS,
    SOURCE_COL_TO_NODE,
)
from .synthetic.generator import load_edges, REGIME_EDGE_DEFS, EDGE_DATA_PATH
from .synthetic.config import TARGET_COLUMN_MAP
from .gating import (
    compute_gating_score, GatingInput, parse_theta_ci,
    PRESET_BOUNDARIES, DEFAULT_PRESET, is_exposed,
)
from .clinical_thresholds import CLINICAL_THRESHOLDS
from .reconcile import compute_regime_activations


# ── Regime-mediation detection ──────────────────────────────────

REGIME_STATES: frozenset[str] = frozenset({
    "overreaching_state",
    "iron_deficiency_state",
    "sleep_deprivation_state",
    "inflammation_state",
})


def build_regime_mediated_lookup(equations) -> dict[str, set[str]]:
    """For each action, return the set of outcomes whose path passes through
    any regime_state node. Conservative: any regime-on-path marks it.
    """
    mediated: dict[str, set[str]] = {}
    for action in MANIPULABLE_NODES:
        action_desc = get_descendants(action, equations)
        regimes_touched = action_desc & REGIME_STATES
        outcomes: set[str] = set()
        for regime in regimes_touched:
            regime_desc = get_descendants(regime, equations) | {regime}
            outcomes |= regime_desc
        mediated[action] = outcomes
    return mediated


# ── Edge metadata lookup (keyed by resolved (source_node, target_node)) ──

def build_edge_metadata() -> dict[tuple[str, str], dict]:
    """Load raw edges and key them by (source_node, target_node) for fast lookup.

    Carries provenance, theta, theta_ci_width, personal_pct, eff_n — the fields
    gating needs that aren't on the Equation object.
    """
    raw = load_edges()  # fitted edges + regime edge defs
    meta: dict[tuple[str, str], dict] = {}
    for e in raw:
        src = SOURCE_COL_TO_NODE.get(e["source"], e["source"])
        tgt = TARGET_COLUMN_MAP.get(e["target"], e["target"])
        key = (src, tgt)
        prov = e.get("provenance", "fitted")
        theta_ci_width = parse_theta_ci(e.get("theta_ci"))
        record = {
            "provenance": prov,
            "theta": float(e.get("theta", 0.0)),
            "theta_ci_width": theta_ci_width,
            "personal_pct": float(e.get("personal_pct", 0)) / 100.0,  # stored as %, use as fraction
            "eff_n": float(e.get("eff_n", 1)),
            "curve": e.get("curve", "linear"),
            "is_regime_edge": src in REGIME_STATES or tgt in REGIME_STATES,
        }
        # Keep the record with highest eff_n if duplicates (matches Equation dedupe rule)
        existing = meta.get(key)
        if existing is None or record["eff_n"] > existing["eff_n"]:
            meta[key] = record
    return meta


# ── Hashing ─────────────────────────────────────────────────────

def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ── Per-participant export ──────────────────────────────────────

def _gating_for_effect(
    action: str,
    outcome: str,
    effect,  # NodeEffect
    user_dose: float,
    edge_meta: dict[tuple[str, str], dict],
    regime_mediated: dict[str, set[str]],
    preset: str = DEFAULT_PRESET,
) -> dict:
    """Compute gating for one (action, outcome) effect."""
    is_regime_path = outcome in regime_mediated.get(action, set())

    # Look up the direct edge action->outcome for provenance/theta.
    direct = edge_meta.get((action, outcome))
    if direct is not None:
        provenance = direct["provenance"]
        theta = direct["theta"]
        theta_ci_width = direct["theta_ci_width"]
        personal_pct = direct["personal_pct"]
        edge_found = "direct"
    else:
        # Fall back to the action's first outgoing edge as position-anchor.
        anchor = None
        for (s, t), m in edge_meta.items():
            if s == action and not m["is_regime_edge"]:
                anchor = m
                break
        if anchor is not None:
            provenance = anchor["provenance"]
            theta = anchor["theta"]
            theta_ci_width = anchor["theta_ci_width"]
            personal_pct = anchor["personal_pct"]
        else:
            provenance = "fitted"
            theta = None
            theta_ci_width = None
            personal_pct = 0.0
        edge_found = "action_anchor"

    gating_in = GatingInput(
        effect=effect.scaled_effect,
        outcome=outcome,
        eff_n=effect.eff_n_bottleneck,
        provenance=provenance,
        personal_pct=personal_pct,
        user_dose=user_dose,
        theta=theta,
        theta_ci_width=theta_ci_width,
        is_regime_aggregate=is_regime_path,
        preset=preset,
    )
    gating = compute_gating_score(gating_in)

    return {
        "action": action,
        "action_change": MARGINAL_STEPS[action],
        "outcome": outcome,
        "factual": effect.factual,
        "counterfactual": effect.counterfactual,
        "equilibrium_effect": effect.effect,
        "scaled_effect": effect.scaled_effect,
        "ci_low": effect.ci_low,
        "ci_high": effect.ci_high,
        "eff_n": effect.eff_n_bottleneck,
        "tau_days": effect.tau_days,
        "temporal_factor": effect.temporal_factor,
        "provenance": provenance,
        "edge_source": edge_found,                # 'direct' or 'action_anchor'
        "is_regime_mediated": is_regime_path,
        "direction": gating.breakdown.direction,
        "beneficial": gating.breakdown.beneficial,
        "min_detectable": gating.breakdown.min_detectable,
        "gate": {
            "score": gating.score,
            "tier": gating.tier,
            "p_meaningful": gating.p_meaningful,
            "position_confidence": gating.position_confidence,
            "theta_margin": gating.breakdown.theta_margin,
            "literature_suppressed": gating.breakdown.literature_suppressed,
        },
    }


def _export_one(
    state: dict,
    equations,
    topo_order,
    edge_meta: dict[tuple[str, str], dict],
    regime_mediated: dict[str, set[str]],
    preset: str = DEFAULT_PRESET,
) -> dict:
    observed = build_observed_values(state, use_baseline=False)
    all_effects = compute_marginal_effects(observed, equations, topo_order)

    rows: list[dict] = []
    for action, effects_by_target in all_effects.items():
        user_dose = observed.get(action, 0.0)
        for outcome, effect in effects_by_target.items():
            rows.append(
                _gating_for_effect(
                    action, outcome, effect, user_dose,
                    edge_meta, regime_mediated,
                    preset=preset,
                )
            )

    # Tier counts for quick sanity-check
    tier_counts = {"recommended": 0, "possible": 0, "not_exposed": 0}
    for r in rows:
        tier_counts[r["gate"]["tier"]] += 1

    # Regime state activations — sigmoid on the regime input nodes
    # (acwr / ferritin / sleep_debt / hscrp). Matches regime_statuses.csv.
    regime_values = compute_regime_activations(observed)

    exposed_count = tier_counts["recommended"] + tier_counts["possible"]

    return {
        "pid": int(state["pid"]),
        "cohort": str(state["cohort"]),
        "age": int(state["age"]),
        "is_female": bool(state["is_female"]),
        "mean_adherence": float(state["mean_adherence"]),
        "preset": preset,
        "observed": {
            "behavioral": state["behavioral_state"],
            "wearable": state["wearable_state"],
            "derived": state["derived"],
            "day1_blood": state["day1_blood"],
            "current_blood": state["current_blood"],
        },
        "regime_activation": regime_values,
        "effects": rows,
        "tier_counts": tier_counts,
        "exposed_count": exposed_count,
    }


# ── Main ────────────────────────────────────────────────────────

def _resolve_upstream_paths() -> dict[str, Path]:
    """Paths whose content determines whether an export is stale."""
    backend_dir = Path(__file__).resolve().parent
    serif_root = backend_dir.parents[1]
    return {
        "edgeSummaryRaw.json": EDGE_DATA_PATH,
        "clinical_thresholds.py": backend_dir / "clinical_thresholds.py",
        "gating.py": backend_dir / "gating.py",
        "point_engine.py": backend_dir / "point_engine.py",
        "transform.py": backend_dir / "transform.py",
        "synthetic_config.py": backend_dir / "synthetic" / "config.py",
        "synthetic_generator.py": backend_dir / "synthetic" / "generator.py",
    }


def main():
    ap = argparse.ArgumentParser(description="Serif per-participant portal export")
    ap.add_argument("--data-dir", default="./output",
                    help="Path to synthetic CSV directory")
    ap.add_argument("--out", default="./output/portal",
                    help="Output directory for participant_{pid}.json files")
    ap.add_argument("-n", type=int, default=None,
                    help="Limit to N participants (default: all)")
    ap.add_argument("--all", action="store_true",
                    help="Process all participants (default for now)")
    ap.add_argument("--preset", choices=["strict", "default", "permissive"],
                    default=DEFAULT_PRESET,
                    help=f"Gate tier preset (default: {DEFAULT_PRESET}). "
                         f"Raw gate.score is preset-independent; frontend can "
                         f"re-tier client-side.")
    ap.add_argument("--seed", type=int, default=42,
                    help="RNG seed for spot-check sampling")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out)
    if not data_dir.exists():
        print(f"ERROR: data directory {data_dir} not found.")
        sys.exit(1)
    out_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    print(f"[export_portal] loading participants from {data_dir}...")
    participants = build_all_participants(data_dir)
    print(f"[export_portal] {len(participants)} participants loaded in {time.time()-t0:.1f}s")

    if args.n is not None and not args.all:
        participants = participants[: args.n]
        print(f"[export_portal] limited to first {len(participants)}")

    t1 = time.time()
    print("[export_portal] building engine...")
    equations = build_equations()
    topo_order = topological_sort(equations)
    edge_meta = build_edge_metadata()
    regime_mediated = build_regime_mediated_lookup(equations)
    print(f"[export_portal] engine ready: {len(equations)} eqs, "
          f"{len(edge_meta)} edge-meta rows, {sum(len(v) for v in regime_mediated.values())} "
          f"regime-mediated (action,outcome) pairs. {time.time()-t1:.2f}s")

    # Quick audit of literature edges on the gating side
    lit_edges = [(k, v) for k, v in edge_meta.items() if v["provenance"] == "literature"]
    print(f"[export_portal] {len(lit_edges)} literature edges in metadata: "
          f"{[f'{s}->{t}' for (s, t), _ in lit_edges]}")

    # ── Per-participant ─────────────────────────────────────────
    print(f"[export_portal] exporting to {out_dir} (preset={args.preset})...")
    t2 = time.time()
    n_exported = 0
    total_effects = 0
    # STOP CONDITION: literature-suppressed edges cap at gate<=0.1 regardless of preset.
    # This should be 0 under any preset because position_confidence is hard-set to 0.1.
    lit_violations = 0
    global_tier_counts = {"recommended": 0, "possible": 0, "not_exposed": 0}
    exposed_per_participant: list[int] = []

    for i, state in enumerate(participants):
        record = _export_one(state, equations, topo_order, edge_meta, regime_mediated,
                             preset=args.preset)
        pid = int(state["pid"])
        out_path = out_dir / f"participant_{pid:04d}.json"
        out_path.write_text(json.dumps(record, indent=2, default=float))
        n_exported += 1
        total_effects += len(record["effects"])
        for k, v in record["tier_counts"].items():
            global_tier_counts[k] += v
        exposed_per_participant.append(record["exposed_count"])

        # STOP CONDITION: literature-suppressed edges must never exceed 0.1 score
        # (= LITERATURE_SUPPRESSED_POSITION × max pMeaningful). Under any preset,
        # gate<=0.1 never hits recommended (min boundary is 0.2 for permissive).
        for eff in record["effects"]:
            g = eff["gate"]
            if g["literature_suppressed"] and g["score"] > 0.1 + 1e-9:
                lit_violations += 1

        if (i + 1) % 100 == 0:
            print(f"  ...{i+1}/{len(participants)} ({time.time()-t2:.1f}s)")

    elapsed = time.time() - t2
    exposed_total = global_tier_counts["recommended"] + global_tier_counts["possible"]
    exposed_avg = exposed_total / max(n_exported, 1)
    exposed_sorted = sorted(exposed_per_participant)
    pct = lambda q: exposed_sorted[min(int(q * len(exposed_sorted)), len(exposed_sorted) - 1)]

    print(f"[export_portal] wrote {n_exported} files in {elapsed:.1f}s "
          f"({elapsed/max(n_exported, 1):.3f}s/participant)")
    print(f"[export_portal] total (action,outcome) effects: {total_effects} "
          f"(avg {total_effects/max(n_exported,1):.1f} per participant)")
    print(f"[export_portal] tier distribution ({args.preset}): {global_tier_counts}")
    print(f"[export_portal] exposed (recommended+possible) total: {exposed_total}")
    print(f"[export_portal] exposed per participant: "
          f"min={exposed_sorted[0]} p10={pct(0.10)} p25={pct(0.25)} "
          f"median={pct(0.50)} mean={exposed_avg:.1f} p75={pct(0.75)} "
          f"p90={pct(0.90)} max={exposed_sorted[-1]}")

    if lit_violations > 0:
        print(f"[export_portal] STOP CONDITION HIT: {lit_violations} literature-suppressed "
              f"rows exceeded score>0.1. Position suppression broke. Investigate.")
        sys.exit(2)
    print(f"[export_portal] literature-suppression invariant: OK (0 violations)")

    # Cadence-target warning (not a hard stop, but flag for review).
    if exposed_total < 20_000 or exposed_total > 80_000:
        print(f"[export_portal] WARNING: exposed total {exposed_total} outside target "
              f"range [20000, 80000]. Gate preset may need re-tuning.")

    # ── Manifest ────────────────────────────────────────────────
    upstream = _resolve_upstream_paths()
    hashes = {name: sha256_of(p) if p.exists() else None for name, p in upstream.items()}
    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "n_participants": n_exported,
        "n_effects_total": total_effects,
        "preset": args.preset,
        "preset_boundaries": PRESET_BOUNDARIES,
        "tier_counts": global_tier_counts,
        "exposed_total": exposed_total,
        "exposed_mean_per_participant": exposed_avg,
        "manipulable_actions": sorted(MANIPULABLE_NODES),
        "marginal_steps": MARGINAL_STEPS,
        "regime_states": sorted(REGIME_STATES),
        "upstream_hashes": hashes,
        "clinical_thresholds_count": len(CLINICAL_THRESHOLDS),
        "literature_anchored_outcomes": sorted(
            o for o, t in CLINICAL_THRESHOLDS.items() if t.source == "literature"
        ),
        "engine_version": "v2.5-point+gating",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[export_portal] wrote manifest.json")

    # ── Spot-check sample ───────────────────────────────────────
    rng = random.Random(args.seed)
    sample_pids = rng.sample(
        [s["pid"] for s in participants], min(10, len(participants))
    )
    print(f"[export_portal] spot-check sample: {sample_pids}")
    for pid in sample_pids:
        p = out_dir / f"participant_{pid:04d}.json"
        d = json.loads(p.read_text())
        n_rec = sum(1 for e in d["effects"] if e["gate"]["tier"] == "recommended")
        n_pos = sum(1 for e in d["effects"] if e["gate"]["tier"] == "possible")
        top = sorted(d["effects"], key=lambda e: -e["gate"]["score"])[:2]
        top_summary = ", ".join(
            f"{e['action']}->{e['outcome']} g={e['gate']['score']:.2f}" for e in top
        )
        print(f"  pid={pid} cohort={d['cohort']} effects={len(d['effects'])} "
              f"rec={n_rec} pos={n_pos} | top2: {top_summary}")

    print(f"[export_portal] DONE in {time.time()-t0:.1f}s total")


if __name__ == "__main__":
    main()
