#!/usr/bin/env python3
"""
Harvest all Harvard University-owned parcels in Cambridge AND Boston.

Output: lib/data/harvard_base_parcels.json — a GeoJSON FeatureCollection.
Run this script whenever either city publishes new assessment data.

--- CAMBRIDGE ---
Source: FY2026 Cambridge assessor CSV + GeoJSON (cambridgegis_data on GitHub).
Join key: MapLot (CSV) ↔ ML (GeoJSON).
All Cambridge Harvard parcels are held directly under "PRESIDENT & FELLOWS OF
HARVARD COLLEGE" or minor variants. Unlike MIT, Harvard does not use per-property
LLC names in Cambridge — confirmed by scanning the full FY2026 dataset.
Confidence: "confirmed" for all President & Fellows variants.

--- BOSTON (Allston focus) ---
Source: Boston assessor CKAN API + Boston ArcGIS parcel geometry.
Join key: GIS_ID (assessor, strip trailing underscore) ↔ MAP_PAR_ID (ArcGIS).
The Boston owner field is truncated at 28 characters. Pattern matching must use
prefix/substring checks — see HARVARD_BOSTON_* lists below.
Harvard's Allston holdings appear under "HARVARD REAL ESTATE ALLSTON" and similar
subsidiaries — these are Harvard University entities, not third-party firms.
Confidence: "confirmed" for President & Fellows variants, "probable" for RE subsidiaries.

--- KNOWN GAPS (not yet searched) ---
Somerville: borders Cambridge; unlikely but unverified.
Brookline: Harvard athletic facilities border Brookline; worth checking manually.
Harvard's 990 Schedule R may surface ground leases not visible in assessor data
(where a developer appears as assessor owner but Harvard holds the fee interest).
Harvard EIN: 04-2103580. 990 filings via ProPublica or IRS TEOS.

--- EXCLUDED INTENTIONALLY ---
HARVARD  CLUB  OF  BOSTON        — private social club, not university
HARVARD COMMONS LP               — affordable housing LP, not Harvard University
HARVARD HILL UE LLC              — utility easement LLC, unresolved
HARVARD MUSICAL ASSOC            — independent organization
HARVARD COMMUNITY HEALTH         — community health center
HARVARD VANGUARD MEDICAL         — medical group (Atrius Health)
Address-based LLCs on Harvard St — named after the street, not the university
"""
import argparse
import csv
import io
import json
import os
import sys
import urllib.request

# Allow importing from scripts/lib/
sys.path.insert(0, os.path.dirname(__file__))
from lib import boston as boston_lib

_parser = argparse.ArgumentParser(description="Find Harvard parcels for a given fiscal year.")
_parser.add_argument("--year", type=int, default=2026, help="Fiscal year (default: 2026)")
_args = _parser.parse_args()
YEAR = _args.year

# ── URLs & paths ──────────────────────────────────────────────────────────────
PARCEL_GEOJSON_URL = (
    f"https://raw.githubusercontent.com/cambridgegis/cambridgegis_data"
    f"/main/Assessing/FY{YEAR}/FY{YEAR}_Parcels/ASSESSING_ParcelsFY{YEAR}.geojson"
)
PROPERTY_DB_CSV_URL = (
    f"https://raw.githubusercontent.com/cambridgegis/cambridgegis_data"
    f"/main/Assessing/FY{YEAR}/FY{YEAR}_Parcels/ASSESSING_PropertyDatabase_FY{YEAR}.csv"
)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
PARCEL_CACHE = os.path.join(CACHE_DIR, f"parcels_fy{YEAR}.geojson")
CSV_CACHE = os.path.join(CACHE_DIR, f"property_db_fy{YEAR}.csv")
BOSTON_FY26_CACHE = os.path.join(CACHE_DIR, f"boston_harvard_fy{YEAR}.json")

OUTPUT_FILE = os.path.join(
    os.path.dirname(__file__), "..", "lib", "data", f"harvard_base_parcels_fy{YEAR}.json"
)

# ── Cambridge owner patterns ───────────────────────────────────────────────────
# All are "confirmed" — direct Harvard University ownership via President & Fellows.
# Harvard does not use per-property LLCs in Cambridge (unlike MIT).
CAMBRIDGE_CONFIRMED_PATTERNS = [
    "PRESIDENT & FELLOWS OF HARVARD COLLEGE",
    "PRESIDENT & FELLOWS OF HARVARD COLLEGE,",   # trailing-comma variant
    "PRESIDENT AND FELLOWS OF HARVARD COLLEGE",
    "PRESIDENT & FELLOWS OF HARVARD COLLEDGE",   # assessor typo
    "PRESIDENTS & FELLOWS OF HARVARD COLLEGE",   # assessor typo
    "PRESIDENT & FELLOW OF HARVARD COLLEGE",     # assessor typo
    "PRESIDENT & FELLOWS OF HARVARD",            # truncated
    "PRESIDENT & FELLOW OF HARVARD",             # truncated + typo
]

CAMBRIDGE_PROBABLE_PATTERNS = [
    "HARVARD UNIVERSITY REAL ESATE INC",         # assessor typo for "ESTATE"
    "HARVARD STUDENT AGENCIES",
]


def classify_cambridge_owner(name: str) -> str | None:
    """Return confidence tier or None if not a Harvard entity."""
    n = name.upper().strip()
    for pat in CAMBRIDGE_CONFIRMED_PATTERNS:
        if n.startswith(pat.upper()) or n == pat.upper():
            return "confirmed"
    for pat in CAMBRIDGE_PROBABLE_PATTERNS:
        if pat.upper() in n:
            return "probable"
    return None


# ── Boston owner patterns (FY26 service — full names, no truncation) ──────────
# The FY26 Assessment-Parcel Join FeatureServer has full (non-truncated) owner
# names. Patterns here are exact institutional names as they appear in FY26.
#
# WHERE clause passed to the FY26 service — casts a wide net and then
# classify_boston_owner_fy26() filters out non-Harvard entities.
BOSTON_FY26_WHERE = """
    OWNER LIKE 'PRESIDENT%FELLOWS%HARVARD%'
    OR OWNER LIKE 'PRESIDENT%FELLOW%HARVARD%'
    OR OWNER = 'HARVARD COLLEGE'
    OR OWNER LIKE 'HARVARD REAL ESTATE%'
    OR OWNER LIKE 'HARVARD RE/%'
    OR OWNER LIKE 'HARVARD RE /%'
    OR OWNER LIKE 'HARVARD RE/ %'
    OR OWNER LIKE 'HARVARD  REAL ESTATE%'
    OR OWNER LIKE 'HARVARD UNIVERSITY BEACON%'
    OR OWNER = 'HARVARD 219 WESTERN LLC'
    OR OWNER LIKE 'HARVARD STUDENT AGENCIES%'
    OR OWNER LIKE 'HARVARD UNIVERSITY REAL ESTATE%'
    OR OWNER = 'BEAU GESTE XXV LLC'
    OR OWNER = 'SGT HOLDING CORP'
    OR OWNER = 'NINE TRAVIS ST LLC MASS LLC'
""".strip()

# Non-Harvard-named entities that Harvard controls via real estate subsidiaries.
#
# CONFIRMED (990 Schedule R Part I — Harvard disregarded entities):
#   BEAU GESTE XXV LLC   — 400 Soldiers Field Rd, Allston ($72.3M DoubleTree hotel)
#
# SUSPECTED (identified via mail address c/o Harvard Real Estate Services,
#   1350 Massachusetts Ave / Holyoke Center — indirect signal):
#   SGT HOLDING CORP     — 1120-1150 Soldiers Field Rd, Allston ($2.3M radio studio)
#   NINE TRAVIS ST LLC   — 9 Travis St, Allston ($1.4M)
#
# Deliberately excluded:
#   KENNEY GREG A TS   — 395 Western Ave, Brighton — individual trust, uncertain
#   RTH * entities     — Roxbury Tenants of Harvard, an independent community org
BOSTON_CONFIRMED_INDIRECT = {
    "BEAU GESTE XXV LLC",        # 990 Schedule R Part I disregarded entity
}
BOSTON_SUSPECTED_OWNERS = {
    "SGT HOLDING CORP",
    "NINE TRAVIS ST LLC MASS LLC",
}

# Discovered entities that are NOT Harvard University — exclude from output.
# These match the WHERE clause but are private investors or unrelated orgs.
BOSTON_EXCLUDED_OWNERS = {
    "HARVARD REAL ESTATE ALLSRON INC",  # note: this IS Harvard (typo), keep via catch-all
}


def classify_boston_owner_fy26(name: str) -> str | None:
    """
    Return confidence tier for a Boston FY26 owner name, or None to exclude.
    Works with full (non-truncated) names from the FY26 service.
    """
    n = name.upper().strip()

    # Confirmed: direct Harvard University ownership via President & Fellows
    confirmed_prefixes = [
        "PRESIDENT AND FELLOWS OF HARVARD COLLEGE",
        "PRESIDENT & FELLOWS OF HARVARD COLLEGE",
        "PRESIDENT AND FELLOWS OF HARVARD",
        "PRESIDENT & FELLOWS OF HARVARD",
        "HARVARD COLLEGE",
    ]
    for pat in confirmed_prefixes:
        if n.startswith(pat.upper()):
            return "confirmed"

    # Probable: Harvard University real estate subsidiaries (named entities)
    probable_prefixes = [
        "HARVARD REAL ESTATE",
        "HARVARD RE/",
        "HARVARD RE /",
        "HARVARD RE/ ",
        "HARVARD  REAL ESTATE",
        "HARVARD UNIVERSITY BEACON",
        "HARVARD 219 WESTERN",
        "HARVARD STUDENT AGENCIES",
        "HARVARD UNIVERSITY REAL ESTATE",
    ]
    for pat in probable_prefixes:
        if n.startswith(pat.upper()):
            return "probable"

    # Confirmed: Harvard disregarded entities per 990 Schedule R Part I
    if n in {o.upper() for o in BOSTON_CONFIRMED_INDIRECT}:
        return "confirmed"

    # Suspected: non-Harvard-named entities controlled by Harvard Real Estate
    # (identified via mail address = c/o Harvard Real Estate Services, Holyoke Center)
    if n in {o.upper() for o in BOSTON_SUSPECTED_OWNERS}:
        return "suspected"

    return None


# ── Cambridge pipeline ─────────────────────────────────────────────────────────
def fetch(url: str, cache_path: str) -> bytes:
    if os.path.exists(cache_path):
        print(f"  (cached) {os.path.basename(cache_path)}")
        with open(cache_path, "rb") as f:
            return f.read()
    print(f"  downloading {url}")
    with urllib.request.urlopen(url) as r:
        data = r.read()
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "wb") as f:
        f.write(data)
    return data


def load_cambridge_records(raw: bytes) -> dict:
    """Return dict MapLot → list of assessor rows for Harvard-owned Cambridge parcels."""
    content = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    result: dict = {}
    for row in reader:
        confidence = classify_cambridge_owner(row.get("Owner_Name", ""))
        if confidence is not None:
            row["_confidence"] = confidence
            lot = row["MapLot"].strip()
            result.setdefault(lot, []).append(row)
    return result


def load_parcels_index(raw: bytes) -> dict:
    data = json.loads(raw)
    return {f["properties"]["ML"]: f for f in data["features"] if f.get("geometry")}


def build_cambridge_features(harvard_records: dict, parcels_index: dict) -> tuple:
    features = []
    unmatched = []
    seen_ml: set = set()

    for map_lot, rows in sorted(harvard_records.items()):
        base_ml = (
            map_lot.split("-")[0] + "-" + map_lot.split("-")[1]
            if map_lot.count("-") >= 1
            else map_lot
        )
        if base_ml in seen_ml:
            continue
        seen_ml.add(base_ml)

        feature = parcels_index.get(base_ml)
        if feature is None:
            unmatched.append(map_lot)
            continue

        primary = next((r for r in rows if not r.get("Unit", "").strip()), rows[0])
        confidence = primary["_confidence"]

        props = dict(feature["properties"])
        props.update({
            "harvard_owner_name": primary["Owner_Name"].strip(),
            "harvard_owner_entity": primary.get("Owner_CoOwnerName", "").strip(),
            "address": primary["Address"].strip(),
            "property_class": primary["PropertyClass"].strip(),
            "state_class_code": primary["StateClassCode"].strip(),
            "zoning": primary["Zoning"].strip(),
            "land_area_sqft": primary["LandArea"].strip(),
            "assessed_value": primary["AssessedValue"].strip(),
            "building_value": primary["BuildingValue"].strip(),
            "land_value": primary["LandValue"].strip(),
            "year_built": primary["Condition_YearBuilt"].strip(),
            "num_stories": primary["Exterior_NumStories"].strip(),
            "living_area_sqft": primary["Interior_LivingArea"].strip(),
            "sale_date": primary["SaleDate"].strip(),
            "sale_price": primary["SalePrice"].strip(),
            "ownership_confidence": confidence,
            "data_source": "Cambridge FY2026 Assessor",
            "map_lot": base_ml,
            "city": "cambridge",
        })

        features.append({
            "type": "Feature",
            "geometry": feature["geometry"],
            "properties": props,
        })

    return features, unmatched


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("=== Harvard Parcel Harvester (Cambridge + Boston) ===\n")

    # Cambridge
    print("── Cambridge ──────────────────────────────────────────")
    print("Loading assessor CSV...")
    csv_raw = fetch(PROPERTY_DB_CSV_URL, CSV_CACHE)
    harvard_records = load_cambridge_records(csv_raw)
    print(
        f"  {sum(len(v) for v in harvard_records.values())} Harvard records "
        f"across {len(harvard_records)} MapLot IDs\n"
    )

    print("Loading parcel geometries...")
    geojson_raw = fetch(PARCEL_GEOJSON_URL, PARCEL_CACHE)
    parcels_index = load_parcels_index(geojson_raw)
    print(f"  {len(parcels_index)} Cambridge parcels indexed\n")

    cambridge_features, cambridge_unmatched = build_cambridge_features(
        harvard_records, parcels_index
    )

    cambridge_confirmed = sum(
        1 for f in cambridge_features
        if f["properties"]["ownership_confidence"] == "confirmed"
    )
    cambridge_probable = sum(
        1 for f in cambridge_features
        if f["properties"]["ownership_confidence"] == "probable"
    )
    print(f"  {len(cambridge_features)} Cambridge parcels matched")
    print(f"    confirmed: {cambridge_confirmed}  probable: {cambridge_probable}")
    if cambridge_unmatched:
        print(f"    unmatched MapLots: {len(cambridge_unmatched)}")
        for ml in cambridge_unmatched:
            print(f"      - {ml}")

    # Boston — uses FY26 Assessment-Parcel Join FeatureServer (geometry + data in one query)
    print("\n── Boston ─────────────────────────────────────────────")
    boston_features, boston_unmatched = boston_lib.fetch_fy26_features(
        where_clause=BOSTON_FY26_WHERE,
        confidence_fn=classify_boston_owner_fy26,
        owner_field_name="harvard_owner_name",
        cache_path=BOSTON_FY26_CACHE,
    )

    boston_confirmed = sum(
        1 for f in boston_features
        if f["properties"]["ownership_confidence"] == "confirmed"
    )
    boston_probable = sum(
        1 for f in boston_features
        if f["properties"]["ownership_confidence"] == "probable"
    )
    print(f"\n  {len(boston_features)} Boston parcels matched")
    print(f"    confirmed: {boston_confirmed}  probable: {boston_probable}")
    if boston_unmatched:
        print(f"    unmatched GIS_IDs: {len(boston_unmatched)}")
        for gid in boston_unmatched:
            print(f"      - {gid}")

    # Merge
    all_features = cambridge_features + boston_features
    output = {"type": "FeatureCollection", "features": all_features}

    print(f"\n── Summary ────────────────────────────────────────────")
    print(f"  Cambridge: {len(cambridge_features)} parcels")
    print(f"  Boston:    {len(boston_features)} parcels")
    print(f"  Total:     {len(all_features)} parcels")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n✓ Saved to {OUTPUT_FILE}")

    # Owner name inventory
    print("\n── Owner entity inventory ─────────────────────────────")
    entity_counts: dict = {}
    for feat in all_features:
        name = feat["properties"]["harvard_owner_name"]
        city = feat["properties"].get("city", "?")
        key = f"[{city}] {name}"
        entity_counts[key] = entity_counts.get(key, 0) + 1
    for name, count in sorted(entity_counts.items(), key=lambda x: -x[1]):
        print(f"  {count:4d}  {name}")


if __name__ == "__main__":
    main()
