/* 블라인드 경매 · 진행자(PC) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var Show = window.AuctionShow;
  var Art = window.AuctionArt;
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
  var board = null;
  var anim = null;          // 공개 연출 시간표 (끝나기 전에 화면이 바뀌면 멈춘다)
  var animating = false;
  var showFinal = false;    // 마지막 물건 공개 뒤 "최종 결과"로 넘어갔는지
  var seen = {};            // 입찰 중 참가자별 { submitted, changes } — 바뀐 사람에게만 손을 보낸다
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

  /* ───────── 공통 조각 ───────── */

  function startChips() {
    return Number(state.settings.chips);
  }

  function pointsText(item) {
    if (item.points === null) return '?점';
    return (item.points < 0 ? '−' + Math.abs(item.points) : item.points) + '점';
  }

  function ruleText(item) {
    if (item.kind === 'cursed') return '저주 물건! 가장 <b>적게</b> 건 사람이 떠안습니다.';
    if (item.kind === 'mystery') return '상자 안 점수(0~5점)는 공개할 때 열어 봅니다.';
    return '가장 많이 건 사람이 가져갑니다. 건 칩은 이기든 지든 사라져요.';
  }

  function lotCard(item, room) {
    return '<div class="lot lot-' + item.kind + '" id="lot">' +
      '<p class="eyebrow">' + room.round + '번째 물건 · 전체 ' + room.rounds + '개</p>' +
      '<h1 class="lot-name">' + esc(item.name) + '</h1>' +
      '<p class="lot-points"><span class="points-badge" id="lot-points">' + pointsText(item) + '</span></p>' +
      '<p class="lot-rule">' + ruleText(item) + '</p>' +
    '</div>';
  }

  function whoTook(h) {
    if (h.outcome === 'tie') return '공중분해';
    if (h.outcome === 'nobid') return '유찰';
    return h.names.map(esc).join(', ') + (h.outcome === 'cursed' ? ' (저주)' : '');
  }

  /**
   * 맨 위 경매 일정표: 지난 물건은 누가 가져갔는지, 지금 물건은 굵게
   * hideCurrent: 공개 연출 중이라 지금 물건의 결과(가져간 사람, 상자 점수)를 아직 숨긴다
   */
  function lineupStrip(data, hideCurrent) {
    var room = data.room;
    var revealed = room.status !== 'playing' && !hideCurrent;
    var taken = {};
    data.history.forEach(function (h) { taken[h.round] = h; });
    return '<ol class="lineup" aria-label="경매 일정">' + data.lineup.map(function (item) {
      var cls = 'lineup-item lineup-' + item.kind;
      if (item.round === room.round) cls += ' current';
      else if (item.round < room.round) cls += ' done';
      var h = taken[item.round];
      var done = h && (item.round < room.round || revealed);
      return '<li class="' + cls + '">' +
        '<span class="li-round">' + item.round + '</span>' +
        '<span class="li-name">' + esc(item.name) + '</span>' +
        '<span class="li-points">' + pointsText(item.round === room.round && hideCurrent ? Object.assign({}, item, { points: item.kind === 'mystery' ? null : item.points }) : item) + '</span>' +
        '<span class="li-who">' + (done ? whoTook(h) : '') + '</span>' +
      '</li>';
    }).join('') + '</ol>';
  }

  function chipsCell(row) {
    if (row.chips === 0) return '<span class="wallet-empty" title="텅 빈 지갑">' + Art.emptyWallet() + '텅</span>';
    return row.chips + '<small>칩</small>';
  }

  function mountBoard(el) {
    board = MG.scoreboard.mount(el, {
      title: '순위',
      columns: [
        { key: 'score', label: '점수', render: function (r) { return r.score + '<small>점</small>'; } },
        { key: 'chips', label: '남은 칩', render: chipsCell }
      ]
    });
    return board;
  }

  /* ───────── 렌더링 ───────── */

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
    elRound.innerHTML = '<b>' + room.round + '</b> / ' + room.rounds + ' 물건';

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
    }
    update(data);
  }

  /** animate: 방금 공개된 결과라 연출을 틀어도 되는지 (새로고침으로 다시 그릴 때는 끔) */
  function mount(data, animate) {
    if (anim) anim.cancel();
    anim = null;
    animating = false;
    lobby = null;
    board = null;
    var room = data.room;
    // 끝난 방을 새로 열었으면 바로 최종 결과
    if (room.status === 'finished' && !animate) showFinal = true;
    viewKey = keyOf(room);

    if (room.status === 'lobby') mountLobby();
    else if (room.status === 'playing') mountPlaying(data);
    else if (room.status === 'finished' && showFinal) mountFinal(data, animate);
    else mountRevealed(data, animate);
    update(data);
  }

  function update(data) {
    var status = data.room.status;
    if (status === 'lobby') lobby.update(data);
    else if (status === 'playing') updatePlaying(data);
    else if (!animating) board.update(data.ranking);
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

  /* ───────── 입찰 중: 책상과 봉투 ───────── */

  function mountPlaying(data) {
    var room = data.room;
    seen = {};
    main.innerHTML =
      '<div class="auction">' +
        lineupStrip(data) +
        '<div class="auction-body">' +
          '<section class="auction-floor">' +
            lotCard(data.item, room) +
            '<div class="table"><div class="table-top">' + data.players.map(function (p) {
              seen[p.id] = { submitted: p.submitted, changes: p.changes };
              return '<div class="seat" data-id="' + esc(p.id) + '">' +
                '<div class="slot' + (p.submitted ? ' filled' : '') + '">' + Art.envelope() + '</div>' +
                '<span class="seat-name">' + esc(p.nickname) + '</span>' +
                '<span class="seat-caption" aria-live="polite"></span>' +
              '</div>';
            }).join('') + '</div></div>' +
            '<p class="bid-progress" id="bid-progress"></p>' +
            '<div class="actions">' +
              '<button class="btn btn-primary btn-lg" id="btn-reveal" data-primary>입찰 마감</button>' +
            '</div>' +
          '</section>' +
          '<aside class="auction-side" id="board"></aside>' +
        '</div>' +
      '</div>';
    mountBoard(document.getElementById('board'));
    document.getElementById('btn-reveal').addEventListener('click', function () {
      var missing = state.players.length - state.submittedCount;
      if (missing > 0 && !confirm('아직 ' + missing + '명이 봉투를 내지 않았어요. 안 낸 사람은 0칩으로 칩니다. 마감할까요?')) return;
      reveal();
    });
  }

  function updatePlaying(data) {
    rankingBefore = data.ranking;
    document.getElementById('bid-progress').innerHTML = '봉투 <b>' + data.submittedCount + '</b> / ' + data.players.length;
    data.players.forEach(function (p) {
      var before = seen[p.id] || { submitted: false, changes: 0 };
      if (!before.submitted && p.submitted) {
        deliver(p.id);
        // 처음 낸 뒤 바꾼 것까지 한 번에 보였으면, 넣고 나서 바로 바꿔치기
        if (p.changes > 0) setTimeout(function () { swap(p.id, p.changes); }, 1200);
      } else if (p.submitted && p.changes > before.changes) {
        swap(p.id, p.changes - before.changes);
      }
      seen[p.id] = { submitted: p.submitted, changes: p.changes };
    });
    board.update(data.ranking);
  }

  function seatOf(id) {
    return main.querySelector('.seat[data-id="' + id + '"]');
  }

  /** 화면 아래 바깥에서 손이 들어온다. carry: 봉투를 들고 있는지 */
  function flyingHand(slot, carry) {
    var el = document.createElement('div');
    el.className = 'flying-hand' + (carry ? ' carrying' : '');
    el.innerHTML = '<div class="carry">' + Art.envelope() + '</div>' + Art.hand('open');
    document.body.appendChild(el);
    var r = slot.getBoundingClientRect();
    el.style.left = (r.left + r.width / 2 - el.offsetWidth / 2) + 'px';
    var from = window.innerHeight + 10;
    var to = r.top - 6;
    return {
      el: el,
      up: function () {
        MG.fx.play('swish');
        return el.animate([{ transform: 'translateY(' + from + 'px)' }, { transform: 'translateY(' + to + 'px) rotate(-3deg)' }],
          { duration: 600, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
      },
      down: function () {
        return el.animate([{ transform: 'translateY(' + to + 'px)' }, { transform: 'translateY(' + from + 'px)' }],
          { duration: 450, easing: 'ease-in', fill: 'forwards' }).finished;
      }
    };
  }

  /** 처음 낸 봉투: 손이 봉투를 밀어 넣고 빠진다 */
  function deliver(id) {
    var seat = seatOf(id);
    var slot = seat.querySelector('.slot');
    if (MG.fx.reducedMotion() || !document.body.animate) { slot.classList.add('filled'); return; }
    var h = flyingHand(slot, true);
    h.up().then(function () {
      slot.classList.add('filled');
      h.el.classList.remove('carrying');
      return h.down();
    }).then(function () { h.el.remove(); }, function () { h.el.remove(); });
  }

  /** 금액을 바꿈: 손이 봉투를 가져가서 다른 봉투로 바꿔 넣는다 (금액은 모른다) */
  function swap(id, times) {
    var seat = seatOf(id);
    var slot = seat.querySelector('.slot');
    var caption = seat.querySelector('.seat-caption');
    caption.textContent = times > 1 ? '바꿔치기 ×' + times : '바꿔치기!';
    caption.classList.remove('pop');
    void caption.offsetWidth;
    caption.classList.add('pop');
    if (MG.fx.reducedMotion() || !document.body.animate) return;
    var h = flyingHand(slot, false);
    h.up().then(function () {
      slot.classList.remove('filled');
      h.el.classList.add('carrying');
      return h.down();
    }).then(function () {
      return h.up();
    }).then(function () {
      slot.classList.add('filled');
      h.el.classList.remove('carrying');
      return h.down();
    }).then(function () { h.el.remove(); }, function () { h.el.remove(); });
  }

  /* ───────── 공개: 금액 순서대로 손이 칩을 민다 ───────── */

  function bidRow(b, plan, still) {
    var pose = Show.handPose(b.bid, startChips());
    var hands = pose === 'heave' ? Art.hand('open') + Art.hand('open') : Art.hand(pose === 'finger' ? 'finger' : 'open');
    var step = plan.steps.filter(function (s) { return s.id === b.id; })[0];
    return '<div class="bid-row' + (still ? ' shown' : ' pending') + (step.final ? ' final' : '') + '" data-id="' + esc(b.id) + '" data-pose="' + pose + '">' +
      '<span class="bid-name">' + esc(b.nickname) + (b.submitted ? '' : '<small>안 냄</small>') + '</span>' +
      '<div class="bid-lane">' +
        '<div class="pusher">' + hands + (pose === 'heave' ? '<span class="grunt">끄응</span>' : '') + (pose === 'empty' ? '<span class="grunt">빈손</span>' : '') + '</div>' +
        '<div class="stack">' + Art.stack(Show.stackSize(b.bid, startChips())) + '</div>' +
      '</div>' +
      '<span class="bid-amount">' + b.bid + '<small>칩</small>' + (b.allIn ? '<em>올인</em>' : '') + '</span>' +
    '</div>';
  }

  function mountRevealed(data, animate) {
    var r = data.result;
    var room = data.room;
    var plan = Show.revealPlan(r);
    var byId = {};
    r.bids.forEach(function (b) { byId[b.id] = b; });
    var rows = plan.steps.map(function (s) {
      var row = bidRow(byId[s.id], plan, !animate);
      if (s.final && s === plan.steps.filter(function (x) { return x.final; })[0]) {
        row = '<p class="suspense" id="suspense"' + (animate ? ' hidden' : '') + '>' + (r.outcome === 'cursed' ? '가장 적게 건 사람은' : '가장 많이 건 사람은') + '</p>' + row;
      }
      return row;
    }).join('');
    var finished = room.status === 'finished';

    // 공개 전 상자 점수는 "?"로 그렸다가 연출에서 연다
    var lotItem = animate && r.item.kind === 'mystery' ? Object.assign({}, data.item, { points: null }) : data.item;

    main.innerHTML =
      '<div class="auction revealed">' +
        lineupStrip(data, animate) +
        '<div id="headline-slot">' + (animate ? '' : MG.fx.headline(Show.roundHeadline(r))) + '</div>' +
        '<div class="auction-body">' +
          '<section class="auction-floor">' +
            lotCard(lotItem, room) +
            '<div class="bidboard">' + rows + '</div>' +
            '<div class="actions" id="actions"' + (animate ? ' hidden' : '') + '>' +
              (finished
                ? '<button class="btn btn-primary btn-lg" id="btn-final" data-primary>최종 결과 보기</button>'
                : '<button class="btn btn-primary btn-lg" id="btn-next" data-primary>다음 물건</button>') +
            '</div>' +
          '</section>' +
          '<aside class="auction-side" id="board"></aside>' +
        '</div>' +
      '</div>';

    mountBoard(document.getElementById('board'));
    var primary = document.getElementById(finished ? 'btn-final' : 'btn-next');
    primary.addEventListener('click', function () {
      if (finished) {
        showFinal = true;
        mount(state, true);
      } else {
        act('next');
      }
    });

    if (!animate) {
      verdict(r, false);
      return;
    }

    // 연출: 공개 직전 순위에서 시작해서 판정 뒤 새 순위로 움직인다
    primary.disabled = true;
    animating = true;
    board.update(rankingBefore.length ? rankingBefore : data.ranking);
    var steps = plan.steps.map(function (s) {
      return {
        at: s.at,
        run: function () {
          var row = main.querySelector('.bid-row[data-id="' + s.id + '"]');
          row.classList.remove('pending');
          row.classList.add('shown', 'pushing');
          MG.fx.play(byId[s.id].bid ? 'chips' : 'swish');
        }
      };
    });
    if (plan.suspenseAt !== null) {
      steps.push({
        at: plan.suspenseAt,
        run: function () {
          var el = document.getElementById('suspense');
          el.hidden = false;
          // 인원이 많아 표가 길면 결정적인 줄이 보이게 내린다
          var rect = el.getBoundingClientRect();
          if (rect.bottom + 140 > window.innerHeight) window.scrollBy({ top: rect.bottom + 140 - window.innerHeight, behavior: 'smooth' });
          MG.fx.play('drum');
        }
      });
    }
    if (plan.openAt !== null) {
      steps.push({ at: plan.openAt, run: function () { document.getElementById('lot-points').classList.add('rattle'); MG.fx.play('box'); } });
      steps.push({ at: plan.openAt + Show.BOX_MS - 400, run: function () { openBox(r.item); } });
    }
    steps.push({ at: plan.verdictAt, run: function () { verdict(r, true); } });
    steps.push({
      at: plan.verdictAt + 900,
      run: function () {
        animating = false;
        board.update(state.ranking);
      }
    });
    steps.push({
      at: plan.total,
      run: function () {
        document.getElementById('actions').hidden = false;
        primary.disabled = false;
      }
    });
    anim = MG.fx.timeline(steps);
  }

  /** 미스터리 상자 열기: 덜컹거리다 점수가 나온다. 0점이면 먼지만 */
  function openBox(item) {
    var badge = document.getElementById('lot-points');
    badge.classList.remove('rattle');
    badge.classList.add('opened');
    if (item.points === 0) {
      badge.classList.add('dud');
      badge.textContent = '꽝 0점';
    } else {
      badge.textContent = item.points + '점';
    }
    main.querySelector('.lineup-item.current .li-points').textContent = item.points + '점';
  }

  /** 판정: 도장, 공중분해, 저주 떠넘기기, 헤드라인 */
  function verdict(r, animate) {
    var takerIds = r.outcome === 'cursed' ? r.cursedIds : (r.outcome === 'win' ? r.winnerIds : r.tiedIds);
    var rowsOf = function (ids) {
      return ids.map(function (id) { return main.querySelector('.bid-row[data-id="' + id + '"]'); });
    };
    Array.prototype.forEach.call(main.querySelectorAll('.bid-row'), function (row) {
      if (takerIds.indexOf(row.getAttribute('data-id')) < 0) row.classList.add('dim');
    });

    var text;
    var tone;
    var targets;
    if (r.outcome === 'win') {
      text = r.cheap ? '헐값 낙찰' : '낙찰';
      tone = 'live';
      targets = rowsOf(r.winnerIds);
    } else if (r.outcome === 'tie') {
      text = '공중분해';
      tone = 'out';
      targets = rowsOf(r.tiedIds);
      targets.forEach(function (row) { row.classList.add('burst'); });
    } else if (r.outcome === 'cursed') {
      text = '저주';
      tone = 'out';
      targets = rowsOf(r.cursedIds);
      targets.forEach(function (row) {
        row.querySelector('.bid-name').insertAdjacentHTML('beforeend', '<span class="curse-tag">' + esc(r.item.name) + '</span>');
      });
    } else {
      text = '유찰';
      tone = 'ink';
      targets = [document.getElementById('lot')];
    }

    if (!animate) {
      targets.forEach(function (el) { el.insertAdjacentHTML('beforeend', '<span class="stamp stamp-' + tone + ' still">' + text + '</span>'); });
      return;
    }
    var last = state.history[state.history.length - 1];
    main.querySelector('.lineup-item.current .li-who').innerHTML = whoTook(last);
    if (r.outcome === 'tie') MG.fx.play('poof');
    if (r.outcome === 'cursed') MG.fx.drop(main.querySelectorAll('.curse-tag'), 0);
    targets.forEach(function (el, i) { MG.fx.stamp(el, text, tone, 250 + i * 200); });
    setTimeout(function () { MG.fx.play(r.outcome === 'win' ? 'gavel' : 'lose'); }, 650);
    document.getElementById('headline-slot').innerHTML = MG.fx.headline(Show.roundHeadline(r));
  }

  /* ───────── 최종 결과와 시상식 ───────── */

  function mountFinal(data, animate) {
    main.innerHTML =
      '<div class="auction final">' +
        MG.fx.headline(Show.finalHeadline(data.ranking)) +
        '<div class="final-body">' +
          '<section class="final-ranking" id="board"></section>' +
          '<section class="final-awards" id="awards"></section>' +
        '</div>' +
        '<div class="actions">' +
          '<a class="btn btn-quiet btn-lg" href="/game/auction">새 방 만들기</a>' +
          '<button class="btn btn-primary btn-lg" id="btn-restart" data-primary>같은 멤버로 한 판 더</button>' +
        '</div>' +
      '</div>';
    mountBoard(document.getElementById('board'));
    board.update(data.ranking);
    var firsts = main.querySelectorAll('.sb-first .sb-name');
    Array.prototype.forEach.call(firsts, function (el) {
      if (animate) MG.fx.stamp(el, '우승', 'live', 600);
      else el.insertAdjacentHTML('beforeend', '<span class="stamp stamp-live still">우승</span>');
    });
    if (animate) setTimeout(function () { MG.fx.play('win'); }, 900);
    anim = MG.awards.show(document.getElementById('awards'), data.awards, { animate: animate, descOf: Show.awardDesc });
    document.getElementById('btn-restart').addEventListener('click', function () { act('restart'); });
  }

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
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  });

  poller.start();
})();
