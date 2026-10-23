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

// 방에 게임 종류를 아직 저장하지 않으므로(game_rooms.game 컬럼 없음) 모든 방은 이 게임으로 본다.
// 두 번째 같이 하는 게임을 추가할 때 컬럼을 추가하고, 방을 만들 때 game을 저장하면 된다.
const DEFAULT_GAME = 'minority';

function getGameInfo(id) {
  for (let i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
  return null;
}

/** 방이 어떤 게임인지 */
function roomGameId(room) {
  return room.game || DEFAULT_GAME;
}

/** 서버 모듈이 있는 같이 하는 게임만 돌려준다 */
function getPartyGame(id) {
  const info = getGameInfo(id);
  if (!info || info.type !== 'party' || !MODULES[id]) return null;
  return { info, module: MODULES[id] };
}

// 목록과 서버 모듈이 어긋나면 배포 전에 바로 알 수 있도록 시작할 때 확인한다.
for (const id of Object.keys(MODULES)) {
  if (!getGameInfo(id)) throw new Error(`[minigame] games.js에 없는 게임 모듈: ${id}`);
  if (MODULES[id].id !== id) throw new Error(`[minigame] 게임 모듈 id 불일치: ${id}`);
}

module.exports = { GAMES, DEFAULT_GAME, getGameInfo, roomGameId, getPartyGame };
