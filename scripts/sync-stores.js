const axios = require('axios');
const cheerio = require('cheerio');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 식품안전나라 Open API (I1200)를 사용하여 데이터를 가져오는 폴백 함수
 */
async function fetchFromApiFallback() {
  const apiKey = process.env.FOOD_SAFETY_API_KEY || 'sample';
  const baseUrl = `https://openapi.foodsafetykorea.go.kr/api/${apiKey}/I1200/json`;

  console.log('🔄 API를 통한 데이터 수집 시도 중 (I1200)...');

  try {
    // 1. 전체 데이터 개수 확인
    const initRes = await axios.get(`${baseUrl}/1/1`);
    const totalCount = parseInt(initRes.data?.I1200?.total_count || '0');

    if (totalCount === 0) {
      throw new Error('API에서 검색된 데이터가 없습니다.');
    }

    console.log(`📊 총 ${totalCount}개의 데이터를 가져옵니다...`);

    let allItems = [];
    const batchSize = 1000;

    for (let start = 1; start <= totalCount; start += batchSize) {
      const end = Math.min(start + batchSize - 1, totalCount);
      const url = `${baseUrl}/${start}/${end}`;
      const res = await axios.get(url);
      const items = res.data?.I1200?.row || [];
      allItems = allItems.concat(items);
      console.log(`📥 진행 중: ${allItems.length}/${totalCount}`);
    }

    return allItems.map((item, index) => {
      const name = item.BPL_NM || 'Unknown';
      const address = item.RDN_WH_ADDR || item.SITE_ADDR || '';
      const type = item.UPTAE_NM || '기타';
      const lat = parseFloat(item.SITE_Y || '0');
      const lng = parseFloat(item.SITE_X || '0');
      const region = address.split(' ')[0] || '';

      return {
        id: index + 1,
        name,
        originalName: name,
        type,
        region,
        address,
        lat,
        lng,
        verified: true
      };
    });
  } catch (error) {
    console.error('❌ API 폴백 실패:', error.message);
    return null;
  }
}

/**
 * 반려동물 동반 가능 업소 데이터를 식품안전나라에서 가져와 JSON으로 저장하는 스크립트
 */
async function syncPetFriendlyStores() {
  const portalUrl = process.env.PET_PORTAL_URL || 'https://www.foodsafetykorea.go.kr/portal/petKorea.do';
  const dataDir = path.join(process.cwd(), 'data');
  const outputPath = path.join(dataDir, 'stores.json');

  console.log('🚀 데이터 동기화 시작...');

  try {
    // 1. 데이터 저장 디렉토리 확인 및 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 2. 포털 페이지에서 엑셀 다운로드 링크 추출
    console.log(`🔗 포털 접속 중: ${portalUrl}`);
    const { data: html } = await axios.get(portalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(html);

    let downloadUrl = '';

    // 1. '반려동물' 관련 .xlsx 링크 탐색 (기존 방식)
    $('a').each((_, el) => {
      const text = $(el).text();
      const href = $(el).attr('href');
      if (text.includes('반려동물') && (text && (text.includes('xlsx') || (href && href.includes('xlsx'))))) {
        downloadUrl = href || '';
      }
    });

    // 2. 버튼 기반 탐색 (사용자 제보: fn_downloadExcel 활용)
    if (!downloadUrl) {
      $('button.btn-download, button:contains("반려동물")').each((_, el) => {
        const onclick = $(el).attr('onclick');
        if (onclick && onclick.includes('downloadExcel')) {
          console.log('💡 다운로드 버튼 발견 (onclick="fn_downloadExcel")');
          // 실제 사이트의 자바스크립트 로직을 추적할 수 없으므로, 페이지 내의 모든 .xlsx 링크나
          // 특정 패턴의 다운로드 링크를 다시 한번 정밀 탐색합니다.
          $('a[href*="download"], a[href*=".xlsx"], a[href*="fileId"]').each((__, aEl) => {
            const aHref = $(aEl).attr('href');
            if (aHref && (aHref.includes('xlsx') || aHref.includes('download'))) {
              downloadUrl = aHref;
            }
          });
        }
      });
    }

    // 3. 최후의 수단: .xlsx 확장자를 가진 모든 링크
    if (!downloadUrl) {
       $('a[href*=".xlsx"]').each((_, el) => {
          downloadUrl = $(el).attr('href') || '';
       });
    }

    if (!downloadUrl) {
      // 만약 여전히 못 찾았다면, 공공데이터 포털의 일반적인 다운로드 경로 패턴 시도 (추측)
      // 실제 환경에서는 이 로그를 통해 페이지 구조를 파악해야 함
      console.warn('⚠️ 직접적인 다운로드 링크를 찾지 못했습니다. 페이지 내 스크립트 또는 폼을 분석해야 할 수 있습니다.');

      // Fallback: I1200 API를 통한 수집으로 전환하도록 유도 (다음 단계에서 구현)
      throw new Error('엑셀 다운로드 링크를 자동 추출할 수 없습니다. (사이트 구조 변경 가능성)');
    }

    // 상대 경로 처리
    if (!downloadUrl.startsWith('http')) {
      const baseUrl = new URL(portalUrl);
      downloadUrl = `${baseUrl.protocol}//${baseUrl.host}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
    }

    console.log(`📥 엑셀 다운로드 중: ${downloadUrl}`);

    // 3. 엑셀 파일 다운로드 (바이너리)
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const buffer = response.data;

    // 4. 엑셀 파싱
    console.log('📊 데이터 파싱 중...');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // 5. 데이터 변환 (사용자 요청 포맷)
    const stores = jsonData.map((row, index) => {
      const name = row['업소명'] || row['상호명'] || row['사업장명'] || 'Unknown';
      const address = row['소재지(도로명)'] || row['도로명주소'] || row['소재지'] || '';
      const type = row['업태명'] || row['업종'] || row['업태'] || '기타';
      const lat = parseFloat(row['위도'] || row['Y좌표'] || '0');
      const lng = parseFloat(row['경도'] || row['X좌표'] || '0');
      const region = address.split(' ')[0] || '';

      return {
        id: index + 1,
        name,
        originalName: name,
        type,
        region,
        address,
        lat,
        lng,
        verified: true
      };
    });

    // 안전장치: 데이터가 없을 경우 기존 파일을 덮어쓰지 않음
    if (stores.length === 0) {
      console.error('❌ 수집된 데이터가 0건입니다. 기존 파일을 유지합니다.');
      return { success: false, error: 'No data collected' };
    }

    // 6. JSON 파일로 저장
    fs.writeFileSync(outputPath, JSON.stringify(stores, null, 2), 'utf8');

    console.log(`✅ 저장 완료: ${outputPath} (${stores.length} 개의 데이터)`);
    return { success: true, count: stores.length };
  } catch (error) {
    console.error(`⚠️ 스크래핑 실패 (${error.message}). API 폴백을 시도합니다...`);

    const fallbackStores = await fetchFromApiFallback();

    if (fallbackStores && fallbackStores.length > 0) {
      fs.writeFileSync(outputPath, JSON.stringify(fallbackStores, null, 2), 'utf8');
      console.log(`✅ API 폴백 저장 완료: ${outputPath} (${fallbackStores.length} 개의 데이터)`);
      return { success: true, count: fallbackStores.length };
    }

    return { success: false, error: error.message };
  }
}

// 스크립트로 직접 실행 시 (node scripts/sync-stores.js)
if (require.main === module) {
  syncPetFriendlyStores().then(res => {
      if (!res.success) process.exit(1);
  });
}

module.exports = { syncPetFriendlyStores };
