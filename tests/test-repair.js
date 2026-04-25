/**
 * repairKoreanText function test
 */

function repairKoreanText(text) {
  if (!text) return text;
  let repaired = String(text);

  // 보정 패턴 정의 (자주 발생하는 깨짐 현상 대응)
  const patterns = [
    { search: /[?？]커피/g, replace: '뫀커피' },
    { search: /우[?？]/g, replace: '우딬' },
    { search: /잇[?？]/g, replace: '잇컾' },
    { search: /율[?？]당/g, replace: '율뭌당' },
    { search: /조[?？]/g, replace: '죠즈' },
    { search: /프[?？]츠/g, replace: '프릳츠' },
    { search: /뫀[?？]/g, replace: '뫀' }, // 혹시나 뫀? 로 나오는 경우 대비
  ];

  for (const p of patterns) {
    repaired = repaired.replace(p.search, p.replace);
  }

  return repaired;
}

const testCases = [
  { input: '？커피,MOCC', expected: '뫀커피,MOCC' },
  { input: '?커피,MOCC', expected: '뫀커피,MOCC' },
  { input: '우？(WooDic)', expected: '우딬(WooDic)' },
  { input: '잇？(IT COF.)', expected: '잇컾(IT COF.)' },
  { input: '율？당', expected: '율뭌당' },
  { input: '카페 드 조？', expected: '카페 드 죠즈' },
  { input: '프？츠', expected: '프릳츠' },
  { input: '뫀？', expected: '뫀' },
  { input: '정상 상호명', expected: '정상 상호명' },
  { input: '새로운?상호', expected: '새로운?상호' }, // Unknown broken
];

console.log('🧪 Starting repairKoreanText tests...');
let failed = 0;

testCases.forEach((tc, i) => {
  const result = repairKoreanText(tc.input);
  if (result === tc.expected) {
    console.log(`✅ Test ${i + 1} passed: ${tc.input} -> ${result}`);
  } else {
    console.error(`❌ Test ${i + 1} failed: ${tc.input} -> ${result} (Expected: ${tc.expected})`);
    failed++;
  }
});

if (failed === 0) {
  console.log('\n✨ All tests passed!');
} else {
  console.error(`\n💥 ${failed} tests failed.`);
  process.exit(1);
}
