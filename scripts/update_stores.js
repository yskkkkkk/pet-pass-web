const fs = require('fs');
const path = require('path');

/**
 * Pet-Friendly Store Data Sync Script for Food Safety Korea API
 * 
 * This script fetches store data from Foodsafetykorea.go.kr,
 * filters for pet-friendly establishments (PET_OUTIN_YN: 'Y'),
 * and saves them to data/stores.json.
 */

// Configuration
const API_KEY = process.env.FOOD_SAFETY_API_KEY || 'sample'; // Default to 'sample' for testing if not set
const SERVICE_ID = 'I1250'; // 식품접객업 (Food Service establishments)
const DATA_TYPE = 'json';
const PAGE_SIZE = 1000;
const DELAY_MS = 1000; // 1 second delay between requests to avoid rate limiting

const OUTPUT_DIR = path.join(__dirname, '../data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'stores.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Utility to wait for a certain amount of time
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch a single page of data
 */
async function fetchPage(startIdx, endIdx) {
    const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${SERVICE_ID}/${DATA_TYPE}/${startIdx}/${endIdx}`;
    console.log(`Fetching: ${startIdx} to ${endIdx}...`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Handle API errors in response body
        if (data[SERVICE_ID] && data[SERVICE_ID].RESULT && data[SERVICE_ID].RESULT.CODE !== 'INFO-000') {
            const result = data[SERVICE_ID].RESULT;
            if (result.CODE === 'INFO-200') {
                console.log('No more data (INFO-200).');
                return { row: [], total_count: 0 };
            }
            throw new Error(`API Error: ${result.CODE} - ${result.MSG}`);
        }

        return data[SERVICE_ID] || { row: [], total_count: 0 };
    } catch (error) {
        console.error(`Error fetching page ${startIdx}-${endIdx}:`, error.message);
        return null;
    }
}

/**
 * Main function to crawl all pages
 */
async function syncStores() {
    let startIdx = 1;
    let endIdx = PAGE_SIZE;
    let totalCollected = 0;
    let petFriendlyStores = [];
    let hasMore = true;

    console.log('Starting Pet-Friendly Store Sync...');

    while (hasMore) {
        const result = await fetchPage(startIdx, endIdx);
        
        if (!result || !result.row || result.row.length === 0) {
            hasMore = false;
            break;
        }

        const rows = result.row;
        const totalCount = parseInt(result.total_count);

        // Filter for pet-friendly stores (PET_OUTIN_YN: 'Y')
        const filtered = rows.filter(item => item.PET_OUTIN_YN === 'Y').map(item => ({
            id: item.BSN_LCNS_LEDG_NO,
            name: item.BSSH_NM,
            address: item.LOCP_ADDR,
            phone: item.TELNO,
            industry: item.INDUTY_NM,
            coords: {
                x: item.SITE_X ? parseFloat(item.SITE_X) : null,
                y: item.SITE_Y ? parseFloat(item.SITE_Y) : null
            },
            lastUpdated: item.LAST_UPDT_DTM
        }));

        petFriendlyStores = petFriendlyStores.concat(filtered);
        totalCollected += rows.length;
        
        console.log(`Read ${totalCollected}/${totalCount} - Found ${filtered.length} pet-friendly stores (Running total: ${petFriendlyStores.length})`);

        if (totalCollected >= totalCount || rows.length < PAGE_SIZE) {
            hasMore = false;
        } else {
            startIdx += PAGE_SIZE;
            endIdx += PAGE_SIZE;
            // Respect delay
            await sleep(DELAY_MS);
        }
    }

    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(petFriendlyStores, null, 2), 'utf-8');
    console.log(`Successfully synced ${petFriendlyStores.length} pet-friendly stores to ${OUTPUT_FILE}`);
}

// Run the script
if (typeof fetch === 'undefined') {
    console.error('Fetch is not available in this Node environment. Please use Node.js 18+ or install node-fetch.');
    process.exit(1);
}

syncStores().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});
