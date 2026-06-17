/*!
 * PDF의 모든 것 — ToolCore: 도구 위젯 공통 컨트롤러 (인스턴스 단위)
 * 표준 마크업(클래스 훅)을 루트([data-tool]) 안에서 찾아 동작 처리.
 *   .js-drop .js-file .js-files .js-run .js-progress .js-bar .js-ptext .js-result
 *   [.js-pagecount] [.js-pagegrid]
 *
 * config: { tool, multiple, reorder, pageCount, root?,
 *   pageGrid(썸네일 선택), splitGrid(자르기), numberPreview(번호 미리보기), fileThumbs(파일 썸네일),
 *   gridInput, onGridChange, readOptions(root), validate(files,opts), run(files,opts,ctx) }
 */
(function (global) {
  'use strict';
  var UI = global.UI;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function compactRanges(arr) {
    arr = arr.slice().sort(function (a, b) { return a - b; });
    var res = [], i = 0;
    while (i < arr.length) {
      var s = arr[i], e = s;
      while (i + 1 < arr.length && arr[i + 1] === e + 1) { e = arr[++i]; }
      res.push(s === e ? '' + s : s + '-' + e);
      i++;
    }
    return res.join(', ');
  }

  function init(config) {
    var d = document;
    var root = config.root
      ? (typeof config.root === 'string' ? d.querySelector(config.root) : config.root)
      : d.querySelector('[data-tool="' + config.tool + '"]');
    if (!root) return null;
    var q = function (cls) { return root.querySelector('.' + cls); };

    var drop = q('js-drop'), input = q('js-file'), filelist = q('js-files'), runBtn = q('js-run'),
      progress = q('js-progress'), bar = q('js-bar'), ptext = q('js-ptext'),
      result = q('js-result'), pagecount = q('js-pagecount'), pagegrid = q('js-pagegrid');
    if (!drop || !input || !runBtn) return null;
    var gridInput = config.gridInput ? root.querySelector(config.gridInput) : null;

    var state = { files: [] };
    var multiple = !!config.multiple;
    var selected = {};       // 선택 모드
    var cutsBefore = {};     // 분할 모드: page→true (그 앞에서 자름)
    var organizeOrder = [];  // 정리 모드: [{page:<원본쪽>, rot:0|90|180|270}, ...] (화면 순서)
    var organizeTail = [];   // 정리 모드: 표시 한도(CAP) 초과분 — 화면엔 없지만 순서 그대로 보존
    var dragIdx = -1;
    var thumbCache = new global.Map();
    var pcCache = new global.Map();  // 파일별 페이지 수 캐시
    var fileBar = null;              // 파일 요약/정리 툴바
    var gridTotal = 0;               // 현재 그리드의 표시 페이지 수
    var previewPageShown = 0, previewTotal = 0;

    function iconBtn(txt, label, fn, cls) {
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'iconbtn' + (cls ? ' ' + cls : '');
      b.textContent = txt; b.setAttribute('aria-label', label);
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      return b;
    }
    function gripEl() {
      var s = d.createElement('span'); s.className = 'filelist__grip'; s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="5" cy="4" r="1.4"/><circle cx="11" cy="4" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="11" cy="12" r="1.4"/></svg>';
      return s;
    }
    function swap(i, j) { var t = state.files[i]; state.files[i] = state.files[j]; state.files[j] = t; render(); }

    function fileThumb(file, imgEl) {
      if (thumbCache.has(file)) { imgEl.src = thumbCache.get(file); return; }
      if (config.imageThumbs) { var u = global.URL.createObjectURL(file); thumbCache.set(file, u); imgEl.src = u; return; }
      if (!global.PDFEngine || !PDFEngine.renderThumbs) return;
      PDFEngine.renderThumbs(file, { max: 1, scale: 0.3 }).then(function (res) {
        if (res.thumbs[0]) { thumbCache.set(file, res.thumbs[0].url); imgEl.src = res.thumbs[0].url; }
      }).catch(function () {});
    }

    function render() {
      filelist.innerHTML = '';
      var reorderable = config.reorder && state.files.length > 1;
      state.files.forEach(function (f, idx) {
        var li = d.createElement('li'); li.className = 'filelist__item';
        if (config.reorder) { var ord = d.createElement('span'); ord.className = 'filelist__order'; ord.textContent = String(idx + 1); ord.setAttribute('aria-hidden', 'true'); li.appendChild(ord); }
        if (reorderable) {
          li.setAttribute('draggable', 'true'); li.classList.add('is-draggable');
          li.addEventListener('dragstart', function (e) { dragIdx = idx; li.classList.add('dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(idx)); } catch (x) {} } });
          li.addEventListener('dragend', function () { dragIdx = -1; li.classList.remove('dragging'); Array.prototype.forEach.call(filelist.children, function (c) { c.classList.remove('drag-over'); }); });
          li.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; li.classList.add('drag-over'); });
          li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
          li.addEventListener('drop', function (e) { e.preventDefault(); li.classList.remove('drag-over'); if (dragIdx > -1 && dragIdx !== idx) { var m = state.files.splice(dragIdx, 1)[0]; state.files.splice(idx, 0, m); render(); } });
          li.appendChild(gripEl());
        }
        if (config.fileThumbs) {
          var th = d.createElement('span'); th.className = 'filelist__thumb';
          var img = d.createElement('img'); img.alt = ''; th.appendChild(img); li.appendChild(th);
          fileThumb(f, img);
        }
        var info = d.createElement('div'); info.className = 'filelist__info';
        var name = d.createElement('span'); name.className = 'filelist__name'; name.textContent = f.name;
        var size = d.createElement('span'); size.className = 'filelist__size'; size.textContent = UI.humanSize(f.size);
        info.appendChild(name); info.appendChild(size);
        if (config.showPages) {
          var pgs = d.createElement('span'); pgs.className = 'filelist__pages';
          if (pcCache.has(f)) pgs.textContent = pcCache.get(f) + '쪽';
          else if (global.PDFEngine) (function (file, span) {
            PDFEngine.getPageCount(file).then(function (n) { if (n) { pcCache.set(file, n); span.textContent = n + '쪽'; renderFileBar(); } });
          })(f, pgs);
          info.appendChild(pgs);
        }
        li.appendChild(info);
        var ctrls = d.createElement('div'); ctrls.className = 'filelist__ctrls';
        if (reorderable) {
          ctrls.appendChild(iconBtn('↑', '위로 이동', function () { if (idx > 0) swap(idx, idx - 1); }));
          ctrls.appendChild(iconBtn('↓', '아래로 이동', function () { if (idx < state.files.length - 1) swap(idx, idx + 1); }));
        }
        ctrls.appendChild(iconBtn('✕', '삭제', function () { state.files.splice(idx, 1); changed(); }, 'iconbtn--danger'));
        li.appendChild(ctrls);
        filelist.appendChild(li);
      });
      renderFileBar();
      runBtn.disabled = state.files.length === 0;
    }

    function ensureFileBar() {
      if (fileBar) return fileBar;
      fileBar = d.createElement('div'); fileBar.className = 'filebar'; fileBar.hidden = true;
      if (filelist.parentNode) filelist.parentNode.insertBefore(fileBar, filelist);
      return fileBar;
    }
    function renderFileBar() {
      var fb = ensureFileBar();
      if (!state.files.length) { fb.hidden = true; fb.innerHTML = ''; return; }
      fb.hidden = false; fb.innerHTML = '';
      var totalSize = state.files.reduce(function (s, f) { return s + (f.size || 0); }, 0);
      var txt = state.files.length + '개 파일 · ' + UI.humanSize(totalSize);
      if (config.showPages) {
        var known = state.files.filter(function (f) { return pcCache.has(f); });
        if (known.length === state.files.length) {
          var tp = known.reduce(function (s, f) { return s + pcCache.get(f); }, 0);
          txt += ' · 합산 ' + tp + '쪽';
        }
      }
      var sum = d.createElement('span'); sum.className = 'filebar__sum'; sum.textContent = txt; fb.appendChild(sum);
      var act = d.createElement('div'); act.className = 'filebar__act';
      if (multiple) {
        var sortBtn = d.createElement('button'); sortBtn.type = 'button'; sortBtn.className = 'linkbtn';
        sortBtn.textContent = '이름순 정렬';
        sortBtn.addEventListener('click', function () { state.files.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko', { numeric: true }); }); render(); });
        act.appendChild(sortBtn);
      }
      var clr = d.createElement('button'); clr.type = 'button'; clr.className = 'linkbtn linkbtn--danger';
      clr.textContent = '전체 비우기';
      clr.addEventListener('click', function () { state.files = []; changed(); });
      act.appendChild(clr);
      fb.appendChild(act);
    }

    function updatePageCount() {
      if (!pagecount || !config.pageCount) return;
      pagecount.textContent = '';
      if (!state.files.length || !global.PDFEngine) return;
      PDFEngine.getPageCount(state.files[0]).then(function (n) { if (n) pagecount.textContent = '총 ' + n + '페이지'; });
    }

    // ── 썸네일 영역 dispatcher ──
    function renderGrid() {
      if (!pagegrid || !global.PDFEngine || !PDFEngine.renderThumbs) return;
      if (!state.files.length) { pagegrid.hidden = true; pagegrid.innerHTML = ''; return; }
      if (config.numberPreview) return renderNumberPreview();
      if (config.splitGrid) return renderSplitGrid();
      if (config.organizeGrid) return renderOrganizeGrid();
      if (config.pageGrid) return renderSelectGrid();
    }

    // 선택 모드 (추출/삭제/이미지변환)
    function syncFromInput() { selected = {}; if (gridInput && gridInput.value) { UI.parsePageList(gridInput.value).list.forEach(function (n) { selected[n] = true; }); } }
    function writeInput() { if (gridInput) gridInput.value = compactRanges(Object.keys(selected).map(Number)); if (config.onGridChange) config.onGridChange(Object.keys(selected).length > 0, root); }
    function reflectInput() {
      if (!config.pageGrid || !pagegrid) return;
      syncFromInput();
      Array.prototype.forEach.call(pagegrid.querySelectorAll('.pagecell'), function (cell) {
        var pg = +cell.getAttribute('data-page'), on = !!selected[pg];
        cell.classList.toggle('is-sel', on); cell.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function renderSelectGrid() {
      pagegrid.hidden = false; pagegrid.innerHTML = '<p class="pagegrid__loading">미리보기 불러오는 중…</p>';
      var fileRef = state.files[0];
      PDFEngine.renderThumbs(fileRef, {}).then(function (res) {
        if (state.files[0] !== fileRef) return;
        gridTotal = res.shown;
        syncFromInput();
        pagegrid.innerHTML = '';
        var grid = d.createElement('div'); grid.className = 'pagegrid__grid';
        var count = d.createElement('span'); count.className = 'selbar__count';
        function updateSelCount() {
          var n = Object.keys(selected).length;
          count.textContent = config.selCountLabel ? config.selCountLabel(n, gridTotal) : (n ? (n + '개 선택됨') : '선택된 페이지 없음');
        }
        function repaint() {
          Array.prototype.forEach.call(grid.children, function (cell) {
            var pg = +cell.getAttribute('data-page'), on = !!selected[pg];
            cell.classList.toggle('is-sel', on); cell.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          updateSelCount(); writeInput();
        }
        function mkBtn(label, fn) {
          var b = d.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.textContent = label;
          b.addEventListener('click', function () { fn(); repaint(); }); return b;
        }
        var bar = d.createElement('div'); bar.className = 'selbar';
        var btns = d.createElement('div'); btns.className = 'selbar__btns';
        btns.appendChild(mkBtn('전체 선택', function () { selected = {}; for (var p = 1; p <= gridTotal; p++) selected[p] = true; }));
        btns.appendChild(mkBtn('선택 해제', function () { selected = {}; }));
        btns.appendChild(mkBtn('반전', function () { var s = {}; for (var p = 1; p <= gridTotal; p++) if (!selected[p]) s[p] = true; selected = s; }));
        btns.appendChild(mkBtn('홀수', function () { selected = {}; for (var p = 1; p <= gridTotal; p += 2) selected[p] = true; }));
        btns.appendChild(mkBtn('짝수', function () { selected = {}; for (var p = 2; p <= gridTotal; p += 2) selected[p] = true; }));
        bar.appendChild(count); bar.appendChild(btns);
        pagegrid.appendChild(bar);
        res.thumbs.forEach(function (t) {
          var cell = d.createElement('button');
          cell.type = 'button'; cell.className = 'pagecell'; cell.setAttribute('data-page', t.page);
          cell.setAttribute('aria-pressed', selected[t.page] ? 'true' : 'false');
          cell.innerHTML = '<span class="pagecell__img"><img src="' + t.url + '" alt="' + t.page + '페이지" loading="lazy"></span><span class="pagecell__no">' + t.page + '</span>';
          if (selected[t.page]) cell.classList.add('is-sel');
          cell.addEventListener('click', function () {
            if (selected[t.page]) delete selected[t.page]; else selected[t.page] = true;
            cell.classList.toggle('is-sel'); cell.setAttribute('aria-pressed', selected[t.page] ? 'true' : 'false');
            updateSelCount(); writeInput();
          });
          grid.appendChild(cell);
        });
        pagegrid.appendChild(grid);
        updateSelCount();
        addHint(res, '페이지를 눌러 선택 · 위 버튼으로 일괄 선택');
      }).catch(function () { pagegrid.hidden = true; pagegrid.innerHTML = ''; });
    }

    // 분할 모드 (split): 페이지를 누르면 그 앞에서 새 구간으로 나뉨
    function splitSegments(total) {
      var starts = [1], p; for (p = 2; p <= total; p++) if (cutsBefore[p]) starts.push(p);
      var segs = [], i; for (i = 0; i < starts.length; i++) segs.push([starts[i], (i + 1 < starts.length ? starts[i + 1] - 1 : total)]);
      return segs;
    }
    function writeSplitInput(total) {
      var segs = splitSegments(total);
      if (gridInput) gridInput.value = segs.map(function (g) { return g[0] === g[1] ? '' + g[0] : g[0] + '-' + g[1]; }).join(', ');
      var rangesRadio = root.querySelector('input[name="split-mode"][value="ranges"]');
      if (rangesRadio && segs.length > 1) rangesRadio.checked = true;
    }
    function segIndexOf(page, total) { var idx = 0, p; for (p = 2; p <= page; p++) if (cutsBefore[p]) idx++; return idx; }
    function renderSplitGrid() {
      pagegrid.hidden = false; pagegrid.innerHTML = '<p class="pagegrid__loading">미리보기 불러오는 중…</p>';
      var fileRef = state.files[0];
      PDFEngine.renderThumbs(fileRef, {}).then(function (res) {
        if (state.files[0] !== fileRef) return;
        var total = res.shown;
        pagegrid.innerHTML = '';
        var paint = function () {
          Array.prototype.forEach.call(grid.children, function (cell) {
            var pg = +cell.getAttribute('data-page');
            cell.classList.toggle('is-cut', !!cutsBefore[pg]);
            cell.setAttribute('data-seg', segIndexOf(pg, total) % 2);
          });
          updateSegCount();
        };
        var bar = d.createElement('div'); bar.className = 'selbar';
        var segCount = d.createElement('span'); segCount.className = 'selbar__count';
        function updateSegCount() { segCount.textContent = '→ ' + splitSegments(total).length + '개 파일로 분할'; }
        var resetBtn = d.createElement('button'); resetBtn.type = 'button'; resetBtn.className = 'linkbtn';
        resetBtn.textContent = '모든 자르기 해제';
        resetBtn.addEventListener('click', function () { cutsBefore = {}; paint(); writeSplitInput(total); });
        var segBtns = d.createElement('div'); segBtns.className = 'selbar__btns'; segBtns.appendChild(resetBtn);
        bar.appendChild(segCount); bar.appendChild(segBtns);
        pagegrid.appendChild(bar);
        var grid = d.createElement('div'); grid.className = 'pagegrid__grid pagegrid__grid--split';
        res.thumbs.forEach(function (t) {
          var cell = d.createElement('button');
          cell.type = 'button'; cell.className = 'pagecell pagecell--split'; cell.setAttribute('data-page', t.page);
          cell.innerHTML = '<span class="pagecell__img"><img src="' + t.url + '" alt="' + t.page + '페이지" loading="lazy"></span><span class="pagecell__no">' + t.page + '</span>';
          if (t.page > 1) cell.addEventListener('click', function () {
            if (cutsBefore[t.page]) delete cutsBefore[t.page]; else cutsBefore[t.page] = true;
            paint(); writeSplitInput(total);
          });
          else cell.classList.add('is-locked');
          grid.appendChild(cell);
        });
        pagegrid.appendChild(grid);
        paint();
        addHint(res, '나눌 페이지를 누르면 거기서부터 새 파일로 분리돼요');
      }).catch(function () { pagegrid.hidden = true; pagegrid.innerHTML = ''; });
    }

    // 정리 모드 (organize): 모든 페이지를 펼쳐 드래그 재정렬 + 페이지별 회전/삭제
    var ORG_CAP = 120;
    function renderOrganizeGrid() {
      pagegrid.hidden = false; pagegrid.innerHTML = '<p class="pagegrid__loading">미리보기 불러오는 중…</p>';
      var fileRef = state.files[0];
      PDFEngine.renderThumbs(fileRef, { max: ORG_CAP }).then(function (res) {
        if (state.files[0] !== fileRef) return;
        gridTotal = res.total;
        var urlByPage = {};
        res.thumbs.forEach(function (t) { urlByPage[t.page] = t.url; });
        organizeOrder = res.thumbs.map(function (t) { return { page: t.page, rot: 0 }; });
        organizeTail = [];
        for (var tp = res.shown + 1; tp <= res.total; tp++) organizeTail.push({ page: tp, rot: 0 });

        pagegrid.innerHTML = '';
        var bar = d.createElement('div'); bar.className = 'selbar';
        var count = d.createElement('span'); count.className = 'selbar__count';
        var btns = d.createElement('div'); btns.className = 'selbar__btns';
        function mkBtn(label, fn) { var b = d.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.textContent = label; b.addEventListener('click', fn); return b; }
        function rotateAll(delta) { organizeOrder.forEach(function (o) { o.rot = (((o.rot + delta) % 360) + 360) % 360; }); rebuild(); }
        btns.appendChild(mkBtn('전체 ↺', function () { rotateAll(-90); }));
        btns.appendChild(mkBtn('전체 ↻', function () { rotateAll(90); }));
        btns.appendChild(mkBtn('처음으로', function () { organizeOrder = res.thumbs.map(function (t) { return { page: t.page, rot: 0 }; }); rebuild(); }));
        bar.appendChild(count); bar.appendChild(btns);
        pagegrid.appendChild(bar);

        var grid = d.createElement('div'); grid.className = 'pagegrid__grid pagegrid__grid--org';
        pagegrid.appendChild(grid);

        function updateCount() {
          var n = organizeOrder.length + organizeTail.length;
          count.textContent = '원본 ' + res.total + '쪽 → ' + n + '쪽';
        }
        function cellEl(o, idx) {
          var cell = d.createElement('div');
          cell.className = 'pagecell pagecell--org'; cell.setAttribute('draggable', 'true'); cell.setAttribute('data-idx', idx);
          var rot = (((o.rot % 360) + 360) % 360);
          cell.innerHTML =
            '<span class="pagecell__img"><img src="' + urlByPage[o.page] + '" alt="' + o.page + '페이지" data-rot="' + rot + '" loading="lazy"></span>' +
            '<span class="pcops">' +
              '<button type="button" class="pcop pcop--rotl" title="왼쪽으로 90° 회전" aria-label="' + o.page + '페이지 왼쪽 회전">↺</button>' +
              '<button type="button" class="pcop pcop--rotr" title="오른쪽으로 90° 회전" aria-label="' + o.page + '페이지 오른쪽 회전">↻</button>' +
              '<button type="button" class="pcop pcop--del" title="이 페이지 삭제" aria-label="' + o.page + '페이지 삭제">✕</button>' +
            '</span>' +
            '<span class="pagecell__no">' + o.page + '</span>';
          cell.querySelector('.pcop--rotl').addEventListener('click', function (e) { e.stopPropagation(); o.rot = (((o.rot - 90) % 360) + 360) % 360; rebuild(); });
          cell.querySelector('.pcop--rotr').addEventListener('click', function (e) { e.stopPropagation(); o.rot = (((o.rot + 90) % 360) + 360) % 360; rebuild(); });
          cell.querySelector('.pcop--del').addEventListener('click', function (e) {
            e.stopPropagation();
            if (organizeOrder.length <= 1) { UI.toast('최소 1페이지는 남겨야 해요.', 'warn'); return; }
            var pos = organizeOrder.indexOf(o); if (pos > -1) organizeOrder.splice(pos, 1); rebuild();
          });
          cell.addEventListener('dragstart', function (e) { dragIdx = idx; cell.classList.add('dragging'); if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(idx)); } catch (x) {} } });
          cell.addEventListener('dragend', function () { dragIdx = -1; cell.classList.remove('dragging'); Array.prototype.forEach.call(grid.children, function (c) { c.classList.remove('drag-over'); }); });
          cell.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; cell.classList.add('drag-over'); });
          cell.addEventListener('dragleave', function () { cell.classList.remove('drag-over'); });
          cell.addEventListener('drop', function (e) { e.preventDefault(); cell.classList.remove('drag-over'); if (dragIdx > -1 && dragIdx !== idx) { var m = organizeOrder.splice(dragIdx, 1)[0]; organizeOrder.splice(idx, 0, m); rebuild(); } });
          return cell;
        }
        function rebuild() {
          grid.innerHTML = '';
          organizeOrder.forEach(function (o, i) { grid.appendChild(cellEl(o, i)); });
          updateCount();
        }
        rebuild();
        var note = res.total > res.shown
          ? '페이지를 끌어 순서 변경 · ↺ ↻ 회전 · ✕ 삭제 · ' + (res.shown + 1) + '쪽부터는 화면엔 없지만 순서 그대로 유지돼요'
          : '페이지를 끌어 순서 변경 · ↺ ↻ 회전 · ✕ 삭제';
        var hint = d.createElement('p'); hint.className = 'pagegrid__hint'; hint.textContent = note;
        pagegrid.appendChild(hint);
      }).catch(function () { pagegrid.hidden = true; pagegrid.innerHTML = ''; });
    }

    // 번호 미리보기 (page-numbers)
    function renderNumberPreview() {
      var o = config.readOptions ? config.readOptions(root) : {};
      var want = o.skipCover ? 2 : 1;
      pagegrid.hidden = false;
      if (previewPageShown === want && pagegrid.querySelector('.numprev')) { updateNumberBadge(); return; }
      pagegrid.innerHTML = '<p class="pagegrid__loading">미리보기 불러오는 중…</p>';
      var fileRef = state.files[0];
      PDFEngine.renderThumbs(fileRef, { max: want, scale: 0.62 }).then(function (res) {
        if (state.files[0] !== fileRef) return;
        var t = res.thumbs[res.thumbs.length - 1];
        if (!t) { pagegrid.hidden = true; pagegrid.innerHTML = ''; return; }
        previewPageShown = want; previewTotal = res.total;
        pagegrid.innerHTML = '<div class="numprev"><img src="' + t.url + '" alt="미리보기"><span class="numprev__badge"></span></div><p class="pagegrid__hint">번호가 들어갈 위치 미리보기</p>';
        updateNumberBadge();
      }).catch(function () { pagegrid.hidden = true; pagegrid.innerHTML = ''; });
    }
    function updateNumberBadge() {
      var badge = pagegrid && pagegrid.querySelector('.numprev__badge'); if (!badge) return;
      var o = config.readOptions ? config.readOptions(root) : {};
      var num = (o.startAt != null ? o.startAt : 1);
      var core = o.format === 'n/total' ? num + ' / ' + Math.max(1, previewTotal - (o.skipCover ? 1 : 0)) : (o.format === 'dash' ? '- ' + num + ' -' : '' + num);
      badge.textContent = (o.prefix || '') + core + (o.suffix || '');
      badge.className = 'numprev__badge pos-' + (o.position || 'bottom-center') + (o.box ? ' has-box' : '');
    }
    function onNumChange() {
      if (!state.files.length) return;
      var o = config.readOptions ? config.readOptions(root) : {};
      var want = o.skipCover ? 2 : 1;
      if (want !== previewPageShown) renderNumberPreview(); else updateNumberBadge();
    }

    function addHint(res, base) {
      var hint = d.createElement('p'); hint.className = 'pagegrid__hint';
      hint.textContent = res.total > res.shown ? base + ' · 앞 ' + res.shown + '쪽 미리보기' : base;
      pagegrid.appendChild(hint);
    }

    function changed() {
      result.hidden = true; result.innerHTML = '';
      selected = {}; cutsBefore = {}; organizeOrder = []; organizeTail = []; previewPageShown = 0;
      root.classList.toggle('is-loaded', state.files.length > 0);   // 업로드 후 드롭존 컴팩트화 트리거
      render(); updatePageCount(); renderGrid();
      announce(state.files.length ? (state.files.length + '개 파일이 선택되었습니다') : '파일 목록이 비워졌습니다');
      if (state.files.length) probeEncrypted();
      if (config.onFiles) { try { config.onFiles(state.files); } catch (e) {} }
      try { root.dispatchEvent(new CustomEvent('tool:files', { bubbles: true, detail: { count: state.files.length, tool: config.tool } })); } catch (e) {}
    }
    // (개선 1) 열기-비밀번호 PDF 자동 감지 → 안내 (unlock·이미지 도구 제외)
    var probedKey = '';
    function probeEncrypted() {
      if (config.tool === 'unlock' || config.accept === 'image' || config.accept === 'svg' || !global.PDFEngine || !PDFEngine.probe) return;
      var f = state.files[0]; if (!f) return;
      var key = f.name + '|' + f.size; if (key === probedKey) return; probedKey = key;
      PDFEngine.probe(f).then(function (info) {
        if (info && info.needsPassword) UI.toast('이 PDF는 열기 비밀번호가 걸려 있어요. 먼저 [잠금해제] 도구로 푼 뒤 사용해 주세요.', 'warn');
      }).catch(function () {});
    }
    // 외부(홈 풀스크린 닫기 등)에서 초기화 요청
    root.addEventListener('tool:reset', function () { if (!state.files.length) return; state.files = []; changed(); });

    var FMT = {
      image: { re: /\.(jpe?g|png)$/i, mime: /^image\/(png|jpeg)$/i, label: 'JPG·PNG 이미지' },
      jpg: { re: /\.jpe?g$/i, mime: /^image\/jpeg$/i, label: 'JPG 이미지' },
      png: { re: /\.png$/i, mime: /^image\/png$/i, label: 'PNG 이미지' },
      webp: { re: /\.webp$/i, mime: /^image\/webp$/i, label: 'WEBP 이미지' },
      gif: { re: /\.gif$/i, mime: /^image\/gif$/i, label: 'GIF 이미지' },
      avif: { re: /\.avif$/i, mime: /^image\/avif$/i, label: 'AVIF 이미지' },
      svg: { re: /\.svg$/i, mime: /^image\/svg\+xml$/i, label: 'SVG 파일' },
      pdf: { re: /\.pdf$/i, mime: /^application\/pdf$/i, label: 'PDF 파일' }
    };
    function addFiles(fileList) {
      var all = Array.prototype.slice.call(fileList);
      var spec = FMT[config.accept] || FMT.pdf;
      var arr = all.filter(function (f) { return spec.re.test(f.name || '') || spec.mime.test(f.type || ''); });
      if (!arr.length) { UI.toast(spec.label + '만 올릴 수 있어요.', 'error'); return; }
      if (all.length > arr.length) UI.toast(spec.label + '이(가) 아닌 파일은 제외했어요.', 'info');
      arr.forEach(function (f) { if (f.size > 50 * 1024 * 1024) UI.toast('"' + f.name + '"은(는) 용량이 커서 처리가 느릴 수 있어요.', 'info'); });
      if (multiple) {
        var seen = {}; state.files.forEach(function (f) { seen[f.name + '|' + f.size] = true; });
        var dups = 0;
        arr = arr.filter(function (f) { var k = f.name + '|' + f.size; if (seen[k]) { dups++; return false; } seen[k] = true; return true; });
        if (dups) UI.toast(dups + '개 중복 파일은 제외했어요.', 'info');
        if (!arr.length) return;
        state.files = state.files.concat(arr);
      } else {
        state.files = [arr[0]];
      }
      changed();
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dropzone--over'); }); });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dropzone--over'); }); });
    drop.addEventListener('drop', function (e) { e.stopPropagation(); if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    // 페이지 어디서든 드롭 허용 (드롭존 밖에 떨어뜨려도 인식)
    var dragDepth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    d.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    d.addEventListener('dragenter', function (e) { if (hasFiles(e)) { dragDepth++; drop.classList.add('dropzone--over'); } });
    d.addEventListener('dragleave', function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) drop.classList.remove('dropzone--over'); });
    d.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); dragDepth = 0; drop.classList.remove('dropzone--over');
      addFiles(e.dataTransfer.files);
    });
    if (gridInput && config.pageGrid) gridInput.addEventListener('input', reflectInput);
    if (config.numberPreview) { root.addEventListener('change', onNumChange); root.addEventListener('input', onNumChange); }

    function applyOutName(res) {
      if (!res || res.type !== 'blob') return;
      var f = root.querySelector('.js-outname');
      if (!f || !f.value.trim()) return;
      var ext = (res.filename && res.filename.match(/\.[a-z0-9]+$/i) || ['.pdf'])[0];
      var base = f.value.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\.[a-z0-9]+$/i, '');
      if (base) res.filename = base + ext;
    }

    // (개선 3) 처리 중 탭 닫기 경고 (작업 유실 방지)
    function unloadGuard(e) { e.preventDefault(); e.returnValue = ''; return ''; }
    function setBusy(b) {
      runBtn.disabled = b || state.files.length === 0; runBtn.classList.toggle('is-busy', b);
      // (개선 4) 처리 중 드롭존 비활성 (중간 파일 변경 방지)
      if (drop) { drop.classList.toggle('is-disabled', b); drop.setAttribute('aria-disabled', b ? 'true' : 'false'); }
      try { if (b) global.addEventListener('beforeunload', unloadGuard); else global.removeEventListener('beforeunload', unloadGuard); } catch (e) {}
      if (b) announce('처리 중입니다. 잠시만 기다려 주세요.');
      if (progress) { progress.hidden = !b; if (b) { if (bar) bar.style.width = '4%'; if (ptext) ptext.textContent = '처리 중…'; } }
    }
    function onProgress(p) { var pct = Math.max(2, Math.round((p || 0) * 100)); if (bar) bar.style.width = pct + '%'; if (ptext) ptext.textContent = '처리 중… ' + pct + '%'; }

    function sumSize(items) { return items.reduce(function (s, it) { return s + ((it.blob && it.blob.size) || 0); }, 0); }
    async function handleResult(res) {
      if (!res) return;
      if (res.type === 'blob') {
        UI.downloadBlob(res.blob, res.filename);
        showSuccess(res.filename, function () { UI.downloadBlob(res.blob, res.filename); }, res.blob && res.blob.size);
        // (개선 5) 결과 PDF 페이지 수 표시
        if (/\.pdf$/i.test(res.filename || '') && global.PDFEngine && PDFEngine.getPageCount) {
          PDFEngine.getPageCount(res.blob).then(function (n) { if (n) appendResultMeta(n + '페이지'); }).catch(function () {});
        }
      }
      else if (res.type === 'zip') { await UI.zipAndDownload(res.items, res.zipName, onProgress); showSuccess(res.zipName + ' (' + res.items.length + '개 파일)', function () { UI.zipAndDownload(res.items, res.zipName); }, sumSize(res.items)); }
      else if (res.type === 'files') { res.items.forEach(function (it) { UI.downloadBlob(it.blob, it.name); }); showSuccess(res.items.length + '개 파일', null, sumSize(res.items)); }
      else if (res.type === 'message') { result.hidden = false; result.innerHTML = res.html; }
    }
    function appendResultMeta(txt) {
      var ok = result.querySelector('.result__ok .result__size');
      if (ok) ok.textContent = ok.textContent.replace(/\)$/, ' · ' + txt + ')');
    }
    function showSuccess(label, again, size) {
      result.hidden = false; result.innerHTML = '';
      var ok = d.createElement('p'); ok.className = 'result__ok';
      var sizeTxt = size ? ' <span class="result__size">(' + UI.humanSize(size) + ')</span>' : '';
      ok.innerHTML = '<span class="result__check"></span> <strong>완료됐어요!</strong> ' + escapeHtml(label) + sizeTxt + ' 다운로드가 시작됐습니다.';
      result.appendChild(ok);
      if (again) { var b = d.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost btn--sm'; b.textContent = '다시 다운로드'; b.addEventListener('click', again); result.appendChild(b); }
      // (개선 6) 완료 시 결과로 스크롤 + 음성 안내
      announce('완료됐습니다. ' + label + ' 다운로드가 시작됐습니다.');
      try { result.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    }

    runBtn.addEventListener('click', async function () {
      if (state.files.length === 0) return;
      var opts = config.readOptions ? config.readOptions(root) : {};
      if (config.validate) { var err = config.validate(state.files, opts); if (err) { UI.toast(err, 'error'); return; } }
      setBusy(true);
      try {
        var res = await config.run(state.files, opts, { onProgress: onProgress, root: root, organize: organizeOrder.concat(organizeTail) });
        applyOutName(res);
        await handleResult(res);
      }
      catch (e) { console.error('[ToolCore]', e); UI.toast(e && e.message ? e.message : '처리 중 오류가 발생했어요.', 'error'); }
      finally { setBusy(false); }
    });

    // ── 스크린리더 알림 (a11y) ──
    var liveEl = null;
    function announce(msg) {
      try {
        if (!liveEl) { liveEl = d.createElement('div'); liveEl.className = 'sr-only'; liveEl.setAttribute('aria-live', 'polite'); liveEl.setAttribute('aria-atomic', 'true'); root.appendChild(liveEl); }
        liveEl.textContent = ''; var m = msg; setTimeout(function () { if (liveEl) liveEl.textContent = m; }, 30);
      } catch (e) {}
    }

    // (개선 7) 옵션 기억 (localStorage · 파일은 저장하지 않음)
    var OPT_KEY = 'aap:opts:' + config.tool;
    function eachOpt(fn) { Array.prototype.forEach.call(root.querySelectorAll('input, select'), function (el) { if (el.classList.contains('js-file') || el.classList.contains('js-outname')) return; var k = el.name || el.id; if (!k) return; fn(el, k); }); }
    function persistOptions() { try { var data = {}; eachOpt(function (el, k) { if (el.type === 'radio') { if (el.checked) data[k] = el.value; } else if (el.type === 'checkbox') { data[k] = !!el.checked; } else { data[k] = el.value; } }); global.localStorage.setItem(OPT_KEY, JSON.stringify(data)); } catch (e) {} }
    function restoreOptions() { try { var raw = global.localStorage.getItem(OPT_KEY); if (!raw) return; var data = JSON.parse(raw); eachOpt(function (el, k) { if (!(k in data)) return; if (el.type === 'radio') el.checked = (el.value === data[k]); else if (el.type === 'checkbox') el.checked = !!data[k]; else el.value = data[k]; }); } catch (e) {} }
    restoreOptions();
    root.addEventListener('change', persistOptions);

    // (개선 8) Enter로 실행 / Esc로 파일 비우기
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var t = e.target;
        if (t && t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio' && !runBtn.disabled) { e.preventDefault(); runBtn.click(); }
      } else if (e.key === 'Escape') {
        if (state.files.length) { state.files = []; changed(); }
      }
    });

    render();
    return { state: state, root: root };
  }

  global.ToolCore = { init: init };
})(window);
