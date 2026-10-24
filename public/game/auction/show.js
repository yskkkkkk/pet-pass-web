/**
 * 블라인드 경매 연출 계획과 문구 (순수 함수 — 브라우저와 Node 양쪽에서 읽혀 단위·뮤테이션 테스트한다)
 *
 * 진행 화면(host.js)은 revealPlan으로 공개 순서·시각을 정하고, 휴대폰(play.js)은 같은 계획으로
 * "진행 화면에서 도장이 찍히는 순간"까지 기다렸다가 내 결과를 보여준다. (휴대폰이 먼저 스포일러하지 않게)
 */
(function (root, factory) {
  // Stryker disable next-line all: 브라우저/Node 판별 — Node 테스트에서는 한쪽만 실행돼 확인할 수 없다 (브라우저 쪽은 화면 테스트가 확인)
  var show = factory(root.MG || (typeof require === 'function' ? require('../shared/logic.js') : null));
  // Stryker disable next-line all: 브라우저/Node 판별 — Node 테스트에서는 한쪽만 실행돼 확인할 수 없다 (브라우저 쪽은 화면 테스트가 확인)
  if (typeof module === 'object' && module.exports) module.exports = show; else root.AuctionShow = show;
})(globalThis, function (logic) {
  // 공개 버튼 → (1초 유예 뒤) 서버 공개 → 카운트다운(0.7초 × 3)이 끝나면 연출 시작.
  // 서버가 공개한 시각부터 연출이 시작되기까지 약 1.1초.
  var LEAD_MS = 1100;
  var STEP_MIN = 350;      // 한 명씩 공개하는 간격 (인원이 많으면 짧게)
  var STEP_MAX = 700;
  var EARLY_TOTAL = 4200;  // 마지막 무리 전까지 공개에 쓰는 시간
  var SUSPENSE_MS = 1500;  // "최고액은…" 뜸 들이기
  var BOX_MS = 1400;       // 미스터리 상자 덜컹 → 열림
  var AFTER_MS = 1800;     // 도장 뒤 헤드라인·순위표가 자리 잡는 시간

  function finalIdsOf(result) {
    if (result.outcome === 'cursed') return result.cursedIds;
    if (result.outcome === 'win') return result.winnerIds;
    return result.tiedIds; // 유찰이면 빈 목록
  }

  /**
   * 공개 순서와 시각(ms, 연출 시작 기준)
   * 보통은 적은 금액부터, 저주 물건은 많은 금액부터 공개하고, 결정적인 사람(낙찰·동점·저주)은 마지막에 뜸을 들여 공개한다.
   * @returns {{ steps: { id, at, final }[], suspenseAt, openAt, verdictAt, total }}
   */
  function revealPlan(result) {
    var cursed = result.outcome === 'cursed';
    var finalSet = {};
    finalIdsOf(result).forEach(function (id) { finalSet[id] = true; });

    var rows = result.bids.map(function (b, i) { return { id: b.id, bid: b.bid, i: i }; });
    rows.sort(function (a, b) { return (cursed ? b.bid - a.bid : a.bid - b.bid) || a.i - b.i; });
    var early = rows.filter(function (r) { return !finalSet[r.id]; });
    var last = rows.filter(function (r) { return finalSet[r.id]; });

    var step = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(EARLY_TOTAL / Math.max(1, early.length))));
    var steps = early.map(function (r, k) { return { id: r.id, at: k * step, final: false }; });
    var t = early.length * step;
    var suspenseAt = null;
    if (last.length) {
      suspenseAt = t;
      t += SUSPENSE_MS;
      last.forEach(function (r) { steps.push({ id: r.id, at: t, final: true }); });
      t += 700;
    }
    var openAt = null;
    if (result.item.kind === 'mystery') {
      openAt = t;
      t += BOX_MS;
    }
    return { steps: steps, suspenseAt: suspenseAt, openAt: openAt, verdictAt: t, total: t + AFTER_MS };
  }

  /** 휴대폰이 결과를 보여주기까지 남은 시간 (서버가 알려준 공개 경과 시간 기준) */
  function phoneWaitMs(plan, revealAgeMs) {
    return Math.max(0, LEAD_MS + plan.verdictAt - revealAgeMs);
  }

  /** 칩을 미는 손 모양: 빈손 / 손가락으로 톡 / 한 손으로 밀기 / 두 팔로 낑낑 */
  function handPose(bid, startChips) {
    if (bid === 0) return 'empty';
    if (bid <= 3) return 'finger';
    if (bid * 10 >= startChips * 4) return 'heave';
    return 'push';
  }

  /** 칩 더미 높이 (그림 개수 1~12, 0칩이면 0) */
  function stackSize(bid, startChips) {
    return Math.min(12, Math.ceil((bid * 12) / startChips));
  }

  var HEADLINES = {
    win: [
      '[호외] {name}, {bid}칩에 ‘{item}’ 낙찰',
      '[속보] ‘{item}’의 새 주인은 {name}… 낙찰가 {bid}칩'
    ],
    cheap: [
      '[속보] ‘{item}’ 단돈 {bid}칩에 낙찰… 사장님 울고 갑니다',
      '[호외] {name}, 헐값 {bid}칩으로 ‘{item}’ 득템'
    ],
    allInWin: ['[호외] 올인 승부수 통했다… {name}, ‘{item}’ 손에 넣어'],
    tie: [
      '[호외] {names} 똑같이 {bid}칩… 사이좋게 공중분해',
      '[속보] 눈치 싸움 무승부, 칩 {burst}개 증발'
    ],
    allInTie: ['[속보] 올인했는데 동점… 칩 {burst}개 공중분해'],
    nobid: [
      '[속보] 아무도 지갑을 안 열었다… ‘{item}’ 유찰',
      '[호외] ‘{item}’ 인기 없음, 경매장 정적'
    ],
    cursed: [
      '[호외] ‘{item}’ 떠넘기기 성공… {names} 당첨',
      '[속보] 가장 짠 {names}, ‘{item}’ 떠안아'
    ],
    cursedMany: ['[속보] {count}명이 ‘{item}’을 사이좋게 나눠 떠안아'],
    emptyBox: ['[호외] 거금 {bid}칩 들여 빈 상자 낙찰'],
    jackpot: ['[속보] 정체불명 상자에서 5점… {name} 대박'],
    finished: [
      '[호외] 경매왕 {names}, {score}점으로 우승',
      '[속보] 마지막 망치 소리… 우승은 {names}'
    ]
  };

  function namesOf(result, ids) {
    return result.bids.filter(function (b) { return ids.indexOf(b.id) >= 0; }).map(function (b) { return b.nickname; }).join(', ');
  }

  /** 라운드 결과 헤드라인. rnd는 0 이상 1 미만 (생략하면 무작위) */
  function roundHeadline(result, rnd) {
    var item = result.item;
    var ids = finalIdsOf(result);
    var top = result.bids.filter(function (b) { return ids.indexOf(b.id) >= 0; });
    var values = {
      item: item.name,
      name: namesOf(result, ids),
      names: namesOf(result, ids),
      bid: result.maxBid,
      burst: top.reduce(function (sum, b) { return sum + b.bid; }, 0),
      count: ids.length
    };
    var list;
    if (result.outcome === 'win') {
      if (item.kind === 'mystery' && item.points === 0) list = HEADLINES.emptyBox;
      else if (item.kind === 'mystery' && item.points === 5) list = HEADLINES.jackpot;
      else if (result.cheap) list = HEADLINES.cheap;
      else if (top[0].allIn) list = HEADLINES.allInWin;
      else list = HEADLINES.win;
    } else if (result.outcome === 'tie') {
      list = top.some(function (b) { return b.allIn; }) ? HEADLINES.allInTie : HEADLINES.tie;
    } else if (result.outcome === 'cursed') {
      list = ids.length > 2 ? HEADLINES.cursedMany : HEADLINES.cursed;
    } else {
      list = HEADLINES.nobid;
    }
    return logic.fill(logic.pickOne(list, rnd), values);
  }

  /** 게임 종료 헤드라인 (1위가 여럿이면 함께) */
  function finalHeadline(ranking, rnd) {
    var first = ranking.filter(function (r) { return r.rank === 1; });
    return logic.fill(logic.pickOne(HEADLINES.finished, rnd), {
      names: first.map(function (r) { return r.nickname; }).join(', '),
      score: first[0].score
    });
  }

  /**
   * 휴대폰에 찍을 내 결과
   * @returns {{ text, tone: 'live'|'out'|'ink', desc }}
   */
  function myVerdict(result, meId) {
    var mine = result.bids.filter(function (b) { return b.id === meId; })[0];
    var bid = mine ? mine.bid : 0;
    var item = result.item;
    var points = item.points;
    if (result.winnerIds.indexOf(meId) >= 0) {
      return {
        text: result.cheap ? '헐값 낙찰' : '낙찰',
        tone: 'live',
        desc: bid + '칩으로 ‘' + item.name + '’ 낙찰! ' + points + '점을 가져왔어요.'
      };
    }
    if (result.tiedIds.indexOf(meId) >= 0) {
      return { text: '공중분해', tone: 'out', desc: '똑같이 ' + bid + '칩을 건 사람이 있어서 칩만 날아갔어요.' };
    }
    if (result.cursedIds.indexOf(meId) >= 0) {
      return { text: '저주', tone: 'out', desc: '가장 적게 걸어서 ‘' + item.name + '’을 떠안았어요. ' + points + '점.' };
    }
    if (result.outcome === 'nobid') return { text: '유찰', tone: 'ink', desc: '아무도 칩을 걸지 않았어요.' };
    if (result.outcome === 'cursed') return { text: '탈출', tone: 'live', desc: bid + '칩을 내고 저주를 피했어요.' };
    return { text: '패찰', tone: 'ink', desc: bid > 0 ? bid + '칩은 사라졌어요.' : '칩을 아꼈어요.' };
  }

  /** 시상식 문구 ({value} 채우기) */
  function awardDesc(award) {
    return logic.fill(award.desc, { value: award.value });
  }

  /** 휴대폰 입찰 화면의 놀리는 한마디 (라운드마다 하나, 다시 그려도 같은 문구) */
  var TEASES = [
    '표정 관리!',
    '옆 사람 눈빛을 읽어 보세요',
    '지갑 사정은 비밀입니다',
    '다들 얼마나 걸까요?',
    '포커페이스 유지 중',
    '헛기침으로 떠보기 금지'
  ];
  function tease(round) {
    return TEASES[round % TEASES.length];
  }

  return {
    LEAD_MS: LEAD_MS,
    STEP_MIN: STEP_MIN,
    STEP_MAX: STEP_MAX,
    SUSPENSE_MS: SUSPENSE_MS,
    BOX_MS: BOX_MS,
    AFTER_MS: AFTER_MS,
    HEADLINES: HEADLINES,
    TEASES: TEASES,
    revealPlan: revealPlan,
    phoneWaitMs: phoneWaitMs,
    handPose: handPose,
    stackSize: stackSize,
    roundHeadline: roundHeadline,
    finalHeadline: finalHeadline,
    myVerdict: myVerdict,
    awardDesc: awardDesc,
    tease: tease
  };
});
