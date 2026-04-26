/**
 * 일회성 스크립트: DB에 저장된 `?` 깨짐 업소명을 올바른 이름으로 직접 수정
 * 실행: node scripts/fix-broken-names.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// 깨진 이름 → 올바른 이름 (기존 패치맵 기반)
const NAME_FIXES = [
  { broken: '？커피,MOCC',       fixed: '뫀커피,MOCC' },
  { broken: '?커피,MOCC',        fixed: '뫀커피,MOCC' },
  { broken: '우？(WooDic)',      fixed: '우딬(WooDic)' },
  { broken: '우?(WooDic)',       fixed: '우딬(WooDic)' },
  { broken: '잇？(IT COF.)',     fixed: '잇컾(IT COF.)' },
  { broken: '잇?(IT COF.)',      fixed: '잇컾(IT COF.)' },
  { broken: '율？당',            fixed: '율뭌당' },
  { broken: '율?당',             fixed: '율뭌당' },
  { broken: '카페 드 조？',      fixed: '카페 드 죠즈' },
  { broken: '카페 드 조?',       fixed: '카페 드 죠즈' },
  { broken: '프？츠',            fixed: '프릳츠' },
  { broken: '프?츠',             fixed: '프릳츠' },
];

async function fixBrokenNames() {
  console.log('🔍 깨진 업소명 조회 중...\n');

  let totalFixed = 0;

  for (const { broken, fixed } of NAME_FIXES) {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, address')
      .eq('name', broken);

    if (error) {
      console.error(`❌ 조회 실패 [${broken}]:`, error.message);
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`⏭  없음: "${broken}"`);
      continue;
    }

    for (const store of data) {
      const { error: updateError } = await supabase
        .from('stores')
        .update({ name: fixed })
        .eq('id', store.id);

      if (updateError) {
        console.error(`❌ 수정 실패 [id=${store.id}]:`, updateError.message);
      } else {
        console.log(`✅ 수정: "${broken}" → "${fixed}" (${store.address})`);
        totalFixed++;
      }
    }
  }

  console.log(`\n완료: 총 ${totalFixed}개 업소명 수정`);
}

fixBrokenNames();
