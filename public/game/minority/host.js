/* 소수결 게임 · 진행자(PC) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var GAME = MG.gameInfo('minority');
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').trim();
  var main = document.getElementById('host-main');
  var elRound = document.getElementById('h-round');
  var elAlive = document.getElementById('h-alive');
  var elRoom = document.getElementById('h-room');
  document.querySelector('.host-header .meta').appendChild(MG.fx.soundToggle());

  var hostToken = MG.hostSession(code);

  var state = null;
  var viewKey = null;
  var chipsSig = null;
  var busy = false;
  var countingDown = false;
  var countdownRound = 0; // 카운트다운을 이미 보여준 라운드
  var lobby = null;

  // 결과 공개를 누른 뒤 실제 마감까지 기다리는 시간.
  // 공개 직전에 바꾼 투표가 서버에 저장될 여유를 준다. (카운트다운이 도는 동안이라 체감 지연 없음)
  var REVEAL_GRACE_MS = 1000;

  function notice(title, desc) {
    viewKey = 'notice';
    main.innerHTML =
      '<div class="notice-screen">' +
        '<h2>' + esc(title) + '</h2>' +
        '<p>' + esc(desc) + '</p>' +
        '<a class="btn btn-primary" href="/game/minority">새 방 만들기</a>' +
      '</div>';
  }

  if (!/^\d{4}$/.test(code) || !hostToken) {
    notice('진행자 권한이 없어요', '이 브라우저에서 만든 방만 진행할 수 있어요. 새 방을 만들어 주세요.');
    return;
  }

  /* ───────── 서버 통신 ───────── */

  function act(action, extra) {
    if (busy) return Promise.resolve();
    busy = true;
    var payload = Object.assign({ action: action, code: code, hostToken: hostToken }, extra || {});
    return MG.post(payload)
      .then(function () { return refresh(); })
      .catch(function (err) { MG.toast(err.message); })
      .then(function () { busy = false; });
  }

  var getState = MG.latestOnly(function () {
    return MG.get({ action: 'state', code: code, hostToken: hostToken });
  });

  function refresh() {
    return getState()
      .then(function (data) { if (data) render(data); })
      .catch(function (err) {
        if (err.status === 404) {
          poller.stop();
          notice('방이 만료됐어요', '오래된 방은 자동으로 정리돼요. 새 방을 만들어 주세요.');
        } else if (err.status === 403) {
          poller.stop();
          notice('진행자 권한이 없어요', '이 브라우저에서 만든 방만 진행할 수 있어요.');
        }
        throw err;
      });
  }

  var poller = MG.createPoller(refresh, 1500);

  /* ───────── 렌더링 ───────── */

  function optionLabel(question, choice) {
    if (!question) return choice;
    return choice === 'A' ? question.a : question.b;
  }

  function keyOf(room) {
    return room.status + ':' + room.round + ':' + (room.question ? room.question.id : '');
  }

  function render(data) {
    var prev = state;
    state = data;
    if (countingDown) return;

    var room = data.room;
    var key = keyOf(room);
    if (room.status === 'lobby') countdownRound = 0; // 새 판이 시작되면 라운드 번호가 1부터 다시 시작됨

    elRoom.hidden = false;
    elRoom.innerHTML = '방 코드 <b>' + esc(room.code) + '</b>';
    elRound.hidden = room.round === 0;
    elRound.innerHTML = '<b>' + room.round + '</b>라운드';
    elAlive.hidden = room.status === 'lobby';
    elAlive.innerHTML = '생존 <b>' + data.aliveCount + '</b> / ' + data.players.length + '명';

    if (key !== viewKey) {
      // 다른 곳(새로고침한 다른 탭 등)에서 공개된 경우에도 카운트다운을 한 번 보여준다
      var justRevealed = prev && prev.room.status === 'voting' &&
        (room.status === 'revealed' || room.status === 'finished') &&
        prev.room.round === room.round &&
        countdownRound !== room.round;

      if (justRevealed) {
        countdownRound = room.round;
        countingDown = true;
        MG.fx.countdown().then(function () {
          countingDown = false;
          mount(state, true);
        });
        return;
      }
      mount(data, false);
    }
    update(data);
  }

  /** animate: 방금 공개된 결과라 웃음 장치를 틀어도 되는지 (새로고침으로 다시 그릴 때는 끔) */
  function mount(data, animate) {
    var room = data.room;
    viewKey = keyOf(room);
    chipsSig = null;
    lobby = null;

    if (room.status === 'lobby') mountLobby();
    else if (room.status === 'voting') mountVoting(data);
    else if (room.status === 'revealed') mountRevealed(data, animate);
    else if (room.status === 'finished') mountFinished(data, animate);
    update(data);
  }

  function update(data) {
    var room = data.room;
    if (room.status === 'lobby') lobby.update(data);
    else if (room.status === 'voting') updateVoting(data);
  }

  /* 대기실 */
  function mountLobby() {
    lobby = MG.lobby.mount(main, {
      code: code,
      game: GAME,
      onStart: function () { act('start'); },
      onKick: function (id) { act('kick', { playerId: id }); },
      onSettings: function (patch) { act('settings', { settings: patch }); }
    });
  }

  /* 문제 영역 (투표/결과 공통) */
  function questionBlock(room) {
    var q = room.question;
    return '<p class="eyebrow">' + room.round + '라운드</p>' +
      '<h1 class="question">' + esc(q ? q.text : '') + '</h1>';
  }

  /* 투표 중 */
  function mountVoting(data) {
    var room = data.room;
    var q = room.question;
    main.innerHTML =
      '<div class="stage">' +
        questionBlock(room) +
        '<div class="options">' +
          '<div class="option option-a"><span class="letter">A</span><span class="name">' + esc(q.a) + '</span></div>' +
          '<div class="option option-b"><span class="letter">B</span><span class="name">' + esc(q.b) + '</span></div>' +
        '</div>' +
        '<div class="progress-wrap">' +
          '<div class="progress-text" id="vote-progress-text"></div>' +
          '<div class="progress"><span id="vote-progress-bar"></span></div>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="btn btn-quiet btn-lg" id="btn-reroll">문제 바꾸기</button>' +
          '<button class="btn btn-primary btn-lg" id="btn-reveal" data-primary>결과 공개</button>' +
        '</div>' +
        rosterBlock() +
      '</div>';

    document.getElementById('btn-reveal').addEventListener('click', function () {
      if (state.voteCount < state.aliveCount &&
          !confirm('아직 ' + (state.aliveCount - state.voteCount) + '명이 투표하지 않았어요. 미투표자는 탈락합니다. 공개할까요?')) return;
      reveal();
    });
    document.getElementById('btn-reroll').addEventListener('click', function () {
      if (state.voteCount > 0 && !confirm('지금까지의 투표가 초기화돼요. 문제를 바꿀까요?')) return;
      act('reroll');
    });
  }

  function updateVoting(data) {
    var pct = data.aliveCount ? Math.round((data.voteCount / data.aliveCount) * 100) : 0;
    document.getElementById('vote-progress-text').innerHTML =
      '<b>' + data.voteCount + '</b> / ' + data.aliveCount + '명 투표';
    document.getElementById('vote-progress-bar').style.width = pct + '%';
    updateRoster(data, 'voting');
  }

  function rosterBlock() {
    return '<section class="roster">' +
      '<div class="panel-head"><h2 id="roster-title">참가자</h2><span class="count" id="roster-count"></span></div>' +
      '<div class="tags" id="roster-chips"></div>' +
    '</section>';
  }

  function updateRoster(data, mode) {
    var players = data.players;
    var round = data.room.round;
    var sig = mode + JSON.stringify(players.map(function (p) { return [p.id, p.alive, p.voted, p.eliminatedRound]; }));
    if (sig === chipsSig) return;
    chipsSig = sig;

    var title = document.getElementById('roster-title');
    var count = document.getElementById('roster-count');
    if (mode === 'voting') {
      title.textContent = '검게 표시된 사람은 투표를 마쳤습니다';
      count.textContent = '';
    } else {
      title.textContent = '참가자';
      count.textContent = '생존 ' + data.aliveCount + ' / ' + players.length;
    }

    // 생존자 먼저, 탈락자는 뒤로
    var sorted = players.slice().sort(function (a, b) { return (b.alive ? 1 : 0) - (a.alive ? 1 : 0); });
    document.getElementById('roster-chips').innerHTML = sorted.map(function (p) {
      var cls = 'tag';
      if (!p.alive) cls += p.eliminatedRound === round && mode !== 'voting' ? ' just-out' : ' out';
      else if (mode === 'voting' && p.voted) cls += ' voted';
      return '<span class="' + cls + '">' + esc(p.nickname) + '</span>';
    }).join('');
  }

  /* 결과 */
  function resultOptions(room) {
    var q = room.question;
    var r = room.result;
    function cls(choice) {
      if (r.outcome !== 'minority') return '';
      return r.winningChoice === choice ? ' winner' : ' loser';
    }
    return '<div class="options">' +
      '<div class="option result option-a' + cls('A') + '" data-choice="A"><span class="letter">A</span><span class="name">' + esc(q.a) + '</span>' +
        '<span class="tally">' + r.aCount + '<small>명</small></span></div>' +
      '<div class="option result option-b' + cls('B') + '" data-choice="B"><span class="letter">B</span><span class="name">' + esc(q.b) + '</span>' +
        '<span class="tally">' + r.bCount + '<small>명</small></span></div>' +
    '</div>';
  }

  function verdictText(room) {
    var r = room.result;
    var out = r.eliminatedIds ? r.eliminatedIds.length : 0;
    var noVote = r.noVoteCount ? ' (미투표 ' + r.noVoteCount + '명 포함)' : '';
    var sub = out + '명 탈락' + (out ? noVote : '') + ' · ' + r.survivorCount + '명 생존';
    var main;
    if (r.outcome === 'minority') main = '소수파 ‘' + esc(optionLabel(room.question, r.winningChoice)) + '’ 생존';
    else if (r.outcome === 'tie') main = '동점입니다. 투표한 사람은 모두 생존';
    else if (r.outcome === 'unanimous') main = '모두 같은 쪽을 골랐습니다. 투표한 사람은 모두 생존';
    else { main = '아무도 투표하지 않았습니다'; sub = '이번 라운드는 무효입니다'; }
    return '<p class="verdict">' + main + '<span class="sub">' + sub + '</span></p>';
  }

  /** 소수파 생존 도장 (이긴 쪽 "생존", 진 쪽 "탈락"). 연출 없이 그릴 때는 바로 찍혀 있게 */
  function stampOptions(room, animate) {
    var r = room.result;
    if (r.outcome !== 'minority') return;
    var lose = r.winningChoice === 'A' ? 'B' : 'A';
    var win = main.querySelector('.option[data-choice="' + r.winningChoice + '"]');
    var loseEl = main.querySelector('.option[data-choice="' + lose + '"]');
    if (animate) {
      MG.fx.stamp(loseEl, '탈락', 'out', 500);
      MG.fx.stamp(win, '생존', 'live', 1100);
    } else {
      loseEl.insertAdjacentHTML('beforeend', '<span class="stamp stamp-out still">탈락</span>');
      win.insertAdjacentHTML('beforeend', '<span class="stamp stamp-live still">생존</span>');
    }
  }

  function mountRevealed(data, animate) {
    var room = data.room;
    main.innerHTML =
      '<div class="stage">' +
        questionBlock(room) +
        MG.fx.headline(MinorityText.roundHeadline(room.result, room.question)) +
        resultOptions(room) +
        verdictText(room) +
        '<div class="actions">' +
          '<button class="btn btn-primary btn-lg" id="btn-next" data-primary>다음 라운드</button>' +
        '</div>' +
        rosterBlock() +
      '</div>';
    document.getElementById('btn-next').addEventListener('click', function () { act('start'); });
    updateRoster(data, 'revealed');
    stampOptions(room, animate);
    if (animate) MG.fx.drop(main.querySelectorAll('.tag.just-out'), 1600);
  }

  /* 게임 종료 */
  function mountFinished(data, animate) {
    var room = data.room;
    var winners = data.players.filter(function (p) { return p.alive; });
    var names = winners.map(function (p) { return p.nickname; });
    main.innerHTML =
      '<div class="stage">' +
        MG.fx.headline(MinorityText.finalHeadline(names)) +
        '<div class="finale">' +
          '<p class="eyebrow">우승</p>' +
          '<p class="winners" id="winners">' + names.map(esc).join(', ') + '</p>' +
          '<p class="verdict"><span class="sub">' + room.round + '라운드 ‘' + esc(room.question ? room.question.text : '') + '’에서 결정됐습니다</span></p>' +
        '</div>' +
        resultOptions(room) +
        '<div class="actions">' +
          '<a class="btn btn-quiet btn-lg" href="/game/minority">새 방 만들기</a>' +
          '<button class="btn btn-primary btn-lg" id="btn-restart" data-primary>같은 멤버로 한 판 더</button>' +
        '</div>' +
        rosterBlock() +
      '</div>';
    document.getElementById('btn-restart').addEventListener('click', function () { act('restart'); });
    updateRoster(data, 'finished');
    stampOptions(room, animate);
    if (animate) {
      MG.fx.drop(main.querySelectorAll('.tag.just-out'), 1600);
      MG.fx.stamp(document.getElementById('winners'), '우승', 'live', 2200);
      setTimeout(function () { MG.fx.play('win'); }, 2500);
    } else {
      document.getElementById('winners').insertAdjacentHTML('beforeend', '<span class="stamp stamp-live still">우승</span>');
    }
  }

  /**
   * 결과 공개: 카운트다운을 먼저 시작하고, REVEAL_GRACE_MS 뒤에 실제로 마감한다.
   * 집계 결과는 카운트다운이 끝날 때 보여준다.
   */
  function reveal() {
    if (busy || countingDown) return;
    busy = true;
    countingDown = true;
    countdownRound = state.room.round;
    var request = new Promise(function (resolve) { setTimeout(resolve, REVEAL_GRACE_MS); })
      .then(function () { return MG.post({ action: 'reveal', code: code, hostToken: hostToken }); })
      .then(function () { return refresh(); })
      .catch(function (err) { MG.toast(err.message); })
      .then(function () { busy = false; });

    MG.fx.countdown(request).then(function () {
      countingDown = false;
      mount(state, true);
    });
  }

  /* Enter / Space = 주요 버튼 */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat || countingDown) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SELECT') return;
    var btn = main.querySelector('[data-primary]');
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  });

  poller.start();
})();
