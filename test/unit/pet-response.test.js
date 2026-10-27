/**
 * 동물등록 조회 응답 해석과 두 API(/api/get-pet-data, /api/auth-pet) — 이슈 #131
 * 정부 API는 axios를 바꿔 끼워 흉내 낸다 (실제 호출 없음).
 */
const { call } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { parsePetResponse, hasPetData, NO_DATA } = require('../../lib/pet-response');

const xml = (body, code = '00', msg = 'NORMAL SERVICE.') =>
  `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>${code}</resultCode><resultMsg>${msg}</resultMsg></header><body>${body}</body></response>`;
const FULL_ITEM = '<item><dogNm>초코</dogNm><kindNm>푸들</kindNm><sexNm>암컷</sexNm><neuterYn>중성</neuterYn><orgNm>성남시</orgNm><birthDt>20240301</birthDt></item>';

/* ───────── 해석 ───────── */

test('XML: 등록 정보가 있으면 칸별로 꺼낸다', () => {
  const r = parsePetResponse(xml(FULL_ITEM));
  assert.equal(r.resultCode, '00');
  assert.equal(r.resultMsg, 'NORMAL SERVICE.');
  assert.equal(r.item.dogNm, '초코');
  assert.equal(r.item.birthDt, '20240301');
  assert.equal(r.item.officNm, null);
  assert.equal(hasPetData(r.item), true);
});

test('XML: 0건(항목 없음)·빈 태그·공백만 있는 이름은 등록 정보가 아니다', () => {
  for (const body of ['<totalCount>0</totalCount>', '<item></item>', '<item><dogNm> </dogNm><kindNm></kindNm></item>', '<item><kindNm>푸들</kindNm></item>']) {
    const r = parsePetResponse(xml(body));
    assert.equal(r.resultCode, '00', body);
    assert.equal(hasPetData(r.item), false, body);
  }
  assert.equal(parsePetResponse(xml('<totalCount>0</totalCount>')).item, null);
  assert.equal(parsePetResponse(xml('<item></item>')).item, null, '값이 하나도 없으면 null');
  assert.equal(parsePetResponse(xml('<item><kindNm>푸들</kindNm></item>')).item.kindNm, '푸들');
});

test('XML: 태그 안 줄바꿈·앞뒤 공백은 정리하고, 결과 코드가 없으면 null', () => {
  const r = parsePetResponse('<?xml version="1.0"?><response><body><item><dogNm>\n  초코 \n</dogNm></item></body></response>');
  assert.equal(r.item.dogNm, '초코');
  assert.equal(r.resultCode, null);
  assert.equal(r.resultMsg, null);
});

test('JSON: item이 객체·배열·items.item이어도 같은 모양, 값이 모두 비면 null', () => {
  const json = (body, header = { resultCode: '00', resultMsg: 'OK' }) => ({ response: { header, body } });
  assert.equal(parsePetResponse(json({ item: { dogNm: '초코', kindNm: '푸들' } })).item.dogNm, '초코');
  assert.equal(parsePetResponse(json({ item: [{ dogNm: '두리' }, { dogNm: '세리' }] })).item.dogNm, '두리');
  assert.equal(parsePetResponse(json({ items: { item: { dogNm: '나리' } } })).item.dogNm, '나리');
  assert.equal(parsePetResponse(json({ item: { dogNm: '', kindNm: null } })).item, null);
  assert.equal(parsePetResponse(json({ item: { dogNm: 7 } })).item.dogNm, '7');
  assert.equal(parsePetResponse(json({})).item, null);
  assert.equal(parsePetResponse(json({ item: 'x' })).item, null);
  assert.equal(parsePetResponse(json({ item: [] })).item, null);
  const r = parsePetResponse(json({ totalCount: 0 }));
  assert.deepEqual(r, { resultCode: '00', resultMsg: 'OK', item: null });
  assert.deepEqual(parsePetResponse({}), { resultCode: null, resultMsg: null, item: null });
  assert.deepEqual(parsePetResponse(null), { resultCode: null, resultMsg: null, item: null });
  assert.deepEqual(parsePetResponse('그냥 글자'), { resultCode: null, resultMsg: null, item: null });
});

test('등록 정보 판단: 이름(dogNm)이 있어야 한다', () => {
  assert.equal(hasPetData(null), false);
  assert.equal(hasPetData({}), false);
  assert.equal(hasPetData({ kindNm: '푸들' }), false);
  assert.equal(hasPetData({ dogNm: '초코' }), true);
  assert.equal(NO_DATA.success, false);
  assert.match(NO_DATA.errorTitle, /등록 정보를 확인할 수 없어요/);
});

/* ───────── 두 API가 같은 판단 ───────── */

const QUERY = { dogRegNo: '410123456789012', ownerBirth: '900101' };

function withGovApi(t, data) {
  const prev = process.env.DATA_GO_KR_API_KEY;
  process.env.DATA_GO_KR_API_KEY = 'test-key';
  t.mock.method(axios, 'get', async () => ({ data }));
  t.after(() => {
    if (prev === undefined) delete process.env.DATA_GO_KR_API_KEY;
    else process.env.DATA_GO_KR_API_KEY = prev;
  });
}

for (const [name, path] of [['/api/get-pet-data', '../../api/get-pet-data'], ['/api/auth-pet', '../../api/auth-pet']]) {
  const handler = require(path);
  const ask = () => call(handler, { method: 'GET', query: QUERY });

  test(`${name}: 성공 코드인데 등록 정보가 없으면(XML 0건) 인증 성공도 테스트 동물도 아니다`, async (t) => {
    withGovApi(t, xml('<totalCount>0</totalCount>'));
    const r = await ask();
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, NO_DATA);
  });

  test(`${name}: 성공 코드인데 등록 정보가 없으면(JSON 빈 항목) 같은 안내`, async (t) => {
    withGovApi(t, { response: { header: { resultCode: '00' }, body: { item: { dogNm: '' } } } });
    const r = await ask();
    assert.deepEqual(r.body, NO_DATA);
  });

  test(`${name}: 실제 등록 정보는 그대로 보여주고 비어 있는 번호는 입력값으로 채운다`, async (t) => {
    withGovApi(t, xml(FULL_ITEM));
    const r = await ask();
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.message, '국가동물보호정보시스템 인증에 성공하였습니다.');
    assert.equal(r.body.data.dogNm, '초코');
    assert.equal(r.body.data.kindNm, '푸들');
    assert.equal(r.body.data.dogRegNo, QUERY.dogRegNo);
    assert.equal(r.body.data.ownerBirth, QUERY.ownerBirth);
  });

  test(`${name}: 오류 코드면 400`, async (t) => {
    withGovApi(t, { response: { header: { resultCode: '99', resultMsg: '조회 실패' }, body: {} } });
    const r = await ask();
    assert.equal(r.status, 400);
    assert.equal(r.body.success, false);
    assert.equal(r.body.error, '조회 실패');
  });
}
