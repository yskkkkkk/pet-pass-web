/**
 * supabase_game_schema.sql 검증 (실제 Postgres 엔진: PGlite) — npm run test:sql
 *
 * 운영 DB에 실행하는 순서 그대로 확인한다.
 *  1. 예전 스키마(fixtures)로 만든 DB에 데이터를 넣고
 *  2. 지금 스키마를 두 번 실행해도 오류가 없고
 *  3. 기존 데이터가 그대로이며, 새 칸·테이블·제약이 맞게 생기는지
 * 스키마를 바꿀 때 운영 DB를 깨뜨리지 않는지 미리 알 수 있다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const OLD = fs.readFileSync(new URL('test/sql/fixtures/schema-2026-10-01.sql', root), 'utf8');
const NOW = fs.readFileSync(new URL('supabase_game_schema.sql', root), 'utf8');

async function upgradedDb() {
  const db = new PGlite();
  await db.exec(OLD);
  await db.exec(`INSERT INTO game_rooms (code, host_token, status, round) VALUES ('1234', 'h', 'voting', 2);`);
  const { rows: [p] } = await db.query(`INSERT INTO game_players (room_code, nickname, token) VALUES ('1234', '가', 't') RETURNING id`);
  await db.query(`INSERT INTO game_votes (room_code, round, player_id, choice) VALUES ('1234', 2, $1, 'A')`, [p.id]);
  await db.exec(NOW);
  await db.exec(NOW); // 두 번 실행해도 안전해야 한다
  return { db, playerId: p.id };
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

test('예전 DB에 두 번 실행: 기존 방·참가자·표 유지, 새 칸에 기본값', async () => {
  const { db, playerId } = await upgradedDb();
  const room = await one(db, `SELECT * FROM game_rooms WHERE code = '1234'`);
  assert.equal(room.status, 'voting');
  assert.equal(room.round, 2);
  assert.equal(room.game, 'minority');
  assert.deepEqual(room.settings, {});
  assert.deepEqual(room.state, {});
  const player = await one(db, `SELECT * FROM game_players WHERE id = $1`, [playerId]);
  assert.equal(player.nickname, '가');
  assert.deepEqual(player.data, {});
  assert.equal((await one(db, `SELECT count(*)::int AS n FROM game_votes`)).n, 1);
});

test('방 상태: playing 허용, 모르는 상태는 거절, 제약은 하나만', async () => {
  const { db } = await upgradedDb();
  await db.query(`UPDATE game_rooms SET status = 'playing' WHERE code = '1234'`);
  await assert.rejects(db.query(`UPDATE game_rooms SET status = 'weird' WHERE code = '1234'`), /game_rooms_status_check/);
  assert.equal((await one(db, `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'game_rooms_status_check'`)).n, 1);
});

test('제출: 같은 사람·라운드·단계는 하나, 단계가 다르면 따로, kind 기본값 main', async () => {
  const { db, playerId } = await upgradedDb();
  await db.query(`INSERT INTO game_moves (room_code, round, player_id, payload) VALUES ('1234', 1, $1, '{"bid": 30}')`, [playerId]);
  await db.query(`INSERT INTO game_moves (room_code, round, player_id, kind, payload) VALUES ('1234', 1, $1, 'swap', '{}')`, [playerId]);
  await assert.rejects(db.query(`INSERT INTO game_moves (room_code, round, player_id, payload) VALUES ('1234', 1, $1, '{}')`, [playerId]), /duplicate key/);
  const rows = (await db.query(`SELECT kind, payload FROM game_moves ORDER BY kind`)).rows;
  assert.deepEqual(rows, [{ kind: 'main', payload: { bid: 30 } }, { kind: 'swap', payload: {} }]);
});

test('삭제: 참가자를 지우면 제출도, 방을 지우면 모두 지워진다', async () => {
  const { db, playerId } = await upgradedDb();
  await db.query(`INSERT INTO game_moves (room_code, round, player_id) VALUES ('1234', 1, $1)`, [playerId]);
  await db.query(`DELETE FROM game_players WHERE id = $1`, [playerId]);
  assert.equal((await one(db, `SELECT count(*)::int AS n FROM game_moves`)).n, 0);
  await db.query(`DELETE FROM game_rooms WHERE code = '1234'`);
  const left = await one(db, `SELECT (SELECT count(*) FROM game_players) + (SELECT count(*) FROM game_votes) + (SELECT count(*) FROM game_moves) AS n`);
  assert.equal(Number(left.n), 0);
});

test('모든 게임 테이블에 RLS가 켜져 있다 (secret 키로만 접근)', async () => {
  const { db } = await upgradedDb();
  const rows = (await db.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'game_%' AND relkind = 'r' ORDER BY relname`)).rows;
  assert.deepEqual(rows.map((r) => r.relname), ['game_moves', 'game_players', 'game_rooms', 'game_votes']);
  assert.ok(rows.every((r) => r.relrowsecurity));
});

test('빈 DB에 처음 설치: 두 번 실행해도 되고 모든 칸이 있다', async () => {
  const db = new PGlite();
  await db.exec(NOW);
  await db.exec(NOW);
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'game_rooms'`)).rows.map((r) => r.column_name);
  for (const c of ['code', 'host_token', 'game', 'settings', 'state', 'status', 'round', 'question_id', 'used_question_ids', 'last_result']) {
    assert.ok(cols.includes(c), c);
  }
});

/* ───────── 검사와 저장을 한 번에 하는 함수 (#125, #127) ───────── */

async function freshDb() {
  const db = new PGlite();
  await db.exec(NOW);
  await db.exec(`INSERT INTO game_rooms (code, host_token, status, round, state) VALUES ('5555', 'h', 'voting', 1, '{"gen": 2}')`);
  const { rows: [p] } = await db.query(`INSERT INTO game_players (room_code, nickname, token) VALUES ('5555', '가', 't') RETURNING id`);
  return { db, playerId: p.id };
}

const submit = (db, playerId, { round = 1, gen = 2, kind = 'vote:2', payload = { choice: 'A' }, statuses = ['voting'] } = {}) =>
  one(db, `SELECT game_submit_move('5555', $1, $2, $3, $4, $5, $6) AS ok`, [round, gen, playerId, kind, payload, statuses]);

test('제출 함수: 받을 수 있는 상태·라운드·판 번호일 때만 저장, 같은 칸은 덮어씀', async () => {
  const { db, playerId } = await freshDb();
  assert.equal((await submit(db, playerId)).ok, true);
  assert.equal((await submit(db, playerId, { payload: { choice: 'B' } })).ok, true);
  assert.deepEqual((await db.query(`SELECT kind, payload FROM game_moves`)).rows, [{ kind: 'vote:2', payload: { choice: 'B' } }]);
  assert.equal((await submit(db, playerId, { round: 2 })).ok, false, '지난 라운드');
  assert.equal((await submit(db, playerId, { gen: 1 })).ok, false, '지난 판');
  assert.equal((await submit(db, playerId, { statuses: ['playing'] })).ok, false, '받지 않는 상태');
  await db.exec(`UPDATE game_rooms SET status = 'closing' WHERE code = '5555'`);
  assert.equal((await submit(db, playerId, { payload: { choice: 'A' } })).ok, false, '마감 중이면 거절');
  assert.deepEqual((await db.query(`SELECT payload FROM game_moves`)).rows, [{ payload: { choice: 'B' } }], '거절된 제출은 저장되지 않음');
  assert.equal((await one(db, `SELECT game_submit_move('0000', 1, 0, $1, 'x', '{}', ARRAY['voting']) AS ok`, [playerId])).ok, false, '없는 방');
});

test('제출 함수: 판 번호가 없는 방(state에 gen 없음)은 0으로 본다', async () => {
  const { db, playerId } = await freshDb();
  await db.exec(`UPDATE game_rooms SET state = '{}' WHERE code = '5555'`);
  assert.equal((await submit(db, playerId, { gen: 0, kind: 'vote:0' })).ok, true);
});

test('참가 함수: 대기실이고 자리가 남을 때만, 결과를 이름으로 돌려준다', async () => {
  const { db } = await freshDb();
  await db.exec(`INSERT INTO game_rooms (code, host_token) VALUES ('6666', 'h')`);
  const join = async (nick, max = 2) => (await one(db, `SELECT game_join('6666', $1, $2, $3) AS r`, [nick, 't-' + nick, max])).r;
  assert.equal(await join('가'), 'ok');
  assert.equal(await join('가'), 'duplicate');
  assert.equal(await join('나'), 'ok');
  assert.equal(await join('다'), 'full');
  assert.equal(await join('다', 3), 'ok');
  await db.exec(`UPDATE game_rooms SET status = 'playing' WHERE code = '6666'`);
  assert.equal(await join('라', 10), 'started');
  assert.equal((await one(db, `SELECT game_join('0000', 'x', 't', 5) AS r`)).r, 'missing');
  assert.deepEqual((await db.query(`SELECT nickname FROM game_players WHERE room_code = '6666' ORDER BY joined_at, nickname`)).rows.map((r) => r.nickname), ['가', '나', '다']);
});

test('방 상태 closing(마감 중)을 쓸 수 있다', async () => {
  const { db } = await freshDb();
  await db.exec(`UPDATE game_rooms SET status = 'closing' WHERE code = '5555'`);
  assert.equal((await one(db, `SELECT status FROM game_rooms WHERE code = '5555'`)).status, 'closing');
});
