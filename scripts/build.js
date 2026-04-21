const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');
const dataDir = path.join(__dirname, '..', 'data');
const apiDir = path.join(__dirname, '..', 'api');

async function build() {
  try {
    // 1. dist 디렉토리 초기화
    await fs.ensureDir(distDir);
    await fs.emptyDir(distDir);

    // 2. public 폴더 전체 복사
    await fs.copy(publicDir, distDir);
    console.log('📂 public directory copied to dist');

    // 3. data 폴더 복사
    await fs.copy(dataDir, path.join(distDir, 'data'));
    console.log('📂 data directory copied to dist');

    // 4. index.html에서 카카오맵 API 키 치환 (dist 내 파일 수정)
    const indexPath = path.join(distDir, 'index.html');
    let indexContent = await fs.readFile(indexPath, 'utf8');

    const KAKAO_KEY = process.env.KAKAO_MAP_API_KEY;
    if (!KAKAO_KEY) {
      console.warn('⚠️ KAKAO_MAP_API_KEY 환경 변수가 없습니다. 플레이스홀더를 유지합니다.');
    } else {
      indexContent = indexContent.replace(/appkey=[a-zA-Z0-9_]+/, `appkey=${KAKAO_KEY}`);
      indexContent = indexContent.replace('__KAKAO_MAP_API_KEY__', KAKAO_KEY);
      await fs.writeFile(indexPath, indexContent);
      console.log('✅ Kakao Map API Key injected into dist/index.html');
    }


    console.log('🚀 Build completed successfully!');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

build();
