const { test, expect } = require('@playwright/test');

test.describe('Map Logic and UX Refinement', () => {
  test.beforeEach(async ({ page }) => {
    // 서버가 실행 중이라고 가정하고 접속 (기본 3000 포트)
    await page.goto('http://localhost:3000');
    // Kakao Map 로드 대기 (충분한 시간 부여)
    await page.waitForTimeout(2000);
  });

  test('수동 드래그 시 이 지역 탐색 버튼이 노출되어야 함', async ({ page }) => {
    const btnSearchHere = page.locator('#btn-search-here');
    await expect(btnSearchHere).not.toBeVisible();

    // 지도 영역 드래그 시뮬레이션
    await page.mouse.move(500, 500);
    await page.mouse.down();
    await page.mouse.move(600, 600);
    await page.mouse.up();

    // 드래그 후 버튼 노출 확인
    await expect(btnSearchHere).toBeVisible();
  });

  test('초기화 클릭 시 이 지역 탐색 버튼이 미노출되어야 함', async ({ page }) => {
    const btnSearchHere = page.locator('#btn-search-here');
    const btnResetFilters = page.locator('#btn-reset-filters');

    // 먼저 버튼을 노출시킴
    await page.mouse.move(500, 500);
    await page.mouse.down();
    await page.mouse.move(600, 600);
    await page.mouse.up();
    await expect(btnSearchHere).toBeVisible();

    // 초기화 버튼 클릭
    await btnResetFilters.click();

    // 즉시 숨겨져야 함
    await expect(btnSearchHere).not.toBeVisible();

    // 시스템 이동(전국으로 리셋) 중에도 노출되지 않아야 함 (충분히 대기)
    await page.waitForTimeout(1000);
    await expect(btnSearchHere).not.toBeVisible();
  });

  test('검색 결과 0개 시 상황별 피드백 확인 - 조건 A (지역 필터 ON + 검색어)', async ({ page }) => {
    const regionDepth1 = page.locator('#region-depth1');
    const searchInput = page.locator('#search-input');
    const storeList = page.locator('#store-list');

    // 지역 선택 (서울특별시)
    await regionDepth1.selectOption('서울특별시');
    // 존재하지 않을 법한 검색어 입력
    await searchInput.fill('존재하지않는매장명123');
    await page.waitForTimeout(500); // 디바운스 대기

    const expectedText = '선택하신 지역 내에 해당 검색어와 일치하는 매장이 없습니다.';
    await expect(storeList).toContainText(expectedText);
  });

  test('검색 결과 0개 시 상황별 피드백 확인 - 조건 B (일반 상황)', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    const storeList = page.locator('#store-list');

    // 지역은 '전국'인 상태에서 존재하지 않는 검색어 입력
    await searchInput.fill('존재하지않는매장명XYZ');
    await page.waitForTimeout(500);

    const expectedText = '해당 조건의 공식 인증 매장이 없습니다.';
    await expect(storeList).toContainText(expectedText);
  });
});
