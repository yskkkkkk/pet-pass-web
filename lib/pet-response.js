/**
 * 국가동물보호정보시스템(공공데이터포털) 동물등록 조회 응답 해석
 * /api/get-pet-data, /api/auth-pet(Vercel), 로컬 server.js가 함께 쓴다.
 *
 * _type=json으로 요청해도 XML이 올 때가 있어 두 형식을 같은 모양({ resultCode, resultMsg, item })으로 맞춘다.
 * "통신 성공(resultCode 00)"과 "등록 정보가 있음"은 다르다: 조회 결과가 0건이거나 태그가 비어 있어도 00이 온다.
 */

// 화면에 쓰는 칸 (XML에서 꺼낼 태그)
const PET_FIELDS = ['dogNm', 'kindNm', 'sexNm', 'neuterYn', 'orgNm', 'officNm', 'birthDt', 'dogRegNo', 'rfidCd'];

function clean(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? clean(match[1]) : null;
}

/** 등록 정보 한 건 (값이 하나도 없으면 null) */
function normalizeItem(raw) {
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item || typeof item !== 'object') return null;
  const out = {};
  let any = false;
  for (const [key, value] of Object.entries(item)) {
    out[key] = clean(value);
    if (out[key] !== null) any = true;
  }
  return any ? out : null;
}

/**
 * @param {string|object} data axios 응답 본문
 * @returns {{ resultCode: string|null, resultMsg: string|null, item: object|null }}
 */
function parsePetResponse(data) {
  if (typeof data === 'string' && data.includes('<?xml')) {
    const itemXml = (data.match(/<item>([\s\S]*?)<\/item>/) || [])[1];
    let item = null;
    if (itemXml) {
      item = {};
      for (const field of PET_FIELDS) item[field] = xmlValue(itemXml, field);
      item = normalizeItem(item);
    }
    return { resultCode: xmlValue(data, 'resultCode'), resultMsg: xmlValue(data, 'resultMsg'), item };
  }
  const response = (data && data.response) || {};
  const header = response.header || {};
  const body = response.body || {};
  const raw = body.item !== undefined ? body.item : body.items && body.items.item;
  return { resultCode: clean(header.resultCode), resultMsg: clean(header.resultMsg), item: normalizeItem(raw) };
}

/** 실제 등록 정보가 있는지 (이름이 있어야 펫 패스를 만들 수 있다) */
function hasPetData(item) {
  return Boolean(item && item.dogNm);
}

// 통신은 성공했지만 등록 정보가 없을 때 화면에 보여줄 안내 (세 경로가 같은 문구를 쓴다)
const NO_DATA = {
  success: false,
  errorTitle: '등록 정보를 확인할 수 없어요',
  error: '국가동물보호관리시스템에 등록된 정보를 가져오지 못했습니다. 번호가 정확한데도 계속 안 된다면, 아직 승인 대기 중일 수 있습니다.'
};

module.exports = { PET_FIELDS, parsePetResponse, hasPetData, NO_DATA };
