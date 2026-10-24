/**
 * 화면 테스트 공통 도우미 — 진행자(PC)·참가자(휴대폰) 화면을 띄우고 방을 만든다.
 */
const { devices, expect } = require('@playwright/test');

let ipSeq = 0;

/** 테스트마다 다른 IP처럼 보이게 한다 (방 만들기 요청 제한이 테스트끼리 섞이지 않게) */
function fakeIp() {
  ipSeq += 1;
  return `10.9.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

async function newHost(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    extraHTTPHeaders: { 'x-forwarded-for': fakeIp() },
    ...opts
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  return page;
}

async function newPhone(browser) {
  const context = await browser.newContext({ ...devices['iPhone 13'], extraHTTPHeaders: { 'x-forwarded-for': fakeIp() } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  return page;
}

/** 소수결 방 만들기 → 진행 화면 (code를 돌려줌) */
async function createMinorityRoom(host) {
  await host.goto('/game/minority', { waitUntil: 'commit' });
  await host.click('#btn-create');
  await host.waitForURL(/\/game\/minority\/host\?room=\d{4}$/, { waitUntil: 'commit' });
  await host.waitForSelector('#btn-start');
  return new URL(host.url()).searchParams.get('room');
}

/** 블라인드 경매 방 만들기 → 진행 화면 (code를 돌려줌) */
async function createAuctionRoom(host) {
  await host.goto('/game/auction', { waitUntil: 'commit' });
  await host.click('#btn-create');
  await host.waitForURL(/\/game\/auction\/host\?room=\d{4}$/, { waitUntil: 'commit' });
  await host.waitForSelector('#btn-start');
  return new URL(host.url()).searchParams.get('room');
}

/** 참가 입구(QR 주소)로 들어와 닉네임으로 참가 (입구가 방의 게임 화면으로 보낸다) */
async function joinAs(browser, code, nickname, game = 'minority') {
  const phone = await newPhone(browser);
  await phone.goto('/game/play?room=' + code, { waitUntil: 'commit' });
  await phone.waitForURL(new RegExp('/game/' + game + '/play\\?room='), { waitUntil: 'commit' });
  await phone.fill('#f-nick', nickname);
  await phone.click('#btn-join');
  await expect(phone.locator('text=참가했습니다')).toBeVisible();
  return phone;
}

async function joinMany(browser, code, names, game) {
  const phones = [];
  for (const n of names) phones.push(await joinAs(browser, code, n, game));
  return phones;
}

/** 진행 화면 대기실에 참가자가 모두 보일 때까지 */
async function waitForLobbyCount(host, n) {
  await expect(host.locator('#lobby-count')).toHaveText(n + '명');
}

/** 서버 응답은 바로 받아 두고, 전달만 늦춘다 (실서버의 느린 응답 흉내) */
async function delayResponses(page, pattern, delayFor) {
  await page.route(pattern, async (route) => {
    const ms = delayFor(route.request());
    if (!ms) return route.continue();
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, ms));
    return route.fulfill({ response });
  });
}

/** 요청 자체를 늦춘다 (서버에 늦게 도착) */
async function delayRequests(page, pattern, delayFor) {
  await page.route(pattern, async (route) => {
    const ms = delayFor(route.request());
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return route.continue();
  });
}

/** 카운트다운 오버레이가 몇 번 나타났는지 센다 */
async function countCountdowns(host) {
  await host.evaluate(() => {
    window.__countdowns = 0;
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((el) => {
      if (el.classList && el.classList.contains('countdown')) window.__countdowns++;
    }))).observe(document.body, { childList: true });
  });
  return {
    reset: () => host.evaluate(() => { window.__countdowns = 0; }),
    value: () => host.evaluate(() => window.__countdowns)
  };
}

async function vote(phone, choice) {
  await phone.click(`[data-choice=${choice}]`);
  await expect(phone.locator(`.vote-btn.selected[data-choice=${choice}]`)).toBeVisible();
}

function expectNoErrors(...pages) {
  for (const p of pages) expect(p.errors, '페이지 오류').toEqual([]);
}

module.exports = {
  newHost, newPhone, createMinorityRoom, createAuctionRoom, joinAs, joinMany, waitForLobbyCount,
  delayResponses, delayRequests, countCountdowns, vote, expectNoErrors
};
