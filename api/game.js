/**
 * 소수결 게임 API (단일 엔드포인트, action 기반)
 *
 * GET  /api/game?action=state&code=1234&hostToken=...   진행자 화면 상태
 * GET  /api/game?action=state&code=1234&playerToken=... 참가자 화면 상태
 * POST /api/game { action, code, ... }
 *   create                         방 만들기 → { code, hostToken }
 *   join    { nickname }           참가 → { playerToken }
 *   vote    { playerToken, choice } 투표 (A|B), 공개 전까지 변경 가능
 *   start   { hostToken }          다음 라운드 시작 (문제 랜덤 출제)
 *   reroll  { hostToken }          현재 라운드 문제 바꾸기
 *   reveal  { hostToken }          결과 공개 + 탈락 처리
 *   kick    { hostToken, playerId } 대기실에서 참가자 내보내기
 *   restart { hostToken }          같은 참가자로 새 게임
 */
const { isAllowedOrigin } = require('./_cors');
const { createRateLimiter } = require('../lib/rate-limiter');
const { getStore, DuplicateError } = require('../lib/game/store');
const { getQuestion } = require('../lib/game/questions');
const engine = require('../lib/game/engine');

// 같은 와이파이(동일 IP)에서 여러 명이 동시에 참여하므로 넉넉하게 잡는다.
const createLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const joinLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** 같은 도메인에서 온 요청이면 허용 (프리뷰 배포 도메인 포함) */
function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === host;
  } catch (e) {
    return false;
  }
}

function runLimiter(limiter, req, res) {
  let proceed = false;
  limiter(req, res, () => { proceed = true; });
  return proceed;
}

function normalizeCode(raw) {
  const code = String(raw || '').trim();
  if (!/^\d{4}$/.test(code)) throw new HttpError(400, '방 코드는 숫자 4자리입니다.');
  return code;
}

async function loadRoom(store, code) {
  const room = await store.getRoom(code);
  if (!room) throw new HttpError(404, '방을 찾을 수 없어요. 코드를 확인해 주세요.');
  return room;
}

async function requireHost(store, body) {
  const code = normalizeCode(body.code);
  const room = await loadRoom(store, code);
  if (!body.hostToken || body.hostToken !== room.host_token) {
    throw new HttpError(403, '진행자 권한이 없습니다.');
  }
  return room;
}

function publicQuestion(room) {
  if (!room.question_id) return null;
  const q = getQuestion(room.question_id);
  return q ? { id: q.id, text: q.text, a: q.a, b: q.b } : null;
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    question: publicQuestion(room),
    result: room.last_result || null
  };
}

/* ───────────── actions ───────────── */

async function actionCreate(store) {
  // 오래된 방 정리 (실패해도 방 생성은 진행)
  try {
    await store.deleteRoomsOlderThan(new Date(Date.now() - ROOM_TTL_MS).toISOString());
  } catch (e) {
    console.warn('[minority-game] 오래된 방 정리 실패:', e.message);
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = engine.generateRoomCode();
    const hostToken = engine.generateToken();
    try {
      await store.createRoom({ code, host_token: hostToken });
      return { code, hostToken };
    } catch (e) {
      if (e instanceof DuplicateError) continue;
      throw e;
    }
  }
  throw new HttpError(503, '방 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
}

async function actionJoin(store, body) {
  const code = normalizeCode(body.code);
  const room = await loadRoom(store, code);
  const nickname = engine.normalizeNickname(body.nickname);
  if (!nickname) throw new HttpError(400, '닉네임을 입력해 주세요.');

  // 이미 참가한 기기라면 그대로 복귀
  if (body.playerToken) {
    const existing = await store.getPlayerByToken(code, body.playerToken);
    if (existing) return { playerToken: body.playerToken, nickname: existing.nickname };
  }

  if (room.status !== 'lobby') throw new HttpError(409, '이미 게임이 시작됐어요. 다음 판을 기다려 주세요.');

  const players = await store.listPlayers(code);
  if (players.length >= engine.MAX_PLAYERS) throw new HttpError(409, '방 인원이 가득 찼어요.');

  const playerToken = engine.generateToken();
  try {
    await store.addPlayer({ room_code: code, nickname, token: playerToken });
  } catch (e) {
    if (e instanceof DuplicateError) throw new HttpError(409, '이미 사용 중인 닉네임이에요.');
    throw e;
  }
  return { playerToken, nickname };
}

async function actionVote(store, body) {
  const code = normalizeCode(body.code);
  const room = await loadRoom(store, code);
  const choice = body.choice;
  if (choice !== 'A' && choice !== 'B') throw new HttpError(400, '잘못된 선택입니다.');

  const me = body.playerToken ? await store.getPlayerByToken(code, body.playerToken) : null;
  if (!me) throw new HttpError(403, '참가자 정보를 찾을 수 없어요.');
  if (!me.alive) throw new HttpError(409, '탈락해서 투표할 수 없어요.');
  if (room.status !== 'voting') throw new HttpError(409, '지금은 투표 시간이 아니에요.');

  await store.upsertVote({ room_code: code, round: room.round, player_id: me.id, choice });
  return { ok: true, choice };
}

async function actionStart(store, body) {
  const room = await requireHost(store, body);
  if (room.status !== 'lobby' && room.status !== 'revealed') {
    throw new HttpError(409, '지금은 라운드를 시작할 수 없어요.');
  }

  const players = await store.listPlayers(room.code);
  let alive = 0;
  for (let i = 0; i < players.length; i++) if (players[i].alive) alive++;
  if (room.status === 'lobby' && alive < engine.MIN_PLAYERS) {
    throw new HttpError(409, `최소 ${engine.MIN_PLAYERS}명이 있어야 시작할 수 있어요.`);
  }

  const { question, usedIds } = engine.pickQuestion(room.used_question_ids || []);
  const updated = await store.updateRoom(room.code, {
    status: 'voting',
    round: room.round + 1,
    question_id: question.id,
    used_question_ids: usedIds,
    last_result: null
  }, { statuses: ['lobby', 'revealed'], round: room.round });

  if (!updated) throw new HttpError(409, '이미 라운드가 시작됐어요.');
  return { room: publicRoom(updated) };
}

async function actionReroll(store, body) {
  const room = await requireHost(store, body);
  if (room.status !== 'voting') throw new HttpError(409, '투표 중에만 문제를 바꿀 수 있어요.');

  const { question, usedIds } = engine.pickQuestion(room.used_question_ids || [], room.question_id);
  const updated = await store.updateRoom(room.code, {
    question_id: question.id,
    used_question_ids: usedIds
  }, { statuses: ['voting'], round: room.round });
  if (!updated) throw new HttpError(409, '라운드 상태가 바뀌었어요. 화면을 새로고침해 주세요.');

  await store.deleteVotes(room.code, room.round);
  return { room: publicRoom(updated) };
}

async function actionReveal(store, body) {
  const room = await requireHost(store, body);
  if (room.status !== 'voting') throw new HttpError(409, '투표 중인 라운드가 없어요.');

  const players = await store.listPlayers(room.code);
  const alivePlayers = players.filter((p) => p.alive);
  const votes = await store.listVotes(room.code, room.round);
  const result = engine.resolveRound(alivePlayers, votes);

  const lastResult = {
    round: room.round,
    aCount: result.aCount,
    bCount: result.bCount,
    noVoteCount: result.noVoteCount,
    outcome: result.outcome,
    winningChoice: result.winningChoice,
    eliminatedIds: result.eliminatedIds,
    survivorCount: result.survivorCount
  };

  // 상태를 먼저 조건부로 바꿔서 중복 공개를 막는다.
  const updated = await store.updateRoom(room.code, {
    status: result.finished ? 'finished' : 'revealed',
    last_result: lastResult
  }, { statuses: ['voting'], round: room.round });
  if (!updated) throw new HttpError(409, '이미 결과가 공개됐어요.');

  await store.eliminatePlayers(room.code, result.eliminatedIds, room.round);
  return { room: publicRoom(updated) };
}

async function actionKick(store, body) {
  const room = await requireHost(store, body);
  if (room.status !== 'lobby') throw new HttpError(409, '대기실에서만 내보낼 수 있어요.');
  if (!body.playerId) throw new HttpError(400, '참가자를 선택해 주세요.');
  await store.deletePlayer(room.code, String(body.playerId));
  return { ok: true };
}

async function actionRestart(store, body) {
  const room = await requireHost(store, body);
  await store.revivePlayers(room.code);
  await store.deleteVotes(room.code);
  const updated = await store.updateRoom(room.code, {
    status: 'lobby',
    round: 0,
    question_id: null,
    last_result: null
  });
  return { room: publicRoom(updated) };
}

async function actionState(store, query) {
  const code = normalizeCode(query.code);
  const room = await loadRoom(store, code);

  if (query.hostToken) {
    if (query.hostToken !== room.host_token) throw new HttpError(403, '진행자 권한이 없습니다.');

    const players = await store.listPlayers(code);
    const votes = room.status === 'voting' ? await store.listVotes(code, room.round) : [];
    const voted = new Set(votes.map((v) => v.player_id));

    let aliveCount = 0;
    let voteCount = 0;
    const list = players.map((p) => {
      if (p.alive) aliveCount++;
      const hasVoted = p.alive && voted.has(p.id);
      if (hasVoted) voteCount++;
      return { id: p.id, nickname: p.nickname, alive: p.alive, eliminatedRound: p.eliminated_round, voted: hasVoted };
    });

    return { role: 'host', room: publicRoom(room), players: list, aliveCount, voteCount };
  }

  if (query.playerToken) {
    const me = await store.getPlayerByToken(code, query.playerToken);
    if (!me) throw new HttpError(404, '참가자 정보를 찾을 수 없어요. 다시 참가해 주세요.');

    const players = await store.listPlayers(code);
    let aliveCount = 0;
    const winners = [];
    for (let i = 0; i < players.length; i++) {
      if (players[i].alive) {
        aliveCount++;
        if (room.status === 'finished') winners.push(players[i].nickname);
      }
    }

    let myChoice = null;
    if (room.status === 'voting' || room.status === 'revealed' || room.status === 'finished') {
      const votes = await store.listVotes(code, room.round);
      const mine = votes.find((v) => v.player_id === me.id);
      myChoice = mine ? mine.choice : null;
    }

    const result = room.last_result
      ? { ...room.last_result, eliminatedIds: undefined }
      : null;

    return {
      role: 'player',
      room: { ...publicRoom(room), result },
      me: { nickname: me.nickname, alive: me.alive, eliminatedRound: me.eliminated_round, choice: myChoice },
      playerCount: players.length,
      aliveCount,
      winners
    };
  }

  throw new HttpError(400, '토큰이 필요합니다.');
}

const POST_ACTIONS = {
  join: actionJoin,
  vote: actionVote,
  start: actionStart,
  reroll: actionReroll,
  reveal: actionReveal,
  kick: actionKick,
  restart: actionRestart
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!isSameOrigin(req) && !isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: '허용되지 않은 Origin 입니다.' });
  }

  const store = getStore();
  if (!store) {
    return res.status(503).json({ error: '게임 서버 설정이 아직 완료되지 않았어요. (SUPABASE_SECRET_KEY 필요)' });
  }

  try {
    if (req.method === 'GET') {
      const query = req.query || {};
      if (query.action !== 'state') throw new HttpError(400, '알 수 없는 요청입니다.');
      return res.status(200).json(await actionState(store, query));
    }

    if (req.method !== 'POST') throw new HttpError(405, '허용되지 않은 메서드입니다.');

    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    if (body.action === 'create') {
      if (!runLimiter(createLimiter, req, res)) return;
      return res.status(200).json(await actionCreate(store));
    }

    if (body.action === 'join' && !runLimiter(joinLimiter, req, res)) return;

    const handler = POST_ACTIONS[body.action];
    if (!handler) throw new HttpError(400, '알 수 없는 요청입니다.');
    return res.status(200).json(await handler(store, body));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('[minority-game] 처리 중 오류:', err);
    return res.status(500).json({ error: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
};
