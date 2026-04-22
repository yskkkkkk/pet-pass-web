const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function migrateData() {
  const filePath = path.join(process.cwd(), 'data', 'stores.json');
  if (!fs.existsSync(filePath)) {
    console.error('stores.json 파일을 찾을 수 없습니다.');
    return;
  }

  const stores = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`총 ${stores.length}개의 데이터를 마이그레이션합니다.`);

  const CHUNK_SIZE = 100;
  let successCount = 0;

  // 중복 제거 (name + address 기준)
  const uniqueStoresMap = new Map();
  stores.forEach(s => {
    const key = `${s.name}|${s.address}`;
    if (!uniqueStoresMap.has(key)) {
      uniqueStoresMap.set(key, s);
    }
  });
  const uniqueStores = Array.from(uniqueStoresMap.values());
  console.log(`중복 제거 후 ${uniqueStores.length}개의 데이터를 마이그레이션합니다.`);

  const batchTimestamp = new Date().toISOString();

  for (let i = 0; i < uniqueStores.length; i += CHUNK_SIZE) {
    const chunk = uniqueStores.slice(i, i + CHUNK_SIZE).map(s => ({
      name: s.name,
      address: s.address,
      type: s.type,
      region: s.region,
      lat: s.lat,
      lng: s.lng,
      verified: s.verified ?? true,
      phone_number: s.phone_number || null,
      description: s.description || null,
      naver_smartplace_link: s.naver_smartplace_link || null,
      updated_at: batchTimestamp
    }));

    const { error } = await supabase
      .from('stores')
      .upsert(chunk, { onConflict: 'name,address' });

    if (error) {
      console.error(`❌ 청크 마이그레이션 실패 (인덱스 ${i}):`, error.message);
    } else {
      successCount += chunk.length;
      console.log(`진행 중: ${successCount}/${stores.length}`);
    }
  }

  console.log('✅ 마이그레이션 완료!');
}

migrateData();
