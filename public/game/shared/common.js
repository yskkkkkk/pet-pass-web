/**
 * 미니게임 화면 공통 도구 — 서버 요청, 폴링, 저장소, 알림, 진행자/참가자 토큰
 * shared/logic.js 다음에 읽는다. (순수 로직은 logic.js에 있다)
 */
(function () {
  var MG = window.MG;
  var API = '/api/game';

  function request(method, params) {
    var url = API;
    var init = { method: method, headers: {} };
    if (method === 'GET') {
      url += '?' + new URLSearchParams(params).toString();
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(params);
    }
    return fetch(url, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || '요청에 실패했어요.');
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 사생활 보호 모드 등 */ }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* noop */ }
  }

  /** 화면이 보일 때만 주기적으로 실행되는 폴링 루프. intervalMs는 숫자 또는 매번 간격을 돌려주는 함수 */
  function createPoller(fn, intervalMs) {
    var interval = typeof intervalMs === 'function' ? intervalMs : function () { return intervalMs; };
    var timer = null;
    var running = false;
    var stopped = false;

    function schedule(delay) {
      clearTimeout(timer);
      if (stopped) return;
      timer = setTimeout(tick, delay);
    }

    function tick() {
      if (stopped || running) return;
      if (document.hidden) return schedule(interval());
      running = true;
      Promise.resolve()
        .then(fn)
        .catch(function () { /* 다음 주기에 재시도 */ })
        .then(function () {
          running = false;
          schedule(interval());
        });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) schedule(0);
    });

    return {
      start: function () { stopped = false; schedule(0); },
      now: function () { schedule(0); },
      stop: function () { stopped = true; clearTimeout(timer); }
    };
  }

  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  // 저장 키 이름은 소수결 시절 그대로 둔다 (진행 중인 참가자가 그대로 이어지도록)
  function hostKey(code) { return 'minority-game:host:' + code; }
  function playerKey(code) { return 'minority-game:player:' + code; }

  /**
   * 진행자 토큰. 방을 만든 직후에는 URL 해시로 넘겨받고, 저장한 뒤 주소창에서 지운다.
   * @returns {string|null}
   */
  function hostSession(code) {
    if (location.hash.length > 1) {
      var token = location.hash.slice(1);
      storageSet(hostKey(code), token);
      history.replaceState(null, '', location.pathname + location.search);
      return token;
    }
    return storageGet(hostKey(code));
  }

  /** 게임 목록(games.js)에서 게임 정보 */
  function gameInfo(id) {
    var list = window.MG_GAMES || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  Object.assign(MG, {
    get: function (params) { return request('GET', params); },
    post: function (params) { return request('POST', params); },
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    createPoller: createPoller,
    toast: toast,
    hostKey: hostKey,
    playerKey: playerKey,
    hostSession: hostSession,
    gameInfo: gameInfo
  });
})();
