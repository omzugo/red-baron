#!/usr/bin/env python3
"""
Convert harvard_base_parcels.json into the Property schema consumed by the
Next.js app (lib/data/harvard_properties.json).

Handles both Cambridge (text property class codes) and Boston (numeric PTYPE codes).
Run after findHarvardParcels.py.
"""
import argparse
import json
import os
from datetime import datetime

_parser = argparse.ArgumentParser(description="Build app-schema Harvard properties JSON for a given fiscal year.")
_parser.add_argument("--year", type=int, default=2026, help="Fiscal year (default: 2026)")
_args = _parser.parse_args()
YEAR = _args.year

BASE_PARCELS = os.path.join(
    os.path.dirname(__file__), "..", "lib", "data", f"harvard_base_parcels_fy{YEAR}.json"
)
OUTPUT = os.path.join(
    os.path.dirname(__file__), "..", "lib", "data", f"harvard_fy{YEAR}.json"
)

# Cambridge text-based property class codes
CAMBRIDGE_ACADEMIC_STATE_CODES = {"942", "946", "9420", "9423", "947", "957"}
CAMBRIDGE_RESIDENTIAL_CLASSES = {
    ">8-UNIT-APT", "4-8-UNIT-APT", "THREE-FM-RES", "CONDOMINIUM",
    "MULTIUSE-RES", "SINGLE FAM W/AUXILIARY APT", "MULTI UNIT CNDO",
}

# Boston LU (land use) codes from the FY26 Assessment-Parcel Join service.
# LU is a short alphabetic code; LU_DESC is stored as property_class.
# Residential: R1 R2 R3 R4 (1–4 family), A (apartment), CD (condo unit), RC
# Exempt/Academic: E, EA, EM, EP, CP (college/university property)
# Commercial: C, CC, CL, CM, RC, I, IA, etc.
BOSTON_ACADEMIC_LU = {"E", "EA", "EM", "EP", "CP", "CU"}
BOSTON_RESIDENTIAL_LU_PREFIXES = ("R", "A", "CD", "CM")  # startswith checks


def centroid(geometry: dict) -> tuple:
    if geometry["type"] == "Polygon":
        ring = geometry["coordinates"][0]
    else:
        ring = geometry["coordinates"][0][0]
    lngs = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def infer_category(props: dict) -> str:
    city = props.get("city", "cambridge")
    cls = props.get("property_class", "").strip()

    if city == "boston":
        # Boston uses LU codes (stored in zoning field) from FY26 service
        lu = props.get("zoning", "").strip().upper()
        if lu in BOSTON_ACADEMIC_LU:
            return "academic"
        if any(lu.startswith(p) for p in BOSTON_RESIDENTIAL_LU_PREFIXES):
            return "residential"
        return "corporate"

    # Cambridge uses text codes and state class codes
    sc = props.get("state_class_code", "").strip()
    if sc in CAMBRIDGE_ACADEMIC_STATE_CODES or "COLLEGE" in cls or "UNIVERSITY" in cls:
        return "academic"
    if cls in CAMBRIDGE_RESIDENTIAL_CLASSES or "RES" in cls.split("-")[0]:
        return "residential"
    return "corporate"


def infer_entity(owner_name: str) -> str:
    n = owner_name.upper()
    if "PRESIDENT" in n and ("FELLOWS" in n or "FELLOW" in n):
        return "Harvard University"
    if "REAL ESATE" in n or "REAL ESTATE" in n:
        return "Harvard University Real Estate"
    if "STUDENT AGENCIES" in n:
        return "Harvard Student Agencies"
    # Boston truncated forms: "HARVARD COLLEGE" covers all President & Fellows truncations
    if n.startswith("HARVARD COLLEGE") or n.startswith("HARVARD COLL PRES"):
        return "Harvard University"
    if "HARVARD UNIVERSITY" in n:
        return "Harvard University"
    return owner_name.strip()


def to_int(val: str) -> int | None:
    try:
        v = int(float(val))
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def build_property(feat: dict, idx: int) -> dict:
    p = feat["properties"]
    city = p.get("city", "cambridge")
    parcel_id = p.get("map_lot", f"unknown-{idx}")
    lat, lng = centroid(feat["geometry"])

    # ID encodes city so Cambridge and Boston parcels never collide
    prop_id = f"harvard-{city}-{parcel_id.replace('/', '-')}"

    prop = {
        "id": prop_id,
        "address": p.get("address", "Unknown"),
        "coordinates": {"lat": round(lat, 6), "lng": round(lng, 6)},
        "ownership": {
            "type": "full",
            "entity": infer_entity(p.get("harvard_owner_name", "")),
            "confidence": p.get("ownership_confidence", "confirmed"),
        },
        "category": infer_category(p),
        "currentUse": p.get("property_class"),
        "details": {
            "squareFootage": to_int(p.get("living_area_sqft", "")),
            "assessedValue": to_int(p.get("assessed_value", "")),
            "yearBuilt": to_int(p.get("year_built", "")),
            "lotSize": to_int(p.get("land_area_sqft", "")),
        },
        "sources": [p.get("data_source", "Public assessor")],
        "lastUpdated": datetime.now().strftime("%Y-%m-%dT00:00:00.000Z"),
        "parcelGeometry": feat["geometry"],
        "assessorData": {
            "mapLot": parcel_id,
            "ownerName": p.get("harvard_owner_name"),
            "propertyClass": p.get("property_class"),
            "zoning": p.get("zoning"),
            "landAreaSqft": to_int(p.get("land_area_sqft", "")),
            "buildingValue": to_int(p.get("building_value", "")),
            "landValue": to_int(p.get("land_value", "")),
            "dataSource": p.get("data_source"),
        },
    }

    prop = {k: v for k, v in prop.items() if v is not None}
    prop["details"] = {k: v for k, v in prop["details"].items() if v is not None}
    prop["assessorData"] = {k: v for k, v in prop["assessorData"].items() if v is not None}

    return prop


def main():
    print("=== Building harvard_properties.json ===\n")

    with open(BASE_PARCELS) as f:
        base = json.load(f)

    properties = [build_property(feat, i) for i, feat in enumerate(base["features"])]

    with open(OUTPUT, "w") as f:
        json.dump(properties, f, indent=2)

    cambridge = [p for p in properties if "cambridge" in p["id"]]
    boston = [p for p in properties if "boston" in p["id"]]
    confirmed = sum(1 for p in properties if p["ownership"].get("confidence") == "confirmed")
    probable = sum(1 for p in properties if p["ownership"].get("confidence") == "probable")
    cats: dict = {}
    for p in properties:
        c = p["category"]
        cats[c] = cats.get(c, 0) + 1

    print(f"✓ {len(properties)} properties written to {OUTPUT}")
    print(f"  Cambridge: {len(cambridge)}  Boston: {len(boston)}")
    print(f"  confirmed: {confirmed}  probable: {probable}")
    print(f"  categories: {cats}")


if __name__ == "__main__":
    main()
