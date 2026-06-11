/*!
 * PDF의 모든 것 — ToolCore: 도구 위젯 공통 컨트롤러 (인스턴스 단위)
 * 표준 마크업(클래스 훅)을 루트([data-tool]) 안에서 찾아 동작 처리.
 *   .js-drop .js-file .js-files .js-run .js-progress .js-bar .js-ptext .js-result
 *   [.js-pagecount] [.js-pagegrid]
 *
 * config: { tool, multiple, reorder, pageCount, pageGrid, gridInput, root?,
 *   readOptions(root): opts, validate(files,opts): err|null, run(files,opts,ctx): result }
 */
(function (global) {
  'use strict';
  var UI = global.UI;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // 정렬된 페이지 배열 → "1, 3, 5-7"
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
    var selected = {};
    var dragIdx = -1;

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

    function render() {
      filelist.innerHTML = '';
      var reorderable = config.reorder && state.files.length > 1;
      state.files.forEach(function (f, idx) {
        var li = d.createElement('li'); li.className = 'filelist__item';
        if (reorderable) {
          li.setAttribute('draggable', 'true');
          li.classList.add('is-draggable');
          li.addEventListener('dragstart', function (e) {
            dragIdx = idx; li.classList.add('dragging');
            if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(idx)); } catch (x) {} }
          });
          li.addEventListener('dragend', function () {
            dragIdx = -1; li.classList.remove('dragging');
            Array.prototype.forEach.call(filelist.children, function (c) { c.classList.remove('drag-over'); });
          });
          li.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; li.classList.add('drag-over'); });
          li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
          li.addEventListener('drop', function (e) {
            e.preventDefault(); li.classList.remove('drag-over');
            if (dragIdx > -1 && dragIdx !== idx) { var m = state.files.splice(dragIdx, 1)[0]; state.files.splice(idx, 0, m); render(); }
          });
          li.appendChild(gripEl());
        }
        var info = d.createElement('div'); info.className = 'filelist__info';
        var name = d.createElement('span'); name.className = 'filelist__name'; name.textContent = f.name;
        var size = d.createElement('span'); size.className = 'filelist__size'; size.textContent = UI.humanSize(f.size);
        info.appendChild(name); info.appendChild(size);
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
      runBtn.disabled = state.files.length === 0;
    }

    function updatePageCount() {
      if (!pagecount || !config.pageCount) return;
      pagecount.textContent = '';
      if (!state.files.length || !global.PDFEngine || !PDFEngine.getPageCount) return;
      PDFEngine.getPageCount(state.files[0]).then(function (n) { if (n) pagecount.textContent = '총 ' + n + '페이지'; });
    }

    // ── 페이지 썸네일 선택 (텍스트 입력과 동기화) ──
    function syncFromInput() {
      selected = {};
      if (gridInput && gridInput.value) { var p = UI.parsePageList(gridInput.value); p.list.forEach(function (n) { selected[n] = true; }); }
    }
    function writeInput() { if (gridInput) gridInput.value = compactRanges(Object.keys(selected).map(Number)); }
    function reflectInput() {
      if (!config.pageGrid || !pagegrid) return;
      syncFromInput();
      Array.prototype.forEach.call(pagegrid.querySelectorAll('.pagecell'), function (cell) {
        var pg = +cell.getAttribute('data-page'), on = !!selected[pg];
        cell.classList.toggle('is-sel', on); cell.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function renderGrid() {
      if (!config.pageGrid || !pagegrid) return;
      if (!state.files.length) { pagegrid.hidden = true; pagegrid.innerHTML = ''; return; }
      pagegrid.hidden = false;
      pagegrid.innerHTML = '<p class="pagegrid__loading">미리보기 불러오는 중…</p>';
      var fileRef = state.files[0];
      PDFEngine.renderThumbs(fileRef, {}).then(function (res) {
        if (state.files[0] !== fileRef) return;
        syncFromInput();
        pagegrid.innerHTML = '';
        var grid = d.createElement('div'); grid.className = 'pagegrid__grid';
        res.thumbs.forEach(function (t) {
          var cell = d.createElement('button');
          cell.type = 'button'; cell.className = 'pagecell'; cell.setAttribute('data-page', t.page);
          cell.setAttribute('aria-pressed', selected[t.page] ? 'true' : 'false');
          cell.innerHTML = '<span class="pagecell__img"><img src="' + t.url + '" alt="' + t.page + '페이지" loading="lazy"></span><span class="pagecell__no">' + t.page + '</span>';
          if (selected[t.page]) cell.classList.add('is-sel');
          cell.addEventListener('click', function () {
            if (selected[t.page]) delete selected[t.page]; else selected[t.page] = true;
            cell.classList.toggle('is-sel'); cell.setAttribute('aria-pressed', selected[t.page] ? 'true' : 'false');
            writeInput();
          });
          grid.appendChild(cell);
        });
        pagegrid.appendChild(grid);
        var hint = d.createElement('p'); hint.className = 'pagegrid__hint';
        hint.textContent = res.total > res.shown
          ? '페이지를 눌러 선택하세요 · 앞 ' + res.shown + '쪽 미리보기(나머지는 위 칸에 번호 입력)'
          : '페이지를 눌러 선택하세요.';
        pagegrid.appendChild(hint);
      }).catch(function () { pagegrid.hidden = true; pagegrid.innerHTML = ''; });
    }

    function changed() {
      result.hidden = true; result.innerHTML = '';
      render();
      updatePageCount();
      renderGrid();
      if (config.onFiles) { try { config.onFiles(state.files); } catch (e) { /* noop */ } }
    }

    function addFiles(fileList) {
      var arr = Array.prototype.slice.call(fileList).filter(function (f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; });
      if (!arr.length) { UI.toast('PDF 파일만 올릴 수 있어요.', 'error'); return; }
      state.files = multiple ? state.files.concat(arr) : [arr[0]];
      changed();
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dropzone--over'); }); });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dropzone--over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
    if (gridInput) gridInput.addEventListener('input', reflectInput);

    function setBusy(b) {
      runBtn.disabled = b || state.files.length === 0;
      runBtn.classList.toggle('is-busy', b);
      if (progress) { progress.hidden = !b; if (b) { if (bar) bar.style.width = '4%'; if (ptext) ptext.textContent = '처리 중…'; } }
    }
    function onProgress(p) {
      var pct = Math.max(2, Math.round((p || 0) * 100));
      if (bar) bar.style.width = pct + '%';
      if (ptext) ptext.textContent = '처리 중… ' + pct + '%';
    }

    async function handleResult(res) {
      if (!res) return;
      if (res.type === 'blob') {
        UI.downloadBlob(res.blob, res.filename);
        showSuccess(res.filename, function () { UI.downloadBlob(res.blob, res.filename); });
      } else if (res.type === 'zip') {
        await UI.zipAndDownload(res.items, res.zipName, onProgress);
        showSuccess(res.zipName + ' (' + res.items.length + '개 파일)', function () { UI.zipAndDownload(res.items, res.zipName); });
      } else if (res.type === 'files') {
        res.items.forEach(function (it) { UI.downloadBlob(it.blob, it.name); });
        showSuccess(res.items.length + '개 파일');
      } else if (res.type === 'message') {
        result.hidden = false; result.innerHTML = res.html;
      }
    }
    function showSuccess(label, again) {
      result.hidden = false; result.innerHTML = '';
      var ok = d.createElement('p'); ok.className = 'result__ok';
      ok.innerHTML = '<span class="result__check">✓</span> <strong>완료됐어요!</strong> ' + escapeHtml(label) + ' 다운로드가 시작됐습니다.';
      result.appendChild(ok);
      if (again) {
        var b = d.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost btn--sm';
        b.textContent = '다시 다운로드'; b.addEventListener('click', again); result.appendChild(b);
      }
    }

    runBtn.addEventListener('click', async function () {
      if (state.files.length === 0) return;
      var opts = config.readOptions ? config.readOptions(root) : {};
      if (config.validate) { var err = config.validate(state.files, opts); if (err) { UI.toast(err, 'error'); return; } }
      setBusy(true);
      try { var res = await config.run(state.files, opts, { onProgress: onProgress }); await handleResult(res); }
      catch (e) { console.error('[ToolCore]', e); UI.toast(e && e.message ? e.message : '처리 중 오류가 발생했어요.', 'error'); }
      finally { setBusy(false); }
    });

    render();
    return { state: state, root: root };
  }

  global.ToolCore = { init: init };
})(window);
