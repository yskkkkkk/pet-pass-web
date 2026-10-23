/**
 * 저장소 선택 규칙 — 환경변수에 따라 Supabase / 메모리 / 없음(null)
 * 매번 모듈을 새로 읽어서 캐시 없이 확인한다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GAME_STORE', 'VERCEL'];

function freshStore(env) {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const path = require.resolve('../../lib/game/store');
  delete require.cache[path];
  const mod = require(path);
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return { mod, store: mod.getStore() };
  } finally {
    console.warn = originalWarn;
  }
}

test('URL과 secret 키가 있으면 Supabase', () => {
  const { store } = freshStore({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k' });
  assert.equal(store.mode, 'supabase');
});

test('키가 있어도 GAME_STORE=memory면 메모리 (로컬)', () => {
  const { store } = freshStore({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k', GAME_STORE: 'memory' });
  assert.equal(store.mode, 'memory');
});

test('GAME_STORE가 memory가 아닌 다른 값이면 무시', () => {
  const { store } = freshStore({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k', GAME_STORE: 'disk' });
  assert.equal(store.mode, 'supabase');
});

test('URL만 있거나 키만 있으면 로컬은 메모리', () => {
  assert.equal(freshStore({ SUPABASE_URL: 'https://example.supabase.co' }).store.mode, 'memory');
  assert.equal(freshStore({ SUPABASE_SECRET_KEY: 'k' }).store.mode, 'memory');
  assert.equal(freshStore({}).store.mode, 'memory');
});

test('Vercel에서는 키가 없으면 null (메모리로 넘어가지 않음)', () => {
  assert.equal(freshStore({ VERCEL: '1' }).store, null);
  assert.equal(freshStore({ VERCEL: '1', SUPABASE_URL: 'https://example.supabase.co' }).store, null);
  assert.equal(freshStore({ VERCEL: '1', GAME_STORE: 'memory' }).store, null);
  assert.equal(freshStore({ VERCEL: '1', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'k' }).store.mode, 'supabase');
});

test('한 번 고른 저장소는 다시 고르지 않는다 (같은 객체)', () => {
  const { mod, store } = freshStore({});
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'k';
  assert.equal(mod.getStore(), store);
});
