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

  // 2) 업로드 시 → 작업 창 풀스크린 전환
  var win = d.querySelector('[data-ws-window]');
  if (win) {
    var scrim = d.createElement('div');
    scrim.className = 'ws-scrim'; scrim.setAttribute('aria-hidden', 'true');
    d.body.appendChild(scrim);

    // 풀스크린 시 창을 <body> 직속으로 포탈 → 조상 stacking context에 갇히지 않고
    // scrim 위에 선명하게 뜨도록(예전 z-index 트랩 버그 재발 방지). 닫으면 원위치 복원.
    var winHome = win.parentNode;
    var winNext = win.nextSibling;

    var reduceMo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var closeTimer = null;

    var open = function () {
      if (d.body.classList.contains('ws-app-open')) return;
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      win.classList.remove('is-closing');
      d.body.classList.add('ws-app-open');
      d.body.appendChild(win);     // 포탈: 루트로 끌어올림
      win.classList.add('is-max');
    };
    var finishClose = function (e) {
      // 자식(패널 fade-up 등) 애니메이션 버블은 무시 — wsPopOut 종료만 처리
      if (e && e.animationName && e.animationName !== 'wsPopOut') return;
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      win.classList.remove('is-max', 'is-closing');
      if (winHome) { winHome.insertBefore(win, winNext); }   // 인라인 런처 위치로 복원
      // 활성 도구 초기화 → 깔끔한 런처 상태로 복귀
      var panel = win.querySelector('.herotool__panel.is-active [data-tool]');
      if (panel) { try { panel.dispatchEvent(new CustomEvent('tool:reset', { bubbles: true })); } catch (er) {} }
    };
    var close = function () {
      if (!d.body.classList.contains('ws-app-open')) return;
      d.body.classList.remove('ws-app-open');     // scrim 페이드 아웃 동시에
      if (reduceMo) { finishClose(); return; }
      win.classList.add('is-closing');            // 퇴장 애니메이션 → 끝나면 복원
      win.addEventListener('animationend', finishClose, { once: true });
      closeTimer = setTimeout(finishClose, 360);  // 애니메이션 미발화 폴백
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

  // 2-b) 정사각 카테고리 타일 — 클릭하면 그 도구가 타일 옆으로 분신술 촤라락
  var catTiles = Array.prototype.slice.call(d.querySelectorAll('.ws-cattile'));
  var catRows = Array.prototype.slice.call(d.querySelectorAll('.ws-cat-row'));
  catTiles.forEach(function (tile) {
    tile.addEventListener('click', function () {
      var row = tile.parentNode;
      var open = row.classList.toggle('is-active');
      tile.classList.toggle('is-active', open);
      tile.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  // 2-c) 도구 검색/필터 — 이름·설명·동의어(data-keywords)로 즉시 필터
  var searchInput = d.querySelector('.js-toolsearch');
  if (searchInput) {
    var allCards = Array.prototype.slice.call(d.querySelectorAll('.ws-card'));
    var noRes = d.querySelector('.js-search-empty');
    var defaultActive = catRows.map(function (r) { return r.classList.contains('is-active'); });
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      if (!q) { // 초기 상태 복원
        allCards.forEach(function (c) { c.style.display = ''; });
        catRows.forEach(function (row, i) {
          row.style.display = '';
          var on = defaultActive[i];
          row.classList.toggle('is-active', on);
          var tile = row.querySelector('.ws-cattile');
          if (tile) { tile.classList.toggle('is-active', on); tile.setAttribute('aria-expanded', on ? 'true' : 'false'); }
        });
        if (noRes) noRes.hidden = true;
        return;
      }
      var total = 0;
      catRows.forEach(function (row) {
        var shown = 0;
        Array.prototype.forEach.call(row.querySelectorAll('.ws-card'), function (c) {
          var kw = (c.getAttribute('data-keywords') || '').toLowerCase();
          var match = kw.indexOf(q) >= 0;
          c.style.display = match ? '' : 'none';
          if (match) shown++;
        });
        row.style.display = shown ? '' : 'none';
        row.classList.toggle('is-active', shown > 0);   // 매칭 카테고리는 자동 펼침
        var tile = row.querySelector('.ws-cattile');
        if (tile) { tile.classList.toggle('is-active', shown > 0); tile.setAttribute('aria-expanded', shown > 0 ? 'true' : 'false'); }
        total += shown;
      });
      if (noRes) noRes.hidden = total > 0;
    });
    // Enter로 결과가 하나뿐이면 바로 이동
    searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var visible = allCards.filter(function (c) { return c.style.display !== 'none'; });
      if (visible.length === 1) window.location.href = visible[0].getAttribute('href');
    });
  }

  // 2-d) 상세 페이지 하단 독: 카테고리 먼저 선택 → 해당 카테고리 도구가 위로 열림
  var dock = d.querySelector('.tp-dock');
  if (dock) {
    var dockCats = Array.prototype.slice.call(dock.querySelectorAll('.tp-dock__cat'));
    var dockPanels = Array.prototype.slice.call(dock.querySelectorAll('.tp-dock__panel'));
    var panelByCat = {};
    dockPanels.forEach(function (p) { panelByCat[p.getAttribute('data-cat')] = p; });
    function closeDock() {
      dockCats.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); b.classList.remove('is-open'); });
      dockPanels.forEach(function (p) { p.hidden = true; });
      dock.classList.remove('is-open');
    }
    function openCat(cat, btn) {
      closeDock();
      btn.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true');
      var panel = panelByCat[cat];
      if (panel) { panel.hidden = false; }
      dock.classList.add('is-open');
    }
    dockCats.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var cat = btn.getAttribute('data-cat');
        if (btn.classList.contains('is-open')) closeDock();
        else openCat(cat, btn);
      });
    });
    // 바깥 클릭 / ESC로 닫기 (도구 링크 클릭은 페이지 이동이라 자연히 사라짐)
    d.addEventListener('click', function (e) { if (!dock.contains(e.target)) closeDock(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDock(); });
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
