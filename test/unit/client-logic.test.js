/**
 * 화면 공통 로직(public/game/shared/logic.js)과 소수결 문구(public/game/minority/text.js)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const MG = require('../../public/game/shared/logic.js');
const text = require('../../public/game/minority/text.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setImmediate(r));

/* ───────── escapeHtml / pickOne / fill ───────── */

test('escapeHtml: 다섯 가지 문자를 모두 바꾸고, null·undefined는 빈 문자열', () => {
  assert.equal(MG.escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(MG.escapeHtml(null), '');
  assert.equal(MG.escapeHtml(undefined), '');
  assert.equal(MG.escapeHtml(0), '0');
  assert.equal(MG.escapeHtml('&&'), '&amp;&amp;');
});

test('pickOne: rnd 위치의 항목, 생략하면 목록 안의 아무거나', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.equal(MG.pickOne(list, 0), 'a');
  assert.equal(MG.pickOne(list, 0.49), 'b');
  assert.equal(MG.pickOne(list, 0.5), 'c');
  assert.equal(MG.pickOne(list, 0.999), 'd');
  for (let i = 0; i < 50; i++) assert.ok(list.includes(MG.pickOne(list)));
});

test('fill: {이름}을 값으로, 없는 이름은 그대로', () => {
  assert.equal(MG.fill('{a} 대 {b}', { a: 3, b: 0 }), '3 대 0');
  assert.equal(MG.fill('{a}{a}', { a: 'x' }), 'xx');
  assert.equal(MG.fill('{missing} {toString}', {}), '{missing} {toString}');
  assert.equal(MG.fill('그대로', { a: 1 }), '그대로');
});

/* ───────── latestOnly ───────── */

test('latestOnly: 늦게 도착한 예전 응답은 버린다', async () => {
  const calls = [];
  const get = MG.latestOnly(() => { const d = deferred(); calls.push(d); return d.promise; });
  const first = get();
  const second = get();
  calls[1].resolve('새 응답');
  assert.equal(await second, '새 응답');
  calls[0].resolve('예전 응답');
  assert.equal(await first, null);
});

test('latestOnly: 순서대로 오면 모두 받는다, 같은 번호(자기 자신)는 받는다', async () => {
  let n = 0;
  const get = MG.latestOnly(() => Promise.resolve(++n));
  assert.equal(await get(), 1);
  assert.equal(await get(), 2);
  const calls = [];
  const get2 = MG.latestOnly(() => { const d = deferred(); calls.push(d); return d.promise; });
  const a = get2();
  const b = get2();
  calls[0].resolve('a');
  assert.equal(await a, 'a', '먼저 보낸 응답이 먼저 오면 받는다');
  calls[1].resolve('b');
  assert.equal(await b, 'b');
});

test('latestOnly: 인자를 그대로 넘기고, 실패는 그대로 전달', async () => {
  const get = MG.latestOnly((x, y) => (x === 'bad' ? Promise.reject(new Error('실패')) : Promise.resolve(x + y)));
  assert.equal(await get(1, 2), 3);
  await assert.rejects(get('bad'), /실패/);
  assert.equal(await get(2, 2), 4, '실패한 뒤에도 계속 동작');
});

/* ───────── createSerialSender ───────── */

function sender(extra = {}) {
  const sent = [];
  const calls = [];
  const events = [];
  const s = MG.createSerialSender({
    send: (v) => { sent.push(v); const d = deferred(); calls.push(d); return d.promise; },
    onSaved: (v) => events.push(['saved', v]),
    onError: (e, v) => events.push(['error', v, e.message]),
    ...extra
  });
  return { s, sent, calls, events };
}

test('순차 전송: 보내는 중에 값을 바꾸면 앞 요청이 끝난 뒤 마지막 값만 보낸다', async () => {
  const { s, sent, calls, events } = sender();
  s.push('A');
  await flush();
  s.push('B');
  s.push('A');
  s.push('B');
  await flush();
  assert.deepEqual(sent, ['A'], '앞 요청이 끝나기 전에는 더 보내지 않음');
  assert.equal(s.wanted(), 'B');
  assert.equal(s.isSaving(), true);
  calls[0].resolve();
  await flush(); await flush();
  assert.deepEqual(sent, ['A', 'B'], '중간 값은 건너뛰고 마지막 값만');
  calls[1].resolve();
  await flush(); await flush();
  assert.equal(s.saved(), 'B');
  assert.equal(s.isSaving(), false);
  assert.deepEqual(events, [['saved', 'A'], ['saved', 'B']]);
});

test('순차 전송: 이미 고른 값을 다시 고르면 보내지 않는다, 저장된 값으로 돌아가도 보내지 않는다', async () => {
  const { s, sent, calls } = sender();
  s.push('A');
  await flush();
  calls[0].resolve();
  await flush(); await flush();
  s.push('A');
  await flush();
  assert.deepEqual(sent, ['A']);
  s.push('B');
  await flush();
  s.push('A');
  await flush();
  calls[1].resolve();
  await flush(); await flush();
  assert.deepEqual(sent, ['A', 'B', 'A'], 'B를 보내는 동안 A로 돌아왔으면 A를 다시 보냄');
  calls[2].resolve();
  await flush(); await flush();
  assert.equal(s.saved(), 'A');
});

test('순차 전송: 마지막 값이 실패하면 저장된 값으로 되돌리고 알린다', async () => {
  const { s, calls, events } = sender();
  s.push('A');
  await flush();
  calls[0].resolve();
  await flush(); await flush();
  s.push('B');
  await flush();
  calls[1].reject(new Error('투표 마감'));
  await flush(); await flush();
  assert.equal(s.wanted(), 'A', '저장된 값으로 되돌림');
  assert.equal(s.isSaving(), false);
  assert.deepEqual(events.at(-1), ['error', 'B', '투표 마감']);
});

test('순차 전송: 처음 값이 실패하면 고른 값 없음으로', async () => {
  const { s, calls } = sender();
  s.push('A');
  await flush();
  calls[0].reject(new Error('x'));
  await flush(); await flush();
  assert.equal(s.wanted(), null);
  assert.equal(s.saved(), null);
  assert.equal(s.isSaving(), false);
});

test('순차 전송: 실패한 값 다음에 이미 새 값을 골랐으면 그 값을 이어서 보낸다', async () => {
  const { s, sent, calls, events } = sender();
  s.push('A');
  await flush();
  s.push('B');
  calls[0].reject(new Error('x'));
  await flush(); await flush();
  assert.deepEqual(sent, ['A', 'B']);
  assert.equal(s.wanted(), 'B', '실패한 A가 아니라 새로 고른 B를 유지');
  calls[1].resolve();
  await flush(); await flush();
  assert.equal(s.saved(), 'B');
  assert.deepEqual(events.map((e) => e[0]), ['error', 'saved']);
});

test('순차 전송: equals로 값 비교 방법을 정할 수 있다 (라운드+선택)', async () => {
  const { s, sent, calls } = sender({ equals: (a, b) => a.round === b.round && a.choice === b.choice });
  s.push({ round: 1, choice: 'A' });
  await flush();
  calls[0].resolve();
  await flush(); await flush();
  s.push({ round: 1, choice: 'A' });
  await flush();
  assert.equal(sent.length, 1, '내용이 같은 새 객체는 같은 값');
  s.push({ round: 2, choice: 'A' });
  await flush();
  assert.equal(sent.length, 2, '라운드가 다르면 다른 값');
});

test('순차 전송: onSaved·onError 없이도 동작, send가 바로 예외를 던져도 처리', async () => {
  const s = MG.createSerialSender({ send: (v) => { if (v === 'boom') throw new Error('x'); return Promise.resolve(); } });
  await s.push('ok');
  assert.equal(s.saved(), 'ok');
  await s.push('boom');
  assert.equal(s.wanted(), 'ok');
  assert.equal(s.isSaving(), false);
});

test('순차 전송: 고른 값이 없으면 저장 중이 아님', () => {
  const { s } = sender();
  assert.equal(s.isSaving(), false);
  assert.equal(s.wanted(), null);
  assert.equal(s.saved(), null);
});

/* ───────── 소수결 헤드라인 ───────── */

const Q = { a: '짜장면', b: '짬뽕' };

test('헤드라인: 소수파 생존 — 이긴 쪽 이름, 진 쪽 인원·이름', () => {
  const r = { outcome: 'minority', winningChoice: 'B', aCount: 3, bCount: 1 };
  assert.equal(text.roundHeadline(r, Q, 0), '[호외] 소수파 ‘짬뽕’ 생존… 다수파 3명 집단 탈락');
  assert.equal(text.roundHeadline(r, Q, 0.4), '[속보] ‘짜장면’ 고른 3명, 단체로 짐 싸');
  assert.equal(text.roundHeadline(r, Q, 0.99), '[호외] 남들 따라가다 3명 탈락');
  const rA = { outcome: 'minority', winningChoice: 'A', aCount: 1, bCount: 4 };
  assert.equal(text.roundHeadline(rA, Q, 0), '[호외] 소수파 ‘짜장면’ 생존… 다수파 4명 집단 탈락');
  assert.equal(text.roundHeadline(rA, Q, 0.4), '[속보] ‘짬뽕’ 고른 4명, 단체로 짐 싸');
});

test('헤드라인: 동점, 만장일치(A·B), 무효', () => {
  assert.equal(text.roundHeadline({ outcome: 'tie', aCount: 2, bCount: 2 }, Q, 0), '[속보] 2 대 2, 정확히 반반… 전원 생존');
  assert.equal(text.roundHeadline({ outcome: 'unanimous', aCount: 3, bCount: 0 }, Q, 0), '[호외] 전원 ‘짜장면’… 다들 생각이 똑같네');
  assert.equal(text.roundHeadline({ outcome: 'unanimous', aCount: 0, bCount: 3 }, Q, 0.9), '[속보] 만장일치 ‘짬뽕’, 소수파 실종');
  assert.equal(text.roundHeadline({ outcome: 'novote', aCount: 0, bCount: 0 }, Q, 0), '[속보] 아무도 안 골랐다');
  assert.equal(text.roundHeadline({ outcome: 'weird', aCount: 0, bCount: 0 }, Q, 0), '[속보] 아무도 안 골랐다', '모르는 결과는 무효 문구');
});

test('헤드라인: 문제 정보가 없으면 A/B로 표시', () => {
  assert.equal(text.roundHeadline({ outcome: 'minority', winningChoice: 'A', aCount: 1, bCount: 2 }, null, 0), '[호외] 소수파 ‘A’ 생존… 다수파 2명 집단 탈락');
});

test('헤드라인: 종료 — 생존자 이름을 쉼표로', () => {
  assert.equal(text.finalHeadline(['가'], 0), '[호외] 최후의 생존자 가');
  assert.equal(text.finalHeadline(['가', '나'], 0.9), '[속보] 가, 나, 끝까지 남들과 달랐다');
});

test('헤드라인 목록: 모든 상황에 문구가 2개 이상, 모두 [호외] 또는 [속보]로 시작', () => {
  for (const [key, list] of Object.entries(text.HEADLINES)) {
    assert.ok(list.length >= 2, key);
    for (const line of list) assert.match(line, /^\[(호외|속보)\] /, line);
  }
});
