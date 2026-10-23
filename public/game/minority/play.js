/* 소수결 게임 · 참가자(모바일) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
  var main = document.getElementById('play-main');
  var meBadge = document.getElementById('p-me');
  document.querySelector('.play-header').appendChild(MG.fx.soundToggle());

  var token = code ? MG.storageGet(MG.playerKey(code)) : null;
  var state = null;
  var lastKey = null;
  var lastHtml = null;
  var poller = MG.createPoller(refresh, 2000);

  /* ───────── 참가 ───────── */

  function showJoin(message) {
    poller.stop();
    lastKey = lastHtml = null;
    meBadge.hidden = true;
    MG.join.show(main, {
      code: code,
      desc: '더 적은 사람이 고른 쪽만 살아남습니다.',
      message: message,
      onJoined: function (joinedCode, playerToken) {
        code = joinedCode;
        token = playerToken;
        poller.start();
      }
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

  // 투표는 한 번에 하나씩 순서대로 보낸다 (늦게 처리된 예전 표가 새 표를 덮어쓰지 않게).
  // 값은 { round, choice } — 다음 라운드로 넘어간 뒤 도착한 표는 서버가 거절한다.
  var votes = MG.createSerialSender({
    equals: function (a, b) { return !!a && !!b && a.round === b.round && a.choice === b.choice; },
    send: function (v) { return MG.post({ action: 'vote', code: code, playerToken: token, choice: v.choice, round: v.round }); },
    onSaved: function () { paint(); },
    onError: function (err) {
      MG.toast(err.message);
      poller.now();
      paint();
    }
  });

  /** 이번 라운드에 내가 고른 표 (저장 전이라도). 없으면 null */
  function myVote(round) {
    var v = votes.wanted();
    return v && v.round === round ? v : null;
  }

  function vote(choice) {
    if (!state || state.room.status !== 'voting' || !state.me.alive) return;
    var round = state.room.round;
    var current = myVote(round);
    if (current && current.choice === choice) return;
    votes.push({ round: round, choice: choice });
    paint();
    MG.fx.vibrate(15);
  }

  function render(data) {
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

  /** 결과 도장 자리 (그린 뒤 paint에서 찍는다) */
  function verdictStamp(text, tone) {
    return '<div class="verdict-stamp" data-text="' + esc(text) + '" data-tone="' + tone + '"></div>';
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

    // 투표 중에는 이번 라운드에 내가 누른 선택이 기준이다 (서버 응답은 저장 직전 값일 수 있음)
    var mine = myVote(room.round);
    var choice = mine ? mine.choice : me.choice;
    var saving = !!mine && votes.isSaving();
    function btn(c, cls) {
      return '<button class="vote-btn ' + cls + (choice === c ? ' selected' : '') + '" data-choice="' + c + '">' +
        '<span class="letter">' + c + '</span><span>' + esc(label(q, c)) + '</span>' +
        (choice === c ? '<span class="picked">' + (saving ? '저장 중…' : '선택함') + '</span>' : '') + '</button>';
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
      head = verdictStamp('생존', 'live') + '<p class="screen-desc">' + why + ' 다음 라운드를 기다려 주세요.</p>';
    } else if (outThisRound) {
      var reason = me.choice ? '다수파를 골랐습니다.' : '투표하지 않았습니다.';
      head = verdictStamp('탈락', 'out') + '<p class="screen-desc">' + reason + ' 남은 게임은 관전할 수 있습니다.</p>';
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
    var winners = '<p class="screen-desc">우승: <b>' + data.winners.map(esc).join(', ') + '</b></p>';
    var head;
    if (me.alive) head = verdictStamp('우승', 'live') + '<p class="screen-desc">끝까지 살아남았습니다.</p>';
    else if (me.eliminatedRound === room.result.round) head = verdictStamp('탈락', 'out') + winners; // 마지막 라운드에 떨어짐
    else head = '<p class="verdict-word watch">게임 종료</p>' + winners;
    return '<div class="screen center">' + head +
      '<p class="eyebrow">' + room.round + '라운드 결과</p>' +
      miniResult(room, me.choice) +
      '<p class="note">진행자가 새 판을 시작하면 자동으로 이어집니다.</p>' +
    '</div>';
  }

  /** 결과 도장: 방금 바뀐 화면이면 쾅 찍고 진동·소리, 같은 화면을 다시 그릴 때는 그대로 찍혀 있게 */
  function applyStamp(fresh) {
    var box = main.querySelector('.verdict-stamp');
    if (!box) return;
    var text = box.getAttribute('data-text');
    var tone = box.getAttribute('data-tone');
    if (!fresh) {
      box.insertAdjacentHTML('beforeend', '<span class="stamp stamp-' + tone + ' still">' + esc(text) + '</span>');
      return;
    }
    MG.fx.stamp(box, text, tone, 150);
    MG.fx.vibrate(tone === 'out' ? [200, 80, 200] : [60, 40, 60, 40, 120]);
    setTimeout(function () { MG.fx.play(tone === 'out' ? 'lose' : 'win'); }, 450);
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
    var fresh = key !== lastKey;
    main.innerHTML = html;
    if (!fresh && main.firstChild) main.firstChild.style.animation = 'none';
    else if (room.status === 'voting' && me.alive) MG.fx.vibrate([60, 40, 60]);
    // 처음 열었을 때(lastKey 없음)는 이미 지난 결과라 연출 없이
    applyStamp(fresh && lastKey !== null);
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
