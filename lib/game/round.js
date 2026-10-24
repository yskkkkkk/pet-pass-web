/**
 * 라운드 공통 도구 — 같이 하는 게임 모듈이 쓰는 참가자 확인, 제출, 조건부 마감.
 *
 * 실서버에서 확인된 원칙을 담는다.
 *  - 제출은 같은 사람·라운드·단계(kind)·판 번호마다 하나. 공개 전까지 덮어쓸 수 있다.
 *  - 한 동작의 쓰기는 방 한 줄에 조건부로 한 번만 한다 (두 번 쓰면 사이에 실패·끼어들기가 생긴다).
 *  - 지난 라운드·지난 판(gen) 번호가 붙은 늦은 제출은 받지 않는다.
 *  - 마감(공개)은 "지금 상태·라운드가 맞을 때만" 바꿔서, 두 번 눌러도 한 번만 처리된다.
 */
const { HttpError, genOf } = require('./core');

/** 요청한 참가자 (토큰이 틀리면 403) */
async function requirePlayer(ctx) {
  const token = ctx.body.playerToken;
  const me = token ? await ctx.store.getPlayerByToken(ctx.room.code, token) : null;
  if (!me) throw new HttpError(403, '참가자 정보를 찾을 수 없어요.');
  return me;
}

/**
 * 제출을 저장하는 칸 이름: 단계 이름 + 판 번호. 판(문제)마다 칸이 달라서, 검사를 통과한 뒤 저장 직전에 멈춘
 * 지난 판의 제출이 늦게 저장돼도 아무도 읽지 않는 칸에 들어간다 (현재 판의 제출을 덮어쓰지도 않는다).
 */
function moveKind(room, kind = 'main') {
  return kind + ':' + genOf(room);
}

/** 이번 라운드·이번 판의 제출 목록 */
function listRoundMoves(store, room, kind = 'main') {
  return store.listMoves(room.code, room.round, moveKind(room, kind));
}

/** 지난 라운드·지난 판(gen)에 보낸 늦은 제출인지 (번호를 안 보내면 확인하지 않는다) */
function isStale(room, body) {
  if (body.round !== undefined && Number(body.round) !== room.round) return true;
  return body.gen !== undefined && Number(body.gen) !== genOf(room);
}

/**
 * 제출 받기
 * @param {object} ctx
 * @param {object} opts
 *   statuses   제출을 받는 방 상태 목록 (기본 ['playing'])
 *   kind       한 라운드 안의 단계 이름 (기본 'main')
 *   payload    저장할 값 (검사는 게임 모듈이 먼저 한다)
 *   allowOut   탈락한 사람도 제출 가능 (기본 false)
 *   me         이미 확인한 참가자 (게임 모듈이 검사에 쓰려고 먼저 읽었으면 넘겨서 다시 읽지 않는다)
 * @returns {Promise<{ me: object }>}
 */
async function submitMove(ctx, { statuses = ['playing'], kind = 'main', payload, allowOut = false, me: known }) {
  const me = known || await requirePlayer(ctx);
  if (!allowOut && !me.alive) throw new HttpError(409, '탈락해서 참여할 수 없어요.');
  if (!statuses.includes(ctx.room.status)) throw new HttpError(409, '지금은 제출할 수 없어요.');
  if (isStale(ctx.room, ctx.body)) throw new HttpError(409, '이미 지난 라운드예요.');
  await ctx.store.upsertMove({ room_code: ctx.room.code, round: ctx.room.round, player_id: me.id, kind: moveKind(ctx.room, kind), payload });
  return { me };
}

/**
 * 조건부로 방 상태를 바꾼다. 다른 요청이 먼저 바꿨으면 409.
 * @param {object} ctx
 * @param {object} patch      바꿀 값
 * @param {string[]} statuses 지금 상태가 이 중 하나일 때만
 * @param {string} message    이미 바뀌었을 때 보여줄 문구
 */
async function transition(ctx, patch, statuses, message) {
  const updated = await ctx.store.updateRoom(ctx.room.code, patch, { statuses, round: ctx.room.round });
  if (!updated) throw new HttpError(409, message);
  ctx.room = updated;
  return updated;
}

module.exports = { moveKind, listRoundMoves, isStale, requirePlayer, submitMove, transition };
