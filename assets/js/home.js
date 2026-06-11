/* 홈 스크롤 리빌 (2026 다이내믹 모션) — 콘텐츠는 HTML에 있고, JS는 등장만 담당 */
(function () {
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  var arr = Array.prototype.slice.call(els);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    arr.forEach(function (e) { e.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  arr.forEach(function (e) { io.observe(e); });

  // 커서 따라오는 앰비언트 글로우 (데스크톱 · 모션 허용 시)
  var reduce2 = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (fine && !reduce2) {
    var g = document.createElement('div');
    g.className = 'cursor-glow';
    document.body.appendChild(g);
    var gx = window.innerWidth / 2, gy = window.innerHeight / 2, mx = gx, my = gy;
    document.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
    (function loop() {
      gx += (mx - gx) * 0.12; gy += (my - gy) * 0.12;
      g.style.transform = 'translate(' + (gx - 150) + 'px,' + (gy - 150) + 'px)';
      window.requestAnimationFrame(loop);
    })();
  }
})();
