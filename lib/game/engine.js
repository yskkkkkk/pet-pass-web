/**
 * 소수결 게임 규칙 (순수 함수 모음 — DB/HTTP 의존성 없음)
 *
 * - 살아있는 참가자 전원이 A/B 중 하나를 고른다.
 * - 적은 쪽(소수파)을 고른 사람만 살아남는다.
 * - 동점이거나 만장일치면 투표한 사람은 전원 생존한다.
 * - 투표하지 않은 사람은 탈락한다. (단, 아무도 투표하지 않았다면 라운드 무효)
 * - 생존자가 2명 이하가 되면 게임이 끝난다.
 */
const crypto = require('crypto');
const { QUESTIONS } = require('./questions');

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 200;
const FINISH_AT_OR_BELOW = 2;
const NICKNAME_MAX = 12;

function generateRoomCode() {
  // 모바일에서 숫자 키패드로 바로 입력할 수 있도록 4자리 숫자 코드 사용
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeNickname(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

/**
 * 아직 안 나온 문제 중 하나를 랜덤으로 고른다. 다 썼으면 처음부터 다시.
 * @returns {{ question: object, usedIds: number[] }}
 */
function pickQuestion(usedIds = [], excludeId = null) {
  const used = new Set(usedIds);
  let pool = [];
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    if (!used.has(q.id) && q.id !== excludeId) pool.push(q);
  }

  let nextUsed = usedIds.slice();
  if (pool.length === 0) {
    nextUsed = [];
    for (let i = 0; i < QUESTIONS.length; i++) {
      if (QUESTIONS[i].id !== excludeId) pool.push(QUESTIONS[i]);
    }
  }

  const question = pool[crypto.randomInt(0, pool.length)];
  nextUsed.push(question.id);
  return { question, usedIds: nextUsed };
}

/**
 * 라운드 결과 계산
 * @param {Array<{id:string}>} alivePlayers
 * @param {Array<{player_id:string, choice:'A'|'B'}>} votes
 */
function resolveRound(alivePlayers, votes) {
  const choiceByPlayer = new Map();
  for (let i = 0; i < votes.length; i++) {
    choiceByPlayer.set(votes[i].player_id, votes[i].choice);
  }

  const aIds = [];
  const bIds = [];
  const noVoteIds = [];
  for (let i = 0; i < alivePlayers.length; i++) {
    const id = alivePlayers[i].id;
    const choice = choiceByPlayer.get(id);
    if (choice === 'A') aIds.push(id);
    else if (choice === 'B') bIds.push(id);
    else noVoteIds.push(id);
  }

  const aCount = aIds.length;
  const bCount = bIds.length;
  let outcome;
  let winningChoice = null;
  let eliminatedIds;

  if (aCount + bCount === 0) {
    outcome = 'novote';
    eliminatedIds = [];
  } else if (aCount === 0 || bCount === 0) {
    outcome = 'unanimous';
    eliminatedIds = noVoteIds;
  } else if (aCount === bCount) {
    outcome = 'tie';
    eliminatedIds = noVoteIds;
  } else {
    outcome = 'minority';
    winningChoice = aCount < bCount ? 'A' : 'B';
    const majorityIds = winningChoice === 'A' ? bIds : aIds;
    eliminatedIds = majorityIds.concat(noVoteIds);
  }

  const survivorCount = alivePlayers.length - eliminatedIds.length;

  return {
    aCount,
    bCount,
    noVoteCount: noVoteIds.length,
    outcome,
    winningChoice,
    eliminatedIds,
    survivorCount,
    finished: survivorCount <= FINISH_AT_OR_BELOW
  };
}

module.exports = {
  MIN_PLAYERS,
  MAX_PLAYERS,
  FINISH_AT_OR_BELOW,
  NICKNAME_MAX,
  generateRoomCode,
  generateToken,
  normalizeNickname,
  pickQuestion,
  resolveRound
};
