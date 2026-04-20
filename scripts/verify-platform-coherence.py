#!/usr/bin/env python3
"""
Automated platform coherence diagnostics.

Reads all 1,188 participant JSONs from public/portal_bayesian/ and runs
seven coherence checks. Writes a markdown report to
backend/output/platform_coherence_report.md.

Run from serif-demo/:
    python scripts/verify-platform-coherence.py
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PORTAL_DIR = ROOT / "public" / "portal_bayesian"
OUTPUT_DIR = ROOT / "backend" / "output"
REPORT_PATH = OUTPUT_DIR / "platform_coherence_report.md"

# Frontend-mirrored tables (source of truth: src/components/portal/InsightRow.tsx, src/utils/rounding.ts)
# Keep in sync manually — CI could diff-lint these against the TS files.

BENEFICIAL = {
    "deep_sleep": "higher",
    "sleep_quality": "higher",
    "sleep_efficiency": "higher",
    "hrv_daily": "higher",
    "resting_hr": "lower",
    "ferritin": "higher",
    "hemoglobin": "higher",
    "iron_total": "higher",
    "rbc": "neutral",
    "mcv": "neutral",
    "rdw": "lower",
    "magnesium_rbc": "higher",
    "zinc": "higher",
    "vo2_peak": "higher",
    "body_mass_kg": "neutral",
    "body_fat_pct": "lower",
    "hdl": "higher",
    "ldl": "lower",
    "apob": "lower",
    "non_hdl_cholesterol": "lower",
    "total_cholesterol": "lower",
    "triglycerides": "lower",
    "glucose": "lower",
    "insulin": "lower",
    "hscrp": "lower",
    "cortisol": "neutral",
    "testosterone": "neutral",
    "estradiol": "neutral",
    "dhea_s": "neutral",
    "shbg": "neutral",
    "alt": "lower",
    "ast": "lower",
    "homocysteine": "lower",
    "uric_acid": "lower",
    "platelets": "neutral",
    "wbc": "neutral",
}

ACTION_INCREMENT = {
    "bedtime": 0.25,
    "wake_time": 0.25,
    "workout_time": 0.25,
    "sleep_duration": 0.25,
    "training_volume": 0.25,
    "running_volume": 0.25,
    "zone2_volume": 0.25,
    "training_load": 10.0,
    "steps": 500.0,
    "dietary_protein": 5.0,
    "dietary_energy": 100.0,
    "active_energy": 100.0,
}

OUTCOME_INCREMENT = {
    "hrv_daily": 1.0, "resting_hr": 1.0, "sleep_quality": 1.0,
    "deep_sleep": 5.0, "sleep_efficiency": 1.0,
    "ferritin": 1.0, "hemoglobin": 0.1, "iron_total": 1.0, "rbc": 0.1,
    "mcv": 1.0, "rdw": 0.1,
    "magnesium_rbc": 0.1, "zinc": 1.0,
    "hdl": 1.0, "ldl": 1.0, "apob": 1.0,
    "non_hdl_cholesterol": 1.0, "total_cholesterol": 1.0, "triglycerides": 1.0,
    "glucose": 1.0, "insulin": 0.5, "hscrp": 0.1,
    "cortisol": 0.5, "testosterone": 5.0, "estradiol": 1.0, "dhea_s": 5.0, "shbg": 1.0,
    "alt": 1.0, "ast": 1.0, "homocysteine": 0.1, "uric_acid": 0.1,
    "platelets": 5.0, "wbc": 0.1,
    "body_fat_pct": 0.5, "body_mass_kg": 0.5, "vo2_peak": 0.5,
}

# Physiological "sanity" ranges — conservative bounds; values outside
# suggest engine or data corruption, not edge-case biology.
PHYS_BOUNDS = {
    "hrv_daily": (15, 150),
    "resting_hr": (35, 110),
    "sleep_quality": (0, 100),
    "sleep_efficiency": (40, 100),
    "deep_sleep": (10, 300),
    "ferritin": (5, 500),
    "hemoglobin": (8, 20),
    "iron_total": (20, 300),
    "rbc": (3.0, 7.0),
    "mcv": (70, 110),
    "rdw": (10, 22),
    "magnesium_rbc": (3.0, 8.0),
    "zinc": (40, 200),
    "vo2_peak": (20, 80),
    "body_mass_kg": (40, 150),
    "body_fat_pct": (3, 50),
    "hdl": (20, 100),
    "ldl": (30, 250),
    "apob": (30, 200),
    "non_hdl_cholesterol": (40, 300),
    "total_cholesterol": (80, 350),
    "triglycerides": (30, 500),
    "glucose": (50, 200),
    "insulin": (1, 50),
    "hscrp": (0, 20),
    "cortisol": (2, 30),
    "testosterone": (100, 1200),
    "estradiol": (10, 400),
    "dhea_s": (20, 500),
    "shbg": (10, 150),
    "alt": (5, 150),
    "ast": (5, 150),
    "homocysteine": (3, 30),
    "uric_acid": (2, 12),
    "platelets": (100, 500),
    "wbc": (3, 15),
}

# Action target reasonability — protocols outside these are nonsense.
ACTION_BOUNDS = {
    "bedtime": (18.0, 28.0),           # 6pm - 4am (wraps)
    "wake_time": (3.0, 12.0),          # 3am - noon
    "workout_time": (5.0, 22.0),       # 5am - 10pm
    "sleep_duration": (5.0, 11.0),
    "training_volume": (0.0, 3.0),     # hrs
    "running_volume": (0.0, 25.0),     # km/day
    "zone2_volume": (0.0, 20.0),
    "training_load": (0.0, 300.0),     # TRIMP/day
    "steps": (0.0, 30000.0),
    "dietary_protein": (30.0, 300.0),
    "dietary_energy": (1000.0, 5000.0),
    "active_energy": (0.0, 2500.0),
}


def round_to_inc(v: float, inc: float) -> float:
    if not math.isfinite(v) or inc <= 0:
        return v
    return round(v / inc) * inc


def expected_action_dir(scaled_effect: float, outcome: str) -> int:
    """Mirror of src/components/portal/InsightRow.tsx actionDir computation."""
    if not math.isfinite(scaled_effect) or scaled_effect == 0:
        return 0
    s = 1 if scaled_effect > 0 else -1
    ben = BENEFICIAL.get(outcome, "neutral")
    if ben == "higher":
        return s
    if ben == "lower":
        return -s
    return s


def expected_outcome_dir(scaled_effect: float, outcome: str) -> int:
    ben = BENEFICIAL.get(outcome, "neutral")
    if ben == "higher":
        return 1
    if ben == "lower":
        return -1
    if scaled_effect > 0:
        return 1
    if scaled_effect < 0:
        return -1
    return 0


def is_below_min_dose(raw_dose: float, action: str) -> bool:
    inc = ACTION_INCREMENT.get(action, 1.0)
    return round_to_inc(abs(raw_dose), inc) < inc


def is_below_min_outcome(scaled_effect: float, outcome: str) -> bool:
    if not math.isfinite(scaled_effect):
        return True
    inc = OUTCOME_INCREMENT.get(outcome, 1.0)
    return round_to_inc(abs(scaled_effect), inc) < inc


def load_participants(portal_dir: Path):
    files = sorted(portal_dir.glob("participant_*.json"))
    for f in files:
        with f.open() as fh:
            yield json.load(fh)


def exposed(insight) -> bool:
    return insight["gate"]["tier"] in ("recommended", "possible")


def pct(n: int, total: int) -> str:
    if total == 0:
        return "0%"
    return f"{n / total * 100:.1f}%"


# ============================================================================
# Checks
# ============================================================================


class CheckResult:
    def __init__(self, name: str):
        self.name = name
        self.passed = 0
        self.failed = 0
        self.examples: list[dict] = []
        self.info: str | None = None

    def record(self, ok: bool, example: dict | None = None) -> None:
        if ok:
            self.passed += 1
        else:
            self.failed += 1
            if example and len(self.examples) < 5:
                self.examples.append(example)

    @property
    def total(self) -> int:
        return self.passed + self.failed

    def summary(self) -> str:
        if self.total == 0:
            return f"- **{self.name}**: no data"
        base = (
            f"- **{self.name}**: {self.passed}/{self.total} pass "
            f"({pct(self.passed, self.total)})"
        )
        if self.info:
            base += f" — {self.info}"
        return base


def check1_direction_consistency(participants) -> CheckResult:
    """Every exposed insight has a well-defined action direction that
    matches frontend logic."""
    result = CheckResult("Direction consistency")
    for p in participants:
        for ins in p["effects_bayesian"]:
            if not exposed(ins):
                continue
            missing = [
                k for k in ("scaled_effect", "dose_multiplier", "posterior")
                if k not in ins or ins[k] is None
            ]
            if missing or "mean" not in ins.get("posterior", {}):
                result.record(False, {
                    "pid": p["pid"],
                    "action": ins.get("action"),
                    "outcome": ins.get("outcome"),
                    "issue": f"missing fields: {missing}",
                })
                continue
            se = ins["scaled_effect"]
            mean_ = ins["posterior"]["mean"]
            dm = ins["dose_multiplier"]
            action_dir = expected_action_dir(se, ins["outcome"])
            outcome_dir = expected_outcome_dir(se, ins["outcome"])

            expected_sign = 1 if mean_ * dm >= 0 else -1
            actual_sign = 1 if se >= 0 else -1
            if mean_ != 0 and dm != 0 and expected_sign != actual_sign:
                result.record(False, {
                    "pid": p["pid"],
                    "action": ins["action"],
                    "outcome": ins["outcome"],
                    "issue": (
                        f"scaled_effect sign {se:+.4f} disagrees with "
                        f"posterior.mean × dose_multiplier {mean_ * dm:+.4f}"
                    ),
                })
                continue

            if action_dir == 0 and exposed(ins):
                result.record(False, {
                    "pid": p["pid"],
                    "action": ins["action"],
                    "outcome": ins["outcome"],
                    "issue": "exposed insight has action_dir=0 (zero scaled_effect)",
                })
                continue

            if ins.get("direction_conflict"):
                result.record(True)
                continue

            if BENEFICIAL.get(ins["outcome"]) != "neutral" and outcome_dir == 0:
                result.record(False, {
                    "pid": p["pid"],
                    "action": ins["action"],
                    "outcome": ins["outcome"],
                    "issue": "non-neutral outcome with outcome_dir=0",
                })
                continue

            result.record(True)
    return result


def check2_baseline_projection(participants) -> CheckResult:
    """Baselines + projections fall inside physiological bounds."""
    result = CheckResult("Baseline + projection sensibility")
    for p in participants:
        baselines = p.get("outcome_baselines") or {}
        for ins in p["effects_bayesian"]:
            if not exposed(ins):
                continue
            outcome = ins["outcome"]
            baseline = baselines.get(outcome)
            if baseline is None:
                continue
            lo, hi = PHYS_BOUNDS.get(outcome, (None, None))
            if lo is None:
                continue
            if not (lo <= baseline <= hi):
                result.record(False, {
                    "pid": p["pid"], "outcome": outcome,
                    "issue": f"baseline {baseline:.2f} outside [{lo}, {hi}]",
                })
                continue

            outcome_dir = expected_outcome_dir(ins["scaled_effect"], outcome)
            projection = baseline + abs(ins["scaled_effect"]) * outcome_dir
            if not (lo <= projection <= hi):
                result.record(False, {
                    "pid": p["pid"], "outcome": outcome,
                    "issue": (
                        f"projection {projection:.2f} outside [{lo}, {hi}] "
                        f"(baseline {baseline:.2f}, scaled_effect {ins['scaled_effect']:+.2f})"
                    ),
                })
                continue
            ben = BENEFICIAL.get(outcome, "neutral")
            if ben == "higher" and projection < baseline - 0.01:
                result.record(False, {
                    "pid": p["pid"], "outcome": outcome,
                    "issue": f"beneficial=higher but projection drops: {baseline:.2f} -> {projection:.2f}",
                })
                continue
            if ben == "lower" and projection > baseline + 0.01:
                result.record(False, {
                    "pid": p["pid"], "outcome": outcome,
                    "issue": f"beneficial=lower but projection rises: {baseline:.2f} -> {projection:.2f}",
                })
                continue
            result.record(True)
    return result


def check3_protocol_insight_consistency(participants) -> CheckResult:
    """Every protocol references extant same-action insights, and target
    direction matches the beneficial direction implied by those insights."""
    result = CheckResult("Protocol <-> insight consistency")
    for p in participants:
        insights_by_key = {
            f"{i['action']}_{i['outcome']}": i for i in p["effects_bayesian"]
        }
        for proto in p["protocols"]:
            proto_action = proto["action"]
            current = proto.get("current_value")
            target = proto.get("target_value")
            delta = proto.get("delta")
            lo, hi = ACTION_BOUNDS.get(proto_action, (None, None))
            supporting_ids = proto.get("supporting_insight_ids", [])
            missing_ids = [sid for sid in supporting_ids if sid not in insights_by_key]
            if missing_ids:
                result.record(False, {
                    "pid": p["pid"], "proto": proto["protocol_id"],
                    "issue": f"supporting insights not found: {missing_ids}",
                })
                continue
            wrong_action = [
                sid for sid in supporting_ids
                if insights_by_key[sid]["action"] != proto_action
            ]
            if wrong_action:
                result.record(False, {
                    "pid": p["pid"], "proto": proto["protocol_id"],
                    "issue": f"supporting insights have wrong action: {wrong_action}",
                })
                continue

            if lo is not None and target is not None and not (lo <= target <= hi):
                # Wrap bedtime targets across midnight
                if proto_action == "bedtime":
                    t2 = target - 24 if target >= hi else target + 24
                    if not (lo <= t2 <= hi):
                        result.record(False, {
                            "pid": p["pid"], "proto": proto["protocol_id"],
                            "issue": f"target {target:.2f} outside action bounds [{lo}, {hi}]",
                        })
                        continue
                else:
                    result.record(False, {
                        "pid": p["pid"], "proto": proto["protocol_id"],
                        "issue": f"target {target:.2f} outside action bounds [{lo}, {hi}]",
                    })
                    continue

            # Direction check: protocol.delta should equal insight.nominal_step * dose_multiplier
            # (both carry the engine's signed-dose convention). Flag when signs disagree.
            if supporting_ids and delta is not None:
                sample = insights_by_key[supporting_ids[0]]
                nom = sample.get("nominal_step")
                dm = sample.get("dose_multiplier")
                if nom is not None and dm is not None:
                    expected_delta = nom * dm
                    exp_sign = 1 if expected_delta > 1e-6 else -1 if expected_delta < -1e-6 else 0
                    act_sign = 1 if delta > 1e-6 else -1 if delta < -1e-6 else 0
                    if exp_sign != 0 and act_sign != 0 and exp_sign != act_sign:
                        result.record(False, {
                            "pid": p["pid"], "proto": proto["protocol_id"],
                            "issue": (
                                f"delta {delta:+.3f} sign disagrees with insight "
                                f"nominal_step*dose {expected_delta:+.3f} "
                                f"(action {proto_action}, outcome {sample['outcome']})"
                            ),
                        })
                        continue
            result.record(True)
    return result


def check4_rounding(participants) -> CheckResult:
    """Post-Issue-7 UI rendering: every exposed insight that survives Issue 7's
    filter has non-zero rounded magnitude. Insights below the threshold are
    expected to be suppressed by the UI — those are informational, not failures."""
    result = CheckResult("Rounding correctness (post-Issue-7)")
    suppressed = 0
    for p in participants:
        for ins in p["effects_bayesian"]:
            if not exposed(ins):
                continue
            raw_dose = ins["dose_multiplier"] * ins["nominal_step"]
            if is_below_min_dose(raw_dose, ins["action"]):
                suppressed += 1
                continue
            if is_below_min_outcome(ins["scaled_effect"], ins["outcome"]):
                suppressed += 1
                continue
            # survives Issue 7 filter — should render a non-zero magnitude
            rounded = round_to_inc(
                abs(ins["scaled_effect"]), OUTCOME_INCREMENT.get(ins["outcome"], 0.1)
            )
            if rounded <= 0:
                result.record(False, {
                    "pid": p["pid"], "action": ins["action"], "outcome": ins["outcome"],
                    "issue": (
                        f"survived Issue 7 but rounds to 0 "
                        f"(scaled_effect {ins['scaled_effect']:.4f})"
                    ),
                })
                continue
            result.record(True)
    result.info = f"UI-suppressed (Issue 7): {suppressed} insights"
    return result


def check5_tier_sanity(participants) -> CheckResult:
    """Recommended tier = high confidence; possible = middle; not_exposed =
    failed some gate. Flag recommended insights with tiny personal weight."""
    result = CheckResult("Tier assignment sanity")
    for p in participants:
        for ins in p["effects_bayesian"]:
            tier = ins["gate"]["tier"]
            contraction = ins["posterior"]["contraction"]
            if tier == "recommended":
                if contraction < 0.1:
                    result.record(False, {
                        "pid": p["pid"], "action": ins["action"], "outcome": ins["outcome"],
                        "issue": (
                            f"recommended with contraction {contraction:.3f} < 0.1 "
                            f"(pure cohort signal)"
                        ),
                    })
                    continue
                if ins["gate"]["score"] < 0.6:
                    result.record(False, {
                        "pid": p["pid"], "action": ins["action"], "outcome": ins["outcome"],
                        "issue": f"recommended tier with gate_score {ins['gate']['score']:.3f} < 0.6",
                    })
                    continue
            elif tier == "possible":
                if ins["gate"]["score"] > 0.9:
                    result.record(False, {
                        "pid": p["pid"], "action": ins["action"], "outcome": ins["outcome"],
                        "issue": f"possible tier with gate_score {ins['gate']['score']:.3f} > 0.9 (should be recommended?)",
                    })
                    continue
            result.record(True)
    return result


def check7_evidence_tier(participants):
    """Evidence tier distribution; biomarker@established is the red flag."""
    result = CheckResult("Evidence tier distribution (biomarker@established flag)")
    pathway_tier = defaultdict(Counter)
    for p in participants:
        for ins in p["effects_bayesian"]:
            if not exposed(ins):
                continue
            pw = ins.get("pathway", "wearable")
            ev = ins.get("evidence_tier", "cohort_level")
            pathway_tier[pw][ev] += 1
            if pw == "biomarker" and ev == "personal_established":
                result.record(False, {
                    "pid": p["pid"], "action": ins["action"], "outcome": ins["outcome"],
                    "issue": "biomarker insight at personal_established (only ~2 draws available)",
                })
            else:
                result.record(True)
    return result, pathway_tier


def check6_diversity(participants_list):
    """Cross-participant distribution stats and dominance warnings."""
    exposed_per = []
    recommended_per = []
    action_outcome_counts = Counter()
    for p in participants_list:
        ec = 0
        rc = 0
        seen_pair = set()
        for ins in p["effects_bayesian"]:
            tier = ins["gate"]["tier"]
            if tier in ("recommended", "possible"):
                ec += 1
                key = (ins["action"], ins["outcome"])
                seen_pair.add(key)
            if tier == "recommended":
                rc += 1
        exposed_per.append(ec)
        recommended_per.append(rc)
        for k in seen_pair:
            action_outcome_counts[k] += 1
    n = len(participants_list)
    return {
        "n": n,
        "exposed_mean": mean(exposed_per) if exposed_per else 0,
        "exposed_median": median(exposed_per) if exposed_per else 0,
        "exposed_min": min(exposed_per) if exposed_per else 0,
        "exposed_max": max(exposed_per) if exposed_per else 0,
        "rec_mean": mean(recommended_per) if recommended_per else 0,
        "rec_median": median(recommended_per) if recommended_per else 0,
        "rec_max": max(recommended_per) if recommended_per else 0,
        "pair_counts": action_outcome_counts,
    }


# ============================================================================
# Report writer
# ============================================================================


def write_report(path: Path, participants: list, checks: list, diversity: dict, pathway_tier: dict) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    push = lines.append

    all_passed = all(c.failed == 0 for c in checks)
    health = "PASS — all checks clean" if all_passed else "FAIL — see failed checks below"
    push("# Platform Coherence Report")
    push("")
    push(f"- Participants scanned: {len(participants)}")
    push(f"- Overall health: **{health}**")
    if not all_passed:
        worst = max(checks, key=lambda c: c.failed / max(1, c.total))
        push(f"- Highest-priority fix: **{worst.name}** ({worst.failed} failures)")
    push("")
    push("## Check summary")
    push("")
    for c in checks:
        push(c.summary())
    push("")

    push("## Failed examples (first 5 per check)")
    push("")
    any_fail = False
    for c in checks:
        if c.failed == 0:
            continue
        any_fail = True
        push(f"### {c.name} — {c.failed} failures")
        push("")
        for ex in c.examples:
            push(f"- pid {ex.get('pid')}  {ex.get('action', '')}→{ex.get('outcome', '')} "
                 f"{ex.get('proto', '')}  — {ex.get('issue')}")
        push("")
    if not any_fail:
        push("_All checks passed._")
        push("")

    push("## Cross-participant diversity (Check 6)")
    push("")
    push(f"- Exposed insights per participant: "
         f"mean {diversity['exposed_mean']:.2f}, "
         f"median {diversity['exposed_median']:.0f}, "
         f"range [{diversity['exposed_min']}, {diversity['exposed_max']}]")
    push(f"- Recommended-tier per participant: "
         f"mean {diversity['rec_mean']:.2f}, "
         f"median {diversity['rec_median']:.0f}, "
         f"max {diversity['rec_max']}")
    push("")
    pc = diversity["pair_counts"]
    n = diversity["n"]
    top = pc.most_common(10)
    push("### Top 10 action→outcome pairs by participant coverage")
    push("")
    push("| Action | Outcome | Participants | Coverage |")
    push("|---|---|---:|---:|")
    for (a, o), cnt in top:
        push(f"| {a} | {o} | {cnt} | {pct(cnt, n)} |")
    push("")

    dominant = [((a, o), cnt) for (a, o), cnt in pc.items() if cnt / n > 0.8]
    rare = [((a, o), cnt) for (a, o), cnt in pc.items() if cnt / n < 0.01]
    if dominant:
        push("### Dominant pairs (>80% of participants)")
        push("")
        push("Suggests insufficient personalization — these surface for nearly everyone.")
        push("")
        for (a, o), cnt in dominant:
            push(f"- {a} → {o}: {pct(cnt, n)} ({cnt}/{n})")
        push("")
    if rare:
        push(f"### Rare pairs (<1% of participants, {len(rare)} total)")
        push("")
        push("These are edges the engine ships but almost never surfaces — review whether they earn their keep.")
        push("")
        for (a, o), cnt in sorted(rare, key=lambda x: -x[1])[:10]:
            push(f"- {a} → {o}: {cnt}/{n}")
        push("")

    push("## Evidence tier distribution (Check 7)")
    push("")
    push("| Pathway | cohort_level | personal_emerging | personal_established |")
    push("|---|---:|---:|---:|")
    for pw in ("wearable", "biomarker"):
        t = pathway_tier.get(pw, Counter())
        push(f"| {pw} | {t.get('cohort_level', 0)} | "
             f"{t.get('personal_emerging', 0)} | {t.get('personal_established', 0)} |")
    push("")

    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    if not PORTAL_DIR.exists():
        print(f"ERROR: portal dir not found: {PORTAL_DIR}", file=sys.stderr)
        return 2
    participants = list(load_participants(PORTAL_DIR))
    print(f"Loaded {len(participants)} participants from {PORTAL_DIR}")

    c1 = check1_direction_consistency(participants)
    c2 = check2_baseline_projection(participants)
    c3 = check3_protocol_insight_consistency(participants)
    c4 = check4_rounding(participants)
    c5 = check5_tier_sanity(participants)
    c7, pathway_tier = check7_evidence_tier(participants)
    diversity = check6_diversity(participants)

    # Ordered for report readability: 1..5, 7, (6 is the aggregate-only block)
    checks = [c1, c2, c3, c4, c5, c7]
    write_report(REPORT_PATH, participants, checks, diversity, pathway_tier)

    print(f"Report written to {REPORT_PATH}")
    for c in checks:
        status = "OK" if c.failed == 0 else f"FAIL ({c.failed})"
        print(f"  [{status}] {c.name}: {c.passed}/{c.total}")
    all_passed = all(c.failed == 0 for c in checks)
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
