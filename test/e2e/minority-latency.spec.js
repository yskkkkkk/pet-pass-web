/**
 * 실서버처럼 응답이 들쭉날쭉할 때 — 지금까지 실서버에서 나왔던 버그들이 다시 생기지 않는지
 */
const { test, expect } = require('@playwright/test');
const {
  newHost, createMinorityRoom, joinMany, waitForLobbyCount, delayResponses, delayRequests, countCountdowns, vote
} = require('./helpers');

test('응답이 늦게 와도 카운트다운은 라운드마다 한 번 (한 판 더 이후 포함)', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  const phones = await joinMany(browser, code, ['가', '나', '다']);
  await waitForLobbyCount(host, 3);

  let slow = false;
  await delayResponses(host, '**/api/game?*', () => (slow ? 3000 : 300));
  const counter = await countCountdowns(host);

  async function playRound(choices, nextSelector) {
    await host.click(nextSelector);
    await expect(phones[0].locator('.vote-btn')).toHaveCount(2);
    for (let i = 0; i < phones.length; i++) await vote(phones[i], choices[i]);
    await host.waitForTimeout(2500);
    await counter.reset();
    slow = true; await host.waitForTimeout(1700); slow = false; // 느린 응답 하나가 떠 있는 상태에서 공개
    await host.click('#btn-reveal');
    await host.waitForTimeout(7000);
    expect(await counter.value()).toBe(1);
  }

  await playRound(['A', 'A', 'A'], '#btn-start');
  await playRound(['A', 'A', 'A'], '#btn-next');
  await playRound(['A', 'A', 'B'], '#btn-next'); // 1명 생존 → 종료
  await expect(host.locator('#btn-restart')).toBeVisible();
  await host.click('#btn-restart');
  await waitForLobbyCount(host, 3);
  await playRound(['A', 'A', 'A'], '#btn-start');
});

test('A → B로 바꿨을 때 첫 요청이 늦게 도착해도 B로 표시·집계 (빠르게 여러 번 바꿔도)', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  const phones = await joinMany(browser, code, ['바꾸는사람', '나', '다', '라', '마', '바']);
  await waitForLobbyCount(host, 6);
  const me = phones[0];

  for (const [round, clicks] of [[1, ['A', 'B']], [2, ['A', 'B', 'A', 'B']]]) {
    await host.click(round === 1 ? '#btn-start' : '#btn-next');
    await expect(me.locator('.vote-btn')).toHaveCount(2);
    let first = true;
    await delayRequests(me, '**/api/game', (req) => {
      if (req.method() === 'POST' && (req.postData() || '').includes('"vote"') && first) { first = false; return 2000; }
      return 0;
    });
    for (const c of clicks) { await me.click(`[data-choice=${c}]`); await me.waitForTimeout(120); }
    // 나머지: A 3 · B 2 → 바꾼 사람이 B면 3:3 동점(전원 생존)
    for (const [i, c] of [[1, 'A'], [2, 'A'], [3, 'A'], [4, 'B'], [5, 'B']]) await vote(phones[i], c);
    for (let i = 0; i < 5; i++) {
      await me.waitForTimeout(1000);
      await expect(me.locator('.vote-btn.selected')).toHaveAttribute('data-choice', 'B');
    }
    await expect(me.locator('.vote-btn.selected .picked')).toHaveText('선택함');
    await me.unroute('**/api/game');
    await host.click('#btn-reveal');
    await expect(host.locator('.verdict')).toContainText('동점입니다');
    await expect(me.locator('.mini-result .rb .mine-label')).toHaveText('내 선택');
  }
});

test('공개 직전에 바꾼 투표(저장 0.7초)도 반영된다', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  const phones = await joinMany(browser, code, ['막판변경', '나', '다', '라', '마', '바']);
  await waitForLobbyCount(host, 6);
  await host.click('#btn-start');
  const me = phones[0];
  await expect(me.locator('.vote-btn')).toHaveCount(2);
  for (const [i, c] of [[1, 'A'], [2, 'A'], [3, 'A'], [4, 'B'], [5, 'B']]) await vote(phones[i], c);
  await vote(me, 'A');
  await expect(host.locator('#vote-progress-text')).toHaveText('6 / 6명 투표');
  await delayRequests(me, '**/api/game', (req) => (req.method() === 'POST' ? 700 : 0));
  await me.click('[data-choice=B]');
  await expect(me.locator('.vote-btn.selected .picked')).toHaveText('저장 중…');
  await host.waitForTimeout(100);
  await host.click('#btn-reveal');
  await expect(host.locator('.verdict')).toContainText('동점입니다');
});

test('마감 요청이 3초 걸려도: 카운트다운 → 집계 중… → 결과, 카운트다운 1번', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  const phones = await joinMany(browser, code, ['가', '나', '다', '라']);
  await waitForLobbyCount(host, 4);
  await host.click('#btn-start');
  for (const [i, c] of [[0, 'A'], [1, 'A'], [2, 'B'], [3, 'B']]) await vote(phones[i], c);
  await expect(host.locator('#vote-progress-text')).toHaveText('4 / 4명 투표');
  await delayRequests(host, '**/api/game', (req) => (req.method() === 'POST' ? 3000 : 0));
  const counter = await countCountdowns(host);
  await host.click('#btn-reveal');
  await expect(host.locator('.countdown-wait')).toHaveText('집계 중…', { timeout: 4500 });
  await expect(host.locator('.verdict')).toContainText('동점입니다', { timeout: 10_000 });
  expect(await counter.value()).toBe(1);
});
