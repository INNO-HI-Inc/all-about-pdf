/* 홈 인터랙션: 도구 탭 전환 + 스크롤 리빌 + 커스텀 커서 (콘텐츠는 HTML에, JS는 동작만) */
(function () {
  // 1) 히어로 도구 탭 전환
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.herotool__tab'));
  if (tabs.length) {
    var panels = Array.prototype.slice.call(document.querySelectorAll('.herotool__panel'));
    var setTab = function (slug) {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === slug ? 'true' : 'false'); });
      panels.forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-panel') === slug); });
    };
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { setTab(tab.getAttribute('data-tab')); });
    });
  }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 2) 스크롤 리빌
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (els.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      els.forEach(function (e) { io.observe(e); });
    }
  }

  // 3) 커스텀 커서 (데스크톱 · 모션 허용 시)
  var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (fine && !reduce) {
    document.body.classList.add('has-cursor');
    var dot = document.createElement('div'); dot.className = 'cur-dot';
    var ring = document.createElement('div'); ring.className = 'cur-ring';
    document.body.appendChild(dot); document.body.appendChild(ring);
    var mx = window.innerWidth / 2, my = window.innerHeight / 2, rx = mx, ry = my;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
    });
    (function loop() {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      window.requestAnimationFrame(loop);
    })();
    var HOV = 'a,button,.tchip,.dropzone,summary,.pillbtn,label,.iconbtn,.herotool__tab';
    document.addEventListener('mouseover', function (e) { if (e.target.closest && e.target.closest(HOV)) ring.classList.add('hover'); });
    document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest(HOV)) ring.classList.remove('hover'); });
  }
})();
