const { handlePreflight, applyCors } = require('./_cors');
const { createClient } = require('@supabase/supabase-js');
const { createRateLimiter } = require('../lib/rate-limiter');

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

function applyFilters(stores, filters) {
  const {
    category,
    region1,
    region2,
    search,
    minLat,
    maxLat,
    minLng,
    maxLng
  } = filters;

  const targetTypes = normalizeCategory(category);
  const keyword = (search || '').trim().toLowerCase();

  const filtered = [];
  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];

    if (targetTypes && !targetTypes.includes(store.type)) continue;

    if (region1 && region1 !== '전국') {
      if (!store.address?.includes(region1)) continue;
      if (region2 && region2 !== '전체' && !store.address?.includes(region2)) continue;
    }

    if (keyword) {
      const lowerName = String(store.name || '').toLowerCase();
      const lowerAddr = String(store.address || '').toLowerCase();
      if (!lowerName.includes(keyword) && !lowerAddr.includes(keyword)) continue;
    }

    const hasBounds = [minLat, maxLat, minLng, maxLng].every(v => v !== null);
    if (hasBounds) {
      if (store.lat === null || store.lng === null || store.lat === undefined || store.lng === undefined) continue;
      const lat = Number(store.lat);
      const lng = Number(store.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
    }

    filtered.push(store);
  }

  return filtered;
}

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) {
    return;
  }

  if (!applyCors(req, res)) {
    return res.status(403).json({ error: '허용되지 않은 Origin 입니다.' });
  }

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  // Rate limiting: IP당 분당 30회 초과 시 429 반환
  let proceed = false;
  rateLimiter(req, res, () => { proceed = true; });
  if (!proceed) return;

  try {
    const allStores = [];
    let from = 0;
    let to = 999;

    while (true) {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .range(from, to)
        .order('name', { ascending: true });

      if (error) throw error;
      allStores.push(...data);

      if (data.length < 1000) break;
      from += 1000;
      to += 1000;
    }

    const filteredStores = applyFilters(allStores, {
      category: req.query.category,
      region1: req.query.region1,
      region2: req.query.region2,
      search: req.query.search,
      minLat: parseNumber(req.query.minLat),
      maxLat: parseNumber(req.query.maxLat),
      minLng: parseNumber(req.query.minLng),
      maxLng: parseNumber(req.query.maxLng),
    });

    const limitRaw = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
    const items = filteredStores.slice(offset, offset + limit);

    res.status(200).json({
      items,
      total: filteredStores.length,
      limit,
      offset,
      hasMore: offset + items.length < filteredStores.length,
    });
  } catch (err) {
    console.error("매장 데이터를 가져오는 중 오류 발생:", err);
    res.status(500).json({ error: "매장 데이터를 불러올 수 없습니다." });
  }
};
