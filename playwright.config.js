/**
 * 화면 테스트(Playwright): npm run test:e2e
 * 테스트용 서버를 3100번 포트에 메모리 저장소로 띄운다 (개발 서버 3000번과 겹치지 않게).
 * 브라우저 경로를 바꿔야 하는 환경에서는 PLAYWRIGHT_CHROMIUM_PATH를 지정한다.
 */
const { defineConfig } = require('@playwright/test');

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {}
  },
  webServer: {
    command: 'node server.js',
    url: `${BASE}/game/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      GAME_STORE: 'memory',
      CORS_ALLOWED_ORIGINS: BASE,
      // 펫패스 쪽 코드가 시작할 때 읽는 값 (게임 테스트에는 쓰이지 않음)
      SUPABASE_URL: 'http://127.0.0.1:9',
      SUPABASE_ANON_KEY: 'test'
    }
  }
});
