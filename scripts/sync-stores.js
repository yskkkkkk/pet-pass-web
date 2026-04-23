const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

function getSupabaseClient() {
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL이 설정되어 있지 않습니다.');
  }

  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY가 설정되어 있지 않습니다.');
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
  );
}

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
  const supabase = getSupabaseClient();

  console.log(`🚀 데이터 동기화 시작 (배치 시간: ${batchTimestamp})...`);

  try {
    if (!kakaoApiKey) {
      throw new Error('KAKAO_REST_API_KEY가 설정되어 있지 않습니다.');
    }

    // 1. 기존 DB 데이터 전체 로드 (비교 및 캐싱용)
    console.log('📡 기존 DB 데이터 로드 및 차분 분석 준비 중...');
    const dbStoreMap = new Map(); // Key: name|address
    const geocodeCache = new Map();

    let from = 0;
    let to = 999;
    let totalLoaded = 0;

    while (true) {
      const { data: dbStores, error: dbError } = await supabase
        .from('stores')
        .select('*')
        .range(from, to);

      if (dbError) {
        console.warn('⚠️ DB 데이터 로드 실패:', dbError.message);
        break;
      }

      if (dbStores) {
        dbStores.forEach(s => {
          const key = `${s.name}|${s.address}`;
          dbStoreMap.set(key, s);
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
    console.log(`✅ ${totalLoaded}개의 데이터를 불러왔습니다. (좌표 캐시: ${geocodeCache.size}개)`);

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

    // 5. 차분 분석 및 데이터 변환
    const toUpsert = [];
    const processedKeys = new Set();
    let hasFirstGeocodeAttempt = false;
    let apiCallCount = 0;

    console.log('🔄 차분 분석(Diff) 및 지오코딩 진행 중...');
    for (let index = 0; index < jsonData.length; index++) {
      const row = jsonData[index];
      let name = row['업소명'] || 'Unknown';

      // 이름 깨짐 보정 적용
      if (KOREAN_NAME_PATCH_MAP[name]) {
        name = KOREAN_NAME_PATCH_MAP[name];
      }

      const address = pickFirst(row, ['업소주소']);
      if (!name || !address) continue;

      const key = `${name}|${address}`;
      if (processedKeys.has(key)) continue; // 엑셀 내 중복 제거
      processedKeys.add(key);

      let type = pickFirst(row, ['업종']) || '기타';
      if (type === '휴게음식점') type = '카페';
      if (type === '제과점영업') type = '제과점';

      const region = pickFirst(row, ['지역']) || (address.split(' ')[0] || '');
      const phone_number = row['전화번호'] || row['연락처'] || null;
      const description = row['설명'] || row['개요'] || null;
      const naver_link = row['네이버링크'] || row['스마트플레이스'] || null;

      // 기존 데이터 확인
      const existing = dbStoreMap.get(key);

      // 변경 여부 체크 (중요 필드 위주)
      const isChanged = !existing ||
                        existing.type !== type ||
                        existing.region !== region ||
                        existing.phone_number !== phone_number ||
                        existing.description !== description ||
                        existing.naver_smartplace_link !== naver_link;

      if (!isChanged && existing.lat && existing.lng) {
        // 변경사항 없고 좌표도 있으면 스킵 (DB에 updated_at만 갱신하기 위해 넣을 수도 있지만,
        // 여기서는 완전 최적화를 위해 skip. 대신 아래 삭제 로직에서 key set으로 판별)
        continue;
      }

      // 지오코딩 (필요한 경우에만)
      let lat = existing?.lat || 0;
      let lng = existing?.lng || 0;

      if (!lat || !lng) {
        if (!geocodeCache.has(address)) {
          const geocoded = await geocodeAddress(address);
          apiCallCount++;
          if (!hasFirstGeocodeAttempt && apiCallCount === 1) {
            hasFirstGeocodeAttempt = true;
            if (!geocoded) console.warn(`⚠️ 지오코딩 실패: ${address}`);
          }
          geocodeCache.set(address, geocoded);
          if (geocoded) await new Promise(resolve => setTimeout(resolve, 100));
        }
        const cached = geocodeCache.get(address);
        lat = cached?.lat || 0;
        lng = cached?.lng || 0;
      }

      toUpsert.push({
        name,
        address,
        type,
        region,
        lat,
        lng,
        verified: true,
        phone_number,
        description,
        naver_smartplace_link: naver_link,
        updated_at: batchTimestamp
      });
    }

    // 6. DB 반영 (신규/변경 데이터)
    if (toUpsert.length > 0) {
      console.log(`📤 신규/변경 데이터 저장 중... (${toUpsert.length}건)`);
      const CHUNK_SIZE = 100;
      for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
        const chunk = toUpsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('stores').upsert(chunk, { onConflict: 'name,address' });
        if (error) console.error(`❌ UPSERT 실패:`, error.message);
      }
    } else {
      console.log('✅ 업데이트할 새로운 데이터가 없습니다.');
    }

    // 7. 삭제 로직 (엑셀에 없는 매장 제거)
    // 엑셀에서 처리된 processedKeys에 포함되지 않은 DB 데이터들을 삭제
    const toDeleteIds = [];
    for (const [key, store] of dbStoreMap.entries()) {
      if (!processedKeys.has(key)) {
        toDeleteIds.push(store.id);
      }
    }

    if (toDeleteIds.length > 0) {
      // 안전장치: 전체 데이터의 30% 이상이 한 번에 삭제되려 하면 경고 후 중단
      const deleteRatio = toDeleteIds.length / totalLoaded;
      if (deleteRatio > 0.3 && totalLoaded > 100) {
        console.error(`⚠️ 위함: 대량 삭제 감지 (${toDeleteIds.length}건, ${Math.round(deleteRatio*100)}%). 동기화를 중단합니다.`);
        return { success: false, error: 'Massive deletion prevention triggered' };
      }

      console.log(`🧹 사라진 매장 정리 중... (${toDeleteIds.length}건)`);
      const { error: delError } = await supabase
        .from('stores')
        .delete()
        .in('id', toDeleteIds);

      if (delError) console.error('❌ 삭제 실패:', delError.message);
      else console.log('✅ 정리 완료.');
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
