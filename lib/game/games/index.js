/**
 * 서버에서 돌아가는 게임(같이 하는 게임) 모음
 *
 * 게임 목록 자체는 public/game/games.js 한 곳에서 관리하고,
 * 여기서는 그중 type 'party' 게임에 서버 모듈을 연결한다.
 *
 * 서버 모듈이 갖춰야 할 것
 *   id           games.js의 id와 같아야 한다
 *   actions      { 이름: async (ctx) => 응답 } — POST /api/game { action: 이름 } 으로 호출된다
 *   hostState    async (ctx) => 진행자 화면 상태
 *   playerState  async (ctx, me) => 참가자 화면 상태
 *   (ctx 형식은 api/game.js 참고)
 */
const GAMES = require('../../../public/game/games.js');

const MODULES = {
  minority: require('./minority')
};

// game 칸이 비어 있는 예전 방은 이 게임으로 본다.
const DEFAULT_GAME = 'minority';

/** 목록과 서버 모듈이 어긋나면 오류. 배포 전에 바로 알 수 있도록 시작할 때 확인한다. */
function validateModules(modules, games) {
  const ids = new Set(games.map((g) => g.id));
  for (const id of Object.keys(modules)) {
    if (!ids.has(id)) throw new Error(`[minigame] games.js에 없는 게임 모듈: ${id}`);
    if (modules[id].id !== id) throw new Error(`[minigame] 게임 모듈 id 불일치: ${id}`);
  }
}

/** 목록과 모듈로 조회 함수들을 만든다. (테스트에서는 가짜 목록·모듈로 만든다) */
function createRegistry(games, modules) {
  validateModules(modules, games);

  function getGameInfo(id) {
    return games.find((g) => g.id === id) || null;
  }

  /** 서버 모듈이 있는 같이 하는 게임만 돌려준다 */
  function getPartyGame(id) {
    const info = getGameInfo(id);
    if (!info || info.type !== 'party' || !modules[id]) return null;
    return { info, module: modules[id] };
  }

  /** 어느 게임 모듈에든 있는 action 이름인지 (방을 읽기 전에 엉뚱한 요청을 거르는 용도) */
  function isKnownGameAction(name) {
    return Object.values(modules).some((m) => Object.prototype.hasOwnProperty.call(m.actions, name));
  }

  return { getGameInfo, getPartyGame, isKnownGameAction };
}

/** 방이 어떤 게임인지 */
function roomGameId(room) {
  return room.game || DEFAULT_GAME;
}

module.exports = {
  GAMES,
  DEFAULT_GAME,
  roomGameId,
  validateModules,
  createRegistry,
  ...createRegistry(GAMES, MODULES)
};
