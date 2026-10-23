/**
 * 대기실 진행자 설정 화면
 * 소수결에는 설정이 없으므로, 브라우저에 내려가는 게임 목록(games.js)에만 가짜 설정을 끼워 넣어
 * 화면이 설정을 그리고 올바른 요청을 보내는지 확인한다. (서버는 모르는 설정이라 거절 → 안내 표시)
 * 실제 설정 저장은 설정이 있는 첫 게임(블라인드 경매)에서 화면 테스트로 확인한다.
 */
const { test, expect } = require('@playwright/test');
const { newHost, createMinorityRoom } = require('./helpers');

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
