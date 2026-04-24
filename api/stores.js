const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // CDN 캐싱 헤더 추가: 1시간 캐싱, 10분 stale-while-revalidate
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

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
