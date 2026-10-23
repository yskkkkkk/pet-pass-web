/**
 * 최종 시상식 — 게임이 끝나면 기록(stats)으로 웃긴 상을 고른다.
 *
 * 상 정의: { id, title, desc, stat, min }
 *   stat  참가자 data.stats 안의 이름 (예: 'fold', 'betray')
 *   min   이 값 이상일 때만 준다 (기본 1). 아무도 안 했으면 그 상은 없음
 * 가장 높은 기록을 가진 사람이 받고, 동점이면 함께 받는다.
 */

function statOf(player, stat) {
  const stats = (player.data && player.data.stats) || {};
  return Number(stats[stat]) || 0;
}

/**
 * @returns {{ id, title, desc, value, winners: string[] }[]} 정의 순서대로, 받을 사람이 있는 상만
 */
function pickAwards(players, defs) {
  const awards = [];
  for (const def of defs) {
    const min = def.min === undefined ? 1 : def.min;
    let best = -Infinity;
    for (const p of players) best = Math.max(best, statOf(p, def.stat));
    if (best < min) continue;
    const winners = players.filter((p) => statOf(p, def.stat) === best).map((p) => p.nickname);
    awards.push({ id: def.id, title: def.title, desc: def.desc, value: best, winners });
  }
  return awards;
}

/** 기록 하나 올리기: data.stats[stat] += by (data는 바꾸지 않고 새 객체를 돌려줌) */
function bumpStat(data, stat, by = 1) {
  const stats = { ...((data && data.stats) || {}) };
  stats[stat] = (Number(stats[stat]) || 0) + by;
  return { ...(data || {}), stats };
}

module.exports = { pickAwards, bumpStat };
