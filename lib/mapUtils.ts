import type { Property, PropertyCategory, OwnershipType } from './types';

// Color scheme for property categories (matches Figma legend)
export const CATEGORY_COLORS = {
  academic: '#ff4800',
  residential: '#9500ff',
  corporate: '#008cff',
} as const;

// Get marker color based on property category
export function getMarkerColor(category: PropertyCategory): string {
  return CATEGORY_COLORS[category];
}

// Get marker styling based on ownership type
export function getMarkerStyle(ownership: OwnershipType) {
  return ownership === 'full'
    ? { fill: 'solid' }
    : { fill: 'outlined', strokeWidth: 2 };
}

// Calculate map bounds to fit all properties
export function calculateBounds(properties: Property[]): [[number, number], [number, number]] | null {
  if (properties.length === 0) return null;

  const lngs = properties.map(p => p.coordinates.lng);
  const lats = properties.map(p => p.coordinates.lat);

  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ];
}

// Default map center (MIT campus)
export const DEFAULT_CENTER: [number, number] = [-71.0942, 42.3601];
export const DEFAULT_ZOOM = 13;
