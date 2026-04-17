const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

/**
 * Pet-Friendly Store Data Sync Script for Food Safety Korea API
 * 
 * This script fetches store data from Foodsafetykorea.go.kr,
 * filters for pet-friendly establishments (PET_OUTIN_YN: 'Y'),
 * converts addresses to lat/lng using Kakao Local API,
 * and saves them to data/stores.json.
 */

// Configuration
const FOOD_SAFETY_API_KEY = process.env.FOOD_SAFETY_API_KEY || 'sample';
const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;
const SERVICE_ID = 'I1250'; // 식품접객업
const DATA_TYPE = 'json';
const PAGE_SIZE = 1000;
const DELAY_MS = 200; // API delay between requests

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
 * Extract region from address and abbreviate it
 */
function getRegionFromAddress(address) {
    if (!address) return '기타';
    const parts = address.split(' ');
    const region = parts[0];

    const regionMap = {
        '서울특별시': '서울',
        '부산광역시': '부산',
        '대구광역시': '대구',
        '인천광역시': '인천',
        '광주광역시': '광주',
        '대전광역시': '대전',
        '울산광역시': '울산',
        '세종특별자치시': '세종',
        '경기도': '경기',
        '강원특별자치도': '강원',
        '충청북도': '충북',
        '충청남도': '충남',
        '전라북도': '전북',
        '전라남도': '전남',
        '경상북도': '경북',
        '경상남도': '경남',
        '제주특별자치도': '제주'
    };

    return regionMap[region] || region.substring(0, 2);
}

/**
 * Geocode address using Kakao Local API
 */
async function geocodeAddress(address) {
    if (!KAKAO_API_KEY) {
        console.warn('Warning: KAKAO_REST_API_KEY is not set. Skipping geocoding.');
        return null;
    }

    try {
        const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
            params: { query: address },
            headers: { 'Authorization': `KakaoAK ${KAKAO_API_KEY}` }
        });

        if (response.data.documents && response.data.documents.length > 0) {
            const { x, y } = response.data.documents[0];
            return {
                lat: parseFloat(y),
                lng: parseFloat(x)
            };
        }
        return null;
    } catch (error) {
        console.error(`Geocoding error for address [${address}]:`, error.message);
        return null;
    }
}

/**
 * Fetch a single page of data
 */
async function fetchPage(startIdx, endIdx) {
    const url = `http://openapi.foodsafetykorea.go.kr/api/${FOOD_SAFETY_API_KEY}/${SERVICE_ID}/${DATA_TYPE}/${startIdx}/${endIdx}`;
    console.log(`Fetching: ${startIdx} to ${endIdx}...`);
    
    try {
        const response = await axios.get(url);
        const data = response.data;
        
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
        const filteredRows = rows.filter(item => item.PET_OUTIN_YN === 'Y');

        for (const item of filteredRows) {
            const coords = await geocodeAddress(item.LOCP_ADDR);

            if (coords) {
                petFriendlyStores.push({
                    id: parseInt(item.BSN_LCNS_LEDG_NO),
                    name: (item.BSSH_NM || '').replace(/^\(주\)/, '').trim(),
                    originalName: item.BSSH_NM,
                    type: item.INDUTY_NM,
                    region: getRegionFromAddress(item.LOCP_ADDR),
                    address: item.LOCP_ADDR,
                    lat: coords.lat,
                    lng: coords.lng,
                    verified: true
                });
            }
            // Add a delay for geocoding to avoid rate limits (100ms is safer)
            await sleep(100);
        }

        totalCollected += rows.length;
        console.log(`Read ${totalCollected}/${totalCount} - Found ${filteredRows.length} pet-friendly stores (Valid with coords: ${petFriendlyStores.length})`);

        if (totalCollected >= totalCount || rows.length < PAGE_SIZE) {
            hasMore = false;
        } else {
            startIdx += PAGE_SIZE;
            endIdx += PAGE_SIZE;
            await sleep(DELAY_MS);
        }
    }

    // Save to file (Overwrite as requested)
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(petFriendlyStores, null, 2), 'utf-8');
    console.log(`Successfully synced ${petFriendlyStores.length} pet-friendly stores to ${OUTPUT_FILE}`);
}

syncStores().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
});
