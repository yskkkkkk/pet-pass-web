/**
 * 소수결 전체 흐름 + 웃음 장치 (도장, 호외 헤드라인, 이름표 떨어지기, 소리 끄기)
 */
const { test, expect } = require('@playwright/test');
const { newHost, createMinorityRoom, joinMany, joinAs, waitForLobbyCount, vote, expectNoErrors } = require('./helpers');

test('대기실 → 동점·미투표 → 소수파 생존·종료 → 한 판 더 → 늦은 참가 거부', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  await expect(host.locator('#btn-start')).toBeDisabled();
  await expect(host.locator('#lobby-hint')).toHaveText('3명 이상 모이면 시작할 수 있습니다');
  await expect(host.locator('.lobby-settings')).toHaveCount(0); // 소수결은 진행자 설정이 없다

  const phones = await joinMany(browser, code, ['가', '나', '다', '라', '마']);
  await waitForLobbyCount(host, 5);
  await expect(host.locator('#btn-start')).toBeEnabled();

  // 1라운드: A 2 · B 2 · 미투표 1 → 동점, 미투표자만 탈락
  await host.click('#btn-start');
  await expect(phones[0].locator('.vote-btn')).toHaveCount(2);
  await vote(phones[0], 'A');
  await vote(phones[1], 'A');
  await vote(phones[2], 'B');
  await vote(phones[3], 'B');
  await expect(host.locator('#vote-progress-text')).toHaveText('4 / 5명 투표');
  await expect(host.locator('.tag.voted')).toHaveCount(4);
  await host.click('#btn-reveal');

  await expect(host.locator('.headline')).toContainText(/\[(속보|호외)\]/);
  await expect(host.locator('.verdict')).toContainText('동점입니다');
  await expect(host.locator('.option .stamp')).toHaveCount(0, { timeout: 3000 }); // 동점에는 도장 없음
  await expect(host.locator('.tag.just-out')).toHaveText(['마']);
  await expect(host.locator('.tag.just-out.falling')).toHaveCount(1);
  await expect(phones[4].locator('.verdict-stamp .stamp-out')).toHaveText('탈락');
  await expect(phones[4].locator('.screen-desc')).toContainText('투표하지 않았습니다');
  await expect(phones[0].locator('.verdict-stamp .stamp-live')).toHaveText('생존');

  // 2라운드: A 3 · B 1 → B 생존 1명 → 종료
  await host.keyboard.press('Enter');
  await expect(phones[0].locator('.vote-btn')).toHaveCount(2);
  await expect(phones[4].locator('.note')).toContainText('관전 중');
  for (const p of phones.slice(0, 3)) await vote(p, 'A');
  await vote(phones[3], 'B');
  await host.click('#btn-reveal');

  await expect(host.locator('.headline')).toContainText('라');
  await expect(host.locator('#winners')).toContainText('라');
  await expect(host.locator('#winners .stamp-live')).toHaveText('우승');
  await expect(host.locator('.option.loser .stamp-out')).toHaveText('탈락');
  await expect(host.locator('.option.winner .stamp-live')).toHaveText('생존');
  await expect(host.locator('.tag.just-out')).toHaveText(['가', '나', '다']);
  await expect(phones[3].locator('.verdict-stamp .stamp-live')).toHaveText('우승');
  await expect(phones[1].locator('.verdict-stamp .stamp-out')).toHaveText('탈락'); // 마지막 라운드에 떨어진 사람
  await expect(phones[4].locator('.verdict-word')).toHaveText('게임 종료'); // 그 전에 떨어진 사람
  await expect(phones[1].locator('.mini-result .mine-label')).toHaveText('내 선택');

  // 새로고침하면 연출 없이 결과 그대로 (도장은 이미 찍혀 있음)
  await host.reload({ waitUntil: 'commit' });
  await expect(host.locator('#winners .stamp.still')).toHaveText('우승');
  await expect(host.locator('.tag.falling')).toHaveCount(0);

  // 같은 멤버로 한 판 더
  await host.click('#btn-restart');
  await waitForLobbyCount(host, 5);
  await expect(phones[2].locator('text=참가했습니다')).toBeVisible();

  await host.click('#btn-start');
  await expect(phones[0].locator('.vote-btn')).toHaveCount(2);
  const late = await browser.newContext().then((c) => c.newPage());
  await late.goto('/game/play?room=' + code, { waitUntil: 'commit' });
  await late.waitForSelector('#f-nick');
  await late.fill('#f-nick', '지각생');
  await late.click('#btn-join');
  await expect(late.locator('#join-error')).toHaveText('이미 게임이 시작됐어요. 다음 판을 기다려 주세요.');

  expectNoErrors(host, ...phones);
});

test('대기실에서 내보내기, 문제 바꾸기, 진행자 새로고침 후에도 계속', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  const phones = await joinMany(browser, code, ['가', '나', '다', '라']);
  await waitForLobbyCount(host, 4);

  await host.locator('.name-list li', { hasText: '라' }).hover();
  await host.click('[aria-label="라 내보내기"]');
  await waitForLobbyCount(host, 3);
  await expect(phones[3].locator('#join-error')).toHaveText('방에서 나가졌어요. 다시 참가해 주세요.');

  await host.click('#btn-start');
  const first = await host.locator('.question').textContent();
  await vote(phones[0], 'A');
  await expect(host.locator('#vote-progress-text')).toHaveText('1 / 3명 투표');
  await host.click('#btn-reroll');
  await expect(host.locator('.question')).not.toHaveText(first);
  await expect(host.locator('#vote-progress-text')).toHaveText('0 / 3명 투표');
  // #124: 문제를 바꾸면 휴대폰의 선택도 풀리고, 같은 A를 다시 눌러도 새 문제의 표로 저장된다
  await expect(phones[0].locator('.vote-btn.selected')).toHaveCount(0);
  await vote(phones[0], 'A');
  await expect(host.locator('#vote-progress-text')).toHaveText('1 / 3명 투표');

  await host.reload({ waitUntil: 'commit' });
  await expect(host.locator('#btn-reveal')).toBeVisible();
  expectNoErrors(host, ...phones.slice(0, 3));
});

test('소리 끄기: 누르면 끔으로 바뀌고 새로고침해도 기억한다', async ({ browser }) => {
  const host = await newHost(browser);
  await createMinorityRoom(host);
  const toggle = host.locator('.sound-toggle');
  await expect(toggle).toHaveText('소리 켬');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveText('소리 끔');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await host.reload({ waitUntil: 'commit' });
  await expect(host.locator('.sound-toggle')).toHaveText('소리 끔');
});

test('휴대폰에서 처음 열었을 때 지난 결과는 연출 없이', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  const phones = await joinMany(browser, code, ['가', '나', '다']);
  await waitForLobbyCount(host, 3);
  await host.click('#btn-start');
  await vote(phones[0], 'A');
  await vote(phones[1], 'A');
  await vote(phones[2], 'A');
  await host.click('#btn-reveal');
  await expect(phones[0].locator('.verdict-stamp .stamp')).toHaveText('생존');
  await phones[0].reload({ waitUntil: 'commit' });
  await expect(phones[0].locator('.verdict-stamp .stamp.still')).toHaveText('생존');
});

test('같은 폰의 두 번째 참가자(다른 브라우저)는 다른 사람', async ({ browser }) => {
  const host = await newHost(browser);
  const code = await createMinorityRoom(host);
  await joinAs(browser, code, '가');
  await joinAs(browser, code, '나');
  await waitForLobbyCount(host, 2);
});
