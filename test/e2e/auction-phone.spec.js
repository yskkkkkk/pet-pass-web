/**
 * 블라인드 경매 — 휴대폰만으로 진행 (PC 없음)
 * 방장 휴대폰이 진행하면서 같이 놀고, 모든 휴대폰이 경매장 화면과 공개 연출을 같은 순간에 보여준다.
 */
const { test, expect } = require('@playwright/test');
const Show = require('../../public/game/auction/show.js');
const { createPhoneAuction, joinMany, expectNoErrors } = require('./helpers');

function playerApi(phone, code) {
  return phone.evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:player:' + c);
    return (await fetch('/api/game?action=state&code=' + c + '&playerToken=' + t)).json();
  }, code);
}

async function bid(phone, amount) {
  await expect(phone.locator('#draft-bid')).toBeVisible();
  if ((await phone.locator('#draft-bid').textContent()) !== '0') await phone.click('[data-set="0"]');
  for (let i = 0; i < Math.floor(amount / 10); i++) await phone.click('[data-step="10"]');
  for (let i = 0; i < amount % 10; i++) await phone.click('[data-step="1"]');
  await phone.click('#btn-bid');
  await expect(phone.locator('#btn-bid')).toHaveText('넣음 ✓ · ' + amount + '칩');
}

/** 각 휴대폰에 내 결과 도장이 찍힌 시각 */
async function stampTimes(phones) {
  return Promise.all(phones.map(async (p) => {
    await expect(p.locator('.my-result .stamp')).toBeVisible({ timeout: 20_000 });
    return p.evaluate(() => Date.now());
  }));
}

test('휴대폰만: 방장이 진행하며 참가, 모든 휴대폰에 같은 순간 공개, 끝까지 → 한 판 더', async ({ browser }) => {
  const { boss, code } = await createPhoneAuction(browser, '방장');
  const guests = await joinMany(browser, code, ['가', '나'], 'auction');
  const all = [boss, ...guests];
  await expect(boss.locator('#lobby-count')).toHaveText('3명');
  await expect(guests[0].locator('[data-act]')).toHaveCount(0);

  // 방장 휴대폰에서 설정: 5라운드
  const out = boss.locator('.setting[data-key=rounds] output');
  while (Number(await out.textContent()) > 5) {
    const before = await out.textContent();
    await boss.click('.setting[data-key=rounds] [data-step="-1"]');
    await expect(out).not.toHaveText(before);
  }
  await boss.click('#btn-start');

  const plan = [[9, 4, 0], [3, 3, 1], [0, 0, 0], [10, 20, 30], [5, 6, 7]];
  for (let r = 0; r < plan.length; r++) {
    for (let i = 0; i < all.length; i++) await bid(all[i], plan[r][i]);
    await expect(guests[0].locator('[data-act="reveal"]')).toHaveCount(0);
    await expect(guests[1].locator('[data-slot="progress"]')).toContainText('3 / 3');
    await boss.click('[data-act="reveal"]');

    // 모든 휴대폰: 3·2·1 → 연출 → 내 결과 도장 (서버 공개 시각 기준이라 거의 같은 순간)
    await expect(guests[1].locator('.countdown')).toBeVisible();
    const times = await stampTimes(all);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(2500);

    const s = await playerApi(boss, code);
    expect(s.result.bids.map((b) => b.bid)).toEqual(plan[r]);
    for (const phone of all) {
      const me = (await playerApi(phone, code)).me;
      await expect(phone.locator('.my-result .stamp')).toHaveText(Show.myVerdict(s.result, me.id).text);
    }
    if (r < plan.length - 1) {
      await expect(guests[0].locator('[data-act="next"]')).toHaveCount(0);
      await expect(boss.locator('[data-act="next"]')).toBeVisible({ timeout: 20_000 });
      await boss.click('[data-act="next"]');
      await expect(guests[0].locator('#draft-bid')).toBeVisible();
    }
  }

  // 마지막 물건: 모두 "최종 결과"를 눌러 최종 순위와 시상식
  for (const phone of all) {
    await expect(phone.locator('[data-act="final"]')).toBeVisible({ timeout: 20_000 });
    await phone.click('[data-act="final"]');
    await expect(phone.locator('.final-ranking .sb-row')).toHaveCount(3);
    const me = (await playerApi(phone, code)).me;
    await expect(phone.locator('.my-result .stamp')).toHaveText(me.rank === 1 ? '우승' : me.rank + '위');
  }
  await expect(guests[0].locator('[data-act="restart"]')).toHaveCount(0);
  await boss.click('[data-act="restart"]');
  await expect(boss.locator('#lobby-count')).toHaveText('3명');
  await expect(guests[1].locator('.lobby-chips')).toBeVisible();
  expectNoErrors(...all);
});

test('휴대폰만: 연출 도중에 화면을 연 휴대폰은 카운트다운 없이 지난 장면부터 이어서', async ({ browser }) => {
  const { boss, code } = await createPhoneAuction(browser, '방장');
  const [guest] = await joinMany(browser, code, ['가'], 'auction');
  await expect(boss.locator('#lobby-count')).toHaveText('2명');
  await boss.click('#btn-start');
  await bid(boss, 12);
  await bid(guest, 7);
  await boss.click('[data-act="reveal"]');
  await expect(boss.locator('.bidboard')).toBeVisible({ timeout: 10_000 });
  await guest.reload({ waitUntil: 'commit' });
  await expect(guest.locator('.bidboard')).toBeVisible();
  await expect(guest.locator('.countdown')).toHaveCount(0);
  const r = (await playerApi(guest, code)).result;
  const meGuest = (await playerApi(guest, code)).me;
  await expect(guest.locator('.my-result .stamp')).toHaveText(Show.myVerdict(r, meGuest.id).text, { timeout: 15_000 });
  await expect(guest.locator('.bid-row.shown')).toHaveCount(2);
});
