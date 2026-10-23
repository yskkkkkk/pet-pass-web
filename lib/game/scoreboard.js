/**
 * 점수판 — 점수로 순위를 매긴다.
 * 동점이면 같은 순위를 주고 다음 순위는 그만큼 건너뛴다 (1, 1, 3).
 */

/**
 * @param {object[]} players
 * @param {object} opts
 *   score     (p) => 숫자. 클수록 위
 *   tiebreak  (p) => 숫자. 점수가 같을 때 클수록 위 (없으면 동점 처리)
 * @returns {object[]} 순위 순서대로 { ...p, score, rank } (원래 배열은 바꾸지 않음)
 */
function rankPlayers(players, { score, tiebreak } = {}) {
  const rows = players.map((p) => ({ ...p, score: score(p), _tb: tiebreak ? tiebreak(p) : 0 }));
  rows.sort((a, b) => (b.score - a.score) || (b._tb - a._tb));
  let rank = 0;
  for (let i = 0; i < rows.length; i++) {
    const same = i > 0 && rows[i].score === rows[i - 1].score && rows[i]._tb === rows[i - 1]._tb;
    if (!same) rank = i + 1;
    rows[i].rank = rank;
  }
  return rows.map(({ _tb, ...row }) => row);
}

module.exports = { rankPlayers };
