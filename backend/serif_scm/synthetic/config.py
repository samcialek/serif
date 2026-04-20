"""
Population priors, cohort definitions, and physiological constants.

All biomarker ranges sourced from clinical reference ranges.
Behavioral distributions calibrated to the Serif fitted edge data
(theta values = typical operating points for the study population).
"""

from dataclasses import dataclass, field

# ── Study design ────────────────────────────────────────────────

N_TOTAL = 1188
PROGRAM_DAYS = 100
BLOOD_DRAW_DAYS = (1, 100)
SEED = 42

# ── Cohorts ─────────────────────────────────────────────────────

@dataclass
class CohortDef:
    name: str
    n: int
    # Adherence: Beta(a, b) parameterization → mean = a/(a+b)
    adherence_alpha: float
    adherence_beta: float
    # Wearable compliance: probability of valid data on any given day
    wearable_compliance: float
    # App logging: probability of logging lifestyle data on a given day
    app_logging_rate: float

COHORTS = [
    CohortDef("cohort_a", 534, adherence_alpha=8.0, adherence_beta=2.5, wearable_compliance=0.92, app_logging_rate=0.75),
    CohortDef("cohort_b", 416, adherence_alpha=7.0, adherence_beta=3.0, wearable_compliance=0.90, app_logging_rate=0.70),
    CohortDef("cohort_c", 238, adherence_alpha=5.5, adherence_beta=3.5, wearable_compliance=0.82, app_logging_rate=0.60),
]

assert sum(c.n for c in COHORTS) == N_TOTAL

# ── Demographics ────────────────────────────────────────────────

AGE_MEAN, AGE_STD = 35, 8
AGE_CLIP = (22, 60)
FEMALE_FRACTION = 0.45

# ── Behavioral baselines (daily units unless noted) ─────────────
# Means calibrated so monthly aggregates fall near the fitted theta values.
# E.g., running theta=153 km/mo → ~5.1 km/day mean.

@dataclass
class BehavioralPrior:
    mean: float
    std: float
    clip_lo: float
    clip_hi: float
    autocorrelation: float  # AR(1) coefficient for daily dynamics
    unit: str = ""

BEHAVIORAL_PRIORS = {
    # Training (daily values; monthly aggregates feed the edges)
    "run_km":          BehavioralPrior(mean=4.5, std=2.5, clip_lo=0, clip_hi=20,  autocorrelation=0.6,  unit="km/day"),
    "training_min":    BehavioralPrior(mean=45,  std=20,  clip_lo=0, clip_hi=180, autocorrelation=0.5,  unit="min/day"),
    "zone2_min":       BehavioralPrior(mean=15,  std=10,  clip_lo=0, clip_hi=90,  autocorrelation=0.4,  unit="min/day"),
    "trimp":           BehavioralPrior(mean=80,  std=40,  clip_lo=0, clip_hi=400, autocorrelation=0.5,  unit="TRIMP/day"),
    "steps":           BehavioralPrior(mean=8500, std=2500, clip_lo=1000, clip_hi=25000, autocorrelation=0.65, unit="steps/day"),
    "active_energy":   BehavioralPrior(mean=450, std=150, clip_lo=50,  clip_hi=1200, autocorrelation=0.55, unit="kcal/day"),
    # Sleep
    "sleep_hrs":       BehavioralPrior(mean=7.0, std=0.7, clip_lo=4.0, clip_hi=9.5, autocorrelation=0.8,  unit="hours"),
    "bedtime_hr":      BehavioralPrior(mean=22.5, std=0.8, clip_lo=20.0, clip_hi=25.0, autocorrelation=0.85, unit="hour"),
    "workout_end_hr":  BehavioralPrior(mean=18.0, std=2.0, clip_lo=6.0,  clip_hi=22.0, autocorrelation=0.7,  unit="hour"),
    # Nutrition
    "protein_g":       BehavioralPrior(mean=80,  std=25,  clip_lo=20,  clip_hi=200, autocorrelation=0.7,  unit="g/day"),
    "energy_kcal":     BehavioralPrior(mean=2200, std=400, clip_lo=1200, clip_hi=4000, autocorrelation=0.7, unit="kcal/day"),
    # Context
    "travel_load":     BehavioralPrior(mean=0.05, std=0.15, clip_lo=0, clip_hi=3.0, autocorrelation=0.3, unit="score"),
}

# ── Blood biomarker population priors ───────────────────────────
# Used for Day 1 sampling and as the "population mean" reference
# for computing SCM deltas.

@dataclass
class BiomarkerPrior:
    mean: float
    std: float
    clip_lo: float
    clip_hi: float
    lab_cv: float  # coefficient of variation for measurement noise
    unit: str = ""
    # Physiological response time constant (days)
    # fast=3, medium=14, slow=45
    tau_days: float = 45.0

BIOMARKER_PRIORS = {
    # Iron / hematology
    "ferritin":     BiomarkerPrior(mean=65,    std=35,   clip_lo=8,    clip_hi=300,  lab_cv=0.05, unit="ng/mL",   tau_days=50),
    "iron_total":   BiomarkerPrior(mean=90,    std=30,   clip_lo=30,   clip_hi=200,  lab_cv=0.06, unit="mcg/dL",  tau_days=30),
    "hemoglobin":   BiomarkerPrior(mean=14.2,  std=1.2,  clip_lo=10,   clip_hi=18,   lab_cv=0.02, unit="g/dL",    tau_days=60),
    "rbc":          BiomarkerPrior(mean=4.8,   std=0.4,  clip_lo=3.5,  clip_hi=6.0,  lab_cv=0.02, unit="M/uL",    tau_days=60),
    "mcv":          BiomarkerPrior(mean=88,    std=5,    clip_lo=75,   clip_hi=100,  lab_cv=0.02, unit="fL",      tau_days=60),
    "rdw":          BiomarkerPrior(mean=13.0,  std=1.0,  clip_lo=11,   clip_hi=17,   lab_cv=0.03, unit="%",       tau_days=45),
    "wbc":          BiomarkerPrior(mean=6.5,   std=1.5,  clip_lo=3.0,  clip_hi=12.0, lab_cv=0.04, unit="K/uL",    tau_days=14),
    "platelets":    BiomarkerPrior(mean=250,   std=50,   clip_lo=150,  clip_hi=400,  lab_cv=0.04, unit="K/uL",    tau_days=45),
    "nlr":          BiomarkerPrior(mean=1.8,   std=0.6,  clip_lo=0.5,  clip_hi=5.0,  lab_cv=0.08, unit="ratio",   tau_days=7),
    # Hormones
    "testosterone": BiomarkerPrior(mean=500,   std=150,  clip_lo=150,  clip_hi=1000, lab_cv=0.08, unit="ng/dL",   tau_days=21),
    "cortisol":     BiomarkerPrior(mean=12,    std=4,    clip_lo=3,    clip_hi=25,   lab_cv=0.10, unit="mcg/dL",  tau_days=14),
    "estradiol":    BiomarkerPrior(mean=30,    std=15,   clip_lo=5,    clip_hi=80,   lab_cv=0.10, unit="pg/mL",   tau_days=21),
    "dhea_s":       BiomarkerPrior(mean=300,   std=100,  clip_lo=50,   clip_hi=600,  lab_cv=0.08, unit="mcg/dL",  tau_days=30),
    "shbg":         BiomarkerPrior(mean=40,    std=15,   clip_lo=10,   clip_hi=100,  lab_cv=0.06, unit="nmol/L",  tau_days=30),
    # Lipids
    "triglycerides": BiomarkerPrior(mean=130,  std=50,   clip_lo=40,   clip_hi=350,  lab_cv=0.05, unit="mg/dL",   tau_days=30),
    "hdl":           BiomarkerPrior(mean=55,   std=14,   clip_lo=25,   clip_hi=100,  lab_cv=0.04, unit="mg/dL",   tau_days=60),
    "ldl":           BiomarkerPrior(mean=115,  std=30,   clip_lo=50,   clip_hi=200,  lab_cv=0.04, unit="mg/dL",   tau_days=45),
    "total_cholesterol": BiomarkerPrior(mean=195, std=35, clip_lo=120, clip_hi=300,  lab_cv=0.03, unit="mg/dL",   tau_days=45),
    "non_hdl_cholesterol": BiomarkerPrior(mean=140, std=30, clip_lo=60, clip_hi=220, lab_cv=0.04, unit="mg/dL",   tau_days=45),
    "apob":          BiomarkerPrior(mean=95,   std=25,   clip_lo=40,   clip_hi=180,  lab_cv=0.05, unit="mg/dL",   tau_days=45),
    # Inflammation
    "hscrp":         BiomarkerPrior(mean=1.5,  std=1.5,  clip_lo=0.1,  clip_hi=12,   lab_cv=0.08, unit="mg/L",    tau_days=14),
    # Metabolic
    "glucose":       BiomarkerPrior(mean=92,   std=12,   clip_lo=65,   clip_hi=150,  lab_cv=0.03, unit="mg/dL",   tau_days=30),
    "insulin":       BiomarkerPrior(mean=8,    std=4,    clip_lo=2,    clip_hi=30,   lab_cv=0.10, unit="uIU/mL",  tau_days=30),
    "hba1c":         BiomarkerPrior(mean=5.3,  std=0.4,  clip_lo=4.2,  clip_hi=7.0,  lab_cv=0.03, unit="%",       tau_days=90),
    "uric_acid":     BiomarkerPrior(mean=5.5,  std=1.5,  clip_lo=2.5,  clip_hi=9.0,  lab_cv=0.04, unit="mg/dL",   tau_days=30),
    # Micronutrients
    "zinc":          BiomarkerPrior(mean=85,   std=15,   clip_lo=50,   clip_hi=130,  lab_cv=0.06, unit="mcg/dL",  tau_days=30),
    "magnesium_rbc": BiomarkerPrior(mean=5.0,  std=0.8,  clip_lo=3.5,  clip_hi=7.0,  lab_cv=0.05, unit="mg/dL",   tau_days=45),
    "homocysteine":  BiomarkerPrior(mean=9,    std=3,    clip_lo=4,    clip_hi=20,   lab_cv=0.06, unit="umol/L",  tau_days=30),
    "omega3_index":  BiomarkerPrior(mean=4.5,  std=1.5,  clip_lo=1.5,  clip_hi=12,   lab_cv=0.05, unit="%",       tau_days=60),
    "b12":           BiomarkerPrior(mean=500,  std=200,  clip_lo=150,  clip_hi=1200, lab_cv=0.08, unit="pg/mL",   tau_days=60),
    "folate":        BiomarkerPrior(mean=12,   std=5,    clip_lo=3,    clip_hi=30,   lab_cv=0.08, unit="ng/mL",   tau_days=45),
    # Liver / kidney
    "ast":           BiomarkerPrior(mean=24,   std=8,    clip_lo=10,   clip_hi=60,   lab_cv=0.06, unit="U/L",     tau_days=14),
    "alt":           BiomarkerPrior(mean=22,   std=8,    clip_lo=7,    clip_hi=55,   lab_cv=0.06, unit="U/L",     tau_days=14),
    "creatinine":    BiomarkerPrior(mean=1.0,  std=0.2,  clip_lo=0.5,  clip_hi=1.5,  lab_cv=0.04, unit="mg/dL",   tau_days=14),
    "albumin":       BiomarkerPrior(mean=4.3,  std=0.3,  clip_lo=3.5,  clip_hi=5.5,  lab_cv=0.03, unit="g/dL",    tau_days=30),
    # Fitness
    "vo2_peak":      BiomarkerPrior(mean=42,   std=10,   clip_lo=20,   clip_hi=70,   lab_cv=0.03, unit="ml/min/kg", tau_days=45),
    "body_fat_pct":  BiomarkerPrior(mean=22,   std=6,    clip_lo=8,    clip_hi=40,   lab_cv=0.05, unit="%",       tau_days=45),
    "body_mass_kg":  BiomarkerPrior(mean=75,   std=12,   clip_lo=45,   clip_hi=130,  lab_cv=0.01, unit="kg",      tau_days=30),
}

# ── Wearable priors (daily observed values, not blood) ──────────

WEARABLE_PRIORS = {
    "hrv_daily":        BiomarkerPrior(mean=50,   std=15,  clip_lo=10,  clip_hi=120,  lab_cv=0.0, unit="ms",   tau_days=3),
    "resting_hr":       BiomarkerPrior(mean=62,   std=7,   clip_lo=40,  clip_hi=90,   lab_cv=0.0, unit="bpm",  tau_days=5),
    "sleep_efficiency": BiomarkerPrior(mean=87,   std=5,   clip_lo=60,  clip_hi=99,   lab_cv=0.0, unit="%",    tau_days=3),
    "sleep_quality":    BiomarkerPrior(mean=70,   std=12,  clip_lo=20,  clip_hi=100,  lab_cv=0.0, unit="score", tau_days=3),
    "deep_sleep":       BiomarkerPrior(mean=80,   std=20,  clip_lo=10,  clip_hi=150,  lab_cv=0.0, unit="min",  tau_days=3),
}

# ── Dose column mapping ─────────────────────────────────────────
# Maps edge source column → how to compute the dose from daily behavioral data.
# "monthly_sum" means sum last 30 days of the daily behavioral var.
# "daily" means use the current day's value directly.
# "derived" means computed from other variables (ACWR, sleep debt, etc.)
# "biomarker" means use the current biomarker state (for biomarker-as-dose edges).

@dataclass
class DoseSpec:
    behavioral_var: str  # key in daily behavioral dict
    aggregation: str     # "monthly_sum", "daily", "derived", "biomarker"

DOSE_COLUMN_MAP: dict[str, DoseSpec] = {
    "daily_run_km":           DoseSpec("run_km",         "monthly_sum"),
    "daily_duration_min":     DoseSpec("training_min",   "monthly_sum"),
    "daily_zone2_min":        DoseSpec("zone2_min",      "monthly_sum"),
    "daily_trimp":            DoseSpec("trimp",          "daily"),
    "steps":                  DoseSpec("steps",          "daily"),
    "active_energy_kcal":     DoseSpec("active_energy",  "daily"),
    "sleep_duration_hrs":     DoseSpec("sleep_hrs",      "daily"),
    "bedtime_hour":           DoseSpec("bedtime_hr",     "daily"),
    "last_workout_end_hour":  DoseSpec("workout_end_hr", "daily"),
    "sleep_debt_14d":         DoseSpec("sleep_debt",     "derived"),
    "acwr":                   DoseSpec("acwr",           "derived"),
    "training_consistency":   DoseSpec("consistency",    "derived"),
    "travel_load":            DoseSpec("travel_load",    "daily"),
    "dietary_protein_g":      DoseSpec("protein_g",      "daily"),
    "dietary_energy_kcal":    DoseSpec("energy_kcal",    "daily"),
    # Biomarker-as-dose edges (use current biomarker state)
    "ferritin_smoothed":      DoseSpec("ferritin",       "biomarker"),
    "omega3_index_derived":   DoseSpec("omega3_index",   "biomarker"),
    "homocysteine_smoothed":  DoseSpec("homocysteine",   "biomarker"),
    # Regime activation sources (use current biomarker or derived state)
    "ferritin":               DoseSpec("ferritin",       "biomarker"),
    "hscrp":                  DoseSpec("hscrp",          "biomarker"),
    "sleep_debt":             DoseSpec("sleep_debt",     "derived"),
    # Regime node outputs (use regime activation state)
    "overreaching_state":       DoseSpec("overreaching_state",       "biomarker"),
    "iron_deficiency_state":    DoseSpec("iron_deficiency_state",    "biomarker"),
    "sleep_deprivation_state":  DoseSpec("sleep_deprivation_state",  "biomarker"),
    "inflammation_state":       DoseSpec("inflammation_state",       "biomarker"),
}

# ── Target column → biomarker mapping ───────────────────────────
# Maps edge target column names to our biomarker/wearable keys.

TARGET_COLUMN_MAP: dict[str, str] = {
    "iron_total_smoothed":           "iron_total",
    "ferritin_smoothed":             "ferritin",
    "hemoglobin_smoothed":           "hemoglobin",
    "testosterone_smoothed":         "testosterone",
    "cortisol_smoothed":             "cortisol",
    "triglycerides_smoothed":        "triglycerides",
    "hdl_smoothed":                  "hdl",
    "ldl_smoothed":                  "ldl",
    "hscrp_smoothed":                "hscrp",
    "resting_hr_7d_mean":            "resting_hr",
    "vo2_peak_smoothed":             "vo2_peak",
    "sleep_efficiency_pct":          "sleep_efficiency",
    "sleep_quality_score":           "sleep_quality",
    "deep_sleep_min":                "deep_sleep",
    "hrv_daily_mean":                "hrv_daily",
    "resting_hr":                    "resting_hr",
    "hrv_7d_mean":                   "hrv_daily",
    "body_fat_pct":                  "body_fat_pct",
    "body_mass_kg":                  "body_mass_kg",
    "rbc_smoothed":                  "rbc",
    "mcv_smoothed":                  "mcv",
    "rdw_smoothed":                  "rdw",
    "ast_smoothed":                  "ast",
    "alt_smoothed":                  "alt",
    "apob_smoothed":                 "apob",
    "non_hdl_cholesterol_smoothed":  "non_hdl_cholesterol",
    "total_cholesterol_smoothed":    "total_cholesterol",
    "glucose_smoothed":              "glucose",
    "insulin_smoothed":              "insulin",
    "uric_acid_smoothed":            "uric_acid",
    "wbc_smoothed":                  "wbc",
    "nlr":                           "nlr",
    "zinc_smoothed":                 "zinc",
    "magnesium_rbc_smoothed":        "magnesium_rbc",
    "dhea_s_smoothed":               "dhea_s",
    "shbg_smoothed":                 "shbg",
    "homocysteine_smoothed":         "homocysteine",
    "creatinine_smoothed":           "creatinine",
    "estradiol_smoothed":            "estradiol",
    "platelets_smoothed":            "platelets",
    "albumin_smoothed":              "albumin",
    # Regime activation targets
    "overreaching_state":            "overreaching_state",
    "iron_deficiency_state":         "iron_deficiency_state",
    "sleep_deprivation_state":       "sleep_deprivation_state",
    "inflammation_state":            "inflammation_state",
    # Regime downstream targets (direct node name as target, no "_smoothed" suffix)
    "hscrp":                         "hscrp",
    "cortisol":                      "cortisol",
    "testosterone":                  "testosterone",
    "hrv_daily":                     "hrv_daily",
    "hemoglobin":                    "hemoglobin",
    "vo2_peak":                      "vo2_peak",
    "rbc":                           "rbc",
    "glucose":                       "glucose",
    "hdl":                           "hdl",
    "insulin":                       "insulin",
}

# ── Adherence decay ─────────────────────────────────────────────

ADHERENCE_DECAY_HALFLIFE_DAYS = 200  # gentle decay for motivated study participants
ADHERENCE_FLOOR = 0.40               # motivated population doesn't drop below 40%
BEHAVIORAL_ADAPTATION_DAYS = 14      # days to reach ~63% of recommended change
