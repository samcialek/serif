"""Action reconciliation, temporal stratification, and output formatting.

Handles:
  - Conflicting optimal points across outcomes for the same action
  - Temporal bucketing (quotidian / medium-term / long-term)
  - Regime proximity warnings
  - Human-readable action-centric output
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .point_engine import (
    Equation, NodeEffect, MANIPULABLE_NODES, MARGINAL_STEPS,
    build_equations, topological_sort, compute_marginal_effects,
    compute_counterfactual, build_equations_by_target,
)
from .synthetic.config import BIOMARKER_PRIORS, WEARABLE_PRIORS


# ── Desirable direction per biomarker ─────────────────────────────
# "higher" = increasing is beneficial; "lower" = decreasing is beneficial.
# Omitted nodes are treated as "higher is better" by default.

DESIRABLE_DIRECTION: dict[str, str] = {
    # Lower is better
    "cortisol":             "lower",
    "glucose":              "lower",
    "insulin":              "lower",
    "hscrp":                "lower",
    "triglycerides":        "lower",
    "ldl":                  "lower",
    "apob":                 "lower",
    "non_hdl_cholesterol":  "lower",
    "total_cholesterol":    "lower",
    "uric_acid":            "lower",
    "homocysteine":         "lower",
    "resting_hr":           "lower",
    "body_fat_pct":         "lower",
    "nlr":                  "lower",
    "ast":                  "lower",
    "alt":                  "lower",
    "rdw":                  "lower",
    "hba1c":                "lower",
    "sleep_debt":           "lower",
    # Regime states: lower = inactive = better
    "overreaching_state":       "lower",
    "iron_deficiency_state":    "lower",
    "sleep_deprivation_state":  "lower",
    "inflammation_state":       "lower",
    # Higher is better
    "hdl":                  "higher",
    "hrv_daily":            "higher",
    "sleep_quality":        "higher",
    "sleep_efficiency":     "higher",
    "deep_sleep":           "higher",
    "vo2_peak":             "higher",
    "ferritin":             "higher",
    "hemoglobin":           "higher",
    "testosterone":         "higher",
    "albumin":              "higher",
    "rbc":                  "higher",
    "zinc":                 "higher",
    "magnesium_rbc":        "higher",
    "iron_total":           "higher",
    "omega3_index":         "higher",
    "b12":                  "higher",
    "folate":               "higher",
    "dhea_s":               "higher",
}


def is_beneficial(effect: NodeEffect) -> bool:
    """True if this effect moves the biomarker in the desirable direction."""
    direction = DESIRABLE_DIRECTION.get(effect.node_id, "higher")
    if direction == "lower":
        return effect.scaled_effect < -1e-10
    return effect.scaled_effect > 1e-10


def is_harmful(effect: NodeEffect) -> bool:
    """True if this effect moves the biomarker in the undesirable direction."""
    direction = DESIRABLE_DIRECTION.get(effect.node_id, "higher")
    if direction == "lower":
        return effect.scaled_effect > 1e-10
    return effect.scaled_effect < -1e-10


# ── Temporal buckets ───────────────────────────────────────────────

def temporal_bucket(tau_days: float) -> str:
    if tau_days <= 7:
        return "quick"     # 1-7 days
    elif tau_days <= 30:
        return "medium"    # 1-4 weeks
    else:
        return "long"      # 1-3+ months


def temporal_label(bucket: str) -> str:
    return {
        "quick":  "1-7 days",
        "medium": "2-4 weeks",
        "long":   "2-3 months",
    }[bucket]


# ── Regime proximity ───────────────────────────────────────────────

@dataclass
class RegimeStatus:
    name: str
    current_input: float
    threshold: float
    activation: float       # 0-1 sigmoid output
    direction: str          # "above" or "below" (which side is danger)
    margin: float           # distance from threshold (positive = safe)
    warning: str            # human-readable

# Per-regime sigmoid steepness — calibrated so a +1 transition_width
# move past the threshold lifts activation from 0.5 to ~0.9. The
# previous code hardcoded a single steepness of 5.0 for "above"
# regimes, which was right for acwr (where ±0.3 is meaningful) but
# absurdly steep for sleep_debt (where ±5 hours is meaningful) — the
# sigmoid saturated to 1.0 at sleep_debt = 6 h. Each regime now picks
# a steepness scaled to its real-world unit.
#
#   activation = 1 / (1 + exp(-steepness * (current - threshold)))   for "above"
#   activation = 1 / (1 + exp(+steepness * (current - threshold)))   for "below"
#
# Rule of thumb: steepness = ln(9) / transition_width  (so at threshold +
# transition_width, activation = 0.9).
REGIME_THRESHOLDS = {
    # acwr 1.5 → 1.8 is the meaningful transition (≈0.3 h); steepness
    # ≈ ln(9)/0.3 ≈ 7.3.
    "overreaching":      {"input_node": "acwr",       "threshold": 1.5, "direction": "above",
                          "steepness": 7.3, "label": "Overreaching"},
    # ferritin 30 → 20 ng/mL is the depletion gradient (≈10 ng/mL);
    # steepness ≈ ln(9)/10 ≈ 0.22 — matches the old hardcoded 0.2.
    "iron_deficiency":   {"input_node": "ferritin",   "threshold": 30,  "direction": "below",
                          "steepness": 0.22, "label": "Iron Deficiency"},
    # sleep_debt 5 → 10 h is the meaningful transition (≈5 h);
    # steepness ≈ ln(9)/5 ≈ 0.44. The OLD value was 5.0 — that's why
    # Caspian was pegged at 100%.
    "sleep_deprivation": {"input_node": "sleep_debt",  "threshold": 5.0, "direction": "above",
                          "steepness": 0.44, "label": "Sleep Deprivation"},
    # hscrp 3 → 5 mg/L is the borderline-elevated → high transition
    # (≈2 mg/L); steepness ≈ ln(9)/2 ≈ 1.1.
    "inflammation":      {"input_node": "hscrp",      "threshold": 3.0, "direction": "above",
                          "steepness": 1.1, "label": "Inflammation"},
}


def check_regime_proximity(observed: dict[str, float]) -> list[RegimeStatus]:
    """Check how close the participant is to each regime activation threshold."""
    statuses = []
    for key, cfg in REGIME_THRESHOLDS.items():
        current = observed.get(cfg["input_node"], 0.0)
        threshold = cfg["threshold"]
        steepness = float(cfg.get("steepness", 1.0))

        if cfg["direction"] == "above":
            margin = threshold - current  # positive = safe
            activation = 1.0 / (1.0 + math.exp(-steepness * (current - threshold)))
        else:
            margin = current - threshold  # positive = safe
            activation = 1.0 / (1.0 + math.exp(steepness * (current - threshold)))

        if margin < 0:
            warning = f"ACTIVE: {cfg['label']} triggered ({cfg['input_node']}={current:.1f}, threshold={threshold})"
        elif margin < threshold * 0.2:
            warning = f"WARNING: Approaching {cfg['label']} ({cfg['input_node']}={current:.1f}, threshold={threshold}, margin={margin:.1f})"
        else:
            warning = f"SAFE: {cfg['label']} ({cfg['input_node']}={current:.1f}, margin={margin:.1f} from threshold)"

        statuses.append(RegimeStatus(
            name=cfg["label"],
            current_input=current,
            threshold=threshold,
            activation=activation,
            direction=cfg["direction"],
            margin=margin,
            warning=warning,
        ))
    return statuses


def compute_regime_activations(observed: dict[str, float]) -> dict[str, float]:
    """Return {node_name: activation_in_[0,1]} for each regime state.

    Uses the same sigmoid form as check_regime_proximity so the values are
    consistent with regime_statuses.csv. Keyed by the engine's regime node
    names ("overreaching_state", etc.) for direct use by exporters.
    """
    statuses = check_regime_proximity(observed)
    return {
        f"{key}_state": rs.activation
        for (key, _), rs in zip(REGIME_THRESHOLDS.items(), statuses)
    }


# ── Action reconciliation ──────────────────────────────────────────

@dataclass
class OutcomeOptimal:
    """One outcome's preferred value for an action."""
    outcome_node: str
    outcome_label: str
    optimal_value: float     # theta of the edge (v_max peak or plateau start)
    curve_type: str
    direction: str           # "increase" or "decrease" for monotonic; "target" for v_max/v_min
    eff_n: float
    tau_days: float

@dataclass
class ReconciledAction:
    """A single action recommendation with reconciled optimal point(s)."""
    action_node: str
    action_label: str
    current_value: float
    direction: str                          # "increase", "decrease", or "within_range"
    # If thetas are close: single target
    primary_target: float | None
    primary_reason: str
    # If thetas are far apart: two options (max 2 per decision)
    secondary_target: float | None
    secondary_reason: str
    # All downstream effects grouped by temporal bucket
    quick_effects: list[NodeEffect]
    medium_effects: list[NodeEffect]
    long_effects: list[NodeEffect]
    # Regime interactions
    regime_notes: list[str]
    # Tradeoffs
    tradeoffs: list[str]


FRIENDLY_NAMES: dict[str, str] = {
    "running_volume": "Running Volume",
    "training_volume": "Training Volume",
    "zone2_volume": "Zone 2 Cardio",
    "training_load": "Training Load",
    "sleep_duration": "Sleep Duration",
    "bedtime": "Bedtime",
    "steps": "Daily Steps",
    "active_energy": "Active Energy",
    "dietary_protein": "Protein Intake",
    "dietary_energy": "Caloric Intake",
    "iron_total": "Serum Iron", "ferritin": "Ferritin", "hemoglobin": "Hemoglobin",
    "testosterone": "Testosterone", "cortisol": "Cortisol",
    "triglycerides": "Triglycerides", "hdl": "HDL", "ldl": "LDL",
    "hscrp": "hsCRP", "glucose": "Glucose", "insulin": "Insulin",
    "hrv_daily": "Daily HRV", "resting_hr": "Resting HR",
    "sleep_quality": "Sleep Quality", "sleep_efficiency": "Sleep Efficiency",
    "deep_sleep": "Deep Sleep", "vo2_peak": "VO2 Peak",
    "rbc": "Red Blood Cells", "wbc": "White Blood Cells",
    "body_fat_pct": "Body Fat %", "body_mass_kg": "Body Mass",
    "zinc": "Zinc", "magnesium_rbc": "Magnesium",
    "overreaching_state": "Overreaching State",
    "iron_deficiency_state": "Iron Deficiency State",
    "sleep_deprivation_state": "Sleep Deprivation State",
    "inflammation_state": "Inflammation State",
    "acwr": "ACWR", "sleep_debt": "Sleep Debt",
}


def friendly(node_id: str) -> str:
    return FRIENDLY_NAMES.get(node_id, node_id.replace("_", " ").title())


def find_optimal_points(
    action_node: str,
    equations: list[Equation],
) -> list[OutcomeOptimal]:
    """Find each outcome's preferred operating point for this action.

    For v_max edges: the theta IS the optimal value (peak of inverted U).
    For v_min edges: the theta is the WORST value (trough of U).
    For plateau_up: theta is where benefit saturates (target = at or above theta).
    For plateau_down: theta is where harm starts (stay below theta).
    For linear: no natural optimal point (monotonic benefit or harm).
    """
    results = []
    eq_by_target = build_equations_by_target(equations)

    for eq in equations:
        if eq.source != action_node:
            continue

        prior = BIOMARKER_PRIORS.get(eq.target) or WEARABLE_PRIORS.get(eq.target)
        tau = prior.tau_days if prior else 45.0

        if eq.curve == "v_max":
            # Peak at theta — above is harmful
            results.append(OutcomeOptimal(
                outcome_node=eq.target,
                outcome_label=friendly(eq.target),
                optimal_value=eq.theta,
                curve_type=eq.curve,
                direction="target",
                eff_n=eq.eff_n,
                tau_days=tau,
            ))
        elif eq.curve == "v_min":
            # Trough at theta — move away from theta
            # Optimal is either well below or well above; direction depends on current state
            results.append(OutcomeOptimal(
                outcome_node=eq.target,
                outcome_label=friendly(eq.target),
                optimal_value=eq.theta,
                curve_type=eq.curve,
                direction="avoid",
                eff_n=eq.eff_n,
                tau_days=tau,
            ))
        elif eq.curve in ("plateau_up", "plateau_down"):
            if eq.curve == "plateau_up":
                # Benefit saturates at theta — aim for theta or above
                direction = "increase" if eq.bb > 0 else "decrease"
            else:
                # Harm starts at theta — stay below
                direction = "decrease" if eq.ba < 0 else "increase"
            results.append(OutcomeOptimal(
                outcome_node=eq.target,
                outcome_label=friendly(eq.target),
                optimal_value=eq.theta,
                curve_type=eq.curve,
                direction=direction,
                eff_n=eq.eff_n,
                tau_days=tau,
            ))
        elif eq.curve == "linear":
            # Monotonic — direction is clear from slope sign
            slope = eq.bb  # below theta dominates for linear
            direction = "increase" if slope > 0 else "decrease"
            results.append(OutcomeOptimal(
                outcome_node=eq.target,
                outcome_label=friendly(eq.target),
                optimal_value=eq.theta,
                curve_type=eq.curve,
                direction=direction,
                eff_n=eq.eff_n,
                tau_days=tau,
            ))

    return results


def reconcile_action(
    action_node: str,
    current_value: float,
    effects: dict[str, NodeEffect],
    equations: list[Equation],
    regime_statuses: list[RegimeStatus],
) -> ReconciledAction:
    """Reconcile conflicting optimal points for one action.

    Decision rules (from user):
    - If optimal points are sufficiently close (<15% of action range): use most conservative
    - If far apart: expose at most 2 options with outcome attribution
    - Never more than 2 displayed options
    """
    optimal_points = find_optimal_points(action_node, equations)

    # Separate v_max/v_min targets from monotonic directions
    target_points = [p for p in optimal_points if p.direction == "target"]
    directional = [p for p in optimal_points if p.direction in ("increase", "decrease")]

    # Determine overall direction from net benefit (desirable-direction aware)
    n_benefits = sum(1 for e in effects.values() if is_beneficial(e))
    n_costs = sum(1 for e in effects.values() if is_harmful(e))
    net_benefit = sum(e.scaled_effect for e in effects.values())

    step = MARGINAL_STEPS.get(action_node, 1.0)
    if step > 0:
        overall_direction = "increase"
    elif step < 0:
        overall_direction = "decrease"
    else:
        overall_direction = "increase" if net_benefit > 0 else "decrease"

    # Reconcile target points (v_max thetas)
    primary_target = None
    primary_reason = ""
    secondary_target = None
    secondary_reason = ""

    if target_points:
        thetas = [p.optimal_value for p in target_points]
        theta_range = max(thetas) - min(thetas)
        action_typical_range = abs(step) * 5  # rough estimate of meaningful range

        if theta_range < action_typical_range * 0.15:
            # Close enough — use the most conservative
            # "Conservative" = the one requiring less change from current
            closest = min(target_points, key=lambda p: abs(p.optimal_value - current_value))
            # But actually: use the one that's safest (earliest bedtime, less intense, etc.)
            if action_node == "bedtime":
                # Earlier bedtime is more conservative
                primary_target = min(thetas)
            elif action_node in ("running_volume", "training_volume", "training_load"):
                # Less training is more conservative
                primary_target = min(thetas)
            else:
                primary_target = closest.optimal_value

            contributors = [p.outcome_label for p in target_points]
            primary_reason = f"Optimizes {', '.join(contributors[:3])}"
        else:
            # Far apart — show two options
            sorted_points = sorted(target_points, key=lambda p: p.optimal_value)
            p1 = sorted_points[0]
            p2 = sorted_points[-1]

            primary_target = p1.optimal_value
            primary_reason = f"Best for {p1.outcome_label}"
            secondary_target = p2.optimal_value
            secondary_reason = f"Best for {p2.outcome_label}"

    # Group effects by temporal bucket
    quick, medium, long = [], [], []
    for effect in effects.values():
        bucket = temporal_bucket(effect.tau_days)
        if bucket == "quick":
            quick.append(effect)
        elif bucket == "medium":
            medium.append(effect)
        else:
            long.append(effect)

    # Sort each bucket by absolute scaled effect size
    quick.sort(key=lambda e: abs(e.scaled_effect), reverse=True)
    medium.sort(key=lambda e: abs(e.scaled_effect), reverse=True)
    long.sort(key=lambda e: abs(e.scaled_effect), reverse=True)

    # Regime interaction notes
    regime_notes = []
    for rs in regime_statuses:
        if rs.margin < 0:
            regime_notes.append(f"ACTIVE: {rs.warning}")
        elif rs.margin < rs.threshold * 0.2:
            regime_notes.append(f"CAUTION: {rs.warning}")

    # Tradeoff detection: benefits vs costs using desirable direction
    tradeoffs = []
    benefits = sorted(
        [e for e in effects.values() if is_beneficial(e)],
        key=lambda e: abs(e.scaled_effect), reverse=True,
    )
    costs = sorted(
        [e for e in effects.values() if is_harmful(e)],
        key=lambda e: abs(e.scaled_effect), reverse=True,
    )
    for ben in benefits[:2]:
        for cost in costs[:2]:
            tradeoffs.append(
                f"{friendly(ben.node_id)} improves ({ben.scaled_effect:+.1f}) "
                f"but {friendly(cost.node_id)} worsens ({cost.scaled_effect:+.1f})"
            )
    tradeoffs = tradeoffs[:3]  # cap at 3

    return ReconciledAction(
        action_node=action_node,
        action_label=friendly(action_node),
        current_value=current_value,
        direction=overall_direction,
        primary_target=primary_target,
        primary_reason=primary_reason,
        secondary_target=secondary_target,
        secondary_reason=secondary_reason,
        quick_effects=quick,
        medium_effects=medium,
        long_effects=long,
        regime_notes=regime_notes,
        tradeoffs=tradeoffs,
    )


# ── Full recommendation report ─────────────────────────────────────

@dataclass
class ParticipantReport:
    pid: int
    cohort: str
    regime_statuses: list[RegimeStatus]
    actions: list[ReconciledAction]
    validation: dict[str, dict] | None = None  # predicted vs actual


def generate_report(
    participant_state: dict,
    equations: list[Equation] | None = None,
    topo_order: list[str] | None = None,
) -> ParticipantReport:
    """Generate a full recommendation report for one participant."""
    if equations is None:
        equations = build_equations()
    if topo_order is None:
        topo_order = topological_sort(equations)

    from .transform import build_observed_values
    observed = build_observed_values(participant_state)

    # Regime check
    regime_statuses = check_regime_proximity(observed)

    # Marginal effects for all actions
    all_marginal = compute_marginal_effects(observed, equations, topo_order)

    # Reconcile each action
    actions = []
    for action_node, effects in all_marginal.items():
        current_val = observed.get(action_node, 0.0)
        reconciled = reconcile_action(
            action_node, current_val, effects, equations, regime_statuses
        )
        actions.append(reconciled)

    # Sort actions by total absolute scaled effect (most impactful first)
    actions.sort(
        key=lambda a: sum(abs(e.scaled_effect) for e in a.quick_effects + a.medium_effects + a.long_effects),
        reverse=True,
    )

    return ParticipantReport(
        pid=participant_state["pid"],
        cohort=participant_state["cohort"],
        regime_statuses=regime_statuses,
        actions=actions,
    )


# ── Validation (predicted vs actual Day 100) ──────────────────────

def validate_participant(
    participant_state: dict,
    equations: list[Equation] | None = None,
    topo_order: list[str] | None = None,
) -> dict[str, dict]:
    """Compare engine-predicted Day 100 values vs actual Day 100 blood.

    Uses Day 1 blood as baseline and the actual behavioral trajectory
    as the intervention to predict what Day 100 blood should be.

    Returns dict[biomarker_name, {predicted_delta, actual_delta, error}].
    """
    if equations is None:
        equations = build_equations()
    if topo_order is None:
        topo_order = topological_sort(equations)

    from .transform import build_observed_values

    # Baseline: Day 1 state
    baseline_obs = build_observed_values(participant_state, use_baseline=True)

    # Intervention: current behavior (what they actually did)
    current_behavior = participant_state["behavioral_state"]
    baseline_behavior = participant_state["baseline_behavioral"]

    # Build interventions: behavioral changes from baseline to current
    interventions = {}
    for node, current_val in current_behavior.items():
        baseline_val = baseline_behavior.get(node, current_val)
        if abs(current_val - baseline_val) > 1e-6:
            interventions[node] = current_val

    # Also include derived variable changes
    for node in ("acwr", "sleep_debt", "consistency"):
        current_val = participant_state["derived"].get(node, 0)
        baseline_val = participant_state["baseline_derived"].get(node, 0)
        if abs(current_val - baseline_val) > 1e-6:
            interventions[node] = current_val

    if not interventions:
        return {}

    # Run counterfactual
    effects = compute_counterfactual(baseline_obs, interventions, equations, topo_order)

    # Compare to actual changes
    day1_blood = participant_state["day1_blood"]
    day100_blood = participant_state["current_blood"]
    results = {}

    for biomarker in day1_blood:
        if biomarker not in day100_blood:
            continue

        actual_delta = day100_blood[biomarker] - day1_blood[biomarker]
        effect = effects.get(biomarker)
        predicted_delta = effect.scaled_effect if effect else 0.0

        results[biomarker] = {
            "day1": day1_blood[biomarker],
            "day100_actual": day100_blood[biomarker],
            "actual_delta": actual_delta,
            "predicted_delta": predicted_delta,
            "error": predicted_delta - actual_delta,
            "direction_match": (predicted_delta * actual_delta) > 0 if abs(actual_delta) > 0.01 else True,
        }

    return results


# ── Text formatting ────────────────────────────────────────────────

def confidence_label(eff_n: float) -> str:
    if eff_n >= 20:
        return "HIGH"
    elif eff_n >= 6:
        return "MODERATE"
    else:
        return "LOW"


def format_effect(e: NodeEffect, indent: str = "  ") -> str:
    conf = confidence_label(e.eff_n_bottleneck)
    prior = BIOMARKER_PRIORS.get(e.node_id) or WEARABLE_PRIORS.get(e.node_id)
    unit = prior.unit if prior else ""
    # Use scaled_effect (accounts for temporal accumulation over 100 days)
    val = e.scaled_effect
    sign = "+" if val > 0 else ""
    # Label based on desirable direction, not just sign
    if is_beneficial(e):
        label = "BENEFIT"
    elif is_harmful(e):
        label = "COST"
    else:
        label = "NEUTRAL"
    return (
        f"{indent}{label:>7s} {friendly(e.node_id)}: "
        f"{sign}{val:.2f} {unit} "
        f"[{e.ci_low:+.2f} to {e.ci_high:+.2f}] "
        f"({e.temporal_factor:.0%} of equilibrium over 100d) "
        f"Confidence: {conf} (effN={e.eff_n_bottleneck:.0f})"
    )


def format_report(report: ParticipantReport) -> str:
    """Format a participant report as human-readable text."""
    lines = []
    lines.append(f"{'='*70}")
    lines.append(f"PARTICIPANT {report.pid} ({report.cohort})")
    lines.append(f"{'='*70}")

    # Regime status
    lines.append("\nREGIME STATUS:")
    for rs in report.regime_statuses:
        icon = "!!" if rs.margin < 0 else "!?" if rs.margin < rs.threshold * 0.2 else "OK"
        lines.append(f"  [{icon}] {rs.warning}")

    # Actions (sorted by impact)
    for action in report.actions:
        total_effects = len(action.quick_effects) + len(action.medium_effects) + len(action.long_effects)
        if total_effects == 0:
            continue

        lines.append(f"\n{'~'*60}")
        lines.append(f"ACTION: {action.action_label}")
        lines.append(f"  Current: {action.current_value:.1f}")
        lines.append(f"  Direction: {action.direction}")

        if action.primary_target is not None:
            lines.append(f"  Target: {action.primary_target:.1f} -- {action.primary_reason}")
        if action.secondary_target is not None:
            lines.append(f"  Alt target: {action.secondary_target:.1f} -- {action.secondary_reason}")

        if action.quick_effects:
            lines.append(f"\n  QUICK WINS ({temporal_label('quick')}):")
            for e in action.quick_effects[:5]:
                lines.append(format_effect(e, indent="    "))

        if action.medium_effects:
            lines.append(f"\n  MEDIUM-TERM ({temporal_label('medium')}):")
            for e in action.medium_effects[:5]:
                lines.append(format_effect(e, indent="    "))

        if action.long_effects:
            lines.append(f"\n  LONG-TERM ({temporal_label('long')}):")
            for e in action.long_effects[:5]:
                lines.append(format_effect(e, indent="    "))

        if action.tradeoffs:
            lines.append(f"\n  TRADEOFFS:")
            for t in action.tradeoffs:
                lines.append(f"    {t}")

        if action.regime_notes:
            lines.append(f"\n  REGIME NOTES:")
            for n in action.regime_notes:
                lines.append(f"    {n}")

    return "\n".join(lines)
