const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 375, height: 812 },
});

test('Mobile Store Detail Card UI Verification', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for the store list to have items
  await page.waitForSelector('#store-list .store-card', { timeout: 10000 });

  // Get the first store data from the page and call showDetail
  await page.evaluate(() => {
    const firstStore = stores[0];
    showDetail(firstStore);
  });

  // Wait for compliance list to be populated
  const list = page.locator('#compliance-list');
  await expect(list).not.toBeEmpty({ timeout: 5000 });

  // Take a screenshot
  await page.screenshot({ path: 'test-results/mobile_detail_card_final.png' });

  // Verify labels are removed
  const detailContent = await list.innerText();
  expect(detailContent).not.toContain('공식 주소');
  expect(detailContent).not.toContain('업종');
  expect(detailContent).not.toContain('인증 상태');

  // Verify new layout elements
  expect(detailContent).toContain('📍');
  expect(detailContent).toContain('공식 인증');

  console.log('Mobile Detail Card UI verified successfully.');
});
