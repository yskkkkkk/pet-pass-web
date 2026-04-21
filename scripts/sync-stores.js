const axios = require('axios');
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
  const downloadUrl = process.env.PET_EXCEL_URL || 'https://www.foodsafetykorea.go.kr/portal/petKorea/downloadExcel.do';
  const dataDir = path.join(process.cwd(), 'data');
  const outputPath = path.join(dataDir, 'stores.json');

  console.log('🚀 데이터 동기화 시작...');

  try {
    // 1. 데이터 저장 디렉토리 확인 및 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 2. 엑셀 다운로드 URL 직접 사용
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

    // 한글 디코딩 깨짐 보정 맵 (복잡한 한글이 '?'나 '？'로 깨지는 경우 대응)
    const KOREAN_NAME_PATCH_MAP = {
      '？커피,MOCC': '뫀커피,MOCC',
      '?커피,MOCC': '뫀커피,MOCC',
      '우？(WooDic)': '우딬(WooDic)',
      '우?(WooDic)': '우딬(WooDic)',
      '잇？(IT COF.)': '잇컾(IT COF.)',
      '잇?(IT COF.)': '잇컾(IT COF.)',
      '율？당': '율뭌당',
      '율?당': '율뭌당',
      '카페 드 조？': '카페 드 죠즈',
      '카페 드 조?': '카페 드 죠즈',
      '프？츠': '프릳츠',
      '프?츠': '프릳츠'
    };

    // 5. 데이터 변환 (사용자 요청 포맷)
    const stores = jsonData.map((row, index) => {
      let name = row['업소명'] || row['상호명'] || row['사업장명'] || 'Unknown';

      // 이름 깨짐 보정 적용
      if (KOREAN_NAME_PATCH_MAP[name]) {
        name = KOREAN_NAME_PATCH_MAP[name];
      }

      const address = row['소재지(도로명)'] || row['도로명주소'] || row['소재지'] || '';
      let type = row['업태명'] || row['업종'] || row['업태'] || '기타';

      // 업종 명칭 정규화 (UI 요구사항 반영)
      if (type === '휴게음식점') type = '카페';
      if (type === '제과점영업') type = '제과점';

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
