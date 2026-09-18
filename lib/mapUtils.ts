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

// All-caps words that should stay all-caps: US state codes + common entity suffixes
const KEEP_CAPS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC','LLC','LLP','INC','CORP','US','USA','PO',
]);

// Convert each all-caps word individually; leave mixed-case words untouched
export function toTitleCase(str: string): string {
  return str.replace(/\b[A-Z]{2,}\b/g, word =>
    KEEP_CAPS.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()
  );
}

export function formatCurrency(n: number | undefined): string | null {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}
