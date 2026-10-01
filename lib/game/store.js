/**
 * 소수결 게임 저장소
 *
 * - Supabase 모드: SUPABASE_URL + SUPABASE_SECRET_KEY가 있으면 사용 (운영).
 *   게임 테이블은 RLS를 켜고 정책을 두지 않으므로, 서버(secret key)만 접근할 수 있다.
 * - 메모리 모드: 로컬 개발/테스트용. 서버리스 환경에서는 인스턴스마다 상태가 갈라지므로 쓰지 않는다.
 *
 * 두 모드 모두 같은 인터페이스를 제공한다.
 */
const { createClient } = require('@supabase/supabase-js');

class DuplicateError extends Error {}

/* ───────────── Supabase ───────────── */

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
      const { data, error } = await db.from('game_players').insert(player).select().single();
      check(error);
      return data;
    },

    async listPlayers(roomCode) {
      const { data, error } = await db.from('game_players')
        .select('id, nickname, alive, eliminated_round, joined_at')
        .eq('room_code', roomCode)
        .order('joined_at', { ascending: true });
      check(error);
      return data || [];
    },

    async getPlayerByToken(roomCode, token) {
      const { data, error } = await db.from('game_players')
        .select('id, nickname, alive, eliminated_round')
        .eq('room_code', roomCode)
        .eq('token', token)
        .maybeSingle();
      check(error);
      return data;
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

/* ───────────── 메모리 (로컬 개발용) ───────────── */

function createMemoryStore() {
  const rooms = new Map();   // code -> room
  const players = new Map(); // id -> player
  const votes = new Map();   // `${code}:${round}:${playerId}` -> vote
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
  let seq = 0;

  return {
    mode: 'memory',

    async createRoom(room) {
      if (rooms.has(room.code)) throw new DuplicateError('room exists');
      const now = new Date().toISOString();
      const row = {
        status: 'lobby', round: 0, question_id: null, used_question_ids: [], last_result: null,
        created_at: now, updated_at: now, ...room
      };
      rooms.set(room.code, row);
      return clone(row);
    },

    async getRoom(code) {
      return clone(rooms.get(code) || null);
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
          for (const [id, p] of players) if (p.room_code === code) players.delete(id);
          for (const [k, v] of votes) if (v.room_code === code) votes.delete(k);
        }
      }
    },

    async addPlayer(player) {
      for (const p of players.values()) {
        if (p.room_code === player.room_code && p.nickname === player.nickname) {
          throw new DuplicateError('nickname exists');
        }
      }
      seq += 1;
      const row = {
        id: `p${seq}-${Math.random().toString(36).slice(2, 8)}`,
        alive: true, eliminated_round: null,
        joined_at: new Date(Date.now() + seq).toISOString(),
        ...player
      };
      players.set(row.id, row);
      return clone(row);
    },

    async listPlayers(roomCode) {
      const list = [];
      for (const p of players.values()) {
        if (p.room_code === roomCode) {
          list.push({ id: p.id, nickname: p.nickname, alive: p.alive, eliminated_round: p.eliminated_round, joined_at: p.joined_at });
        }
      }
      return list.sort((a, b) => (a.joined_at < b.joined_at ? -1 : 1));
    },

    async getPlayerByToken(roomCode, token) {
      for (const p of players.values()) {
        if (p.room_code === roomCode && p.token === token) {
          return { id: p.id, nickname: p.nickname, alive: p.alive, eliminated_round: p.eliminated_round };
        }
      }
      return null;
    },

    async eliminatePlayers(roomCode, ids, round) {
      for (let i = 0; i < ids.length; i++) {
        const p = players.get(ids[i]);
        if (p && p.room_code === roomCode) {
          p.alive = false;
          p.eliminated_round = round;
        }
      }
    },

    async revivePlayers(roomCode) {
      for (const p of players.values()) {
        if (p.room_code === roomCode) {
          p.alive = true;
          p.eliminated_round = null;
        }
      }
    },

    async deletePlayer(roomCode, id) {
      const p = players.get(id);
      if (p && p.room_code === roomCode) players.delete(id);
      for (const [k, v] of votes) if (v.player_id === id) votes.delete(k);
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
      for (const [k, v] of votes) {
        if (v.room_code === roomCode && (round === undefined || v.round === round)) votes.delete(k);
      }
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
    console.warn('[minority-game] Supabase 설정이 없어 메모리 저장소로 동작합니다 (로컬 전용).');
    cached = createMemoryStore();
  }
  return cached;
}

module.exports = { getStore, DuplicateError };
