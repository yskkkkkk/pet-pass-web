/**
 * 매장 목록 요청 순서(public/store-requests.js) — 이슈 #128
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const StoreRequests = require('../../public/store-requests.js');

test('처음에는 진행 중인 요청이 없고, 시작하면 진행 중·마지막 요청이 된다', () => {
  const r = StoreRequests.create();
  assert.equal(r.isLoading(), false);
  const a = r.begin(false);
  assert.equal(a.append, false);
  assert.equal(r.isLoading(), true);
  assert.equal(r.isCurrent(a), true);
  r.end(a);
  assert.equal(r.isLoading(), false);
  assert.equal(r.isCurrent(a), false, '끝난 요청은 더 이상 마지막 요청이 아니다');
});

test('조건을 바꾼 요청은 진행 중이어도 보내고, 앞선 요청은 취소·무효가 된다', () => {
  const r = StoreRequests.create();
  const a = r.begin(false);
  const b = r.begin(false);
  assert.ok(b, '새 조건의 요청을 버리지 않는다');
  assert.equal(a.signal.aborted, true, '앞선 요청은 취소');
  assert.equal(b.signal.aborted, false);
  assert.equal(r.isCurrent(a), false);
  assert.equal(r.isCurrent(b), true);
  // 앞선 요청이 늦게 끝나도 진행 중 표시를 풀지 않는다
  r.end(a);
  assert.equal(r.isLoading(), true);
  assert.equal(r.isCurrent(b), true);
  r.end(b);
  assert.equal(r.isLoading(), false);
});

test('여러 번 바꿔도 마지막 조건만 반영된다', () => {
  const r = StoreRequests.create();
  const tickets = [r.begin(false), r.begin(false), r.begin(false), r.begin(false)];
  assert.deepEqual(tickets.map((t) => r.isCurrent(t)), [false, false, false, true]);
  assert.deepEqual(tickets.map((t) => t.signal.aborted), [true, true, true, false]);
});

test('더 보기는 진행 중인 요청이 있으면 보내지 않는다 (진행 중인 요청은 그대로)', () => {
  const r = StoreRequests.create();
  const a = r.begin(false);
  assert.equal(r.begin(true), null);
  assert.equal(a.signal.aborted, false);
  assert.equal(r.isCurrent(a), true);
  r.end(a);
  const more = r.begin(true);
  assert.equal(more.append, true);
  assert.equal(r.isCurrent(more), true);
});

test('더 보기 도중 조건을 바꾸면 더 보기 페이지는 버리고 새 조건을 보낸다', () => {
  const r = StoreRequests.create();
  const more = r.begin(true);
  const next = r.begin(false);
  assert.ok(next);
  assert.equal(more.signal.aborted, true);
  assert.equal(r.isCurrent(more), false);
  assert.equal(r.isCurrent(next), true);
});

test('AbortController가 없는 브라우저에서도 순서 판단은 같다', (t) => {
  const saved = globalThis.AbortController;
  t.after(() => { globalThis.AbortController = saved; });
  globalThis.AbortController = undefined;
  const r = StoreRequests.create();
  const a = r.begin(false);
  assert.equal(a.signal, undefined);
  const b = r.begin(false); // 취소할 것이 없어도 오류 없이 넘어간다
  assert.equal(r.isCurrent(a), false);
  assert.equal(r.isCurrent(b), true);
});

test('요청 목록은 만들 때마다 따로다', () => {
  const r1 = StoreRequests.create();
  const r2 = StoreRequests.create();
  r1.begin(false);
  assert.equal(r2.isLoading(), false);
  assert.ok(r2.begin(true));
});
