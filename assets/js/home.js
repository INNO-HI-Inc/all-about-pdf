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

  // 커스텀 커서 (데스크톱) — 점은 즉시 따라오고, 링은 부드럽게 lerp, 인터랙티브 위에서 확대
  var reduce2 = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (fine && !reduce2) {
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
    var HOV = 'a,button,.tchip,.fcard,.dropzone,summary,.pillbtn,label,.iconbtn';
    document.addEventListener('mouseover', function (e) { if (e.target.closest && e.target.closest(HOV)) ring.classList.add('hover'); });
    document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest(HOV)) ring.classList.remove('hover'); });
  }
})();
