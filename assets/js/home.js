/* 홈(작업실 OS): 라이브 시계 + 도구 탭 전환 + 스크롤 리빌 (콘텐츠는 HTML에, JS는 동작만) */
(function () {
  // 1) 태스크바 라이브 시계
  var clock = document.getElementById('ws-clock');
  if (clock) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var tick = function () { var d = new Date(); clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
    tick(); setInterval(tick, 1000);
  }

  // 2) 히어로 도구 탭 전환
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.herotool__tab'));
  if (tabs.length) {
    var panels = Array.prototype.slice.call(document.querySelectorAll('.herotool__panel'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var slug = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === slug ? 'true' : 'false'); });
        panels.forEach(function (pn) { pn.classList.toggle('is-active', pn.getAttribute('data-panel') === slug); });
      });
    });
  }

  // 3) 스크롤 리빌
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (els.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
      els.forEach(function (e) { io.observe(e); });
    }
  }
})();
