/**
 * 대기실 진행자 설정 화면
 * 소수결에는 설정이 없으므로, 브라우저에 내려가는 게임 목록(games.js)에만 가짜 설정을 끼워 넣어
 * 화면이 설정을 그리고 올바른 요청을 보내는지 확인한다. (서버는 모르는 설정이라 거절 → 안내 표시)
 * 실제 설정 저장은 설정이 있는 첫 게임(블라인드 경매)에서 화면 테스트로 확인한다.
 */
const { test, expect } = require('@playwright/test');
const { newHost, createMinorityRoom, createAuctionRoom } = require('./helpers');

const FAKE = [
  { key: 'rounds', label: '라운드 수', type: 'int', min: 3, max: 12, default: 10 },
  { key: 'wild', label: '1을 만능으로', type: 'bool', default: false },
  { key: 'mode', label: '규칙', type: 'choice', options: [{ value: 'basic', label: '기본' }, { value: 'hard', label: '어려움' }], default: 'basic' }
];

test('설정 화면: 종류별 입력이 그려지고, 바꾸면 그 값만 서버로 보낸다', async ({ browser }) => {
  const host = await newHost(browser);
  await host.route('**/game/games.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('settings: []', 'settings: ' + JSON.stringify(FAKE));
    await route.fulfill({ response, body });
  });
  const sent = [];
  host.on('request', (req) => {
    if (req.method() === 'POST' && (req.postData() || '').includes('"settings"')) sent.push(JSON.parse(req.postData()).settings);
  });

  await createMinorityRoom(host);
  await expect(host.locator('.lobby-settings h3')).toHaveText('설정');
  await expect(host.locator('.setting[data-key=rounds] output')).toHaveText('10');
  await expect(host.locator('.setting[data-key=wild] input')).not.toBeChecked();
  await expect(host.locator('.setting[data-key=mode] select')).toHaveValue('basic');

  await host.click('.setting[data-key=rounds] [data-step="1"]');
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ rounds: 11 });
  await expect(host.locator('.toast.show')).toHaveText('알 수 없는 설정이에요: rounds');
  await expect(host.locator('.setting[data-key=rounds] output')).toHaveText('10', { timeout: 5000 }); // 서버 값으로 되돌아감

  await host.check('.setting[data-key=wild] input');
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual({ wild: true });

  await host.selectOption('.setting[data-key=mode] select', 'hard');
  await expect.poll(() => sent.length).toBe(3);
  expect(sent[2]).toEqual({ mode: 'hard' });
});

test('설정 화면: 최솟값·최댓값에서는 버튼이 막힌다', async ({ browser }) => {
  const host = await newHost(browser);
  const edge = [{ key: 'rounds', label: '라운드 수', type: 'int', min: 3, max: 10, default: 10 }];
  await host.route('**/game/games.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('settings: []', 'settings: ' + JSON.stringify(edge));
    await route.fulfill({ response, body });
  });
  await createMinorityRoom(host);
  await expect(host.locator('.setting[data-key=rounds] [data-step="1"]')).toBeDisabled();
  await expect(host.locator('.setting[data-key=rounds] [data-step="-1"]')).toBeEnabled();
});

test('설정 화면: 앞 설정의 응답이 늦어도 이어서 바꾼 설정이 빠지지 않고 순서대로 간다', async ({ browser }) => {
  const host = await newHost(browser);
  await host.route('**/game/games.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('settings: []', 'settings: ' + JSON.stringify(FAKE));
    await route.fulfill({ response, body });
  });
  const sent = [];
  // 실서버처럼 설정 저장 응답이 1.5초 걸린다 (서버 도착 순서대로 기록)
  await host.route('**/api/game', async (route) => {
    const post = route.request().postData() || '';
    if (route.request().method() !== 'POST' || !post.includes('"settings"')) return route.continue();
    sent.push(JSON.parse(post).settings);
    await new Promise((r) => setTimeout(r, 1500));
    return route.continue();
  });

  await createMinorityRoom(host);
  await host.check('.setting[data-key=wild] input');
  await host.selectOption('.setting[data-key=mode] select', 'hard');
  await host.click('.setting[data-key=rounds] [data-step="-1"]');
  await expect.poll(() => sent.length, { timeout: 10000 }).toBe(3);
  expect(sent).toEqual([{ wild: true }, { mode: 'hard' }, { rounds: 9 }]);
});

test('#129 숫자 설정을 빠르게 두 번 누르면 저장이 느려도 두 칸 올라간다 (+, + → 12, 이어서 +, − → 12 그대로)', async ({ browser }) => {
  const host = await newHost(browser);
  const sent = [];
  await host.route('**/api/game', async (route) => {
    const post = route.request().postData() || '';
    if (route.request().method() !== 'POST' || !post.includes('"settings"')) return route.continue();
    sent.push(JSON.parse(post).settings);
    await new Promise((r) => setTimeout(r, 1200));
    return route.continue();
  });
  const code = await createAuctionRoom(host);
  const out = host.locator('.setting[data-key=rounds] output');
  await expect(out).toHaveText('10');
  await host.click('.setting[data-key=rounds] [data-step="1"]');
  await host.click('.setting[data-key=rounds] [data-step="1"]');
  await expect(out).toHaveText('12');
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(2);
  expect(sent).toEqual([{ rounds: 11 }, { rounds: 12 }]);
  await host.click('.setting[data-key=rounds] [data-step="1"]');
  await host.click('.setting[data-key=rounds] [data-step="-1"]');
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(4);
  expect(sent.slice(2)).toEqual([{ rounds: 13 }, { rounds: 12 }]);
  await expect.poll(async () => host.evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:host:' + c);
    return (await (await fetch('/api/game?action=state&code=' + c + '&hostToken=' + t)).json()).settings.rounds;
  }, code), { timeout: 10_000 }).toBe(12);
  await expect(out).toHaveText('12');
});

test('#129 +, −, + 뒤 마지막 저장을 기다리는 중에 또 +: 의도한 12로 저장 / 저장 대기 중에 시작해도 화면의 설정으로 시작', async ({ browser }) => {
  const host = await newHost(browser);
  const sent = [];
  await host.route('**/api/game', async (route) => {
    const post = route.request().postData() || '';
    if (route.request().method() !== 'POST' || !post.includes('"settings"')) return route.continue();
    sent.push(JSON.parse(post).settings);
    await new Promise((r) => setTimeout(r, 800));
    return route.continue();
  });
  const code = await createAuctionRoom(host);
  const serverRounds = () => host.evaluate(async (c) => {
    const t = localStorage.getItem('minority-game:host:' + c);
    return (await (await fetch('/api/game?action=state&code=' + c + '&hostToken=' + t)).json());
  }, code);
  const out = host.locator('.setting[data-key=rounds] output');
  const plus = '.setting[data-key=rounds] [data-step="1"]';
  const minus = '.setting[data-key=rounds] [data-step="-1"]';

  await host.click(plus);
  await host.click(minus);
  await host.click(plus);
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(3); // 마지막(11) 저장을 기다리는 중
  await host.click(plus);
  await expect(out).toHaveText('12');
  await expect.poll(async () => (await serverRounds()).settings.rounds, { timeout: 10_000 }).toBe(12);
  expect(sent).toEqual([{ rounds: 11 }, { rounds: 10 }, { rounds: 11 }, { rounds: 12 }]);
  await expect(out).toHaveText('12');

  // 두 명 참가 → 저장 대기 중에 시작
  for (const n of ['가', '나']) {
    await host.evaluate(async ([c, nick]) => fetch('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join', code: c, nickname: nick }) }), [code, n]);
  }
  await expect(host.locator('#lobby-count')).toHaveText('2명');
  await host.click(minus);
  await host.click('#btn-start');
  await expect(host.locator('.table-top')).toBeVisible({ timeout: 10_000 });
  const s = await serverRounds();
  expect(s.settings.rounds).toBe(11);
  expect(s.room.rounds).toBe(11);
  expect(host.errors).toEqual([]);
});
