/**
 * 블라인드 경매 — 실서버처럼 응답이 들쭉날쭉할 때
 * 소수결에서 실서버로 확인된 문제(늦게 도착한 예전 값, 공개 직전 제출, 느린 마감)가 경매에서도 생기지 않는지
 */
const { test, expect } = require('@playwright/test');
const {
  newHost, createAuctionRoom, joinMany, waitForLobbyCount, delayRequests, delayResponses, countCountdowns, expectNoErrors
} = require('./helpers');

function hostApi(host, code) {
  return host.evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:host:' + c);
    return (await fetch('/api/game?action=state&code=' + c + '&hostToken=' + t)).json();
  }, code);
}

async function setDraft(phone, amount) {
  if ((await phone.locator('#draft-bid').textContent()) !== '0') await phone.click('[data-set="0"]');
  for (let i = 0; i < amount; i++) await phone.click('[data-step="1"]');
  await expect(phone.locator('#draft-bid')).toHaveText(String(amount));
}

async function started(browser) {
  const host = await newHost(browser);
  const code = await createAuctionRoom(host);
  const phones = await joinMany(browser, code, ['가', '나'], 'auction');
  await waitForLobbyCount(host, 2);
  await host.click('#btn-start');
  await expect(phones[0].locator('#btn-bid')).toBeVisible();
  return { host, code, phones };
}

const isBid = (amount) => (req) => req.method() === 'POST' && (req.postData() || '').includes('"bid":' + amount + ',');

test('봉투를 빠르게 바꿔도 첫 요청이 늦게 도착하면: 마지막 금액으로 저장, 진행 화면엔 바꿔치기', async ({ browser }) => {
  const { host, code, phones } = await started(browser);
  await delayRequests(phones[0], '**/api/game', (req) => (isBid(5)(req) ? 1500 : 0));

  await setDraft(phones[0], 5);
  await phones[0].click('#btn-bid');
  await setDraft(phones[0], 8);
  await phones[0].click('#btn-bid');
  await expect(phones[0].locator('#btn-bid')).toHaveText('봉투 넣음 · 8칩', { timeout: 10_000 });
  await expect.poll(async () => (await phones[0].evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:player:' + c);
    return (await fetch('/api/game?action=state&code=' + c + '&playerToken=' + t)).json();
  }, code)).me.bid).toBe(8);
  await expect(host.locator('.seat-caption.pop')).toHaveText(/바꿔치기/);

  const s = await hostApi(host, code);
  expect(s.players[0].changes).toBe(1);
  await host.click('#btn-reveal');
  await expect(host.locator('#btn-next')).toBeEnabled({ timeout: 30_000 });
  expect((await hostApi(host, code)).result.bids[0].bid).toBe(8);
  expectNoErrors(host, ...phones);
});

test('마감 직전에 낸 봉투(저장 0.7초)도 반영된다', async ({ browser }) => {
  const { host, code, phones } = await started(browser);
  await delayRequests(phones[1], '**/api/game', (req) => (isBid(6)(req) ? 700 : 0));
  await setDraft(phones[1], 6);
  await phones[1].click('#btn-bid');
  await host.click('#btn-reveal'); // 1명이 안 냈다는 확인 창은 자동 수락
  await expect(host.locator('#btn-next')).toBeEnabled({ timeout: 30_000 });
  const r = (await hostApi(host, code)).result;
  expect(r.bids.map((b) => [b.bid, b.submitted])).toEqual([[0, false], [6, true]]);
  expect(r.outcome).toMatch(/win|cursed/);
});

test('마감 요청이 3초 걸려도: 카운트다운 → 집계 중… → 공개 연출, 카운트다운은 한 번, 휴대폰은 연출이 끝날 때 결과', async ({ browser }) => {
  const { host, code, phones } = await started(browser);
  await setDraft(phones[0], 4);
  await phones[0].click('#btn-bid');
  await setDraft(phones[1], 9);
  await phones[1].click('#btn-bid');
  await expect(host.locator('.slot.filled')).toHaveCount(2);

  const counter = await countCountdowns(host);
  await delayResponses(host, '**/api/game', (req) => (req.method() === 'POST' && (req.postData() || '').includes('"reveal"') ? 3000 : 0));
  await host.click('#btn-reveal');
  await expect(host.locator('.countdown-wait')).toHaveText('집계 중…');
  await expect(host.locator('.bidboard')).toBeVisible({ timeout: 10_000 });
  await expect(phones[0].locator('text=두근두근')).toBeVisible();
  await expect(host.locator('#btn-next')).toBeEnabled({ timeout: 30_000 });
  await expect(phones[0].locator('.verdict-stamp .stamp')).toBeVisible();
  expect(await counter.value()).toBe(1);
  expect((await hostApi(host, code)).result.bids.map((b) => b.bid)).toEqual([4, 9]);
  expectNoErrors(host, ...phones);
});
