/**
 * 블라인드 경매 연출 계획·문구 (public/game/auction/show.js)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const show = require('../../public/game/auction/show.js');

/** 판정 결과 만들기: bids는 [닉네임, 금액, 올인] */
function result(outcome, bids, extra = {}) {
  const rows = bids.map(([nickname, bid, allIn = false], i) => ({ id: 'p' + i, nickname, bid, allIn, submitted: true }));
  const amounts = rows.map((r) => r.bid);
  return {
    outcome,
    bids: rows,
    maxBid: Math.max(...amounts),
    minBid: Math.min(...amounts),
    winnerIds: [],
    tiedIds: [],
    cursedIds: [],
    cheap: false,
    item: { kind: 'normal', name: '김밥', points: 2 },
    ...extra
  };
}

/* ───────── 공개 순서 ───────── */

test('공개 순서: 적은 금액부터(같으면 원래 순서), 낙찰자는 뜸 들인 뒤 마지막', () => {
  const r = result('win', [['가', 20], ['나', 5], ['다', 30], ['라', 5]], { winnerIds: ['p2'] });
  const plan = show.revealPlan(r);
  assert.deepEqual(plan.steps, [
    { id: 'p1', at: 0, final: false },
    { id: 'p3', at: 700, final: false },
    { id: 'p0', at: 1400, final: false },
    { id: 'p2', at: 3600, final: true }
  ]);
  assert.equal(plan.suspenseAt, 2100);
  assert.equal(plan.openAt, null);
  assert.equal(plan.verdictAt, 4300);
  assert.equal(plan.total, 4300 + show.AFTER_MS);
});

test('공개 순서: 인원이 많으면 간격을 줄인다 (최소 0.35초), 중간 인원은 4.2초 안에', () => {
  const many = Array.from({ length: 15 }, (_, i) => ['사람' + i, i + 1]);
  const plan = show.revealPlan(result('win', many, { winnerIds: ['p14'] }));
  assert.deepEqual(plan.steps.slice(0, 3).map((s) => s.at), [0, 350, 700]);
  assert.equal(plan.steps[13].at, 13 * 350);
  const eight = Array.from({ length: 8 }, (_, i) => ['사람' + i, i + 1]);
  assert.deepEqual(show.revealPlan(result('win', eight, { winnerIds: ['p7'] })).steps.slice(0, 2).map((s) => s.at), [0, 600]);
});

test('공개 순서: 동점이면 동점자 모두 마지막에 함께', () => {
  const r = result('tie', [['가', 40], ['나', 10], ['다', 40]], { tiedIds: ['p0', 'p2'] });
  const plan = show.revealPlan(r);
  assert.deepEqual(plan.steps.map((s) => [s.id, s.final]), [['p1', false], ['p0', true], ['p2', true]]);
  assert.equal(plan.steps[1].at, plan.steps[2].at);
  assert.equal(plan.steps[1].at, 700 + show.SUSPENSE_MS);
});

test('공개 순서: 유찰이면 뜸 들이기 없이 모두 공개 후 바로 판정', () => {
  const plan = show.revealPlan(result('nobid', [['가', 0], ['나', 0]]));
  assert.deepEqual(plan.steps.map((s) => [s.id, s.at, s.final]), [['p0', 0, false], ['p1', 700, false]]);
  assert.equal(plan.suspenseAt, null);
  assert.equal(plan.verdictAt, 1400);
});

test('공개 순서: 금액이 모두 같으면 원래(참가) 순서 그대로', () => {
  const plan = show.revealPlan(result('nobid', [['가', 0], ['나', 0], ['다', 0], ['라', 0], ['마', 0]]));
  assert.deepEqual(plan.steps.map((s) => s.id), ['p0', 'p1', 'p2', 'p3', 'p4']);
});

test('공개 순서: 저주 물건은 많은 금액부터, 떠안는 사람(최저액)이 마지막', () => {
  const r = result('cursed', [['가', 3], ['나', 9], ['다', 0], ['라', 9]], { cursedIds: ['p2'], item: { kind: 'cursed', name: '인형', points: -2 } });
  const plan = show.revealPlan(r);
  assert.deepEqual(plan.steps.map((s) => s.id), ['p1', 'p3', 'p0', 'p2']);
  assert.equal(plan.steps[3].final, true);
});

test('공개 순서: 미스터리 상자는 마지막 공개 뒤 상자를 열고 판정', () => {
  const box = { kind: 'mystery', name: '상자', points: 4 };
  const plan = show.revealPlan(result('win', [['가', 1], ['나', 2]], { winnerIds: ['p1'], item: box }));
  assert.equal(plan.steps[1].at, 700 + show.SUSPENSE_MS);
  assert.equal(plan.openAt, plan.steps[1].at + 700);
  assert.equal(plan.verdictAt, plan.openAt + show.BOX_MS);
  const nobid = show.revealPlan(result('nobid', [['가', 0], ['나', 0]], { item: box }));
  assert.equal(nobid.openAt, 1400, '아무도 안 사도 상자는 열어 본다');
  assert.equal(nobid.verdictAt, 1400 + show.BOX_MS);
});

test('휴대폰 대기: 진행 화면의 도장 순간까지 남은 시간 (지났으면 0)', () => {
  const plan = { verdictAt: 4000 };
  assert.equal(show.LEAD_MS, 1100);
  assert.equal(show.phoneWaitMs(plan, 0), 5100);
  assert.equal(show.phoneWaitMs(plan, 5000), 100);
  assert.equal(show.phoneWaitMs(plan, 9000), 0);
});

/* ───────── 손과 칩 ───────── */

test('손 모양: 0칩 빈손, 3칩까지 손가락, 시작 칩의 40%부터 두 팔', () => {
  assert.equal(show.handPose(0, 100), 'empty');
  assert.equal(show.handPose(1, 100), 'finger');
  assert.equal(show.handPose(3, 100), 'finger');
  assert.equal(show.handPose(4, 100), 'push');
  assert.equal(show.handPose(39, 100), 'push');
  assert.equal(show.handPose(40, 100), 'heave');
  assert.equal(show.handPose(20, 50), 'heave');
});

test('칩 더미: 0칩이면 없음, 금액에 비례해 1~12개', () => {
  assert.equal(show.stackSize(0, 100), 0);
  assert.equal(show.stackSize(1, 100), 1);
  assert.equal(show.stackSize(9, 100), 2);
  assert.equal(show.stackSize(50, 100), 6);
  assert.equal(show.stackSize(100, 100), 12);
  assert.equal(show.stackSize(200, 100), 12);
});

/* ───────── 문구 ───────── */

test('헤드라인: 낙찰 · 헐값 · 올인 낙찰', () => {
  const win = result('win', [['가', 20], ['나', 30]], { winnerIds: ['p1'] });
  assert.equal(show.roundHeadline(win, 0), '[호외] 나, 30칩에 ‘김밥’ 낙찰');
  assert.equal(show.roundHeadline(win, 0.99), '[속보] ‘김밥’의 새 주인은 나… 낙찰가 30칩');
  const cheap = result('win', [['가', 1], ['나', 2]], { winnerIds: ['p1'], cheap: true });
  assert.equal(show.roundHeadline(cheap, 0), '[속보] ‘김밥’ 단돈 2칩에 낙찰… 사장님 울고 갑니다');
  assert.equal(show.roundHeadline(cheap, 0.99), '[호외] 나, 헐값 2칩으로 ‘김밥’ 득템');
  const allIn = result('win', [['가', 1], ['나', 30, true]], { winnerIds: ['p1'] });
  assert.equal(show.roundHeadline(allIn, 0), '[호외] 올인 승부수 통했다… 나, ‘김밥’ 손에 넣어');
});

test('헤드라인: 미스터리 상자 꽝(0점)·대박(5점)은 따로, 그 밖의 점수는 보통 낙찰', () => {
  const box = (points) => ({ kind: 'mystery', name: '상자', points });
  const at = (points, cheap = true) => show.roundHeadline(result('win', [['가', 1], ['나', 3]], { winnerIds: ['p1'], cheap, item: box(points) }), 0);
  assert.equal(at(0), '[호외] 거금 3칩 들여 빈 상자 낙찰');
  assert.equal(at(5), '[속보] 정체불명 상자에서 5점… 나 대박');
  assert.equal(at(4), '[속보] ‘상자’ 단돈 3칩에 낙찰… 사장님 울고 갑니다');
  assert.equal(at(4, false), '[호외] 나, 3칩에 ‘상자’ 낙찰');
  const normal = (points) => show.roundHeadline(result('win', [['가', 1], ['나', 9]], { winnerIds: ['p1'], item: { kind: 'normal', name: '김밥', points } }), 0);
  assert.equal(normal(0), '[호외] 나, 9칩에 ‘김밥’ 낙찰', '상자가 아니면 점수와 관계없이 보통 문구');
  assert.equal(normal(5), '[호외] 나, 9칩에 ‘김밥’ 낙찰');
});

test('헤드라인: 동점 공중분해 (올인이 끼면 올인 문구, 날아간 칩 합계)', () => {
  const tie = result('tie', [['가', 15], ['나', 4], ['다', 15]], { tiedIds: ['p0', 'p2'] });
  assert.equal(show.roundHeadline(tie, 0), '[호외] 가, 다 똑같이 15칩… 사이좋게 공중분해');
  assert.equal(show.roundHeadline(tie, 0.99), '[속보] 눈치 싸움 무승부, 칩 30개 증발');
  const allIn = result('tie', [['가', 15], ['나', 15, true]], { tiedIds: ['p0', 'p1'] });
  assert.equal(show.roundHeadline(allIn, 0), '[속보] 올인했는데 동점… 칩 30개 공중분해');
});

test('헤드라인: 유찰, 저주(2명까지 이름, 3명부터 인원수)', () => {
  assert.equal(show.roundHeadline(result('nobid', [['가', 0], ['나', 0]]), 0), '[속보] 아무도 지갑을 안 열었다… ‘김밥’ 유찰');
  assert.equal(show.roundHeadline(result('nobid', [['가', 0]]), 0.99), '[호외] ‘김밥’ 인기 없음, 경매장 정적');
  const doll = { kind: 'cursed', name: '인형', points: -2 };
  const two = result('cursed', [['가', 0], ['나', 0], ['다', 5]], { cursedIds: ['p0', 'p1'], item: doll });
  assert.equal(show.roundHeadline(two, 0), '[호외] ‘인형’ 떠넘기기 성공… 가, 나 당첨');
  assert.equal(show.roundHeadline(two, 0.99), '[속보] 가장 짠 가, 나, ‘인형’ 떠안아');
  const three = result('cursed', [['가', 0], ['나', 0], ['다', 0]], { cursedIds: ['p0', 'p1', 'p2'], item: doll });
  assert.equal(show.roundHeadline(three, 0), '[속보] 3명이 ‘인형’을 사이좋게 나눠 떠안아');
});

test('최종 헤드라인: 공동 1위는 함께', () => {
  const ranking = [
    { nickname: '가', score: 7, rank: 1 },
    { nickname: '나', score: 7, rank: 1 },
    { nickname: '다', score: 2, rank: 3 }
  ];
  assert.equal(show.finalHeadline(ranking, 0), '[호외] 경매왕 가, 나, 7점으로 우승');
  assert.equal(show.finalHeadline(ranking.slice(2).map((r) => ({ ...r, rank: 1 })), 0.99), '[속보] 마지막 망치 소리… 우승은 다');
});

test('내 결과: 낙찰·헐값·공중분해·저주·탈출·유찰·패찰', () => {
  const win = result('win', [['가', 20], ['나', 30]], { winnerIds: ['p1'] });
  assert.deepEqual(show.myVerdict(win, 'p1'), { text: '낙찰', tone: 'live', desc: '30칩으로 ‘김밥’ 낙찰! 2점을 가져왔어요.' });
  assert.deepEqual(show.myVerdict(win, 'p0'), { text: '패찰', tone: 'ink', desc: '20칩은 사라졌어요.' });
  assert.deepEqual(show.myVerdict(win, 'nobody'), { text: '패찰', tone: 'ink', desc: '칩을 아꼈어요.' });
  assert.equal(show.myVerdict({ ...win, cheap: true }, 'p1').text, '헐값 낙찰');

  const tie = result('tie', [['가', 15], ['나', 15]], { tiedIds: ['p0', 'p1'] });
  assert.deepEqual(show.myVerdict(tie, 'p1'), { text: '공중분해', tone: 'out', desc: '똑같이 15칩을 건 사람이 있어서 칩만 날아갔어요.' });
  assert.equal(show.myVerdict(tie, 'p0').text, '공중분해', '목록 첫 번째도');

  const cursed = result('cursed', [['가', 0], ['나', 4]], { cursedIds: ['p0'], item: { kind: 'cursed', name: '인형', points: -2 } });
  assert.deepEqual(show.myVerdict(cursed, 'p0'), { text: '저주', tone: 'out', desc: '가장 적게 걸어서 ‘인형’을 떠안았어요. -2점.' });
  assert.deepEqual(show.myVerdict(cursed, 'p1'), { text: '탈출', tone: 'live', desc: '4칩을 내고 저주를 피했어요.' });

  assert.deepEqual(show.myVerdict(result('nobid', [['가', 0]]), 'p0'), { text: '유찰', tone: 'ink', desc: '아무도 칩을 걸지 않았어요.' });
});

test('시상식 문구와 놀리는 한마디', () => {
  assert.equal(show.awardDesc({ desc: '올인 {value}번', value: 3 }), '올인 3번');
  assert.equal(show.tease(0), show.TEASES[0]);
  assert.equal(show.tease(show.TEASES.length), show.TEASES[0]);
  assert.equal(show.tease(show.TEASES.length + 1), show.TEASES[1]);
  assert.equal(show.TEASES[0], '표정 관리!');
  assert.ok(show.TEASES.every((t) => t.length > 3));
  assert.equal(new Set(show.TEASES).size, show.TEASES.length);
});
