const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../lib/game/games/auction/rules');
const items = require('../../lib/game/games/auction/items');

/** 시드로 정해지는 무작위 (테스트를 운에 맡기지 않도록 여러 시드를 모두 돌린다) */
function seeded(seed) {
  let s = seed >>> 0;
  return (min, max) => {
    // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + Math.floor(r * (max - min));
  };
}
const first = (min) => min;
const last = (min, max) => max - 1;

const players = (chips) => chips.map((c, i) => ({ id: 'p' + i, chips: c }));
const moves = (bids) => bids
  .map((b, i) => (b === null ? null : { player_id: 'p' + i, payload: { bid: b } }))
  .filter(Boolean);
const NORMAL3 = { kind: 'normal', points: 3 };

/* ───────── 참가자 data ───────── */

test('dataOf: 비어 있으면 시작 칩·0점, 있는 값(칩 0 포함)은 그대로', () => {
  assert.deepEqual(rules.dataOf(undefined, 100), { chips: 100, score: 0, stats: {} });
  assert.deepEqual(rules.dataOf({}, 50), { chips: 50, score: 0, stats: {} });
  assert.deepEqual(rules.dataOf({ chips: 0, score: 0, stats: { spent: 3 } }, 100), { chips: 0, score: 0, stats: { spent: 3 } });
  assert.deepEqual(rules.dataOf({ chips: 7, score: 5 }, 100), { chips: 7, score: 5, stats: {} });
});

/* ───────── 섞기 ───────── */

test('shuffle: 뒤에서부터 하나씩 바꾼다, 원래 배열은 그대로', () => {
  const calls = [];
  const list = ['a', 'b', 'c', 'd'];
  const out = rules.shuffle(list, (min, max) => { calls.push([min, max]); return min; });
  assert.deepEqual(calls, [[0, 4], [0, 3], [0, 2]]);
  assert.deepEqual(out, ['b', 'c', 'd', 'a']);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
  assert.deepEqual(rules.shuffle(list, last), list, '자기 자리와 바꾸면 그대로');
  assert.deepEqual(rules.shuffle([], first), []);
});

/* ───────── 물건 순서 ───────── */

test('물건 개수: 3점 20%, 2점 40%, 돌발 물건은 1점 자리를 차지 (10라운드부터 상자 2개)', () => {
  assert.deepEqual(rules.lineupCounts(10, true), { 1: 1, 2: 4, 3: 2, mystery: 2, cursed: 1 });
  assert.deepEqual(rules.lineupCounts(9, true), { 1: 1, 2: 4, 3: 2, mystery: 1, cursed: 1 });
  assert.deepEqual(rules.lineupCounts(10, false), { 1: 4, 2: 4, 3: 2, mystery: 0, cursed: 0 });
  assert.deepEqual(rules.lineupCounts(5, true), { 1: 0, 2: 2, 3: 1, mystery: 1, cursed: 1 });
  assert.deepEqual(rules.lineupCounts(5, false), { 1: 2, 2: 2, 3: 1, mystery: 0, cursed: 0 });
  assert.deepEqual(rules.lineupCounts(15, true), { 1: 3, 2: 6, 3: 3, mystery: 2, cursed: 1 });
});

test('물건 순서: 모든 라운드 수·여러 시드에서 개수·이름·점수가 규칙대로, 마지막은 항상 3점', () => {
  for (let rounds = 5; rounds <= 15; rounds++) {
    for (const surprises of [true, false]) {
      for (let seed = 1; seed <= 20; seed++) {
        const lineup = rules.buildLineup(rounds, surprises, seeded(seed));
        const counts = rules.lineupCounts(rounds, surprises);
        const label = `${rounds}라운드 ${surprises} 시드 ${seed}`;
        assert.equal(lineup.length, rounds, label);
        assert.deepEqual(lineup[rounds - 1].kind, 'normal', label);
        assert.equal(lineup[rounds - 1].points, 3, label);

        const normal = lineup.filter((it) => it.kind === 'normal');
        for (const p of [1, 2, 3]) {
          const ofP = normal.filter((it) => it.points === p);
          assert.equal(ofP.length, counts[p], `${label} ${p}점`);
          for (const it of ofP) assert.ok(items.NORMAL[p].includes(it.name), `${label} ${it.name}`);
        }
        assert.equal(new Set(normal.map((it) => it.name)).size, normal.length, `${label} 이름 겹침`);

        const mystery = lineup.filter((it) => it.kind === 'mystery');
        assert.equal(mystery.length, counts.mystery, label);
        for (const it of mystery) {
          assert.equal(it.name, items.MYSTERY_NAME);
          assert.ok(Number.isInteger(it.points) && it.points >= 0 && it.points <= items.MYSTERY_MAX, label);
        }
        const cursed = lineup.filter((it) => it.kind === 'cursed');
        assert.equal(cursed.length, counts.cursed, label);
        for (const it of cursed) {
          assert.ok(items.CURSED.includes(it.name));
          assert.equal(it.points, items.CURSED_POINTS);
        }
      }
    }
  }
});

test('물건 순서: 미스터리 상자 점수는 0~5 전부 나올 수 있고, 저주 물건 이름도 전부 나올 수 있다', () => {
  assert.equal(rules.buildLineup(5, true, first).find((it) => it.kind === 'mystery').points, 0);
  assert.equal(rules.buildLineup(5, true, last).find((it) => it.kind === 'mystery').points, items.MYSTERY_MAX);
  assert.equal(rules.buildLineup(5, true, first).find((it) => it.kind === 'cursed').name, items.CURSED[0]);
  assert.equal(rules.buildLineup(5, true, last).find((it) => it.kind === 'cursed').name, items.CURSED[items.CURSED.length - 1]);
  const seen = new Set();
  for (let seed = 1; seed <= 200; seed++) seen.add(rules.buildLineup(5, true, seeded(seed)).find((it) => it.kind === 'mystery').points);
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5]);
});

test('물건 순서: 자리를 바꾸지 않는 무작위면 1점 → 2점 → 3점 → 상자 → 저주 → 마지막 3점 순서', () => {
  const lineup = rules.buildLineup(10, true, last);
  assert.deepEqual(lineup.map((it) => it.kind + it.points), [
    'normal1', 'normal2', 'normal2', 'normal2', 'normal2', 'normal3', 'mystery5', 'mystery5', 'cursed-2', 'normal3'
  ]);
  // 이름은 섞은 목록의 뒤에서부터 꺼낸다
  assert.equal(lineup[9].name, items.NORMAL[3][11]);
  assert.equal(lineup[5].name, items.NORMAL[3][10]);
  assert.equal(lineup[0].name, items.NORMAL[1][11]);
});

test('물건 순서: 무작위 함수를 안 넘기면 기본 무작위로 만든다', () => {
  const lineup = rules.buildLineup(10, true);
  assert.equal(lineup.length, 10);
  assert.equal(lineup[9].points, 3);
});

test('화면용 물건 순서: 미스터리 상자 점수는 공개 전까지 숨김', () => {
  const lineup = [
    { kind: 'mystery', name: '상자', points: 4 },
    { kind: 'normal', name: '김밥', points: 1 },
    { kind: 'mystery', name: '상자', points: 0 },
    { kind: 'cursed', name: '인형', points: -2 }
  ];
  const at = (round, revealed) => rules.publicLineup(lineup, round, revealed).map((it) => it.points);
  assert.deepEqual(at(0, false), [null, 1, null, -2]);
  assert.deepEqual(at(1, false), [null, 1, null, -2]);
  assert.deepEqual(at(1, true), [4, 1, null, -2]);
  assert.deepEqual(at(3, false), [4, 1, null, -2]);
  assert.deepEqual(at(3, true), [4, 1, 0, -2]);
  assert.deepEqual(rules.publicLineup(lineup, 2, false)[1], { round: 2, kind: 'normal', name: '김밥', points: 1 });
  assert.deepEqual(rules.publicLineup(undefined, 0, false), []);
});

/* ───────── 입찰 검사 ───────── */

test('입찰 검사: 0~남은 칩 사이 정수만', () => {
  assert.equal(rules.parseBid(0, 10), 0);
  assert.equal(rules.parseBid(10, 10), 10);
  for (const bad of [-1, 11, 1.5, '3', null, undefined, NaN]) {
    assert.throws(() => rules.parseBid(bad, 10), (e) => e.status === 400 && e.message === '입찰은 0~10칩 사이 정수로 해 주세요.', String(bad));
  }
});

/* ───────── 판정 ───────── */

test('판정: 최고액이 혼자면 낙찰, 입찰마다 낸 사람·올인 표시', () => {
  const r = rules.resolveAuction(players([100, 100, 30]), moves([20, 25, 30]), NORMAL3);
  assert.deepEqual(r, {
    outcome: 'win',
    bids: [
      { id: 'p0', bid: 20, submitted: true, allIn: false },
      { id: 'p1', bid: 25, submitted: true, allIn: false },
      { id: 'p2', bid: 30, submitted: true, allIn: true }
    ],
    maxBid: 30,
    minBid: 20,
    winnerIds: ['p2'],
    tiedIds: [],
    cursedIds: [],
    cheap: false,
    points: 3
  });
});

test('판정: 3칩 이하 낙찰은 헐값, 4칩은 아님', () => {
  assert.equal(rules.resolveAuction(players([10, 10]), moves([3, 1]), NORMAL3).cheap, true);
  assert.equal(rules.resolveAuction(players([10, 10]), moves([4, 1]), NORMAL3).cheap, false);
});

test('판정: 최고액 동점이면 아무도 못 가져감, 안 낸 사람은 0', () => {
  const r = rules.resolveAuction(players([50, 50, 50]), moves([40, null, 40]), NORMAL3);
  assert.equal(r.outcome, 'tie');
  assert.deepEqual(r.tiedIds, ['p0', 'p2']);
  assert.deepEqual(r.winnerIds, []);
  assert.equal(r.cheap, false);
  assert.deepEqual(r.bids[1], { id: 'p1', bid: 0, submitted: false, allIn: false });
  assert.equal(r.minBid, 0);
});

test('판정: 3칩 이하 동점·유찰은 헐값 낙찰이 아님', () => {
  assert.equal(rules.resolveAuction(players([10, 10]), moves([2, 2]), NORMAL3).cheap, false);
  assert.equal(rules.resolveAuction(players([10, 10]), moves([0, 0]), NORMAL3).cheap, false);
});

test('판정: 모두 0이면 유찰 (동점이 아님)', () => {
  const r = rules.resolveAuction(players([10, 0]), moves([0, null]), NORMAL3);
  assert.equal(r.outcome, 'nobid');
  assert.deepEqual(r.tiedIds, []);
  assert.deepEqual(r.winnerIds, []);
  assert.equal(r.bids[1].allIn, false, '칩이 0이면 올인 아님');
});

test('판정: 저주 물건은 최저액이 떠안는다 (동점이면 함께, 모두 같으면 전원)', () => {
  const cursed = { kind: 'cursed', points: -2 };
  const r = rules.resolveAuction(players([50, 50, 50]), moves([5, 1, 1]), cursed);
  assert.equal(r.outcome, 'cursed');
  assert.deepEqual(r.cursedIds, ['p1', 'p2']);
  assert.deepEqual(r.winnerIds, []);
  assert.deepEqual(r.tiedIds, []);
  assert.equal(r.points, -2);
  assert.equal(r.cheap, false);
  assert.deepEqual(rules.resolveAuction(players([50, 50]), moves([0, null]), cursed).cursedIds, ['p0', 'p1']);
});

test('판정: 저장된 입찰도 0~남은 칩으로 막는다', () => {
  const r = rules.resolveAuction(players([10, 10, 10]), moves([99, -5, 'x']), NORMAL3);
  assert.deepEqual(r.bids.map((b) => b.bid), [10, 0, 0]);
  assert.equal(r.bids[0].allIn, true);
});

/* ───────── 정산 ───────── */

test('정산: 칩 차감, 낙찰자 점수, 시상식 기록', () => {
  const ps = [
    { id: 'p0', data: { chips: 10, score: 2, stats: {} } },
    { id: 'p1', data: {} },
    { id: 'p2', data: { chips: 5, score: 0, stats: { spent: 1 } } }
  ];
  const result = rules.resolveAuction(
    ps.map((p) => ({ id: p.id, chips: rules.dataOf(p.data, 100).chips })),
    moves([3, 0, 2]),
    NORMAL3
  );
  const out = rules.settle(ps, result, { round: 4, rounds: 10, startChips: 100 });
  assert.deepEqual(out, [
    { id: 'p0', patch: { data: { chips: 7, score: 5, stats: { spent: 3, cheapWins: 1 } } } },
    { id: 'p1', patch: { data: { chips: 100, score: 0, stats: { spent: 0, zeroBids: 1 } } } },
    { id: 'p2', patch: { data: { chips: 3, score: 0, stats: { spent: 3 } } } }
  ]);
  assert.deepEqual(ps[0].data, { chips: 10, score: 2, stats: {} }, '원래 data는 그대로');
});

test('정산: 동점은 공중분해 기록, 올인·탕진(먼저 탕진할수록 큰 값), 이미 0칩이면 짠돌이·탕진 아님', () => {
  const ps = [
    { id: 'p0', data: { chips: 8, score: 0 } },
    { id: 'p1', data: { chips: 20, score: 0 } },
    { id: 'p2', data: { chips: 0, score: 1 } }
  ];
  const result = rules.resolveAuction(players([8, 20, 0]), moves([8, 8, 0]), NORMAL3);
  const out = rules.settle(ps, result, { round: 3, rounds: 10, startChips: 100 });
  assert.deepEqual(out.map((o) => o.patch.data), [
    { chips: 0, score: 0, stats: { spent: 8, burst: 8, allIn: 1, brokeAt: 8 } },
    { chips: 12, score: 0, stats: { spent: 8, burst: 8 } },
    { chips: 0, score: 1, stats: { spent: 0 } }
  ]);
  const lastRound = rules.settle([ps[0]], rules.resolveAuction(players([8]), moves([8]), NORMAL3), { round: 10, rounds: 10, startChips: 100 });
  assert.equal(lastRound[0].patch.data.stats.brokeAt, 1, '마지막 라운드에 탕진하면 1');
});

test('정산: 저주 물건은 떠안은 사람 점수가 깎이고 기록', () => {
  const ps = [{ id: 'p0', data: { chips: 10, score: 3 } }, { id: 'p1', data: { chips: 10, score: 3 } }];
  const result = rules.resolveAuction(players([10, 10]), moves([4, 1]), { kind: 'cursed', points: -2 });
  const out = rules.settle(ps, result, { round: 1, rounds: 5, startChips: 10 });
  assert.deepEqual(out.map((o) => o.patch.data), [
    { chips: 6, score: 3, stats: { spent: 4 } },
    { chips: 9, score: 1, stats: { spent: 1, cursed: 1 } }
  ]);
});

/* ───────── 순위·시상식 ───────── */

test('순위: 점수 합계, 같으면 남은 칩, 둘 다 같으면 같은 순위', () => {
  const ps = [
    { id: 'a', nickname: '가', data: { chips: 10, score: 3 } },
    { id: 'b', nickname: '나', data: { chips: 30, score: 3 } },
    { id: 'c', nickname: '다', data: { chips: 5, score: 6 } },
    { id: 'd', nickname: '라', data: { chips: 10, score: 3 } },
    { id: 'e', nickname: '마', data: {} }
  ];
  assert.deepEqual(rules.ranking(ps, 100), [
    { id: 'c', nickname: '다', chips: 5, score: 6, rank: 1 },
    { id: 'b', nickname: '나', chips: 30, score: 3, rank: 2 },
    { id: 'a', nickname: '가', chips: 10, score: 3, rank: 3 },
    { id: 'd', nickname: '라', chips: 10, score: 3, rank: 3 },
    { id: 'e', nickname: '마', chips: 100, score: 0, rank: 5 }
  ]);
});

test('시상식 정의: 상마다 다른 기록, 문구에 {value} 자리(텅장상 제외)', () => {
  assert.equal(new Set(rules.AWARDS.map((a) => a.id)).size, rules.AWARDS.length);
  assert.equal(new Set(rules.AWARDS.map((a) => a.stat)).size, rules.AWARDS.length);
  for (const a of rules.AWARDS) {
    assert.ok(a.title && a.desc, a.id);
    assert.equal(a.desc.includes('{value}'), a.id !== 'broke', a.id);
  }
  assert.equal(rules.CHEAP_MAX, 3);
});
