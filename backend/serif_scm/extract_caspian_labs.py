"""Extract real biomarker / lab observations from Apple Health CDA XML.

Streaming parse of the (1.3 GB) export_cda.xml using xml.etree.ElementTree.iterparse.
Walks every <observation> element, pulls the LOINC code + displayName + xsi:type=PQ
value + effectiveTime, maps to engine biomarker names, and writes one CSV row per
matching (date, biomarker) observation.

Output: backend/data/caspian_labs.csv
Schema: date, biomarker, value, unit, raw_loinc

Run:
    python -m backend.serif_scm.extract_caspian_labs
"""
from __future__ import annotations

import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterator
from xml.etree.ElementTree import iterparse


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# Resolve repo root from this file: <repo>/backend/serif_scm/extract_caspian_labs.py
REPO_ROOT = Path(__file__).resolve().parents[2]

INPUT_XML = (
    REPO_ROOT
    / "Oron Afek - Health Data-20260426T143958Z-3-001"
    / "Oron Afek - Health Data"
    / "export"
    / "apple_health_export"
    / "export_cda.xml"
)

OUTPUT_CSV = REPO_ROOT / "backend" / "data" / "caspian_labs.csv"


# ---------------------------------------------------------------------------
# Engine-biomarker mapping
# ---------------------------------------------------------------------------
#
# Two lookup tables:
#   LOINC_TO_ENGINE  — exact-match LOINC code → engine biomarker name
#   NAME_TO_ENGINE   — list of (lowercase substring, engine biomarker) pairs
#                      used for case-insensitive display-name matching when the
#                      LOINC code is absent / unknown.
#
# Display-name matching is intentionally substring-based and case-insensitive
# because EHR exports often append qualifiers like "in serum or plasma".
# ---------------------------------------------------------------------------

LOINC_TO_ENGINE: dict[str, str] = {
    "2276-4": "ferritin",
    "2498-4": "iron_total",
    "718-7": "hemoglobin",
    "789-8": "rbc",
    "787-2": "mcv",
    "788-0": "rdw",
    "6690-2": "wbc",
    "777-3": "platelets",
    "30522-7": "hscrp",
    "2345-7": "glucose",
    "1554-5": "insulin",
    "4548-4": "hba1c",
    "13457-7": "ldl",
    "2085-9": "hdl",
    "2093-3": "total_cholesterol",
    "2571-8": "triglycerides",
    "1884-6": "apob",
    "2986-8": "testosterone",
    "2143-6": "cortisol",
    "62292-8": "vitamin_d",
    "3016-3": "tsh",
    "1742-6": "alt",
    "1920-8": "ast",
    "2160-0": "creatinine",
    "3084-1": "uric_acid",
    "13965-9": "homocysteine",
    "5763-8": "zinc",
    "2132-9": "b12",
    "2284-8": "folate",
}

# Order matters: more-specific tokens first so e.g. "Hemoglobin A1c" maps to
# hba1c rather than hemoglobin.
NAME_TO_ENGINE: list[tuple[str, str]] = [
    ("hba1c", "hba1c"),
    ("hemoglobin a1c", "hba1c"),
    ("a1c", "hba1c"),
    ("ferritin", "ferritin"),
    ("apolipoprotein b", "apob"),
    ("apo b", "apob"),
    ("hs-crp", "hscrp"),
    ("c reactive protein", "hscrp"),
    ("c-reactive protein", "hscrp"),
    ("homocysteine", "homocysteine"),
    ("testosterone", "testosterone"),
    ("cortisol", "cortisol"),
    ("vitamin d", "vitamin_d"),
    ("25-oh", "vitamin_d"),
    ("25 hydroxy", "vitamin_d"),
    ("thyrotropin", "tsh"),
    ("tsh", "tsh"),
    ("vitamin b12", "b12"),
    ("b12", "b12"),
    ("folate", "folate"),
    ("zinc", "zinc"),
    ("uric acid", "uric_acid"),
    ("creatinine", "creatinine"),
    ("triglycerides", "triglycerides"),
    ("ldl", "ldl"),
    ("hdl", "hdl"),
    ("cholesterol", "total_cholesterol"),
    ("insulin", "insulin"),
    ("glucose", "glucose"),
    ("platelets", "platelets"),
    ("leukocytes", "wbc"),
    ("wbc", "wbc"),
    ("erythrocytes", "rbc"),
    ("red blood cell", "rbc"),
    ("mcv", "mcv"),
    ("rdw", "rdw"),
    ("hemoglobin", "hemoglobin"),
    ("iron", "iron_total"),
    ("alt", "alt"),
    ("ast", "ast"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# CDA HL7 v3 namespace (defined as default xmlns on ClinicalDocument).
HL7_NS = "urn:hl7-org:v3"
# xsi namespace (for xsi:type attribute on <value>).
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"


def qn(tag: str, ns: str = HL7_NS) -> str:
    """Build a Clark-notation tag name: '{ns}localname'."""
    return f"{{{ns}}}{tag}"


def parse_effective_time_to_date(elem) -> str | None:
    """Extract a YYYY-MM-DD date string from an <effectiveTime> element.

    Handles three CDA conventions:
      1. <effectiveTime value="YYYYMMDDhhmmss-zzzz"/>           — point in time
      2. <effectiveTime><low value="..."/><high value="..."/></effectiveTime>
                                                                — interval
      3. <effectiveTime>...<low value="..."/></effectiveTime>   — open interval

    Prefers `value`, then `low`, then `high`. Returns None if no usable timestamp.
    """
    if elem is None:
        return None

    raw = elem.get("value")
    if not raw:
        low = elem.find(qn("low"))
        if low is not None:
            raw = low.get("value")
    if not raw:
        high = elem.find(qn("high"))
        if high is not None:
            raw = high.get("value")
    if not raw:
        return None

    # CDA timestamp formats: 'YYYYMMDD', 'YYYYMMDDhhmm', 'YYYYMMDDhhmmss',
    # any of which may have a trailing timezone like '-0500' or '+0000'.
    # We just take the first 8 digits and split into ISO date.
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) < 8:
        return None
    return f"{digits[0:4]}-{digits[4:6]}-{digits[6:8]}"


def map_to_engine_biomarker(loinc_code: str | None, display_name: str | None) -> str | None:
    """Return the engine biomarker name for a (LOINC code, displayName) pair.

    Tries an exact LOINC-code match first; falls back to a case-insensitive
    substring match on the display name. Returns None if no rule matches.
    """
    if loinc_code and loinc_code in LOINC_TO_ENGINE:
        return LOINC_TO_ENGINE[loinc_code]
    if display_name:
        haystack = display_name.lower()
        for needle, biomarker in NAME_TO_ENGINE:
            if needle in haystack:
                return biomarker
    return None


def extract_observation(obs_elem) -> tuple[str, str, float, str, str] | None:
    """Pull (date, biomarker, value, unit, raw_loinc) from one <observation>.

    Returns None if the observation lacks any required field, has a non-PQ
    value, or maps to a biomarker outside the engine mapping.
    """
    code_elem = obs_elem.find(qn("code"))
    value_elem = obs_elem.find(qn("value"))
    eff_elem = obs_elem.find(qn("effectiveTime"))

    if code_elem is None or value_elem is None:
        return None

    # The <value> must be a physical quantity (xsi:type="PQ") with a numeric
    # `value` attribute. Anything else (CD, ED, BL, ST, ...) is skipped.
    xsi_type = value_elem.get(qn("type", XSI_NS))
    if xsi_type is None or "PQ" not in xsi_type:
        return None

    raw_value = value_elem.get("value")
    if raw_value is None or raw_value == "":
        return None
    try:
        numeric_value = float(raw_value)
    except ValueError:
        return None

    unit = value_elem.get("unit") or ""

    loinc_code = code_elem.get("code")
    code_system_name = code_elem.get("codeSystemName") or ""
    display_name = code_elem.get("displayName") or ""

    # Only treat the code as a real LOINC code if the codeSystem identifies it
    # as such. CDA observations also use SNOMED CT codes (e.g. "365812005" for
    # "Blood glucose level"), and we don't want to false-match those against
    # LOINC_TO_ENGINE.
    real_loinc = loinc_code if "LOINC" in code_system_name.upper() else None

    biomarker = map_to_engine_biomarker(real_loinc, display_name)
    if biomarker is None:
        return None

    date = parse_effective_time_to_date(eff_elem)
    if date is None:
        return None

    # raw_loinc preserves the most informative identifier we have so a downstream
    # auditor can trace each row back to the source observation.
    raw_loinc = real_loinc or display_name or (loinc_code or "")

    return (date, biomarker, numeric_value, unit, raw_loinc)


def stream_observations(xml_path: Path) -> Iterator:
    """Yield each <observation> element on its end-event, then clear it.

    Uses iterparse with `start-ns` to capture the default xmlns mapping (we
    already know it's urn:hl7-org:v3 but this keeps the parser robust to
    namespace changes), and `end` for element finalization. Each element is
    cleared after yield to keep memory bounded.
    """
    obs_tag = qn("observation")
    context = iterparse(str(xml_path), events=("start-ns", "end"))
    for event, payload in context:
        if event == "start-ns":
            # We don't strictly need to act on namespace declarations because
            # the default xmlns is fixed in CDA, but capturing the event keeps
            # iterparse from buffering them.
            continue
        # event == "end"
        elem = payload
        if elem.tag == obs_tag:
            yield elem
            # Free the subtree as soon as we're done with it.
            elem.clear()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    if not INPUT_XML.exists():
        print(f"ERROR: input not found: {INPUT_XML}", file=sys.stderr)
        return 2

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    rows: list[tuple[str, str, float, str, str]] = []
    biomarker_counts: Counter[str] = Counter()
    biomarker_dates: dict[str, list[str]] = defaultdict(list)
    unmapped_loinc_counts: Counter[str] = Counter()
    unmapped_displayname_counts: Counter[str] = Counter()

    total_observations = 0

    print(f"Streaming {INPUT_XML} ...")

    for obs in stream_observations(INPUT_XML):
        total_observations += 1

        if total_observations % 50_000 == 0:
            print(
                f"  scanned {total_observations:,} observations  "
                f"(matched rows: {len(rows):,})"
            )

        # Quick reject path so we can keep diagnostic counts of skipped LOINCs:
        # only run the full extractor on observations we could conceivably match.
        code_elem = obs.find(qn("code"))
        value_elem = obs.find(qn("value"))
        if code_elem is None or value_elem is None:
            continue

        result = extract_observation(obs)
        if result is None:
            # Track unmapped LOINC codes / display names — only those that look
            # like they have a usable PQ numeric value, so we don't pollute the
            # diagnostic with non-numeric observations.
            xsi_type = value_elem.get(qn("type", XSI_NS))
            if xsi_type and "PQ" in xsi_type and value_elem.get("value"):
                csn = (code_elem.get("codeSystemName") or "").upper()
                if "LOINC" in csn:
                    code = code_elem.get("code") or ""
                    if code and code not in LOINC_TO_ENGINE:
                        unmapped_loinc_counts[code] += 1
                else:
                    name = code_elem.get("displayName") or ""
                    if name:
                        unmapped_displayname_counts[name] += 1
            continue

        date, biomarker, _value, _unit, _raw = result
        rows.append(result)
        biomarker_counts[biomarker] += 1
        biomarker_dates[biomarker].append(date)

    # Sort by date, then biomarker (stable).
    rows.sort(key=lambda r: (r[0], r[1]))

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "biomarker", "value", "unit", "raw_loinc"])
        for row in rows:
            writer.writerow(row)

    # ----------------------------- Reporting -------------------------------

    print()
    print("=" * 72)
    print("EXTRACTION SUMMARY")
    print("=" * 72)
    print(f"Total observation elements scanned : {total_observations:,}")
    print(f"Output rows written                : {len(rows):,}")
    print(f"Output file                        : {OUTPUT_CSV}")

    if rows:
        all_dates = [r[0] for r in rows]
        print(f"Date range (overall)               : {min(all_dates)} -> {max(all_dates)}")

    print()
    print("Per-biomarker observation count (top 20):")
    for biomarker, count in biomarker_counts.most_common(20):
        dates = biomarker_dates[biomarker]
        dmin, dmax = min(dates), max(dates)
        print(f"  {biomarker:<22} {count:>8,}  {dmin} -> {dmax}")

    if unmapped_loinc_counts:
        print()
        print("Top unmapped LOINC codes (numeric PQ observations only):")
        for code, count in unmapped_loinc_counts.most_common(20):
            print(f"  {code:<12} {count:>8,}")

    if unmapped_displayname_counts:
        print()
        print("Top unmapped non-LOINC observation displayNames (numeric PQ only):")
        for name, count in unmapped_displayname_counts.most_common(20):
            print(f"  {name:<40} {count:>8,}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
