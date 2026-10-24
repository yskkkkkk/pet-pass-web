/**
 * 최종 시상식 — 게임이 끝나면 웃긴 상을 한 장씩 넘기며 보여주고, 받는 사람 이름에 도장을 찍는다.
 * 서버가 고른 상(lib/game/awards.js의 pickAwards 결과)을 그대로 받는다.
 * shared/logic.js, common.js, fx.js 다음에 읽는다.
 *
 *   MG.awards.show(container, awards, {
 *     animate: true,                 // 한 장씩 (새로고침으로 다시 그릴 때는 false)
 *     descOf: function (award) {}    // 상 설명 문구 (게임마다 {value} 채우는 방식이 다를 수 있다)
 *   });
 */
(function () {
  var MG = window.MG;
  var esc = MG.escapeHtml;
  var GAP_MS = 1600;

  function show(container, awards, opts) {
    var descOf = opts.descOf || function (a) { return a.desc; };
    if (awards.length === 0) {
      container.innerHTML = '<section class="awards"><h2 class="awards-title">시상식</h2>' +
        '<p class="muted">이번 판은 상을 받을 만한 사건이 없었어요.</p></section>';
      return MG.fx.timeline([]);
    }
    container.innerHTML =
      '<section class="awards">' +
        '<h2 class="awards-title">시상식</h2>' +
        '<ul class="award-list">' + awards.map(function (a) {
          return '<li class="award' + (opts.animate ? ' award-hidden' : '') + '" data-award="' + esc(a.id) + '">' +
            '<p class="award-name">' + esc(a.title) + '</p>' +
            '<p class="award-winners"><span>' + a.winners.map(esc).join(', ') + '</span></p>' +
            '<p class="award-desc">' + esc(descOf(a)) + '</p>' +
          '</li>';
        }).join('') + '</ul>' +
      '</section>';

    var items = container.querySelectorAll('.award');
    if (!opts.animate) {
      Array.prototype.forEach.call(items, function (li) {
        li.querySelector('.award-winners').insertAdjacentHTML('beforeend', '<span class="stamp stamp-out still">수상</span>');
      });
      return MG.fx.timeline([]);
    }
    return MG.fx.timeline(Array.prototype.map.call(items, function (li, i) {
      return {
        at: i * GAP_MS,
        run: function () {
          li.classList.remove('award-hidden');
          MG.fx.stamp(li.querySelector('.award-winners'), '수상', 'out', 500);
        }
      };
    }));
  }

  MG.awards = { show: show };
})();
