/**
 * 소수결 게임 문구 — 결과 공개 때의 호외 헤드라인 (순수 함수, Node에서도 테스트)
 * 상황마다 여러 문구 중 하나를 고른다. 문구 안의 {이름}은 결과 값으로 채운다.
 */
(function (root, factory) {
  // Stryker disable next-line all: 브라우저/Node 판별 — Node 테스트에서는 한쪽만 실행돼 확인할 수 없다 (브라우저 쪽은 화면 테스트가 확인)
  var text = factory(root.MG || (typeof require === 'function' ? require('../shared/logic.js') : null));
  // Stryker disable next-line all: 브라우저/Node 판별 — Node 테스트에서는 한쪽만 실행돼 확인할 수 없다 (브라우저 쪽은 화면 테스트가 확인)
  if (typeof module === 'object' && module.exports) module.exports = text; else root.MinorityText = text;
})(globalThis, function (logic) {
  var HEADLINES = {
    minority: [
      '[호외] 소수파 ‘{win}’ 생존… 다수파 {lose}명 집단 탈락',
      '[속보] ‘{loseLabel}’ 고른 {lose}명, 단체로 짐 싸',
      '[호외] 남들 따라가다 {lose}명 탈락'
    ],
    tie: [
      '[속보] {a} 대 {b}, 정확히 반반… 전원 생존',
      '[호외] 눈치 싸움 무승부, 오늘은 아무도 안 떨어진다'
    ],
    unanimous: [
      '[호외] 전원 ‘{all}’… 다들 생각이 똑같네',
      '[속보] 만장일치 ‘{all}’, 소수파 실종'
    ],
    novote: [
      '[속보] 아무도 안 골랐다',
      '[호외] 전원 투표 거부… 이번 판은 없던 일로'
    ],
    finished: [
      '[호외] 최후의 생존자 {names}',
      '[속보] {names}, 끝까지 남들과 달랐다'
    ]
  };

  /** 선택지 이름 ('A' → question.a, 'B' → question.b). 문제 정보가 없으면 A/B 그대로 */
  function labelOf(question, choice) {
    return question ? question[choice.toLowerCase()] : choice;
  }

  /**
   * 라운드 결과 헤드라인
   * @param {object} result   서버의 room.result (outcome, aCount, bCount, winningChoice)
   * @param {object} question 문제 ({ a, b })
   * @param {number} rnd      0 이상 1 미만 (생략하면 무작위)
   */
  function roundHeadline(result, question, rnd) {
    var list = HEADLINES[result.outcome] || HEADLINES.novote;
    var values = { a: result.aCount, b: result.bCount };
    if (result.outcome === 'minority') {
      var win = result.winningChoice;
      var lose = win === 'A' ? 'B' : 'A';
      values.win = labelOf(question, win);
      values.loseLabel = labelOf(question, lose);
      values.lose = lose === 'A' ? result.aCount : result.bCount;
    }
    values.all = labelOf(question, result.aCount > 0 ? 'A' : 'B'); // 만장일치 문구용 (다른 문구에서는 안 씀)
    return logic.fill(logic.pickOne(list, rnd), values);
  }

  /** 게임 종료 헤드라인 */
  function finalHeadline(winnerNames, rnd) {
    return logic.fill(logic.pickOne(HEADLINES.finished, rnd), { names: winnerNames.join(', ') });
  }

  return { HEADLINES: HEADLINES, roundHeadline: roundHeadline, finalHeadline: finalHeadline };
});
