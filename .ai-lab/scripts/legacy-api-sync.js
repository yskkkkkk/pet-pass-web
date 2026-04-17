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
const SERVICE_ID = 'I1200'; // 식품접객업 인허가 정보
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
    console.log(`[Fetch] Requesting: ${startIdx} ~ ${endIdx}`);
    
    try {
        const response = await axios.get(url);
        const data = response.data;
        
        // Handle API Key error or Server alert
        if (typeof data === 'string' && data.includes('<script')) {
            console.error('[API Error] 인증키가 유효하지 않거나 서버 오류가 발생했습니다.');
            throw new Error('Invalid API Key or Server Alert');
        }

        if (data[SERVICE_ID] && data[SERVICE_ID].RESULT && data[SERVICE_ID].RESULT.CODE !== 'INFO-000') {
            const result = data[SERVICE_ID].RESULT;
            if (result.CODE === 'INFO-200') {
                console.log(`[Fetch] No more data (INFO-200)`);
                return { row: [], total_count: 0 };
            }
            throw new Error(`API Error: ${result.CODE} - ${result.MSG}`);
        }

        const resultData = data[SERVICE_ID] || { row: [], total_count: 0 };
        console.log(`[Fetch] Success: Received ${resultData.row ? resultData.row.length : 0} rows`);
        return resultData;
    } catch (error) {
        console.error(`[Fetch Error] ${startIdx}-${endIdx}:`, error.message);
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

    console.log(`Starting Pet-Friendly Store Sync (Service: ${SERVICE_ID})...`);

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

            if (filteredRows.length > 0) {
                console.log(`[Filter] Found ${filteredRows.length} pet-friendly stores in this page.`);
            }

            for (const item of filteredRows) {
                // Use Kakao API for geocoding if key is available
                let coords = await geocodeAddress(item.LOCP_ADDR);

                // Fallback to API coordinates if Kakao fails or key is missing
                if (!coords && item.SITE_X && item.SITE_Y) {
                    coords = {
                        lat: parseFloat(item.SITE_Y),
                        lng: parseFloat(item.SITE_X)
                    };
                }

                if (coords) {
                    petFriendlyStores.push({
                        id: item.BSN_LCNS_LEDG_NO,
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
                if (KAKAO_API_KEY) await sleep(50); // Slight delay for Kakao API
            }

            totalCollected += rows.length;
            console.log(`[Progress] ${totalCollected}/${totalCount} processed... Cumulative Pet-Friendly: ${petFriendlyStores.length}`);

            // For safety and efficiency, limit total processed in one run if needed,
            // but here we follow the original logic to fetch all.
            if (totalCollected >= totalCount || rows.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                startIdx += PAGE_SIZE;
                endIdx += PAGE_SIZE;
                await sleep(DELAY_MS);
            }

            // Limit to first 10,000 for debugging if necessary, but current requirement is to fetch 1000 first (handled by PAGE_SIZE)
            // If the user wants to run the whole sync, they can.
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
