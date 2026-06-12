const assert = require('assert');
const { correctBrokenName, hasBrokenKoreanText } = require('./sync-stores');

function runTests() {
  console.log("실행 중: 인코딩 깨짐 보정 TDD 테스트...");
  let failed = 0;
  
  const testCases = [
    // 1. 정상 텍스트
    { input: "스타벅스", expected: "스타벅스", broken: false },
    // 2. 반각 물음표 포함 (기존에 되던 케이스)
    { input: "?커피,MOCC", expected: "뫀커피,MOCC", broken: true },
    { input: "카페 드 조?", expected: "카페 드 죠즈", broken: true },
    // 3. 전각 물음표 포함 (문제 발생 케이스)
    { input: "？커피,MOCC", expected: "뫀커피,MOCC", broken: true },
    { input: "카페 드 조？", expected: "카페 드 죠즈", broken: true },
    // 4. 공백이 섞여있는 경우
    { input: "우  ? (WooDic)", expected: "우딬(WooDic)", broken: true },
    { input: "우  ？ (WooDic)", expected: "우딬(WooDic)", broken: true },
    // 5. 맵에 없는 미지의 깨짐
    { input: "새로운?가게", expected: "새로운?가게", broken: true },
    { input: "새로운？가게", expected: "새로운？가게", broken: true },
    { input: "알수없는가게", expected: "알수없는가게", broken: false },
  ];

  testCases.forEach((tc, idx) => {
    try {
      const isBroken = hasBrokenKoreanText(tc.input);
      assert.strictEqual(isBroken, tc.broken, `hasBrokenKoreanText 실패: ${tc.input} (expected: ${tc.broken}, got: ${isBroken})`);
      
      const corrected = correctBrokenName(tc.input);
      assert.strictEqual(corrected, tc.expected, `correctBrokenName 실패: ${tc.input} (expected: ${tc.expected}, got: ${corrected})`);
      
      console.log(`✅ Test ${idx + 1} 통과: ${tc.input}`);
    } catch (e) {
      console.error(`❌ Test ${idx + 1} 실패:`, e.message);
      failed++;
    }
  });

  if (failed > 0) {
    console.error(`\n총 ${failed}개의 테스트가 실패했습니다.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 모든 테스트 통과!`);
  }
}

runTests();
