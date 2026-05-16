/**
 * Geocoding Script
 *
 * Converts addresses to lat/lng coordinates using Mapbox Geocoding API
 * Reads from scraped-properties.csv and outputs geocoded-properties.json
 */

import { readFile, writeFile } from 'fs/promises';
import { parse } from 'csv-parse/sync';

interface PropertyToGeocode {
  address: string;
  owner: string;
  assessedValue?: string;
  yearBuilt?: string;
  squareFootage?: string;
  lotSize?: string;
  source: string;
}

interface GeocodedProperty extends PropertyToGeocode {
  lat: number;
  lng: number;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN) {
    console.error('NEXT_PUBLIC_MAPBOX_TOKEN environment variable not set');
    console.log('Get your token from: https://account.mapbox.com/access-tokens/');
    process.exit(1);
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error(`Failed to geocode ${address}:`, error);
    return null;
  }
}

async function main() {
  console.log('Geocoding Properties\n');

  // Read CSV
  const csvContent = await readFile('scripts/output/scraped-properties.csv', 'utf-8');
  const properties: PropertyToGeocode[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Found ${properties.length} properties to geocode`);

  const geocoded: GeocodedProperty[] = [];

  for (const property of properties) {
    console.log(`Geocoding: ${property.address}`);
    const coords = await geocodeAddress(property.address);

    if (coords) {
      geocoded.push({
        ...property,
        ...coords
      });
      console.log(`  ✓ ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`  ✗ Failed`);
    }

    // Rate limiting: wait 100ms between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Save results
  await writeFile(
    'scripts/output/geocoded-properties.json',
    JSON.stringify(geocoded, null, 2)
  );

  console.log(`\n✓ Geocoded ${geocoded.length}/${properties.length} properties`);
  console.log('Output: scripts/output/geocoded-properties.json');
  console.log('\nNext: Run npm run enrich to create the final dataset');
}

main().catch(console.error);
