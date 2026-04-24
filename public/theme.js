(function () {
  var THEMES = ['beige', 'white', 'dark'];

  function applyTheme(t) {
    if (t === 'beige') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    document.querySelectorAll('.theme-dot').forEach(function (dot) {
      dot.classList.toggle('active', dot.dataset.t === t);
    });
    localStorage.setItem('pet-pass-theme', t);
  }

  function cycleTheme() {
    var cur = localStorage.getItem('pet-pass-theme') || 'beige';
    var next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    applyTheme(next);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var t = localStorage.getItem('pet-pass-theme') || 'beige';
    applyTheme(t);
  });

  window.cycleTheme = cycleTheme;
  window.applyTheme = applyTheme;
})();
