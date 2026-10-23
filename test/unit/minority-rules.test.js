const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../lib/game/games/minority/rules');
const { QUESTIONS, getQuestion } = require('../../lib/game/games/minority/questions');

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));
const votes = (choices) => choices
  .map((c, i) => (c ? { player_id: 'p' + i, choice: c } : null))
  .filter(Boolean);

test('상수: 최소 3명, 2명 이하가 되면 종료', () => {
  assert.equal(rules.MIN_PLAYERS, 3);
  assert.equal(rules.FINISH_AT_OR_BELOW, 2);
});

test('소수파만 생존: 3 대 2면 B(2명)가 살고 A(3명)가 탈락', () => {
  const r = rules.resolveRound(players(5), votes(['A', 'A', 'A', 'B', 'B']));
  assert.deepEqual(r, {
    aCount: 3, bCount: 2, noVoteCount: 0,
    outcome: 'minority', winningChoice: 'B',
    eliminatedIds: ['p0', 'p1', 'p2'],
    survivorCount: 2, finished: true
  });
});

test('소수파가 A일 때도 같은 규칙: B 다수파 탈락', () => {
  const r = rules.resolveRound(players(6), votes(['A', 'B', 'B', 'B', 'A', 'B']));
  assert.equal(r.outcome, 'minority');
  assert.equal(r.winningChoice, 'A');
  assert.deepEqual(r.eliminatedIds, ['p1', 'p2', 'p3', 'p5']);
  assert.equal(r.survivorCount, 2);
});

test('미투표자는 다수파와 함께 탈락', () => {
  const r = rules.resolveRound(players(6), votes(['A', 'B', 'B', 'B', null, 'A']));
  assert.equal(r.noVoteCount, 1);
  assert.deepEqual(r.eliminatedIds, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(r.finished, true);
});

test('동점이면 투표한 사람은 전원 생존, 미투표자만 탈락', () => {
  const r = rules.resolveRound(players(5), votes(['A', 'A', 'B', 'B', null]));
  assert.equal(r.outcome, 'tie');
  assert.equal(r.winningChoice, null);
  assert.deepEqual(r.eliminatedIds, ['p4']);
  assert.equal(r.survivorCount, 4);
  assert.equal(r.finished, false);
});

test('만장일치면 투표한 사람은 전원 생존', () => {
  const r = rules.resolveRound(players(4), votes(['B', 'B', 'B', null]));
  assert.equal(r.outcome, 'unanimous');
  assert.equal(r.winningChoice, null);
  assert.deepEqual(r.eliminatedIds, ['p3']);
  assert.equal(r.aCount, 0);
  assert.equal(r.bCount, 3);
});

test('A만 만장일치여도 같은 처리', () => {
  const r = rules.resolveRound(players(3), votes(['A', 'A', 'A']));
  assert.equal(r.outcome, 'unanimous');
  assert.deepEqual(r.eliminatedIds, []);
  assert.equal(r.finished, false);
});

test('아무도 투표하지 않으면 라운드 무효 (아무도 탈락하지 않음)', () => {
  const r = rules.resolveRound(players(3), []);
  assert.equal(r.outcome, 'novote');
  assert.deepEqual(r.eliminatedIds, []);
  assert.equal(r.noVoteCount, 3);
  assert.equal(r.survivorCount, 3);
  assert.equal(r.finished, false);
});

test('종료 경계: 생존자가 정확히 2명이면 종료, 3명이면 계속', () => {
  assert.equal(rules.resolveRound(players(3), votes(['A', 'B', 'B'])).finished, true);   // 1명 생존
  assert.equal(rules.resolveRound(players(4), votes(['A', 'A', 'B', 'B'])).finished, false); // 동점 4명
  const two = rules.resolveRound(players(5), votes(['A', 'A', 'B', 'B', 'B']));
  assert.equal(two.survivorCount, 2);
  assert.equal(two.finished, true);
  const three = rules.resolveRound(players(7), votes(['A', 'A', 'A', 'B', 'B', 'B', 'B']));
  assert.equal(three.survivorCount, 3);
  assert.equal(three.finished, false);
});

test('살아있는 사람의 표만 센다 (탈락자 표는 무시)', () => {
  const r = rules.resolveRound(players(3), [...votes(['A', 'B', 'B']), { player_id: 'ghost', choice: 'A' }]);
  assert.equal(r.aCount, 1);
  assert.equal(r.bCount, 2);
});

test('같은 사람이 여러 번 투표하면 마지막 표로 센다', () => {
  const r = rules.resolveRound(players(3), [
    { player_id: 'p0', choice: 'A' }, { player_id: 'p0', choice: 'B' },
    { player_id: 'p1', choice: 'A' }, { player_id: 'p2', choice: 'A' }
  ]);
  assert.equal(r.aCount, 2);
  assert.equal(r.bCount, 1);
});

test('A/B가 아닌 값은 미투표로 본다', () => {
  const r = rules.resolveRound(players(3), [{ player_id: 'p0', choice: 'C' }, ...votes([null, 'A', 'B'])]);
  assert.equal(r.noVoteCount, 1);
  assert.equal(r.aCount, 1);
  assert.equal(r.bCount, 1);
});

test('문제 목록: 30개, id 중복 없음, 모든 항목에 질문과 두 선택지', () => {
  assert.equal(QUESTIONS.length, 30);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 30);
  for (const q of QUESTIONS) {
    assert.ok(q.text && q.a && q.b, `문제 ${q.id}`);
    assert.notEqual(q.a, q.b);
  }
  assert.equal(getQuestion(1).text, QUESTIONS[0].text);
  assert.equal(getQuestion(999), null);
});

test('문제 뽑기: 30번 뽑으면 모두 다른 문제', () => {
  let used = [];
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const { question, usedIds } = rules.pickQuestion(used);
    assert.ok(!seen.has(question.id), '중복 출제');
    seen.add(question.id);
    assert.equal(usedIds.length, i + 1);
    assert.equal(usedIds[usedIds.length - 1], question.id);
    used = usedIds;
  }
});

test('문제 뽑기: 다 쓰면 처음부터 다시 (사용 목록 초기화)', () => {
  const all = QUESTIONS.map((q) => q.id);
  const { question, usedIds } = rules.pickQuestion(all);
  assert.deepEqual(usedIds, [question.id]);
});

test('문제 뽑기: 원래 사용 목록을 바꾸지 않는다', () => {
  const used = [1, 2, 3];
  rules.pickQuestion(used);
  assert.deepEqual(used, [1, 2, 3]);
});

test('문제 바꾸기: 지금 문제는 다시 나오지 않는다 (다 썼을 때 포함)', () => {
  const all = QUESTIONS.map((q) => q.id);
  for (let i = 0; i < 50; i++) {
    assert.notEqual(rules.pickQuestion(all, 7).question.id, 7);
  }
  const allButOne = all.filter((id) => id !== 5);
  for (let i = 0; i < 20; i++) {
    // 남은 건 5번뿐인데 5번을 빼라고 하면 처음부터 다시 뽑되 5번은 제외
    assert.notEqual(rules.pickQuestion(allButOne, 5).question.id, 5);
  }
  assert.equal(rules.pickQuestion(allButOne).question.id, 5);
});

test('문제 뽑기: 사용 목록 없이 부르면 처음 뽑는 것으로 본다', () => {
  const { question, usedIds } = rules.pickQuestion();
  assert.deepEqual(usedIds, [question.id]);
});
