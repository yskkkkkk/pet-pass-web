const { test, expect } = require('@playwright/test');

test('매장 등록 제안 버튼과 모달이 없는지 확인', async ({ page }) => {
  // 로컬 개발 서버를 실행 중이라고 가정하거나, 정적 파일을 직접 엽니다.
  // 여기서는 server.js를 통해 렌더링된 결과를 확인하기 위해 baseUrl을 사용하거나
  // 간단히 file:// 경로를 사용할 수 있지만, API 키 주입 등을 고려해 server.js 실행 결과를 보는 것이 정확합니다.
  await page.goto('http://localhost:3000');

  // 1. 매장 등록 제안 버튼이 존재하지 않아야 함
  const registerBtn = page.locator('#btn-register');
  await expect(registerBtn).not.toBeVisible();

  // 2. 매장 등록 신청 모달이 존재하지 않아야 함
  const registerModal = page.locator('#register-modal');
  await expect(registerModal).not.toBeAttached();

  // 3. 디지털 펫 패스 버튼은 여전히 존재해야 함 (회귀 테스트)
  const authBtn = page.locator('#btn-auth');
  await expect(authBtn).toBeVisible();
});
