/* 소수결 게임 공통 유틸 */
(function () {
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

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 화면이 보일 때만 주기적으로 실행되는 폴링 루프 */
  function createPoller(fn, intervalMs) {
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
      if (document.hidden) return schedule(intervalMs);
      running = true;
      Promise.resolve()
        .then(fn)
        .catch(function () { /* 다음 주기에 재시도 */ })
        .then(function () {
          running = false;
          schedule(intervalMs);
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

  window.MG = {
    get: function (params) { return request('GET', params); },
    post: function (params) { return request('POST', params); },
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove,
    escapeHtml: escapeHtml,
    createPoller: createPoller,
    toast: toast,
    hostKey: function (code) { return 'minority-game:host:' + code; },
    playerKey: function (code) { return 'minority-game:player:' + code; }
  };
})();
