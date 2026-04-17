const axios = require('axios');
const cheerio = require('cheerio');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 반려동물 동반 가능 업소 데이터를 식품안전나라에서 가져와 JSON으로 저장하는 스크립트
 */
async function syncPetFriendlyStores() {
  const portalUrl = process.env.PET_PORTAL_URL || 'https://www.foodsafetykorea.go.kr/portal/petKorea.do';
  const dataDir = path.join(process.cwd(), 'data');
  const outputPath = path.join(dataDir, 'stores.json');

  console.log('🚀 데이터 동기화 시작...');

  try {
    // 1. 데이터 저장 디렉토리 확인 및 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 2. 포털 페이지에서 엑셀 다운로드 링크 추출
    console.log(`🔗 포털 접속 중: ${portalUrl}`);
    const { data: html } = await axios.get(portalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(html);

    let downloadUrl = '';

    // 링크 텍스트나 href에 .xlsx가 포함된 '반려동물' 관련 링크 탐색
    $('a').each((_, el) => {
      const text = $(el).text();
      const href = $(el).attr('href');
      if (text.includes('반려동물') && (text.includes('xlsx') || (href && href.includes('xlsx')))) {
        downloadUrl = href || '';
      }
    });

    if (!downloadUrl) {
       $('a[href*=".xlsx"]').each((_, el) => {
          downloadUrl = $(el).attr('href') || '';
       });
    }

    if (!downloadUrl) {
      throw new Error('엑셀 다운로드 링크를 찾을 수 없습니다.');
    }

    // 상대 경로 처리
    if (!downloadUrl.startsWith('http')) {
      const baseUrl = new URL(portalUrl);
      downloadUrl = `${baseUrl.protocol}//${baseUrl.host}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
    }

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

    // 5. 데이터 변환 (사용자 요청 포맷)
    const stores = jsonData.map((row, index) => {
      const name = row['업소명'] || row['상호명'] || row['사업장명'] || 'Unknown';
      const address = row['소재지(도로명)'] || row['도로명주소'] || row['소재지'] || '';
      const type = row['업태명'] || row['업종'] || row['업태'] || '기타';
      const lat = parseFloat(row['위도'] || row['Y좌표'] || '0');
      const lng = parseFloat(row['경도'] || row['X좌표'] || '0');
      const region = address.split(' ')[0] || '';

      return {
        id: index + 1,
        name,
        originalName: name,
        type,
        region,
        address,
        lat,
        lng,
        verified: true
      };
    });

    // 안전장치: 데이터가 없을 경우 기존 파일을 덮어쓰지 않음
    if (stores.length === 0) {
      console.error('❌ 수집된 데이터가 0건입니다. 기존 파일을 유지합니다.');
      return { success: false, error: 'No data collected' };
    }

    // 6. JSON 파일로 저장
    fs.writeFileSync(outputPath, JSON.stringify(stores, null, 2), 'utf8');

    console.log(`✅ 저장 완료: ${outputPath} (${stores.length} 개의 데이터)`);
    return { success: true, count: stores.length };
  } catch (error) {
    console.error('❌ 데이터 동기화 실패:', error.message);
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
