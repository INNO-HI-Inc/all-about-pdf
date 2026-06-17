/* PDF 서명 넣기 — 그리기·이미지·타이핑으로 사인/도장을 만들고, 미리보기에 드래그로 배치.
   100% 브라우저 처리(서버 전송 없음). 화면 좌표→PDF 좌표는 pdf.js viewport로 변환. */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('[data-tool="sign"]');
    if (!root) return;

    var fileInput = root.querySelector('.js-file');
    var drop = root.querySelector('.js-drop');
    var leftBody = root.querySelector('.tool__leftbody') || drop.parentNode;
    var winTitle = root.querySelector('.ws-wintitle .t');
    var runBtn = root.querySelector('.js-run');
    var progress = root.querySelector('.js-progress');
    var bar = root.querySelector('.js-bar');
    var ptext = root.querySelector('.js-ptext');
    var result = root.querySelector('.js-result');

    var addBtn = root.querySelector('.js-sig-add');
    var sigPreview = root.querySelector('.js-sig-preview');

    var state = { file: null, pages: [], stamps: [], curSig: null, selected: null };

    /* ───────── 파일 인테이크 ───────── */
    function pickFile() { fileInput && fileInput.click(); }
    if (drop) {
      drop.addEventListener('click', pickFile);
      drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } });
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); if (ev === 'dragleave' && drop.contains(e.relatedTarget)) return; drop.classList.remove('is-drag'); });
      });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadPdf(f);
      });
    }
    fileInput && fileInput.addEventListener('change', function () { if (fileInput.files[0]) loadPdf(fileInput.files[0]); });

    function fail(msg) {
      if (!result) { alert(msg); return; }
      result.hidden = false;
      result.innerHTML = '<p class="callout callout--warn" style="margin:0"><span class="callout__ic">!</span><span>' + msg + '</span></p>';
    }

    /* ───────── PDF 로드 & 페이지 렌더 ───────── */
    async function loadPdf(file) {
      if (!/pdf$/i.test(file.name) && file.type !== 'application/pdf') { fail('PDF 파일만 넣을 수 있어요.'); return; }
      state.file = file; state.pages = []; state.stamps = []; state.selected = null;
      if (result) result.hidden = true;
      try {
        var pdf = await PDFEngine.loadPdfjs(file);
        var stage = document.createElement('div');
        stage.className = 'sign-stage';
        var head = document.createElement('div');
        head.className = 'sign-stage__head';
        head.innerHTML = '<span class="sign-stage__name"></span><button type="button" class="sign-stage__reset">✕ 파일 변경</button>';
        head.querySelector('.sign-stage__name').textContent = file.name;
        head.querySelector('.sign-stage__reset').addEventListener('click', resetAll);
        stage.appendChild(head);

        var stageWidth = Math.max(240, (leftBody.clientWidth || 360) - 4);
        for (var n = 1; n <= pdf.numPages; n++) {
          var pg = await pdf.getPage(n);
          var base = pg.getViewport({ scale: 1 });
          var scale = stageWidth / base.width;
          var vp = pg.getViewport({ scale: scale });
          var pageEl = document.createElement('div');
          pageEl.className = 'sign-page';
          pageEl.style.width = Math.round(vp.width) + 'px';
          pageEl.style.height = Math.round(vp.height) + 'px';
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
          canvas.className = 'sign-page__cv';
          pageEl.appendChild(canvas);
          var badge = document.createElement('span');
          badge.className = 'sign-page__no'; badge.textContent = n;
          pageEl.appendChild(badge);
          stage.appendChild(pageEl);
          await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          state.pages.push({ index: n - 1, el: pageEl, viewport: vp, w: canvas.width, h: canvas.height });
        }
        leftBody.innerHTML = '';
        leftBody.appendChild(stage);
        if (winTitle) winTitle.textContent = file.name;
        // 미리 만들어 둔 서명이 있으면 바로 올릴 수 있게
        if (state.curSig) addBtn && (addBtn.disabled = false);
      } catch (e) {
        if (PDFEngine.isPasswordError && PDFEngine.isPasswordError(e)) fail('비밀번호가 걸린 PDF예요. 먼저 잠금해제 도구로 푼 뒤 사용해 주세요.');
        else fail('이 PDF를 열 수 없어요. 손상되었거나 비밀번호가 걸린 파일일 수 있어요.');
      }
    }

    function resetAll() {
      location.reload();
    }

    /* ───────── 서명 만들기: 탭 전환 ───────── */
    var tabs = Array.prototype.slice.call(root.querySelectorAll('.sign-tab'));
    var panes = Array.prototype.slice.call(root.querySelectorAll('.sign-pane'));
    tabs.forEach(function (tb) {
      tb.addEventListener('click', function () {
        tabs.forEach(function (x) { x.classList.toggle('is-active', x === tb); x.setAttribute('aria-selected', x === tb); });
        panes.forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== tb.getAttribute('data-sigtab'); });
      });
    });

    /* ── 1) 그리기 ── */
    var drawCv = root.querySelector('.js-sig-draw');
    if (drawCv) {
      var dctx = drawCv.getContext('2d');
      var drawing = false, inked = false, last = null, penColor = '#16233a';
      root.querySelectorAll('input[name="sig-pen"]').forEach(function (r) {
        r.addEventListener('change', function () { if (r.checked) penColor = r.value; });
      });
      function pos(e) {
        var rect = drawCv.getBoundingClientRect();
        var sx = drawCv.width / rect.width, sy = drawCv.height / rect.height;
        var px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        var py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        return { x: px * sx, y: py * sy };
      }
      function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
      function move(e) {
        if (!drawing) return; e.preventDefault();
        var p = pos(e);
        dctx.strokeStyle = penColor; dctx.lineWidth = 2.6; dctx.lineCap = 'round'; dctx.lineJoin = 'round';
        dctx.beginPath(); dctx.moveTo(last.x, last.y); dctx.lineTo(p.x, p.y); dctx.stroke();
        last = p; inked = true;
      }
      function end() { drawing = false; }
      drawCv.addEventListener('pointerdown', start);
      drawCv.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      var clearBtn = root.querySelector('.js-sig-clear');
      clearBtn && clearBtn.addEventListener('click', function () { dctx.clearRect(0, 0, drawCv.width, drawCv.height); inked = false; });
      var useDraw = root.querySelector('.js-sig-usedraw');
      useDraw && useDraw.addEventListener('click', function () {
        if (!inked) { fail('먼저 서명을 그려 주세요.'); return; }
        var trimmed = trimCanvas(drawCv);
        if (!trimmed) { fail('먼저 서명을 그려 주세요.'); return; }
        setSig(trimmed.dataUrl, trimmed.w, trimmed.h);
      });
    }

    // 캔버스의 잉크 영역만 잘라 투명 PNG dataURL로
    function trimCanvas(cv) {
      var ctx = cv.getContext('2d');
      var data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      var minX = cv.width, minY = cv.height, maxX = 0, maxY = 0, found = false;
      for (var y = 0; y < cv.height; y++) {
        for (var x = 0; x < cv.width; x++) {
          if (data[(y * cv.width + x) * 4 + 3] > 8) {
            found = true;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (!found) return null;
      var pad = 8;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(cv.width - 1, maxX + pad); maxY = Math.min(cv.height - 1, maxY + pad);
      var w = maxX - minX + 1, h = maxY - minY + 1;
      var out = document.createElement('canvas'); out.width = w; out.height = h;
      out.getContext('2d').drawImage(cv, minX, minY, w, h, 0, 0, w, h);
      return { dataUrl: out.toDataURL('image/png'), w: w, h: h };
    }

    /* ── 2) 이미지 업로드 ── */
    var sigImg = root.querySelector('.js-sig-img');
    sigImg && sigImg.addEventListener('change', function () {
      var f = sigImg.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) { fail('이미지 파일(PNG·JPG)만 넣을 수 있어요.'); return; }
      var r = new FileReader();
      r.onload = function () {
        var im = new Image();
        im.onload = function () { setSig(r.result, im.naturalWidth, im.naturalHeight); };
        im.onerror = function () { fail('이미지를 불러오지 못했어요.'); };
        im.src = r.result;
      };
      r.readAsDataURL(f);
    });

    /* ── 3) 타이핑 ── */
    var typeInput = root.querySelector('.js-sig-text');
    var typeStyle = 'cursive';
    root.querySelectorAll('input[name="sig-font"]').forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) { typeStyle = r.value; renderType(); } });
    });
    var FONTS = {
      cursive: 'italic 600 64px "Snell Roundhand","Apple Chancery","Segoe Script",cursive',
      jeongja: '700 60px AtoZ, "Apple SD Gothic Neo", sans-serif',
      heullim: 'italic 600 60px AtoZ, serif'
    };
    async function renderType() {
      if (!typeInput) return;
      var txt = (typeInput.value || '').trim();
      var useBtn = root.querySelector('.js-sig-usetype');
      if (!txt) { if (useBtn) useBtn.disabled = true; if (typePrev) typePrev.innerHTML = ''; return; }
      var font = FONTS[typeStyle] || FONTS.cursive;
      try { if (document.fonts && document.fonts.load) await document.fonts.load(font.replace(/^[a-z]+\s+/i, '').split(',')[0]); } catch (e) {}
      var m = document.createElement('canvas').getContext('2d');
      m.font = font;
      var w = Math.ceil(m.measureText(txt).width) + 36;
      var h = 96;
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d');
      ctx.font = font; ctx.fillStyle = '#16233a'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, 18, h / 2 + 4);
      var url = cv.toDataURL('image/png');
      if (typePrev) { typePrev.innerHTML = ''; var pi = new Image(); pi.src = url; typePrev.appendChild(pi); }
      if (useBtn) useBtn.disabled = false;
      state._typeSig = { dataUrl: url, w: w, h: h };
    }
    var typePrev = root.querySelector('.js-sig-typeprev');
    typeInput && typeInput.addEventListener('input', renderType);
    var useType = root.querySelector('.js-sig-usetype');
    useType && useType.addEventListener('click', function () {
      if (state._typeSig) setSig(state._typeSig.dataUrl, state._typeSig.w, state._typeSig.h);
      else fail('서명할 이름을 입력해 주세요.');
    });

    /* ───────── 현재 서명 설정 ───────── */
    function setSig(dataUrl, w, h) {
      state.curSig = { dataUrl: dataUrl, w: w, h: h };
      if (sigPreview) {
        sigPreview.innerHTML = '';
        var im = new Image(); im.src = dataUrl; im.alt = '현재 서명';
        sigPreview.appendChild(im);
        sigPreview.classList.add('has-sig');
      }
      if (addBtn) addBtn.disabled = !state.pages.length;
      if (!state.pages.length) fail('먼저 위에 PDF를 올려 주세요. 서명은 준비됐어요.');
      else if (result) result.hidden = true;
    }

    /* ───────── 페이지에 스탬프 추가 ───────── */
    addBtn && addBtn.addEventListener('click', function () {
      if (!state.curSig || !state.pages.length) return;
      var pg = mostVisiblePage();
      if (!pg) return;
      addStamp(pg, state.curSig);
    });

    function mostVisiblePage() {
      var stage = root.querySelector('.sign-stage');
      if (!stage) return state.pages[0] || null;
      var sc = stage.getBoundingClientRect();
      var mid = sc.top + sc.height / 2;
      var best = null, bestD = Infinity;
      state.pages.forEach(function (p) {
        var r = p.el.getBoundingClientRect();
        var c = r.top + r.height / 2;
        var d = Math.abs(c - mid);
        if (d < bestD) { bestD = d; best = p; }
      });
      return best || state.pages[0];
    }

    function addStamp(pg, sig) {
      var w = Math.min(pg.w * 0.34, sig.w);
      var h = w * (sig.h / sig.w);
      var left = (pg.w - w) / 2, top = (pg.h - h) / 2;
      var el = document.createElement('div');
      el.className = 'sign-stamp';
      el.style.left = left + 'px'; el.style.top = top + 'px';
      el.style.width = w + 'px'; el.style.height = h + 'px';
      var im = document.createElement('img'); im.src = sig.dataUrl; im.draggable = false; el.appendChild(im);
      var handle = document.createElement('span'); handle.className = 'sign-stamp__resize'; el.appendChild(handle);
      var del = document.createElement('button'); del.type = 'button'; del.className = 'sign-stamp__del'; del.setAttribute('aria-label', '서명 삭제'); del.textContent = '✕'; el.appendChild(del);
      pg.el.appendChild(el);
      var stamp = { el: el, page: pg, sig: sig };
      state.stamps.push(stamp);
      selectStamp(stamp);
      enableRun();

      del.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        el.parentNode && el.parentNode.removeChild(el);
        state.stamps = state.stamps.filter(function (s) { return s !== stamp; });
        if (state.selected === stamp) state.selected = null;
        enableRun();
      });

      // 드래그(이동)
      el.addEventListener('pointerdown', function (e) {
        if (e.target === handle) return;
        e.preventDefault(); selectStamp(stamp);
        var sx = e.clientX, sy = e.clientY;
        var ox = parseFloat(el.style.left), oy = parseFloat(el.style.top);
        function mv(ev) {
          var nx = ox + (ev.clientX - sx), ny = oy + (ev.clientY - sy);
          nx = Math.max(0, Math.min(pg.w - el.offsetWidth, nx));
          ny = Math.max(0, Math.min(pg.h - el.offsetHeight, ny));
          el.style.left = nx + 'px'; el.style.top = ny + 'px';
        }
        function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });

      // 리사이즈(비율 유지)
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault(); e.stopPropagation(); selectStamp(stamp);
        var sx = e.clientX;
        var ow = el.offsetWidth, ol = parseFloat(el.style.left), ot = parseFloat(el.style.top);
        var ratio = sig.h / sig.w;
        function mv(ev) {
          var nw = Math.max(28, ow + (ev.clientX - sx));
          nw = Math.min(nw, pg.w - ol);
          var nh = nw * ratio;
          if (ot + nh > pg.h) { nh = pg.h - ot; nw = nh / ratio; }
          el.style.width = nw + 'px'; el.style.height = nh + 'px';
        }
        function up() { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    }

    function selectStamp(stamp) {
      state.selected = stamp;
      state.stamps.forEach(function (s) { s.el.classList.toggle('is-sel', s === stamp); });
    }

    function enableRun() { if (runBtn) runBtn.disabled = state.stamps.length === 0; }

    /* ───────── 적용 후 다운로드 ───────── */
    runBtn && runBtn.addEventListener('click', async function () {
      if (!state.stamps.length || !state.file) return;
      runBtn.disabled = true;
      if (result) result.hidden = true;
      if (progress) { progress.hidden = false; setBar(0.05, '서명 적용 중…'); }
      try {
        var placements = state.stamps.map(function (s) {
          var pg = s.page, el = s.el;
          var left = parseFloat(el.style.left), top = parseFloat(el.style.top);
          var w = el.offsetWidth, h = el.offsetHeight;
          var tl = pg.viewport.convertToPdfPoint(left, top);
          var br = pg.viewport.convertToPdfPoint(left + w, top + h);
          return {
            page: pg.index, dataUrl: s.sig.dataUrl,
            x: Math.min(tl[0], br[0]), y: Math.min(tl[1], br[1]),
            w: Math.abs(br[0] - tl[0]), h: Math.abs(br[1] - tl[1])
          };
        });
        var blob = await PDFEngine.placeSignatures(state.file, placements, function (p) { setBar(0.1 + p * 0.85, '서명 적용 중…'); });
        setBar(1, '완료!');
        var name = (state.file.name || '문서').replace(/\.pdf$/i, '') + '-서명.pdf';
        var url = URL.createObjectURL(blob);
        if (progress) progress.hidden = true;
        if (result) {
          result.hidden = false;
          result.innerHTML = '<p class="result__ok"><span class="result__check"></span> 서명을 넣었어요! <small style="color:#0f6c3d;opacity:.8">(' + fmtSize(blob.size) + ')</small></p>';
          var a = document.createElement('a');
          a.className = 'btn btn--primary btn--lg btn--block'; a.href = url; a.download = name; a.textContent = '⤓ ' + name + ' 다시 받기';
          result.appendChild(a);
        }
        // 자동 다운로드
        var auto = document.createElement('a'); auto.href = url; auto.download = name; document.body.appendChild(auto); auto.click(); document.body.removeChild(auto);
        runBtn.disabled = false;
      } catch (e) {
        if (progress) progress.hidden = true;
        fail((e && e.message) || '서명을 넣지 못했어요. 다시 시도해 주세요.');
        runBtn.disabled = false;
      }
    });

    function setBar(p, t) { if (bar) bar.style.width = Math.round(p * 100) + '%'; if (ptext) ptext.textContent = t || ''; }
    function fmtSize(n) { return n < 1024 * 1024 ? (n / 1024).toFixed(0) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB'; }
  });
})();
