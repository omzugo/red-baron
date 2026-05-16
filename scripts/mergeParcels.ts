/**
 * Merge parcel geometries into properties.json
 */
import { readFile, writeFile } from 'fs/promises';

interface Property {
  id: string;
  [key: string]: any;
}

interface ParcelFeature {
  geometry: any;
  properties: {
    mit_id: string;
    mit_name: string;
    [key: string]: any;
  };
}

async function main() {
  // Read existing properties
  const propertiesJson = await readFile('lib/data/properties.json', 'utf-8');
  const properties: Property[] = JSON.parse(propertiesJson);

  // Read MIT parcels
  const parcelsJson = await readFile('lib/data/mit_parcels.json', 'utf-8');
  const parcelsData: { features: ParcelFeature[] } = JSON.parse(parcelsJson);

  // Create a map of parcel geometries by MIT ID
  const parcelMap = new Map<string, any>();
  for (const feature of parcelsData.features) {
    parcelMap.set(feature.properties.mit_id, feature.geometry);
  }

  // Add parcel geometries to properties
  let matchedCount = 0;
  for (const property of properties) {
    const parcelGeometry = parcelMap.get(property.id);
    if (parcelGeometry) {
      property.parcelGeometry = parcelGeometry;
      matchedCount++;
      console.log(`✓ Added parcel to ${property.id}: ${property.buildingName || property.address}`);
    } else {
      console.log(`✗ No parcel found for ${property.id}`);
    }
  }

  // Save updated properties
  await writeFile(
    'lib/data/properties.json',
    JSON.stringify(properties, null, 2)
  );

  console.log(`\n✓ Updated ${matchedCount}/${properties.length} properties with parcel geometries`);
}

main().catch(console.error);
