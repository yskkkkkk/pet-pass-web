const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Supabase 초기화 (배치 작업은 서비스 롤 키 사용 권장)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

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

function getKakaoApiKey() {
  return process.env.KAKAO_REST_API_KEY;
}

async function geocodeAddress(address) {
  const kakaoApiKey = getKakaoApiKey();
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
    if (error.response?.status === 401) {
      throw new Error('Kakao Local API 인증 실패(401): KAKAO_REST_API_KEY를 확인해주세요.');
    }
    throw new Error(`주소 지오코딩 실패: ${address} (${error.message})`);
  }
}

/**
 * 반려동물 동반 가능 업소 데이터를 식품안전나라에서 가져와 Supabase DB로 저장하는 스크립트
 */
async function syncPetFriendlyStores() {
  const downloadUrl = process.env.PET_EXCEL_URL || 'https://www.foodsafetykorea.go.kr/portal/petKorea/downloadExcel.do';
  const kakaoApiKey = getKakaoApiKey();
  const batchTimestamp = new Date().toISOString();

  console.log(`🚀 데이터 동기화 시작 (배치 시간: ${batchTimestamp})...`);

  try {
    if (!kakaoApiKey) {
      throw new Error('KAKAO_REST_API_KEY가 설정되어 있지 않습니다.');
    }

    // 1. 기존 DB 데이터로부터 지오코딩 캐시 로드 (Pagination 적용하여 전체 로드)
    console.log('📡 기존 DB에서 좌표 데이터 로드 중...');
    const existingNameByAddress = new Map();
    const geocodeCache = new Map();

    let from = 0;
    let to = 999;
    let totalLoaded = 0;

    while (true) {
      const { data: dbStores, error: dbError } = await supabase
        .from('stores')
        .select('name, address, lat, lng')
        .range(from, to);

      if (dbError) {
        console.warn('⚠️ DB 데이터 로드 실패 (캐시 없이 진행):', dbError.message);
        break;
      }

      if (dbStores) {
        dbStores.forEach(s => {
          if (s.address && s.name) {
            existingNameByAddress.set(s.address, s.name);
          }
          if (s.address && s.lat && s.lng) {
            geocodeCache.set(s.address, { lat: s.lat, lng: s.lng });
          }
        });
        totalLoaded += dbStores.length;
        if (dbStores.length < 1000) break;
      } else {
        break;
      }
      from += 1000;
      to += 1000;
    }
    console.log(`✅ ${totalLoaded}개의 데이터를 불러와 ${geocodeCache.size}개의 좌표 캐시를 확보했습니다.`);

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

    // 5. 데이터 변환 및 지오코딩
    const stores = [];
    let hasFirstGeocodeAttempt = false;

    console.log('🔄 데이터 정규화 및 지오코딩 진행 중...');
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
          if (!hasFirstGeocodeAttempt && !geocodeCache.size) {
            hasFirstGeocodeAttempt = true;
            if (!geocoded) {
              // 첫 시도 실패는 API 키나 네트워크 문제일 가능성이 큼
              console.warn(`⚠️ 첫 번째 신규 지오코딩 시도 실패: ${address}`);
            }
          }
          geocodeCache.set(address, geocoded);
          if (geocoded) {
            await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit 방지
          }
        }
        const geocoded = geocodeCache.get(address);
        lat = geocoded?.lat || 0;
        lng = geocoded?.lng || 0;
      }

      stores.push({
        name,
        address,
        type,
        region,
        lat,
        lng,
        verified: true,
        phone_number: row['전화번호'] || row['연락처'] || null,
        description: row['설명'] || row['개요'] || null,
        naver_smartplace_link: row['네이버링크'] || row['스마트플레이스'] || null,
        updated_at: batchTimestamp
      });
    }

    // 안전장치: 데이터가 없을 경우 중단
    if (stores.length === 0) {
      console.error('❌ 수집된 데이터가 0건입니다.');
      return { success: false, error: 'No data collected' };
    }

    // 6. Supabase UPSERT (Chunk 단위)
    console.log(`📤 DB에 데이터 저장 중... (총 ${stores.length}건)`);
    const CHUNK_SIZE = 100;
    let successCount = 0;

    for (let i = 0; i < stores.length; i += CHUNK_SIZE) {
      const chunk = stores.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('stores')
        .upsert(chunk, {
          onConflict: 'name,address',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`❌ 청크 저장 실패 (인덱스 ${i}):`, error.message);
      } else {
        successCount += chunk.length;
        process.stdout.write(`\r진행률: ${Math.round((successCount / stores.length) * 100)}% (${successCount}/${stores.length})`);
      }
    }

    console.log(`\n✅ DB 동기화 완료: ${successCount} 개의 데이터가 처리되었습니다.`);

    // 7. 삭제 로직 (이번 배치에서 업데이트되지 않은 데이터 제거)
    // 안전장치: 수집된 데이터가 일정 수 이상일 때만 삭제 진행 (예: 1000개)
    if (successCount > 1000) {
      console.log('🧹 오래된 데이터(사라진 매장) 정리 중...');
      const { error: deleteError, count: deletedCount } = await supabase
        .from('stores')
        .delete({ count: 'exact' })
        .lt('updated_at', batchTimestamp);

      if (deleteError) {
        console.error('❌ 데이터 정리 실패:', deleteError.message);
      } else {
        console.log(`✅ 정리 완료: ${deletedCount || 0}개의 사라진 매장 데이터가 삭제되었습니다.`);
      }
    } else {
      console.warn('⚠️ 수집된 데이터가 너무 적어 자동 삭제를 건너뜁니다. (안전 모드)');
    }

    // 로컬 백업용 (선택 사항)
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'stores.json'), JSON.stringify(stores, null, 2), 'utf8');

    return { success: true, count: successCount };
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
