"""Per-outcome clinical thresholds for recommendation gating.

Authoritative registry consumed by both the Python export pipeline and
(via codegen) the TypeScript engine (`src/data/dataValue/clinicalThresholds.ts`).

Each outcome has:
  direction        -- "higher" or "lower" (which direction is beneficial)
  min_detectable   -- smallest change considered clinically meaningful
  clinical_low     -- lower edge of normal / desirable range
  clinical_high    -- upper edge of normal / desirable range
  units            -- display units
  source           -- "literature" if min_detectable is literature-anchored,
                      "default_10pct" if imputed from typical value

min_detectable is the single most important field for gating: it's the
threshold that enters `P_meaningful_benefit = Phi((|effect| - min_detectable) / se)`.

Direction maps to `DESIRABLE_DIRECTION` in `reconcile.py`; kept in sync here
so the gating module doesn't import from reconcile (avoids circular deps).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal


Direction = Literal["higher", "lower"]
ThresholdSource = Literal["literature", "default_10pct"]


@dataclass(frozen=True)
class ClinicalThreshold:
    outcome: str
    direction: Direction
    min_detectable: float
    clinical_low: float
    clinical_high: float
    units: str
    source: ThresholdSource

    def as_dict(self) -> dict:
        return asdict(self)


# ── Literature-anchored thresholds ────────────────────────────────
# Sourced from published effect-size and minimum-clinically-important-difference
# references. Values provided by user for v2.5 export.

_LITERATURE: dict[str, float] = {
    "hba1c":            0.3,    # %
    "hrv_daily":        6.0,    # ms RMSSD (5-7 range, midpoint)
    "hscrp":            1.0,    # mg/L
    "apob":            10.0,    # mg/dL
    "vo2_peak":         2.0,    # ml/min/kg
    "ferritin":        10.0,    # ng/mL
    "testosterone":   100.0,    # ng/dL
    "glucose":         10.0,    # mg/dL
    "triglycerides":   20.0,    # mg/dL
    "cortisol":         3.0,    # mcg/dL
    "deep_sleep":      20.0,    # min
    "sleep_efficiency": 5.0,    # %
    "resting_hr":       5.0,    # bpm
    "sleep_quality":    5.0,    # score (0-100 scale)
}


# ── Default typical-value and range lookup ────────────────────────
# For outcomes without literature-anchored MCID, we default to 10% of
# typical value. Typical values mirror `BIOMARKER_PRIORS` / `WEARABLE_PRIORS`
# in `synthetic/config.py` but are duplicated here so clinical_thresholds.py
# stays usable without importing synthetic scaffolding.

_TYPICAL_VALUES: dict[str, tuple[float, float, float, str]] = {
    # outcome: (typical_mean, clinical_low, clinical_high, units)
    "ferritin":             (65.0,   30.0,  300.0,  "ng/mL"),
    "iron_total":           (90.0,   50.0,  175.0,  "mcg/dL"),
    "hemoglobin":           (14.2,   12.0,   17.5, "g/dL"),
    "rbc":                  ( 4.8,    4.0,    5.9, "M/uL"),
    "mcv":                  (88.0,   80.0,   96.0, "fL"),
    "rdw":                  (13.0,   11.5,   14.5, "%"),
    "wbc":                  ( 6.5,    4.0,   11.0, "K/uL"),
    "platelets":            (250.0, 150.0,  400.0, "K/uL"),
    "nlr":                  ( 1.8,    1.0,    3.0, "ratio"),
    "testosterone":         (500.0, 300.0,  900.0, "ng/dL"),
    "cortisol":             (12.0,    5.0,   23.0, "mcg/dL"),
    "estradiol":            (30.0,   10.0,   60.0, "pg/mL"),
    "dhea_s":               (300.0, 140.0,  520.0, "mcg/dL"),
    "shbg":                 (40.0,   20.0,   75.0, "nmol/L"),
    "triglycerides":        (130.0,  40.0,  150.0, "mg/dL"),
    "hdl":                  (55.0,   40.0,   80.0, "mg/dL"),
    "ldl":                  (115.0,  50.0,  130.0, "mg/dL"),
    "total_cholesterol":    (195.0, 125.0,  200.0, "mg/dL"),
    "non_hdl_cholesterol":  (140.0,  60.0,  160.0, "mg/dL"),
    "apob":                 (95.0,   40.0,  100.0, "mg/dL"),
    "hscrp":                ( 1.5,    0.1,    3.0, "mg/L"),
    "glucose":              (92.0,   70.0,   99.0, "mg/dL"),
    "insulin":              ( 8.0,    2.0,   15.0, "uIU/mL"),
    "hba1c":                ( 5.3,    4.2,    5.6, "%"),
    "uric_acid":            ( 5.5,    3.5,    7.2, "mg/dL"),
    "zinc":                 (85.0,   70.0,  120.0, "mcg/dL"),
    "magnesium_rbc":        ( 5.0,    4.2,    6.8, "mg/dL"),
    "homocysteine":         ( 9.0,    4.0,   15.0, "umol/L"),
    "omega3_index":         ( 4.5,    4.0,    8.0, "%"),
    "b12":                  (500.0, 200.0, 1100.0, "pg/mL"),
    "folate":               (12.0,    3.5,   20.0, "ng/mL"),
    "ast":                  (24.0,   10.0,   40.0, "U/L"),
    "alt":                  (22.0,    7.0,   40.0, "U/L"),
    "creatinine":           ( 1.0,    0.6,    1.3, "mg/dL"),
    "albumin":              ( 4.3,    3.5,    5.0, "g/dL"),
    "vo2_peak":             (42.0,   25.0,   70.0, "ml/min/kg"),
    "body_fat_pct":         (22.0,   10.0,   30.0, "%"),
    "body_mass_kg":         (75.0,   50.0,  110.0, "kg"),
    # Wearable-derived
    "hrv_daily":            (50.0,   25.0,   85.0, "ms"),
    "resting_hr":           (62.0,   45.0,   75.0, "bpm"),
    "sleep_efficiency":     (87.0,   80.0,   99.0, "%"),
    "sleep_quality":        (70.0,   40.0,  100.0, "score"),
    "deep_sleep":           (80.0,   40.0,  130.0, "min"),
    # Derived load nodes (outcome-like when user targets them)
    "sleep_debt":           ( 2.0,    0.0,    5.0, "hours"),
    # Regime states (outcomes in their own right when we want to suppress them).
    # typical=0.5 (midpoint of activation range) so min_detectable = 0.10 * 0.5 = 0.05
    # — a ~5pp activation change is the smallest clinically meaningful move.
    # Zero typical would collapse min_detectable to 0 and let tiny numerical
    # residuals trigger "recommended".
    "overreaching_state":       (0.5, 0.0, 0.5, "activation"),
    "iron_deficiency_state":    (0.5, 0.0, 0.5, "activation"),
    "sleep_deprivation_state":  (0.5, 0.0, 0.5, "activation"),
    "inflammation_state":       (0.5, 0.0, 0.5, "activation"),
}


# ── Direction mirror (kept in sync with reconcile.py) ─────────────

_DIRECTION: dict[str, Direction] = {
    # Lower is better
    "cortisol": "lower", "glucose": "lower", "insulin": "lower",
    "hscrp": "lower", "triglycerides": "lower", "ldl": "lower",
    "apob": "lower", "non_hdl_cholesterol": "lower",
    "total_cholesterol": "lower", "uric_acid": "lower",
    "homocysteine": "lower", "resting_hr": "lower",
    "body_fat_pct": "lower", "nlr": "lower",
    "ast": "lower", "alt": "lower", "rdw": "lower",
    "hba1c": "lower", "sleep_debt": "lower",
    "overreaching_state": "lower", "iron_deficiency_state": "lower",
    "sleep_deprivation_state": "lower", "inflammation_state": "lower",
    # Higher is better
    "hdl": "higher", "hrv_daily": "higher", "sleep_quality": "higher",
    "sleep_efficiency": "higher", "deep_sleep": "higher",
    "vo2_peak": "higher", "ferritin": "higher", "hemoglobin": "higher",
    "testosterone": "higher", "albumin": "higher", "rbc": "higher",
    "zinc": "higher", "magnesium_rbc": "higher", "iron_total": "higher",
    "omega3_index": "higher", "b12": "higher", "folate": "higher",
    "dhea_s": "higher",
}

_DEFAULT_DIRECTION: Direction = "higher"


# ── Build the registry ────────────────────────────────────────────

def _build_registry() -> dict[str, ClinicalThreshold]:
    registry: dict[str, ClinicalThreshold] = {}
    for outcome, (typical, low, high, units) in _TYPICAL_VALUES.items():
        if outcome in _LITERATURE:
            min_det = _LITERATURE[outcome]
            source: ThresholdSource = "literature"
        else:
            min_det = 0.10 * typical
            source = "default_10pct"
        registry[outcome] = ClinicalThreshold(
            outcome=outcome,
            direction=_DIRECTION.get(outcome, _DEFAULT_DIRECTION),
            min_detectable=round(min_det, 4),
            clinical_low=low,
            clinical_high=high,
            units=units,
            source=source,
        )
    return registry


CLINICAL_THRESHOLDS: dict[str, ClinicalThreshold] = _build_registry()


def get(outcome: str) -> ClinicalThreshold | None:
    return CLINICAL_THRESHOLDS.get(outcome)


def min_detectable(outcome: str, fallback: float = 0.0) -> float:
    t = CLINICAL_THRESHOLDS.get(outcome)
    return t.min_detectable if t is not None else fallback


def direction(outcome: str) -> Direction:
    t = CLINICAL_THRESHOLDS.get(outcome)
    return t.direction if t is not None else _DEFAULT_DIRECTION


def is_beneficial(outcome: str, effect: float) -> bool:
    d = direction(outcome)
    if d == "lower":
        return effect < -1e-10
    return effect > 1e-10
