"""Literature-derived measurement SDs for biomarkers and wearables.

Values come from `serif_measurement_model.md` memory file (pre-analytical +
analytical + short-term biological variation). They represent the irreducible
measurement noise floor — the causal model cannot explain residual variance
below this level, so `sigma_obs` should be informed by them rather than
fitted from a diffuse HalfNormal.

Two parameterizations are supported:

- `proportional`: SD scales with the observation — for many biomarkers the
  coefficient of variation is roughly constant (e.g. ferritin 20% CV). The
  `value` field is the proportional CV (σ / |μ|).
- `absolute`: SD in the outcome's native units (e.g. deep sleep minutes).
  The `value` field is the absolute SD in those units.

Both are consumed downstream as a LogNormal prior on `sigma_obs` centered on
the outcome-mean-scaled SD, with a modest log-sigma (0.2) leaving some room
for model-misspecification variance on top.
"""

from __future__ import annotations

from typing import Literal

# ── Registry ──────────────────────────────────────────────────────────

MeasurementKind = Literal["proportional", "absolute"]


MEASUREMENT_SD: dict[str, tuple[MeasurementKind, float]] = {
    # ── Blood biomarkers (CV = pre-analytical + analytical + biological) ──
    "hba1c":          ("proportional", 0.025),
    "ferritin":       ("proportional", 0.20),
    "iron_total":     ("proportional", 0.25),
    "hscrp":          ("proportional", 0.45),
    "apob":           ("proportional", 0.08),
    "testosterone":   ("proportional", 0.15),
    "cortisol":       ("proportional", 0.20),   # lit range 15-25%
    "triglycerides":  ("proportional", 0.20),
    "ldl":            ("proportional", 0.07),
    "hdl":            ("proportional", 0.07),
    "cholesterol":    ("proportional", 0.06),
    "hemoglobin":     ("proportional", 0.04),
    "homocysteine":   ("proportional", 0.10),   # analytical ~4%, biol ~8%
    "omega3_index":   ("proportional", 0.08),   # fatty-acid assay CV

    # ── Wearable metrics ──
    "hrv_daily":      ("proportional", 0.07),   # Oura nocturnal RMSSD
    "rhr_daily":      ("proportional", 0.02),   # Oura nocturnal RHR
    "total_sleep":    ("absolute",    0.25),    # ~15 min in hours
    "deep_sleep":     ("absolute",    0.42),    # ~25 min in hours
    "rem_sleep":      ("absolute",    0.42),
    "sleep_quality":  ("proportional", 0.10),   # composite score, estimated
    "vo2_peak":       ("proportional", 0.05),   # Apple/Garmin vs lab
    "steps":          ("proportional", 0.08),   # wrist-worn CV

    # ── Self-logged / derived ──
    "resting_hr":     ("proportional", 0.03),
}


def lookup_measurement_sd(
    outcome: str,
    outcome_mean: float,
) -> float | None:
    """Return the measurement SD in the outcome's native units, or None if
    the outcome isn't in the registry (caller should fall back to the
    uninformed HalfNormal prior).

    `outcome_mean` is used only to convert proportional CVs into native-unit
    SDs. Pass the population mean of the outcome as computed by the fit
    pipeline.
    """
    entry = MEASUREMENT_SD.get(outcome.lower())
    if entry is None:
        return None
    kind, value = entry
    if kind == "proportional":
        return float(abs(outcome_mean) * value)
    return float(value)
