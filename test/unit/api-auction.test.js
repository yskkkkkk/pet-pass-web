/**
 * /api/game 블라인드 경매 흐름 — 서버 없이 핸들러를 직접 호출한다.
 * 물건 순서는 무작위라서, 판정을 확인하는 테스트는 저장소의 물건 순서를 정해 둔 값으로 바꿔 끼운다.
 */
const { api } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/game');
const { getStore } = require('../../lib/game/store');

const { get, post } = api(handler);
const store = getStore();

const item = (points, kind = 'normal') => ({ kind, name: kind + points, points });

async function newRoom(names = ['가', '나', '다'], settings) {
  const c = await post({ action: 'create', game: 'auction' });
  assert.equal(c.status, 200);
  const { code, hostToken } = c.body;
  if (settings) assert.equal((await post({ action: 'settings', code, hostToken, settings })).status, 200);
  const tokens = [];
  for (const n of names) {
    const j = await post({ action: 'join', code, nickname: n });
    assert.equal(j.status, 200, `join ${n}`);
    tokens.push(j.body.playerToken);
  }
  return { code, hostToken, tokens };
}

/** 게임 시작 + 물건 순서 고정 */
async function started(names, lineup, settings) {
  const room = await newRoom(names, settings);
  assert.equal((await post({ action: 'start', code: room.code, hostToken: room.hostToken })).status, 200);
  if (lineup) {
    const r = await store.getRoom(room.code);
    await store.updateRoom(room.code, { state: { ...r.state, lineup } });
  }
  return room;
}

const hostState = (code, hostToken) => get({ action: 'state', code, hostToken });
const playerState = (code, playerToken) => get({ action: 'state', code, playerToken });
const bid = (room, i, amount, extra = {}) => post({ action: 'bid', code: room.code, playerToken: room.tokens[i], bid: amount, ...extra });
const host = (room, action) => post({ action, code: room.code, hostToken: room.hostToken });

test('방 만들기: 경매 설정 기본값 (10라운드, 칩 100, 돌발 물건 켬)', async () => {
  const r = await post({ action: 'create', game: 'auction' });
  assert.equal(r.body.game, 'auction');
  const s = await hostState(r.body.code, r.body.hostToken);
  assert.deepEqual(s.body.settings, { rounds: 10, chips: 100, surprises: true });
  assert.equal(s.body.game, 'auction');
  const info = await get({ action: 'info', code: r.body.code });
  assert.deepEqual(info.body, { code: r.body.code, game: 'auction', path: '/game/auction', status: 'lobby' });
});

test('진행자 설정: 바꾼 설정 전체를 돌려주고 저장, 숫자 선택지는 숫자만', async () => {
  const { code, hostToken } = await newRoom([]);
  const r = await post({ action: 'settings', code, hostToken, settings: { rounds: 5, chips: 50 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { settings: { rounds: 5, chips: 50, surprises: true } });
  const off = await post({ action: 'settings', code, hostToken, settings: { surprises: false } });
  assert.deepEqual(off.body.settings, { rounds: 5, chips: 50, surprises: false });
  assert.equal((await post({ action: 'settings', code, hostToken, settings: { chips: '50' } })).status, 400);
  assert.equal((await post({ action: 'settings', code, hostToken, settings: { chips: 70 } })).status, 400);
  const tooMany = await post({ action: 'settings', code, hostToken, settings: { rounds: 16 } });
  assert.equal(tooMany.body.error, '라운드 수은(는) 5~15 사이 정수여야 해요.');
  assert.deepEqual((await hostState(code, hostToken)).body.settings, { rounds: 5, chips: 50, surprises: false });
});

test('대기실 상태: 참가자는 시작 칩, 0점, 모두 1위, 물건 없음', async () => {
  const room = await newRoom(['가', '나'], { chips: 200 });
  const h = (await hostState(room.code, room.hostToken)).body;
  assert.equal(h.role, 'host');
  assert.deepEqual(h.room, { code: room.code, status: 'lobby', round: 0, rounds: 0 });
  assert.deepEqual(h.players.map((p) => [p.nickname, p.chips, p.score, p.submitted, p.changes]), [['가', 200, 0, false, 0], ['나', 200, 0, false, 0]]);
  assert.deepEqual(h.lineup, []);
  assert.deepEqual(h.history, []);
  assert.equal(h.item, null);
  assert.equal(h.result, null);
  assert.equal(h.revealAgeMs, null);
  assert.deepEqual(h.awards, []);
  assert.equal(h.submittedCount, 0);
  const p = (await playerState(room.code, room.tokens[1])).body;
  assert.equal(p.role, 'player');
  assert.deepEqual(p.me, { id: h.players[1].id, nickname: '나', chips: 200, score: 0, rank: 1, bid: null });
  assert.equal(p.playerCount, 2);
  assert.equal(p.item, null);
  assert.equal(p.ranking.length, 2);
});

test('시작: 진행자만, 2명 이상, 한 번만. 시작하면 1라운드 입찰과 물건 순서', async () => {
  const one = await newRoom(['가'], { rounds: 7 });
  const few = await host(one, 'start');
  assert.equal(few.status, 409);
  assert.equal(few.body.error, '최소 2명이 있어야 시작할 수 있어요.');
  assert.equal((await post({ action: 'start', code: one.code, hostToken: 'x' })).status, 403);

  await post({ action: 'join', code: one.code, nickname: '나' });
  const ok = await host(one, 'start');
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.room, { code: one.code, status: 'playing', round: 1, rounds: 7 });
  const again = await host(one, 'start');
  assert.equal(again.status, 409);
  assert.equal(again.body.error, '이미 게임이 시작됐어요.');

  const h = (await hostState(one.code, one.hostToken)).body;
  assert.equal(h.lineup.length, 7);
  assert.equal(h.lineup[6].points, 3);
  assert.deepEqual(h.item, h.lineup[0]);
  assert.ok(h.lineup.every((it) => it.kind !== 'mystery' || it.points === null), '상자 점수는 숨김');
  const late = await post({ action: 'join', code: one.code, nickname: '늦은이' });
  assert.equal(late.status, 409);
});

test('시작: 검사와 저장 사이에 다른 요청이 먼저 시작하면 409', async (t) => {
  const room = await newRoom(['가', '나']);
  const original = store.updateRoom;
  store.updateRoom = async (c, patch, where) => {
    await original(c, { status: 'playing' });
    return original(c, patch, where);
  };
  t.after(() => { store.updateRoom = original; });
  const r = await host(room, 'start');
  assert.equal(r.status, 409);
  assert.equal(r.body.error, '이미 게임이 시작됐어요.');
});

test('참가: 최대 15명', async () => {
  const names = Array.from({ length: 15 }, (_, i) => '사람' + i);
  const room = await newRoom(names);
  const full = await post({ action: 'join', code: room.code, nickname: '열여섯' });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, '방 인원이 가득 찼어요.');
});

test('입찰: 검사 — 참가자만, 0~남은 칩 정수, 입찰 중에만, 지난 라운드 거절', async () => {
  const lobbyRoom = await newRoom(['가', '나']);
  const early = await bid(lobbyRoom, 0, 5);
  assert.equal(early.status, 409);
  assert.equal(early.body.error, '지금은 제출할 수 없어요.');

  const room = await started(['가', '나'], [item(1), item(2), item(3)], { chips: 50 });
  assert.equal((await post({ action: 'bid', code: room.code, playerToken: 'x', bid: 1 })).status, 403);
  const tooMuch = await bid(room, 0, 51);
  assert.equal(tooMuch.status, 400);
  assert.equal(tooMuch.body.error, '입찰은 0~50칩 사이 정수로 해 주세요.');
  assert.equal((await bid(room, 0, 2.5)).status, 400);
  assert.equal((await bid(room, 0, '5')).status, 400);
  assert.deepEqual((await bid(room, 0, 50)).body, { ok: true, bid: 50 });
  const stale = await bid(room, 1, 3, { round: 0 });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, '이미 지난 라운드예요.');
  assert.equal((await bid(room, 1, 3, { round: 1 })).status, 200);
});

test('입찰 중 비밀: 진행 화면과 다른 참가자에게는 금액 없이 "냈다"와 "바꾼 횟수"만', async () => {
  const room = await started(['가', '나', '다'], [item(3), item(3)]);
  await bid(room, 0, 37);
  await bid(room, 0, 37); // 같은 금액이면 바꾼 게 아님
  await bid(room, 0, 41);
  await bid(room, 0, 37);
  await bid(room, 1, 12);

  const h = (await hostState(room.code, room.hostToken)).body;
  assert.deepEqual(h.players.map((p) => [p.nickname, p.submitted, p.changes]), [['가', true, 2], ['나', true, 0], ['다', false, 0]]);
  assert.equal(h.submittedCount, 2);
  assert.equal(h.result, null);
  const hostJson = JSON.stringify(h);
  assert.doesNotMatch(hostJson, /"bid"/);
  assert.doesNotMatch(hostJson, /\b(37|41|12)\b/);

  const other = (await playerState(room.code, room.tokens[2])).body;
  const otherJson = JSON.stringify(other);
  assert.doesNotMatch(otherJson, /\b(37|41|12)\b/);
  assert.equal(other.me.bid, null);
  assert.equal(other.result, null);

  const mine = (await playerState(room.code, room.tokens[0])).body;
  assert.equal(mine.me.bid, 37, '내 금액은 내 화면에만');
  assert.equal(mine.me.chips, 100, '공개 전에는 칩이 그대로');
});

test('공개: 진행자만, 판정·칩·점수·기록 반영, 두 번 공개해도 한 번만', async () => {
  const room = await started(['가', '나', '다'], [item(3), item(1)]);
  await bid(room, 0, 30);
  await bid(room, 1, 20);
  assert.equal((await post({ action: 'reveal', code: room.code, hostToken: 'x' })).status, 403);
  const r = await host(room, 'reveal');
  assert.equal(r.status, 200);
  assert.equal(r.body.room.status, 'revealed');
  const twice = await host(room, 'reveal');
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error, '입찰 중인 라운드가 없어요.');

  const h = (await hostState(room.code, room.hostToken)).body;
  assert.equal(h.result.outcome, 'win');
  assert.equal(h.result.round, 1);
  assert.deepEqual(h.result.item, item(3));
  assert.deepEqual(h.result.bids.map((b) => [b.nickname, b.bid, b.submitted]), [['가', 30, true], ['나', 20, true], ['다', 0, false]]);
  assert.deepEqual(h.players.map((p) => [p.chips, p.score, p.submitted]), [[70, 3, false], [80, 0, false], [100, 0, false]]);
  assert.deepEqual(h.ranking.map((x) => [x.nickname, x.rank]), [['가', 1], ['다', 2], ['나', 3]]);
  assert.deepEqual(h.history, [{ round: 1, outcome: 'win', points: 3, names: ['가'] }]);
  assert.ok(h.revealAgeMs >= 0 && h.revealAgeMs < 1000);
  assert.equal(h.submittedCount, 0);
  assert.deepEqual(h.awards, [], '시상식은 끝난 뒤에만');

  const p = (await playerState(room.code, room.tokens[1])).body;
  assert.equal(p.result.bids[0].bid, 30, '공개 뒤에는 모두에게 금액 공개');
  assert.deepEqual([p.me.chips, p.me.score, p.me.rank, p.me.bid], [80, 0, 3, null]);
  assert.ok(p.revealAgeMs >= 0);
  assert.deepEqual(p.awards, []);
});

test('공개: 판정과 저장 사이에 다른 공개가 끼어들면 409, 칩은 한 번만 빠진다', async (t) => {
  const room = await started(['가', '나'], [item(3), item(3)]);
  await bid(room, 0, 10);
  const original = store.updateRoom;
  store.updateRoom = async (c, patch, where) => {
    await original(c, { status: 'revealed' });
    return original(c, patch, where);
  };
  const r = await host(room, 'reveal');
  store.updateRoom = original;
  assert.equal(r.status, 409);
  assert.equal(r.body.error, '이미 결과가 공개됐어요.');
  const players = await store.listPlayers(room.code);
  assert.deepEqual(players.map((p) => p.data), [{}, {}]);
  t.after(() => { store.updateRoom = original; });
});

test('공개 시각: 서버 시계 기준으로 몇 ms 지났는지 알려준다', async (t) => {
  const room = await started(['가', '나'], [item(3), item(3)]);
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  await host(room, 'reveal');
  Date.now.mock.mockImplementation(() => now + 2500);
  assert.equal((await hostState(room.code, room.hostToken)).body.revealAgeMs, 2500);
  Date.now.mock.mockImplementation(() => now - 50);
  assert.equal((await playerState(room.code, room.tokens[0])).body.revealAgeMs, 0, '시계가 거꾸로 가도 0');
});

test('다음 물건: 공개 뒤에만, 한 번만. 판정과 공개 시각을 비운다', async () => {
  const room = await started(['가', '나'], [item(1), item(2), item(3)]);
  const early = await host(room, 'next');
  assert.equal(early.status, 409);
  assert.equal(early.body.error, '결과를 공개한 뒤에 다음 물건으로 넘어갈 수 있어요.');
  assert.equal((await post({ action: 'next', code: room.code, hostToken: 'x' })).status, 403);
  await host(room, 'reveal');
  const ok = await host(room, 'next');
  assert.deepEqual(ok.body.room, { code: room.code, status: 'playing', round: 2, rounds: 3 });
  const h = (await hostState(room.code, room.hostToken)).body;
  assert.equal(h.result, null);
  assert.equal(h.revealAgeMs, null);
  assert.deepEqual(h.item, { round: 2, kind: 'normal', name: 'normal2', points: 2 });
  assert.equal(h.history.length, 1, '지난 결과 요약은 남긴다');
  assert.equal((await bid(room, 0, 5, { round: 1 })).status, 409);
});

test('다음 물건: 검사와 저장 사이에 다른 요청이 먼저 넘기면 409', async (t) => {
  const room = await started(['가', '나'], [item(1), item(3)]);
  await host(room, 'reveal');
  const original = store.updateRoom;
  store.updateRoom = async (c, patch, where) => {
    await original(c, { status: 'playing' });
    return original(c, patch, where);
  };
  t.after(() => { store.updateRoom = original; });
  const r = await host(room, 'next');
  assert.equal(r.status, 409);
  assert.equal(r.body.error, '이미 다음 물건으로 넘어갔어요.');
});

test('끝까지: 마지막 물건을 공개하면 종료, 최종 순위와 시상식', async () => {
  const lineup = [item(1), item(-2, 'cursed'), item(4, 'mystery'), item(3)];
  const room = await started(['가', '나', '다'], lineup, { chips: 50 });
  const round = async (bids) => {
    for (let i = 0; i < bids.length; i++) if (bids[i] !== null) await bid(room, i, bids[i]);
    const r = await host(room, 'reveal');
    assert.equal(r.status, 200);
    return (await hostState(room.code, room.hostToken)).body;
  };

  let h = await round([2, 1, null]); // 가 헐값 낙찰
  assert.equal(h.result.cheap, true);
  await host(room, 'next');
  h = await round([5, 5, 0]); // 저주: 다(0)가 떠안음
  assert.equal(h.result.outcome, 'cursed');
  assert.deepEqual(h.history[1], { round: 2, outcome: 'cursed', points: -2, names: ['다'] });
  await host(room, 'next');
  h = (await hostState(room.code, room.hostToken)).body;
  assert.equal(h.item.points, null, '상자 점수는 공개 전까지 숨김');
  h = await round([10, 10, null]); // 상자: 동점 공중분해
  assert.equal(h.result.outcome, 'tie');
  assert.equal(h.lineup[2].points, 4, '공개하면 상자 점수도 공개');
  assert.equal(h.item.points, 4);
  await host(room, 'next');
  h = await round([33, 34, 48]); // 마지막: 다 낙찰
  assert.equal(h.room.status, 'finished');
  assert.equal(h.result.outcome, 'win', '끝난 뒤에도 마지막 판정을 보여준다');
  assert.ok(h.revealAgeMs >= 0);
  assert.equal((await host(room, 'next')).status, 409);

  assert.deepEqual(h.players.map((p) => [p.nickname, p.chips, p.score]), [['가', 0, 1], ['나', 0, 0], ['다', 2, 1]]);
  assert.deepEqual(h.ranking.map((x) => [x.nickname, x.rank]), [['다', 1], ['가', 2], ['나', 3]]);
  const byId = Object.fromEntries(h.awards.map((a) => [a.id, a.winners]));
  assert.deepEqual(byId, {
    bigspender: ['가', '나'],
    stingy: ['다'],
    wasted: ['가', '나'],
    bargain: ['가'],
    cursed: ['다'],
    allin: ['가', '나'],
    broke: ['가', '나']
  });
  assert.equal(h.awards[0].title, '큰손상');
  assert.equal(h.awards[0].value, 50);
  const p = (await playerState(room.code, room.tokens[2])).body;
  assert.equal(p.me.rank, 1);
  assert.equal(p.awards.length, 7);
});

test('처음부터: 진행자만, 대기실로 돌아가 칩·점수·입찰을 지운다', async () => {
  const room = await started(['가', '나'], [item(3), item(3)]);
  await bid(room, 0, 9);
  await host(room, 'reveal');
  assert.equal((await post({ action: 'restart', code: room.code, hostToken: 'x' })).status, 403);
  const r = await host(room, 'restart');
  assert.deepEqual(r.body.room, { code: room.code, status: 'lobby', round: 0, rounds: 0 });
  const players = await store.listPlayers(room.code);
  assert.deepEqual(players.map((p) => p.data), [{}, {}]);
  assert.deepEqual(await store.listMoves(room.code, 1), []);
  const h = (await hostState(room.code, room.hostToken)).body;
  assert.deepEqual(h.players.map((p) => p.chips), [100, 100]);
  assert.deepEqual(h.history, []);
  assert.equal(h.result, null);
  assert.equal((await post({ action: 'join', code: room.code, nickname: '새사람' })).status, 200, '대기실이라 다시 참가 가능');
});

test('다른 게임 전용 요청은 거절: 소수결 방에 입찰, 경매 방에 투표', async () => {
  const minority = (await post({ action: 'create' })).body;
  const onMinority = await post({ action: 'bid', code: minority.code, bid: 1 });
  assert.equal(onMinority.status, 400);
  assert.equal(onMinority.body.error, '알 수 없는 요청입니다.');
  const auction = await newRoom(['가']);
  const onAuction = await post({ action: 'vote', code: auction.code, playerToken: auction.tokens[0], choice: 'A' });
  assert.equal(onAuction.status, 400);
  assert.equal(onAuction.body.error, '알 수 없는 요청입니다.');
  const reroll = await post({ action: 'reroll', code: auction.code, hostToken: auction.hostToken });
  assert.equal(reroll.status, 400);
});
