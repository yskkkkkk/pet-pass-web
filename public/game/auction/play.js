/*
 * 블라인드 경매 · 휴대폰 화면
 * - 휴대폰만으로 진행하는 방(settings.screen === 'phone'): 휴대폰이 경매장이 된다 (stage.js).
 *   방장(방을 만든 휴대폰)에게만 시작·마감·다음 버튼이 나온다. 공개 연출은 서버가 공개한 시각을 기준으로
 *   모든 휴대폰에서 같은 순간에 시작하고, 늦게 받은 휴대폰은 그만큼 지난 장면부터 이어서 튼다.
 * - PC 화면으로 진행하는 방: 휴대폰은 입찰만 하고, 결과는 PC 연출의 도장 순간에 맞춰 보여준다.
 */
(function () {
  var esc = MG.escapeHtml;
  var Show = window.AuctionShow;
  var Art = window.AuctionArt;
  var GAME = MG.gameInfo('auction');
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
  var main = document.getElementById('play-main');
  var meBadge = document.getElementById('p-me');
  document.querySelector('.play-header').appendChild(MG.fx.soundToggle());

  // 휴대폰만으로 진행: 공개(서버) → 3·2·1 → 연출. 모든 휴대폰이 이 시각에 맞춰 시작한다
  var PHONE_LEAD_MS = 3500;
  var REVEAL_GRACE_MS = 1000;

  var token = code ? MG.storageGet(MG.playerKey(code)) : null;
  var hostToken = code ? MG.storageGet(MG.hostKey(code)) : null; // 방장 휴대폰만 있다
  var state = null;
  var receivedAt = 0;        // 상태를 받은 시각 (공개 연출 시각 계산용)
  var lastKey = null;
  var lastHtml = null;
  var waitTimer = null;
  var draft = { round: -1, bid: 0 }; // 입찰칸에서 고르는 중인 금액
  var busy = false;
  var countingDown = false;
  var rankingBefore = [];
  var showFinal = false;
  var lobby = null;
  var stage = null;
  var stageKey = null;

  function phoneMode() {
    return !!state && state.settings.screen === 'phone';
  }

  var poller = MG.createPoller(refresh, function () { return phoneMode() ? 1000 : 2000; });

  /* ───────── 참가 ───────── */

  function showJoin(message) {
    poller.stop();
    lastKey = lastHtml = stageKey = null;
    meBadge.hidden = true;
    MG.join.show(main, {
      code: code,
      desc: '',
      message: message,
      onJoined: function (joinedCode, playerToken) {
        code = joinedCode;
        token = playerToken;
        poller.start();
      }
    });
  }

  /* ───────── 서버 통신 ───────── */

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

  /** 방장 동작 (시작·다음·처음부터) */
  function act(action, extra) {
    if (busy || !hostToken) return Promise.resolve();
    busy = true;
    return MG.post(Object.assign({ action: action, code: code, hostToken: hostToken }, extra || {}))
      .then(function () { return refresh(); })
      .catch(function (err) { MG.toast(err.message); })
      .then(function () { busy = false; });
  }

  /** 방장 마감: 1초 유예 뒤 공개 (공개 직전에 바꾼 봉투가 저장될 여유) */
  function closeBidding() {
    if (busy) return;
    var missing = state.players.length - state.submittedCount;
    if (missing > 0 && !confirm('봉투를 안 낸 ' + missing + '명은 0칩이에요. 마감할까요?')) return;
    busy = true;
    var btn = main.querySelector('[data-act="reveal"]');
    if (btn) btn.disabled = true;
    setTimeout(function () {
      MG.post({ action: 'reveal', code: code, hostToken: hostToken })
        .then(function () { return refresh(); })
        .catch(function (err) { MG.toast(err.message); if (btn) btn.disabled = false; })
        .then(function () { busy = false; });
    }, REVEAL_GRACE_MS);
  }

  // 입찰은 한 번에 하나씩 순서대로 보낸다 (늦게 처리된 예전 금액이 새 금액을 덮어쓰지 않게).
  // 값은 { round, bid } — 다음 물건으로 넘어간 뒤 도착한 입찰은 서버가 거절한다.
  var bids = MG.createSerialSender({
    equals: function (a, b) { return !!a && !!b && a.round === b.round && a.bid === b.bid; },
    send: function (v) { return MG.post({ action: 'bid', code: code, playerToken: token, bid: v.bid, round: v.round }); },
    onSaved: function () { paint(); },
    onError: function (err) {
      MG.toast(err.message);
      poller.now();
      paint();
    }
  });

  /** 이번 라운드에 낸 봉투 금액 (저장 전이라도 내가 마지막으로 낸 값). 없으면 null */
  function sentBid(data) {
    var v = bids.wanted();
    if (v && v.round === data.room.round) return v.bid;
    return data.me.bid;
  }

  function render(data) {
    state = data;
    receivedAt = Date.now();
    if (data.room.status === 'playing' && draft.round !== data.room.round) {
      var sent = sentBid(data);
      draft = { round: data.room.round, bid: sent === null ? 0 : sent };
    }
    if (data.room.status === 'playing') rankingBefore = data.ranking;
    if (data.room.status === 'lobby') showFinal = false;
    paint();
  }

  /* ───────── 조각 ───────── */

  function pointsText(item) {
    return AuctionStage.pointsText(item) + '점';
  }

  function verdictStamp(text, tone) {
    return '<div class="verdict-stamp" data-text="' + esc(text) + '" data-tone="' + tone + '"></div>';
  }

  /** 입찰칸: 큰 숫자 + 버튼. 글은 최소로 */
  function composerHtml(data) {
    var me = data.me;
    var chips = me.chips;
    if (chips === 0) {
      return '<div class="composer empty">' + Art.emptyWallet() + '<p class="envelope-state">0칩 · 구경 중</p></div>';
    }
    var sent = sentBid(data);
    var saving = bids.isSaving();
    var value = draft.bid;
    var allIn = value === chips;
    var label;
    if (sent === null) label = Art.envelope() + ' 넣기';
    else if (sent === value) label = Art.envelope() + (saving ? ' …' : ' 넣음 ✓');
    else label = Art.envelope() + ' 바꿔치기';
    function stepBtn(text, attr, disabled) {
      return '<button type="button" class="btn btn-quiet step" ' + attr + (disabled ? ' disabled' : '') + '>' + text + '</button>';
    }
    return '<div class="composer">' +
      '<p class="draft"><b id="draft-bid">' + value + '</b><span class="unit">칩</span><span class="of">/ ' + chips + '</span></p>' +
      '<div class="steps">' +
        stepBtn('0', 'data-set="0"', value === 0) +
        stepBtn('−10', 'data-step="-10"', value === 0) +
        stepBtn('−1', 'data-step="-1"', value === 0) +
        stepBtn('+1', 'data-step="1"', allIn) +
        stepBtn('+5', 'data-step="5"', allIn) +
        stepBtn('+10', 'data-step="10"', allIn) +
        '<button type="button" class="btn step all-in' + (allIn ? ' shaking' : '') + '" data-set="all">올인</button>' +
      '</div>' +
      (allIn ? '<p class="gulp">진심이세요?</p>' : '') +
      '<button type="button" class="btn btn-primary btn-lg btn-block bid-btn" id="btn-bid" data-act="submit"' + (sent === value ? ' disabled' : '') + '>' + label + ' · ' + value + '칩</button>' +
      (sent !== null && sent !== value ? '<p class="envelope-state">지금 봉투: ' + sent + '칩</p>' : '') +
      '<p class="tease">' + esc(Show.tease(data.room.round)) + '</p>' +
    '</div>';
  }

  function lotBlock(data) {
    var item = data.item;
    return '<div class="p-lot lot-' + item.kind + '">' +
      '<div class="lot-art">' + Art.item(item) + '</div>' +
      '<p class="eyebrow">' + data.room.round + ' / ' + data.room.rounds + '</p>' +
      '<h1 class="p-lot-name">' + esc(item.name) + '</h1>' +
      '<p class="p-lot-points"><span class="points-badge"><b>' + AuctionStage.pointsText(item) + '</b>점</span>' + AuctionStage.ruleMark(item) + '</p>' +
    '</div>';
  }

  function bidList(data) {
    var rows = data.result.bids.slice().sort(function (a, b) { return b.bid - a.bid; });
    return '<ol class="p-bids">' + rows.map(function (b) {
      return '<li' + (b.id === data.me.id ? ' class="mine"' : '') + '><span>' + esc(b.nickname) + '</span><b>' + b.bid + '칩</b></li>';
    }).join('') + '</ol>';
  }

  function myLine(data) {
    var me = data.me;
    return '<p class="my-line"><b>' + me.rank + '</b>위 · <b>' + me.score + '</b>점 · <b>' + me.chips + '</b>칩</p>';
  }

  function myAwards(data) {
    var mine = data.awards.filter(function (a) { return a.winners.indexOf(data.me.nickname) >= 0; });
    if (!mine.length) return '';
    return '<ul class="p-awards">' + mine.map(function (a) {
      return '<li><b>' + esc(a.title) + '</b><span>' + esc(Show.awardDesc(a)) + '</span></li>';
    }).join('') + '</ul>';
  }

  /** 결과 도장: 방금 바뀐 화면이면 쾅 찍고 진동·소리, 다시 그릴 때는 그대로 찍혀 있게 */
  function applyStamp(fresh) {
    var box = main.querySelector('.verdict-stamp:empty');
    if (!box) return;
    var text = box.getAttribute('data-text');
    var tone = box.getAttribute('data-tone');
    if (!fresh) {
      box.insertAdjacentHTML('beforeend', '<span class="stamp stamp-' + tone + ' still">' + esc(text) + '</span>');
      return;
    }
    MG.fx.stamp(box, text, tone, 150);
    MG.fx.vibrate(tone === 'out' ? [200, 80, 200] : [60, 40, 60, 40, 120]);
    if (tone !== 'ink') setTimeout(function () { MG.fx.play(tone === 'out' ? 'lose' : 'win'); }, 450);
  }

  function header() {
    var me = state.me;
    meBadge.hidden = false;
    meBadge.innerHTML = esc(me.nickname) + (hostToken ? ' <span class="host-badge">방장</span>' : '');
  }

  /* ───────── 휴대폰만으로 진행 ───────── */

  function phoneActions(phase, data) {
    if (phase === 'revealed' && data.room.status === 'finished') {
      return '<button class="btn btn-primary btn-lg btn-block" data-act="final">최종 결과</button>';
    }
    if (!hostToken) return '';
    if (phase === 'playing') return '<button class="btn btn-lg btn-block close-btn" data-act="reveal">마감</button>';
    if (phase === 'revealed') return '<button class="btn btn-primary btn-lg btn-block" data-act="next">다음 물건 →</button>';
    return '<button class="btn btn-primary btn-lg btn-block" data-act="restart">한 판 더</button>';
  }

  function ensureStage() {
    if (stage) return;
    main.innerHTML = '';
    stage = AuctionStage.create(main, {
      compact: true,
      highlight: state.me.id,
      actions: phoneActions,
      onVerdict: function (data, late) { mineAfterReveal(data, !late); }
    });
  }

  /** 공개 연출의 도장 순간: 물건 아래에 내 결과 도장 */
  function mineAfterReveal(data, fresh) {
    var slot = stage.slot('mine');
    if (!slot) return;
    var v = Show.myVerdict(data.result, data.me.id);
    slot.innerHTML = '<div class="my-result">' + verdictStamp(v.text, v.tone) + myLine(data) + '</div>';
    applyStamp(fresh);
  }

  function paintPhone() {
    var room = state.room;
    header();
    if (room.status === 'lobby') {
      stage = null;
      if (hostToken) {
        if (stageKey !== 'lobby' || !lobby) {
          lobby = MG.lobby.mount(main, {
            code: code,
            game: GAME,
            onStart: function () { act('start'); },
            onKick: function (id) { act('kick', { playerId: id }); },
            onSettings: function (patch) {
              return MG.post({ action: 'settings', code: code, hostToken: hostToken, settings: patch })
                .then(function () { return refresh(); })
                .catch(function (err) { MG.toast(err.message); });
            }
          });
        }
        stageKey = 'lobby';
        lobby.update(state);
        return;
      }
      lobby = null;
      stageKey = null;
      return paintString('lobby', screenLobby(state));
    }
    lobby = null;
    lastHtml = null;

    if (room.status === 'playing') {
      ensureStage();
      stageKey = 'playing:' + room.round;
      lastKey = stageKey;
      stage.playing(state);
      var slot = stage.slot('mine');
      var html = composerHtml(state);
      if (slot.getAttribute('data-html') !== html) {
        slot.innerHTML = html;
        slot.setAttribute('data-html', html);
      }
      return;
    }

    if (room.status === 'finished' && showFinal) {
      var fkey = 'final:' + room.round;
      if (stageKey !== fkey) {
        ensureStage();
        stageKey = fkey;
        stage.final(state, { animate: true });
        var me = state.me;
        stage.slot('mine').innerHTML = '<div class="my-result">' +
          (me.rank === 1 ? verdictStamp('우승', 'live') : verdictStamp(me.rank + '위', 'ink')) + myLine(state) + myAwards(state) + '</div>';
        applyStamp(true);
      } else {
        stage.update(state);
      }
      return;
    }

    // 공개됨: 모든 휴대폰이 "공개 시각 + PHONE_LEAD_MS"에 연출을 시작한다
    var key = room.status + ':' + room.round;
    if (stageKey === key || countingDown) {
      if (stage) stage.update(state);
      return;
    }
    ensureStage();
    stageKey = key;
    var elapsed = state.revealAgeMs + (Date.now() - receivedAt);
    var plan = Show.revealPlan(state.result);
    lastKey = key;
    // 연출이 이미 끝난 뒤에 열었으면 결과만. 연출 도중이면 (새로고침했어도) 지난 장면부터 이어서
    if (elapsed >= PHONE_LEAD_MS + plan.total) {
      stage.reveal(state, { animate: false });
      mineAfterReveal(state, false);
      return;
    }
    if (elapsed < PHONE_LEAD_MS) {
      countingDown = true;
      MG.fx.countdownTo(PHONE_LEAD_MS - elapsed).then(function () {
        countingDown = false;
        stage.reveal(state, { animate: true, rankingBefore: rankingBefore });
      });
      return;
    }
    stage.reveal(state, { animate: true, offsetMs: elapsed - PHONE_LEAD_MS, rankingBefore: rankingBefore });
  }

  /* ───────── PC 화면으로 진행 (휴대폰은 입찰칸) ───────── */

  function screenLobby(data) {
    return '<div class="screen center">' +
      '<p class="verdict-word">' + esc(data.me.nickname) + '</p>' +
      '<p class="eyebrow">참가했습니다</p>' +
      '<p class="lobby-chips">' + Art.stack(6) + '<b>' + data.me.chips + '</b>칩</p>' +
      '<p class="note">참가 <b>' + data.playerCount + '</b>명</p>' +
    '</div>';
  }

  /** PC 연출에서 봉투를 여는 동안 (내 결과는 PC 화면의 도장과 같은 순간에) */
  function screenWaiting(data) {
    return '<div class="screen center">' +
      '<div class="lot-art big">' + Art.item(data.item) + '</div>' +
      '<p class="verdict-word watch">두근두근</p>' +
      '<p class="look-up">↑ PC 화면</p>' +
    '</div>';
  }

  function screenRevealed(data) {
    var v = Show.myVerdict(data.result, data.me.id);
    return '<div class="screen center">' +
      verdictStamp(v.text, v.tone) +
      '<p class="screen-desc">' + esc(v.desc) + '</p>' +
      bidList(data) +
      myLine(data) +
    '</div>';
  }

  function screenFinished(data) {
    var me = data.me;
    return '<div class="screen center">' +
      (me.rank === 1 ? verdictStamp('우승', 'live') : verdictStamp(me.rank + '위', 'ink')) +
      myLine(data) +
      myAwards(data) +
      '<ol class="p-bids">' + data.ranking.map(function (r) {
        return '<li' + (r.id === me.id ? ' class="mine"' : '') + '><span>' + r.rank + '. ' + esc(r.nickname) + '</span><b>' + r.score + '점</b></li>';
      }).join('') + '</ol>' +
    '</div>';
  }

  /** 공개된 결과를 아직 숨겨야 하는 남은 시간 (ms) */
  function hideLeft(data) {
    var plan = Show.revealPlan(data.result);
    return Show.phoneWaitMs(plan, data.revealAgeMs) - (Date.now() - receivedAt);
  }

  function paintString(phase, html) {
    if (html === lastHtml) return;
    var key = phase + ':' + state.room.round;
    var fresh = key !== lastKey;
    main.innerHTML = html;
    if (!fresh && main.firstChild) main.firstChild.style.animation = 'none';
    else if (phase === 'playing') MG.fx.vibrate([60, 40, 60]);
    // 처음 열었을 때(lastKey 없음)는 이미 지난 결과라 연출 없이
    applyStamp(fresh && lastKey !== null);
    lastKey = key;
    lastHtml = html;
  }

  function paintPc() {
    var room = state.room;
    clearTimeout(waitTimer);
    header();
    if (room.status === 'lobby') return paintString('lobby', screenLobby(state));
    if (room.status === 'playing') return paintString('playing', '<div class="screen">' + lotBlock(state) + composerHtml(state) + '</div>');
    var left = hideLeft(state);
    if (left > 0) {
      waitTimer = setTimeout(paint, left);
      return paintString('waiting', screenWaiting(state));
    }
    paintString(room.status, room.status === 'revealed' ? screenRevealed(state) : screenFinished(state));
  }

  function paint() {
    if (!state) return;
    if (phoneMode()) paintPhone();
    else paintPc();
  }

  function setDraft(value) {
    var chips = state.me.chips;
    draft.bid = Math.max(0, Math.min(chips, value));
    if (draft.bid === chips) MG.fx.vibrate([30, 30, 30, 30, 30]);
    paint();
  }

  main.addEventListener('click', function (e) {
    if (!state) return;
    var actBtn = e.target.closest('[data-act]');
    var name = actBtn && !actBtn.disabled ? actBtn.getAttribute('data-act') : null;
    if (name === 'final') {
      showFinal = true;
      return paint();
    }
    if (name === 'reveal') return closeBidding();
    if (name === 'next' || name === 'restart') return act(name);
    if (state.room.status !== 'playing') return;
    var step = e.target.closest('[data-step]');
    var set = e.target.closest('[data-set]');
    if (step) return setDraft(draft.bid + Number(step.getAttribute('data-step')));
    if (set) return setDraft(set.getAttribute('data-set') === 'all' ? state.me.chips : 0);
    if (name === 'submit') {
      bids.push({ round: state.room.round, bid: draft.bid });
      MG.fx.vibrate(15);
      paint();
    }
  });

  if (code && token) poller.start();
  else showJoin();
})();
