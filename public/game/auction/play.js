/* 블라인드 경매 · 참가자(모바일) 화면 */
(function () {
  var esc = MG.escapeHtml;
  var Show = window.AuctionShow;
  var params = new URLSearchParams(location.search);
  var code = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);
  var main = document.getElementById('play-main');
  var meBadge = document.getElementById('p-me');
  document.querySelector('.play-header').appendChild(MG.fx.soundToggle());

  var token = code ? MG.storageGet(MG.playerKey(code)) : null;
  var state = null;
  var receivedAt = 0;        // 상태를 받은 시각 (공개 연출 대기 시간 계산용)
  var lastKey = null;
  var lastHtml = null;
  var waitTimer = null;
  var draft = { round: -1, bid: 0 }; // 입찰 화면에서 고르는 중인 금액
  var poller = MG.createPoller(refresh, 2000);

  /* ───────── 참가 ───────── */

  function showJoin(message) {
    poller.stop();
    lastKey = lastHtml = null;
    meBadge.hidden = true;
    MG.join.show(main, {
      code: code,
      desc: '한정된 칩으로 몰래 입찰하는 경매. 가장 많이 건 사람이 물건을 가져갑니다.',
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
    paint();
  }

  /* ───────── 화면 ───────── */

  function pointsText(item) {
    if (item.points === null) return '?점';
    return (item.points < 0 ? '−' + Math.abs(item.points) : item.points) + '점';
  }

  function lotBlock(data) {
    var item = data.item;
    var rule = item.kind === 'cursed'
      ? '저주 물건! 가장 <b>적게</b> 건 사람이 떠안아요.'
      : (item.kind === 'mystery' ? '상자 안은 0~5점. 열어 봐야 알아요.' : '가장 많이 건 사람이 가져가요.');
    return '<div class="p-lot lot-' + item.kind + '">' +
      '<p class="eyebrow">' + data.room.round + ' / ' + data.room.rounds + ' 물건</p>' +
      '<h1 class="p-lot-name">' + esc(item.name) + '</h1>' +
      '<p class="p-lot-points"><span class="points-badge">' + pointsText(item) + '</span></p>' +
      '<p class="p-lot-rule">' + rule + '</p>' +
    '</div>';
  }

  function verdictStamp(text, tone) {
    return '<div class="verdict-stamp" data-text="' + esc(text) + '" data-tone="' + tone + '"></div>';
  }

  function screenLobby(data) {
    return '<div class="screen">' +
      '<h1 class="screen-title">' + esc(data.me.nickname) + '님,<br>참가했습니다.</h1>' +
      '<p class="screen-desc">칩 <b>' + data.me.chips + '개</b>로 시작해요. 진행자가 시작하면 이 화면에 첫 물건이 나타납니다.</p>' +
      '<p class="note">지금 <b>' + data.playerCount + '명</b> 참가 중</p>' +
    '</div>';
  }

  function screenPlaying(data) {
    var me = data.me;
    var chips = me.chips;
    if (chips === 0) {
      return '<div class="screen">' + lotBlock(data) +
        '<p class="note">칩을 다 썼어요. 이번 물건은 자동으로 0칩이에요. 구경하면서 응원해 주세요.</p>' +
      '</div>';
    }
    var sent = sentBid(data);
    var saving = bids.isSaving();
    var value = draft.bid;
    var allIn = value === chips;
    var label;
    var status;
    if (sent === null) {
      label = '봉투 넣기 · ' + value + '칩';
      status = '아직 봉투를 안 냈어요. 안 내면 0칩으로 칩니다.';
    } else if (sent === value) {
      label = (saving ? '봉투 넣는 중… · ' : '봉투 넣음 · ') + value + '칩';
      status = '공개 전까지 바꿀 수 있어요.';
    } else {
      label = '봉투 바꿔치기 · ' + value + '칩';
      status = '지금 낸 봉투: ' + sent + '칩';
    }
    function stepBtn(text, attr, disabled) {
      return '<button type="button" class="btn btn-quiet step" ' + attr + (disabled ? ' disabled' : '') + '>' + text + '</button>';
    }
    return '<div class="screen">' +
      lotBlock(data) +
      '<div class="composer">' +
        '<p class="draft"><b id="draft-bid">' + value + '</b>칩<span class="of"> / 남은 칩 ' + chips + '</span></p>' +
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
        '<button type="button" class="btn btn-primary btn-lg btn-block" id="btn-bid" data-act="submit"' + (sent === value ? ' disabled' : '') + '>' + label + '</button>' +
        '<p class="envelope-state">' + status + '</p>' +
      '</div>' +
      '<p class="tease">' + esc(Show.tease(data.room.round)) + '</p>' +
    '</div>';
  }

  /** 진행 화면에서 봉투를 여는 동안 (내 결과는 진행 화면의 도장과 같은 순간에) */
  function screenWaiting(data) {
    return '<div class="screen center">' +
      '<p class="verdict-word watch">두근두근</p>' +
      '<p class="screen-desc">진행 화면에서 봉투를 열고 있어요.<br>고개를 들어 화면을 보세요!</p>' +
      '<p class="eyebrow">‘' + esc(data.item.name) + '’</p>' +
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
    return '<p class="note">내 칩 <b>' + me.chips + '</b> · 점수 <b>' + me.score + '</b> · <b>' + me.rank + '</b>위 / ' + data.playerCount + '명</p>';
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
    var mine = data.awards.filter(function (a) { return a.winners.indexOf(me.nickname) >= 0; });
    var last = Show.myVerdict(data.result, me.id);
    return '<div class="screen center">' +
      (me.rank === 1 ? verdictStamp('우승', 'live') : verdictStamp(me.rank + '위', 'ink')) +
      '<p class="screen-desc">최종 ' + me.score + '점 · 남은 칩 ' + me.chips + '개</p>' +
      '<p class="eyebrow">마지막 물건 ‘' + esc(data.result.item.name) + '’: ' + esc(last.text) + '</p>' +
      (mine.length
        ? '<ul class="p-awards">' + mine.map(function (a) {
          return '<li><b>' + esc(a.title) + '</b><span>' + esc(Show.awardDesc(a)) + '</span></li>';
        }).join('') + '</ul>'
        : '') +
      '<ol class="p-bids">' + data.ranking.map(function (r) {
        return '<li' + (r.id === me.id ? ' class="mine"' : '') + '><span>' + r.rank + '. ' + esc(r.nickname) + '</span><b>' + r.score + '점</b></li>';
      }).join('') + '</ol>' +
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
    if (tone !== 'ink') setTimeout(function () { MG.fx.play(tone === 'out' ? 'lose' : 'win'); }, 450);
  }

  /** 공개된 결과를 아직 숨겨야 하는 남은 시간 (ms) */
  function hideLeft(data) {
    var plan = Show.revealPlan(data.result);
    return Show.phoneWaitMs(plan, data.revealAgeMs) - (Date.now() - receivedAt);
  }

  function paint() {
    if (!state) return;
    var room = state.room;
    var me = state.me;
    clearTimeout(waitTimer);

    meBadge.hidden = false;
    meBadge.innerHTML = esc(me.nickname) + ' · 칩 <b>' + me.chips + '</b> · ' + me.score + '점';

    var html;
    var phase = room.status;
    if (room.status === 'lobby') html = screenLobby(state);
    else if (room.status === 'playing') html = screenPlaying(state);
    else {
      var left = hideLeft(state);
      if (left > 0) {
        phase = 'waiting';
        html = screenWaiting(state);
        waitTimer = setTimeout(paint, left);
        // 공개 전 칩·점수는 아직 보여주지 않는다
        meBadge.innerHTML = esc(me.nickname);
      } else {
        html = room.status === 'revealed' ? screenRevealed(state) : screenFinished(state);
      }
    }

    if (html === lastHtml) return;
    var key = phase + ':' + room.round;
    var fresh = key !== lastKey;
    main.innerHTML = html;
    if (!fresh && main.firstChild) main.firstChild.style.animation = 'none';
    else if (room.status === 'playing') MG.fx.vibrate([60, 40, 60]);
    // 처음 열었을 때(lastKey 없음)는 이미 지난 결과라 연출 없이
    applyStamp(fresh && lastKey !== null);
    lastKey = key;
    lastHtml = html;
  }

  function setDraft(value) {
    var chips = state.me.chips;
    draft.bid = Math.max(0, Math.min(chips, value));
    if (draft.bid === chips) MG.fx.vibrate([30, 30, 30, 30, 30]);
    paint();
  }

  main.addEventListener('click', function (e) {
    if (!state || state.room.status !== 'playing') return;
    var step = e.target.closest('[data-step]');
    var set = e.target.closest('[data-set]');
    if (step) return setDraft(draft.bid + Number(step.getAttribute('data-step')));
    if (set) return setDraft(set.getAttribute('data-set') === 'all' ? state.me.chips : 0);
    if (e.target.closest('[data-act="submit"]')) {
      bids.push({ round: state.room.round, bid: draft.bid });
      MG.fx.vibrate(15);
      paint();
    }
  });

  if (code && token) poller.start();
  else showJoin();
})();
