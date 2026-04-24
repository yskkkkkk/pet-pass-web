const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { syncPetFriendlyStores } = require('./scripts/sync-stores');
const getPetData = require('./api/get-pet-data');
const { getAllowedOrigins, applyCors, handlePreflight } = require('./api/_cors');
const { createRateLimiter } = require('./lib/rate-limiter');
const { regionData } = require('./api/_regions');
require('dotenv').config();

const app = express();

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeCategory(category) {
  const map = {
    '카페': ['카페', '휴게음식점'],
    '일반음식점': ['일반음식점'],
    '제과점': ['제과점', '제과점영업'],
    '기타': ['기타']
  };

  if (!category || category === '전체') return null;
  return map[category] || [category];
}

/**
 * 성능 위주의 for 루프를 사용한 지역 통계 계산
 */
function calculateRegionCounts(stores) {
  const counts = {
    depth1: { "전국": stores.length },
    depth2: {}
  };

  const r1Keys = Object.keys(regionData);
  for (let i = 0; i < r1Keys.length; i++) {
    const r1 = r1Keys[i];
    counts.depth1[r1] = 0;
    counts.depth2[r1] = { "전체": 0 };
    const districts = regionData[r1];
    for (let j = 0; j < districts.length; j++) {
      counts.depth2[r1][districts[j]] = 0;
    }
  }

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    const addr = store.address || '';

    for (let j = 0; j < r1Keys.length; j++) {
      const r1 = r1Keys[j];
      if (addr.includes(r1)) {
        counts.depth1[r1]++;
        counts.depth2[r1]["전체"]++;
        const districts = regionData[r1];
        for (let k = 0; k < districts.length; k++) {
          const r2 = districts[k];
          if (addr.includes(r2)) {
            counts.depth2[r1][r2]++;
          }
        }
        break;
      }
    }
  }

  return counts;
}

// Supabase 초기화
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  if (handlePreflight(req, res)) return;
  if (!applyCors(req, res)) {
    return res.status(403).json({ error: '허용되지 않은 Origin 입니다.' });
  }
  next();
});

console.log('[CORS] 허용 Origin:', getAllowedOrigins().join(', '));

app.use(express.json());

const authLimiter   = createRateLimiter({ max: 10, windowMs: 60_000 });
const storesLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Server error');
    const KAKAO_KEY = process.env.KAKAO_MAP_API_KEY || '';
    const result = html.replace('__KAKAO_MAP_API_KEY__', KAKAO_KEY);
    res.setHeader('Content-Type', 'text/html');
    res.send(result);
  });
});

app.get('/api/stores', storesLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  try {
    const { category, region1, region2, search, minLat, maxLat, minLng, maxLng } = req.query;

    let query = supabase.from('stores').select('*');

    const targetTypes = normalizeCategory(category);
    if (targetTypes) {
      query = query.in('type', targetTypes);
    }

    if (region1 && region1 !== '전국') {
      query = query.ilike('address', `%${region1}%`);
      if (region2 && region2 !== '전체') {
        query = query.ilike('address', `%${region2}%`);
      }
    }

    if (search) {
      const keyword = search.trim();
      if (keyword) {
        query = query.or(`name.ilike.%${keyword}%,address.ilike.%${keyword}%`);
      }
    }

    const sminLat = parseNumber(minLat);
    const smaxLat = parseNumber(maxLat);
    const sminLng = parseNumber(minLng);
    const smaxLng = parseNumber(maxLng);
    if (sminLat !== null && smaxLat !== null && sminLng !== null && smaxLng !== null) {
      query = query
        .gte('lat', sminLat)
        .lte('lat', smaxLat)
        .gte('lng', sminLng)
        .lte('lng', smaxLng);
    }

    const allFilteredStores = [];
    let from = 0;
    let to = 999;

    while (true) {
      const { data, error } = await query
        .range(from, to)
        .order('name', { ascending: true });

      if (error) throw error;
      allFilteredStores.push(...data);

      if (data.length < 1000) break;
      from += 1000;
      to += 1000;
    }

    const regionCounts = calculateRegionCounts(allFilteredStores);

    const limitRaw = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const items = allFilteredStores.slice(offset, offset + limit);

    res.json({
      items,
      total: allFilteredStores.length,
      limit,
      offset,
      hasMore: offset + items.length < allFilteredStores.length,
      regionCounts
    });
  } catch (err) {
    console.error("매장 데이터를 가져오는 중 오류 발생:", err);
    res.status(500).json({ error: "매장 데이터를 불러올 수 없습니다." });
  }
});

app.get('/api/auth-pet', authLimiter, async (req, res) => {
  const { dogRegNo, ownerBirth } = req.query;
  
  if (!dogRegNo || !ownerBirth) {
    return res.status(400).json({ error: "동물등록번호와 생년월일이 필요합니다." });
  }

  if (!/^\d{15}$/.test(dogRegNo)) {
    return res.status(400).json({ error: "유효하지 않은 등록번호 형식입니다. (숫자 15자리 필수)" });
  }
  if (!/^\d{6}$/.test(ownerBirth)) {
    return res.status(400).json({ error: "생년월일은 숫자 6자리(예: 900101)로 입력해주세요." });
  }

  if (!process.env.DATA_GO_KR_API_KEY) {
    console.log("[DEV MODE] 정부 API 키가 세팅되지 않아 가상의 인증 성공 응답을 내보냅니다.");
    setTimeout(() => {
      return res.json({
        success: true,
        message: "API Key 미설정 (테스트 모드)",
        data: {
          dogNm: "초코",
          kindNm: "푸들",
          sexNm: "암컷",
          neuterYn: "중성",
          dogRegNo: dogRegNo,
          ownerBirth: ownerBirth,
          orgNm: "경기도 성남시",
          officNm: "분당구청",
          vaccinationStatus: "완료 (2026-03-01)"
        }
      });
    }, 1500);
    return;
  }

  try {
    const GOV_API_URL = 'https://apis.data.go.kr/1543061/animalInfoSrvc_v3/animalInfo_v3';
    const serviceKey = process.env.DATA_GO_KR_API_KEY;

    const response = await axios.get(GOV_API_URL, {
      params: {
        serviceKey: serviceKey,
        dog_reg_no: dogRegNo,
        rfid_cd: dogRegNo,
        owner_birth: ownerBirth,
        _type: 'json'
      },
      headers: { 'accept': '*/*' }
    });
    
    let header, body;
    if (typeof response.data === 'string' && response.data.includes('<?xml')) {
      const getValue = (tag) => {
        const match = response.data.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
        return match ? match[1] : null;
      };
      header = { resultCode: getValue('resultCode'), resultMsg: getValue('resultMsg') };
      body = { item: { 
        dogNm: getValue('dogNm'), 
        kindNm: getValue('kindNm'),
        sexNm: getValue('sexNm'),
        neuterYn: getValue('neuterYn'),
        orgNm: getValue('orgNm')
      }};
    } else {
      header = response.data?.response?.header;
      body = response.data?.response?.body;
    }
    
    console.log(`[RESPONSE] 결과 코드: ${header?.resultCode}, 메시지: ${header?.resultMsg}`);

    const isSuccess = header?.resultCode === '00';
    const hasData = body?.item && (body.item.dogNm || Object.keys(body.item).length > 5);

    if (isSuccess) {
      const petData = hasData ? body.item : {
        dogNm: "두부",
        kindNm: "말티즈 (테스트)",
        sexNm: "암컷",
        neuterYn: "중성",
        dogRegNo: dogRegNo,
        ownerBirth: ownerBirth,
        orgNm: "서울특별시 강남구",
        officNm: "역삼1동 주민센터",
        vaccinationStatus: "완료 (2026-04-01)"
      };

      return res.json({
        success: true,
        message: hasData ? "국가동물보호정보시스템 인증에 성공하였습니다." : "정부 시스템 인증 성공 (테스트 데이터 모드입니다.)",
        data: petData
      });
    } else {
      return res.status(400).json({
        success: false,
        error: header?.resultMsg || "인증 실패"
      });
    }
  } catch (error) {
    console.error("정부 API 통신 에러:", error.message);
    return res.status(500).json({
      error: "정부망 통신 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
});

app.get('/api/get-pet-data', authLimiter, getPetData);

app.listen(PORT, () => {
  console.log(`🚀 Pet-Pass 백엔드 서버가 시작되었습니다!`);
  console.log(`🌐 주소: http://localhost:${PORT}`);
  const govKey = process.env.DATA_GO_KR_API_KEY;
  const isMock = !govKey;
  console.log(`🔑 상태: 정부 API Key ${isMock ? '미설정 (모의 응답 작동)' : '적용 완료'}`);

  console.log('🔄 서버 시작 시 초기 데이터 동기화를 시작합니다...');
  syncPetFriendlyStores().then(result => {
    if (result.success) {
      console.log(`✅ 초기 데이터 동기화 완료`);
    } else {
      console.warn(`⚠️ 초기 데이터 동기화 실패 (기존 데이터 유지): ${result.error}`);
    }
  }).catch(err => {
    console.error('❌ 초기 데이터 동기화 중 예상치 못한 에러 발생:', err.message);
  });

  cron.schedule('0 4 * * *', async () => {
    console.log('⏰ 정기 데이터 동기화를 시작합니다 (새벽 4시)...');
    try {
      const result = await syncPetFriendlyStores();
      if (result.success) {
        console.log(`✅ 정기 데이터 동기화 완료`);
      } else {
        console.warn(`⚠️ 정기 데이터 동기화 실패: ${result.error}`);
      }
    } catch (err) {
      console.error('❌ 정기 데이터 동기화 중 에러 발생:', err.message);
    }
  }, {
    timezone: "Asia/Seoul"
  });
});
