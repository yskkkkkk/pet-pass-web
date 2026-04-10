const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const publicDir = path.join(__dirname, '..', 'public');

async function build() {
  try {
    // index.html에서 카카오맵 API 키 치환 (in-place)
    const indexPath = path.join(publicDir, 'index.html');
    let indexContent = await fs.readFile(indexPath, 'utf8');

    const KAKAO_KEY = process.env.KAKAO_MAP_API_KEY;
    if (!KAKAO_KEY) {
      console.warn('⚠️ KAKAO_MAP_API_KEY 환경 변수가 없습니다. 플레이스홀더를 유지합니다.');
    } else {
      indexContent = indexContent.replace(/appkey=[a-zA-Z0-9_]+/, `appkey=${KAKAO_KEY}`);
      indexContent = indexContent.replace('__KAKAO_MAP_API_KEY__', KAKAO_KEY);
      await fs.writeFile(indexPath, indexContent);
      console.log('✅ Kakao Map API Key injected into public/index.html');
    }

    console.log('🚀 Build completed successfully!');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

build();
