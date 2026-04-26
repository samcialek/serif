"""Extract real biomarker / lab observations from Caspian's PDF lab reports.

Reads the 13 PDF files in
    Oron Afek - Health Data-20260426T143958Z-3-001/Oron Afek - Health Data/

and produces a per-observation CSV at backend/data/caspian_labs_pdf.csv.

Strategy
--------
1. Try direct text extraction with pdfplumber. The 7 "Lab Results of Record*"
   PDFs (Quest / Health Gorilla) are text-based and parse cleanly.
2. If text extraction yields effectively-empty pages, fall back to
   pytesseract OCR via pdf2image. The 6 "BRN..." PDFs are scanned images
   from an Israeli sports-medicine clinic (MEDIX) and most are spirometry,
   ECG, body-composition reports rather than blood labs — they typically
   yield zero biomarker rows but we run OCR on them anyway in case any do.
3. For each PDF, walk the lines. When a line introduces a new draw date via
   a "Collected: MM/DD/YYYY ..." pattern, track it as the current section
   date. For each subsequent lab line, parse out:
       label (everything up to the first pure-numeric token)
       value (the first pure-numeric token)
       H/L flag (optional, the token immediately after the value)
       unit  (the first letter-bearing token after the value, skipping
              reference ranges and threshold tokens like '<200', '50-180')
   Then map the label substring-wise to an engine biomarker. The Quest
   reports also include a "Previous Result" column on most rows in the form
       value MM/DD/YYYY
   so we capture an additional observation when those tokens are present.
4. Dedupe by (date, biomarker, value, unit) to collapse the duplicate
   "summary table" view that the Quest PDFs include after the dated
   results section.

Run:
    python -m backend.serif_scm.extract_caspian_labs_pdf
"""
from __future__ import annotations

import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]

PDF_DIR = (
    REPO_ROOT
    / "Oron Afek - Health Data-20260426T143958Z-3-001"
    / "Oron Afek - Health Data"
)

OUTPUT_CSV = REPO_ROOT / "backend" / "data" / "caspian_labs_pdf.csv"

# Tesseract on Windows isn't usually on PATH; point pytesseract at the
# default install location if it's there.
TESSERACT_CANDIDATES = [
    Path(r"C:/Program Files/Tesseract-OCR/tesseract.exe"),
    Path(r"C:/Program Files (x86)/Tesseract-OCR/tesseract.exe"),
]


# ---------------------------------------------------------------------------
# Engine-biomarker mapping
# ---------------------------------------------------------------------------
#
# Lower-case substring rules. Order matters — more-specific keys first so
# e.g. "hemoglobin a1c" maps to hba1c rather than hemoglobin, and
# "iron sat" maps to iron_saturation rather than iron_total.
# ---------------------------------------------------------------------------

# Two kinds of rules:
#   - "substring" rules apply to the lower-cased label and require a literal
#     substring match. Used for distinctive multi-word names.
#   - "word" rules require the term to appear as a *whole word* in the label
#     (regex \\b...\\b), so e.g. "ldl" doesn't match "MAGNESIUM, RBC" via "rbc"
#     in some other word, and "iron" doesn't match "IRON BINDING" because we
#     gate "iron" behind a label-shape check (see DENY_LABELS below).
#
# Order is significant: more-specific rules first. The first rule that matches
# wins. A None target means "consume this match but emit nothing" — used to
# suppress labels that we *recognize* but don't want to map to any biomarker
# (e.g. MCHC, which is similar to MCH but not in the engine mapping).
#
# kind: "sub" = substring match, "word" = whole-word match.

NAME_TO_ENGINE: list[tuple[str, str, str | None]] = [
    # ---------- A1c (must come before "hemoglobin") ----------
    ("sub",  "hemoglobin a1c",                "hba1c"),
    ("word", "hba1c",                         "hba1c"),
    ("word", "a1c",                           "hba1c"),

    # ---------- Iron family ----------
    # Be careful: TIBC ("IRON BINDING") is a *different* analyte than serum
    # iron. We allow only specific iron-row labels.
    ("sub",  "% saturation",                  "iron_saturation"),
    ("sub",  "saturation %",                  "iron_saturation"),
    ("sub",  "iron sat",                      "iron_saturation"),
    ("word", "tsat",                          "iron_saturation"),
    ("word", "ferritin",                      "ferritin"),
    ("sub",  "iron, total",                   "iron_total"),
    ("sub",  "iron total",                    "iron_total"),
    # NOTE: bare "iron" must NOT fire on "IRON BINDING"/"TIBC" — handled
    # via DENY_LABEL_SUBSTRINGS below.
    ("word", "iron",                          "iron_total"),

    # ---------- CRP family ----------
    ("sub",  "hs-crp",                        "hscrp"),
    ("sub",  "hs crp",                        "hscrp"),
    ("sub",  "hscrp",                         "hscrp"),
    ("sub",  "high sensitivity c-reactive",   "hscrp"),
    ("sub",  "high-sensitivity c-reactive",   "hscrp"),
    ("sub",  "c-reactive protein",            "crp"),
    ("sub",  "c reactive protein",            "crp"),

    # ---------- Lipids ----------
    ("sub",  "apolipoprotein b",              "apob"),
    ("sub",  "apo b",                         "apob"),
    ("word", "apob",                          "apob"),
    ("sub",  "ldl-cholesterol",               "ldl"),
    ("sub",  "ldl cholesterol",               "ldl"),
    # Bare "ldl" gated below by DENY_LABEL_SUBSTRINGS so NMR sub-fractions
    # ("LDL PARTICLE", "LDL SMALL", "LDL PEAK SIZE") don't false-positive.
    ("word", "ldl",                           "ldl"),
    ("sub",  "hdl cholesterol",               "hdl"),
    ("sub",  "hdl-cholesterol",               "hdl"),
    ("word", "hdl",                           "hdl"),
    ("sub",  "total cholesterol",             "total_cholesterol"),
    ("sub",  "cholesterol, total",            "total_cholesterol"),
    ("sub",  "cholesterol total",             "total_cholesterol"),
    ("sub",  "triglycerides",                 "triglycerides"),
    # Avoid false-matching "trig" inside other words; require word boundary.
    ("word", "trig",                          "triglycerides"),

    # ---------- Vitamins ----------
    ("sub",  "vitamin d",                     "vitamin_d"),
    ("sub",  "25-oh",                         "vitamin_d"),
    ("sub",  "25(oh)",                        "vitamin_d"),
    ("sub",  "25 hydroxy",                    "vitamin_d"),
    ("sub",  "vitamin b12",                   "b12"),
    ("word", "b12",                           "b12"),
    ("word", "folate",                        "folate"),
    ("sub",  "folic acid",                    "folate"),

    # ---------- Thyroid ----------
    ("sub",  "thyrotropin",                   "tsh"),
    ("word", "tsh",                           "tsh"),

    # ---------- Hormones ----------
    # Free testosterone disambiguation also happens by unit (pg/mL vs ng/dL)
    # in map_to_engine_biomarker, so the substring rules here are a backup.
    ("sub",  "free testosterone",             "free_t"),
    ("sub",  "testosterone, free",            "free_t"),
    ("sub",  "testosterone free",             "free_t"),
    ("sub",  "dhea-s",                        "dhea_s"),
    ("sub",  "dhea sulfate",                  "dhea_s"),
    ("sub",  "dheas",                         "dhea_s"),
    ("sub",  "testosterone",                  "testosterone"),
    ("sub",  "estradiol",                     "estradiol"),
    ("word", "shbg",                          "shbg"),
    ("sub",  "sex hormone binding",           "shbg"),
    ("sub",  "cortisol",                      "cortisol"),

    # ---------- Liver / metabolic ----------
    ("word", "ggt",                           "ggt"),
    ("word", "alt",                           "alt"),
    ("word", "sgpt",                          "alt"),
    ("word", "ast",                           "ast"),
    ("word", "sgot",                          "ast"),
    ("sub",  "creatinine",                    "creatinine"),
    ("sub",  "uric acid",                     "uric_acid"),
    ("sub",  "homocysteine",                  "homocysteine"),
    ("sub",  "urea nitrogen",                 "bun"),
    ("sub",  "blood urea",                    "bun"),
    ("word", "bun",                           "bun"),

    # ---------- CBC ----------
    ("sub",  "hemoglobin",                    "hemoglobin"),
    ("word", "hgb",                           "hemoglobin"),
    ("sub",  "hematocrit",                    "hematocrit"),
    ("word", "hct",                           "hematocrit"),
    # MCHC is recognised but intentionally unmapped (engine doesn't track it)
    # — listed so it doesn't fall through to the "mch" rule.
    ("word", "mchc",                          None),
    ("word", "mch",                           "mch"),
    ("word", "mcv",                           "mcv"),
    ("word", "rdw",                           "rdw"),
    ("sub",  "platelet",                      "platelets"),
    ("word", "plt",                           "platelets"),
    ("sub",  "white blood",                   "wbc"),
    ("word", "wbc",                           "wbc"),
    ("sub",  "red blood",                     "rbc"),
    # Bare "rbc" must NOT fire on "MAGNESIUM, RBC" (erythrocyte magnesium
    # is its own analyte) — handled via DENY_LABEL_SUBSTRINGS.
    ("word", "rbc",                           "rbc"),

    # ---------- Glycemic ----------
    ("sub",  "insulin",                       "insulin"),
    ("sub",  "glucose",                       "glucose"),

    # ---------- Coagulation ----------
    ("word", "inr",                           "inr"),
    ("word", "ptt",                           "ptt"),

    # ---------- Minerals ----------
    ("word", "zinc",                          "zinc"),
]


# Labels containing any of these substrings are NOT eligible for biomarker
# mapping — they refer to derived values, sub-fractions, or different
# analytes that share words with the canonical biomarker name.
DENY_LABEL_SUBSTRINGS: tuple[str, ...] = (
    "iron binding",          # TIBC, not serum iron
    "magnesium, rbc",        # erythrocyte magnesium, not RBC count
    "magnesium rbc",
    "ldl particle",          # NMR LipoProfile sub-fractions
    "ldl small",
    "ldl medium",
    "ldl peak",
    "hdl large",             # NMR sub-fraction
    "hdl small",
    "hdl medium",
    "non hdl",               # non-HDL-C, a derived value (not HDL itself)
    "non-hdl",
    "chol/hdlc ratio",       # ratio, not HDL
    "cholesterol/hdl",
    "bun/creatinine",        # ratio, not creatinine
    "creatinine ratio",      # urine albumin/creatinine etc
    "albumin/globulin",
    "thyroid peroxidase",    # antibody, not TSH
    "thyroglobulin",
    "none seen",             # urinalysis qualitative line; the value parsed
                              # is just the threshold "5"
    "particle number",
    "small particle",
    "specimen:",             # report metadata noise
    "client #",
    "patient id",
    "lab ref",
)


# Suspect-unit denylist: a "real" lab value of these biomarkers should not
# carry these units. Used to reject obviously-wrong rows like a urinalysis
# RBC/WBC count in /HPF (cells per high-power field), which is a different
# measurement than the CBC blood count.
SUSPECT_UNITS_FOR: dict[str, frozenset[str]] = {
    "rbc":  frozenset({"/hpf", "hpf", "mg/dl"}),       # mg/dL is RBC magnesium
    "wbc":  frozenset({"/hpf", "hpf"}),
    "hdl":  frozenset({"angstrom", "mi", "calc"}),     # ratio noise / NMR sizes
    "ldl":  frozenset({"angstrom", "nmol/l"}),         # nmol/L = particle count
    "hba1c": frozenset(),
}


# Whitelist of accepted lab-unit shapes. A row is rejected if its unit (after
# normalisation) doesn't match this set. This filters out lines like
#   "circulating triglycerides by about 7-10% within"
# whose first numeric token gets parsed as a value but whose follow-up token
# is an English word like "to" or "and" rather than a real unit.
ACCEPTED_UNIT_LOWERS: frozenset[str] = frozenset({
    "mg/dl", "mg/l", "g/dl", "g/l",
    "ng/dl", "ng/ml", "pg/ml", "pg/dl",
    "mcg/dl", "ug/dl", "mcg/l", "ug/l",
    "miu/l", "uiu/ml", "miu/ml",
    "iu/l", "iu/ml",
    "u/l", "u/ml",
    "umol/l", "nmol/l",
    "mmol/l",
    "thousand/ul", "million/ul",
    "fl", "pg", "%",
    "mosm/kg",
    "ratio",
})


# Per-biomarker plausible-value windows. A row is rejected if its value is
# outside the window for its biomarker. Conservative bounds — wide enough to
# admit any clinically interesting value, narrow enough to filter out
# obvious extraction junk like an order-code (92888) accidentally paired with
# vitamin_d.
PLAUSIBLE_VALUE_RANGES: dict[str, tuple[float, float]] = {
    "ferritin":          (1.0, 5000.0),       # ng/mL
    "iron_total":        (5.0, 1000.0),       # mcg/dL
    "iron_saturation":   (0.5, 100.0),        # %
    "hemoglobin":        (5.0, 25.0),         # g/dL
    "hematocrit":        (15.0, 65.0),        # %
    "rbc":               (1.0, 10.0),         # Million/uL
    "mcv":               (50.0, 130.0),       # fL
    "mch":               (15.0, 50.0),        # pg
    "rdw":               (8.0, 30.0),         # %
    "wbc":               (1.0, 50.0),         # Thousand/uL
    "platelets":         (20.0, 1000.0),      # Thousand/uL
    "hscrp":             (0.0, 50.0),         # mg/L
    "crp":               (0.0, 100.0),        # mg/L
    "glucose":           (30.0, 600.0),       # mg/dL
    "insulin":           (0.1, 300.0),        # uIU/mL
    "hba1c":             (3.0, 15.0),         # %
    "ldl":               (10.0, 400.0),       # mg/dL
    "hdl":               (10.0, 200.0),       # mg/dL
    "total_cholesterol": (50.0, 500.0),       # mg/dL
    "triglycerides":     (10.0, 5000.0),      # mg/dL
    "apob":              (10.0, 300.0),       # mg/dL
    "testosterone":      (50.0, 2000.0),      # ng/dL
    "free_t":            (1.0, 500.0),        # pg/mL
    "estradiol":         (1.0, 1000.0),       # pg/mL
    "shbg":              (5.0, 200.0),        # nmol/L
    "dhea_s":            (10.0, 1000.0),      # mcg/dL
    "cortisol":          (0.5, 60.0),         # mcg/dL
    "vitamin_d":         (3.0, 200.0),        # ng/mL
    "tsh":               (0.05, 50.0),        # mIU/L
    "alt":               (1.0, 500.0),        # U/L
    "ast":               (1.0, 500.0),        # U/L
    "ggt":               (1.0, 500.0),        # U/L
    "creatinine":        (0.2, 10.0),         # mg/dL
    "uric_acid":         (1.0, 15.0),         # mg/dL
    "homocysteine":      (1.0, 100.0),        # umol/L
    "zinc":              (20.0, 300.0),       # mcg/dL
    "b12":               (50.0, 5000.0),      # pg/mL
    "folate":            (0.5, 50.0),         # ng/mL
    "bun":               (1.0, 100.0),        # mg/dL
    "inr":               (0.5, 10.0),
    "ptt":               (10.0, 200.0),       # seconds
}


# Engine biomarkers we recognize — used to validate disambiguation outputs.
ENGINE_BIOMARKERS: set[str] = {
    "ferritin", "iron_total", "iron_saturation", "hemoglobin", "hematocrit",
    "rbc", "mcv", "mch", "rdw", "wbc", "platelets", "hscrp", "crp",
    "glucose", "insulin", "hba1c", "ldl", "hdl", "total_cholesterol",
    "triglycerides", "apob", "testosterone", "cortisol", "vitamin_d", "tsh",
    "alt", "ast", "creatinine", "uric_acid", "homocysteine", "zinc", "b12",
    "folate", "estradiol", "shbg", "dhea_s", "free_t", "ggt", "bun",
    "ptt", "inr",
}


# ---------------------------------------------------------------------------
# Line-level parsing helpers
# ---------------------------------------------------------------------------

NUMERIC_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
DATE_MDY_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b")
COLLECTED_RE = re.compile(
    r"Collected:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", re.IGNORECASE
)
RANGE_TOKEN_RE = re.compile(r"^[<>]?\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?$")
SKIP_TOKENS = {"<", ">", "=", "or", "OR", "See", "see", "Note:", "note:"}
UNIT_TOKEN_RE = re.compile(r"^[A-Za-z%][A-Za-z%0-9/.()²³^-]*$")


def parse_mdy_to_iso(month: str, day: str, year: str) -> str | None:
    """Convert MM/DD/YYYY (or MM/DD/YY) to ISO YYYY-MM-DD."""
    try:
        m = int(month)
        d = int(day)
        y = int(year)
    except ValueError:
        return None
    if y < 100:
        # Two-digit year — assume 20xx for 00-49, 19xx for 50-99.
        y = 2000 + y if y < 50 else 1900 + y
    if not (1 <= m <= 12 and 1 <= d <= 31 and 1900 <= y <= 2100):
        return None
    return f"{y:04d}-{m:02d}-{d:02d}"


def find_collected_date(line: str) -> str | None:
    m = COLLECTED_RE.search(line)
    if not m:
        return None
    return parse_mdy_to_iso(m.group(1), m.group(2), m.group(3))


def normalize_unit(unit: str | None) -> str:
    """Canonicalise common unit variants so dedupe collapses equivalent rows.

    Quest sometimes formats counts as "Thousand" and elsewhere as
    "Thousand/uL" for the same measurement; we treat them as equivalent.
    """
    if not unit:
        return ""
    u = unit.strip()
    low = u.lower()
    if low in {"thousand", "thousand/ul"}:
        return "Thousand/uL"
    if low in {"million", "million/ul"}:
        return "Million/uL"
    return u


def is_unit_token(tok: str) -> bool:
    """Heuristic: token looks like a unit (e.g. mg/dL, ng/mL, U/L, %, fL)."""
    if not tok:
        return False
    if NUMERIC_RE.fullmatch(tok):
        return False
    if RANGE_TOKEN_RE.fullmatch(tok):
        return False
    if tok in SKIP_TOKENS:
        return False
    # Has a slash and at least one letter -> likely a compound unit.
    if "/" in tok and re.search(r"[A-Za-z]", tok):
        return True
    # Pure-letter (with maybe % or paren) tokens up to ~10 chars.
    if UNIT_TOKEN_RE.fullmatch(tok) and len(tok) <= 12:
        return True
    return False


def parse_lab_line(line: str) -> tuple[str, float, str | None, str | None,
                                       float | None, str | None] | None:
    """Parse a single lab-result line.

    Returns (label, value, flag, unit, prev_value, prev_date_iso) or None
    if the line doesn't look like a lab row.
    """
    tokens = line.split()
    if len(tokens) < 2:
        return None

    # Find the first pure-numeric token — that's the value.
    val_idx: int | None = None
    for i, t in enumerate(tokens):
        if NUMERIC_RE.fullmatch(t):
            val_idx = i
            break
    if val_idx is None or val_idx == 0:
        return None

    label = " ".join(tokens[:val_idx])
    try:
        value = float(tokens[val_idx])
    except ValueError:
        return None

    j = val_idx + 1
    flag: str | None = None
    if j < len(tokens) and tokens[j] in ("H", "L"):
        flag = tokens[j]
        j += 1

    # Walk forward looking for a unit token. Skip ranges, thresholds, and
    # sentinel words. Stop on the first unit-shaped token.
    unit: str | None = None
    k = j
    while k < len(tokens):
        t = tokens[k]
        if NUMERIC_RE.fullmatch(t):
            k += 1
            continue
        if RANGE_TOKEN_RE.fullmatch(t):
            k += 1
            continue
        if t in SKIP_TOKENS:
            k += 1
            continue
        if is_unit_token(t):
            unit = t
            break
        k += 1

    # After the unit, look for "previous result" pattern: a numeric value
    # optionally followed by H/L, optionally followed by MM/DD/YYYY.
    prev_value: float | None = None
    prev_date: str | None = None
    if unit is not None:
        kk = k + 1
        # Skip composite-unit tokens like "(calc)" right after the unit.
        while kk < len(tokens) and tokens[kk] in ("(calc)", "of", "total", "Hgb"):
            kk += 1
        if kk < len(tokens) and NUMERIC_RE.fullmatch(tokens[kk]):
            try:
                prev_value = float(tokens[kk])
            except ValueError:
                prev_value = None
            kk += 1
            # Optional H/L flag on prev value.
            if kk < len(tokens) and tokens[kk] in ("H", "L"):
                kk += 1
            # Then a MM/DD/YYYY date.
            if kk < len(tokens):
                m = DATE_MDY_RE.search(tokens[kk])
                if m:
                    prev_date = parse_mdy_to_iso(m.group(1), m.group(2), m.group(3))

    return (label, value, flag, unit, prev_value, prev_date)


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def _word_match(needle: str, haystack: str) -> bool:
    """True iff `needle` appears as a whole word in `haystack`.

    Both inputs should already be lowercased. Word boundaries are computed
    against any non-alphanumeric character.
    """
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(needle)}(?![A-Za-z0-9])",
                     haystack) is not None


def map_to_engine_biomarker(label: str, unit: str | None) -> str | None:
    """Apply mapping rules; return engine biomarker name or None.

    Filters out:
      - labels matching any DENY_LABEL_SUBSTRINGS (different analytes that
        share words with canonical biomarker names)
      - mapped biomarkers whose unit is in SUSPECT_UNITS_FOR (e.g. urinalysis
        cells/HPF being misread as a CBC count)
    """
    haystack = label.lower().strip()
    if not haystack:
        return None

    # Reject denylisted labels (TIBC, NMR sub-fractions, ratios, etc).
    for needle in DENY_LABEL_SUBSTRINGS:
        if needle in haystack:
            return None

    # Disambiguate the Quest "TESTOSTERONE, FREE (DIALYSIS) AND TOTAL,MS"
    # panel where both rows have label "TESTOSTERONE," — total is ng/dL,
    # free is pg/mL.
    if "testosterone" in haystack:
        u = (unit or "").lower()
        if "free" in haystack:
            biomarker: str | None = "free_t"
        elif "pg/ml" in u:
            biomarker = "free_t"
        elif "ng/dl" in u:
            biomarker = "testosterone"
        else:
            biomarker = None
        if biomarker is not None:
            if biomarker in SUSPECT_UNITS_FOR and (unit or "").lower() in SUSPECT_UNITS_FOR[biomarker]:
                return None
            return biomarker

    # General mapping table.
    for kind, needle, target in NAME_TO_ENGINE:
        if kind == "sub":
            matched = needle in haystack
        else:  # "word"
            matched = _word_match(needle, haystack)
        if matched:
            if target is None:
                # Recognised label, intentionally unmapped (e.g. MCHC).
                return None
            unit_l = (unit or "").lower()
            if target in SUSPECT_UNITS_FOR and unit_l in SUSPECT_UNITS_FOR[target]:
                return None
            return target
    return None


# ---------------------------------------------------------------------------
# Date detection at the report level
# ---------------------------------------------------------------------------

REPORT_HEADER_DATE_RE = re.compile(
    r"(?:Quest Result|Result|Report)\s+(\d{1,2})/(\d{1,2})/(\d{2,4})",
    re.IGNORECASE,
)
TIME_REPORTED_RE = re.compile(
    r"Time Reported:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", re.IGNORECASE,
)


def find_default_report_date(text: str) -> str | None:
    """Look at the top of the document for an overall report date.

    Used as a fallback when an individual lab line isn't preceded by a
    "Collected:" section header (rare but happens in the summary block).
    """
    for line in text.splitlines()[:25]:
        m = REPORT_HEADER_DATE_RE.search(line)
        if m:
            d = parse_mdy_to_iso(m.group(1), m.group(2), m.group(3))
            if d:
                return d
        m = TIME_REPORTED_RE.search(line)
        if m:
            d = parse_mdy_to_iso(m.group(1), m.group(2), m.group(3))
            if d:
                return d
    return None


# ---------------------------------------------------------------------------
# PDF text extraction
# ---------------------------------------------------------------------------

def extract_text_pdfplumber(pdf_path: Path) -> str:
    """Return concatenated text from all pages, or '' if pdfplumber fails."""
    try:
        import pdfplumber
    except ImportError:
        return ""
    parts: list[str] = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ""
                parts.append(t)
    except Exception:
        return ""
    return "\n".join(parts)


def configure_tesseract() -> bool:
    """Point pytesseract at a real tesseract.exe; return True if available."""
    try:
        import pytesseract  # noqa: F401
    except ImportError:
        return False
    import pytesseract as _pt
    # If it's already on PATH, the default cmd works.
    try:
        _pt.get_tesseract_version()
        return True
    except Exception:
        pass
    for cand in TESSERACT_CANDIDATES:
        if cand.exists():
            _pt.pytesseract.tesseract_cmd = str(cand)
            try:
                _pt.get_tesseract_version()
                return True
            except Exception:
                continue
    return False


def extract_text_ocr(pdf_path: Path) -> str:
    """OCR every page of a scanned PDF, concatenated. Returns '' on failure."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return ""
    if not configure_tesseract():
        return ""
    try:
        images = convert_from_path(str(pdf_path), dpi=200)
    except Exception as e:
        print(f"  OCR convert_from_path failed: {e}", file=sys.stderr)
        return ""
    parts: list[str] = []
    for img in images:
        try:
            t = pytesseract.image_to_string(img) or ""
        except Exception:
            t = ""
        parts.append(t)
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Per-PDF processing
# ---------------------------------------------------------------------------

def iter_pdf_text(text: str) -> Iterable[tuple[str, str | None]]:
    """Yield (line, current_section_date_iso) for each line in `text`.

    `current_section_date_iso` updates when a line contains a "Collected:"
    header with a parseable MM/DD/YYYY date.
    """
    current = None
    for line in text.splitlines():
        d = find_collected_date(line)
        if d:
            current = d
        yield line, current


def process_text(
    text: str,
    source_pdf: str,
    rows_out: list[tuple],
    biomarker_counts: Counter,
    biomarker_dates: defaultdict,
    unmapped_label_counts: Counter,
    seen: set,
) -> int:
    """Walk every line of `text`, emit matched observations into rows_out.

    Returns the count of biomarker rows added from this document.
    """
    default_date = find_default_report_date(text)
    added = 0

    for line, section_date in iter_pdf_text(text):
        # A line that *is* the section header doesn't itself carry a value;
        # but if there happens to be a value on it (rare), treat it normally.
        parsed = parse_lab_line(line)
        if parsed is None:
            continue
        label, value, _flag, unit, prev_value, prev_date = parsed

        biomarker = map_to_engine_biomarker(label, unit)
        if biomarker is None:
            # Track what we couldn't map, for later mapping extension.
            stripped = label.strip().rstrip(",:")
            if stripped and len(stripped) <= 60:
                unmapped_label_counts[stripped] += 1
            continue
        if biomarker is None or biomarker not in ENGINE_BIOMARKERS:
            continue

        # Reject rows whose unit doesn't look like a real lab unit. Filters
        # out narrative lines like "...by about 7-10% within" where the
        # first numeric (2.0) is followed by an English word ("to") rather
        # than a unit. We check the *normalised* unit so that variants like
        # "Thousand" / "Thousand/uL" both pass.
        unit_norm = normalize_unit(unit)
        unit_l = unit_norm.lower()
        if unit_l not in ACCEPTED_UNIT_LOWERS:
            continue

        # Reject biologically-implausible values (e.g. an order code "92888"
        # accidentally tied to vitamin_d).
        rng = PLAUSIBLE_VALUE_RANGES.get(biomarker)
        if rng is not None:
            lo, hi = rng
            if value < lo or value > hi:
                continue

        # Figure out the date for the *current* observation. Prefer the
        # most recent "Collected:" header, falling back to a report-level
        # date if we don't have one.
        date = section_date or default_date
        if date is None:
            continue

        unit_str = normalize_unit(unit)
        key = (date, biomarker, value, unit_str)
        if key not in seen:
            seen.add(key)
            rows_out.append(
                (date, biomarker, value, unit_str, source_pdf, label.strip().rstrip(","))
            )
            biomarker_counts[biomarker] += 1
            biomarker_dates[biomarker].append(date)
            added += 1

        # Optionally also emit the "previous result" observation when both a
        # prior value and prior date are present on the same line. This is
        # how Quest reports include up to one extra historical data point per
        # test row. The unit is the same as the current row, so we re-use the
        # same unit-acceptance and plausible-range checks implicitly (the
        # current row has already passed them).
        if prev_value is not None and prev_date is not None:
            if rng is not None:
                lo, hi = rng
                if prev_value < lo or prev_value > hi:
                    continue
            pkey = (prev_date, biomarker, prev_value, unit_str)
            if pkey not in seen:
                seen.add(pkey)
                rows_out.append(
                    (prev_date, biomarker, prev_value, unit_str, source_pdf,
                     label.strip().rstrip(",") + " (previous)")
                )
                biomarker_counts[biomarker] += 1
                biomarker_dates[biomarker].append(prev_date)
                added += 1

    return added


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    if not PDF_DIR.exists():
        print(f"ERROR: input directory not found: {PDF_DIR}", file=sys.stderr)
        return 2

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    pdf_paths = sorted(PDF_DIR.glob("*.pdf"))
    if not pdf_paths:
        print(f"ERROR: no PDFs in {PDF_DIR}", file=sys.stderr)
        return 2

    rows: list[tuple] = []
    biomarker_counts: Counter[str] = Counter()
    biomarker_dates: defaultdict[str, list[str]] = defaultdict(list)
    unmapped_label_counts: Counter[str] = Counter()
    seen: set[tuple] = set()

    per_pdf_summary: list[tuple[str, str, str | None, int]] = []

    print(f"Processing {len(pdf_paths)} PDFs from {PDF_DIR} ...\n")

    for pdf in pdf_paths:
        text = extract_text_pdfplumber(pdf)
        method = "text"
        # If we got essentially no text out, fall back to OCR.
        if len(text.strip()) < 200:
            ocr_text = extract_text_ocr(pdf)
            if len(ocr_text.strip()) > len(text.strip()):
                text = ocr_text
                method = "ocr"
            else:
                method = "text(empty)"

        date_for_summary: str | None = None
        # Pull *any* date we can find on this PDF for the summary line.
        m = COLLECTED_RE.search(text)
        if m:
            date_for_summary = parse_mdy_to_iso(m.group(1), m.group(2), m.group(3))
        if not date_for_summary:
            date_for_summary = find_default_report_date(text)

        added = process_text(
            text, pdf.name, rows, biomarker_counts, biomarker_dates,
            unmapped_label_counts, seen,
        )
        per_pdf_summary.append((pdf.name, method, date_for_summary, added))
        print(f"  {pdf.name:<40} method={method:<11} date={date_for_summary or '?':<10} biomarkers={added}")

    # Sort rows ascending by date, then biomarker.
    rows.sort(key=lambda r: (r[0], r[1]))

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "biomarker", "value", "unit", "source_pdf", "raw_label"])
        for r in rows:
            w.writerow(r)

    # ----------------------------- Reporting -------------------------------

    print()
    print("=" * 72)
    print("EXTRACTION SUMMARY")
    print("=" * 72)
    print(f"PDFs processed       : {len(pdf_paths)}")
    print(f"Output rows written  : {len(rows):,}")
    print(f"Output file          : {OUTPUT_CSV}")
    if rows:
        all_dates = [r[0] for r in rows]
        print(f"Date range overall   : {min(all_dates)} -> {max(all_dates)}")

    print()
    print("Per-biomarker counts and date ranges:")
    for biomarker in sorted(biomarker_counts.keys()):
        count = biomarker_counts[biomarker]
        dates = biomarker_dates[biomarker]
        print(f"  {biomarker:<20} {count:>4}  {min(dates)} -> {max(dates)}")

    if unmapped_label_counts:
        # Filter to labels that look like real tests (not stray numeric junk
        # OCR noise) and only show those occurring >= 3 times.
        frequent = [
            (lbl, cnt) for lbl, cnt in unmapped_label_counts.most_common()
            if cnt >= 3 and any(ch.isalpha() for ch in lbl) and len(lbl) >= 3
        ]
        if frequent:
            print()
            print("Unmapped labels seen >= 3 times (consider extending NAME_TO_ENGINE):")
            for lbl, cnt in frequent[:30]:
                print(f"  {cnt:>4}  {lbl}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
