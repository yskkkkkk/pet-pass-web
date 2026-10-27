/**
 * 펫패스 매장 목록 — 느린 응답 도중 조건을 바꿔도 마지막 조건의 결과만 보인다 (이슈 #128)
 * 매장 API는 가짜 응답으로 바꿔 끼우고, 응답 시점을 테스트가 정한다. 지도(카카오) 스크립트는 막는다.
 */
const { test, expect } = require('@playwright/test');

const store = (name) => ({ id: name, name, type: '카페', address: '어딘가', lat: 37.39, lng: 127.11 });

/**
 * 매장 API 요청을 붙잡아 둔다. requests[i].reply(...)로 원하는 때에 응답한다.
 * 취소된 요청에 응답하면 Playwright가 오류를 내므로 무시한다.
 */
async function holdStores(page) {
  const requests = [];
  await page.route(/dapi\.kakao\.com|unpkg\.com/, (route) => route.abort());
  await page.route('**/api/stores?*', (route) => {
    const url = new URL(route.request().url());
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    requests.push({ params: url.searchParams, reply });
  });
  return requests;
}

const page1 = (names, extra = {}) => ({ items: names.map(store), total: names.length, hasMore: false, ...extra });

async function openStores(page) {
  const requests = await holdStores(page);
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await expect.poll(() => requests.length).toBe(1);
  return requests;
}

async function listText(page) {
  return page.locator('#store-list').innerText();
}

test('첫 목록이 늦게 오는 동안 검색어를 바꾸면 검색 결과만 남는다', async ({ page }) => {
  const requests = await openStores(page);
  await page.fill('#search-input', '초코');
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].params.get('search')).toBe('초코');

  await requests[1].reply(page1(['초코카페']));
  await expect(page.locator('#store-list')).toContainText('초코카페');
  // 늦게 도착한 전국 목록은 화면을 덮지 않는다
  await requests[0].reply(page1(['전국매장1', '전국매장2']));
  await page.waitForTimeout(300);
  expect(await listText(page)).not.toContain('전국매장');
  await expect(page.locator('#store-count')).toHaveText('1');
  expect(page.errors).toEqual([]);
});

test('응답 전에 조건을 여러 번 바꾸면 마지막 조건이 보인다 (지난 응답이 나중에 와도)', async ({ page }) => {
  const requests = await openStores(page);
  await page.click('.filters span.icon-tag:text-is("카페")');
  await page.click('.filters span.icon-tag:text-is("제과점")');
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2].params.get('category')).toBeTruthy();

  await requests[2].reply(page1(['빵집']));
  await requests[1].reply(page1(['카페만']));
  await requests[0].reply(page1(['전국']));
  await expect(page.locator('#store-list')).toContainText('빵집');
  await page.waitForTimeout(300);
  const text = await listText(page);
  expect(text).not.toContain('카페만');
  expect(text).not.toContain('전국');
});

test('요청이 실패하면 같은 조건으로 다시 누를 때 다시 불러온다', async ({ page }) => {
  const requests = await openStores(page);
  await requests[0].reply(page1(['전국매장']));
  await expect(page.locator('#store-list')).toContainText('전국매장');

  await page.click('.filters span.icon-tag:text-is("카페")');
  await expect.poll(() => requests.length).toBe(2);
  await requests[1].reply({ error: '잠시 오류' }, 500);
  await expect(page.locator('#store-list')).toContainText('불러올 수 없습니다');

  // 같은 카페를 다시 누르면 다시 요청한다 (예전에는 같은 조건이라 무시됐다)
  await page.click('.filters span.icon-tag:text-is("카페")');
  await expect.poll(() => requests.length).toBe(3);
  await requests[2].reply(page1(['카페매장']));
  await expect(page.locator('#store-list')).toContainText('카페매장');

  // 성공한 같은 조건은 다시 요청하지 않는다
  await page.click('.filters span.icon-tag:text-is("카페")');
  await page.waitForTimeout(300);
  expect(requests.length).toBe(3);
});

test('더 보기 도중 조건을 바꾸면 다른 조건의 페이지가 섞이지 않는다', async ({ page }) => {
  const requests = await openStores(page);
  await requests[0].reply(page1(['전국1', '전국2'], { total: 4, hasMore: true }));
  await page.click('#btn-load-more');
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].params.get('offset')).toBe('2');

  await page.click('.filters span.icon-tag:text-is("카페")');
  await expect.poll(() => requests.length).toBe(3);
  await requests[2].reply(page1(['카페1']));
  await requests[1].reply(page1(['전국3', '전국4']));
  await expect(page.locator('#store-list')).toContainText('카페1');
  await page.waitForTimeout(300);
  expect(await listText(page)).not.toMatch(/전국/);
  await expect(page.locator('#store-count')).toHaveText('1');
});

test('목록을 불러오는 중에는 더 보기를 겹쳐 보내지 않는다', async ({ page }) => {
  const requests = await openStores(page);
  await requests[0].reply(page1(['전국1', '전국2'], { total: 4, hasMore: true }));
  await page.click('#btn-load-more');
  await page.click('#btn-load-more');
  await page.waitForTimeout(300);
  expect(requests.length).toBe(2);
  await requests[1].reply(page1(['전국3', '전국4']));
  await expect(page.locator('#store-list')).toContainText('전국4');
  await expect(page.locator('#store-list .store-card')).toHaveCount(4);
});
