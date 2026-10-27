/**
 * 블라인드 경매 물건 그림 — lib/game/games/auction/items.js의 물건 이름마다 잉크선 그림 하나 (SVG, 64×64)
 * 이름이 목록에 없으면 종류(일반·상자·저주)별 기본 그림을 쓴다.
 * 색은 game.css 변수만 쓴다: 잉크(--ink) 선, 종이(--surface, --paper-2), 벽돌색(--a), 청색(--b)
 */
(function () {
  var L = 'stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
  var THIN = 'stroke="var(--ink)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="none"';
  var W = 'fill="var(--surface)" ' + L;
  var G = 'fill="var(--paper-2)" ' + L;
  var R = 'fill="var(--a)" ' + L;
  var RT = 'fill="var(--a-tint)" ' + L;
  var BT = 'fill="var(--b-tint)" ' + L;
  var N = 'fill="none" ' + L;
  var TXT = 'font-family="inherit" font-weight="800" text-anchor="middle" fill="var(--ink)"';

  function trophy(extra) {
    return '<path d="M20 12H44V26Q44 38 32 40Q20 38 20 26Z" ' + W + '/>' +
      '<path d="M20 16H12Q12 28 22 30M44 16H52Q52 28 42 30" ' + N + '/>' +
      '<path d="M28 40H36V48H28Z" ' + G + '/><path d="M20 48H44V54H20Z" ' + G + '/>' + (extra || '');
  }

  function ticket(inner) {
    return '<path d="M8 18H56V28Q51 32 56 36V46H8V36Q13 32 8 28Z" ' + W + '/>' +
      '<path d="M22 18V46" stroke="var(--ink)" stroke-width="1.8" stroke-dasharray="3 3"/>' + inner;
  }

  var ART = {
    /* ── 1점 ── */
    '반쯤 먹은 김밥':
      '<circle cx="20" cy="38" r="12" ' + W + '/><circle cx="20" cy="38" r="12" fill="none" stroke="var(--ink)" stroke-width="5"/>' +
      '<circle cx="17" cy="36" r="2.5" fill="var(--a)"/><circle cx="23" cy="40" r="2.5" fill="var(--b)"/><circle cx="22" cy="34" r="2" fill="var(--live)"/>' +
      '<path d="M34 30A12 12 0 1 1 46 50Q44 46 48 44Q44 42 47 38Q42 37 44 33Q38 34 34 30Z" ' + W + '/>' +
      '<path d="M40 44h0.1M45 40h0.1" ' + L + '/>',
    '한 짝만 남은 양말':
      '<path d="M24 8H40V34L48 42Q52 50 44 54L30 54Q20 52 22 44L24 38Z" ' + W + '/>' +
      '<path d="M24 14H40M24 19H40" ' + THIN + '/><path d="M44 54Q50 50 46 44" ' + THIN + '/>' +
      '<text x="50" y="18" font-size="10" ' + TXT + '>?</text>',
    '유통기한 오늘까지인 우유':
      '<path d="M20 22L26 12H38L44 22V54H20Z" ' + W + '/><path d="M20 22H44" ' + L + '/>' +
      '<rect x="24" y="32" width="16" height="12" rx="2" ' + RT + '/>' +
      '<text x="32" y="41.5" font-size="8" ' + TXT + '>D-0</text>',
    '뚜껑 없는 볼펜':
      '<path d="M14 50L44 16L50 22L20 56Z" ' + W + '/><path d="M14 50L10 58L20 56" ' + G + '/>' +
      '<path d="M40 20L46 26" ' + L + '/><path d="M50 8l4 4M56 14l-3 1" ' + THIN + '/>',
    '구겨진 영수증 뭉치':
      '<path d="M14 28L22 14L34 20L44 12L52 26L46 38L54 48L38 54L28 46L16 52L12 40Z" ' + W + '/>' +
      '<path d="M22 26L30 34M34 22L40 34M24 42L36 40" ' + THIN + '/>',
    '김 빠진 콜라':
      '<path d="M22 14H42V54H22Z" ' + R + '/><path d="M22 18H42M22 50H42" stroke="var(--surface)" stroke-width="2"/>' +
      '<path d="M26 14Q32 10 38 14" ' + N + '/>' +
      '<path d="M44 12q4 -2 3 -6M47 20q3 -1 2 -4" ' + THIN + '/><circle cx="50" cy="26" r="1.6" fill="var(--ink)"/>',
    '바람 빠진 풍선':
      '<path d="M14 48Q16 38 28 40Q34 34 42 40Q52 40 50 48Q40 54 30 50Q20 54 14 48Z" ' + RT + '/>' +
      '<path d="M22 46q4 -2 8 0M36 44q4 -1 8 1" ' + THIN + '/><path d="M50 48Q56 44 54 36Q52 30 56 24" ' + N + '/>',
    '이 빠진 머그컵':
      '<path d="M16 18H40L38 52H18Z" ' + W + '/><path d="M28 18L31 23L34 18" fill="var(--paper)" ' + L + '/>' +
      '<path d="M39 26Q50 26 49 35Q48 44 38 43" ' + N + '/>',
    '고무줄 늘어난 머리끈':
      '<ellipse cx="32" cy="34" rx="24" ry="9" fill="none" stroke="var(--a)" stroke-width="5"/>' +
      '<path d="M8 34q2 -3 0 -6M56 34q-2 -3 0 -6" ' + THIN + '/>',
    '안 맞는 열쇠 꾸러미':
      '<circle cx="24" cy="22" r="10" ' + N + '/>' +
      '<path d="M30 30L46 46M40 40l4 -4M44 44l4 -4" ' + L + '/><path d="M20 31L14 52M14 44l-4 -1M15 49l-4 -1" ' + L + '/>' +
      '<text x="50" y="22" font-size="12" ' + TXT + '>×</text>',
    '포장만 화려한 빈 상자':
      '<path d="M12 30H52V54H12Z" ' + RT + '/><path d="M10 22H54V30H10Z" ' + R + '/>' +
      '<path d="M32 22V54" stroke="var(--surface)" stroke-width="4"/><path d="M32 22Q22 8 18 18Q22 24 32 22Q42 8 46 18Q42 24 32 22Z" ' + W + '/>' +
      '<text x="32" y="47" font-size="9" ' + TXT + '>텅</text>',
    '삑사리 나는 리코더':
      '<path d="M12 52L42 22L48 28L18 58Z" ' + W + '/><path d="M42 22L50 14L56 20L48 28Z" ' + G + '/>' +
      '<circle cx="26" cy="42" r="1.6" fill="var(--ink)"/><circle cx="31" cy="37" r="1.6" fill="var(--ink)"/><circle cx="36" cy="32" r="1.6" fill="var(--ink)"/>' +
      '<path d="M44 8l4 3l-3 2l4 3" ' + THIN + '/>',

    /* ── 2점 ── */
    '사장님 친필 사인':
      '<path d="M14 10H44L50 16V54H14Z" ' + W + '/><path d="M44 10V16H50" ' + N + '/>' +
      '<path d="M20 40Q24 28 28 38T36 34Q40 46 46 32" ' + N + '/><path d="M20 46H44" ' + THIN + '/>',
    '반짝이 잔뜩 붙은 트로피':
      trophy('<path d="M8 8l2 4l4 2l-4 2l-2 4l-2 -4l-4 -2l4 -2Z" fill="var(--ink)"/><path d="M54 36l1.5 3l3 1.5l-3 1.5l-1.5 3l-1.5 -3l-3 -1.5l3 -1.5Z" fill="var(--ink)"/>' +
        '<circle cx="28" cy="22" r="1.5" fill="var(--a)"/><circle cx="36" cy="28" r="1.5" fill="var(--b)"/><circle cx="33" cy="18" r="1.5" fill="var(--live)"/>'),
    '중고 안마 의자 쿠폰':
      ticket('<path d="M32 40V26Q32 22 36 22H40V34H48V40Z" ' + G + '/><path d="M34 44H48" ' + L + '/>' +
        '<text x="15" y="34.5" font-size="5.5" ' + TXT + '>중고</text>'),
    '동네 맛집 대기표 1번':
      ticket('<text x="40" y="40" font-size="20" ' + TXT + '>1</text><text x="15" y="35" font-size="7" ' + TXT + '>No.</text>'),
    '3년 묵은 비상금 봉투':
      '<path d="M8 20H56V50H8Z" ' + W + '/><path d="M8 20L32 38L56 20" ' + N + '/>' +
      '<text x="32" y="48" font-size="9" ' + TXT + '>₩</text><path d="M12 12q3 -2 6 0M44 10q3 -2 6 0M28 8q3 -2 6 0" ' + THIN + '/>',
    '고장 났지만 멋진 카메라':
      '<path d="M8 22H22L26 16H38L42 22H56V50H8Z" ' + G + '/><circle cx="32" cy="35" r="10" ' + W + '/>' +
      '<path d="M26 28L32 35L29 40L36 44" ' + THIN + '/><rect x="46" y="26" width="6" height="4" fill="var(--a)"/>',
    '노래방 서비스 30분':
      '<circle cx="40" cy="20" r="10" ' + G + '/><path d="M34 26L14 50L18 54L40 30" ' + W + '/>' +
      '<path d="M48 40q4 4 0 8M52 36q7 8 0 16" ' + THIN + '/><text x="46" y="62" font-size="8" ' + TXT + '>30분</text>',
    '회식 자리 선택권':
      '<path d="M20 30V12H44V30" ' + W + '/><path d="M14 30H50V38H14Z" ' + G + '/><path d="M18 38V54M46 38V54" ' + L + '/>' +
      '<path d="M26 6L30 2L32 6L34 2L38 6V10H26Z" ' + R + '/>',
    '어디선가 받은 기념 메달':
      '<path d="M22 6L30 28M42 6L34 28" stroke="var(--b)" stroke-width="5" stroke-linecap="round"/>' +
      '<circle cx="32" cy="40" r="14" ' + RT + '/><circle cx="32" cy="40" r="8" ' + N + '/><text x="32" y="44" font-size="10" ' + TXT + '>?</text>',
    '할머니표 김치 한 통':
      '<path d="M16 22H48V52Q48 56 44 56H20Q16 56 16 52Z" ' + RT + '/><path d="M14 14H50V22H14Z" ' + G + '/>' +
      '<path d="M22 32Q28 28 32 36T42 34M22 42Q30 38 34 46T44 42" fill="none" stroke="var(--a)" stroke-width="2.5" stroke-linecap="round"/>',
    '팀장님 결재 도장':
      '<path d="M24 8H40V30H24Z" ' + G + '/><path d="M16 30H48V40H16Z" ' + W + '/>' +
      '<rect x="18" y="46" width="28" height="12" rx="2" fill="none" stroke="var(--a)" stroke-width="2.5"/>' +
      '<text x="32" y="55.5" font-size="8" font-weight="800" text-anchor="middle" fill="var(--a)">결재</text>',
    '출근 10분 늦게 오기 권':
      '<circle cx="32" cy="34" r="20" ' + W + '/><path d="M32 34V20M32 34L42 38" ' + L + '/>' +
      '<path d="M18 10L12 16M46 10L52 16" ' + L + '/><path d="M44 56l4 4M20 56l-4 4" ' + L + '/>',

    /* ── 3점 ── */
    '금 간 황금 트로피':
      trophy('<path d="M30 12L34 20L29 26L34 34" ' + THIN + '/>'),
    '월요일 하루 쉬기 권':
      '<path d="M10 14H54V54H10Z" ' + W + '/><path d="M10 14H54V24H10Z" ' + R + '/>' +
      '<path d="M20 8V18M44 8V18" ' + L + '/><text x="32" y="46" font-size="16" ' + TXT + '>월</text>' +
      '<path d="M18 30L46 50M46 30L18 50" fill="none" stroke="var(--a)" stroke-width="3" stroke-linecap="round"/>',
    '전설의 맛집 비밀 소스':
      '<path d="M26 6H38V16Q46 22 46 32V54H18V32Q18 22 26 16Z" ' + RT + '/><path d="M24 6H40V12H24Z" ' + G + '/>' +
      '<rect x="21" y="32" width="22" height="14" rx="2" ' + W + '/><text x="32" y="42.5" font-size="8" ' + TXT + '>비밀</text>',
    '평생 설거지 면제권':
      '<ellipse cx="32" cy="38" rx="24" ry="12" ' + W + '/><ellipse cx="32" cy="38" rx="14" ry="6" ' + N + '/>' +
      '<path d="M44 8L52 16M52 8L44 16" fill="none" stroke="var(--a)" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M14 20q2 -4 0 -8M22 18q2 -4 0 -8" ' + THIN + '/>',
    '사장님 자리 하루 체험':
      '<path d="M18 36V10Q18 6 22 6H42Q46 6 46 10V36" ' + G + '/><path d="M14 36H50V44H14Z" ' + W + '/>' +
      '<path d="M32 44V54M20 58L32 54L44 58" ' + L + '/><text x="32" y="26" font-size="9" ' + TXT + '>사장</text>',
    '단톡방 공지 독점권':
      '<path d="M8 12H50V40H26L16 50V40H8Z" ' + W + '/>' +
      '<path d="M18 22L30 18V34L18 30Z" ' + R + '/><path d="M34 22q4 4 0 8M38 18q7 8 0 16" ' + THIN + '/>' +
      '<path d="M54 40l4 -4M54 48l6 0" ' + THIN + '/>',
    '퇴근 1시간 빨리 하기 권':
      '<path d="M14 8H38V56H14Z" ' + G + '/><circle cx="33" cy="32" r="2" fill="var(--ink)"/>' +
      '<path d="M44 32H58M52 26L58 32L52 38" ' + L + '/><text x="26" y="20" font-size="8" ' + TXT + '>-1h</text>',
    '연말 시상식 대상 트로피':
      trophy('<path d="M32 16l2.5 5l5.5 0.8l-4 3.9l1 5.5l-5 -2.6l-5 2.6l1 -5.5l-4 -3.9l5.5 -0.8Z" fill="var(--a)" stroke="var(--ink)" stroke-width="1.5"/>'),
    '무한 리필 커피 쿠폰':
      '<path d="M14 24H42L39 54H17Z" ' + W + '/><path d="M42 30Q52 30 51 38Q50 46 40 45" ' + N + '/>' +
      '<path d="M22 16q2 -4 0 -8M30 16q2 -4 0 -8" ' + THIN + '/><text x="28" y="44" font-size="14" ' + TXT + '>∞</text>',
    '모두에게 별명 지어 주기 권':
      '<rect x="8" y="16" width="48" height="34" rx="4" ' + W + '/><path d="M8 16H56V26H8Z" ' + BT + '/>' +
      '<text x="32" y="24.5" font-size="7" ' + TXT + '>내 이름은</text><path d="M16 40Q22 32 28 40T40 38Q44 42 48 36" ' + N + '/>',
    '야근 대신 해 주기 권':
      '<path d="M14 22H50V44H14Z" ' + G + '/><path d="M8 44H56L52 50H12Z" ' + W + '/>' +
      '<path d="M50 6A8 8 0 1 0 58 16A6 6 0 1 1 50 6Z" fill="var(--ink)"/><path d="M20 30H36M20 36H30" ' + THIN + '/>',
    '왕관 (조금 찌그러짐)':
      '<g transform="rotate(-10 32 34)"><path d="M10 46L8 18L22 30L32 12L42 30L56 20L52 46Z" fill="var(--a-tint)" ' + L + '/>' +
      '<path d="M10 46H52V54H10Z" ' + R + '/><circle cx="32" cy="12" r="3" ' + W + '/></g><path d="M40 34l3 -3" ' + THIN + '/>',

    /* ── 돌발 물건 ── */
    '정체불명 상자':
      '<path d="M10 24L32 14L54 24V48L32 58L10 48Z" ' + G + '/><path d="M10 24L32 34L54 24M32 34V58" ' + N + '/>' +
      '<text x="21" y="48" font-size="14" ' + TXT + ' transform="rotate(8 21 44)">?</text><text x="44" y="47" font-size="12" ' + TXT + ' transform="rotate(-8 44 43)">?</text>',
    '저주받은 인형':
      '<circle cx="32" cy="20" r="12" ' + W + '/><path d="M24 30H40L46 52H18Z" ' + RT + '/>' +
      '<path d="M26 16l4 4M30 16l-4 4M34 16l4 4M38 16l-4 4" ' + THIN + '/><path d="M28 26q4 -3 8 0" ' + THIN + '/>' +
      '<path d="M26 38l12 6M28 46h8" stroke="var(--ink)" stroke-width="1.8" stroke-dasharray="2 2.5"/><path d="M18 40l-8 -4M46 40l8 -4" ' + L + '/>',
    '끝나지 않는 단톡방 초대장':
      '<rect x="18" y="6" width="28" height="52" rx="5" ' + W + '/><path d="M22 14H42V46H22Z" ' + G + '/>' +
      '<rect x="30" y="2" width="24" height="12" rx="6" ' + R + '/><text x="42" y="11" font-size="7.5" font-weight="800" text-anchor="middle" fill="var(--surface)">999+</text>' +
      '<path d="M26 22H38M26 28H34M26 34H38M26 40H32" ' + THIN + '/>',
    '이웃집 개 산책 당번표':
      '<path d="M20 22Q20 12 30 12H38Q48 12 48 24V34Q48 46 34 46Q20 46 20 34Z" ' + W + '/>' +
      '<path d="M20 20Q10 22 12 36Q18 34 20 28M48 20Q58 22 56 36Q50 34 48 28" ' + G + '/>' +
      '<circle cx="28" cy="28" r="2" fill="var(--ink)"/><circle cx="40" cy="28" r="2" fill="var(--ink)"/><path d="M31 36Q34 39 37 36" ' + THIN + '/>' +
      '<path d="M34 46Q34 56 52 58" fill="none" stroke="var(--a)" stroke-width="2.5" stroke-linecap="round"/>',
    '삼촌의 색소폰 연주 감상권':
      '<path d="M36 6L40 8L34 40Q32 54 22 54Q12 54 14 44L20 42Q20 48 24 48Q28 48 29 40L32 10Z" fill="var(--a-tint)" ' + L + '/>' +
      '<circle cx="32" cy="22" r="1.8" fill="var(--ink)"/><circle cx="31" cy="29" r="1.8" fill="var(--ink)"/>' +
      '<path d="M46 20l4 -2l-1 5l4 -2M48 34l5 1l-3 3l5 1" ' + THIN + '/>'
  };

  var FALLBACK = {
    normal: '<path d="M12 24H52V54H12Z" ' + W + '/><path d="M8 16H56V24H8Z" ' + G + '/><path d="M32 16V54" ' + L + '/>',
    mystery: ART['정체불명 상자'],
    cursed: ART['저주받은 인형']
  };

  /** 물건 그림 (item: { name, kind }) */
  function item(it) {
    var inner = ART[it.name] || FALLBACK[it.kind] || FALLBACK.normal;
    return '<svg class="item-svg" viewBox="0 0 64 64" role="img" aria-label="' + it.name.replace(/"/g, '&quot;') + '">' + inner + '</svg>';
  }

  window.AuctionArt = Object.assign(window.AuctionArt || {}, { item: item, ITEM_NAMES: Object.keys(ART) });
})();
