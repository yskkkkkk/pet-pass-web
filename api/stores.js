const { handlePreflight, applyCors } = require('./_cors');
const { createClient } = require('@supabase/supabase-js');
const { createRateLimiter } = require('../lib/rate-limiter');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const rateLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });

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

    res.status(200).json(allStores);
  } catch (err) {
    console.error("매장 데이터를 가져오는 중 오류 발생:", err);
    res.status(500).json({ error: "매장 데이터를 불러올 수 없습니다." });
  }
};
