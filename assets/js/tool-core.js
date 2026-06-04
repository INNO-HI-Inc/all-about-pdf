/*!
 * PDF의 모든 것 — ToolCore: 도구 위젯 공통 컨트롤러 (인스턴스 단위)
 * 한 페이지에 여러 위젯이 공존할 수 있도록 각 위젯의 루트([data-tool]) 안에서
 * 클래스 훅(.js-*)으로 요소를 찾는다.
 *   .js-drop .js-file .js-files .js-run .js-progress .js-bar .js-ptext .js-result [.js-pagecount]
 *
 * 사용: ToolCore.init({ tool, multiple, reorder, pageCount, root?,
 *   readOptions(): opts, validate(files,opts): err|null, run(files,opts,ctx): result })
 * result: {type:'blob',blob,filename} | {type:'zip',items,zipName} | {type:'files',items} | {type:'message',html}
 */
(function (global) {
  'use strict';
  var UI = global.UI;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
      result = q('js-result'), pagecount = q('js-pagecount');
    if (!drop || !input || !runBtn) return null;

    var state = { files: [] };
    var multiple = !!config.multiple;

    function iconBtn(txt, label, fn, cls) {
      var b = d.createElement('button');
      b.type = 'button'; b.className = 'iconbtn' + (cls ? ' ' + cls : '');
      b.textContent = txt; b.setAttribute('aria-label', label);
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
      return b;
    }
    function swap(i, j) { var t = state.files[i]; state.files[i] = state.files[j]; state.files[j] = t; render(); }

    function render() {
      filelist.innerHTML = '';
      state.files.forEach(function (f, idx) {
        var li = d.createElement('li'); li.className = 'filelist__item';
        var info = d.createElement('div'); info.className = 'filelist__info';
        var name = d.createElement('span'); name.className = 'filelist__name'; name.textContent = f.name;
        var size = d.createElement('span'); size.className = 'filelist__size'; size.textContent = UI.humanSize(f.size);
        info.appendChild(name); info.appendChild(size);
        li.appendChild(info);
        var ctrls = d.createElement('div'); ctrls.className = 'filelist__ctrls';
        if (config.reorder && state.files.length > 1) {
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
      PDFEngine.getPageCount(state.files[0]).then(function (n) {
        if (n) pagecount.textContent = '총 ' + n + '페이지';
      });
    }

    function changed() {
      result.hidden = true; result.innerHTML = '';
      render();
      updatePageCount();
      if (config.onFiles) { try { config.onFiles(state.files); } catch (e) { /* noop */ } }
    }

    function addFiles(fileList) {
      var arr = Array.prototype.slice.call(fileList).filter(function (f) {
        return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      });
      if (!arr.length) { UI.toast('PDF 파일만 올릴 수 있어요.', 'error'); return; }
      state.files = multiple ? state.files.concat(arr) : [arr[0]];
      changed();
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { addFiles(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dropzone--over'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dropzone--over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    function setBusy(b) {
      runBtn.disabled = b || state.files.length === 0;
      runBtn.classList.toggle('is-busy', b);
      if (progress) {
        progress.hidden = !b;
        if (b) { if (bar) bar.style.width = '4%'; if (ptext) ptext.textContent = '처리 중…'; }
      }
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
      result.hidden = false;
      result.innerHTML = '';
      var ok = d.createElement('p'); ok.className = 'result__ok';
      ok.innerHTML = '<span class="result__check">✓</span> <strong>완료됐어요!</strong> ' +
        escapeHtml(label) + ' 다운로드가 시작됐습니다.';
      result.appendChild(ok);
      if (again) {
        var b = d.createElement('button');
        b.type = 'button'; b.className = 'btn btn--ghost btn--sm';
        b.textContent = '다시 다운로드';
        b.addEventListener('click', again);
        result.appendChild(b);
      }
    }

    runBtn.addEventListener('click', async function () {
      if (state.files.length === 0) return;
      var opts = config.readOptions ? config.readOptions(root) : {};
      if (config.validate) {
        var err = config.validate(state.files, opts);
        if (err) { UI.toast(err, 'error'); return; }
      }
      setBusy(true);
      try {
        var res = await config.run(state.files, opts, { onProgress: onProgress });
        await handleResult(res);
      } catch (e) {
        console.error('[ToolCore]', e);
        UI.toast(e && e.message ? e.message : '처리 중 오류가 발생했어요.', 'error');
      } finally {
        setBusy(false);
      }
    });

    render();
    return { state: state, root: root };
  }

  global.ToolCore = { init: init };
})(window);
