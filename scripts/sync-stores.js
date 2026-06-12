const axios = require('axios');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const iconv = require('iconv-lite');
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

/**
 * 결과를 docs/schedule_history.md에 기록
 */
async function updateScheduleHistory(success, details) {
  try {
    const historyPath = path.join(process.cwd(), 'docs', 'schedule_history.md');
    const now = new Date();
    // KST 시간 포맷팅 (UTC+9)
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    const dateStr = kstDate.toISOString().replace('T', ' ').substring(0, 19).replace(/-/g, '. ') + ' (KST)';

    const status = success ? '✅ 성공' : '❌ 실패';
    const newRow = `| ${dateStr} | ${status} | ${details} |`;

    let content = '';
    if (fs.existsSync(historyPath)) {
      content = fs.readFileSync(historyPath, 'utf8');
    } else {
      content = '# 🕒 데이터 수집 스케줄링 이력\n\n> GitHub Actions(`daily_sync.yml`) 실행 시, 최신 결과가 표 최상단에 자동으로 기록됩니다.\n\n| 일시 (KST) | 결과 | 비고 |\n| :--- | :--- | :--- |';
    }

    const lines = content.split('\n');
    const tableHeaderIndex = lines.findIndex(line => line.includes('| 일시 (KST) | 결과 | 비고 |'));

    if (tableHeaderIndex !== -1) {
      // 헤더 + 구분선(---) 다음에 삽입
      lines.splice(tableHeaderIndex + 2, 0, newRow);
    } else {
      lines.push(newRow);
    }

    fs.writeFileSync(historyPath, lines.join('\n'), 'utf8');
    console.log('📝 스케줄 히스토리 업데이트 완료 (최상단 추가).');
  } catch (err) {
    console.warn(`⚠️ 스케줄 히스토리 업데이트 실패: ${err.message}`);
  }
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
 * 엑셀 버퍼를 한글 인코딩 보정과 함께 파싱한다.
 *
 * 식품안전나라 엑셀은 .xls(BIFF) 또는 .xlsx(OOXML) 형식으로 제공되며,
 * 일부 한글 음절이 CP949 인코딩된 채로 저장돼 SheetJS 기본 파싱 시 '?'로 깨진다.
 *
 * - .xls  → codepage: 949 옵션으로 처리
 * - .xlsx → sharedStrings.xml 내 바이트를 EUC-KR로 재디코딩 후 파싱
 */
async function parseExcelWithKoreanEncoding(buffer) {
  const buf = Buffer.from(buffer);
  const magic = buf.slice(0, 4).toString('hex');

  // OLE2 (.xls BIFF)
  if (magic.startsWith('d0cf11e0')) {
    console.log('📄 파일 형식: xls (BIFF) → codepage 949 적용');
    return XLSX.read(buf, { type: 'buffer', codepage: 949 });
  }

  // ZIP (.xlsx OOXML)
  if (magic.startsWith('504b')) {
    console.log('📄 파일 형식: xlsx (OOXML) → sharedStrings.xml 인코딩 보정 시도');
    try {
      const zip = await JSZip.loadAsync(buf);
      const ssFile = zip.file('xl/sharedStrings.xml');

      if (ssFile) {
        const rawBytes = await ssFile.async('uint8array');
        const asUtf8 = Buffer.from(rawBytes).toString('utf8');

        // UTF-8 디코딩 결과에 깨진 문자(U+FFFD �)가 있으면 바이트가 EUC-KR로 인코딩된 것
        // '?'는 XML 선언(<? ... ?>)에도 포함되므로 검사하지 않음
        if (asUtf8.includes('�')) {
          console.log('⚠️  sharedStrings.xml 인코딩 오류 감지 → EUC-KR 재디코딩');
          const reencoded = iconv.decode(Buffer.from(rawBytes), 'euc-kr');
          // XML 선언의 encoding 속성을 UTF-8로 교체해야 SheetJS가 올바르게 파싱함
          const fixedXml = reencoded.replace(/encoding="[^"]*"/i, 'encoding="UTF-8"');
          zip.file('xl/sharedStrings.xml', Buffer.from(fixedXml, 'utf8'));
          const fixedBuf = await zip.generateAsync({ type: 'nodebuffer' });
          return XLSX.read(fixedBuf, { type: 'buffer' });
        }
      }
    } catch (e) {
      console.warn('⚠️  ZIP 처리 실패, 기본 파싱 fallback:', e.message);
    }
    return XLSX.read(buf, { type: 'buffer' });
  }

  // 알 수 없는 형식 — 그냥 시도
  console.warn(`⚠️  알 수 없는 파일 형식 (magic: ${magic}), 기본 파싱 시도`);
  return XLSX.read(buf, { type: 'buffer', codepage: 949 });
}

// 식품안전나라 Excel 내 깨진 업소명 보정 맵
// 정부 시스템이 일부 희귀 한글 음절을 '?'로 출력하는 문제를 sync 단계에서 교정
// KEY: '?' 앞뒤 공백을 제거한 정규화 형태
const NAME_CORRECTIONS = new Map([
  ['?잔',          '컾잔'],
  ['?커피,MOCC',   '뫀커피,MOCC'],
  ['우?(WooDic)',  '우딬(WooDic)'],
  ['잇?(IT COF.)', '잇컾(IT COF.)'],
  ['율?당',        '율뭌당'],
  ['카페 드 조?',  '카페 드 죠즈'],
  ['프?츠',        '프릳츠'],
]);

function correctBrokenName(name) {
  if (!hasBrokenKoreanText(name)) return name;
  // '? ' 앞뒤 공백만 제거해서 매핑 키로 사용 (나머지 공백은 유지)
  const normalized = name.replace(/\s*[?？]\s*/g, '?');
  return NAME_CORRECTIONS.get(normalized) ?? name;
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

    // 4. 엑셀 파싱 (한글 인코딩 보정 포함)
    console.log('📊 데이터 파싱 중...');
    const workbook = await parseExcelWithKoreanEncoding(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    console.log(`📋 파싱 결과: ${jsonData.length}행, 컬럼: ${jsonData.length > 0 ? Object.keys(jsonData[0]).join(', ') : '없음'}`);

    // 5. 차분 분석 및 데이터 변환
    const toUpsert = [];
    const processedKeys = new Set();
    let hasFirstGeocodeAttempt = false;
    let apiCallCount = 0;

    // 데이터 품질 지표 초기화
    const stats = {
      total: jsonData.length,
      invalid: 0,
      duplicates: 0,
      missingCoords: 0,
      unverified: 0,
      upserted: 0,
      deleted: 0
    };

    console.log('🔄 차분 분석(Diff) 및 지오코딩 진행 중...');
    for (let index = 0; index < jsonData.length; index++) {
      const row = jsonData[index];
      let name = correctBrokenName(row['업소명'] || 'Unknown');

      const address = pickFirst(row, ['업소주소']);
      if (!name || !address) {
        stats.invalid++;
        continue;
      }

      const key = `${name}|${address}`;
      if (processedKeys.has(key)) {
        stats.duplicates++;
        continue; // 엑셀 내 중복 제거
      }
      processedKeys.add(key);

      // 보정 후에도 깨짐 문자가 남아있으면 미검증 상태로 격리
      const isNameBroken = hasBrokenKoreanText(name);
      if (isNameBroken) {
        stats.unverified++;
        console.warn(`⚠️ 미검증 매장 (이름에 ? 포함): "${name}" — verified: false로 저장, 지오코딩 건너뜀`);
      }

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
                        existing.naver_smartplace_link !== naver_link ||
                        existing.verified !== !isNameBroken;

      if (!isChanged && existing.lat && existing.lng) {
        // 변경사항 없고 좌표도 있으면 스킵 (DB에 updated_at만 갱신하기 위해 넣을 수도 있지만,
        // 여기서는 완전 최적화를 위해 skip. 대신 아래 삭제 로직에서 key set으로 판별)
        continue;
      }

      // 지오코딩 (필요한 경우에만, 미검증 매장은 건너뜀)
      let lat = existing?.lat || 0;
      let lng = existing?.lng || 0;

      if (!isNameBroken && (!lat || !lng)) {
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

      if (!isNameBroken && !lat || !lng) {
        stats.missingCoords++;
      }

      toUpsert.push({
        name,
        address,
        type,
        region,
        lat: isNameBroken ? 0 : lat,
        lng: isNameBroken ? 0 : lng,
        verified: !isNameBroken,
        phone_number,
        description,
        naver_smartplace_link: naver_link,
        updated_at: batchTimestamp
      });
    }

    stats.upserted = toUpsert.length;

    // 6-7. 핵심 DB 반영 단계 (업서트 + 삭제)
    // NOTE: Supabase JS 클라이언트 특성상 클라이언트 코드 레벨에서 다중 쿼리 트랜잭션을 직접 보장하기 어려워,
    // 실패 시 즉시 throw 하여 이후 단계를 중단한다. (부분 반영 방지를 위한 서버측 RPC 트랜잭션은 추후 권장)
    if (toUpsert.length > 0) {
      console.log(`📤 신규/변경 데이터 저장 중... (${toUpsert.length}건)`);
      const CHUNK_SIZE = 100;
      for (let i = 0; i < toUpsert.length; i += CHUNK_SIZE) {
        const chunk = toUpsert.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from('stores').upsert(chunk, { onConflict: 'name,address' });
        if (error) {
          throw new Error(`UPSERT 실패: ${error.message}`);
        }
      }
    } else {
      console.log('✅ 업데이트할 새로운 데이터가 없습니다.');
    }

    // 삭제 로직 (엑셀에 없는 매장 제거)
    // 엑셀에서 처리된 processedKeys에 포함되지 않은 DB 데이터들을 삭제
    const toDeleteIds = [];
    for (const [key, store] of dbStoreMap.entries()) {
      if (!processedKeys.has(key)) {
        toDeleteIds.push(store.id);
      }
    }

    if (toDeleteIds.length > 0) {
      stats.deleted = toDeleteIds.length;
      // 안전장치: 전체 데이터의 30% 이상이 한 번에 삭제되려 하면 경고 후 중단
      const deleteRatio = toDeleteIds.length / totalLoaded;
      if (deleteRatio > 0.3 && totalLoaded > 100) {
        console.error(`⚠️ 위함: 대량 삭제 감지 (${toDeleteIds.length}건, ${Math.round(deleteRatio * 100)}%). 동기화를 중단합니다.`);
        return { success: false, error: 'Massive deletion prevention triggered' };
      }

      console.log(`🧹 사라진 매장 정리 중... (${toDeleteIds.length}건)`);
      const { error: delError } = await supabase
        .from('stores')
        .delete()
        .in('id', toDeleteIds);

      if (delError) {
        throw new Error(`삭제 실패: ${delError.message}`);
      }
      console.log('✅ 정리 완료.');
    }

    // 8. 로컬 백업 (부가 단계): 실패해도 전체 동기화 성공/실패를 바꾸지 않는다.
    let backupWarning = null;
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'stores.json'), JSON.stringify(toUpsert, null, 2), 'utf8');
    } catch (backupError) {
      backupWarning = `로컬 백업 실패: ${backupError.message}`;
      console.warn(`⚠️ ${backupWarning}`);
    }

    const result = { success: true, ...stats, backupWarning };

    // 리포트 생성 (건수 및 비율)
    const getRate = (count) => stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : '0.0';

    const report = [
      `${stats.upserted}개 업데이트`,
      `${stats.deleted}개 삭제`,
      `[품질지표: 누락 ${stats.invalid}건(${getRate(stats.invalid)}%), ` +
      `중복 ${stats.duplicates}건(${getRate(stats.duplicates)}%), ` +
      `좌표미보유 ${stats.missingCoords}건(${getRate(stats.missingCoords)}%), ` +
      `미검증(? 포함) ${stats.unverified}건]`
    ].join(' | ');

    await updateScheduleHistory(true, report);
    return result;
  } catch (error) {
    console.error(`❌ 데이터 동기화 실패: ${error.message}`);
    await updateScheduleHistory(false, error.message);
    return { success: false, error: error.message };
  }
}

// 스크립트로 직접 실행 시 (node scripts/sync-stores.js)
if (require.main === module) {
  syncPetFriendlyStores().then(res => {
      if (!res.success) process.exit(1);
  });
}

module.exports = { syncPetFriendlyStores, correctBrokenName, hasBrokenKoreanText };
