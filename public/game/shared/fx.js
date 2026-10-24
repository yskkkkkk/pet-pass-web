/**
 * 웃음 장치 — 카운트다운, 도장, 호외 헤드라인, 이름표 떨어지기, 효과음
 * 종이·인쇄물 톤에 맞춘 움직임만 쓴다. (모양은 shared/game.css의 "웃음 장치" 구역)
 * shared/logic.js, shared/common.js 다음에 읽는다.
 */
(function () {
  var MG = window.MG;
  var SOUND_KEY = 'minigame:sound';
  var audioCtx = null;
  var toggles = [];

  /* ───────── 효과음 (파일 없이 그 자리에서 합성) ───────── */

  function soundOn() {
    return MG.storageGet(SOUND_KEY) !== 'off';
  }

  function getAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // 브라우저는 사용자가 한 번 누른 뒤에야 소리를 낼 수 있게 한다.
  document.addEventListener('pointerdown', function () { if (soundOn()) getAudio(); }, { once: true });

  // 소리 하나: 주파수(freq → to로 미끄러짐), 길이, 파형, 크기, 시작 시각(at)
  var SOUNDS = {
    tick: [{ freq: 880, dur: 0.07, type: 'square', gain: 0.04 }],
    go: [{ freq: 660, dur: 0.08, gain: 0.08 }, { freq: 990, dur: 0.16, gain: 0.08, at: 0.08 }],
    stamp: [{ freq: 120, to: 50, dur: 0.2, type: 'triangle', gain: 0.3 }, { noise: true, dur: 0.07, gain: 0.2 }],
    fall: [{ freq: 760, to: 120, dur: 0.7, type: 'sawtooth', gain: 0.035 }],
    win: [{ freq: 523, dur: 0.12, gain: 0.08 }, { freq: 659, dur: 0.12, gain: 0.08, at: 0.12 }, { freq: 784, dur: 0.32, gain: 0.08, at: 0.24 }],
    lose: [{ freq: 330, to: 150, dur: 0.5, type: 'triangle', gain: 0.12 }]
  };

  function playPart(ac, p) {
    var start = ac.currentTime + (p.at || 0);
    var gain = ac.createGain();
    gain.gain.setValueAtTime(p.gain || 0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + p.dur);
    gain.connect(ac.destination);

    var src;
    if (p.noise) {
      var buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * p.dur), ac.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      src = ac.createBufferSource();
      src.buffer = buffer;
    } else {
      src = ac.createOscillator();
      src.type = p.type || 'sine';
      src.frequency.setValueAtTime(p.freq, start);
      if (p.to) src.frequency.exponentialRampToValueAtTime(p.to, start + p.dur);
    }
    src.connect(gain);
    src.start(start);
    src.stop(start + p.dur + 0.02);
  }

  function play(name) {
    if (!soundOn() || !SOUNDS[name]) return;
    var ac = getAudio();
    if (!ac) return;
    try {
      for (var i = 0; i < SOUNDS[name].length; i++) playPart(ac, SOUNDS[name][i]);
    } catch (e) { /* 소리는 실패해도 게임은 계속 */ }
  }

  function renderToggle(btn) {
    var on = soundOn();
    btn.textContent = on ? '소리 켬' : '소리 끔';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  /** 소리 켜기/끄기 버튼. 고른 값은 이 기기에 기억한다 */
  function soundToggle() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sound-toggle';
    renderToggle(btn);
    btn.addEventListener('click', function () {
      MG.storageSet(SOUND_KEY, soundOn() ? 'off' : 'on');
      for (var i = 0; i < toggles.length; i++) renderToggle(toggles[i]);
      if (soundOn()) play('tick');
    });
    toggles.push(btn);
    return btn;
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /* ───────── 움직임 ───────── */

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 3·2·1 카운트다운. waitFor(Promise)를 주면 숫자가 끝난 뒤 그 작업이 끝날 때까지 "집계 중…"을 보여준다.
   * @returns {Promise} 카운트다운과 waitFor가 모두 끝나면
   */
  function countdown(waitFor) {
    var overlay = document.createElement('div');
    overlay.className = 'countdown';
    overlay.setAttribute('aria-live', 'assertive');
    document.body.appendChild(overlay);

    var pending = !!waitFor;
    var work = Promise.resolve(waitFor).then(function () { pending = false; });

    return new Promise(function (resolve) {
      var n = 3;
      (function step() {
        if (n === 0) {
          if (pending) overlay.innerHTML = '<span class="countdown-wait">집계 중…</span>';
          work.then(function () {
            overlay.remove();
            play('go');
            resolve();
          });
          return;
        }
        overlay.innerHTML = '<span>' + n + '</span>';
        play('tick');
        n -= 1;
        setTimeout(step, 700);
      })();
    });
  }

  /**
   * 도장 쾅. target 안에 비스듬한 도장을 찍고 살짝 흔든다.
   * tone: 'out'(탈락·벌칙, 벽돌색) | 'live'(생존·우승, 녹색) | 'ink'(그 밖, 잉크색)
   */
  function stamp(target, text, tone, delayMs) {
    if (!target) return;
    setTimeout(function () {
      var el = document.createElement('span');
      el.className = 'stamp stamp-' + (tone || 'ink');
      el.textContent = text;
      target.classList.add('has-stamp');
      target.appendChild(el);
      if (!reducedMotion()) {
        target.classList.remove('thud');
        void target.offsetWidth; // 같은 요소에 다시 흔들기
        target.classList.add('thud');
      }
      play('stamp');
    }, delayMs || 0);
  }

  /** 호외 헤드라인 HTML (넣으면 왼쪽부터 펼쳐진다) */
  function headline(text) {
    return '<p class="headline"><span>' + MG.escapeHtml(text) + '</span></p>';
  }

  /** 이름표들이 차례로 비뚤게 툭 떨어진다 */
  function drop(elements, delayMs) {
    var list = Array.prototype.slice.call(elements || []);
    if (list.length === 0) return;
    for (var i = 0; i < list.length; i++) {
      list[i].style.setProperty('--r', ((i % 2 ? 1 : -1) * (8 + (i * 7) % 14)) + 'deg');
      list[i].style.setProperty('--d', ((delayMs || 0) + i * 90) + 'ms');
      list[i].classList.add('falling');
    }
    setTimeout(function () { play('fall'); }, delayMs || 0);
  }

  MG.fx = {
    play: play,
    soundOn: soundOn,
    soundToggle: soundToggle,
    vibrate: vibrate,
    countdown: countdown,
    stamp: stamp,
    headline: headline,
    drop: drop
  };
})();
