"""Bayesian per-participant export — v2, total-effect priors.

Runs pop -> cohort -> user conjugate updates on each (action, outcome) pair
for every participant and writes a JSON file per participant to
`output/portal_bayesian/`.

Diagnostic-mode only. Does not overwrite the production `output/portal/`.

Differences from v1 (per-edge slope priors):
  - Priors live on total (action, outcome) effects, not individual edges.
    Structural edges remain the computational layer.
  - Prior variance is the empirical spread of engine-predicted scaled_effects
    across 1,188 participants (2x inflation), so the scale automatically
    matches the outcome's natural units — no bimodal contraction.
  - Cohort priors are per-(action, outcome) rather than per-edge.
  - User observations come from confounded OLS on daily CSVs, with
    action-specific adjustment sets (user_observations.py).
  - Conjugate update uses library `sigma_data` (per-outcome measurement noise)
    rather than user OLS SE for stability.

Usage:
    python -m serif_scm.export_portal_bayesian --all
    python -m serif_scm.export_portal_bayesian -n 50
"""

from __future__ import annotations

import argparse
import json
import math
import statistics as stats
import time
from collections import defaultdict
from pathlib import Path

from .transform import build_all_participants
from .total_effect_priors import (
    load_priors, save_priors, build_total_effect_priors,
    TotalEffectPrior, DEFAULT_FLOOR_MODE, MEAN_SCALED_FRAC, VAR_INFLATION,
    supported_pairs_from_priors,
)
from .weak_default_priors import (
    fill_weak_defaults, summarize_by_provenance, SIGMA_WEAK_FRAC,
)
from .user_observations import (
    load_user_observations, save_user_observations,
    build_all_user_observations, UserObservation,
)
from .conjugate_update import compute_posterior, sigma_data_for_outcome
from .dose_multiplier import multiplier_from_posterior
from .feasibility_bounds import bound_dose
from .protocols import (
    synthesize_protocols, compute_current_values, compute_behavioral_sds,
    protocols_to_dicts,
)
from .reconcile import compute_regime_activations
from .transform import compute_acwr, compute_sleep_debt
from .loads import compute_loads_summary
from .scheduler import (
    compute_release_schedule, releases_to_dicts,
    release_count_warnings, release_count_distribution,
    RELEASE_COUNT_LOWER, RELEASE_COUNT_UPPER,
)
from .intervention_horizons import (
    WEARABLE_HORIZONS, BIOMARKER_HORIZONS,
    get_horizon, pathway_for, horizon_display,
)
from .positivity import compute_action_positivity


# ── Outcome-baseline config ──
# Baseline is what the participant sits at *now*, used by the frontend to
# anchor "Baseline → projection" on each insight. Wearable baselines are a
# trailing mean (daily signal, smooths day-to-day noise); biomarker baselines
# are the most recent blood-draw value (single measurement, no smoothing).
OUTCOME_BASELINE_WINDOW_DAYS = 14


def compute_outcome_baselines(
    wear_df_pid,  # pandas.DataFrame | None: wearables_daily.csv rows for this pid
    blood_df_pid,  # pandas.DataFrame | None: blood_draws.csv rows for this pid
    eval_day: int = 100,
    window: int = OUTCOME_BASELINE_WINDOW_DAYS,
) -> dict[str, float]:
    """Per-outcome current-level baseline for this participant.

    - Wearable outcomes (hrv_daily, resting_hr, sleep_quality, deep_sleep,
      sleep_efficiency): mean of the final `window` rows of the pid's
      wearables_daily.csv slice. If the participant has fewer than `window`
      rows, uses whatever is available.
    - Biomarker outcomes (everything in BIOMARKER_HORIZONS): value from the
      blood draw at `eval_day` if present, otherwise the most recent draw.

    Outcomes with missing/NaN values are omitted — the frontend treats
    absence as "no baseline, hide the Baseline → projection row".
    """
    import math
    out: dict[str, float] = {}

    # Wearable outcomes — trailing 14-day mean per outcome column
    if wear_df_pid is not None and len(wear_df_pid) > 0:
        recent = wear_df_pid.tail(window) if len(wear_df_pid) > window else wear_df_pid
        for outcome in WEARABLE_HORIZONS.keys():
            if outcome in recent.columns:
                val = recent[outcome].mean()
                if val is not None and not (isinstance(val, float) and math.isnan(val)):
                    out[outcome] = float(val)

    # Biomarker outcomes — draw at eval_day, else last draw
    if blood_df_pid is not None and len(blood_df_pid) > 0:
        day_row = blood_df_pid[blood_df_pid["draw_day"] == eval_day]
        if len(day_row) == 0:
            day_row = blood_df_pid.iloc[[-1]]
        row = day_row.iloc[0]
        for outcome in BIOMARKER_HORIZONS.keys():
            if outcome in blood_df_pid.columns:
                val = row.get(outcome)
                if val is None:
                    continue
                try:
                    f = float(val)
                except (TypeError, ValueError):
                    continue
                if math.isnan(f):
                    continue
                out[outcome] = f

    return out


# ── Posterior-variance gating thresholds ──
GATE_RECOMMENDED = 0.70
GATE_POSSIBLE    = 0.30
DIRECTION_CONFLICT_DISCOUNT = 0.5

# Marginal positivity caps gate just below `recommended` so the insight can
# still surface as `possible` but never as a primary recommendation. The cap
# is relative (min of current gate and the ceiling) so a weak-contraction
# insight stays weak rather than being boosted up to the cap.
MARGINAL_POSITIVITY_GATE_CAP = GATE_RECOMMENDED - 0.01


# ── Regime-aware gating ──
# When a participant is in an active regime (e.g. iron-deficient), actions
# that plausibly address that regime get a gate-score multiplier so the most
# relevant interventions surface first. 1.3x is conservative — it bumps a
# borderline `possible` up to `recommended` if other factors support it,
# without overriding a weak posterior.
REGIME_BOOST = 1.3
REGIME_ACTIVATION_THRESHOLD = 0.5  # same threshold used in manifest stats

# action → set of regime keys it addresses. Regime keys match
# `compute_regime_activations` output (trailing "_state" suffix).
ACTION_REGIME_MAP: dict[str, set[str]] = {
    "running_volume":   {"overreaching_state", "iron_deficiency_state"},
    "training_volume":  {"overreaching_state", "inflammation_state"},
    "training_load":    {"overreaching_state", "inflammation_state"},
    "zone2_volume":     {"overreaching_state"},
    "sleep_duration":   {"sleep_deprivation_state", "overreaching_state",
                         "inflammation_state"},
    "bedtime":          {"sleep_deprivation_state"},
    "dietary_protein":  {"iron_deficiency_state", "inflammation_state"},
    "dietary_energy":   {"iron_deficiency_state"},
    "steps":            set(),  # too diffuse to map cleanly
    "active_energy":    set(),
}


def regime_boost_for_action(
    action: str, regime_activations: dict[str, float] | None,
) -> tuple[float, list[str]]:
    """Return (multiplier, active-regime-names-addressed). Multiplier is
    REGIME_BOOST if at least one active regime is addressed, else 1.0."""
    if not regime_activations:
        return 1.0, []
    targeted = ACTION_REGIME_MAP.get(action, set())
    if not targeted:
        return 1.0, []
    addressed = [
        r for r in targeted
        if float(regime_activations.get(r, 0.0)) >= REGIME_ACTIVATION_THRESHOLD
    ]
    if not addressed:
        return 1.0, []
    return REGIME_BOOST, addressed


# ── Evidence tier thresholds (per pathway) ──
# Biomarker priors contract slowly (n_effective=1 per user); use lower
# thresholds so a single pre/post draw can lift a recommendation into
# "personal_emerging" without claiming more evidence than it has.
EVIDENCE_TIER_THRESHOLDS = {
    "wearable":  {"cohort_level": 0.20, "personal_emerging": 0.50},
    "biomarker": {"cohort_level": 0.10, "personal_emerging": 0.30},
}


BIOMARKER_ESTABLISHED_MIN_N = 2  # needs >=2 independent blood draws past baseline


def compute_evidence_tier(
    posterior_contraction: float, pathway: str, user_n: int = 0,
) -> str:
    """Map posterior contraction to a three-bucket evidence tier.

    Thresholds diverge by pathway because biomarker updates come from a
    single pre/post observation while wearable updates draw on ~100 days
    of daily data — same nominal contraction means different amounts of
    personal signal.

    Biomarker "personal_established" additionally requires user_n >=
    BIOMARKER_ESTABLISHED_MIN_N. With synthetic data capped at one pre/post
    pair (n=1), this keeps every biomarker recommendation at emerging or
    below until repeat follow-up draws exist.
    """
    t = EVIDENCE_TIER_THRESHOLDS.get(pathway, EVIDENCE_TIER_THRESHOLDS["wearable"])
    if posterior_contraction < t["cohort_level"]:
        return "cohort_level"
    if posterior_contraction < t["personal_emerging"]:
        return "personal_emerging"
    if pathway == "biomarker" and user_n < BIOMARKER_ESTABLISHED_MIN_N:
        return "personal_emerging"
    return "personal_established"


_SUPPORTING_DATA_DESCRIPTIONS = {
    ("biomarker", "cohort_level"):
        "Based on cohort priors; personal response to be confirmed at next lab draw",
    ("biomarker", "personal_emerging"):
        "Emerging personal evidence from 2 lab draws; continues to refine over time",
    ("biomarker", "personal_established"):
        "Personalized to your data",
    ("wearable", "cohort_level"):
        "Based on cohort patterns; personal signal strengthening",
    ("wearable", "personal_emerging"):
        "Personal response emerging from daily data",
    ("wearable", "personal_established"):
        "Personalized to your data",
}


def supporting_data_description(pathway: str, evidence_tier: str) -> str:
    return _SUPPORTING_DATA_DESCRIPTIONS.get(
        (pathway, evidence_tier),
        f"Evidence: {evidence_tier} ({pathway})",
    )


# ── Literature-backed mechanism flag ──
# (action, outcome) pairs where the direction of effect is supported by
# well-established RCT or mechanistic literature — not just the cohort fit.
# The UI shows a small badge so users understand this edge isn't inferred
# purely from the population data. Keep this list conservative: only include
# pairs where the literature is both strong AND the effect direction matches
# the fitted prior (no contradictions between lit and fit).
LITERATURE_BACKED: set[tuple[str, str]] = {
    # ACWR -> recovery/inflammation: Gabbett 2016, Malone 2017, Hulin 2014
    ("acwr", "hrv_daily"),
    ("acwr", "resting_hr"),
    ("acwr", "hscrp"),
    ("acwr", "cortisol"),
    ("acwr", "testosterone"),
    # Sleep restriction -> HPA/metabolic: Van Cauter 1997, Leproult & Van Cauter 2011
    ("sleep_debt", "cortisol"),
    ("sleep_debt", "glucose"),
    ("sleep_debt", "resting_hr"),
    ("sleep_debt", "testosterone"),
    # Circadian misalignment -> sleep/autonomic: Kolla 2016, Burgess 2003
    ("travel_load", "deep_sleep"),
    ("travel_load", "hrv_daily"),
    ("travel_load", "sleep_efficiency"),
    ("travel_load", "resting_hr"),
    # Aerobic training -> VO2: decades of exercise physiology (Bassett 2000)
    ("running_volume", "vo2_peak"),
    ("zone2_volume", "vo2_peak"),
    ("training_volume", "vo2_peak"),
    # Sleep duration -> hormones: well-established restriction studies
    ("sleep_duration", "cortisol"),
    ("sleep_duration", "testosterone"),
}


def is_literature_backed(action: str, outcome: str) -> bool:
    return (action, outcome) in LITERATURE_BACKED


# ── Cohort name mapping ──
# Source CSVs carry geographic names; Serif's canonical cohort vocabulary is
# cohort_a/b/c. Remap during export only — underlying CSVs untouched.
COHORT_RENAME = {"delhi": "cohort_a", "abu_dhabi": "cohort_b", "remote": "cohort_c"}


def _rename_cohort(c: str) -> str:
    return COHORT_RENAME.get(c, c)


def _tier_for(score: float) -> str:
    if score >= GATE_RECOMMENDED:
        return "recommended"
    if score >= GATE_POSSIBLE:
        return "possible"
    return "not_exposed"


def _row(
    action: str,
    outcome: str,
    pop: TotalEffectPrior,
    cohort: TotalEffectPrior | None,
    user: UserObservation | None,
    current_value: float | None = None,
    positivity: dict | None = None,
    regime_activations: dict[str, float] | None = None,
) -> dict:
    post = compute_posterior(pop, cohort, user)
    adj = multiplier_from_posterior(
        contraction=post.contraction,
        posterior_mean=post.mean,
        pop_mean=pop.mean,
    )

    gate_raw = post.contraction
    if adj.direction_conflict:
        gate_raw *= DIRECTION_CONFLICT_DISCOUNT

    # Per-action feasibility bound on the intervention. The dose_multiplier
    # comes from contraction only — it doesn't know whether the participant's
    # current operating point makes the implied intervention physically
    # reachable. bound_dose shrinks the multiplier when `current + dose`
    # would fall outside the per-action feasible range, and zeros it on a
    # sign flip (existing min-dose filters then suppress the insight).
    original_multiplier = adj.multiplier
    bounded_multiplier, was_bounded = bound_dose(
        action, current_value, pop.nominal_step, original_multiplier,
    )
    unbounded_scaled_effect = post.mean * original_multiplier
    if was_bounded:
        dose_multiplier_out = bounded_multiplier
        scaled_effect_user = post.mean * bounded_multiplier
        if abs(original_multiplier) > 1e-9:
            gate_raw = gate_raw * (abs(bounded_multiplier) / abs(original_multiplier))
    else:
        dose_multiplier_out = original_multiplier
        scaled_effect_user = unbounded_scaled_effect

    # Regime boost runs BEFORE positivity gating. Positivity caps are a
    # suppression floor — a boost shouldn't let an insufficient-variation
    # insight past the gate, and a marginal-variation insight shouldn't
    # exceed MARGINAL_POSITIVITY_GATE_CAP regardless of how active the
    # regime is.
    boost_multiplier, regimes_addressed = regime_boost_for_action(
        action, regime_activations,
    )
    gate_raw = min(gate_raw * boost_multiplier, 1.0)

    positivity_flag = (positivity or {}).get("flag", "ok")
    suppression_reason: str | None = None
    if positivity_flag == "insufficient":
        # Force not_exposed regardless of posterior. The participant didn't
        # vary the action enough for any causal claim to be credible.
        gate_raw = 0.0
        tier = "not_exposed"
        suppression_reason = "insufficient_action_variation"
    elif positivity_flag == "marginal":
        # Cap gate so tier can't reach `recommended`. Still surfaces as
        # `possible` if the posterior is strong enough; drops to `not_exposed`
        # if it isn't. Reason stays None — it's not a hard suppression.
        gate_raw = min(gate_raw, MARGINAL_POSITIVITY_GATE_CAP)
        tier = _tier_for(gate_raw)
    else:
        tier = _tier_for(gate_raw)

    post_sd = math.sqrt(max(post.variance, 0.0))
    z_like = post.mean / post_sd if post_sd > 0 else None

    pathway = pathway_for(outcome) or "wearable"
    horizon = get_horizon(outcome) or 0
    user_n = int(user.n) if user is not None else 0
    evidence_tier = compute_evidence_tier(post.contraction, pathway, user_n=user_n)

    # sigma_data_used depends on where the update pulled its outcome-scale
    # noise from: biomarker observations carry it inline; wearable defaults
    # to the library SIGMA_DATA_BY_OUTCOME.
    if user is not None and getattr(user, "sigma_data_used", 0.0) > 0:
        sigma_used = float(user.sigma_data_used)
    else:
        sigma_used = sigma_data_for_outcome(outcome)

    return {
        "action": action,
        "outcome": outcome,
        "pathway": pathway,
        "evidence_tier": evidence_tier,
        "prior_provenance": getattr(pop, "provenance", "synthetic"),
        "literature_backed": is_literature_backed(action, outcome),
        "horizon_days": horizon,
        "horizon_display": horizon_display(horizon) if horizon > 0 else "",
        "supporting_data_description": supporting_data_description(pathway, evidence_tier),
        "nominal_step": pop.nominal_step,
        "dose_multiplier": dose_multiplier_out,
        "dose_multiplier_raw": adj.raw_multiplier,
        "direction_conflict": adj.direction_conflict,
        "dose_bounded": was_bounded,
        "unbounded_dose_multiplier": original_multiplier,
        "unbounded_scaled_effect": unbounded_scaled_effect,
        "scaled_effect": scaled_effect_user,
        "posterior": {
            "mean": post.mean,
            "variance": post.variance,
            "sd": post_sd,
            "contraction": post.contraction,
            "prior_mean": post.prior_mean,
            "prior_variance": post.prior_variance,
            "source": post.source,
            "lam_js": post.lam_js,
            "n_cohort": post.n_cohort,
            "z_like": z_like,
        },
        "cohort_prior": (
            {"mean": cohort.mean, "variance": cohort.variance, "n": cohort.n}
            if cohort is not None else None
        ),
        "user_obs": (
            {
                "slope": user.slope, "se": user.se, "n": user.n,
                "at_nominal_step": user.at_nominal_step,
                "se_at_step": user.se_at_step,
                "residual_sd": user.residual_sd,
                "sigma_data_used": sigma_used,
                "pathway": getattr(user, "pathway", "wearable"),
                "confounders_adjusted": list(getattr(user, "confounders_adjusted", ()) or ()),
            }
            if user is not None else None
        ),
        "gate": {
            "score": gate_raw,
            "tier": tier,
            "suppression_reason": suppression_reason,
            "regime_boost_applied": boost_multiplier > 1.0,
            "regimes_addressed": regimes_addressed,
        },
        "positivity_flag": positivity_flag,
        "positivity": (
            {
                "n": positivity.get("n", 0),
                "cv": positivity.get("cv", 0.0),
                "range_fraction": positivity.get("range_fraction", 0.0),
                "mode_fraction": positivity.get("mode_fraction", 1.0),
                "n_distinct": positivity.get("n_distinct", 0),
            }
            if positivity is not None else None
        ),
    }


def _exploration_recommendations(rows: list[dict]) -> list[dict]:
    """Per-participant 'data worth adding' candidates.

    Picks rows that fell out of the gate (tier='not_exposed') for a *remediable*
    reason — the user could vary the action more (positivity), or add a second
    blood draw so the biomarker posterior moves. Rows with a firm not-exposed
    for structural reasons (weak cohort prior + no user obs, direction
    conflict, bounded-to-zero dose) are excluded — adding data can't rescue
    those.
    """
    out: list[dict] = []
    for r in rows:
        if r["gate"]["tier"] != "not_exposed":
            continue

        positivity = r.get("positivity") or {}
        positivity_flag = r.get("positivity_flag", "ok")

        user_obs = r.get("user_obs") or {}
        user_n = int(user_obs.get("n", 0))
        pathway = r.get("pathway", "wearable")

        kind: str | None = None
        rationale: str | None = None

        if positivity_flag == "insufficient":
            kind = "vary_action"
            rationale = (
                "Positivity check flagged insufficient variation in this "
                "action. Varying it over 30-60 days would make personal "
                "insights possible."
            )
        elif positivity_flag == "marginal":
            kind = "vary_action"
            rationale = (
                "Action variation is marginal. A bit more range would let "
                "the engine produce a confident recommendation."
            )
        elif pathway == "biomarker" and user_n < 2:
            kind = "repeat_measurement"
            rationale = (
                "Biomarker effect exists in the population prior but the "
                "posterior hasn't updated — a second blood draw in 8-12 "
                "weeks would tell us if this pathway is active for you."
            )

        if kind is None:
            continue

        out.append({
            "action": r["action"],
            "outcome": r["outcome"],
            "pathway": pathway,
            "kind": kind,
            "rationale": rationale,
            "prior_contraction": r["posterior"]["contraction"],
            "positivity_flag": positivity_flag,
            "user_n": user_n,
        })
    return out


def _export_one(
    pid: int,
    cohort_id: str,
    raw_cohort_id: str,
    age: int,
    is_female: bool,
    priors: dict,
    user_obs_pairs: dict,
    current_values: dict[str, float],
    behavioral_sds: dict[str, float],
    supported_pairs: list[tuple[str, str]],
    regime_activations: dict[str, float] | None = None,
    outcome_baselines: dict[str, float] | None = None,
    positivity_map: dict[str, dict] | None = None,
    loads_summary: dict[str, dict[str, float]] | None = None,
) -> dict:
    """Build the full per-participant record.

    cohort_id is the canonical serif label written to JSON; raw_cohort_id is
    the underlying CSV label used to look up per-cohort priors (which are
    keyed by the original name).
    """
    rows: list[dict] = []
    tier_counts = {"recommended": 0, "possible": 0, "not_exposed": 0}
    positivity_map = positivity_map or {}

    for (action, outcome) in supported_pairs:
        pop = priors.get(("__all__", action, outcome))
        if pop is None:
            continue
        cohort = priors.get((raw_cohort_id, action, outcome))
        user = user_obs_pairs.get((action, outcome))

        r = _row(action, outcome, pop, cohort, user,
                 current_value=current_values.get(action),
                 positivity=positivity_map.get(action),
                 regime_activations=regime_activations)
        rows.append(r)
        tier_counts[r["gate"]["tier"]] += 1

    exposed = tier_counts["recommended"] + tier_counts["possible"]

    # Exploration recommendations: "data worth adding" candidates. Filter for
    # rows that fell out of the gate but have a remediable cause (positivity
    # gap or single-draw biomarker). Caller UI groups them as suggestions for
    # what the user could do to unlock real insights.
    exploration_recommendations = _exploration_recommendations(rows)

    protocols = synthesize_protocols(
        pid=pid,
        all_insights=rows,
        current_values=current_values,
        behavioral_sds=behavioral_sds,
    )
    protocols_dicts = protocols_to_dicts(protocols)

    regime_activations = regime_activations or {}
    releases = compute_release_schedule(
        protocols_dicts, regime_activations=regime_activations,
    )

    return {
        "pid": pid,
        "cohort": cohort_id,
        "age": age,
        "is_female": is_female,
        "effects_bayesian": rows,
        "tier_counts": tier_counts,
        "exposed_count": exposed,
        "protocols": protocols_dicts,
        "current_values": current_values,
        "behavioral_sds": behavioral_sds,
        "outcome_baselines": outcome_baselines or {},
        "regime_activations": regime_activations,
        "loads_today": loads_summary or {},
        "release_schedule": releases_to_dicts(releases),
        "exploration_recommendations": exploration_recommendations,
    }


def main():
    ap = argparse.ArgumentParser(description="Serif Bayesian portal export (v2)")
    ap.add_argument("--data-dir", default="./output")
    ap.add_argument("--out", default="./output/portal_bayesian")
    ap.add_argument("-n", type=int, default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--min-user-n", type=int, default=20)
    ap.add_argument("--force-refit", action="store_true",
                    help="Refit priors + user observations even if cached files exist")
    ap.add_argument("--variance-floor-mode", choices=["absolute", "mean_scaled"],
                    default=DEFAULT_FLOOR_MODE,
                    help=f"Prior-variance floor rule (default: {DEFAULT_FLOOR_MODE})")
    args = ap.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    priors_path = data_dir / "total_effect_priors.json"
    obs_path = data_dir / "user_observations.json"

    # ── Load or build priors ──
    print(f"[bayes] loading participants...")
    participants = build_all_participants(data_dir)
    print(f"[bayes] {len(participants)} participants")

    # Cached priors are mode-tagged with a suffix so absolute vs mean_scaled
    # runs don't clobber each other when --force-refit is not set.
    priors_path_for_mode = (
        priors_path if args.variance_floor_mode == DEFAULT_FLOOR_MODE
        else priors_path.with_name(f"total_effect_priors_{args.variance_floor_mode}.json")
    )
    if priors_path_for_mode.exists() and not args.force_refit:
        print(f"[bayes] loading priors from {priors_path_for_mode}")
        priors = load_priors(priors_path_for_mode)
    else:
        print(f"[bayes] fitting total-effect priors (floor_mode={args.variance_floor_mode})...")
        t1 = time.time()
        priors = build_total_effect_priors(participants, floor_mode=args.variance_floor_mode)
        save_priors(priors, priors_path_for_mode)
        print(f"[bayes] fitted {len(priors)} priors in {time.time()-t1:.1f}s")

    # Layer 0 fill — weak zero-centered priors for pairs without a DAG fit.
    # Derived each run from the Cartesian grid + SIGMA_WEAK_FRAC so changes
    # to the weak-prior config don't need a cache bust.
    priors, weak_added = fill_weak_defaults(priors)
    print(f"[bayes] layer 0 added {len(weak_added)} weak-default priors "
          f"(SIGMA_WEAK_FRAC={SIGMA_WEAK_FRAC:.2f})")
    provenance_counts = summarize_by_provenance(priors)
    print(f"[bayes] prior provenance (__all__): {provenance_counts}")

    # Derive SUPPORTED_PAIRS from priors. Synthetic fits pass when |mean|
    # exceeds 1e-6; weak defaults pass unconditionally (they carry posterior
    # via user observations, not via the fit magnitude).
    supported_pairs = supported_pairs_from_priors(priors)
    n_wear = sum(1 for _, o in supported_pairs if o in WEARABLE_HORIZONS)
    n_bio = sum(1 for _, o in supported_pairs if o in BIOMARKER_HORIZONS)
    print(f"[bayes] SUPPORTED_PAIRS: {len(supported_pairs)} total "
          f"({n_wear} wearable, {n_bio} biomarker)")

    # ── Load or build user observations ──
    if obs_path.exists() and not args.force_refit:
        print(f"[bayes] loading user observations from {obs_path}")
        user_obs = load_user_observations(obs_path)
    else:
        print(f"[bayes] fitting user OLS observations...")
        t1 = time.time()
        user_obs = build_all_user_observations(
            data_dir, min_n=args.min_user_n, supported_pairs=supported_pairs,
        )
        save_user_observations(user_obs, obs_path)
        print(f"[bayes] {len(user_obs)} users fit in {time.time()-t1:.1f}s")

    # Select participant subset if -n given
    if args.n is not None and not args.all:
        participants = participants[: args.n]
    print(f"[bayes] exporting {len(participants)} to {out_dir}...")

    # Load lifestyle CSV once for current-value / behavioral-SD computation.
    import pandas as pd
    life_df = pd.read_csv(data_dir / "lifestyle_app.csv")
    life_by_pid = {int(pid): g for pid, g in life_df.groupby("participant_id")}

    # Load blood for regime-activation inputs (ferritin, hscrp at eval day).
    blood_df = pd.read_csv(data_dir / "blood_draws.csv")
    eval_day = 100

    # Load wearables for per-outcome baselines (14-day trailing mean).
    wear_df = pd.read_csv(data_dir / "wearables_daily.csv")
    wear_by_pid = {int(pid): g for pid, g in wear_df.groupby("participant_id")}

    t2 = time.time()
    global_tier_counts = {"recommended": 0, "possible": 0, "not_exposed": 0}
    exposed_per_participant: list[int] = []
    contraction_samples: list[float] = []
    multiplier_samples: list[float] = []
    direction_conflicts = 0
    protocol_counts: list[int] = []
    protocol_option_labels: dict = defaultdict(int)
    protocol_action_counts: dict = defaultdict(int)
    release_counts: list[int] = []
    framing_counts: dict = defaultdict(int)
    active_regime_counts: dict = defaultdict(int)

    # Per-edge stats
    per_edge_tier: dict = defaultdict(lambda: {"recommended": 0, "possible": 0, "not_exposed": 0})
    per_edge_contraction: dict = defaultdict(list)
    per_edge_multiplier: dict = defaultdict(list)
    per_cohort_stats: dict = defaultdict(lambda: {"rows": 0, "recommended": 0, "possible": 0,
                                                  "contraction": [], "multiplier": [], "conflicts": 0})
    per_pathway_tier: dict = defaultdict(
        lambda: {"recommended": 0, "possible": 0, "not_exposed": 0,
                 "cohort_level": 0, "personal_emerging": 0, "personal_established": 0}
    )

    # Positivity tracking: flag distribution across all (pid, action, outcome)
    # rows, per-edge insufficient-flag rate (to catch "every participant has
    # the same constant action value" pathologies), and counts of rows whose
    # tier was forced down by positivity.
    positivity_flag_counts: dict = defaultdict(int)
    per_edge_positivity: dict = defaultdict(
        lambda: {"ok": 0, "marginal": 0, "insufficient": 0}
    )
    positivity_suppressed = 0  # tier forced to not_exposed
    positivity_capped = 0      # marginal: tier would have been recommended but capped

    # Regime-boost tracking: how many rows got a boost, and which regimes
    # are driving most of the boosts. Helps verify the boost targets realistic
    # regime/action combinations rather than firing indiscriminately.
    regime_boost_counts: dict = defaultdict(int)

    for i, state in enumerate(participants):
        pid = int(state["pid"])
        raw_cohort_id = str(state["cohort"])
        cohort_id = _rename_cohort(raw_cohort_id)
        age = int(state["age"])
        is_female = bool(state["is_female"])

        life_pid = life_by_pid.get(pid)
        if life_pid is not None and len(life_pid) > 0:
            current_vals = compute_current_values(life_pid)
            behavioral_sds = compute_behavioral_sds(life_pid)
            loads_summary = compute_loads_summary(life_pid)
        else:
            current_vals, behavioral_sds, loads_summary = {}, {}, {}

        # Regime inputs: acwr + sleep_debt from lifestyle, ferritin + hscrp from blood.
        p_blood = blood_df[blood_df["participant_id"] == pid]
        day_row = p_blood[p_blood["draw_day"] == eval_day]
        if len(day_row) == 0:
            day_row = p_blood.iloc[[-1]] if len(p_blood) > 0 else None

        if life_pid is not None and day_row is not None and len(day_row) > 0:
            daily = pd.DataFrame({"day": range(1, eval_day + 1)}).merge(
                life_pid[["day", "training_min", "sleep_hrs"]], on="day", how="left"
            ).ffill().bfill()
            regime_inputs = {
                "acwr":       compute_acwr(daily["training_min"].tolist(), eval_day - 1),
                "ferritin":   float(day_row.iloc[0].get("ferritin", 0.0)),
                "sleep_debt": compute_sleep_debt(daily["sleep_hrs"].tolist(), eval_day - 1),
                "hscrp":      float(day_row.iloc[0].get("hscrp", 0.0)),
            }
            regime_activations = compute_regime_activations(regime_inputs)
        else:
            regime_activations = {}

        wear_pid = wear_by_pid.get(pid)
        outcome_baselines = compute_outcome_baselines(
            wear_pid, p_blood, eval_day=eval_day,
        )

        # Positivity per action (not per pair — the action series is what
        # varies or doesn't; the outcome is what we're projecting onto). Only
        # actions that appear in supported_pairs are checked.
        unique_actions = sorted({a for (a, _) in supported_pairs})
        if life_pid is not None and len(life_pid) > 0:
            positivity_map = compute_action_positivity(
                life_pid, unique_actions, eval_day=eval_day,
            )
        else:
            positivity_map = {}

        record = _export_one(
            pid, cohort_id, raw_cohort_id, age, is_female, priors,
            user_obs.get(pid, {}),
            current_vals, behavioral_sds,
            supported_pairs,
            regime_activations=regime_activations,
            outcome_baselines=outcome_baselines,
            positivity_map=positivity_map,
            loads_summary=loads_summary,
        )
        (out_dir / f"participant_{pid:04d}.json").write_text(
            json.dumps(record, indent=2, default=float)
        )

        for k, v in record["tier_counts"].items():
            global_tier_counts[k] += v
        exposed_per_participant.append(record["exposed_count"])
        protocol_counts.append(len(record["protocols"]))
        for p in record["protocols"]:
            protocol_option_labels[p["option_label"]] += 1
            protocol_action_counts[p["action"]] += 1

        release_counts.append(len(record["release_schedule"]))
        for r in record["release_schedule"]:
            framing_counts[r["framing"]] += 1
        for regime, act in record["regime_activations"].items():
            if act >= 0.5:
                active_regime_counts[regime] += 1

        for eff in record["effects_bayesian"]:
            edge_key = f"{eff['action']}->{eff['outcome']}"
            contraction_samples.append(eff["posterior"]["contraction"])
            multiplier_samples.append(eff["dose_multiplier"])
            per_edge_contraction[edge_key].append(eff["posterior"]["contraction"])
            per_edge_multiplier[edge_key].append(eff["dose_multiplier"])
            per_edge_tier[edge_key][eff["gate"]["tier"]] += 1
            ppt = per_pathway_tier[eff["pathway"]]
            ppt[eff["gate"]["tier"]] += 1
            ppt[eff["evidence_tier"]] += 1
            if eff["direction_conflict"]:
                direction_conflicts += 1
                per_cohort_stats[cohort_id]["conflicts"] += 1

            flag = eff.get("positivity_flag", "ok")
            positivity_flag_counts[flag] += 1
            per_edge_positivity[edge_key][flag] += 1
            if eff["gate"].get("suppression_reason") == "insufficient_action_variation":
                positivity_suppressed += 1
            elif flag == "marginal":
                positivity_capped += 1

            if eff["gate"].get("regime_boost_applied"):
                regime_boost_counts["applied"] += 1
                for rg in eff["gate"].get("regimes_addressed", []):
                    regime_boost_counts[rg] += 1
            else:
                regime_boost_counts["not_applied"] += 1

            pc = per_cohort_stats[cohort_id]
            pc["rows"] += 1
            pc["contraction"].append(eff["posterior"]["contraction"])
            pc["multiplier"].append(eff["dose_multiplier"])
            if eff["gate"]["tier"] == "recommended":
                pc["recommended"] += 1
            elif eff["gate"]["tier"] == "possible":
                pc["possible"] += 1

        if (i + 1) % 200 == 0:
            print(f"  ...{i+1}/{len(participants)} ({time.time()-t2:.1f}s)")

    elapsed = time.time() - t2
    total_rows = sum(global_tier_counts.values())
    exposed_total = global_tier_counts["recommended"] + global_tier_counts["possible"]

    def pct(xs, q):
        s = sorted(xs)
        return s[min(int(q * len(s)), len(s) - 1)] if s else None
    contr_p = {q: pct(contraction_samples, q) for q in (0.1, 0.5, 0.9)}
    mult_p = {q: pct(multiplier_samples, q) for q in (0.1, 0.5, 0.9)}

    print(f"\n[bayes] wrote {len(participants)} files in {elapsed:.1f}s")
    print(f"[bayes] total rows: {total_rows}")
    print(f"[bayes] tier counts: {global_tier_counts}")
    print(f"[bayes] exposed total: {exposed_total} "
          f"(mean {exposed_total/max(len(participants),1):.2f} per participant)")
    if contraction_samples:
        print(f"[bayes] contraction: p10={contr_p[0.1]:.3f} p50={contr_p[0.5]:.3f} "
              f"p90={contr_p[0.9]:.3f} mean={stats.mean(contraction_samples):.3f}")
    if multiplier_samples:
        print(f"[bayes] multiplier:  p10={mult_p[0.1]:.3f} p50={mult_p[0.5]:.3f} "
              f"p90={mult_p[0.9]:.3f} mean={stats.mean(multiplier_samples):.3f}")
    print(f"[bayes] direction conflicts: {direction_conflicts}/{total_rows} "
          f"({100*direction_conflicts/max(total_rows,1):.1f}%)")

    print(f"\n[bayes] per-pathway tier breakdown:")
    for pathway in sorted(per_pathway_tier.keys()):
        ppt = per_pathway_tier[pathway]
        n = ppt["recommended"] + ppt["possible"] + ppt["not_exposed"]
        print(
            f"  {pathway:10s}  n={n:5d}  "
            f"rec={ppt['recommended']:4d}  pos={ppt['possible']:4d}  "
            f"n_ex={ppt['not_exposed']:4d}  |  "
            f"cohort_level={ppt['cohort_level']}  "
            f"emerging={ppt['personal_emerging']}  "
            f"established={ppt['personal_established']}"
        )

    print(f"\n[bayes] positivity flag distribution:")
    pos_total = sum(positivity_flag_counts.values())
    for flag in ("ok", "marginal", "insufficient"):
        n = positivity_flag_counts.get(flag, 0)
        rate = 100 * n / max(pos_total, 1)
        print(f"  {flag:13s}  n={n:5d}  ({rate:5.1f}%)")
    print(f"[bayes] rows forced to not_exposed by positivity: {positivity_suppressed}")
    print(f"[bayes] rows capped below recommended by marginal flag: {positivity_capped}")

    # Per-edge insufficient rate — flag any edge where >=50% of participants
    # are suppressed, since that suggests the action doesn't vary in the
    # population and the edge probably shouldn't be in the supported_pairs
    # list to begin with.
    print(f"\n[bayes] per-edge positivity (insufficient-rate sorted):")
    edge_ins_rates = []
    for edge_key, counts in per_edge_positivity.items():
        total = sum(counts.values())
        if total == 0:
            continue
        ins_rate = counts["insufficient"] / total
        edge_ins_rates.append((edge_key, ins_rate, counts, total))
    edge_ins_rates.sort(key=lambda x: -x[1])
    for edge_key, ins_rate, counts, total in edge_ins_rates[:10]:
        print(f"  {edge_key:38s}  n={total:4d}  "
              f"ok={counts['ok']:4d}  marg={counts['marginal']:4d}  "
              f"ins={counts['insufficient']:4d}  ({100*ins_rate:.1f}%)")

    print(f"\n[bayes] per-edge tier breakdown:")
    for edge_key in sorted(per_edge_tier.keys()):
        tc = per_edge_tier[edge_key]
        cs = per_edge_contraction[edge_key]
        ms = per_edge_multiplier[edge_key]
        n = sum(tc.values())
        if n == 0:
            continue
        print(f"  {edge_key:38s}  rec={tc['recommended']:4d}  "
              f"pos={tc['possible']:4d}  n_ex={tc['not_exposed']:4d}  "
              f"c_mean={stats.mean(cs):.3f}  mult_mean={stats.mean(ms):.3f}")

    print(f"\n[bayes] per-cohort tier breakdown:")
    for cohort_id in sorted(per_cohort_stats.keys()):
        pc = per_cohort_stats[cohort_id]
        if pc["rows"] == 0:
            continue
        print(
            f"  {cohort_id:10s}  rows={pc['rows']:5d}  "
            f"rec={pc['recommended']:4d}  pos={pc['possible']:4d}  "
            f"c_mean={stats.mean(pc['contraction']):.3f}  "
            f"mult_mean={stats.mean(pc['multiplier']):.3f}  "
            f"conflict_rate={100*pc['conflicts']/pc['rows']:.1f}%"
        )

    # Protocol summary
    if protocol_counts:
        pc_mean = stats.mean(protocol_counts)
        pc_p10 = pct(protocol_counts, 0.1)
        pc_p50 = pct(protocol_counts, 0.5)
        pc_p90 = pct(protocol_counts, 0.9)
        total_protocols = sum(protocol_counts)
        print(f"\n[bayes] protocols: total={total_protocols} "
              f"mean={pc_mean:.2f}/participant  "
              f"p10/p50/p90={pc_p10}/{pc_p50}/{pc_p90}")
        print(f"[bayes] protocol option labels: {dict(protocol_option_labels)}")
        print(f"[bayes] protocol action counts: {dict(protocol_action_counts)}")
    else:
        pc_mean = 0
        total_protocols = 0

    # Release schedule summary
    if release_counts:
        rc_mean = stats.mean(release_counts)
        rc_p10 = pct(release_counts, 0.1)
        rc_p50 = pct(release_counts, 0.5)
        rc_p90 = pct(release_counts, 0.9)
        total_releases = sum(release_counts)
        release_distribution = release_count_distribution(release_counts)
        zero_releases = sum(1 for c in release_counts if c == 0)
        print(f"\n[bayes] releases: total={total_releases} "
              f"mean={rc_mean:.2f}/participant  "
              f"p10/p50/p90={rc_p10}/{rc_p50}/{rc_p90}")
        print(f"[bayes] release count distribution: {release_distribution}")
        print(f"[bayes] participants with 0 releases: {zero_releases}")
        print(f"[bayes] framing counts: {dict(framing_counts)}")
        print(f"[bayes] active-regime counts (activation >= 0.5): {dict(active_regime_counts)}")
    else:
        rc_mean = 0.0
        rc_p10 = rc_p50 = rc_p90 = None
        total_releases = 0
        release_distribution = {}

    # Stop conditions
    warnings: list[str] = []
    if contraction_samples and stats.mean(contraction_samples) < 0.1:
        warnings.append(f"contraction mean {stats.mean(contraction_samples):.3f} < 0.1")
    if multiplier_samples:
        n_floor = sum(1 for m in multiplier_samples if abs(m - 0.5) < 1e-9)
        if n_floor / len(multiplier_samples) > 0.5:
            warnings.append(f"{100*n_floor/len(multiplier_samples):.1f}% multipliers at 0.5 floor")
    if exposed_total < 5000:
        warnings.append(f"exposed_total {exposed_total} < 5000")
    if protocol_counts and pc_mean < 3:
        warnings.append(f"protocol mean {pc_mean:.2f} < 3 per participant")
    if protocol_counts and pc_mean > 20:
        warnings.append(f"protocol mean {pc_mean:.2f} > 20 per participant")
    warnings.extend(release_count_warnings(
        release_counts, lower=RELEASE_COUNT_LOWER, upper=RELEASE_COUNT_UPPER,
    ))

    # Positivity stop conditions: >20% suppression rate across all rows, or
    # any single edge with 100% insufficient flag.
    if pos_total > 0:
        suppress_rate = positivity_suppressed / pos_total
        if suppress_rate > 0.20:
            warnings.append(
                f"positivity suppression rate {100*suppress_rate:.1f}% > 20% "
                f"({positivity_suppressed}/{pos_total})"
            )
        fully_suppressed_edges = [
            (ek, total) for ek, rate, _, total in edge_ins_rates
            if rate >= 0.999 and total > 0
        ]
        if fully_suppressed_edges:
            warnings.append(
                f"{len(fully_suppressed_edges)} edge(s) 100% insufficient: "
                f"{', '.join(ek for ek, _ in fully_suppressed_edges[:3])}"
            )

    if warnings:
        print(f"\n[bayes] STOP CONDITION WARNINGS:")
        for w in warnings:
            print(f"  - {w}")
    else:
        print(f"\n[bayes] no stop-condition warnings fired")

    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "engine_version": "v5-biomarker-widened",
        "n_participants": len(participants),
        "supported_pairs": [list(p) for p in supported_pairs],
        "n_supported_pairs": len(supported_pairs),
        "n_wearable_pairs": n_wear,
        "n_biomarker_pairs": n_bio,
        "cohort_rename": COHORT_RENAME,
        "evidence_tier_thresholds": EVIDENCE_TIER_THRESHOLDS,
        "per_pathway_tier": {k: dict(v) for k, v in per_pathway_tier.items()},
        "n_priors": len(priors),
        "prior_provenance_counts": provenance_counts,
        "sigma_weak_frac": SIGMA_WEAK_FRAC,
        "tier_counts": global_tier_counts,
        "exposed_total": exposed_total,
        "contraction_p10_p50_p90_mean": [
            contr_p.get(0.1), contr_p.get(0.5), contr_p.get(0.9),
            stats.mean(contraction_samples) if contraction_samples else None,
        ],
        "multiplier_p10_p50_p90_mean": [
            mult_p.get(0.1), mult_p.get(0.5), mult_p.get(0.9),
            stats.mean(multiplier_samples) if multiplier_samples else None,
        ],
        "direction_conflict_rate": direction_conflicts / max(total_rows, 1),
        "gate_thresholds": {"recommended": GATE_RECOMMENDED, "possible": GATE_POSSIBLE},
        "direction_conflict_discount": DIRECTION_CONFLICT_DISCOUNT,
        "variance_floor_mode": args.variance_floor_mode,
        "mean_scaled_frac": MEAN_SCALED_FRAC if args.variance_floor_mode == "mean_scaled" else None,
        "var_inflation": VAR_INFLATION,
        "per_edge_tier": dict(per_edge_tier),
        "protocol_count_total": total_protocols,
        "protocols_per_participant_mean": float(pc_mean) if protocol_counts else 0.0,
        "protocols_per_participant_p10_p50_p90": (
            [pc_p10, pc_p50, pc_p90] if protocol_counts else [None, None, None]
        ),
        "protocol_option_labels": dict(protocol_option_labels),
        "protocol_action_counts": dict(protocol_action_counts),
        "release_count_total": total_releases,
        "release_count_mean": float(rc_mean) if release_counts else 0.0,
        "release_count_p10_p50_p90": (
            [rc_p10, rc_p50, rc_p90] if release_counts else [None, None, None]
        ),
        "release_count_distribution": release_distribution,
        "release_framing_counts": dict(framing_counts),
        "active_regime_counts": dict(active_regime_counts),
        "positivity": {
            "flag_counts": dict(positivity_flag_counts),
            "total_rows": pos_total,
            "suppressed_rows": positivity_suppressed,
            "capped_rows": positivity_capped,
            "per_edge_insufficient_rate": {
                ek: (counts["insufficient"] / max(sum(counts.values()), 1))
                for ek, counts in per_edge_positivity.items()
            },
        },
        "regime_boost": {
            "multiplier": REGIME_BOOST,
            "threshold": REGIME_ACTIVATION_THRESHOLD,
            "counts": dict(regime_boost_counts),
        },
        "warnings": warnings,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=float))

    print(f"\n[bayes] DONE in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
