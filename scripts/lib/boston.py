"""
Shared utilities for fetching Boston assessor data and parcel geometries.

PRIMARY SOURCE — FY26 Assessment-Parcel Join FeatureServer:
  gisportal.boston.gov/.../Assessing/PROPERTY_ASSESSMENT_PARCEL_JOIN_FY26/FeatureServer/0
  Contains FY2026 assessor data PRE-JOINED with parcel geometry. Returns both
  in one query. Owner names are FULL length (no truncation). This is the
  preferred source for all new work.
  Use: fetch_fy26_features()

LEGACY SOURCE — CKAN API + Parcels24 (kept for reference / MIT use):
  The Boston assessor CKAN API (data.boston.gov) truncates OWNER to 28 chars.
  Parcels24 MapServer provides geometry separately, joined by GIS_ID.
  CKAN data is undated and may lag behind current assessments significantly.
  Use: load_all_records() + fetch_geometries() + build_features()

Coverage notes:
  This module covers Boston proper only. Known gaps:
    - Somerville: borders Cambridge; unlikely but unverified.
    - Brookline: Harvard athletic facilities border Brookline; unverified.
  Check Harvard's 990 Schedule R (EIN 04-2103580) for any entities with
  Somerville/Brookline addresses before assuming no holdings there.
"""

import json
import os
import urllib.request
import urllib.parse

BOSTON_ASSESSOR_API = "https://data.boston.gov/api/3/action/datastore_search"
BOSTON_ASSESSOR_RESOURCE = "062fc6fa-b5ff-4270-86cf-202225e40858"
BOSTON_ARCGIS = (
    "https://gisportal.boston.gov/arcgis/rest/services"
    "/Parcels/Parcels24/MapServer/0/query"
)

# Only cache the fields we use — keeps the cache file small (~5MB vs ~100MB).
SLIM_FIELDS = [
    "GIS_ID", "PID", "OWNER", "MAIL_ADDRESSEE",
    "ST_NUM", "ST_NAME", "ST_NAME_SUF", "UNIT_NUM", "ZIPCODE",
    "PTYPE", "LU", "OWN_OCC",
    "AV_LAND", "AV_BLDG", "AV_TOTAL",
    "LAND_SF", "YR_BUILT", "GROSS_AREA", "LIVING_AREA", "NUM_FLOORS",
]


def load_all_records(cache_path: str) -> list:
    """
    Return all Boston assessor records as a list of slim dicts (SLIM_FIELDS only).
    Downloads ~170k records on first call, caches locally for subsequent runs.
    Delete the cache file to force a fresh download.
    """
    if os.path.exists(cache_path):
        print(f"  (cached) {os.path.basename(cache_path)}")
        with open(cache_path) as f:
            return json.load(f)

    print("  downloading Boston assessor (~170k records, takes ~30s)...")
    all_records = []
    offset = 0
    limit = 10000

    while True:
        url = f"{BOSTON_ASSESSOR_API}?resource_id={BOSTON_ASSESSOR_RESOURCE}&limit={limit}&offset={offset}"
        with urllib.request.urlopen(url, timeout=60) as r:
            data = json.loads(r.read())

        records = data["result"]["records"]
        if not records:
            break

        for rec in records:
            all_records.append({k: rec.get(k) for k in SLIM_FIELDS})

        offset += len(records)
        total = data["result"]["total"]
        print(f"    {offset}/{total}", end="\r")
        if offset >= total:
            break

    print(f"  downloaded {len(all_records)} records")
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w") as f:
        json.dump(all_records, f)

    return all_records


def fetch_geometries(gis_ids: list, cache_path: str) -> dict:
    """
    Fetch parcel polygon geometries from Boston ArcGIS for the given GIS_IDs.
    Returns dict: GIS_ID (no trailing underscore) → GeoJSON geometry dict.

    Results are cached. New IDs are fetched and merged into the existing cache,
    so incremental runs only download what's missing.
    """
    # Load existing cache
    cache: dict = {}
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            cache = json.load(f)

    needed = [gid for gid in gis_ids if gid not in cache]
    if not needed:
        return cache

    print(f"  fetching {len(needed)} Boston parcel geometries from ArcGIS...")
    CHUNK = 200  # ArcGIS max per request is typically 1000, but 200 is safe

    for i in range(0, len(needed), CHUNK):
        chunk = needed[i : i + CHUNK]
        id_clause = "','".join(chunk)
        params = urllib.parse.urlencode({
            "where": f"MAP_PAR_ID IN ('{id_clause}')",
            "outFields": "MAP_PAR_ID",
            "f": "geojson",
            "outSR": "4326",
        })
        url = f"{BOSTON_ARCGIS}?{params}"
        with urllib.request.urlopen(url, timeout=60) as r:
            geo = json.loads(r.read())

        for feature in geo.get("features", []):
            gis_id = (feature["properties"].get("MAP_PAR_ID") or "").strip()
            if gis_id and feature.get("geometry"):
                cache[gis_id] = feature["geometry"]

        print(f"    {min(i + CHUNK, len(needed))}/{len(needed)}", end="\r")

    print(f"  geometries fetched: {len(cache)} total in cache")

    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    with open(cache_path, "w") as f:
        json.dump(cache, f)

    return cache


def compose_address(rec: dict) -> str:
    """Build a single address string from Boston assessor's split fields."""
    parts = [
        (rec.get("ST_NUM") or "").strip(),
        (rec.get("ST_NAME") or "").strip(),
        (rec.get("ST_NAME_SUF") or "").strip(),
    ]
    street = " ".join(p for p in parts if p)
    unit = (rec.get("UNIT_NUM") or "").strip()
    if unit:
        street = f"{street} Unit {unit}"
    return f"{street}, Boston MA" if street else "Unknown, Boston MA"


def build_features(
    records: list,
    geometries: dict,
    confidence_fn,
    owner_field_name: str,
    data_source: str = "Boston Assessor (data.boston.gov)",
) -> tuple:
    """
    Build GeoJSON features from filtered Boston assessor records + geometries.

    Args:
        records:          All slim Boston assessor records (170k).
        geometries:       GIS_ID → geometry dict (from fetch_geometries).
        confidence_fn:    (owner_str) -> "confirmed"|"probable"|"suspected"|None.
                          Return None to exclude the record.
        owner_field_name: Key to store the owner name under (e.g. "harvard_owner_name").
        data_source:      Label for the data_source property.

    Returns:
        (features, unmatched) where features is a list of GeoJSON Feature dicts
        and unmatched is a list of GIS_IDs that had no geometry.
    """
    # 1. Filter records and group by GIS_ID (handle multi-unit condos)
    matched: dict = {}  # GIS_ID → list of (record, confidence)
    for rec in records:
        owner = (rec.get("OWNER") or "").strip()
        confidence = confidence_fn(owner)
        if confidence is None:
            continue
        gis_id = (rec.get("GIS_ID") or "").strip().rstrip("_")
        if not gis_id:
            continue
        matched.setdefault(gis_id, []).append((rec, confidence))

    # 2. Build features, one per GIS_ID
    features = []
    unmatched = []

    for gis_id, rows in sorted(matched.items()):
        geometry = geometries.get(gis_id)
        if geometry is None:
            unmatched.append(gis_id)
            continue

        # Pick the primary row: prefer no unit number (like Cambridge pipeline)
        primary, confidence = next(
            ((r, c) for r, c in rows if not (r.get("UNIT_NUM") or "").strip()),
            rows[0],
        )

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                owner_field_name: (primary.get("OWNER") or "").strip(),
                "address": compose_address(primary),
                "property_class": (primary.get("PTYPE") or "").strip(),
                "zoning": (primary.get("LU") or "").strip(),
                "land_area_sqft": (primary.get("LAND_SF") or "").strip(),
                "assessed_value": (primary.get("AV_TOTAL") or "").strip(),
                "building_value": (primary.get("AV_BLDG") or "").strip(),
                "land_value": (primary.get("AV_LAND") or "").strip(),
                "year_built": (primary.get("YR_BUILT") or "").strip(),
                "num_stories": (primary.get("NUM_FLOORS") or "").strip(),
                "living_area_sqft": (primary.get("GROSS_AREA") or "").strip(),
                "ownership_confidence": confidence,
                "data_source": data_source,
                "map_lot": gis_id,   # GIS_ID used as generic parcel ID
                "city": "boston",
            },
        })

    return features, unmatched


# ── FY26 Assessment-Parcel Join FeatureServer ──────────────────────────────────

FY26_SERVICE = (
    "https://gisportal.boston.gov/arcgis/rest/services"
    "/Assessing/PROPERTY_ASSESSMENT_PARCEL_JOIN_FY26/FeatureServer/0/query"
)

# Map FY26 field names → base-parcel property names (matches Cambridge schema).
FY26_FIELD_MAP = {
    "OWNER":        "owner_name",       # caller renames to harvard_owner_name etc.
    "FULL_ADDRESS": "address",
    "LU_DESC":      "property_class",   # human-readable land use description
    "LU":           "zoning",           # land use code (R1, A, C, E, …)
    "TOTAL_VALUE":  "assessed_value",
    "BLDG_VALUE":   "building_value",
    "LAND_VALUE":   "land_value",
    "LAND_SF":      "land_area_sqft",
    "YR_BUILT":     "year_built",
    "LIVING_AREA":  "living_area_sqft",
    "GIS_ID":       "map_lot",
}


def fetch_fy26_features(
    where_clause: str,
    confidence_fn,
    owner_field_name: str,
    cache_path: str,
    data_source: str = "Boston FY2026 Assessor (gisportal.boston.gov)",
) -> tuple:
    """
    Query the FY26 Assessment-Parcel Join FeatureServer and return GeoJSON features.

    Args:
        where_clause:     SQL WHERE clause to filter by owner name. Use full
                          (non-truncated) names — the FY26 OWNER field has no
                          28-char limit. Example:
                            "OWNER LIKE 'HARVARD REAL ESTATE%'
                             OR OWNER LIKE 'PRESIDENT%HARVARD%'"
        confidence_fn:    (owner_str) -> "confirmed"|"probable"|"suspected"|None.
                          Return None to exclude a record that matches the WHERE
                          clause but isn't actually the target institution.
        owner_field_name: Property key for the owner name in output features,
                          e.g. "harvard_owner_name".
        cache_path:       Path to cache the raw GeoJSON response. Delete to refresh.
        data_source:      Label stored in each feature's data_source property.

    Returns:
        (features, no_geometry) — features is a list of GeoJSON Feature dicts
        with geometry included. no_geometry lists GIS_IDs that the service
        returned without a polygon (rare exempt/easement parcels).
    """
    # Load from cache if available
    if os.path.exists(cache_path):
        print(f"  (cached) {os.path.basename(cache_path)}")
        with open(cache_path) as f:
            raw_features = json.load(f)
    else:
        print(f"  querying FY26 Boston assessment-parcel service...")
        params = urllib.parse.urlencode({
            "where": where_clause,
            "outFields": ",".join(FY26_FIELD_MAP.keys()) + ",UNIT_NUM",
            "f": "geojson",
            "outSR": "4326",
            "resultRecordCount": 5000,   # well above any realistic match count
        })
        with urllib.request.urlopen(f"{FY26_SERVICE}?{params}", timeout=60) as r:
            geo = json.loads(r.read())

        raw_features = geo.get("features", [])
        print(f"  {len(raw_features)} raw records returned")

        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w") as f:
            json.dump(raw_features, f)

    # Group by GIS_ID to deduplicate condo units
    grouped: dict = {}  # GIS_ID → list of (properties_dict, confidence, geometry)
    for feat in raw_features:
        props = feat.get("properties") or {}
        owner = (props.get("OWNER") or "").strip()
        confidence = confidence_fn(owner)
        if confidence is None:
            continue
        gis_id = str(props.get("GIS_ID") or "").strip().rstrip("_")
        if not gis_id:
            continue
        grouped.setdefault(gis_id, []).append((props, confidence, feat.get("geometry")))

    features = []
    no_geometry = []

    for gis_id, rows in sorted(grouped.items()):
        # For condos, multiple institution-owned units share one GIS_ID.
        # Use the highest-value row for metadata; sum all values for total.
        rows_by_value = sorted(
            rows,
            key=lambda r: (r[0].get("TOTAL_VALUE") or 0),
            reverse=True,
        )
        primary_props, confidence, geometry = rows_by_value[0]
        total_value = sum(r[0].get("TOTAL_VALUE") or 0 for r in rows)
        total_building = sum(r[0].get("BLDG_VALUE") or 0 for r in rows)
        total_land = sum(r[0].get("LAND_VALUE") or 0 for r in rows)

        if not geometry:
            no_geometry.append(gis_id)
            continue

        # Compose address: FY26 already provides FULL_ADDRESS
        address = (primary_props.get("FULL_ADDRESS") or "").strip()
        if not address:
            address = "Unknown, Boston MA"

        feature_props = {
            owner_field_name: (primary_props.get("OWNER") or "").strip(),
            "address": address,
            "property_class": (primary_props.get("LU_DESC") or "").strip(),
            "zoning": (primary_props.get("LU") or "").strip(),
            "assessed_value": str(total_value or ""),
            "building_value": str(total_building or ""),
            "land_value": str(total_land or ""),
            "land_area_sqft": str(primary_props.get("LAND_SF") or ""),
            "year_built": str(primary_props.get("YR_BUILT") or ""),
            "living_area_sqft": str(primary_props.get("LIVING_AREA") or ""),
            "ownership_confidence": confidence,
            "data_source": data_source,
            "map_lot": gis_id,
            "city": "boston",
        }

        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": feature_props,
        })

    return features, no_geometry
