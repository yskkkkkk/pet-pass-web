/**
 * 소수결 게임 — 서버 쪽 동작
 * api/game.js가 방의 게임 종류를 보고 이 모듈로 넘긴다.
 *
 * ctx: { store, room, body, game, requireHost } (api/game.js 참고)
 *   room         요청한 방 (api/game.js가 미리 읽어 둠)
 *   requireHost  진행자 토큰을 확인한다 (틀리면 403)
 *
 * 방 상태: lobby(대기실) → voting(투표 중) → revealed(결과 공개) → voting … → finished
 */
const { HttpError } = require('../../core');
const { transition } = require('../../round');
const { getQuestion } = require('./questions');
const rules = require('./rules');

function publicQuestion(room) {
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

async function vote({ store, room, body }) {
  const choice = body.choice;
  if (choice !== 'A' && choice !== 'B') throw new HttpError(400, '잘못된 선택입니다.');

  const me = body.playerToken ? await store.getPlayerByToken(room.code, body.playerToken) : null;
  if (!me) throw new HttpError(403, '참가자 정보를 찾을 수 없어요.');
  if (!me.alive) throw new HttpError(409, '탈락해서 투표할 수 없어요.');
  if (room.status !== 'voting') throw new HttpError(409, '지금은 투표 시간이 아니에요.');
  // 다음 라운드로 넘어간 뒤 늦게 도착한 이전 라운드 투표는 받지 않는다.
  if (body.round !== undefined && Number(body.round) !== room.round) {
    throw new HttpError(409, '이미 지난 라운드의 투표예요.');
  }

  await store.upsertVote({ room_code: room.code, round: room.round, player_id: me.id, choice });
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
    last_result: null
  }, ['lobby', 'revealed'], '이미 라운드가 시작됐어요.');
  return { room: publicRoom(updated) };
}

async function reroll(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  if (room.status !== 'voting') throw new HttpError(409, '투표 중에만 문제를 바꿀 수 있어요.');

  const { question, usedIds } = rules.pickQuestion(room.used_question_ids, room.question_id);
  const updated = await transition(ctx, {
    question_id: question.id,
    used_question_ids: usedIds
  }, ['voting'], '라운드 상태가 바뀌었어요. 화면을 새로고침해 주세요.');

  await store.deleteVotes(room.code, room.round);
  return { room: publicRoom(updated) };
}

async function reveal(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
  if (room.status !== 'voting') throw new HttpError(409, '투표 중인 라운드가 없어요.');

  const players = await store.listPlayers(room.code);
  const alivePlayers = players.filter((p) => p.alive);
  const votes = await store.listVotes(room.code, room.round);
  const result = rules.resolveRound(alivePlayers, votes);

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
  const updated = await transition(ctx, {
    status: result.finished ? 'finished' : 'revealed',
    last_result: lastResult
  }, ['voting'], '이미 결과가 공개됐어요.');

  await store.eliminatePlayers(room.code, result.eliminatedIds, room.round);
  return { room: publicRoom(updated) };
}

async function restart(ctx) {
  const { store, room } = ctx;
  ctx.requireHost();
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

/* ───────────── 화면별 상태 ───────────── */

async function hostState({ store, room }) {
  const players = await store.listPlayers(room.code);
  // Stryker disable next-line ArrayDeclaration: 빈 배열 대신 아무 값이나 넣어도 참가자 id와 겹치지 않아 결과가 같음
  const votes = room.status === 'voting' ? await store.listVotes(room.code, room.round) : [];
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
  const players = await store.listPlayers(room.code);
  let aliveCount = 0;
  const winners = [];
  for (let i = 0; i < players.length; i++) {
    if (players[i].alive) {
      aliveCount++;
      if (room.status === 'finished') winners.push(players[i].nickname);
    }
  }

  // 대기실(0라운드)에는 표가 없으므로 상태와 관계없이 이번 라운드 표를 찾는다.
  const mine = (await store.listVotes(room.code, room.round)).find((v) => v.player_id === me.id);
  const myChoice = mine ? mine.choice : null;

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

module.exports = {
  id: 'minority',
  actions: { vote, start, reroll, reveal, restart },
  hostState,
  playerState
};
