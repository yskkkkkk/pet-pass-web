const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const srcDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');

async function build() {
  try {
    // 1. dist 폴더 초기화
    if (fs.existsSync(distDir)) {
      await fs.remove(distDir);
    }
    await fs.ensureDir(distDir);

    // 2. public 폴더의 모든 파일을 dist로 복사
    await fs.copy(srcDir, distDir);
    console.log('✅ Public files copied to dist.');

    // 3. api 폴더를 dist/api로 복사 (Vercel 서버리스 함수)
    const apiSrcDir = path.join(__dirname, '..', 'api');
    const apiDistDir = path.join(distDir, 'api');
    if (fs.existsSync(apiSrcDir)) {
      await fs.copy(apiSrcDir, apiDistDir);
      console.log('✅ API files copied to dist/api.');
    }

    // 4. index.html에서 카카오맵 API 키 치환
    const indexPath = path.join(distDir, 'index.html');
    let indexContent = await fs.readFile(indexPath, 'utf8');

    const KAKAO_KEY = process.env.KAKAO_MAP_API_KEY;
    if (!KAKAO_KEY) {
      console.warn('⚠️ KAKAO_MAP_API_KEY 환경 변수가 없습니다. 플레이스홀더를 유지합니다.');
    } else {
      // 기존 하드코딩된 키와 플레이스홀더 모두 대응
      indexContent = indexContent.replace(/appkey=[a-zA-Z0-9]+/, `appkey=${KAKAO_KEY}`);
      indexContent = indexContent.replace('__KAKAO_MAP_API_KEY__', KAKAO_KEY);
      await fs.writeFile(indexPath, indexContent);
      console.log('✅ Kakao Map API Key injected into index.html');
    }

    console.log('🚀 Build completed successfully!');
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

build();
