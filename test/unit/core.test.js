const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../lib/game/core');

test('상수', () => {
  assert.equal(core.MAX_PLAYERS, 200);
  assert.equal(core.NICKNAME_MAX, 12);
});

test('HttpError는 상태 코드와 문구를 담는다', () => {
  const e = new core.HttpError(409, '안 돼요');
  assert.ok(e instanceof Error);
  assert.equal(e.status, 409);
  assert.equal(e.message, '안 돼요');
});

test('방 코드: 4자리 숫자 (앞자리 0 포함)', () => {
  for (let i = 0; i < 300; i++) assert.match(core.generateRoomCode(), /^\d{4}$/);
});

test('토큰: 32자리 16진수, 매번 다름', () => {
  const a = core.generateToken();
  const b = core.generateToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test('닉네임: 앞뒤 공백 제거, 연속 공백 하나로, 12자 자르기', () => {
  assert.equal(core.normalizeNickname('  짜장   러버 '), '짜장 러버');
  assert.equal(core.normalizeNickname('가\t\n나'), '가 나');
  assert.equal(core.normalizeNickname('123456789012345'), '123456789012');
  assert.equal(core.normalizeNickname('123456789012'), '123456789012');
  assert.equal(core.normalizeNickname('   '), '');
});

test('닉네임: 문자열이 아니면 빈 문자열', () => {
  assert.equal(core.normalizeNickname(undefined), '');
  assert.equal(core.normalizeNickname(123), '');
  assert.equal(core.normalizeNickname({}), '');
});

test('방 코드 확인: 4자리 숫자만 통과, 앞뒤 공백 허용', () => {
  assert.equal(core.normalizeCode('0123'), '0123');
  assert.equal(core.normalizeCode(' 4567 '), '4567');
  assert.equal(core.normalizeCode(1234), '1234');
  for (const bad of ['123', '12345', 'abcd', '', null, undefined, '12a4']) {
    assert.throws(() => core.normalizeCode(bad), (e) => e instanceof core.HttpError && e.status === 400 && /4자리/.test(e.message), String(bad));
  }
});

test('방 읽기: 있으면 돌려주고, 없으면 404', async () => {
  const store = { getRoom: async (code) => (code === '1111' ? { code } : null) };
  assert.deepEqual(await core.loadRoom(store, '1111'), { code: '1111' });
  await assert.rejects(core.loadRoom(store, '2222'), (e) => e.status === 404 && /찾을 수 없어요/.test(e.message));
});
