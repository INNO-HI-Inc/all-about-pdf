/*!
 * PDF의 모든 것 (all-about-pdf) — PDF 엔진
 * 100% 클라이언트사이드. 파일은 절대 서버로 전송되지 않습니다.
 * 의존: pdf-lib(PDFLib), pdf.js(pdfjsLib), JSZip(JSZip) — 모두 로컬 동봉(assets/vendor).
 */
(function (global) {
  'use strict';

  var BASE = global.AAP_BASE || '';

  // pdf.js worker 경로 설정 (없으면 이미지 변환/암호 PDF 기능만 제한)
  if (global.pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'assets/vendor/pdf.worker.min.js';
  }

  function hasLib() { return !!global.PDFLib; }
  function L() {
    if (!hasLib()) throw new Error('PDF 라이브러리를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    return global.PDFLib;
  }

  function toBlob(bytes) {
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function readArrayBuffer(file) {
    if (file.arrayBuffer) return file.arrayBuffer();
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      r.readAsArrayBuffer(file);
    });
  }

  // pdf-lib 로드 (암호화 무시 옵션 — 권한제한 PDF 처리용)
  async function loadDoc(file) {
    var ab = await readArrayBuffer(file);
    try {
      return await L().PDFDocument.load(ab, { ignoreEncryption: true });
    } catch (e) {
      throw new Error('이 PDF를 열 수 없습니다. 손상되었거나 비밀번호가 걸린 파일일 수 있어요.');
    }
  }

  // pdf.js 로드 (이미지 렌더링/암호 복호화용). password 지원.
  async function loadPdfjs(file, password) {
    if (!global.pdfjsLib) throw new Error('이미지 처리 모듈을 불러오지 못했습니다. 새로고침해 주세요.');
    var ab = await readArrayBuffer(file);
    var task = pdfjsLib.getDocument({ data: new Uint8Array(ab.slice(0)), password: password || undefined });
    return await task.promise; // 비번 필요 시 PasswordException(name) 발생
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (res) {
      if (canvas.toBlob) canvas.toBlob(function (b) { res(b); }, type, quality);
      else {
        var dataURL = canvas.toDataURL(type, quality);
        var bin = atob(dataURL.split(',')[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        res(new Blob([arr], { type: type }));
      }
    });
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = '0' + s;
    return s;
  }

  // ── 1. 합치기 ─────────────────────────────────────────────
  // merge(files, opts?, onProgress?) — opts:{ blankBetween }. 손상/암호 파일은 건너뛰고 blob._skipped에 기록.
  async function merge(files, opts, onProgress) {
    if (typeof opts === 'function') { onProgress = opts; opts = {}; }
    opts = opts || {};
    var PDFDocument = L().PDFDocument;
    var out = await PDFDocument.create();
    var skipped = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var src = await loadDoc(files[i]);
        var pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(function (p) { out.addPage(p); });
        if (opts.blankBetween && i < files.length - 1) {
          var last = out.getPage(out.getPageCount() - 1).getSize();
          out.addPage([last.width, last.height]);
        }
      } catch (e) { skipped.push(files[i].name); }
      if (onProgress) onProgress((i + 1) / files.length);
    }
    if (out.getPageCount() === 0) throw new Error('합칠 수 있는 PDF가 없습니다. 파일이 손상되었거나 비밀번호가 걸려 있을 수 있어요.');
    var blob = toBlob(await out.save());
    try { blob._skipped = skipped; } catch (e) {}
    return blob;
  }

  // ── 2. 분할 ───────────────────────────────────────────────
  // 낱장: 각 페이지를 개별 PDF로
  async function splitEach(file, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var width = String(n).length;
    var items = [];
    for (var i = 0; i < n; i++) {
      var doc = await PDFDocument.create();
      var pg = await doc.copyPages(src, [i]);
      doc.addPage(pg[0]);
      items.push({ name: 'page-' + pad(i + 1, width) + '.pdf', blob: toBlob(await doc.save()) });
      if (onProgress) onProgress((i + 1) / n);
    }
    return items;
  }
  // 범위: [[start,end],...] (1-based inclusive) → 범위별 PDF
  async function splitRanges(file, groups, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var items = [];
    for (var g = 0; g < groups.length; g++) {
      var s = groups[g][0], e = groups[g][1];
      var idx = [];
      for (var p = s; p <= e && p <= n; p++) idx.push(p - 1);
      if (!idx.length) continue;
      var doc = await PDFDocument.create();
      var pgs = await doc.copyPages(src, idx);
      pgs.forEach(function (pg) { doc.addPage(pg); });
      items.push({ name: 'pages-' + s + '-' + Math.min(e, n) + '.pdf', blob: toBlob(await doc.save()) });
      if (onProgress) onProgress((g + 1) / groups.length);
    }
    if (!items.length) throw new Error('유효한 페이지 범위가 없습니다.');
    return items;
  }
  // N페이지마다 분할
  async function splitEvery(file, size, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    size = Math.max(1, size | 0);
    var groups = [];
    for (var s = 1; s <= n; s += size) groups.push([s, Math.min(s + size - 1, n)]);
    var width = String(groups.length).length;
    var items = [];
    for (var g = 0; g < groups.length; g++) {
      var idx = []; for (var p = groups[g][0]; p <= groups[g][1]; p++) idx.push(p - 1);
      var doc = await PDFDocument.create();
      var pgs = await doc.copyPages(src, idx);
      pgs.forEach(function (pg) { doc.addPage(pg); });
      items.push({ name: 'part-' + pad(g + 1, width) + '.pdf', blob: toBlob(await doc.save()) });
      if (onProgress) onProgress((g + 1) / groups.length);
    }
    return items;
  }
  // 홀수/짝수 페이지 분리 → 두 PDF
  async function splitOddEven(file, onProgress) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var odd = [], even = [];
    for (var i = 0; i < n; i++) ((i % 2 === 0) ? odd : even).push(i);
    var items = [];
    async function build(name, idx) {
      if (!idx.length) return;
      var doc = await PDFDocument.create();
      var pgs = await doc.copyPages(src, idx);
      pgs.forEach(function (pg) { doc.addPage(pg); });
      items.push({ name: name, blob: toBlob(await doc.save()) });
    }
    await build('홀수페이지.pdf', odd); if (onProgress) onProgress(0.5);
    await build('짝수페이지.pdf', even); if (onProgress) onProgress(1);
    return items;
  }

  // ── 3. 페이지 추출 ────────────────────────────────────────
  // indices: 0-based 배열 (입력 순서 유지)
  async function extract(file, indices) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var valid = indices.filter(function (i) { return i >= 0 && i < n; });
    if (!valid.length) throw new Error('추출할 유효한 페이지가 없습니다.');
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, valid);
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }

  // ── 4. 페이지 삭제 ────────────────────────────────────────
  // delIndices: 0-based 삭제 대상
  async function deletePages(file, delIndices) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var n = src.getPageCount();
    var del = {};
    delIndices.forEach(function (i) { del[i] = true; });
    var keep = [];
    for (var i = 0; i < n; i++) if (!del[i]) keep.push(i);
    if (!keep.length) throw new Error('모든 페이지를 삭제할 수는 없습니다. 최소 1페이지는 남겨야 해요.');
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, keep);
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }

  // ── 5. 이미지 변환 (PNG/JPG) ─────────────────────────────
  // opts: { scale, format:'png'|'jpg', quality(0~1), grayscale, transparent(png), prefix, pageIndices?, password? }
  async function toImages(file, opts, onProgress) {
    opts = opts || {};
    var scale = opts.scale || 2;
    var format = opts.format === 'jpg' ? 'jpg' : 'png';
    var mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
    var quality = opts.quality != null ? opts.quality : 0.92;
    var prefix = opts.prefix ? String(opts.prefix).replace(/[\\/:*?"<>|]/g, '') : 'page';
    var transparent = format === 'png' && !!opts.transparent;
    var pdf = await loadPdfjs(file, opts.password);
    var total = pdf.numPages;
    var list = opts.pageIndices && opts.pageIndices.length
      ? opts.pageIndices.filter(function (i) { return i >= 0 && i < total; }).map(function (i) { return i + 1; })
      : Array.apply(null, { length: total }).map(function (_, i) { return i + 1; });
    var width = String(total).length;
    var items = [];
    for (var k = 0; k < list.length; k++) {
      var pageNum = list[k];
      var page = await pdf.getPage(pageNum);
      var viewport = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      var ctx = canvas.getContext('2d');
      if (!transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      if (opts.grayscale) {
        try {
          var im = ctx.getImageData(0, 0, canvas.width, canvas.height), dt = im.data;
          for (var pi = 0; pi < dt.length; pi += 4) {
            var g = (dt[pi] * 0.299 + dt[pi + 1] * 0.587 + dt[pi + 2] * 0.114) | 0;
            dt[pi] = dt[pi + 1] = dt[pi + 2] = g;
          }
          ctx.putImageData(im, 0, 0);
        } catch (e) {}
      }
      var blob = await canvasToBlob(canvas, mime, quality);
      items.push({ name: prefix + '-' + pad(pageNum, width) + '.' + format, blob: blob });
      canvas.width = canvas.height = 0; // 메모리 해제
      if (onProgress) onProgress((k + 1) / list.length);
    }
    return items;
  }

  // ── 5-b. 이미지 → PDF ─────────────────────────────────────
  // files: JPG/PNG 이미지. opts:{ pageSize:'image'|'a4', margin }. 이미지 1장 = 1페이지.
  async function imagesToPdf(files, opts, onProgress) {
    opts = opts || {};
    var PDFDocument = L().PDFDocument;
    var out = await PDFDocument.create();
    var pageSize = opts.pageSize === 'a4' ? 'a4' : 'image';
    var margin = opts.margin != null ? opts.margin : 0;
    var A4W = 595.28, A4H = 841.89;
    var skipped = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var bytes = new Uint8Array(await readArrayBuffer(f));
        var isPng = /^image\/png$/i.test(f.type) || /\.png$/i.test(f.name);
        var img;
        if (isPng) img = await out.embedPng(bytes);
        else { try { img = await out.embedJpg(bytes); } catch (e) { img = await out.embedPng(bytes); } }
        var iw = img.width, ih = img.height;
        if (pageSize === 'a4') {
          var landscape = iw > ih;
          var pw = landscape ? A4H : A4W, ph = landscape ? A4W : A4H;
          var page = out.addPage([pw, ph]);
          var availW = pw - margin * 2, availH = ph - margin * 2;
          var sc = Math.min(availW / iw, availH / ih);
          var w = iw * sc, h = ih * sc;
          page.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
        } else {
          var pg = out.addPage([iw + margin * 2, ih + margin * 2]);
          pg.drawImage(img, { x: margin, y: margin, width: iw, height: ih });
        }
      } catch (e) { skipped.push(f.name); }
      if (onProgress) onProgress((i + 1) / files.length);
    }
    if (out.getPageCount() === 0) throw new Error('PDF로 만들 수 있는 이미지가 없어요. JPG·PNG 파일인지 확인해 주세요.');
    var blob = toBlob(await out.save());
    try { blob._skipped = skipped; } catch (e) {}
    return blob;
  }

  // ── 6. 페이지 번호 ────────────────────────────────────────
  // opts: { position, startAt, skipCover, format, fontSize, margin, color(hex), prefix, suffix, box }
  function hexToRgb(hex, LL) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return LL.rgb(0.1, 0.1, 0.1);
    var n = parseInt(m[1], 16);
    return LL.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  // 기본 폰트(Helvetica/WinAnsi)는 한글을 인코딩 못 함 → 안전 문자만 남겨 크래시 방지
  function winAnsiSafe(s) { return String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, ''); }
  async function addPageNumbers(file, opts) {
    opts = opts || {};
    var LL = L();
    var doc = await loadDoc(file);
    var font = await doc.embedFont(LL.StandardFonts.Helvetica);
    var pages = doc.getPages();
    var total = pages.length;
    var position = opts.position || 'bottom-center';
    var startAt = (opts.startAt != null) ? opts.startAt : 1;
    var skip = opts.skipCover ? 1 : 0;
    var fmt = opts.format || 'n';
    var fontSize = opts.fontSize || 11;
    var margin = opts.margin != null ? opts.margin : 28;
    var color = hexToRgb(opts.color, LL);
    var prefix = winAnsiSafe(opts.prefix);
    var suffix = winAnsiSafe(opts.suffix);
    var numberedTotal = total - skip;
    var isTop = position.indexOf('top') === 0;
    for (var i = skip; i < total; i++) {
      var page = pages[i];
      var num = startAt + (i - skip);
      var core;
      if (fmt === 'n/total') core = num + ' / ' + numberedTotal;
      else if (fmt === 'dash') core = '- ' + num + ' -';
      else core = String(num);
      var text = prefix + core + suffix;
      var size = page.getSize();
      var tw = font.widthOfTextAtSize(text, fontSize);
      var x, y;
      y = isTop ? (size.height - margin - fontSize) : margin;
      if (position.indexOf('left') >= 0) x = margin;
      else if (position.indexOf('right') >= 0) x = size.width - margin - tw;
      else x = size.width / 2 - tw / 2;
      if (opts.box) {
        var padX = fontSize * 0.5, padY = fontSize * 0.32;
        page.drawRectangle({
          x: x - padX, y: y - padY, width: tw + padX * 2, height: fontSize + padY * 2,
          color: LL.rgb(1, 1, 1), opacity: 0.72
        });
      }
      page.drawText(text, { x: x, y: y, size: fontSize, font: font, color: color });
    }
    return toBlob(await doc.save());
  }

  // ── 7. 잠금해제 ───────────────────────────────────────────
  // (a) 벡터: 권한제한(소유자암호) PDF 재저장 — 텍스트/벡터 보존
  async function unlock(file) {
    var PDFDocument = L().PDFDocument;
    var src = await loadDoc(file);
    var out = await PDFDocument.create();
    var pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) { out.addPage(p); });
    return toBlob(await out.save());
  }
  // (b) 래스터 폴백: 열람암호 PDF — 비번 입력해 복호화 후 이미지로 재구성(항상 열림, 텍스트선택 불가)
  async function unlockRaster(file, password, scale, onProgress) {
    var PDFDocument = L().PDFDocument;
    var pdf = await loadPdfjs(file, password);
    var out = await PDFDocument.create();
    var s = scale || 2;
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var vp = page.getViewport({ scale: s });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      var blob = await canvasToBlob(canvas, 'image/png');
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var img = await out.embedPng(bytes);
      var vp1 = page.getViewport({ scale: 1 });
      var p = out.addPage([vp1.width, vp1.height]);
      p.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(i / pdf.numPages);
    }
    return toBlob(await out.save());
  }

  // 페이지 썸네일 렌더링 (시각적 선택용)
  async function renderThumbs(file, opts, onProgress) {
    opts = opts || {};
    var scale = opts.scale || 0.34;
    var max = opts.max || 60;
    var pdf = await loadPdfjs(file, opts.password);
    var total = pdf.numPages;
    var n = Math.min(total, max);
    var out = [];
    for (var i = 1; i <= n; i++) {
      var page = await pdf.getPage(i);
      var vp = page.getViewport({ scale: scale });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push({ page: i, url: canvas.toDataURL('image/jpeg', 0.7) });
      canvas.width = canvas.height = 0;
      if (onProgress) onProgress(i / n);
    }
    return { thumbs: out, total: total, shown: n };
  }

  // 페이지 수 (범위 검증용)
  async function getPageCount(file) {
    try {
      var doc = await loadDoc(file);
      return doc.getPageCount();
    } catch (e) {
      try { var pdf = await loadPdfjs(file); return pdf.numPages; } catch (e2) { return null; }
    }
  }

  // PasswordException 판별 헬퍼
  function isPasswordError(err) {
    return err && (err.name === 'PasswordException' ||
      (err.message && /password|encrypt/i.test(err.message)));
  }

  // 잠금 상태 사전 진단: { needsPassword, pages }
  async function probe(file) {
    try {
      var pdf = await loadPdfjs(file);
      return { needsPassword: false, pages: pdf.numPages };
    } catch (e) {
      if (isPasswordError(e)) return { needsPassword: true, pages: null };
      return { needsPassword: false, pages: null };
    }
  }

  global.PDFEngine = {
    merge: merge,
    splitEach: splitEach,
    splitRanges: splitRanges,
    splitEvery: splitEvery,
    splitOddEven: splitOddEven,
    extract: extract,
    deletePages: deletePages,
    toImages: toImages,
    imagesToPdf: imagesToPdf,
    addPageNumbers: addPageNumbers,
    unlock: unlock,
    unlockRaster: unlockRaster,
    renderThumbs: renderThumbs,
    getPageCount: getPageCount,
    isPasswordError: isPasswordError,
    probe: probe
  };
})(window);
