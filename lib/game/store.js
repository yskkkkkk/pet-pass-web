/**
 * 미니게임 저장소 (같이 하는 게임 공통)
 *
 * - Supabase 모드: SUPABASE_URL + SUPABASE_SECRET_KEY가 있으면 사용 (운영).
 *   게임 테이블은 RLS를 켜고 정책을 두지 않으므로, 서버(secret key)만 접근할 수 있다.
 * - 메모리 모드: 로컬 개발/테스트용. 서버리스 환경에서는 인스턴스마다 상태가 갈라지므로 쓰지 않는다.
 *
 * 두 모드 모두 같은 인터페이스를 제공한다. (테이블 구조는 supabase_game_schema.sql)
 *
 *   방      createRoom, getRoom, updateRoom(조건부), deleteRoomsOlderThan
 *   참가자  addPlayer, listPlayers, getPlayerByToken, updatePlayers, deletePlayer,
 *           eliminatePlayers, revivePlayers (소수결용)
 *   제출    upsertMove, listMoves, deleteMoves — 라운드별 제출. kind로 한 라운드 안의 단계를 나눈다
 *   표      upsertVote, listVotes, deleteVotes — 소수결 전용 (A/B)
 */
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

class DuplicateError extends Error {}

const ROOM_DEFAULTS = { game: 'minority', status: 'lobby', round: 0, question_id: null, used_question_ids: [], last_result: null, settings: {}, state: {} };
const DEFAULT_KIND = 'main';

/* ───────────── Supabase ───────────── */
// Stryker disable all: 실제 Supabase가 있어야 확인할 수 있어 단위·뮤테이션 테스트 대상에서 뺀다 (메모리 저장소와 같은 동작을 실서버에서 확인)

const PLAYER_FIELDS = 'id, nickname, alive, eliminated_round, joined_at, data';

function createSupabaseStore(url, key) {
  const db = createClient(url, key, { auth: { persistSession: false } });

  function check(error) {
    if (!error) return;
    if (error.code === '23505') throw new DuplicateError(error.message);
    throw new Error(error.message || 'DB 오류');
  }

  return {
    mode: 'supabase',

    async createRoom(room) {
      const { data, error } = await db.from('game_rooms').insert(room).select().single();
      check(error);
      return data;
    },

    async getRoom(code) {
      const { data, error } = await db.from('game_rooms').select('*').eq('code', code).maybeSingle();
      check(error);
      return data;
    },

    /** where 조건이 맞을 때만 갱신 (중복 클릭/경쟁 상태 방지). 갱신된 row 또는 null */
    async updateRoom(code, patch, where = {}) {
      let q = db.from('game_rooms')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('code', code);
      if (where.statuses) q = q.in('status', where.statuses);
      if (where.round !== undefined) q = q.eq('round', where.round);
      const { data, error } = await q.select();
      check(error);
      return data && data.length > 0 ? data[0] : null;
    },

    async deleteRoomsOlderThan(isoDate) {
      const { error } = await db.from('game_rooms').delete().lt('updated_at', isoDate);
      check(error);
    },

    async addPlayer(player) {
      const { data, error } = await db.from('game_players').insert(player).select(PLAYER_FIELDS).single();
      check(error);
      return data;
    },

    async listPlayers(roomCode) {
      const { data, error } = await db.from('game_players')
        .select(PLAYER_FIELDS)
        .eq('room_code', roomCode)
        .order('joined_at', { ascending: true });
      check(error);
      return data || [];
    },

    async getPlayerByToken(roomCode, token) {
      const { data, error } = await db.from('game_players')
        .select(PLAYER_FIELDS)
        .eq('room_code', roomCode)
        .eq('token', token)
        .maybeSingle();
      check(error);
      return data;
    },

    /** updates: [{ id, patch: { alive?, eliminated_round?, data? } }] */
    async updatePlayers(roomCode, updates) {
      const results = await Promise.all(updates.map((u) => db.from('game_players')
        .update(u.patch)
        .eq('room_code', roomCode)
        .eq('id', u.id)));
      for (const r of results) check(r.error);
    },

    async eliminatePlayers(roomCode, ids, round) {
      if (ids.length === 0) return;
      const { error } = await db.from('game_players')
        .update({ alive: false, eliminated_round: round })
        .eq('room_code', roomCode)
        .in('id', ids);
      check(error);
    },

    async revivePlayers(roomCode) {
      const { error } = await db.from('game_players')
        .update({ alive: true, eliminated_round: null })
        .eq('room_code', roomCode);
      check(error);
    },

    async deletePlayer(roomCode, id) {
      const { error } = await db.from('game_players').delete().eq('room_code', roomCode).eq('id', id);
      check(error);
    },

    async upsertMove(move) {
      const { error } = await db.from('game_moves')
        .upsert({ kind: DEFAULT_KIND, ...move, updated_at: new Date().toISOString() }, { onConflict: 'room_code,round,player_id,kind' });
      check(error);
    },

    async listMoves(roomCode, round, kind = DEFAULT_KIND) {
      const { data, error } = await db.from('game_moves')
        .select('player_id, payload')
        .eq('room_code', roomCode)
        .eq('round', round)
        .eq('kind', kind);
      check(error);
      return data || [];
    },

    async deleteMoves(roomCode, round) {
      let q = db.from('game_moves').delete().eq('room_code', roomCode);
      if (round !== undefined) q = q.eq('round', round);
      const { error } = await q;
      check(error);
    },

    async upsertVote(vote) {
      const { error } = await db.from('game_votes')
        .upsert(vote, { onConflict: 'room_code,round,player_id' });
      check(error);
    },

    async listVotes(roomCode, round) {
      const { data, error } = await db.from('game_votes')
        .select('player_id, choice')
        .eq('room_code', roomCode)
        .eq('round', round);
      check(error);
      return data || [];
    },

    async deleteVotes(roomCode, round) {
      let q = db.from('game_votes').delete().eq('room_code', roomCode);
      if (round !== undefined) q = q.eq('round', round);
      const { error } = await q;
      check(error);
    }
  };
}

// Stryker restore all

/* ───────────── 메모리 (로컬 개발·테스트용) ───────────── */

function createMemoryStore() {
  const rooms = new Map();   // code -> room
  const players = new Map(); // id -> player (Map은 넣은 순서를 지키므로 목록은 들어온 순서)
  const votes = new Map();   // `${code}:${round}:${playerId}` -> vote
  const moves = new Map();   // `${code}:${round}:${playerId}:${kind}` -> move
  const clone = (o) => (o === undefined ? o : JSON.parse(JSON.stringify(o)));

  function publicPlayer(p) {
    return { id: p.id, nickname: p.nickname, alive: p.alive, eliminated_round: p.eliminated_round, joined_at: p.joined_at, data: clone(p.data) };
  }

  function removeWhere(map, test) {
    for (const [k, v] of map) if (test(v)) map.delete(k);
  }

  return {
    mode: 'memory',

    async createRoom(room) {
      if (rooms.has(room.code)) throw new DuplicateError();
      const now = new Date().toISOString();
      const row = { ...clone(ROOM_DEFAULTS), created_at: now, updated_at: now, ...clone(room) };
      rooms.set(room.code, row);
      return clone(row);
    },

    async getRoom(code) {
      return rooms.has(code) ? clone(rooms.get(code)) : null;
    },

    async updateRoom(code, patch, where = {}) {
      const room = rooms.get(code);
      if (!room) return null;
      if (where.statuses && !where.statuses.includes(room.status)) return null;
      if (where.round !== undefined && room.round !== where.round) return null;
      Object.assign(room, clone(patch), { updated_at: new Date().toISOString() });
      return clone(room);
    },

    async deleteRoomsOlderThan(isoDate) {
      for (const [code, room] of rooms) {
        if (room.updated_at < isoDate) {
          rooms.delete(code);
          removeWhere(players, (p) => p.room_code === code);
          removeWhere(votes, (v) => v.room_code === code);
          removeWhere(moves, (m) => m.room_code === code);
        }
      }
    },

    async addPlayer(player) {
      for (const p of players.values()) {
        if (p.room_code === player.room_code && p.nickname === player.nickname) throw new DuplicateError();
      }
      const row = {
        id: crypto.randomUUID(),
        alive: true,
        eliminated_round: null,
        joined_at: new Date().toISOString(),
        data: {},
        ...clone(player)
      };
      players.set(row.id, row);
      return publicPlayer(row);
    },

    async listPlayers(roomCode) {
      const list = [];
      for (const p of players.values()) if (p.room_code === roomCode) list.push(publicPlayer(p));
      return list;
    },

    async getPlayerByToken(roomCode, token) {
      for (const p of players.values()) {
        if (p.room_code === roomCode && p.token === token) return publicPlayer(p);
      }
      return null;
    },

    async updatePlayers(roomCode, updates) {
      for (const u of updates) {
        const p = players.get(u.id);
        if (p && p.room_code === roomCode) Object.assign(p, clone(u.patch));
      }
    },

    async eliminatePlayers(roomCode, ids, round) {
      for (const id of ids) {
        const p = players.get(id);
        if (p && p.room_code === roomCode) Object.assign(p, { alive: false, eliminated_round: round });
      }
    },

    async revivePlayers(roomCode) {
      for (const p of players.values()) {
        if (p.room_code === roomCode) Object.assign(p, { alive: true, eliminated_round: null });
      }
    },

    async deletePlayer(roomCode, id) {
      const p = players.get(id);
      if (!p || p.room_code !== roomCode) return;
      players.delete(id);
      removeWhere(votes, (v) => v.player_id === id);
      removeWhere(moves, (m) => m.player_id === id);
    },

    async upsertMove(move) {
      const row = { kind: DEFAULT_KIND, ...clone(move) };
      moves.set(`${row.room_code}:${row.round}:${row.player_id}:${row.kind}`, row);
    },

    async listMoves(roomCode, round, kind = DEFAULT_KIND) {
      const list = [];
      for (const m of moves.values()) {
        if (m.room_code === roomCode && m.round === round && m.kind === kind) list.push({ player_id: m.player_id, payload: clone(m.payload) });
      }
      return list;
    },

    async deleteMoves(roomCode, round) {
      removeWhere(moves, (m) => m.room_code === roomCode && (round === undefined || m.round === round));
    },

    async upsertVote(vote) {
      votes.set(`${vote.room_code}:${vote.round}:${vote.player_id}`, { ...vote });
    },

    async listVotes(roomCode, round) {
      const list = [];
      for (const v of votes.values()) {
        if (v.room_code === roomCode && v.round === round) list.push({ player_id: v.player_id, choice: v.choice });
      }
      return list;
    },

    async deleteVotes(roomCode, round) {
      removeWhere(votes, (v) => v.room_code === roomCode && (round === undefined || v.round === round));
    }
  };
}

/* ───────────── 선택 ───────────── */

let cached = null;

/**
 * @returns {object|null} 사용할 수 있는 저장소가 없으면 null
 */
function getStore() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const forceMemory = process.env.GAME_STORE === 'memory';

  if (!forceMemory && url && key) {
    cached = createSupabaseStore(url, key);
  } else if (!process.env.VERCEL) {
    // Stryker disable next-line all: 로그
    console.warn('[minigame] Supabase 설정이 없어 메모리 저장소로 동작합니다 (로컬 전용).');
    cached = createMemoryStore();
  }
  return cached;
}

module.exports = { getStore, DuplicateError, createMemoryStore, createSupabaseStore, ROOM_DEFAULTS };
