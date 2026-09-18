export type OwnershipConfidence = 'confirmed' | 'probable' | 'suspected';

export interface Property {
  id: string;
  address: string;
  buildingName?: string;
  aliases?: string[]; // colloquial/informal names people might search for (nicknames, abbreviations, former names)
  coordinates: {
    lat: number;
    lng: number;
  };

  ownership: {
    type: 'full' | 'partial';
    entity: string; // "MIT", "MITIMCo", subsidiary name
    acquiredDate?: string;
    confidence: OwnershipConfidence;
  };

  category: 'academic' | 'residential' | 'corporate';
  currentUse?: string; // "Laboratory", "Graduate Housing", etc.

  details: {
    squareFootage?: number;
    assessedValue?: number;
    yearBuilt?: number;
    lotSize?: number;
  };

  photos?: string[];
  description?: string;
  historicalContext?: string;

  sources: string[];
  lastUpdated: string;

  // Real parcel boundary geometry (if available)
  parcelGeometry?: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };

  // Raw fields from Cambridge/Boston assessor, preserved for display
  assessorData?: {
    mapLot?: string;
    ownerName?: string;
    propertyClass?: string;
    zoning?: string;
    landAreaSqft?: number;
    buildingValue?: number;
    landValue?: number;
    dataSource?: string;
  };
}

export type OwnershipType = 'full' | 'partial';
export type PropertyCategory = 'academic' | 'residential' | 'corporate';

export type EntityType = 'direct' | 'shell';

export interface PropertyFilters {
  ownership: OwnershipType[];
  categories: PropertyCategory[];
  entityTypes: EntityType[];
  searchQuery: string;
}
