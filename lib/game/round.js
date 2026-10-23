/**
 * 라운드 공통 도구 — 같이 하는 게임 모듈이 쓰는 참가자 확인, 제출, 조건부 마감.
 *
 * 실서버에서 확인된 원칙을 담는다.
 *  - 제출은 같은 사람·라운드·단계(kind)마다 하나. 공개 전까지 덮어쓸 수 있다.
 *  - 지난 라운드 번호가 붙은 늦은 제출은 받지 않는다.
 *  - 마감(공개)은 "지금 상태·라운드가 맞을 때만" 바꿔서, 두 번 눌러도 한 번만 처리된다.
 */
const { HttpError } = require('./core');

/** 요청한 참가자 (토큰이 틀리면 403) */
async function requirePlayer(ctx) {
  const token = ctx.body.playerToken;
  const me = token ? await ctx.store.getPlayerByToken(ctx.room.code, token) : null;
  if (!me) throw new HttpError(403, '참가자 정보를 찾을 수 없어요.');
  return me;
}

/**
 * 제출 받기
 * @param {object} ctx
 * @param {object} opts
 *   statuses   제출을 받는 방 상태 목록 (기본 ['playing'])
 *   kind       한 라운드 안의 단계 이름 (기본 'main')
 *   payload    저장할 값 (검사는 게임 모듈이 먼저 한다)
 *   allowOut   탈락한 사람도 제출 가능 (기본 false)
 * @returns {Promise<{ me: object }>}
 */
async function submitMove(ctx, { statuses = ['playing'], kind = 'main', payload, allowOut = false }) {
  const me = await requirePlayer(ctx);
  if (!allowOut && !me.alive) throw new HttpError(409, '탈락해서 참여할 수 없어요.');
  if (!statuses.includes(ctx.room.status)) throw new HttpError(409, '지금은 제출할 수 없어요.');
  if (ctx.body.round !== undefined && Number(ctx.body.round) !== ctx.room.round) {
    throw new HttpError(409, '이미 지난 라운드예요.');
  }
  await ctx.store.upsertMove({ room_code: ctx.room.code, round: ctx.room.round, player_id: me.id, kind, payload });
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

module.exports = { requirePlayer, submitMove, transition };
