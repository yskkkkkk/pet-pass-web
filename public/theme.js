(function () {
  var THEMES = ['beige', 'white', 'dark'];
  var ICONS  = { beige: '🌸 베이지', white: '☀️ 화이트', dark: '🌙 다크' };

  function applyTheme(t) {
    if (t === 'beige') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    var btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = ICONS[t];
    localStorage.setItem('pet-pass-theme', t);
  }

  function cycleTheme() {
    var cur = localStorage.getItem('pet-pass-theme') || 'beige';
    var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next);
  }

  /* DOMContentLoaded 후 버튼 텍스트 초기화 */
  document.addEventListener('DOMContentLoaded', function () {
    var t = localStorage.getItem('pet-pass-theme') || 'beige';
    applyTheme(t);
  });

  /* 전역 노출 */
  window.cycleTheme = cycleTheme;
  window.applyTheme = applyTheme;
})();
