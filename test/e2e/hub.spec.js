/**
 * 허브(/game)와 주소 — 목록, 참가 코드, 참가 입구, 예전 주소 호환
 */
const { test, expect } = require('@playwright/test');
const { newHost, newPhone, createMinorityRoom, joinAs, expectNoErrors } = require('./helpers');

test('허브: 같이 하는 게임 목록에 소수결, 게임이 없는 칸은 숨김', async ({ browser }) => {
  const pc = await newHost(browser);
  await pc.goto('/game', { waitUntil: 'commit' });
  await expect(pc.locator('[data-type=party] .game-name')).toHaveText(['소수결 게임']);
  await expect(pc.locator('[data-type=party] .game-meta')).toHaveText('3명 이상');
  await expect(pc.locator('[data-type=solo]')).toBeHidden();
  await pc.click('.game-item');
  await expect(pc).toHaveURL(/\/game\/minority\/?$/);
  await expect(pc.locator('#btn-create')).toBeVisible();
  expectNoErrors(pc);
});

test('허브: 없는 방 코드는 허브로 돌아와 안내, 코드는 남겨 둠', async ({ browser }) => {
  const phone = await newPhone(browser);
  await phone.goto('/game', { waitUntil: 'commit' });
  await phone.waitForSelector('.game-item'); // 허브 스크립트가 실행된 뒤
  await phone.fill('#join-code', '12a3'); // 숫자만 남는다
  await expect(phone.locator('#join-code')).toHaveValue('123');
  await phone.fill('#join-code', '9999');
  await phone.click('#join-form button');
  await expect(phone).toHaveURL(/error=notfound/);
  await expect(phone.locator('.toast.show')).toHaveText('방을 찾을 수 없어요. 코드를 확인해 주세요.');
  await expect(phone.locator('#join-code')).toHaveValue('9999');
  expectNoErrors(phone);
});

test('허브: 주소에 담긴 오류 문구는 그대로 보여주지 않는다', async ({ browser }) => {
  const phone = await newPhone(browser);
  await phone.goto('/game?error=' + encodeURIComponent('가짜 공지입니다'), { waitUntil: 'commit' });
  await phone.waitForSelector('#join-code');
  await expect(phone.locator('.toast.show')).toHaveCount(0);
});

test('참가 입구: 코드가 없거나 잘못되면 허브로', async ({ browser }) => {
  const phone = await newPhone(browser);
  await phone.goto('/game/play', { waitUntil: 'commit' });
  await expect(phone).toHaveURL(/\/game\/?$/);
  await phone.goto('/game/play?room=12', { waitUntil: 'commit' });
  await expect(phone).toHaveURL(/\/game\/?$/);
});

test('예전 진행 주소(/game/host#토큰)와 참가 입구, 참가자 새로고침', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  await expect(host.locator('.crumbs')).toHaveText(/미니게임\s*\/\s*소수결 게임/);
  expect(new URL(host.url()).hash, '토큰은 주소창에서 지운다').toBe('');

  const token = await host.evaluate((c) => localStorage.getItem('minority-game:host:' + c), code);
  const other = await newHost(browser);
  await other.goto('/game/host?room=' + code + '#' + token, { waitUntil: 'commit' });
  await expect(other).toHaveURL(new RegExp('/game/minority/host\\?room=' + code + '$'));
  await expect(other.locator('#btn-start')).toBeVisible();

  const stranger = await newHost(browser);
  await stranger.goto('/game/minority/host?room=' + code, { waitUntil: 'commit' });
  await expect(stranger.locator('.notice-screen h2')).toHaveText('진행자 권한이 없어요');

  const phone = await joinAs(browser, code, '첫참가');
  await expect(host.locator('.name-list li span')).toHaveText(['첫참가']);
  await phone.reload({ waitUntil: 'commit' });
  await expect(phone.locator('text=참가했습니다')).toBeVisible();
  await expect(phone.locator('#p-me')).toHaveText('첫참가 · 생존');
  expectNoErrors(host, other, phone);
});

test('QR 코드는 참가 입구 주소를 담는다', async ({ browser }) => {
  const host = await newHost(browser);
  await createMinorityRoom(host);
  await expect(host.locator('#qr svg')).toBeVisible();
  await expect(host.locator('.join-steps')).toContainText('/game');
});
