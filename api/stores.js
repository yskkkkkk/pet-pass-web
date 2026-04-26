const { handlePreflight, applyCors } = require('./_cors');
const { createClient } = require('@supabase/supabase-js');
const { createRateLimiter } = require('../lib/rate-limiter');
const { regionData } = require('./_regions');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const rateLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

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

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: '허용되지 않은 Origin 입니다.' });

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  let proceed = false;
  rateLimiter(req, res, () => { proceed = true; });
  if (!proceed) return;

  try {
    const { category, region1, region2, search, minLat, maxLat, minLng, maxLng } = req.query;

    // 1. Supabase Query 빌드 (서버 사이드 필터링)
    // verified: false 매장(이름에 ? 포함)은 사용자에게 노출하지 않음
    let query = supabase.from('stores').select('*').eq('verified', true);

    // 카테고리 필터
    const targetTypes = normalizeCategory(category);
    if (targetTypes) {
      query = query.in('type', targetTypes);
    }

    // 지역 필터 (Depth 1, Depth 2)
    if (region1 && region1 !== '전국') {
      query = query.ilike('address', `%${region1}%`);
      if (region2 && region2 !== '전체') {
        query = query.ilike('address', `%${region2}%`);
      }
    }

    // 검색 필터
    if (search) {
      const keyword = search.trim();
      if (keyword) {
        query = query.or(`name.ilike.%${keyword}%,address.ilike.%${keyword}%`);
      }
    }

    // 지도 영역 필터
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

    // 데이터 가져오기 (1000개 제한 우회를 위한 배치 처리)
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

    // 2. 지역 통계 계산 (High-performance loop)
    const regionCounts = calculateRegionCounts(allFilteredStores);

    // 3. 페이지네이션 처리
    const limitRaw = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const items = allFilteredStores.slice(offset, offset + limit);

    res.status(200).json({
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
};
