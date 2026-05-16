# Red Baron

An interactive map of MIT and Harvard real estate holdings across Cambridge and Boston, built for public transparency. Parcels are drawn from municipal assessor records and cross-referenced against IRS 990 filings to trace shell LLCs back to their beneficial owners.

**Live:** https://red-baron-steel.vercel.app

---

## What it shows

- **~500 parcels** owned by MIT and Harvard (or their subsidiaries), sourced from Cambridge and Boston assessor databases
- **Multi-year timeline** — toggle between FY2024 and FY2026 snapshots to see how holdings have changed
- **Ownership transparency** — shell LLCs and SPEs linked back to MIT/Harvard via IRS 990 Schedule R filings
- **Property filters** — by category (Academic, Residential, Corporate) and ownership structure (Direct vs. Subsidiary)
- **Search** — find named buildings (Media Lab, Harvard Law School, Peabody Terrace, etc.) or any street address
- **Parcel detail card** — assessed value, listed owner, property class, street view photo, and source link

## Tech stack

- **Next.js 16** (App Router, TypeScript)
- **Mapbox GL JS** via react-map-gl — satellite basemap with parcel polygon overlays
- **Tailwind CSS** — glass-morphism UI, custom keyframe animations
- **Libre Baskerville** via next/font/google

## Data pipeline

```
Cambridge/Boston assessor CSV      →  owner, map-lot ID, assessed value, property class
Cambridge/Boston assessor GeoJSON  →  polygon geometry per map-lot
                                   ↓
            scripts/findMITParcels.py / findHarvardParcels.py
            (filter rows by owner name → match to geometry → extract centroid)
                                   ↓
            IRS 990 Schedule R     →  resolve shell LLCs to beneficial owner
                                   ↓
            public/data/{institution}_fy{year}.json   ← what the app loads
```

**Sources:**
- [Cambridge Assessor FY2026 Parcels](https://github.com/cambridgegis/cambridgegis_data/tree/main/Assessing/FY2026/FY2026_Parcels)
- [Boston Assessor FY2026](https://gisportal.boston.gov/arcgis/rest/services/Assessing/PROPERTY_ASSESSMENT_PARCEL_JOIN_FY26/FeatureServer/0)
- IRS Form 990 Schedule R (MIT FY2023, Harvard FY2023)

## Local setup

```bash
git clone https://github.com/omgokhale/red-baron.git
cd red-baron
npm install
cp .env.local.example .env.local
# fill in your Mapbox token (and optionally Google Maps key for street view)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Required env vars:**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox satellite map + tile rendering |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Street View photos (optional) |

## Project structure

```
app/
  page.tsx              # Main page — institution toggle, filters, search, layout
  layout.tsx            # Fonts, metadata
  globals.css           # Tailwind theme, keyframe animations
components/
  Map/PropertyMap.tsx         # Mapbox map, parcel GeoJSON layers, fly-to logic
  PropertyDetails/
    PropertyInfoCard.tsx      # Sliding detail card (blur-in animation)
lib/
  types.ts              # Property, PropertyFilters, etc.
  mapUtils.ts           # Marker color by category
public/data/            # App data (loaded at runtime)
  mit_fy2024.json
  mit_fy2026.json
  harvard_fy2024.json
  harvard_fy2026.json
scripts/                # Data pipeline (Python + TypeScript)
  findMITParcels.py
  findHarvardParcels.py
  buildProperties.py
  buildHarvardProperties.py
```

## License

MIT
