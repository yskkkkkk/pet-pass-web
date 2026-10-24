/**
 * 미니게임 API — 같이 하는 게임 공통 입구 (단일 엔드포인트, action 기반)
 *
 * 방·참가자처럼 모든 게임에 공통인 동작은 여기서 처리하고,
 * 그 밖의 action은 방의 게임 모듈(lib/game/games/<id>/)로 넘긴다.
 *
 * GET  /api/game?action=info&code=1234                   방이 어떤 게임인지 (참가 입구에서 사용)
 * GET  /api/game?action=state&code=1234&hostToken=...   진행자 화면 상태 (게임 모듈의 hostState + 공통 필드)
 * GET  /api/game?action=state&code=1234&playerToken=... 참가자 화면 상태 (게임 모듈의 playerState + 공통 필드)
 * POST /api/game { action, code, ... }
 *   create    { game?, settings?, nickname? }  방 만들기 → { code, hostToken, game, playerToken? }
 *             nickname을 주면 방장도 참가자로 넣는다 (휴대폰만으로 진행: 방장 휴대폰이 진행하면서 같이 논다)
 *   join      { nickname }               참가 → { playerToken }
 *   kick      { hostToken, playerId }    대기실에서 참가자 내보내기
 *   settings  { hostToken, settings }    대기실에서 진행자 설정 바꾸기 → { settings }
 *   그 밖의 action                        게임 모듈의 actions (소수결: vote, start, reroll, reveal, restart)
 *
 * 게임 모듈에 넘기는 ctx: { store, room, body, game: { info, module }, requireHost() }
 */
const { isAllowedOrigin } = require('./_cors');
const { createRateLimiter } = require('../lib/rate-limiter');
const { getStore, DuplicateError } = require('../lib/game/store');
const core = require('../lib/game/core');
const { applySettings } = require('../lib/game/settings');
const { DEFAULT_GAME, roomGameId, getPartyGame, isKnownGameAction } = require('../lib/game/games');

const { HttpError } = core;

// 같은 와이파이(동일 IP)에서 여러 명이 동시에 참여하므로 넉넉하게 잡는다.
// Stryker disable next-line ObjectLiteral: 기본값과 같은 값이라 지워도 동작이 같음 (읽기 쉽게 명시)
const createLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
const joinLimiter = createRateLimiter({ max: 120, windowMs: 60_000 });

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const ROOM_CODE_ATTEMPTS = 8;

// 공통 action (create는 방이 없을 때 따로 처리). 게임 모듈의 action 이름과 겹치면 안 된다.
const CORE_ACTIONS = ['join', 'kick', 'settings'];

/** 같은 도메인에서 온 요청인지 (프리뷰 배포 도메인 포함) */
function isSameOrigin(req) {
  const match = /^https?:\/\/([^/]+)$/.exec(req.headers.origin);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return match !== null && match[1] === host;
}

function runLimiter(limiter, req, res) {
  let proceed = false;
  limiter(req, res, () => { proceed = true; });
  return proceed;
}

/** 방의 게임 (목록에서 빠진 게임의 방이면 오류) */
function gameOf(room) {
  const game = getPartyGame(roomGameId(room));
  if (!game) throw new HttpError(410, '더 이상 제공하지 않는 게임의 방이에요.');
  return game;
}

function makeContext(store, room, body, game) {
  return {
    store,
    room,
    body,
    game,
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
  const game = getPartyGame(gameId);
  if (!game) throw new HttpError(400, '방을 만들 수 없는 게임이에요.');
  const settings = applySettings(game.info.settings, {}, body.settings || {});
  const nickname = body.nickname === undefined ? null : core.normalizeNickname(body.nickname);
  if (nickname === '') throw new HttpError(400, '닉네임을 입력해 주세요.');

  // 오래된 방 정리 (실패해도 방 생성은 진행)
  // Stryker disable BlockStatement: catch는 로그만 남긴다 (실패를 삼키는 동작은 테스트로 확인)
  try {
    await store.deleteRoomsOlderThan(new Date(Date.now() - ROOM_TTL_MS).toISOString());
  } catch (e) {
    // Stryker disable next-line all: 로그
    console.warn('[minigame] 오래된 방 정리 실패:', e.message);
  }
  // Stryker restore BlockStatement

  for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt++) {
    const code = core.generateRoomCode();
    const hostToken = core.generateToken();
    try {
      await store.createRoom({ code, host_token: hostToken, game: gameId, settings });
      if (nickname === null) return { code, hostToken, game: gameId };
      const playerToken = core.generateToken();
      await store.addPlayer({ room_code: code, nickname, token: playerToken });
      return { code, hostToken, game: gameId, playerToken };
    } catch (e) {
      if (!(e instanceof DuplicateError)) throw e;
    }
  }
  throw new HttpError(503, '방 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
}

async function actionJoin(ctx) {
  const { store, room, body } = ctx;
  const nickname = core.normalizeNickname(body.nickname);
  if (!nickname) throw new HttpError(400, '닉네임을 입력해 주세요.');

  // 이미 참가한 기기라면 그대로 복귀
  // Stryker disable next-line ConditionalExpression: 토큰이 없으면 어차피 못 찾음 (Supabase에 빈 조회를 보내지 않으려는 것)
  if (body.playerToken) {
    const existing = await store.getPlayerByToken(room.code, body.playerToken);
    if (existing) return { playerToken: body.playerToken, nickname: existing.nickname };
  }

  if (room.status !== 'lobby') throw new HttpError(409, '이미 게임이 시작됐어요. 다음 판을 기다려 주세요.');

  const players = await store.listPlayers(room.code);
  if (players.length >= ctx.game.info.maxPlayers) throw new HttpError(409, '방 인원이 가득 찼어요.');

  const playerToken = core.generateToken();
  let added;
  try {
    added = await store.addPlayer({ room_code: room.code, nickname, token: playerToken });
  } catch (e) {
    if (e instanceof DuplicateError) throw new HttpError(409, '이미 사용 중인 닉네임이에요.');
    throw e;
  }

  // 검사와 저장 사이에 다른 사람이 먼저 마지막 자리를 채웠으면, 방금 넣은 나를 빼고 거절한다.
  // (먼저 들어온 순서로 자리를 정해서, 동시에 들어와도 정원 안의 사람은 남는다)
  // 그 사이에 게임이 시작됐으면 빼지 않는다: 시작 요청이 나를 이미 셌을 수 있고(최소 인원), 게임들은 늦게 들어온
  // 참가자도 처리한다 (경매: 시작 칩, 소수결: 생존자).
  const order = (await store.listPlayers(room.code)).findIndex((p) => p.id === added.id);
  if (order >= ctx.game.info.maxPlayers) {
    await store.deletePlayer(room.code, added.id);
    throw new HttpError(409, '방 인원이 가득 찼어요.');
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

async function actionSettings(ctx) {
  ctx.requireHost();
  const settings = applySettings(ctx.game.info.settings, ctx.room.settings, ctx.body.settings);
  // 대기실일 때만 저장된다 (게임이 시작됐으면 409)
  const updated = await ctx.store.updateRoom(ctx.room.code, { settings }, { statuses: ['lobby'] });
  if (!updated) throw new HttpError(409, '설정은 대기실에서만 바꿀 수 있어요.');
  return { settings: updated.settings };
}

const CORE_HANDLERS = { join: actionJoin, kick: actionKick, settings: actionSettings };

async function actionInfo(store, query) {
  const room = await core.loadRoom(store, core.normalizeCode(query.code));
  const { info } = gameOf(room);
  return { code: room.code, game: info.id, path: info.path, status: room.status };
}

async function actionState(store, query) {
  const room = await core.loadRoom(store, core.normalizeCode(query.code));
  const game = gameOf(room);
  const ctx = makeContext(store, room, query, game);
  const common = { game: game.info.id, settings: room.settings };

  if (query.hostToken) {
    ctx.requireHost();
    return { ...common, ...(await game.module.hostState(ctx)) };
  }

  if (query.playerToken) {
    const me = await store.getPlayerByToken(room.code, query.playerToken);
    if (!me) throw new HttpError(404, '참가자 정보를 찾을 수 없어요. 다시 참가해 주세요.');
    return { ...common, ...(await game.module.playerState(ctx, me)) };
  }

  throw new HttpError(400, '토큰이 필요합니다.');
}

/** create 외의 POST: 방을 읽고 공통 action 또는 게임 모듈 action으로 넘긴다 */
async function handleRoomAction(store, body) {
  const isCore = CORE_ACTIONS.includes(body.action);
  if (!isCore && !isKnownGameAction(body.action)) throw new HttpError(400, '알 수 없는 요청입니다.');

  const room = await core.loadRoom(store, core.normalizeCode(body.code));
  const game = gameOf(room);
  const ctx = makeContext(store, room, body, game);
  if (isCore) return CORE_HANDLERS[body.action](ctx);

  // 다른 게임에만 있는 action이면 이 방에서는 알 수 없는 요청
  if (!Object.prototype.hasOwnProperty.call(game.module.actions, body.action)) {
    throw new HttpError(400, '알 수 없는 요청입니다.');
  }
  return game.module.actions[body.action](ctx);
}

function parseBody(raw) {
  let body = raw;
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw);
    } catch (e) {
      throw new HttpError(400, '요청 형식이 올바르지 않아요.');
    }
  }
  return body !== null && typeof body === 'object' ? body : {};
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

    const body = parseBody(req.body);

    if (body.action === 'create') {
      if (!runLimiter(createLimiter, req, res)) return;
      return res.status(200).json(await actionCreate(store, body));
    }

    if (body.action === 'join' && !runLimiter(joinLimiter, req, res)) return;
    return res.status(200).json(await handleRoomAction(store, body));
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    // Stryker disable next-line all: 로그
    console.error('[minigame] 처리 중 오류:', err);
    return res.status(500).json({ error: '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
};
