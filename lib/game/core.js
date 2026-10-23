/**
 * 같이 하는 게임 공통 — 방 코드, 토큰, 닉네임, 오류 형식.
 * 게임별 규칙은 lib/game/games/<id>/ 에 둔다.
 */
const crypto = require('crypto');

const MAX_PLAYERS = 200;
const NICKNAME_MAX = 12;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function generateRoomCode() {
  // 모바일에서 숫자 키패드로 바로 입력할 수 있도록 4자리 숫자 코드 사용
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function normalizeNickname(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}

function normalizeCode(raw) {
  const code = String(raw).trim();
  if (!/^\d{4}$/.test(code)) throw new HttpError(400, '방 코드는 숫자 4자리입니다.');
  return code;
}

async function loadRoom(store, code) {
  const room = await store.getRoom(code);
  if (!room) throw new HttpError(404, '방을 찾을 수 없어요. 코드를 확인해 주세요.');
  return room;
}

module.exports = {
  MAX_PLAYERS,
  NICKNAME_MAX,
  HttpError,
  generateRoomCode,
  generateToken,
  normalizeNickname,
  normalizeCode,
  loadRoom
};
