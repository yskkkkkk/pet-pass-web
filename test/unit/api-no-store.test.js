/**
 * Vercel에서 Supabase 키가 없을 때: 메모리 저장소로 넘어가지 않고 503을 돌려준다.
 * (node --test는 파일마다 별도 프로세스라 환경변수를 바꿔도 다른 테스트에 영향 없음)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.VERCEL = '1';
delete process.env.GAME_STORE;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

const { call } = require('./helpers'); // helpers는 GAME_STORE를 memory로 설정하므로 다시 되돌린다
delete process.env.GAME_STORE;
process.env.VERCEL = '1';

test('Vercel + Supabase 키 없음 → 503 설정 안내', async () => {
  const { getStore } = require('../../lib/game/store');
  assert.equal(getStore(), null);
  const handler = require('../../api/game');
  const r = await call(handler, { method: 'POST', body: { action: 'create' } });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /SUPABASE_SECRET_KEY/);
});

test('Vercel에서 GAME_STORE=memory를 줘도 메모리 저장소를 쓰지 않는다', () => {
  process.env.GAME_STORE = 'memory';
  delete require.cache[require.resolve('../../lib/game/store')];
  const { getStore } = require('../../lib/game/store');
  assert.equal(getStore(), null);
});
