/**
 * 블라인드 경매 "경매장" 그리기 — PC 진행 화면과 휴대폰(휴대폰만으로 진행할 때)이 함께 쓴다.
 * 경매 일정표, 물건, 책상과 봉투(입찰 중), 칩을 미는 공개 연출, 최종 순위·시상식.
 * shared/*.js, auction/show.js, auction/art.js 다음에 읽는다.
 *
 *   var stage = AuctionStage.create(root, {
 *     compact: true,                      // 휴대폰 (순위표를 아래로, 물건을 작게)
 *     actions: function (phase, data) {}, // 아래 버튼 줄 HTML (data-act="이름" 버튼. 클릭은 부르는 쪽이 받는다)
 *     onVerdict: function (data) {}       // 공개 연출에서 도장이 찍히는 순간
 *   });
 *   stage.playing(data)                   입찰 중 (처음이면 그리고, 이후로는 봉투만 갱신)
 *   stage.reveal(data, { animate, offsetMs, rankingBefore })  → Promise (연출이 끝나면)
 *   stage.final(data, { animate })
 *   stage.slot(name)                      'mine'(물건 아래, 휴대폰 입찰칸) / 'actions' 요소
 */
(function () {
  var MG = window.MG;
  var esc = MG.escapeHtml;
  var Show = window.AuctionShow;
  var Art = window.AuctionArt;

  function pointsText(item) {
    if (item.points === null) return '?';
    return item.points < 0 ? '−' + Math.abs(item.points) : String(item.points);
  }

  /** 규칙은 글 대신 기호로: ↑ 최고가가 가져감 / ↓ 최저가가 떠안음 / ? 열어 봐야 앎 */
  function ruleMark(item) {
    if (item.kind === 'cursed') return '<span class="rule-mark rule-low" title="가장 적게 건 사람이 떠안아요">↓ 최저가 떠안기</span>';
    if (item.kind === 'mystery') return '<span class="rule-mark rule-box" title="0~5점, 열어 봐야 알아요">↑ 최고가 · 0~5점</span>';
    return '<span class="rule-mark" title="가장 많이 건 사람이 가져가요">↑ 최고가</span>';
  }

  function pointsBadge(item, id) {
    return '<span class="points-badge"' + (id ? ' id="' + id + '"' : '') + '><b>' + pointsText(item) + '</b>점</span>';
  }

  function lotCard(item, room) {
    return '<div class="lot lot-' + item.kind + '" id="lot">' +
      '<div class="lot-art">' + Art.item(item) + '</div>' +
      '<div class="lot-text">' +
        '<p class="eyebrow">' + room.round + ' / ' + room.rounds + '</p>' +
        '<h1 class="lot-name">' + esc(item.name) + '</h1>' +
        '<p class="lot-points">' + pointsBadge(item, 'lot-points') + ruleMark(item) + '</p>' +
      '</div>' +
    '</div>';
  }

  function whoTook(h) {
    if (h.outcome === 'tie') return '공중분해';
    if (h.outcome === 'nobid') return '유찰';
    return h.names.map(esc).join(', ');
  }

  /**
   * 경매 일정표: 물건 그림과 점수. 지난 물건은 누가 가져갔는지
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
      var shown = item.round === room.round && hideCurrent && item.kind === 'mystery' ? Object.assign({}, item, { points: null }) : item;
      return '<li class="' + cls + '" title="' + esc(item.name) + '">' +
        '<span class="li-art">' + Art.item(item) + '</span>' +
        '<span class="li-points">' + pointsText(shown) + '</span>' +
        '<span class="li-who">' + (done ? whoTook(h) : '') + '</span>' +
      '</li>';
    }).join('') + '</ol>';
  }

  function chipsCell(row) {
    if (row.chips === 0) return '<span class="wallet-empty" title="텅 빈 지갑">' + Art.emptyWallet() + '</span>';
    return row.chips + '<small>칩</small>';
  }

  function create(root, opts) {
    var compact = !!opts.compact;
    var board = null;
    var anim = null;
    var animating = false;
    var seen = {};
    var mounted = null;   // 지금 그려 둔 화면 'playing:3' 등
    var current = null;   // 마지막으로 받은 상태

    function startChips() {
      return Number(current.settings.chips);
    }

    function find(sel) {
      return root.querySelector(sel);
    }

    function cancel() {
      if (anim) anim.cancel();
      anim = null;
      animating = false;
    }

    function mountBoard(el) {
      board = MG.scoreboard.mount(el, {
        title: '순위',
        highlight: opts.highlight,
        columns: [
          { key: 'score', label: '점수', render: function (r) { return r.score + '<small>점</small>'; } },
          { key: 'chips', label: '남은 칩', render: chipsCell }
        ]
      });
    }

    function actionsHtml(phase, data) {
      return '<div class="actions" data-slot="actions">' + (opts.actions ? opts.actions(phase, data) : '') + '</div>';
    }

    function layout(cls, data, top, floor, phase) {
      root.innerHTML =
        '<div class="auction ' + cls + (compact ? ' compact' : '') + '">' +
          top +
          '<div class="auction-body">' +
            '<section class="auction-floor">' + floor + actionsHtml(phase, data) + '</section>' +
            '<aside class="auction-side" data-slot="board"></aside>' +
          '</div>' +
        '</div>';
      mountBoard(find('[data-slot="board"]'));
    }

    /* ───────── 입찰 중: 책상과 봉투 ───────── */

    function playing(data) {
      current = data;
      var key = 'playing:' + data.room.round;
      if (mounted !== key) {
        cancel();
        mounted = key;
        seen = {};
        layout('playing', data, lineupStrip(data),
          lotCard(data.item, data.room) +
          '<div data-slot="mine"></div>' +
          '<div class="table"><div class="table-top">' + data.players.map(function (p) {
            seen[p.id] = { submitted: p.submitted, changes: p.changes };
            return '<div class="seat" data-id="' + esc(p.id) + '">' +
              '<div class="slot' + (p.submitted ? ' filled' : '') + '">' + Art.envelope() + '</div>' +
              '<span class="seat-name">' + esc(p.nickname) + '</span>' +
              '<span class="seat-caption" aria-live="polite"></span>' +
            '</div>';
          }).join('') + '</div></div>' +
          '<p class="bid-progress" data-slot="progress"></p>', 'playing');
      }
      find('[data-slot="progress"]').innerHTML = Art.envelope() + ' <b>' + data.submittedCount + '</b> / ' + data.players.length;
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
      return find('.seat[data-id="' + id + '"]');
    }

    /** 화면 아래 바깥에서 손이 들어온다. carry: 봉투를 들고 있는지 */
    function flyingHand(slot, carry) {
      var el = document.createElement('div');
      el.className = 'flying-hand' + (carry ? ' carrying' : '') + (compact ? ' small' : '');
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

    function canFly(slot) {
      if (MG.fx.reducedMotion() || !document.body.animate) return false;
      var r = slot.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight; // 화면 밖 자리에는 손을 보내지 않는다
    }

    /** 처음 낸 봉투: 손이 봉투를 밀어 넣고 빠진다 */
    function deliver(id) {
      var seat = seatOf(id);
      if (!seat) return;
      var slot = seat.querySelector('.slot');
      if (!canFly(slot)) { slot.classList.add('filled'); return; }
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
      if (!seat) return;
      var slot = seat.querySelector('.slot');
      var caption = seat.querySelector('.seat-caption');
      caption.textContent = times > 1 ? '바꿔치기 ×' + times : '바꿔치기!';
      caption.classList.remove('pop');
      void caption.offsetWidth;
      caption.classList.add('pop');
      if (!canFly(slot)) return;
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

    function bidRow(b, step, still) {
      var pose = Show.handPose(b.bid, startChips());
      var hands = pose === 'heave' ? Art.hand('open') + Art.hand('open') : Art.hand(pose === 'finger' ? 'finger' : 'open');
      return '<div class="bid-row' + (still ? ' shown' : ' pending') + (step.final ? ' final' : '') + (b.id === opts.highlight ? ' mine' : '') + '" data-id="' + esc(b.id) + '" data-pose="' + pose + '">' +
        '<span class="bid-name">' + esc(b.nickname) + (b.submitted ? '' : '<small>안 냄</small>') + '</span>' +
        '<div class="bid-lane">' +
          '<div class="pusher">' + hands + (pose === 'heave' ? '<span class="grunt">끄응</span>' : '') + (pose === 'empty' ? '<span class="grunt">빈손</span>' : '') + '</div>' +
          '<div class="stack">' + Art.stack(Show.stackSize(b.bid, startChips())) + '</div>' +
        '</div>' +
        '<span class="bid-amount">' + b.bid + '<small>칩</small>' + (b.allIn ? '<em>올인</em>' : '') + '</span>' +
      '</div>';
    }

    /**
     * @param {object} o
     *   animate        연출을 틀지 (새로고침으로 다시 그릴 때는 끔)
     *   offsetMs       연출을 이만큼 지난 시점부터 (휴대폰이 늦게 받았을 때 다른 휴대폰과 맞춘다)
     *   rankingBefore  공개 직전 순위 (판정 뒤 새 순위로 움직인다)
     * @returns {Promise} 연출이 끝나면
     */
    function reveal(data, o) {
      current = data;
      cancel();
      mounted = data.room.status + ':' + data.room.round;
      var animate = !!o.animate;
      var r = data.result;
      var plan = Show.revealPlan(r);
      var byId = {};
      r.bids.forEach(function (b) { byId[b.id] = b; });
      var firstFinal = plan.steps.filter(function (x) { return x.final; })[0];
      var rows = plan.steps.map(function (s) {
        var row = bidRow(byId[s.id], s, !animate);
        if (s === firstFinal) {
          row = '<p class="suspense" id="suspense"' + (animate ? ' hidden' : '') + '>' + (r.outcome === 'cursed' ? '↓ 최저가는' : '↑ 최고가는') + '</p>' + row;
        }
        return row;
      }).join('');

      // 공개 전 상자 점수는 "?"로 그렸다가 연출에서 연다
      var lotItem = animate && r.item.kind === 'mystery' ? Object.assign({}, data.item, { points: null }) : data.item;
      layout('revealed', data, lineupStrip(data, animate) +
        '<div id="headline-slot">' + (animate ? '' : MG.fx.headline(Show.roundHeadline(r))) + '</div>',
        lotCard(lotItem, data.room) + '<div data-slot="mine"></div>' + '<div class="bidboard">' + rows + '</div>', 'revealed');

      var actions = find('[data-slot="actions"]');
      if (!animate) {
        verdict(r, false);
        return Promise.resolve();
      }

      actions.hidden = true;
      animating = true;
      board.update(o.rankingBefore && o.rankingBefore.length ? o.rankingBefore : data.ranking);
      var steps = plan.steps.map(function (s) {
        return {
          at: s.at,
          run: function (late) {
            var row = find('.bid-row[data-id="' + s.id + '"]');
            row.classList.remove('pending');
            row.classList.add('shown');
            if (late) return;
            row.classList.add('pushing');
            MG.fx.play(byId[s.id].bid ? 'chips' : 'swish');
          }
        };
      });
      if (plan.suspenseAt !== null) {
        steps.push({
          at: plan.suspenseAt,
          run: function (late) {
            var el = document.getElementById('suspense');
            el.hidden = false;
            if (late) return;
            // 표가 길면 결정적인 줄이 보이게 내린다
            var rect = el.getBoundingClientRect();
            if (rect.bottom + 140 > window.innerHeight) window.scrollBy({ top: rect.bottom + 140 - window.innerHeight, behavior: 'smooth' });
            MG.fx.play('drum');
          }
        });
      }
      if (plan.openAt !== null) {
        steps.push({ at: plan.openAt, run: function (late) { if (!late) { document.getElementById('lot-points').classList.add('rattle'); MG.fx.play('box'); } } });
        steps.push({ at: plan.openAt + Show.BOX_MS - 400, run: function () { openBox(r.item); } });
      }
      steps.push({ at: plan.verdictAt, run: function (late) { verdict(r, !late); if (opts.onVerdict) opts.onVerdict(data, late); } });
      steps.push({
        at: plan.verdictAt + 900,
        run: function () {
          animating = false;
          board.update(current.ranking);
        }
      });
      steps.push({ at: plan.total, run: function () { actions.hidden = false; } });
      anim = MG.fx.timeline(steps, o.offsetMs || 0);
      return anim.done;
    }

    /** 미스터리 상자 열기: 덜컹거리다 점수가 나온다. 0점이면 먼지만 */
    function openBox(item) {
      var badge = document.getElementById('lot-points');
      badge.classList.remove('rattle');
      badge.classList.add('opened');
      if (item.points === 0) badge.classList.add('dud');
      badge.innerHTML = '<b>' + item.points + '</b>점';
      find('.lineup-item.current .li-points').textContent = String(item.points);
    }

    /** 판정: 도장, 공중분해, 저주 떠넘기기, 헤드라인 */
    function verdict(r, animate) {
      var takerIds = r.outcome === 'cursed' ? r.cursedIds : (r.outcome === 'win' ? r.winnerIds : r.tiedIds);
      var rowsOf = function (ids) {
        return ids.map(function (id) { return find('.bid-row[data-id="' + id + '"]'); });
      };
      Array.prototype.forEach.call(root.querySelectorAll('.bid-row'), function (row) {
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
          row.querySelector('.bid-name').insertAdjacentHTML('beforeend', '<span class="curse-tag">' + Art.item(r.item) + '</span>');
        });
      } else {
        text = '유찰';
        tone = 'ink';
        targets = [document.getElementById('lot')];
      }

      var last = current.history[current.history.length - 1];
      find('.lineup-item.current .li-who').innerHTML = whoTook(last);
      if (!animate) {
        targets.forEach(function (el) { el.insertAdjacentHTML('beforeend', '<span class="stamp stamp-' + tone + ' still">' + text + '</span>'); });
        document.getElementById('headline-slot').innerHTML = MG.fx.headline(Show.roundHeadline(r));
        return;
      }
      if (r.outcome === 'tie') MG.fx.play('poof');
      if (r.outcome === 'cursed') MG.fx.drop(root.querySelectorAll('.curse-tag'), 0);
      targets.forEach(function (el, i) { MG.fx.stamp(el, text, tone, 250 + i * 200); });
      setTimeout(function () { MG.fx.play(r.outcome === 'win' ? 'gavel' : 'lose'); }, 650);
      document.getElementById('headline-slot').innerHTML = MG.fx.headline(Show.roundHeadline(r));
    }

    /* ───────── 최종 결과와 시상식 ───────── */

    function final(data, o) {
      current = data;
      cancel();
      mounted = 'final:' + data.room.round;
      var animate = !!o.animate;
      root.innerHTML =
        '<div class="auction final' + (compact ? ' compact' : '') + '">' +
          MG.fx.headline(Show.finalHeadline(data.ranking)) +
          '<div data-slot="mine"></div>' +
          '<div class="final-body">' +
            '<section class="final-ranking" data-slot="board"></section>' +
            '<section class="final-awards" data-slot="awards"></section>' +
          '</div>' +
          actionsHtml('final', data) +
        '</div>';
      mountBoard(find('[data-slot="board"]'));
      board.update(data.ranking);
      Array.prototype.forEach.call(root.querySelectorAll('.sb-first .sb-name'), function (el) {
        if (animate) MG.fx.stamp(el, '우승', 'live', 600);
        else el.insertAdjacentHTML('beforeend', '<span class="stamp stamp-live still">우승</span>');
      });
      if (animate) setTimeout(function () { MG.fx.play('win'); }, 900);
      anim = MG.awards.show(find('[data-slot="awards"]'), data.awards, { animate: animate, descOf: Show.awardDesc });
    }

    return {
      playing: playing,
      reveal: reveal,
      final: final,
      cancel: cancel,
      /** 공개 연출 중이 아니면 순위표를 새 상태로 */
      update: function (data) {
        current = data;
        if (!animating && board) board.update(data.ranking);
      },
      isAnimating: function () { return animating; },
      mounted: function () { return mounted; },
      reset: function () { cancel(); mounted = null; },
      slot: function (name) { return find('[data-slot="' + name + '"]'); }
    };
  }

  window.AuctionStage = { create: create, pointsText: pointsText, ruleMark: ruleMark };
})();
