/**
 * 진행자 설정 — 게임 목록(public/game/games.js)의 settings 정의로 기본값을 만들고, 바꾼 값을 검사한다.
 *
 * 정의 한 줄: { key, label, type, default, ... }
 *   type 'int'    min, max (정수만)
 *   type 'bool'   true / false
 *   type 'choice' options: [{ value, label }]
 */
const { HttpError } = require('./core');

function defaultsOf(schema = []) {
  const out = {};
  for (const field of schema) out[field.key] = field.default;
  return out;
}

function validateValue(field, value) {
  if (field.type === 'int') {
    if (!Number.isInteger(value) || value < field.min || value > field.max) {
      throw new HttpError(400, `${field.label}은(는) ${field.min}~${field.max} 사이 정수여야 해요.`);
    }
    return value;
  }
  if (field.type === 'bool') {
    if (typeof value !== 'boolean') throw new HttpError(400, `${field.label} 값이 올바르지 않아요.`);
    return value;
  }
  if (field.type === 'choice') {
    if (!field.options.some((o) => o.value === value)) throw new HttpError(400, `${field.label} 값이 올바르지 않아요.`);
    return value;
  }
  throw new Error(`[minigame] 알 수 없는 설정 종류: ${field.type}`);
}

/**
 * 현재 설정에 바꾼 값을 합친다. 정의에 없는 키나 잘못된 값은 400.
 * @returns {object} 새 설정 (current는 바꾸지 않음)
 */
function applySettings(schema = [], current = {}, patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new HttpError(400, '설정 형식이 올바르지 않아요.');
  }
  const next = { ...defaultsOf(schema), ...current };
  for (const key of Object.keys(patch)) {
    const field = schema.find((f) => f.key === key);
    if (!field) throw new HttpError(400, `알 수 없는 설정이에요: ${key}`);
    next[key] = validateValue(field, patch[key]);
  }
  return next;
}

module.exports = { defaultsOf, applySettings };
