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
const HISTORY_FILE = path.join(__dirname, '../docs/schedule_history.md');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(HISTORY_FILE))) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
}

/**
 * Utility to wait for a certain amount of time
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extract region from address
 */
function getRegionFromAddress(address) {
    if (!address) return '기타';
    const parts = address.split(' ');
    return parts[0];
}

/**
 * Geocode address using Kakao Local API
 */
async function geocodeAddress(address) {
    if (!KAKAO_API_KEY) {
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
    
    try {
        const response = await axios.get(url);
        const data = response.data;
        
        if (data[SERVICE_ID] && data[SERVICE_ID].RESULT && data[SERVICE_ID].RESULT.CODE !== 'INFO-000') {
            const result = data[SERVICE_ID].RESULT;
            if (result.CODE === 'INFO-200') {
                return { row: [], total_count: 0 };
            }
            throw new Error(`API Error: ${result.CODE} - ${result.MSG}`);
        }

        return data[SERVICE_ID] || { row: [], total_count: 0 };
    } catch (error) {
        console.error(`Error fetching page ${startIdx}-${endIdx}:`, error.message);
        throw error;
    }
}

/**
 * Log to schedule_history.md
 */
function logHistory(success, count, error = null) {
    const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const status = success ? '✅ 성공' : '❌ 실패';
    const message = success ? `${count}개 수집 완료` : `에러: ${error}`;
    const logLine = `| ${now} | ${status} | ${message} |\n`;

    if (!fs.existsSync(HISTORY_FILE)) {
        const header = '# 🕒 데이터 수집 스케줄링 이력\n\n| 일시 (KST) | 결과 | 비고 |\n| :--- | :--- | :--- |\n';
        fs.writeFileSync(HISTORY_FILE, header + logLine, 'utf8');
    } else {
        fs.appendFileSync(HISTORY_FILE, logLine, 'utf8');
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

    try {
        while (hasMore) {
            const result = await fetchPage(startIdx, endIdx);

            if (!result || !result.row || result.row.length === 0) {
                hasMore = false;
                break;
            }

            const rows = result.row;
            const totalCount = parseInt(result.total_count);

            // Filter for pet-friendly stores (PET_OUTIN_YN: 'Y' or 'y')
            const filteredRows = rows.filter(item => item.PET_OUTIN_YN && item.PET_OUTIN_YN.toUpperCase() === 'Y');

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
                await sleep(50); // Slight delay for Kakao API
            }

            totalCollected += rows.length;
            console.log(`Progress: ${totalCollected}/${totalCount} - Found ${filteredRows.length} pet-friendly stores`);

            if (totalCollected >= totalCount || rows.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                startIdx += PAGE_SIZE;
                endIdx += PAGE_SIZE;
                await sleep(DELAY_MS);
            }
        }

        if (petFriendlyStores.length > 0) {
            // Save to file (Overwrite only on success)
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(petFriendlyStores, null, 2), 'utf-8');
            console.log(`Successfully synced ${petFriendlyStores.length} stores to ${OUTPUT_FILE}`);
            logHistory(true, petFriendlyStores.length);
        } else {
            console.warn('No pet-friendly stores found. Skipping file update.');
            logHistory(true, 0, '수집된 데이터 없음');
        }
        return { success: true, count: petFriendlyStores.length };
    } catch (err) {
        console.error('Sync failed:', err.message);
        logHistory(false, 0, err.message);
        return { success: false, error: err.message };
    }
}

// Run if called directly
if (require.main === module) {
    syncStores().then(res => {
        if (!res.success) process.exit(1);
    });
}

module.exports = { syncStores };
