/**
 * 블라인드 경매 그림 — 잉크로 그린 손, 입찰 봉투, 칩, 텅 빈 지갑 (SVG 문자열)
 * 색은 game.css의 변수(--ink, --surface, --a)를 쓴다.
 */
(function () {
  // 손가락 [x, 끝 y, 높이]: 보통은 네 손가락을 펴고, 'finger'는 검지만 길게
  var FINGERS = {
    open: [[26, 26, 40], [38, 16, 50], [50, 18, 48], [62, 28, 38]],
    finger: [[26, 40, 26], [38, 6, 60], [50, 42, 24], [62, 44, 22]]
  };

  /** 아래에서 위를 가리키는 손 (CSS로 돌려서 옆에서 미는 손으로도 쓴다) */
  function hand(kind) {
    var fingers = FINGERS[kind === 'finger' ? 'finger' : 'open'];
    return '<svg class="hand-svg" viewBox="0 0 100 190" aria-hidden="true">' +
      '<g fill="var(--surface)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round">' +
        fingers.map(function (f) {
          return '<rect x="' + f[0] + '" y="' + f[1] + '" width="12" height="' + f[2] + '" rx="6"/>';
        }).join('') +
        '<rect x="8" y="64" width="13" height="34" rx="6.5" transform="rotate(-28 14 81)"/>' +
        '<rect x="22" y="52" width="56" height="64" rx="16"/>' +
        '<path d="M38 72v20M50 70v22M62 72v20" fill="none" stroke-width="2"/>' +
        '<rect x="20" y="112" width="60" height="14" rx="3"/>' +
        '<path d="M24 126L19 190H81L76 126Z" fill="var(--ink)"/>' +
      '</g></svg>';
  }

  /** 밀랍 도장이 찍힌 입찰 봉투 */
  function envelope() {
    return '<svg class="envelope-svg" viewBox="0 0 64 44" aria-hidden="true">' +
      '<rect x="2" y="2" width="60" height="40" rx="3" fill="var(--surface)" stroke="var(--ink)" stroke-width="2.5"/>' +
      '<path d="M2 5L32 26L62 5" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="32" cy="26" r="5.5" fill="var(--a)"/>' +
    '</svg>';
  }

  /** 옆에서 본 칩 n개 더미. 공중분해 때 칩마다 날아갈 방향(--dx, --dy, --rot)을 정해 둔다 */
  function stack(n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var dx = ((i * 47) % 160) - 60;
      var dy = -(30 + ((i * 31) % 90));
      out += '<i class="chip" style="--dx:' + dx + 'px;--dy:' + dy + 'px;--rot:' + ((i * 67) % 360) + 'deg"></i>';
    }
    return out;
  }

  /** 텅 빈 지갑 (칩 0개) */
  function emptyWallet() {
    return '<svg class="wallet-svg" viewBox="0 0 40 30" aria-hidden="true">' +
      '<g fill="var(--surface)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round">' +
        '<path d="M4 10H34V27H4Z"/><path d="M4 10L10 3H28L34 10" fill="none"/>' +
        '<path d="M26 16H36V22H26Z"/>' +
      '</g>' +
      '<path d="M12 18q3 -3 6 0" fill="none" stroke="var(--ink-3)" stroke-width="1.5"/>' +
    '</svg>';
  }

  window.AuctionArt = { hand: hand, envelope: envelope, stack: stack, emptyWallet: emptyWallet };
})();
