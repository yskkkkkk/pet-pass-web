/**
 * 진행자 대기실 — QR·방 코드, 참가자 목록(내보내기), 진행자 설정, 시작 버튼
 * 같이 하는 게임의 진행 화면이 함께 쓴다. shared/vendor/qrcode.js, logic.js, common.js 다음에 읽는다.
 *
 *   var lobby = MG.lobby.mount(container, {
 *     code, game,                 // game: 게임 목록(games.js)의 항목
 *     onStart(), onKick(id),
 *     onSettings(patch)           // 저장 요청 Promise를 돌려준다. 대기실이 바꾼 순서대로 하나씩 부른다
 *   });
 *   lobby.update(state);          // state: 서버의 진행자 상태 ({ players, settings })
 */
(function () {
  var MG = window.MG;
  var esc = MG.escapeHtml;

  // 참가는 모든 게임 공통 입구(/game/play)로 받는다. 방의 게임을 확인해 그 게임 참가 화면으로 보내 준다.
  function joinUrl(code) {
    return location.origin + '/game/play?room=' + code;
  }

  function fieldHtml(field) {
    var id = 'setting-' + field.key;
    if (field.type === 'int') {
      return '<div class="setting" data-key="' + esc(field.key) + '">' +
        '<span class="setting-label" id="' + id + '">' + esc(field.label) + '</span>' +
        '<span class="stepper" role="group" aria-labelledby="' + id + '">' +
          '<button type="button" class="btn btn-quiet" data-step="-1" aria-label="줄이기">−</button>' +
          '<output data-value></output>' +
          '<button type="button" class="btn btn-quiet" data-step="1" aria-label="늘리기">+</button>' +
        '</span></div>';
    }
    if (field.type === 'bool') {
      return '<div class="setting" data-key="' + esc(field.key) + '">' +
        '<label class="setting-label"><input type="checkbox" data-value> ' + esc(field.label) + '</label></div>';
    }
    return '<div class="setting" data-key="' + esc(field.key) + '">' +
      '<label class="setting-label" for="' + id + '">' + esc(field.label) + '</label>' +
      '<select class="input" id="' + id + '" data-value>' + field.options.map(function (o) {
        return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
      }).join('') + '</select></div>';
  }

  /** 고른 항목의 원래 value (숫자 value도 문자열이 아니라 숫자로 보낸다) */
  function optionValue(field, text) {
    var found = field.options.filter(function (o) { return String(o.value) === text; })[0];
    return found ? found.value : text;
  }

  function mount(container, opts) {
    var game = opts.game;
    var settings = game.settings || [];
    var minPlayers = game.minPlayers || 2;
    var listSig = null;
    var current = {};
    var settingsQueue = MG.createQueue(); // 앞 설정의 응답이 늦어도 이어서 바꾼 설정을 버리지 않는다

    container.innerHTML =
      '<div class="lobby">' +
        '<section class="join-panel">' +
          '<h2>참가 방법</h2>' +
          '<div class="qr-box" id="qr" aria-label="참가 QR 코드"></div>' +
          '<ol class="join-steps">' +
            '<li>휴대폰 카메라로 QR 코드를 찍거나</li>' +
            '<li><b>' + esc(location.host + '/game') + '</b>에 접속해 아래 코드를 입력하세요.</li>' +
          '</ol>' +
          '<div class="code-block"><p class="eyebrow">방 코드</p><p class="big-code">' + esc(opts.code) + '</p></div>' +
        '</section>' +
        '<section class="players-panel">' +
          '<div class="panel-head"><h2>참가자</h2><span class="count" id="lobby-count">0명</span></div>' +
          '<div id="lobby-list"></div>' +
          (settings.length
            ? '<section class="lobby-settings" aria-labelledby="settings-title"><h3 id="settings-title">설정</h3>' +
                settings.map(fieldHtml).join('') + '</section>'
            : '') +
          '<div class="lobby-actions">' +
            '<span class="muted" id="lobby-hint"></span>' +
            '<button class="btn btn-primary btn-lg" id="btn-start" data-primary>게임 시작</button>' +
          '</div>' +
        '</section>' +
      '</div>';

    var qrEl = container.querySelector('#qr');
    try {
      var qr = qrcode(0, 'M');
      qr.addData(joinUrl(opts.code));
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      qrEl.textContent = joinUrl(opts.code);
    }

    container.querySelector('#btn-start').addEventListener('click', function () { opts.onStart(); });
    container.querySelector('#lobby-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-kick]');
      if (btn) opts.onKick(btn.getAttribute('data-kick'));
    });

    // 진행자 설정: 바꾸면 바로 서버에 보낸다. 화면 값은 서버가 돌려준 설정으로 맞춘다.
    settings.forEach(function (field) {
      var box = container.querySelector('.setting[data-key="' + field.key + '"]');
      if (field.type === 'int') {
        box.addEventListener('click', function (e) {
          var btn = e.target.closest('[data-step]');
          if (!btn) return;
          var next = Math.min(field.max, Math.max(field.min, Number(current[field.key]) + Number(btn.getAttribute('data-step'))));
          if (next === current[field.key]) return;
          var patch = {};
          patch[field.key] = next;
          settingsQueue(function () { return opts.onSettings(patch); });
        });
      } else {
        box.querySelector('[data-value]').addEventListener('change', function (e) {
          var patch = {};
          patch[field.key] = field.type === 'bool' ? e.target.checked : optionValue(field, e.target.value);
          settingsQueue(function () { return opts.onSettings(patch); });
        });
      }
    });

    function renderSettings(values) {
      current = Object.assign({}, values);
      settings.forEach(function (field) {
        var box = container.querySelector('.setting[data-key="' + field.key + '"]');
        var input = box.querySelector('[data-value]');
        var value = current[field.key] === undefined ? field.default : current[field.key];
        current[field.key] = value;
        if (field.type === 'int') {
          input.textContent = value;
          box.querySelector('[data-step="-1"]').disabled = value <= field.min;
          box.querySelector('[data-step="1"]').disabled = value >= field.max;
        } else if (field.type === 'bool') {
          input.checked = !!value;
        } else if (document.activeElement !== input) {
          input.value = String(value);
        }
      });
    }

    function update(state) {
      var players = state.players;
      container.querySelector('#lobby-count').textContent = players.length + '명';
      container.querySelector('#btn-start').disabled = players.length < minPlayers;
      container.querySelector('#lobby-hint').textContent =
        players.length < minPlayers ? minPlayers + '명 이상 모이면 시작할 수 있습니다' : '';
      renderSettings(state.settings || {});

      var sig = JSON.stringify(players.map(function (p) { return [p.id, p.nickname]; }));
      if (sig === listSig) return;
      listSig = sig;
      var list = container.querySelector('#lobby-list');
      if (players.length === 0) {
        list.innerHTML = '<p class="empty-hint">아직 참가자가 없습니다.</p>';
        return;
      }
      list.innerHTML = '<ul class="name-list">' + players.map(function (p) {
        return '<li><span>' + esc(p.nickname) + '</span>' +
          '<button class="link-btn" type="button" data-kick="' + esc(p.id) + '" aria-label="' + esc(p.nickname) + ' 내보내기">내보내기</button></li>';
      }).join('') + '</ul>';
    }

    return { update: update };
  }

  MG.lobby = { mount: mount, joinUrl: joinUrl };
})();
