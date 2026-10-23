/**
 * 미니게임 API — 같이 하는 게임 공통 입구 (단일 엔드포인트, action 기반)
 *
 * 방·참가자처럼 모든 게임에 공통인 동작은 여기서 처리하고,
 * 그 밖의 action은 방의 게임 모듈(lib/game/games/<id>/)로 넘긴다.
 *
 * GET  /api/game?action=info&code=1234                   방이 어떤 게임인지 (참가 입구에서 사용)
 * GET  /api/game?action=state&code=1234&hostToken=...   진행자 화면 상태 (게임 모듈의 hostState)
 * GET  /api/game?action=state&code=1234&playerToken=... 참가자 화면 상태 (게임 모듈의 playerState)
 * POST /api/game { action, code, ... }
 *   create  { game? }                방 만들기 → { code, hostToken, game }
 *   join    { nickname }             참가 → { playerToken }
 *   kick    { hostToken, playerId }  대기실에서 참가자 내보내기
 *   그 밖의 action                    게임 모듈의 actions (소수결: vote, start, reroll, reveal, restart)
 */
const { isAllowedOrigin } = require('./_cors');
const { createRateLimiter } = require('../lib/rate-limiter');
const { getStore, DuplicateError } = require('../lib/game/store');
const core = require('../lib/game/core');
const { DEFAULT_GAME, roomGameId, getPartyGame } = require('../lib/game/games');

const { HttpError } = core;

// 같은 와이파이(동일 IP)에서 여러 명이 동시에 참여하므로 넉넉하게 잡는다.
const createLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const joinLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

// 공통 action — 게임 모듈의 action 이름과 겹치면 안 된다.
const CORE_ACTIONS = ['create', 'join', 'kick'];

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

/** 방의 게임 모듈 (목록에서 빠진 게임의 방이면 오류) */
function gameOf(room) {
  const game = getPartyGame(roomGameId(room));
  if (!game) throw new HttpError(410, '더 이상 제공하지 않는 게임의 방이에요.');
  return game;
}

/** 게임 모듈에 넘기는 ctx */
function makeContext(store, room, body) {
  return {
    store,
    room,
    body,
    requireHost() {
      if (!body.hostToken || body.hostToken !== room.host_token) {
        throw new HttpError(403, '진행자 권한이 없습니다.');
      }
    }
  };
}

/* ───────────── 공통 actions ───────────── */

async function actionCreate(store, body) {
  const gameId = body.game || DEFAULT_GAME;
  if (!getPartyGame(gameId)) throw new HttpError(400, '방을 만들 수 없는 게임이에요.');
  // 방에 게임 종류를 저장할 칸(game_rooms.game)이 생기기 전까지는 기본 게임만 만들 수 있다.
  if (gameId !== DEFAULT_GAME) throw new HttpError(400, '아직 방을 만들 수 없는 게임이에요.');

  // 오래된 방 정리 (실패해도 방 생성은 진행)
  try {
    await store.deleteRoomsOlderThan(new Date(Date.now() - ROOM_TTL_MS).toISOString());
  } catch (e) {
    console.warn('[minigame] 오래된 방 정리 실패:', e.message);
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = core.generateRoomCode();
    const hostToken = core.generateToken();
    try {
      await store.createRoom({ code, host_token: hostToken });
      return { code, hostToken, game: gameId };
    } catch (e) {
      if (e instanceof DuplicateError) continue;
      throw e;
    }
  }
  throw new HttpError(503, '방 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
}

async function actionJoin(store, room, body) {
  const nickname = core.normalizeNickname(body.nickname);
  if (!nickname) throw new HttpError(400, '닉네임을 입력해 주세요.');

  // 이미 참가한 기기라면 그대로 복귀
  if (body.playerToken) {
    const existing = await store.getPlayerByToken(room.code, body.playerToken);
    if (existing) return { playerToken: body.playerToken, nickname: existing.nickname };
  }

  if (room.status !== 'lobby') throw new HttpError(409, '이미 게임이 시작됐어요. 다음 판을 기다려 주세요.');

  const players = await store.listPlayers(room.code);
  if (players.length >= core.MAX_PLAYERS) throw new HttpError(409, '방 인원이 가득 찼어요.');

  const playerToken = core.generateToken();
  try {
    await store.addPlayer({ room_code: room.code, nickname, token: playerToken });
  } catch (e) {
    if (e instanceof DuplicateError) throw new HttpError(409, '이미 사용 중인 닉네임이에요.');
    throw e;
  }
  return { playerToken, nickname };
}

async function actionKick(ctx) {
  ctx.requireHost();
  if (ctx.room.status !== 'lobby') throw new HttpError(409, '대기실에서만 내보낼 수 있어요.');
  if (!ctx.body.playerId) throw new HttpError(400, '참가자를 선택해 주세요.');
  await ctx.store.deletePlayer(ctx.room.code, String(ctx.body.playerId));
  return { ok: true };
}

async function actionInfo(store, query) {
  const room = await core.loadRoom(store, core.normalizeCode(query.code));
  const { info } = gameOf(room);
  return { code: room.code, game: info.id, path: info.path, status: room.status };
}

async function actionState(store, query) {
  const room = await core.loadRoom(store, core.normalizeCode(query.code));
  const { info, module: game } = gameOf(room);
  const ctx = makeContext(store, room, query);

  if (query.hostToken) {
    ctx.requireHost();
    return { game: info.id, ...(await game.hostState(ctx)) };
  }

  if (query.playerToken) {
    const me = await store.getPlayerByToken(room.code, query.playerToken);
    if (!me) throw new HttpError(404, '참가자 정보를 찾을 수 없어요. 다시 참가해 주세요.');
    return { game: info.id, ...(await game.playerState(ctx, me)) };
  }

  throw new HttpError(400, '토큰이 필요합니다.');
}

/** create 외의 POST: 방을 읽고 공통 action 또는 게임 모듈 action으로 넘긴다 */
async function handleRoomAction(store, body) {
  const room = await core.loadRoom(store, core.normalizeCode(body.code));
  const { module: game } = gameOf(room);
  const ctx = makeContext(store, room, body);

  if (body.action === 'join') return actionJoin(store, room, body);
  if (body.action === 'kick') return actionKick(ctx);

  const handler = Object.prototype.hasOwnProperty.call(game.actions, body.action) ? game.actions[body.action] : null;
  if (!handler || CORE_ACTIONS.includes(body.action)) throw new HttpError(400, '알 수 없는 요청입니다.');
  return handler(ctx);
}

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
      if (query.action === 'state') return res.status(200).json(await actionState(store, query));
      if (query.action === 'info') return res.status(200).json(await actionInfo(store, query));
      throw new HttpError(400, '알 수 없는 요청입니다.');
    }

    if (req.method !== 'POST') throw new HttpError(405, '허용되지 않은 메서드입니다.');

    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (typeof body.action !== 'string') throw new HttpError(400, '알 수 없는 요청입니다.');

    if (body.action === 'create') {
      if (!runLimiter(createLimiter, req, res)) return;
      return res.status(200).json(await actionCreate(store, body));
    }

    if (body.action === 'join' && !runLimiter(joinLimiter, req, res)) return;
    return res.status(200).json(await handleRoomAction(store, body));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error('[minigame] 처리 중 오류:', err);
    return res.status(500).json({ error: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
};
