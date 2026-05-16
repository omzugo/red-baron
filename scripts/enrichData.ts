/**
 * Data Enrichment Script
 *
 * Combines geocoded data with manual categorizations and additional info
 * to create the final properties.json file
 */

import { readFile, writeFile } from 'fs/promises';
import type { Property } from '../lib/types';

interface GeocodedProperty {
  address: string;
  owner: string;
  lat: number;
  lng: number;
  assessedValue?: string;
  yearBuilt?: string;
  squareFootage?: string;
  lotSize?: string;
  source: string;
}

// Manual enrichment data - add building names, categories, descriptions
const enrichmentData: Record<string, Partial<Property>> = {
  // Example: Main Campus
  "77 Massachusetts Avenue, Cambridge, MA 02139": {
    buildingName: "MIT Main Campus",
    category: 'academic',
    ownership: {
      type: 'full',
      entity: 'MIT',
      confidence: 'confirmed'
    },
    currentUse: 'Academic Buildings, Research Labs, Administrative Offices',
    description: 'MIT\'s main campus in Cambridge, containing academic buildings, laboratories, and administrative offices.',
    historicalContext: 'The main campus has been MIT\'s home since 1916 when it moved from Boston.',
  },
  // Add more enrichment data as you categorize properties
};

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseFloat(value);
  return isNaN(num) ? undefined : num;
}

function categorizeProperty(address: string, owner: string): Property['category'] {
  // Manual categorization logic - update as you learn about properties
  const addr = address.toLowerCase();
  const ownerName = owner.toLowerCase();

  // Add your categorization rules here
  if (addr.includes('dorm') || addr.includes('graduate') || addr.includes('housing')) {
    return 'residential';
  }
  if (addr.includes('tech square') || addr.includes('kendall')) {
    return 'corporate';
  }
  return 'academic'; // default
}

function determineOwnershipType(owner: string): 'full' | 'partial' {
  const ownerLower = owner.toLowerCase();
  if (ownerLower.includes('mitimco') || ownerLower.includes('mit investment')) {
    return 'partial';
  }
  return 'full';
}

async function main() {
  console.log('Enriching Property Data\n');

  // Read geocoded properties
  const geocodedJson = await readFile('scripts/output/geocoded-properties.json', 'utf-8');
  const geocoded: GeocodedProperty[] = JSON.parse(geocodedJson);

  console.log(`Processing ${geocoded.length} properties`);

  const properties: Property[] = geocoded.map((prop, index) => {
    const enrichment = enrichmentData[prop.address] || {};
    const category = enrichment.category || categorizeProperty(prop.address, prop.owner);

    return {
      id: `mit-${index + 1}`,
      address: prop.address,
      buildingName: enrichment.buildingName,
      coordinates: {
        lat: prop.lat,
        lng: prop.lng
      },
      ownership: enrichment.ownership || {
        type: determineOwnershipType(prop.owner),
        entity: prop.owner,
        confidence: 'confirmed' as const
      },
      category,
      currentUse: enrichment.currentUse,
      details: {
        squareFootage: parseNumber(prop.squareFootage),
        assessedValue: parseNumber(prop.assessedValue),
        yearBuilt: parseNumber(prop.yearBuilt),
        lotSize: parseNumber(prop.lotSize)
      },
      photos: enrichment.photos,
      description: enrichment.description,
      historicalContext: enrichment.historicalContext,
      sources: [prop.source],
      lastUpdated: new Date().toISOString()
    };
  });

  // Save final dataset
  await writeFile(
    'lib/data/properties.json',
    JSON.stringify(properties, null, 2)
  );

  console.log(`\n✓ Created lib/data/properties.json with ${properties.length} properties`);
  console.log('\nBreakdown:');
  const academic = properties.filter(p => p.category === 'academic').length;
  const residential = properties.filter(p => p.category === 'residential').length;
  const corporate = properties.filter(p => p.category === 'corporate').length;
  console.log(`  Academic: ${academic}`);
  console.log(`  Residential: ${residential}`);
  console.log(`  Corporate: ${corporate}`);
}

main().catch(console.error);
