const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../../lib/game/games');
const rules = require('../../lib/game/games/minority/rules');
const core = require('../../lib/game/core');
const GAMES = require('../../public/game/games.js');

test('게임 목록: id 중복 없음, 필수 항목, type은 party/solo, path는 /game/<id>', () => {
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  for (const g of GAMES) {
    assert.ok(g.id && g.name && g.tagline, g.id);
    assert.ok(['party', 'solo'].includes(g.type), g.id);
    assert.equal(g.path, '/game/' + g.id);
  }
});

test('같이 하는 게임: 서버 모듈, 인원 범위, 설정 정의가 있다', () => {
  for (const g of GAMES.filter((x) => x.type === 'party')) {
    assert.ok(registry.getPartyGame(g.id), g.id);
    assert.ok(Number.isInteger(g.minPlayers) && g.minPlayers >= 2, g.id);
    assert.ok(g.maxPlayers >= g.minPlayers && g.maxPlayers <= core.MAX_PLAYERS, g.id);
    assert.ok(Array.isArray(g.settings), g.id);
    for (const f of g.settings) assert.ok(f.key && f.label && f.type && 'default' in f, `${g.id}.${f.key}`);
  }
});

test('소수결: 목록의 최소 인원과 규칙의 최소 인원이 같다', () => {
  assert.equal(registry.getGameInfo('minority').minPlayers, rules.MIN_PLAYERS);
});

test('실제 목록 조회 함수', () => {
  assert.equal(registry.getGameInfo('minority').name, '소수결 게임');
  assert.equal(registry.getGameInfo('nope'), null);
  const m = registry.getPartyGame('minority');
  assert.equal(m.info.id, 'minority');
  assert.equal(m.module.id, 'minority');
  assert.equal(registry.getPartyGame('nope'), null);
  assert.equal(registry.isKnownGameAction('vote'), true);
  assert.equal(registry.isKnownGameAction('nope'), false);
  assert.equal(registry.isKnownGameAction('toString'), false, '객체 기본 속성은 action이 아님');
  assert.equal(registry.isKnownGameAction(undefined), false);
});

test('roomGameId: game 칸이 비어 있는 예전 방은 기본 게임', () => {
  assert.equal(registry.DEFAULT_GAME, 'minority');
  assert.equal(registry.roomGameId({}), 'minority');
  assert.equal(registry.roomGameId({ game: null }), 'minority');
  assert.equal(registry.roomGameId({ game: 'other' }), 'other');
});

test('createRegistry: 혼자 하는 게임과 서버 모듈 없는 게임은 같이 하는 게임이 아님', () => {
  const games = [
    { id: 'p', type: 'party' },
    { id: 's', type: 'solo' },
    { id: 'nomod', type: 'party' }
  ];
  const modules = { p: { id: 'p', actions: { go: () => 1 } }, s: { id: 's', actions: { solo: () => 1 } } };
  const r = registry.createRegistry(games, modules);
  assert.equal(r.getPartyGame('p').module, modules.p);
  assert.equal(r.getPartyGame('s'), null, '혼자 하는 게임은 모듈이 있어도 아님');
  assert.equal(r.getPartyGame('nomod'), null);
  assert.equal(r.getGameInfo('s').type, 'solo');
  assert.equal(r.isKnownGameAction('go'), true);
  assert.equal(r.isKnownGameAction('solo'), true);
  assert.equal(r.isKnownGameAction('nope'), false);
});

test('createRegistry: 만들 때 목록과 모듈이 맞는지 확인한다', () => {
  assert.throws(() => registry.createRegistry([{ id: 'a' }], { b: { id: 'b', actions: {} } }), /games.js에 없는 게임 모듈: b/);
  assert.throws(() => registry.createRegistry([{ id: 'a' }], { a: { id: 'x', actions: {} } }), /id 불일치: a/);
  assert.doesNotThrow(() => registry.validateModules({}, []));
});
