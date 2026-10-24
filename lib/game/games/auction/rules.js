/**
 * 블라인드 경매 규칙 (순수 함수 모음 — DB/HTTP 의존성 없음)
 *
 * - 모두 같은 칩으로 시작한다. 라운드마다 물건 하나를 경매에 올린다.
 * - 각자 0~(남은 칩) 사이에서 몰래 입찰한다. 안 낸 사람은 0.
 * - 입찰한 칩은 이기든 지든 모두 사라진다.
 * - 가장 많이 건 사람이 혼자면 물건(점수)을 가져간다. 최고액이 동점이면 아무도 못 가져간다.
 * - 저주 물건은 반대로 가장 적게 건 사람이 떠안는다 (동점이면 함께).
 * - 최종 순위는 점수 합계, 같으면 남은 칩이 많은 사람이 위.
 */
const crypto = require('crypto');
const { rankPlayers } = require('../../scoreboard');
const { bumpStat } = require('../../awards');
const { HttpError } = require('../../core');
const items = require('./items');

const CHEAP_MAX = 3; // 이 칩 이하로 낙찰되면 "헐값 낙찰"

const AWARDS = [
  { id: 'bigspender', title: '큰손상', desc: '경매에 칩을 가장 많이 썼어요 ({value}칩)', stat: 'spent' },
  { id: 'stingy', title: '짠돌이상', desc: '0칩 입찰 {value}번… 지갑을 끝내 안 열었어요', stat: 'zeroBids' },
  { id: 'wasted', title: '헛돈상', desc: '동점으로 공중분해된 칩 {value}개', stat: 'burst' },
  { id: 'bargain', title: '헐값왕', desc: '3칩 이하로 {value}번 낙찰', stat: 'cheapWins' },
  { id: 'cursed', title: '저주 수집가', desc: '저주 물건을 {value}번 떠안았어요', stat: 'cursed' },
  { id: 'allin', title: '올인 중독', desc: '올인 {value}번', stat: 'allIn' },
  { id: 'broke', title: '텅장상', desc: '칩을 가장 먼저 다 썼어요', stat: 'brokeAt' }
];

/** 참가자 data (게임 시작 전이거나 늦게 들어온 사람은 시작 칩으로) */
function dataOf(data, startChips) {
  const d = data || {};
  return {
    chips: d.chips === undefined ? startChips : d.chips,
    score: d.score === undefined ? 0 : d.score,
    stats: d.stats || {}
  };
}

function shuffle(list, randomInt) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/**
 * 라운드 수에 맞춘 물건 종류 개수
 * 3점 20%(마지막 라운드 포함), 2점 40%, 나머지 1점. 돌발 물건을 켜면 미스터리 상자 1~2개와 저주 물건 1개가 1점 자리를 먼저 차지한다.
 * rounds는 5 이상 (진행자 설정 범위)
 */
function lineupCounts(rounds, surprises) {
  const mystery = surprises ? (rounds >= 10 ? 2 : 1) : 0;
  const cursed = surprises ? 1 : 0;
  const threes = Math.round(rounds * 0.2); // 5라운드 이상이면 1개 이상
  const twos = Math.round(rounds * 0.4);
  const ones = rounds - mystery - cursed - threes - twos;
  return { 1: ones, 2: twos, 3: threes, mystery, cursed };
}

/**
 * 한 판의 물건 순서. 마지막 라운드는 항상 3점 물건 (끝까지 뒤집을 수 있게).
 * 미스터리 상자의 점수도 여기서 정해 두고, 공개 전까지 화면에는 숨긴다.
 * @param {function} randomInt (min, max) => min 이상 max 미만 정수 (테스트에서 바꿔 끼움)
 * @returns {{ kind: 'normal'|'mystery'|'cursed', name: string, points: number }[]}
 */
function buildLineup(rounds, surprises, randomInt = crypto.randomInt) {
  const counts = lineupCounts(rounds, surprises);
  const names = { 1: shuffle(items.NORMAL[1], randomInt), 2: shuffle(items.NORMAL[2], randomInt), 3: shuffle(items.NORMAL[3], randomInt) };
  const normal = (points) => ({ kind: 'normal', name: names[points].pop(), points });

  const last = normal(3);
  const rest = [];
  for (const points of [1, 2, 3]) {
    const n = points === 3 ? counts[3] - 1 : counts[points];
    for (let i = 0; i < n; i++) rest.push(normal(points));
  }
  for (let i = 0; i < counts.mystery; i++) {
    rest.push({ kind: 'mystery', name: items.MYSTERY_NAME, points: randomInt(0, items.MYSTERY_MAX + 1) });
  }
  for (let i = 0; i < counts.cursed; i++) {
    rest.push({ kind: 'cursed', name: items.CURSED[randomInt(0, items.CURSED.length)], points: items.CURSED_POINTS });
  }
  return shuffle(rest, randomInt).concat([last]);
}

/**
 * 화면에 보여줄 물건 순서. 미스터리 상자의 점수는 그 라운드가 공개되기 전까지 null.
 * @param {object[]} lineup
 * @param {number} round  지금 라운드 (대기실 0)
 * @param {boolean} revealed 지금 라운드 결과가 공개됐는지
 */
function publicLineup(lineup, round, revealed) {
  return (lineup || []).map((item, i) => {
    const opened = i + 1 < round || (i + 1 === round && revealed);
    return {
      round: i + 1,
      kind: item.kind,
      name: item.name,
      points: item.kind === 'mystery' && !opened ? null : item.points
    };
  });
}

/** 입찰액 검사: 0~남은 칩 사이 정수 */
function parseBid(raw, chips) {
  if (!Number.isInteger(raw) || raw < 0 || raw > chips) {
    throw new HttpError(400, `입찰은 0~${chips}칩 사이 정수로 해 주세요.`);
  }
  return raw;
}

/**
 * 라운드 판정
 * @param {{ id, chips }[]} players  방의 모든 참가자 (입찰 전 칩)
 * @param {{ player_id, payload: { bid } }[]} moves  제출된 입찰
 * @param {{ kind, points }} item
 * @returns {{
 *   outcome: 'win'|'tie'|'nobid'|'cursed',
 *   bids: { id, bid, submitted, allIn }[],
 *   maxBid, minBid, winnerIds, tiedIds, cursedIds, cheap, points
 * }}
 */
function resolveAuction(players, moves, item) {
  const bidOf = new Map(moves.map((m) => [m.player_id, m.payload.bid]));
  const bids = players.map((p) => {
    // 남은 칩보다 많이 낼 수는 없다 (제출할 때 검사하지만, 저장된 값도 한 번 더 막는다)
    const bid = Math.min(p.chips, Math.max(0, Number(bidOf.get(p.id)) || 0));
    return { id: p.id, bid, submitted: bidOf.has(p.id), allIn: bid > 0 && bid === p.chips };
  });
  const amounts = bids.map((b) => b.bid);
  const maxBid = Math.max(...amounts);
  const minBid = Math.min(...amounts);
  const idsWith = (amount) => bids.filter((b) => b.bid === amount).map((b) => b.id);

  let outcome;
  let winnerIds = [];
  let tiedIds = [];
  let cursedIds = [];
  if (item.kind === 'cursed') {
    outcome = 'cursed';
    cursedIds = idsWith(minBid);
  } else if (maxBid === 0) {
    outcome = 'nobid';
  } else {
    const leaders = idsWith(maxBid);
    if (leaders.length === 1) {
      outcome = 'win';
      winnerIds = leaders;
    } else {
      outcome = 'tie';
      tiedIds = leaders;
    }
  }

  return {
    outcome,
    bids,
    maxBid,
    minBid,
    winnerIds,
    tiedIds,
    cursedIds,
    cheap: outcome === 'win' && maxBid <= CHEAP_MAX,
    points: item.points
  };
}

/**
 * 판정 결과를 참가자 data(칩, 점수, 시상식 기록)에 반영한다.
 * @param {object[]} players  저장소의 참가자 (data 포함)
 * @param {object} result     resolveAuction 결과
 * @param {{ round, rounds, startChips }} game
 * @returns {{ id, patch: { data } }[]} store.updatePlayers 형식
 */
function settle(players, result, { round, rounds, startChips }) {
  const bidById = new Map(result.bids.map((b) => [b.id, b]));
  return players.map((p) => {
    const before = dataOf(p.data, startChips);
    const { bid, allIn } = bidById.get(p.id);
    const won = result.winnerIds.includes(p.id);
    const cursed = result.cursedIds.includes(p.id);
    const chips = before.chips - bid;

    let data = { ...before, chips, score: before.score + (won || cursed ? result.points : 0) };
    data = bumpStat(data, 'spent', bid);
    if (bid === 0 && before.chips > 0) data = bumpStat(data, 'zeroBids');
    if (result.tiedIds.includes(p.id)) data = bumpStat(data, 'burst', bid);
    if (won && result.cheap) data = bumpStat(data, 'cheapWins');
    if (cursed) data = bumpStat(data, 'cursed');
    if (allIn) data = bumpStat(data, 'allIn');
    // 먼저 탕진할수록 큰 값 (마지막 라운드에 탕진하면 1)
    if (chips === 0 && before.chips > 0) data = bumpStat(data, 'brokeAt', rounds - round + 1);
    // 몇 라운드까지 정산했는지 (참가자 갱신이 빠졌는지 확인하는 표시)
    return { id: p.id, patch: { data: { ...data, settledRound: round } } };
  });
}

/** 순위: 점수 합계, 같으면 남은 칩 */
function ranking(players, startChips) {
  const rows = players.map((p) => {
    const d = dataOf(p.data, startChips);
    return { id: p.id, nickname: p.nickname, chips: d.chips, points: d.score };
  });
  return rankPlayers(rows, { score: (r) => r.points, tiebreak: (r) => r.chips })
    .map(({ points, ...r }) => r);
}

module.exports = {
  CHEAP_MAX,
  AWARDS,
  dataOf,
  shuffle,
  lineupCounts,
  buildLineup,
  publicLineup,
  parseBid,
  resolveAuction,
  settle,
  ranking
};
