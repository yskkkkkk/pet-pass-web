const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function pickFirst(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function hasBrokenKoreanText(value) {
  return /[?？�]/.test(String(value || ''));
}

async function geocodeAddress(address) {
  const kakaoApiKey = process.env.KAKAO_MAP_API_KEY;
  if (!kakaoApiKey || !address) return null;

  try {
    const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      params: { query: address },
      headers: {
        Authorization: `KakaoAK ${kakaoApiKey}`,
      }
    });

    const first = response.data?.documents?.[0];
    if (!first?.x || !first?.y) return null;

    return {
      lat: parseFloat(first.y),
      lng: parseFloat(first.x)
    };
  } catch (error) {
    console.warn(`⚠️ 주소 지오코딩 실패: ${address} (${error.message})`);
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
  const kakaoApiKey = process.env.KAKAO_MAP_API_KEY;

  console.log('🚀 데이터 동기화 시작...');

  try {
    if (!kakaoApiKey) {
      throw new Error('KAKAO_MAP_API_KEY가 설정되어 있지 않아 카카오 지오코딩을 수행할 수 없습니다.');
    }

    // 1. 데이터 저장 디렉토리 확인 및 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    let existingStores = [];
    if (fs.existsSync(outputPath)) {
      existingStores = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    }
    const existingNameByAddress = new Map(
      existingStores
        .filter(store => store?.address && store?.originalName)
        .map(store => [store.address, store.originalName])
    );

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
    const stores = [];
    const geocodeCache = new Map();
    for (let index = 0; index < jsonData.length; index++) {
      const row = jsonData[index];
      let name = row['업소명'] || 'Unknown';

      // 이름 깨짐 보정 적용
      if (KOREAN_NAME_PATCH_MAP[name]) {
        name = KOREAN_NAME_PATCH_MAP[name];
      }

      const address = pickFirst(row, ['업소주소']);
      let type = pickFirst(row, ['업종']) || '기타';

      // 수기 패치맵에 없는 깨진 문자(?, ？, �)는 기존 데이터(동일 주소)의 정상 상호명으로 보정
      if (hasBrokenKoreanText(name)) {
        const previousName = existingNameByAddress.get(address);
        if (previousName && !hasBrokenKoreanText(previousName)) {
          name = previousName;
        }
      }

      // 업종 명칭 정규화 (UI 요구사항 반영)
      if (type === '휴게음식점') type = '카페';
      if (type === '제과점영업') type = '제과점';

      const region = pickFirst(row, ['지역']) || (address.split(' ')[0] || '');
      let lat = 0;
      let lng = 0;

      if (address) {
        if (!geocodeCache.has(address)) {
          const geocoded = await geocodeAddress(address);
          geocodeCache.set(address, geocoded);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const geocoded = geocodeCache.get(address);
        lat = geocoded?.lat || 0;
        lng = geocoded?.lng || 0;
      }

      stores.push({
        id: index + 1,
        name,
        originalName: name,
        type,
        region,
        address,
        lat,
        lng,
        verified: true
      });
    }

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
    console.error(`❌ 데이터 동기화 실패: ${error.message}`);
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
