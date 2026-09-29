'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Map, { Layer, Source } from 'react-map-gl/mapbox';
import type { MapRef, MapMouseEvent } from 'react-map-gl/mapbox';
import type * as GeoJSON from 'geojson';
import type { Property, PropertyFilters } from '@/lib/types';
import { getMarkerColor, toTitleCase, formatCurrency } from '@/lib/mapUtils';
import 'mapbox-gl/dist/mapbox-gl.css';

type Institution = 'mit' | 'harvard';

// Cluster centers (Harvard Longwood outliers excluded)
const INSTITUTION_VIEWS: Record<Institution, { center: [number, number]; zoom: number }> = {
  mit:     { center: [-71.101, 42.360], zoom: 14.2 },
  harvard: { center: [-71.125, 42.369], zoom: 14.0 },
};

// Ctrl+drag (or right-click drag) tilts the map — capped subtly, bearing stays locked north
const MAX_PITCH = 45;

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
  onReady?: () => void;
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
  onReady,
}: PropertyMapProps) {
  const mapRef = useRef<MapRef>(null);
  const hasFiredReady = useRef(false);
  const handleIdle = useCallback(() => {
    if (hasFiredReady.current) return;
    hasFiredReady.current = true;
    onReady?.();
  }, [onReady]);
  const [viewState, setViewState] = useState(() => {
    const { center, zoom } = INSTITUTION_VIEWS[institution];
    return { longitude: center[0], latitude: center[1], zoom, pitch: 0, bearing: 0 };
  });
  const [hoveredPropertyId, setHoveredPropertyId] = useState<string | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; label: string; value: string | null } | null>(null);

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

  // Focus mask: black over the whole world with the selected parcel cut out. The last
  // selection is kept so the mask can fade out in place after deselecting.
  const lastSelectedGeometry = useRef<GeoJSON.Geometry | null>(null);
  if (selectedProperty) {
    lastSelectedGeometry.current = (selectedProperty.parcelGeometry as GeoJSON.Geometry | undefined) ?? null;
  }
  const focusMaskGeoJSON = useMemo(() => {
    const geom = lastSelectedGeometry.current;
    const holes =
      geom?.type === 'Polygon' ? [geom.coordinates[0]] :
      geom?.type === 'MultiPolygon' ? geom.coordinates.map(poly => poly[0]) :
      [];
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes],
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProperty?.id]);

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

  // Smooth zoom into a selected property: fit the whole parcel inside the sharp (un-vignetted)
  // centre and clear of the info card, but never closer than the old fixed zoom of 16
  useEffect(() => {
    if (!focusedPropertyId) return;
    const property = properties.find(p => p.id === focusedPropertyId);
    const map = mapRef.current;
    if (!property || !map) return;

    const geom = property.parcelGeometry as GeoJSON.Geometry | undefined;
    const rings =
      geom?.type === 'Polygon' ? geom.coordinates :
      geom?.type === 'MultiPolygon' ? geom.coordinates.flat() :
      null;
    if (!rings) {
      map.flyTo({ center: [property.coordinates.lng, property.coordinates.lat], zoom: 16, duration: 1200 });
      return;
    }

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const [lng, lat] of rings.flat()) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }

    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const INFO_CARD_CLEARANCE = 360 + 60; // card width + its margin and a little air
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], {
      padding: {
        top: h * 0.22,
        bottom: h * 0.22,
        left: w * 0.22,
        right: Math.max(w * 0.22, INFO_CARD_CLEARANCE),
      },
      maxZoom: 16,
      duration: 1200,
    });
  }, [focusedPropertyId, properties]);

  const handleMapClick = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) { onDeselect?.(); return; }
    const property = properties.find(p => p.id === feature.properties?.id);
    if (!property) return;
    // Clicking the already-selected parcel toggles it off
    if (property.id === selectedProperty?.id) onDeselect?.();
    else onPropertySelect(property);
  }, [properties, selectedProperty?.id, onPropertySelect, onDeselect]);

  const handleMouseMove = useCallback((event: MapMouseEvent) => {
    const feature = event.features?.[0];
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = feature ? 'pointer' : '';
    const id = feature?.properties?.id || null;
    setHoveredPropertyId(id);
    if (!id) { setHoverTooltip(null); return; }
    const property = properties.find(p => p.id === id);
    const label = toTitleCase(property?.buildingName || property?.address || '');
    const value = formatCurrency(property?.assessorData?.landValue);
    setHoverTooltip({ x: event.point.x, y: event.point.y, label, value });
  }, [properties]);

  const handleMouseLeave = useCallback(() => {
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    setHoveredPropertyId(null);
    setHoverTooltip(null);
  }, []);

  // Allow Ctrl/right-click drag to tilt (pitch) the map, but lock bearing so it never rotates off north
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.on('rotate', () => {
      if (map.getBearing() !== 0) map.setBearing(0);
    });
  }, []);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!mapboxToken) handleIdle();
  }, [mapboxToken, handleIdle]);

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
    <div className="h-full w-full relative overflow-hidden">
      {/* Oversized so the floating drift never reveals an edge; translate-only so Mapbox hit-testing stays exact */}
      <div className="absolute -inset-6 camera-float">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        mapboxAccessToken={mapboxToken}
        minZoom={13}
        minPitch={0}
        maxPitch={MAX_PITCH}
        interactiveLayerIds={['building-fills', 'building-outlines']}
        onClick={handleMapClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMoveStart={(evt) => { if ((evt as any).originalEvent) onUserMove?.(); }}
        onLoad={handleMapLoad}
        onIdle={handleIdle}
      >
        <Source id="parcels" type="geojson" data={parcelBoundariesGeoJSON}>
          <Layer
            id="building-fills"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': [
                'case',
                // Selected parcel: no fill — the focus mask around it does the highlighting
                ['==', ['get', 'id'], selectedProperty?.id || ''], 0,
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

        {/* Dims everything except the selected parcel. Not in interactiveLayerIds, so
            the faded parcels underneath stay clickable. */}
        <Source id="focus-mask" type="geojson" data={focusMaskGeoJSON}>
          <Layer
            id="focus-mask"
            type="fill"
            paint={{
              'fill-color': '#000',
              'fill-opacity': selectedProperty ? 0.55 : 0,
              'fill-opacity-transition': { duration: 400, delay: 0 },
            }}
          />
        </Source>

        {/* Selected outline redrawn above the mask so its outer half isn't dimmed */}
        <Layer
          id="selected-outline"
          type="line"
          source="parcels"
          filter={['==', ['get', 'id'], selectedProperty?.id || '']}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 3,
            'line-opacity': 0.95,
          }}
        />
      </Map>

      {/* Hover tooltip — parcel name/address + estimated land value */}
      {hoverTooltip && (
        <div
          className="absolute z-10 pointer-events-none rounded-full px-3 py-1.5 text-white text-[12px] leading-none whitespace-nowrap bg-black/10 backdrop-blur-[50px] border border-white/[0.07]"
          style={{
            left: hoverTooltip.x + 14,
            top: hoverTooltip.y,
            transform: 'translateY(-50%)',
            fontFamily: 'var(--font-hedvig-sans), "Hedvig Letters Sans", sans-serif',
            boxShadow: 'none',
          }}
        >
          {hoverTooltip.label}
          {hoverTooltip.value && <span className="ml-1.5 opacity-50">{hoverTooltip.value}</span>}
        </div>
      )}
      </div>

      {/* Edge blur — three staggered masked layers stacked so blur keeps compounding
          toward the outer edge instead of capping at one fixed radius. Still 0 at center. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          maskImage: 'radial-gradient(ellipse at center, transparent 46%, black 68%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 46%, black 68%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          maskImage: 'radial-gradient(ellipse at center, transparent 58%, black 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 58%, black 80%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backdropFilter: 'blur(26px)',
          WebkitBackdropFilter: 'blur(26px)',
          maskImage: 'radial-gradient(ellipse at center, transparent 70%, black 93%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, transparent 70%, black 93%)',
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
