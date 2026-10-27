/**
 * 블라인드 경매 — 서버 쪽 동작
 * api/game.js가 방의 게임 종류를 보고 이 모듈로 넘긴다. (ctx 형식은 api/game.js 참고)
 *
 * 방 상태: lobby(대기실) → playing(입찰 중) → revealed(결과 공개) → playing … → finished(마지막 라운드 공개)
 * room.state: { lineup: 물건 순서, history: 라운드별 결과 요약, revealedAt: 공개 시각(ms), gen: 판 번호,
 *               players: { 참가자 id: { chips, score, stats } } }
 * room.last_result: 방금 공개한 라운드의 판정. 다음 라운드를 시작하면 비운다
 *
 * 칩·점수는 참가자 줄이 아니라 방 한 줄(state.players)에 둔다. 공개가 "판정 + 정산"을 조건부 쓰기 한 번으로 끝내서,
 * 중간에 실패하거나 다른 요청(다음·재시작)이 끼어들어도 반만 반영되는 일이 없다.
 * 입찰은 판 번호가 붙은 칸(round.moveKind)에 저장해서, 늦게 저장된 지난 판 입찰은 읽히지 않는다.
 *
 * 비밀 지키기: 입찰 중에는 누가 냈는지와 몇 번 바꿨는지만 내보낸다. 금액은 공개 전까지
 * 본인 화면 말고는 어떤 응답에도 넣지 않는다.
 */
const { HttpError, genOf } = require('../../core');
const { listRoundMoves, requirePlayer, submitMove, transition } = require('../../round');
const { pickAwards } = require('../../awards');
const rules = require('./rules');

function startChips(room) {
  return Number(room.settings.chips);
}

function lineupOf(room) {
  return (room.state && room.state.lineup) || [];
}

/** 참가자별 칩·점수·기록 (방 한 줄에 있다). 게임 시작 전이거나 늦게 들어온 사람은 비어 있다 */
function dataOf(room, playerId) {
  const all = (room.state && room.state.players) || {};
  return all[playerId];
}

/** 순위·시상식·정산 함수가 쓰는 { ...참가자, data } 모양 */
function withData(room, players) {
  return players.map((p) => ({ ...p, data: dataOf(room, p.id) }));
}

function isRevealed(room) {
  return room.status === 'revealed' || room.status === 'finished';
}

function publicRoom(room) {
  return { code: room.code, status: room.status, round: room.round, rounds: lineupOf(room).length, gen: genOf(room) };
}

/** 공개된 판정 (공개 전이면 null). 입찰마다 닉네임을 붙인다 (게임 중에는 내보내기가 없어 참가자가 그대로다) */
function publicResult(room, players) {
  if (!isRevealed(room)) return null;
  const names = new Map(players.map((p) => [p.id, p.nickname]));
  const r = room.last_result;
  return { ...r, bids: r.bids.map((b) => ({ ...b, nickname: names.get(b.id) })) };
}

/** 공개한 지 몇 ms 지났는지 (서버 시계 기준 — 휴대폰 시계가 틀려도 연출 시간이 맞는다). 입찰 중에는 null */
function revealAge(room) {
  const at = room.state && room.state.revealedAt;
  return at ? Math.max(0, Date.now() - at) : null;
}

function currentItem(room) {
  const list = rules.publicLineup(lineupOf(room), room.round, isRevealed(room));
  return list[room.round - 1] || null;
}

/* ───────────── actions ───────────── */

async function start(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  // 대기실이 아니면 아래 transition이 409로 막는다
  const players = await store.listPlayers(room.code);
  const min = ctx.game.info.minPlayers;
  if (players.length < min) throw new HttpError(409, `최소 ${min}명이 있어야 시작할 수 있어요.`);

  const lineup = rules.buildLineup(room.settings.rounds, room.settings.surprises);
  await transition(ctx, {
    status: 'playing',
    round: 1,
    last_result: null,
    state: { lineup, history: [], revealedAt: null, gen: genOf(room) + 1, players: {} }
  }, ['lobby'], '이미 게임이 시작됐어요.');
  return { room: publicRoom(ctx.room) };
}

async function bid(ctx) {
  const { store, room, body } = ctx;
  const me = await requirePlayer(ctx);
  const { chips } = rules.dataOf(dataOf(room, me.id), startChips(room));
  const amount = rules.parseBid(body.bid, chips);

  // 금액을 바꾼 횟수 (진행 화면의 "봉투 바꿔치기" 연출용. 금액은 알리지 않는다)
  const prev = (await listRoundMoves(store, room)).find((m) => m.player_id === me.id);
  const changes = prev ? prev.payload.changes + (prev.payload.bid === amount ? 0 : 1) : 0;

  await submitMove(ctx, { me, payload: { bid: amount, changes } });
  return { ok: true, bid: amount };
}

async function reveal(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  if (room.status !== 'playing') throw new HttpError(409, '입찰 중인 라운드가 없어요.');

  const start = startChips(room);
  const players = withData(room, await store.listPlayers(room.code));
  const moves = await listRoundMoves(store, room);
  const lineup = lineupOf(room);
  const item = lineup[room.round - 1];
  const result = rules.resolveAuction(
    players.map((p) => ({ id: p.id, chips: rules.dataOf(p.data, start).chips })),
    moves,
    item
  );

  const names = new Map(players.map((p) => [p.id, p.nickname]));
  const takers = result.outcome === 'cursed' ? result.cursedIds : result.winnerIds;
  const history = room.state.history.concat([{
    round: room.round,
    outcome: result.outcome,
    points: item.points,
    names: takers.map((id) => names.get(id))
  }]);

  // 판정과 정산을 조건부 쓰기 한 번으로 (두 번 공개해도, 사이에 다른 요청이 끼어도 한 번만 반영)
  const settled = rules.settle(players, result, { round: room.round, rounds: lineup.length, startChips: start });
  await transition(ctx, {
    status: room.round >= lineup.length ? 'finished' : 'revealed',
    last_result: { round: room.round, item, ...result },
    state: { ...room.state, history, revealedAt: Date.now(), players: Object.fromEntries(settled.map((u) => [u.id, u.patch.data])) }
  }, ['playing'], '이미 결과가 공개됐어요.');
  return { room: publicRoom(ctx.room) };
}

async function next(ctx) {
  const { room } = ctx;
  ctx.requireHost();
  if (room.status !== 'revealed') throw new HttpError(409, '결과를 공개한 뒤에 다음 물건으로 넘어갈 수 있어요.');
  await transition(ctx, {
    status: 'playing',
    round: room.round + 1,
    last_result: null,
    state: { ...room.state, revealedAt: null }
  }, ['revealed'], '이미 다음 물건으로 넘어갔어요.');
  return { room: publicRoom(ctx.room) };
}

async function restart(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  await store.deleteMoves(room.code);
  // 칩·점수는 방 한 줄에 있어서 state를 비우면 함께 비워진다.
  // 판 번호는 남겨 둔다 (다음 판 시작 때 올라가서, 지난 판의 늦은 입찰이 새 판에 들어가지 않게)
  const updated = await store.updateRoom(room.code, { status: 'lobby', round: 0, last_result: null, state: { gen: genOf(room) } });
  return { room: publicRoom(updated) };
}

/* ───────────── 화면별 상태 ───────────── */

/**
 * 모두에게 보여도 되는 상태 (진행 화면과 휴대폰이 같은 것을 받는다 — 휴대폰만으로 진행할 때 휴대폰이 경매장이 된다)
 * 입찰 중에는 누가 냈는지와 바꾼 횟수만 있고 금액은 없다.
 */
async function publicState(store, room) {
  const start = startChips(room);
  const players = withData(room, await store.listPlayers(room.code));
  const moves = room.status === 'playing' ? await listRoundMoves(store, room) : [];
  const moveOf = new Map(moves.map((m) => [m.player_id, m.payload]));

  const list = players.map((p) => {
    const d = rules.dataOf(p.data, start);
    const m = moveOf.get(p.id);
    return { id: p.id, nickname: p.nickname, chips: d.chips, score: d.score, submitted: Boolean(m), changes: m ? m.changes : 0 };
  });

  return {
    moveOf,
    view: {
      room: publicRoom(room),
      lineup: rules.publicLineup(lineupOf(room), room.round, isRevealed(room)),
      history: (room.state && room.state.history) || [],
      item: currentItem(room),
      players: list,
      submittedCount: moves.length,
      ranking: rules.ranking(players, start),
      result: publicResult(room, players),
      revealAgeMs: revealAge(room),
      awards: room.status === 'finished' ? pickAwards(players, rules.AWARDS) : []
    }
  };
}

async function hostState({ store, room }) {
  const { view } = await publicState(store, room);
  return { role: 'host', ...view };
}

async function playerState({ store, room }, me) {
  const { view, moveOf } = await publicState(store, room);
  const d = rules.dataOf(dataOf(room, me.id), startChips(room));
  const mine = moveOf.get(me.id);
  return {
    role: 'player',
    ...view,
    me: {
      id: me.id,
      nickname: me.nickname,
      chips: d.chips,
      score: d.score,
      rank: view.ranking.find((r) => r.id === me.id).rank,
      bid: mine ? mine.bid : null
    },
    playerCount: view.players.length
  };
}

module.exports = {
  id: 'auction',
  actions: { start, bid, reveal, next, restart },
  hostState,
  playerState
};
