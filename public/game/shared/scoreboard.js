/**
 * 순위표 — 같이 하는 게임의 진행 화면·휴대폰이 함께 쓴다. 순위가 바뀌면 줄이 제자리로 미끄러져 움직인다.
 * shared/logic.js, common.js 다음에 읽는다.
 *
 *   var board = MG.scoreboard.mount(container, {
 *     title: '순위',
 *     columns: [{ key: 'score', label: '점수', render: function (row) { return html; } }],
 *     highlight: playerId          // 이 사람 줄을 굵게 (휴대폰에서 나)
 *   });
 *   board.update(rows);            // rows: [{ id, rank, nickname, ... }] 순위 순서대로
 */
(function () {
  var MG = window.MG;
  var esc = MG.escapeHtml;

  function mount(container, opts) {
    var columns = opts.columns || [];
    var sig = null;
    container.innerHTML =
      '<section class="scoreboard">' +
        (opts.title ? '<h2 class="sb-title">' + esc(opts.title) + '</h2>' : '') +
        '<ol class="sb-list"></ol>' +
      '</section>';
    var list = container.querySelector('.sb-list');

    function rowHtml(row) {
      var cls = 'sb-row' + (row.id === opts.highlight ? ' sb-me' : '') + (row.rank === 1 ? ' sb-first' : '');
      return '<li class="' + cls + '" data-id="' + esc(row.id) + '">' +
        '<span class="sb-rank">' + row.rank + '</span>' +
        '<span class="sb-name">' + esc(row.nickname) + '</span>' +
        columns.map(function (c) {
          return '<span class="sb-cell sb-' + esc(c.key) + '" aria-label="' + esc(c.label) + '">' + c.render(row) + '</span>';
        }).join('') +
      '</li>';
    }

    /** 바뀐 줄이 제자리로 미끄러져 가게 (FLIP: 전 위치 기억 → 새로 그림 → 차이만큼 되돌렸다가 풀기) */
    function update(rows) {
      var html = rows.map(rowHtml).join('');
      if (html === sig) return;
      sig = html;
      var before = {};
      Array.prototype.forEach.call(list.children, function (li) { before[li.getAttribute('data-id')] = li.getBoundingClientRect().top; });
      list.innerHTML = html;
      if (MG.fx && MG.fx.reducedMotion()) return;
      Array.prototype.forEach.call(list.children, function (li) {
        var top = before[li.getAttribute('data-id')];
        if (top === undefined) return;
        var delta = top - li.getBoundingClientRect().top;
        if (!delta) return;
        li.style.transform = 'translateY(' + delta + 'px)';
        li.style.transition = 'none';
        li.classList.add(delta > 0 ? 'sb-up' : 'sb-down');
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            li.style.transition = '';
            li.style.transform = '';
          });
        });
      });
    }

    return { update: update };
  }

  MG.scoreboard = { mount: mount };
})();
