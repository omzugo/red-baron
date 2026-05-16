#!/usr/bin/env python3
"""
Harvest all MIT/MITIMCo-owned parcels in Cambridge from public assessor data.

Strategy: join the FY2026 PropertyDatabase CSV (has owner names) with the
FY2026 Parcels GeoJSON (has geometries) on MapLot/ML key.

Output: lib/data/base_parcels.json — a GeoJSON FeatureCollection.
Run this script whenever Cambridge publishes new FY data.

--- GROUND LEASE NOTE (discovered via MIT 2023 990 Schedule R) ---
MIT uses a "Fee Owner LLC" + "Leasehold LLC" pair for each investment property.
The Fee Owner LLC appears in the Cambridge assessor as the OWNER.
However, for ground leases where a developer (e.g., BioMed Realty / BMR) built
on MIT land, the LEASEHOLDER is assessed for property taxes and appears as the
assessor OWNER instead. These parcels are NOT caught by the owner-name filter.

Known ground lease parcels (MIT fee owner, developer assessed):
  MapLot 54-19  - 270 Albany St   - BMR-270 ALBANY STREET LLC (MIT fee owner: same name LLC)
  MapLot 63-132 - 325 Vassar St   - BMR-325 VASSAR STREET LLC (MIT fee owner: MIT 325 Vassar St Fee Owner LLC)

These are added manually in base_parcels.json. To find more: review MIT's annual
990 Schedule R for "Disregarded Entities" with "Real Estate" activity, then look
up each address in the Cambridge assessor — if a non-MIT entity appears as owner,
it's a ground lease. Source: https://irs-efile-renderer.instrumentl.com/render?object_id=202501359349301830

MIT 2023 990 lists 113 real estate entities (56 Fee Owner + 57 Leasehold LLCs).
All Cambridge property-level entities start with "MIT " — no hidden LLC names.
Investment entities (MIT Private Equity, Cassini GP, etc.) are NOT real estate.
"""
import argparse
import csv
import io
import json
import os
import urllib.request

_parser = argparse.ArgumentParser(description="Find MIT parcels for a given fiscal year.")
_parser.add_argument("--year", type=int, default=2026, help="Fiscal year, e.g. 2024 (default: 2026)")
_args = _parser.parse_args()
YEAR = _args.year

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
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "lib", "data", f"base_parcels_fy{YEAR}.json")

# All patterns that identify MIT/MITIMCo ownership in the Owner_Name field.
# These were derived by scanning the full FY2026 PropertyDatabase — update as
# new LLCs are discovered (e.g. from 990 Schedule R or deed research).
MIT_OWNER_PATTERNS = [
    "MASSACHUSETTS INSTITUTE OF TECHNOLOGY",
    "MASSACHUSETTS INSTITUTE OF TECH",
    "MASSACHUSETTS INSTITUE OF TECHNOLOGY",  # typo in assessor data
    "MASS INST OF TECH",
    "MIT REAL ESTATE",
    "MIT VOLPE",
    "MIT WOMEN'S",
    "MIT 424-456 MASSACHUSETTS",
    "MIT 650 MAIN",
    "MIT 770/784/790",
    "MIT 139 MAIN",
    "MIT 300 THIRD",
    "MIT ONE BROADWAY",
    "MIT 350 MAIN",
    "MIT 620 MEMORIAL",
    "MIT 640 MEMORIAL",
    "MIT 882 MAIN",
    "MIT 750 MAIN",
    "MIT 117 WAVERLY",
    "MIT 142 WAVERLY",
    "MIT 7 LANDSDOWNE",
    "MIT 782 MAIN",
    "MIT 170/171 SIDNEY",
    "MIT 181 MASSACHUSETTS",
    "MIT 840 MAIN",
    "MIT 128 SIDNEY",
    "MIT 38 HENRY",
    "MIT 148 SIDNEY",
    "MIT 289 MASSACHUSETTS",
    "MIT 233 MASS",
    "MIT 730 MAIN",
    "MIT 266 MASSACHUSETTS",
    "MIT WEST 300 BLOCK",
    "MIT 149 SIDNEY",
    "MIT 149  SIDNEY",  # double-space variant in assessor data
    "MIT 415 MAIN",
    "MIT 119 PACIFIC",
    "MIT 99 ERIE",
    "MIT 130 BROOKLINE",
    "MIT 130 BROOKLNE",  # typo in assessor data
    "MIT 12 EMILY",
    "MIT 75 HAMILTON",
    "MIT 187 SIDNEY",
    "MIT 589 PUTNAM",
    "MIT 22 MAGAZINE",
    "MIT 165 MAIN",
    "MIT 238 MAIN",
    "MIT 1010 MASS",
    "MIT 1039 MASS",
    "BOATHOUSE/MIT",
]


def is_mit_owner(name: str) -> bool:
    n = name.upper().strip()
    return any(n.startswith(p.upper()) or p.upper() in n for p in MIT_OWNER_PATTERNS)


def ownership_confidence(name: str) -> str:
    n = name.upper().strip()
    if n.startswith("MASSACHUSETTS INST"):
        return "confirmed"
    return "probable"  # named MIT LLC — directly attributable but via subsidiary


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


def load_mit_csv_records(raw: bytes) -> dict:
    """Return dict keyed by MapLot → list of assessor rows (multiple units per lot)."""
    content = raw.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))
    result: dict = {}
    for row in reader:
        if is_mit_owner(row.get("Owner_Name", "")):
            lot = row["MapLot"].strip()
            result.setdefault(lot, []).append(row)
    return result


def load_parcels_index(raw: bytes) -> dict:
    """Return dict keyed by ML → GeoJSON feature."""
    data = json.loads(raw)
    return {f["properties"]["ML"]: f for f in data["features"] if f.get("geometry")}


def build_output(mit_records: dict, parcels_index: dict) -> dict:
    features = []
    unmatched = []

    # De-duplicate: one output feature per unique parcel geometry.
    # When multiple CSV rows share a MapLot (e.g. multi-unit), pick the primary
    # (non-unit) row if present, else the first.
    seen_ml = set()

    for map_lot, rows in sorted(mit_records.items()):
        # The GeoJSON ML key matches the base MapLot (without condo unit suffix).
        base_ml = map_lot.split("-")[0] + "-" + map_lot.split("-")[1] if map_lot.count("-") >= 1 else map_lot

        if base_ml in seen_ml:
            continue
        seen_ml.add(base_ml)

        feature = parcels_index.get(base_ml)
        if feature is None:
            unmatched.append(map_lot)
            continue

        # Pick the row that best represents this parcel (prefer no Unit suffix).
        primary = next((r for r in rows if not r.get("Unit", "").strip()), rows[0])

        props = dict(feature["properties"])
        props.update({
            "mit_owner_name": primary["Owner_Name"].strip(),
            "mit_owner_entity": primary.get("Owner_CoOwnerName", "").strip(),
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
            "ownership_confidence": ownership_confidence(primary["Owner_Name"]),
            "data_source": f"Cambridge FY{YEAR} Assessor",
            "map_lot": base_ml,
        })

        features.append({
            "type": "Feature",
            "geometry": feature["geometry"],
            "properties": props,
        })

    return {"type": "FeatureCollection", "features": features}, unmatched


def main():
    print("=== MIT Cambridge Parcel Harvester ===\n")

    print("Loading assessor CSV...")
    csv_raw = fetch(CSV_CACHE + ".dl", CSV_CACHE) if False else fetch(PROPERTY_DB_CSV_URL, CSV_CACHE)
    mit_records = load_mit_csv_records(csv_raw)
    print(f"  {sum(len(v) for v in mit_records.values())} MIT-owned records across {len(mit_records)} MapLot IDs\n")

    print("Loading parcel geometries...")
    geojson_raw = fetch(PARCEL_GEOJSON_URL, PARCEL_CACHE)
    parcels_index = load_parcels_index(geojson_raw)
    print(f"  {len(parcels_index)} total Cambridge parcels indexed\n")

    print("Joining and building output...")
    output, unmatched = build_output(mit_records, parcels_index)

    # Summary by confidence tier
    confirmed = sum(1 for f in output["features"] if f["properties"]["ownership_confidence"] == "confirmed")
    probable = sum(1 for f in output["features"] if f["properties"]["ownership_confidence"] == "probable")

    print(f"\n  {len(output['features'])} parcels matched")
    print(f"    confirmed (direct MIT):   {confirmed}")
    print(f"    probable (MIT LLC):        {probable}")
    if unmatched:
        print(f"    unmatched MapLots:         {len(unmatched)}")
        for ml in unmatched:
            print(f"      - {ml}")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n✓ Saved to {OUTPUT_FILE}")

    # Print owner name inventory for documentation
    print("\n--- Owner entity inventory ---")
    entity_counts: dict = {}
    for f in output["features"]:
        e = f["properties"]["mit_owner_name"]
        entity_counts[e] = entity_counts.get(e, 0) + 1
    for name, count in sorted(entity_counts.items(), key=lambda x: -x[1]):
        print(f"  {count:4d}  {name}")


if __name__ == "__main__":
    main()
