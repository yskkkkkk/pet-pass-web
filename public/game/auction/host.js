/* 블라인드 경매 · 진행자(PC) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var GAME = MG.gameInfo('auction');
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').trim();
  var main = document.getElementById('host-main');
  var elRound = document.getElementById('h-round');
  var elRoom = document.getElementById('h-room');
  document.querySelector('.host-header .meta').appendChild(MG.fx.soundToggle());

  var hostToken = MG.hostSession(code);

  var state = null;
  var viewKey = null;
  var busy = false;
  var countingDown = false;
  var countdownRound = 0;   // 카운트다운을 이미 보여준 라운드
  var lobby = null;
  var showFinal = false;    // 마지막 물건 공개 뒤 "최종 결과"로 넘어갔는지
  var rankingBefore = [];   // 공개 직전 순위 (연출이 끝날 때 새 순위로 움직인다)

  // 결과 공개를 누른 뒤 실제 마감까지 기다리는 시간 (공개 직전에 바꾼 입찰이 저장될 여유)
  var REVEAL_GRACE_MS = 1000;

  function notice(title, desc) {
    viewKey = 'notice';
    main.innerHTML =
      '<div class="notice-screen">' +
        '<h2>' + esc(title) + '</h2>' +
        '<p>' + esc(desc) + '</p>' +
        '<a class="btn btn-primary" href="/game/auction">새 방 만들기</a>' +
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

  /* ───────── 렌더링 (경매장 그리기는 stage.js) ───────── */

  var stage = AuctionStage.create(main, {
    actions: function (phase, data) {
      if (phase === 'playing') return '<button class="btn btn-primary btn-lg" data-act="reveal" data-primary>입찰 마감</button>';
      if (phase === 'revealed') {
        return data.room.status === 'finished'
          ? '<button class="btn btn-primary btn-lg" data-act="final" data-primary>최종 결과 보기</button>'
          : '<button class="btn btn-primary btn-lg" data-act="next" data-primary>다음 물건</button>';
      }
      return '<a class="btn btn-quiet btn-lg" href="/game/auction">새 방 만들기</a>' +
        '<button class="btn btn-primary btn-lg" data-act="restart" data-primary>같은 멤버로 한 판 더</button>';
    }
  });

  function keyOf(room) {
    return room.status + ':' + room.round + (room.status === 'finished' && showFinal ? ':final' : '');
  }

  function render(data) {
    var prev = state;
    state = data;
    if (countingDown) return;

    var room = data.room;
    if (room.status === 'lobby') { countdownRound = 0; showFinal = false; }
    elRoom.hidden = false;
    elRoom.innerHTML = '방 코드 <b>' + esc(room.code) + '</b>';
    elRound.hidden = room.round === 0;
    elRound.innerHTML = '<b>' + room.round + '</b> / ' + room.rounds;

    if (keyOf(room) !== viewKey) {
      // 다른 탭 등에서 공개된 경우에도 카운트다운과 연출을 한 번 보여준다
      var justRevealed = prev && prev.room.status === 'playing' && room.status !== 'playing' &&
        room.status !== 'lobby' && prev.room.round === room.round && countdownRound !== room.round;
      if (justRevealed) {
        countdownRound = room.round;
        rankingBefore = prev.ranking;
        countingDown = true;
        MG.fx.countdown().then(function () {
          countingDown = false;
          mount(state, true);
        });
        return;
      }
      mount(data, false);
      return;
    }
    if (room.status === 'lobby') lobby.update(data);
    else if (room.status === 'playing') { rankingBefore = data.ranking; stage.playing(data); }
    else stage.update(data);
  }

  /** animate: 방금 공개된 결과라 연출을 틀어도 되는지 (새로고침으로 다시 그릴 때는 끔) */
  function mount(data, animate) {
    stage.reset();
    lobby = null;
    var room = data.room;
    // 끝난 방을 새로 열었으면 바로 최종 결과
    if (room.status === 'finished' && !animate) showFinal = true;
    viewKey = keyOf(room);

    if (room.status === 'lobby') {
      mountLobby();
      lobby.update(data);
    } else if (room.status === 'playing') {
      rankingBefore = data.ranking;
      stage.playing(data);
    } else if (room.status === 'finished' && showFinal) {
      stage.final(data, { animate: animate });
    } else {
      stage.reveal(data, { animate: animate, rankingBefore: rankingBefore });
    }
  }

  /* 대기실 */
  function mountLobby() {
    lobby = MG.lobby.mount(main, {
      code: code,
      game: GAME,
      onStart: function () { act('start'); },
      onKick: function (id) { act('kick', { playerId: id }); },
      // 설정은 act의 busy 잠금을 쓰지 않는다 (잠금 중에 바꾼 설정이 버려짐). 순서는 대기실이 맞춘다
      onSettings: function (patch) {
        return MG.post({ action: 'settings', code: code, hostToken: hostToken, settings: patch })
          .then(function () { return refresh(); })
          .catch(function (err) { MG.toast(err.message); });
      }
    });
  }

  main.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var name = btn.getAttribute('data-act');
    if (name === 'reveal') {
      var missing = state.players.length - state.submittedCount;
      if (missing > 0 && !confirm('아직 ' + missing + '명이 봉투를 내지 않았어요. 안 낸 사람은 0칩으로 칩니다. 마감할까요?')) return;
      reveal();
    } else if (name === 'final') {
      showFinal = true;
      mount(state, true);
    } else {
      act(name);
    }
  });

  /**
   * 입찰 마감: 카운트다운을 먼저 시작하고, REVEAL_GRACE_MS 뒤에 실제로 마감한다.
   * 결과 연출은 카운트다운이 끝날 때 시작한다.
   */
  function reveal() {
    if (busy || countingDown) return;
    busy = true;
    countingDown = true;
    countdownRound = state.room.round;
    rankingBefore = state.ranking;
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
    if (btn && !btn.disabled && !btn.closest('[hidden]')) {
      e.preventDefault();
      btn.click();
    }
  });

  poller.start();
})();
