const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Kakao REST API Key
const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY || process.env.KAKAO_MAP_API_KEY;

/**
 * 주소를 위경도로 변환하는 함수 (Kakao Local API 사용)
 */
async function geocodeAddress(address) {
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

async function run() {
  const filePath = path.join(__dirname, '반려동물_동반가능_업소현황(2026.4.18 18시13분 기준).xlsx');

  if (!fs.existsSync(filePath)) {
    console.error("엑셀 파일을 찾을 수 없습니다:", filePath);
    return;
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`총 ${rows.length}개의 데이터를 처리합니다...`);

  // 업종 한글 → 우리 서비스 카테고리 매핑
  const typeMap = {
    '일반음식점': '일반음식점',
    '휴게음식점': '카페',
    '제과점영업': '제과점',
    '제과점': '제과점',
    '카페': '카페',
    '식품접객업': '일반음식점',
  };

  const stores = [];

  // API 부하를 방지하기 위해 순차적으로 처리 (필요시 병렬 처리 가능)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const address = row['업소주소'] || '';
    const rawType = row['업종'] || '';
    const type = typeMap[rawType] || rawType || '기타';

    process.stdout.write(`\r진행률: ${i + 1}/${rows.length} (${Math.round((i + 1) / rows.length * 100)}%)`);

    const coords = await geocodeAddress(address);

    if (!coords) {
      console.warn(`\n[Geocode Fail] ${row['업소명']} - ${address}`);
      continue; // Skip entries without coordinates to avoid "Null Island" (0,0)
    }

    stores.push({
      id: i + 1,
      name: (row['업소명'] || '').replace(/^\(주\)/, '').trim(),
      originalName: row['업소명'] || '',
      type: type,
      region: row['지역'] || '',
      address: address,
      lat: coords.lat,
      lng: coords.lng,
      verified: true
    });

    // 0.05초 대기 (초당 20회 요청 제한 고려)
    if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('\n\n✅ Geocoding 완료!');

  const outputPath = path.join(__dirname, 'data', 'stores.json');
  fs.writeFileSync(outputPath, JSON.stringify(stores, null, 2), 'utf8');

  console.log(`${stores.length}개 매장을 stores.json에 저장했습니다.`);

  // 지역별 통계 출력
  const regionStats = {};
  stores.forEach(s => {
    regionStats[s.region] = (regionStats[s.region] || 0) + 1;
  });
  console.log('\n지역별 매장 수:');
  Object.entries(regionStats).sort((a,b) => b[1]-a[1]).forEach(([r,c]) => {
    console.log(`  ${r}: ${c}개`);
  });
}

run();
