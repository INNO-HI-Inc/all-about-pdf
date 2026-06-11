/* 홈(작업실 OS): 도구 탭 전환 + 업로드 시 앱 풀스크린 전환 + 스크롤 리빌
   (콘텐츠는 HTML에, JS는 동작만 — 크롤러는 JS 없이도 전체 내용을 읽음) */
(function () {
  var d = document;

  // 1) 히어로 도구 탭 전환
  var tabs = Array.prototype.slice.call(d.querySelectorAll('.herotool__tab'));
  var panels = Array.prototype.slice.call(d.querySelectorAll('.herotool__panel'));
  function activateTab(slug) {
    tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === slug ? 'true' : 'false'); });
    panels.forEach(function (pn) { pn.classList.toggle('is-active', pn.getAttribute('data-panel') === slug); });
  }
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () { activateTab(tab.getAttribute('data-tab')); });
  });

  // 2) 업로드 시 → pdf_tools.app 풀스크린 전환
  var win = d.querySelector('[data-ws-window]');
  if (win) {
    var scrim = d.createElement('div');
    scrim.className = 'ws-scrim'; scrim.setAttribute('aria-hidden', 'true');
    d.body.appendChild(scrim);

    var open = function () {
      if (d.body.classList.contains('ws-app-open')) return;
      d.body.classList.add('ws-app-open');
      win.classList.add('is-max');
      // 작업 영역으로 포커스 이동(접근성)
      var panel = win.querySelector('.herotool__panel.is-active');
      if (panel) { var f = panel.querySelector('.js-run, .js-pagegrid, .js-files'); if (f && f.scrollIntoView) {} }
    };
    var close = function () {
      if (!d.body.classList.contains('ws-app-open')) return;
      d.body.classList.remove('ws-app-open');
      win.classList.remove('is-max');
      // 활성 도구 초기화 → 깔끔한 런처 상태로 복귀
      var panel = win.querySelector('.herotool__panel.is-active [data-tool]');
      if (panel) { try { panel.dispatchEvent(new CustomEvent('tool:reset', { bubbles: true })); } catch (e) {} }
    };

    // 파일이 들어오면 열고, 0개가 되면 닫는다
    win.addEventListener('tool:files', function (e) {
      if (e.detail && e.detail.count > 0) open(); else close();
    });

    // 닫기 트리거: 신호등/처음으로 버튼, 배경, ESC
    Array.prototype.slice.call(win.querySelectorAll('[data-ws-close]')).forEach(function (b) {
      b.addEventListener('click', function (ev) { ev.preventDefault(); close(); });
    });
    scrim.addEventListener('click', close);
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // 3) 숫자키(1–7)로 도구 전환 — 입력 중이 아닐 때만
  d.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= tabs.length) { tabs[n - 1].click(); }
  });

  // 4) 스크롤 리빌
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = Array.prototype.slice.call(d.querySelectorAll('[data-reveal]'));
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
