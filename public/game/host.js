/* 소수결 게임 · 진행자(PC) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').trim();
  var main = document.getElementById('host-main');
  var elRound = document.getElementById('h-round');
  var elAlive = document.getElementById('h-alive');
  var elRoom = document.getElementById('h-room');

  // 방 생성 직후에는 URL 해시로 토큰을 넘겨받고, 바로 주소창에서 지운다.
  var hostToken = null;
  if (location.hash.length > 1) {
    hostToken = location.hash.slice(1);
    MG.storageSet(MG.hostKey(code), hostToken);
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    hostToken = MG.storageGet(MG.hostKey(code));
  }

  var state = null;
  var viewKey = null;
  var chipsSig = null;
  var busy = false;
  var countingDown = false;

  function joinUrl() {
    return location.origin + '/game/play?room=' + code;
  }

  function notice(title, desc) {
    viewKey = 'notice';
    main.innerHTML =
      '<div class="notice-screen">' +
        '<h2>' + esc(title) + '</h2>' +
        '<p>' + esc(desc) + '</p>' +
        '<a class="btn btn-primary" href="/game">새 방 만들기</a>' +
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

  function refresh() {
    return MG.get({ action: 'state', code: code, hostToken: hostToken })
      .then(render)
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

  function render(data) {
    var prev = state;
    state = data;
    if (countingDown) return;

    var room = data.room;
    var key = room.status + ':' + room.round + ':' + (room.question ? room.question.id : '');

    elRoom.hidden = false;
    elRoom.innerHTML = '방 코드 <b>' + esc(room.code) + '</b>';
    elRound.hidden = room.round === 0;
    elRound.innerHTML = '<b>' + room.round + '</b>라운드';
    elAlive.hidden = room.status === 'lobby';
    elAlive.innerHTML = '생존 <b>' + data.aliveCount + '</b> / ' + data.players.length + '명';

    if (key !== viewKey) {
      var justRevealed = prev && prev.room.status === 'voting' &&
        (room.status === 'revealed' || room.status === 'finished') &&
        prev.room.round === room.round;

      if (justRevealed) {
        playCountdown(function () {
          countingDown = false;
          mount(state);
        });
        return;
      }
      mount(data);
    }
    update(data);
  }

  function mount(data) {
    var room = data.room;
    viewKey = room.status + ':' + room.round + ':' + (room.question ? room.question.id : '');
    chipsSig = null;

    if (room.status === 'lobby') mountLobby(data);
    else if (room.status === 'voting') mountVoting(data);
    else if (room.status === 'revealed') mountRevealed(data);
    else if (room.status === 'finished') mountFinished(data);
    update(data);
  }

  function update(data) {
    var room = data.room;
    if (room.status === 'lobby') updateLobby(data);
    else if (room.status === 'voting') updateVoting(data);
  }

  /* 대기실 */
  function mountLobby() {
    var url = joinUrl();
    var shortUrl = location.host + '/game';
    main.innerHTML =
      '<div class="lobby">' +
        '<section class="join-panel">' +
          '<h2>참가 방법</h2>' +
          '<div class="qr-box" id="qr" aria-label="참가 QR 코드"></div>' +
          '<ol class="join-steps">' +
            '<li>휴대폰 카메라로 QR 코드를 찍거나</li>' +
            '<li><b>' + esc(shortUrl) + '</b>에 접속해 아래 코드를 입력하세요.</li>' +
          '</ol>' +
          '<div class="code-block"><p class="eyebrow">방 코드</p><p class="big-code">' + esc(code) + '</p></div>' +
        '</section>' +
        '<section class="players-panel">' +
          '<div class="panel-head"><h2>참가자</h2><span class="count" id="lobby-count">0명</span></div>' +
          '<div id="lobby-list"></div>' +
          '<div class="lobby-actions">' +
            '<span class="muted" id="lobby-hint"></span>' +
            '<button class="btn btn-primary btn-lg" id="btn-start" data-primary>게임 시작</button>' +
          '</div>' +
        '</section>' +
      '</div>';

    var qrEl = document.getElementById('qr');
    try {
      var qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      qrEl.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch (e) {
      qrEl.textContent = url;
    }

    document.getElementById('btn-start').addEventListener('click', function () { act('start'); });
    document.getElementById('lobby-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-kick]');
      if (!btn) return;
      act('kick', { playerId: btn.getAttribute('data-kick') });
    });
  }

  function updateLobby(data) {
    var players = data.players;
    document.getElementById('lobby-count').textContent = players.length + '명';
    var btn = document.getElementById('btn-start');
    btn.disabled = players.length < 3;
    document.getElementById('lobby-hint').textContent =
      players.length < 3 ? '3명 이상 모이면 시작할 수 있습니다' : '';

    var sig = JSON.stringify(players.map(function (p) { return [p.id, p.nickname]; }));
    if (sig === chipsSig) return;
    chipsSig = sig;

    var list = document.getElementById('lobby-list');
    if (players.length === 0) {
      list.innerHTML = '<p class="empty-hint">아직 참가자가 없습니다.</p>';
      return;
    }
    list.innerHTML = '<ul class="name-list">' + players.map(function (p) {
      return '<li><span>' + esc(p.nickname) + '</span>' +
        '<button class="link-btn" type="button" data-kick="' + esc(p.id) + '" aria-label="' + esc(p.nickname) + ' 내보내기">내보내기</button></li>';
    }).join('') + '</ul>';
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
      act('reveal');
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
    function stamp(choice) {
      return r.outcome === 'minority' && r.winningChoice === choice ? '<span class="stamp">생존</span>' : '';
    }
    return '<div class="options">' +
      '<div class="option result option-a' + cls('A') + '"><span class="letter">A</span><span class="name">' + esc(q.a) + '</span>' +
        '<span class="tally">' + r.aCount + '<small>명</small></span>' + stamp('A') + '</div>' +
      '<div class="option result option-b' + cls('B') + '"><span class="letter">B</span><span class="name">' + esc(q.b) + '</span>' +
        '<span class="tally">' + r.bCount + '<small>명</small></span>' + stamp('B') + '</div>' +
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

  function mountRevealed(data) {
    var room = data.room;
    main.innerHTML =
      '<div class="stage">' +
        questionBlock(room) +
        resultOptions(room) +
        verdictText(room) +
        '<div class="actions">' +
          '<button class="btn btn-primary btn-lg" id="btn-next" data-primary>다음 라운드</button>' +
        '</div>' +
        rosterBlock() +
      '</div>';
    document.getElementById('btn-next').addEventListener('click', function () { act('start'); });
    updateRoster(data, 'revealed');
  }

  /* 게임 종료 */
  function mountFinished(data) {
    var room = data.room;
    var winners = data.players.filter(function (p) { return p.alive; });
    main.innerHTML =
      '<div class="stage">' +
        '<div class="finale">' +
          '<p class="eyebrow">우승</p>' +
          '<p class="winners">' + winners.map(function (p) { return esc(p.nickname); }).join(', ') + '</p>' +
          '<p class="verdict"><span class="sub">' + room.round + '라운드 ‘' + esc(room.question ? room.question.text : '') + '’에서 결정됐습니다</span></p>' +
        '</div>' +
        resultOptions(room) +
        '<div class="actions">' +
          '<a class="btn btn-quiet btn-lg" href="/game">새 방 만들기</a>' +
          '<button class="btn btn-primary btn-lg" id="btn-restart" data-primary>같은 멤버로 한 판 더</button>' +
        '</div>' +
        rosterBlock() +
      '</div>';
    document.getElementById('btn-restart').addEventListener('click', function () { act('restart'); });
    updateRoster(data, 'finished');
  }

  /* 3-2-1 카운트다운 */
  function playCountdown(done) {
    countingDown = true;
    var overlay = document.createElement('div');
    overlay.className = 'countdown';
    document.body.appendChild(overlay);
    var n = 3;
    (function step() {
      if (n === 0) {
        overlay.remove();
        done();
        return;
      }
      overlay.innerHTML = '<span>' + n + '</span>';
      n -= 1;
      setTimeout(step, 700);
    })();
  }

  /* Enter / Space = 주요 버튼 */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.repeat || countingDown) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
    var btn = main.querySelector('[data-primary]');
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  });

  poller.start();
})();
