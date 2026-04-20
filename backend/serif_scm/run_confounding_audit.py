"""Audit-only script: cross-reference 8 latent confounders against 59 fitted edges.

Sources of truth:
- backend/output/population_priors.json   (59 fitted edges with bb/ba/effN)
- serif_confounding_structure.md (memory)  (latent → edge specs from architect)
- src/data/dataValue/mechanismCatalog.ts   (wiring status in TS DAG)
- backend/output/portal_bayesian/         (recommendation tiers per edge)

Does NOT modify model or regenerate exports. Writes:
- backend/output/confounding_audit.md
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path


# ── 8 latent confounders → (source, target) pairs they contaminate ──
# From serif_confounding_structure.md (architect domain knowledge)
LATENT_EDGES: dict[str, list[tuple[str, str]]] = {
    "lipoprotein_lipase": [
        ("zone2_volume", "triglycerides"),
        ("zone2_volume", "hdl"),
        ("zone2_volume", "ldl"),
        ("training_volume", "triglycerides"),
        ("training_volume", "hdl"),
    ],
    "reverse_cholesterol_transport": [
        ("zone2_volume", "hdl"),
        ("zone2_volume", "apob"),
        ("zone2_volume", "non_hdl_cholesterol"),
    ],
    "core_temperature": [
        ("workout_time", "sleep_efficiency"),
        ("training_load", "sleep_quality"),
        ("training_load", "deep_sleep"),
    ],
    "energy_expenditure": [
        ("training_volume", "body_fat_pct"),
        ("steps", "body_mass"),
        ("active_energy", "testosterone"),
        ("running_volume", "leptin"),
    ],
    "leptin": [
        ("body_fat_pct", "testosterone"),
        ("body_fat_pct", "cortisol"),
        ("dietary_energy", "inflammation"),
    ],
    "insulin_sensitivity": [
        ("training_volume", "glucose"),
        ("training_volume", "insulin"),
        ("training_volume", "hba1c"),
        ("zone2_volume", "triglycerides"),
    ],
    "sweat_iron_loss": [
        ("running_volume", "iron_total"),
        ("running_volume", "ferritin"),
        ("training_volume", "iron_total"),
    ],
    "gi_iron_loss": [
        ("running_volume", "iron_total"),
        ("running_volume", "ferritin"),
        ("running_volume", "hemoglobin"),
    ],
}

# Per-edge wiring (Phase 2 + final Phase 3). Must mirror EDGE_LATENTS in
# `fit_confounded_priors.py`. `insulin_sensitivity` is wired on triglycerides
# and glucose but not on insulin or hba1c (those edges were dropped from the
# fit as over-parameterized); `energy_expenditure`, `reverse_cholesterol_transport`,
# `core_temperature`, `leptin` are not wired anywhere.
EDGE_LATENTS_WIRED: dict[tuple[str, str], list[str]] = {
    ("running_volume", "ferritin"): ["sweat_iron_loss", "gi_iron_loss"],
    ("running_volume", "iron_total"): ["sweat_iron_loss", "gi_iron_loss"],
    ("running_volume", "hemoglobin"): ["gi_iron_loss"],
    ("zone2_volume", "triglycerides"): ["lipoprotein_lipase", "insulin_sensitivity"],
    ("zone2_volume", "hdl"): ["lipoprotein_lipase"],
    ("zone2_volume", "ldl"): ["lipoprotein_lipase"],
    ("training_volume", "glucose"): ["insulin_sensitivity"],
}

# Derived: set of (latent, edge) pairs where the latent is wired as a confounder.
WIRED_LATENT_EDGE_PAIRS: set[tuple[str, tuple[str, str]]] = {
    (lat, pair) for pair, lats in EDGE_LATENTS_WIRED.items() for lat in lats
}


def classify_risk(unresolved: list[str]) -> str:
    """Risk is driven by UNRESOLVED latents on this specific edge — wired
    latents no longer contaminate.

    Wiring in the NumPyro model doesn't remove bias from the TS engine's
    recommendation path yet (portal_bayesian was computed pre-Phase-2), so
    this classification reflects post-Phase-3 model state, not live portal risk.
    """
    n = len(unresolved)
    if n == 0:
        return "LOW"
    if n == 1:
        return "MEDIUM"
    return "HIGH"  # >=2 unresolved


def load_fitted_edges(priors_path: Path) -> dict[tuple[str, str], dict]:
    with open(priors_path) as f:
        raw = json.load(f)
    edges: dict[tuple[str, str], dict] = {}
    for k, v in raw.items():
        s, t = k.split("|")
        edges[(s, t)] = {
            "bb": float(v["mean_slope_bb"]),
            "ba": float(v["mean_slope_ba"]),
            "eff_n": int(v.get("eff_n", 0)),
            "curve": v.get("curve", ""),
            "provenance": v.get("provenance", ""),
        }
    return edges


def edge_to_latents() -> dict[tuple[str, str], list[str]]:
    """(source, target) -> list of latents touching this edge (per spec)."""
    m: dict[tuple[str, str], list[str]] = defaultdict(list)
    for latent, pairs in LATENT_EDGES.items():
        for pair in pairs:
            m[pair].append(latent)
    return m


def load_portal_tiers(portal_dir: Path) -> dict[tuple[str, str], Counter]:
    """(action, outcome) -> Counter({tier: count}) across all participants."""
    per_pair: dict[tuple[str, str], Counter] = defaultdict(Counter)
    part_files = sorted(portal_dir.glob("participant_*.json"))
    for pf in part_files:
        with open(pf) as f:
            d = json.load(f)
        for e in d.get("effects_bayesian", []):
            key = (e["action"], e["outcome"])
            per_pair[key][e["gate"]["tier"]] += 1
    return per_pair


def main():
    backend_dir = Path(__file__).resolve().parent.parent
    priors_path = backend_dir / "output" / "population_priors.json"
    portal_dir = backend_dir / "output" / "portal_bayesian"
    out_path = backend_dir / "output" / "confounding_audit.md"

    fitted_edges = load_fitted_edges(priors_path)
    latent_map = edge_to_latents()
    portal_tiers = load_portal_tiers(portal_dir)

    # ── Row construction ─────────────────────────────────────────────
    rows = []
    for (s, t), ep in fitted_edges.items():
        latents = latent_map.get((s, t), [])
        wired_for_edge = set(EDGE_LATENTS_WIRED.get((s, t), []))
        wired = [l for l in latents if l in wired_for_edge]
        unresolved = [l for l in latents if l not in wired_for_edge]
        risk = classify_risk(unresolved)
        tier_counter = portal_tiers.get((s, t), Counter())
        if not latents:
            wired_label = "—"
        elif not unresolved:
            wired_label = f"all wired: {', '.join(wired)}"
        elif not wired:
            wired_label = "none wired as confounder"
        else:
            wired_label = f"partial: {', '.join(wired)} wired; {', '.join(unresolved)} unresolved"
        rows.append({
            "source": s,
            "target": t,
            "bb": ep["bb"],
            "ba": ep["ba"],
            "eff_n": ep["eff_n"],
            "latents": latents,
            "unresolved": unresolved,
            "wired": wired_label,
            "risk": risk,
            "tiers": dict(tier_counter),
        })

    # ── Spec pairs with NO fitted edge (a separate failure mode) ─────
    all_spec_pairs = set()
    for pairs in LATENT_EDGES.values():
        for p in pairs:
            all_spec_pairs.add(p)
    missing_pairs = sorted(p for p in all_spec_pairs if p not in fitted_edges)

    # ── Portal tier stratification over the whole export ─────────────
    tier_by_risk: dict[str, Counter] = defaultdict(Counter)
    for row in rows:
        for tier, count in row["tiers"].items():
            tier_by_risk[row["risk"]][tier] += count

    # ── Emit markdown ────────────────────────────────────────────────
    lines: list[str] = []
    lines.append("# Confounding Audit — 8 Latent Confounders × 59 Fitted Edges")
    lines.append("")
    lines.append("**Generated:** audit-only, no model changes.")
    lines.append("")
    lines.append("**Sources:**")
    lines.append("- `backend/output/population_priors.json` — 59 fitted edges (55 fitted + 4 literature)")
    lines.append("- `memory/serif_confounding_structure.md` — latent → edge spec")
    lines.append("- `src/data/dataValue/mechanismCatalog.ts` — `STRUCTURAL_EDGES`, `LATENT_NODES`")
    lines.append(f"- `backend/output/portal_bayesian/` — {len(list(portal_dir.glob('participant_*.json')))} participant files")
    lines.append("")

    lines.append("## Wiring status of the 8 latents (post-Phase-3)")
    lines.append("")
    lines.append("**TS DAG (`STRUCTURAL_EDGES`):** no latents wired as confounders. Some appear as mediators on causal paths (`zone2_volume → lipoprotein_lipase → triglycerides`) but none tagged `edgeType: 'confounds'`.")
    lines.append("")
    lines.append("**NumPyro model (`serif_scm/model.py`):** Phase 2 wired 3 priority latents; Phase 3 added `insulin_sensitivity` on 2 edges. Three remaining latents (`reverse_cholesterol_transport`, `core_temperature`, `energy_expenditure`) were evaluated but not wired — see notes column. `fit_confounded_priors.py` jointly identifies `U_C`, `λ_C_action`, `λ_C_outcome`, `σ_C`, and edge slopes (`bb`, `ba`, `θ`) from cross-equation covariance across 1,188 participants.")
    lines.append("")
    lines.append("| Latent | Spec'd edges | Wired in NumPyro | Wired in TS DAG | Notes |")
    lines.append("|---|---:|---|---|---|")
    notes_map = {
        "sweat_iron_loss":
            "Phase 2 — both spec'd edges fitted; bb attenuated ~30% on ferritin/iron_total.",
        "gi_iron_loss":
            "Phase 2 — all three spec'd edges fitted with clean convergence.",
        "lipoprotein_lipase":
            "Phase 2 — all three `zone2→lipid` edges fitted; triglycerides attenuated ~60%.",
        "insulin_sensitivity":
            "Phase 3 — wired on `zone2→TG` and `training→glucose`. `training→insulin` dropped (26 divergences, near-zero causal slope); `training→hba1c` absent from fit (no signal, r~-0.01).",
        "reverse_cholesterol_transport":
            "Phase 3 — **dropped from model**. Fit moved `zone2→apob` and `zone2→non_hdl_cholesterol` *away* from zero, with |λ_action|~3 vs |λ_outcome|<0.3 (over-parameterization). LPL alone is the functional confounder on zone2→lipid in this synthetic data. Spec retained for real-user reference.",
        "core_temperature":
            "Deferred — `workout_end_hr` not persisted in `lifestyle_app.csv` (generator keeps in memory only). `training_load` pairs carry no signal (|r|<0.02). Blocked on synthetic-data regen.",
        "energy_expenditure":
            "Phase 3 — `training_volume→body_fat_pct` dropped (17 divergences, near-zero slope). Other spec'd pairs are intentional-gaps: `steps→body_mass` renamed, `active_energy→testosterone` and `running→leptin` not in generator.",
        "leptin":
            "No fitted edges to contaminate — all three spec'd pairs (`body_fat_pct→*`, `dietary_energy→inflammation`) are biomarker-as-source or generator-gaps.",
    }
    for latent, pairs in LATENT_EDGES.items():
        n_spec = len(pairs)
        n_wired = sum(
            1 for p in pairs if latent in EDGE_LATENTS_WIRED.get(p, [])
        )
        if n_wired == 0:
            np_wired = "no"
        elif n_wired == n_spec:
            np_wired = f"**yes** ({n_wired}/{n_spec})"
        else:
            np_wired = f"**partial** ({n_wired}/{n_spec})"
        ts_wired = "no"
        note = notes_map.get(latent, "")
        lines.append(f"| {latent} | {n_spec} | {np_wired} | {ts_wired} | {note} |")
    lines.append("")

    # ── Bias-risk summary ───────────────────────────────────────────
    risk_count = Counter(row["risk"] for row in rows)
    lines.append("## Bias-risk summary across 59 fitted edges")
    lines.append("")
    lines.append("Risk is driven by the count of **unresolved** (unwired) latents touching each edge. "
                 "Post-Phase-3 wiring: `sweat_iron_loss`, `gi_iron_loss`, `lipoprotein_lipase` on all their spec'd edges; "
                 "`insulin_sensitivity` on 2 of 4 spec'd edges.")
    lines.append("")
    lines.append(f"- **HIGH** (≥2 unresolved latents): **{risk_count['HIGH']}** edges  *(pre-Phase-2: 4)*")
    lines.append(f"- **MEDIUM** (1 unresolved latent): **{risk_count['MEDIUM']}** edges  *(pre-Phase-2: 8)*")
    lines.append(f"- **LOW** (0 unresolved): **{risk_count['LOW']}** edges  *(pre-Phase-2: 47)*")
    lines.append("")

    # ── HIGH risk edges ─────────────────────────────────────────────
    lines.append("## HIGH-risk edges (≥2 unresolved latent confounders)")
    lines.append("")
    lines.append("| source → target | bb | ba | effN | latent confounders |")
    lines.append("|---|---:|---:|---:|---|")
    for row in sorted(rows, key=lambda r: (-len(r["latents"]), r["source"], r["target"])):
        if row["risk"] != "HIGH":
            continue
        lines.append(
            f"| {row['source']} → {row['target']} | {row['bb']:+.3f} | "
            f"{row['ba']:+.3f} | {row['eff_n']} | {', '.join(row['latents'])} |"
        )
    lines.append("")

    # ── MEDIUM risk edges ───────────────────────────────────────────
    lines.append("## MEDIUM-risk edges (1 unresolved latent)")
    lines.append("")
    lines.append("| source → target | bb | ba | effN | unresolved latent |")
    lines.append("|---|---:|---:|---:|---|")
    for row in sorted(rows, key=lambda r: (r["source"], r["target"])):
        if row["risk"] != "MEDIUM":
            continue
        lines.append(
            f"| {row['source']} → {row['target']} | {row['bb']:+.3f} | "
            f"{row['ba']:+.3f} | {row['eff_n']} | {row['unresolved'][0]} |"
        )
    lines.append("")

    # ── Full table ─────────────────────────────────────────────────
    lines.append("## Full 59-edge table")
    lines.append("")
    lines.append("| source → target | bb | ba | effN | n_latents | latents | wired? | risk |")
    lines.append("|---|---:|---:|---:|---:|---|---|---|")
    for row in sorted(rows, key=lambda r: (r["source"], r["target"])):
        latents_str = ", ".join(row["latents"]) if row["latents"] else "—"
        lines.append(
            f"| {row['source']} → {row['target']} | {row['bb']:+.3f} | "
            f"{row['ba']:+.3f} | {row['eff_n']} | {len(row['latents'])} | "
            f"{latents_str} | {row['wired']} | {row['risk']} |"
        )
    lines.append("")

    # ── Spec pairs that have no fitted edge (Phase 1 classification) ─
    if missing_pairs:
        spec_pair_to_latents: dict[tuple[str, str], list[str]] = defaultdict(list)
        for latent, pairs in LATENT_EDGES.items():
            for p in pairs:
                spec_pair_to_latents[p].append(latent)

        phase1_class = {
            ("steps", "body_mass"): ("renamed", "fitted as `steps → body_mass_kg`; populator strips `_kg` suffix"),
            ("body_fat_pct", "cortisol"): ("intentional", "biomarker-as-source — fitter only considers action→biomarker"),
            ("body_fat_pct", "testosterone"): ("intentional", "biomarker-as-source — fitter only considers action→biomarker"),
            ("running_volume", "leptin"): ("intentional", "`leptin` not in `blood_draws.csv`; not simulated"),
            ("training_volume", "hdl"): ("intentional", "generator routes HDL through `zone2_volume` only"),
            ("training_volume", "triglycerides"): ("intentional", "generator routes TG through `zone2_volume` only"),
            ("training_volume", "iron_total"): ("intentional", "iron loss routed through `running_volume` only"),
            ("active_energy", "testosterone"): ("gap", "r=+0.023 (n=1188); generator omits this pathway"),
            ("dietary_energy", "inflammation"): ("gap", "aliased to `hscrp`; r=-0.008; generator omits"),
            ("training_load", "deep_sleep"): ("gap", "r=+0.004; core-temp-disrupts-sleep not wired in generator"),
            ("training_load", "sleep_quality"): ("gap", "r=-0.014; same as deep_sleep"),
            ("training_volume", "hba1c"): ("gap", "`hba1c` exists (n=2376); r=-0.010; generator omits"),
        }

        lines.append("## Phase 1 — Spec'd confounding pairs with NO fitted edge")
        lines.append("")
        lines.append("Each missing pair classified against the synthetic dataset:")
        lines.append("- **renamed**: fitted under a node-name alias")
        lines.append("- **intentional**: generator routes the effect elsewhere, or source/target absent")
        lines.append("- **gap**: both nodes exist; spec says mechanism should be present; generator produces r ≈ 0")
        lines.append("")
        lines.append("| spec pair | latent(s) | classification | evidence |")
        lines.append("|---|---|---|---|")
        for p in missing_pairs:
            latents_str = ", ".join(spec_pair_to_latents[p])
            cls, evi = phase1_class.get(p, ("unclassified", "—"))
            lines.append(f"| {p[0]} → {p[1]} | {latents_str} | **{cls}** | {evi} |")
        lines.append("")
        lines.append("**Implication:** the `gap` pairs carry no signal in the current synthetic data, so they transmit no confounding bias regardless of wiring. Same for `intentional` pairs. No additional edges need adding before completing Phase 2.")
        lines.append("")

    # ── Portal-bayesian stratification ──────────────────────────────
    lines.append("## Portal-bayesian recommendation tiers by bias-risk class")
    lines.append("")
    lines.append("Counts summed across all participant files. Each cell is (edge, participant) pairs.")
    lines.append("")
    all_tiers = ["recommended", "possible", "not_exposed"]
    lines.append("| risk class | " + " | ".join(all_tiers) + " | total |")
    lines.append("|---" + "|---:" * (len(all_tiers) + 1) + "|")
    for rc in ["HIGH", "MEDIUM", "LOW"]:
        c = tier_by_risk[rc]
        total = sum(c.values())
        cells = [str(c.get(t, 0)) for t in all_tiers]
        lines.append(f"| {rc} | " + " | ".join(cells) + f" | {total} |")
    lines.append("")

    # ── Per-edge portal tiers for HIGH/MEDIUM risk edges that show up ─
    exposed_rows = [
        r for r in rows
        if r["risk"] in ("HIGH", "MEDIUM")
        and (r["tiers"].get("recommended", 0) + r["tiers"].get("possible", 0)) > 0
    ]
    if exposed_rows:
        lines.append("## Contaminated edges currently exposed in the portal")
        lines.append("")
        lines.append("Edges with ≥1 unresolved latent AND ≥1 (recommended|possible) exposure across participants.")
        lines.append("")
        lines.append("| source → target | risk | latents | recommended | possible | not_exposed |")
        lines.append("|---|---|---|---:|---:|---:|")
        for row in sorted(
            exposed_rows,
            key=lambda r: -(r["tiers"].get("recommended", 0) + r["tiers"].get("possible", 0)),
        ):
            t = row["tiers"]
            lines.append(
                f"| {row['source']} → {row['target']} | {row['risk']} | "
                f"{', '.join(row['latents'])} | "
                f"{t.get('recommended', 0)} | {t.get('possible', 0)} | {t.get('not_exposed', 0)} |"
            )
        lines.append("")
    else:
        lines.append("## Contaminated edges currently exposed in the portal")
        lines.append("")
        lines.append("No HIGH or MEDIUM risk edges currently appear at `recommended` or `possible` tier in the portal export.")
        lines.append("")

    # ── Phase 3 slope shifts ────────────────────────────────────────
    confounded_path = backend_dir / "output" / "population_priors_confounded.json"
    if confounded_path.exists():
        confounded = json.loads(confounded_path.read_text())
        lines.append("## Phase 3 — slope shifts after wiring confounders (all 7 stable edges)")
        lines.append("")
        lines.append("Posterior means from `fit_confounded_priors.py` (NUTS, 500 warmup + 500 samples, 1188 participants). "
                     "Priors are sourced from `population_priors_v1_unconfounded.json` so this fit is a fresh refit "
                     "against original unadjusted priors, not compounded on Phase 2. Shifts are (posterior - prior). "
                     "Shifts TOWARD zero indicate the unadjusted fit was biased by participant-level confounding.")
        lines.append("")
        lines.append("| edge | prior bb | post bb | Δbb | prior ba | post ba | Δba | divergences |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
        for edge_key, r in confounded.items():
            pb = r["prior_before"]; pa = r["posterior_after"]
            lines.append(
                f"| {edge_key.replace('|',' → ')} "
                f"| {pb['bb_mean']:+.4f} | {pa['bb_mean']:+.4f} | {pa['bb_mean']-pb['bb_mean']:+.4f} "
                f"| {pb['ba_mean']:+.4f} | {pa['ba_mean']:+.4f} | {pa['ba_mean']-pb['ba_mean']:+.4f} "
                f"| {r['divergences']} |"
            )
        lines.append("")
        lines.append("**Latent coupling coefficients** (posterior means — action-side λ couples U to the 100-day action mean; outcome-side λ couples U to the day-100 biomarker):")
        lines.append("")
        lines.append("| edge | latent | λ_action | λ_outcome | σ_U |")
        lines.append("|---|---|---:|---:|---:|")
        for edge_key, r in confounded.items():
            for c_name, ld in r.get("latents", {}).items():
                lines.append(
                    f"| {edge_key.replace('|',' → ')} | {c_name} "
                    f"| {ld['lambda_action_mean']:+.3f} | {ld['lambda_outcome_mean']:+.3f} "
                    f"| {ld['sigma_mean']:.3f} |"
                )
        lines.append("")

    # ── Phase 3 decisions ───────────────────────────────────────────
    lines.append("## Phase 3 decisions — dropped edges, unwired latents, deferred work")
    lines.append("")
    lines.append("Phase 3 aimed to wire the 4 remaining latents (`reverse_cholesterol_transport`, "
                 "`insulin_sensitivity`, `core_temperature`, `energy_expenditure`) on 5 new edges. "
                 "Empirical fits produced stop-condition failures on 4 of those edges, leading to the "
                 "following decisions:")
    lines.append("")
    lines.append("### Edges dropped from the fitted model")
    lines.append("")
    lines.append("| Edge | Latent | Divergences | Posterior bb | Rationale |")
    lines.append("|---|---|---:|---:|---|")
    lines.append("| training_volume → insulin | insulin_sensitivity | 26 | −0.002 | "
                 "Over-param: σ_U=4.91, λ_action=+3.77, λ_outcome tiny, causal slope near zero. "
                 "Treated as zero-slope edge — latent captures action variance with no outcome signal. "
                 "Kept in population_priors at original unconfounded value. |")
    lines.append("| training_volume → body_fat_pct | energy_expenditure | 17 | +0.002 | "
                 "Over-param: σ_U=3.64, λ_action=+5.12, λ_outcome tiny. Same signature as above. "
                 "Treated as zero-slope edge. |")
    lines.append("| zone2_volume → apob | reverse_cholesterol_transport | 0 | −0.140 (away from zero) | "
                 "Fit moved slope *away* from zero rather than toward it — opposite of the attenuation "
                 "pattern on real confounded pathways. λ_action=−3.08 vs λ_outcome=−0.14. RCT does not "
                 "behave as a functional confounder in this synthetic data. |")
    lines.append("| zone2_volume → non_hdl_cholesterol | reverse_cholesterol_transport | 0 | −0.013 (away from zero) | "
                 "Same pattern: λ_action=+3.13 vs λ_outcome=−0.25. |")
    lines.append("| workout_time → sleep_efficiency | core_temperature | — | — | "
                 "**Data-blocked** — `workout_end_hr` is in-memory only in "
                 "`synthetic/generator.py:assemble_lifestyle()` and not written to "
                 "`lifestyle_app.csv`. Fit not attempted; needs synthetic-data regen. |")
    lines.append("")
    lines.append("### Latents specified but not wired into the model")
    lines.append("")
    lines.append("- **`reverse_cholesterol_transport`** — retained in `serif_confounding_structure.md` for real-user "
                 "reference (the domain-knowledge pathway is well-attested in literature). In this synthetic data, "
                 "LPL alone handles zone2→lipid confounding, so RCT is left unwired. Empirical fit diverged from "
                 "theoretical expectation — an example of why synthetic-data confounding structure may be narrower "
                 "than domain knowledge suggests.")
    lines.append("- **`core_temperature`** — cannot be wired until `workout_end_hr` is persisted. Spec retained.")
    lines.append("- **`energy_expenditure`** — effectively unwired (only spec'd edge with fit-capable data was "
                 "`training→body_fat_pct`, which over-parameterized). Spec retained.")
    lines.append("- **`leptin`** — no fitted edges to contaminate (all three spec'd pairs are biomarker-as-source "
                 "or generator-gaps).")
    lines.append("")
    lines.append("### MEDIUM-risk edges: by-design vs pending-data")
    lines.append("")
    lines.append("All 6 remaining MEDIUM edges are known-and-accepted post-Phase-3 state:")
    lines.append("")
    lines.append("| Edge | Category | Disposition |")
    lines.append("|---|---|---|")
    lines.append("| training_volume → insulin | by-design | Near-zero causal slope; over-param on fit. |")
    lines.append("| training_volume → body_fat_pct | by-design | Near-zero causal slope; over-param on fit. |")
    lines.append("| zone2_volume → hdl | by-design | LPL wired; RCT left unwired per empirical finding. |")
    lines.append("| zone2_volume → apob | by-design | RCT left unwired per empirical finding. |")
    lines.append("| zone2_volume → non_hdl_cholesterol | by-design | RCT left unwired per empirical finding. |")
    lines.append("| workout_time → sleep_efficiency | pending-data | Synthetic-data regen needed to persist workout_end_hr. |")
    lines.append("")

    # ── Findings block ──────────────────────────────────────────────
    lines.append("## Key findings")
    lines.append("")
    total_contaminated_exposures = sum(
        (r["tiers"].get("recommended", 0) + r["tiers"].get("possible", 0))
        for r in rows if r["risk"] in ("HIGH", "MEDIUM")
    )
    total_exposures = sum(
        sum(v for k, v in r["tiers"].items() if k in ("recommended", "possible"))
        for r in rows
    )
    pct = 100.0 * total_contaminated_exposures / total_exposures if total_exposures else 0.0
    lines.append(
        f"1. Post-Phase-3: **{risk_count['HIGH']}** HIGH-risk + **{risk_count['MEDIUM']}** MEDIUM-risk fitted edges — "
        f"{risk_count['HIGH'] + risk_count['MEDIUM']} of 59 ({100*(risk_count['HIGH']+risk_count['MEDIUM'])/59:.0f}%) "
        f"still carry unresolved latent confounding. Pre-Phase-2 the count was 4 HIGH + 8 MEDIUM = 12 (20%)."
    )
    lines.append(
        f"2. **{total_contaminated_exposures}** of {total_exposures} recommended|possible portal exposures ({pct:.1f}%) "
        f"come from contaminated edges. (Portal export is pre-Phase-2; exposures are all LOW-risk regardless.)"
    )
    lines.append(
        f"3. NumPyro model wires 4 latents across 7 edges: `sweat_iron_loss` and `gi_iron_loss` on all iron edges; "
        f"`lipoprotein_lipase` on all three `zone2→lipid` edges; `insulin_sensitivity` on `zone2→triglycerides` and "
        f"`training→glucose`. `STRUCTURAL_EDGES` in the TS DAG remains degenerate — 0 latents as confounders — which "
        f"matters for the identification engine downstream but not for the NumPyro fit."
    )
    if missing_pairs:
        lines.append(
            f"4. **{len(missing_pairs)}** spec'd confounding pairs have no corresponding fitted edge; "
            f"Phase 1 analysis classified them as 1 renamed / 6 intentional / 5 generator-gap. "
            f"None carry signal in the current synthetic dataset (|r| < 0.03)."
        )
    lines.append(
        "5. Remaining MEDIUM edges reflect three intentional decisions: "
        "(a) `training_volume→insulin` + `training_volume→body_fat_pct` dropped from the fit as "
        "zero-slope + over-parameterized when their sole latent was wired; "
        "(b) `reverse_cholesterol_transport` unwired on `zone2→apob`/`zone2→non_hdl_cholesterol`/`zone2→hdl` after "
        "identifiability collapsed in Phase 3; "
        "(c) `workout_time→sleep_efficiency` deferred pending synthetic-data regen to persist `workout_end_hr`."
    )
    lines.append("")

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}  ({len(lines)} lines)")
    print(f"  HIGH: {risk_count['HIGH']}   MEDIUM: {risk_count['MEDIUM']}   LOW: {risk_count['LOW']}")
    print(f"  Contaminated exposures: {total_contaminated_exposures} / {total_exposures} ({pct:.1f}%)")


if __name__ == "__main__":
    main()
