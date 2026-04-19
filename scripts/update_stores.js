const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Kakao REST API Key
const KAKAO_API_KEY = process.env.KAKAO_MAP_API_KEY;

if (!KAKAO_API_KEY) {
  console.error("KAKAO_MAP_API_KEY 가 .env 파일에 설정되어 있지 않습니다.");
  process.exit(1);
}

/**
 * 주소를 위경도로 변환하는 함수 (Kakao Local API 사용)
 */
async function geocodeAddress(address) {
  try {
    const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      params: { query: address },
      headers: { 
        'Authorization': `KakaoAK ${KAKAO_API_KEY}`,
        'KA': 'sdk/1.0.0 os/javascript lang/ko-KR res/999x999 device/PC origin/http%3A%2F%2Flocalhost%3A3000'
      }
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
  const rootDir = path.join(__dirname, '..');
  const excelFilePath = path.join(rootDir, '반려동물_동반가능_업소현황(2026.4.18 18시13분 기준).xlsx');
  const storesJsonPath = path.join(rootDir, 'stores.json');

  if (!fs.existsSync(excelFilePath)) {
    console.error("엑셀 파일을 찾을 수 없습니다:", excelFilePath);
    return;
  }

  // 1. 기존 stores.json 로드
  let existingStores = [];
  if (fs.existsSync(storesJsonPath)) {
    existingStores = JSON.parse(fs.readFileSync(storesJsonPath, 'utf8'));
  }
  console.log(`기존 매장 수: ${existingStores.length}`);

  // lookup 맵 생성 (중복 확인용)
  const storeMap = new Map();
  existingStores.forEach(s => {
    const key = `${s.originalName}|${s.address}`;
    storeMap.set(key, s);
  });

  // 2. 엑셀 파일 로드
  const workbook = XLSX.readFile(excelFilePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`엑셀 데이터 수: ${rows.length}`);

  // 카테고리 매핑
  const typeMap = {
    '일반음식점': '일반음식점',
    '휴게음식점': '카페',
    '제과점영업': '제과점',
    '제과점': '제과점',
    '카페': '카페',
    '식품접객업': '일반음식점',
  };

  const updatedStores = [];
  let newCount = 0;
  let geocodeFailCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const originalName = row['업소명'] || '';
    const address = row['업소주소'] || '';
    const rawType = row['업종'] || '';
    const region = row['지역'] || '';

    const key = `${originalName}|${address}`;
    const existing = storeMap.get(key);

    process.stdout.write(`\r진행 중... ${i + 1}/${rows.length}`);

    if (existing) {
      // 기존 데이터가 있으면 그대로 사용 (ID는 나중에 재할당)
      updatedStores.push({
        ...existing,
        // 혹시 모르니 메타데이터 업데이트 (지역, 업종 등)
        type: typeMap[rawType] || rawType || existing.type || '기타',
        region: region || existing.region
      });
    } else {
      // 새 데이터면 지오코딩 필요
      newCount++;
      const coords = await geocodeAddress(address);

      if (!coords) {
        console.warn(`\n[Geocode Fail] ${originalName} - ${address}`);
        geocodeFailCount++;
        // 지오코딩 실패 시 스킵할지, 0,0으로 넣을지 결정. 
        // 기존 convert_xlsx.js 는 스킵함.
        continue;
      }

      updatedStores.push({
        name: originalName.replace(/^\(주\)/, '').trim(),
        originalName: originalName,
        type: typeMap[rawType] || rawType || '기타',
        region: region,
        address: address,
        lat: coords.lat,
        lng: coords.lng,
        verified: true
      });

      // API 제한 방지
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // 3. ID 재할당 및 저장
  const finalizedStores = updatedStores.map((s, index) => ({
    ...s,
    id: index + 1
  }));

  fs.writeFileSync(storesJsonPath, JSON.stringify(finalizedStores, null, 2), 'utf8');

  console.log(`\n\n✅ 처리 완료!`);
  console.log(`신규 추가된 매장: ${newCount}개 (지오코딩 실패: ${geocodeFailCount}개)`);
  console.log(`최종 매장 수: ${finalizedStores.length}`);
}

run().catch(err => {
  console.error(err);
});
