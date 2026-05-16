'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Map, { Layer, Source } from 'react-map-gl/mapbox';
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox';
import type * as GeoJSON from 'geojson';
import type { Property, PropertyFilters } from '@/lib/types';
import { getMarkerColor } from '@/lib/mapUtils';
import 'mapbox-gl/dist/mapbox-gl.css';

type Institution = 'mit' | 'harvard';

// Cluster centers (Harvard Longwood outliers excluded)
const INSTITUTION_VIEWS: Record<Institution, { center: [number, number]; zoom: number }> = {
  mit:     { center: [-71.101, 42.360], zoom: 14.2 },
  harvard: { center: [-71.125, 42.369], zoom: 14.0 },
};

interface PropertyMapProps {
  properties: Property[];
  filters: PropertyFilters;
  selectedProperty: Property | null;
  onPropertySelect: (property: Property) => void;
  focusedPropertyId?: string | null;
  institution: Institution;
  resetViewTrigger?: number;
  onUserMove?: () => void;
  onDeselect?: () => void;
}



function isShellEntity(entity: string): boolean {
  const u = entity.toUpperCase();
  return u.includes('LLC') || u.includes(' SPE') || u.includes(' INC') || u.includes('CORP') || u.includes('HOLDING');
}

export default function PropertyMap({
  properties,
  filters,
  selectedProperty,
  onPropertySelect,
  focusedPropertyId,
  institution,
  resetViewTrigger,
  onUserMove,
  onDeselect,
}: PropertyMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(() => {
    const { center, zoom } = INSTITUTION_VIEWS[institution];
    return { longitude: center[0], latitude: center[1], zoom, pitch: 0, bearing: 0 };
  });
  const [hoveredPropertyId, setHoveredPropertyId] = useState<string | null>(null);

  const filteredProperties = useMemo(() => {
    return properties.filter(property => {
      if (filters.categories.length > 0 && !filters.categories.includes(property.category)) {
        return false;
      }
      if (filters.entityTypes.length > 0) {
        const entityIsShell = isShellEntity(property.ownership.entity);
        const entityType = entityIsShell ? 'shell' : 'direct';
        if (!filters.entityTypes.includes(entityType)) return false;
      }
      return true;
    });
  }, [properties, filters]);

  const parcelBoundariesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: filteredProperties
      .filter(p => p.parcelGeometry)
      .map(property => ({
        type: 'Feature' as const,
        id: property.id,
        properties: {
          id: property.id,
          category: property.category,
          confidence: property.ownership.confidence,
          color: getMarkerColor(property.category),
        },
        geometry: property.parcelGeometry as GeoJSON.Geometry,
      })),
  }), [filteredProperties]);

  // Smooth fly to institution cluster when toggling MIT ↔ Harvard
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const { center, zoom } = INSTITUTION_VIEWS[institution];
    mapRef.current?.flyTo({ center, zoom, duration: 1600, essential: true });
  }, [institution]);

  // Fly to default institution view when parent triggers a reset
  useEffect(() => {
    if (!resetViewTrigger) return;
    const { center, zoom } = INSTITUTION_VIEWS[institution];
    mapRef.current?.flyTo({ center, zoom, duration: 1200, essential: true });
  }, [resetViewTrigger]);

  // Smooth zoom into a selected property
  useEffect(() => {
    if (!focusedPropertyId) return;
    const property = properties.find(p => p.id === focusedPropertyId);
    if (!property) return;
    mapRef.current?.flyTo({
      center: [property.coordinates.lng, property.coordinates.lat],
      zoom: 16,
      duration: 1200,
    });
  }, [focusedPropertyId, properties]);

  const handleMapClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) { onDeselect?.(); return; }
    const property = properties.find(p => p.id === feature.properties?.id);
    if (property) onPropertySelect(property);
  }, [properties, onPropertySelect, onDeselect]);

  const handleMouseEnter = useCallback((event: MapMouseEvent) => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = 'pointer';
    const id = event.features?.[0]?.properties?.id || null;
    setHoveredPropertyId(id);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    setHoveredPropertyId(null);
  }, []);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-full bg-muted">
        <div className="text-center p-8">
          <h3 className="text-lg font-semibold mb-2">Mapbox Token Required</h3>
          <code className="text-xs bg-background px-3 py-2 rounded">NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here</code>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        mapboxAccessToken={mapboxToken}
        minZoom={13}
        interactiveLayerIds={['building-fills', 'building-outlines']}
        onClick={handleMapClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMoveStart={(evt) => { if ((evt as any).originalEvent) onUserMove?.(); }}
      >
        <Source id="parcels" type="geojson" data={parcelBoundariesGeoJSON}>
          <Layer
            id="building-fills"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': [
                'case',
                ['==', ['get', 'id'], selectedProperty?.id || ''], 0.65,
                ['==', ['get', 'id'], hoveredPropertyId || ''], 0.5,
                ['==', ['get', 'confidence'], 'confirmed'], 0.32,
                ['==', ['get', 'confidence'], 'probable'], 0.2,
                0.12
              ]
            }}
          />
          <Layer
            id="building-outlines"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': [
                'case',
                ['==', ['get', 'id'], selectedProperty?.id || ''], 3,
                ['==', ['get', 'id'], hoveredPropertyId || ''], 2.5,
                1.5
              ],
              'line-opacity': 0.95
            }}
          />
        </Source>
      </Map>

      {/* Edge blur — backdrop-filter masked to edges only */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backdropFilter: 'blur(7px)',
          WebkitBackdropFilter: 'blur(7px)',
          maskImage: 'radial-gradient(ellipse at center, transparent 32%, black 62%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 32%, black 62%)',
        }}
      />
      {/* Vignette — smooth darkening on top of the blur */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 28%, rgba(0,0,0,0.18) 50%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.82) 88%)',
        }}
      />
    </div>
  );
}
