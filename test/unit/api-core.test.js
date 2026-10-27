/**
 * /api/game 공통 동작 — 방 만들기 세부, 진행자 설정, 예외 상황
 * 저장소(메모리)를 직접 들여다보거나 잠깐 바꿔서 실패 상황을 만든다.
 */
const { api, call } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../../api/game');
const { getStore, DuplicateError } = require('../../lib/game/store');

const { get, post } = api(handler);
const store = getStore();

/** 저장소 메서드를 잠깐 바꿔 끼운다. 테스트가 끝나면 원래대로 */
function patchStore(t, name, impl) {
  const original = store[name];
  store[name] = impl(original);
  t.after(() => { store[name] = original; });
}

function quiet(t) {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  t.after(() => { console.warn = warn; console.error = error; });
}

async function lobby(names = ['가', '나', '다']) {
  const { body: { code, hostToken } } = await post({ action: 'create' });
  const tokens = [];
  for (const n of names) tokens.push((await post({ action: 'join', code, nickname: n })).body.playerToken);
  return { code, hostToken, tokens };
}

test('방 만들기: 게임 종류와 설정 기본값을 저장한다', async () => {
  const { body } = await post({ action: 'create', game: 'minority' });
  const room = await store.getRoom(body.code);
  assert.equal(room.game, 'minority');
  assert.deepEqual(room.settings, {});
  assert.equal(room.host_token, body.hostToken);
  assert.equal(room.status, 'lobby');
});

test('방 만들기: 12시간 넘게 갱신 없는 방만 정리한다', async (t) => {
  const { body: { code } } = await post({ action: 'create' });
  const updatedAt = Date.parse((await store.getRoom(code)).updated_at);
  const realNow = Date.now;
  t.after(() => { Date.now = realNow; });

  Date.now = () => updatedAt + 12 * 60 * 60 * 1000 - 1000; // 11시간 59분 59초 뒤
  await post({ action: 'create' });
  assert.ok(await store.getRoom(code), '12시간이 안 됐으면 남는다');

  Date.now = () => updatedAt + 12 * 60 * 60 * 1000 + 1000; // 12시간 1초 뒤
  await post({ action: 'create' });
  assert.equal(await store.getRoom(code), null, '12시간이 지나면 정리된다');
});

test('방 만들기: 정리에 실패해도 방은 만든다', async (t) => {
  quiet(t);
  patchStore(t, 'deleteRoomsOlderThan', () => async () => { throw new Error('DB 오류'); });
  const r = await post({ action: 'create' });
  assert.equal(r.status, 200);
  assert.ok(await store.getRoom(r.body.code));
});

test('방 만들기: 코드가 겹치면 다시 시도하고, 8번 모두 겹치면 503', async (t) => {
  let calls = 0;
  patchStore(t, 'createRoom', (original) => async (room) => {
    calls += 1;
    if (calls < 3) throw new DuplicateError();
    return original(room);
  });
  const ok = await post({ action: 'create' });
  assert.equal(ok.status, 200);
  assert.equal(calls, 3, '두 번 겹치고 세 번째에 성공');

  calls = 0;
  store.createRoom = async () => { calls += 1; throw new DuplicateError(); };
  const fail = await post({ action: 'create' });
  assert.equal(fail.status, 503);
  assert.equal(fail.body.error, '방 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  assert.equal(calls, 8, '정확히 8번 시도');
});

test('방 만들기: 겹침이 아닌 저장소 오류는 다시 시도하지 않고 500', async (t) => {
  quiet(t);
  let calls = 0;
  patchStore(t, 'createRoom', () => async () => { calls += 1; throw new Error('연결 끊김'); });
  const r = await post({ action: 'create' });
  assert.equal(r.status, 500);
  assert.equal(r.body.error, '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
  assert.equal(calls, 1);
});

test('참가: 저장소 오류는 닉네임 중복이 아니라 500', async (t) => {
  quiet(t);
  const { code } = await lobby([]);
  patchStore(t, 'joinRoom', () => async () => { throw new Error('연결 끊김'); });
  const r = await post({ action: 'join', code, nickname: '가' });
  assert.equal(r.status, 500);
});

test('참가: 최대 인원(200명)까지, 그다음은 409', async () => {
  const { code } = await lobby([]);
  for (let i = 0; i < 200; i++) {
    const r = await post({ action: 'join', code, nickname: 'p' + i });
    assert.equal(r.status, 200, `${i + 1}번째`);
  }
  const full = await post({ action: 'join', code, nickname: 'over' });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, '방 인원이 가득 찼어요.');
});

test('목록에서 빠진 게임의 방: 410', async () => {
  await store.createRoom({ code: '0410', host_token: 'h', game: 'gone' });
  for (const r of [
    await get({ action: 'info', code: '0410' }),
    await get({ action: 'state', code: '0410', hostToken: 'h' }),
    await post({ action: 'join', code: '0410', nickname: '가' })
  ]) {
    assert.equal(r.status, 410);
    assert.equal(r.body.error, '더 이상 제공하지 않는 게임의 방이에요.');
  }
});

test('game 칸이 비어 있는 예전 방은 소수결로 동작', async () => {
  await store.createRoom({ code: '0411', host_token: 'h', game: null });
  const info = await get({ action: 'info', code: '0411' });
  assert.equal(info.body.game, 'minority');
});

test('진행자 설정: 진행자만, 대기실에서만, 정의된 설정만', async () => {
  const { code, hostToken } = await lobby();
  const ok = await post({ action: 'settings', code, hostToken, settings: {} });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { settings: {} });
  assert.equal((await post({ action: 'settings', code, hostToken })).status, 200, '설정을 안 보내면 그대로');

  const notHost = await post({ action: 'settings', code, hostToken: 'x', settings: {} });
  assert.equal(notHost.status, 403);
  const unknown = await post({ action: 'settings', code, hostToken, settings: { rounds: 5 } });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error, '알 수 없는 설정이에요: rounds');
  const bad = await post({ action: 'settings', code, hostToken, settings: 'x' });
  assert.equal(bad.status, 400);

  await post({ action: 'start', code, hostToken });
  const playing = await post({ action: 'settings', code, hostToken, settings: {} });
  assert.equal(playing.status, 409);
  assert.equal(playing.body.error, '설정은 대기실에서만 바꿀 수 있어요.');
});

test('진행자 설정: 검사와 저장 사이에 게임이 시작되면 409', async (t) => {
  const { code, hostToken } = await lobby();
  patchStore(t, 'updateRoom', (original) => async (c, patch, where) => {
    await original(c, { status: 'voting' });
    return original(c, patch, where);
  });
  const r = await post({ action: 'settings', code, hostToken, settings: {} });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, '설정은 대기실에서만 바꿀 수 있어요.');
});

test('같은 도메인 확인: 경로가 붙은 출처, http/https 외 출처는 거절', async () => {
  for (const origin of ['http://localhost:3000/path', 'ftp://localhost:3000', 'http://localhost:3001', 'null']) {
    const r = await call(handler, { method: 'POST', body: { action: 'create' }, headers: { origin } });
    assert.equal(r.status, 403, origin);
  }
  const https = await call(handler, { method: 'POST', body: { action: 'create' }, headers: { origin: 'https://localhost:3000' } });
  assert.equal(https.status, 200);
});

test('다른 도메인 요청은 방을 찾기 전에 403', async () => {
  const r = await call(handler, { method: 'GET', query: { action: 'info', code: '1234' }, headers: { origin: 'https://evil.example.com' } });
  assert.equal(r.status, 403);
});

test('같은 도메인 확인: 허용 목록에 없는 도메인에서는 http/https 모두 같은 도메인이면 통과', async () => {
  const headers = (origin) => ({ host: 'game.example.org', origin });
  const http = await call(handler, { method: 'POST', body: { action: 'create' }, headers: headers('http://game.example.org') });
  assert.equal(http.status, 200, 'http');
  const https = await call(handler, { method: 'POST', body: { action: 'create' }, headers: headers('https://game.example.org') });
  assert.equal(https.status, 200, 'https');
  const prefixed = await call(handler, { method: 'POST', body: { action: 'create' }, headers: headers('evil-https://game.example.org') });
  assert.equal(prefixed.status, 403, '앞에 다른 글자가 붙은 출처는 거절');
  const sub = await call(handler, { method: 'POST', body: { action: 'create' }, headers: headers('https://evil.game.example.org') });
  assert.equal(sub.status, 403, '하위 도메인은 다른 도메인');
});

test('문제 바꾸기: 저장 직전에 결과가 공개되면 409 안내', async (t) => {
  const { code, hostToken } = await lobby();
  await post({ action: 'start', code, hostToken });
  patchStore(t, 'updateRoom', (original) => async (c, patch, where) => {
    await original(c, { status: 'revealed' });
    return original(c, patch, where);
  });
  const r = await post({ action: 'reroll', code, hostToken });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, '라운드 상태가 바뀌었어요. 화면을 새로고침해 주세요.');
});
