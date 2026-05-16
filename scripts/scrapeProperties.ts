/**
 * MIT Property Scraper
 *
 * This script queries the Cambridge and Boston property databases
 * to find properties owned by MIT and related entities.
 *
 * Data sources:
 * - Cambridge: https://www.cambridgema.gov/iwantto/viewthepropertydatabase
 * - Boston: https://www.boston.gov/departments/assessing/property-data-and-information
 * - MassGIS: https://gis.data.mass.gov/datasets/CambridgeGIS::property-database/about
 *
 * Search terms to use:
 * - "Massachusetts Institute of Technology"
 * - "MIT"
 * - "MIT Investment Management"
 * - "MITIMCo"
 * - "Massachusetts Inst Tech"
 */

import { writeFile } from 'fs/promises';
import { stringify } from 'csv-stringify/sync';

interface ScrapedProperty {
  address: string;
  owner: string;
  assessedValue?: number;
  yearBuilt?: number;
  squareFootage?: number;
  lotSize?: number;
  source: string;
}

// Manual data entry helper - for properties found through searches
const manualProperties: ScrapedProperty[] = [
  // Example entries - to be filled in from database searches
  {
    address: "77 Massachusetts Avenue, Cambridge, MA 02139",
    owner: "Massachusetts Institute of Technology",
    source: "https://www.cambridgema.gov/iwantto/viewthepropertydatabase",
  },
  // Add more as you discover them
];

async function exportToCSV(properties: ScrapedProperty[]) {
  const csv = stringify(properties, {
    header: true,
    columns: ['address', 'owner', 'assessedValue', 'yearBuilt', 'squareFootage', 'lotSize', 'source']
  });

  await writeFile('scripts/output/scraped-properties.csv', csv);
  console.log(`Exported ${properties.length} properties to scripts/output/scraped-properties.csv`);
}

async function main() {
  console.log('MIT Property Data Collection');
  console.log('============================\n');
  console.log('MANUAL STEPS REQUIRED:');
  console.log('1. Visit Cambridge Property Database: https://www.cambridgema.gov/iwantto/viewthepropertydatabase');
  console.log('2. Search for owner: "Massachusetts Institute of Technology"');
  console.log('3. Also try: "MIT", "MITIMCo", "MIT Investment"');
  console.log('4. Record results and add them to this script\'s manualProperties array');
  console.log('5. Repeat for Boston: https://www.boston.gov/departments/assessing/property-data-and-information\n');

  // Create output directory
  const { mkdir } = await import('fs/promises');
  await mkdir('scripts/output', { recursive: true });

  // Export current manual entries
  await exportToCSV(manualProperties);

  console.log('\nNEXT STEPS:');
  console.log('1. Review and fill in the CSV file with properties from your searches');
  console.log('2. Run the geocoding script: npm run geocode');
  console.log('3. Run the enrichment script: npm run enrich');
}

main().catch(console.error);
