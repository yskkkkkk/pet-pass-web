const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryStore, DuplicateError, ROOM_DEFAULTS } = require('../../lib/game/store');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tick = () => new Promise((r) => setTimeout(r, 5));

async function roomWithPlayers(store, code = '1000', names = ['가', '나', '다']) {
  await store.createRoom({ code, host_token: 'h' });
  const players = [];
  for (const n of names) players.push(await store.addPlayer({ room_code: code, nickname: n, token: 't-' + n }));
  return players;
}

test('방 만들기: 기본값(게임 종류·설정·상태 포함), 같은 코드는 중복 오류', async () => {
  const s = createMemoryStore();
  assert.equal(s.mode, 'memory');
  const room = await s.createRoom({ code: '1234', host_token: 'h' });
  assert.equal(room.game, 'minority');
  assert.equal(room.status, 'lobby');
  assert.equal(room.round, 0);
  assert.equal(room.question_id, null);
  assert.deepEqual(room.used_question_ids, []);
  assert.equal(room.last_result, null);
  assert.deepEqual(room.settings, {});
  assert.deepEqual(room.state, {});
  assert.equal(room.created_at, room.updated_at);
  assert.ok(!Number.isNaN(Date.parse(room.created_at)));
  await assert.rejects(s.createRoom({ code: '1234', host_token: 'x' }), DuplicateError);
});

test('방 만들기: 넘긴 값이 기본값보다 우선, 기본값 객체는 방끼리 공유하지 않음', async () => {
  const s = createMemoryStore();
  const a = await s.createRoom({ code: '1', host_token: 'h', game: 'auction', settings: { rounds: 5 } });
  assert.equal(a.game, 'auction');
  assert.deepEqual(a.settings, { rounds: 5 });
  assert.equal(await s.updateRoom('2', {}), null, '없는 방은 갱신 안 됨');
  const b = await s.createRoom({ code: '2', host_token: 'h' });
  b.used_question_ids.push(99);
  b.state.x = 1;
  assert.deepEqual((await s.getRoom('2')).used_question_ids, []);
  assert.deepEqual(ROOM_DEFAULTS.used_question_ids, []);
  assert.deepEqual(ROOM_DEFAULTS.state, {});
});

test('방 만들기: 넘긴 객체를 나중에 고쳐도 저장된 값은 그대로', async () => {
  const s = createMemoryStore();
  const input = { code: '1', host_token: 'h', settings: { rounds: 5 } };
  await s.createRoom(input);
  input.settings.rounds = 99;
  assert.deepEqual((await s.getRoom('1')).settings, { rounds: 5 });
});

test('방 읽기: 복사본을 돌려준다, 없으면 null', async () => {
  const s = createMemoryStore();
  await s.createRoom({ code: '1234', host_token: 'h' });
  const a = await s.getRoom('1234');
  a.status = 'voting';
  a.state.x = 1;
  const again = await s.getRoom('1234');
  assert.equal(again.status, 'lobby');
  assert.deepEqual(again.state, {});
  assert.equal(await s.getRoom('9999'), null);
});

test('방 갱신: 조건(상태 목록, 라운드)이 맞을 때만 바꾸고 updated_at 갱신', async () => {
  const s = createMemoryStore();
  await s.createRoom({ code: '1234', host_token: 'h' });
  assert.equal(await s.updateRoom('9999', { status: 'voting' }), null);
  assert.equal(await s.updateRoom('1234', { status: 'voting' }, { statuses: ['revealed'] }), null);
  assert.equal(await s.updateRoom('1234', { status: 'voting' }, { round: 3 }), null);
  assert.equal((await s.getRoom('1234')).status, 'lobby');

  const before = (await s.getRoom('1234')).updated_at;
  await tick();
  const up = await s.updateRoom('1234', { status: 'voting', round: 1, state: { pot: 3 } }, { statuses: ['lobby'], round: 0 });
  assert.equal(up.status, 'voting');
  assert.equal(up.round, 1);
  assert.deepEqual(up.state, { pot: 3 });
  assert.ok(up.updated_at > before, 'updated_at 갱신');
  up.state.pot = 100;
  assert.deepEqual((await s.getRoom('1234')).state, { pot: 3 }, '돌려준 값을 고쳐도 저장값 그대로');
  assert.ok(await s.updateRoom('1234', { round: 2 }), '조건 없이도 갱신');
});

test('오래된 방 정리: 기준보다 오래된 방만, 그 방의 참가자·표·제출을 함께 지운다', async () => {
  const s = createMemoryStore();
  const [old] = await roomWithPlayers(s, '1000', ['가']);
  await s.upsertVote({ room_code: '1000', round: 1, player_id: old.id, choice: 'A' });
  await s.upsertMove({ room_code: '1000', round: 1, player_id: old.id, payload: {} });
  await tick();
  const cutoff = new Date().toISOString();
  await tick();
  const [fresh] = await roomWithPlayers(s, '2000', ['나']);
  await s.upsertVote({ room_code: '2000', round: 1, player_id: fresh.id, choice: 'B' });
  await s.upsertMove({ room_code: '2000', round: 1, player_id: fresh.id, payload: { n: 1 } });

  await s.deleteRoomsOlderThan(cutoff);
  assert.equal(await s.getRoom('1000'), null);
  assert.deepEqual(await s.listPlayers('1000'), []);
  assert.deepEqual(await s.listVotes('1000', 1), []);
  assert.deepEqual(await s.listMoves('1000', 1), []);
  assert.ok(await s.getRoom('2000'), '최근 방은 남는다');
  assert.equal((await s.listPlayers('2000')).length, 1);
  assert.equal((await s.listVotes('2000', 1)).length, 1);
  assert.equal((await s.listMoves('2000', 1)).length, 1);
});

test('오래된 방 정리: 기준과 정확히 같은 시각은 지우지 않는다', async () => {
  const s = createMemoryStore();
  const room = await s.createRoom({ code: '1000', host_token: 'h' });
  await s.deleteRoomsOlderThan(room.updated_at);
  assert.ok(await s.getRoom('1000'));
});

test('참가자: UUID, 기본값, 같은 방 같은 닉네임은 중복 오류 (다른 방은 가능)', async () => {
  const s = createMemoryStore();
  const [p] = await roomWithPlayers(s, '1000', ['가']);
  assert.match(p.id, UUID);
  assert.equal(p.alive, true);
  assert.equal(p.eliminated_round, null);
  assert.deepEqual(p.data, {});
  assert.ok(!('token' in p), '돌려주는 값에 토큰 없음');
  await assert.rejects(s.addPlayer({ room_code: '1000', nickname: '가', token: 'x' }), DuplicateError);
  await s.createRoom({ code: '2000', host_token: 'h' });
  const other = await s.addPlayer({ room_code: '2000', nickname: '가', token: 'y', data: { chips: 20 } });
  assert.deepEqual(other.data, { chips: 20 });
  assert.notEqual(other.id, p.id);
});

test('참가자 목록: 들어온 순서, 정해진 칸만(토큰 없음), 방별로 분리, 복사본', async () => {
  const s = createMemoryStore();
  await roomWithPlayers(s, '1000', ['다', '가', '나']);
  await roomWithPlayers(s, '2000', ['라']);
  const list = await s.listPlayers('1000');
  assert.deepEqual(list.map((p) => p.nickname), ['다', '가', '나']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['alive', 'data', 'eliminated_round', 'id', 'joined_at', 'nickname']);
  list[0].data.x = 1;
  assert.deepEqual((await s.listPlayers('1000'))[0].data, {});
});

test('토큰으로 참가자 찾기: 방과 토큰이 모두 맞아야 함, data 포함', async () => {
  const s = createMemoryStore();
  await roomWithPlayers(s, '1000', ['가']);
  await roomWithPlayers(s, '2000', ['나']);
  const me = await s.getPlayerByToken('1000', 't-가');
  assert.equal(me.nickname, '가');
  assert.deepEqual(me.data, {});
  assert.ok(!('token' in me));
  assert.equal(await s.getPlayerByToken('1000', 't-나'), null);
  assert.equal(await s.getPlayerByToken('1000', 'nope'), null);
});

test('여러 명 갱신: 지정한 사람·같은 방만, 넘긴 칸만 바뀜', async () => {
  const s = createMemoryStore();
  const [a, b, c] = await roomWithPlayers(s, '1000');
  const [other] = await roomWithPlayers(s, '2000', ['라']);
  const patch = { data: { score: 3 } };
  await s.updatePlayers('1000', [
    { id: a.id, patch },
    { id: b.id, patch: { alive: false, eliminated_round: 2 } },
    { id: other.id, patch: { data: { score: 99 } } },
    { id: 'nobody', patch: { alive: false } }
  ]);
  patch.data.score = 1000;
  const list = await s.listPlayers('1000');
  assert.deepEqual(list[0].data, { score: 3 }, '넘긴 객체를 나중에 고쳐도 그대로');
  assert.equal(list[0].alive, true, '넘기지 않은 칸은 그대로');
  assert.deepEqual([list[1].alive, list[1].eliminated_round], [false, 2]);
  assert.deepEqual(list[2].data, {});
  assert.deepEqual((await s.listPlayers('2000'))[0].data, {}, '다른 방 사람은 그대로');
  await s.updatePlayers('1000', [{ id: c.id }]);
  assert.equal((await s.listPlayers('1000'))[2].alive, true, '바꿀 내용이 없으면 그대로');
});

test('탈락·부활: 지정한 사람만, 같은 방만', async () => {
  const s = createMemoryStore();
  const [a, b] = await roomWithPlayers(s, '1000');
  const [other] = await roomWithPlayers(s, '2000', ['라', '마']);
  await s.eliminatePlayers('1000', [a.id, b.id, other.id], 2);
  const list = await s.listPlayers('1000');
  assert.deepEqual(list.map((p) => [p.alive, p.eliminated_round]), [[false, 2], [false, 2], [true, null]]);
  assert.equal((await s.listPlayers('2000'))[0].alive, true, '다른 방 사람은 그대로');

  await s.eliminatePlayers('2000', [other.id], 1);
  await s.eliminatePlayers('1000', [], 3);
  await s.revivePlayers('1000');
  assert.ok((await s.listPlayers('1000')).every((p) => p.alive && p.eliminated_round === null));
  const otherRoom = await s.listPlayers('2000');
  assert.deepEqual([otherRoom[0].alive, otherRoom[0].eliminated_round], [false, 1], '다른 방은 부활하지 않음');
});

test('내보내기: 그 사람과 그 사람의 표·제출만 지운다, 다른 방 코드로는 지워지지 않음', async () => {
  const s = createMemoryStore();
  const [a, b] = await roomWithPlayers(s, '1000');
  await s.upsertVote({ room_code: '1000', round: 1, player_id: a.id, choice: 'A' });
  await s.upsertVote({ room_code: '1000', round: 1, player_id: b.id, choice: 'B' });
  await s.upsertMove({ room_code: '1000', round: 1, player_id: a.id, payload: { x: 1 } });
  await s.upsertMove({ room_code: '1000', round: 1, player_id: b.id, payload: { x: 2 } });

  await s.deletePlayer('2000', a.id);
  assert.equal((await s.listPlayers('1000')).length, 3);
  assert.equal((await s.listVotes('1000', 1)).length, 2, '잘못된 방 코드면 표도 그대로');
  assert.equal((await s.listMoves('1000', 1)).length, 2);

  await s.deletePlayer('1000', a.id);
  assert.deepEqual((await s.listPlayers('1000')).map((p) => p.nickname), ['나', '다']);
  assert.deepEqual(await s.listVotes('1000', 1), [{ player_id: b.id, choice: 'B' }]);
  assert.deepEqual(await s.listMoves('1000', 1), [{ player_id: b.id, payload: { x: 2 } }]);
  await s.deletePlayer('1000', 'nobody');
});

test('제출: 기본 단계 main, 같은 사람·라운드·단계는 덮어씀, 단계·라운드·방별로 분리', async () => {
  const s = createMemoryStore();
  const [a, b] = await roomWithPlayers(s, '1000');
  const payload = { bid: 10 };
  await s.upsertMove({ room_code: '1000', round: 1, player_id: a.id, payload });
  payload.bid = 999;
  await s.upsertMove({ room_code: '1000', round: 1, player_id: a.id, kind: 'main', payload: { bid: 30 } });
  await s.upsertMove({ room_code: '1000', round: 1, player_id: a.id, kind: 'swap', payload: { swap: true } });
  await s.upsertMove({ room_code: '1000', round: 1, player_id: b.id, payload: { bid: 5 } });
  await s.upsertMove({ room_code: '1000', round: 2, player_id: b.id, payload: { bid: 7 } });
  await s.upsertMove({ room_code: '2000', round: 1, player_id: 'x', payload: { bid: 1 } });

  assert.deepEqual(await s.listMoves('1000', 1), [{ player_id: a.id, payload: { bid: 30 } }, { player_id: b.id, payload: { bid: 5 } }]);
  assert.deepEqual(await s.listMoves('1000', 1, 'main'), await s.listMoves('1000', 1));
  assert.deepEqual(await s.listMoves('1000', 1, 'swap'), [{ player_id: a.id, payload: { swap: true } }]);
  assert.deepEqual(await s.listMoves('1000', 2), [{ player_id: b.id, payload: { bid: 7 } }]);
  assert.deepEqual(await s.listMoves('1000', 3), []);

  const listed = await s.listMoves('1000', 2);
  listed[0].payload.bid = 0;
  assert.deepEqual((await s.listMoves('1000', 2))[0].payload, { bid: 7 }, '복사본');

  await s.deleteMoves('1000', 1);
  assert.deepEqual(await s.listMoves('1000', 1), []);
  assert.deepEqual(await s.listMoves('1000', 1, 'swap'), [], '그 라운드의 모든 단계');
  assert.equal((await s.listMoves('1000', 2)).length, 1);
  await s.deleteMoves('1000');
  assert.deepEqual(await s.listMoves('1000', 2), []);
  assert.equal((await s.listMoves('2000', 1)).length, 1, '다른 방 제출은 그대로');
});

test('표: 같은 사람·라운드는 덮어쓰고, 라운드·방별로 분리, 지우기', async () => {
  const s = createMemoryStore();
  const [a, b] = await roomWithPlayers(s, '1000');
  await s.upsertVote({ room_code: '1000', round: 1, player_id: a.id, choice: 'A' });
  await s.upsertVote({ room_code: '1000', round: 1, player_id: a.id, choice: 'B' });
  await s.upsertVote({ room_code: '1000', round: 2, player_id: b.id, choice: 'A' });
  await s.upsertVote({ room_code: '2000', round: 1, player_id: 'x', choice: 'A' });
  assert.deepEqual(await s.listVotes('1000', 1), [{ player_id: a.id, choice: 'B' }]);
  assert.deepEqual(await s.listVotes('1000', 2), [{ player_id: b.id, choice: 'A' }]);
  await s.deleteVotes('1000', 1);
  assert.deepEqual(await s.listVotes('1000', 1), []);
  assert.equal((await s.listVotes('1000', 2)).length, 1);
  await s.deleteVotes('1000');
  assert.deepEqual(await s.listVotes('1000', 2), []);
  assert.equal((await s.listVotes('2000', 1)).length, 1, '다른 방 표는 그대로');
});

test('검사+참가 joinRoom: 없는 방 → 시작됨 → 가득 참 → 닉네임 중복 순서로 판단, ok면 참가', async () => {
  const store = createMemoryStore();
  assert.equal(await store.joinRoom({ room_code: '9000', nickname: '가', token: 't', max: 2 }), 'missing');
  await store.createRoom({ code: '9000', host_token: 'h' });
  assert.equal(await store.joinRoom({ room_code: '9000', nickname: '가', token: 't1', max: 2 }), 'ok');
  assert.equal(await store.joinRoom({ room_code: '9000', nickname: '가', token: 't2', max: 2 }), 'duplicate');
  assert.equal(await store.joinRoom({ room_code: '9000', nickname: '나', token: 't2', max: 2 }), 'ok');
  assert.equal(await store.joinRoom({ room_code: '9000', nickname: '가', token: 't3', max: 2 }), 'full', '가득 차면 닉네임보다 먼저');
  const me = await store.getPlayerByToken('9000', 't1');
  assert.deepEqual({ ...me, id: undefined, joined_at: undefined }, { id: undefined, nickname: '가', alive: true, eliminated_round: null, joined_at: undefined, data: {} });
  assert.match(me.id, /^[0-9a-f-]{36}$/);
  await store.createRoom({ code: '9001', host_token: 'h' });
  assert.equal(await store.joinRoom({ room_code: '9001', nickname: '가', token: 't9', max: 1 }), 'ok', '다른 방의 사람은 세지 않음');
  await store.updateRoom('9000', { status: 'playing' });
  assert.equal(await store.joinRoom({ room_code: '9000', nickname: '다', token: 't4', max: 9 }), 'started');
  assert.equal((await store.listPlayers('9000')).length, 2);
});

test('검사+저장 submitMove: 받는 상태·라운드·판 번호가 모두 맞을 때만 저장, 같은 칸은 덮어씀', async () => {
  const store = createMemoryStore();
  const base = { room_code: '9100', round: 1, gen: 2, player_id: 'p', kind: 'vote:2', statuses: ['voting'] };
  assert.equal(await store.submitMove({ ...base, payload: {} }), false, '없는 방');
  await store.createRoom({ code: '9100', host_token: 'h', status: 'voting', round: 1, state: { gen: 2 } });
  assert.equal(await store.submitMove({ ...base, payload: { choice: 'A' } }), true);
  assert.equal(await store.submitMove({ ...base, payload: { choice: 'B' } }), true);
  assert.deepEqual(await store.listMoves('9100', 1, 'vote:2'), [{ player_id: 'p', payload: { choice: 'B' } }]);
  assert.equal(await store.submitMove({ ...base, round: 2, payload: {} }), false);
  assert.equal(await store.submitMove({ ...base, gen: 1, payload: {} }), false);
  assert.equal(await store.submitMove({ ...base, statuses: ['playing'], payload: {} }), false);
  const payload = { choice: 'A' };
  await store.updateRoom('9100', { state: {} });
  assert.equal(await store.submitMove({ ...base, gen: 0, kind: 'vote:0', payload }), true, '판 번호 없는 방은 0');
  payload.choice = 'Z';
  assert.deepEqual(await store.listMoves('9100', 1, 'vote:0'), [{ player_id: 'p', payload: { choice: 'A' } }], '저장한 값은 복사본');
  await store.updateRoom('9100', { status: 'closing' });
  assert.equal(await store.submitMove({ ...base, gen: 0, kind: 'vote:0', payload: { choice: 'B' } }), false, '마감 중이면 거절');
  assert.deepEqual(await store.listMoves('9100', 1, 'vote:0'), [{ player_id: 'p', payload: { choice: 'A' } }]);
  await store.deleteRoomsOlderThan(new Date(Date.now() + 1000).toISOString());
  assert.deepEqual(await store.listMoves('9100', 1, 'vote:0'), [], '방을 지우면 제출도');
});
