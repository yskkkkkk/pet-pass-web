/* 소수결 게임 · 참가자(모바일) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var NICK_KEY = 'minority-game:nickname';
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
  var main = document.getElementById('play-main');
  var meBadge = document.getElementById('p-me');

  var token = code ? MG.storageGet(MG.playerKey(code)) : null;
  var state = null;
  var lastKey = null;
  var lastHtml = null;
  var myVote = null;     // { round, choice } 이번 라운드에 내가 마지막으로 누른 선택
  var savedVote = null;  // { round, choice } 서버 저장이 확인된 선택
  var sending = false;
  var poller = MG.createPoller(refresh, 2000);

  /* ───────── 참가 ───────── */

  function showJoin(message) {
    poller.stop();
    lastKey = lastHtml = null;
    meBadge.hidden = true;
    var savedNick = MG.storageGet(NICK_KEY) || '';
    main.innerHTML =
      '<div class="screen">' +
        '<h1 class="screen-title">참가하기</h1>' +
        '<p class="screen-desc">더 적은 사람이 고른 쪽만 살아남습니다.</p>' +
        '<form class="join-form" id="join-form" autocomplete="off">' +
          '<div class="field"><label for="f-code">방 코드</label>' +
            '<input class="input input-code" id="f-code" inputmode="numeric" maxlength="4" placeholder="0000" value="' + esc(code) + '" required></div>' +
          '<div class="field"><label for="f-nick">닉네임 (최대 12자)</label>' +
            '<input class="input" id="f-nick" maxlength="12" placeholder="다른 사람과 겹치지 않게" value="' + esc(savedNick) + '" required></div>' +
          '<p class="error-text" id="join-error">' + esc(message || '') + '</p>' +
          '<button class="btn btn-primary btn-lg btn-block" type="submit" id="btn-join">참가하기</button>' +
        '</form>' +
      '</div>';

    var codeInput = document.getElementById('f-code');
    var nickInput = document.getElementById('f-nick');
    codeInput.addEventListener('input', function () {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
    });
    (code ? nickInput : codeInput).focus();

    document.getElementById('join-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var c = codeInput.value;
      var nick = nickInput.value.trim();
      var errEl = document.getElementById('join-error');
      if (!/^\d{4}$/.test(c)) { errEl.textContent = '방 코드 4자리를 입력해 주세요.'; return codeInput.focus(); }
      if (!nick) { errEl.textContent = '닉네임을 입력해 주세요.'; return nickInput.focus(); }

      var btn = document.getElementById('btn-join');
      btn.disabled = true;
      errEl.textContent = '';
      MG.post({ action: 'join', code: c, nickname: nick, playerToken: MG.storageGet(MG.playerKey(c)) || undefined })
        .then(function (data) {
          code = c;
          token = data.playerToken;
          MG.storageSet(MG.playerKey(code), token);
          MG.storageSet(NICK_KEY, nick);
          if (params.get('room') !== code) history.replaceState(null, '', '/game/play?room=' + code);
          poller.start();
        })
        .catch(function (err) {
          errEl.textContent = err.message;
          btn.disabled = false;
        });
    });
  }

  /* ───────── 상태 ───────── */

  var getState = MG.latestOnly(function () {
    return MG.get({ action: 'state', code: code, playerToken: token });
  });

  function refresh() {
    return getState()
      .then(function (data) { if (data) render(data); })
      .catch(function (err) {
        if (err.status === 404 || err.status === 403) {
          MG.storageRemove(MG.playerKey(code));
          token = null;
          showJoin(err.status === 404 && /방/.test(err.message) ? err.message : '방에서 나가졌어요. 다시 참가해 주세요.');
        }
        throw err;
      });
  }

  function sameVote(a, b) {
    return !!a && !!b && a.round === b.round && a.choice === b.choice;
  }

  function isSaving() {
    return !!myVote && !sameVote(myVote, savedVote);
  }

  function vote(choice) {
    if (!state || state.room.status !== 'voting' || !state.me.alive) return;
    var round = state.room.round;
    if (myVote && myVote.round === round && myVote.choice === choice) return;
    myVote = { round: round, choice: choice };
    state.me.choice = choice;
    paint();
    if (navigator.vibrate) navigator.vibrate(15);
    sendVote();
  }

  /**
   * 투표 요청은 한 번에 하나씩 순서대로 보낸다.
   * 동시에 보내면 서버 도착 순서가 뒤바뀌어 예전 선택(A)이 나중 선택(B)을 덮어쓸 수 있다.
   * 보내는 사이에 선택을 또 바꾸면, 앞 요청이 끝난 뒤 마지막 선택만 보낸다.
   */
  function sendVote() {
    if (sending || !myVote || sameVote(myVote, savedVote)) return;
    var target = myVote;
    sending = true;
    MG.post({ action: 'vote', code: code, playerToken: token, choice: target.choice, round: target.round })
      .then(function () { savedVote = target; })
      .catch(function (err) {
        // 마지막으로 누른 선택이 실패했다면 서버에 저장된 선택으로 되돌린다.
        if (myVote === target) {
          myVote = savedVote && savedVote.round === target.round ? savedVote : null;
          if (state && state.room.round === target.round) state.me.choice = myVote ? myVote.choice : null;
        }
        MG.toast(err.message);
        poller.now();
      })
      .then(function () {
        sending = false;
        sendVote();
        paint();
      });
  }

  function render(data) {
    // 투표 중에는 이번 라운드에 내가 누른 선택이 기준이다. (서버 응답은 저장 직전 값일 수 있음)
    if (data.room.status === 'voting' && myVote && myVote.round === data.room.round) {
      data.me.choice = myVote.choice;
    }
    state = data;
    paint();
  }

  /* ───────── 화면 ───────── */

  function label(q, choice) {
    if (!q) return choice;
    return choice === 'A' ? q.a : q.b;
  }

  function questionBlock(room) {
    return '<p class="eyebrow center">' + room.round + '라운드</p>' +
      '<h1 class="question">' + esc(room.question ? room.question.text : '') + '</h1>';
  }

  function miniResult(room, myChoice) {
    var r = room.result;
    var q = room.question;
    if (!r || !q) return '';
    function cell(choice, cls, count) {
      var c = cls;
      if (r.outcome === 'minority' && r.winningChoice === choice) c += ' win';
      return '<div class="' + c + '"><div class="label">' + esc(label(q, choice)) + '</div><div class="num">' + count + '</div>' +
        (myChoice === choice ? '<div class="mine-label">내 선택</div>' : '') + '</div>';
    }
    return '<div class="mini-result">' + cell('A', 'ra', r.aCount) + cell('B', 'rb', r.bCount) + '</div>';
  }

  function screenLobby(data) {
    return '<div class="screen">' +
      '<h1 class="screen-title">' + esc(data.me.nickname) + '님,<br>참가했습니다.</h1>' +
      '<p class="screen-desc">진행자가 시작하면 이 화면에 문제가 나타납니다. 화면을 켜 둔 채로 기다려 주세요.</p>' +
      '<p class="note">지금 <b>' + data.playerCount + '명</b> 참가 중</p>' +
    '</div>';
  }

  function screenVoting(data) {
    var room = data.room;
    var q = room.question;
    var me = data.me;

    if (!me.alive) {
      return '<div class="screen">' +
        questionBlock(room) +
        '<p class="note">탈락해서 관전 중입니다. 생존자 <b>' + data.aliveCount + '명</b>이 고르는 중이에요.</p>' +
      '</div>';
    }

    var choice = me.choice;
    function btn(c, cls) {
      return '<button class="vote-btn ' + cls + (choice === c ? ' selected' : '') + '" data-choice="' + c + '">' +
        '<span class="letter">' + c + '</span><span>' + esc(label(q, c)) + '</span>' +
        (choice === c ? '<span class="picked">' + (isSaving() ? '저장 중…' : '선택함') + '</span>' : '') + '</button>';
    }
    return '<div class="screen">' +
      questionBlock(room) +
      '<div class="vote-buttons' + (choice ? ' has-choice' : '') + '">' + btn('A', 'a') + btn('B', 'b') + '</div>' +
      (choice
        ? '<p class="note">결과가 공개되기 전까지 바꿀 수 있습니다.</p>'
        : '<p class="note">다른 사람들이 <b>덜 고를 것 같은 쪽</b>을 고르세요.</p>') +
    '</div>';
  }

  function screenRevealed(data) {
    var room = data.room;
    var r = room.result;
    var me = data.me;
    var outThisRound = !me.alive && me.eliminatedRound === r.round;
    var head;

    if (me.alive) {
      var why = r.outcome === 'minority' ? '소수파를 골랐습니다.' : (r.outcome === 'tie' ? '동점이라 투표한 사람은 모두 생존합니다.' : (r.outcome === 'unanimous' ? '모두 같은 쪽이라 투표한 사람은 모두 생존합니다.' : '이번 라운드는 무효입니다.'));
      head = '<p class="verdict-word live">생존</p><p class="screen-desc">' + why + ' 다음 라운드를 기다려 주세요.</p>';
    } else if (outThisRound) {
      var reason = me.choice ? '다수파를 골랐습니다.' : '투표하지 않았습니다.';
      head = '<p class="verdict-word out">탈락</p><p class="screen-desc">' + reason + ' 남은 게임은 관전할 수 있습니다.</p>';
    } else {
      head = '<p class="verdict-word watch">관전 중</p><p class="screen-desc">생존자 ' + data.aliveCount + '명이 다음 라운드를 기다리고 있습니다.</p>';
    }

    return '<div class="screen center">' + head +
      '<p class="eyebrow">' + room.round + '라운드 결과</p>' +
      miniResult(room, me.choice) +
    '</div>';
  }

  function screenFinished(data) {
    var room = data.room;
    var me = data.me;
    var head = me.alive
      ? '<p class="verdict-word live">우승</p><p class="screen-desc">끝까지 살아남았습니다.</p>'
      : '<p class="verdict-word watch">게임 종료</p><p class="screen-desc">우승: <b>' + data.winners.map(esc).join(', ') + '</b></p>';
    return '<div class="screen center">' + head +
      '<p class="eyebrow">' + room.round + '라운드 결과</p>' +
      miniResult(room, me.choice) +
      '<p class="note">진행자가 새 판을 시작하면 자동으로 이어집니다.</p>' +
    '</div>';
  }

  function paint() {
    if (!state) return;
    var room = state.room;
    var me = state.me;

    meBadge.hidden = false;
    meBadge.innerHTML = esc(me.nickname) + ' · ' +
      (me.alive ? '<span class="state-live">생존</span>' : '<span class="state-out">탈락</span>');

    var html;
    if (room.status === 'lobby') html = screenLobby(state);
    else if (room.status === 'voting') html = screenVoting(state);
    else if (room.status === 'revealed') html = screenRevealed(state);
    else html = screenFinished(state);

    if (html === lastHtml) return;
    var key = room.status + ':' + room.round + ':' + (room.question ? room.question.id : '') + ':' + me.alive;
    main.innerHTML = html;
    if (key === lastKey && main.firstChild) main.firstChild.style.animation = 'none';
    else if (room.status === 'voting' && me.alive && navigator.vibrate) navigator.vibrate([60, 40, 60]);
    lastKey = key;
    lastHtml = html;
  }

  main.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-choice]');
    if (btn) vote(btn.getAttribute('data-choice'));
  });

  if (code && token) poller.start();
  else showJoin();
})();
