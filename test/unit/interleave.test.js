/**
 * 요청이 엇갈리는 순서 (2차 리뷰 반례) — 한 요청을 저장소 함수 한가운데서 멈춰 두고 다른 요청을 끼운다.
 * 실서버(Vercel + Supabase)에서는 요청마다 따로 실행되므로, 읽은 뒤 쓰기 전까지 무엇이든 끼어들 수 있다.
 */
const { api, pauseAt } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/game');
const { getStore } = require('../../lib/game/store');

const { get, post } = api(handler);
const store = getStore();
const item = (points, kind = 'normal') => ({ kind, name: kind + points, points });

async function room(game, names) {
  const { body: { code, hostToken } } = await post({ action: 'create', game });
  const tokens = [];
  for (const n of names) tokens.push((await post({ action: 'join', code, nickname: n })).body.playerToken);
  return { code, hostToken, tokens };
}
const host = (r, action, extra = {}) => post({ action, code: r.code, hostToken: r.hostToken, ...extra });
const hostState = (r) => get({ action: 'state', code: r.code, hostToken: r.hostToken });
const playerState = (r, i) => get({ action: 'state', code: r.code, playerToken: r.tokens[i] });

async function fixLineup(r, lineup) {
  const row = await store.getRoom(r.code);
  await store.updateRoom(r.code, { state: { ...row.state, lineup } });
}

test('경매: 지난 결과를 읽던 조회가 늦어지는 사이 한 판 더·시작해도, 새 판 칩·점수가 오염되지 않는다', async (t) => {
  const r = await room('auction', ['가', '나']);
  await host(r, 'start');
  await fixLineup(r, [item(3), item(3)]);
  await post({ action: 'bid', code: r.code, playerToken: r.tokens[0], bid: 30 });
  await post({ action: 'bid', code: r.code, playerToken: r.tokens[1], bid: 10 });
  await host(r, 'reveal');

  const gate = pauseAt(store, 'listPlayers');
  t.after(gate.restore);
  const slow = hostState(r);          // 공개 상태의 방을 읽고 참가자 목록에서 멈춤
  await gate.reached;
  await host(r, 'restart');
  await host(r, 'start');
  gate.resume();
  await slow;

  const s = (await hostState(r)).body;
  assert.equal(s.room.status, 'playing');
  assert.deepEqual(s.players.map((p) => [p.chips, p.score]), [[100, 0], [100, 0]]);
});

test('경매: 1라운드 결과를 읽던 조회가 2라운드 정산 뒤에 끝나도 칩이 1라운드 값으로 되돌아가지 않는다', async (t) => {
  const r = await room('auction', ['가', '나']);
  await host(r, 'start');
  await fixLineup(r, [item(3), item(3), item(3)]);
  await post({ action: 'bid', code: r.code, playerToken: r.tokens[0], bid: 30 });
  await host(r, 'reveal');

  const gate = pauseAt(store, 'listPlayers');
  t.after(gate.restore);
  const slow = hostState(r);
  await gate.reached;
  await host(r, 'next');
  await post({ action: 'bid', code: r.code, playerToken: r.tokens[1], bid: 20 });
  await host(r, 'reveal');
  gate.resume();
  await slow;

  const s = (await hostState(r)).body;
  assert.deepEqual(s.players.map((p) => p.chips), [70, 80]);
});

test('소수결: 지난 결과를 읽던 조회가 늦어지는 사이 한 판 더·시작해도, 새 판 생존자가 줄지 않는다', async (t) => {
  const r = await room('minority', ['가', '나', '다']);
  await host(r, 'start');
  await post({ action: 'vote', code: r.code, playerToken: r.tokens[0], choice: 'A' });
  for (const tk of r.tokens.slice(1)) await post({ action: 'vote', code: r.code, playerToken: tk, choice: 'B' });
  await host(r, 'reveal'); // A 1 / B 2 → 1명 생존, 종료

  const gate = pauseAt(store, 'listPlayers');
  t.after(gate.restore);
  const slow = hostState(r);
  await gate.reached;
  await host(r, 'restart');
  await host(r, 'start');
  gate.resume();
  await slow;

  const s = (await hostState(r)).body;
  assert.equal(s.room.status, 'voting');
  assert.equal(s.aliveCount, 3);
});

test('소수결: 판 번호 검사를 통과하고 저장 직전에 멈춘 표가 문제 바꾸기 뒤에 저장돼도 새 문제의 표가 아니다', async () => {
  const r = await room('minority', ['가', '나', '다']);
  const started = await host(r, 'start');
  const gate = pauseAt(store, 'submitMove');
  const slow = post({ action: 'vote', code: r.code, playerToken: r.tokens[0], choice: 'A', round: 1, gen: started.body.room.gen });
  await gate.reached;
  await host(r, 'reroll');
  gate.resume();
  assert.equal((await slow).status, 409, '저장하는 순간 DB가 거절');

  const s = (await hostState(r)).body;
  assert.equal(s.voteCount, 0);
  assert.equal((await playerState(r, 0)).body.me.choice, null);
});

test('소수결: 저장 직전에 멈춘 표가 한 판 더·시작 뒤에 저장돼도 새 판 1라운드 표가 아니다', async () => {
  const r = await room('minority', ['가', '나', '다']);
  await host(r, 'start');
  const gate = pauseAt(store, 'submitMove');
  const slow = post({ action: 'vote', code: r.code, playerToken: r.tokens[0], choice: 'A', round: 1 });
  await gate.reached;
  await host(r, 'restart');
  await host(r, 'start');
  gate.resume();
  await slow;
  assert.equal((await hostState(r)).body.voteCount, 0);
});

test('소수결: 새 표가 저장된 뒤 지난 문제의 표가 늦게 저장돼도 새 표를 덮어쓰지 않는다', async () => {
  const r = await room('minority', ['가', '나', '다']);
  await host(r, 'start');
  const gate = pauseAt(store, 'submitMove');
  const slow = post({ action: 'vote', code: r.code, playerToken: r.tokens[0], choice: 'A' });
  await gate.reached;
  const re = await host(r, 'reroll');
  await post({ action: 'vote', code: r.code, playerToken: r.tokens[0], choice: 'B', gen: re.body.room.gen });
  gate.resume();
  await slow;
  assert.equal((await playerState(r, 0)).body.me.choice, 'B');
  assert.equal((await hostState(r)).body.voteCount, 1);
});

test('경매: 저장 직전에 멈춘 입찰이 한 판 더·시작 뒤에 저장돼도 새 판 입찰이 아니다', async () => {
  const r = await room('auction', ['가', '나']);
  await host(r, 'start');
  const gate = pauseAt(store, 'submitMove');
  const slow = post({ action: 'bid', code: r.code, playerToken: r.tokens[0], bid: 9, round: 1 });
  await gate.reached;
  await host(r, 'restart');
  await host(r, 'start');
  gate.resume();
  await slow;
  assert.equal((await playerState(r, 0)).body.me.bid, null);
  assert.equal((await hostState(r)).body.submittedCount, 0);
});

test('참가와 시작이 겹치면: 시작 전에 들어온 참가는 명단에 포함, 시작 뒤 참가는 거절 (지워서 인원이 줄지 않음)', async () => {
  const r = await room('auction', ['가', '나']);
  const gate = pauseAt(store, 'joinRoom');
  const late = post({ action: 'join', code: r.code, nickname: '다' });
  await gate.reached;
  assert.equal((await host(r, 'start')).status, 200);
  gate.resume();
  const j = await late;
  assert.equal(j.status, 409);
  assert.equal(j.body.error, '이미 게임이 시작됐어요. 다음 판을 기다려 주세요.');
  assert.deepEqual((await hostState(r)).body.players.map((p) => p.nickname), ['가', '나']);
});

test('마지막 자리에 여럿이 동시에 들어와도 한 명만 들어간다', async () => {
  const names = Array.from({ length: 14 }, (_, i) => '사람' + i);
  const r = await room('auction', names);
  const results = await Promise.all(['가', '나', '다'].map((n) => post({ action: 'join', code: r.code, nickname: n })));
  assert.deepEqual(results.map((x) => x.status).sort(), [200, 409, 409]);
  assert.equal((await store.listPlayers(r.code)).length, 15);
});

test('마감과 겹친 표: 잠그기 전에 저장됐으면 결과에 반영, 잠근 뒤면 거절되어 저장되지 않음', async (t) => {
  const r = await room('minority', ['가', '나', '다']);
  await host(r, 'start');
  for (const tk of r.tokens) await post({ action: 'vote', code: r.code, playerToken: tk, choice: 'A' });

  // 공개가 마감 중으로 잠근 뒤 표를 읽기 직전에 멈춘 사이, 한 사람이 B로 바꾼다
  const gate = pauseAt(store, 'listMoves');
  t.after(gate.restore);
  const revealing = host(r, 'reveal');
  await gate.reached;
  const change = await post({ action: 'vote', code: r.code, playerToken: r.tokens[0], choice: 'B' });
  assert.equal(change.status, 409, '마감 중이라 거절');
  assert.equal(change.body.error, '지금은 투표 시간이 아니에요.');
  gate.resume();
  const done = await revealing;
  assert.equal(done.body.room.result.aCount, 3);
  assert.equal((await playerState(r, 0)).body.me.choice, 'A', '결과·저장된 표·내 선택이 같다');
});

test('마감 중 상태는 화면에 투표 중으로 보이고, 중간에 멈춘 공개는 다시 눌러 끝낼 수 있다', async (t) => {
  const r = await room('minority', ['가', '나', '다']);
  await host(r, 'start');
  for (const tk of r.tokens) await post({ action: 'vote', code: r.code, playerToken: tk, choice: 'A' });
  const original = store.listMoves;
  store.listMoves = async () => { throw new Error('DB 끊김'); };
  const { error } = console;
  console.error = () => {};
  const failed = await host(r, 'reveal');
  console.error = error;
  store.listMoves = original;
  t.after(() => { store.listMoves = original; });
  assert.equal(failed.status, 500);
  assert.equal((await store.getRoom(r.code)).status, 'closing');
  const h = (await hostState(r)).body;
  assert.equal(h.room.status, 'voting');
  assert.equal(h.voteCount, 3);
  const again = await host(r, 'reveal');
  assert.equal(again.status, 200);
  assert.equal(again.body.room.status, 'revealed');
});

test('배포 전에 저장된 소수결 결과(사람별 선택 기록 없음)도 참가자 화면이 열린다', async () => {
  const r = await room('minority', ['가', '나', '다']);
  await host(r, 'start');
  for (const tk of r.tokens) await post({ action: 'vote', code: r.code, playerToken: tk, choice: 'A' });
  await host(r, 'reveal');
  const row = await store.getRoom(r.code);
  const { choices, ...old } = row.last_result;
  await store.updateRoom(r.code, { last_result: old, state: {} });
  const me = await store.getPlayerByToken(r.code, r.tokens[0]);
  await store.upsertVote({ room_code: r.code, round: 1, player_id: me.id, choice: 'A' }); // 예전 방식의 표
  const p = await playerState(r, 0);
  assert.equal(p.status, 200);
  assert.equal(p.body.me.choice, 'A');
});
