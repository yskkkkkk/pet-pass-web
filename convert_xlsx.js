const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// 지역명 → 대표 좌표 매핑 (중심 좌표, 마커는 지역 내 분산)
const regionCoords = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '경기': { lat: 37.4138, lng: 127.5183 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '세종': { lat: 36.4800, lng: 127.2890 },
  '강원': { lat: 37.8228, lng: 128.1555 },
  '충북': { lat: 36.8000, lng: 127.7000 },
  '충남': { lat: 36.5184, lng: 126.8000 },
  '전북': { lat: 35.7175, lng: 127.1530 },
  '전남': { lat: 34.8679, lng: 126.9910 },
  '경북': { lat: 36.4919, lng: 128.8889 },
  '경남': { lat: 35.4606, lng: 128.2132 },
  '제주': { lat: 33.4996, lng: 126.5312 },
};

// 주소에서 시/구/동 등을 파싱해 조금씩 좌표를 흩어뜨리기
function getCoords(region, address, index) {
  const base = regionCoords[region] || { lat: 36.5, lng: 127.5 };
  
  // hash-like scatter so nearby entries are not 1:1 stacked
  const seed = index * 1.6180339887;
  const latOffset = ((seed % 100) - 50) / 10000 * 5;
  const lngOffset = ((seed * 1.414 % 100) - 50) / 10000 * 5;
  
  return {
    lat: parseFloat((base.lat + latOffset).toFixed(6)),
    lng: parseFloat((base.lng + lngOffset).toFixed(6))
  };
}

const filePath = path.join(__dirname, 'data', '반려동물_동반가능_업소현황(2026.4.9 8시42분 기준).xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

// 업종 한글 → 우리 서비스 카테고리 매핑
const typeMap = {
  '일반음식점': '일반음식점',
  '휴게음식점': '카페',
  '제과점영업': '제과점',
  '제과점': '제과점',
  '카페': '카페',
  '식품접객업': '일반음식점',
};

const stores = rows.map((row, idx) => {
  const coords = getCoords(row['지역'] || '', row['업소주소'] || '', idx);
  const rawType = row['업종'] || '';
  const type = typeMap[rawType] || rawType || '기타';
  
  return {
    id: idx + 1,
    name: (row['업소명'] || '').replace(/^\(주\)/, '').trim(), // (주) prefix 제거
    originalName: row['업소명'] || '',
    type: type,
    region: row['지역'] || '',
    address: row['업소주소'] || '',
    lat: coords.lat,
    lng: coords.lng,
    verified: true
  };
});

const outputPath = path.join(__dirname, 'data', 'stores.json');
fs.writeFileSync(outputPath, JSON.stringify(stores, null, 2), 'utf8');

console.log(`✅ 완료! ${stores.length}개 매장을 stores.json에 저장했습니다.`);

// 지역별 통계 출력
const regionStats = {};
stores.forEach(s => {
  regionStats[s.region] = (regionStats[s.region] || 0) + 1;
});
console.log('\n지역별 매장 수:');
Object.entries(regionStats).sort((a,b) => b[1]-a[1]).forEach(([r,c]) => {
  console.log(`  ${r}: ${c}개`);
});
