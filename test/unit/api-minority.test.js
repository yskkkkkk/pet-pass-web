/**
 * /api/game 전체 흐름 (소수결) — 서버 없이 핸들러를 직접 호출한다.
 */
const { api, call } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/game');

const { get, post } = api(handler);

async function newRoom(names = ['가', '나', '다', '라']) {
  const c = await post({ action: 'create' });
  assert.equal(c.status, 200);
  const { code, hostToken } = c.body;
  const tokens = [];
  for (const n of names) {
    const j = await post({ action: 'join', code, nickname: n });
    assert.equal(j.status, 200, `join ${n}`);
    tokens.push(j.body.playerToken);
  }
  return { code, hostToken, tokens };
}

const hostState = (code, hostToken) => get({ action: 'state', code, hostToken });
const playerState = (code, playerToken) => get({ action: 'state', code, playerToken });

test('방 만들기: 4자리 코드, 진행자 토큰, 게임 종류', async () => {
  const r = await post({ action: 'create' });
  assert.equal(r.status, 200);
  assert.match(r.body.code, /^\d{4}$/);
  assert.match(r.body.hostToken, /^[0-9a-f]{32}$/);
  assert.equal(r.body.game, 'minority');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal((await post({ action: 'create', game: 'minority' })).status, 200);
});

test('방 만들기: 없는 게임은 거절', async () => {
  const r = await post({ action: 'create', game: 'nope' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, '방을 만들 수 없는 게임이에요.');
});

test('참가: 닉네임 정리, 중복 거절, 같은 기기는 토큰으로 복귀', async () => {
  const { code, tokens } = await newRoom(['가']);
  const dup = await post({ action: 'join', code, nickname: '  가 ' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /이미 사용 중인 닉네임/);
  const back = await post({ action: 'join', code, nickname: '다른이름', playerToken: tokens[0] });
  assert.deepEqual(back.body, { playerToken: tokens[0], nickname: '가' });
  const empty = await post({ action: 'join', code, nickname: '   ' });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /닉네임을 입력/);
  const wrongToken = await post({ action: 'join', code, nickname: '새사람', playerToken: 'nope' });
  assert.equal(wrongToken.status, 200, '모르는 토큰이면 새로 참가');
  assert.notEqual(wrongToken.body.playerToken, 'nope');
});

test('참가: 잘못된 코드 400, 없는 방 404, 게임 시작 후 409', async () => {
  assert.equal((await post({ action: 'join', code: '12', nickname: 'x' })).status, 400);
  const missing = await post({ action: 'join', code: '0000', nickname: 'x' });
  assert.ok([200, 404].includes(missing.status));
  const { code, hostToken } = await newRoom(['가', '나', '다']);
  await post({ action: 'start', code, hostToken });
  const late = await post({ action: 'join', code, nickname: '지각' });
  assert.equal(late.status, 409);
  assert.match(late.body.error, /이미 게임이 시작/);
});

test('상태: 진행자/참가자 응답 모양 (대기실)', async () => {
  const { code, hostToken, tokens } = await newRoom(['가', '나', '다', '라']);
  const h = await hostState(code, hostToken);
  assert.equal(h.status, 200);
  assert.equal(h.body.game, 'minority');
  assert.deepEqual(h.body.settings, {});
  assert.equal(h.body.role, 'host');
  assert.equal(h.body.aliveCount, 4);
  assert.equal(h.body.voteCount, 0);
  assert.deepEqual(h.body.room, { code, status: 'lobby', round: 0, question: null, result: null });
  assert.deepEqual(h.body.players.map((p) => p.nickname), ['가', '나', '다', '라']);
  assert.deepEqual(Object.keys(h.body.players[0]).sort(), ['alive', 'eliminatedRound', 'id', 'nickname', 'voted']);

  const p = await playerState(code, tokens[1]);
  assert.equal(p.body.role, 'player');
  assert.equal(p.body.game, 'minority');
  assert.deepEqual(p.body.settings, {});
  assert.deepEqual(p.body.me, { nickname: '나', alive: true, eliminatedRound: null, choice: null });
  assert.equal(p.body.playerCount, 4);
  assert.equal(p.body.aliveCount, 4);
  assert.deepEqual(p.body.winners, []);
  assert.ok(!('players' in p.body), '참가자에게 다른 사람 정보(id 등)를 주지 않음');
});

test('상태: 토큰 없음 400, 잘못된 진행자 403, 모르는 참가자 404, 없는 방 404', async () => {
  const { code } = await newRoom(['가']);
  const noToken = await get({ action: 'state', code });
  assert.equal(noToken.status, 400);
  assert.match(noToken.body.error, /토큰이 필요/);
  const badHost = await hostState(code, 'x');
  assert.equal(badHost.status, 403);
  assert.match(badHost.body.error, /진행자 권한/);
  const badPlayer = await playerState(code, 'x');
  assert.equal(badPlayer.status, 404);
  assert.match(badPlayer.body.error, /참가자 정보를 찾을 수 없어요/);
  const otherCode = code === '0000' ? '0001' : '0000';
  const noRoom = await get({ action: 'state', code: otherCode, hostToken: 'x' });
  assert.ok([403, 404].includes(noRoom.status));
});

test('방 정보: 게임 종류와 경로, 상태', async () => {
  const { code } = await newRoom(['가']);
  const r = await get({ action: 'info', code });
  assert.deepEqual(r.body, { code, game: 'minority', path: '/game/minority', status: 'lobby' });
  assert.equal((await get({ action: 'info', code: 'x' })).status, 400);
});

test('내보내기: 진행자만, 대기실에서만, 참가자 선택 필수', async () => {
  const { code, hostToken } = await newRoom(['가', '나', '다', '라']);
  const players = (await hostState(code, hostToken)).body.players;
  assert.equal((await post({ action: 'kick', code, hostToken: 'x', playerId: players[3].id })).status, 403);
  const noId = await post({ action: 'kick', code, hostToken });
  assert.equal(noId.status, 400);
  assert.match(noId.body.error, /참가자를 선택/);
  assert.deepEqual((await post({ action: 'kick', code, hostToken, playerId: players[3].id })).body, { ok: true });
  assert.equal((await hostState(code, hostToken)).body.players.length, 3);
  await post({ action: 'start', code, hostToken });
  const during = await post({ action: 'kick', code, hostToken, playerId: players[2].id });
  assert.equal(during.status, 409);
  assert.match(during.body.error, /대기실에서만/);
});

test('라운드 시작: 진행자만, 3명 이상, 중복 시작 거절', async () => {
  const small = await newRoom(['가', '나']);
  const few = await post({ action: 'start', code: small.code, hostToken: small.hostToken });
  assert.equal(few.status, 409);
  assert.match(few.body.error, /최소 3명/);

  const { code, hostToken } = await newRoom(['가', '나', '다']);
  assert.equal((await post({ action: 'start', code, hostToken: 'x' })).status, 403);
  const s = await post({ action: 'start', code, hostToken });
  assert.equal(s.status, 200);
  assert.equal(s.body.room.status, 'voting');
  assert.equal(s.body.room.round, 1);
  assert.ok(s.body.room.question.text && s.body.room.question.a && s.body.room.question.b);
  assert.equal(s.body.room.result, null);
  const again = await post({ action: 'start', code, hostToken });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /시작할 수 없어요/);
});

test('투표: 검증, 지난 라운드 거절, 덮어쓰기, 진행자에게 투표 여부만', async () => {
  const { code, hostToken, tokens } = await newRoom(['가', '나', '다']);
  const lobbyVote = await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A' });
  assert.equal(lobbyVote.status, 409);
  assert.match(lobbyVote.body.error, /투표 시간이 아니에요/);
  await post({ action: 'start', code, hostToken });

  const badChoice = await post({ action: 'vote', code, playerToken: tokens[0], choice: 'C' });
  assert.equal(badChoice.status, 400);
  assert.equal(badChoice.body.error, '잘못된 선택입니다.');
  const badPlayer = await post({ action: 'vote', code, playerToken: 'x', choice: 'A' });
  assert.equal(badPlayer.status, 403);
  assert.equal(badPlayer.body.error, '참가자 정보를 찾을 수 없어요.');
  assert.equal((await post({ action: 'vote', code, choice: 'A' })).status, 403);
  const old = await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A', round: 0 });
  assert.equal(old.status, 409);
  assert.match(old.body.error, /지난 라운드/);
  assert.equal((await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A', round: '1' })).status, 200, '라운드는 문자열 숫자도 허용');

  const ok = await post({ action: 'vote', code, playerToken: tokens[0], choice: 'B', round: 1 });
  assert.deepEqual(ok.body, { ok: true, choice: 'B' });
  await post({ action: 'vote', code, playerToken: tokens[1], choice: 'A' });

  const h = await hostState(code, hostToken);
  assert.equal(h.body.voteCount, 2);
  assert.deepEqual(h.body.players.map((p) => p.voted), [true, true, false]);
  const p = await playerState(code, tokens[0]);
  assert.equal(p.body.me.choice, 'B', '덮어쓴 마지막 선택');
  assert.equal((await playerState(code, tokens[2])).body.me.choice, null);
});

test('문제 바꾸기: 투표 중에만, 문제가 바뀌고 표가 초기화', async () => {
  const { code, hostToken, tokens } = await newRoom(['가', '나', '다']);
  const early = await post({ action: 'reroll', code, hostToken });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, '투표 중에만 문제를 바꿀 수 있어요.');
  const s = await post({ action: 'start', code, hostToken });
  await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A' });
  const r = await post({ action: 'reroll', code, hostToken });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.room.question.id, s.body.room.question.id);
  assert.equal(r.body.room.round, 1);
  assert.equal((await hostState(code, hostToken)).body.voteCount, 0);
  assert.equal((await post({ action: 'reroll', code, hostToken: 'x' })).status, 403);
});

test('결과 공개 → 다음 라운드 → 종료 → 재시작', async () => {
  const { code, hostToken, tokens } = await newRoom(['가', '나', '다', '라', '마']);
  const tooEarly = await post({ action: 'reveal', code, hostToken });
  assert.equal(tooEarly.status, 409, '투표 전 공개 불가');
  assert.equal(tooEarly.body.error, '투표 중인 라운드가 없어요.');
  await post({ action: 'start', code, hostToken });
  // 1라운드: A 2, B 2, 미투표 1 → 동점, 미투표자만 탈락
  await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A' });
  await post({ action: 'vote', code, playerToken: tokens[1], choice: 'A' });
  await post({ action: 'vote', code, playerToken: tokens[2], choice: 'B' });
  await post({ action: 'vote', code, playerToken: tokens[3], choice: 'B' });
  assert.equal((await post({ action: 'reveal', code, hostToken: 'x' })).status, 403);
  const r1 = await post({ action: 'reveal', code, hostToken });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.room.status, 'revealed');
  assert.equal(r1.body.room.result.outcome, 'tie');
  assert.equal(r1.body.room.result.noVoteCount, 1);
  assert.equal(r1.body.room.result.eliminatedIds.length, 1);
  assert.equal((await post({ action: 'reveal', code, hostToken })).status, 409, '중복 공개 불가');

  const survivor = await playerState(code, tokens[0]);
  assert.equal(survivor.body.room.status, 'revealed');
  assert.equal(survivor.body.me.choice, 'A', '결과 공개 상태에서도 내 선택을 받는다');
  assert.equal(survivor.body.room.result.outcome, 'tie');
  assert.equal(survivor.body.room.result.aCount, 2);
  assert.equal(survivor.body.room.result.round, 1);
  assert.equal(survivor.body.aliveCount, 4);
  assert.equal((await hostState(code, hostToken)).body.aliveCount, 4);

  const out = await playerState(code, tokens[4]);
  assert.equal(out.body.me.alive, false);
  assert.equal(out.body.me.choice, null);
  assert.equal(out.body.me.eliminatedRound, 1);
  assert.equal(out.body.room.result.eliminatedIds, undefined, '참가자에게 탈락자 id 목록은 주지 않음');
  const outVote = await post({ action: 'start', code, hostToken });
  assert.equal(outVote.body.room.round, 2);
  const dead = await post({ action: 'vote', code, playerToken: tokens[4], choice: 'A' });
  assert.equal(dead.status, 409);
  assert.match(dead.body.error, /탈락해서/);

  // 2라운드: A 1, B 3 → A(가)만 생존 → 종료
  await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A' });
  for (const t of tokens.slice(1, 4)) await post({ action: 'vote', code, playerToken: t, choice: 'B' });
  const r2 = await post({ action: 'reveal', code, hostToken });
  assert.equal(r2.body.room.status, 'finished');
  assert.equal(r2.body.room.result.noVoteCount, 0, '이미 탈락한 사람은 미투표로 세지 않음');
  assert.equal(r2.body.room.result.eliminatedIds.length, 3);
  assert.equal((await playerState(code, tokens[4])).body.me.eliminatedRound, 1, '먼저 탈락한 사람의 탈락 라운드는 그대로');
  assert.equal((await playerState(code, tokens[1])).body.me.eliminatedRound, 2);
  assert.equal(r2.body.room.result.winningChoice, 'A');
  assert.equal(r2.body.room.result.survivorCount, 1);
  const fin = await playerState(code, tokens[0]);
  assert.deepEqual(fin.body.winners, ['가']);
  assert.equal(fin.body.me.choice, 'A');
  assert.equal(fin.body.aliveCount, 1);
  assert.equal((await post({ action: 'start', code, hostToken })).status, 409, '종료 후에는 시작 불가');

  const h = await hostState(code, hostToken);
  assert.equal(h.body.voteCount, 0, '공개 후에는 투표 수를 세지 않음');
  assert.equal(h.body.aliveCount, 1);
  assert.deepEqual(h.body.players.map((p) => p.voted), [false, false, false, false, false]);
  assert.deepEqual(h.body.players.map((p) => p.alive), [true, false, false, false, false]);

  assert.equal((await post({ action: 'restart', code, hostToken: 'x' })).status, 403);
  const rs = await post({ action: 'restart', code, hostToken });
  assert.deepEqual(rs.body.room, { code, status: 'lobby', round: 0, question: null, result: null });
  const after = await hostState(code, hostToken);
  assert.ok(after.body.players.every((p) => p.alive && p.eliminatedRound === null));
  const again = await post({ action: 'start', code, hostToken });
  assert.equal(again.body.room.round, 1);
  assert.equal((await playerState(code, tokens[0])).body.me.choice, null, '재시작 후 지난 표는 남지 않음');
});

test('요청 형식: 알 수 없는 action, action 없음, 문자열 body, 허용되지 않은 메서드', async () => {
  const { code, hostToken } = await newRoom(['가']);
  for (const body of [{ action: 'nope', code, hostToken }, { code }, { action: 'toString', code }, { action: 'create2' }]) {
    const r = await post(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.body.error, /알 수 없는 요청/);
  }
  const unknownGet = await get({ action: 'nope', code });
  assert.equal(unknownGet.status, 400);
  assert.equal(unknownGet.body.error, '알 수 없는 요청입니다.');
  const str = await call(handler, { method: 'POST', body: JSON.stringify({ action: 'create' }) });
  assert.equal(str.status, 200, '문자열 JSON body도 처리');
  const broken = await call(handler, { method: 'POST', body: '{not json' });
  assert.equal(broken.status, 400);
  assert.equal(broken.body.error, '요청 형식이 올바르지 않아요.');
  for (const odd of ['null', '3', '"x"']) {
    const r = await call(handler, { method: 'POST', body: odd });
    assert.equal(r.status, 400, odd);
    assert.equal(r.body.error, '알 수 없는 요청입니다.');
  }
  const noBody = await call(handler, { method: 'POST' });
  assert.equal(noBody.status, 400);
  const put = await call(handler, { method: 'PUT', body: {} });
  assert.equal(put.status, 405);
  assert.match(put.body.error, /허용되지 않은 메서드/);
  const opt = await call(handler, { method: 'OPTIONS' });
  assert.equal(opt.status, 204);
});

test('출처 확인: 같은 도메인·출처 없음은 허용, 다른 도메인은 거절', async () => {
  const same = await call(handler, { method: 'POST', body: { action: 'create' }, headers: { origin: 'http://localhost:3000' } });
  assert.equal(same.status, 200);
  const fwd = await call(handler, { method: 'POST', body: { action: 'create' }, headers: { origin: 'https://preview.example.app', 'x-forwarded-host': 'preview.example.app' } });
  assert.equal(fwd.status, 200, '프리뷰 도메인(x-forwarded-host 기준)');
  const evil = await call(handler, { method: 'POST', body: { action: 'create' }, headers: { origin: 'https://evil.example.com' } });
  assert.equal(evil.status, 403);
  assert.match(evil.body.error, /허용되지 않은 Origin/);
  const garbage = await call(handler, { method: 'GET', query: { action: 'info', code: '1234' }, headers: { origin: 'not a url' } });
  assert.equal(garbage.status, 403);
});

test('요청 제한: 같은 IP에서 1분에 방 10개까지', async () => {
  const ip = '192.168.77.1';
  for (let i = 0; i < 10; i++) assert.equal((await post({ action: 'create' }, { ip })).status, 200, `${i + 1}번째`);
  const blocked = await post({ action: 'create' }, { ip });
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers['retry-after']);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(blocked.res.sent, 1, '막힌 요청은 응답을 한 번만 보낸다 (방도 만들지 않음)');
});

test('요청 제한: 같은 IP에서 1분에 참가 120번까지', async () => {
  const { code } = await newRoom([]);
  const ip = '192.168.77.2';
  for (let i = 0; i < 120; i++) assert.equal((await post({ action: 'join', code, nickname: 'n' + i }, { ip })).status, 200);
  const over = await post({ action: 'join', code, nickname: 'over' }, { ip });
  assert.equal(over.status, 429);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(over.res.sent, 1);
  assert.equal((await post({ action: 'vote', code, choice: 'A' }, { ip })).status, 403, '참가 외 요청은 제한 대상이 아님 (429가 아님)');
});

test('동시에 두 번 누른 시작·공개는 한 번만 처리된다', async () => {
  const { code, hostToken, tokens } = await newRoom(['가', '나', '다']);
  const starts = await Promise.all([post({ action: 'start', code, hostToken }), post({ action: 'start', code, hostToken })]);
  assert.deepEqual(starts.map((r) => r.status).sort(), [200, 409]);
  assert.equal(starts.find((r) => r.status === 409).body.error, '이미 라운드가 시작됐어요.');
  assert.equal((await hostState(code, hostToken)).body.room.round, 1, '라운드가 두 번 오르지 않음');

  await post({ action: 'vote', code, playerToken: tokens[0], choice: 'A' });
  await post({ action: 'vote', code, playerToken: tokens[1], choice: 'B' });
  await post({ action: 'vote', code, playerToken: tokens[2], choice: 'B' });
  const reveals = await Promise.all([post({ action: 'reveal', code, hostToken }), post({ action: 'reveal', code, hostToken })]);
  assert.deepEqual(reveals.map((r) => r.status).sort(), [200, 409]);
  assert.equal(reveals.find((r) => r.status === 409).body.error, '이미 결과가 공개됐어요.');
});

test('문제 바꾸기 중 결과가 먼저 공개되면 문제를 바꾸지 않는다', async () => {
  const { code, hostToken, tokens } = await newRoom(['가', '나', '다']);
  await post({ action: 'start', code, hostToken });
  for (const t of tokens) await post({ action: 'vote', code, playerToken: t, choice: 'A' });
  const [reveal, reroll] = await Promise.all([post({ action: 'reveal', code, hostToken }), post({ action: 'reroll', code, hostToken })]);
  const h = (await hostState(code, hostToken)).body;
  if (reveal.status === 200 && reroll.status === 409) {
    assert.equal(reroll.body.error, '라운드 상태가 바뀌었어요. 화면을 새로고침해 주세요.');
    assert.equal(h.room.question.id, reveal.body.room.question.id, '공개된 문제 그대로');
  } else {
    assert.equal(reroll.status, 200, '문제 바꾸기가 먼저였다면 공개는 바뀐 문제로');
  }
  assert.equal(h.room.status, 'revealed');
});
