#!/usr/bin/env python3
"""
Convert base_parcels.json (raw assessor data) into the Property schema
consumed by the Next.js app (lib/data/properties.json).

Preserves hand-curated enrichment from enrichment.json if it exists.
Run after findMITParcels.py.
"""
import argparse
import json
import os
from datetime import datetime

_parser = argparse.ArgumentParser(description="Build app-schema properties JSON for a given fiscal year.")
_parser.add_argument("--year", type=int, default=2026, help="Fiscal year (default: 2026)")
_args = _parser.parse_args()
YEAR = _args.year

BASE_PARCELS = os.path.join(os.path.dirname(__file__), "..", "lib", "data", f"base_parcels_fy{YEAR}.json")
ENRICHMENT = os.path.join(os.path.dirname(__file__), "..", "lib", "data", "enrichment.json")
OUTPUT = os.path.join(os.path.dirname(__file__), "..", "lib", "data", f"mit_fy{YEAR}.json")


def centroid(geometry: dict) -> tuple:
    """Compute a simple centroid from a Polygon or MultiPolygon."""
    if geometry["type"] == "Polygon":
        ring = geometry["coordinates"][0]
    else:
        ring = geometry["coordinates"][0][0]
    lngs = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


ACADEMIC_STATE_CODES = {"942", "946", "9420", "9423", "947", "957"}
RESIDENTIAL_CLASSES = {
    ">8-UNIT-APT", "4-8-UNIT-APT", "THREE-FM-RES", "CONDOMINIUM",
    "MULTIUSE-RES", "SINGLE FAM W/AUXILIARY APT", "MULTI UNIT CNDO",
}


def infer_category(props: dict) -> str:
    sc = str(props.get("state_class_code", "")).strip()
    cls = props.get("property_class", "").strip()
    if sc in ACADEMIC_STATE_CODES or "COLLEGE" in cls or "UNIVERSITY" in cls:
        return "academic"
    if cls in RESIDENTIAL_CLASSES or "RES" in cls.split("-")[0]:
        return "residential"
    return "corporate"


def infer_entity(owner_name: str) -> str:
    n = owner_name.upper()
    if n.startswith("MASSACHUSETTS INST") or n == "MIT":
        return "MIT"
    return owner_name.strip()


def to_int(val: str) -> int | None:
    try:
        v = int(float(val))
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None


def build_property(feat: dict, enrichment: dict, idx: int) -> dict:
    p = feat["properties"]
    ml = p.get("map_lot", f"unknown-{idx}")
    lat, lng = centroid(feat["geometry"])

    enrich = enrichment.get(ml, {})

    prop = {
        "id": f"cambridge-{ml.replace('/', '-')}",
        "address": p.get("address", "Unknown"),
        "buildingName": enrich.get("buildingName"),
        "coordinates": {"lat": round(lat, 6), "lng": round(lng, 6)},
        "ownership": {
            "type": enrich.get("ownershipType", "full"),
            "entity": enrich.get("ownershipEntity", infer_entity(p.get("mit_owner_name", "MIT"))),
            "confidence": p.get("ownership_confidence", "confirmed"),
        },
        "category": enrich.get("category", infer_category(p)),
        "currentUse": enrich.get("currentUse", p.get("property_class")),
        "details": {
            "squareFootage": to_int(p.get("living_area_sqft", "")),
            "assessedValue": to_int(p.get("assessed_value", "")),
            "yearBuilt": to_int(p.get("year_built", "")),
            "lotSize": to_int(p.get("land_area_sqft", "")),
        },
        "description": enrich.get("description"),
        "historicalContext": enrich.get("historicalContext"),
        "sources": enrich.get("sources", ["Cambridge FY2026 Assessor"]),
        "lastUpdated": datetime.now().strftime("%Y-%m-%dT00:00:00.000Z"),
        "parcelGeometry": feat["geometry"],
        # Extra fields from assessor — useful in detail panel
        "assessorData": {
            "mapLot": ml,
            "ownerName": p.get("mit_owner_name"),
            "propertyClass": p.get("property_class"),
            "zoning": p.get("zoning"),
            "landAreaSqft": to_int(p.get("land_area_sqft", "")),
            "buildingValue": to_int(p.get("building_value", "")),
            "landValue": to_int(p.get("land_value", "")),
            "dataSource": p.get("data_source"),
        },
    }

    # Strip None values to keep JSON clean
    prop = {k: v for k, v in prop.items() if v is not None}
    prop["details"] = {k: v for k, v in prop["details"].items() if v is not None}
    prop["assessorData"] = {k: v for k, v in prop["assessorData"].items() if v is not None}

    return prop


def main():
    print("=== Building properties.json ===\n")

    with open(BASE_PARCELS) as f:
        base = json.load(f)

    enrichment = {}
    if os.path.exists(ENRICHMENT):
        with open(ENRICHMENT) as f:
            enrichment = json.load(f)
        print(f"Loaded {len(enrichment)} enrichment entries\n")
    else:
        print("No enrichment.json found — generating from assessor data only\n")

    properties = [
        build_property(feat, enrichment, i)
        for i, feat in enumerate(base["features"])
    ]

    with open(OUTPUT, "w") as f:
        json.dump(properties, f, indent=2)

    confirmed = sum(1 for p in properties if p["ownership"].get("confidence") == "confirmed")
    probable = sum(1 for p in properties if p["ownership"].get("confidence") == "probable")
    cats = {}
    for p in properties:
        c = p["category"]
        cats[c] = cats.get(c, 0) + 1

    print(f"✓ {len(properties)} properties written to {OUTPUT}")
    print(f"  confirmed: {confirmed}  probable: {probable}")
    print(f"  categories: {cats}")


if __name__ == "__main__":
    main()
