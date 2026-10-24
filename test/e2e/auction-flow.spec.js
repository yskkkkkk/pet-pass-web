/**
 * 블라인드 경매 — 진행 화면(PC)과 휴대폰을 함께 띄워 끝까지 진행한다.
 * 물건 순서는 무작위라서, 판정은 서버 상태를 읽어 화면이 그와 맞는지 확인한다.
 */
const { test, expect } = require('@playwright/test');
const Show = require('../../public/game/auction/show.js');
const { newHost, createAuctionRoom, joinMany, waitForLobbyCount, expectNoErrors } = require('./helpers');

/** 진행자 토큰으로 서버 상태 읽기 */
function hostApi(host, code) {
  return host.evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:host:' + c);
    return (await fetch('/api/game?action=state&code=' + c + '&hostToken=' + t)).json();
  }, code);
}

function playerApi(phone, code) {
  return phone.evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:player:' + c);
    return (await fetch('/api/game?action=state&code=' + c + '&playerToken=' + t)).json();
  }, code);
}

async function setRounds(host, n) {
  const out = host.locator('.setting[data-key=rounds] output');
  while (Number(await out.textContent()) > n) {
    const before = await out.textContent();
    await host.click('.setting[data-key=rounds] [data-step="-1"]');
    await expect(out).not.toHaveText(before);
  }
}

/** 휴대폰 버튼으로 금액을 맞추고 봉투를 낸다 */
async function bid(phone, amount) {
  if ((await phone.locator('#draft-bid').textContent()) !== '0') await phone.click('[data-set="0"]');
  for (let i = 0; i < Math.floor(amount / 10); i++) await phone.click('[data-step="10"]');
  for (let i = 0; i < amount % 10; i++) await phone.click('[data-step="1"]');
  await expect(phone.locator('#draft-bid')).toHaveText(String(amount));
  await phone.click('#btn-bid');
  await expect(phone.locator('#btn-bid')).toHaveText('넣음 ✓ · ' + amount + '칩');
}

/** 마감 → 카운트다운 → 공개 연출이 끝나 다음 버튼이 눌릴 때까지 */
async function revealAndWait(host) {
  await host.click('[data-act="reveal"]');
  await expect(host.locator('.bidboard')).toBeVisible();
  await expect(host.locator('[data-slot="actions"]')).toBeVisible({ timeout: 30_000 });
}

const STAMP = { win: ['낙찰', '헐값 낙찰'], tie: ['공중분해'], nobid: ['유찰'], cursed: ['저주'] };

/** 진행 화면의 공개 결과가 서버 판정과 맞는지, 휴대폰마다 내 결과 도장이 맞는지 */
async function checkRound(host, phones, code, bids) {
  const s = await hostApi(host, code);
  const r = s.result;
  expect(r.bids.map((b) => b.bid)).toEqual(bids);
  const amounts = await host.locator('.bid-row .bid-amount').allTextContents();
  expect(amounts.map((t) => parseInt(t, 10)).sort((a, b) => a - b)).toEqual(bids.slice().sort((a, b) => a - b));
  const stamp = await host.locator('.auction .stamp').first().textContent();
  expect(STAMP[r.outcome]).toContain(stamp);
  await expect(host.locator('.headline')).toHaveText(/\[(호외|속보)\]/);
  // 휴대폰: 진행 화면 연출이 끝날 때 내 결과 도장 (마지막 물건이면 최종 순위 도장)
  for (const phone of phones) {
    const me = (await playerApi(phone, code)).me;
    const expected = s.room.status === 'finished' ? (me.rank === 1 ? '우승' : me.rank + '위') : Show.myVerdict(r, me.id).text;
    await expect(phone.locator('.verdict-stamp .stamp')).toHaveText(expected, { timeout: 15_000 });
  }
  return s;
}

test('2명: 5라운드 끝까지 → 최종 순위·시상식 → 같은 멤버로 한 판 더', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createAuctionRoom(host);
  await setRounds(host, 5);
  const phones = await joinMany(browser, code, ['가', '나'], 'auction');
  await waitForLobbyCount(host, 2);
  await expect(phones[0].locator('.lobby-chips')).toContainText('100');

  await host.click('#btn-start');
  const plan = [[7, 3], [0, 0], [12, 12], [1, 30], [20, 5]];
  for (let r = 0; r < plan.length; r++) {
    await expect(host.locator('.table-top')).toBeVisible();
    await expect(phones[0].locator('.p-lot-name')).toHaveText(await host.locator('.lot-name').textContent());
    for (let i = 0; i < phones.length; i++) await bid(phones[i], plan[r][i]);
    await expect(host.locator('[data-slot="progress"]')).toContainText('2 / 2');
    await expect(host.locator('.slot.filled')).toHaveCount(2);
    await revealAndWait(host);
    await checkRound(host, phones, code, plan[r]);
    if (r < plan.length - 1) await host.click('[data-act="next"]');
  }

  await expect(host.locator('[data-act="final"]')).toBeVisible();
  await host.click('[data-act="final"]');
  const s = await hostApi(host, code);
  expect(s.room.status).toBe('finished');
  await expect(host.locator('.final-ranking .sb-name')).toHaveText(s.ranking.map((x) => new RegExp('^' + x.nickname)));
  await expect(host.locator('.sb-first .stamp').first()).toHaveText('우승');
  await expect(host.locator('.award:not(.award-hidden)')).toHaveCount(s.awards.length, { timeout: 20_000 });
  for (const phone of phones) {
    const me = (await playerApi(phone, code)).me;
    await expect(phone.locator('.verdict-stamp .stamp')).toHaveText(me.rank === 1 ? '우승' : me.rank + '위');
  }

  await host.click('[data-act="restart"]');
  await waitForLobbyCount(host, 2);
  await expect(phones[1].locator('text=참가했습니다')).toBeVisible();
  expectNoErrors(host, ...phones);
});

test('6명: 시작 칩 50개 설정으로 5라운드, 순위가 서버와 같고 칩을 다 쓰면 텅 빈 지갑', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createAuctionRoom(host);
  await setRounds(host, 5);
  await host.selectOption('.setting[data-key=chips] select', '50');
  await expect.poll(async () => (await hostApi(host, code)).settings.chips).toBe(50);
  const phones = await joinMany(browser, code, ['가', '나', '다', '라', '마', '바'], 'auction');
  await waitForLobbyCount(host, 6);

  await host.click('#btn-start');
  const plan = [
    [5, 9, 9, 0, 2, 50],   // 바 올인
    [1, 2, 3, 4, 5, 0],
    [10, 0, 10, 0, 3, 0],
    [0, 0, 0, 0, 0, 0],
    [30, 30, 20, 40, 40, 0]
  ];
  for (let r = 0; r < plan.length; r++) {
    await expect(host.locator('.table-top')).toBeVisible();
    for (let i = 0; i < phones.length; i++) {
      const chips = (await playerApi(phones[i], code)).me.chips;
      const amount = Math.min(plan[r][i], chips);
      plan[r][i] = amount;
      if (chips > 0) await bid(phones[i], amount);
      else await expect(phones[i].locator('.composer.empty')).toBeVisible();
    }
    await revealAndWait(host);
    await checkRound(host, phones, code, plan[r]);
    if (r === 0) await expect(host.locator('.sb-row[data-id] .wallet-empty')).toHaveCount(1);
    if (r < plan.length - 1) await host.click('[data-act="next"]');
  }
  await host.click('[data-act="final"]');
  const s = await hostApi(host, code);
  await expect(host.locator('.final-ranking .sb-rank')).toHaveText(s.ranking.map((x) => String(x.rank)));
  await expect(host.locator('.final-ranking .sb-name')).toHaveText(s.ranking.map((x) => new RegExp('^' + x.nickname)));
  expectNoErrors(host, ...phones);
});

test('입찰 중 비밀: 진행 화면에는 봉투만, 금액은 어디에도 없다', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createAuctionRoom(host);
  const phones = await joinMany(browser, code, ['가', '나'], 'auction');
  await waitForLobbyCount(host, 2);
  await host.click('#btn-start');
  await bid(phones[0], 37);
  await bid(phones[1], 41);
  await expect(host.locator('.slot.filled')).toHaveCount(2);
  const text = await host.locator('.auction').innerText();
  expect(text).not.toMatch(/\b(37|41)\b/);
  expect(await phones[1].locator('.screen').innerText()).not.toMatch(/\b37\b/);
  await expect(host.locator('.sb-chips').first()).toHaveText('100칩');
});

test('새로고침: 공개 뒤 진행 화면은 연출 없이 결과 그대로, 늦게 연 휴대폰은 바로 결과', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createAuctionRoom(host);
  const phones = await joinMany(browser, code, ['가', '나'], 'auction');
  await waitForLobbyCount(host, 2);
  await host.click('#btn-start');
  await bid(phones[0], 6);
  await bid(phones[1], 2);
  await revealAndWait(host);
  await checkRound(host, phones, code, [6, 2]);

  await host.reload({ waitUntil: 'commit' });
  await expect(host.locator('.bid-row.shown')).toHaveCount(2);
  await expect(host.locator('.bid-row.pending')).toHaveCount(0);
  await expect(host.locator('.stamp.still').first()).toBeVisible();
  await expect(host.locator('[data-act="next"]')).toBeVisible();

  await phones[1].reload({ waitUntil: 'commit' });
  await expect(phones[1].locator('.verdict-stamp .stamp.still')).toBeVisible();
  await expect(phones[1].locator('text=두근두근')).toHaveCount(0);
});
