/**
 * 참가 화면 (휴대폰) — 방 코드와 닉네임을 받아 참가한다. 같이 하는 게임의 참가 화면이 함께 쓴다.
 * shared/logic.js, common.js 다음에 읽는다.
 *
 *   MG.join.show(container, {
 *     code,                      // 미리 채울 방 코드 (없으면 빈칸)
 *     message,                   // 위에 보여줄 안내 (예: 방에서 나가졌어요)
 *     onJoined(code, token)      // 참가 성공
 *   });
 */
(function () {
  var MG = window.MG;
  var esc = MG.escapeHtml;
  var NICK_KEY = 'minority-game:nickname';

  function show(container, opts) {
    var savedNick = MG.storageGet(NICK_KEY) || '';
    container.innerHTML =
      '<div class="screen">' +
        '<h1 class="screen-title">참가하기</h1>' +
        (opts.desc ? '<p class="screen-desc">' + esc(opts.desc) + '</p>' : '') +
        '<form class="join-form" id="join-form" autocomplete="off">' +
          '<div class="field"><label for="f-code">방 코드</label>' +
            '<input class="input input-code" id="f-code" inputmode="numeric" maxlength="4" placeholder="0000" value="' + esc(opts.code || '') + '" required></div>' +
          '<div class="field"><label for="f-nick">닉네임 (최대 12자)</label>' +
            '<input class="input" id="f-nick" maxlength="12" placeholder="다른 사람과 겹치지 않게" value="' + esc(savedNick) + '" required></div>' +
          '<p class="error-text" id="join-error">' + esc(opts.message || '') + '</p>' +
          '<button class="btn btn-primary btn-lg btn-block" type="submit" id="btn-join">참가하기</button>' +
        '</form>' +
      '</div>';

    var codeInput = container.querySelector('#f-code');
    var nickInput = container.querySelector('#f-nick');
    var errEl = container.querySelector('#join-error');
    var btn = container.querySelector('#btn-join');

    codeInput.addEventListener('input', function () {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
    });
    (opts.code ? nickInput : codeInput).focus();

    container.querySelector('#join-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var code = codeInput.value;
      var nick = nickInput.value.trim();
      if (!/^\d{4}$/.test(code)) { errEl.textContent = '방 코드 4자리를 입력해 주세요.'; return codeInput.focus(); }
      if (!nick) { errEl.textContent = '닉네임을 입력해 주세요.'; return nickInput.focus(); }

      btn.disabled = true;
      errEl.textContent = '';
      MG.post({ action: 'join', code: code, nickname: nick, playerToken: MG.storageGet(MG.playerKey(code)) || undefined })
        .then(function (data) {
          MG.storageSet(MG.playerKey(code), data.playerToken);
          MG.storageSet(NICK_KEY, nick);
          history.replaceState(null, '', location.pathname + '?room=' + code);
          opts.onJoined(code, data.playerToken);
        })
        .catch(function (err) {
          errEl.textContent = err.message;
          btn.disabled = false;
        });
    });
  }

  MG.join = { show: show };
})();
