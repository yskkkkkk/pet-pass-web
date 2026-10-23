/**
 * 미니게임 화면 공통 로직 — 화면(DOM)과 무관한 순수 함수만 둔다.
 * 브라우저에서는 window.MG에 붙고, Node에서는 require로 읽어서 단위·뮤테이션 테스트한다.
 * (화면을 다루는 도구는 common.js, fx.js, lobby.js, join.js)
 */
(function (root, factory) {
  var logic = factory();
  // Stryker disable next-line all: 브라우저/Node 판별 — Node 테스트에서는 한쪽만 실행돼 확인할 수 없다 (브라우저 쪽은 화면 테스트가 확인)
  if (typeof module === 'object' && module.exports) module.exports = logic; else root.MG = Object.assign(root.MG || {}, logic);
})(this, function () {
  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 응답 순서가 뒤바뀌어도 최신 결과만 받도록 감싼다.
   * 나중에 보낸 요청의 응답이 이미 반영됐다면, 늦게 도착한 예전 응답은 null로 버린다.
   */
  function latestOnly(fetcher) {
    var sent = 0;
    var applied = 0;
    return function () {
      sent += 1;
      var id = sent;
      return fetcher.apply(null, arguments).then(function (data) {
        // Stryker disable next-line EqualityOperator: 같은 번호의 응답이 두 번 오는 일은 없어 < 와 <= 가 같은 결과
        if (id < applied) return null;
        applied = id;
        return data;
      });
    };
  }

  /**
   * 같은 사람이 보내는 값(투표, 입찰 …)을 한 번에 하나씩 순서대로 보낸다.
   * 동시에 보내면 서버 도착 순서가 뒤바뀌어 예전 값이 나중 값을 덮어쓸 수 있기 때문.
   * 보내는 사이에 값을 또 바꾸면, 앞 요청이 끝난 뒤 마지막 값만 보낸다.
   *
   * opts.send(value)        → Promise (실패하면 reject)
   * opts.equals(a, b)       같은 값인지 (기본 ===)
   * opts.onSaved(value)     저장 확인
   * opts.onError(err, value) 실패. 마지막으로 고른 값이 실패했다면 저장된 값으로 되돌린 뒤 부른다
   */
  function createSerialSender(opts) {
    var equals = opts.equals || function (a, b) { return a === b; };
    var wanted = null;
    var saved = null;
    var sending = false;

    function isDone() {
      return wanted === null || (saved !== null && equals(wanted, saved));
    }

    function flush() {
      if (sending || isDone()) return Promise.resolve();
      var target = wanted;
      sending = true;
      return Promise.resolve()
        .then(function () { return opts.send(target); })
        .then(function () {
          saved = target;
          if (opts.onSaved) opts.onSaved(target);
        }, function (err) {
          if (wanted === target) wanted = saved;
          if (opts.onError) opts.onError(err, target);
        })
        .then(function () {
          sending = false;
          return flush();
        });
    }

    return {
      /** 새 값을 고른다. 이미 고른 값과 같으면 아무것도 보내지 않는다 */
      push: function (value) {
        // Stryker disable next-line ConditionalExpression: equals가 빈 값을 받지 않게 하는 보호 (지금 쓰는 비교 함수들은 빈 값도 다룸)
        if (wanted !== null && equals(wanted, value)) return Promise.resolve();
        wanted = value;
        return flush();
      },
      /** 화면에 보여줄 값 (저장 전이라도 마지막으로 고른 값) */
      wanted: function () { return wanted; },
      /** 서버 저장이 확인된 값 */
      saved: function () { return saved; },
      /** 고른 값이 아직 저장 중인지 */
      isSaving: function () { return !isDone(); }
    };
  }

  /** 목록에서 하나를 고른다. rnd는 0 이상 1 미만 (테스트에서 고정값을 넣는다) */
  function pickOne(list, rnd) {
    var r = rnd === undefined ? Math.random() : rnd;
    return list[Math.floor(r * list.length)];
  }

  /** 문구 틀의 {이름}을 값으로 바꾼다 (값은 escape하지 않음 — 화면에 넣을 때 escape) */
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (all, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : all;
    });
  }

  return {
    escapeHtml: escapeHtml,
    latestOnly: latestOnly,
    createSerialSender: createSerialSender,
    pickOne: pickOne,
    fill: fill
  };
});
