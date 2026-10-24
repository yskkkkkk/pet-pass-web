/**
 * 소수결 게임 — 서버 쪽 동작
 * api/game.js가 방의 게임 종류를 보고 이 모듈로 넘긴다.
 *
 * ctx: { store, room, body, game, requireHost } (api/game.js 참고)
 *   room         요청한 방 (api/game.js가 미리 읽어 둠)
 *   requireHost  진행자 토큰을 확인한다 (틀리면 403)
 *
 * 방 상태: lobby(대기실) → voting(투표 중) → revealed(결과 공개) → voting … → finished
 * room.state: { gen: 판 번호(문제 바꾸기·라운드 시작마다 올라감), out: { 탈락한 참가자 id: 탈락 라운드 } }
 *
 * 탈락은 참가자 줄이 아니라 방 한 줄(state.out)에 둔다. 공개가 "판정 + 탈락"을 조건부 쓰기 한 번으로 끝내서,
 * 중간에 실패하거나 다른 요청(한 판 더·시작)이 끼어들어도 반만 반영되는 일이 없다.
 * 표는 판 번호가 붙은 칸(round.moveKind)에 저장해서, 늦게 저장된 지난 문제·지난 판의 표는 읽히지 않는다.
 */
const { HttpError, genOf } = require('../../core');
const { isStale, listRoundMoves, moveKind, transition } = require('../../round');
const { getQuestion } = require('./questions');
const rules = require('./rules');

const VOTE = 'vote';

function publicQuestion(room) {
  const q = getQuestion(room.question_id);
  return q ? { id: q.id, text: q.text, a: q.a, b: q.b } : null;
}

/** 공개 결과 (사람별 선택 기록은 빼고) */
function publicResult(room) {
  if (!room.last_result) return null;
  const { choices, ...result } = room.last_result;
  return result;
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    round: room.round,
    gen: genOf(room),
    question: publicQuestion(room),
    result: publicResult(room)
  };
}

/**
 * 탈락 목록 { id: 라운드 }. 이 구조 전에 만든 방(state.out 없음)은 참가자 줄의 탈락 기록을 쓴다.
 */
function outOf(room, players) {
  if (room.state && room.state.out) return room.state.out;
  const out = {};
  for (const p of players) if (!p.alive) out[p.id] = p.eliminated_round;
  return out;
}

/** 참가자 줄에 방의 탈락 목록을 입힌다 */
function withAlive(room, players) {
  const out = outOf(room, players);
  return players.map((p) => {
    const gone = Object.prototype.hasOwnProperty.call(out, p.id);
    return { ...p, alive: !gone, eliminated_round: gone ? out[p.id] : null };
  });
}

/** 이번 라운드·이번 문제의 표 [{ player_id, choice }] */
async function listVotes(store, room) {
  return (await listRoundMoves(store, room, VOTE)).map((m) => ({ player_id: m.player_id, choice: m.payload.choice }));
}

/* ───────────── actions ───────────── */

async function vote({ store, room, body }) {
  const choice = body.choice;
  if (choice !== 'A' && choice !== 'B') throw new HttpError(400, '잘못된 선택입니다.');

  const found = body.playerToken ? await store.getPlayerByToken(room.code, body.playerToken) : null;
  if (!found) throw new HttpError(403, '참가자 정보를 찾을 수 없어요.');
  const me = withAlive(room, [found])[0];
  if (!me.alive) throw new HttpError(409, '탈락해서 투표할 수 없어요.');
  if (room.status !== 'voting') throw new HttpError(409, '지금은 투표 시간이 아니에요.');
  // 다음 라운드·문제 바꾸기·새 판 뒤에 늦게 도착한 투표는 받지 않는다.
  if (isStale(room, body)) throw new HttpError(409, '이미 지난 라운드의 투표예요.');

  await store.upsertMove({ room_code: room.code, round: room.round, player_id: me.id, kind: moveKind(room, VOTE), payload: { choice } });
  return { ok: true, choice };
}

async function start(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  if (room.status !== 'lobby' && room.status !== 'revealed') {
    throw new HttpError(409, '지금은 라운드를 시작할 수 없어요.');
  }

  // 대기실에서는 모두 살아 있다. (결과 공개 상태에서는 생존자가 항상 3명 이상 — 2명 이하면 종료됨)
  const players = await store.listPlayers(room.code);
  // Stryker disable next-line ConditionalExpression: 결과 공개 상태에서는 생존자가 항상 3명 이상이라 조건을 빼도 결과가 같음
  if (room.status === 'lobby' && players.length < rules.MIN_PLAYERS) {
    throw new HttpError(409, `최소 ${rules.MIN_PLAYERS}명이 있어야 시작할 수 있어요.`);
  }

  const { question, usedIds } = rules.pickQuestion(room.used_question_ids);
  const updated = await transition(ctx, {
    status: 'voting',
    round: room.round + 1,
    question_id: question.id,
    used_question_ids: usedIds,
    last_result: null,
    // 새 판이면 탈락 목록을 비운다
    state: { gen: genOf(room) + 1, out: room.status === 'lobby' ? {} : outOf(room, players) }
  }, ['lobby', 'revealed'], '이미 라운드가 시작됐어요.');
  return { room: publicRoom(updated) };
}

async function reroll(ctx) {
  const { room } = ctx;
  ctx.requireHost();
  if (room.status !== 'voting') throw new HttpError(409, '투표 중에만 문제를 바꿀 수 있어요.');

  // 판 번호가 바뀌면 지금까지의 표는 읽히지 않는다 (따로 지우지 않아도 된다)
  const { question, usedIds } = rules.pickQuestion(room.used_question_ids, room.question_id);
  const updated = await transition(ctx, {
    question_id: question.id,
    used_question_ids: usedIds,
    state: { ...room.state, gen: genOf(room) + 1 }
  }, ['voting'], '라운드 상태가 바뀌었어요. 화면을 새로고침해 주세요.');
  return { room: publicRoom(updated) };
}

async function reveal(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  if (room.status !== 'voting') throw new HttpError(409, '투표 중인 라운드가 없어요.');

  const players = withAlive(room, await store.listPlayers(room.code));
  const alivePlayers = players.filter((p) => p.alive);
  const votes = await listVotes(store, room);
  const result = rules.resolveRound(alivePlayers, votes);

  const lastResult = {
    round: room.round,
    aCount: result.aCount,
    bCount: result.bCount,
    noVoteCount: result.noVoteCount,
    outcome: result.outcome,
    winningChoice: result.winningChoice,
    eliminatedIds: result.eliminatedIds,
    survivorCount: result.survivorCount,
    // 집계에 들어간 표 (마감과 겹쳐 늦게 저장된 표가 있어도 휴대폰의 "내 선택"은 이 기록으로 보여준다)
    choices: votes
  };

  // 판정과 탈락을 조건부 쓰기 한 번으로 (두 번 공개해도, 사이에 다른 요청이 끼어도 한 번만 반영)
  const out = { ...outOf(room, players) };
  for (const id of result.eliminatedIds) out[id] = room.round;
  const updated = await transition(ctx, {
    status: result.finished ? 'finished' : 'revealed',
    last_result: lastResult,
    state: { ...room.state, out }
  }, ['voting'], '이미 결과가 공개됐어요.');
  return { room: publicRoom(updated) };
}

async function restart(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  await store.deleteMoves(room.code);
  // 판 번호는 남겨 둔다 (다음 판 시작 때 올라가서, 지난 판의 늦은 표가 새 판에 들어가지 않게)
  const updated = await store.updateRoom(room.code, {
    status: 'lobby',
    round: 0,
    question_id: null,
    last_result: null,
    state: { gen: genOf(room), out: {} }
  });
  return { room: publicRoom(updated) };
}

/* ───────────── 화면별 상태 ───────────── */

async function hostState({ store, room }) {
  const players = withAlive(room, await store.listPlayers(room.code));
  // Stryker disable next-line ArrayDeclaration: 빈 배열 대신 아무 값이나 넣어도 참가자 id와 겹치지 않아 결과가 같음
  const votes = room.status === 'voting' ? await listVotes(store, room) : [];
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

async function playerState({ store, room }, me) {
  const players = withAlive(room, await store.listPlayers(room.code));
  const self = players.find((p) => p.id === me.id);
  let aliveCount = 0;
  const winners = [];
  for (let i = 0; i < players.length; i++) {
    if (players[i].alive) {
      aliveCount++;
      if (room.status === 'finished') winners.push(players[i].nickname);
    }
  }

  // 공개 뒤에는 집계에 들어간 표로, 투표 중에는 이번 라운드·이번 문제의 표로 (대기실 0라운드에는 표가 없다).
  // 이 구조 전에 공개된 결과(choices 없음)는 예전 표 테이블에서 찾는다.
  let votes;
  if (room.last_result && room.last_result.choices) votes = room.last_result.choices;
  else if (room.last_result) votes = await store.listVotes(room.code, room.round);
  else votes = await listVotes(store, room);
  const mine = votes.find((v) => v.player_id === me.id);
  const myChoice = mine ? mine.choice : null;

  const result = room.last_result
    ? { ...publicResult(room), eliminatedIds: undefined }
    : null;

  return {
    role: 'player',
    room: { ...publicRoom(room), result },
    me: { nickname: me.nickname, alive: self.alive, eliminatedRound: self.eliminated_round, choice: myChoice },
    playerCount: players.length,
    aliveCount,
    winners
  };
}

module.exports = {
  id: 'minority',
  actions: { vote, start, reroll, reveal, restart },
  hostState,
  playerState
};
