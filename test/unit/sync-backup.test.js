/**
 * 매장 동기화의 로컬 백업(data/stores.json)은 동기화 뒤 전체 상태다 (이슈 #130)
 * 실제 동기화 함수를 가짜 DB(Supabase)·가짜 엑셀 다운로드·가짜 지오코딩으로 돌린다. 파일은 임시 폴더에 쓴다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');
const supabaseJs = require('@supabase/supabase-js');

/* ───────── 가짜 DB ───────── */

let db; // { rows, upserts, deletes }
supabaseJs.createClient = () => ({
  from: () => ({
    select: () => ({ range: async (from, to) => ({ data: db.rows.slice(from, to + 1), error: null }) }),
    upsert: async (chunk) => { db.upserts.push(...chunk); return { error: null }; },
    delete: () => ({ in: async (_col, ids) => { db.deletes.push(...ids); return { error: null }; } })
  })
});
// 가짜 DB를 끼운 뒤에 읽는다 (동기화 스크립트가 읽을 때 createClient를 가져간다)
const { syncPetFriendlyStores, buildBackupSnapshot } = require('../../scripts/sync-stores');

const dbRow = (id, name, address, extra = {}) => ({
  id, name, address, type: '카페', region: address.split(' ')[0], lat: 37.5, lng: 127.0, verified: true,
  phone_number: null, description: null, naver_smartplace_link: null, updated_at: '2026-10-01T00:00:00.000Z', created_at: '2026-09-01', ...extra
});

function excel(rows) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
const sheetRow = (name, address, extra = {}) => ({ 업소명: name, 업소주소: address, 업종: '휴게음식점', ...extra });

/** 임시 폴더에서 동기화를 한 번 돌리고 { result, backup }을 돌려준다 */
async function runSync(t, { rows, sheet, breakBackup = false }) {
  db = { rows, upserts: [], deletes: [] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-backup-'));
  const cwd = process.cwd();
  process.chdir(dir);
  if (breakBackup) fs.writeFileSync(path.join(dir, 'data'), '폴더 자리에 파일'); // 백업을 쓸 수 없게
  const env = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'http://db.test', SUPABASE_SECRET_KEY: 'k', KAKAO_REST_API_KEY: 'k', PET_EXCEL_URL: 'http://excel.test/x.xlsx' });
  const buffer = excel(sheet);
  t.mock.method(axios, 'get', async (url) => (url.includes('kakao')
    ? { data: { documents: [{ x: '127.25', y: '37.75' }] } }
    : { data: buffer }));
  for (const m of ['log', 'warn', 'error']) t.mock.method(console, m, () => {});
  t.after(() => {
    process.chdir(cwd);
    process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const result = await syncPetFriendlyStores();
  const file = path.join(dir, 'data', 'stores.json');
  const backup = !breakBackup && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  return { result, backup };
}

const FIELDS = ['name', 'address', 'type', 'region', 'lat', 'lng', 'verified', 'phone_number', 'description', 'naver_smartplace_link', 'updated_at'];

/* ───────── 동기화 전체 ───────── */

test('바뀐 게 없는 날: DB에는 쓰지 않지만 백업은 전체 매장 (빈 목록이 아니다)', async (t) => {
  const rows = [dbRow(1, '하나카페', '서울 중구 1'), dbRow(2, '둘카페', '부산 남구 2')];
  const { result, backup } = await runSync(t, { rows, sheet: [sheetRow('하나카페', '서울 중구 1'), sheetRow('둘카페', '부산 남구 2')] });
  assert.equal(result.success, true);
  assert.equal(result.upserted, 0);
  assert.equal(db.upserts.length, 0, 'UPSERT 최적화는 그대로');
  assert.deepEqual(backup.map((s) => s.name), ['둘카페', '하나카페'], '이름·주소 순');
  for (const s of backup) assert.deepEqual(Object.keys(s), FIELDS, 'id·created_at 없이 마이그레이션 도구가 읽는 칸만');
  assert.equal(backup[1].updated_at, '2026-10-01T00:00:00.000Z', '바뀌지 않은 행은 DB 값 그대로');
  assert.equal(result.backupWarning, null);
});

test('일부 변경·추가·삭제: 백업은 동기화 뒤 DB 전체와 같다', async (t) => {
  const rows = [
    dbRow(1, '그대로', '서울 중구 1'),
    dbRow(2, '번호바뀜', '서울 중구 2', { phone_number: '02-000' }),
    dbRow(3, '사라짐', '서울 중구 3')
  ];
  const { result, backup } = await runSync(t, {
    rows,
    sheet: [sheetRow('그대로', '서울 중구 1'), sheetRow('번호바뀜', '서울 중구 2', { 전화번호: '02-111' }), sheetRow('새가게', '대구 북구 4')]
  });
  assert.equal(result.success, true);
  assert.equal(result.upserted, 2);
  assert.deepEqual(db.deletes, [3]);
  assert.deepEqual(backup.map((s) => s.name), ['그대로', '번호바뀜', '새가게'], '지운 매장은 빠진다');
  const byName = Object.fromEntries(backup.map((s) => [s.name, s]));
  assert.equal(byName['번호바뀜'].phone_number, '02-111', '바뀐 행은 바뀐 값');
  assert.equal(byName['번호바뀜'].lat, 37.5, '좌표는 DB 값 유지');
  assert.equal(byName['새가게'].lat, 37.75, '새 매장은 지오코딩 좌표');
  assert.equal(byName['새가게'].region, '대구');
  assert.equal(byName['그대로'].updated_at, '2026-10-01T00:00:00.000Z');
  // 백업 = 동기화 뒤 DB 상태 (전체 복구 자료로 쓸 수 있다)
  const after = new Map(rows.filter((r) => !db.deletes.includes(r.id)).map((r) => [r.name, r]));
  for (const u of db.upserts) after.set(u.name, { ...after.get(u.name), ...u });
  assert.deepEqual(backup, [...after.values()].map((r) => Object.fromEntries(FIELDS.map((f) => [f, r[f]]))).sort((a, b) => (a.name < b.name ? -1 : 1)));
});

test('백업을 쓰지 못해도 동기화는 성공, 경고만 남긴다', async (t) => {
  const { result } = await runSync(t, { rows: [dbRow(1, '하나', '서울 1')], sheet: [sheetRow('하나', '서울 1')], breakBackup: true });
  assert.equal(result.success, true);
  assert.match(result.backupWarning, /^로컬 백업 실패: /);
});

/* ───────── 스냅샷 계산 ───────── */

test('buildBackupSnapshot: 바뀐 행 우선, 없는 칸은 null, 이름이 같으면 주소 순', () => {
  const keys = new Set(['가|서울 2', '가|서울 1', '나|부산 1']);
  const dbMap = new Map([
    ['가|서울 2', { id: 9, name: '가', address: '서울 2', type: '카페', created_at: 'x' }],
    ['나|부산 1', { id: 8, name: '나', address: '부산 1', type: '제과점', phone_number: '051' }]
  ]);
  const toUpsert = [{ name: '가', address: '서울 1', type: '기타' }, { name: '나', address: '부산 1', type: '카페' }];
  const snap = buildBackupSnapshot(keys, toUpsert, dbMap);
  assert.deepEqual(snap.map((s) => `${s.name}|${s.address}`), ['가|서울 1', '가|서울 2', '나|부산 1']);
  assert.equal(snap[2].type, '카페', '이번에 바꾼 값이 DB 값보다 우선');
  assert.equal(snap[2].phone_number, null);
  assert.equal(snap[1].type, '카페');
  assert.equal(snap[1].id, undefined);
  assert.equal(snap[0].lat, null);
  assert.deepEqual(buildBackupSnapshot(new Set(), [], new Map()), []);
});
