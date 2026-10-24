/**
 * 서버 공통 도구: 설정, 라운드(제출·조건부 마감), 점수판, 시상식
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpError } = require('../../lib/game/core');
const { defaultsOf, applySettings } = require('../../lib/game/settings');
const { requirePlayer, submitMove, transition } = require('../../lib/game/round');
const { rankPlayers } = require('../../lib/game/scoreboard');
const { pickAwards, bumpStat } = require('../../lib/game/awards');
const { createMemoryStore } = require('../../lib/game/store');

const SCHEMA = [
  { key: 'rounds', label: '라운드 수', type: 'int', min: 3, max: 20, default: 10 },
  { key: 'wild', label: '1 만능', type: 'bool', default: false },
  { key: 'mode', label: '규칙', type: 'choice', options: [{ value: 'basic', label: '기본' }, { value: 'hard', label: '어려움' }], default: 'basic' }
];

const isHttp = (status, re) => (e) => e instanceof HttpError && e.status === status && (!re || re.test(e.message));

/* ───────── 설정 ───────── */

test('설정 기본값', () => {
  assert.deepEqual(defaultsOf(SCHEMA), { rounds: 10, wild: false, mode: 'basic' });
  assert.deepEqual(defaultsOf([]), {});
  assert.deepEqual(defaultsOf(), {});
});

test('설정 바꾸기: 정의된 값만, 나머지는 현재값·기본값 유지, 원본 불변', () => {
  const current = { rounds: 7 };
  const next = applySettings(SCHEMA, current, { wild: true });
  assert.deepEqual(next, { rounds: 7, wild: true, mode: 'basic' });
  assert.deepEqual(current, { rounds: 7 });
  assert.deepEqual(applySettings(SCHEMA, undefined, {}), defaultsOf(SCHEMA));
  assert.deepEqual(applySettings(SCHEMA, {}, { mode: 'hard', rounds: 3 }), { rounds: 3, wild: false, mode: 'hard' });
  assert.deepEqual(applySettings(SCHEMA, {}, { rounds: 20 }).rounds, 20);
  assert.deepEqual(applySettings(undefined, undefined, {}), {});
});

test('설정 바꾸기: 정수 범위·정수 여부 검사', () => {
  for (const bad of [2, 21, 3.5, '5', null, NaN]) {
    assert.throws(() => applySettings(SCHEMA, {}, { rounds: bad }), isHttp(400, /라운드 수은\(는\) 3~20 사이 정수/), String(bad));
  }
});

test('설정 바꾸기: 참/거짓, 선택지 검사', () => {
  assert.throws(() => applySettings(SCHEMA, {}, { wild: 'yes' }), isHttp(400, /1 만능 값이 올바르지 않아요/));
  assert.throws(() => applySettings(SCHEMA, {}, { wild: 1 }), isHttp(400));
  assert.throws(() => applySettings(SCHEMA, {}, { mode: 'nope' }), isHttp(400, /규칙 값이 올바르지 않아요/));
});

test('설정 바꾸기: 정의에 없는 키, 객체가 아닌 값은 거절', () => {
  assert.throws(() => applySettings(SCHEMA, {}, { hack: 1 }), isHttp(400, /알 수 없는 설정이에요: hack/));
  for (const bad of [null, [], 'x', 3, undefined]) {
    if (bad === undefined) continue;
    assert.throws(() => applySettings(SCHEMA, {}, bad), isHttp(400, /설정 형식이 올바르지 않아요/), JSON.stringify(bad));
  }
});

test('설정 정의 자체가 잘못되면(알 수 없는 종류) 개발 오류', () => {
  assert.throws(() => applySettings([{ key: 'x', label: 'x', type: 'weird' }], {}, { x: 1 }), (e) => !(e instanceof HttpError) && /알 수 없는 설정 종류: weird/.test(e.message));
});

/* ───────── 라운드 ───────── */

async function setup({ status = 'playing', round = 1, alive = true } = {}) {
  const store = createMemoryStore();
  await store.createRoom({ code: '1000', host_token: 'h', status, round });
  const me = await store.addPlayer({ room_code: '1000', nickname: '가', token: 't' });
  if (!alive) await store.eliminatePlayers('1000', [me.id], 1);
  const room = await store.getRoom('1000');
  const ctx = (body) => ({ store, room, body });
  return { store, room, me, ctx };
}

test('참가자 확인: 토큰이 맞으면 참가자, 없거나 틀리면 403', async () => {
  const { ctx, me } = await setup();
  assert.equal((await requirePlayer(ctx({ playerToken: 't' }))).id, me.id);
  await assert.rejects(requirePlayer(ctx({})), isHttp(403, /참가자 정보를 찾을 수 없어요/));
  await assert.rejects(requirePlayer(ctx({ playerToken: 'x' })), isHttp(403));
});

test('제출: 저장되고 같은 단계는 덮어씀, 기본 단계 main', async () => {
  const { store, ctx, me } = await setup();
  const r = await submitMove(ctx({ playerToken: 't' }), { payload: { bid: 3 } });
  assert.equal(r.me.id, me.id);
  await submitMove(ctx({ playerToken: 't', round: 1 }), { payload: { bid: 5 } });
  await submitMove(ctx({ playerToken: 't', round: '1' }), { kind: 'swap', payload: { swap: true } });
  assert.deepEqual(await store.listMoves('1000', 1), [{ player_id: me.id, payload: { bid: 5 } }]);
  assert.deepEqual(await store.listMoves('1000', 1, 'swap'), [{ player_id: me.id, payload: { swap: true } }]);
});

test('제출: 상태가 맞지 않으면 409, 받을 상태를 바꿀 수 있음', async () => {
  const { ctx } = await setup({ status: 'lobby' });
  await assert.rejects(submitMove(ctx({ playerToken: 't' }), { payload: {} }), isHttp(409, /지금은 제출할 수 없어요/));
  await submitMove(ctx({ playerToken: 't' }), { payload: {}, statuses: ['lobby'] });
});

test('제출: 지난 라운드 번호면 409', async () => {
  const { ctx, store } = await setup({ round: 3 });
  await assert.rejects(submitMove(ctx({ playerToken: 't', round: 2 }), { payload: {} }), isHttp(409, /이미 지난 라운드/));
  assert.deepEqual(await store.listMoves('1000', 3), []);
});

test('제출: 탈락자는 409, allowOut이면 가능', async () => {
  const { ctx, store, me } = await setup({ alive: false });
  await assert.rejects(submitMove(ctx({ playerToken: 't' }), { payload: {} }), isHttp(409, /탈락해서 참여할 수 없어요/));
  await submitMove(ctx({ playerToken: 't' }), { payload: { ok: 1 }, allowOut: true });
  assert.deepEqual(await store.listMoves('1000', 1), [{ player_id: me.id, payload: { ok: 1 } }]);
});

test('조건부 마감: 상태·라운드가 맞을 때만, ctx.room을 새 값으로 바꿈', async () => {
  const { ctx } = await setup({ status: 'playing', round: 2 });
  const c = ctx({});
  const up = await transition(c, { status: 'revealed' }, ['playing'], '이미 공개됐어요.');
  assert.equal(up.status, 'revealed');
  assert.equal(c.room.status, 'revealed');
  await assert.rejects(transition(c, { status: 'revealed' }, ['playing'], '이미 공개됐어요.'), isHttp(409, /이미 공개됐어요/));
});

test('조건부 마감: 라운드가 바뀌었으면 409 (다음 라운드가 이미 시작된 경우)', async () => {
  const { store, ctx } = await setup({ status: 'playing', round: 2 });
  const c = ctx({});
  await store.updateRoom('1000', { round: 3 });
  await assert.rejects(transition(c, { status: 'revealed' }, ['playing'], '라운드가 바뀌었어요.'), isHttp(409, /라운드가 바뀌었어요/));
  assert.equal(c.room.round, 2, '실패하면 ctx.room은 그대로');
});

test('조건부 마감: 동시에 두 번 → 한 번만 성공', async () => {
  const { ctx } = await setup();
  const results = await Promise.allSettled([
    transition(ctx({}), { status: 'revealed' }, ['playing'], '중복'),
    transition(ctx({}), { status: 'revealed' }, ['playing'], '중복')
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
});

/* ───────── 점수판 ───────── */

test('순위: 점수 높은 순, 동점은 같은 순위, 다음 순위는 건너뜀', () => {
  const players = [
    { nickname: '가', s: 3 }, { nickname: '나', s: 7 }, { nickname: '다', s: 3 }, { nickname: '라', s: 1 }, { nickname: '마', s: 7 }
  ];
  const ranked = rankPlayers(players, { score: (p) => p.s });
  assert.deepEqual(ranked.map((r) => [r.nickname, r.score, r.rank]), [
    ['나', 7, 1], ['마', 7, 1], ['가', 3, 3], ['다', 3, 3], ['라', 1, 5]
  ]);
  assert.ok(!('_tb' in ranked[0]), '내부 값은 내보내지 않음');
  assert.equal(players[0].rank, undefined, '원본 불변');
});

test('순위: 동점 처리 기준이 있으면 그걸로 가른다', () => {
  const players = [{ n: 'a', s: 5, c: 10 }, { n: 'b', s: 5, c: 30 }, { n: 'c', s: 5, c: 30 }, { n: 'd', s: 9, c: 0 }];
  const ranked = rankPlayers(players, { score: (p) => p.s, tiebreak: (p) => p.c });
  assert.deepEqual(ranked.map((r) => [r.n, r.rank]), [['d', 1], ['b', 2], ['c', 2], ['a', 4]]);
});

test('순위: 음수 점수, 빈 목록, 한 명', () => {
  assert.deepEqual(rankPlayers([], { score: () => 0 }), []);
  assert.deepEqual(rankPlayers([{ n: 'a' }], { score: () => -2 }).map((r) => [r.score, r.rank]), [[-2, 1]]);
  const r = rankPlayers([{ n: 'a', s: -1 }, { n: 'b', s: 0 }], { score: (p) => p.s });
  assert.deepEqual(r.map((x) => x.n), ['b', 'a']);
});

/* ───────── 시상식 ───────── */

const DEFS = [
  { id: 'chicken', title: '쫄보상', desc: '가장 많이 포기', stat: 'fold' },
  { id: 'traitor', title: '통수왕', desc: '가장 많이 배신', stat: 'betray', min: 2 },
  { id: 'none', title: '아무도 안 받는 상', desc: '', stat: 'nothing' }
];

test('시상식: 최고 기록자가 받고, 동점이면 함께, 기준 미만·0이면 상 없음', () => {
  const players = [
    { nickname: '가', data: { stats: { fold: 3, betray: 1 } } },
    { nickname: '나', data: { stats: { fold: 3, betray: 2 } } },
    { nickname: '다', data: { stats: { fold: 1 } } },
    { nickname: '라', data: {} },
    { nickname: '마' }
  ];
  assert.deepEqual(pickAwards(players, DEFS), [
    { id: 'chicken', title: '쫄보상', desc: '가장 많이 포기', value: 3, winners: ['가', '나'] },
    { id: 'traitor', title: '통수왕', desc: '가장 많이 배신', value: 2, winners: ['나'] }
  ]);
});

test('시상식: min 기준에 못 미치면 상 없음, min 0이면 기록 0인 사람도 받을 수 있음', () => {
  const players = [{ nickname: '가', data: { stats: { betray: 1 } } }];
  assert.deepEqual(pickAwards(players, [DEFS[1]]), []);
  assert.deepEqual(pickAwards(players, [{ id: 'z', title: 'z', desc: '', stat: 'zero', min: 0 }])[0].winners, ['가']);
  assert.deepEqual(pickAwards([], DEFS), []);
});

test('기록 올리기: 새 객체, 없던 기록은 0부터, 다른 값 보존', () => {
  const data = { chips: 5, stats: { fold: 2 } };
  const next = bumpStat(data, 'fold');
  assert.deepEqual(next, { chips: 5, stats: { fold: 3 } });
  assert.deepEqual(data, { chips: 5, stats: { fold: 2 } }, '원본 불변');
  assert.deepEqual(bumpStat(next, 'betray', 4), { chips: 5, stats: { fold: 3, betray: 4 } });
  assert.deepEqual(bumpStat(undefined, 'x'), { stats: { x: 1 } });
  assert.deepEqual(bumpStat({ stats: { x: 'bad' } }, 'x'), { stats: { x: 1 } });
});
