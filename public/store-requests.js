/**
 * 매장 목록 요청 순서 관리 (이슈 #128) — 화면(DOM)과 무관해서 Node 단위 테스트로 확인한다.
 * 브라우저에서는 window.StoreRequests에 붙고, Node에서는 require로 읽는다.
 *
 * 규칙
 *  - 조건(검색·지역·카테고리·지도 영역)을 바꾼 요청은 앞선 요청이 진행 중이어도 항상 보낸다. 앞선 요청은 취소한다.
 *  - 응답은 "지금도 마지막 요청인지" 확인하고서만 화면에 반영한다 (늦게 온 지난 조건의 응답은 버린다).
 *  - 더 보기는 진행 중인 요청이 없을 때만 보낸다. 더 보기 도중 조건이 바뀌면 그 페이지는 버린다.
 */
(function (root, factory) {
  var api = factory();
  // Stryker disable next-line all: 브라우저/Node 판별 — Node 테스트에서는 한쪽만 실행돼 확인할 수 없다 (브라우저 쪽은 화면 테스트가 확인)
  if (typeof module === 'object' && module.exports) module.exports = api; else root.StoreRequests = api;
})(this, function () {
  function create() {
    var active = null; // 진행 중인 요청 { append, signal, abort }

    return {
      /**
       * 요청 시작. 보내지 않아도 되면(더 보기인데 다른 요청이 진행 중) null
       * @param {boolean} append 더 보기(다음 페이지 이어 붙이기)인지
       */
      begin: function (append) {
        if (append && active) return null;
        if (active) active.abort();
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var ticket = {
          append: Boolean(append),
          signal: controller ? controller.signal : undefined,
          abort: function () { if (controller) controller.abort(); }
        };
        active = ticket;
        return ticket;
      },
      /** 이 요청의 응답을 화면에 반영해도 되는지 (그 사이 다른 조건의 요청이 시작됐으면 false) */
      isCurrent: function (ticket) {
        return ticket === active;
      },
      /** 요청이 끝났다 (성공·실패·버림 모두). 마지막 요청일 때만 진행 중 표시를 푼다 */
      end: function (ticket) {
        if (ticket === active) active = null;
      },
      isLoading: function () {
        return active !== null;
      }
    };
  }

  return { create: create };
});
