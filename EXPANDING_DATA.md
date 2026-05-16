# Expanding the MIT Property Dataset

## Current Status
- **8 properties** manually curated (6 with real parcel boundaries)
- **Partial coverage** of MIT's ~150+ property portfolio

## Data Collection Strategy

### Phase 1: Automated Cambridge Scraping (High Priority)

**Search Cambridge property database for MIT-owned parcels:**

1. **Visit Cambridge Property Database**
   - https://www.cambridgema.gov/iwantto/viewthepropertydatabase
   - Search by owner: "Massachusetts Institute of Technology"
   - Also try: "MIT", "M.I.T.", "Mass Inst Tech", "MIT Investment Management"

2. **Collect all Map/Lot IDs** from search results
   - The parcel data we have includes ML (Map-Lot) IDs like "52A-21"
   - Cross-reference with our existing parcels in `lib/data/mit_parcels.json`

3. **Extract addresses and details** for each parcel

4. **Automated Approach** (Recommended):
   ```python
   # Modify scripts/findMITParcels.py to:
   # 1. Load all Cambridge parcels
   # 2. Filter by owner name in property tax data
   # 3. Export all MIT parcels with metadata
   ```

### Phase 2: Boston Properties

1. **Boston Assessing Database**
   - https://www.boston.gov/departments/assessing/property-data-and-information
   - Search for MIT-owned properties in Boston
   - Fewer properties, but includes some research facilities

2. **Download Boston parcel data**
   - Similar GIS data available for Boston
   - Merge with Cambridge parcels

### Phase 3: MITIMCo Properties

**Cross-reference with publicly disclosed holdings:**

1. **Known major developments** (from MITIMCo website):
   - Kendall Square (multiple parcels)
   - University Park complex
   - Osborn Triangle (680,000 sq ft)
   - Volpe redevelopment site (10 acres)
   - Technology Square buildings

2. **Search for these specific addresses** in property databases

3. **Categorize by ownership entity:**
   - Direct MIT ownership
   - MITIMCo holdings
   - Joint ventures (partial ownership)

### Phase 4: Geocoding & Enrichment

Once you have addresses:

```bash
# 1. Add addresses to CSV
# 2. Run geocoding
npm run geocode

# 3. Match to parcels spatially
python3 scripts/findMITParcels.py

# 4. Enrich with categories and details
npm run enrich
```

### Phase 5: Manual Categorization

For each property, determine:
- **Category**: Academic / Residential / Corporate
- **Current Use**: Specific building function
- **Ownership type**: Full / Partial
- **Historical context**: When acquired, significance

## Data Sources Reference

### Official Sources
1. **Cambridge GIS Data**: https://github.com/cambridgegis/cambridgegis_data
2. **MassGIS Property Data**: https://gis.data.mass.gov/
3. **Cambridge Assessing**: https://www.cambridgema.gov/iwantto/viewthepropertydatabase
4. **Boston Assessing**: https://www.boston.gov/departments/assessing/
5. **MITIMCo**: https://mitimco.org/ (for development portfolio)

### Supplementary Sources
- MIT Campus Map: https://whereis.mit.edu/
- MIT Annual Reports (property acquisitions)
- News archives (major purchases)
- Cambridge planning documents

## Automation Opportunities

### Create a scraper for Cambridge/Boston databases:

```typescript
// scripts/autoScrapeAll.ts
// 1. Query Cambridge API for all MIT-owned parcels
// 2. Filter parcel data by owner name
// 3. Geocode any missing coordinates
// 4. Auto-categorize by neighborhood/use
// 5. Generate properties.json
```

### Data validation:

```typescript
// scripts/validateData.ts
// - Check all properties have coordinates
// - Verify parcel geometries are valid
// - Ensure categories are assigned
// - Flag missing data for manual review
```

## Estimated Coverage

**MIT's Real Estate Portfolio:**
- ~150 buildings on main campus
- ~50+ commercial/investment properties
- ~20+ residential facilities
- ~30+ in Kendall Square area

**Achievable Goals:**
- **Quick win** (1-2 hours): 30-50 properties with full data
- **Comprehensive** (1 day): 100+ properties
- **Complete** (ongoing): All ~250+ MIT holdings

## Quality over Quantity

**Prioritize:**
1. ✅ Accurate parcel boundaries
2. ✅ Proper categorization
3. ✅ Complete ownership information
4. ✅ Historical context for major properties

**Nice to have:**
- Building photos (can source from Google Street View API)
- Square footage data
- Acquisition dates
- Assessed values

## Next Immediate Steps

1. [ ] Search Cambridge database for all MIT properties
2. [ ] Create list of Map/Lot IDs
3. [ ] Write script to extract MIT parcels from full dataset by owner name
4. [ ] Add ~30 most significant properties manually
5. [ ] Deploy updated map
6. [ ] Iterate and expand coverage

## Contribution Guide

To add new properties:

1. Add to CSV in `scripts/output/scraped-properties.csv`
2. Run `npm run geocode`
3. Run `python3 scripts/findMITParcels.py`
4. Run `npm run enrich`
5. Review and deploy

## Future Enhancements

- **Admin interface** for adding/editing properties
- **Database migration** (PostgreSQL) for easier updates
- **API integration** with city property databases
- **Automated monthly updates** from public data sources
